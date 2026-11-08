/* ============================================================================
   Web push — l'opt-in de la page carte, et **pas** la proximité.

   Source : `…/2026-10-27-a3/raw/assets/_next_static_chunks_app_card_%5BcardId%5D
   _page-198959ba….js` (module 61618), lu à l'offset ≈ 9 489.

       Notification.requestPermission()
       navigator.serviceWorker.register("/sw.js")
       reg.pushManager.subscribe({ userVisibleOnly: true,
         applicationServerKey: <clé VAPID publique, base64url> })
       fetch("/api/push/subscribe", { method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ card_id, endpoint, p256dh, auth }) })

   Trois choses mesurées, reprises ici telles quelles :

     1. **aucun prompt automatique.** L'état se lit par
        `serviceWorker.getRegistration()` — jamais `register()` — puis
        `pushManager.getSubscription()`. Demander la permission au chargement
        est le moyen le plus sûr de la faire refuser pour toujours ;
     2. **`denied` court-circuite.** Si la permission est déjà refusée, on ne
        redemande rien : l'écran explique où cliquer (« Notifications
        bloquées ») ;
     3. **un `POST` raté désabonne.** Le `PushSubscription` créé juste avant est
        annulé (`unsubscribe()`), donc aucun jeton orphelin ne survit à un
        échec d'enregistrement.

   Ce que ce canal **n'est pas** : la notification « à proximité ». Celle-là est
   un géorepérage inscrit dans le pass Wallet ; elle ne demande aucune
   autorisation de notification et n'émet aucun envoi
   (`docs/notification-proximite-2026-11-04.md` §1). Les deux canaux se
   rejoignent sur une seule phrase : « en ajoutant leur carte au Wallet **ou**
   en activant les notifications ».

   Ce fichier est **pur** : aucun `navigator`, aucun `fetch`. Le composant
   client appelle ces fonctions, ce qui rend les refus testables sans navigateur.
   ========================================================================== */

import { identifiantCarteValide } from './carte-publique.mjs'

/**
 * Les cinq états nommés de la cible, plus `abonnement` (le clic en cours, que
 * le chunk appelle `subscribing` et qui désactive le bouton).
 */
export const ETATS = Object.freeze({
  chargement: 'chargement',
  nonSupporte: 'nonSupporte',
  refuse: 'refuse',
  inactif: 'inactif',
  abonnement: 'abonnement',
  abonne: 'abonne',
})

/** Motifs de refus d'un corps de `POST` — un par champ, jamais un fourre-tout. */
export const CODES_REFUS = Object.freeze({
  carte: 'carte',
  endpoint: 'endpoint',
  p256dh: 'p256dh',
  auth: 'auth',
})

/**
 * Clé VAPID **publique** — préfixe `NEXT_PUBLIC_` assumé : une clé publique est
 * publique par construction, c'est son nom. La clé **privée** n'existe pas dans
 * ce socle : sans émetteur (P0-4b), il n'y a rien à signer.
 */
export const CLE_VAPID_ENV = 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'

/** Bornes des trois champs, celles que `0019` tient aussi en base. */
export const BORNES = Object.freeze({
  endpoint: Object.freeze([10, 1024]),
  p256dh: Object.freeze([16, 200]),
  auth: Object.freeze([8, 100]),
})

/** Cinq par carte — le plafond de `enregistrer_abonnement_push()`. */
export const ABONNEMENTS_MAX = 5

/** Préfixe du drapeau de repli, mesuré : `push-optin-<cardId>`. */
export const CLE_REPLI_PREFIXE = 'push-optin-'

/** Valeur écrite quand le client ferme la carte d'opt-in (mesurée). */
export const VALEUR_REPLI = 'dismissed'

/** base64url : alphanumériques, `-`, `_`, et au plus deux `=` de bourrage. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

/**
 * La clé de `localStorage` qui retient un refus de voir la carte d'opt-in.
 *
 * Par carte, et pas globale : un client peut avoir deux cartes, et fermer la
 * proposition sur l'une n'est pas un refus sur l'autre (comportement mesuré :
 * la clé porte `cardId`).
 *
 * @param {string} cardId
 */
export function cleStockage(cardId) {
  return `${CLE_REPLI_PREFIXE}${String(cardId ?? '')}`
}

/**
 * Normalise une clé VAPID publique, ou rend `null`.
 *
 * Une clé absente **n'est pas** une panne : c'est le canal qui n'est pas
 * branché, exactement comme `WALLET_ENABLED=false` (`0014`). L'appelant décide
 * de ne rien afficher — s'abonner sans clé produirait un jeton orphelin, ce que
 * la cible elle-même évite.
 *
 * @param {unknown} valeur
 * @returns {string|null}
 */
export function lireCleVapid(valeur) {
  if (typeof valeur !== 'string') return null
  const propre = valeur.trim()
  // Une clé P-256 non compressée : 65 octets, donc 87 ou 88 caractères. La
  // fourchette est volontairement large (un point compressé existe), mais le
  // jeu de caractères, lui, ne l'est pas.
  if (propre.length < 80 || propre.length > 100) return null
  return BASE64URL.test(propre) ? propre : null
}

/**
 * base64url → `Uint8Array`, la forme qu'attend `applicationServerKey`.
 *
 * C'est **littéralement** la conversion du chunk mesuré :
 * `"=".repeat((4-e.length%4)%4)` puis `atob` après remplacement de `-`/`_`.
 * `atob` n'existe pas partout — s'il manque, on rend `null` au lieu de lever.
 *
 * @param {unknown} valeur
 * @returns {Uint8Array|null}
 */
