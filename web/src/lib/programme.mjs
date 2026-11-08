/* ============================================================================
   Programme de fidélité — règles **pures**, sans Next ni base.

   Ce que la cible a montré (page publique `/recompenses/<slug>`) :

       « 45 points = Boisson offerte »      <- le 1er palier sert d'accroche
       1  Boisson offerte   Soda, jus ou café au choix   45
       2  Dessert offert    Tiramisu, panna cotta…       75

   Un palier, c'est donc : un rang, un intitulé, une description, un coût. Rien
   de plus. Ce module ne décide pas des valeurs — il vérifie qu'elles tiennent
   debout et calcule ce que l'écran doit dire (« encore 33 points »).
   ========================================================================== */

/* L'unité du programme — **points, et rien d'autre**.
 *
 * La cible sait aussi compter des tampons (`programType === "stamps"`,
 * `stamps_delta`, grille `stampsTotal` sur l'écran caisse). Ici la caisse
 * crédite des points par `award_loyalty_points`, qui n'a pas de paramètre de
 * tampon : offrir le choix produirait un réglage que rien ne lit. Décision
 * produit du 2026-11-02 — le mode « tampons » est refusé, pas reporté (`P0-6b`).
 */
export const TYPE_PROGRAMME = 'points'

/** Un slug public : minuscules, chiffres et tirets. 3 à 64 caractères. */
export function slugValide(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)
}

