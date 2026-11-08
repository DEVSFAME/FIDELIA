import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  finChaine,
  lireObjet,
  argumentDe,
  litterauxApi,
  manifestes,
  methodesDeclarees,
  corpsDeFetch,
  clesDeCorps,
  champsFormData,
  schemasClient,
  normaliserZod,
  agreger,
  calibrer,
  TEMOINS,
} from '../contrats.mjs'

/* ---------------------------------------------------------------------------
   1. Lecture de chaînes — le corpus est minifié, les échappements abondent.
   ------------------------------------------------------------------------ */

test('finChaine : s’arrête au bon guillemet, pas sur un guillemet échappé', () => {
  const s = '"a\\"b" + "c"'
  assert.equal(s.slice(0, finChaine(s, 0)), '"a\\"b"')
})

test('finChaine : gère l’apostrophe et l’apostrophe échappée', () => {
  const s = "'n\\'a pas" + "'x'"
  assert.equal(s.slice(0, finChaine(s, 0)), "'n\\'a pas'")
})

/* ---------------------------------------------------------------------------
   2. lireObjet — le cœur. Un décalage d’un caractère fausse TOUT le reste.
   ------------------------------------------------------------------------ */

test('lireObjet : clés de premier niveau seulement, valeurs imbriquées ignorées', () => {
  const s = '{a:1,b:{c:2,d:3},e:"x,y"}'
  const o = lireObjet(s, 0)
  assert.equal(o.clos, true)
  assert.deepEqual(o.entrees.map((e) => e.nom), ['a', 'b', 'e'])
})

test('lireObjet : une virgule dans une chaîne ne coupe pas l’entrée', () => {
  const o = lireObjet('{t:"a,b",n:1}', 0)
  assert.deepEqual(o.entrees.map((e) => e.nom), ['t', 'n'])
  assert.equal(o.entrees[0].valeur, '"a,b"')
})

test('lireObjet : une accolade dans une chaîne ne change pas la profondeur', () => {
  const o = lireObjet('{t:"{",n:1}', 0)
  assert.equal(o.clos, true)
  assert.deepEqual(o.entrees.map((e) => e.nom), ['t', 'n'])
})

test('lireObjet : objet non fermé ⇒ clos=false (jamais de faux objet)', () => {
  const o = lireObjet('{a:1,b:{c:2}', 0)
  assert.equal(o.clos, false)
})

test('lireObjet : un `...spread` conditionnel n’est PAS lu comme une clé', () => {
  const o = lireObjet('{name:a,...void 0!==r?{logo_url:r}:{},style:B}', 0)
  assert.deepEqual(o.entrees.map((e) => e.nom), ['name', 'void 0!==r?{logo_url:r}:{}', 'style'])
  assert.equal(o.entrees[1].etalement, true)
})

test('lireObjet : clé écrite entre guillemets, dé-quotée', () => {
  const o = lireObjet('{"Content-Type":"application/json"}', 0)
  assert.deepEqual(o.entrees.map((e) => e.nom), ['Content-Type'])
})

/* ---------------------------------------------------------------------------
   3. argumentDe — sépare l’URL des options, sans se perdre dans les virgules.
   ------------------------------------------------------------------------ */

test('argumentDe : deux arguments dont un objet imbriqué', () => {
  const s = 'fetch("/api/x",{method:"POST",headers:{a:1},body:JSON.stringify({b:2})})'
  const p = s.indexOf('(')
  assert.equal(argumentDe(s, p, 0).texte, '"/api/x"')
  assert.equal(argumentDe(s, p, 1).fin, s.length - 1)
  const opt = argumentDe(s, p, 1).texte
  assert.deepEqual(lireObjet(opt, 0).entrees.map((e) => e.nom), ['method', 'headers', 'body'])
})

test('argumentDe : argument inexistant ⇒ null', () => {
  const s = 'f(1)'
  assert.equal(argumentDe(s, s.indexOf('('), 1), null)
})

