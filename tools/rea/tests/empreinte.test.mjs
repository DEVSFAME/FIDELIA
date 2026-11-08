import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  empreinteContenu,
  normaliser,
  sha256,
  zonesDivergence,
} from '../empreinte.mjs'

/* ---------------------------------------------------------------------------
   1. Normalisation — bornée à ce qui a été MESURÉ comme bruit de build.
   ------------------------------------------------------------------------ */

test('normaliser : neutralise buildId sous ses trois écritures', () => {
  for (const html of [
    '{"buildId":"abc123"}',
    "build_id='abc123'",
    '{"dplId": "dpl_abc"}',
  ]) {
    const { texte, remplacements } = normaliser(Buffer.from(html))
    assert.equal(remplacements, 1, html)
    assert.ok(texte.includes('buildId:"<build>"'), texte)
    assert.ok(!texte.includes('abc'), texte)
  }
})

test('normaliser : ne touche PAS au contenu de la page', () => {
  // Une normalisation trop large masquerait un vrai changement de contenu.
  const html = '<p>150 MAD</p><a href="/billing">Abonnement</a>'
  const { texte, remplacements } = normaliser(Buffer.from(html))
  assert.equal(remplacements, 0)
  assert.equal(texte, html)
})

test('normaliser : ne neutralise pas la référence de composant RSC', () => {
  // Choix assumé : cette instabilité est DÉCLARÉE (variantes) et traitée par
  // l'empreinte de contenu, pas effacée par la normalisation.
  const html = '21:I[14586,["5730","static/chunks/44530001-6997.js"]]'
  assert.equal(normaliser(Buffer.from(html)).remplacements, 0)
})

/* ---------------------------------------------------------------------------
   2. Empreinte de contenu — l'invariant.
   ------------------------------------------------------------------------ */

const PAGE_A =
  '<html><head><title>Fidelix</title></head><body>' +
  '<h1>Équipe</h1><a href="/billing">Facturation</a><a href="/scan">Scan</a>' +
  '<script>self.__next_f.push([1,"21:I[14586,[\\"5730\\",\\"static/chunks/44530001-6997.js?dpl=x\\"]]"])</script>' +
  '</body></html>'

// Même page, autre graphe de build : référence de composant et chunk différents.
const PAGE_B = PAGE_A.replace('21:I[14586', '21:I[34766')
  .replace('"5730","static/chunks/44530001-6997.js?dpl=x"', '"9779","static/chunks/9779-f3dd.js?dpl=x"')

test('empreinteContenu : deux graphes de build différents donnent la MÊME empreinte', () => {
  const a = empreinteContenu(Buffer.from(PAGE_A))
  const b = empreinteContenu(Buffer.from(PAGE_B))
  assert.notEqual(sha256(Buffer.from(PAGE_A)), sha256(Buffer.from(PAGE_B)), 'les octets diffèrent bien')
  assert.equal(a.sha256, b.sha256, 'le contenu, lui, est identique')
  assert.equal(a.titre, 'Fidelix')
  assert.equal(a.liens, 2)
})

test('empreinteContenu : un libellé qui change FAIT échouer l’empreinte', () => {
  const modifie = PAGE_A.replace('Équipe', 'Équipe (2)')
  assert.notEqual(
    empreinteContenu(Buffer.from(PAGE_A)).sha256,
    empreinteContenu(Buffer.from(modifie)).sha256
  )
})

test('empreinteContenu : un lien qui change FAIT échouer l’empreinte', () => {
  const modifie = PAGE_A.replace('href="/scan"', 'href="/qrcode"')
  assert.notEqual(
    empreinteContenu(Buffer.from(PAGE_A)).sha256,
    empreinteContenu(Buffer.from(modifie)).sha256
  )
})

test('empreinteContenu : un prix qui change FAIT échouer l’empreinte', () => {
  const a = empreinteContenu(Buffer.from('<p>150 MAD</p>'))
  const b = empreinteContenu(Buffer.from('<p>99 MAD</p>'))
  assert.notEqual(a.sha256, b.sha256)
})

