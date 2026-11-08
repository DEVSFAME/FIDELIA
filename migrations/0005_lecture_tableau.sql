-- ============================================================================
--  0005 — LA DEUXIÈME RPC DE LECTURE : `tableau_du_commerce()`
--
--  Ce que cette migration ajoute, et rien de plus : une fonction de **lecture**
--  pour l'écran d'accueil. Aucune table n'est ouverte — ni `GRANT` de table, ni
--  politique RLS. Les cinq tables restent sous RLS avec zéro politique, et tout
--  passe par des fonctions (même doctrine que `0003` et `0004`).
--
--  ---------------------------------------------------------------------------
--  POURQUOI CET ÉCRAN, ET PAS `/caisses` NI `/notifications`
--  ---------------------------------------------------------------------------
--  Les deux écrans annoncés ont été mesurés avant d'être écrits, et aucun des
--  deux ne peut porter de projection mesurée :
--
--    * `raw/pages/a20-notifications.html` (2026-10-27) ne contient **aucune**
--      chaîne propre à la page : ses dix chaînes sont celles du gabarit, et on
--      les retrouve à l'identique sur les captures 404. Le rendu n'existe pas
--      non plus. Il n'y a donc rien à mesurer, et composer une projection
--      reviendrait à l'inventer.
--    * `raw/pages/a09-caisses.html` est dans le même cas, mais le **DOM rendu**
--      `2026-10-26-auth/rendu/a09-caisses.html` porte bien l'écran Équipe
--      (`h1` « Équipe », `h3` « Classement de l'équipe », `th` « # | Caissier |
--      Cartes | Scans | points | CA | Avis »). Deux colonnes y sont calculées
--      depuis un modèle qui n'existe pas dans ce socle : « Cartes » compte les
--      clients qui ont **désigné** ce caissier, « Avis » les avis rattachés.
--      Mesuré : les tables sont `clients`, `loyalty_cards`,
--      `loyalty_transactions`, `loyalty_programs`, `reward_tiers` — aucune table
--      d'équipe, aucune colonne de désignation. Une RPC de **lecture** ne peut
--      pas combler une absence de modèle ; il faudrait d'abord une migration de
--      schéma, ce qui n'est pas cette tâche.
--
--  L'écran d'accueil, lui, est entièrement calculable sur les colonnes mesurées.
--
--  ---------------------------------------------------------------------------
--  POURQUOI CETTE PROJECTION, ET PAS UNE AUTRE
--  ---------------------------------------------------------------------------
--  Elle est **mesurée** sur la capture authentifiée de `/dashboard` :
--      _captures/2026-10-27-auth-s3/raw/pages/a01-dashboard.html
--  dont le texte rendu porte, dans cet ordre :
--
--      « Accueil »                                        (titre, h1)
--      « Clients | +1 ce mois »
--      « Visites | 30 derniers jours »
--      « Reviennent | au moins 2 visites »
--      « CA (€) | 30 j · total 40 »
--      « Transactions au total »  « Récompenses distribuées »
--      « Transactions récentes »                          (h3)
--      « Client | Type | Pts / Tampons | Montant | Date »  (colonnes)
--      « CR | C-CR7QZX | Points gagnés | +8 pts | 40 € | 26 oct. 15:31 »
--
--  Trois conséquences, chacune vérifiable dans le code ci-dessous :
--
--    1. **Les définitions sont celles des sous-titres**, pas les miennes.
--       « Reviennent » = cartes à **au moins 2 visites** (le sous-titre le dit),
--       « Visites » = 30 derniers jours, « Clients » = depuis ce mois pour le
--       sous-compteur. `fideles` et `cartes` sont donc rendus **séparément** :
--       le pourcentage est une division, il se calcule côté écran où il se
--       teste (`pourcentageRevient`), pas dans une requête qu'aucun test pur ne
--       peut rejouer.
--    2. **Aucun libellé n'est rendu par la fonction.** « Points gagnés » n'est
--       pas écrit ici : la fonction rend `recompense` (le libellé de la
--       récompense, ou `null`) et `points`, et l'écran choisit la copie. Une
--       chaîne dans le SQL serait une copie hors du dictionnaire, donc hors du
--       test de copie mesurée.
--    3. **La devise vient de la donnée, pas de la capture.** La cible affiche
--       « CA (€) » ; `loyalty_programs.devise` vaut `MAD` par défaut ici
--       (mesuré : `column_default`). Recopier « € » afficherait une unité
--       fausse sur un programme en dirhams. La fonction rend donc `devise`, et
--       l'écran écrit « CA (MAD) ». Écart **déclaré** dans
--       `docs/design-system.md` §3.
--
--  Ce qui est **volontairement absent**, et pourquoi (pour que l'absence soit
--  une décision et pas un oubli) :
--      - « Venus par parrainage » : aucune colonne de parrainage n'existe ;
--      - « Clients à relancer » : la ligne mesurée commence par un « 1 » dont le
--        rôle n'est pas établi (compteur ? points ?), et la section n'a jamais
--        été capturée avec un client relançable ;
-- ----------------------------------------------------------------------------
--  La lecture
-- ----------------------------------------------------------------------------