/* ---------------------------------------------------------------------------
   4. Littéraux et méthodes — et la distinction application / bibliothèque.
   ------------------------------------------------------------------------ */

test('litterauxApi : déduplique et ignore les chemins non /api/', () => {
  const s = 'a="/api/x";b="/api/x";c="/dashboard"'
  assert.deepEqual(litterauxApi(s).map((x) => x.url), ['/api/x'])
})

test('manifestes : `{path,method}` est une déclaration, pas un site d’appel', () => {
  const s = '(0,lib.H)({protect:[{path:"/api/email/welcome",method:"POST"}]})'
  const m = manifestes(s)
  assert.deepEqual(m.map((x) => [x.url, x.methode, x.genre]), [['/api/email/welcome', 'POST', 'manifeste']])
})

test('methodesDeclarees : fetch sans `method` = GET (défaut), pas POST', () => {
  const cs = methodesDeclarees('fetch("/api/commerce/actif",{cache:"no-store"})')
  assert.deepEqual(cs.map((c) => [c.url, c.methode]), [['/api/commerce/actif', 'GET']])
})

test('methodesDeclarees : POST direct reconnu', () => {
  const cs = methodesDeclarees('fetch("/api/transaction",{method:"POST",headers:{a:1}})')
  assert.deepEqual(cs.map((c) => [c.url, c.methode, c.genre]), [['/api/transaction', 'POST', 'fetch']])
})

/**
 * NON-RÉGRESSION — mesuré le 2026-10-27 : 7 `method:"POST"` du chunk 7383
 * appartiennent à supabase-js (`.insert()` construit `new R({method,url,body})`).
 * Ce ne sont pas des contrats Fidelix, et `url:s` n'est pas un littéral `/api/`.
 * Les compter fabriquerait 7 faux endpoints.
 */
test('methodesDeclarees : un POST de bibliothèque (postgrest .insert) n’est pas un contrat', () => {
  const s = 'return new R({method:"POST",url:s,headers:i,schema:this.schema,body:e})'
  assert.deepEqual(methodesDeclarees(s), [])
})

/**
 * NON-RÉGRESSION — `/api/broadcast` est un chemin de websocket dans cette même
 * bibliothèque ; S3 a mesuré **404** sur la route. Le littéral existe, le
 * contrat n’existe pas : les deux constats doivent rester séparés.
 */
test('leurre : le littéral /api/broadcast existe mais ne produit aucun contrat', () => {
  const s = 't.pathname="/api/broadcast";x({method:"POST",headers:i,body:JSON.stringify(t)})'
  assert.equal(litterauxApi(s).some((x) => x.url === '/api/broadcast'), true)
  assert.equal(methodesDeclarees(s).some((c) => c.url === '/api/broadcast'), false)
})

test('methodesDeclarees : route + fetch(<x>.route,{method:"POST"}) ⇒ POST, genre `route`', () => {
  const s =
    'var p={caisse:{route:"/api/caisse/appairer"}};fetch(a.route,{method:"POST",body:JSON.stringify({code:e})})'
  const c = methodesDeclarees(s).find((x) => x.url === '/api/caisse/appairer')
  assert.equal(c?.methode, 'POST')
  assert.equal(c?.genre, 'route')
})

test('methodesDeclarees : route déclarée SANS fetch POST ⇒ aucune méthode inventée', () => {
  assert.deepEqual(methodesDeclarees('var p={caisse:{route:"/api/caisse/appairer"}};'), [])
})

test('methodesDeclarees : helper générique `F(url,corps)` ⇒ POST des URL passées', () => {
  const s =
    'async function F(e,t){try{let s=await fetch(e,{method:"POST",headers:{a:1},body:JSON.stringify(t)});return s}catch(x){}}' +
    'F("/api/caisses/create",{label:y});F("/api/caisses/revoke",{id:t});'
  const urls = methodesDeclarees(s)
    .filter((c) => c.methode === 'POST')
    .map((c) => c.url)
    .sort()
  assert.deepEqual(urls, ['/api/caisses/create', '/api/caisses/revoke'])
})

