-- ============================================================================
--  0018 — LA CARTE PUBLIQUE (P0-2b, seconde moitié)
--
--  Source : `01_REA_Fidelix/_captures/2026-10-27-a3/mesure-a3.json`. Deux
--  lectures anonymes, sans cookie :
--
--      GET /card/<uuid_carte>   200   56 043 o   « Carte fidélité — <commerce> »
--      GET /card/test           404   « Page introuvable »
--      GET /card/<uuid nul>     404   le même 404
--
--  Donc la page est **publique**, et sa clé est l'**UUID de la carte** — pas le
--  code `C-XXXXXX`. C'est ce qui lève l'objection écrite dans `/join` (« un
--  second oracle de soldes ») : un code de six caractères s'énumère, un UUID ne
--  s'énumère pas. Le code reste l'identifiant de **scan**, pas d'URL.
--
--  Ce que la fonction rend, et rien de plus : de quoi dessiner la carte. Pas de
--  nom de famille, pas d'email, pas de `wallet_object_id`, pas de personnel —
--  mêmes exclusions que `carte_pour_wallet()` (`0014`), pour la même raison :
--  cette page se lit par-dessus une épaule, dans un café.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. La lecture — `carte_publique(p_card_id uuid)`
--
--  L'entrée est un `uuid` : une chaîne qui n'en est pas une est refusée par
--  PostgreSQL (`22P02`) avant d'entrer ici, donc l'écran valide la forme
--  d'abord (`lib/carte-publique.mjs`).
--
--  `CARD_NOT_FOUND` — le même code que `carte_par_token` (`0003`) et
--  `award_loyalty_points` (mesuré) : l'écran n'a qu'un cas à connaître, et la
--  page rend le **même 404** qu'une URL mal orthographiée. Un UUID inconnu ne
--  doit pas se distinguer d'un UUID disparu.
-- ---------------------------------------------------------------------------

create or replace function public.carte_publique(p_card_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_carte     record;
  v_prenom    text;
  v_programme record;
  v_paliers   json;
begin
  -- `null` n'est pas « aucune carte » : c'est une entrée qui n'aurait pas dû
  -- arriver. Elle sort par le même refus, plutôt que par un `record` vide.
  if p_card_id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  select c.id, c.card_token, c.current_points, c.client_id, c.created_at
    into v_carte
    from public.loyalty_cards c
   where c.id = p_card_id;

  if v_carte.id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Prénom seul. `clients.last_name` existe et n'est **pas** lu : la carte
  -- s'affiche sur un écran public, et un nom de famille n'y sert à rien.
  select nullif(btrim(coalesce(cl.first_name, '')), '') into v_prenom
    from public.clients cl
   where cl.id = v_carte.client_id;

  select p.name, p.points_threshold
    into v_programme
    from public.loyalty_programs p
   where p.active
   order by p.created_at
   limit 1;

  if v_programme.name is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(json_agg(json_build_object(
           'rang',    t.rank,
           'libelle', t.label,
           'cout',    t.points_cost
         ) order by t.rank), '[]'::json)
    into v_paliers
    from public.reward_tiers t
    join public.loyalty_programs p on p.id = t.program_id
   where p.active;

  return json_build_object(
    'card_id',    v_carte.id,
    'card_token', v_carte.card_token,
    'points',     v_carte.current_points,
    'prenom',     coalesce(v_prenom, ''),
    'depuis',     v_carte.created_at,
    'programme', json_build_object(
      'nom',   v_programme.name,
      'seuil', v_programme.points_threshold
    ),
    'paliers', v_paliers
  );
end;
$fonction$;

comment on function public.carte_publique(uuid) is
  'Lecture publique d''une carte par son UUID (page /card/<id>). Token, points, prénom, date d''inscription, nom du programme et paliers. Ni nom de famille, ni email, ni wallet_object_id.';


-- ---------------------------------------------------------------------------
--  2. Les droits — c'est ici que tout se joue
--
--  `create or replace function` **rétablit les privilèges par défaut** du
--  schéma : `PUBLIC` détient `EXECUTE` avant même le `grant`. On révoque donc
--  les trois rôles nommés d'abord, puis on rend à qui sert — l'ordre inverse
--  laisserait la fonction ouverte une fraction de transaction, et surtout
--  laisserait `PUBLIC` dehors par accident plutôt que par décision.
--
--  `anon` est **accordé**, et c'est le point de la migration : la page n'a pas
--  de session (le client final n'a pas de compte). Ce que `anon` obtient est
--  borné par la fonction : une seule carte, celle dont il connaît l'UUID.
-- ---------------------------------------------------------------------------

revoke execute on function public.carte_publique(uuid)
  from public, anon, authenticated;

grant execute on function public.carte_publique(uuid)
  to anon, authenticated, service_role;


commit;
