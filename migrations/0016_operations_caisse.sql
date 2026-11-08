-- ============================================================================
--  0016 — OPÉRATIONS DE CAISSE IDEMPOTENTES (file hors ligne, R3)
--
--  Le problème, tel qu'il a été mesuré. La caisse hors ligne rejoue ses
--  opérations quand le réseau revient (`docs` A4 : `file_attente`, FIFO par
--  `cree_le`, rejeu toutes les 65 000 ms). Un rejeu peut arriver **deux fois** :
--  la réponse du premier envoi s'est perdue, pas l'écriture. `award_loyalty_points`
--  ne connaît pas de clé d'idempotence — le même scan crédité deux fois donne
--  deux fois les points, et rien à l'écran ne le montre.
--
--  D'où une table de clés et UNE fonction qui décide : si l'identifiant a déjà
--  produit une transaction, elle rend **le résultat d'alors** sans réécrire.
--  La cible fait la même chose (`client_operation_id` = identifiant d'élément de
--  file, généré à l'enfilage) ; son schéma, lui, n'est pas lisible.
--
--  CE QUI N'EST PAS ICI, ET POURQUOI
--  ---------------------------------
--  - l'**échange** de récompense n'est pas idempotent : il soustrait des points
--    sur un solde que le rejeu ne connaît pas. Il reste refusé hors ligne
--    (décision, pas oubli) et n'entre donc pas dans cette table.
--  - aucune colonne de `commerce_id` : le socle est **mono-commerce**, comme
--    `0004` et `0007` le déclarent déjà (`authenticated` = « un compte du
--    commerce »).
--
--  STATUT : NON EXÉCUTÉE. Tant qu'elle ne l'est pas, `POST /api/caisse/operation`
--  répond `PGRST202` → `503` et l'écran met l'opération **en attente** au lieu de
--  la perdre (l'état 503 est « conservée + tentatives », cf. `lib/file-caisse.mjs`).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. La table des clés — écrite, jamais lue directement
--
--  RLS activée **sans aucune politique** : c'est la même doctrine que
--  `clients`/`loyalty_cards` (`0003`). Seule la fonction `SECURITY DEFINER`
--  ci-dessous la voit, et `authenticated` n'y a aucun droit de table. Un
--  `GRANT SELECT` aurait ouvert l'historique des scans d'un commerce à tout
--  porteur de la clé anon — exactement l'oracle que `0003` refuse pour
--  `carte_par_token`.
-- ---------------------------------------------------------------------------

create table if not exists public.operations_caisse (
  operation_id   uuid primary key,
  card_token     varchar(64)  not null,
  card_id        uuid,
  montant        numeric(10,2) not null check (montant >= 0),
  points         integer      not null check (points >= 0),
  transaction_id uuid,
  solde          integer,
  cree_le        timestamptz  not null default now()
);

alter table public.operations_caisse enable row level security;

revoke all on public.operations_caisse from public, anon, authenticated;

-- ---------------------------------------------------------------------------
--  2. L'écriture idempotente
--
--  Le verrou consultatif est ce qui rend la fonction correcte sous concurrence :
--  deux rejeux simultanés du **même** identifiant se sérialisent, donc le second
--  lit la ligne du premier au lieu de la créer. Sans lui, les deux lisent
--  « pas encore fait » et `award_loyalty_points` crédite deux fois — le défaut
--  qu'on vient corriger, déplacé d'un cran.
--
--  Le corps réutilise `award_loyalty_points` (signature à 4 arguments, mesurée) :
--  la règle de crédit reste à **un** endroit, et cette fonction n'ajoute que la
--  mémoire des identifiants.
-- ---------------------------------------------------------------------------

create or replace function public.enregistrer_operation_caisse(
  p_operation_id  uuid,
  p_card_token    varchar,
  p_amount_spent  numeric,
  p_points_to_add integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_ligne    public.operations_caisse%rowtype;
  v_resultat jsonb;
begin
  if p_operation_id is null then
    raise exception 'OPERATION_ID_MANQUANT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select * into v_ligne
  from public.operations_caisse
  where operation_id = p_operation_id;

  if found then
    return jsonb_build_object(
      'idempotent', true,
      'transaction_id', v_ligne.transaction_id,
      'card_id', v_ligne.card_id,
      'points_added', v_ligne.points,
      'new_balance', v_ligne.solde
    );
  end if;

  v_resultat := public.award_loyalty_points(
    p_card_token, p_amount_spent, p_points_to_add, null
  );

  insert into public.operations_caisse(
    operation_id, card_token, card_id, montant, points, transaction_id, solde
  ) values (
    p_operation_id,
    p_card_token,
    (v_resultat->>'card_id')::uuid,
    p_amount_spent,
    p_points_to_add,
    (v_resultat->>'transaction_id')::uuid,
    (v_resultat->>'new_balance')::int
  );

  return v_resultat || jsonb_build_object('idempotent', false);
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  3. Les droits — `authenticated` seulement
--
--  `anon` **n'obtient rien** : la caisse est un écran authentifié, et une clé
--  anonyme qui peut créditer des points est un distributeur ouvert. Le
--  `REVOKE … FROM PUBLIC` vient d'abord : `create function` hérite des
--  privilèges de `PUBLIC`, donc un `GRANT` seul ne fermerait rien.
-- ---------------------------------------------------------------------------

revoke execute on function public.enregistrer_operation_caisse(
  uuid, varchar, numeric, integer
) from public, anon, authenticated;

grant execute on function public.enregistrer_operation_caisse(
  uuid, varchar, numeric, integer
) to authenticated, service_role;

commit;
