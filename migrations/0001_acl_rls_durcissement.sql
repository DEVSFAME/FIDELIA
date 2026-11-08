-- ============================================================================
--  0001 — Durcissement des canaux d'accès : EXECUTE des RPC + RLS des tables
--  Fidelix — reconstruction isofonctionnelle
--
--  STATUT : NON EXÉCUTÉE. DDL en attente de relecture humaine.
--  CIBLE   : la base de reconstruction sondée en R0
--            (`01_REA_Fidelix/_captures/2026-10-28-r0/sonde-base.json`,
--            projet `sevqegfhmdezsqwvwsam`).
--
--  ---------------------------------------------------------------------------
--  FICHIER FUSIONNÉ LE 2026-10-31 — `0002_r2_execute_rpc.sql` n'existe plus
--  ---------------------------------------------------------------------------
--  Deux migrations portaient sur le même objet, et se contredisaient :
--
--    0001 (R1.2) : REVOKE EXECUTE de PUBLIC, anon, authenticated,
--                  puis GRANT à `service_role` SEUL.
--    0002 (R2)   : les mêmes REVOKE, puis GRANT à anon, authenticated **et**
--                  service_role — parce que la sonde du 2026-10-31 a mesuré que
--                  `anon` exerce DÉJÀ les deux RPC : HTTP 400 `P0001`
--                  (`CARD_NOT_FOUND` / `INVALID_COST`), et non `42501
--                  permission denied for function`.
--
--  Conséquences, toutes deux mesurées ou déduites de la mesure :
--
--    0001 puis 0002 -> état voulu (anon + authenticated + service_role) ;
--    0002 puis 0001 -> anon et authenticated PERDENT EXECUTE, l'application
--                      cesse d'écrire, et aucun test ne le voit : le socle n'a
--                      pas encore de session pour exercer le chemin.
--
--  Deux fichiers dont le second annule le premier ne sont pas deux migrations :
--  c'est un piège d'ordre. Ils sont donc fusionnés ici, dans l'ordre qui compte
--  (REVOKE d'abord, GRANT par rôle ensuite). Le fichier `0002` est supprimé du
--  dépôt : il ne reste qu'une source de vérité, donc plus d'ordre à respecter
--  entre deux fichiers. Après cette migration — une fois ou dix fois — l'état
--  est le même :
--
--      award_loyalty_points   : anon, authenticated, service_role
--      redeem_loyalty_reward  : anon, authenticated, service_role
--      PUBLIC                 : rien
--
--  Idempotence : `REVOKE` et `GRANT` sont absolus, pas incrémentaux. Rejouer le
--  fichier ne peut donc rien retirer — c'est exactement ce qui manquait à la
--  version d'origine, où rejouer `0001` après `0002` cassait l'écriture.
--
--  ---------------------------------------------------------------------------
--  PÉRIMÈTRE — ce que la mesure a établi, et rien de plus
--  ---------------------------------------------------------------------------
--  La base contient EXACTEMENT 3 tables et 2 fonctions (OpenAPI, service_role) :
--
--    tables   : clients, loyalty_cards, loyalty_transactions
--    fonctions: award_loyalty_points(varchar, numeric, integer, uuid)
--               redeem_loyalty_reward(varchar, integer, varchar, uuid)
--
--  L'ORDRE des types est celui de `pg_get_function_identity_arguments`, pas
--  celui de l'OpenAPI (qui trie les paramètres par nom) : `award` reçoit
--  `p_card_token` d'abord. Écrit `(numeric, varchar, …)`, ce fichier échouait
--  au premier `REVOKE` — « function does not exist » — et le test ne le voyait
--  pas, parce qu'il portait la même constante fausse. Mesuré le 2026-10-31 :
--  `to_regprocedure('public.award_loyalty_points(numeric,varchar,integer,uuid)')`
--  → NULL.
--
--  Ces 3 tables sont `tablesEnPlus` vis-à-vis de MODELE_CIBLE : les 7 tables de
--  la cible (restaurants, loyalty_programs, reward_tiers, automations,
--  till_sessions, customers, transactions) N'EXISTENT PAS ici. Elles sont donc
--  hors de portée de cette migration — on ne durcit pas ce qui n'est pas créé.
--
--  ---------------------------------------------------------------------------
--  POURQUOI `FROM PUBLIC` ET NON `FROM anon`
--  ---------------------------------------------------------------------------
--  PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction, et
--  anon/authenticated HÉRITENT de PUBLIC. Un `REVOKE ... FROM anon` seul ne
--  retire donc rien : il agit sur un droit que anon ne détient pas en propre.
--  C'est un no-op qui se lit comme une protection. D'où, pour CHAQUE fonction :
--
--      REVOKE ... FROM PUBLIC          (le droit réel, celui qui agit)
--      REVOKE ... FROM anon            (au cas où un GRANT explicite existerait)
--      REVOKE ... FROM authenticated
--      GRANT  ... TO anon              (rendu au rôle MESURÉ)
--      GRANT  ... TO authenticated     (rendu au rôle DÉCLARÉ, cf. §1)
--      GRANT  ... TO service_role      (rendu au backend)
--
--  Le GRANT à `service_role` n'est pas décoratif : si service_role tenait son
--  droit de PUBLIC, le révoquer le lui retirerait. Même piège que ci-dessus, en
--  miroir. Et le GRANT à anon/authenticated est ce qui empêche cette migration
--  de casser le seul chemin d'écriture qui fonctionne aujourd'hui.

--  ---------------------------------------------------------------------------
--  POURQUOI `anon` ET `authenticated` GARDENT LE DROIT D'ÉCRIRE
--  ---------------------------------------------------------------------------
--  Le rôle MESURÉ est `anon` : c'est la clé publique du projet qui a émis la
--  sonde, et elle a atteint le corps des deux fonctions. Le retirer serait une
--  régression mesurée, pas un durcissement.
--
--  `authenticated` n'a PAS pu être mesuré : la base ne contient aucun compte
--  (`/auth/v1/admin/users` -> `users: []`, mesuré en R0), donc aucune session ne
--  peut exister. Il est pourtant le seul rôle que l'application utilisera, car
--  les Server Actions appellent la RPC avec le client lié à la requête
--  (`web/src/lib/supabase/server.mjs`, clé publique + cookie de session).
--  Le droit est donc DÉCLARÉ, et daté : il hérite de PUBLIC aujourd'hui, le
--  révoquer sans le re-accorder casserait le clone en silence.
--
--  Ce que cette migration NE DEVINE PAS : le mode (SECURITY DEFINER / INVOKER)
--  des deux fonctions. Il n'est pas mesurable depuis PostgREST — voir
--  « POURQUOI PAS FORCE », où cette ignorance est ce qui décide.
--
--  ---------------------------------------------------------------------------
--  POURQUOI AUCUNE POLITIQUE N'EST CRÉÉE
--  ---------------------------------------------------------------------------
--  Une politique RLS doit désigner une ligne par un prédicat. Il faudrait pour
--  cela une colonne d'appartenance vers `auth.users`. La mesure dit l'inverse :
--
--      clients             : id, first_name, last_name, email, created_at
--                            -> AUCUNE colonne d'authentification
--      loyalty_cards       : client_id -> clients.id  (pas auth.users)
--      loyalty_transactions: card_id -> loyalty_cards.id
--
--  Écrire `USING (client_id = auth.uid())` demanderait d'inventer une
--  correspondance clients -> auth.users que rien ne mesure. On préfère
--  RLS activée + zéro politique : refus par défaut, réversible par un GRANT
--  motivé, plutôt qu'une politique permissive inventée et impossible à
--  désinventer. Conséquence assumée : les 3 tables sont fermées aux rôles
--  non-bypass, y compris `authenticated`. Les écrans lisent par des fonctions
--  (`migrations/0003`) ou n'affichent rien — jamais par un GRANT de table.
--
--  ---------------------------------------------------------------------------
--  POURQUOI PAS `FORCE ROW LEVEL SECURITY`
--  ---------------------------------------------------------------------------
--  `FORCE` soumet aussi le PROPRIÉTAIRE de la table à la RLS. Or une fonction
--  SECURITY DEFINER s'exécute avec les droits de son propriétaire : si les 2
--  RPC sont SECURITY DEFINER et appartiennent au propriétaire des tables,
--  FORCE les ferait passer sous RLS et les casserait. Le mode definer/invoker
--  des 2 RPC n'est pas mesuré — on ne prend donc pas le risque.
--
--  ---------------------------------------------------------------------------
--  CE QUE CETTE MIGRATION NE PROUVE PAS (non_mesure)
--  ---------------------------------------------------------------------------
--  - L'état RLS actuel des 3 tables : tables vides => « 0 ligne » est
--    indiscernable de « RLS active et filtre tout ».
--  - Les politiques existantes éventuelles : `pg_policies` n'est pas exposé par
--    PostgREST.
--  - Le mode SECURITY DEFINER/INVOKER des 2 RPC, et leur propriétaire.
--  - Les droits d'écriture (INSERT/UPDATE/DELETE) réellement détenus : les
--    tester exigerait d'écrire.
--  - L'existence de `join_loyalty_program` : appelée depuis le bundle mais
--    ABSENTE de l'OpenAPI de la base => cible seulement. Voir §4 en fin de
--    fichier ; ne pas la révoquer ici, l'objet n'existe pas.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. RPC — retirer le droit hérité de PUBLIC, le rendre aux rôles qui servent
--
--  L'ordre importe DANS LE FICHIER : chaque REVOKE est suivi du GRANT, par
--  rôle, pour la même signature. Aucun rôle fermé ne peut donc terminer la
--  transaction sans son droit — c'est l'invariant que garde
--  `tools/rea/tests/durcissement.test.mjs` (« aucun rôle fermé ne perd EXECUTE
--  sans le retrouver dans le même fichier »).
-- ---------------------------------------------------------------------------

revoke execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) from public;
revoke execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) from anon;
revoke execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) from authenticated;

