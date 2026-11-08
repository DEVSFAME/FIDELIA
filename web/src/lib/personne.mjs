/* ============================================================================
   Identité d'une personne — le mapping **prénom / nom**, en un seul endroit.

   Le piège est réel et silencieux : la base porte `first_name` et `last_name`,
   le français dit « prénom » puis « nom » (ordre inverse de l'anglais usuel
   dans les formulaires), et l'arabe se lit de droite à gauche. Un échange
   `first_name` ↔ `last_name` ne lève aucune erreur : il affiche simplement
   « Dupont Jean » sur une fiche client, et personne ne s'en aperçoit avant un
   mailing signé du mauvais nom.

   D'où trois règles, tenues par `personne.test.mjs` :

     1. **Le mapping est unique et nommé** : `first_name` = *prénom*,
        `last_name` = *nom de famille*. Aucun autre module ne refait la
        correspondance à la main.
     2. **Affichage** : `prenom` puis `nom` en `fr`/`en` (« Jean Dupont »).
     3. **Tri** : `nom` puis `prenom` — on ne trie pas une liste de clients sur
        le prénom, sinon les « Jean » se retrouvent éparpillés.

   Rien ici ne dépend de Next : le module est testable seul.
   ========================================================================== */

/**
 * Normalise une ligne `clients` vers les deux champs français.
 * Une valeur absente devient une chaîne vide, jamais `undefined` : un
 * `undefined` interpolé affiche « undefined » dans un `<span>`.
 *
 * @param {{first_name?: string|null, last_name?: string|null}|null|undefined} ligne
 * @returns {{prenom: string, nom: string}}
 */
export function depuisLigne(ligne) {
  const net = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '')
  return {
    prenom: net(ligne?.first_name),
    nom: net(ligne?.last_name),
  }
}

/**
 * Nom complet pour l'affichage — « prénom nom ».
 * Les espaces surnuméraires sont supprimés : un client sans nom ne doit pas
 * produire « Jean  » ni «  Jean ».
 *
 * @param {{prenom?: string, nom?: string}} personne
 * @param {'fr'|'en'|'ar'} [locale]
 */
export function nomComplet({ prenom = '', nom = '' } = {}, locale = 'fr') {
  const p = String(prenom).trim()
  const n = String(nom).trim()
  // `ar` se lit de droite à gauche : l'ordre logique du texte reste
  // « prénom nom » (c'est la direction qui s'inverse, pas la séquence).
  void locale
  return [p, n].filter(Boolean).join(' ')
}

/**
 * Clé de tri alphabétique — « nom prénom », insensible à la casse et aux
 * accents, pour que « Élodie » se range avec « Elodie » et non après « Z ».
 *
 * @param {{prenom?: string, nom?: string}} personne
 */
export function cleTri({ prenom = '', nom = '' } = {}) {
  const plier = (valeur) =>
    String(valeur)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  return `${plier(nom)} ${plier(prenom)}`.trim()
}
