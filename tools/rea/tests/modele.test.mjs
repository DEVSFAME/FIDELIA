import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodervaleurCookie,
  jetonDepuisCookies,
  accessTokenDepuisSession,
  chargeJwt,
  typeValeur,
  colonnesObservees,
  lireContentRange,
  resumerOpenapi,
  statutColonne,
  masquerUuid,
  classerLien,
} from '../modele.mjs'

/* ---------------------------------------------------------------------------
   1. Cookies Supabase — trois formes réelles, plus le découpage `.0` / `.1`.
   ------------------------------------------------------------------------ */

test('decodervaleurCookie : préfixe base64- (format @supabase/ssr)', () => {
  const json = '{"access_token":"a.b.c"}'
  const valeur = 'base64-' + Buffer.from(json).toString('base64url')
  assert.equal(decodervaleurCookie(valeur), json)
})

test('decodervaleurCookie : JSON en clair et URL-encodé', () => {
  assert.equal(decodervaleurCookie('{"a":1}'), '{"a":1}')
  assert.equal(decodervaleurCookie('%7B%22a%22%3A1%7D'), '{"a":1}')
})

test("jetonDepuisCookies : recompose les morceaux DANS L'ORDRE, ignore le bruit", () => {
  const json = '{"access_token":"x.y.z","refresh_token":"r"}'
  const b64 = Buffer.from(json).toString('base64url')
  const coupe = Math.floor(b64.length / 2)
  const cookies = [
    { name: 'lswt-abc', value: 'bruit' },
    { name: 'sb-rozago-auth-token.1', value: b64.slice(coupe) },
    { name: 'sb-rozago-auth-token.0', value: 'base64-' + b64.slice(0, coupe) },
  ]
  const { ref, valeur } = jetonDepuisCookies(cookies)
  assert.equal(ref, 'rozago')
  assert.equal(valeur, json)
})

test("jetonDepuisCookies : sans cookie d'auth, ne rend rien (et ne lève pas)", () => {
  assert.deepEqual(jetonDepuisCookies([{ name: 'lswt-x', value: '1' }]), { ref: null, valeur: null })
  assert.deepEqual(jetonDepuisCookies(), { ref: null, valeur: null })
})

test('accessTokenDepuisSession : objet, tableau, currentSession, invalides', () => {
  const jeton = 'aaa.bbb.ccc'
  assert.equal(accessTokenDepuisSession(JSON.stringify({ access_token: jeton })), jeton)
  assert.equal(accessTokenDepuisSession(JSON.stringify([{ access_token: jeton }])), jeton)
  assert.equal(accessTokenDepuisSession(JSON.stringify({ currentSession: { access_token: jeton } })), jeton)
  assert.equal(accessTokenDepuisSession('{"access_token":"pas-un-jwt"}'), null)
  assert.equal(accessTokenDepuisSession('pas du json'), null)
  assert.equal(accessTokenDepuisSession(null), null)
})

test('chargeJwt : décode la charge sans vérifier la signature', () => {
  const charge = { role: 'authenticated', ref: 'rozago', exp: 1793063792 }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jeton = `${b64({ alg: 'HS256' })}.${b64(charge)}.signature`
  assert.deepEqual(chargeJwt(jeton), charge)
  assert.equal(chargeJwt('nope'), null)
})

/* ---------------------------------------------------------------------------
   2. Colonnes — noms et types seulement, jamais les valeurs.
   ------------------------------------------------------------------------ */

test('typeValeur : distingue integer et number, null, array, object', () => {
  assert.equal(typeValeur(1), 'integer')
  assert.equal(typeValeur(1.5), 'number')
  assert.equal(typeValeur('x'), 'string')
  assert.equal(typeValeur(true), 'boolean')
  assert.equal(typeValeur(null), 'null')
  assert.equal(typeValeur([]), 'array')
  assert.equal(typeValeur({}), 'object')
})

test('colonnesObservees : union des clés, nullabilité constatée, aucune valeur retournée', () => {
  const cols = colonnesObservees([
    { id: 'secret-id', solde: 8, note: null },
    { id: 'autre-id', solde: 12.5 },
  ])
  const parNom = Object.fromEntries(cols.map((c) => [c.nom, c]))
  assert.deepEqual(parNom.id.types, ['string'])
  assert.deepEqual(parNom.solde.types, ['integer', 'number'])
  assert.equal(parNom.solde.nullable, false)
  assert.equal(parNom.note.nullable, true)
  assert.equal(parNom.note.presents, 1)
  assert.equal(parNom.note.lignes, 2)
  assert.ok(!JSON.stringify(cols).includes('secret-id'), 'aucune valeur ne doit fuiter')
})

test('colonnesObservees : tableau vide ou réponses non-objet', () => {
  assert.deepEqual(colonnesObservees([]), [])
  assert.deepEqual(colonnesObservees([null, 'x', 1]), [])
})

test('lireContentRange : plage pleine, ensemble vide, total inconnu', () => {
  assert.deepEqual(lireContentRange('0-2/309'), { debut: 0, fin: 2, total: 309 })
  assert.deepEqual(lireContentRange('*/0'), { debut: null, fin: null, total: 0 })
  assert.deepEqual(lireContentRange('*/5'), { debut: null, fin: null, total: 5 })
  assert.equal(lireContentRange("n'importe quoi"), null)
})