grant  execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) to anon;
grant  execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) to authenticated;
grant  execute on function public.award_loyalty_points(varchar, numeric, integer, uuid) to service_role;

revoke execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) from public;
revoke execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) from anon;
revoke execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) from authenticated;

grant  execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) to anon;
grant  execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) to authenticated;
grant  execute on function public.redeem_loyalty_reward(varchar, integer, varchar, uuid) to service_role;

-- Le `revoke` puis `grant` sur `anon` et `authenticated` n'est pas redondant :
-- il rend le droit **explicite**. Après cette migration, une lecture de
-- `pg_proc.proacl` montre qui peut exécuter, au lieu de laisser la réponse
-- dépendre d'un défaut du moteur.

-- ---------------------------------------------------------------------------
--  2. TABLES — retirer les droits de table hérités de PUBLIC
--
--  Mesuré en R0 : `anon` obtient 200 + [] sur les 3 tables. Le GRANT existe
--  donc (`verdict: "lisible"`). Les tables étant vides, la RLS seule suffirait
--  aujourd'hui — mais elle deviendrait le seul rempart, et un `DISABLE`
--  accidentel exposerait `clients(first_name, last_name, email)`. On retire
--  donc aussi le GRANT, pour que la fermeture ne dépende pas d'un seul
--  interrupteur.
--
--  `service_role` est re-granté explicitement pour la même raison qu'au §1 :
--  son droit mesuré pouvait venir de PUBLIC.
--
--  Aucun GRANT de table n'est rendu à `anon` ni à `authenticated` : la lecture
--  passe par les fonctions de `0003` (`programme_public`, `carte_par_token`,
--  `programme_du_commerce`), jamais par la table. C'est ce qui permet de ne pas
--  écrire de politique RLS sans preuve.
-- ---------------------------------------------------------------------------

