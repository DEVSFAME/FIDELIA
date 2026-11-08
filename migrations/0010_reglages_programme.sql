-- ============================================================================
--  0010 — Les sept réglages du programme (page `/program`, écart P0-1)
--
--  POURQUOI
--  --------
--  La mesure du 2026-11-02 (`_captures/2026-11-02-a6/rendu/a02-program.html`)
--  montre que la cible tient **sept** réglages sur un seul écran :
--
--      devise                Dirham (MAD) / Euro
--      points_per_purchase   « Points par 10 <devise> dépensés »
--      min_purchase_mad      « Achat minimum »
--      deduction_libre       « Mode cashback »
--      points_expiry_days    « Expiration des points (jours, 0 = jamais) »
--      referral_reward       « Bonus de parrainage (points) »
--      review_reward_enabled + review_reward + google_review_url
--                            « Bonus avis Google »
--
--  Ce socle n'en stockait que deux : `devise` et `credits_par_euro` (`0008`).
--  Les cinq autres n'existaient **nulle part** — ni colonne, ni fonction. Un
--  écran qui les afficherait sans pouvoir les écrire promettrait un réglage,
--  c'est-à-dire exactement ce que `EtatBloque` existe pour éviter.
--
--  CE QUI N'EST PAS TOUCHÉ, ET POURQUOI
--  ------------------------------------
--  - `programme_public` n'est **pas** réécrite. Elle est accordée à `anon` (page
--    publique d'adhésion, `0003`) : y ajouter le bonus de parrainage, le lien
--    d'avis ou le plafond d'expiration publierait la configuration commerciale
--    du commerce à quiconque connaît le slug. Les sept réglages ont donc leur
--    propre lecture, accordée à `authenticated` seulement.
--  - `enregistrer_programme` n'est **pas** touchée non plus : elle écrit le
--    slug, le nom, le type, le seuil et les paliers, et la page `/program`
--    n'écrit aucun de ces cinq champs. Deux fonctions, deux périmètres : une
--    sauvegarde de réglages ne peut pas effacer un palier.
--  - aucune table n'est rouverte : `loyalty_programs` reste sous RLS **sans
--    politique**, l'accès passe par les fonctions `SECURITY DEFINER` ci-dessous.
--
--  LA CONVERSION DU BARÈME
--  -----------------------
--  L'écran demande « points par 10 », la colonne garde « points par unité »
--  (`credits_par_euro`, lue par la caisse depuis `0008`). On ne crée **pas** une
--  seconde colonne : deux sources pour un même barème divergeraient au premier
--  enregistrement, et la caisse créditerait un nombre de points que l'écran n'a
--  jamais montré. La conversion est faite côté module (`lib/programme.mjs`), et
--  la fonction ci-dessous vérifie ce qu'elle reçoit.
--
--  RAPPEL DE MESURE
--  ----------------
--  Comme `0009`, ce fichier **n'est pas encore exécuté** au moment où il est
--  écrit : l'écran qui le consomme dégrade proprement (`PGRST202` → bloc
--  « migration à passer », avec le nom du fichier). Une migration non passée ne
--  casse pas la page, elle la déclare.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. Les sept colonnes
--     Chacune porte son défaut et sa borne : un `null` dans
--     `points_expiry_days` se lirait « inconnu » là où `0` veut dire « jamais »,
--     et l'écran afficherait un champ vide au lieu d'un réglage.
-- ---------------------------------------------------------------------------

alter table public.loyalty_programs
  add column if not exists min_purchase numeric(10, 2) not null default 0
    check (min_purchase >= 0),
  add column if not exists deduction_libre boolean not null default false,
  add column if not exists points_expiry_days integer not null default 0
    check (points_expiry_days >= 0),
  add column if not exists referral_reward integer not null default 0
    check (referral_reward >= 0),
  add column if not exists review_reward_enabled boolean not null default false,
  add column if not exists review_reward integer not null default 0
    check (review_reward >= 0),
  add column if not exists google_review_url text
    check (google_review_url is null or google_review_url ~* '^https://');

