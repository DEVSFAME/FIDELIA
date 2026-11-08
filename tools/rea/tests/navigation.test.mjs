/* ============================================================================
   R2 — la navigation promet-elle des routes qui existent ?

   Le défaut que ce test empêche est déjà arrivé une fois : `<link href="/register">`
   livré alors que la route n'existait pas. `i18n-ui` le détecte pour les `href`
   **littéraux**, mais la navigation est désormais produite par un tableau
   (`lib/navigation.mjs`) — donc invisible à ce balayage. D'où ce test, qui lit
   le modèle et le confronte au disque.

   Il vérifie aussi ce que le modèle affirme : dix entrées, neuf au-delà de
   l'accueil, des libellés qui existent, et une règle d'état actif qui ne
   confond pas un préfixe avec un segment.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ENTREES, estActif, routesPromises } from '../../../web/src/lib/navigation.mjs'
import { cles, dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const APP = join(RACINE, 'web', 'src', 'app')

/** Routes réelles lues sur le disque (groupes `(…)` retirés). */
function routes() {
  const trouvees = new Set()
  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name)
      if (entree.isDirectory()) {
        parcourir(complet)
        continue
      }
      if (entree.name !== 'page.jsx' && entree.name !== 'route.js') continue
      const segments = relative(APP, dossier)
        .split('/')
        .filter(Boolean)
        .filter((segment) => !/^\(.*\)$/.test(segment))
      trouvees.add(segments.length === 0 ? '/' : `/${segments.join('/')}`)
    }
  }
  parcourir(APP)
  return trouvees
}

test('navigation — chaque entrée pointe une page réellement présente', () => {
  const existantes = routes()
  const manquantes = routesPromises().filter((href) => !existantes.has(href))
  assert.deepEqual(manquantes, [], 'liens de navigation sans page')
})

test('navigation — dix entrées au-delà de l’accueil, toutes distinctes', () => {
  assert.equal(ENTREES.length, 11, 'accueil + les 10 entrées mesurées')
  const hrefs = routesPromises()
  assert.equal(new Set(hrefs).size, hrefs.length, 'deux entrées vers la même route')
  assert.equal(hrefs[0], '/dashboard', 'l’accueil est la première entrée')
  for (const href of hrefs) assert.match(href, /^\/[a-z-]*$/, `route inattendue : ${href}`)
})

test('navigation — les neuf libellés existent en fr et en', () => {
  const fr = new Set(cles('fr'))
  const en = new Set(cles('en'))
  for (const { cle, href } of ENTREES) {
    assert.ok(fr.has(cle), `clé absente de fr : ${cle} (${href})`)
    assert.ok(en.has(cle), `clé absente de en : ${cle} (${href})`)
  }
})

test('navigation — aucun libellé vide', () => {
  for (const { cle } of ENTREES) {
    assert.notEqual(dictionnaire('fr')[cle].trim(), '', `libellé vide : ${cle}`)
  }
})

test('navigation — estActif distingue un segment d’un préfixe nu', () => {
  // L'entrée elle-même et ses descendants.
  assert.equal(estActif('/dashboard', '/dashboard'), true)
  assert.equal(estActif('/customers/b365a328', '/customers'), true)
  assert.equal(estActif('/customers/', '/customers'), true)

  // Le piège : `/customers-archives` n'est pas `/customers`.
  assert.equal(estActif('/customers-archives', '/customers'), false)
  assert.equal(estActif('/scanner', '/scan'), false)

  // Une autre route n'allume rien.
  assert.equal(estActif('/reviews', '/customers'), false)

  // Entrées dégradées : jamais d'exception, jamais d'état actif.
  assert.equal(estActif(undefined, '/customers'), false)
  assert.equal(estActif('/customers', null), false)
})
