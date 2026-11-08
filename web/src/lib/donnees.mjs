/* ============================================================================
   Accès aux données — uniquement par RPC, jamais par les tables.

   Pourquoi : `clients`, `loyalty_cards` et `loyalty_transactions` sont sous RLS
   **sans aucune politique**. Mesuré le 2026-10-31 : un SELECT direct rend `[]`
   (donc « pas de client » — un mensonge), et un INSERT lève 42501. Lire une
   table serait donc une erreur silencieuse : l'écran afficherait « aucun
   client » alors que la lecture est simplement interdite.

   Toutes les fonctions ci-dessous rendent un **état** discriminé. Aucun écran
   n'a besoin de connaître les codes PostgREST, et aucun `throw` ne remonte :
   dans un Server Component, une exception devient une page d'erreur blanche.

   États possibles :
     ok             la donnée est là (`donnees`)
     absent         la fonction répond, mais l'objet n'existe pas (programme non créé)
     nonMigre       la fonction n'existe pas encore -> `migrations/0003` à passer
     introuvable    jeton de carte inconnu (`CARD_NOT_FOUND`, mesuré)
     refuse         la base a refusé avec un code connu (`INVALID_*`, `PROGRAM_NOT_FOUND`)
     configuration  Supabase n'est pas configuré sur ce serveur
     indisponible   panne réseau, ou réponse illisible
   ========================================================================== */

import { clientServeur } from './supabase/server.mjs'
import { cacheCourt } from './cache.mjs'

/** Code PostgREST « fonction absente du cache de schéma ». */
const FONCTION_ABSENTE = 'PGRST202'

/** Codes métier reconnus, tous mesurés ou produits par `0003`. */
const CODES_CONNUS = new Set([
  'CARD_NOT_FOUND',
  'PROGRAM_NOT_FOUND',
  'TOKEN_COLLISION',
  'INVALID_SLUG',
  'INVALID_NAME',
  'INVALID_THRESHOLD',
  'INVALID_KIND',
  'INVALID_TIERS',
  'INVALID_TIER_LABEL',
  'INVALID_TIER_COST',
  'INVALID_CREDITS',
  /* Les trois refus de `equipe_du_commerce()` (`0007`), provoqués et mesurés
     (`P0001`, lignes 15/24/19 de la fonction). Sans eux, une période inconnue
     tomberait dans `indisponible` : l'écran dirait « la base ne répond pas »
     alors qu'elle a répondu, et très clairement. Un refus n'est pas une panne. */
  'PERIODE_INCONNUE',
  'JOUR_MANQUANT',
  'FUSEAU_INCONNU',
  /* Le refus de `join_loyalty_program()` (`0007`, ligne 173) : une caisse
     inconnue est refusée **avant** l'écriture du client. Sans cette entrée, le
     refus devenait `indisponible` — « la base ne répond pas » pour une base qui
     venait de répondre, et le client lisait une panne là où son formulaire
     portait une caisse qui n'existe plus. */
  'STAFF_NOT_FOUND',
  /* Les huit refus de `enregistrer_reglages_programme()` (`0010`). La page
     `/program` valide avant d'appeler, donc ils ne devraient jamais sortir ;
     s'ils sortent, c'est que l'écran et la fonction ont divergé — et ce jour-là
     il faut le lire comme un refus, pas comme une panne réseau. `INVALID_CREDITS`
     est déjà listé plus haut, la `0010` le réutilise. */
  'INVALID_DEVISE',
  'INVALID_MIN_PURCHASE',
  'INVALID_EXPIRY',
  'INVALID_REFERRAL',
  'INVALID_REVIEW',
  'INVALID_REVIEW_URL',
  'REVIEW_WITHOUT_POINTS',
  'REVIEW_WITHOUT_URL',
  /* Les trois refus de `enregistrer_fiche_etablissement()` (`0011`).
     `INVALID_NAME` est déjà listé plus haut : la fiche le réutilise. */
  'INVALID_TYPE_ACTIVITE',
  'INVALID_RADIUS',
  'INVALID_GEOFENCE_TEXTE',
  /* Le refus de coordonnées (`0017`) : une latitude sans longitude, ou un
     point hors du globe. Le formulaire l'empêche, la fonction le redit — et
     sans cette entrée, un point hors bornes se lirait « la base ne répond pas ». */
  'INVALID_COORDONNEES',
  /* Les quatre refus de `enregistrer_apparence()` (`0015`). Le nom réutilise
     `INVALID_NAME` ; les trois autres disent **quel champ** a été refusé, parce
     que l'écran a deux adresses d'image distinctes et qu'un message unique
     laisserait chercher la faute au mauvais endroit. */
  'INVALID_COLOR',
  'INVALID_COMMERCE_TYPE',
  'INVALID_LOGO_URL',
  'INVALID_IMAGE_URL',
  /* Les deux refus de `lier_wallet()` (`0014`). Un identifiant d'objet Google
     mal formé s'écrirait sinon pour toujours dans `wallet_object_id`, et
     l'index unique empêcherait ensuite de le corriger. */
  'OBJECT_ID_INVALIDE',
  /* Les six refus de `enfiler_message()` (`0013`). Ils ne devraient jamais
     sortir : l'écran valide les mêmes bornes avant d'appeler. S'ils sortent,
     l'écran et la fonction ont divergé — et ce jour-là il faut le lire comme un
     refus de saisie, pas comme une panne réseau. */
  'TITRE_TROP_COURT',
  'TITRE_TROP_LONG',
  'MESSAGE_TROP_COURT',
  'MESSAGE_TROP_LONG',
  'LIEN_INVALIDE',
  'QUOTA_ATTEINT',
  /* Les deux refus de `enregistrer_abonnement_push()` (`0019`). Sans eux, une
     page carte publique qui envoie un corps mal formé lirait « la base ne
     répond pas » alors qu'elle vient de refuser, très clairement — et le client
     réessaierait indéfiniment quelque chose qui ne peut pas marcher. */
  'ABONNEMENT_INVALIDE',
  'TROP_D_ABONNEMENTS',
])


