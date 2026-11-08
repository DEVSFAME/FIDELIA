-- ============================================================================
--  0013 — LES MESSAGES AUX CLIENTS (P0-4) : la file, le quota, rien d'autre
--
--  Source : `docs/mesure-p0-4-messages-2026-11-02.md` §2. Contrat **mesuré** sur
--  `2026-11-02-a7b/rendu/d01-notifications.html` et sur le chunk de la page :
--  titre 3–50, message 10–150, lien optionnel, quota **3 par jour**.
--
--  Ce que cette migration NE fait PAS, et pourquoi :
--    - **aucun envoi.** Aucun canal sortant n'existe dans le socle : ni jeton
--      push, ni Wallet, ni dépendance d'email (`web/package.json`). Un message
--      naît donc `en_attente`, jamais `envoye` — la colonne accepte `envoye`
--      pour que le jour du canal il n'y ait pas de migration à écrire, mais
--      **rien ici ne l'écrit**.
--    - **aucune modération.** La cible modère côté serveur (refus `blocked` +
--      `reason`) ; sa fonction n'est pas observable. Inventer un filtre donnerait
--      un refus sans règle : on ne le fait pas, et l'écran ne le promet pas.
--
--  `joignables` est un **fait**, pas une promesse : le nombre de clients qui ont
--  une adresse email en base. C'est l'audience qu'un canal email atteindrait —
--  pas un nombre d'envois.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. La file
-- ---------------------------------------------------------------------------

create table if not exists public.messages_envoyes (
  id         uuid primary key default gen_random_uuid(),
  titre      varchar(50)  not null,
  corps      varchar(150) not null,
  lien       text,
  statut     varchar(12)  not null default 'en_attente',
  created_at timestamptz  not null default now(),

  -- Les bornes de la cible, tenues **en base** : un `maxlength` HTML se retire
  -- en trois clics, et l'écran n'est pas le seul appelant possible.
  constraint messages_envoyes_statut check (statut in ('en_attente', 'envoye')),
  constraint messages_envoyes_titre  check (char_length(btrim(titre)) between 3 and 50),
  constraint messages_envoyes_corps  check (char_length(btrim(corps)) between 10 and 150)
);

comment on table public.messages_envoyes is
  'Messages composés par le commerçant (P0-4). Aucun canal d''envoi n''existe : toute ligne naît « en_attente ».';
comment on column public.messages_envoyes.statut is
  'en_attente = en file, aucun canal configuré (seule valeur écrite) ; envoye = réservé au futur canal.';

-- RLS **sans politique**, comme `clients`/`loyalty_cards` : la table n'est
-- lisible que par les RPC `security definer` ci-dessous. Un `select` direct rend
-- `[]`, ce qui se lirait « aucun message » — d'où les droits retirés.
alter table public.messages_envoyes enable row level security;

revoke all on table public.messages_envoyes from public, anon, authenticated;


-- ---------------------------------------------------------------------------
--  2. La lecture — `messages_du_commerce()`
--
--  Une seule réponse, trois faits : ce qui est en file aujourd'hui, ce que le
--  quota autorise encore, et combien de clients une adresse email rendrait
--  joignables. Les seuils (3 / 20 lignes) vivent ici, pas dans l'écran : deux
--  copies d'une limite finissent par diverger.
--
--  Le jour est compté en **heure du Maroc** : un quota qui se réinitialise à
--  01:00 heure locale serait faux la moitié de l'année. Choix, pas mesure — la
--  cible ne dit pas son fuseau.
-- ---------------------------------------------------------------------------

create or replace function public.messages_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_limite      constant integer := 3;
  v_historique  constant integer := 20;
  v_aujourdhui  integer;
  v_joignables  integer;
  v_messages    json;
