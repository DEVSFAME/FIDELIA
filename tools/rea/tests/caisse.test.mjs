/* ============================================================================
   A4 — tests du relevé de la file hors ligne de la caisse. Aucun réseau.

   Ces tests couvrent les quatre pièges encodés dans `caisse.mjs` et les trois
   faux positifs trouvés EN ÉCRIVANT l'instrument (voir les commentaires
   `MESURÉ)` : `cartes` et `tentatives` sont aussi des mots français, et
   `polyfills` contient un `new Set([1,2,3])` qui ressemble à une politique.
   ========================================================================== */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decoderEchappements,
  releverCaisse,
  proseCaisse,
  constanteDe,
  resoudre,
  magasinsIndexedDb,
  clesLocalStorage,
  politiqueRejeu,
  routesCaisse,
  cheminsHote,
  classerOccurrence,
  classerCorpus,
  calibrer,
  presence,
  presenceProse,
  TEMOINS_CAISSE,
  PROSE_CAISSE,
} from '../caisse.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ASSETS = join(RACINE, '01_REA_Fidelix/_captures/2026-10-26/raw/assets')
const CHUNK_FILE = join(ASSETS, '_next_static_chunks_6866-2c6ed19830232270.js')
const CHUNK_PAGE = join(ASSETS, '_next_static_chunks_app_caisse_page-e18fb03a63b24353.js')
const PAGES = join(RACINE, '01_REA_Fidelix/_captures/2026-10-26/raw/pages')

const lire = (p) => readFileSync(p, 'utf8')

/* Extrait RÉEL du chunk 6866, raccourci : noms de magasins et clés seulement,
   aucune donnée de client. */
const EXTRAIT_MAGASINS =
  'let k="file_attente",S="cartes";' +
  'function C(){return new Promise((e,t)=>{let a=indexedDB.open("fidelix-caisse",2);' +
  'a.onupgradeneeded=()=>{let e=a.result;' +
  'e.objectStoreNames.contains(k)||e.createObjectStore(k,{keyPath:"id"}),' +
  'e.objectStoreNames.contains(S)&&e.deleteObjectStore(S),' +
  'e.createObjectStore(S,{keyPath:"id"})}}}'

const EXTRAIT_POLITIQUE =
  'let O=new Set([400,403,404,422]),z=null;' +
  'function X(e){return e.filter(e=>e.tentatives>=3).length}' +
  'J.current&&eM.current&&(eM.current=setTimeout(()=>void eW(),65e3))'

/* ---------------------------------------------------------------------------
   1. Décodage des échappements — le témoin que le corpus écrit vraiment.
   ------------------------------------------------------------------------ */

test('decoderEchappements : un octet, puis une séquence de deux caractères', () => {
  assert.equal(decoderEchappements('d\\xe9duit'), 'déduit')
  // `\xc3\xa9` est DEUX échappements de caractère en JavaScript : « Ã© ».
  // Le recoller en « é » serait une interprétation d'octets, pas du JS.
  assert.equal(decoderEchappements('\\xc3\\xa9'), 'Ã©')
})

test('decoderEchappements : chaque échappement est un caractère, pas un octet', () => {
  // Le piège mesuré : décoder `\xe9` comme un octet UTF-8 donne U+FFFD.
  assert.equal(decoderEchappements('\\xe9'), 'é')
  assert.equal(decoderEchappements('\\xe9').length, 1)
  assert.equal(decoderEchappements('\\xc3\\xa9').length, 2)
})

test('decoderEchappements : texte sans échappement rendu tel quel', () => {
  const s = "en attente d'envoi"
  assert.equal(decoderEchappements(s), s)
})

test('decoderEchappements : un \\x incomplet reste littéral (pas d’invention)', () => {
  assert.equal(decoderEchappements('a\\xZZb'), 'a\\xZZb')
  assert.equal(decoderEchappements('\\xe'), '\\xe')
})

/* ---------------------------------------------------------------------------
   2. Relevé sans double comptage — la règle du plus long (§19.3).
   ------------------------------------------------------------------------ */

test('releverCaisse : /api/transaction/annuler ne compte pas aussi /api/transaction', () => {
  const s = 'fetch("/api/transaction/annuler",{method:"POST"})'
  const jetons = releverCaisse(s).map((x) => x.jeton)
  assert.deepEqual(jetons, ['/api/transaction/annuler'])
})

test('releverCaisse : deux contrats distincts restent deux relevés', () => {
  const s = 'f("/api/transaction");f("/api/transaction/annuler")'
  const jetons = releverCaisse(s).map((x) => x.jeton).sort()
  assert.deepEqual(jetons, ['/api/transaction', '/api/transaction/annuler'])
})

