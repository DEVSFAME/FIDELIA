/* ============================================================================
   P0-2b — l'emplacement : deux formats d'entrée, et des refus nommés.

   Ce que ce fichier empêche :
     1. **un lien recopié en base** — la cible stocke `latitude`/`longitude`, et
        le lien n'est qu'une forme d'entrée (`…settings_page-dd12….js`) ;
     2. **un lien court accepté en silence** — `maps.app.goo.gl/…` ne contient
        aucune coordonnée : le laisser passer écrirait `null` sans le dire ;
     3. **un point hors du globe** — 91 de latitude n'est pas une coordonnée ;
     4. **sept décimales** — la colonne en garde six (`numeric(9,6)`), donc une
        valeur non arrondie divergerait à l'écriture.

   Aucun réseau : ce module est pur, et c'est ce qui rend les refus testables.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CODES_REFUS,
  DECIMALES,
  analyserLocalisation,
  coordonneesValides,
  formaterCoordonnees,
} from '../../../web/src/lib/localisation.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ASSETS = join(RACINE, '01_REA_Fidelix', '_captures', '2026-11-04-a8', 'raw', 'assets')

/** Le chunk de `/settings` : il porte l'aide, la formule et la sauvegarde. */
const CHUNK = readFileSync(
  join(ASSETS, '_next_static_chunks_app__dashboard__settings_page-dd121c1258082851.js'),
  'utf8'
)

/** Le témoin de la cible : l'exemple d'aide mesuré, dans son `<code>`. */
const EXEMPLE_MESURE = '33.5731, -7.5898'

test('chunk — l’exemple d’aide mesuré est bien celui qu’on analyse', () => {
  // `(0,t.jsx)("code",{dir:"ltr",children:"33.5731, -7.5898"})` — le balisage
  // exact de l'aide : c'est le seul endroit où l'exemple est écrit.
  assert.ok(
    CHUNK.includes(`dir:"ltr",children:"${EXEMPLE_MESURE}"`),
    'l’exemple d’aide de la cible a changé'
  )

  const lu = analyserLocalisation(EXEMPLE_MESURE)
  assert.equal(lu.etat, 'ok')
  assert.equal(lu.latitude, 33.5731)
  assert.equal(lu.longitude, -7.5898)
})

test('forme 1 — une paire de coordonnées, dans les variantes réelles', () => {
  const attendu = { etat: 'ok', code: null, latitude: 33.5731, longitude: -7.5898 }
  for (const saisie of [
    '33.5731, -7.5898',
    '33.5731,-7.5898',
    '  33.5731 ,  -7.5898  ',
    '33.5731; -7.5898',
  ]) {
    assert.deepEqual(analyserLocalisation(saisie), attendu, `refusé à tort : « ${saisie} »`)
  }

  // Entiers acceptés, négatifs compris : un point n'a pas besoin de décimales.
  assert.deepEqual(analyserLocalisation('33, -7'), {
    etat: 'ok',
    code: null,
    latitude: 33,
    longitude: -7,
  })
})

test('forme 2 — les quatre formes d’URL que Maps produit', () => {
  const attendu = { etat: 'ok', code: null, latitude: 33.5731, longitude: -7.5898 }
  const cas = [
    // L'adresse de la barre.
    'https://www.google.com/maps/@33.5731,-7.5898,15z',
    // Un lien de partage « q », avec et sans préfixe `loc:`.
    'https://maps.google.com/?q=33.5731,-7.5898',
    'https://maps.google.com/?q=loc:33.5731,-7.5898',
    // L'API de recherche, valeur encodée en pourcent.
    'https://www.google.com/maps/search/?api=1&query=33.5731%2C-7.5898',
  ]
  for (const saisie of cas) {
    assert.deepEqual(analyserLocalisation(saisie), attendu, `refusé à tort : « ${saisie} »`)
  }

  /* Les données `!3d…!4d…` d'une URL de lieu passent **avant** l'arobase : ce
     sont celles du point marqué, alors que l'arobase porte le centre de la vue
     (décalé dès qu'on a fait glisser la carte). */
  const lieu = analyserLocalisation(
    'https://www.google.com/maps/place/Caf%C3%A9/@33.5800,-7.6000,17z/data=!3m1!4b1!4m5!3d33.5729!4d-7.5895'
  )
  assert.equal(lieu.latitude, 33.5729)
  assert.equal(lieu.longitude, -7.5895)
})

test('refus — un lien court est nommé, pas deviné', () => {
  for (const saisie of [
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
    'https://g.co/kgs/abc123',
  ]) {
    const lu = analyserLocalisation(saisie)
    assert.equal(lu.etat, 'refus', `accepté à tort : « ${saisie} »`)
    assert.equal(lu.code, CODES_REFUS.lienCourt)
    assert.equal(lu.latitude, null)
  }
})

test('refus — une saisie illisible, et un point hors du globe', () => {
  for (const saisie of ['devant la poste', '123', 'https://www.google.com/maps', 'abc, def']) {
    assert.equal(analyserLocalisation(saisie).code, CODES_REFUS.invalide, `« ${saisie} »`)
  }

  // Les bornes : -90/90 en latitude, -180/180 en longitude. Les pôles et le
  // méridien opposé sont **valides** ; un cran au-delà ne l'est plus.
  assert.equal(analyserLocalisation('-90, -180').etat, 'ok')
  assert.equal(analyserLocalisation('90, 180').etat, 'ok')
  assert.equal(analyserLocalisation('91, 0').code, CODES_REFUS.horsBornes)
  assert.equal(analyserLocalisation('0, 181').code, CODES_REFUS.horsBornes)
  assert.equal(analyserLocalisation('-90.0001, 0').code, CODES_REFUS.horsBornes)
})

test('module — six décimales, comme la colonne', () => {
  assert.equal(DECIMALES, 6)
  const lu = analyserLocalisation('33.5731123456, -7.5898123456')
  assert.equal(lu.latitude, 33.573112)
  assert.equal(lu.longitude, -7.589812, 'la longitude est arrondie comme la latitude')
})

test('module — vide veut dire désactivé, et l’écran ré-affiche des nombres', () => {
  for (const vide of ['', '   ', null, undefined]) {
    const lu = analyserLocalisation(vide)
    assert.equal(lu.etat, 'vide', `« ${String(vide)} » devrait être vide`)
    assert.equal(lu.latitude, null, 'un champ vide ne doit pas écrire 0')
  }

  // Le gabarit mesuré du chunk : `${a.latitude}, ${a.longitude}`.
  assert.equal(formaterCoordonnees(33.5731, -7.5898), EXEMPLE_MESURE)
  assert.equal(formaterCoordonnees(null, null), '')
  assert.equal(formaterCoordonnees(33.5731, null), '', 'une coordonnée seule ne s’affiche pas')
  assert.equal(coordonneesValides(0, 0), true, 'le point (0, 0) existe, on ne l’invente pas faux')
})