/**
 * Appelle une RPC et rend un état.
 * @param {string} nom
 * @param {Record<string, unknown>} args
 */
async function rpc(nom, args) {
  let client
  try {
    client = await clientServeur()
  } catch {
    return { etat: 'configuration', donnees: null, code: null }
  }

  try {
    const { data, error } = await client.rpc(nom, args)
    if (!error) return { etat: 'ok', donnees: data, code: null }

    const code = typeof error.code === 'string' ? error.code : null
    const message = typeof error.message === 'string' ? error.message : ''
    const cle = message.trim().split(/\s+/)[0]

    if (code === FONCTION_ABSENTE || /Could not find the function/i.test(message)) {
      return { etat: 'nonMigre', donnees: null, code }
    }
    if (cle === 'CARD_NOT_FOUND') return { etat: 'introuvable', donnees: null, code: cle }
    if (CODES_CONNUS.has(cle)) return { etat: 'refuse', donnees: null, code: cle }
    return { etat: 'indisponible', donnees: null, code }
  } catch {
    return { etat: 'indisponible', donnees: null, code: null }
  }
}

/* Le programme du commerce — mémorisé **dix secondes**, sur le seul chemin
   d'affichage.

   Mesure du 2026-11-01 : un aller-retour Supabase coûte 0,55 à 0,81 s ici, et
   quatre écrans relisent le même programme à chaque navigation alors qu'il ne
   change que lorsqu'on l'enregistre. Dix secondes couvrent largement le temps
   d'un aller-retour entre deux onglets sans jamais survivre à une modification
   volontaire — `enregistrerProgramme` vide explicitement l'entrée.

   Ce que le cache **n'accepte pas**, délibérément : `indisponible` et
   `configuration`. Une panne mémorisée dix secondes deviendrait un écran bloqué
   qui se croit à jour. Seuls les états **stables** (`ok`, `absent`, `nonMigre`)
   entrent, et un `nonMigre` ne coûte rien à relire une fois la migration passée.
*/
const cacheProgramme = cacheCourt({ ttlMs: 10_000 })

