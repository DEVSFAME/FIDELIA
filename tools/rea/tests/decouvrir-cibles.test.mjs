import { existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  comparer,
  decouvrir,
  estCible,
  extraireHrefs,
  lirePasse,
  normaliserChemin,
  parametrer,
  resumeMotif,
} from '../decouvrir-cibles.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const CAPTURES = resolve(ICI, '..', '..', '..', '01_REA_Fidelix', '_captures')

/* ---------------------------------------------------------------------------
   1. Extraction — les deux écritures d'un href Next.js.
   Un outil qui ne lit que l'attribut HTML rate la moitié des liens : mesuré
   sur S2, `/billing` et `/equipe` apparaissent aussi dans la charge RSC, avec
   un backslash LITTÉRAL (`href\":\"/equipe\"`).
   ------------------------------------------------------------------------ */

test('extraireHrefs : lit l’attribut HTML ET la charge RSC échappée', () => {
  const html =
    '<a href="/billing">Voir</a>' +
    '<script>self.__next_f.push([1,"{\\"href\\":\\"/equipe\\",\\"x\\":1}"])</script>'
  const refs = extraireHrefs(html)
  assert.deepEqual(refs.sort(), ['/billing', '/equipe'])
})

test('extraireHrefs : dédoublonne une même cible écrite deux fois', () => {
  const html = '<a href="/scan">a</a><a href="/scan">b</a><a href="/scan">c</a>'
  assert.deepEqual(extraireHrefs(html), ['/scan'])
})

/* ---------------------------------------------------------------------------
   2. Normalisation — une route interne, ou rien.
   ------------------------------------------------------------------------ */

test('normaliserChemin : garde l’interne, jette l’externe et le non-routable', () => {
  assert.equal(normaliserChemin('/billing'), '/billing')
  assert.equal(normaliserChemin('/customers/x?y=1#z'), '/customers/x')
  assert.equal(normaliserChemin('https://fidelix.ma/equipe?v=2'), '/equipe')
  assert.equal(normaliserChemin('https://wa.me/212600000000'), null)
  assert.equal(normaliserChemin('https://developers.google.com/maps'), null)
  assert.equal(normaliserChemin('mailto:a@b.c'), null)
  assert.equal(normaliserChemin('#ancre'), null)
  assert.equal(normaliserChemin(''), null)
})

test('normaliserChemin : refuse un autre hôte même en https', () => {
  // Le Supabase du produit n'est PAS une route du site : il ne doit jamais
  // devenir une cible de capture HTTP (il exige une apikey).
  assert.equal(normaliserChemin('https://rozagopjfkkblyxtjdgw.supabase.co/rest/v1/x'), null)
})

test('estCible : les assets ne sont pas des routes', () => {
  assert.equal(estCible('/billing'), true)
  assert.equal(estCible('/'), true)
  assert.equal(estCible('/_next/static/chunks/x.js'), false)
  assert.equal(estCible('/icon-192.png'), false)
  assert.equal(estCible('/manifest.webmanifest'), false)
  assert.equal(estCible('/sitemap.xml'), false)
})

test('parametrer : un UUID devient :id, un nombre long devient :n', () => {
  assert.equal(
    parametrer('/customers/b365a328-1326-4e6c-bed6-213696be797a'),
    '/customers/:id'
  )
  assert.equal(parametrer('/customers/00000000-0000-4000-8000-000000000000'), '/customers/:id')
  assert.equal(parametrer('/recompenses/impetus-fqvw'), '/recompenses/impetus-fqvw')
  assert.equal(parametrer('/tickets/1234567'), '/tickets/:n')
})

/* ---------------------------------------------------------------------------
   3. Agrégation — le motif doit rester vérifiable.
   ------------------------------------------------------------------------ */

