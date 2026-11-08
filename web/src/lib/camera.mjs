/* ============================================================================
   Caméra du scanner — le contrat, sans DOM.

   Ce module ne touche ni `window`, ni `navigator`, ni React : il **classe** des
   capacités et des erreurs, il ne les provoque pas. C'est ce qui le rend
   vérifiable alors qu'aucun test ne peut ouvrir une caméra (cf.
   `tools/rea/tests/scan-camera.test.mjs`).

   Trois choses y sont séparées, parce que les confondre coûte un écran :

     - **la permission** (la personne refuse) : c'est un **état d'écran**, pas
       une panne. On propose la saisie manuelle, on n'affiche pas une page
       d'erreur, et le refus n'est pas une exception qui remonte ;
     - **l'absence d'API** (`BarcodeDetector`, `navigator.mediaDevices`) : le
       navigateur ne sait pas lire un QR, et aucune permission n'y changera
       rien. Sur une origine non sécurisée, `navigator.mediaDevices` est
       simplement absent — c'est donc ce même cas, pas un cas de plus ;
     - **l'appareil** (aucune caméra, caméra déjà prise) : la permission peut
       être accordée et le flux échouer quand même.

   Le code lu n'entre **jamais** tel quel dans l'URL. Il passe par
   `normaliserCode`, puis par `codeCarteValide` **et** `jetonValide`. Les deux
   gardes sont nécessaires : `jetonValide` ne regarde que la longueur (1 à 64),
   donc un code-barres EAN de 13 chiffres y passe — il ne doit pas devenir un
   jeton de carte.
   ========================================================================== */

import { codeCarteValide, normaliserCode } from './carte.mjs'
import { jetonValide } from './rpc.mjs'

/** États d'écran de la caméra — un seul à la fois. */
export const ETATS_CAMERA = Object.freeze({
  /** Aucune demande en cours : le bouton « Activer » est proposé. */
  repos: 'repos',
  /** Permission demandée, réponse pas encore arrivée. */
  demande: 'demande',
  /** Flux ouvert, lecture en cours. */
  actif: 'actif',
  /** Permission refusée — état d'écran, jamais une erreur fatale. */
  refus: 'refus',
  /** Permission accordée mais aucune caméra utilisable. */
  sansCamera: 'sansCamera',
  /** Le navigateur ne sait pas lire les QR codes (`BarcodeDetector` absent). */
  nonSupporte: 'nonSupporte',
  /** Caméra présente mais flux en échec (occupée, pilote, coupure). */
  indisponible: 'indisponible',
})

/** Le seul format lu. Un QR d'emballage n'est pas un QR de carte. */
export const FORMAT_LU = 'qr_code'

/**
 * Erreurs `getUserMedia` qui disent « la personne n'a pas voulu ».
 * `SecurityError` y figure : sur une origine bloquée, le navigateur refuse la
 * demande sans jamais la poser — du point de vue de l'écran, c'est un refus.
 */
const ERREURS_PERMISSION = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError'])

/** Erreurs qui disent « il n'y a pas de caméra pour cette contrainte ». */
const ERREURS_APPAREIL = new Set([
  'NotFoundError',
  'DevicesNotFoundError',
  'OverconstrainedError',
  'ConstraintNotSatisfiedError',
])

/**
 * Ce que le navigateur expose au moment du clic.
 *
 * `BarcodeDetector` doit être un **constructeur** : un objet qui porterait un
 * `detect()` sans être instanciable ne servirait à rien, et le compter comme
 * présent déplacerait l'échec après la demande de permission — au pire endroit.
 *
 * @param {{BarcodeDetector?: unknown, mediaDevices?: unknown}} [exposes]
 * @returns {{aLecteur: boolean, aFlux: boolean, utilisable: boolean, etat: string}}
 */
export function capacitesCamera({ BarcodeDetector: Lecteur, mediaDevices: flux } = {}) {
  const aLecteur = typeof Lecteur === 'function'
  const aFlux = Boolean(flux && typeof flux.getUserMedia === 'function')
  const utilisable = aLecteur && aFlux
  return {
    aLecteur,
    aFlux,
    utilisable,
    etat: utilisable ? ETATS_CAMERA.repos : ETATS_CAMERA.nonSupporte,
  }
}

