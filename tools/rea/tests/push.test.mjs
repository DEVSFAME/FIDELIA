/* ============================================================================
   P0-2b — le web push : l'opt-in, ses cinq états, et ses refus.

   Ce que ce fichier empêche :
     1. **un prompt au chargement.** `requestPermission()` appelé au montage est
        le moyen le plus sûr d'obtenir un refus définitif ; le test vérifie que
        l'appel n'existe que dans le gestionnaire de clic ;
     2. **un jeton orphelin.** Si le `POST` échoue, le `PushSubscription` doit
        être annulé : sans cela le navigateur reste abonné à un serveur qui ne
        connaît pas la carte ;
     3. **une clé VAPID mal convertie.** La conversion base64url → `Uint8Array`
        est comparée à la clé **réellement servie** par la cible : 87 caractères,
        65 octets, premier octet `0x04` (point P-256 non compressé) ;
     4. **un corps de `POST` qui dérive.** La cible envoie exactement quatre
        champs, dans cet ordre ;
     5. **une promesse de proximité.** Le canal des messages ne doit jamais se
        présenter comme la notification « à proximité » — c'est un géorepérage
        Wallet, et le confondre ferait attendre une alerte que ce bouton ne
        produira jamais.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ETATS,
  ETATS_REPONSE,
  CLE_REPLI_PREFIXE,
  analyserAbonnement,
  cleDepuisBase64url,
  cleStockage,
  corpsAbonnement,
  etatDepuisReponse,
  etatInitial,
  lireCleVapid,
  messageRefus,
} from '../../../web/src/lib/push.mjs'
import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const COMPOSANT = readFileSync(
  join(RACINE, 'web', 'src', 'components', 'carte', 'ActiverNotifications.jsx'),
  'utf8'
)

/** La clé publique que la cible sert réellement dans son bundle. */
const CLE_CIBLE =
  'BE-QOObuNEdKWyAJ3RoU3B6aoB08vEMw1-rUEG968o9a5YnwM4p8cSdeiU_3dRUPjglOuNGJGQLo4VJoHHfnmYE'

const CARTE = '0b7c3f6a-1d2e-4f5a-9c8b-7a6d5e4f3c2b'
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop'
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
const AUTH = 'tBHItJI5svbpez7KI4CCXg'

test('push — la clé de la cible se convertit en 65 octets, préfixe 0x04', () => {
  // Témoin mesuré : c'est la clé du chunk `card/[cardId]/page-198959ba….js`.
  assert.equal(CLE_CIBLE.length, 87)
  const octets = cleDepuisBase64url(CLE_CIBLE)
  assert.ok(octets instanceof Uint8Array)
  assert.equal(octets.length, 65)
  assert.equal(octets[0], 0x04, 'un point P-256 non compressé commence par 0x04')
})

test('push — une clé absente ou mal formée n’est pas une clé', () => {
  for (const vide of ['', '   ', null, undefined, 42]) {
    assert.equal(lireCleVapid(vide), null, `« ${String(vide)} » devrait être refusé`)
    assert.equal(cleDepuisBase64url(vide), null)
  }
  // Jeu de caractères : base64url seulement.
  assert.equal(lireCleVapid('A'.repeat(86) + '+'), null, 'le `+` n’est pas du base64url')
  assert.equal(lireCleVapid(CLE_CIBLE + 'A'.repeat(20)), null, 'clé trop longue')
})

test('push — le repli est mémorisé par carte', () => {
  assert.equal(CLE_REPLI_PREFIXE, 'push-optin-')
  assert.equal(cleStockage(CARTE), `push-optin-${CARTE}`)
  assert.notEqual(cleStockage(CARTE), cleStockage('autre-carte'))
})

test('push — les cinq états, et `denied` qui court-circuite', () => {
  assert.deepEqual(Object.values(ETATS).sort(), [
    'abonne',
    'abonnement',
    'chargement',
    'inactif',
    'nonSupporte',
    'refuse',
  ])

  assert.equal(etatInitial({}), ETATS.nonSupporte, 'sans support, rien à proposer')
  assert.equal(etatInitial({ supporte: true }), ETATS.inactif)
  assert.equal(etatInitial({ supporte: true, abonne: true }), ETATS.abonne)
  // `denied` gagne même si un abonnement traîne encore : on ne redemande rien.
  assert.equal(
    etatInitial({ supporte: true, permission: 'denied', abonne: true }),
    ETATS.refuse
  )
})

test('push — le corps accepté est exactement celui de la cible', () => {
  const lu = analyserAbonnement({
    card_id: CARTE,
    endpoint: `  ${ENDPOINT}  `,
    p256dh: P256DH,
    auth: AUTH,
    // Champ inconnu : il ne doit pas être recopié dans ce qu'on écrit.
    inutile: 'x',
    42: 'non',
  })

  assert.equal(lu.etat, 'ok')
  assert.equal(lu.endpoint, ENDPOINT, 'les espaces de bord sont retirés')
  assert.deepEqual(Object.keys(corpsAbonnement(lu)), ['card_id', 'endpoint', 'p256dh', 'auth'])
  assert.deepEqual(corpsAbonnement(lu), {
    card_id: CARTE,
    endpoint: ENDPOINT,
    p256dh: P256DH,
    auth: AUTH,
  })
})