begin
  select count(*) into v_aujourdhui
    from public.messages_envoyes
   where (created_at at time zone 'Africa/Casablanca')::date
       = (now()       at time zone 'Africa/Casablanca')::date;

  select count(*) into v_joignables
    from public.clients
   where email is not null and btrim(email) <> '';

  select coalesce(json_agg(row_to_json(m)), '[]'::json) into v_messages
    from (
      select id, titre, corps, lien, statut, created_at
        from public.messages_envoyes
       order by created_at desc
       limit v_historique
    ) m;

  return json_build_object(
    'limite',     v_limite,
    'aujourdhui', v_aujourdhui,
    'joignables', v_joignables,
    'messages',   v_messages
  );
end;
$fonction$;

comment on function public.messages_du_commerce() is
  'File des messages : quota du jour (3, heure du Maroc), clients joignables par email, 20 derniers messages.';


-- ---------------------------------------------------------------------------
--  3. L'écriture — `enfiler_message()`
--
--  Chaque refus est **nommé**, dans l'ordre des champs du formulaire : l'écran
--  affiche l'erreur sous le champ concerné, et `CODES_CONNUS` la reconnaît. Le
--  quota est vérifié avant l'insertion, dans la même transaction : deux onglets
--  ouverts ne peuvent pas dépasser trois messages.
-- ---------------------------------------------------------------------------

create or replace function public.enfiler_message(
  p_titre varchar,
  p_corps varchar,
  p_lien  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_limite     constant integer := 3;
  v_titre      text := btrim(coalesce(p_titre, ''));
  v_corps      text := btrim(coalesce(p_corps, ''));
  v_lien       text := nullif(btrim(coalesce(p_lien, '')), '');
  v_aujourdhui integer;
  v_id         uuid;
begin
  if char_length(v_titre) < 3   then raise exception 'TITRE_TROP_COURT';   end if;
  if char_length(v_titre) > 50  then raise exception 'TITRE_TROP_LONG';    end if;
  if char_length(v_corps) < 10  then raise exception 'MESSAGE_TROP_COURT'; end if;
  if char_length(v_corps) > 150 then raise exception 'MESSAGE_TROP_LONG';  end if;

  -- Le lien : la cible valide une URL (`z.string().url()`) et l'affiche dans un
  -- bouton, donc http(s) exigé ; 500 caractères est une borne choisie pour
  -- qu'un texte collé par erreur ne passe pas, pas une contrainte de la cible.
  if v_lien is not null then
    if char_length(v_lien) > 500 or v_lien !~* '^https?://[^[:space:]]+$' then
      raise exception 'LIEN_INVALIDE';
    end if;
  end if;

  select count(*) into v_aujourdhui
    from public.messages_envoyes
   where (created_at at time zone 'Africa/Casablanca')::date
       = (now()       at time zone 'Africa/Casablanca')::date;

  if v_aujourdhui >= v_limite then raise exception 'QUOTA_ATTEINT'; end if;

  insert into public.messages_envoyes (titre, corps, lien)
  values (v_titre, v_corps, v_lien)
  returning id into v_id;

  return json_build_object(
    'ok',         true,
    'id',         v_id,
    'aujourdhui', v_aujourdhui + 1,
    'limite',     v_limite
  );
end;
$fonction$;

comment on function public.enfiler_message(varchar, varchar, text) is
  'Met un message en file (en_attente, aucun canal). Refus : TITRE_TROP_COURT/LONG, MESSAGE_TROP_COURT/LONG, LIEN_INVALIDE, QUOTA_ATTEINT.';


-- ---------------------------------------------------------------------------
--  4. Les droits — révoquer les trois rôles nommés, puis rendre à qui sert
--
--  Même piège que `0003`/`0004`/`0011`/`0012` : `revoke … from public` seul est
--  un no-op sur Supabase. `anon` est exclu : la file appartient au commerçant.
-- ---------------------------------------------------------------------------

revoke execute on function public.messages_du_commerce() from public, anon, authenticated;
revoke execute on function public.enfiler_message(varchar, varchar, text) from public, anon, authenticated;

grant execute on function public.messages_du_commerce() to authenticated, service_role;
grant execute on function public.enfiler_message(varchar, varchar, text) to authenticated, service_role;


commit;
