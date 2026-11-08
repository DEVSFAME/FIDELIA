/* ============================================================================
   Plafond de l'offre gratuite — règles **pures**, sans Next ni base.

   Source : `docs/regle-comptage-30-2026-11-02.md`. La base rend deux **faits**
   (`clients`, `limite`, cf. `migrations/0012`), et ce module décide ce qu'on en
   dit : combien il reste, à quel état on en est, quelle part de la jauge
   remplir. Aucun texte français ici — les phrases sont au dictionnaire, et les
   clés y sont écrites **en littéral** dans les composants, sinon le balayage
   d'`i18n-ui` ne les verrait pas (même règle que `etablissement.mjs`).

   Ce que ce module ne fait pas : **fermer quoi que ce soit**. Aucune fonction
   n'est branchée sur une écriture. Le verrou (P0-3b) demandera un état payant
   qui n'existe pas encore, et il lira `etat === 'atteint'` — la décision est
   déjà nommée ici pour que le jour venu il n'y ait qu'un seul endroit à lire.
   ========================================================================== */

/**
 * Seuil de l'avertissement « bientôt » — **choix, pas mesure.**
 *
 * La cible a trois messages (calme, « Plus que N clients avant la limite »,
 * « Plus que N clients : au Ne, le scan s'arrête ») mais l'écran qui les
 * déclenche n'a jamais été capturé : son unique compte rendu vaut 1. La seule
 * borne qui se déduit du texte est l'urgence (`reste === 1`, c'est ce que dit
 * « au 30e, le scan s'arrête »). Celle-ci est donc **décidée** : cinq places
 * restantes, assez pour prévenir sans crier pendant vingt inscriptions.
 */
export const SEUIL_ATTENTION = 5

/** Les quatre états, du plus tranquille au dernier. */
export const ETATS = Object.freeze(['large', 'attention', 'urgent', 'atteint'])

/* Les deux prix de l'offre, **mesurés** sur `/billing`
   (`c02-billing.html:43579` : « 397 MAD / mois TTC », « 397 MAD par point de
   vente », « 150 MAD · une seule fois »). Ils vivent ici et non dans une page :
   le bandeau et `/billing` affichent tous deux la plaque, et deux copies d'un
   prix finissent toujours par diverger. */
export const PRIX_MOIS_MAD = 397
export const PRIX_PLAQUE_MAD = 150

/**
 * Vrai si le nombre est un entier positif ou nul.
 * @param {unknown} valeur
 */
function entierPositif(valeur) {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0
}

/**
 * Part de la jauge, en pourcentage entier borné à 100.
 *
 * La cible écrit deux formes : `width:3%` dans le bandeau et
 * `width:3.3333333333333335%` sur `/billing`. Un seul nombre ici, arrondi :
 * deux arrondis différents pour la même grandeur finiraient par diverger.
 *
 * @param {number} clients
 * @param {number} limite
 */
export function pourcentOffre(clients, limite) {
  if (!entierPositif(clients) || !entierPositif(limite) || limite === 0) return 0
  return Math.min(100, Math.round((clients / limite) * 100))
}

/**
 * L'état du plafond.
 *
 * L'ordre des cas n'est pas cosmétique : `atteint` passe **avant** `urgent`,
 * sinon un commerce à 30 clients (reste 0) serait classé « urgent » et son
 * bandeau annoncerait une échéance déjà passée.
 *
 * @param {number} clients
 * @param {number} limite
 * @returns {'large'|'attention'|'urgent'|'atteint'}
 */
export function etatPlafond(clients, limite) {
  if (clients >= limite) return 'atteint'
  const reste = limite - clients
  if (reste === 1) return 'urgent'
  if (reste <= SEUIL_ATTENTION) return 'attention'
  return 'large'
}

/**
 * Lit la réponse de `plafond_clients()` et la rend lisible par un écran.
 *
 * Rend `null` — jamais des zéros — quand la forme n'est pas celle attendue :
 * « aucun client » et « je n'ai pas su lire » ne se corrigent pas au même
 * endroit, et un `0` affiché pour la seconde ferait chercher le problème du
 * mauvais côté (règle d'`EtatBloque`, `0004`).
 *
 * @param {unknown} donnees réponse JSON de la RPC
 * @returns {{clients: number, limite: number, reste: number,
 *   pourcent: number, etat: 'large'|'attention'|'urgent'|'atteint'} | null}
 */
export function lirePlafond(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  const { clients, limite } = /** @type {{clients?: unknown, limite?: unknown}} */ (donnees)
  if (!entierPositif(clients) || !entierPositif(limite) || limite === 0) return null

  return {
    clients,
    limite,
    reste: Math.max(limite - clients, 0),
    pourcent: pourcentOffre(clients, limite),
    etat: etatPlafond(clients, limite),
  }
}
