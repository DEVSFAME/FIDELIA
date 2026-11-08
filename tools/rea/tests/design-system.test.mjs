/* ============================================================================
   R1 — le design system, vérifié par un test et pas seulement par un CLI.

   Un CLI qu'on oublie de lancer ne protège rien. Ces cas tournent avec
   `node --test`, donc avec le reste de la suite : une régression de fidélité
   casse la CI, pas seulement la revue visuelle.

   Ce qui est prouvé ici :
     - les polices sont mesurées, pas déclarées : 42 `@font-face`, 10 familles,
       et chaque binaire référencé existe réellement dans `web/public/polices/` ;
     - nos quatre feuilles sont conformes à la capture (hors déviations
       déclarées) ;
     - le vérificateur **sait échouer** : c'est la seule preuve qu'il vérifie.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  auditer,
  auditerAvecPolices,
  extrairePolices,
  ledgerPolices,
} from '../design-system.mjs'
import {
  CAPTURES,
  CLASSES_SURVEILLEES,
  HORS_LEDGER,
  NOTRES,
} from '../verifier-design.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (chemin) => readFileSync(chemin, 'utf8')
const CAPTURE = CAPTURES.map(lire).join('\n')
const NOTRE_CSS = NOTRES.map(lire).join('\n')

test('polices — la capture déclare 42 @font-face répartis sur 10 familles', () => {
  const polices = extrairePolices(CAPTURE)
  assert.equal(polices.length, 42, 'nombre de @font-face mesuré')

  const familles = new Set(polices.map((p) => p.famille))
  assert.equal(familles.size, 10)
  // Les familles de repli ne sont pas cosmétiques : elles portent size-adjust.
  for (const famille of ['Inter', 'Space Grotesk', 'Anton', 'Caveat', 'JetBrains Mono']) {
    assert.ok(familles.has(famille), `famille mesurée absente : ${famille}`)
    assert.ok(familles.has(`${famille} Fallback`), `repli mesuré absent : ${famille} Fallback`)
  }
})

test('polices — chaque binaire référencé existe sous web/public/polices/', () => {
  const fichiers = [...new Set(extrairePolices(CAPTURE).flatMap((p) => p.fichiers))]
  assert.ok(fichiers.length >= 20, 'au moins vingt binaires distincts')

  for (const fichier of fichiers) {
    const chemin = join(RACINE, 'web', 'public', 'polices', fichier)
    // Un @font-face sans fichier ne casse rien visiblement : le navigateur
    // retombe sur la police système, et l'écart ne se voit qu'à l'œil.
    assert.ok(existsSync(chemin), `binaire manquant : ${chemin}`)
  }
})

test('polices — notre feuille référence les mêmes binaires que la capture', () => {
  const capture = ledgerPolices(CAPTURE)
  const notre = ledgerPolices(NOTRE_CSS)
  assert.equal(notre.size, capture.size)

  for (const [cle, attendu] of capture) {
    const obtenu = notre.get(cle)
    assert.ok(obtenu, `@font-face manquant : ${cle}`)
    assert.deepEqual(obtenu.fichiers, attendu.fichiers, `binaires divergents : ${cle}`)
  }
})

test('design system — nos feuilles sont conformes à la capture', () => {
  const verdict = auditerAvecPolices({
    capture: CAPTURE,
    notres: NOTRES.map(lire),
    selecteurs: CLASSES_SURVEILLEES,
    inventionsAutorisees: HORS_LEDGER.map((d) => d.cle),
  })

  assert.deepEqual(verdict.tokens.manquants, [])
  assert.deepEqual(verdict.tokens.divergents, [])
  assert.deepEqual(verdict.tokens.inventes, [])
  assert.deepEqual(verdict.classes.manquants, [])
  assert.deepEqual(verdict.classes.divergents, [])
  assert.deepEqual(verdict.polices.manquants, [])
  assert.deepEqual(verdict.polices.divergents, [])
  assert.equal(verdict.ok, true)
})

test('design system — toute déviation est déclarée, aucune ne passe en silence', () => {
  const verdict = auditerAvecPolices({
    capture: CAPTURE,
    notres: NOTRES.map(lire),
    selecteurs: CLASSES_SURVEILLEES,
    inventionsAutorisees: HORS_LEDGER.map((d) => d.cle),
  })

  // Les trois variables de la peau bleu nuit sont des inventions : elles
  // doivent apparaître comme telles, avec leur clé exacte.
  assert.equal(verdict.tokens.tolerees.length, HORS_LEDGER.length)
  for (const declaration of HORS_LEDGER) {
    assert.ok(
      verdict.tokens.tolerees.some((t) => t.cle === declaration.cle),
      `déviation déclarée introuvable : ${declaration.cle}`
    )
    assert.ok(declaration.raison.trim().length > 20, 'une déviation sans raison n’en est pas une')
  }
})

test('design system — retirer une déviation de la liste rend le verdict NON conforme', () => {
  const verdict = auditer({
    capture: CAPTURE,
    notres: NOTRES.map(lire),
    selecteurs: CLASSES_SURVEILLEES,
    inventionsAutorisees: [], // aucune tolérance
  })
  assert.equal(verdict.ok, false, 'sans tolérance, les inventions doivent faire échouer')
  assert.equal(verdict.tokens.inventes.length, HORS_LEDGER.length)
})

test('design system — le vérificateur détecte une valeur changée à la main', () => {
  // CSS synthétique : c'est le test du détecteur, pas de la cible.
  const capture = ':root{--verre-flou:22px;--verre-opacite:.17}'
  const notre = ':root{--verre-flou:20px;--verre-opacite:.17}'

  const verdict = auditer({ capture, notres: [notre], selecteurs: [] })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.tokens.divergents.length, 1)
  assert.equal(verdict.tokens.divergents[0].cle, '|:root|--verre-flou')
  assert.equal(verdict.tokens.divergents[0].attendu, '22px')
  assert.equal(verdict.tokens.divergents[0].obtenu, '20px')
})
