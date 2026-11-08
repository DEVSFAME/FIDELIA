-- ============================================================================
--  0004 — LA PREMIÈRE RPC DE LECTURE : `cartes_du_commerce()`
--
--  Ce que cette migration ajoute, et rien de plus :
--    1. une fonction de **lecture** pour l'écran Clients ;
--    2. le `search_path` figé sur les deux fonctions `SECURITY DEFINER` déjà
--       présentes, qui n'en avaient pas.
--
--  Aucune table n'est ouverte : ni `GRANT` de table, ni politique RLS. Les cinq
--  tables restent sous RLS avec zéro politique, et tout passe par des fonctions.
--
--  ---------------------------------------------------------------------------
--  POURQUOI CETTE PROJECTION, ET PAS UNE AUTRE
--  ---------------------------------------------------------------------------
--  Elle est **mesurée**, pas inventée. La cible a une capture authentifiée de
--  `/customers` :
--      _captures/2026-10-27-auth-s3/raw/pages/a17-customers.html
--  dont le texte rendu porte, dans cet ordre :
--
--      « Mes clients »                                   (titre de page)
--      « 1 client inscrit »                              (compteur)
--      « Liste des membres »                             (titre de section)
--      « Code client | Points / Tampons | Récompenses | Inscrit le »
--      une ligne : « C-CR7QZX | 8 pts | 0 | 26 oct. 2026 »
--
--  La fonction rend donc exactement ces quatre colonnes, plus les deux champs
--  d'identité que la cible affiche en initiales (« CR »). **Pas d'email** :
--  la cible ne l'affiche pas dans cette liste, et une colonne rendue est une
--  colonne exposée.
--
--  « Récompenses » est un **comptage**, pas un stock : `redeem_loyalty_reward`
--  écrit `reward_label` sur la transaction d'échange (mesuré :
--  `pg_get_functiondef('redeem_loyalty_reward')`), et `award_loyalty_points` le
--  laisse nul. Compter `reward_label is not null` rend donc le nombre d'échanges
--  réellement remis, et non les points dépensés.
--
--  ---------------------------------------------------------------------------
--  POURQUOI `authenticated` ET JAMAIS `anon`
--  ---------------------------------------------------------------------------
--  `anon` peut déjà `join_loyalty_program` (page publique) et
--  `programme_public` (vitrine). Une **liste** de tous les jetons n'est pas la
--  même chose qu'une lecture unitaire par jeton : c'est un annuaire complet,
--  donc un oracle d'énumération. `carte_par_token` est déjà réservée à
--  `authenticated` pour cette raison ; la liste ne peut pas être plus ouverte
--  que l'unité.
--
--  Limite assumée, nommée ici pour ne pas être découverte plus tard : ce socle
--  est **mono-commerce** et n'a aucune colonne d'appartenance vers `auth.users`
--  (mesuré : `loyalty_cards.client_id -> clients.id`, pas `auth.uid()`, cf.
--  `0001` §3). `authenticated` y vaut donc « un compte du commerce », ce qui est
--  vrai tant que l'inscription est fermée en pratique. La cible, elle, filtre par
--  `restaurants.user_id` (RLS : session = 1 ligne, anon = 0 ligne) ; ouvrir cette
--  voie demande de reconstruire `restaurants`, ce qui n'est pas cette tâche.
--
--  ---------------------------------------------------------------------------
--  LE PIÈGE DÉJÀ PAYÉ DEUX FOIS (cf. `0003`, en-tête)
--  ---------------------------------------------------------------------------
--  `REVOKE … FROM PUBLIC` seul est un **no-op** : `create function` hérite des
--  privilèges par défaut du schéma, et Supabase accorde `EXECUTE` à `anon`,
--  `authenticated` et `service_role` — `proacl` ne contient alors pas `PUBLIC`.
--  On révoque donc **les trois rôles nommés** avant de rendre le droit à qui en
--  a besoin.
--
--  Ordre d'exécution : après `0001` et `0003` (les deux fonctions réécrites ici
--  doivent exister ; `alter function` échoue si la signature est fausse).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. `search_path` figé sur les deux fonctions `SECURITY DEFINER` existantes
--
--  Mesuré : `pg_get_functiondef` rend `SECURITY DEFINER` **sans** `SET
--  search_path` pour `award_loyalty_points` et `redeem_loyalty_reward`. Une
--  fonction `SECURITY DEFINER` sans chemin figé s'exécute avec le chemin de
--  l'appelant : un schéma homonyme placé avant `public` détourne la résolution
--  des noms, et la fonction écrit alors avec les droits de son propriétaire dans
--  les tables du tiers. C'est une escalade de privilèges, pas un détail.
--
--  `public` seul, comme dans `0003` : `pg_temp` est exclu, sinon un objet
--  temporaire homonyme prendrait le pas sur la table réelle. Les deux corps
--  qualifient déjà leurs tables (`public.loyalty_cards`, …), donc la définition
--  n'a pas à changer — seulement le chemin d'exécution.
-- ---------------------------------------------------------------------------

alter function public.award_loyalty_points(varchar, numeric, integer, uuid)
  set search_path = public;

alter function public.redeem_loyalty_reward(varchar, integer, varchar, uuid)
  set search_path = public;

-- ---------------------------------------------------------------------------
--  2. La lecture
--
--  Rend `{ total, limite, cartes }` :
--    - `total`  : le nombre **réel** de cartes, même quand la liste est bornée
--                 (l'écran peut dire « 200 sur 640 » au lieu de mentir par
--                 omission) ;
--    - `limite` : la borne appliquée, pour que l'appelant n'ait pas à la
--                 connaître en dur ;
--    - `cartes` : les 200 plus récentes, la plus récente d'abord.
--
--  L'ordre est **total** (`created_at desc`, puis `card_token`) : sans second
--  critère, deux cartes créées dans la même seconde changent de place d'un
--  appel à l'autre, et une liste qui bouge fait douter des données.
--
--  Une carte dont le client a été supprimé n'apparaît pas (`join` interne) :
--  afficher un jeton sans identité serait une ligne fantôme.
-- ---------------------------------------------------------------------------

create or replace function public.cartes_du_commerce()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_total  bigint;
  v_cartes json;
begin
  select count(*) into v_total from public.loyalty_cards;

  select coalesce(json_agg(json_build_object(
           'card_token',  s.card_token,
           'points',      s.current_points,
           'recompenses', s.recompenses,
           'inscrit_le',  s.created_at,
           'prenom',      s.prenom,
           'nom',         s.nom
         ) order by s.created_at desc nulls last, s.card_token), '[]'::json)
    into v_cartes
    from (
      select c.card_token,
             c.current_points,
             c.created_at,
             coalesce(cl.first_name, '') as prenom,
             coalesce(cl.last_name,  '') as nom,
             coalesce(r.recompenses, 0)  as recompenses
        from public.loyalty_cards c
        join public.clients cl on cl.id = c.client_id
        left join (
          select t.card_id, count(*)::integer as recompenses
            from public.loyalty_transactions t
           where t.reward_label is not null
           group by t.card_id
        ) r on r.card_id = c.id
       order by c.created_at desc nulls last, c.card_token
       limit 200
    ) s;

  return json_build_object(
    'total',  v_total,
    'limite', 200,
    'cartes', v_cartes
  );
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  3. Les droits — révoquer les trois rôles nommés, puis rendre à qui sert
-- ---------------------------------------------------------------------------

revoke execute on function public.cartes_du_commerce() from public, anon, authenticated;
grant  execute on function public.cartes_du_commerce() to authenticated, service_role;

commit;