test('releverCaisse : le témoin négatif inventé ne sort jamais', () => {
  const jetons = releverCaisse('let x="' + TEMOINS_CAISSE.negatifMagasin + '"').map((x) => x.jeton)
  assert.deepEqual(jetons, [])
})

test('releverCaisse : une occurrence à la position 0 est relevée (régression A3)', () => {
  // Le bug de A3 venait d'un `break` au lieu de `continue` : tout ce qui était
  // dans les 13 premiers caractères du fichier disparaissait, en silence.
  const s = '"/api/transaction";x'
  assert.deepEqual(releverCaisse(s).map((x) => x.jeton), ['/api/transaction'])
})

/* ---------------------------------------------------------------------------
   3. Résolution d'un identifiant minifié — jamais deviné.
   ------------------------------------------------------------------------ */

test('constanteDe : trouve la déclaration, ignore les autres affectations', () => {
  assert.equal(constanteDe('let k="file_attente",S="cartes"', 'k'), 'file_attente')
  assert.equal(constanteDe('let k="file_attente",S="cartes"', 'S'), 'cartes')
  assert.equal(constanteDe('x=1', 'k'), null)
})

test('resoudre : littéral, constante, et null quand rien n’est lisible', () => {
  assert.equal(resoudre('', '"file_attente"'), 'file_attente')
  assert.equal(resoudre('k="file_attente"', 'k'), 'file_attente')
  assert.equal(resoudre('', 'e'), null)
  assert.equal(resoudre('', 'a.result'), null)
})

/* ---------------------------------------------------------------------------
   4. Magasins locaux — la mécanique. Ce ne sont PAS des contrats réseau.
   ------------------------------------------------------------------------ */

test('magasinsIndexedDb : base, version, magasins, et le magasin effacé à la montée', () => {
  const [base] = magasinsIndexedDb(EXTRAIT_MAGASINS)
  assert.equal(base.nom, 'fidelix-caisse')
  assert.equal(base.version, 2)
  assert.deepEqual(base.magasins.map((m) => m.nom), ['file_attente', 'cartes'])
  assert.equal(base.magasins.find((m) => m.nom === 'file_attente').effaceAupgrade, false)
  assert.equal(base.magasins.find((m) => m.nom === 'cartes').effaceAupgrade, true)
  assert.deepEqual(base.magasins.map((m) => m.keyPath), ['id', 'id'])
})

test('magasinsIndexedDb : sans indexedDB.open, aucun magasin inventé', () => {
  assert.deepEqual(magasinsIndexedDb('const a=1'), [])
})

test('magasinsIndexedDb : un nom non résoluble n’est pas inventé', () => {
  // `createObjectStore(t,…)` où `t` est un paramètre : on ne sait pas, on ne dit pas.
  const s = 'indexedDB.open("base",1);x.createObjectStore(t,{keyPath:"id"})'
  const [base] = magasinsIndexedDb(s)
  assert.deepEqual(base.magasins, [])
})

test('clesLocalStorage : clé littérale ET clé par variable, avec lectures/écritures', () => {
  const s =
    'let M="fidelix_caisse_programme";' +
    'localStorage.setItem(M,JSON.stringify(e));localStorage.getItem(M);' +
    'localStorage.setItem("fidelix_caisse_devise",s.devise)'
  const cles = clesLocalStorage(s)
  const prog = cles.find((c) => c.nom === 'fidelix_caisse_programme')
  assert.deepEqual({ e: prog.ecritures, l: prog.lectures }, { e: 1, l: 1 })
  assert.ok(cles.some((c) => c.nom === 'fidelix_caisse_devise'))
})

/* ---------------------------------------------------------------------------
   5. Politique de rejeu — ET son faux positif.
   ------------------------------------------------------------------------ */

test('politiqueRejeu : codes jetés, seuil de blocage, délai du rejeu', () => {
  const p = politiqueRejeu(EXTRAIT_POLITIQUE)
  assert.deepEqual(p.rejet, [400, 403, 404, 422])
  assert.equal(p.seuilBloque, 3)
  assert.deepEqual(p.delais.map((d) => d.ms), [65000])
})

test('politiqueRejeu : un Set qui n’est pas fait de codes HTTP est ÉCARTÉ', () => {
  // MESURÉ : `polyfills-*.js` contient `new Set([1,2,3])`. Sans ce garde, le
  // relevé annonçait une « politique » dans un polyfill (faux positif).
  const p = politiqueRejeu('let s=new Set([1,2,3])')
  assert.deepEqual(p.rejet, [])
  assert.equal(p.seuilBloque, null)
})

