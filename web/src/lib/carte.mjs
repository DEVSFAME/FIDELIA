/* ============================================================================
   Carte client — le code `C-XXXXXX` et rien d'autre.

   Mesuré : l'identité du client final est un **code**, pas une personne.
   La caisse accepte « Code client C-XXXXXX, ou lien de la carte » ; le QR de la
   caisse pointe « vers le QR code du client ».

   D'où une seule règle : **tout ce qui entre est normalisé avant d'être
   comparé**. Un commerçant tape `c-ab12cd`, colle `C-AB12CD ` ou scanne le QR
   du client : c'est le même client. Sans normalisation, la même personne saisie
   deux fois créerait deux fiches aux yeux de la caisse.
   ========================================================================== */

/** Forme mesurée du code client. */
export const FORME_CODE = /^C-[A-Z0-9]{6}$/

/**
 * Extrait et normalise un code depuis n'importe quelle saisie :
 * `c-ab12cd`, ` C-AB12CD `, une URL qui en contient un, ou le texte lu par un
 * scanner.
 *
 * @param {string} saisie
 * @returns {string} le code en majuscules, ou la saisie nettoyée si rien ne
 *   ressemble à un code (l'appelant décide alors de refuser)
 */
export function normaliserCode(saisie) {
  const brut = String(saisie ?? '').trim()
  if (brut === '') return ''

  // Un code peut être noyé dans une URL : on cherche le motif, pas la position.
  const trouve = brut.toUpperCase().match(/C-[A-Z0-9]{6}/)
  if (trouve) return trouve[0]

  // Sinon on rend la saisie compactée, pour que le message d'erreur cite ce que
  // la personne a réellement tapé.
  return brut.toUpperCase().replace(/\s+/g, '')
}

/** Vrai si la saisie (normalisée) est un code de carte valide. */
export function codeCarteValide(saisie) {
  return FORME_CODE.test(normaliserCode(saisie))
}

/* ============================================================================
   Liste des cartes — ce que rend `cartes_du_commerce()` (migration 0004)

   Mesuré sur la capture authentifiée de `/customers`
   (`_captures/2026-10-27-auth-s3/raw/pages/a17-customers.html`) : la cible
   affiche « CR » (initiales), « C-CR7QZX », « 8 pts », « 0 », « 26 oct. 2026 ».
   Les trois aides ci-dessous ne décident d'aucune valeur : elles rendent
   affichable ce que la fonction promet, et **refusent** une forme inattendue au
   lieu de deviner (une liste à moitié comprise afficherait des zéros faux).
   ========================================================================== */

/** Format de date mesuré sur la cible : `26 oct. 2026`. */
const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Formate la date d'inscription renvoyée par la base.
 * @param {string} iso
 * @returns {string} `''` si la valeur n'est pas une date — jamais « Invalid Date ».
 */
export function dateCourte(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return FORMAT_DATE.format(date)
}

/**
 * Initiales affichées par la cible (« CR »). Une carte anonyme n'en a pas :
 * la fonction rend `''`, et l'écran montre alors le code, pas un avatar vide.
 * @param {string} prenom
 * @param {string} nom
 */
export function initiales(prenom, nom) {
  const premier = String(prenom ?? '').trim()
  const dernier = String(nom ?? '').trim()
  return `${premier ? premier[0] : ''}${dernier ? dernier[0] : ''}`.toUpperCase()
}

/**
 * Lit la réponse de `cartes_du_commerce()` et la met en forme pour l'écran.
 *
 * Rend `null` — et non une liste vide — dès qu'une carte n'a pas la forme
 * promise : « aucune carte » et « je n'ai pas compris la réponse » sont deux
 * états différents, et les confondre ferait chercher le problème du mauvais
 * côté (même règle que `EtatBloque`).
 *
 * @param {unknown} donnees
 * @returns {{total: number, limite: number, cartes: object[], tronquee: boolean}|null}
 */
export function lireListeCartes(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  if (!Array.isArray(donnees.cartes)) return null

  const cartes = []
  for (const carte of donnees.cartes) {
    if (!carte || typeof carte.card_token !== 'string' || carte.card_token === '') return null
    cartes.push({
      code: carte.card_token,
      points: Number.isInteger(carte.points) ? carte.points : 0,
      recompenses: Number.isInteger(carte.recompenses) ? carte.recompenses : 0,
      inscritLe: dateCourte(carte.inscrit_le),
      prenom: typeof carte.prenom === 'string' ? carte.prenom : '',
      nom: typeof carte.nom === 'string' ? carte.nom : '',
    })
  }

  const total = Number.isInteger(donnees.total) && donnees.total >= cartes.length
    ? donnees.total
    : cartes.length
  const limite = Number.isInteger(donnees.limite) && donnees.limite > 0
    ? donnees.limite
    : cartes.length

  return { total, limite, cartes, tronquee: total > cartes.length }
}


