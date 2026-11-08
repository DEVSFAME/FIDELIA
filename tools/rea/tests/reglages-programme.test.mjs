/* ============================================================================
   P0-1 — la page `/program` (onglet « Règles »), de la mesure au raccordement.

   Ce que ce fichier empêche, dans l'ordre où les défauts arrivent :

     1. **la copie recopiée à moitié.** Les sept libellés sont mesurés
        (`_captures/2026-11-02-a6/rendu/a02-program.html`) ; un seul caractère
        changé et l'écran ne dit plus la même chose que la cible. Chaque
        assertion a donc son **témoin** dans la capture : si la chaîne disparaît
        du corpus, le test échoue en le disant, au lieu de comparer le
        dictionnaire à lui-même (§24.2).
     2. **un champ renommé.** Les `name` du formulaire sont ceux de la cible :
        ils sont extraits de la capture et confrontés à la page. C'est la seule
        façon de voir qu'un `<input>` a été « amélioré » en `pointsPerPurchase`.
     3. **un barème qui dérive.** L'écran demande « points par 10 », la base
        garde « points par euro ». La conversion est vérifiée dans les deux sens,
        y compris son refus des valeurs que `numeric(10,2)` arrondirait en
        silence.
     4. **un refus qui n'a pas de texte.** `refusReglages` rend des codes ; un
        code sans clé au dictionnaire s'afficherait en exception, et un refus
        sans branche rendrait un écran figé.
     5. **un symbole monétaire recopié.** La capture écrit « € » parce que son
        programme est en euros ; ici la devise est une donnée.
     6. **un onglet sans page.** `/program` est joignable par l'onglet
        « Règles » ; la navigation le déclare, donc le test vérifie le disque.

   Rien ici n'ouvre de navigateur ni de connexion : on lit la capture, les
   sources et les modules purs.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { ONGLETS_PROGRAMME, routesPromises } from '../../../web/src/lib/navigation.mjs'
import { symboleDevise } from '../../../web/src/lib/tableau.mjs'
import {
  DEVISES,
  MONTANT_MAX,
  POINTS_PAR_TRANCHE_MAX,
  POINTS_PAR_TRANCHE_MIN,
  TRANCHE,
  creditsDepuisPointsParTranche,
  creditsParEuroValide,
  deviseValide,
  entierPositif,
  formaterPointsParTranche,
  lienAvisValide,
  lireReglages,
  montantValide,
  pointsParTrancheDepuisCredits,
  pointsParTrancheValide,
  refusReglages,
  reglagesDepuisFormulaire,
} from '../../../web/src/lib/programme.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const CAPTURE = lire('01_REA_Fidelix', '_captures', '2026-11-02-a6', 'rendu', 'a02-program.html')
const PAGE = lire('web', 'src', 'app', '(dashboard)', 'program', 'page.jsx')
const ACTION = lire('web', 'src', 'app', '(dashboard)', 'program', 'actions.js')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')
const ONGLETS = lire('web', 'src', 'components', 'tableau', 'OngletsProgramme.jsx')

const FR = dictionnaire('fr')

/** Le texte visible de la capture : balises retirées, entités résolues.
 *
 * Les balises sont remplacées par **rien**, pas par une espace : la cible écrit
 * `<strong>50 points</strong>.` et `<strong>250 €</strong> créditera`, donc une
 * espace de substitution donnerait « 50 points . » et ferait échouer la
 * comparaison sur une ponctuation que personne ne voit à l'écran.
 */
const TEXTE = CAPTURE.replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')

/* L'apostrophe est une **typographie**, pas une mesure : la capture écrit `'`
   (U+0027), le dictionnaire du socle écrit `’` (U+2019) ailleurs. Comparer les
   deux formes brutes ferait échouer un test sur un caractère invisible à
   l'écran. On normalise, et seulement l'apostrophe. */
const plat = (texte) => String(texte).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ')

/** Rend un gabarit du dictionnaire, comme le fait `traduire()`. */
const rendu = (cle, variables) =>
  plat(FR[cle].replace(/\{(\w+)\}/g, (entier, nom) =>
    Object.hasOwn(variables ?? {}, nom) ? String(variables[nom]) : entier
  ))

/* ---------------------------------------------------------------------------
   1. Les témoins — la mesure est toujours là
   ------------------------------------------------------------------------ */