const RENDU_A = {
  id: 'a01-dashboard',
  html:
    '<a href="/billing">Voir l’abonnement</a>' +
    '<a href="/customers">Clients</a>' +
    '<a href="/customers/b365a328-1326-4e6c-bed6-213696be797a">Fiche</a>' +
    '<a href="/_next/static/css/x.css">css</a>' +
    '<a href="https://wa.me/212600000000">wa</a>',
  reseau: {
    requetes: [
      { methode: 'GET', chemin: 'https://fidelix.ma/billing?…', type: 'fetch', statut: 200 },
      { methode: 'GET', chemin: 'https://fidelix.ma/customers?…', type: 'fetch', statut: 200 },
      { methode: 'POST', chemin: 'https://rozagopjfkkblyxtjdgw.supabase.co/rest/v1/rpc/x', type: 'fetch', statut: 200 },
      { methode: 'GET', chemin: 'https://fidelix.ma/icon-192.png', type: 'image', statut: 200 },
    ],
  },
}

test('decouvrir : agrège par motif et sépare Supabase du site', () => {
  const r = decouvrir({ rendus: [RENDU_A] })
  assert.equal(r.rendus, 1)
  const motifs = r.pages.map((e) => e.motif)
  assert.ok(motifs.includes('/billing'))
  assert.ok(motifs.includes('/customers'))
  // Deux écritures du même ID ne font pas deux routes.
  assert.ok(!motifs.includes('/customers/b365a328-1326-4e6c-bed6-213696be797a'))
  assert.equal(motifs.filter((m) => m === '/customers/:id').length, 1)
  // Les assets et l'externe ne sont jamais des cibles.
  assert.ok(!motifs.some((m) => m.endsWith('.css') || m.endsWith('.png')))
  // Supabase est nommé, mais hors périmètre de capture.
  assert.deepEqual(
    r.supabase.map((e) => e.chemin),
    ['/rest/v1/rpc/x']
  )
  assert.ok(r.ignores.length > 0)
})

test('decouvrir : le statut et la page source restent attachés à la cible', () => {
  const r = decouvrir({ rendus: [RENDU_A] })
  const billing = r.pages.find((e) => e.motif === '/billing')
  assert.deepEqual(billing.statuts, [200])
  assert.deepEqual(billing.pages, ['a01-dashboard'])
  assert.ok(billing.types.includes('href'))
  assert.ok(billing.types.includes('xhr'))
})

test('decouvrir : une route paramétrée garde un exemple, jamais l’identifiant seul', () => {
  const r = decouvrir({ rendus: [RENDU_A] })
  const fiche = r.pages.find((e) => e.motif === '/customers/:id')
  assert.equal(fiche.exemple, '/customers/b365a328-1326-4e6c-bed6-213696be797a')
})

test('decouvrir : deux UUID différents restent une seule cible', () => {
  const autre = {
    id: 'a02-program',
    html: '<a href="/customers/11111111-2222-4333-8444-555555555555">x</a>',
    reseau: null,
  }
  const r = decouvrir({ rendus: [RENDU_A, autre] })
  const fiches = r.pages.filter((e) => e.motif === '/customers/:id')
  assert.equal(fiches.length, 1)
  assert.equal(fiches[0].pages.length, 2)
})


test('decouvrir : la requête document de la page elle-même ne compte pas', () => {
  // Sans ce garde, /abonnement (capturé en 404) se « découvrait » lui-même et
  // le diff aurait déclaré connue une route qu'aucun lien ne pointe.
  const r = decouvrir({
    rendus: [
      {
        id: 'a14-abonnement',
        html: '<p>404</p>',
        reseau: {
          url: 'https://fidelix.ma/abonnement',
          requetes: [
            { methode: 'GET', chemin: 'https://fidelix.ma/abonnement', type: 'document', statut: 404 },
          ],
        },
      },
    ],
  })
  assert.deepEqual(r.pages, [])
  assert.ok(r.ignores.some((i) => i.raison.includes('auto-référence')))
})

/* ---------------------------------------------------------------------------
   4. Diff — « connue » n'est pas « nouvelle », et « non revue » n'est pas
   « morte » : une route peut n'être liée par aucune page (saisie directe, QR).
   ------------------------------------------------------------------------ */

