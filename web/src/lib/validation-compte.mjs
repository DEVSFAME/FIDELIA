/* ============================================================================
   Validation des formulaires d'authentification — règles **pures**, sans Next.

   Pourquoi un module et pas des `if` dans chaque server action : les mêmes
   règles doivent tenir côté serveur (autorité) et côté écran (retour immédiat,
   les trois coches du mot de passe). Deux copies divergent au premier
   changement — et c'est la copie serveur qui décide, donc l'écran mentirait.

   Ce que ce module rend : des **clés de dictionnaire**, jamais des phrases.
   Une phrase en dur ici échapperait à l'i18n et resterait française sur
   `/ar`. Les messages sont ceux de la cible, mesurés dans le schéma Zod du
   bundle `_next_static_chunks_app__auth__register_page-…js` :
     `fullName` min 2, `email` email, `phone` ≥ 9 chiffres,
     `password` min 8 + majuscule + chiffre, `confirmPassword` identique,
     `consentementCndp` obligatoire.
   ========================================================================== */

/** Longueur minimale du nom complet (mesurée : `.min(2)`, `.refine` téléphone). */
export const NOM_MINIMUM = 2
/** Longueur minimale du mot de passe d'inscription (mesurée : `.min(8)`). */
export const MOT_DE_PASSE_MINIMUM = 8
/** Chiffres minimaux d'un numéro marocain (mesurée : `.length >= 9`). */
export const TELEPHONE_CHIFFRES = 9

/** Vrai si la chaîne ressemble à une adresse exploitable. Volontairement sobre :
 *  la seule validation qui fait foi est celle de Supabase, et une expression
 *  « complète » refuse des adresses valides (TLD longs, domaines punycode). */
export function emailValide(valeur) {
  const texte = String(valeur ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texte)
}

/** Ne garde que les chiffres d'un numéro saisi (« 06 12 34 » → « 061234 »). */
export function chiffresDe(valeur) {
  return String(valeur ?? '').replace(/[^0-9]/g, '')
}

/**
 * Les trois règles du mot de passe, dans l'ordre d'affichage de la cible.
 * `cle` sert **deux fois** : libellé de la coche (atteinte) et message d'erreur
 * (non atteinte) — la cible écrit la même phrase dans les deux cas pour la
 * longueur, et deux phrases voisines pour les autres.
 */
export const REGLES_MOT_DE_PASSE = Object.freeze([
  { cle: 'auth.motDePasse.minimum', erreur: 'auth.motDePasse.minimum', test: (m) => m.length >= MOT_DE_PASSE_MINIMUM },
  { cle: 'auth.motDePasse.majuscule', erreur: 'auth.motDePasse.majusculeRequise', test: (m) => /[A-Z]/.test(m) },
  { cle: 'auth.motDePasse.chiffre', erreur: 'auth.motDePasse.chiffreRequis', test: (m) => /[0-9]/.test(m) },
])

/**
 * Première règle non satisfaite, ou `null` si le mot de passe est acceptable.
 * @param {string} motDePasse
 * @returns {string|null} clé de dictionnaire
 */
export function erreurMotDePasse(motDePasse) {
  const valeur = String(motDePasse ?? '')
  const manquee = REGLES_MOT_DE_PASSE.find((regle) => !regle.test(valeur))
  return manquee ? manquee.erreur : null
}

/**
 * Validation du couple (mot de passe, confirmation) — la partie commune à
 * l'inscription et à l'écran « nouveau mot de passe ».
 *
 * Extraite plutôt que recopiée : les deux écrans imposent **les mêmes** règles
 * (celles du schéma mesuré), et deux copies divergent au premier changement —
 * c'est exactement ce que le module existe pour éviter.
 * @param {{motDePasse?: string, confirmation?: string}} saisie
 * @returns {{erreurs: Record<string, string>}}
 */
export function verifierNouveauMotDePasse(saisie = {}) {
  const motDePasse = String(saisie.motDePasse ?? '')
  const confirmation = String(saisie.confirmation ?? '')

  /** @type {Record<string, string>} */
  const erreurs = {}

  const erreurMdp = erreurMotDePasse(motDePasse)
  if (erreurMdp) erreurs.motDePasse = erreurMdp
  if (confirmation !== motDePasse || confirmation === '') {
    erreurs.confirmation = 'auth.confirmation.differente'
  }

  return { erreurs }
}

/**
 * Validation de l'inscription.
 * @param {{nom?: string, email?: string, telephone?: string, motDePasse?: string, confirmation?: string, consentement?: boolean}} saisie
 * @returns {{erreurs: Record<string, string>, valeurs: {nom: string, email: string, telephone: string}}}
 *   `valeurs` est renvoyé pour que l'écran se réaffiche rempli : un formulaire
 *   vidé à chaque faute de frappe est la première cause d'abandon.
 */
export function verifierInscription(saisie = {}) {
  const nom = String(saisie.nom ?? '').trim()
  const email = String(saisie.email ?? '').trim()
  const telephone = String(saisie.telephone ?? '').trim()

  /** @type {Record<string, string>} */
  const erreurs = {}

  if (nom.length < NOM_MINIMUM) erreurs.nom = 'auth.nom.requis'
  if (!emailValide(email)) erreurs.email = 'auth.email.invalide'
  if (chiffresDe(telephone).length < TELEPHONE_CHIFFRES) erreurs.telephone = 'auth.telephone.incomplet'

  Object.assign(erreurs, verifierNouveauMotDePasse(saisie).erreurs)
  if (saisie.consentement !== true) erreurs.consentement = 'auth.consentement.requis'

  return { erreurs, valeurs: { nom, email, telephone } }
}

/**
 * Validation de la connexion — volontairement **pauvre**. On ne vérifie que la
 * présence des deux champs, et on laisse Supabase trancher le reste.
 *
 * Pourquoi pas les règles de la cible (`.min(6)`, `.email()`) : une règle de
 * forme appliquée à la connexion refuse **avant tout appel** un compte créé
 * sous une politique plus ancienne ou plus permissive. L'écran dirait alors
 * « identifiants refusés » pour un mot de passe correct, sans qu'aucune requête
 * n'ait eu lieu — un faux négatif impossible à diagnostiquer. Le formulaire
 * d'inscription, lui, impose la règle (c'est là qu'elle protège).
 * @param {{email?: string, motDePasse?: string}} saisie
 * @returns {string|null} clé de dictionnaire, ou `null`
 */
export function erreurConnexion(saisie = {}) {
  const email = String(saisie.email ?? '').trim()
  const motDePasse = String(saisie.motDePasse ?? '')
  if (!email || !motDePasse) return 'auth.connexion.champsVides'
  return null
}

/**
 * Validation de la demande de réinitialisation.
 * @param {{email?: string}} saisie
 * @returns {string|null} clé de dictionnaire, ou `null`
 */
export function erreurDemandeReinitialisation(saisie = {}) {
  return emailValide(saisie?.email) ? null : 'auth.email.invalide'
}