test('capture — les sept réglages et leurs libellés sont dans le DOM mesuré', () => {
  const temoins = [
    'Devise de vos montants',
    'Dirham (MAD)',
    'Euro (€)',
    "Celle des montants saisis en caisse, du barème et du chiffre d'affaires affiché.",
    'Points par 10 € dépensés',
    "C'est votre barème. Il se règle par tranche de 10 €.",
    'Achat minimum (€)',
    "En dessous, aucun point n'est crédité.",
    'Un ticket de 250 € créditera 50 points.',
    'Mode cashback',
    '1 point = 1 € de remise',
    'Expiration des points (jours, 0 = jamais)',
    'Parrainage',
    'Bonus de parrainage (points)',
    'Bonus avis Google',
    'Activer le bonus avis Google',
    'Bonus accordé (points)',
    "Lien de votre page d'avis Google",
    "Collez votre Place ID à la fin du lien, après placeid=",
    'Trouver mon Place ID',
    'Enregistrer',
  ]
  const texte = plat(TEXTE)
  for (const temoin of temoins) {
    assert.ok(texte.includes(plat(temoin)), `témoin absent de la capture : « ${temoin} »`)
  }

  // Les deux `placeholder` mesurés, lus dans le balisage (ils ne sont pas du texte).
  for (const placeholder of ['0 = désactivé', 'Ex : 10']) {
    assert.ok(
      CAPTURE.includes(`placeholder="${placeholder}"`),
      `placeholder mesuré disparu : « ${placeholder} »`
    )
  }
})

/* ---------------------------------------------------------------------------
   2. La copie — rendue en euros, elle doit être le texte de la capture
   ------------------------------------------------------------------------ */

test('copie — les libellés rendus en euros sont, au caractère près, ceux de la capture', () => {
  const euro = { tranche: TRANCHE, symbole: '€' }

  assert.equal(rendu('page.programme.regles.devise'), 'Devise de vos montants')
  assert.equal(rendu('page.programme.regles.deviseMAD'), 'Dirham (MAD)')
  assert.equal(rendu('page.programme.regles.deviseEUR', euro), 'Euro (€)')
  assert.equal(
    rendu('page.programme.regles.deviseAide'),
    "Celle des montants saisis en caisse, du barème et du chiffre d'affaires affiché."
  )
  assert.equal(rendu('page.programme.regles.points', euro), 'Points par 10 € dépensés')
  assert.equal(
    rendu('page.programme.regles.pointsAide', euro),
    "C'est votre barème. Il se règle par tranche de 10 €."
  )
  assert.equal(rendu('page.programme.regles.minimum', euro), 'Achat minimum (€)')
  assert.equal(rendu('page.programme.regles.minimumAide'), "En dessous, aucun point n'est crédité.")
  assert.equal(
    rendu('page.programme.regles.minimumExemple', { montant: '250 €', points: 50 }),
    'Un ticket de 250 € créditera 50 points.'
  )
  assert.equal(rendu('page.programme.regles.cashback'), 'Mode cashback')
  assert.equal(
    rendu('page.programme.regles.cashbackAide', euro),
    '1 point = 1 € de remise. À chaque passage, la caisse déduit le nombre de points ' +
      'de votre choix, dans la limite du solde du client — sans passer par une récompense.'
  )
  assert.equal(
    rendu('page.programme.regles.expiration'),
    'Expiration des points (jours, 0 = jamais)'
  )
  assert.equal(rendu('page.programme.regles.parrainage'), 'Parrainage')
  assert.equal(rendu('page.programme.regles.parrainageChamp'), 'Bonus de parrainage (points)')
  assert.equal(rendu('page.programme.regles.avis'), 'Bonus avis Google')
  assert.equal(rendu('page.programme.regles.avisActiver'), 'Activer le bonus avis Google')
  assert.equal(rendu('page.programme.regles.avisPoints'), 'Bonus accordé (points)')
  assert.equal(rendu('page.programme.regles.avisLien'), "Lien de votre page d'avis Google")
  assert.equal(rendu('page.programme.regles.avisTrouver'), 'Trouver mon Place ID')
  assert.equal(rendu('page.programme.regles.action'), 'Enregistrer')

  // Les deux phrases de la cible qui ne sont pas des libellés de champ.
  assert.equal(
    rendu('page.programme.regles.avisLienAide'),
    'Collez votre Place ID à la fin du lien, après placeid=.'
  )
  assert.equal(
    rendu('page.programme.regles.parrainageAide'),
    "Quand un client invite un ami, les deux reçoivent ce bonus au premier passage en " +
      "caisse de l'ami — pas à son inscription. Mettez 0 pour ne pas offrir de bonus."
  )
})

