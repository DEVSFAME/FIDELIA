/* ============================================================================
   PassKit — ce qui se **déduit sans réseau**, et rien de plus.

   Séparé de la CLI (`sonder-passkit.mjs`) pour la même raison que `wallet.mjs`
   l'est de `relever-wallet.mjs` : la partie qui décide se teste hors ligne, la
   partie qui parle au réseau ne s'exécute qu'avec des identifiants.

   CE QUE CE MODULE REFUSE DE FAIRE : deviner le contrat. Les chemins REST de
   PassKit dépendent de la **région et du préfixe du compte** (`docs.passkit.io`
   le dit explicitement), et le Swagger est rendu dans leur portail, pas sur le
   site public. Les chemins ci-dessous sont donc des **candidats** : la sonde
   imprime le statut obtenu pour chacun, elle ne conclut pas à leur place.

   Vocabulaire, pour que personne ne confonde : une **sonde** mesure, un
   **contrat** promet. Tant qu'un chemin n'a pas répondu 200, il est candidat.
   ========================================================================== */

/** Noms des variables d'environnement — un seul endroit, jamais recopiés. */
export const CLES_ENV = Object.freeze({
  url: 'PASSKIT_API_URL',
  jeton: 'PASSKIT_API_TOKEN',
  programme: 'PASSKIT_PROGRAM_ID',
  palier: 'PASSKIT_TIER_ID',
  actif: 'WALLET_ENABLED',
})

/**
 * Chemins **candidats** pour lister les programmes.
 *
 * Trois formes seulement, parce que trois suffisent à dire si le préfixe du
 * compte est `/v1` ou vide : au-delà, on ne mesure plus, on parie. `{id}` est
 * remplacé quand un identifiant de programme est connu.
 *
 * @param {string|null} programme
 * @returns {string[]}
 */
export function cheminsProgrammes(programme = null) {
  const chemins = ['/v1/members/program', '/members/program']
  if (programme) chemins.unshift(`/v1/members/program/${encodeURIComponent(programme)}`)
  return chemins
}

/** Vrai si la chaîne est une URL http(s) exploitable. */
export function urlValide(valeur) {
  return typeof valeur === 'string' && /^https?:\/\/[^\s]+$/i.test(valeur.trim())
}

/**
 * Assemble une URL d'API sans jamais doubler le `/`.
 *
 * Rend `null` sur une base invalide : une base absente n'est pas une base par
 * défaut. Deviner `https://api.passkit.com` enverrait des requêtes — et un jeton
 * — à une adresse que le compte n'a pas désignée.
 *
 * @param {string|null|undefined} base
 * @param {string} chemin
 */
export function construireUrl(base, chemin) {
  if (!urlValide(base)) return null
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) return null
  return `${base.trim().replace(/\/+$/, '')}${chemin}`
}

/**
 * Lit l'environnement et rend l'état de la configuration.
 *
 * `pret` exige **trois** choses : le drapeau levé, une base, un jeton. Un
 * programme n'est pas requis pour *lire* (on peut lister), il l'est pour
 * *écrire* — d'où `pretAEcrire`.
 *
 * @param {Record<string, string|undefined>} env
 */
export function lireConfiguration(env = {}) {
  const lire = (cle) => {
    const valeur = env[cle]
    return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : null
  }

  const url = lire(CLES_ENV.url)
  const jeton = lire(CLES_ENV.jeton)
  const programme = lire(CLES_ENV.programme)
  const palier = lire(CLES_ENV.palier)
  const actif = (lire(CLES_ENV.actif) ?? '').toLowerCase() === 'true'

  const manquantes = []
  if (!actif) manquantes.push(`${CLES_ENV.actif}=true`)
  if (!url) manquantes.push(CLES_ENV.url)
  if (!jeton) manquantes.push(CLES_ENV.jeton)

  return {
    actif,
    url,
    jeton,
    programme,
    palier,
    manquantes,
    pret: manquantes.length === 0,
    pretAEcrire: manquantes.length === 0 && programme !== null && palier !== null,
  }
}

/**
 * Masque un secret pour l'affichage : quatre caractères, jamais plus.
 *
 * Un jeton complet recopié dans un journal de sonde annule la précaution qui a
 * consisté à ne pas le mettre dans le code.
 *
 * @param {string|null} secret
 */
export function masquer(secret) {
  if (typeof secret !== 'string' || secret === '') return '—'
  return `…${secret.slice(-4)} (${secret.length} car.)`
}

/**
 * Aplatit un JSON en `chemin = valeur` sur les seules feuilles scalaires.
 *
 * Sert à **lire une réponse inconnue** : on ne sait pas où PassKit met l'URL du
 * pass ni la valeur du code-barres, donc on n'écrit pas `membre.passUrl`. On
 * imprime tous les chemins, et l'œil reconnaît le bon. Profondeur bornée à 4 :
 * au-delà, c'est un journal de débogage, pas une mesure.
 *
 * @param {unknown} valeur
 * @param {string} [prefixe]
 * @param {Array<{chemin: string, valeur: string}>} [sortie]
 * @param {number} [profondeur]
 * @returns {Array<{chemin: string, valeur: string}>}
 */
export function aplatir(valeur, prefixe = '', sortie = [], profondeur = 0) {
  if (profondeur > 4) return sortie

  if (valeur === null || valeur === undefined) {
    if (prefixe) sortie.push({ chemin: prefixe, valeur: 'null' })
    return sortie
  }

  if (typeof valeur === 'object') {
    const entrees = Array.isArray(valeur)
      ? valeur.map((element, rang) => [`${prefixe}[${rang}]`, element])
      : Object.entries(valeur).map(([cle, element]) => [prefixe ? `${prefixe}.${cle}` : cle, element])

    for (const [chemin, element] of entrees) aplatir(element, chemin, sortie, profondeur + 1)
    return sortie
  }

  const texte = String(valeur)
  sortie.push({ chemin: prefixe, valeur: texte.length > 160 ? `${texte.slice(0, 160)}…` : texte })
  return sortie
}

/** Motifs des chemins qui portent l'URL d'un pass ou une valeur de code-barres. */
const MOTIF_URL = /url|pass|link|lien/i
const MOTIF_CODE = /barcode|qr|code|token|serial/i

/**
 * Ce que la réponse d'un membre contient **réellement**, trié par question.
 *
 * U1 (valeur du code-barres) et U2 (URL du pass) sont exactement ce que cette
 * fonction cherche. Elle ne les invente pas : si le chemin n'existe pas, la
 * liste est vide — et une liste vide est un résultat, pas un échec.
 *
 * @param {unknown} membre
 * @returns {{cles: string[], urls: Array<{chemin: string, valeur: string}>,
 *   codes: Array<{chemin: string, valeur: string}>}}
 */
export function resumeMembre(membre) {
  const plat = aplatir(membre)
  return {
    cles: membre && typeof membre === 'object' ? Object.keys(membre) : [],
    urls: plat.filter(({ chemin }) => MOTIF_URL.test(chemin)),
    codes: plat.filter(({ chemin }) => MOTIF_CODE.test(chemin)),
  }
}
