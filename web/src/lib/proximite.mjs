/* ============================================================================
   La proximité — la formule **mesurée**, et les points qu'elle autorise.

   Source : `_captures/2026-11-04-a8/raw/assets/…settings_page-dd12….js`
   (offset ≈ 20 164), identique au caractère près au chunk du 2026-10-27 :

       couverture = round(min(rayon − 250, 3825/(2π)) + 250)

   Trois constantes, lues et non devinées : chaque point porte **250 m** ; les
   points sont posés sur un **anneau** de rayon `rayon − 250` ; l'anneau est
   plafonné par une circonférence de **3 825 m**. D'où un plafond de **859 m**
   atteint dès ~859 m saisis — et 2000 m saisis qui affichent 859 m.

   Ce que la formule **ne** dit pas, et qui n'est donc pas affirmé ici : la
   couverture est une **borne extérieure**, pas une preuve de couverture
   continue du disque. Le nombre de points réel de la cible est serveur, non
   mesuré ; on choisit le nôtre, borné par ce que les plateformes acceptent
   (Apple : 10 emplacements par pass ; Google : 10 par classe et 10 par objet).
   ========================================================================== */

import { RAYON_DEFAUT } from './etablissement.mjs'
import { coordonneesValides } from './localisation.mjs'

/** Portée d'un point, telle que la formule la suppose. */
export const PORTEE_POINT_M = 250

/** Circonférence maximale de l'anneau — la constante mesurée, en mètres. */
export const ANNEAU_CIRCONFERENCE_MAX_M = 3825

/** Plafond de couverture affichable : `round(3825/(2π) + 250)`. */
export const PLAFOND_COUVERTURE_M = 859

/**
 * Emplacements par plateforme : **10** chez Apple (par pass) et chez Google
 * (par classe et par objet) `[D]`. C'est la borne qui décide du pas.
 */
export const POINTS_MAX = 10

/** Le centre prend un des dix emplacements ; l'anneau garde les neuf autres. */
export const POINTS_ANNEAU_MAX = POINTS_MAX - 1

/**
 * Pas maximal entre deux points de l'anneau, **mesuré à l'arc** : la
 * circonférence pleine divisée par les neuf emplacements restants, soit 425 m.
 * C'est la seule valeur qui découle des deux nombres connus (3 825 m mesurés,
 * 10 emplacements documentés) ; la constante admettait aussi 10 × 382,5 m ou
 * 15 × 255 m, mais le centre doit être couvert, donc il consomme un
 * emplacement. La corde correspondante vaut `2·R·sin(π/9)`.
 */
export const ESPACEMENT_M = ANNEAU_CIRCONFERENCE_MAX_M / POINTS_ANNEAU_MAX

/** Mètres par degré de latitude (sphère de rayon 6 371 km, à 0,1 % près). */
const METRES_PAR_DEGRE = 111_320

/**
 * La couverture réelle, **au mètre** — la fonction du chunk, recopiée telle
 * quelle : `!Number.isFinite(e = D || 1000) || e <= 250 ? 250 : round(...)`.
 *
 * Le `||` n'est pas une coquetterie : un champ vidé vaut `0` côté client, et le
 * `0` de la cible devient `1000`. Le plancher vaut 250 même pour un rayon de
 * 50 : l'écran affiche donc ce que la plateforme fera, pas ce qui a été saisi.
 *
 * @param {unknown} rayonSaisi mètres, valeur brute du champ
 * @returns {number} couverture en mètres, entre 250 et 859
 */
export function couvertureM(rayonSaisi) {
  const rayon = rayonSaisi || RAYON_DEFAUT
  if (!Number.isFinite(rayon) || rayon <= PORTEE_POINT_M) return PORTEE_POINT_M
  return Math.round(
    Math.min(rayon - PORTEE_POINT_M, ANNEAU_CIRCONFERENCE_MAX_M / (2 * Math.PI)) + PORTEE_POINT_M
  )
}

/** Rayon de l'anneau : la même borne que la formule, sans l'arrondi. */
export function rayonAnneauM(rayonSaisi) {
  const rayon = rayonSaisi || RAYON_DEFAUT
  if (!Number.isFinite(rayon) || rayon <= PORTEE_POINT_M) return 0
  return Math.min(rayon - PORTEE_POINT_M, ANNEAU_CIRCONFERENCE_MAX_M / (2 * Math.PI))
}

/** Même précision que la colonne : six décimales, jamais sept. */
const arrondir = (valeur) => Number(Number(valeur).toFixed(6))

/**
 * Les emplacements à inscrire dans le pass — le **centre** puis l'anneau.
 *
 * Le centre n'est pas un cadeau : avec un anneau de 350 m pour un rayon de 600
 * (portée 250 m par point), aucun point de l'anneau n'atteint la boutique. La
 * formule mesurée annonce pourtant une couverture de `anneau + 250`, ce qui
 * suppose le centre couvert — d'où le point à l'origine, et `POINTS_MAX − 1`
 * points au maximum sur l'anneau.
 *
 * Le déplacement est plan (mètres → degrés), ce qui suffit à 610 m et évite une
 * formule sphérique dont la précision ne se verrait pas ici. Aux pôles, la
 * longitude n'a plus de sens : on rend le seul centre.
 *
 * @param {{latitude?: unknown, longitude?: unknown, rayon?: unknown, maximum?: number}} options
 * @returns {{latitude: number, longitude: number}[]} vide si les coordonnées manquent
 */
export function pointsGeofence({ latitude, longitude, rayon, maximum = POINTS_MAX } = {}) {
  /* `Number(null)` vaut 0 : sans ce garde, un champ vide poserait un point au
     large du Golfe de Guinée — et le pass l'accepterait. */
  const enNombre = (valeur) =>
    valeur === null || valeur === undefined || valeur === '' ? NaN : Number(valeur)

  const lat = enNombre(latitude)
  const lng = enNombre(longitude)
  if (!coordonneesValides(lat, lng)) return []

  const borne = Number.isInteger(maximum) && maximum > 0 ? Math.min(maximum, POINTS_MAX) : POINTS_MAX
  const centre = { latitude: arrondir(lat), longitude: arrondir(lng) }
  const anneau = rayonAnneauM(rayon)

  if (anneau <= 0 || borne === 1 || Math.abs(lat) >= 89.9) return [centre]

  const perimetre = Math.min(2 * Math.PI * anneau, ANNEAU_CIRCONFERENCE_MAX_M)
  const plafond = Math.min(borne - 1, POINTS_ANNEAU_MAX)
  const nombre = Math.min(Math.max(1, Math.ceil(perimetre / ESPACEMENT_M)), plafond)

  const metresParDegreLongitude = METRES_PAR_DEGRE * Math.cos((lat * Math.PI) / 180)
  const points = [centre]

  for (let index = 0; index < nombre; index += 1) {
    const angle = (2 * Math.PI * index) / nombre
    points.push({
      latitude: arrondir(lat + (anneau * Math.cos(angle)) / METRES_PAR_DEGRE),
      longitude: arrondir(lng + (anneau * Math.sin(angle)) / metresParDegreLongitude),
    })
  }

  return points
}