test('methodesDeclarees : le manifeste prime sur une déduction plus faible', () => {
  const s = 'fetch("/api/liste-attente",{method:"POST"});({path:"/api/liste-attente",method:"POST"})'
  assert.equal(methodesDeclarees(s).find((c) => c.url === '/api/liste-attente').genre, 'manifeste')
})


/* ---------------------------------------------------------------------------
   5. Le corps — la seule partie jamais observée sur le fil.
   ------------------------------------------------------------------------ */

test('corpsDeFetch : clés de premier niveau d’un corps JSON', () => {
  const s = 'fetch("/api/notifications",{method:"POST",headers:{a:1},body:JSON.stringify({restaurant_id:s,title:a,body:b,cta_url:c||null})})'
  const c = corpsDeFetch(s, 0)
  assert.equal(c.genre, 'json')
  assert.deepEqual(c.cles.map((k) => k.nom), ['restaurant_id', 'title', 'body', 'cta_url'])
})

test('corpsDeFetch : tableau d’objets ⇒ clé + sous-clés', () => {
  const s = 'fetch("/api/rewards/save",{method:"POST",body:JSON.stringify({tiers:e.map(e=>({id:e.id,title:e.title,cost:Number(e.cost)}))})})'
  const c = corpsDeFetch(s, 0)
  assert.deepEqual(c.cles.map((k) => k.nom), ['tiers'])
  assert.deepEqual(c.cles[0].sousCles, ['id', 'title', 'cost'])
})

test('clesDeCorps : ternaire ⇒ toutes les branches, marquées', () => {
  const t = '"winback"===t?{a:1,b:2}:"x"===t?{a:1,c:3}:{a:1}'
  const cles = clesDeCorps(t)
  assert.deepEqual([...new Set(cles.map((k) => k.branche))], ['?', ':'])
  assert.equal(cles.filter((k) => k.branche === '?').length, 4)
})

test('corpsDeFetch : `...spread` conditionnel remonté en clé conditionnelle', () => {
  const s = 'fetch("/api/branding/save",{method:"POST",body:JSON.stringify({name:a,...void 0!==r?{logo_url:r}:{},style:B})})'
  const c = corpsDeFetch(s, 0)
  const spread = c.cles.find((k) => k.etalement)
  assert.equal(spread?.sousCles.includes('logo_url'), true)
})

test('corpsDeFetch : FormData ⇒ noms de champs `append`', () => {
  const s = 'let l=new FormData;l.append("file",e);l.append("kind",a);fetch("/api/branding/upload",{method:"POST",body:l})'
  const c = corpsDeFetch(s, s.indexOf('fetch('))
  assert.equal(c.genre, 'formdata')
  assert.deepEqual(c.cles.map((k) => k.nom), ['file', 'kind'])
})

test('corpsDeFetch : corps non littéral ⇒ `brut`, jamais une invention', () => {
  const s = 'fetch("/api/equipe/managers",{method:"DELETE",body:JSON.stringify(e)})'
  assert.equal(corpsDeFetch(s, 0).genre, 'brut')
})

test('corpsDeFetch : sans `body` ⇒ `aucun` (un GET n’a pas de corps)', () => {
  assert.equal(corpsDeFetch('fetch("/api/x",{cache:"no-store"})', 0).genre, 'aucun')
})

/* ---------------------------------------------------------------------------
   6. Schémas zod côté client — alias LUS dans le bundle, pas devinés.
   ------------------------------------------------------------------------ */

test('normaliserZod : appel ET propriété (z.coerce s’utilise en propriété)', () => {
  assert.equal(normaliserZod('i.Yj().min(3,"Requis")', 'i'), 'z.string().min(3,"Requis")')
  assert.equal(normaliserZod('i.au.number().min(2)', 'i'), 'z.coerce.number().min(2)')
  assert.equal(normaliserZod('i.k5(["a","b"])', 'i'), 'z.enum(["a","b"])')
  assert.equal(normaliserZod('i.eu("")', 'i'), 'z.literal("")')
})

