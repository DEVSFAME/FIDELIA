-- ============================================================================
--  0015 — APPARENCE (`/branding`, écart P0-5 du plan de parité)
--
--  Source mesurée : `_captures/2026-11-02-a6/rendu/a08-branding.html` (200) et
--  le chunk de la page (`_next_static_chunks_app__dashboard__branding_page-
--  badcb0936c16a5ca.js`). Le chunk lit `restaurants.select("*")` et écrit
--  `{name, primary_color, commerce_type, logo_url, wallet_bg_url,
--  style_bandeau, stamp_icon, stamps_total}` par `POST /api/branding/save`.
--  Ici : quatre colonnes, une lecture, une écriture. Mono-commerce oblige, la
--  fiche du commerce est `loyalty_programs` (même départage que `0003`→`0011`).
--
--  CE QUI N'EST PAS ICI, ET POURQUOI
--  ---------------------------------
--  - `style_bandeau`, `stamp_icon`, `stamps_total` : la cible ne les rend que
--    pour un programme à **tampons** (section « 4 · Tampons par carte »), et
--    aucun écran de ce socle ne dessine de grille de tampons — la caisse crédite
--    des points (`award_loyalty_points`, sans paramètre de tampon). Décision
--    produit du **2026-11-02** : refusés, pas reportés (dette P0-6b close). Ces
--    trois colonnes n'arriveront donc **pas** : les ajouter demanderait une
--    migration dédiée, pas une extension de celle-ci.
--  - l'**envoi de fichier** (`POST /api/branding/upload`) : il demande un espace
--    de stockage et une clé de service, absents de ce socle. `logo_url` et
--    `wallet_bg_url` sont des URL — l'écran demande l'adresse, et le dit.
--  - `type_activite` (`0011`) n'est **pas** `commerce_type` : la première dit
--    comment on vend (physique / en ligne / mixte, mesuré sur `/settings`), la
--    seconde quel emoji sert d'icône (dix valeurs, mesurées sur `/branding`).
--    Deux questions différentes, deux colonnes.
--
--  STATUT : NON EXÉCUTÉE. Tant qu'elle ne l'est pas, `/branding` affiche
--  « la base n'est pas encore migrée » avec ce nom de fichier — jamais un
--  formulaire vide qui laisserait croire que rien n'est enregistré.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. Les quatre colonnes
--
--  Défauts **mesurés** : `#1a1a1a` (le premier des huit échantillons, et la
--  valeur que le chunk pose quand `primary_color` est nul) et `restaurant` (la
--  valeur de repli de `commerce_type`). `logo_url` et `wallet_bg_url` restent
--  nullables : une image absente n'est pas une chaîne vide.
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs
  add column if not exists primary_color varchar(7)  not null default '#1a1a1a',
  add column if not exists commerce_type varchar(16) not null default 'restaurant',
  add column if not exists logo_url      text,
  add column if not exists wallet_bg_url text;

comment on column public.loyalty_programs.primary_color is
  'Couleur de la carte, au format #rrggbb (huit valeurs proposées, une libre).';
comment on column public.loyalty_programs.commerce_type is
  'Type d''établissement : sert d''icône tant qu''il n''y a pas de logo (dix valeurs mesurées).';
comment on column public.loyalty_programs.logo_url is
  'URL du logo, carré de préférence ; NULL = l''icône du type d''établissement est utilisée.';
comment on column public.loyalty_programs.wallet_bg_url is
  'URL de l''image de fond du haut de la carte ; NULL = pas d''image.';

-- Contraintes **nommées** : sans nom, un `drop constraint` ultérieur devrait
-- deviner celui que Postgres a fabriqué, et échouerait en silence sur un nom faux.
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_primary_color_check,
  drop constraint if exists loyalty_programs_commerce_type_check,
  drop constraint if exists loyalty_programs_logo_url_check,
  drop constraint if exists loyalty_programs_wallet_bg_url_check;

alter table public.loyalty_programs
  add constraint loyalty_programs_primary_color_check
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint loyalty_programs_commerce_type_check
    check (commerce_type in (
      'restaurant', 'cafe', 'coiffure', 'barbershop', 'pressing',
      'retoucherie', 'boucherie', 'patisserie', 'librairie', 'autre'
    )),
  /* Deux formes admises, et deux seulement : `https://…` (une image hébergée)
     ou `/…` (une image du site, comme `/brand/logo-mark.png` de la cible).
     Tout le reste — `javascript:`, `data:`, un chemin relatif nu — est refusé :
     ces valeurs finissent dans une balise `img`, donc dans le navigateur du
     client. */
  add constraint loyalty_programs_logo_url_check
    check (
      logo_url is null
      or (char_length(logo_url) between 1 and 500 and logo_url ~ '^(https://|/)')
    ),
  add constraint loyalty_programs_wallet_bg_url_check
    check (
      wallet_bg_url is null
      or (char_length(wallet_bg_url) between 1 and 500 and wallet_bg_url ~ '^(https://|/)')
    );