test('copie — le symbole monétaire n’est jamais recopié dans une valeur', () => {
  /* `tableau-lecture.test.mjs` interdit déjà « € » dans **tout** le
     dictionnaire ; on le vérifie aussi ici, sur les clés de cet écran, pour que
     le jour où la règle générale bougerait, celle-ci reste visible à côté de la
     capture qui, elle, écrit « € ». */
  const fautives = [
    'page.programme.regles.devise',
    'page.programme.regles.deviseEUR',
    'page.programme.regles.deviseAide',
    'page.programme.regles.points',
    'page.programme.regles.pointsAide',
    'page.programme.regles.minimum',
    'page.programme.regles.minimumAide',
    'page.programme.regles.minimumExemple',
    'page.programme.regles.cashbackAide',
  ].filter((cle) => FR[cle].includes('€'))
  assert.deepEqual(fautives, [], `des clés recopient le symbole de la capture : ${fautives}`)

  // Et le gabarit porte bien les deux variables attendues.
  assert.match(FR['page.programme.regles.points'], /\{symbole\}/)
  assert.match(FR['page.programme.regles.points'], /\{tranche\}/)
})


/* ---------------------------------------------------------------------------
   3. Le formulaire — mêmes champs que la capture
   ------------------------------------------------------------------------ */

test('formulaire — les `name` mesurés sont ceux de la page, aucun n’est inventé', () => {
  const nomsCapture = new Set(
    [...CAPTURE.matchAll(/name="([a-z_]+)"/g)].map((trouve) => trouve[1])
  )

  /* Les huit `name` qui portent les sept réglages. `devise` n'y est pas : la
     cible la choisit par deux `<button type="button" aria-pressed>` sans
     `name` (état client). Ici le formulaire est sans JavaScript, donc la devise
     est un groupe de radios nommé — écart de **forme** déclaré dans
     `docs/design-system.md` §3, la valeur restant l'une des deux mesurées. */
  const mesures = [
    'points_per_purchase',
    'min_purchase_mad',
    'deduction_libre',
    'points_expiry_days',
    'referral_reward',
    'review_reward_enabled',
    'review_reward',
    'google_review_url',
  ]

  for (const nom of mesures) {
    assert.equal(nomsCapture.has(nom), true, `« ${nom} » n’est plus dans la capture`)
    assert.ok(PAGE.includes(`name="${nom}"`), `la page ne poste plus « ${nom} »`)
  }

  assert.ok(PAGE.includes('name="devise"'), 'le groupe de devises n’a plus de nom')

  /* Aucun `name` de la page qui ne soit ni mesuré, ni la devise : c'est la
     garde contre un champ ajouté « au cas où ». */
  const nomsPage = new Set([...PAGE.matchAll(/name="([a-z_]+)"/g)].map((trouve) => trouve[1]))
  const inventes = [...nomsPage].filter((nom) => nom !== 'devise' && !mesures.includes(nom))
  assert.deepEqual(inventes, [], `champs absents de la mesure : ${inventes}`)

  /* Deux `name` de la capture ne sont **pas** repris, et c'est déclaré : ce sont
     les restes de l'onglet « Récompenses » dans le même composant de la cible
     (`reward_threshold`, `reward_description`). Les poster ici réécrirait le
     seuil et l'intitulé d'un palier depuis une page qui ne les affiche pas. */
  for (const nom of ['reward_threshold', 'reward_description']) {
    assert.equal(nomsCapture.has(nom), true, `témoin : « ${nom} » a disparu de la capture`)
    assert.equal(PAGE.includes(`name="${nom}"`), false, `« ${nom} » réécrirait un palier`)
  }
})


/* ---------------------------------------------------------------------------
   4. Le module pur — conversion, bornes, refus
   ------------------------------------------------------------------------ */

test('barème — les deux devises mesurées, et rien d’autre', () => {
  assert.deepEqual([...DEVISES], ['MAD', 'EUR'])
  assert.equal(deviseValide('MAD'), true)
  assert.equal(deviseValide('eur'), true, 'la casse de la donnée ne doit pas changer la valeur')
  assert.equal(deviseValide(' MAd '), true)
  for (const mauvais of ['USD', '', null, undefined, 3, {}]) {
    assert.equal(deviseValide(mauvais), false, `accepté à tort : ${String(mauvais)}`)
  }
})

test('barème — points par tranche et taux par euro se répondent', () => {
  // Le cas de la capture : 2 points par 10, donc 0,2 par euro, donc 50 points
  // pour un ticket de 250.
  assert.equal(creditsDepuisPointsParTranche(2), 0.2)
  assert.equal(pointsParTrancheDepuisCredits(0.2), 2)
  assert.equal(formaterPointsParTranche(0.22), '2.2')
  assert.equal(formaterPointsParTranche(0.01), '0.1')

  // Aucune dérive de flottant : `2.2 / 10` vaut 0.22000000000000003.
  assert.equal(creditsDepuisPointsParTranche(2.2), 0.22)
  assert.equal(formaterPointsParTranche(creditsDepuisPointsParTranche(2.2)), '2.2')

  // Les bornes sont celles de la colonne, exprimées par tranche.
  assert.equal(POINTS_PAR_TRANCHE_MIN, 0.1)
  assert.equal(POINTS_PAR_TRANCHE_MAX, 10_000)

  // Aller-retour sur toute la plage utile : un taux stocké doit se réafficher.
  for (const points of [0.1, 0.5, 1, 1.5, 2, 2.5, 3, 10, 100, 10_000]) {
    assert.equal(pointsParTrancheDepuisCredits(creditsDepuisPointsParTranche(points)), points)
  }
})

