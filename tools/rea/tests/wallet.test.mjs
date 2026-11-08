/* ============================================================================
   A3 — tests du relevé wallet. Aucun réseau : on teste des décisions.

   Ces tests couvrent les trois pièges encodés dans `wallet.mjs`, plus deux
   bugs trouvés en les écrivant (voir les commentaires `BUG)`).
   ========================================================================== */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  occurrences,
  motIdentifiant,
  chaineContenant,
  expressionRoute,
  genreAppel,
  relever,
  foyer,
  classerOccurrence,
  classerCorpus,
  calibrer,
  presence,
  TEMOINS_WALLET,
} from '../wallet.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CHUNK_CARTE = join(
  RACINE,
  '01_REA_Fidelix/_captures/2026-10-27-a3/raw/assets/_next_static_chunks_app_card_%5BcardId%5D_page-198959bafc7eadc0.js',
)

/* ---------------------------------------------------------------------------
   1. Lecture : positions exactes, aucun doublon manqué.
   ------------------------------------------------------------------------ */

test('occurrences : insensible à la casse, tous les index, chevauchements compris', () => {
  assert.deepEqual(occurrences('Wallet wallet WALLET', 'wallet'), [0, 7, 14])
  assert.deepEqual(occurrences('walletwallet', 'wallet'), [0, 6])
  assert.deepEqual(occurrences('rien', 'wallet'), [])
})

test('motIdentifiant : rend le mot entier, pas la tranche', () => {
  const s = 'x={wallet_bg_url:y}'
  assert.equal(motIdentifiant(s, s.indexOf('wallet'), 6), 'wallet_bg_url')
})

test('chaineContenant : trouve le littéral, saute les échappements', () => {
  const s = 'f("a\\"wallet b", "c")'
  const lit = chaineContenant(s, s.indexOf('wallet'))
  assert.equal(lit.texte, 'a\\"wallet b')
})

test('chaineContenant : null quand la position est dans du code', () => {
  const s = '{wallet:1}'
  assert.equal(chaineContenant(s, s.indexOf('wallet')), null)
})

/* ---------------------------------------------------------------------------
   2. La route n'est pas le littéral.
      BUG trouvé en écrivant ces tests : la première version rendait
      `/api/wallet/apple/` pour la route `/statut`, parce qu'elle ignorait
      `.concat(`. Deux contrats distincts devenaient un seul.
   ------------------------------------------------------------------------ */

test('expressionRoute : assemble .concat(littéral + variable + littéral)', () => {
  const s = 'fetch("/api/wallet/apple/".concat(t,"/statut"))'
  const r = expressionRoute(s, s.indexOf('/api/'))
  assert.equal(r.route, '/api/wallet/apple/<var>/statut')
  assert.deepEqual(r.variables, ['t'])
})

test('expressionRoute : un littéral seul reste tel quel', () => {
  const s = 'x="/api/wallet/google/";'
  assert.equal(expressionRoute(s, s.indexOf('/api/')).route, '/api/wallet/google/')
})

test('expressionRoute : .concat de deux littéraux est recollé', () => {
  const s = '"/api/wallet" .concat("/apple/")'
  assert.equal(expressionRoute(s, s.indexOf('/api/')).route, '/api/wallet/apple/')
})

test('expressionRoute : les slashs des morceaux ne sont pas dédoublonnés', () => {
  // Le corpus n'écrit jamais `"/api/wallet/" + "/apple/"`, mais si c'était le
  // cas, la concaténation EST la vérité : on ne corrige pas l'URL en silence.
  const s = '"/api/wallet/" .concat("/apple/")'
  assert.equal(expressionRoute(s, s.indexOf('/api/')).route, '/api/wallet//apple/')
})

test('expressionRoute : le nom de la variable n’est PAS deviné', () => {
  const s = '"/api/wallet/apple/".concat(q)'
  const r = expressionRoute(s, s.indexOf('/api/'))
  assert.equal(r.route, '/api/wallet/apple/<var>')
  assert.deepEqual(r.variables, ['q'])
})

