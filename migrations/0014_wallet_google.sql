-- ============================================================================
--  0014 — LA CARTE DANS GOOGLE WALLET (P0-5, voie Google d'abord)
--
--  Pourquoi Google avant Apple : le code-barres d'un objet Google Wallet est
--  **écrit par nous** (`barcode.value`), donc il porte `card_token` tel quel et
--  `/scan` n'a rien à changer. Chez PassKit/Apple, cette valeur n'est pas
--  observable sans compte payant — c'était U1, la seule inconnue bloquante.
--
--  Contrat mesuré dans la documentation Google (`reference/rest/v1/loyaltyobject`
--  et `loyalty-cards/use-cases/jwt`) :
--    - l'objet est identifié `{issuerId}.{suffixe}` ;
--    - le lien d'enregistrement est `https://pay.google.com/gp/v/save/<JWT>` ;
--    - un JWT porte **exactement un objet** (`INVALID_NUM_OBJECTS`) ;
--    - les points sont `points.label` + `points.balance.string`.
--
--  Ce que cette migration ne fait pas : aucun appel réseau, aucune clé. Elle
--  ajoute **l'alias de lecture** dont le socle a besoin pour retrouver une carte
--  qu'un client a enregistrée, et rien de plus.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. L'identifiant de l'objet chez Google
--
--  `null` = le client n'a jamais enregistré sa carte. C'est un **fait**, et il
--  est distinct de « on ne sait pas » : la colonne n'est écrite que par
--  `lier_wallet()`, après un enregistrement réel.
-- ---------------------------------------------------------------------------

alter table public.loyalty_cards
  add column if not exists wallet_object_id varchar(120);

-- Deux cartes ne peuvent pas revendiquer le même objet Google : sinon la
-- seconde écraserait la première dans le Wallet du client, silencieusement.
create unique index if not exists loyalty_cards_wallet_object_id_unique
  on public.loyalty_cards (wallet_object_id)
  where wallet_object_id is not null;

comment on column public.loyalty_cards.wallet_object_id is
  'Identifiant de l''objet Google Wallet ({issuerId}.{suffixe}). NULL = carte jamais enregistrée dans un Wallet.';


-- ---------------------------------------------------------------------------
--  2. La lecture — ce qu'un pass a besoin de savoir, et rien d'autre
--
--  Volontairement plus étroit que `carte_par_token()` (`0003`) : ni nom de
--  famille, ni email, ni paliers. Un pass est un objet **public** dans le
--  téléphone ; tout ce qu'on y met doit pouvoir être lu par-dessus une épaule.
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

  select p.name, p.kind, p.points_threshold
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
      'nom',    v_programme.name,
      'kind',   v_programme.kind,
      'seuil',  v_programme.points_threshold
    )
  );
end;
$fonction$;

comment on function public.carte_pour_wallet(varchar) is
  'Données minimales d''un pass Google Wallet (token, points, prénom, programme). Ni nom de famille, ni email, ni paliers.';


-- ---------------------------------------------------------------------------
--  3. L'écriture — `lier_wallet()`
--
--  Appelée **après** que Google a accepté l'objet, jamais avant : la colonne
--  dit « ce client a un pass enregistré », pas « on a essayé ». Un id faux y
--  resterait pour toujours et empêcherait une réécriture (index unique).
-- ---------------------------------------------------------------------------

create or replace function public.lier_wallet(p_token varchar, p_object_id varchar)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_id    text := btrim(coalesce(p_object_id, ''));
  v_carte uuid;
begin
  -- Forme mesurée : `{issuerId}.{suffixe}`, deux parties non vides, caractères
  -- autorisés par Google ([A-Za-z0-9._-]). Vérifié ici aussi : une route n'est
  -- pas le seul appelant possible.
  if v_id !~ '^[A-Za-z0-9_-]{1,60}\.[A-Za-z0-9._-]{1,58}$' then
    raise exception 'OBJECT_ID_INVALIDE' using errcode = 'P0001';
  end if;

  update public.loyalty_cards
     set wallet_object_id = v_id
   where card_token = upper(trim(coalesce(p_token, '')))
  returning id into v_carte;

  if v_carte is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  return json_build_object('ok', true, 'card_id', v_carte, 'wallet_object_id', v_id);
end;
$fonction$;

comment on function public.lier_wallet(varchar, varchar) is
  'Enregistre l''identifiant d''objet Google Wallet d''une carte. Refus : OBJECT_ID_INVALIDE, CARD_NOT_FOUND.';


-- ---------------------------------------------------------------------------
--  4. Les droits
--
--  `anon` reste dehors, comme partout depuis `0003` : la route `/api/wallet/...`
--  tourne côté serveur et appelle avec `service_role`. Ouvrir `anon` donnerait
--  un oracle d'énumération de jetons — exactement ce que `0003` a refusé.
-- ---------------------------------------------------------------------------

revoke execute on function public.carte_pour_wallet(varchar) from public, anon, authenticated;
revoke execute on function public.lier_wallet(varchar, varchar) from public, anon, authenticated;

grant execute on function public.carte_pour_wallet(varchar) to authenticated, service_role;
grant execute on function public.lier_wallet(varchar, varchar) to authenticated, service_role;


commit;
