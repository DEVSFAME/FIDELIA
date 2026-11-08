/* ============================================================================
   Fiche établissement — règles **pures**, sans Next ni base.

   Source : `_captures/2026-11-02-a7/rendu/c01-settings.html`. Ce module ne
   décide d'aucune valeur : il vérifie ce que le formulaire envoie (bornes
   mesurées : `min=50 max=2000 step=50`, `maxlength=120`, trois valeurs du
   menu) et type ce que la base rend. Aucun texte français ici — le repli du
   message de proximité se compose depuis le dictionnaire.

   Depuis P0-2b (passe A8) l'emplacement n'est plus une chaîne à recopier :
   le champ accepte un lien Google Maps ou une paire de coordonnées, et c'est
   `localisation.mjs` qui en tire `latitude`/`longitude`. La base ne garde
   **que** les deux nombres — le lien n'est qu'une forme d'entrée.
   ========================================================================== */

import { analyserLocalisation, formaterCoordonnees } from './localisation.mjs'

/**
 * Les trois valeurs du `<select name="type_activite">`, dans l'ordre du DOM
 * mesuré (`value="physique"`, `value="en_ligne"`, `value="mixte"`).
 */
export const TYPES_ACTIVITE = Object.freeze(['physique', 'en_ligne', 'mixte'])

/**
 * Le défaut de la colonne, et celui du formulaire neuf : le `<select>` de la
 * cible n'a **pas** d'option vide, la première valeur est donc celle d'un
 * commerce qui n'a jamais répondu à la question.
 */
export const TYPE_ACTIVITE_DEFAUT = 'physique'

/** Bornes du rayon — `min`, `max` et `step` mesurés sur le champ 13. */
export const RAYON_MIN = 50
export const RAYON_MAX = 2000
export const RAYON_PAS = 50

/**
 * Rayon d'un formulaire vide. C'est le `placeholder` mesuré (`1000`) et le
 * `default 1000` de la colonne : un champ laissé vide ne doit pas devenir un
 * refus que la cible n'affiche pas.
 */
export const RAYON_DEFAUT = 1000

/** Longueur du message de proximité — `maxlength="120"` mesuré. */
export const TEXTE_MAX = 120

/**
 * Longueur du nom : elle ne vient pas de la capture mais de la **colonne**
 * (`name varchar(120)`, `0003`). C'est la borne qui existe, et la seule.
 */
export const NOM_MAX = 120

/** Vrai si la valeur est l'une des trois activités mesurées. */
export function typeActiviteValide(valeur) {
  return TYPES_ACTIVITE.includes(valeur)
}

/**
 * Vrai si le rayon est un entier dans les bornes **et** sur un pas de 50.
 *
 * Le pas n'est pas une coquetterie : le balisage porte `step="50"`, donc un
 * navigateur refuse 125 (état `stepMismatch`). Un formulaire envoyé sans
 * navigateur, lui, ne refuse rien — d'où le même contrôle ici et dans `0011`.
 */
export function rayonValide(valeur) {
  return (
    typeof valeur === 'number' &&
    Number.isInteger(valeur) &&
    valeur >= RAYON_MIN &&
    valeur <= RAYON_MAX &&
    valeur % RAYON_PAS === 0
  )
}

/** Vrai si le nom, une fois détouré, tient dans la colonne et n'est pas vide. */
export function nomValide(valeur) {
  if (typeof valeur !== 'string') return false
  const nom = valeur.trim()
  return nom !== '' && nom.length <= NOM_MAX
}

/** Vrai si le message est facultatif **et** borné à 120 caractères. */
export function texteValide(valeur) {
  if (valeur === null || valeur === undefined) return true
  if (typeof valeur !== 'string') return false
  return valeur.trim().length <= TEXTE_MAX
}

/**
 * Lit le formulaire de `/settings` et rend la fiche typée.
 *
 * Deux normalisations : tout est détouré, et un rayon vide vaut
 * `RAYON_DEFAUT` (le champ n'est pas `required`). **Aucune** validation des
 * adresses ni du téléphone — les `placeholder` mesurés sont des domaines sans
 * schéma (`moncafe.ma`) : exiger `https://` refuserait l'exemple de la cible.
 *
 * @param {{get: (nom: string) => unknown}} donnees `FormData` (ou un double)
 */