test('politiqueRejeu : absence rend une liste vide, jamais null', () => {
  const p = politiqueRejeu('rien')
  assert.deepEqual(p.rejet, [])
  assert.deepEqual(p.delais, [])
})


/* ---------------------------------------------------------------------------
   6. Classement par origine — le point de l'étape.
   ------------------------------------------------------------------------ */

test('classerOccurrence : une clé localStorage est un MAGASIN LOCAL, pas un contrat', () => {
  const s = 'localStorage.setItem("fidelix_caisse_programme",x)'
  const c = classerOccurrence(s, s.indexOf('fidelix_caisse_programme'), 'fidelix_caisse_programme')
  assert.equal(c.origine, 'magasin local')
})

test('classerOccurrence : une route /api est un contrat réseau', () => {
  const s = 'fetch("/api/transaction",{method:"POST"})'
  assert.equal(classerOccurrence(s, s.indexOf('/api/'), '/api/transaction').origine, 'contrat réseau')
})

test('classerOccurrence : /sw.js est une ressource de l’hôte, pas un contrat', () => {
  const s = 'navigator.serviceWorker.register("/sw.js")'
  assert.equal(classerOccurrence(s, s.indexOf('/sw.js'), '/sw.js').origine, 'hôte navigateur')
})

test('classerOccurrence : « tentatives » dans une chaîne est de la prose', () => {
  // MESURÉ : la page /login écrit « Trop de tentatives. Patientez une minute ».
  const prose = 'x="Trop de tentatives. Patientez une minute."'
  assert.equal(classerOccurrence(prose, prose.indexOf('tentatives'), 'tentatives').origine, 'prose')
  const code = 'x={tentatives:0}'
  assert.equal(classerOccurrence(code, code.indexOf('tentatives'), 'tentatives').origine, 'magasin local')
})

test('routesCaisse : une seule route est rejouée par la file', () => {
  const s = 'fetch("/api/transaction",{method:"POST"});fetch("/api/transaction/annuler",{method:"POST"})'
  const r = routesCaisse(s)
  assert.equal(r.filter((x) => x.enfilee).map((x) => x.route).join(','), '/api/transaction')
  assert.equal(r.find((x) => x.route === '/api/transaction/annuler').enfilee, false)
})

test('cheminsHote : /sw.js lu dans l’enregistrement du service worker', () => {
  assert.deepEqual(cheminsHote('navigator.serviceWorker.register("/sw.js").catch(()=>{})'), ['/sw.js'])
})

/* ---------------------------------------------------------------------------
   7. Corpus — le leurre, et le périmètre des contrats.
   ------------------------------------------------------------------------ */

const LEURRE = 'var x=localStorage.getItem("@supabase/auth-js")'
const PORTEUR = EXTRAIT_MAGASINS + ';fetch("/api/transaction",{method:"POST"});let O=new Set([400,404])'

test('classerCorpus : la bibliothèque auth-js ne produit NI magasin NI contrat', () => {
  const r = classerCorpus([{ fichier: '_next_static_chunks_44530001-x.js', source: LEURRE }])
  assert.equal(r.parFoyer['supabase auth-js'], 1)
  assert.equal(r.parOrigine['magasin local'], undefined)
  assert.deepEqual(r.routes, [])
  assert.deepEqual(r.magasins, [])
})

test('classerCorpus : les contrats ne viennent que du fichier qui porte la file', () => {
  const r = classerCorpus([
    { fichier: '_next_static_chunks_6866-x.js', source: PORTEUR },
    { fichier: '_next_static_chunks_9999-y.js', source: 'fetch("/api/branding/save",{method:"POST"})' },
  ])
  assert.deepEqual(r.routes.map((x) => x.route), ['/api/transaction'])
})

test('classerCorpus : le magasin de file est attribué à son fichier, pas au corpus', () => {
  const r = classerCorpus([{ fichier: '_next_static_chunks_6866-x.js', source: EXTRAIT_MAGASINS }])
  assert.equal(r.magasins.length, 1)
  assert.equal(r.magasins[0].fichier, '_next_static_chunks_6866-x.js')
  assert.ok(r.magasins[0].magasins.some((m) => m.nom === 'file_attente'))
})


/* ---------------------------------------------------------------------------
   8. Le corpus RÉEL — les mesures que la doc cite.
   ------------------------------------------------------------------------ */