/** Normalise un slug saisi (la casse et les espaces sont des fautes d'usage). */
export function normaliserSlug(slug) {
  return String(slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

/**
 * Valide un palier isolé.
 * @returns {string|null} un motif de refus, ou `null` si le palier est bon
 */
export function refusPalier(palier) {
  if (!palier || typeof palier !== 'object') return 'palier absent'
  if (typeof palier.libelle !== 'string' || palier.libelle.trim() === '') {
    return 'intitulé vide'
  }
  if (!Number.isInteger(palier.cout) || palier.cout <= 0) {
    return 'coût non entier ou nul'
  }
  return null
}

/**
 * Valide une liste de paliers : non vide, coûts strictement croissants.
 *
 * La croissance stricte n'est pas un détail : deux paliers à 45 points rendent
 * le second inatteignable (le premier échange les consomme), et l'écran
 * afficherait une récompense qui n'existe pas en pratique.
 *
 * @returns {string[]} les motifs de refus, vide si tout va bien
 */
export function refusPaliers(paliers) {
  if (!Array.isArray(paliers) || paliers.length === 0) return ['aucun palier']
  const refus = []
  let precedent = 0
  paliers.forEach((palier, index) => {
    const motif = refusPalier(palier)
    if (motif) refus.push(`palier ${index + 1} : ${motif}`)
    if (Number.isInteger(palier?.cout)) {
      if (palier.cout <= precedent) {
        refus.push(`palier ${index + 1} : le coût doit dépasser ${precedent}`)
      }
      precedent = palier.cout
    }
  })
  return refus
}

/**
 * Prochain palier atteignable pour un solde donné.
 *
 * @param {number} points
 * @param {{rang: number, libelle: string, cout: number}[]} paliers
 * @returns {{rang: number, libelle: string, cout: number, reste: number}|null}
 *   `null` quand tous les paliers sont atteints.
 */
export function prochainPalier(points, paliers) {
  const solde = Number.isFinite(points) ? points : 0
  const tries = (Array.isArray(paliers) ? paliers : [])
    .filter((p) => Number.isInteger(p?.cout) && p.cout > 0)
    .slice()
    .sort((a, b) => a.cout - b.cout)

  const suivant = tries.find((p) => p.cout > solde)
  if (!suivant) return null
  return { ...suivant, reste: suivant.cout - solde }
}

/**
 * Part du chemin parcourue vers un palier, entre 0 et 1.
 * Sert à une barre de progression ; ne rend jamais `NaN` ni une valeur hors
 * bornes, même avec un coût nul ou un solde supérieur au palier.
 */
export function progression(points, cout) {
  const solde = Number.isFinite(points) && points > 0 ? points : 0
  const cible = Number.isFinite(cout) && cout > 0 ? cout : 0
  if (cible === 0) return 0
  return Math.min(1, solde / cible)
}

/**
 * Paliers **atteignables** avec un solde donné — ce que la caisse peut proposer.
 */
export function paliersAtteignables(points, paliers) {
  const solde = Number.isFinite(points) ? points : 0
  return (Array.isArray(paliers) ? paliers : []).filter(
    (p) => Number.isInteger(p?.cout) && p.cout > 0 && p.cout <= solde
  )
}

/* ---------------------------------------------------------------------------
   Taux de conversion — « crédits par euro »
   ---------------------------------------------------------------------------
   Le taux vit en base (`loyalty_programs.credits_par_euro`) : c'est une règle
   commerciale, elle se règle dans l'écran Programme et ne se redéfinit pas dans
   un composant. Ce module ne fait que **vérifier** et **appliquer**.

   Les bornes sont celles de la migration `0008` : `> 0` et `<= 1000`. Les
   répéter ici n'est pas une duplication gratuite — c'est ce qui permet de
   refuser une saisie avec un message précis **avant** l'aller-retour, et de
   faire échouer un test si les deux divergent.
*/

/** Taux le plus petit accepté : un centième de point par euro. */
export const TAUX_MIN = 0.01

/** Taux le plus grand accepté : au-delà, une vente de 3 € créditerait 3000 points. */
export const TAUX_MAX = 1000

/**
 * Un taux est-il exploitable ?
 *
 * `Number.isFinite` refuse `NaN`, `Infinity` et les chaînes : `Number('2,5')`
 * vaut `NaN`, et un taux `NaN` produirait des points `NaN` — que la RPC
 * refuserait, mais après avoir affiché un formulaire qui semblait valide.
 *
 * @param {unknown} valeur
 */
export function creditsParEuroValide(valeur) {
  return (
    typeof valeur === 'number' &&
    Number.isFinite(valeur) &&
    valeur >= TAUX_MIN &&
    valeur <= TAUX_MAX
  )
}

/**
 * Points gagnés pour un montant dépensé.
 *
 * **Arrondi au plus proche**, jamais tronqué : 12,50 € à 1,5 point/euro valent
 * 18,75 points, donc 19 — tronquer ferait perdre un point à chaque achat et le
 * client le verrait à la longue. Un taux ou un montant inexploitable rend `0`,
 * pas `NaN` : l'écran affiche « 0 point » et la RPC décide, plutôt qu'un
 * « NaN pts » qui n'a aucun sens en caisse.
 *
 * @param {number} montant montant dépensé, dans la devise du programme
 * @param {number} creditsParEuro taux du programme
 * @returns {number} entier >= 0
 */
export function pointsDepuisMontant(montant, creditsParEuro) {
  if (!Number.isFinite(montant) || montant <= 0) return 0
  if (!creditsParEuroValide(creditsParEuro)) return 0
  return Math.max(0, Math.round(montant * creditsParEuro))
}

/**
 * Taux rendu affichable : `1`, `1.5`, `2.25` — sans zéro inutile.
 *
 * Deux décimales au maximum, comme la colonne (`numeric(10,2)`). On ne passe
 * pas par `Intl` ici : la valeur est un **taux**, pas un montant, et un
 * séparateur de milliers la rendrait illisible (« 1 000 »).
 *
 * @param {unknown} valeur
 * @returns {string} `''` si la valeur n'est pas un taux
 */
export function formaterTaux(valeur) {
  const taux = typeof valeur === 'string' ? Number(valeur) : valeur
  if (!creditsParEuroValide(taux)) return ''
  return String(Math.round(taux * 100) / 100)
}

/* ---------------------------------------------------------------------------
   LES SEPT RÉGLAGES — page `/program` (P0-1)
   ---------------------------------------------------------------------------
   Mesure : `_captures/2026-11-02-a6/rendu/a02-program.html`. La cible y tient
   sept réglages, chacun avec son contrôle. Les `name` des champs sont repris
   **tels quels** : un formulaire qui renommerait les siens divergerait de la
   cible sans qu'on sache plus tard lequel des deux a bougé.

       devise                 Dirham (MAD) / Euro          deux boutons
       points_per_purchase    « Points par 10 <devise> »    step 0.01, min 0
       min_purchase_mad       « Achat minimum »             step 0.01, min 0
       deduction_libre        « Mode cashback »             case à cocher
       points_expiry_days     « Expiration des points »     entier, 0 = jamais
       referral_reward        « Bonus de parrainage »       entier, 0 = désactivé
       review_reward_enabled / review_reward / google_review_url
                              « Bonus avis Google »         case + entier + lien

   CE MODULE NE DÉCIDE D'AUCUNE VALEUR. Il vérifie, il convertit, il refuse —
   avec des **codes** (`'points'`, `'avisLien'`…), jamais des phrases : le texte
   affiché appartient au dictionnaire, et un module qui porterait du français
   casserait à la première traduction.

   LA CONVERSION, ET POURQUOI ELLE EXISTE
   --------------------------------------
   La cible demande « points par 10 » ; la base (`0008`) stocke « crédits par
   euro » — `loyalty_programs.credits_par_euro`, la **seule** source du barème
   que lit la caisse. Deux colonnes pour un même barème divergeraient au premier
   enregistrement : la caisse créditerait alors un nombre de points que l'écran
   n'a jamais montré. On convertit donc, et dans un seul sens :
   `pointsParTranche / 10 = creditsParEuro`.

   Conséquence assumée : les valeurs acceptées vont par pas de **0,1** point par
   tranche. Un « 2,25 par 10 » donnerait 0,225 par euro, que `numeric(10,2)`
   arrondirait à 0,22 **en silence** — exactement l'écart que la `0008` a fermé.
   On refuse, avec un message qui dit le pas.
*/

/** Les deux devises que la cible propose, mesurées (aucune troisième). */
export const DEVISES = Object.freeze(['MAD', 'EUR'])

/** La tranche du barème affiché : la cible compte « par 10 ». */
export const TRANCHE = 10

/** Plus petit barème affichable : 0,1 point par tranche, soit le `TAUX_MIN`. */
export const POINTS_PAR_TRANCHE_MIN = TAUX_MIN * TRANCHE

/** Plus grand barème affichable : 10 000 points par tranche, soit le `TAUX_MAX`. */
export const POINTS_PAR_TRANCHE_MAX = TAUX_MAX * TRANCHE

/** Borne haute d'un montant : celle de la colonne (`numeric(10,2)`). */
export const MONTANT_MAX = 99_999_999.99

/** Vrai si la devise est l'une des deux que l'écran sait afficher. */
export function deviseValide(devise) {
  return typeof devise === 'string' && DEVISES.includes(devise.trim().toUpperCase())
}

/**
 * Un barème « points par tranche » est-il représentable en base ?
 *
 * Trois conditions, et la troisième est celle qu'on oublie : la valeur doit être
 * un multiple de 0,1, sinon le taux par euro qu'elle produit dépasse les deux
 * décimales de `credits_par_euro` et se ferait arrondir sans le dire.
 *
 * @param {unknown} valeur
 */
export function pointsParTrancheValide(valeur) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return false
  if (valeur < POINTS_PAR_TRANCHE_MIN || valeur > POINTS_PAR_TRANCHE_MAX) return false
  const dixiemes = valeur * 10
  // Tolérance sur les flottants : `2.2 * 10` vaut 22.000000000000004.
  return Math.abs(dixiemes - Math.round(dixiemes)) < 1e-9
}

/**
 * Barème affiché → taux stocké. `2.2` points par 10 € donnent `0.22` par euro.
 *
 * @param {unknown} points
 * @returns {number|null} `null` si le barème n'est pas représentable
 */
export function creditsDepuisPointsParTranche(points) {
  if (!pointsParTrancheValide(points)) return null
  // `toFixed` et non une division nue : `2.2 / 10` vaut 0.22000000000000003, et
  // cette valeur-là n'est pas celle que la colonne enregistre.
  return Number((points / TRANCHE).toFixed(2))
}

/**
 * Taux stocké → barème affiché. `0.22` par euro donnent `2.2` points par 10.
 *
 * @param {unknown} credits
 * @returns {number|null} `null` si le taux n'est pas exploitable
 */
export function pointsParTrancheDepuisCredits(credits) {
  const taux = typeof credits === 'string' ? Number(credits) : credits
  if (!creditsParEuroValide(taux)) return null
  return Number((taux * TRANCHE).toFixed(2))
}

/**
 * Valeur d'un `<input type="number">` pour le barème : `2.2`, `1`, `0.1`.
 * @param {unknown} credits
 * @returns {string} `''` quand le taux n'est pas lisible
 */
export function formaterPointsParTranche(credits) {
  const points = pointsParTrancheDepuisCredits(credits)
  return points === null ? '' : String(points)
}



/** Un entier positif ou nul (`0` a un sens mesuré : « jamais », « désactivé »). */
export function entierPositif(valeur) {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0
}

/** Un montant : fini, positif ou nul, dans les bornes de la colonne. */
export function montantValide(valeur) {
  return (
    typeof valeur === 'number' &&
    Number.isFinite(valeur) &&
    valeur >= 0 &&
    valeur <= MONTANT_MAX
  )
}

/**
 * Le lien d'avis est **facultatif** ; s'il est renseigné, il doit être une
 * adresse `https://` complète.
 *
 * Mesuré : le champ porte `type="url"`, `dir="ltr"` et le gabarit
 * `https://search.google.com/local/writereview?placeid=…`. Un lien relatif, un
 * `http://` ou une chaîne quelconque enverrait le client vers une page qui
 * n'existe pas — et le bonus ne serait jamais réclamable.
 *
 * @param {unknown} url
 */
export function lienAvisValide(url) {
  const valeur = String(url ?? '').trim()
  if (valeur === '') return true
  if (!/^https:\/\/\S+$/i.test(valeur)) return false
  try {
    // `new URL` attrape ce que l'expression régulière laisse passer
    // (`https://` seul, hôte vide, espace encodé…).
    new URL(valeur)
    return true
  } catch {
    return false
  }
}

/**
 * Lit le formulaire de `/program` et rend les sept réglages typés.
 *
 * Les `name` sont ceux de la cible (mesurés). Trois normalisations, toutes
 * déclarées :
 *
 *   - **un champ numérique vide vaut `0`** pour le minimum, l'expiration, le
 *     parrainage et le bonus d'avis *désactivé* : `0` y a un sens mesuré
 *     (« 0 = jamais », « 0 = désactivé »). Le barème, lui, n'a pas de vide
 *     possible — `Number('')` vaut `0`, et un barème à zéro point n'existe pas ;
 *     il rend donc `NaN`, que `refusReglages` refuse ;
 *   - **une case décochée est absente** de `FormData` : `null` devient `false` ;
 *   - **le bonus d'avis activé sans points saisi** rend `NaN` : activer un bonus
 *     qui n'accorde rien est un refus, pas un zéro silencieux.
 *
 * @param {{get: (nom: string) => unknown}} donnees `FormData` (ou un double)
 */
export function reglagesDepuisFormulaire(donnees) {
  const texte = (nom) => String(donnees.get(nom) ?? '').trim()
  const nombre = (nom, defaut) => {
    const saisi = texte(nom)
    return saisi === '' ? defaut : Number(saisi)
  }

  const avisActif = texte('review_reward_enabled') !== ''

  return {
    devise: texte('devise').toUpperCase(),
    pointsParTranche: nombre('points_per_purchase', Number.NaN),
    minimum: nombre('min_purchase_mad', 0),
    cashback: texte('deduction_libre') !== '',
    expiration: nombre('points_expiry_days', 0),
    parrainage: nombre('referral_reward', 0),
    avisActif,
    avisPoints: nombre('review_reward', avisActif ? Number.NaN : 0),
    avisLien: texte('google_review_url'),
  }
}

/**
 * Les motifs de refus, **dans un ordre fixe** — le premier devient le message
 * affiché, et deux enregistrements successifs doivent dire la même chose.
 *
 * Deux règles de **cohérence** s'ajoutent aux contrôles de forme. Ce n'est pas
 * du zèle : activer un bonus de 0 point, ou un bonus que le client ne peut pas
 * réclamer faute de lien, promet une récompense qui n'arrivera jamais. Mieux
 * vaut refuser que laisser le commerçant croire qu'il a réglé quelque chose.
 *
 * @param {Record<string, unknown>} reglages
 * @returns {string[]} codes de refus (`[]` si tout tient debout)
 */
export function refusReglages(reglages) {
  const r = reglages && typeof reglages === 'object' ? reglages : {}
  const refus = []

  if (!deviseValide(r.devise)) refus.push('devise')
  if (!pointsParTrancheValide(r.pointsParTranche)) refus.push('points')
  if (!montantValide(r.minimum)) refus.push('minimum')
  if (!entierPositif(r.expiration)) refus.push('expiration')
  if (!entierPositif(r.parrainage)) refus.push('parrainage')

  const actif = r.avisActif === true
  if (!entierPositif(r.avisPoints)) refus.push('avisPoints')
  else if (actif && r.avisPoints === 0) refus.push('avisActif')

  if (!lienAvisValide(r.avisLien)) refus.push('avisLien')
  else if (actif && String(r.avisLien ?? '').trim() === '') refus.push('avisSansLien')

  return refus
}

/**
 * Les sept réglages d'une réponse RPC, typés pour l'écran.
 *
 * PostgREST peut rendre un `numeric` en **chaîne** (`"0.22"`), un `integer` en
 * nombre, et `null` pour un lien effacé. La page ne doit pas connaître ces trois
 * formes : elle reçoit des nombres, ou les valeurs de repli documentées.
 *
 * @param {unknown} donnees JSON de `reglages_du_programme()`
 */
export function lireReglages(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {}
  const nombre = (valeur, defaut) => {
    const n = typeof valeur === 'string' ? Number(valeur) : valeur
    return Number.isFinite(n) ? n : defaut
  }
  const entier = (valeur) => {
    const n = nombre(valeur, 0)
    return Number.isInteger(n) && n >= 0 ? n : 0
  }

  return {
    devise: deviseValide(d.devise) ? String(d.devise).trim().toUpperCase() : 'EUR',
    creditsParEuro: nombre(d.credits_par_euro, 1),
    minimum: nombre(d.min_purchase, 0),
    cashback: d.deduction_libre === true,
    expiration: entier(d.points_expiry_days),
    parrainage: entier(d.referral_reward),
    avisActif: d.review_reward_enabled === true,
    avisPoints: entier(d.review_reward),
    avisLien: typeof d.google_review_url === 'string' ? d.google_review_url : '',
  }
}

