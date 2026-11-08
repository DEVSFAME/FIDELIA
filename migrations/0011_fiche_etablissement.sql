-- ============================================================================
--  0011 — FICHE ÉTABLISSEMENT (`/settings`, P0-2)
--
--  Source : `_captures/2026-11-02-a7/rendu/c01-settings.html` (passe A7, 200).
--  13 colonnes sur `loyalty_programs` + lecture `fiche_du_commerce()` +
--  écriture atomique `enregistrer_fiche_etablissement(...)`. Aucun droit de
--  table : tout passe par les fonctions (`0003` → `0010`, même doctrine).
--
--  Non fait, volontairement : mot de passe et résiliation (non mesurés, hors
--  socle), langue (darija hors périmètre). `programme_public` et
--  `enregistrer_programme` sont intouchées : la fiche est commerciale, pas
--  publique. Mono-commerce : le nom reste dans `loyalty_programs.name`, sinon
--  `/join/<slug>` et le comptoir afficheraient deux noms différents.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. Les treize colonnes
--
--  `type_activite` et `geofence_radius_m` portent un défaut : le `<select>` de
--  la cible n'a pas d'option vide, et le `placeholder` du rayon vaut 1000. Les
--  autres sont nullables — un champ vide vaut « pas renseigné », jamais `''`.
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs
  add column if not exists type_activite varchar(16) not null default 'physique'
    check (type_activite in ('physique', 'en_ligne', 'mixte')),
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists description text,
  add column if not exists site_url text,
  add column if not exists reservation_url text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text,
  add column if not exists lien_localisation text,
  add column if not exists geofence_radius_m integer not null default 1000
    check (geofence_radius_m between 50 and 2000),
  add column if not exists geofence_texte varchar(120);

comment on column public.loyalty_programs.type_activite is
  'Type d''activité : physique (comptoir), en_ligne (vente à distance) ou mixte.';
comment on column public.loyalty_programs.phone is
  'Téléphone du commerce, tel que saisi (affiché au dos de la carte, cliquable).';
comment on column public.loyalty_programs.city is
  'Ville du commerce.';
comment on column public.loyalty_programs.address is
  'Adresse postale du commerce.';
comment on column public.loyalty_programs.description is
  'Description courte du commerce, telle qu''elle apparaît sur la carte.';
comment on column public.loyalty_programs.site_url is
  'Site web du commerce, saisi sans schéma (l''affichage ajoute https://).';
comment on column public.loyalty_programs.reservation_url is
  'Page de réservation en ligne, saisie sans schéma.';
comment on column public.loyalty_programs.instagram_url is
  'Profil Instagram, saisi sans schéma.';
comment on column public.loyalty_programs.facebook_url is
  'Page Facebook, saisie sans schéma.';
comment on column public.loyalty_programs.tiktok_url is
  'Profil TikTok, saisi sans schéma.';
comment on column public.loyalty_programs.lien_localisation is
  'Lien Google Maps ou « latitude, longitude » ; NULL = notification de proximité désactivée.';
comment on column public.loyalty_programs.geofence_radius_m is
  'Rayon de déclenchement de la notification, en mètres (50 à 2000, pas de 50).';
comment on column public.loyalty_programs.geofence_texte is
  'Message affiché dans la notification (120 caractères) ; NULL = « Vous êtes près de <nom> ».';

-- ---------------------------------------------------------------------------
--  2. La lecture — `fiche_du_commerce()`
--
--  Un objet, pas une liste (mono-commerce, même départage que `0003`). Sans
--  `PROGRAM_NOT_FOUND`, l'écran afficherait quatorze champs vides comme s'ils
--  étaient enregistrés — le refus que `0010` a déjà posé pour les réglages.
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
         p.lien_localisation,
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
    'lien_localisation', v_programme.lien_localisation,
    'geofence_radius_m', v_programme.geofence_radius_m,
    'geofence_texte',    v_programme.geofence_texte
  );
end;
$fonction$;


-- ---------------------------------------------------------------------------
--  3. L'écriture — `enregistrer_fiche_etablissement(...)`
--
--  Quatorze paramètres, un seul `update` après validation : écriture atomique.
--  Chaque refus lève son code (connu de `CODES_CONNUS`, sinon il passerait pour
--  une panne). Les textes vides deviennent `NULL` — d'où les quatorze arguments
--  toujours envoyés par l'écran : omettre laisserait l'ancienne valeur. Le pas
--  de 50 est vérifié ici aussi, un `step` HTML ne protège de rien.
-- ---------------------------------------------------------------------------

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
  p_lien_localisation text,
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
         lien_localisation = nullif(btrim(coalesce(p_lien_localisation, '')), ''),
         geofence_radius_m = p_geofence_radius_m,
         geofence_texte    = v_texte
   where id = v_programme;

  -- On rend l'état **relu**, pas les paramètres : c'est la seule façon de
  -- prouver à l'écran que la colonne contient bien ce qu'il vient d'envoyer.
  return public.fiche_du_commerce();
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  4. Les droits — `authenticated` seulement
--
--  `REVOKE … FROM PUBLIC` d'abord (`create function` hérite des privilèges du
--  schéma). `anon` n'est pas accordé, comme en `0010` : `programme_public` est
--  publique, la fiche ne l'est pas — téléphone, adresse et géofence resteraient
--  lisibles par qui connaît le slug.
-- ---------------------------------------------------------------------------

revoke execute on function public.fiche_du_commerce()
  from public, anon, authenticated;
revoke execute on function public.enregistrer_fiche_etablissement(
  varchar, varchar, text, text, text, text, text, text, text, text, text, text, integer, text
) from public, anon, authenticated;

grant execute on function public.fiche_du_commerce()
  to authenticated, service_role;
grant execute on function public.enregistrer_fiche_etablissement(
  varchar, varchar, text, text, text, text, text, text, text, text, text, text, integer, text
) to authenticated, service_role;

commit;