const bundlesReels = () =>
  ['_next_static_chunks_6866-2c6ed19830232270.js', '_next_static_chunks_app_caisse_page-e18fb03a63b24353.js']
    .map((f) => ({ fichier: f, source: lire(join(ASSETS, f)) }))

test('réel : le chunk de la caisse porte la file, le bundle de la page n’en dit rien', () => {
  // C'EST LA MESURE DE L'ÉTAPE. Le fichier nommé `app/caisse/page-*.js` est
  // l'entrée de route : 6 464 o, aucun jeton de file. Chercher « dans le bundle
  // de la page » aurait conclu « pas de file » — faux.
  const [chunk, page] = bundlesReels()
  const jetonsChunk = releverCaisse(chunk.source).map((x) => x.jeton)
  assert.ok(jetonsChunk.includes('file_attente'))
  assert.ok(jetonsChunk.includes('fidelix-caisse'))
  assert.equal(releverCaisse(page.source).length, 0)
  assert.equal(proseCaisse(page.source).length, 0)
})

test('réel : la file est déclarée comme dépendance du bundle de la page', () => {
  // Le lien est explicite : `e.O(0,[…,6866,…])`. Ce n'est pas une supposition.
  const page = lire(CHUNK_PAGE)
  assert.match(page, /e\.O\(0,\[[0-9,]*,6866[0-9,]*\]/)
})

test('réel : le nom du magasin n’apparaît qu’une fois, et le magasin est bien mesuré', () => {
  // `file_attente` est écrit une seule fois (`k="file_attente"`) ; les autres
  // usages passent par la variable `k`. Un relevé par NOM sous-compte donc les
  // usages — c'est le magasin, résolu par la variable, qui fait foi.
  const source = lire(CHUNK_FILE)
  assert.equal(releverCaisse(source).filter((x) => x.jeton === 'file_attente').length, 1)
  const [base] = magasinsIndexedDb(source)
  assert.deepEqual(base.magasins.map((m) => m.nom), ['file_attente', 'cartes'])
})

test('réel : une seule page du corpus charge le chunk qui porte la file', () => {
  const chargeants = ['p09-caisse.html']
  assert.equal(chargeants.length, 1)
  assert.ok(lire(join(PAGES, 'p09-caisse.html')).includes('chunks/6866-'))
  const autres = ['p01-home.html', 'p08-login.html', 'p13-register.html']
  for (const f of autres) assert.ok(!lire(join(PAGES, f)).includes('chunks/6866-'), f)
})

test('réel : la page /caisse capturée montre l’activation, pas la file', () => {
  // Blocage B-3 : la caisse n'est pas appairée. La file est donc chargée mais
  // jamais rendue — et AUCUNE capture ne peut la montrer. C'est une lacune de
  // corpus, pas une absence de fonctionnalité (lesson §19).
  const html = lire(join(PAGES, 'p09-caisse.html'))
  assert.ok(html.includes('Activer cette caisse'))
  assert.ok(!html.includes("en attente d'envoi"))
  assert.ok(!html.includes('Solde au dernier passage'))
})

test('réel : calibration sur les 48 bundles anonymes — aucun écart', () => {
  const bundles = readdirSync(ASSETS)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => ({ fichier: f, source: lire(join(ASSETS, f)) }))
  const releve = classerCorpus(bundles)
  assert.deepEqual(calibrer({ bundles, releve }), [])
  assert.ok(presence(bundles, TEMOINS_CAISSE.positifMagasin))
  assert.ok(presenceProse(bundles, TEMOINS_CAISSE.positifProse))
  // Le MÊME témoin, écrit en UTF-8, ne sort pas du corpus brut : le bundle
  // écrit `\xeatre` (lesson §19.4 n°2). C'est le décodage qui le fait exister.
  assert.ok(!presence(bundles, 'ne peuvent pas être remises hors ligne'))
  assert.ok(presenceProse(bundles, 'ne peuvent pas être remises hors ligne'))
  assert.ok(presenceProse(bundles, PROSE_CAISSE[2]))
})

test('réel : l’instrument crie quand on lui retire la file (test de non-complaisance)', () => {
  // Un calibrateur qui ne peut pas échouer ne calibre rien.
  const ampute = [{ fichier: 'x.js', source: 'rien du tout' }]
  const ecarts = calibrer({ bundles: ampute, releve: classerCorpus(ampute) })
  assert.ok(ecarts.some((e) => /témoin positif ABSENT/.test(e)))
  assert.ok(ecarts.some((e) => /magasin de file introuvable/.test(e)))
  assert.ok(ecarts.some((e) => /politique de rejeu introuvable/.test(e)))
})
