/* ============================================================================
   API de traduction — pure, sans Next, donc utilisable côté serveur, côté
   client et dans les tests.

   Règle de sûreté : une clé inconnue **lève**, elle ne rend pas la clé. Une clé
   affichée à l'utilisateur (`accueil.titr`) est un défaut visible en production
   qu'aucun test ne rattrape ; une exception l'est immédiatement.
   ========================================================================== */

import { DICTIONNAIRES } from './dictionnaires.mjs'
import { LOCALE_PAR_DEFAUT, directionDe, localeSure } from './locales.mjs'

/** Vrai si la locale possède un dictionnaire. */
export function aUnDictionnaire(locale) {
  return Object.hasOwn(DICTIONNAIRES, locale)
}

/** Dictionnaire d'une locale, ou celui par défaut. */
export function dictionnaire(locale) {
  return aUnDictionnaire(locale) ? DICTIONNAIRES[locale] : DICTIONNAIRES[LOCALE_PAR_DEFAUT]
}

/** Clés d'une locale, triées (ordre stable pour les comparaisons). */
export function cles(locale) {
  return Object.keys(dictionnaire(locale)).sort()
}

/**
 * Traduit une clé, avec interpolation `{nom}`.
 * @param {string} locale
 * @param {string} cle
 * @param {Record<string, string|number>} [variables]
 */
export function traduire(locale, cle, variables) {
  const table = dictionnaire(locale)
  const texte = table[cle]
  if (typeof texte !== 'string') {
    throw new Error(`i18n : clé inconnue « ${cle} » pour la locale « ${locale} »`)
  }
  if (!variables) return texte
  return texte.replace(/\{(\w+)\}/g, (entier, nom) =>
    Object.hasOwn(variables, nom) ? String(variables[nom]) : entier
  )
}

/**
 * Lie les fonctions à une locale — c'est ce que consomment les composants.
 * @param {string} locale
 */
export function pour(locale) {
  const sure = localeSure(locale)
  return {
    locale: sure,
    dir: directionDe(sure),
    t: (cle, variables) => traduire(sure, cle, variables),
  }
}