/* ---------------------------------------------------------------------------
   3. OpenAPI — tables et RPC, telles que déclarées pour le rôle courant.
   ------------------------------------------------------------------------ */

const SPEC = {
  definitions: {
    loyalty_programs: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        points_expiry_days: { type: 'integer', description: 'nullable' },
      },
    },
    classement_caisses: {
      properties: { p_restaurant: { type: 'string', format: 'uuid' }, p_limite: { type: 'integer' } },
    },
  },
  paths: {
    '/loyalty_programs': { get: {} },
    '/rpc/classement_caisses': {
      post: {
        parameters: [
          { in: 'body', name: 'args', schema: { $ref: '#/definitions/classement_caisses' } },
        ],
      },
    },
  },
}

test('resumerOpenapi : tables exposées, colonnes déclarées, méthodes', () => {
  const { tables } = resumerOpenapi(SPEC)
  assert.equal(tables.length, 1)
  assert.equal(tables[0].nom, 'loyalty_programs')
  assert.deepEqual(tables[0].methodes, ['GET'])
  assert.deepEqual(tables[0].colonnes.map((c) => c.nom), ['id', 'name', 'points_expiry_days'])
  assert.equal(tables[0].colonnes[0].format, 'uuid')
})

test('resumerOpenapi : RPC = POST seulement, arguments lus dans la définition', () => {
  const { rpc } = resumerOpenapi(SPEC)
  assert.equal(rpc.length, 1)
  assert.equal(rpc[0].nom, 'classement_caisses')
  assert.deepEqual(rpc[0].methodes, ['POST'])
  assert.deepEqual(
    rpc[0].arguments.map((a) => `${a.nom}:${a.type}`),
    ['p_restaurant:string', 'p_limite:integer'],
  )
})

test("resumerOpenapi : spécification vide → deux listes vides, pas d'exception", () => {
  assert.deepEqual(resumerOpenapi(), { tables: [], rpc: [] })
  assert.deepEqual(resumerOpenapi({ paths: {} }), { tables: [], rpc: [] })
})

/* ---------------------------------------------------------------------------
   4. Le verdict du lien client — la décision qui avait conclu « lien mort ».
   ------------------------------------------------------------------------ */

test('masquerUuid : aucun identifiant client ne sort dans une preuve', () => {
  const u = 'b365a328-1326-4e6c-bed6-213696be797a'
  assert.equal(masquerUuid(`/customers/${u}`), '/customers/:uuid')
  assert.equal(masquerUuid(`/customers/${u.toUpperCase()}`), '/customers/:uuid')
  assert.equal(masquerUuid('/customers/00000000-0000-4000-8000-000000000000'), '/customers/:uuid')
  assert.equal(masquerUuid(null), '')
})

const CONTRASTE_OK = { uuidNul: { statut: 404 }, routeInconnue: { statut: 404 } }
const FICHE = { statut: 200, octets: 92595, liens: 21 }

test('classerLien : fiche servie + contraste net ⇒ « route absente » est RÉFUTÉ', () => {
  const v = classerLien({ direct: FICHE, contrastes: CONTRASTE_OK, navigation: true })
  assert.match(v, /H1 RÉFUTÉE/)
  assert.match(v, /92595/)
})

test('classerLien : 404 avec l\'UUID réel ⇒ la route n\'est pas servie', () => {
  const v = classerLien({
    direct: { statut: 404, liens: 0 },
    contrastes: CONTRASTE_OK,
    page404: true,
    navigation: true,
  })
  assert.match(v, /n'est pas servie/)
})

test('classerLien : un dialogue visible l\'emporte (route interceptée)', () => {
  const v = classerLien({ dialogues: 1, direct: FICHE, contrastes: CONTRASTE_OK })
  assert.match(v, /H2 confirmée/)
})

test('classerLien : fiche servie SANS contraste ⇒ ne conclut pas', () => {
  const v = classerLien({ direct: FICHE, contrastes: { uuidNul: { statut: 404 } } })
  assert.match(v, /contraste incomplet/)
})

test('classerLien : un 404 sur UUID synthétique ne prouve JAMAIS l\'absence de route', () => {
  // C'est l'erreur de S3 : le 404 qualifiait l'identifiant, pas la route.
  const v = classerLien({
    direct: { statut: 200, octets: 92595, liens: 21 },
    contrastes: { uuidNul: { statut: 404 }, routeInconnue: { statut: 404 } },
  })
  assert.doesNotMatch(v, /lien mort/i)
})

test('classerLien : aucun effet observable, contenu de liste, navigation sans contenu', () => {
  assert.match(classerLien({}), /sans effet observable/)
  assert.match(classerLien({ memeContenuListe: true, navigation: true }), /LISTE Clients/)
  assert.match(classerLien({ navigation: true }), /sans contenu distinct/)
})


test("statutColonne : nomme l'écart entre observé et déclaré", () => {
  assert.equal(statutColonne(true, true), 'observée + déclarée')
  assert.equal(statutColonne(true, false), 'observée seule')
  assert.equal(statutColonne(false, true), 'déclarée seule (0 ligne renvoyée)')
  assert.equal(statutColonne(false, false), 'inconnue')
})