test('schemasClient : un schéma de formulaire et ses champs', () => {
  const s = 'let C=i.Ik({title:i.Yj().min(3,"Titre trop court"),cta_url:i.Yj().url("URL invalide").optional()});'
  const sc = schemasClient(s)
  assert.equal(sc.length, 1)
  assert.deepEqual(sc[0].champs.map((c) => c.nom), ['title', 'cta_url'])
  assert.equal(sc[0].champs[0].zod, 'z.string().min(3,"Titre trop court")')
})

test('schemasClient : n’invente pas de schéma quand l’objet n’est pas fermé', () => {
  assert.deepEqual(schemasClient('let C=i.Ik({a:i.Yj()'), [])
})

/* ---------------------------------------------------------------------------
   7. Agrégation et calibration.
   ------------------------------------------------------------------------ */

test('agreger : une entrée par URL, méthode et corps réunis', () => {
  const source = 'fetch("/api/x",{method:"POST",body:JSON.stringify({a:1})})'
  const c = agreger([{ fichier: 'b.js', source }])
  assert.equal(c.length, 1)
  assert.equal(c[0].methodes[0].methode, 'POST')
  assert.deepEqual(c[0].corps[0].cles.map((k) => k.nom), ['a'])
})

test('calibrer : un corpus conforme ne produit aucun écart', () => {
  const source =
    'fetch("/api/commerce/actif",{cache:"no-store"});' +
    'fetch("/api/transaction",{method:"POST",body:JSON.stringify({a:1})});' +
    '({path:"/api/liste-attente",method:"POST"});' +
    't.pathname="/api/broadcast";'
  assert.deepEqual(calibrer(agreger([{ fichier: 'b.js', source }])), [])
})

test('calibrer : le témoin négatif qui ressort est signalé', () => {
  const source = `fetch("${TEMOINS.negatif}",{cache:"no-store"})`
  const ecarts = calibrer(agreger([{ fichier: 'b.js', source }]))
  assert.equal(ecarts.some((e) => e.includes('négatif')), true)
})

test('calibrer : un leurre classé POST est signalé', () => {
  const source =
    'fetch("/api/commerce/actif",{});fetch("/api/transaction",{method:"POST"});' +
    '({path:"/api/liste-attente",method:"POST"});fetch("/api/broadcast",{method:"POST"})'
  const ecarts = calibrer(agreger([{ fichier: 'b.js', source }]))
  assert.equal(ecarts.some((e) => e.includes('404')), true)
})

/**
 * NON-RÉGRESSION — mesuré le 2026-10-27 : la caisse choisit l'URL par un
 * ternaire. La première version n'acceptait qu'un littéral nu et perdait
 * `/api/caisse/parrainage-valide` et `/api/caisse/cadeau-filleul`.
 */
test('methodesDeclarees : URL choisie par un ternaire ⇒ les DEUX littéraux reçoivent la méthode', () => {
  const s =
    'fetch("cadeau"===e?"/api/caisse/cadeau-filleul":"/api/caisse/parrainage-valide",{method:"POST",body:JSON.stringify({cardId:x})})'
  const cs = methodesDeclarees(s)
  assert.deepEqual(cs.map((c) => c.url).sort(), ['/api/caisse/cadeau-filleul', '/api/caisse/parrainage-valide'])
  assert.equal(cs.every((c) => c.methode === 'POST'), true)
})

test('agreger : le corps est attribué à chaque branche du ternaire', () => {
  const source = 'fetch("a"===e?"/api/x":"/api/y",{method:"POST",body:JSON.stringify({cardId:x})})'
  const c = agreger([{ fichier: 'b.js', source }])
  assert.deepEqual(c.map((x) => x.url).sort(), ['/api/x', '/api/y'])
  assert.equal(c.every((x) => x.corps[0]?.cles[0]?.nom === 'cardId'), true)
})
