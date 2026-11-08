/* ============================================================================
   P0-5 — Google Wallet : de la carte au lien signé, sans réseau.

   Ce que ce fichier empêche :
     1. **un JWT mal signé** — la signature est vérifiée avec la clé **publique**
        (RS256), pas seulement « le jeton a trois parties » : un jeton qui
        ressemble à un JWT et que Google refuse (`INVALID_SIGNATURE`) serait le
        pire des faux succès ;
     2. **un code-barres qui n'est pas notre jeton** — c'était U1 chez Apple ;
        ici c'est une garantie, et elle est testée : `barcode.value` =
        `card_token`, donc `/scan` reste inchangé ;
     3. **un jeton complet affiché** — `accountId` ne doit porter que quatre
        caractères : un pass se lit par-dessus une épaule ;
     4. **un appel réseau sans configuration** — le drapeau `WALLET_ENABLED`
        éteint gagne même avec des identifiants valides ;
     5. **une clé mal collée** — un `.env` n'a pas de retours à la ligne, la clé
        y est donc en `\n` littéraux ; sans normalisation, `createSign` lève un
        message qui n'aide personne.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'

import {
  CLES_ENV,
  SUFFIXE_CLASSE,
  base64url,
  construireChargeUtile,
  construireObjet,
  identifiantClasse,
  identifiantObjet,
  lienEnregistrement,
  lireConfiguration,
  normaliserCle,
  normaliserOrigine,
  signerJwt,
  suffixeObjet,
} from '../../../web/src/lib/google-wallet.mjs'

/** Paire jetable : la clé de test n'a aucune valeur, elle ne quitte pas ce fichier. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const CLE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const CARTE = {
  issuerId: '3388000000012345678',
  cardId: '0b7c3f6a-1d2e-4f5a-9c8b-7a6d5e4f3c2b',
  token: 'AB12CD34EF56GH78',
  points: 42,
  prenom: 'Sonia',
  programme: { nom: 'Café Fidèle', seuil: 50 },
}

const decoder = (partie) => JSON.parse(Buffer.from(partie, 'base64').toString('utf8'))

test('google-wallet — une configuration incomplète n’est pas prête', () => {
  const config = lireConfiguration({})
  assert.equal(config.pret, false)
  assert.deepEqual(config.manquantes, [
    `${CLES_ENV.actif}=true`,
    CLES_ENV.issuerId,
    CLES_ENV.compte,
    CLES_ENV.cle,
    CLES_ENV.origine,
  ])
})

test('google-wallet — le drapeau éteint gagne, même complet', () => {
  const complet = {
    WALLET_ENABLED: 'false',
    GOOGLE_WALLET_ISSUER_ID: '3388000000012345678',
    GOOGLE_WALLET_SERVICE_ACCOUNT: 'wallet@projet.iam.gserviceaccount.com',
    GOOGLE_WALLET_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    GOOGLE_WALLET_ORIGIN: 'fidelia.ma',
  }
  const config = lireConfiguration(complet)
  assert.equal(config.pret, false)
  assert.equal(config.issuerId, '3388000000012345678', 'les valeurs restent lisibles, elles ne sont pas utilisées')
})

test('google-wallet — une clé PEM en `\\n` littéraux est réparée', () => {
  const enLigne = CLE.replace(/\n/g, '\\n')
  assert.equal(normaliserCle(enLigne), CLE)
  assert.equal(normaliserCle('n’importe quoi'), null, 'sans BEGIN, ce n’est pas une clé')
  assert.equal(normaliserCle(''), null)
})

test('google-wallet — les identifiants respectent le format `{issuerId}.{suffixe}`', () => {
  assert.equal(suffixeObjet(CARTE.cardId), 'carte_0b7c3f6a1d2e4f5a9c8b7a6d5e4f3c2b')
  assert.match(suffixeObjet(CARTE.cardId), /^[A-Za-z0-9_-]+$/, 'aucun tiret d’UUID ne doit rester')
  assert.equal(identifiantObjet(CARTE.issuerId, CARTE.cardId), `3388000000012345678.carte_0b7c3f6a1d2e4f5a9c8b7a6d5e4f3c2b`)
  assert.equal(identifiantClasse(CARTE.issuerId), `3388000000012345678.${SUFFIXE_CLASSE}`)
})

test('google-wallet — l’objet porte notre jeton en code-barres, et rien de trop', () => {
  const objet = construireObjet(CARTE)

  assert.equal(objet.barcode.type, 'QR_CODE')
  assert.equal(objet.barcode.value, CARTE.token, 'le QR doit être le jeton que /scan sait lire')
  assert.equal(objet.state, 'ACTIVE')
  assert.equal(objet.accountName, 'Sonia')
  assert.equal(objet.points.label, 'Points')
  assert.equal(objet.points.balance.string, '42')
  assert.deepEqual(objet.textModulesData, [
    { id: 'seuil', header: 'Prochaine récompense', body: '50 points' },
  ])
  assert.equal(objet.hexBackgroundColor, undefined, 'aucune charte inventée')

  // Le jeton complet n'apparaît pas dans les champs affichés.
  assert.equal(objet.accountId, 'GH78')
  assert.equal(objet.accountId.length, 4)
  assert.equal(JSON.stringify({ ...objet, barcode: { ...objet.barcode, value: '' } }).includes(CARTE.token), false)
})

test('google-wallet — pas de seuil, pas de module ; prénom vide, libellé neutre', () => {
  const objet = construireObjet({ ...CARTE, programme: { nom: 'X', seuil: 0 }, prenom: '   ' })
  assert.equal(objet.textModulesData, undefined)
  assert.equal(objet.accountName, 'Client')
})

test('google-wallet — la proximité devient `merchantLocations`, sans rayon', () => {
  const objet = construireObjet({
    ...CARTE,
    programme: { nom: 'Café Fidèle', seuil: 50, latitude: 33.5731, longitude: -7.5898, rayon: 600 },
  })

  const lieux = objet.merchantLocations
  assert.ok(Array.isArray(lieux), 'aucun emplacement dans le pass')
  assert.ok(lieux.length >= 2, 'le comptoir et l’anneau doivent être posés')
  assert.ok(lieux.length <= 10, 'Google refuse un pass de plus de dix emplacements')

  // Le format Google : deux nombres, et **rien d'autre**.
  for (const lieu of lieux) {
    assert.deepEqual(Object.keys(lieu).sort(), ['latitude', 'longitude'])
    assert.equal(typeof lieu.latitude, 'number')
  }
  assert.deepEqual(lieux[0], { latitude: 33.5731, longitude: -7.5898 })
})

test('google-wallet — sans coordonnées, aucune clé `merchantLocations`', () => {
  // Une clé posée à `[]` ferait un pass « géolocalisé nulle part » ; l'absence
  // dit la vérité : la proximité est désactivée.
  assert.equal(construireObjet(CARTE).merchantLocations, undefined)
  assert.equal(
    construireObjet({ ...CARTE, programme: { nom: 'X', latitude: null, longitude: null } })
      .merchantLocations,
    undefined
  )
})

test('google-wallet — un seul objet par JWT, comme l’exige Google', () => {
  const charge = construireChargeUtile(construireObjet(CARTE))
  assert.deepEqual(Object.keys(charge), ['loyaltyObjects'])
  assert.equal(charge.loyaltyObjects.length, 1)
})

test('google-wallet — l’origine est un domaine, pas une URL', () => {
  assert.equal(normaliserOrigine('https://fidelia.ma/'), 'fidelia.ma')
  assert.equal(normaliserOrigine('http://www.fidelia.ma'), 'www.fidelia.ma')
  assert.equal(normaliserOrigine('fidelia.ma'), 'fidelia.ma')
  assert.equal(normaliserOrigine('   '), null)
  assert.equal(normaliserOrigine(undefined), null)
})

test('google-wallet — le JWT a les revendications mesurées, et une signature qui vérifie', () => {
  const jwt = signerJwt({
    charge: construireChargeUtile(construireObjet(CARTE)),
    compte: 'wallet@projet.iam.gserviceaccount.com',
    cle: CLE,
    origine: 'https://fidelia.ma',
    maintenant: 1_900_000_000,
  })

  const parties = jwt.split('.')
  assert.equal(parties.length, 3)

  assert.deepEqual(decoder(parties[0]), { alg: 'RS256', typ: 'JWT' })

  const revendications = decoder(parties[1])
  assert.equal(revendications.iss, 'wallet@projet.iam.gserviceaccount.com')
  assert.equal(revendications.aud, 'google')
  assert.equal(revendications.typ, 'savetowallet')
  assert.equal(revendications.iat, 1_900_000_000)
  assert.deepEqual(revendications.origins, ['fidelia.ma'])
  assert.equal(revendications.payload.loyaltyObjects[0].barcode.value, CARTE.token)

  // La preuve : la clé PUBLIQUE valide ce que la clé privée a signé.
  const verifieur = createVerify('RSA-SHA256')
  verifieur.update(`${parties[0]}.${parties[1]}`)
  assert.equal(
    verifieur.verify(publicKey, Buffer.from(parties[2], 'base64')),
    true,
    'signature invalide : Google répondrait INVALID_SIGNATURE'
  )
})

test('google-wallet — même entrée, même jeton ; une signature altérée ne vérifie pas', () => {
  const options = {
    charge: construireChargeUtile(construireObjet(CARTE)),
    compte: 'wallet@projet.iam.gserviceaccount.com',
    cle: CLE,
    origine: 'fidelia.ma',
    maintenant: 1_900_000_000,
  }
  const premier = signerJwt(options)
  assert.equal(signerJwt(options), premier, 'avec un iat figé, la signature est déterministe')

  const parties = premier.split('.')
  const falsifie = `${parties[0]}.${base64url(
    JSON.stringify({ ...decoder(parties[1]), origins: ['attaquant.example'] })
  )}.${parties[2]}`
  const verifieur = createVerify('RSA-SHA256')
  verifieur.update(`${falsifie.split('.')[0]}.${falsifie.split('.')[1]}`)
  assert.equal(verifieur.verify(publicKey, Buffer.from(parties[2], 'base64')), false)
})

test('google-wallet — une configuration incomplète lève, elle ne signe pas', () => {
  assert.throws(() => signerJwt({ charge: {}, compte: 'a@b.c', cle: CLE, origine: '' }), /origine invalide/)
  assert.throws(
    () => signerJwt({ charge: {}, compte: 'a@b.c', cle: 'pas-une-cle', origine: 'fidelia.ma' }),
    /clé privée illisible/
  )
})

test('google-wallet — le lien est celui de Google, et rien d’autre', () => {
  assert.equal(lienEnregistrement('AAA.BBB.CCC'), 'https://pay.google.com/gp/v/save/AAA.BBB.CCC')
})
