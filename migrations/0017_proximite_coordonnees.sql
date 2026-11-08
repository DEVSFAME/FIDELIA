-- ============================================================================
--  0017 — PROXIMITÉ : LES COORDONNÉES (P0-2b, passe A8)
--
--  Source : `_captures/2026-11-04-a8/raw/assets/…settings_page-dd12….js`
--  (offsets ≈ 15 200 et ≈ 13 464) et le chunk du 2026-10-27, identique.
--  Mesuré : la cible **ne stocke pas le lien** — `restaurants.latitude` et
--  `restaurants.longitude` sont les colonnes, et le formulaire les ré-affiche
--  `${latitude}, ${longitude}`. Le lien Google Maps n'est qu'une **forme
--  d'entrée**, analysée côté serveur.
--
--  Ce que cette migration fait, dans cet ordre (un seul `begin`/`commit`) :
--    1. ajoute `latitude`/`longitude` (`numeric(9,6)`, bornes, paire liée) ;
--    2. reprend l'existant depuis `lien_localisation` (quatre motifs) ;
--    3. supprime la colonne-lien — elle n'existe pas chez la cible, et la
--       garder laisserait deux vérités possibles ;
--    4. réécrit `fiche_du_commerce()` et `enregistrer_fiche_etablissement()`
--       sur les coordonnées ;
--    5. expose le point dans `carte_pour_wallet()`, pour que le pass puisse
--       porter ses `merchantLocations`.
--
--  Non fait, volontairement : aucun **lien court** n'est résolu ici. Résoudre
--  `maps.app.goo.gl/…` demande une requête sortante déclenchée par un champ de
--  formulaire ; l'analyse JS refuse et nomme la cause. `[?]` côté cible.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. Les deux colonnes
--
--  `numeric(9,6)` : six décimales, comme Maps en produit au plus, et assez de
--  place pour 999.999999 — donc pour toute longitude. `null` des deux côtés =
--  proximité **désactivée**, comportement mesuré (« Laissez vide pour
--  désactiver »).
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs
  add column if not exists latitude  numeric(9,6),
  add column if not exists longitude numeric(9,6);

--  Une seule contrainte, gardée par `pg_constraint` : `add constraint` n'a pas
--  de `if not exists`, et une migration rejouée doit passer sans bruit.
--  Elle porte deux règles en une : les bornes géographiques, et le fait qu'une
--  coordonnée seule ne veut rien dire (un point n'a pas de moitié).
--
--  Le second `is not null` n'est pas décoratif : un `CHECK` rend `NULL` quand
--  un opérande manque, et PostgreSQL **accepte** `NULL`. Sans lui, `latitude`
--  à 33 avec `longitude` à `null` passait — mesuré sur la base jetable.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'loyalty_programs_coordonnees_bornes'
       and conrelid = 'public.loyalty_programs'::regclass
  ) then
    alter table public.loyalty_programs
      add constraint loyalty_programs_coordonnees_bornes
      check (
        (latitude is null and longitude is null)
        or (
          latitude is not null and longitude is not null
          and latitude between -90 and 90
          and longitude between -180 and 180
        )
      );
  end if;
end
$$;

comment on column public.loyalty_programs.latitude is
  'Latitude du commerce en degrés décimaux ; NULL avec `longitude` = notification de proximité désactivée.';
comment on column public.loyalty_programs.longitude is
  'Longitude du commerce en degrés décimaux ; va toujours avec `latitude` (contrainte de paire).';


-- ---------------------------------------------------------------------------
--  2. Reprise de l'existant, avant la suppression de la colonne
--
--  Quatre motifs, ceux que Maps produit réellement : la paire nue, `@lat,lng`,
--  les données `!3d…!4d…` d'une URL de lieu, et le paramètre d'un lien de
--  partage. Un lien court ne porte aucune coordonnée : il reste `null`, et la
--  ligne est **comptée** plus bas — jamais perdue en silence.
--
--  Le tout est gardé par `information_schema` et passé en SQL dynamique : la
--  colonne n'existe plus au second passage, et une migration rejouée doit
--  passer sans bruit (mesuré : sans ce garde, le rejeu échouait).
-- ---------------------------------------------------------------------------