/**
 * Une liste de formats **sans** `qr_code` est un non définitif. Une liste
 * absente (API sans énumération) n'est pas un refus : on tente, et l'échec
 * éventuel sera classé comme une panne, pas comme une absence d'API.
 *
 * @param {unknown} formats
 */
export function qrSupporte(formats) {
  if (!Array.isArray(formats) || formats.length === 0) return true
  return formats.includes(FORMAT_LU)
}

/**
 * Traduit une erreur de flux en état d'écran, et dit si elle est de nature
 * « permission ». Le booléen n'est pas décoratif : c'est lui qui décide si
 * l'écran parle d'un refus ou d'une panne, et si l'on repropose le bouton.
 *
 * Rien n'est deviné au-delà des noms connus : une erreur inconnue est une
 * indisponibilité, jamais un refus.
 *
 * @param {{name?: string}|null|undefined} erreur
 * @returns {{etat: string, permission: boolean, nom: string}}
 */
export function classerErreurCamera(erreur) {
  const nom = typeof erreur?.name === 'string' ? erreur.name : ''
  if (ERREURS_PERMISSION.has(nom)) {
    return { etat: ETATS_CAMERA.refus, permission: true, nom }
  }
  if (ERREURS_APPAREIL.has(nom)) {
    return { etat: ETATS_CAMERA.sansCamera, permission: false, nom }
  }
  return { etat: ETATS_CAMERA.indisponible, permission: false, nom }
}

/**
 * Ce qu'on accepte de lire : un code de carte normalisé, ou rien.
 *
 * @param {unknown} brut texte lu par le détecteur
 * @returns {string} `C-XXXXXX` ou `''`
 */
export function codeDepuisScan(brut) {
  const candidat = normaliserCode(brut)
  if (!codeCarteValide(candidat)) return ''
  if (!jetonValide(candidat)) return ''
  return candidat
}

/**
 * Première détection exploitable d'une image. `BarcodeDetector` rend un
 * tableau : une affiche peut contenir plusieurs codes, et le premier n'est pas
 * forcément celui de la carte.
 *
 * @param {unknown} detections
 * @returns {string} `C-XXXXXX` ou `''`
 */
export function codeDesDetections(detections) {
  if (!Array.isArray(detections)) return ''
  for (const detection of detections) {
    const code = codeDepuisScan(detection?.rawValue)
    if (code) return code
  }
  return ''
}

/**
 * Écrans qui savent lire `?code=` — les seules destinations de navigation.
 *
 * La liste est **fermée** parce que la caméra écrit une URL : accepter un
 * chemin quelconque venu d'une prop ferait de ce composant un redirecteur
 * ouvert, et une faute de frappe (`/caissee`) déposerait le commerçant sur un
 * 404 sans que rien ne le signale. `scan-camera.test.mjs` vérifie que chaque
 * page qui branche la caméra demande une de ces deux destinations.
 */
export const DESTINATIONS_CARTE = Object.freeze(['/scan', '/caisse'])

/**
 * URL de la fiche carte — celle que les pages `/scan` et `/caisse` savent lire
 * (`?code=`).
 *
 * Un code invalide rend `''`, pas une URL bancale : l'appelant ne peut pas
 * naviguer par accident vers `/scan?code=1234567890123`. Une destination
 * inconnue rend `''` aussi — on préfère ne pas naviguer plutôt que d'envoyer
 * ailleurs que là où l'écran sait lire le code.
 *
 * @param {unknown} code
 * @param {string} [base] `/scan` (défaut, historique) ou `/caisse`
 * @returns {string}
 */
export function cheminCarte(code, base = '/scan') {
  const sur = codeDepuisScan(code)
  if (!sur) return ''
  if (!DESTINATIONS_CARTE.includes(base)) return ''
  return `${base}?code=${encodeURIComponent(sur)}`
}