export function ficheDepuisFormulaire(donnees) {
  const texte = (nom) => String(donnees.get(nom) ?? '').trim()
  const rayonSaisi = texte('geofence_radius_m')
  const lienLocalisation = texte('lien_localisation')
  const emplacement = analyserLocalisation(lienLocalisation)

  return {
    nom: texte('name'),
    typeActivite: texte('type_activite'),
    phone: texte('phone'),
    city: texte('city'),
    address: texte('address'),
    description: texte('description'),
    siteUrl: texte('site_url'),
    reservationUrl: texte('reservation_url'),
    instagramUrl: texte('instagram_url'),
    facebookUrl: texte('facebook_url'),
    tiktokUrl: texte('tiktok_url'),
    lienLocalisation,
    emplacement: { etat: emplacement.etat, code: emplacement.code },
    latitude: emplacement.latitude,
    longitude: emplacement.longitude,
    rayon: rayonSaisi === '' ? RAYON_DEFAUT : Number(rayonSaisi),
    texte: texte('geofence_texte'),
  }
}

/**
 * Les motifs de refus, dans un ordre fixe (le premier devient le message).
 * Cinq codes, un par règle mesurée — rien sur les adresses, que la cible ne
 * valide pas.
 *
 * `emplacementCourt` est séparé de `emplacement` à dessein : un lien court
 * n'est pas une faute de saisie, c'est un lien que l'analyse hors réseau ne
 * peut pas ouvrir. Le dire avec le même message ferait chercher au commerçant
 * une faute qu'il n'a pas commise.
 *
 * @param {Record<string, unknown>} fiche
 * @returns {string[]} codes de refus (`[]` si tout tient debout)
 */
export function refusFiche(fiche) {
  const f = fiche && typeof fiche === 'object' ? fiche : {}
  const refus = []

  if (!nomValide(f.nom)) refus.push('nom')
  if (!typeActiviteValide(f.typeActivite)) refus.push('type')

  /* Une fiche sans `emplacement` (test, appel direct) n'est pas refusée : le
     refus ne porte que sur ce qui a été analysé. */
  if (f.emplacement && f.emplacement.etat === 'refus') {
    refus.push(f.emplacement.code === 'lienCourt' ? 'emplacementCourt' : 'emplacement')
  }

  if (!rayonValide(f.rayon)) refus.push('rayon')
  if (!texteValide(f.texte)) refus.push('texte')

  return refus
}

/**
 * La fiche d'une réponse RPC, typée : `null` de texte devient `''`, un type
 * inconnu retombe sur le défaut de la colonne. Un rayon hors bornes est
 * **affiché tel quel** — le corriger en silence ferait enregistrer autre chose
 * que ce que le commerçant lit ; la validation le refusera à l'enregistrement.
 *
 * L'emplacement est **recomposé** depuis les coordonnées, exactement comme le
 * fait la cible : `${latitude}, ${longitude}`. Un `null` des deux côtés rend un
 * champ vide, donc « proximité désactivée ».
 *
 * @param {unknown} donnees JSON de `fiche_du_commerce()`
 */
export function lireFiche(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {}
  const texte = (valeur) => (typeof valeur === 'string' ? valeur : '')
  const rayon = typeof d.geofence_radius_m === 'string'
    ? Number(d.geofence_radius_m)
    : d.geofence_radius_m

  /* `numeric` peut revenir en chaîne selon le chemin (RPC, JSON) : on convertit
     sans jamais accepter `NaN` pour une coordonnée. */
  const nombre = (valeur) => {
    const n = typeof valeur === 'string' ? Number(valeur) : valeur
    return Number.isFinite(n) ? n : null
  }
  const latitude = nombre(d.latitude)
  const longitude = nombre(d.longitude)
  const couple = latitude !== null && longitude !== null

  return {
    nom: texte(d.name),
    typeActivite: typeActiviteValide(d.type_activite) ? d.type_activite : TYPE_ACTIVITE_DEFAUT,
    phone: texte(d.phone),
    city: texte(d.city),
    address: texte(d.address),
    description: texte(d.description),
    siteUrl: texte(d.site_url),
    reservationUrl: texte(d.reservation_url),
    instagramUrl: texte(d.instagram_url),
    facebookUrl: texte(d.facebook_url),
    tiktokUrl: texte(d.tiktok_url),
    lienLocalisation: couple ? formaterCoordonnees(latitude, longitude) : '',
    emplacement: { etat: couple ? 'ok' : 'vide', code: null },
    latitude: couple ? latitude : null,
    longitude: couple ? longitude : null,
    rayon: Number.isInteger(rayon) ? rayon : RAYON_DEFAUT,
    texte: texte(d.geofence_texte),
  }
}
