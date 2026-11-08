/* ============================================================================
   L'emplacement de la boutique — analyse **pure** de ce que le commerçant colle.

   Source : `_captures/2026-11-04-a8/raw/assets/…settings_page-dd12….js`
   (offset ≈ 15 200) et `e01-settings.html`. La cible ne stocke **pas** le lien :
   `lien_localisation` n'existe pas dans sa table, le formulaire ré-affiche
   `${latitude}, ${longitude}`. L'analyse du lien est donc côté serveur, et
   c'est ce module.

   Deux formes sont acceptées, comme l'aide mesurée les énonce (« copiez le
   lien » ou « saisissez vos coordonnées : 33.5731, -7.5898 ») :

     - une **paire de coordonnées** décimale ;
     - un **lien Google Maps** qui les porte, sous l'une des quatre formes que
       Maps produit réellement : `@lat,lng,15z` (l'adresse de la barre), le
       paramètre `q`/`query`/`ll`/`center` d'un lien de partage, et les données
       `!3d…!4d…` d'une URL de lieu.

   Ce que ce module refuse, et pourquoi c'est un refus et non une devinette :
   un **lien court** (`maps.app.goo.gl`, `goo.gl/maps`, `g.co/kgs`) ne contient
   aucune coordonnée — le résoudre demande un aller-retour réseau vers Google,
   donc une requête sortante décidée par un champ de formulaire. On refuse en
   nommant la cause ; l'écran dit quoi faire. `[?]` côté cible : la façon dont
   leur serveur traite les liens courts n'est pas mesurée, et n'est pas imitée.
   ========================================================================== */

/** Bornes géographiques. Hors de là, ce n'est pas une coordonnée, c'est une faute. */
export const LATITUDE_MIN = -90
export const LATITUDE_MAX = 90
export const LONGITUDE_MIN = -180
export const LONGITUDE_MAX = 180

/**
 * Précision conservée : six décimales, comme `numeric(9,6)` en base.
 * Maps en produit sept ; les garder créerait un arrondi silencieux à
 * l'écriture, donc deux valeurs différentes pour un même geste.
 */
export const DECIMALES = 6

/**
 * Les motifs de refus, nommés une fois. `lienCourt` est le seul qui ne soit
 * pas une faute de saisie : c'est une limite de l'analyse hors réseau.
 */
export const CODES_REFUS = Object.freeze({
  lienCourt: 'lienCourt',
  horsBornes: 'horsBornes',
  invalide: 'invalide',
})

/** Hôtes des liens raccourcis de Google Maps — aucune coordonnée dedans. */
const HOTES_COURTS = Object.freeze(['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.app.link'])

/** Une paire décimale : « 33.5731, -7.5898 ». */
const PAIRE = /^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)$/

/** `@33.5731,-7.5898,15z` — l'adresse de la barre, et les URL de lieu. */
const FORME_AROBASE = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/

/** `!3d33.5731!4d-7.5898` — les données d'une URL de lieu. */
const FORME_DONNEES = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/

/** `?q=…`, `?query=…`, `?ll=…`, `?center=…` — les liens de partage. */
const FORME_PARAMETRE = /[?&](?:q|query|ll|center|daddr)=([^&#]*)/
const FORME_PARAMETRE_PAIRE = /(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/

/** Un résultat de refus, toujours de la même forme. */
const refus = (code) => ({ etat: 'refus', code, latitude: null, longitude: null })

/** Vrai si la paire tient dans les bornes géographiques. */
export function coordonneesValides(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= LATITUDE_MIN &&
    latitude <= LATITUDE_MAX &&
    longitude >= LONGITUDE_MIN &&
    longitude <= LONGITUDE_MAX
  )
}

/** Arrondit à la précision de la colonne ; `null` si ce n'est pas un nombre. */
function arrondir(valeur) {
  const nombre = Number(valeur)
  if (!Number.isFinite(nombre)) return null
  return Number(nombre.toFixed(DECIMALES))
}

/** Forme les deux nombres, ou refuse `horsBornes`. */
function paire(latitude, longitude) {
  const lat = arrondir(latitude)
  const lng = arrondir(longitude)
  if (lat === null || lng === null) return refus(CODES_REFUS.invalide)
  if (!coordonneesValides(lat, lng)) return refus(CODES_REFUS.horsBornes)
  return { etat: 'ok', code: null, latitude: lat, longitude: lng }
}

/** Décode sans lever : un `%` isolé est une saisie, pas une exception. */
function decoder(texte) {
  try {
    return decodeURIComponent(texte)
  } catch {
    return texte
  }
}

/** L'hôte d'une adresse, ou `null` si ce n'en est pas une. */
function hote(texte) {
  try {
    const adresse = /^[a-z]+:\/\//i.test(texte) ? texte : `https://${texte}`
    return new URL(adresse).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Lit ce que le champ « Emplacement de la boutique » contient.
 *
 * Quatre issues, et aucune n'est ambiguë :
 *   - `vide` — le champ est vide : la proximité est **désactivée** (`null` en
 *     base, comportement mesuré : « Laissez vide pour désactiver ») ;
 *   - `ok` — deux nombres, arrondis à six décimales ;
 *   - `refus` — avec un `code` : `lienCourt`, `horsBornes` ou `invalide`.
 *
 * L'ordre des tentatives compte : la paire nue d'abord (une saisie de
 * coordonnées n'est pas une URL), puis les formes d'URL de la plus précise à
 * la plus vague. Aucune ne devine : un lien sans coordonnée est refusé.
 *
 * @param {unknown} saisie valeur brute du formulaire
 */
export function analyserLocalisation(saisie) {
  const texte = typeof saisie === 'string' ? saisie.trim() : ''
  if (texte === '') return { etat: 'vide', code: null, latitude: null, longitude: null }

  const nu = texte.match(PAIRE)
  if (nu) return paire(nu[1].replace(',', '.'), nu[2].replace(',', '.'))

  const propre = decoder(texte)
  const domaine = hote(propre)
  if (domaine && HOTES_COURTS.some((court) => domaine === court || domaine.endsWith(`.${court}`))) {
    return refus(CODES_REFUS.lienCourt)
  }

  const donnees = propre.match(FORME_DONNEES)
  if (donnees) return paire(donnees[1], donnees[2])

  const arobase = propre.match(FORME_AROBASE)
  if (arobase) return paire(arobase[1], arobase[2])

  const parametre = propre.match(FORME_PARAMETRE)
  if (parametre) {
    /* `q=loc:33.5,-7.5` — Maps préfixe parfois la paire. Le motif cherche la
       paire dans la valeur, donc le préfixe tombe de lui-même. */
    const dedans = parametre[1].match(FORME_PARAMETRE_PAIRE)
    if (dedans) return paire(dedans[1], dedans[2])
  }

  return refus(CODES_REFUS.invalide)
}

/**
 * Le texte que l'écran ré-affiche : `${latitude}, ${longitude}`.
 *
 * C'est **littéralement** le gabarit du chunk mesuré, et c'est ce qui prouve à
 * l'écran que la base a gardé des coordonnées et non la chaîne collée.
 */
export function formaterCoordonnees(latitude, longitude) {
  if (!coordonneesValides(latitude, longitude)) return ''
  return `${latitude}, ${longitude}`
}
