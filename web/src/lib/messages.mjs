/* ============================================================================
   Messages aux clients — règles **pures**, sans Next ni base.

   Source : `docs/mesure-p0-4-messages-2026-11-02.md` §2. Toutes les bornes
   viennent de `2026-11-02-a7b/rendu/d01-notifications.html` et du chunk de la
   page (`max(50,"Titre trop long (50 caractères max)")`, `min(10,…)`,
   `max(150,…)`), pas d'un choix. Le quota de 3 par jour est écrit tel quel dans
   la cible (« Jusqu'à 3 notifications par jour »).

   Ce que ce module ne fait pas : **il n'envoie rien**. Aucun canal sortant
   n'existe dans ce socle ; l'écran dit donc « en attente » et jamais « envoyé ».
   La décision de brancher un canal est P0-4b, et elle ne touchera pas ce
   fichier : la validation et les bornes sont les mêmes.
   ========================================================================== */

/** Bornes mesurées sur la cible. Une seule copie — la base les tient aussi. */
export const TITRE_MIN = 3
export const TITRE_MAX = 50
export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 150
export const LIEN_MAX = 500

/** Quota journalier et taille d'historique, mesurés (`3` / `limit(20)`). */
export const QUOTA_JOUR = 3
export const HISTORIQUE = 20

/**
 * Lit le formulaire et rend les trois champs, **détourés**.
 *
 * `lien` est rendu `null` sur un champ vide plutôt que `''` : la RPC reçoit
 * `null` et ne transporte pas une chaîne vide qui voudrait dire la même chose.
 *
 * @param {FormData|Record<string, unknown>|undefined|null} donnees
 * @returns {{titre: string, corps: string, lien: string|null}}
 */
export function messageDepuisFormulaire(donnees) {
  const lire = (nom) => {
    const valeur = donnees && typeof donnees.get === 'function' ? donnees.get(nom) : donnees?.[nom]
    return typeof valeur === 'string' ? valeur.trim() : ''
  }
  const lien = lire('lien')
  return { titre: lire('titre'), corps: lire('corps'), lien: lien === '' ? null : lien }
}

/**
 * Vrai si le lien est une URL http(s) exploitable.
 *
 * La cible exige `z.string().url()` et l'affiche dans un bouton : `mailto:` ou
 * `javascript:` produiraient un bouton qui ne mène nulle part, ou pire. Un lien
 * vide n'est **pas** invalide — il est simplement absent (`null` en amont).
 *
 * @param {string|null} lien
 */
export function lienValide(lien) {
  if (lien === null) return true
  if (typeof lien !== 'string') return false
  return lien.length <= LIEN_MAX && /^https?:\/\/[^\s]+$/i.test(lien)
}

/**
 * Les refus, dans l'ordre des champs du formulaire.
 *
 * L'ordre n'est pas cosmétique : l'action s'en sert pour choisir **un** état
 * d'URL, et un ordre instable ferait clignoter l'erreur affichée d'un champ à
 * l'autre entre deux essais identiques.
 *
 * @param {{titre: string, corps: string, lien: string|null}} message
 * @returns {string[]} codes : `titre`, `titreLong`, `corps`, `corpsLong`, `lien`
 */
export function refusMessage(message) {
  const refus = []
  if (message.titre.length < TITRE_MIN) refus.push('titre')
  else if (message.titre.length > TITRE_MAX) refus.push('titreLong')

  if (message.corps.length < MESSAGE_MIN) refus.push('corps')
  else if (message.corps.length > MESSAGE_MAX) refus.push('corpsLong')

  if (!lienValide(message.lien)) refus.push('lien')
  return refus
}

/**
 * Lit la réponse de `messages_du_commerce()`.
 *
 * Rend `null` — jamais des zéros — quand la forme n'est pas celle attendue :
 * « aucun message » et « je n'ai pas su lire » ne se corrigent pas au même
 * endroit (même règle que `lirePlafond`). Un `messages` non tableau est traité
 * comme illisible : une liste vide afficherait « aucun message » sur une
 * réponse cassée.
 *
 * @param {unknown} donnees réponse JSON de la RPC
 * @returns {{limite: number, aujourdhui: number, reste: number,
 *   joignables: number, messages: Array<object>} | null}
 */
export function lireMessages(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  const { limite, aujourdhui, joignables, messages } =
    /** @type {{limite?: unknown, aujourdhui?: unknown, joignables?: unknown, messages?: unknown}} */ (
      donnees
    )

  const entier = (valeur) => typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0
  if (!entier(limite) || limite === 0) return null
  if (!entier(aujourdhui) || !entier(joignables)) return null
  if (!Array.isArray(messages)) return null

  return {
    limite,
    aujourdhui,
    reste: Math.max(limite - aujourdhui, 0),
    joignables,
    messages,
  }
}

/**
 * L'état du quota : `disponible` ou `atteint`.
 *
 * Quand le quota est atteint, la cible **remplace le bouton** par « Prochaine
 * notification demain » au lieu de le désactiver — la décision est prise ici,
 * l'écran ne fait que la suivre.
 *
 * @param {{aujourdhui: number, limite: number}} file
 * @returns {'disponible'|'atteint'}
 */
export function etatQuota(file) {
  return file.aujourdhui >= file.limite ? 'atteint' : 'disponible'
}

/**
 * Le libellé d'un statut de la file, en clé i18n.
 *
 * `en_attente` n'existe pas dans la cible : elle a `sent`, `draft`, `blocked`.
 * Ici, aucun canal n'existe, donc un message envoyé n'est **pas** un état
 * possible — afficher « Envoyée » serait le seul vrai mensonge de cet écran.
 *
 * @param {unknown} statut
 */
export function cleStatut(statut) {
  return statut === 'envoye' ? 'page.messages.statutEnvoye' : 'page.messages.statutEnAttente'
}