test('push — un refus par champ, jamais un fourre-tout', () => {
  const base = { card_id: CARTE, endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH }

  assert.equal(analyserAbonnement({ ...base, card_id: 'test' }).code, 'carte')
  assert.equal(analyserAbonnement({ ...base, card_id: undefined }).code, 'carte')

  // `http://` n'est pas un service de push — et une URL absente non plus.
  assert.equal(analyserAbonnement({ ...base, endpoint: 'http://exemple.test/x' }).code, 'endpoint')
  assert.equal(analyserAbonnement({ ...base, endpoint: 'https://' }).code, 'endpoint')
  assert.equal(analyserAbonnement({ ...base, endpoint: '' }).code, 'endpoint')

  assert.equal(analyserAbonnement({ ...base, p256dh: 'court' }).code, 'p256dh')
  assert.equal(analyserAbonnement({ ...base, p256dh: `${P256DH}+` }).code, 'p256dh')

  assert.equal(analyserAbonnement({ ...base, auth: 'abc' }).code, 'auth')
  assert.equal(analyserAbonnement({ ...base, auth: `${AUTH}*` }).code, 'auth')

  // Rien du tout : c'est la carte qui manque, et c'est ce qu'on nomme.
  assert.equal(analyserAbonnement(null).code, 'carte')
  assert.equal(analyserAbonnement('texte').code, 'carte')
})

test('push — un statut inconnu n’est pas rapproché d’un cas connu', () => {
  assert.equal(etatDepuisReponse(200), ETATS_REPONSE.ok)
  assert.equal(etatDepuisReponse(400), ETATS_REPONSE.abonnementInvalide)
  assert.equal(etatDepuisReponse(404), ETATS_REPONSE.carteInconnue)
  assert.equal(etatDepuisReponse(409), ETATS_REPONSE.plafondAtteint)
  // 503, 418, 302 : rien de mesuré, donc « indisponible » et pas une cause inventée.
  for (const statut of [503, 418, 302, 500]) {
    assert.equal(etatDepuisReponse(statut), ETATS_REPONSE.indisponible, `statut ${statut}`)
  }
  assert.equal(messageRefus(ETATS_REPONSE.ok), null)
})

test('push — les messages de refus existent dans le dictionnaire', () => {
  const table = dictionnaire('fr')
  for (const etat of [
    ETATS_REPONSE.carteInconnue,
    ETATS_REPONSE.plafondAtteint,
    ETATS_REPONSE.abonnementInvalide,
    ETATS_REPONSE.indisponible,
  ]) {
    const cle = messageRefus(etat)
    assert.ok(cle, `aucune clé pour l’état « ${etat} »`)
    assert.equal(typeof table[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }
})

test('push — la promesse du canal n’est jamais la proximité', () => {
  const table = dictionnaire('fr')
  const textes = Object.entries(table)
    .filter(([cle]) => cle.startsWith('carte.push.'))
    .map(([, valeur]) => valeur)

  assert.ok(textes.length >= 10, 'le bloc d’opt-in a perdu ses textes')
  for (const texte of textes) {
    assert.equal(/proximit/i.test(texte), false, `« ${texte} » parle de proximité`)
    assert.equal(/près de chez/i.test(texte), false, `« ${texte} » promet un passage`)
  }

  // La mise au point existe, elle, et elle est explicite : c'est la phrase qui
  // empêche de lire le bouton comme « prévenez-moi quand je passe devant ».
  assert.match(table['page.carte.proximite'], /n’active pas la notification de proximité/)
})

test('push — le composant n’a pas de prompt automatique, et désabonne sur échec', () => {
  // L'appel doit vivre **dans** `abonner`, jamais dans un `useEffect`.
  const demande = COMPOSANT.indexOf('await Notification.requestPermission()')
  const gestionnaire = COMPOSANT.indexOf('const abonner = useCallback')
  assert.ok(demande > 0, 'le clic ne demande pas la permission')
  assert.ok(gestionnaire > 0, 'le gestionnaire de clic a disparu')
  assert.ok(demande > gestionnaire, 'la permission est demandée hors du clic')

  // L'état se lit sans enregistrer de service worker.
  assert.match(COMPOSANT, /navigator\.serviceWorker\s*\.getRegistration\(\)/)
  // Et un `POST` raté annule l'abonnement navigateur.
  assert.match(COMPOSANT, /await abonnement\.unsubscribe\(\)/)
  // Sans clé, rien ne s'affiche : pas de jeton orphelin.
  assert.match(COMPOSANT, /if \(cle === null\) return undefined/, 'le canal reste muet sans clé')
  assert.match(COMPOSANT, /if \(cle === null \|\| etat === ETATS\.chargement/)
})