revoke all on table public.clients from public;
revoke all on table public.clients from anon;
revoke all on table public.clients from authenticated;
grant select, insert, update, delete on table public.clients to service_role;

revoke all on table public.loyalty_cards from public;
revoke all on table public.loyalty_cards from anon;
revoke all on table public.loyalty_cards from authenticated;
grant select, insert, update, delete on table public.loyalty_cards to service_role;

revoke all on table public.loyalty_transactions from public;
revoke all on table public.loyalty_transactions from anon;
revoke all on table public.loyalty_transactions from authenticated;
grant select, insert, update, delete on table public.loyalty_transactions to service_role;

-- ---------------------------------------------------------------------------
--  3. RLS — activer, sans FORCE, sans politique permissive
-- ---------------------------------------------------------------------------

alter table public.clients                enable row level security;
alter table public.loyalty_cards          enable row level security;
alter table public.loyalty_transactions   enable row level security;

--  ---------------------------------------------------------------------------
--  3 bis. Les politiques qui étaient DÉJÀ là — mesurées, puis retirées
--
--  Ce fichier affirmait « RLS activée + zéro politique ». C'était faux, et il
--  l'admettait lui-même : « `pg_policies` n'est pas exposé », donc il ne
--  pouvait pas savoir. Depuis le 2026-10-31 `pg_policies` est lisible (MCP
--  Supabase), et il y a une politique PERMISSIVE `qual = true` ouverte au rôle
--  `public` sur chacune des trois tables :
--
--    clients              « Lecture publique des clients associés »       SELECT
--    loyalty_cards        « Lecture publique des cartes via token »       SELECT
--    loyalty_transactions « Lecture publique des transactions associées » SELECT
--
--  Avec les GRANT révoqués au §2, elles ne laissent rien passer AUJOURD'HUI —
--  c'est mesuré : `anon -> SELECT clients` rend `401 42501`. Mais `qual = true`
--  est une porte grande ouverte posée contre la serrure : le premier
--  `GRANT SELECT` motivé (un écran « mes clients », cf. ci-dessous) la
--  rouvrirait en silence, et la RLS ne protégerait plus de rien. On les retire
--  donc, pour que la phrase du fichier devienne vraie : refus par défaut.
--
--  `if exists` : la migration reste rejouable, et une base qui n'a jamais
--  porté ces politiques ne casse pas.
--  ---------------------------------------------------------------------------