/** Vide la mémoire du programme (tests, outils, changement de configuration). */
export function oublierProgramme() {
  cacheProgramme.oublier()
}

/**
 * Programme du commerce (unique dans ce socle) — `null` s'il n'y en a aucun.
 *
 * @param {object} [options]
 * @param {boolean} [options.frais] ignore la mémoire et relit la base. **Obligatoire
 *   sur tout chemin qui écrit** (crédit de points) : un barème périmé de dix
 *   secondes y créditerait le mauvais nombre de points, et le commerçant ne
 *   pourrait pas le voir.
 */
export async function programmeDuCommerce({ frais = false } = {}) {
  if (!frais) {
    const memo = cacheProgramme.lire()
    if (memo !== undefined) return memo
  }

  const r = await rpc('programme_du_commerce', {})
  const resultat = r.etat === 'ok' && !r.donnees ? { etat: 'absent', donnees: null, code: null } : r

  if (resultat.etat === 'ok' || resultat.etat === 'absent' || resultat.etat === 'nonMigre') {
    cacheProgramme.ecrire(resultat)
  }
  return resultat
}

/** Programme public par slug — sert l'adhésion et la vitrine des paliers. */
export async function programmePublic(slug) {
  if (!slug) return { etat: 'refuse', donnees: null, code: 'INVALID_SLUG' }
  return rpc('programme_public', { p_slug: String(slug) })
}

/**
 * Les caisses **proposées au client** sur la page publique d'adhésion (`0009`).
 *
 * Elles ne sont pas le classement : la fonction ne rend qu'`id` et `prenom`, des
 * seules caisses **actives**. `equipe_du_commerce()` porte les chiffres et n'est
 * pas accordée à `anon` — c'est la ligne de partage, et elle est tenue là-bas
 * comme ici.
 *
 * Pas de mémoire courte ici, contrairement au programme : cette liste est lue
 * pour dessiner un formulaire, et une caisse partie depuis dix secondes ne doit
 * pas encore être proposée. Elle est relue au moment du geste, de toute façon.
 */
export async function caissesPubliques(slug) {
  if (!slug) return { etat: 'refuse', donnees: null, code: 'INVALID_SLUG' }
  return rpc('caisses_publiques', { p_slug: String(slug) })
}

/**
 * Crée une carte anonyme et rend son code.
 *
 * `caisse` n'est transmise **que si elle existe** : `p_staff_id` a
 * `default null` (`0007`), donc l'argument absent et l'argument `null` font la
 * même chose en base — mais un appel qui n'a rien à désigner ne transporte pas
 * un champ vide. Même règle que `p_jour` et `p_credits_par_euro` : le jour où le
 * défaut change, l'écart se voit au lieu de se deviner.
 *
 * @param {string} slug
 * @param {string | null} [caisse] identifiant d'une caisse **déjà validée**
 */
export async function rejoindre(slug, caisse = null) {
  const args = { p_slug: slug ? String(slug) : null }
  if (caisse) args.p_staff_id = caisse
  return rpc('join_loyalty_program', args)
}


/** Solde, identité (prénom / nom) et paliers d'une carte. */
export async function carteParToken(jeton) {
  if (!jeton) return { etat: 'refuse', donnees: null, code: 'CARD_NOT_FOUND' }
  return rpc('carte_par_token', { p_token: String(jeton) })
}

