/* ============================================================================
   Garde sur l'**icône d'onglet** — le `404 /favicon.ico` mesuré en production.

   Next 16 ne sert `/favicon.ico` que si `app/favicon.ico` existe ; `app/icon.svg`
   seul n'injecte qu'un `<link rel="icon" href="/icon.svg">`. Les deux fichiers
   sont donc présents, et ils doivent montrer **le même mark** : le SVG est le
   jumeau vectoriel du raster déjà versionné (`web/public/icon-192.png`), pas un
   dessin parallèle. Ce fichier refuse :

     1. un SVG qui n'a plus la géométrie relevée au pixel sur ce raster ;
     2. un raster dont le monogramme a bougé (le bbox est la mesure, pas un avis) ;
     3. un `.ico` qui n'est pas un conteneur valide, ou dont une entrée déclare
        une taille que son PNG ne fait pas ;
     4. une seconde déclaration d'icône dans `metadata` — deux sources, et l'on
        ne sait plus laquelle gagne.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const APP = join(RACINE, 'web/src/app')

const ICONE_SVG = join(APP, 'icon.svg')
const FAVICON = join(APP, 'favicon.ico')
const RASTER = join(RACINE, 'web/public/icon-192.png')

/* Mesure de référence — `web/public/icon-192.png`, relevée le 2026-11-08 :
   fond #1a1a1a plein carré, monogramme #faf9f8, barre haute y46→68 jusqu'à
   x133, barre médiane y84→105 jusqu'à x118, fût x58→72 jusqu'à y145. */
const BBOX = { xMin: 58, xMax: 133, yMin: 46, yMax: 145 }
const TRACE_F = 'M58 46h76v23H73v15h46v22H73v40H58z'

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Décode un PNG 8 bits non entrelacé (RGB ou RGBA) — juste de quoi lire des pixels. */
function pixels(chemin) {
  const png = readFileSync(chemin)
  assert.ok(png.subarray(0, 8).equals(SIGNATURE_PNG), `${chemin} n'est pas un PNG`)

  let position = 8
  let largeur = 0
  let hauteur = 0
  let profondeur = 0
  let typeCouleur = 0
  let entrelacement = 0
  const morceaux = []

  while (position < png.length) {
    const longueur = png.readUInt32BE(position)
    const type = png.toString('ascii', position + 4, position + 8)
    const donnees = png.subarray(position + 8, position + 8 + longueur)
    if (type === 'IHDR') {
      largeur = donnees.readUInt32BE(0)
      hauteur = donnees.readUInt32BE(4)
      profondeur = donnees[8]
      typeCouleur = donnees[9]
      entrelacement = donnees[12]
    }
    if (type === 'IDAT') morceaux.push(donnees)
    position += 12 + longueur
  }

  assert.equal(profondeur, 8, 'le décodeur ne lit que 8 bits par canal')
  assert.equal(entrelacement, 0, 'le décodeur ne lit pas les PNG entrelacés')
  const octetsParPixel = typeCouleur === 6 ? 4 : typeCouleur === 2 ? 3 : 0
  assert.ok(octetsParPixel > 0, `type de couleur PNG ${typeCouleur} non géré`)

  const brut = inflateSync(Buffer.concat(morceaux))
  const pas = largeur * octetsParPixel
  const sortie = Buffer.alloc(pas * hauteur)

  for (let y = 0; y < hauteur; y += 1) {
    const filtre = brut[y * (pas + 1)]
    const ligne = brut.subarray(y * (pas + 1) + 1, (y + 1) * (pas + 1))
    for (let x = 0; x < pas; x += 1) {
      const gauche = x >= octetsParPixel ? sortie[y * pas + x - octetsParPixel] : 0
      const haut = y > 0 ? sortie[(y - 1) * pas + x] : 0
      const coin = x >= octetsParPixel && y > 0 ? sortie[(y - 1) * pas + x - octetsParPixel] : 0
      let valeur = ligne[x]
      if (filtre === 1) valeur += gauche
      else if (filtre === 2) valeur += haut
      else if (filtre === 3) valeur += (gauche + haut) >> 1
      else if (filtre === 4) valeur += paeth(gauche, haut, coin)
      sortie[y * pas + x] = valeur & 0xff
    }
  }

  return {
    largeur,
    hauteur,
    octetsParPixel,
    canal: (x, y, c) => sortie[y * pas + x * octetsParPixel + c],
  }
}

