/* ============================================================================
   Tableau de bord — ce que rend `tableau_du_commerce()` (migration 0005)

   Mesuré sur la capture authentifiée de `/dashboard`
   (`_captures/2026-10-27-auth-s3/raw/pages/a01-dashboard.html`). Trois formes y
   sont relevées et reprises **telles quelles** :

     « +1 ce mois »      -> la valeur est signée, positive comprise
     « 0 % »             -> un espace avant le symbole
     « 26 oct. 15:31 »   -> jour, mois court, heure — sans année

   Ce module ne décide d'aucune valeur : il met en forme ce que la fonction
   promet, et **refuse** une forme inattendue au lieu de deviner. Une carte dont
   le montant serait illisible afficherait « 0 » — c'est-à-dire un fait faux,
   exactement ce que `EtatBloque` existe pour éviter.
   ========================================================================== */

/** Nombre de lignes rendues par la fonction (`limit 10`). */
export const LIMITE_RECENTES = 10

/** Date + heure mesurées sur la cible : `26 oct. 15:31`. */
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Le tiret de l'écran : « je n'ai pas la valeur », pas « zéro ». */
export const VIDE = '—'

/**
 * Formate l'horodatage d'une opération (`26 oct. 15:31`).
 * @param {string} iso
 * @returns {string} `''` si la valeur n'est pas une date.
 */
export function dateHeureCourte(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // `Intl` rend « 26 oct., 15:31 » ; la cible écrit « 26 oct. 15:31 » — la
  // virgule est un séparateur de gabarit, pas la copie.
  return FORMAT_HEURE.format(date).replace(/,\s*/, ' ')
}


/**
 * Part des cartes revenues **au moins deux fois**.
 *
 * Rend `null` — et non `0` — quand il n'y a aucune carte : « 0 % » se lirait
 * comme « personne ne revient » alors que la vérité est « personne n'est encore
 * venu ». C'est la même distinction que `lireListeCartes` fait entre une liste
 * vide et une réponse illisible.
 *
 * @param {number} fideles cartes à au moins deux visites
 * @param {number} cartes  cartes au total
 * @returns {number|null} pourcentage entier, 0..100
 */
export function pourcentageRevient(fideles, cartes) {
  if (!Number.isFinite(fideles) || !Number.isFinite(cartes) || cartes <= 0) return null
  const part = Math.round((fideles * 100) / cartes)
  return Math.min(100, Math.max(0, part))
}

/**
 * Nombre rendu affichable, sans unité : `40`, `1 250`.
 *
 * L'unité du chiffre d'affaires appartient au **libellé** sur la cible
 * (« CA (€) » avec la valeur « 0 »), pas à la valeur. La coller ici
 * afficherait « CA (MAD) · 0 MAD ».
 *
 * @param {number} valeur
 */
export function formaterNombre(valeur) {
  if (!Number.isFinite(valeur)) return VIDE
  return NOMBRE.format(valeur)
}

/**
 * Le symbole d'une devise, ou son code s'il n'y en a pas.
 *
 * Une **table fermée**, pas une invention : `EUR → €` est une convention, et
 * `MAD` n'a pas de symbole d'une lettre qui s'écrive sans ambiguïté — il reste
 * donc `MAD`. Un code inconnu est rendu tel quel plutôt que masqué : mieux vaut
 * lire « 40 PLN » que « 40 » sans unité.
 *
 * La table vit **ici** et pas dans le dictionnaire : `tableau-lecture.test.mjs`
 * interdit le symbole `€` dans les chaînes traduites, pour empêcher qu'on
 * recopie un jour la cible euro sur un programme en dirhams. Le symbole est une
 * donnée de formatage, pas une traduction.
 *
 * @param {unknown} devise code ISO (`EUR`, `MAD`, `USD`)
 * @returns {string}
 */
export function symboleDevise(devise) {
  if (typeof devise !== 'string') return ''
  const code = devise.trim().toUpperCase()
  if (code === '') return ''
  const SYMBOLES = { EUR: '€', USD: '$', GBP: '£' }
  return SYMBOLES[code] ?? code
}

/**
 * Montant rendu affichable avec son unité : `40 €`, `40 MAD` — la forme de la
 * colonne « Montant » de la capture (« 40 € »), où l'unité est bien sur la
 * valeur.
 *
 * La cible écrit « € » parce que **son** programme est en euros. Ici la devise
 * est une donnée (`loyalty_programs.devise`, `EUR` par défaut depuis `0008`) :
 * la recopier afficherait une unité fausse.
 *
 * @param {number} montant
 * @param {string|null} devise
 */
export function formaterMontant(montant, devise) {
  if (!Number.isFinite(montant)) return VIDE
  const nombre = NOMBRE.format(montant)
  const unite = symboleDevise(devise)
  return unite ? `${nombre} ${unite}` : nombre
}


/**
 * Points signés : `+8 pts`, `-45 pts` (mesuré : « +8 pts »).
 * @param {number} points
 */