-- ---------------------------------------------------------------------------
--  2. La lecture — `apparence_du_commerce()`
--
--  Cinq champs, pas un de plus : c'est exactement ce que l'écran rend, et ce
--  qu'il renvoie après écriture. `PROGRAM_NOT_FOUND` plutôt qu'un objet vide —
--  même règle qu'en `0010`/`0011` : un formulaire pré-rempli de valeurs par
--  défaut ferait croire que l'enregistrement a eu lieu.
-- ---------------------------------------------------------------------------

create or replace function public.apparence_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme record;
begin
  select p.name,
         p.primary_color,
         p.commerce_type,
         p.logo_url,
         p.wallet_bg_url
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at, p.id
   limit 1;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  return json_build_object(
    'name',          v_programme.name,
    'primary_color', v_programme.primary_color,
    'commerce_type', v_programme.commerce_type,
    'logo_url',      v_programme.logo_url,
    'wallet_bg_url', v_programme.wallet_bg_url
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  3. L'écriture — `enregistrer_apparence(...)`
--
--  Cinq arguments **toujours** envoyés : `nullif(btrim(...))` pour que vider un
--  champ l'efface vraiment (omettre laisserait l'ancienne valeur, et le
--  commerçant croirait son effacement perdu). Un seul `update` après validation,
--  et la valeur rendue est celle **relue**, pas celle reçue.
--
--  Le nom est écrit ici aussi : sur la cible il est sur `restaurants.name`, donc
--  sur cet écran ; chez nous il vit dans `loyalty_programs.name` et `/settings`
--  l'écrit déjà. Les deux chemins passent par le même contrôle
--  (`INVALID_NAME`, 120 caractères) — c'est la colonne qui commande.
-- ---------------------------------------------------------------------------

create or replace function public.enregistrer_apparence(
  p_name          varchar,
  p_primary_color varchar,
  p_commerce_type varchar,
  p_logo_url      text,
  p_wallet_bg_url text
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme uuid;
  v_nom       varchar;
  v_couleur   varchar;
  v_type      varchar;
  v_logo      text;
  v_image     text;
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

  v_nom := btrim(coalesce(p_name, ''));
  if v_nom = '' or char_length(v_nom) > 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  -- La casse est normalisée : `#F94C3A` et `#f94c3a` sont la même couleur, et
  -- deux écritures d'une même valeur donneraient deux pastilles « actives ».
  v_couleur := lower(btrim(coalesce(p_primary_color, '')));
  if v_couleur !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_COLOR' using errcode = 'P0001';
  end if;

  v_type := btrim(coalesce(p_commerce_type, ''));
  if v_type not in (
    'restaurant', 'cafe', 'coiffure', 'barbershop', 'pressing',
    'retoucherie', 'boucherie', 'patisserie', 'librairie', 'autre'
  ) then
    raise exception 'INVALID_COMMERCE_TYPE' using errcode = 'P0001';
  end if;

  v_logo := nullif(btrim(coalesce(p_logo_url, '')), '');
  if v_logo is not null
     and (char_length(v_logo) > 500 or v_logo !~ '^(https://|/)') then
    raise exception 'INVALID_LOGO_URL' using errcode = 'P0001';
  end if;

  v_image := nullif(btrim(coalesce(p_wallet_bg_url, '')), '');
  if v_image is not null
     and (char_length(v_image) > 500 or v_image !~ '^(https://|/)') then
    raise exception 'INVALID_IMAGE_URL' using errcode = 'P0001';
  end if;

  update public.loyalty_programs
     set name          = v_nom,
         primary_color = v_couleur,
         commerce_type = v_type,
         logo_url      = v_logo,
         wallet_bg_url = v_image
   where id = v_programme;

  return public.apparence_du_commerce();
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  4. Les droits — `authenticated` seulement
--
--  `anon` ne lit pas l'apparence : elle ne contient aucun secret, mais la
--  doctrine du socle est qu'une fonction de dashboard n'est pas publique par
--  accident. `REVOKE … FROM PUBLIC` d'abord : `create function` hérite des
--  privilèges du schéma, donc sans lui le `GRANT` ne suffirait pas à fermer.
-- ---------------------------------------------------------------------------

revoke execute on function public.apparence_du_commerce()
  from public, anon, authenticated;
revoke execute on function public.enregistrer_apparence(
  varchar, varchar, varchar, text, text
) from public, anon, authenticated;

grant execute on function public.apparence_du_commerce()
  to authenticated, service_role;
grant execute on function public.enregistrer_apparence(
  varchar, varchar, varchar, text, text
) to authenticated, service_role;

commit;