test('empreinteContenu : les scripts ne polluent pas, le titre fait foi', () => {
  const sansScript = empreinteContenu(Buffer.from('<body><p>x</p><script>var a=1</script></body>'))
  const autreScript = empreinteContenu(Buffer.from('<body><p>x</p><script>var a=2</script></body>'))
  assert.equal(sansScript.sha256, autreScript.sha256)
  const titreA = empreinteContenu(Buffer.from('<title>A</title><p>x</p>'))
  const titreB = empreinteContenu(Buffer.from('<title>B</title><p>x</p>'))
  assert.notEqual(titreA.sha256, titreB.sha256)
})


/* ---------------------------------------------------------------------------
   3. zonesDivergence — localiser sans jamais pendre.
   ------------------------------------------------------------------------ */

test('zonesDivergence : documents identiques → aucune zone', () => {
  assert.deepEqual(zonesDivergence('abc', 'abc'), [])
})

test('zonesDivergence : une différence isolée donne une zone au bon offset', () => {
  const a = 'x'.repeat(100) + 'A' + 'y'.repeat(100)
  const b = 'x'.repeat(100) + 'B' + 'y'.repeat(100)
  const zones = zonesDivergence(a, b)
  assert.equal(zones.length, 1)
  assert.equal(zones[0].debut, 100)
  assert.equal(zones[0].longueur, 1)
})

test('zonesDivergence : deux écarts éloignés donnent deux zones', () => {
  const a = 'a'.repeat(50) + 'X' + 'b'.repeat(200) + 'Y' + 'c'.repeat(50)
  const b = 'a'.repeat(50) + 'x' + 'b'.repeat(200) + 'y' + 'c'.repeat(50)
  const zones = zonesDivergence(a, b)
  assert.equal(zones.length, 2)
  assert.equal(zones[0].debut, 50)
  assert.equal(zones[1].debut, 251)
})

test('zonesDivergence : reste linéaire sur une charge RSC dense (garde anti-backtracking)', () => {
  /* Régression mesurée le 2026-10-27 : un motif `(?:[^\[\]]|\\.)*` sur ce genre
     de texte ne terminait pas (processus tué après plusieurs minutes). Ce test
     échoue par lenteur si quelqu'un réintroduit une expression à backtracking. */
  const motif = '21:I[14586,[\\"5730\\",\\"static/chunks/44530001-6997.js\\"],'.repeat(2000)
  const a = 'x'.repeat(1000) + motif + 'z'.repeat(100)
  const b = 'x'.repeat(1000) + motif.replace(/21:I\[14586/g, '21:I[34766') + 'z'.repeat(100)
  const t0 = Date.now()
  const zones = zonesDivergence(a, b)
  const duree = Date.now() - t0
  assert.ok(zones.length >= 1)
  assert.ok(duree < 2000, `trop lent : ${duree} ms pour ${a.length} caractères`)
})

test('zonesDivergence : un document plus court que l’autre ne boucle pas', () => {
  assert.deepEqual(zonesDivergence('abcdef', 'abc'), [])
})


/* ---------------------------------------------------------------------------
   4. Mesure sur les tirages RÉELS de /equipe (hors dépôt, facultatifs).
   ------------------------------------------------------------------------ */

const TIRAGES = '/tmp/tirages/'

test('réel : les formes d’octets de /equipe portent le MÊME contenu', (t) => {
  if (!existsSync(TIRAGES)) return t.skip('tirages absents du disque')
  const htmls = [0, 1, 2, 3]
    .map((k) => TIRAGES + `_equipe.${k}.html`)
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p))
  if (htmls.length < 2) return t.skip('moins de deux tirages sur disque')
  const contenus = new Set(htmls.map((b) => empreinteContenu(b).sha256))
  assert.equal(contenus.size, 1, 'le contenu doit être unique malgré des octets différents')
})