/**
 * Liste bornée des cartes du commerce — première RPC de **lecture** du socle
 * (`migrations/0004`). Elle n'ouvre aucune table : la fonction est
 * `SECURITY DEFINER`, et `authenticated` n'a toujours aucun `SELECT` sur
 * `clients` ni sur `loyalty_cards` (mesuré par `has_table_privilege`).
 *
 * La mise en forme est faite par `lireListeCartes` (`lib/carte.mjs`) : ce
 * module ne décide pas de ce qu'un écran doit comprendre.
 */
export async function cartesDuCommerce() {
  return rpc('cartes_du_commerce', {})
}

/**
 * Tableau de bord agrégé — deuxième RPC de **lecture** du socle
 * (`migrations/0005`). Elle n'ouvre aucune table : la fonction est
 * `SECURITY DEFINER` avec `search_path` figé, et `authenticated` n'a toujours
 * aucun `SELECT` sur `loyalty_transactions` (mesuré par `has_table_privilege`).
 *
 * Elle rend des **nombres**, jamais de copie : la mise en forme et le choix des
 * libellés appartiennent à `lireTableau` / `indicateurs` (`lib/tableau.mjs`) et
 * au dictionnaire.
 */
export async function tableauDuCommerce() {
  return rpc('tableau_du_commerce', {})
}

/* Le compteur de l'offre gratuite — mémorisé **dix secondes**, et sur deux
   états seulement.

   Le bandeau qui l'affiche est dans le layout, donc sur **chaque** écran : il
   paierait un aller-retour Supabase à chaque navigation (0,55 à 0,81 s mesuré
   le 2026-11-01) pour un chiffre qui ne bouge qu'à une inscription. Dix
   secondes, c'est la même fenêtre que `programmeDuCommerce()`, et pour la même
   raison.

   Ce que la mémoire **n'accepte pas** : `indisponible` et `configuration`. Un
   bandeau qui répéterait « compteur illisible » pendant dix secondes après le
   retour du réseau se croirait à jour. `nonMigre`, lui, est stable : la
   fonction n'existera pas davantage dans dix secondes, et le recalcul ne coûte
   rien une fois `0012` passée.
*/
const cachePlafond = cacheCourt({ ttlMs: 10_000 })

/**
 * Clients inscrits et limite de l'offre gratuite (`0012`).
 *
 * Rend des **faits** (`clients`, `limite`) : l'état et la jauge sont calculés
 * par `lirePlafond` (`lib/plafond.mjs`), pour que le seuil ne vive pas à deux
 * endroits.
 */
export async function plafondDuCommerce({ frais = false } = {}) {
  if (!frais) {
    const memo = cachePlafond.lire()
    if (memo !== undefined) return memo
  }

  const resultat = await rpc('plafond_clients', {})

  if (resultat.etat === 'ok' || resultat.etat === 'nonMigre') {
    cachePlafond.ecrire(resultat)
  }

  return resultat
}

/**
 * Classement de l'équipe — troisième RPC de **lecture** du socle (`0007`).
 *
 * Elle rend des **nombres** et un ordre **total** (documenté dans la migration),
 * jamais une copie : la mise en forme appartient à `lireEquipe` (`lib/equipe.mjs`)
 * et les libellés au dictionnaire.
 *
 * `p_jour` n'est envoyé **que** pour la période `jour` : la fonction a
 * `p_jour date default null`, et omettre l'argument laisse jouer ce défaut.
 * L'envoyer `null` marcherait aussi — mais un appel qui n'a pas besoin d'un
 * argument ne le transporte pas, et l'écart se voit tout de suite le jour où le
 * défaut change.
 *
 * @param {{periode?: string, jour?: string|null}} [choix]
 */
export async function equipeDuCommerce({ periode = 'depuis_le_debut', jour = null } = {}) {
  const args = { p_periode: periode }
  if (jour) args.p_jour = jour
  return rpc('equipe_du_commerce', args)
}