/* ---------------------------------------------------------------------------
   3. Le verbe d'appel décide du contrat.
   ------------------------------------------------------------------------ */

test('genreAppel : navigation, lecture JSON, lien', () => {
  const nav = 'window.location.href="/api/wallet/apple/".concat(t)'
  assert.equal(genreAppel(nav, nav.indexOf('/api/')), 'navigation')

  const lecture = 'await fetch("/api/wallet/apple/".concat(t,"/statut"),{cache:"no-store"})'
  assert.equal(genreAppel(lecture, lecture.indexOf('/api/')), 'fetch')

  const lien = '(0,r.jsx)("a",{href:"/api/wallet/apple/"})'
  assert.equal(genreAppel(lien, lien.indexOf('/api/')), 'lien')

  const rien = 'x("/api/wallet/apple/")'
  assert.equal(genreAppel(rien, rien.indexOf('/api/')), 'inconnu')
})

/* ---------------------------------------------------------------------------
   4. Foyer : le leurre auth-js ne doit JAMAIS devenir un contrat.
   ------------------------------------------------------------------------ */

test('foyer : reconnaît supabase auth-js, page applicative, chunk partagé', () => {
  assert.equal(foyer('throw Error("@supabase/auth-js: …")'), 'supabase auth-js')
  assert.equal(foyer('x=1', '_next_static_chunks_app__dashboard__branding_page-aa.js'), 'page applicative')
  assert.equal(foyer('x=1', '_next_static_chunks_44530001-aa.js'), 'chunk partagé')
})

test('classerCorpus : 20 « wallet » d’auth-js ne produisent AUCUNE route', () => {
  const source =
    'throw Error("@supabase/auth-js: No compatible Ethereum wallet interface on the window object");' +
    'let {chain:n,wallet:w}=e;' +
    'signInWithWeb3({chain:"solana",wallet:resolvedUserWallet})'
  const r = classerCorpus([{ fichier: '_next_static_chunks_44530001-aa.js', source }])
  assert.deepEqual(r.routes, [])
  assert.equal(r.parOrigine['supabase auth-js'], r.parFichier[0].total)
})

test('classerCorpus : un fichier applicatif qui appelle la route EST un contrat', () => {
  const source = 'window.location.href="/api/wallet/apple/".concat(t)'
  const r = classerCorpus([{ fichier: 'page-aa.js', source }])
  assert.deepEqual(
    r.routes.map((x) => [x.route, x.genres]),
    [['/api/wallet/apple/<var>', ['navigation']]],
  )
})

/* ---------------------------------------------------------------------------
   5. Un relevé = un jeton. Le plus long gagne, sinon `wallet` absorberait
      `wallet_bg_url`, `walletEnabled` et `Apple Wallet` — et le total
      ressemblerait à « wallet partout » (lesson §18.1).
   ------------------------------------------------------------------------ */

test('relever : wallet_bg_url ne compte pas aussi comme wallet', () => {
  assert.deepEqual(relever('{wallet_bg_url:s}').map((x) => x.jeton), ['wallet_bg_url'])
})

test('relever : walletEnabled et Apple Wallet restent des jetons distincts', () => {
  assert.deepEqual(relever('walletEnabled=!0;"Apple Wallet"').map((x) => x.jeton), [
    'walletEnabled',
    'Apple Wallet',
  ])
})

test('relever : deux occurrences voisines ne fusionnent pas', () => {
  const s = '"Apple Wallet" "Google Wallet" wallet'
  assert.deepEqual(relever(s).map((x) => x.jeton), ['Apple Wallet', 'Google Wallet', 'wallet'])
})

/* ---------------------------------------------------------------------------
   6. Rôle : la FORME du jeton décide, pas le contexte.
      BUG trouvé en écrivant ces tests : `taux_desinscription_wallet` était
      classé « prose » (il est dans une chaîne) alors que c'est une MESURE
      appelée par `rpc(...)`. Le contexte seul ne suffit pas.
   ------------------------------------------------------------------------ */

