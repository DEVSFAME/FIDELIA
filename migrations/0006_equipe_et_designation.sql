-- ============================================================================
--  0006 — LE MODÈLE D'ÉQUIPE ET LA DÉSIGNATION
--
--  Ce que cette migration ajoute, et rien de plus : le **modèle** que l'écran
--  Équipe exige. Aucune fonction, aucun écran, aucune politique RLS, aucun
--  droit de table rendu à `anon` ni à `authenticated`.
--
--    1. la table `public.staff` — les caisses employé et les responsables ;
--    2. `public.clients.designated_staff_id` — le caissier que le client a
--       **désigné** à l'inscription ;
--    3. le rattachement de `public.loyalty_transactions.staff_id`, qui
--       flottait sans référence (mesuré : `uuid` nullable, **aucune** clé
--       étrangère dans `pg_constraint`).
--
--  ---------------------------------------------------------------------------
--  POURQUOI — la mesure, pas l'intuition
--  ---------------------------------------------------------------------------
--  La cible a un DOM rendu de `/caisses` :
--      _captures/2026-10-26-auth/rendu/a09-caisses.html
--  dont le texte porte, dans cet ordre :
--
--      « Équipe »                                     (h1)
--      « Caisses employé »  « Responsables »          (les deux portées)
--      « Un accès limité au scan pour chaque employé —
--        sans vos chiffres ni vos réglages. »         (ce qu'une caisse est)
--      « Nouvelle caisse »  « Prénom de l'employé »  « Créer »
--      « Classement de l'équipe »                     (h3)
--      « 7 jours »  « 30 jours »  « Depuis le début »  « Un jour précis »
--      « # | Caissier | Cartes | Scans | points | CA | Avis »   (les 7 th)
--      « Titulaire | Vous | 0 | 1 | 8 | 40 € | 0 »    (la seule ligne)
--      « Caisses actives »  « Aucune caisse pour l'instant. »
--
--  et la phrase qui **définit** la colonne « Cartes », mot pour mot :
--
--      « Les cartes comptent les clients qui ont désigné ce caissier sur la
--        page d'inscription. »
--
--  C'est une définition, pas un chiffre : « Cartes » compte des **clients**,
--  pas des cartes. Compter `loyalty_cards` serait un autre nombre sous le même
--  mot — la faute que `lesson-learned` §31.3 interdit. La colonne est donc
--  posée sur `clients`, le sujet de la phrase.
--
--  Mesuré avant d'écrire (projet `sevqegfhmdezsqwvwsam`, 2026-10-31) :
--      tables      : clients, loyalty_cards, loyalty_transactions,
--                    loyalty_programs, reward_tiers  — RLS active, 0 politique
--      lignes      : 0 dans chacune des cinq
--      staff       : `to_regclass('public.staff')` -> NULL
--      clients     : id, first_name, last_name, email, created_at
--                    -> AUCUNE colonne de désignation
--      transactions: id, card_id, amount_spent, points_awarded, staff_id,
--                    created_at, reward_label
--                    -> `staff_id uuid` NULLable, sans clé étrangère
--      droits      : `anon` et `authenticated` n'ont AUCUN privilège de table ;
--                    `service_role` a les sept sur les cinq tables
--
--  ---------------------------------------------------------------------------
--  CE QUE SIGNIFIE `staff_id IS NULL` — et pourquoi ce n'est pas un trou
--  ---------------------------------------------------------------------------
--  Sur la cible, la seule ligne du classement est « Titulaire | Vous ». Le
--  titulaire n'est pas une caisse employé : c'est le compte du commerce. Ici,
--  aucune table ne porte ce compte, et toutes les opérations mesurées ont
--  `staff_id` nul. **Nul veut donc dire « le titulaire »**, et c'est la seule
--  lecture compatible avec les deux mesures à la fois. Le futur classement
--  groupe par `staff_id`, et la ligne nulle est celle du titulaire — pas une
--  ligne « inconnue » à masquer.
--
--  Corollaire : `staff_id` reste NULLable. Le rendre obligatoire obligerait à
--  inventer une caisse pour chaque opération du titulaire.
--
--  ---------------------------------------------------------------------------
--  POURQUOI CES RÈGLES DE SUPPRESSION, ET PAS `CASCADE`
--  ---------------------------------------------------------------------------
--  `on delete cascade` est la valeur par défaut de la main pressée, et c'est
--  ici la faute la plus coûteuse : elle ne lève aucune erreur, elle **efface**.
--
--    * `loyalty_transactions.staff_id -> staff(id)` : **RESTRICT**.
--      Une transaction est une pièce comptable. Supprimer une caisse ne doit
--      pas retirer ses scans du chiffre d'affaires — le CA baisserait en
--      silence, sans qu'aucun écran ne signale la perte. On **désactive**
--      (`active = false`), on ne supprime pas.
--    * `clients.designated_staff_id -> staff(id)` : **SET NULL**.
--      La désignation est une préférence du client, pas une pièce comptable.
--      Supprimer une caisse ne doit pas supprimer le client : `cascade` sur
--      cette colonne effacerait des **clients** — donc leurs cartes, donc
--      leurs transactions. « Cartes » tomberait à zéro sans un mot.
--
--  ---------------------------------------------------------------------------
--  POURQUOI `role` N'A QUE DEUX VALEURS
--  ---------------------------------------------------------------------------
--  Les deux portées mesurées sont « Caisses employé » et « Responsables ».
--  Le vocabulaire est donc `caisse` | `responsable`, et rien d'autre : un
--  troisième rôle inventé (`owner`, `admin`) serait une valeur que l'écran ne
--  sait pas afficher, dans une colonne que l'écran filtre.
--
--  Le titulaire n'est **pas** un rôle de cette table (cf. `staff_id IS NULL`).
--
--  ---------------------------------------------------------------------------
--  CE QUE CETTE MIGRATION NE FAIT PAS — dettes nommées, pas oubliées
--  ---------------------------------------------------------------------------
--    * **Aucune RPC.** `equipe_du_commerce()` est la tâche suivante ; elle ne
--      peut pas précéder le modèle, et cette migration ne l'anticipe pas.
--    * **Aucun chemin d'écriture de la désignation.** `join_loyalty_program`
--      n'accepte pas encore de caissier ; tant qu'elle ne le fait pas, la
--      colonne reste nulle et « Cartes » vaut 0 pour tout le monde. C'est
--      exact, et c'est la prochaine migration, pas celle-ci.
--    * **Aucun modèle d'avis.** La colonne « Avis » du classement n'a pas de
--      table : elle reste une absence déclarée, pas un zéro inventé.
--    * **Aucun `program_id`.** Le socle est mono-commerce (même limite que
--      `0004`, §authenticated) : la cible filtre par `restaurants`, table qui
--      n'existe pas ici. Inventer une portée par programme serait inventer un
--      modèle, pas le mesurer.
--
--  ---------------------------------------------------------------------------
--  IDEMPOTENCE
--  ---------------------------------------------------------------------------
--  Chaque objet est créé sous garde : `if not exists` pour la table, la
--  colonne et l'index ; `pg_constraint` pour les deux clés étrangères, qu'on
--  ne peut pas nommer dans un `add column`. Rejouer le fichier ne retire rien
--  et ne lève rien — c'est la leçon de la fusion `0001`/`0002`.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  1. L'équipe — une ligne par caisse employé ou responsable
-- ---------------------------------------------------------------------------

create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  first_name varchar(80) not null,
  role       varchar(16) not null default 'caisse',
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  constraint staff_role_check check (role in ('caisse', 'responsable')),
  constraint staff_first_name_check check (length(btrim(first_name)) between 1 and 80)
);

