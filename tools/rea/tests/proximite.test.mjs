/* ============================================================================
   P0-2b — la proximité : une formule **mesurée**, et des points bornés.

   La formule n'est pas recopiée dans ce fichier : elle est **extraite du chunk
   capturé** et réexécutée. Si la cible change ses constantes, ce test le dit au
   lieu de comparer deux transcriptions de la même mémoire.

   Ce que le fichier empêche :
     1. **un plafond recopié** (859 écrit à la main) qui survivrait à un
        changement de formule ;
     2. **un point hors bornes** : plus de 10 emplacements, Apple et Google
        refusent le pass entier `[D]` ;
     3. **une boutique non couverte** : sans le point central, un anneau de
        350 m laisse le comptoir dehors.

   Ce qu'il n'affirme pas : que la couverture est continue. La formule donne une
   **borne extérieure**, et le nombre de points réel de la cible est serveur.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ANNEAU_CIRCONFERENCE_MAX_M,
  ESPACEMENT_M,
  PLAFOND_COUVERTURE_M,
  POINTS_ANNEAU_MAX,
  POINTS_MAX,
  PORTEE_POINT_M,
  couvertureM,
  pointsGeofence,
  rayonAnneauM,
} from '../../../web/src/lib/proximite.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CHUNK = readFileSync(
  join(
    RACINE,
    '01_REA_Fidelix',
    '_captures',
    '2026-11-04-a8',
    'raw',
    'assets',
    '_next_static_chunks_app__dashboard__settings_page-dd121c1258082851.js'
  ),
  'utf8'
)

/**
 * L'expression de la cible, lue **dans le chunk** puis réexécutée.
 *
 * `e` est déclaré ici : dans le bundle il vient d'un `var` du module, et en
 * module ES une affectation à un nom libre lève. C'est la seule retouche — le
 * reste est l'artefact, au caractère près.
 */
function formuleDeLaCible() {
  const debut = CHUNK.indexOf('!Number.isFinite(e=D||1e3)')
  assert.ok(debut > 0, 'la formule a disparu du chunk : la cible a changé')
  const fin = CHUNK.indexOf('," m"]', debut)
  assert.ok(fin > debut, 'la formule n’est plus suivie de «  m »')
  const expression = CHUNK.slice(debut, fin)
  return new Function('D', `var e; return ${expression}`)
}

const CIBLE = formuleDeLaCible()

/* ---------------------------------------------------------------------------
   1. La formule — équivalence sur toute la plage utile
   ------------------------------------------------------------------------ */

test('formule — notre calcul rend exactement ce que rend la cible', () => {
  const valeurs = [
    undefined,
    null,
    '',
    0,
    50,
    100,
    250,
    251,
    300,
    500,
    600,
    858,
    859,
    1000,
    2000,
    'abc',
    '500',
  ]
  for (const valeur of valeurs) {
    assert.equal(
      couvertureM(valeur),
      CIBLE(valeur),
      `divergence pour ${JSON.stringify(valeur)} : la cible dit ${CIBLE(valeur)}`
    )
  }
})

test('formule — les trois constantes mesurées sont celles du module', () => {
  assert.equal(PORTEE_POINT_M, 250)
  assert.equal(ANNEAU_CIRCONFERENCE_MAX_M, 3825)
  assert.equal(PLAFOND_COUVERTURE_M, couvertureM(2000), 'le plafond doit être le résultat, pas un chiffre')
  assert.equal(PLAFOND_COUVERTURE_M, 859)
})

test('formule — ce que l’écran affiche, y compris les cas contre-intuitifs', () => {
  // Un rayon saisi sous la portée d'un point ne descend pas sous 250.
  assert.equal(couvertureM(50), 250)
  assert.equal(couvertureM(250), 250)
  // Au-delà de ~859, le plafond s'applique : 2000 saisis affichent 859.
  assert.equal(couvertureM(1000), 859)
  assert.equal(couvertureM(2000), 859)

  /* Deux cas que la **lecture** de la prose aurait ratés, et que l'exécution
     tranche : un champ vide vaut 1000 (`D || 1e3`), donc 859 et non 250 ; une
     chaîne numérique (« 500 ») n'est pas un nombre fini, donc 250. C'est le
     comportement de la cible, tel quel — l'écran d'ici passe toujours un
     nombre, donc seul le premier cas le concerne. */
  assert.equal(couvertureM(''), 859)
  assert.equal(couvertureM('500'), 250)
})

test('formule — l’anneau est la même borne, sans l’arrondi', () => {
  assert.equal(rayonAnneauM(250), 0, 'sous 250, pas d’anneau : un seul point')
  assert.equal(rayonAnneauM(600), 350)
  assert.ok(Math.abs(rayonAnneauM(2000) - 3825 / (2 * Math.PI)) < 1e-9)
})

/* ---------------------------------------------------------------------------
   2. Les points — la borne des plateformes, et le comptoir couvert
   ------------------------------------------------------------------------ */