/**
 * Crée ou remplace le programme et ses paliers (atomique, cf. `0003`).
 *
 * `creditsParEuro` n'est envoyé **que s'il est fourni** : PostgREST distingue
 * l'argument absent (qui laisse jouer le `default 1` de la fonction) de
 * l'argument `null` (qui ferait lever `INVALID_CREDITS`). Passer `null` pour
 * dire « inchangé » produirait donc un refus incompréhensible côté écran.
 */
export async function enregistrerProgramme({ slug, nom, seuil, type, paliers, creditsParEuro }) {
  const args = {
    p_slug: slug,
    p_name: nom,
    p_threshold: seuil,
    p_kind: type,
    p_tiers: paliers,
  }
  if (typeof creditsParEuro === 'number' && Number.isFinite(creditsParEuro)) {
    args.p_credits_par_euro = creditsParEuro
  }
  const resultat = await rpc('enregistrer_programme', args)

  // Invalidation explicite : c'est le **seul** écrivain du programme dans ce
  // socle. Sans elle, l'écran qui vient d'enregistrer pourrait relire sa propre
  // valeur périmée pendant dix secondes — le pire moment pour mentir.
  if (resultat.etat === 'ok') cacheProgramme.oublier()

  return resultat
}


/**
 * Les sept réglages du programme (`0010`) — cashback, expiration, parrainage,
 * bonus d'avis.
 *
 * `PROGRAM_NOT_FOUND` est traduit en **`absent`**, comme dans
 * `programmeDuCommerce()`. Ce n'est pas une coquetterie : `refuse` dit « la base
 * a dit non », `absent` dit « il n'y a pas encore de programme ». L'écran ne
 * peut pas renvoyer le commerçant vers le même endroit dans les deux cas — l'un
 * se corrige en créant le programme, l'autre pas.
 *
 * Pas de mémoire courte ici, contrairement au programme lui-même : cet écran est
 * le seul à lire ces valeurs, et il est ouvert pour les modifier. Un réglage
 * périmé de dix secondes afficherait une valeur que le commerçant vient de
 * changer.
 */
export async function reglagesDuCommerce() {
  const resultat = await rpc('reglages_du_programme', {})
  if (resultat.etat === 'refuse' && resultat.code === 'PROGRAM_NOT_FOUND') {
    return { etat: 'absent', donnees: null, code: null }
  }
  return resultat
}

/**
 * Enregistre les sept réglages, atomiquement (`0010`).
 *
 * `p_google_review_url` n'est envoyé **que s'il y a un lien** : la fonction a
 * `default null` et `nullif(trim(...))`, donc l'argument absent et la chaîne
 * vide produisent la même colonne — mais un appel qui n'a rien à dire ne
 * transporte pas un champ vide. Même règle que `p_jour` et `p_staff_id`.
 *
 * L'invalidation du cache est **obligatoire** : le barème que lit la caisse
 * (`credits_par_euro`) est un des sept réglages. Sans elle, `/scan` pourrait
 * créditer l'ancien taux pendant dix secondes, et rien ne le montrerait.
 *
 * @param {{devise: string, creditsParEuro: number, minimum: number,
 *   cashback: boolean, expiration: number, parrainage: number,
 *   avisActif: boolean, avisPoints: number, avisLien: string}} reglages
 */
export async function enregistrerReglages(reglages) {
  const args = {
    p_devise: reglages.devise,
    p_credits_par_euro: reglages.creditsParEuro,
    p_min_purchase: reglages.minimum,
    p_deduction_libre: reglages.cashback === true,
    p_points_expiry_days: reglages.expiration,
    p_referral_reward: reglages.parrainage,
    p_review_reward_enabled: reglages.avisActif === true,
    p_review_reward: reglages.avisPoints,
  }
  if (reglages.avisLien) args.p_google_review_url = reglages.avisLien

  const resultat = await rpc('enregistrer_reglages_programme', args)

  if (resultat.etat === 'ok') cacheProgramme.oublier()

  return resultat
}