comment on column public.loyalty_programs.min_purchase is
  'Montant minimum d''un ticket pour créditer des points, dans la devise du programme.';
comment on column public.loyalty_programs.deduction_libre is
  'Cashback : la caisse peut déduire des points du solde, sans passer par une récompense.';
comment on column public.loyalty_programs.points_expiry_days is
  'Durée de vie des points en jours ; 0 = jamais.';
comment on column public.loyalty_programs.referral_reward is
  'Points offerts au parrain et au filleul au premier passage du filleul ; 0 = désactivé.';
comment on column public.loyalty_programs.review_reward_enabled is
  'Bonus d''avis Google activé.';
comment on column public.loyalty_programs.review_reward is
  'Points accordés pour un avis validé (une seule fois par client).';
comment on column public.loyalty_programs.google_review_url is
  'Lien de la page d''avis du commerce (https, facultatif).';

-- ---------------------------------------------------------------------------
--  2. La lecture — `reglages_du_programme()`
--
--  Elle rend **un** objet, pas une liste : ce socle n'a qu'un programme par
--  commerce, et `programme_du_commerce` (`0003`) a déjà tranché la question du
--  départage (`order by created_at, id`). On reprend la même règle : deux
--  programmes actifs ne doivent pas donner un réglage différent d'un appel à
--  l'autre. Sans `PROGRAM_NOT_FOUND`, un commerce sans programme lirait un
--  objet vide et l'écran afficherait des réglages à zéro.
-- ---------------------------------------------------------------------------

create or replace function public.reglages_du_programme()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme record;
begin
  select p.devise,
         p.credits_par_euro,
         p.min_purchase,
         p.deduction_libre,
         p.points_expiry_days,
         p.referral_reward,
         p.review_reward_enabled,
         p.review_reward,
         p.google_review_url
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at, p.id
   limit 1;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  return json_build_object(
    'devise',                v_programme.devise,
    'credits_par_euro',      v_programme.credits_par_euro,
    'min_purchase',          v_programme.min_purchase,
    'deduction_libre',       v_programme.deduction_libre,
    'points_expiry_days',    v_programme.points_expiry_days,
    'referral_reward',       v_programme.referral_reward,
    'review_reward_enabled', v_programme.review_reward_enabled,
    'review_reward',         v_programme.review_reward,
    'google_review_url',     v_programme.google_review_url
  );
end;
$fonction$;


-- ---------------------------------------------------------------------------
--  3. L'écriture — `enregistrer_reglages_programme(...)`
--
--  Neuf paramètres, sept réglages : la devise et le taux sont deux colonnes,
--  et le bonus d'avis en occupe trois (activation, points, lien).
--
--  Chaque refus lève **son** code, avant toute écriture : c'est ce qui permet à
--  l'écran de dire lequel des sept champs est en cause, au lieu d'un « la base a
--  refusé » qui laisserait le commerçant chercher. Les codes sont connus de
--  `lib/donnees.mjs` (`CODES_CONNUS`) : sans cette liste, un refus tomberait en
--  « la base ne répond pas », soit une panne affichée pour une réponse.
--
--  Deux règles de **cohérence**, et pas seulement de forme :
--    - un bonus activé à 0 point promet une récompense qui n'arrive jamais ;
--    - un bonus activé sans lien promet une récompense que le client ne peut
--      pas réclamer : la page d'avis est le seul chemin vers la demande.
--
--  L'écriture est **atomique** : un seul `update`, après validation. Aucun
--  `insert`, aucune création de programme — créer le programme reste le travail
--  de `enregistrer_programme` (onglet « Récompenses »), et une page de réglages
--  qui créerait un programme au passage produirait un slug que personne n'a
--  choisi.
-- ---------------------------------------------------------------------------