export function formaterPoints(points) {
  if (!Number.isFinite(points)) return VIDE
  const signe = points > 0 ? '+' : ''
  return `${signe}${NOMBRE.format(points)} pts`
}

/**
 * Pourcentage affichable : `0 %` (mesuré), ou le tiret si la part n'existe pas.
 * @param {number|null} pourcentage
 */
export function formaterPourcentage(pourcentage) {
  if (!Number.isFinite(pourcentage)) return VIDE
  return `${NOMBRE.format(pourcentage)} %`
}

/** Entier positif attendu, ou `null`. */
function entier(valeur) {
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : null
}

/** Nombre (entier ou décimal) attendu, ou `null`. */
function nombre(valeur) {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Lit un objet de compteurs, et rend `null` dès qu'une clé manque. */
function compteurs(source, cles) {
  if (!source || typeof source !== 'object') return null
  const sortie = {}
  for (const cle of cles) {
    const valeur = nombre(source[cle])
    if (valeur === null) return null
    sortie[cle] = valeur
  }
  return sortie
}

/**
 * Lit la réponse de `tableau_du_commerce()` et la met en forme pour l'écran.
 *
 * Rend `null` — et non un tableau à zéros — dès qu'une valeur n'a pas la forme
 * promise : « aucun mouvement » et « je n'ai pas compris la réponse » sont deux
 * états différents, et les confondre ferait chercher le problème du mauvais
 * côté.
 *
 * @param {unknown} donnees
 * @returns {{devise: string|null, clients: object, visites: object,
 *   reviennent: object, ca: object, transactions: object, recentes: object[]}|null}
 */
export function lireTableau(donnees) {
  if (!donnees || typeof donnees !== 'object') return null

  const clients = compteurs(donnees.clients, ['total', 'ce_mois'])
  const visites = compteurs(donnees.visites, ['trente_jours'])
  const reviennent = compteurs(donnees.reviennent, ['cartes', 'fideles'])
  const ca = compteurs(donnees.ca, ['trente_jours', 'total'])
  const transactions = compteurs(donnees.transactions, ['total', 'recompenses'])
  if (!clients || !visites || !reviennent || !ca || !transactions) return null

  // Les compteurs sont des entiers : une carte à « 1.5 client » est une réponse
  // illisible, pas un arrondi.
  for (const bloc of [clients, visites, reviennent, transactions]) {
    for (const valeur of Object.values(bloc)) {
      if (entier(valeur) === null) return null
    }
  }
  if (!Array.isArray(donnees.recentes)) return null

  const recentes = []
  for (const ligne of donnees.recentes) {
    if (!ligne || typeof ligne !== 'object') return null
    if (typeof ligne.card_token !== 'string' || ligne.card_token === '') return null

    const points = nombre(ligne.points)
    const montant = nombre(ligne.montant)
    if (points === null || montant === null) return null

    recentes.push({
      code: ligne.card_token,
      prenom: typeof ligne.prenom === 'string' ? ligne.prenom : '',
      nom: typeof ligne.nom === 'string' ? ligne.nom : '',
      points,
      montant,
      // `null` = opération de points ; une chaîne = récompense remise, et c'est
      // son libellé qui s'affiche (mesuré, pas traduit).
      recompense:
        typeof ligne.recompense === 'string' && ligne.recompense !== ''
          ? ligne.recompense
          : null,
      date: dateHeureCourte(ligne.date),
    })
  }

  return {
    devise: typeof donnees.devise === 'string' && donnees.devise !== '' ? donnees.devise : null,
    clients,
    visites,
    reviennent: {
      ...reviennent,
      pourcentage: pourcentageRevient(reviennent.fideles, reviennent.cartes),
    },
    ca,
    transactions,
    recentes,
  }
}

/**
 * Les quatre indicateurs de la cible, prêts à rendre.
 *
 * `cle` désigne la copie dans le dictionnaire (`tableau.indicateur.<cle>` et
 * `tableau.sous.<sous>`) : aucune chaîne n'est écrite ici. `valeur` et
 * `sousParams` sont déjà mis en forme, pour que l'écran ne formate rien.
 *
 * L'ordre est celui de la capture : Clients, Visites, Reviennent, CA.
 *
 * @param {ReturnType<typeof lireTableau>} tableau
 */
export function indicateurs(tableau) {
  return [
    {
      cle: 'clients',
      valeur: String(tableau.clients.total),
      sous: 'ceMois',
      sousParams: { n: tableau.clients.ce_mois },
    },
    {
      cle: 'visites',
      valeur: String(tableau.visites.trente_jours),
      sous: 'trenteJours',
      sousParams: {},
    },
    {
      cle: 'reviennent',
      valeur: formaterPourcentage(tableau.reviennent.pourcentage),
      sous: 'deuxVisites',
      sousParams: {},
    },
    {
      cle: 'ca',
      valeur: formaterNombre(tableau.ca.trente_jours),
      sous: 'caTrenteJours',
      sousParams: { total: formaterNombre(tableau.ca.total) },
    },
  ]
}