/** Distance plane approximative, en mètres : suffit à 610 m, et lisible. */
const distanceM = (a, b) => {
  const dLat = (a.latitude - b.latitude) * 111_320
  const dLng = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

test('points — sans coordonnées, aucun point : rien à inscrire dans le pass', () => {
  assert.deepEqual(pointsGeofence({}), [])
  assert.deepEqual(pointsGeofence({ latitude: null, longitude: null, rayon: 1000 }), [])
  assert.deepEqual(pointsGeofence({ latitude: 91, longitude: 0, rayon: 1000 }), [])
})

test('points — dix au maximum, quel que soit le rayon', () => {
  assert.equal(POINTS_MAX, 10)
  for (const rayon of [50, 250, 500, 600, 859, 1000, 2000]) {
    const points = pointsGeofence({ latitude: 33.5731, longitude: -7.5898, rayon })
    assert.ok(points.length >= 1, `aucun point pour ${rayon} m`)
    assert.ok(points.length <= POINTS_MAX, `${points.length} points pour ${rayon} m : au-delà de la borne`)
  }

  // La borne basse : `maximum: 1` ne rend que le centre, jamais deux points.
  assert.equal(pointsGeofence({ latitude: 33.5, longitude: -7.5, rayon: 1000, maximum: 1 }).length, 1)
})

test('points — le comptoir est toujours couvert', () => {
  const centre = { latitude: 33.5731, longitude: -7.5898 }
  for (const rayon of [50, 250, 300, 600, 859, 2000]) {
    const points = pointsGeofence({ ...centre, rayon })
    assert.deepEqual(points[0], centre, `le centre manque pour ${rayon} m`)
  }
})

test('points — l’anneau est à `rayon − 250`, et la couverture vaut `anneau + 250`', () => {
  const centre = { latitude: 33.5731, longitude: -7.5898 }

  // 600 m saisis : anneau de 350 m, donc 600 m de couverture.
  const sixCents = pointsGeofence({ ...centre, rayon: 600 })
  for (const point of sixCents) {
    const d = distanceM(centre, point)
    assert.ok(d === 0 || Math.abs(d - 350) < 1, `point hors de l’anneau : ${d.toFixed(1)} m`)
  }
  assert.ok(sixCents.length > 1, 'un rayon de 600 m doit poser au moins un point d’anneau')

  // Sous 250 m, pas d'anneau : un seul point, la couverture est le plancher.
  assert.deepEqual(pointsGeofence({ ...centre, rayon: 250 }), [centre])

  // Au plafond, l'anneau est à 608,66 m : la couverture est bien ~859 m.
  const haut = pointsGeofence({ ...centre, rayon: 2000 })
  const plusLoin = Math.max(...haut.map((point) => distanceM(centre, point)))
  assert.ok(Math.abs(plusLoin - 3825 / (2 * Math.PI)) < 1)
  assert.ok(plusLoin + PORTEE_POINT_M <= PLAFOND_COUVERTURE_M + 1)
})

test('points — le pas de l’anneau est celui de la constante, pas un chiffre choisi', () => {
  assert.equal(POINTS_ANNEAU_MAX, 9)
  assert.equal(ESPACEMENT_M, 425)

  // Au plafond la circonférence est pleine : le centre + neuf points, espacés
  // du pas maximal — c'est la borne des plateformes qui décide, pas nous. Le
  // pas est mesuré à l'arc ; sur le terrain on mesure la **corde**, plus courte
  // (`2·R·sin(π/9)`), et c'est elle que ce test compare.
  const haut = pointsGeofence({ latitude: 0, longitude: 0, rayon: 2000 })
  assert.equal(haut.length, POINTS_MAX, 'le plafond doit remplir les dix emplacements')

  const corde = 2 * rayonAnneauM(2000) * Math.sin(Math.PI / POINTS_ANNEAU_MAX)
  assert.ok(corde < ESPACEMENT_M, 'la corde est toujours plus courte que l’arc')
  // Points voisins seulement : `haut[1]` est à l'angle 0, `haut[2]` au suivant.
  for (let i = 2; i < haut.length; i += 1) {
    const d = distanceM(haut[i], haut[i - 1])
    assert.ok(Math.abs(d - corde) < 1, `corde de ${d.toFixed(1)} m au lieu de ${corde.toFixed(1)}`)
  }
  // Et la boucle se referme : le dernier rejoint le premier.
  assert.ok(Math.abs(distanceM(haut[haut.length - 1], haut[1]) - corde) < 1)
})

test('points — six décimales, jamais sept', () => {
  const points = pointsGeofence({ latitude: 33.5731123456, longitude: -7.5898123456, rayon: 1000 })
  for (const point of points) {
    for (const valeur of [point.latitude, point.longitude]) {
      const decimales = String(valeur).split('.')[1] ?? ''
      assert.ok(decimales.length <= 6, `valeur non arrondie : ${valeur}`)
    }
  }
})