test('classerOccurrence : rpc("taux_desinscription_wallet") est une mesure', () => {
  const s = 't.rpc("taux_desinscription_wallet",{p_restaurant_id:s.id})'
  const o = classerOccurrence(s, s.indexOf('taux_'), 'taux_desinscription_wallet')
  assert.equal(o.origine, 'mesure')
})

test('classerOccurrence : un champ de design reste un champ, même hors chaîne', () => {
  const s = 'void 0!==s?{wallet_bg_url:s}:{}'
  const o = classerOccurrence(s, s.indexOf('wallet_bg_url'), 'wallet_bg_url')
  assert.equal(o.origine, 'champ')
})

test('classerOccurrence : la prose d’interface reste de la prose', () => {
  const s = 'children:"Ajouter \\xe0 Google Wallet"'
  assert.equal(classerOccurrence(s, s.indexOf('Google Wallet'), 'Google Wallet').origine, 'prose')
})

/* ---------------------------------------------------------------------------
   7. Régression sur le corpus RÉEL — le contrat de la page carte.
   ------------------------------------------------------------------------ */

const chunk = readFileSync(CHUNK_CARTE, 'utf8')

test('corpus réel : le chunk de la page carte déclare les TROIS routes', () => {
  const r = classerCorpus([{ fichier: CHUNK_CARTE.split('/').pop(), source: chunk }])
  const routes = r.routes.map((x) => `${x.route} [${x.genres.join('+')}]`).sort()
  assert.deepEqual(routes, [
    '/api/wallet/apple/<var> [navigation]',
    '/api/wallet/apple/<var>/statut [fetch]',
    '/api/wallet/google/<var> [navigation]',
  ])
})

test('corpus réel : aucune route de format de pass dans le chunk carte', () => {
  assert.equal(presence([{ source: chunk }], 'pkpass'), false)
  assert.equal(presence([{ source: chunk }], 'passTypeIdentifier'), false)
})

test('corpus réel : le témoin prose doit être cherché ÉCHAPPÉ, comme il est écrit', () => {
  // Bug d'instrument : le premier témoin était en UTF-8 (`Ajouter à …`), le
  // bundle minifié porte `Ajouter \xe0 …`. Le témoin échouait sans que rien
  // ne soit faux dans le corpus.
  assert.equal(presence([{ source: chunk }], 'Ajouter \\xe0 Apple Wallet'), true)
  assert.equal(presence([{ source: chunk }], 'Ajouter à Apple Wallet'), false)
})

/* ---------------------------------------------------------------------------
   8. Calibration : si un témoin négatif sort, on doit le VOIR.
   ------------------------------------------------------------------------ */

test('calibrer : un corpus sans témoin positif est refusé', () => {
  const ecarts = calibrer({ bundles: [{ source: 'rien' }], routes: [] })
  assert.ok(ecarts.length >= 3, `attendu ≥ 3 écarts, reçu ${ecarts.length}`)
})

test('calibrer : pkpass dans le corpus est signalé', () => {
  const bundles = [
    { source: `"${TEMOINS_WALLET.positifRoute}"` },
    { source: `"${TEMOINS_WALLET.positifChamp}"` },
    { source: `"${TEMOINS_WALLET.positifProse}"` },
    { source: 'x="pkpass"' },
  ]
  const routes = [{ route: '/api/wallet/apple/<var>' }]
  assert.ok(calibrer({ bundles, routes }).some((e) => e.includes('négatif')))
})

test('calibrer : un corpus conforme ne produit aucun écart', () => {
  const bundles = [
    { source: `"${TEMOINS_WALLET.positifRoute}"` },
    { source: `"${TEMOINS_WALLET.positifChamp}"` },
    { source: `"${TEMOINS_WALLET.positifProse}"` },
  ]
  assert.deepEqual(calibrer({ bundles, routes: [{ route: '/api/wallet/apple/<var>' }] }), [])
})