/** Boîte englobante des pixels « encre » (rouge > 100). */
function bboxEncre(image) {
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  for (let y = 0; y < image.hauteur; y += 1) {
    for (let x = 0; x < image.largeur; x += 1) {
      if (image.canal(x, y, 0) > 100) {
        if (x < xMin) xMin = x
        if (x > xMax) xMax = x
        if (y < yMin) yMin = y
        if (y > yMax) yMax = y
      }
    }
  }
  return { xMin, xMax, yMin, yMax }
}

/** Annuaire d'un conteneur ICO : magic, type, puis une entrée par taille. */
function annuaireIco(tampon) {
  assert.equal(tampon.readUInt16LE(0), 0, 'ICONDIR.reserved doit être 0')
  assert.equal(tampon.readUInt16LE(2), 1, 'ICONDIR.type doit être 1 (icône)')
  const nombre = tampon.readUInt16LE(4)
  assert.ok(nombre >= 1, "un ICO sans entrée n'est pas un ICO")

  const entrees = []
  for (let i = 0; i < nombre; i += 1) {
    const base = 6 + i * 16
    entrees.push({
      largeur: tampon[base] === 0 ? 256 : tampon[base],
      hauteur: tampon[base + 1] === 0 ? 256 : tampon[base + 1],
      octets: tampon.readUInt32LE(base + 8),
      decalage: tampon.readUInt32LE(base + 12),
    })
  }
  return { nombre, entrees }
}

test("l'icône vectorielle reprend la géométrie mesurée du raster", () => {
  assert.ok(
    existsSync(ICONE_SVG),
    'web/src/app/icon.svg manque : Next n\'injecte alors aucun <link rel="icon">',
  )
  const svg = readFileSync(ICONE_SVG, 'utf8')

  assert.match(svg, /^<svg[\s>]/, 'le fichier doit commencer par <svg')
  assert.match(svg, /viewBox="0 0 192 192"/, 'le repère doit rester celui du raster (192×192)')
  assert.match(svg, /<rect[^>]*fill="#1a1a1a"/, 'le fond mesuré est #1a1a1a')
  assert.match(svg, /fill="#faf9f8"/, "l'encre mesurée est #faf9f8")
  assert.ok(svg.includes(TRACE_F), `le tracé du monogramme doit rester « ${TRACE_F} »`)
  assert.doesNotMatch(svg, /<script/i, "une icône n'exécute pas de script")
})

test('le raster source porte toujours le monogramme mesuré', () => {
  const image = pixels(RASTER)
  assert.equal(image.largeur, 192)
  assert.equal(image.hauteur, 192)
  assert.deepEqual(
    bboxEncre(image),
    BBOX,
    'le monogramme de web/public/icon-192.png a bougé : le SVG et le .ico le suivent, pas l\'inverse',
  )
})

test('favicon.ico est un conteneur valide, cohérent avec ses entrées PNG', () => {
  assert.ok(existsSync(FAVICON), 'web/src/app/favicon.ico manque : GET /favicon.ico reste 404')
  const ico = readFileSync(FAVICON)
  const { nombre, entrees } = annuaireIco(ico)

  assert.deepEqual(
    entrees.map((e) => e.largeur).sort((a, b) => a - b),
    [16, 32, 48],
    "les tailles embarquées sont celles de l'annuaire, pas d'une convention flottante",
  )
  assert.equal(nombre, 3)

  for (const entree of entrees) {
    assert.equal(entree.largeur, entree.hauteur, `${entree.largeur}×${entree.hauteur} n'est pas carré`)
    assert.ok(entree.decalage + entree.octets <= ico.length, 'entrée hors du fichier')

    const charge = ico.subarray(entree.decalage, entree.decalage + entree.octets)
    assert.ok(
      charge.subarray(0, 8).equals(SIGNATURE_PNG),
      `l'entrée ${entree.largeur}px doit être un PNG (pas un BMP), relisible sans ambiguïté`,
    )
    assert.equal(
      charge.readUInt32BE(16),
      entree.largeur,
      `l'IHDR du PNG ${entree.largeur}px ne fait pas la taille annoncée`,
    )
    assert.equal(charge.readUInt32BE(20), entree.hauteur)
    // Turbopack décode l'ICO au build et refuse un PNG RGB :
    // « Format error decoding Ico: The PNG is not in RGBA format! ». Type 6 = RGBA.
    assert.equal(charge[25], 6, `l'entrée ${entree.largeur}px doit être en RGBA (type 6), sinon next build casse`)
  }
})

test("une seule déclaration d'icône : les fichiers de convention, pas `metadata.icons`", () => {
  const layout = readFileSync(join(APP, 'layout.jsx'), 'utf8')
  assert.doesNotMatch(
    layout,
    /icons\s*:/,
    'déclarer `metadata.icons` en plus des fichiers `app/` crée deux sources pour la même icône',
  )
})
