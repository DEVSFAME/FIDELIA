/* ============================================================================
   Google Wallet — la carte dans le téléphone du client (P0-5).

   Contrat **mesuré** dans la documentation Google (`reference/rest/v1/loyaltyobject`
   et `loyalty-cards/use-cases/jwt`) :
     - le lien est `https://pay.google.com/gp/v/save/<JWT>` ;
     - le JWT est signé **RS256** avec la clé du compte de service ;
     - ses revendications sont `iss` (email du compte), `aud: "google"`,
       `typ: "savetowallet"`, `iat`, `origins`, `payload` ;
     - `payload.loyaltyObjects` porte **un seul** objet (`INVALID_NUM_OBJECTS`) ;
     - l'objet s'appelle `{issuerId}.{suffixe}` ;
     - les points sont `points.label` + `points.balance.string`.

   Pourquoi Google d'abord : `barcode.value` est **écrit par nous**. Il porte
   `card_token` tel quel, donc `/scan` n'a pas une ligne à changer — alors que
   chez Apple cette valeur n'est pas observable sans compte payant (U1).

   Aucune dépendance : RS256 se signe avec `node:crypto`. Ce module ne lit ni
   fichier, ni variable d'environnement, ni réseau : la route lui passe la
   configuration, les tests lui passent une clé jetable.
   ========================================================================== */

import { createSign } from 'node:crypto'

import { pointsGeofence } from './proximite.mjs'

/** Variables d'environnement — un seul endroit, jamais recopiées ailleurs. */
export const CLES_ENV = Object.freeze({
  actif: 'WALLET_ENABLED',
  issuerId: 'GOOGLE_WALLET_ISSUER_ID',
  compte: 'GOOGLE_WALLET_SERVICE_ACCOUNT',
  cle: 'GOOGLE_WALLET_PRIVATE_KEY',
  origine: 'GOOGLE_WALLET_ORIGIN',
})

/** Suffixe par défaut de la classe (le modèle partagé des cartes). */
export const SUFFIXE_CLASSE = 'fidelite'

/**
 * Lit l'environnement et rend l'état de la configuration.
 *
 * `pret` exige **cinq** choses : le drapeau, l'identifiant d'émetteur, l'email
 * du compte de service, la clé privée et l'origine. Une origine manquante n'est
 * pas un détail : Google refuse un JWT sans `origins` (`MISSING_ORIGIN`), donc
 * mieux vaut refuser ici, avec un message clair, qu'à l'écran du client.
 *
 * @param {Record<string, string|undefined>} env
 */
export function lireConfiguration(env = {}) {
  const lire = (cle) => {
    const valeur = env[cle]
    return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : null
  }

  const actif = (lire(CLES_ENV.actif) ?? '').toLowerCase() === 'true'
  const issuerId = lire(CLES_ENV.issuerId)
  const compte = lire(CLES_ENV.compte)
  const cle = lire(CLES_ENV.cle)
  const origine = lire(CLES_ENV.origine)

  const manquantes = []
  if (!actif) manquantes.push(`${CLES_ENV.actif}=true`)
  if (!issuerId) manquantes.push(CLES_ENV.issuerId)
  if (!compte) manquantes.push(CLES_ENV.compte)
  if (!cle) manquantes.push(CLES_ENV.cle)
  if (!origine) manquantes.push(CLES_ENV.origine)

  return { actif, issuerId, compte, cle, origine, manquantes, pret: manquantes.length === 0 }
}

/**
 * Normalise une clé PEM recopiée dans une variable d'environnement.
 *
 * Un `.env` n'a pas de retours à la ligne : la clé y est écrite avec des `\n`
 * littéraux. Sans cette conversion, `createSign` lève `DECODER routines::unsupported`
 * — une erreur qui ne dit pas du tout « ta clé est mal collée ».
 */
export function normaliserCle(cle) {
  if (typeof cle !== 'string' || cle.trim() === '') return null
  const texte = cle.includes('\\n') ? cle.replace(/\\n/g, '\n') : cle
  return texte.includes('BEGIN') ? texte : null
}

/**
 * Suffixe d'objet dérivé de l'identifiant de carte.
 *
 * Google n'accepte que `[A-Za-z0-9._-]` : les tirets d'un UUID sont donc
 * retirés. Le préfixe `carte_` évite qu'un suffixe commence par un chiffre ou
 * un tiret, que Google tolère mais qui se lit mal dans la console.
 *
 * @param {string} cardId
 */
export function suffixeObjet(cardId) {
  const propre = String(cardId ?? '').replace(/[^A-Za-z0-9]/g, '')
  return `carte_${propre}`
}

/**
 * Identifiant d'objet au format mesuré : `{issuerId}.{suffixe}`.
 * @param {string} issuerId
 * @param {string} cardId
 */
export function identifiantObjet(issuerId, cardId) {
  return `${issuerId}.${suffixeObjet(cardId)}`
}

/** Identifiant de classe (le modèle partagé). */
export function identifiantClasse(issuerId, suffixe = SUFFIXE_CLASSE) {
  return `${issuerId}.${suffixe}`
}