do $$
declare
  v_restant integer;
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'loyalty_programs'
       and column_name = 'lien_localisation'
  ) then
    execute $reprise$
      with reprise as (
        select p.id,
               regexp_match(p.lien_localisation,
                 '^\s*(-?[0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*(-?[0-9]{1,3}(?:\.[0-9]+)?)\s*$') as paire,
               regexp_match(p.lien_localisation,
                 '@(-?[0-9]{1,3}\.[0-9]+),(-?[0-9]{1,3}\.[0-9]+)') as arobase,
               regexp_match(p.lien_localisation,
                 '!3d(-?[0-9]{1,3}\.[0-9]+)!4d(-?[0-9]{1,3}\.[0-9]+)') as donnees,
               regexp_match(p.lien_localisation,
                 '[?&](?:q|query|ll|center)=(-?[0-9]{1,3}\.[0-9]+),(-?[0-9]{1,3}\.[0-9]+)') as parametre
          from public.loyalty_programs p
         where p.lien_localisation is not null
           and btrim(p.lien_localisation) <> ''
      )
      update public.loyalty_programs cible
         set latitude  = round(coalesce(r.paire[1], r.donnees[1], r.arobase[1], r.parametre[1])::numeric, 6),
             longitude = round(coalesce(r.paire[2], r.donnees[2], r.arobase[2], r.parametre[2])::numeric, 6)
        from reprise r
       where cible.id = r.id
         and cible.latitude is null
         and coalesce(r.paire[1], r.donnees[1], r.arobase[1], r.parametre[1]) is not null
         and coalesce(r.paire[2], r.donnees[2], r.arobase[2], r.parametre[2]) is not null
    $reprise$;

    select count(*)
      into v_restant
      from public.loyalty_programs p
     where p.latitude is null
       and p.lien_localisation is not null
       and btrim(p.lien_localisation) <> '';

    if v_restant > 0 then
      raise notice '0017 : % emplacement(s) non analysable(s) — eux seuls perdent leur lien ; /settings les affichera vide', v_restant;
    end if;
  end if;
end
$$;

--  La colonne-lien disparaît : chez la cible elle n'existe pas, et deux
--  colonnes pour une même vérité finissent toujours par diverger.
alter table public.loyalty_programs
  drop column if exists lien_localisation;



-- ---------------------------------------------------------------------------
--  3. La lecture — `fiche_du_commerce()`
--
--  Même contrat qu'en `0011` (un objet, `PROGRAM_NOT_FOUND` si rien), aux deux
--  colonnes près : `latitude`/`longitude` remplacent `lien_localisation`. C'est
--  ce que l'écran ré-affiche, sous la forme `${latitude}, ${longitude}`.
-- ---------------------------------------------------------------------------

create or replace function public.fiche_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme record;
begin
  select p.name,
         p.type_activite,
         p.phone,
         p.city,
         p.address,
         p.description,
         p.site_url,
         p.reservation_url,
         p.instagram_url,
         p.facebook_url,
         p.tiktok_url,
         p.latitude,
         p.longitude,
         p.geofence_radius_m,
         p.geofence_texte
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at, p.id
   limit 1;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  return json_build_object(
    'name',              v_programme.name,
    'type_activite',     v_programme.type_activite,
    'phone',             v_programme.phone,
    'city',              v_programme.city,
    'address',           v_programme.address,
    'description',       v_programme.description,
    'site_url',          v_programme.site_url,
    'reservation_url',   v_programme.reservation_url,
    'instagram_url',     v_programme.instagram_url,
    'facebook_url',      v_programme.facebook_url,
    'tiktok_url',        v_programme.tiktok_url,
    'latitude',          v_programme.latitude,
    'longitude',         v_programme.longitude,
    'geofence_radius_m', v_programme.geofence_radius_m,
    'geofence_texte',    v_programme.geofence_texte
  );
