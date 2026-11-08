/* ============================================================================
   Apparence — règles **pures**, sans Next ni base.

   Source : `_captures/2026-11-02-a6/rendu/a08-branding.html` (200) et son
   chunk `_next_static_chunks_app__dashboard__branding_page-badcb0936c16a5ca.js`.
   Les dix types, les huit couleurs, le `min(2)` du nom et le motif
   `^#[0-9A-Fa-f]{6}$` sont **lus** dans ces deux fichiers, pas choisis.

   Ce que ce module ne fait pas : envoyer un fichier. La cible poste vers
   `/api/branding/upload` et garde l'URL rendue ; ce socle n'a ni espace de
   stockage ni clé de service, donc les deux images s'écrivent en **adresse**.
   La conséquence est dite à l'écran, pas contournée ici.
   ========================================================================== */

/**
 * Les dix types d'établissement, dans l'ordre du DOM mesuré (et du tableau `L`
 * du chunk : `value`, `label`, `emoji`). L'emoji n'est pas un ornement : la
 * cible s'en sert comme **icône de carte** tant que le commerce n'a pas de logo
 * (« Sert d'icône tant que vous n'avez pas de logo. »). Il est donc une donnée
 * de la page, pas une décoration d'interface.
 *
 * Les libellés sont des clés **littérales** : une clé composée par gabarit
 * échappe au balayage d'`i18n-ui`, et une faute de frappe ne se verrait qu'à
 * l'écran.
 */
export const TYPES_ETABLISSEMENT = Object.freeze([
  { valeur: 'restaurant', cle: 'page.apparence.type.restaurant', emoji: '🍽️' },
  { valeur: 'cafe', cle: 'page.apparence.type.cafe', emoji: '☕' },
  { valeur: 'coiffure', cle: 'page.apparence.type.coiffure', emoji: '✂️' },
  { valeur: 'barbershop', cle: 'page.apparence.type.barbershop', emoji: '💈' },
  { valeur: 'pressing', cle: 'page.apparence.type.pressing', emoji: '👔' },
  { valeur: 'retoucherie', cle: 'page.apparence.type.retoucherie', emoji: '🧵' },
  { valeur: 'boucherie', cle: 'page.apparence.type.boucherie', emoji: '🥩' },
  { valeur: 'patisserie', cle: 'page.apparence.type.patisserie', emoji: '🥐' },
  { valeur: 'librairie', cle: 'page.apparence.type.librairie', emoji: '📚' },
  { valeur: 'autre', cle: 'page.apparence.type.autre', emoji: '🏪' },
])

/** Les dix valeurs seules, dans l'ordre — c'est ce que la base accepte. */
export const VALEURS_TYPE = Object.freeze(TYPES_ETABLISSEMENT.map((t) => t.valeur))

/**
 * Les huit couleurs proposées, telles quelles (`F` du chunk). L'écran y ajoute
 * un sélecteur libre : la liste est un raccourci, pas une limite.
 */
export const COULEURS = Object.freeze([
  '#1a1a1a',
  '#f94c3a',
  '#1e3a5f',
  '#7c3aed',
  '#be123c',
  '#065f46',
  '#92400e',
  '#831843',
])

/** Défaut de colonne **et** de repli du chunk quand `primary_color` est nul. */
export const COULEUR_DEFAUT = '#1a1a1a'

/** Défaut du chunk (`r.commerce_type ?? "restaurant"`) et de la colonne `0015`. */
export const TYPE_DEFAUT = 'restaurant'

/*
 * Le nom : `z.string().min(2)` côté cible (schéma `D` du chunk) et
 * `varchar(120)` côté colonne (`0003`). Deux bornes, deux refus distincts —
 * « trop court » et « trop long » ne se corrigent pas au même endroit.
 */
export const NOM_MIN = 2
export const NOM_MAX = 120

/** Longueur maximale d'une adresse d'image (borne de `logo_url` en `0015`). */
export const URL_MAX = 500

/**
 * Le format de couleur accepté : `#` puis six chiffres hexadécimaux, exactement
 * le motif de la cible. Trois formes sont refusées à dessein — `#fff` (l'écran
 * mesure huit valeurs pleines), les noms CSS (`red`), et le `rgb()`.
 */
const COULEUR = /^#[0-9a-f]{6}$/i

/**
 * Les deux formes d'adresse d'image admises, celles de la contrainte `0015` :
 * `https://…` pour une image hébergée, `/…` pour une image du site. Un chemin
 * relatif nu (`logo.png`) est refusé : il se résoudrait contre l'URL de la page
 * courante, donc vers une image qui n'existe pas.
 */
const ADRESSE_IMAGE = /^(https:\/\/|\/)[^\s]+$/i

/** Code client de l'aperçu — la valeur mesurée sur la carte de la cible. */
export const CODE_EXEMPLE = 'C-4F2A91'

/** Points de l'aperçu — la valeur mesurée (`POINTS / 120`). */
export const POINTS_EXEMPLE = 120

/** L'emoji d'un type, ou celui du type par défaut si la valeur est inconnue. */
export function emojiDeType(valeur) {
  const type = TYPES_ETABLISSEMENT.find((t) => t.valeur === valeur)
  return (type ?? TYPES_ETABLISSEMENT[0]).emoji
}

/** Vrai si la valeur est l'une des dix valeurs mesurées. */
export function typeValide(valeur) {
  return VALEURS_TYPE.includes(valeur)
}

/**
 * Vrai si la couleur est au format `#rrggbb`.
 *
 * La casse n'est **pas** un motif de refus : `#F94C3A` est la même couleur que
 * `#f94c3a`. En revanche la comparaison avec les huit pastilles se fait sur la
 * forme normalisée, sinon deux écritures d'une même valeur donneraient deux
 * pastilles actives.
 */