/**
 * La fiche établissement (`0011`) — nom, coordonnées, liens, géofence.
 *
 * `PROGRAM_NOT_FOUND` devient `absent`, comme dans `reglagesDuCommerce()` :
 * « il n'y a pas encore de programme » ne se corrige pas au même endroit que
 * « la base a dit non ». Pas de mémoire courte : l'écran existe pour modifier
 * ces valeurs, un cache de dix secondes afficherait ce qu'on vient de changer.
 */
export async function ficheDuCommerce() {
  const resultat = await rpc('fiche_du_commerce', {})
  if (resultat.etat === 'refuse' && resultat.code === 'PROGRAM_NOT_FOUND') {
    return { etat: 'absent', donnees: null, code: null }
  }
  return resultat
}

/**
 * Enregistre la fiche établissement (`0011`, coordonnées depuis `0017`).
 *
 * Les **quinze** arguments sont toujours envoyés, vides compris : la fonction
 * fait `nullif(btrim(...))`, donc `''` efface la colonne. Omettre un argument
 * laisserait l'ancienne valeur et le commerçant croirait que son effacement
 * n'a pas pris.
 *
 * `latitude`/`longitude` valent `null` ensemble (proximité désactivée) : c'est
 * la paire que la contrainte de `0017` exige, et l'analyse du lien collé est
 * faite **avant** cet appel, dans `etablissement.mjs`.
 *
 * L'invalidation du cache est obligatoire : le **nom** est un des champs, et
 * `programmeDuCommerce()` le sert à `/join/<slug>`, `/caisse` et `/qrcode`.
 */
export async function enregistrerFiche(fiche) {
  const resultat = await rpc('enregistrer_fiche_etablissement', {
    p_name: fiche.nom,
    p_type_activite: fiche.typeActivite,
    p_phone: fiche.phone,
    p_city: fiche.city,
    p_address: fiche.address,
    p_description: fiche.description,
    p_site_url: fiche.siteUrl,
    p_reservation_url: fiche.reservationUrl,
    p_instagram_url: fiche.instagramUrl,
    p_facebook_url: fiche.facebookUrl,
    p_tiktok_url: fiche.tiktokUrl,
    p_latitude: fiche.latitude,
    p_longitude: fiche.longitude,
    p_geofence_radius_m: fiche.rayon,
    p_geofence_texte: fiche.texte,
  })

  if (resultat.etat === 'ok') cacheProgramme.oublier()

  return resultat
}


/**
 * L'apparence du commerce (`0015`) — nom de carte, couleur, logo, image de fond.
 *
 * `PROGRAM_NOT_FOUND` devient `absent`, comme pour la fiche et les réglages :
 * « il n'y a pas encore de programme » ne se corrige pas au même endroit que
 * « la base a dit non ». Pas de mémoire courte : l'écran existe pour modifier
 * ces valeurs, un cache de dix secondes afficherait ce qu'on vient de changer.
 */
export async function apparenceDuCommerce() {
  const resultat = await rpc('apparence_du_commerce', {})
  if (resultat.etat === 'refuse' && resultat.code === 'PROGRAM_NOT_FOUND') {
    return { etat: 'absent', donnees: null, code: null }
  }
  return resultat
}

/**
 * Enregistre l'apparence (`0015`).
 *
 * Les **cinq** arguments sont toujours envoyés, vides compris : la fonction fait
 * `nullif(btrim(...))`, donc `''` efface la colonne. Omettre une adresse
 * laisserait l'ancienne image et le commerçant croirait son retrait perdu.
 *
 * L'invalidation du cache est obligatoire : le nom est un des champs, et
 * `programmeDuCommerce()` le sert à `/join/<slug>`, `/caisse` et `/qrcode`.
 */