end;
$fonction$;


-- ---------------------------------------------------------------------------
--  4. L'écriture — `enregistrer_fiche_etablissement(...)`
--
--  Quinze paramètres au lieu de quatorze : `p_lien_localisation` disparaît,
--  `p_latitude`/`p_longitude` arrivent. L'ancienne signature est **supprimée**
--  et non surchargée : deux fonctions du même nom rendraient l'appel PostgREST
--  ambigu, et un `PGRST202` se lirait comme « migration non passée ».
--
--  Le refus `INVALID_COORDONNEES` couvre les deux cas qui restent possibles
--  malgré le formulaire : une coordonnée seule, et un point hors du globe.
--  Il est déclaré dans `CODES_CONNUS` (`lib/donnees.mjs`), sinon il passerait
--  pour une panne là où la base a dit « non ».
-- ---------------------------------------------------------------------------

drop function if exists public.enregistrer_fiche_etablissement(
  varchar, varchar, text, text, text, text, text, text, text, text, text, text, integer, text
);

create or replace function public.enregistrer_fiche_etablissement(
  p_name              varchar,
  p_type_activite     varchar,
  p_phone             text,
  p_city              text,
  p_address           text,
  p_description       text,
  p_site_url          text,
  p_reservation_url   text,
  p_instagram_url     text,
  p_facebook_url      text,
  p_tiktok_url        text,
  p_latitude          numeric,
  p_longitude         numeric,
  p_geofence_radius_m integer,
  p_geofence_texte    text
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme uuid;
  v_nom       varchar;
  v_type      varchar;
  v_texte     text;
  v_latitude  numeric(9,6);
  v_longitude numeric(9,6);
begin
  select p.id
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at, p.id
   limit 1;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Le nom : non vide, et dans la borne de la colonne (`varchar(120)`).
  v_nom := btrim(coalesce(p_name, ''));
  if v_nom = '' or char_length(v_nom) > 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  -- Le type : les trois valeurs mesurées, rien d'autre. Le `check` de la
  -- colonne le dirait aussi, mais par une erreur de contrainte que l'écran ne
  -- sait pas traduire.
  v_type := btrim(coalesce(p_type_activite, ''));
  if v_type not in ('physique', 'en_ligne', 'mixte') then
    raise exception 'INVALID_TYPE_ACTIVITE' using errcode = 'P0001';
  end if;

  -- L'emplacement : les deux nombres, ou aucun. Un point n'a pas de moitié, et
  -- une latitude de 91 n'est pas un point. Arrondi à la précision de la
  -- colonne, donc deux saisies à sept décimales ne divergent pas en silence.
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'INVALID_COORDONNEES' using errcode = 'P0001';
  end if;

  if p_latitude is not null then
    if p_latitude < -90 or p_latitude > 90
       or p_longitude < -180 or p_longitude > 180 then
      raise exception 'INVALID_COORDONNEES' using errcode = 'P0001';
    end if;
    v_latitude  := round(p_latitude, 6);
    v_longitude := round(p_longitude, 6);
  end if;

  -- Le rayon : bornes et pas, ceux du balisage mesuré (`min`, `max`, `step`).
  if p_geofence_radius_m is null
     or p_geofence_radius_m < 50
     or p_geofence_radius_m > 2000
     or p_geofence_radius_m % 50 <> 0 then
    raise exception 'INVALID_RADIUS' using errcode = 'P0001';
  end if;

  -- Le message : 120 caractères, `maxlength` mesuré. Vide = `null`, et c'est
  -- l'écran qui compose « Vous êtes près de <nom> » avec le nom du moment.
  v_texte := nullif(btrim(coalesce(p_geofence_texte, '')), '');
  if v_texte is not null and char_length(v_texte) > 120 then
    raise exception 'INVALID_GEOFENCE_TEXTE' using errcode = 'P0001';
  end if;


  update public.loyalty_programs
     set name              = v_nom,
         type_activite     = v_type,
         phone             = nullif(btrim(coalesce(p_phone, '')), ''),
         city              = nullif(btrim(coalesce(p_city, '')), ''),
         address           = nullif(btrim(coalesce(p_address, '')), ''),
         description       = nullif(btrim(coalesce(p_description, '')), ''),
         site_url          = nullif(btrim(coalesce(p_site_url, '')), ''),
         reservation_url   = nullif(btrim(coalesce(p_reservation_url, '')), ''),
         instagram_url     = nullif(btrim(coalesce(p_instagram_url, '')), ''),
         facebook_url      = nullif(btrim(coalesce(p_facebook_url, '')), ''),
         tiktok_url        = nullif(btrim(coalesce(p_tiktok_url, '')), ''),
         latitude          = v_latitude,
         longitude         = v_longitude,
         geofence_radius_m = p_geofence_radius_m,
         geofence_texte    = v_texte
   where id = v_programme;

  -- On rend l'état **relu**, pas les paramètres : c'est la seule façon de
  -- prouver à l'écran que la colonne contient bien ce qu'il vient d'envoyer.
  return public.fiche_du_commerce();
end;
$fonction$;


-- ---------------------------------------------------------------------------
--  5. Le pass — `carte_pour_wallet()` expose le point
--
--  Même signature, même retour : seules deux clés s'ajoutent au `programme`.
--  Le rayon est joint parce que le nombre de points dépend de lui. Rien de
--  nominatif n'entre ici — ni nom de famille, ni email, ni paliers.
-- ---------------------------------------------------------------------------

create or replace function public.carte_pour_wallet(p_token varchar)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_carte     record;
  v_prenom    text;
  v_programme record;
begin
  select c.id, c.card_token, c.current_points, c.client_id, c.wallet_object_id
    into v_carte
    from public.loyalty_cards c
   where c.card_token = upper(trim(coalesce(p_token, '')));

  if v_carte.id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select nullif(btrim(coalesce(cl.first_name, '')), '') into v_prenom
    from public.clients cl
   where cl.id = v_carte.client_id;

  select p.name, p.kind, p.points_threshold,
         p.latitude, p.longitude, p.geofence_radius_m, p.geofence_texte
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at
   limit 1;

  if v_programme.name is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  return json_build_object(
    'card_id',          v_carte.id,
    'card_token',       v_carte.card_token,
    'points',           v_carte.current_points,
    'prenom',           coalesce(v_prenom, ''),
    'wallet_object_id', v_carte.wallet_object_id,
    'programme', json_build_object(
      'nom',        v_programme.name,
      'kind',       v_programme.kind,
      'seuil',      v_programme.points_threshold,
      'latitude',   v_programme.latitude,
      'longitude',  v_programme.longitude,
      'rayon',      v_programme.geofence_radius_m,
      'texte',      v_programme.geofence_texte
    )
  );
end;
$fonction$;

comment on function public.carte_pour_wallet(varchar) is
  'Données minimales d''un pass Google Wallet (token, points, prénom, point de proximité). Ni nom de famille, ni email, ni paliers.';


-- ---------------------------------------------------------------------------
--  6. Les droits — `authenticated` seulement, comme en `0011`
--
--  La signature neuve n'hérite d'aucun `GRANT` de l'ancienne : elle est
--  accordée explicitement, et `anon` reste dehors (téléphone, adresse et
--  géofence du commerçant).
-- ---------------------------------------------------------------------------

revoke execute on function public.fiche_du_commerce()
  from public, anon, authenticated;
revoke execute on function public.enregistrer_fiche_etablissement(
  varchar, varchar, text, text, text, text, text, text, text, text, text, numeric, numeric, integer, text
) from public, anon, authenticated;

grant execute on function public.fiche_du_commerce()
  to authenticated, service_role;
grant execute on function public.enregistrer_fiche_etablissement(
  varchar, varchar, text, text, text, text, text, text, text, text, text, numeric, numeric, integer, text
) to authenticated, service_role;

commit;