test('comparer : sépare nouveautés, connues et cibles non revues', () => {
  const releve = decouvrir({ rendus: [RENDU_A] })
  const manifeste = {
    pages: [{ id: 'a16-billing', chemin: '/billing' }],
    sondes: [{ id: 'b06', chemin: '/api/scan/cards' }],
  }
  const d = comparer(releve, manifeste)
  assert.deepEqual(d.nouvelles.map((e) => e.motif).sort(), ['/customers', '/customers/:id'])
  assert.deepEqual(d.connues.map((e) => e.motif), ['/billing'])
  // La sonde n'a été vue dans aucun rendu : listée comme non revue, pas morte.
  assert.deepEqual(d.disparues.map((e) => e.motif), ['/api/scan/cards'])
})

test('comparer : une route paramétrée du manifeste matche l’UUID observé', () => {
  const releve = decouvrir({ rendus: [RENDU_A] })
  const manifeste = {
    pages: [{ id: 'a18', chemin: '/customers/00000000-0000-4000-8000-000000000000' }],
  }
  const d = comparer(releve, manifeste)
  assert.ok(!d.nouvelles.some((e) => e.motif === '/customers/:id'))
  assert.deepEqual(d.connues.map((e) => e.motif), ['/customers/:id'])
})

test('resumeMotif : lisible et sans donnée sensible', () => {
  const s = resumeMotif({ types: ['href', 'xhr'], occurrences: 18, pages: ['a', 'b'], statuts: [200] })
  assert.equal(s, 'href+xhr×18 · 2 page(s) · HTTP 200')
})

/* ---------------------------------------------------------------------------
   5. Mesure sur la capture RÉELLE (S2) — le test qui aurait attrapé un
   extracteur borgne. Ignoré si la capture n'est pas sur disque (preuves
   gitignorées), jamais contourné.
   ------------------------------------------------------------------------ */

const PASSE_S2 = join(CAPTURES, '2026-10-26-auth')
const s2Presente = () => existsSync(join(PASSE_S2, 'rendu'))

test('S2 réelle : les sous-routes découvertes sont retrouvées', async (t) => {
  if (!s2Presente()) return t.skip('capture S2 absente du disque')
  const rendus = await lirePasse(PASSE_S2)
  assert.equal(rendus.length, 13)
  const r = decouvrir({ rendus })
  const motifs = new Set(r.pages.map((e) => e.motif))
  for (const m of [
    '/billing',
    '/customers',
    '/customers/:id',
    '/equipe',
    '/notifications',
    '/settings',
    '/campaigns',
    '/api/commerce/actif',
  ]) {
    assert.ok(motifs.has(m), `${m} devrait être découvert dans les rendus S2`)
  }
  assert.ok(![...motifs].some((m) => m.startsWith('/_next/')))
})

test('S2 réelle : /abonnement et /account ne sont liés par AUCUNE page', async (t) => {
  if (!s2Presente()) return t.skip('capture S2 absente du disque')
  const r = decouvrir({ rendus: await lirePasse(PASSE_S2) })
  const motifs = new Set(r.pages.map((e) => e.motif))
  // Deux mesures indépendantes, même verdict : le HTML ne les lie pas, et la
  // capture HTTP les a vues en 404. L'hypothèse est morte deux fois.
  assert.ok(!motifs.has('/abonnement'))
  assert.ok(!motifs.has('/account'))
})

test('S3 : le manifeste couvre TOUTES les cibles découvertes en S2', async (t) => {
  if (!s2Presente()) return t.skip('capture S2 absente du disque')
  const { readFile } = await import('node:fs/promises')
  const manifeste = JSON.parse(await readFile(join(CAPTURES, 'cibles-auth-s3.json'), 'utf8'))
  const r = decouvrir({ rendus: await lirePasse(PASSE_S2) })
  const d = comparer(r, manifeste)
  // Si ce test tombe, une cible VUE a été oubliée dans le manifeste : c'est
  // exactement l'erreur que S3 doit rendre impossible.
  assert.deepEqual(d.nouvelles.map((e) => e.motif), [])
})

