-- ============================================================================
--  R3 — Programme, adhésion, lecture de carte : ce qui rend les 4 modules
--       (QR code, Scanner, Caisse, Programme) réellement fonctionnels.
--
--  STATUT : NON EXÉCUTÉE. À passer dans l'éditeur SQL du projet
--           (sevqegfhmdezsqwvwsam). Tant qu'elle n'est pas passée, l'application
--           affiche « base non migrée » au lieu d'échouer — cf. lib/donnees.mjs.
--
--  ---------------------------------------------------------------------------
--  POURQUOI CETTE MIGRATION EXISTE
--  ---------------------------------------------------------------------------
--  Mesuré sur la base le 2026-10-31 :
--    - `clients`, `loyalty_cards`, `loyalty_transactions` : RLS **active**,
--      **aucune politique** -> SELECT renvoie [], INSERT lève 42501.
--    - deux RPC en écriture seulement (`award_loyalty_points`,
--      `redeem_loyalty_reward`), qui EXIGENT un jeton de carte existant.
--    - `join_loyalty_program` : appelée par le bundle de la cible, **absente**
--      de l'OpenAPI -> n'existe pas ici (contrainte avant de R1.2).
--
--  Conséquence : sans cette migration, **aucune carte ne peut être créée**,
--  donc le QR ne mène nulle part, le scanner n'a rien à créditer et la caisse
--  rien à échanger. Les quatre modules dépendent de cette seule pièce.
--
--  ---------------------------------------------------------------------------
--  CE QUI EST MESURÉ, CE QUI EST DÉCLARÉ
--  ---------------------------------------------------------------------------
--  MESURÉ (contrat des RPC existantes, exécuté puis nettoyé) :
--      award  -> {card_id, new_balance, points_added, transaction_id, previous_points}
--      redeem -> {card_id, new_balance, reward_label, transaction_id,
--                 points_deducted, previous_points}
--  MESURÉ (page publique `/recompenses/<slug>`) : un palier = numéro, intitulé,
--      description, coût. 27 slugs publics, forme `<nom>-<4 car.>`.
--  MESURÉ (page `/join/<slug>`) : ni nom, ni email, ni téléphone exigés ;
--      l'identité du client est un code `C-XXXXXX`.
--
--  DÉCLARÉ — les colonnes des deux tables. Le schéma de la cible n'est **pas
--  lisible** (`customers` répond 42501) ; on ne recopie donc pas 309 lignes
--  d'un modèle inconnu. On déclare le minimum nécessaire aux quatre écrans, et
--  on le dit ici plutôt que de laisser croire à une parité de schéma.
--
--  ---------------------------------------------------------------------------
--  SÉCURITÉ — même doctrine que R1.2, appliquée à des objets neufs
--  ---------------------------------------------------------------------------
--    - RLS **activée** sur les deux tables, **zéro politique** : aucun accès
--      direct, ni en lecture ni en écriture. Tout passe par des fonctions.
--    - chaque fonction est `SECURITY DEFINER` avec `search_path` figé
--      (`pg_temp` exclu) : sans cela, un appelant peut détourner la résolution
--      de noms et faire exécuter ses propres objets.
--    - `REVOKE … FROM PUBLIC` puis `GRANT` **au rôle qui en a besoin**, et pas
--      au-delà :
--          join_loyalty_program   -> anon            (page d'adhésion publique)
--          programme_public       -> anon            (page de récompenses publique)
--          programme_du_commerce  -> authenticated   (dashboard)
--          carte_par_token        -> authenticated   (scanner + caisse)
--      `carte_par_token` n'est **pas** ouverte à `anon` : ce serait un oracle
--      de soldes, énumérable par jeton.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.loyalty_programs (
  id               uuid primary key default gen_random_uuid(),
  slug             varchar(64)  not null unique,
  name             varchar(120) not null,
  kind             varchar(16)  not null default 'points'
                     check (kind in ('points', 'tampons')),
  points_threshold integer      not null default 50 check (points_threshold > 0),
  devise           varchar(3)   not null default 'MAD',
  active           boolean      not null default true,
  created_at       timestamptz  not null default now()
);

create table if not exists public.reward_tiers (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid    not null references public.loyalty_programs(id) on delete cascade,
  rank        integer not null check (rank > 0),
  label       varchar(120) not null,
  description varchar(200),
  points_cost integer not null check (points_cost > 0),
  unique (program_id, rank)
);

-- Un jeton de carte doit être unique : c'est la seule clé que le commerçant
-- saisit ou scanne. La contrainte est posée ici parce que `join` génère le code
-- et doit pouvoir détecter une collision plutôt que de créer un doublon muet.
create unique index if not exists loyalty_cards_card_token_key
  on public.loyalty_cards (card_token);

-- ---------------------------------------------------------------------------
--  1 bis. `clients` : rendre le nom facultatif — MESURÉ, pas supposé
--
--  Mesure du 2026-10-31 (service_role, puis nettoyage) :
--      insert {first_name: null, last_name: null, email: null}
--        -> 400 23502  null value in column "first_name" violates not-null constraint
--      insert {}  (default values)
--        -> 400 23502  même erreur
--
--  Or la page `/join/<slug>` de la cible promet, mot pour mot : « Rien ne vous
--  est demandé : ni nom, ni email, ni téléphone. Votre carte est identifiée par
--  un code, et c'est tout ce que le commerce verra de vous. »
--
--  Une carte anonyme est donc **impossible** avec le schéma actuel : il faut
--  soit inventer un nom (et afficher une donnée que personne n'a saisie), soit
--  rendre la colonne facultative. On choisit le second, et on l'écrit ici.
--  L'opération est réversible (`set not null` échouera tant qu'une ligne
--  anonyme existe — c'est voulu : on ne referme pas la porte en silence).
-- ---------------------------------------------------------------------------

alter table public.clients alter column first_name drop not null;
alter table public.clients alter column last_name  drop not null;

-- ---------------------------------------------------------------------------
--  2. RLS : activée, aucune politique
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs enable row level security;
alter table public.reward_tiers     enable row level security;

revoke all on table public.loyalty_programs from public, anon, authenticated;
revoke all on table public.reward_tiers     from public, anon, authenticated;
grant  select, insert, update, delete on table public.loyalty_programs to service_role;
grant  select, insert, update, delete on table public.reward_tiers     to service_role;

-- ---------------------------------------------------------------------------
--  3. Adhésion — crée une carte ANONYME et rend son code `C-XXXXXX`
--
--  Mesuré : la page `/join/<slug>` de la cible n'exige ni nom, ni email, ni
--  téléphone, et l'identité du client est un code. Mesuré aussi : ce code a la
--  forme `C-XXXXXX` (`C-` + 6 caractères).
--
--  `SECURITY DEFINER` est nécessaire : `clients` et `loyalty_cards` sont sous
--  RLS sans politique, donc `anon` ne peut rien y écrire. La fonction est le
--  seul chemin d'écriture, et elle n'écrit que ces deux lignes.
--
--  La boucle de collision n'est pas décorative : `card_token` porte un index
--  unique, et deux adhésions simultanées peuvent tirer le même code. Sans la
--  boucle, la seconde échouerait sur `unique_violation` et le client verrait
--  une erreur au moment précis où il découvre le produit.
-- ---------------------------------------------------------------------------

create or replace function public.join_loyalty_program(p_slug varchar default null)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme uuid;
  v_client    uuid;
  v_carte     uuid;
  v_jeton     varchar(64);
  v_essai     integer := 0;
begin
  select id into v_programme
    from public.loyalty_programs
   where active
     and (p_slug is null or slug = lower(trim(p_slug)))
   order by created_at
   limit 1;

  if v_programme is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Client **anonyme** : aucune donnée personnelle, conformément à la promesse
  -- mesurée. `first_name` / `last_name` sont devenus facultatifs au §1 bis.
  insert into public.clients (first_name, last_name, email)
  values (null, null, null)
  returning id into v_client;

  loop
    v_essai := v_essai + 1;
    v_jeton := 'C-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.loyalty_cards (client_id, card_token, current_points)
      values (v_client, v_jeton, 0)
      returning id into v_carte;
      exit;
    exception when unique_violation then
      if v_essai >= 10 then
        raise exception 'TOKEN_COLLISION' using errcode = 'P0001';
      end if;
    end;
  end loop;

  return json_build_object(
    'card_id',    v_carte,
    'card_token', v_jeton,
    'program_id', v_programme,
    'new_balance', 0
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  4. Lecture d'une carte — pour le scanner et la caisse
--
--  Rend le solde **et** le programme avec ses paliers : les deux écrans doivent
--  afficher « prochaine récompense à N points » sans second aller-retour.
--
--  Les clés JSON sont en français et **nommées** (`prenom` / `nom`) : le
--  mapping `first_name` -> prénom, `last_name` -> nom est fixé ici et nulle
--  part ailleurs (cf. `lib/personne.mjs`, qui le teste).
--
--  Jeton inconnu -> `CARD_NOT_FOUND`, le **même code** que celui déjà mesuré
--  sur `award_loyalty_points`. L'écran n'a donc qu'un cas à connaître.
-- ---------------------------------------------------------------------------

create or replace function public.carte_par_token(p_token varchar)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_carte    record;
  v_client   record;
  v_paliers  json;
begin
  select c.id, c.card_token, c.current_points, c.client_id
    into v_carte
    from public.loyalty_cards c
   where c.card_token = upper(trim(p_token));

  if v_carte.id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select cl.first_name, cl.last_name
    into v_client
    from public.clients cl
   where cl.id = v_carte.client_id;

  select coalesce(json_agg(json_build_object(
           'rang', t.rank,
           'libelle', t.label,
           'description', t.description,
           'cout', t.points_cost
         ) order by t.rank), '[]'::json)
    into v_paliers
    from public.reward_tiers t
    join public.loyalty_programs p on p.id = t.program_id
   where p.active;

  return json_build_object(
    'card_id',    v_carte.id,
    'card_token', v_carte.card_token,
    'points',     v_carte.current_points,
    'client', json_build_object(
      'prenom', coalesce(v_client.first_name, ''),
      'nom',    coalesce(v_client.last_name, '')
    ),
    'paliers', v_paliers
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  5. Programme — lecture publique et lecture/écriture commerçant
--
--  `programme_public` sert la page de récompenses ET l'adhésion (les paliers
--  s'affichent avant même d'avoir une carte : c'est l'accroche mesurée
--  « 45 points = Boisson offerte »).
--
--  `enregistrer_programme` est ce qui rend l'écran **Programme** fonctionnel :
--  sans lui, aucun programme ne peut être créé, donc `join` lève
--  `PROGRAM_NOT_FOUND` et le QR ne mène à rien.
--
--  L'écriture est **atomique** : les paliers sont remplacés d'un bloc. Un
--  enregistrement palier par palier laisserait, en cas d'erreur au 3ᵉ, un
--  programme à moitié réécrit.
-- ---------------------------------------------------------------------------

create or replace function public.programme_public(p_slug varchar)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme record;
  v_paliers   json;
begin
  select p.id, p.slug, p.name, p.kind, p.points_threshold, p.devise
    into v_programme
    from public.loyalty_programs p
   where p.active and p.slug = lower(trim(p_slug));

  if v_programme.id is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(json_agg(json_build_object(
           'rang', t.rank,
           'libelle', t.label,
           'description', t.description,
           'cout', t.points_cost
         ) order by t.rank), '[]'::json)
    into v_paliers
    from public.reward_tiers t
   where t.program_id = v_programme.id;

  return json_build_object(
    'slug',    v_programme.slug,
    'nom',     v_programme.name,
    'type',    v_programme.kind,
    'seuil',   v_programme.points_threshold,
    'devise',  v_programme.devise,
    'paliers', v_paliers
  );
end;
$fonction$;

create or replace function public.programme_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_slug varchar;
begin
  -- Un seul commerce par base dans ce socle : la cible est multi-tenant
  -- (`restaurants` racine, 309 programmes), nous ne le sommes pas encore. On
  -- rend le premier programme actif, ou `null` — jamais une erreur : l'écran
  -- « Programme » doit pouvoir afficher un formulaire vide.
  select p.slug into v_slug
    from public.loyalty_programs p
   where p.active
   order by p.created_at
   limit 1;

  if v_slug is null then
    return null;
  end if;

  return public.programme_public(v_slug);
end;
$fonction$;

create or replace function public.enregistrer_programme(
  p_slug      varchar,
  p_name      varchar,
  p_threshold integer,
  p_kind      varchar,
  p_tiers     jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_id     uuid;
  v_palier jsonb;
  v_rang   integer := 0;
begin
  if p_slug is null or length(trim(p_slug)) < 3 then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if p_threshold is null or p_threshold <= 0 then
    raise exception 'INVALID_THRESHOLD' using errcode = 'P0001';
  end if;
  if p_kind not in ('points', 'tampons') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'INVALID_TIERS' using errcode = 'P0001';
  end if;

  insert into public.loyalty_programs (slug, name, kind, points_threshold)
  values (lower(trim(p_slug)), trim(p_name), p_kind, p_threshold)
  on conflict (slug) do update
    set name = excluded.name,
        kind = excluded.kind,
        points_threshold = excluded.points_threshold
  returning id into v_id;

  delete from public.reward_tiers where program_id = v_id;

  for v_palier in select * from jsonb_array_elements(p_tiers) loop
    v_rang := v_rang + 1;
    if coalesce(v_palier->>'libelle', '') = '' then
      raise exception 'INVALID_TIER_LABEL' using errcode = 'P0001';
    end if;
    if coalesce((v_palier->>'cout')::integer, 0) <= 0 then
      raise exception 'INVALID_TIER_COST' using errcode = 'P0001';
    end if;

    insert into public.reward_tiers (program_id, rank, label, description, points_cost)
    values (
      v_id,
      v_rang,
      trim(v_palier->>'libelle'),
      nullif(trim(coalesce(v_palier->>'description', '')), ''),
      (v_palier->>'cout')::integer
    );
  end loop;

  return public.programme_public(lower(trim(p_slug)));
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  6. Droits — le rôle qui en a besoin, et pas au-delà
--
--  MESURÉ APRÈS PREMIÈRE EXÉCUTION (2026-10-31) : ce bloc ne révoquait que
--  `PUBLIC`, et `anon` gardait `EXECUTE` sur les **sept** fonctions.
--  `create function` hérite des **privilèges par défaut** du schéma
--  (`ALTER DEFAULT PRIVILEGES` de Supabase accorde `EXECUTE` à `anon`,
--  `authenticated` et `service_role`), donc `proacl` ne contient pas `PUBLIC`
--  du tout : révoquer `PUBLIC` ne retirait rien. Appel réel :
--    anon -> carte_par_token       400 P0001 CARD_NOT_FOUND  (oracle ouvert)
--    anon -> programme_du_commerce 200 null                  (lecture ouverte)
--    anon -> enregistrer_programme 400 INVALID_SLUG          (écriture ouverte)
--  C'est la leçon déjà consignée pour `0002` : **un REVOKE qui ne nomme pas
--  le rôle qui détient le droit ne révoque rien.** On révoque donc les trois
--  rôles nommément, puis on accorde — même forme qu'au §2 de `0001`.
-- ---------------------------------------------------------------------------

revoke execute on function public.join_loyalty_program(varchar) from public, anon, authenticated;
revoke execute on function public.carte_par_token(varchar)    from public, anon, authenticated;
revoke execute on function public.programme_public(varchar)   from public, anon, authenticated;
revoke execute on function public.programme_du_commerce()     from public, anon, authenticated;
revoke execute on function public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb) from public, anon, authenticated;

grant execute on function public.join_loyalty_program(varchar) to anon, authenticated, service_role;
grant execute on function public.programme_public(varchar)     to anon, authenticated, service_role;
grant execute on function public.carte_par_token(varchar)      to authenticated, service_role;
grant execute on function public.programme_du_commerce()       to authenticated, service_role;
grant execute on function public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb)
  to authenticated, service_role;

commit;




-- ============================================================================
--  7. CE QUE CETTE MIGRATION N'OUVRE PAS — et pourquoi
--
--  - `carte_par_token` n'est **pas** accordée à `anon` : ce serait un oracle de
--    soldes, énumérable (`C-` + 6 caractères = 16^6 ≈ 16,7 M de combinaisons).
--    Le scanner et la caisse sont authentifiés ; la page publique n'en a pas
--    besoin, et le QR de la carte encode le **code**, pas une URL de lecture.
--  - `enregistrer_programme` n'est **pas** accordée à `anon` : n'importe qui
--    pourrait réécrire les paliers d'un commerce.
--  - aucune politique RLS n'est créée : les tables restent fermées en direct.
--  - `join_loyalty_program` n'accepte pas de données personnelles en argument :
--    la carte est anonyme par construction, pas par discipline d'appelant.
--
--  8. APRÈS EXÉCUTION — ordre recommandé
--
--      1. écran **Programme** : créer le programme et ses paliers. Sans lui,
--         `join` lève `PROGRAM_NOT_FOUND` et le QR mène à une page d'erreur ;
--      2. écran **QR Code** : scanner le QR avec un téléphone ;
--      3. la page publique `/join/<slug>` crée une carte et affiche `C-XXXXXX` ;
--      4. `/scan` crédite des points sur ce code ; `/caisse` les échange.
--
--  `tools/rea/tests/migration-0003.test.mjs` vérifie par lecture ce qu'un
--  `psql` vérifierait par exécution : aucune `CREATE POLICY`, `search_path` sur
--  chaque `SECURITY DEFINER`, un `GRANT` nommé derrière chaque `REVOKE`, et
--  l'absence d'`anon` sur la lecture de carte. Ce test ne remplace pas
--  l'exécution — il empêche seulement de livrer une migration qui *ne peut pas*
--  être sûre.
-- ============================================================================

