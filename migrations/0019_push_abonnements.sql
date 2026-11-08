-- ============================================================================
--  0019 — LES ABONNEMENTS WEB PUSH (P0-2b, seconde moitié)
--
--  Source : `…/2026-10-27-a3/raw/assets/_next_static_chunks_app_card_%5BcardId%5D
--  _page-198959ba….js` (module 61618). Le corps mesuré du `POST` est exactement
--  `{ card_id, endpoint, p256dh, auth }`, et rien d'autre.
--
--  CE QUE CETTE MIGRATION NE FAIT PAS, ET QUI COMPTE AUTANT
--
--    - **aucun émetteur.** Rien ici n'appelle un service de push : la table est
--      écrite, jamais lue. L'émetteur est P0-4b, non tranché. C'est écrit sur la
--      table (`comment on table`) pour que personne ne prenne une ligne pour une
--      promesse de livraison.
--    - **aucune purge.** Un abonnement mort rend `410 Gone` chez le service de
--      push ; reconnaître ce code puis supprimer la ligne est le travail de
--      l'émetteur. Purger à l'écriture reviendrait à faire le travail d'un canal
--      qui n'existe pas encore.
--
--  LE PLAFOND DE CINQ PAR CARTE, ET POURQUOI IL EXISTE
--
--  `POST /api/push/subscribe` est **public** (la page carte ne demande pas de
--  session). Sans plafond, un UUID fuité — il est dans chaque lien Wallet —
--  suffirait à remplir la table. Cinq couvre le cas réel (téléphone, tablette,
--  navigateur de bureau, réinstallation) sans transformer la route en stockage
--  gratuit. Au-delà : `TROP_D_ABONNEMENTS`, un refus nommé, pas une erreur 500.
--
--  L'`endpoint` est **unique globalement**, pas par carte : un endpoint, c'est
--  un navigateur. Réabonner le même navigateur sur une autre carte doit
--  déplacer la ligne, pas en créer une seconde — sinon un seul appareil
--  compterait deux fois dans le plafond.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. La table
--
--  Les trois bornes `check` reprennent ce que la fonction refuse. Ce n'est pas
--  une duplication gratuite : un `check` tient même si un jour la fonction est
--  remplacée, et la fonction refuse **avant** d'écrire, avec un code lisible.
-- ---------------------------------------------------------------------------

create table if not exists public.push_abonnements (
  id       uuid primary key default gen_random_uuid(),
  card_id  uuid not null references public.loyalty_cards(id) on delete cascade,
  endpoint text not null,
  p256dh   text not null,
  auth     text not null,
  cree_le  timestamptz not null default now(),
  vu_le    timestamptz not null default now(),

  constraint push_abonnements_endpoint_unique unique (endpoint),

  constraint push_abonnements_endpoint_forme check (
    endpoint ~ '^https://' and char_length(endpoint) between 10 and 1024
  ),
  -- `p256dh` et `auth` sont en base64url (RFC 4648 §5) : alphanumériques,
  -- `-`, `_`, et au plus deux `=` de bourrage.
  constraint push_abonnements_p256dh_forme check (
    p256dh ~ '^[A-Za-z0-9_-]+={0,2}$' and char_length(p256dh) between 16 and 200
  ),
  constraint push_abonnements_auth_forme check (
    auth ~ '^[A-Za-z0-9_-]+={0,2}$' and char_length(auth) between 8 and 100
  )
);

comment on table public.push_abonnements is
  'Abonnements web push d''une carte (endpoint + clés du navigateur). Écrits par la page publique /card/<id> ; AUCUN émetteur n''existe encore (P0-4b), donc jamais lus.';
comment on column public.push_abonnements.endpoint is
  'URL du service de push, unique : un endpoint = un navigateur. Réabonner le même navigateur déplace la ligne.';
comment on column public.push_abonnements.vu_le is
  'Dernier réabonnement constaté. La purge des endpoints morts (410 Gone) appartient à l''émetteur, pas à cette table.';