create or replace function public.enregistrer_reglages_programme(
  p_devise                varchar,
  p_credits_par_euro      numeric,
  p_min_purchase          numeric,
  p_deduction_libre       boolean,
  p_points_expiry_days    integer,
  p_referral_reward       integer,
  p_review_reward_enabled boolean,
  p_review_reward         integer,
  p_google_review_url     text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme uuid;
  v_devise    varchar(3);
  v_lien      text;
  v_avis      boolean;
begin
  v_devise := upper(trim(coalesce(p_devise, '')));

  if v_devise not in ('MAD', 'EUR') then
    raise exception 'INVALID_DEVISE' using errcode = 'P0001';
  end if;

  -- Le taux : les bornes de `0008` (0,01 à 1000), plus les deux décimales de
  -- la colonne. Arrondir ici plutôt que refuser changerait le barème en
  -- silence — le commerçant aurait saisi 0,225 et la caisse appliquerait 0,22.
  if p_credits_par_euro is null
     or p_credits_par_euro < 0.01
     or p_credits_par_euro > 1000
     or (p_credits_par_euro * 100) <> round(p_credits_par_euro * 100) then
    raise exception 'INVALID_CREDITS' using errcode = 'P0001';
  end if;

  if p_min_purchase is null or p_min_purchase < 0 then
    raise exception 'INVALID_MIN_PURCHASE' using errcode = 'P0001';
  end if;

  if p_points_expiry_days is null or p_points_expiry_days < 0 then
    raise exception 'INVALID_EXPIRY' using errcode = 'P0001';
  end if;

  if p_referral_reward is null or p_referral_reward < 0 then
    raise exception 'INVALID_REFERRAL' using errcode = 'P0001';
  end if;

  if p_review_reward is null or p_review_reward < 0 then
    raise exception 'INVALID_REVIEW' using errcode = 'P0001';
  end if;

  -- Un lien vidé vaut `null`, pas `''` : deux façons de dire « aucun lien »
  -- feraient deux branches dans l'écran, et une seule serait testée.
  v_lien := nullif(trim(coalesce(p_google_review_url, '')), '');

  if v_lien is not null and v_lien !~* '^https://' then
    raise exception 'INVALID_REVIEW_URL' using errcode = 'P0001';
  end if;

  v_avis := coalesce(p_review_reward_enabled, false);

  if v_avis and p_review_reward = 0 then
    raise exception 'REVIEW_WITHOUT_POINTS' using errcode = 'P0001';
  end if;

  if v_avis and v_lien is null then
    raise exception 'REVIEW_WITHOUT_URL' using errcode = 'P0001';
  end if;

  select p.id
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at, p.id
   limit 1;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.loyalty_programs
     set devise                = v_devise,
         credits_par_euro      = p_credits_par_euro,
         min_purchase          = p_min_purchase,
         deduction_libre       = coalesce(p_deduction_libre, false),
         points_expiry_days    = p_points_expiry_days,
         referral_reward       = p_referral_reward,
         review_reward_enabled = v_avis,
         review_reward         = p_review_reward,
         google_review_url     = v_lien
   where id = v_programme;

  -- On rend l'état **relu**, pas les paramètres : c'est la seule façon de
  -- prouver à l'écran que la colonne contient bien ce qu'il vient d'envoyer.
  return public.reglages_du_programme();
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  4. Les droits — `authenticated` seulement
--
--  `REVOKE … FROM PUBLIC` d'abord : `create function` hérite des privilèges par
--  défaut du schéma, donc révoquer `anon` seul ne retirerait rien.
--
--  `anon` n'est **pas** accordé, et c'est l'écart voulu avec `0009` : la liste
--  des caisses est publique par construction, la configuration commerciale ne
--  l'est pas. Un visiteur qui connaît le slug n'a rien à faire du bonus de
--  parrainage ni du plafond d'expiration.
-- ---------------------------------------------------------------------------

revoke execute on function public.reglages_du_programme()
  from public, anon, authenticated;
revoke execute on function public.enregistrer_reglages_programme(
  varchar, numeric, numeric, boolean, integer, integer, boolean, integer, text
) from public, anon, authenticated;

grant execute on function public.reglages_du_programme()
  to authenticated, service_role;
grant execute on function public.enregistrer_reglages_programme(
  varchar, numeric, numeric, boolean, integer, integer, boolean, integer, text
) to authenticated, service_role;

commit;

