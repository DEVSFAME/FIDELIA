-- ============================================================================
--  0012 — LE PLAFOND DE 30 CLIENTS (P0-3) : le compteur, et lui seul
--
--  Source : `docs/regle-comptage-30-2026-11-02.md` — la règle de comptage a été
--  **mesurée** avant d'être écrite ici. Ce qui est compté, c'est le nombre de
--  clients **inscrits** (une carte remise), cumulé, à l'échelle du commerce.
--  Preuves : `p01-home.html:72421` (« votre 30e client s'inscrit »),
--  `c02-billing.html:43501` (`aria-label="Clients inscrits sur l'offre
--  gratuite"`), `chunks_9990:1494` (« N clients ont déjà leur carte »).
--
--  Ce que cette migration NE fait PAS, et c'est délibéré :
--    - **aucun verrou**. Les chaînes de la cible disent que le plafond ferme le
--      **scan** du commerçant, pas l'inscription du client. Ici, l'inscription
--      publique (`join_loyalty_program`, `0003`) est le **seul** chemin qui crée
--      un client, et aucun état payant n'existe pour lever la limite : refuser
--      à 30 fermerait la porte sans clé. Décision détaillée au §5 du document.
--    - **aucun abonnement**. Pas de table `subscriptions`, pas de statut : rien
--      n'a été mesuré côté serveur (la cible lit `rest/v1/subscriptions` sans
--      qu'on en voie le schéma). Une table inventée porterait des colonnes que
--      personne ne peut remplir.
--
--  Une seule vérité ici : **combien de clients, et quelle est la limite**. La
--  lecture rend des faits ; l'état (« large », « urgent », « atteint ») et la
--  jauge se calculent dans `web/src/lib/plafond.mjs`. Séparer les deux évite
--  qu'un seuil vive à deux endroits : la base dit `clients` et `limite`, le
--  module décide ce qu'on en dit.
-- ============================================================================


begin;


-- ---------------------------------------------------------------------------
--  1. La lecture — `plafond_clients()`
--
--  `count(*)` sur `clients`, exactement comme `tableau_du_commerce()` (`0005`,
--  ligne « select count(*) into v_clients from public.clients »). Ce n'est pas
--  une seconde définition du même chiffre : c'est la même. `join_loyalty_program`
--  insère un client **et** une carte par inscription (`0003`), donc compter les
--  clients ou les cartes donne le même nombre tant que rien d'autre n'écrit —
--  et si un jour quelque chose écrit autrement, c'est le client qui fait foi
--  (« clients ont déjà leur carte », la formulation mesurée).
--
--  `limite` est rendue par la fonction au lieu d'être connue de l'appelant : la
--  cible n'écrit 30 qu'une fois, sous forme de paramètre (`{limite}` dans son
--  dictionnaire marketing), et l'affiche partout ailleurs. Un 30 recopié dans
--  trois composants React serait trois occasions de diverger.
--
--  Pas de `PROGRAM_NOT_FOUND` : le compteur reste vrai même sans programme
--  (0 client). Lever un refus ici obligerait chaque écran à traiter une erreur
--  qui n'empêche rien.
-- ---------------------------------------------------------------------------

create or replace function public.plafond_clients()
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_limite  constant integer := 30;
  v_clients integer;
begin
  select count(*) into v_clients from public.clients;

  return json_build_object(
    'clients', v_clients,
    'limite',  v_limite
  );
end;
$fonction$;

comment on function public.plafond_clients() is
  'Compteur de l''offre gratuite : nombre de clients inscrits et limite (30). Aucun verrou — cf. docs/regle-comptage-30-2026-11-02.md §5.';

-- ---------------------------------------------------------------------------
--  2. Les droits — révoquer les trois rôles nommés, puis rendre à qui sert
--
--  Même piège que `0003`/`0004`/`0011` : `revoke … from public` seul est un
--  no-op sur Supabase, qui accorde `EXECUTE` à `anon`, `authenticated` et
--  `service_role` par défaut. On révoque donc les trois noms avant de rendre.
--
--  `anon` est exclu : le compteur dit combien de clients le commerce a. Ce
--  n'est pas une donnée publique — la page d'adhésion n'en a pas besoin, et un
--  chiffre d'affaires d'inscriptions est une information commerciale.
-- ---------------------------------------------------------------------------

revoke execute on function public.plafond_clients() from public, anon, authenticated;
grant  execute on function public.plafond_clients() to authenticated, service_role;

commit;
