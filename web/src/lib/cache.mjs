/* ============================================================================
   Cache court à durée de vie — sans dépendance, testable sans réseau.

   POURQUOI CE FICHIER EXISTE (mesuré le 2026-11-01)
   -------------------------------------------------
   Un aller-retour Supabase coûte **0,55 à 0,81 s** depuis cette machine
   (5 tirages sur `/rest/v1/rpc/programme_public`, 3 sur `/auth/v1/health`),
   alors que le rendu serveur de Next prend 9 à 78 ms. La latence ressentie au
   clic n'est donc pas du calcul : c'est du réseau, payé **une fois par page**,
   quatre fois de suite parce que quatre écrans relisent le même programme.

   Or ce programme ne change qu'à l'instant où quelqu'un l'enregistre. Le
   relire à chaque navigation est un coût pur.

   CE QUE CE MODULE NE FAIT PAS
   ----------------------------
   - Il ne connaît ni Supabase ni Next : il ne mémorise qu'une valeur et une
     échéance. La **politique** (quoi mémoriser, quand invalider) appartient à
     l'appelant (`donnees.mjs`), parce que c'est là qu'on sait si un état est
     stable.
   - Il n'expire pas tout seul : une entrée périmée est simplement ignorée à la
     lecture suivante. Aucun `setTimeout`, donc aucun travail quand personne ne
     lit — et rien à annuler dans un test.
   - Il n'est **pas** un cache partagé entre instances. Chaque processus a le
     sien. C'est acceptable ici (un seul conteneur) et écrit noir sur blanc dans
     `lesson-learned` §37 : une deuxième instance peut servir une valeur périmée
     jusqu'à l'expiration du TTL, jamais au-delà.
   ========================================================================== */

/** Durée par défaut : assez courte pour qu'une erreur de fraîcheur ne survive
 *  pas à la conversation en cours, assez longue pour couvrir une navigation. */
export const TTL_PAR_DEFAUT = 10_000

/**
 * Un emplacement mémoire à expiration.
 *
 * @param {object} [options]
 * @param {number} [options.ttlMs] durée de vie d'une entrée, en millisecondes
 * @param {() => number} [options.maintenant] horloge injectable (tests)
 */
export function cacheCourt({ ttlMs = TTL_PAR_DEFAUT, maintenant = () => Date.now() } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError(`cacheCourt : ttlMs doit être un nombre > 0 (reçu ${ttlMs})`)
  }

  /** @type {{ valeur: unknown, expire: number } | null} */
  let entree = null

  return {
    /**
     * Valeur encore valide, ou `undefined`.
     *
     * `undefined` et non `null` : `null` est une valeur légitime (un programme
     * absent), et la confondre avec « rien en cache » ferait relire la base à
     * chaque navigation pour un commerce qui n'a pas encore de programme.
     */
    lire() {
      if (entree === null) return undefined
      if (maintenant() >= entree.expire) {
        entree = null
        return undefined
      }
      return entree.valeur
    },

    /** Mémorise une valeur pour `ttlMs`. */
    ecrire(valeur) {
      entree = { valeur, expire: maintenant() + ttlMs }
      return valeur
    },

    /** Oublie tout. Appelé par les écritures : c'est l'invalidation explicite. */
    oublier() {
      entree = null
    },

    /** Âge de l'entrée en millisecondes, ou `null` s'il n'y en a pas. */
    age() {
      if (entree === null || maintenant() >= entree.expire) return null
      return ttlMs - (entree.expire - maintenant())
    },

    /** Durée de vie configurée (diagnostic, tests). */
    get ttlMs() {
      return ttlMs
    },
  }
}