/** Les quatre derniers caractères d'un jeton — pour l'affichage seulement. */
function codeCourt(token) {
  return String(token ?? '').slice(-4)
}

/**
 * Construit l'objet `LoyaltyObject` d'une carte.
 *
 * Trois choix qui se voient :
 *  1. **`barcode.value` = `card_token`.** C'est tout l'intérêt de Google : le
 *     QR du pass est celui que `/scan` sait déjà lire, sans alias ni table.
 *  2. **`accountId` ne porte PAS le jeton complet.** Un pass s'affiche à l'écran,
 *     parfois par-dessus une épaule : quatre caractères suffisent à distinguer
 *     deux cartes, et ne suffisent pas à en voler une.
 *  3. **aucune couleur imposée.** `hexBackgroundColor` n'est pas mesuré sur la
 *     cible ; la laisser vide laisse Google appliquer son défaut, plutôt que
 *     d'inventer une charte.
 *
 * S'y ajoute, depuis `0017`, la proximité : `merchantLocations` ne porte que
 * des couples `{latitude, longitude}` — Google n'accepte **aucun rayon**, c'est
 * lui qui décide de la portée. Dix au maximum, centre compris.
 *
 * @param {{issuerId: string, cardId: string, token: string, points: number,
 *   prenom?: string, programme?: {nom?: string, seuil?: number,
 *   latitude?: number|null, longitude?: number|null, rayon?: number}}} carte
 */
export function construireObjet(carte) {
  const token = String(carte.token ?? '')
  const points = Number.isFinite(carte.points) ? Math.trunc(carte.points) : 0
  const seuil = Number.isFinite(carte.programme?.seuil) ? Math.trunc(carte.programme.seuil) : null

  const objet = {
    id: identifiantObjet(carte.issuerId, carte.cardId),
    classId: identifiantClasse(carte.issuerId),
    state: 'ACTIVE',
    accountName: carte.prenom && carte.prenom.trim() !== '' ? carte.prenom.trim() : 'Client',
    accountId: codeCourt(token),
    barcode: { type: 'QR_CODE', value: token, alternateText: codeCourt(token) },
    points: { label: 'Points', balance: { string: String(points) } },
  }

  if (seuil !== null && seuil > 0) {
    objet.textModulesData = [
      {
        id: 'seuil',
        header: 'Prochaine récompense',
        body: `${seuil} points`,
      },
    ]
  }

  /* La proximité : `merchantLocations`, **sans rayon**. Google décide lui-même
     de la portée de chaque point ; le rayon saisi ne sert qu'à savoir combien
     de points poser et jusqu'où (cf. `proximite.mjs`). Dix au maximum par
     objet `[D]` — au-delà, Google refuse le pass entier. */
  const emplacements = pointsGeofence({
    latitude: carte.programme?.latitude,
    longitude: carte.programme?.longitude,
    rayon: carte.programme?.rayon,
  })
  if (emplacements.length > 0) objet.merchantLocations = emplacements

  return objet
}

/** Charge utile du JWT : **un seul** objet, comme l'exige Google. */
export function construireChargeUtile(objet) {
  return { loyaltyObjects: [objet] }
}

/** Base64 URL sans remplissage, tel que JWT l'exige. */
export function base64url(valeur) {
  const tampon = Buffer.isBuffer(valeur) ? valeur : Buffer.from(String(valeur), 'utf8')
  return tampon.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Normalise l'origine autorisée : Google attend un **domaine** (`MISSING_ORIGIN`
 * sinon), et l'exemple de sa documentation écrit `www.example.com`.
 *
 * @param {string} origine
 */
export function normaliserOrigine(origine) {
  if (typeof origine !== 'string') return null
  const sansProtocole = origine.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return sansProtocole === '' ? null : sansProtocole
}

/**
 * Signe le JWT « ajouter à Google Wallet ».
 *
 * `maintenant` est injectable pour que les tests soient déterministes : un
 * `iat` variable rendrait le jeton impossible à comparer, et pousserait à
 * tester « à peu près » — c'est-à-dire à ne rien tester.
 *
 * @param {{charge: object, compte: string, cle: string, origine: string,
 *   maintenant?: number}} options
 * @returns {string} le JWT compact
 */
export function signerJwt({ charge, compte, cle, origine, maintenant }) {
  const domaine = normaliserOrigine(origine)
  if (!domaine) throw new Error('google-wallet : origine invalide')

  const pem = normaliserCle(cle)
  if (!pem) throw new Error('google-wallet : clé privée illisible')

  const entete = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const revendications = base64url(
    JSON.stringify({
      iss: compte,
      aud: 'google',
      typ: 'savetowallet',
      iat: Number.isFinite(maintenant) ? Math.trunc(maintenant) : Math.floor(Date.now() / 1000),
      origins: [domaine],
      payload: charge,
    })
  )

  const signature = createSign('RSA-SHA256').update(`${entete}.${revendications}`).sign(pem)
  return `${entete}.${revendications}.${base64url(signature)}`
}

/** Le lien que le client touche. */
export function lienEnregistrement(jwt) {
  return `https://pay.google.com/gp/v/save/${jwt}`
}