export async function enregistrerApparence(apparence) {
  const resultat = await rpc('enregistrer_apparence', {
    p_name: apparence.nom,
    p_primary_color: apparence.couleur,
    p_commerce_type: apparence.type,
    p_logo_url: apparence.logo,
    p_wallet_bg_url: apparence.image,
  })

  if (resultat.etat === 'ok') cacheProgramme.oublier()

  return resultat
}


/**
 * La file des messages du commerçant (`0013`).
 *
 * Pas de mémoire courte : cet écran affiche un **compteur du jour** et une
 * liste. Un quota périmé de dix secondes autoriserait visuellement un quatrième
 * message, et la liste ne montrerait pas celui qu'on vient d'écrire.
 */
export async function messagesDuCommerce() {
  return rpc('messages_du_commerce', {})
}

/**
 * Met un message en file (`0013`) — statut `en_attente`, **jamais** `envoye`.
 *
 * `p_lien` n'est envoyé que s'il y en a un : la fonction a `default null`, donc
 * l'argument absent et la chaîne vide donnent la même colonne, mais un appel qui
 * n'a rien à dire ne transporte pas un champ vide. Même règle que `p_jour` et
 * `p_staff_id` (`0007`).
 *
 * @param {{titre: string, corps: string, lien: string|null}} message
 */
export async function enfilerMessage(message) {
  const args = { p_titre: message.titre, p_corps: message.corps }
  if (message.lien) args.p_lien = message.lien
  return rpc('enfiler_message', args)
}


/**
 * Ce qu'un pass Google Wallet a besoin de savoir (`0014`).
 *
 * `CARD_NOT_FOUND` devient `introuvable`, comme partout : l'écran (ici, la
 * route) distingue « ce jeton n'existe pas » de « le canal n'est pas branché »,
 * et ces deux cas ne se corrigent pas au même endroit.
 */
export async function cartePourWallet(jeton) {
  return rpc('carte_pour_wallet', { p_token: String(jeton ?? '') })
}

/**
 * Enregistre l'identifiant d'objet Google d'une carte (`0014`).
 *
 * À n'appeler **qu'après** un enregistrement effectif : la colonne dit « ce
 * client a un pass », pas « on a essayé ».
 */
export async function lierWallet(jeton, objectId) {
  return rpc('lier_wallet', { p_token: String(jeton ?? ''), p_object_id: String(objectId ?? '') })
}


/**
 * La carte publique (`0018`) — `/card/<cardId>`, sans session.
 *
 * `CARD_NOT_FOUND` devient `introuvable`, comme partout : la page rend alors le
 * **même 404** qu'une URL mal orthographiée, ce qui est le comportement mesuré
 * de la cible (`/card/test` et l'UUID nul tombent sur la même page).
 *
 * Pas de mémoire courte : la page affiche un **solde**, et un solde périmé de
 * dix secondes est exactement ce que le client vient vérifier.
 */
export async function cartePublique(cardId) {
  if (!cardId) return { etat: 'refuse', donnees: null, code: 'CARD_NOT_FOUND' }
  return rpc('carte_publique', { p_card_id: String(cardId) })
}

/**
 * Enregistre l'abonnement web push d'un navigateur (`0019`).
 *
 * L'émetteur n'existe pas encore (P0-4b) : cette fonction **écrit** un
 * abonnement, elle n'envoie rien. Le jour où un canal sortant sera tranché,
 * c'est `push_abonnements` qu'il lira — pas cette fonction qu'il réécrira.
 *
 * @param {{carte: string, endpoint: string, p256dh: string, auth: string}} abonnement
 */
export async function enregistrerAbonnementPush({ carte, endpoint, p256dh, auth }) {
  return rpc('enregistrer_abonnement_push', {
    p_card_id: String(carte ?? ''),
    p_endpoint: String(endpoint ?? ''),
    p_p256dh: String(p256dh ?? ''),
    p_auth: String(auth ?? ''),
  })
}