begin;

create or replace function public.tableau_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_devise    text;
  v_clients   integer;
  v_ce_mois   integer;
  v_visites   integer;
  v_cartes    integer;
  v_fideles   integer;
  v_ca_30j    numeric;
  v_ca_total  numeric;
  v_tx        integer;
  v_recomp    integer;
  v_recentes  json;
begin
  -- La devise du programme actif. `null` s'il n'y a pas de programme : l'écran
  -- affiche alors « CA » sans unité, plutôt qu'une unité inventée.
  select p.devise
    into v_devise
    from public.loyalty_programs p
   where p.active
   order by p.created_at desc nulls last, p.id
   limit 1;

  select count(*) into v_clients from public.clients;

  select count(*) into v_ce_mois
    from public.clients
   where created_at >= date_trunc('month', now());

  select count(*) into v_visites
    from public.loyalty_transactions
   where created_at >= now() - interval '30 days';

  select count(*) into v_cartes from public.loyalty_cards;

  -- « au moins 2 visites » : le sous-titre mesuré, appliqué tel quel.
  select count(*) into v_fideles
    from (
      select t.card_id
        from public.loyalty_transactions t
       group by t.card_id
      having count(*) >= 2
    ) f;

  select coalesce(sum(t.amount_spent), 0) into v_ca_30j
    from public.loyalty_transactions t
   where t.created_at >= now() - interval '30 days';

  select coalesce(sum(t.amount_spent), 0) into v_ca_total
    from public.loyalty_transactions t;

  select count(*) into v_tx from public.loyalty_transactions;

  -- « Récompenses distribuées » : même définition que la colonne « Récompenses »
  -- de `cartes_du_commerce` — `redeem_loyalty_reward` est la seule à écrire
  -- `reward_label` (mesuré par `pg_get_functiondef`).
  select count(*) into v_recomp
    from public.loyalty_transactions t
   where t.reward_label is not null;

  select coalesce(json_agg(json_build_object(
           'card_token',  s.card_token,
           'prenom',      s.prenom,
           'nom',         s.nom,
           'points',      s.points_awarded,
           'montant',     s.amount_spent,
           'recompense',  s.reward_label,
           'date',        s.created_at
         ) order by s.created_at desc nulls last, s.id), '[]'::json)
    into v_recentes
    from (
      select t.id,
             t.created_at,
             t.points_awarded,
             t.amount_spent,
             t.reward_label,
             c.card_token,
             coalesce(cl.first_name, '') as prenom,
             coalesce(cl.last_name,  '') as nom
        from public.loyalty_transactions t
        join public.loyalty_cards c on c.id = t.card_id
        join public.clients cl on cl.id = c.client_id
       order by t.created_at desc nulls last, t.id
       limit 10
    ) s;

  return json_build_object(
    'devise',       v_devise,
    'clients',      json_build_object('total', v_clients, 'ce_mois', v_ce_mois),
    'visites',      json_build_object('trente_jours', v_visites),
    'reviennent',   json_build_object('cartes', v_cartes, 'fideles', v_fideles),
    'ca',           json_build_object('trente_jours', v_ca_30j, 'total', v_ca_total),
    'transactions', json_build_object('total', v_tx, 'recompenses', v_recomp),
    'recentes',     v_recentes
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  Les droits — révoquer les trois rôles nommés, puis rendre à qui sert
--
--  Le piège déjà payé deux fois : `REVOKE … FROM PUBLIC` seul est un no-op,
--  parce que `create function` hérite des privilèges par défaut du schéma et
--  que Supabase accorde `EXECUTE` à `anon`, `authenticated` et `service_role`.
--
--  `anon` ne lit pas ce tableau : il agrège le chiffre d'affaires et le nombre
--  de clients. Ce n'est pas la même chose qu'une page publique de programme.
-- ---------------------------------------------------------------------------

revoke execute on function public.tableau_du_commerce() from public, anon, authenticated;
grant  execute on function public.tableau_du_commerce() to authenticated, service_role;

commit;

--      - le lien d'inscription `/join/<slug>` : il appartient à `/qrcode`, qui
--        le lit déjà par `programme_du_commerce` ; le dupliquer ici ferait deux
--        sources pour une même valeur.
--
--  ---------------------------------------------------------------------------
--  L'ORDRE EST TOTAL
--  ---------------------------------------------------------------------------
--  `created_at desc nulls last, id` : sans second critère, deux opérations
--  enregistrées dans la même seconde changent de place d'un appel à l'autre, et
--  une liste qui bouge fait douter des données (même règle que `0004`).
-- ----------------------------------------------------------------------------