test('barème — un taux intermédiaire n’est pas arrondi, il est refusé', () => {
  // 2,25 par 10 donnerait 0,225 par euro : `numeric(10,2)` enregistrerait 0,22
  // ou 0,23 sans le dire. On refuse, et le message dit le pas.
  assert.equal(pointsParTrancheValide(2.25), false, 'un pas de 0,01 ne passe pas')
  assert.equal(creditsDepuisPointsParTranche(2.25), null)

  for (const mauvais of [0, 0.05, -1, 10_000.1, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
    assert.equal(pointsParTrancheValide(mauvais), false, `accepté à tort : ${String(mauvais)}`)
    assert.equal(creditsDepuisPointsParTranche(mauvais), null)
  }

  // Et tout ce qui est accepté produit un taux que la colonne sait garder.
  for (const bon of [0.1, 1, 2.2, 7.5, 1000, 10_000]) {
    assert.equal(
      creditsParEuroValide(creditsDepuisPointsParTranche(bon)),
      true,
      `taux hors bornes : ${bon}`
    )
  }
})

test('montants et entiers — bornes de colonne, pas d’invention', () => {
  assert.equal(montantValide(0), true)
  assert.equal(montantValide(12.5), true)
  assert.equal(montantValide(MONTANT_MAX), true)
  for (const mauvais of [-0.01, MONTANT_MAX + 1, Number.NaN, '10', null]) {
    assert.equal(montantValide(mauvais), false, `accepté à tort : ${String(mauvais)}`)
  }

  assert.equal(entierPositif(0), true, '« 0 = jamais » est une valeur, pas une absence')
  assert.equal(entierPositif(30), true)
  for (const mauvais of [-1, 1.5, Number.NaN, '3', null]) {
    assert.equal(entierPositif(mauvais), false, `accepté à tort : ${String(mauvais)}`)
  }
})

test('lien d’avis — facultatif, mais https quand il est là', () => {
  const bon = 'https://search.google.com/local/writereview?placeid=ChIJ123'
  assert.equal(lienAvisValide(''), true, 'le champ est facultatif')
  assert.equal(lienAvisValide('   '), true)
  assert.equal(lienAvisValide(null), true)
  assert.equal(lienAvisValide(bon), true)
  assert.equal(lienAvisValide(`  ${bon}  `), true, 'les espaces de collage ne comptent pas')

  for (const mauvais of [
    'http://exemple.ma/avis',
    'search.google.com',
    'https://',
    'javascript:alert(1)',
    'pas une url',
  ]) {
    assert.equal(lienAvisValide(mauvais), false, `accepté à tort : ${mauvais}`)
  }
})


test('refus — chaque réglage a son code, et le code est celui du dictionnaire', () => {
  /** Un jeu valide : tous les refus ci-dessous n'en changent qu'un champ. */
  const valides = {
    devise: 'EUR',
    pointsParTranche: 2,
    minimum: 0,
    cashback: false,
    expiration: 0,
    parrainage: 0,
    avisActif: false,
    avisPoints: 0,
    avisLien: '',
  }
  assert.deepEqual(refusReglages(valides), [], 'un jeu valide ne doit rien refuser')

  const cas = [
    ['devise', { devise: 'USD' }],
    ['points', { pointsParTranche: 0 }],
    ['points', { pointsParTranche: 2.25 }],
    ['points', { pointsParTranche: Number.NaN }],
    ['minimum', { minimum: -1 }],
    ['minimum', { minimum: '250' }],
    ['expiration', { expiration: 1.5 }],
    ['expiration', { expiration: -30 }],
    ['parrainage', { parrainage: '10' }],
    ['parrainage', { parrainage: -5 }],
    ['avisPoints', { avisPoints: 2.5 }],
    ['avisLien', { avisLien: 'http://exemple.ma' }],
  ]
  for (const [code, surcharge] of cas) {
    assert.deepEqual(
      refusReglages({ ...valides, ...surcharge }),
      [code],
      `${code} attendu pour ${JSON.stringify(surcharge)}`
    )
  }

  // Un code sans texte s'afficherait en exception : on vérifie les deux côtés.
  for (const code of [
    'devise',
    'points',
    'minimum',
    'expiration',
    'parrainage',
    'avisPoints',
    'avisActif',
    'avisLien',
    'avisSansLien',
  ]) {
    assert.equal(
      typeof FR[`page.programme.regles.erreur.${code}`],
      'string',
      `aucun message pour le refus « ${code} »`
    )
  }
})

test('refus — activer un bonus qui ne paie rien, ou que personne ne peut réclamer', () => {
  const base = {
    devise: 'MAD',
    pointsParTranche: 1,
    minimum: 0,
    cashback: true,
    expiration: 0,
    parrainage: 5,
    avisActif: false,
    avisPoints: 0,
    avisLien: '',
  }
  const lien = 'https://search.google.com/local/writereview?placeid=ChIJ123'

  // Désactivé : ni les points ni le lien ne sont exigés.
  assert.deepEqual(refusReglages(base), [])

  // Activé sans points : la récompense promise n'arriverait jamais. Les deux
  // fautes sont réelles (0 point **et** pas de lien), donc les deux sont dites.
  assert.deepEqual(refusReglages({ ...base, avisActif: true }), ['avisActif', 'avisSansLien'])

  // Activé avec des points mais sans lien : le client ne peut pas demander.
  assert.deepEqual(refusReglages({ ...base, avisActif: true, avisPoints: 10 }), ['avisSansLien'])

  // Activé, complet : valide.
  assert.deepEqual(
    refusReglages({ ...base, avisActif: true, avisPoints: 10, avisLien: lien }),
    []
  )

  // L'ordre est fixe : deux fautes rendent la **première** des deux.
  assert.deepEqual(refusReglages({ ...base, devise: '', pointsParTranche: 0 }), ['devise', 'points'])
})


test('formulaire — les champs vides ont le sens que la capture leur donne', () => {
  const plein = new FormData()
  plein.append('devise', 'mad')
  plein.append('points_per_purchase', '2')
  plein.append('min_purchase_mad', '20')
  plein.append('deduction_libre', 'on')
  plein.append('points_expiry_days', '90')
  plein.append('referral_reward', '25')
  plein.append('review_reward_enabled', 'on')
  plein.append('review_reward', '10')
  plein.append('google_review_url', ' https://exemple.ma/avis ')

  const lus = reglagesDepuisFormulaire(plein)
  assert.deepEqual(lus, {
    devise: 'MAD',
    pointsParTranche: 2,
    minimum: 20,
    cashback: true,
    expiration: 90,
    parrainage: 25,
    avisActif: true,
    avisPoints: 10,
    avisLien: 'https://exemple.ma/avis',
  })
  assert.deepEqual(refusReglages(lus), [])

  /* Un formulaire vidé : les cases disparaissent de `FormData`, les champs
     numériques arrivent en chaîne vide. `Number('')` valant `0`, c'est ici que
     le piège se referme — un barème vide deviendrait « zéro point par euro »
     sans que personne ne l'ait demandé. */
  const vide = new FormData()
  vide.append('devise', 'EUR')
  vide.append('points_per_purchase', '')
  vide.append('min_purchase_mad', '')
  vide.append('points_expiry_days', '')
  vide.append('referral_reward', '')
  vide.append('review_reward', '')

  const vides = reglagesDepuisFormulaire(vide)
  assert.equal(Number.isNaN(vides.pointsParTranche), true, 'un barème vide rend NaN, pas 0')
  assert.equal(vides.minimum, 0, '« aucun minimum » est un 0 légitime')
  assert.equal(vides.expiration, 0, '« 0 = jamais »')
  assert.equal(vides.parrainage, 0, '« 0 = désactivé »')
  assert.equal(vides.cashback, false)
  assert.equal(vides.avisActif, false)
  assert.equal(vides.avisPoints, 0, 'bonus désactivé : le champ vide ne bloque pas')
  assert.equal(vides.avisLien, '')

  // Et ce formulaire-là est refusé, pour la seule raison qui reste : le barème.
  assert.deepEqual(refusReglages(vides), ['points'])

  // Activé sans points saisis : un `NaN`, donc un refus explicite — pas un
  // bonus de 0 point accepté en silence. Le lien manque aussi : deux refus.
  const actifSansPoints = new FormData()
  actifSansPoints.append('devise', 'EUR')
  actifSansPoints.append('points_per_purchase', '1')
  actifSansPoints.append('review_reward_enabled', 'on')
  assert.equal(reglagesDepuisFormulaire(actifSansPoints).avisPoints, Number.NaN)
  assert.deepEqual(refusReglages(reglagesDepuisFormulaire(actifSansPoints)), [
    'avisPoints',
    'avisSansLien',
  ])
})

test('lecture — PostgREST rend des chaînes, l’écran reçoit des nombres', () => {
  // `numeric` arrive en chaîne, `integer` en nombre, le lien vide en `null` :
  // trois formes pour un seul écran, qui n'a pas à les connaître.
  const lus = lireReglages({
    devise: 'mad',
    credits_par_euro: '0.22',
    min_purchase: '20.00',
    deduction_libre: true,
    points_expiry_days: 90,
    referral_reward: '25',
    review_reward_enabled: true,
    review_reward: 10,
    google_review_url: null,
  })
  assert.equal(lus.devise, 'MAD')
  assert.equal(lus.creditsParEuro, 0.22)
  assert.equal(lus.minimum, 20)
  assert.equal(lus.cashback, true)
  assert.equal(lus.expiration, 90)
  assert.equal(lus.parrainage, 25)
  assert.equal(lus.avisActif, true)
  assert.equal(lus.avisPoints, 10)
  assert.equal(lus.avisLien, '', 'un lien null se lit comme une absence, pas comme « null »')

  // Une réponse vide ou illisible ne casse pas l'écran : elle rend les défauts
  // de la colonne, et `devise` retombe sur celle de la `0008`.
  const vide = lireReglages(null)
  assert.equal(vide.devise, 'EUR')
  assert.equal(vide.creditsParEuro, 1)
  assert.equal(vide.expiration, 0)
  assert.equal(vide.avisActif, false)
  assert.equal(symboleDevise(vide.devise), '€')

  // Les entiers négatifs ou fractionnaires d'une base modifiée à la main
  // tombent à 0 plutôt que de s'afficher tels quels dans un `input`.
  const abime = lireReglages({ points_expiry_days: -5, referral_reward: 1.5, review_reward: 'x' })
  assert.equal(abime.expiration, 0)
  assert.equal(abime.parrainage, 0)
  assert.equal(abime.avisPoints, 0)
})


/* ---------------------------------------------------------------------------
   5. Le raccordement — l'action, la couche de données, la page, les onglets
   ------------------------------------------------------------------------ */

test('action — elle valide avec le module, convertit une fois, et n’écrit rien d’autre', () => {
  // Le module est **appelé**, pas recopié : une seconde règle dériverait.
  assert.match(ACTION, /reglagesDepuisFormulaire\(donnees\)/)
  assert.match(ACTION, /refusReglages\(reglages\)/)
  assert.match(ACTION, /creditsDepuisPointsParTranche\(reglages\.pointsParTranche\)/)

  // Un `if` et une URL littérale par code, dans l'ordre fixe du module.
  const codes = [
    'devise',
    'points',
    'minimum',
    'expiration',
    'parrainage',
    'avisPoints',
    'avisActif',
    'avisLien',
    'avisSansLien',
  ]
  let curseur = -1
  for (const code of codes) {
    const position = ACTION.indexOf(`redirect('/program?etat=${code}')`)
    assert.ok(position > curseur, `« ${code} » manque, ou n'est plus dans l'ordre`)
    curseur = position
  }

  assert.ok(ACTION.includes("redirect('/program?etat=ok')"), 'le succès n’a plus d’URL')
  assert.match(ACTION, /revalidatePath\('\/rewards'\)/, '/rewards ne relit plus le barème')
  assert.match(ACTION, /revalidatePath\('\/program'\)/)

  /* Une page de réglages qui appellerait `enregistrer_programme` réécrirait le
     nom, le slug, le seuil et les paliers depuis un formulaire qui ne les
     affiche pas. On le vérifie sur le **code**, pas sur le fichier : l'en-tête
     de l'action nomme la fonction pour expliquer qu'elle ne l'appelle pas. */
  const codeSeul = ACTION.split('\n')
    .filter((ligne) => !/^\s*(\*|\/\/|\/\*)/.test(ligne))
    .join('\n')
  assert.equal(codeSeul.includes('enregistrerProgramme'), false)
  assert.equal(codeSeul.includes('enregistrer_programme'), false)

  /* La redirection finale doit être **hors** de tout `try` : `redirect()` lève
     une exception interne à Next, que le `catch` transformerait en écran figé
     après une écriture réussie. */
  assert.equal(/try\s*\{/.test(codeSeul), false, 'un `try` a été ajouté autour des redirections')
})

test('données — neuf arguments nommés comme la fonction, et le cache invalidé', () => {
  /* Les noms doivent être ceux de `0010` : PostgREST résout les arguments par
     nom, donc `p_points_expiry_days` deviné en `p_expiration_days` produirait un
     `PGRST202` que la page afficherait comme « migration absente » — un
     diagnostic faux, et décourageant. */
  const argumentsAttendus = [
    'p_devise:',
    'p_credits_par_euro:',
    'p_min_purchase:',
    'p_deduction_libre:',
    'p_points_expiry_days:',
    'p_referral_reward:',
    'p_review_reward_enabled:',
    'p_review_reward:',
  ]
  for (const argument of argumentsAttendus) {
    assert.ok(DONNEES.includes(argument), `argument absent de l’appel : ${argument}`)
  }

  // Le lien est facultatif : il ne part que s'il y a quelque chose à dire.
  assert.match(DONNEES, /if \(reglages\.avisLien\) args\.p_google_review_url/)

  // `PROGRAM_NOT_FOUND` devient « absent » — un programme, pas une panne.
  assert.match(DONNEES, /resultat\.code === 'PROGRAM_NOT_FOUND'/)
  assert.match(DONNEES, /etat: 'absent'/)

  /* Et l'invalidation du cache vient **après** un succès : l'avant ferait
     relire l'ancien taux par `/scan` pendant que l'écriture échoue. On borne la
     lecture au corps de `enregistrerReglages` — six autres fonctions du fichier
     testent `resultat.etat === 'ok'`, et un `lastIndexOf` sur tout le fichier
     tomberait dans la dernière. */
  const depart = DONNEES.indexOf('export async function enregistrerReglages')
  assert.ok(depart > 0, 'la fonction `enregistrerReglages` a disparu')
  const suite = DONNEES.slice(depart + 1)
  const fin = suite.indexOf('\nexport ')
  const corps = fin === -1 ? suite : suite.slice(0, fin)

  const succes = corps.indexOf("resultat.etat === 'ok'")
  const oubli = corps.indexOf('cacheProgramme.oublier()')
  assert.ok(oubli > 0, 'le cache du programme n’est plus invalidé')
  assert.ok(
    succes > 0 && succes < oubli,
    'le cache est invalidé avant de savoir si l’écriture a marché'
  )
})


test('page — chaque état de lecture a son écran, chaque refus son message', () => {
  // Les trois blocages, puis tout le reste (`refuse`, `indisponible`).
  for (const etat of ["'nonMigre'", "'configuration'", "'absent'"]) {
    assert.ok(PAGE.includes(`lecture.etat === ${etat}`), `aucune branche pour ${etat}`)
  }
  assert.ok(PAGE.includes("lecture.etat !== 'ok'"), 'le fourre-tout des états non lus a disparu')

  /* La page ne doit pas **deviner** un `?etat=` : chaque valeur écrite par
     l'action doit avoir sa branche littérale ici. C'est la moitié du contrat
     d'`etat-action` — lui vérifie que l'état existe, ceci vérifie qu'il a un
     texte. */
  /* La page ne doit pas **deviner** un `?etat=` : chaque valeur écrite par
     l'action doit avoir sa branche littérale ici. C'est la moitié du contrat
     d'`etat-action` — lui vérifie que l'état existe, ceci vérifie qu'il a un
     texte. Les neuf refus et `ok` sont des URL littérales ; `refus` et
     `migration` dépendent du retour de la RPC, donc d'un gabarit — on les
     ajoute après avoir vérifié qu'ils sont bien écrits. */
  const etatsAction = new Set(
    [...ACTION.matchAll(/redirect\(['`]\/program\?etat=([A-Za-z]+)['`]\)/g)].map((trouve) => trouve[1])
  )
  for (const etat of ['refus', 'migration']) {
    assert.ok(ACTION.includes(`'${etat}'`), `l’action n’écrit plus « ${etat} »`)
    etatsAction.add(etat)
  }
  assert.equal(etatsAction.size, 12, `états lus dans l’action : ${[...etatsAction]}`)
  for (const etat of etatsAction) {
    assert.ok(PAGE.includes(`etat === '${etat}'`), `l’état « ${etat} » n’a pas d’écran`)
  }

  /* Chaque message de refus pointe une clé qui existe vraiment. Dix clés ici —
     les neuf refus de forme plus le fourre-tout `refus` — et une onzième pour
     `migration`, qui réutilise celle d'`EtatBloque` : une seconde copie ferait
     diverger la phrase selon le chemin emprunté. */
  const clesMessages = [...PAGE.matchAll(/'(page\.programme\.regles\.erreur\.[a-zA-Z]+)'/g)].map(
    (trouve) => trouve[1]
  )
  assert.equal(clesMessages.length, 10, `messages de refus trouvés : ${clesMessages.length}`)
  for (const cle of new Set(clesMessages)) {
    assert.equal(typeof FR[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }
  assert.equal(
    typeof FR['tableau.etat.migrationTexte'],
    'string',
    'le message de migration a disparu du socle'
  )

  /* Le nom de la migration est écrit une fois, dans le blocage : c'est la seule
     chose que le commerçant pourra recopier. S'il ne correspondait plus au
     disque, le blocage enverrait vers un fichier inexistant. */
  assert.ok(PAGE.includes('migrations/0010_reglages_programme.sql'))
  assert.equal(
    existsSync(join(RACINE, 'migrations', '0010_reglages_programme.sql')),
    true,
    'le blocage cite une migration qui n’existe pas'
  )

  // Aucun symbole monétaire en dur dans le **code** : ici la devise est une
  // donnée, pas « € ». Les commentaires, eux, ont le droit de citer la capture.
  const lignes = PAGE.split('\n')
    .filter((ligne) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(ligne))
    .filter((ligne) => ligne.includes('€'))
  assert.deepEqual(lignes, [], 'la page recopie un symbole monétaire au lieu de le lire')

  // Et l'exemple est calculé côté serveur, avec le taux enregistré.
  assert.ok(PAGE.includes('pointsDepuisMontant(MONTANT_EXEMPLE, reglages.creditsParEuro)'))
  assert.equal(PAGE.includes("'use client'"), false, 'la page est devenue cliente sans raison')
})

test('onglets — deux onglets, deux pages, aucun lien mort', () => {
  assert.deepEqual(
    ONGLETS_PROGRAMME.map((onglet) => onglet.href),
    ['/rewards', '/program'],
    'les deux onglets mesurés ont bougé'
  )
  for (const onglet of ONGLETS_PROGRAMME) {
    assert.equal(typeof FR[onglet.cle], 'string', `onglet sans libellé : ${onglet.cle}`)
    // La page doit exister sur le disque : un onglet vers un 404 est un lien mort.
    const chemin = onglet.href === '/rewards' ? 'rewards' : 'program'
    assert.equal(
      existsSync(join(RACINE, 'web', 'src', 'app', '(dashboard)', chemin, 'page.jsx')),
      true,
      `aucune page pour l’onglet ${onglet.href}`
    )
  }

  // Les libellés sont ceux de la cible : « Récompenses » puis « Règles ».
  assert.equal(FR['tableau.programme.ongletRecompenses'], 'Récompenses')
  assert.equal(FR['tableau.programme.ongletRegles'], 'Règles')

  /* `routesPromises()` est la liste que `navigation.test.mjs` confronte au
     disque : elle doit contenir `/program` **une fois**, et aucune route deux
     fois — `/rewards` est à la fois une entrée du rail et un onglet. */
  const routes = routesPromises()
  assert.equal(routes.includes('/program'), true, '/program n’est pas promise')
  assert.equal(routes.length, new Set(routes).size, `routes en double : ${routes}`)
  assert.equal(routes.filter((route) => route === '/rewards').length, 1)

  /* Et l'onglet actif est signalé, pas colorié : c'est ce que la cible fait
     (`aria-current="page"`), et c'est ce qu'un lecteur d'écran annonce. */
  assert.match(ONGLETS, /aria-current/)
  assert.match(ONGLETS, /OngletsProgramme/)
  assert.match(
    lire('web', 'src', 'app', '(dashboard)', 'rewards', 'page.jsx'),
    /<OngletsProgramme\b/,
    '/rewards ne porte plus la barre d’onglets : les deux pages divergeraient'
  )
})


test('onglets — chaque nom employé est importé, et le composant reste rendu deux fois', () => {
  /* CE DÉFAUT-LÀ A EU LIEU. `OngletsProgramme.jsx` a d'abord appelé `pour`,
     `Link` et `ONGLETS_PROGRAMME` **sans les importer** : `next build` est
     resté vert (il ne résout pas les identifiants libres d'un module), la page
     a répondu 200 côté route… et le conteneur a journalisé
     `ReferenceError: pour is not defined` au premier rendu. Un test de texte
     ne voit pas ça ; une liste de noms importés, si. */
  const entete = ONGLETS.slice(0, ONGLETS.indexOf('\nexport '))
  for (const nom of ['Link', 'pour', 'ONGLETS_PROGRAMME']) {
    assert.ok(new RegExp(`\\b${nom}\\b`).test(ONGLETS), `« ${nom} » n’est plus employé`)
    assert.ok(
      new RegExp(`\\b${nom}\\b`).test(entete),
      `« ${nom} » est employé sans être importé : ReferenceError au rendu`
    )
  }

  // Même garde sur la page, qui a plus d'un nom à résoudre.
  const entetePAGE = PAGE.slice(0, PAGE.indexOf('\nexport '))
  for (const nom of [
    'EntetePage',
    'EtatBloque',
    'OngletsProgramme',
    'IconeEclair',
    'enregistrer',
    'lireReglages',
    'DEVISES',
    'TRANCHE',
    'formaterPointsParTranche',
    'pointsDepuisMontant',
    'symboleDevise',
    'pour',
    'localeRequete',
    'reglagesDuCommerce',
  ]) {
    assert.ok(new RegExp(`\\b${nom}\\b`).test(PAGE), `« ${nom} » n’est plus employé`)
    assert.ok(
      new RegExp(`\\b${nom}\\b`).test(entetePAGE),
      `« ${nom} » est employé par la page sans être importé`
    )
  }
})

