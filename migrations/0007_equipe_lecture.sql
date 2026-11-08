-- ============================================================================
--  0007 — LE CHEMIN QUI REMPLIT « CARTES », PUIS LA LECTURE DE L'ÉQUIPE
--
--  `0006` a posé le modèle : `public.staff`, `public.clients.designated_staff_id`,
--  et le rattachement de l'audit. Elle a laissé deux dettes nommées, et c'est
--  exactement ce que ce fichier paie, dans cet ordre :
--
--    1. **le chemin d'écriture de la désignation** : `join_loyalty_program`
--       accepte une caisse facultative et l'écrit sur le client qu'elle crée.
--       Sans lui, la colonne reste nulle, et « Cartes » vaut 0 pour tout le
--       monde — un zéro exact et inutile ;
--    2. **`equipe_du_commerce()`** : la lecture qui reproduit `h1` « Équipe »,
--       `h3` « Classement de l'équipe » et les **sept** `th` de
--       `_captures/2026-10-26-auth/rendu/a09-caisses.html`.
--
--  Aucune table n'est ouverte : ni `GRANT` de table, ni politique RLS. Les six
--  tables restent sous RLS avec zéro politique, et tout passe par des fonctions
--  (même doctrine que `0003`, `0004`, `0005`, `0006`).
--
--  ---------------------------------------------------------------------------
--  CE QUE LA CAPTURE DÉFINIT — mot pour mot, et non ce qu'on suppose
--  ---------------------------------------------------------------------------
--  Le DOM rendu porte, dans cet ordre :
--
--      « Équipe »                                        (h1)
--      « Caisses employé »  « Responsables »             (les deux portées)
--      « Classement de l'équipe »                        (h3)
--      « 7 jours »  « 30 jours »  « Depuis le début »  « Un jour précis »
--      « # | Caissier | Cartes | Scans | points | CA | Avis »   (les 7 th)
--      « Titulaire | Vous | 0 | 1 | 8 | 40 € | 0 »      (la seule ligne)
--      « Les cartes comptent les clients qui ont désigné ce caissier sur la
--        page d'inscription. »
--      « Ce tableau compte toutes les opérations du point de vente : les
--        caisses employé, et ce que vous ou vos responsables encaissez depuis
--        le tableau de bord. »
--
--  Trois conséquences, chacune lisible dans le code ci-dessous :
--
--    * « Cartes » compte des **clients qui ont désigné**, jamais des cartes.
--      Compter `loyalty_cards` serait un autre chiffre sous le même mot
--      (`lesson-learned` §31.3 et §32.1), et le libellé ne changerait pas :
--      personne ne le verrait.
--    * « Avis » n'a **aucune table**. La fonction rend donc `null` et déclare
--      l'absence (`absences`), au lieu d'un `0` qui serait un fait inventé.
--    * le titulaire n'est pas une caisse : `loyalty_transactions.staff_id` nul
--      **est** sa ligne (`0006` §32.2). Elle est donc toujours présente, même
--      quand le commerce n'a rien encaissé.