-- ---------------------------------------------------------------------------
--  2. L'équipe n'est pas une table lisible — même doctrine que `0003`
--
--  RLS **activée**, **zéro politique** : refus par défaut. `anon` et
--  `authenticated` n'obtiennent aucun privilège de table ; une liste
--  nominative d'employés est une donnée personnelle, elle ne s'ouvre pas par
--  héritage de schéma. Les privilèges restent à `service_role`, comme sur les
--  cinq tables mesurées (relevé : `role_table_grants`).
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;

revoke all on table public.staff from public, anon, authenticated;
grant  select, insert, update, delete on table public.staff to service_role;

-- ---------------------------------------------------------------------------
--  3. La désignation — le caissier choisi par le client à l'inscription
--
--  NULLable, et ce n'est pas un détail : `join_loyalty_program` écrit un client
--  **anonyme** sans désignation (mesuré : ni nom, ni email exigés). Une colonne
--  `not null` casserait l'inscription au moment précis où le client découvre le
--  produit — et l'écran `/join/<slug>` n'offre pas encore de choix.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists designated_staff_id uuid;

do $garde$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'clients_designated_staff_id_fkey'
       and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_designated_staff_id_fkey
      foreign key (designated_staff_id) references public.staff(id)
      on delete set null;
  end if;
end;
$garde$;

-- Le classement compte les clients par caissier désigné : sans cet index, la
-- jointure relit `clients` en entier à chaque affichage. L'index sert aussi la
-- vérification de la clé étrangère lors d'une suppression de caisse.
create index if not exists clients_designated_staff_id_idx
  on public.clients (designated_staff_id);

-- ---------------------------------------------------------------------------
--  4. Le rattachement de l'audit — `staff_id` cesse de flotter
--
--  Mesuré avant cette migration : `loyalty_transactions.staff_id` est un `uuid`
--  sans aucune référence. Il pouvait donc désigner une caisse qui n'existe
--  pas, et le classement aurait affiché une ligne fantôme. `RESTRICT` : une
--  caisse qui a des opérations ne se supprime pas (cf. en-tête).
--
--  La validation porte sur les lignes existantes : elles sont toutes nulles
--  (mesuré : 0 ligne dans la table). Si un socle en contenait d'autres, la
--  migration échouerait **ici**, bruyamment — c'est voulu : elle ne doit pas
--  créer silencieusement des orphelins.
-- ---------------------------------------------------------------------------

do $garde$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'loyalty_transactions_staff_id_fkey'
       and conrelid = 'public.loyalty_transactions'::regclass
  ) then
    alter table public.loyalty_transactions
      add constraint loyalty_transactions_staff_id_fkey
      foreign key (staff_id) references public.staff(id)
      on delete restrict;
  end if;
end;
$garde$;

commit;
