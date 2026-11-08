/* ============================================================================
   L'unité du programme — « points, et rien d'autre ».

   Décision produit du 2026-11-02 (`P0-6b`) : le socle ne compte que des points.
   La caisse crédite des points par `award_loyalty_points`, qui n'a **pas** de
   paramètre de tampon ; la cible, elle, sait faire les deux (`programType ===
   "stamps"`, `stamps_delta`, grille `stampsTotal` sur l'écran caisse).

   Le défaut que ce fichier interdit est précis : un `select` « Points / Tampons »
   qui enregistre une valeur que personne ne lit. Il existait depuis `0003` et
   `/rewards` l'affichait — un réglage qui promet une mécanique absente.

   Ce que les tests figent :
     1. la constante du module, et son unique valeur ;
     2. l'absence de champ `type` dans l'écran (donc dans le `FormData`) ;
     3. l'action qui n'écoute plus le formulaire, mais la constante ;
     4. la phrase qui explique l'absence, et sa clé (une clé non traduite
        afficherait la clé, pas la raison) ;
     5. la disparition des deux anciennes clés, et de toute valeur `tampons`
        envoyable depuis `web/src`.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { TYPE_PROGRAMME } from '../../../web/src/lib/programme.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const PROGRAMME = lire('web', 'src', 'app', '(dashboard)', 'rewards', 'page.jsx')
const PROGRAMME_ACTION = lire('web', 'src', 'app', '(dashboard)', 'rewards', 'actions.js')
const MODULE = lire('web', 'src', 'lib', 'programme.mjs')
const DICTIONNAIRES = lire('web', 'src', 'i18n', 'dictionnaires.mjs')

const FR = dictionnaire('fr')

/** Retire les commentaires : la prose cite `tampons` et `select`, ce n'est pas du code. */
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/** Tous les fichiers de `web/src` — pour qu'un `tampons` réintroduit ailleurs se voie. */
function fichiersSource(dossier = join(RACINE, 'web', 'src')) {
  const trouves = []
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) trouves.push(...fichiersSource(chemin))
    else if (/\.(mjs|js|jsx)$/.test(entree.name)) trouves.push(chemin)
  }
  return trouves
}

test('unité — la constante existe, et vaut `points`', () => {
  assert.equal(TYPE_PROGRAMME, 'points')
  // Une seule valeur : le jour où une seconde apparaît, c'est une décision de
  // produit, pas un ajout de code — et ce test force la relecture de `P0-6b`.
  assert.match(MODULE, /export const TYPE_PROGRAMME = 'points'/)
})

test('unité — l’écran n’offre plus le choix, donc ne l’envoie plus', () => {
  const code = sansCommentaires(PROGRAMME)
  assert.equal(
    /name="type"/.test(code),
    false,
    'un champ `type` renverrait une valeur choisie dans une liste que rien ne lit'
  )
  assert.equal(/<select/i.test(code), false, 'aucun `select` ne reste sur cet écran')
  assert.equal(
    /value="tampons"/.test(code),
    false,
    'une option « tampons » serait exactement l’interrupteur inerte refusé'
  )
  // Les deux champs réels restent : retirer l’unité ne retire pas le programme.
  assert.match(code, /name="slug"/)
  assert.match(code, /name="seuil"/)
})

test('unité — l’action n’écoute plus le formulaire, elle applique la constante', () => {
  const code = sansCommentaires(PROGRAMME_ACTION)
  assert.equal(
    /donnees\.get\('type'\)/.test(code),
    false,
    'lire `type` dans le FormData laisserait passer une valeur fabriquée à la main'
  )
  assert.match(
    code,
    /type: TYPE_PROGRAMME,/,
    '`enregistrerProgramme` a besoin de `type` : sans lui, `p_kind` part `undefined`'
  )
  assert.match(
    PROGRAMME_ACTION,
    /TYPE_PROGRAMME\s*,?\s*\n?\}?\s*from '@\/lib\/programme\.mjs'/,
    'la constante doit venir du module, pas d’un littéral recopié'
  )
})

test('unité — l’écran dit pourquoi, avec une clé qui existe', () => {
  assert.match(PROGRAMME, /t\('page\.programme\.unitePoints'\)/)
  const phrase = FR['page.programme.unitePoints']
  assert.equal(typeof phrase, 'string', 'clé absente du dictionnaire : l’écran afficherait la clé')
  assert.match(phrase, /points/, 'la phrase doit nommer l’unité réelle')
  assert.match(
    phrase,
    /n’est pas proposé|n'est pas proposé/,
    'elle doit dire que le mode tampons est absent — pas seulement se taire'
  )
})

test('unité — les anciennes clés du choix ont disparu', () => {
  for (const cle of ['page.programme.points', 'page.programme.tampons']) {
    assert.equal(FR[cle], undefined, `« ${cle} » ne sert plus : la garder laisserait un choix fantôme`)
    assert.equal(DICTIONNAIRES.includes(`'${cle}'`), false)
    assert.equal(PROGRAMME.includes(`'${cle}'`), false)
  }
})

test('unité — aucun écran ne peut plus enregistrer `tampons`', () => {
  const coupables = fichiersSource()
    .filter((chemin) => /["']tampons["']/.test(sansCommentaires(readFileSync(chemin, 'utf8'))))
    .map((chemin) => chemin.slice(RACINE.length + 1))
  assert.deepEqual(coupables, [], 'une valeur `tampons` envoyable est réapparue')
})