--
--  ---------------------------------------------------------------------------
--  LES QUATRE PÉRIODES SONT DES DÉFINITIONS DE CONTRAT (`§31.4`)
--  ---------------------------------------------------------------------------
--  « 7 jours », « 30 jours », « Depuis le début », « Un jour précis » ne sont
--  pas des ornements d'interface : ce sont quatre fenêtres. Une requête qui
--  passe de 30 à 7 jours n'échoue nulle part — elle change ce que l'écran
--  affirme, en silence. Les quatre définitions vivent donc **ici**, sous forme
--  de clés fermées, et le fichier de test les relit une par une :
--
--      7j              -> [now() - 7 jours,  now())
--      30j             -> [now() - 30 jours, now())
--      depuis_le_debut -> [aucune borne basse, now())
--      jour            -> [p_jour 00:00, p_jour+1 00:00) dans p_fuseau
--
--  Une cinquième clé est **refusée** (`PERIODE_INCONNUE`), `jour` sans date est
--  refusé (`JOUR_MANQUANT`), et un fuseau inconnu est refusé (`FUSEAU_INCONNU`).
--  Un refus nommé vaut mieux qu'une fenêtre silencieusement fausse.
--
--  Pourquoi un fuseau en argument : `loyalty_transactions.created_at` est un
--  `timestamptz`, mais aucune table ne porte le fuseau du commerce (mesuré :
--  `loyalty_programs` n'a ni `timezone` ni `region`). « Un jour précis » est
--  donc indéfini sans fuseau. On ne l'invente pas : l'appelant le déclare, la
--  valeur par défaut est `UTC`, et la valeur **appliquée** est rendue dans la
--  réponse (`periode.fuseau`), pour que l'écran puisse la dire.
--
--  ---------------------------------------------------------------------------
--  POURQUOI LA SIGNATURE À UN ARGUMENT EST SUPPRIMÉE, PAS LAISSÉE
--  ---------------------------------------------------------------------------
--  `web/src/lib/donnees.mjs` appelle `join_loyalty_program` avec le seul
--  `p_slug`. Ajouter un second paramètre crée une **surcharge** : l'ancienne
--  signature `(varchar)` et la nouvelle `(varchar, uuid)` accepteraient toutes
--  deux un corps `{ p_slug }`, puisque le second paramètre est facultatif. Deux
--  candidates pour un seul appel, c'est une ambiguïté côté PostgREST, et elle
--  se paie à l'adhésion — c'est-à-dire au pire endroit. La surcharge à un
--  argument est donc **retirée** (`drop function if exists`), et l'appelant
--  existant continue de fonctionner parce que `p_staff_id` a une valeur par
--  défaut. Le fichier de test garde les deux moitiés de cette phrase :
--  la signature neuve **et** la disparition de l'ancienne.
--
--  ---------------------------------------------------------------------------
--  LA DÉSIGNATION EST VALIDÉE, PAS AVALÉE
--  ---------------------------------------------------------------------------
--  Un identifiant de caisse inexistant est refusé (`STAFF_NOT_FOUND`), avant
--  l'insertion du client. L'alternative — écrire `null` en silence — ferait
--  perdre la désignation sans un mot, et la clé étrangère de `0006` ne le
--  verrait même pas (elle voit `null`, qui est valide).
--
--  En revanche une caisse **désactivée** est acceptée : la désignation est une
--  préférence du client, pas un droit d'accès. Refuser ici casserait une
--  inscription au moment précis où le client découvre le produit — la faute que
--  `0006` a déjà refusé de commettre avec `not null`. La ligne reste au
--  classement, avec `actif: false`, et l'écran la marque.
--
--  ---------------------------------------------------------------------------
--  CE QUE CETTE MIGRATION NE FAIT PAS — dettes nommées, pas oubliées
--  ---------------------------------------------------------------------------
--    * **Aucun écran.** `/caisses` reste un gabarit ; la reproduction du `h1`,
--      du `h3` et des sept `th` est la tâche suivante, et elle lira cette
--      fonction.
--    * **Aucun chemin d'écriture de l'équipe** (créer / désactiver une caisse).
--      Le formulaire « Nouvelle caisse » de la capture n'a pas de fonction ici :
--      une écriture sans écran mesuré serait une écriture inventée.
--    * **Aucune table d'avis.** « Avis » reste une absence déclarée.
--    * **Aucune portée par programme.** Le socle est mono-commerce (même limite
--      que `0004`/`0005`).
--    * **Aucun libellé.** Ni « Vous », ni « Titulaire », ni « Cartes » : la
--      fonction rend des clés, le dictionnaire rend les mots. Une chaîne
--      d'affichage dans le SQL échapperait au test de copie mesurée (`§31.6`).
--
--  ---------------------------------------------------------------------------
--  IDEMPOTENCE
--  ---------------------------------------------------------------------------
--  `create or replace function` sur les deux signatures, `drop function if
--  exists` pour la surcharge retirée, `revoke`/`grant` rejouables : rejouer le
--  fichier ne lève rien et ne retire rien.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. L'inscription accepte une caisse — et l'écrit sur le client
--
--  Le corps est celui de `0003`, à deux différences près, toutes deux visibles :
--    - `p_staff_id` est validé quand il est fourni ;
--    - la colonne `designated_staff_id` est écrite **dans le même `insert`** que
--      le client. Deux écritures séparées laisseraient, entre les deux, un
--      client sans désignation — exactement l'état que « Cartes » ne sait pas
--      distinguer d'un client qui n'a rien choisi.
-- ---------------------------------------------------------------------------

create or replace function public.join_loyalty_program(
  p_slug     varchar default null,
  p_staff_id uuid    default null
)
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
   -- Deux programmes actifs : sans départage, `limit 1` rend un programme
   -- différent d'un appel à l'autre, et l'unité du CA change sous les yeux.
   order by created_at, id
   limit 1;

  if v_programme is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Une caisse désignée doit exister. Une caisse désactivée, elle, est
  -- acceptée : cf. en-tête (« La désignation est validée, pas avalée »).
  if p_staff_id is not null
     and not exists (select 1 from public.staff s where s.id = p_staff_id) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Client **anonyme** : aucune donnée personnelle, conformément à la promesse
  -- mesurée. La désignation, elle, est un choix explicite — ou rien.
  insert into public.clients (first_name, last_name, email, designated_staff_id)
  values (null, null, null, p_staff_id)
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
--  2. La surcharge à un argument disparaît (cf. en-tête)
-- ---------------------------------------------------------------------------

drop function if exists public.join_loyalty_program(varchar);

-- ---------------------------------------------------------------------------
--  3. Les droits de l'inscription — la page publique reste publique
--
--  `anon` garde `EXECUTE` : c'est la page d'adhésion, mesurée ouverte depuis
--  `0003`. Ce n'est pas une ouverture nouvelle, c'est la même, reportée sur la
--  signature neuve — sans quoi l'inscription cesserait de fonctionner en
--  silence.
-- ---------------------------------------------------------------------------

revoke execute on function public.join_loyalty_program(varchar, uuid) from public, anon, authenticated;
grant  execute on function public.join_loyalty_program(varchar, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
--  4. `equipe_du_commerce()` — le classement de l'équipe, période par période
--
--  La projection suit les sept `th` de la capture, et rien de plus. Trois
--  clés supplémentaires (`staff_id`, `role`, `actif`) ne sont pas des colonnes :
--  elles servent à rendre les deux portées (« Caisses employé » /
--  « Responsables ») et l'état « Caisses actives », que la même capture montre.
--
--  Les définitions appliquées ici, une par une :
--    * « Cartes »  : nombre de **clients** dont `designated_staff_id` est cette
--                    caisse, inscrits dans la fenêtre. La désignation se fait à
--                    l'inscription, donc `clients.created_at` **est** sa date —
--                    il n'existe pas d'horodatage séparé, et en inventer un
--                    serait un second modèle.
--    * « Scans »   : `loyalty_transactions` de cette caisse dans la fenêtre.
--    * « points »  : `sum(points_awarded)` de ces mêmes lignes.
--    * « CA »      : `sum(amount_spent)` de ces mêmes lignes.
--    * « Avis »    : `null` — aucune table d'avis n'existe, et `0` serait un
--                    fait inventé. L'absence est déclarée dans `absences`.
--    * `created_at` nul : compté par « Depuis le début » (c'est de l'histoire),
--                    exclu des fenêtres (on ne peut pas le dater). Une seule
--                    expression le dit, et elle est la même pour les deux
--                    comptages.
--
--  L'ORDRE. La capture n'en montre qu'une ligne : il n'est donc **pas mesuré**.
--  On impose un ordre **total**, départagé jusqu'à l'identifiant, pour qu'une
--  liste ne bouge pas d'un appel à l'autre (`§31.5`) : points, CA, scans,
--  cartes, puis le titulaire d'abord à égalité, puis le prénom, puis l'id.
-- ---------------------------------------------------------------------------

create or replace function public.equipe_du_commerce(
  p_periode varchar default 'depuis_le_debut',
  p_jour    date    default null,
  p_fuseau  varchar default 'UTC'
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_periode varchar(16);
  v_fuseau  varchar(64);
  v_debut   timestamptz;
  v_fin     timestamptz := now();
  v_devise  text;
  v_lignes  json;
begin
  v_periode := lower(btrim(coalesce(p_periode, 'depuis_le_debut')));
  v_fuseau  := coalesce(nullif(btrim(p_fuseau), ''), 'UTC');

  -- Le vocabulaire est fermé : une clé inconnue ne retombe pas sur un défaut.
  if v_periode not in ('7j', '30j', 'depuis_le_debut', 'jour') then
    raise exception 'PERIODE_INCONNUE' using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_timezone_names z where z.name = v_fuseau) then
    raise exception 'FUSEAU_INCONNU' using errcode = 'P0001';
  end if;

  if v_periode = 'jour' then
    if p_jour is null then
      raise exception 'JOUR_MANQUANT' using errcode = 'P0001';
    end if;
    v_debut := (p_jour::timestamp) at time zone v_fuseau;
    v_fin   := ((p_jour + 1)::timestamp) at time zone v_fuseau;
  elsif v_periode = '7j' then
    v_debut := v_fin - interval '7 days';
  elsif v_periode = '30j' then
    v_debut := v_fin - interval '30 days';
  end if;

  -- La devise vient de la donnée, pas de la capture (`§31.6`) : la cible écrit
  -- « € », `loyalty_programs.devise` vaut `MAD` ici.
  select p.devise
    into v_devise
    from public.loyalty_programs p
   where p.active
   order by p.created_at desc nulls last, p.id
   limit 1;

  with caisses as (
    -- Une ligne par caisse, plus **la** ligne du titulaire (`staff_id` nul).
    -- Aucune n'est filtrée sur `active` : le classement est une histoire, et
    -- désactiver une caisse ne doit pas effacer ses chiffres. L'état est rendu.
    select s.id         as staff_id,
           s.first_name as prenom,
           s.role       as role,
           s.active     as actif
      from public.staff s
    union all
    select null::uuid, null::varchar, null::varchar, true
  ),
  cartes as (
    -- « Cartes » compte des **clients qui ont désigné**, jamais des cartes.
    select c.designated_staff_id as staff_id,
           count(*)              as n
      from public.clients c
     where c.designated_staff_id is not null
       and (v_debut is null
            or (c.created_at >= v_debut and c.created_at < v_fin))
     group by c.designated_staff_id
  ),
  scans as (
    select t.staff_id,
           count(*)                           as n,
           coalesce(sum(t.points_awarded), 0) as pts,
           coalesce(sum(t.amount_spent), 0)   as ca
      from public.loyalty_transactions t
     where (v_debut is null
            or (t.created_at >= v_debut and t.created_at < v_fin))
     group by t.staff_id
  )
  select coalesce(json_agg(json_build_object(
           'staff_id', l.staff_id,
           'prenom',   l.prenom,
           'role',     l.role,
           'actif',    l.actif,
           'cartes',   l.cartes,
           'scans',    l.scans,
           'points',   l.points,
           'ca',       l.ca,
           'avis',     l.avis
         ) order by l.points desc,
                    l.ca desc,
                    l.scans desc,
                    l.cartes desc,
                    (l.staff_id is null) desc,
                    l.prenom asc nulls last,
                    l.staff_id asc), '[]'::json)
    into v_lignes
    from (
      select k.staff_id,
             k.prenom,
             k.role,
             k.actif,
             coalesce(c.n,   0) as cartes,
             coalesce(s.n,   0) as scans,
             coalesce(s.pts, 0) as points,
             coalesce(s.ca,  0) as ca,
             null::integer      as avis
        from caisses k
        left join cartes c on c.staff_id is not distinct from k.staff_id
        left join scans  s on s.staff_id is not distinct from k.staff_id
    ) l;

  return json_build_object(
    'periode',  json_build_object(
      'cle',    v_periode,
      'debut',  v_debut,
      'fin',    v_fin,
      'jour',   case when v_periode = 'jour' then p_jour end,
      'fuseau', v_fuseau
    ),
    'devise',   v_devise,
    'lignes',   v_lignes,
    'absences', json_build_array('avis')
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  5. Les droits de la lecture
--
--  Même piège que `0004`/`0005` : `REVOKE … FROM PUBLIC` seul est un no-op,
--  parce que `create function` hérite des privilèges par défaut du schéma.
--  `anon` ne lit pas le classement : il porte les prénoms de l'équipe et le
--  chiffre d'affaires.
-- ---------------------------------------------------------------------------

revoke execute on function public.equipe_du_commerce(varchar, date, varchar) from public, anon, authenticated;
grant  execute on function public.equipe_du_commerce(varchar, date, varchar) to authenticated, service_role;

commit;

