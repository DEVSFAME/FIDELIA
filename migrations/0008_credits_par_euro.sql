-- ============================================================================
--  0008 — « Crédits par euro », et la devise passe en euro
--
--  POURQUOI
--  --------
--  Le taux de conversion était **implicite** : le commerçant saisissait le
--  montant de l'achat *et* le nombre de points, deux champs indépendants. Rien
--  n'empêchait 40 € de donner 1 point, ni 1 € d'en donner 400. Le réglage qui
--  manquait n'est pas un confort : c'est la règle du programme, et elle doit
--  être écrite une fois, en base, plutôt que recalculée de tête à chaque vente.
--
--  Deux changements, un seul fichier :
--
--    1. `loyalty_programs.credits_par_euro` — un taux > 0, deux décimales.
--       `numeric(10,2)` et non `integer` : un taux de 1,5 point par euro est
--       courant, et l'arrondir à 2 serait un choix qu'on n'a pas le droit de
--       faire à la place du commerce ;
--
--    2. `devise` passe de `MAD` à `EUR` — le défaut **et** les lignes
--       existantes. Le défaut seul aurait laissé les programmes déjà créés en
--       dirhams, avec un écran qui affiche « EUR » et des montants en MAD :
--       exactement le genre d'écart qui ne se voit qu'en caisse.
--
--  La devise reste une **donnée**, pas une constante : `formaterMontant` la lit
--  du programme, et un programme en USD serait affiché correctement le jour où
--  il existera. Seul le défaut change.
--
--  CE QUI N'EST PAS TOUCHÉ
--  -----------------------
--  - aucune table n'est rouverte : `loyalty_programs` reste sous RLS sans
--    politique, l'accès passe toujours par les fonctions `SECURITY DEFINER` ;
--  - `programme_du_commerce` n'est pas réécrite : elle délègue à
--    `programme_public`, qui rend désormais le taux — une seule copie du JSON.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. Le taux
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs
  add column if not exists credits_par_euro numeric(10, 2) not null default 1
    check (credits_par_euro > 0);

comment on column public.loyalty_programs.credits_par_euro is
  'Points crédités par unité de devise dépensée (ex. 1.00 = 1 point par euro).';

-- ---------------------------------------------------------------------------
--  2. La devise : défaut ET lignes existantes
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs alter column devise set default 'EUR';

-- Mesure avant : `select devise, count(*) from loyalty_programs group by 1`
-- -> `MAD | n`. On ne réécrit que le dirham : une base qui porterait déjà une
-- autre devise n'a pas à être convertie de force par cette migration.
update public.loyalty_programs set devise = 'EUR' where devise = 'MAD';

-- ---------------------------------------------------------------------------
--  3. `programme_public` rend le taux
--
--  Le corps est repris **tel quel** de `0003` ; seule la ligne
--  `credits_par_euro` s'ajoute au `json_build_object`. Une réécriture partielle
--  aurait fait perdre `search_path` ou `security definer` en silence.
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
  select p.id, p.slug, p.name, p.kind, p.points_threshold, p.devise, p.credits_par_euro
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
    'slug',             v_programme.slug,
    'nom',              v_programme.name,
    'type',             v_programme.kind,
    'seuil',            v_programme.points_threshold,
    'devise',           v_programme.devise,
    'credits_par_euro', v_programme.credits_par_euro,
    'paliers',          v_paliers
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  4. `enregistrer_programme` accepte le taux
--
--  La signature change (6 paramètres au lieu de 5) : `create or replace` ne
--  remplace pas une fonction dont la signature diffère, il en crée une
--  **deuxième**. L'ancienne est donc supprimée d'abord, sinon un appel à cinq
--  arguments continuerait d'écrire un programme sans jamais toucher au taux —
--  silencieusement, et sans qu'aucun écran ne le montre.
--
--  Le 6ᵉ paramètre est facultatif (`default 1`) : un appelant qui ne le connaît
--  pas encore écrit un programme à 1 point par euro au lieu d'échouer.
-- ---------------------------------------------------------------------------

drop function if exists public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb);

create or replace function public.enregistrer_programme(
  p_slug             varchar,
  p_name             varchar,
  p_threshold        integer,
  p_kind             varchar,
  p_tiers            jsonb,
  p_credits_par_euro numeric default 1
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
  -- Borne haute : un taux à 1000 points par euro n'est pas faux au sens SQL, mais
  -- il vaut mieux le refuser ici que de découvrir en caisse qu'un achat de 3 €
  -- crédite 3000 points. La borne est haute exprès : elle n'interdit que l'absurde.
  if p_credits_par_euro is null or p_credits_par_euro <= 0 or p_credits_par_euro > 1000 then
    raise exception 'INVALID_CREDITS' using errcode = 'P0001';
  end if;

  insert into public.loyalty_programs (slug, name, kind, points_threshold, credits_par_euro)
  values (lower(trim(p_slug)), trim(p_name), p_kind, p_threshold, p_credits_par_euro)
  on conflict (slug) do update
    set name             = excluded.name,
        kind             = excluded.kind,
        points_threshold = excluded.points_threshold,
        credits_par_euro = excluded.credits_par_euro
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
--  5. Droits — la même règle qu'en `0003`
--
--  Un `REVOKE` qui ne nomme pas le rôle qui détient le droit ne révoque rien :
--  les privilèges par défaut du schéma accordent `EXECUTE` à `anon`,
--  `authenticated` et `service_role`. On révoque les trois, nommément, puis on
--  accorde — et `anon` ne récupère rien : n'importe qui pourrait réécrire les
--  paliers d'un commerce.
-- ---------------------------------------------------------------------------

revoke execute on function public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb, numeric)
  from public, anon, authenticated;

grant execute on function public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb, numeric)
  to authenticated, service_role;

commit;

-- ============================================================================
--  APRÈS EXÉCUTION — ce qu'il faut relire
--
--    select slug, devise, credits_par_euro from public.loyalty_programs;
--      -> devise = 'EUR', credits_par_euro = 1 pour les programmes existants
--
--    select public.enregistrer_programme(
--      'cafe-test', 'Café test', 50, 'points',
--      '[{"libelle":"Boisson","cout":45}]'::jsonb, 2.5
--    ) ->> 'credits_par_euro';
--      -> 2.50
--
--    select public.enregistrer_programme(
--      'cafe-test', 'Café test', 50, 'points',
--      '[{"libelle":"Boisson","cout":45}]'::jsonb, 0
--    );
--      -> 400 P0001 INVALID_CREDITS
--
--  `tools/rea/tests/migration-0008.test.mjs` vérifie par lecture ce qu'un
--  `psql` vérifierait par exécution : la colonne, sa contrainte, le défaut de
--  devise, la reprise des lignes, la signature à six paramètres, la suppression
--  de l'ancienne et le `GRANT` nommé derrière le `REVOKE`.
-- ============================================================================