export function couleurValide(valeur) {
  return typeof valeur === 'string' && COULEUR.test(valeur.trim())
}

/** La couleur ramenée à sa forme canonique (`#rrggbb` minuscule). */
export function normaliserCouleur(valeur) {
  return typeof valeur === 'string' ? valeur.trim().toLowerCase() : ''
}

/** Vrai si le nom, une fois détouré, tient dans les deux bornes du nom. */
export function nomValide(valeur) {
  if (typeof valeur !== 'string') return false
  const nom = valeur.trim()
  return nom.length >= NOM_MIN && nom.length <= NOM_MAX
}

/**
 * Vrai si l'adresse d'image est exploitable — ou absente.
 *
 * Une chaîne vide **n'est pas** invalide : elle dit « pas d'image », et la
 * fonction d'écriture la traduit en `NULL`. Ce qui est refusé, c'est une adresse
 * qui finirait dans un `src` sans mener à une image : `javascript:`, `data:`,
 * ou un chemin nu.
 */
export function urlImageValide(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return true
  if (typeof valeur !== 'string') return false
  const adresse = valeur.trim()
  return adresse.length <= URL_MAX && ADRESSE_IMAGE.test(adresse)
}

/**
 * Lit le formulaire de `/branding` et rend l'apparence typée.
 *
 * Trois normalisations, aucune invention : tout est détouré, la couleur passe
 * en minuscules, et une adresse vide reste `''` (c'est la fonction d'écriture
 * qui l'efface). Un type inconnu **n'est pas corrigé en silence** : il est
 * conservé tel quel pour que `refusApparence` le refuse, sinon le commerçant
 * verrait « restaurant » coché à la place de son choix.
 *
 * @param {{get: (nom: string) => unknown}} donnees `FormData` (ou un double)
 */
export function apparenceDepuisFormulaire(donnees) {
  const texte = (nom) => String(donnees?.get?.(nom) ?? '').trim()

  return {
    nom: texte('name'),
    couleur: normaliserCouleur(texte('primary_color')),
    type: texte('commerce_type'),
    logo: texte('logo_url'),
    image: texte('wallet_bg_url'),
  }
}

/**
 * Les refus, dans l'ordre des champs du formulaire.
 *
 * L'ordre n'est pas cosmétique : l'action rend **un** message, et un ordre
 * instable ferait clignoter l'erreur d'un champ à l'autre entre deux essais
 * identiques (même règle que `refusMessage`).
 *
 * @param {{nom: string, couleur: string, type: string, logo: string, image: string}} apparence
 * @returns {string[]} codes : `nom`, `nomLong`, `couleur`, `type`, `logo`, `image`
 */
export function refusApparence(apparence) {
  const a = apparence && typeof apparence === 'object' ? apparence : {}
  const refus = []

  const nom = typeof a.nom === 'string' ? a.nom : ''
  if (!nomValide(nom)) refus.push(nom.trim().length > NOM_MAX ? 'nomLong' : 'nom')

  if (!couleurValide(a.couleur)) refus.push('couleur')
  if (!typeValide(a.type)) refus.push('type')
  if (!urlImageValide(a.logo)) refus.push('logo')
  if (!urlImageValide(a.image)) refus.push('image')

  return refus
}

/**
 * L'apparence d'une réponse RPC, typée : un `null` de texte devient `''`, une
 * couleur ou un type inconnus retombent sur le défaut de la colonne.
 *
 * Un type inconnu **ici** est corrigé (contrairement au formulaire) : c'est une
 * lecture, et l'écran doit pouvoir afficher quelque chose même si la base
 * contient une valeur qu'une version future a ajoutée.
 *
 * @param {unknown} donnees JSON de `apparence_du_commerce()`
 */
export function lireApparence(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {}
  const texte = (valeur) => (typeof valeur === 'string' ? valeur : '')
  const couleur = normaliserCouleur(d.primary_color)

  return {
    nom: texte(d.name),
    couleur: couleurValide(couleur) ? couleur : COULEUR_DEFAUT,
    type: typeValide(d.commerce_type) ? d.commerce_type : TYPE_DEFAUT,
    logo: texte(d.logo_url),
    image: texte(d.wallet_bg_url),
  }
}

/**
 * Le titre de la première récompense du menu, ou `null`.
 *
 * La carte de la cible affiche « PROCHAINE RÉCOMPENSE / MENU au choix » : c'est
 * le premier palier actif du programme. Les paliers arrivent de
 * `programme_du_commerce()` (`rang`, `libelle`, `cout`) ; on ne trie pas ici,
 * la fonction le fait déjà.
 *
 * @param {Array<{libelle?: string}>|null|undefined} paliers
 */
export function recompenseDuMenu(paliers) {
  if (!Array.isArray(paliers)) return null
  const premier = paliers.find(
    (p) => p && typeof p.libelle === 'string' && p.libelle.trim() !== ''
  )
  return premier ? premier.libelle.trim() : null
}

/**
 * « novembre 2026 » — le mois et l'année, en français.
 *
 * L'aperçu porte une ligne « DEPUIS » (« octobre 2026 » sur la capture). Elle
 * est calculée **côté serveur** et passée en propriété : la calculer dans le
 * composant client ferait diverger le rendu serveur et l'hydratation au passage
 * d'un mois à l'autre.
 *
 * @param {Date} [date]
 */
export function moisAnnee(date = new Date()) {
  const forme = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
  return forme.format(date)
}