-- RLS **sans politique**, comme `clients`/`loyalty_cards`/`messages_envoyes` :
-- la table n'est atteignable que par la RPC `security definer` ci-dessous. Un
-- `select` direct rendrait `[]`, ce qui se lirait « personne n'est abonné ».
alter table public.push_abonnements enable row level security;

revoke all on table public.push_abonnements from public, anon, authenticated;


-- ---------------------------------------------------------------------------
--  2. L'écriture — `enregistrer_abonnement_push()`
--
--  Trois issues, et deux seulement sont des refus :
--    - `CARD_NOT_FOUND`      l'UUID ne désigne aucune carte (le même code qu'en
--                            `0018`, donc le même cas d'écran) ;
--    - `ABONNEMENT_INVALIDE` endpoint ou clés qui n'ont pas la forme d'un
--                            `PushSubscription` — on n'écrit pas une ligne que
--                            l'émetteur ne saurait pas utiliser ;
--    - `TROP_D_ABONNEMENTS`  le plafond de cinq, compté **hors** l'endpoint
--                            réabonné (sinon le cinquième se refuserait lui-même).
-- ---------------------------------------------------------------------------

create or replace function public.enregistrer_abonnement_push(
  p_card_id uuid,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_carte    uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh   text := btrim(coalesce(p_p256dh, ''));
  v_auth     text := btrim(coalesce(p_auth, ''));
  v_existait boolean;
  v_autres   integer;
begin
  if p_card_id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select c.id into v_carte from public.loyalty_cards c where c.id = p_card_id;
  if v_carte is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_endpoint !~ '^https://'
     or char_length(v_endpoint) not between 10 and 1024
     or v_p256dh !~ '^[A-Za-z0-9_-]+={0,2}$'
     or char_length(v_p256dh) not between 16 and 200
     or v_auth !~ '^[A-Za-z0-9_-]+={0,2}$'
     or char_length(v_auth) not between 8 and 100
  then
    raise exception 'ABONNEMENT_INVALIDE' using errcode = 'P0001';
  end if;

  select exists(
           select 1 from public.push_abonnements a where a.endpoint = v_endpoint
         )
    into v_existait;

  -- Le plafond compte les **autres** abonnements de la carte : réabonner le
  -- même navigateur ne consomme pas un sixième emplacement.
  select count(*)
    into v_autres
    from public.push_abonnements a
   where a.card_id = v_carte
     and a.endpoint <> v_endpoint;

  if v_autres >= 5 then
    raise exception 'TROP_D_ABONNEMENTS' using errcode = 'P0001';
  end if;

  insert into public.push_abonnements (card_id, endpoint, p256dh, auth)
  values (v_carte, v_endpoint, v_p256dh, v_auth)
  on conflict (endpoint) do update
     set card_id = excluded.card_id,
         p256dh   = excluded.p256dh,
         auth     = excluded.auth,
         vu_le    = now();

  return json_build_object(
    'ok',      true,
    'card_id', v_carte,
    'cree',    not v_existait
  );
end;
$fonction$;

comment on function public.enregistrer_abonnement_push(uuid, text, text, text) is
  'Enregistre (ou met à jour) l''abonnement web push d''un navigateur pour une carte. Cinq abonnements au plus par carte. Aucun envoi.';


-- ---------------------------------------------------------------------------
--  3. Les droits
--
--  `anon` **doit** pouvoir écrire : la page carte est publique, et c'est le
--  navigateur du client qui s'abonne. La contrepartie est le plafond ci-dessus,
--  plus le fait qu'il faut connaître l'UUID de la carte. `select` reste fermé :
--  personne ne lit la table par l'API REST, seule la fonction y touche.
-- ---------------------------------------------------------------------------

revoke execute on function public.enregistrer_abonnement_push(uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.enregistrer_abonnement_push(uuid, text, text, text)
  to anon, authenticated, service_role;


commit;