drop policy if exists "Lecture publique des clients associés"       on public.clients;
drop policy if exists "Lecture publique des cartes via token"       on public.loyalty_cards;
drop policy if exists "Lecture publique des transactions associées" on public.loyalty_transactions;

-- Aucune politique RLS ici, volontairement. Le jour où un consommateur réel
-- apparaîtra (dashboard « Mes clients », R1+), la politique devra être ajoutée
-- AVEC sa preuve : colonne d'appartenance mesurée, rôle mesuré, prédicat
-- minimal. Tant que cette preuve manque, la table reste fermée.

commit;

-- ============================================================================
--  4. CONTRAINTES AVANT (forward constraints) — hors de cette migration
--
--  4.1 `join_loyalty_program`
--  -------------------------
--  Elle est appelée depuis le bundle client (site d'appel localisé à l'offset
--  13660, 11 paramètres `p_*`), mais elle N'EST PAS dans l'OpenAPI de la base :
--  elle n'existe pas encore côté serveur. `migrations/0003` la crée ; c'est elle
--  qui porte son REVOKE et ses GRANT, pas ce fichier.
--
--      revoke execute on function public.join_loyalty_program(<signature>) from public;
--      grant  execute on function public.join_loyalty_program(<signature>) to anon;  -- adhésion publique
--
--  La signature exacte et le rôle appelant ne sont pas mesurables tant que la
--  fonction n'existe pas. Ne pas l'inventer ici : un REVOKE sur un objet absent
--  fait échouer la transaction entière.
--
--  4.2 `carte_par_token` — jamais `anon`
--  -------------------------------------
--  La lecture d'une carte rend un solde. Accorder cette fonction à `anon` serait
--  un oracle de soldes énumérable (`C-` + 6 caractères). Elle reste réservée à
--  `authenticated` et `service_role`, dans `0003`. Le test
--  `migration-0003.test.mjs` refuse toute autre configuration.
--
--  4.3 Toute future RPC suit le même modèle
--  ----------------------------------------
--      - révoquer `EXECUTE` de PUBLIC (le droit réel), puis des rôles fermés ;
--      - accorder au rôle MESURÉ, et à `authenticated` s'il est seul à servir ;
--      - accorder à `service_role` (il pouvait tenir son droit de PUBLIC) ;
--      - ne pas ouvrir les tables : la lecture reste une fonction tant qu'aucune
--        colonne d'appartenance n'est mesurée.
-- ============================================================================

