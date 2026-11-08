/* ============================================================================
   Une soumission de formulaire ne doit **jamais** finir sur une route qui ne
   porte aucune action.

   Mesuré le 2026-11-09 : `POST /` avec `Next-Action: y` a rendu **400, corps
   vide, 30 octets** (`x-nextjs-action-not-found: 1`). Chrome a affiché sa page
   d'erreur réseau — « This page couldn't load » — sans message et sans retour
   possible : l'utilisateur a perdu sa saisie et n'a rien appris.

   Deux situations produisent ce POST, et une seule règle les couvre :

     1. `/` est une route **prérendue** (307 → `/login`, `s-maxage=31536000`).
        Elle ne déclare aucune action : tout POST y est perdu par construction.
     2. un identifiant d'action **tronqué** (`y` là où le manifeste porte 42
        hexadécimaux) — le client ne correspond plus au build servi.

   Ce que cette règle **ne fait pas** : deviner qu'une action existe. Elle ne
   juge que ce qui est prouvé par la requête (méthode, chemin, longueur de
   l'identifiant) et refuse seulement ce qui ne peut pas aboutir.
   ========================================================================== */

/** Un identifiant d'action est un SHA-1 hexadécimal (42 chez Next 16). */
export const LONGUEUR_MIN_ID = 32

/** La seule valeur de `?etat=` que ce repli produit (consommée par `messageEtat`). */
export const ETAT_REPRISE = 'reprise'

/**
 * Cible de repli pour une requête qui ne peut pas être une action, ou `null`
 * quand la requête doit passer telle quelle.
 *
 * `HEAD` est traité comme `GET` : il ne transporte aucune soumission.
 *
 * @param {{methode: string, chemin: string, idAction: string|null}} requete
 * @returns {string|null} chemin absolu (avec sa requête), ou `null`
 */
export function cibleDeRepli({ methode, chemin, idAction }) {
  const lecture = methode === 'GET' || methode === 'HEAD'
  if (lecture) return null

  /* `/` redirige vers la connexion : c'est là que la saisie doit revenir, avec
     le seul message vrai — les champs sont vides après ce détour. */
  if (chemin === '/') return `/login?etat=${ETAT_REPRISE}`

  /* Ailleurs, un identifiant trop court ne peut désigner aucune action de ce
     build : on rend la page **demandée** (en GET) plutôt qu'un 400 muet, pour
     que l'écran reste celui sur lequel l'utilisateur travaillait. */
  if (typeof idAction === 'string' && idAction.length > 0 && idAction.length < LONGUEUR_MIN_ID) {
    return chemin
  }

  return null
}
