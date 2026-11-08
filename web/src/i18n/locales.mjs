/* ============================================================================
   i18n — une seule locale servie : le français.

   Ce que la cible fait (mesuré) : trois locales, `fr` sans préfixe, `en` et
   `ar` préfixées (`p02-home-en.html`, `p03-home-ar.html`, `sitemap.xml`). Ce
   que **nous** faisons : le français seul — décision humaine du 2026-10-31,
   « pas de version EN, que du FR ».

   La structure mesurée reste donc décrite ici, mais `LOCALES` ne contient que
   ce qui est réellement traduit. Conséquence assumée : `/en` et `/ar` ne sont
   plus des segments de locale, donc `decouperChemin` les traite comme de
   simples chemins — et `redirectionLocale` les ramène vers la version
   française, pour qu'un ancien lien ne finisse pas en 404.
   ========================================================================== */

/** Locale servie sans préfixe (`/`), comme la cible. */
export const LOCALE_PAR_DEFAUT = 'fr'

/** Locales servies, dans l'ordre d'affichage. Une seule, et c'est un choix. */
export const LOCALES = Object.freeze(['fr'])

/** Locales qui se lisent de droite à gauche. Vide tant qu'aucune n'est servie. */
export const LOCALES_RTL = Object.freeze([])

/**
 * Préfixes de locale **retirés** : ils ne sont plus servis, mais ils ont existé
 * (captures, liens partagés, favoris). On les redirige au lieu de les laisser
 * tomber en 404 — un 404 sur `/en/caisse` ferait croire à une panne.
 */
export const PREFIXES_RETIRES = Object.freeze(['en', 'ar'])

/** Vrai si la valeur est une locale servie par l'application. */
export function estLocale(valeur) {
  return LOCALES.includes(valeur)
}

/** Sens d'écriture d'une locale. Une locale inconnue retombe sur `ltr`. */
export function directionDe(locale) {
  return LOCALES_RTL.includes(locale) ? 'rtl' : 'ltr'
}

/** Locale sûre : ce qui n'est pas servi n'entre pas dans l'application. */
export function localeSure(valeur) {
  return estLocale(valeur) ? valeur : LOCALE_PAR_DEFAUT
}