export function cleDepuisBase64url(valeur) {
  const propre = lireCleVapid(valeur)
  if (propre === null || typeof atob !== 'function') return null

  const complet = propre.replace(/-/g, '+').replace(/_/g, '/')
  const bourrage = '='.repeat((4 - (complet.length % 4)) % 4)

  try {
    const binaire = atob(complet + bourrage)
    return Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * L'état d'entrée, décidé sans toucher au navigateur.
 *
 * `supporte` = `'serviceWorker' in navigator && 'PushManager' in window`.
 * `permission` = `Notification.permission` (`default` | `granted` | `denied`).
 * `abonne` = un `PushSubscription` existait déjà.
 *
 * @param {{supporte?: boolean, permission?: string, abonne?: boolean}} faits
 * @returns {string} une valeur de `ETATS`
 */
export function etatInitial({ supporte = false, permission = 'default', abonne = false } = {}) {
  if (!supporte) return ETATS.nonSupporte
  if (permission === 'denied') return ETATS.refuse
  if (abonne) return ETATS.abonne
  return ETATS.inactif
}

/** Longueur admise d'un champ texte, bornes de `0019`. */
const longueurValide = (valeur, [min, max]) =>
  typeof valeur === 'string' && valeur.length >= min && valeur.length <= max

/**
 * Valide le corps du `POST` avant tout appel réseau.
 *
 * Le corps mesuré porte exactement quatre champs — `card_id`, `endpoint`,
 * `p256dh`, `auth` — et rien d'autre. Un champ en trop n'est pas recopié : la
 * route ne relaie pas ce qu'elle ne comprend pas.
 *
 * @param {unknown} saisie
 * @returns {{etat: 'ok', carte: string, endpoint: string, p256dh: string, auth: string}
 *   | {etat: 'refus', code: string}}
 */
export function analyserAbonnement(saisie) {
  const corps = saisie && typeof saisie === 'object' ? saisie : {}

  if (!identifiantCarteValide(corps.card_id)) {
    return { etat: 'refus', code: CODES_REFUS.carte }
  }

  const endpoint = typeof corps.endpoint === 'string' ? corps.endpoint.trim() : ''
  if (!longueurValide(endpoint, BORNES.endpoint) || !/^https:\/\//i.test(endpoint)) {
    return { etat: 'refus', code: CODES_REFUS.endpoint }
  }

  const p256dh = typeof corps.p256dh === 'string' ? corps.p256dh.trim() : ''
  if (!longueurValide(p256dh, BORNES.p256dh) || !BASE64URL.test(p256dh)) {
    return { etat: 'refus', code: CODES_REFUS.p256dh }
  }

  const auth = typeof corps.auth === 'string' ? corps.auth.trim() : ''
  if (!longueurValide(auth, BORNES.auth) || !BASE64URL.test(auth)) {
    return { etat: 'refus', code: CODES_REFUS.auth }
  }

  return { etat: 'ok', carte: corps.card_id.trim(), endpoint, p256dh, auth }
}

/**
 * Le corps à envoyer, dans l'ordre mesuré des clés.
 * @param {{carte: string, endpoint: string, p256dh: string, auth: string}} abonnement
 */
export function corpsAbonnement({ carte, endpoint, p256dh, auth }) {
  return { card_id: carte, endpoint, p256dh, auth }
}

/** Ce que la route répond, et ce que l'écran en dit. */
export const ETATS_REPONSE = Object.freeze({
  ok: 'ok',
  carteInconnue: 'carteInconnue',
  plafondAtteint: 'plafondAtteint',
  abonnementInvalide: 'abonnementInvalide',
  indisponible: 'indisponible',
})

/**
 * Traduit le statut HTTP de `POST /api/push/subscribe` en état d'écran.
 *
 * Un statut non prévu n'est pas rapproché d'un cas connu au hasard : il tombe
 * dans `indisponible`, et le message le dit sans inventer une cause. Le `503`
 * (migration non passée ou base injoignable) tombe donc là aussi : du point de
 * vue du client, les deux se réparent de la même façon — réessayer plus tard.
 *
 * @param {number} statut
 * @returns {string} une valeur de `ETATS_REPONSE`
 */
export function etatDepuisReponse(statut) {
  if (statut === 200 || statut === 201) return ETATS_REPONSE.ok
  if (statut === 400) return ETATS_REPONSE.abonnementInvalide
  if (statut === 404) return ETATS_REPONSE.carteInconnue
  if (statut === 409) return ETATS_REPONSE.plafondAtteint
  return ETATS_REPONSE.indisponible
}

/**
 * La clé i18n du message d'échec — `null` quand il n'y a rien à dire.
 *
 * Les trois refus de la cible sont rédigés (« Autorisez les notifications… »,
 * « L'activation n'a pas pu être enregistrée… », « L'activation a échoué… ») ;
 * on garde la même granularité, mais dans le dictionnaire, comme partout ici.
 *
 * @param {string} etat
 * @returns {string|null}
 */
export function messageRefus(etat) {
  switch (etat) {
    case ETATS_REPONSE.carteInconnue:
      return 'carte.push.erreurCarte'
    case ETATS_REPONSE.plafondAtteint:
      return 'carte.push.erreurPlafond'
    case ETATS_REPONSE.abonnementInvalide:
      return 'carte.push.erreurEnregistrement'
    case ETATS_REPONSE.indisponible:
      return 'carte.push.erreurReseau'
    default:
      return null
  }
}

