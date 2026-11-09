/* ============================================================================
   P0-3 — le plafond de 30 clients, du compteur au bandeau.

   Ce que ce fichier empêche :
     1. **un seuil recopié** — la limite vient de la base (`0012`) ; le module,
        le bandeau et la page ne doivent pas écrire `30` en dur ;
     2. **un état mal borné** — les quatre états sont testés **sur leurs
        frontières** (reste 6, 5, 1, 0), l'ordre des cas comptant : un commerce
        à 30 clients ne doit pas être classé « urgent » ;
     3. **un zéro inventé** — `lirePlafond` rend `null` sur une forme inconnue,
        et le bandeau ne rend rien plutôt qu'un faux compteur ;
     4. **un texte recopié à moitié** — chaque phrase est confrontée à son
        témoin dans les captures ;
     5. **un bouton d'activation simulé** — aucun paiement n'est branché ;
     6. **un onglet mort** — `ONGLETS_COMPTE` ne promet pas `/donnees-clients`.

   Aucun navigateur, aucune connexion : captures, sources, modules purs.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import {
  ETATS,
  PRIX_MOIS_MAD,
  PRIX_PLAQUE_MAD,
  SEUIL_ATTENTION,
  etatPlafond,
  lirePlafond,
  pourcentOffre,
} from '../../../web/src/lib/plafond.mjs'
import { ONGLETS_COMPTE, routesPromises } from '../../../web/src/lib/navigation.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const CAPTURES = join('01_REA_Fidelix', '_captures')
const BANDEAU = lire(CAPTURES, '2026-11-02-a7', 'rendu', 'c01-settings.html')
const FACTURE = lire(CAPTURES, '2026-11-02-a7', 'rendu', 'c02-billing.html')
const ACCUEIL = lire(CAPTURES, '2026-10-26', 'raw', 'pages', 'p01-home.html')
const DICT_PAGE = lire(
  CAPTURES,
  '2026-11-02-a6',
  'raw',
  'assets',
  '_next_static_chunks_9990-950efab9e0d04bcf.js'
)
const DICT_BANDEAU = lire(
  CAPTURES,
  '2026-11-02-a6',
  'raw',
  'assets',
  '_next_static_chunks_app__dashboard__layout-c7e219b106ba4f9e.js'
)

const PAGE = lire('web', 'src', 'app', '(dashboard)', 'billing', 'page.jsx')
const LAYOUT = lire('web', 'src', 'app', '(dashboard)', 'layout.jsx')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

const FR = dictionnaire('fr')

/** Les bundles sont du JavaScript minifié : les accents y sont des `\xNN`. */
const dechiffre = (js) =>
  js.replace(/\\x([0-9a-fA-F]{2})/g, (entier, hex) => String.fromCharCode(parseInt(hex, 16)))

const DICT_PAGE_LISIBLE = dechiffre(DICT_PAGE).replace(/\\'/g, "'")
const DICT_BANDEAU_LISIBLE = dechiffre(DICT_BANDEAU).replace(/\\'/g, "'")

/** L'apostrophe est une typographie, pas une mesure (cf. `fiche-etablissement`). */
const plat = (texte) => String(texte).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()

/** Rend un gabarit du dictionnaire, comme `traduire()`. */
const rendu = (cle, variables) =>
  plat(
    FR[cle].replace(/\{(\w+)\}/g, (entier, nom) =>
      Object.hasOwn(variables ?? {}, nom) ? String(variables[nom]) : entier
    )
  )

/* ---------------------------------------------------------------------------
   1. Les témoins — la mesure est toujours là, et c'est elle qui décide
   ------------------------------------------------------------------------ */

test('capture — la règle de comptage est dans les captures', () => {
  // « vous ne payez que le jour où votre 30e client s'inscrit » : l'événement
  // compté est l'inscription, pas la visite.
  assert.ok(ACCUEIL.includes('votre 30e client'), 'la règle de paiement a disparu de l’accueil')
  // …et le seuil y est un **paramètre**, pas un nombre écrit trois fois.
  assert.ok(ACCUEIL.includes('gratuit_sous'), 'le gabarit `{limite}` de l’accueil a disparu')
  // Le nom du compteur, sur la page de facturation.
  assert.ok(
    FACTURE.includes("aria-label=\"Clients inscrits sur l'offre gratuite\""),
    'l’`aria-label` du compteur a disparu de `/billing`'
  )
  // La nature du chiffre, dans le bandeau de tous les écrans.
  assert.ok(BANDEAU.includes("clients sur 30 dans l'offre gratuite"))
  assert.ok(BANDEAU.includes('aria-valuemax="30"'), 'le plafond du bandeau a disparu')
  // Ce que le plafond atteint dit des clients.
  assert.ok(DICT_PAGE_LISIBLE.includes('clients ont déjà leur carte'))
  // Et les quatre états du bandeau.
  for (const cle of ['msgCalme', 'msgAttention', 'msgUrgent']) {
    assert.ok(DICT_BANDEAU.includes(cle), `état absent du bundle du bandeau : ${cle}`)
  }
})

test('capture — les deux prix sont ceux de la page de facturation', () => {
  assert.equal(PRIX_MOIS_MAD, 397, 'prix mensuel mesuré')
  assert.equal(PRIX_PLAQUE_MAD, 150, 'prix de la plaque NFC mesuré')
  assert.ok(plat(FACTURE).includes(`>${PRIX_MOIS_MAD}<!-- --> <!-- -->MAD`))
  assert.ok(plat(FACTURE).includes(`${PRIX_PLAQUE_MAD} MAD`))
})

/* ---------------------------------------------------------------------------
   2. Le module pur — les frontières, une par une
   ------------------------------------------------------------------------ */

test('etat — les quatre états, et leurs frontières exactes', () => {
  assert.equal(SEUIL_ATTENTION, 5, 'seuil d’avertissement (choix déclaré)')
  assert.equal(etatPlafond(0, 30), 'large')
  assert.equal(etatPlafond(24, 30), 'large', 'reste 6 : encore tranquille')
  assert.equal(etatPlafond(25, 30), 'attention', 'reste 5 : premier cran')
  assert.equal(etatPlafond(28, 30), 'attention')
  assert.equal(etatPlafond(29, 30), 'urgent', 'reste 1 : la prochaine inscription ferme')
  assert.equal(etatPlafond(30, 30), 'atteint', 'le plafond lui-même est atteint')
  assert.equal(etatPlafond(31, 30), 'atteint', 'au-delà, on ne redescend pas d’état')
  // L'ordre des cas compte : sans `atteint` en premier, 30 sortirait « urgent ».
  assert.notEqual(etatPlafond(30, 30), 'urgent')
  assert.deepEqual([...ETATS], ['large', 'attention', 'urgent', 'atteint'])
})

test('jauge — un pourcentage entier, borné, jamais négatif', () => {
  assert.equal(pourcentOffre(1, 30), 3, 'ce que la cible écrit en `width:3%`')
  assert.equal(pourcentOffre(30, 30), 100)
  assert.equal(pourcentOffre(45, 30), 100, 'au-delà du plafond, la barre reste pleine')
  assert.equal(pourcentOffre(0, 30), 0)
  assert.equal(pourcentOffre(5, 0), 0, 'une limite nulle ne divise pas par zéro')
  assert.equal(pourcentOffre(-1, 30), 0)
  assert.equal(pourcentOffre(1.5, 30), 0, 'un compte fractionnaire n’existe pas')
  assert.equal(pourcentOffre('1', 30), 0, 'une chaîne n’est pas un compte')
})

test('lecture — une forme inconnue rend `null`, jamais des zéros', () => {
  for (const mauvais of [
    null,
    undefined,
    'ok',
    42,
    {},
    { clients: 1 },
    { limite: 30 },
    { clients: 1, limite: 0 },
    { clients: -1, limite: 30 },
    { clients: '1', limite: 30 },
    { clients: 1.5, limite: 30 },
  ]) {
    assert.equal(lirePlafond(mauvais), null, `forme acceptée à tort : ${JSON.stringify(mauvais)}`)
  }

  assert.deepEqual(lirePlafond({ clients: 1, limite: 30 }), {
    clients: 1,
    limite: 30,
    reste: 29,
    pourcent: 3,
    etat: 'large',
  })
  // Le `reste` ne passe jamais sous zéro, même si la base rend un dépassement.
  assert.equal(lirePlafond({ clients: 34, limite: 30 }).reste, 0)
})

test('lecture — la limite vient de la réponse, pas d’une constante du module', () => {
  // Un commerce doté d'un autre plafond doit être lu avec **son** plafond : le
  // jour où la limite devient une colonne, rien ici ne doit changer.
  const autre = lirePlafond({ clients: 10, limite: 20 })
  assert.equal(autre.limite, 20)
  assert.equal(autre.etat, 'large', 'reste 10 : au-delà du seuil d’avertissement')
  assert.equal(autre.pourcent, 50)
})

/* ---------------------------------------------------------------------------
   3. Les textes — le dictionnaire dit ce que la cible dit
   ------------------------------------------------------------------------ */

test('textes — le bandeau reprend les quatre phrases mesurées', () => {
  const calme = rendu('offre.msgCalme', { limite: 30 })
  assert.ok(plat(BANDEAU).includes(calme), `phrase absente de la capture : « ${calme} »`)

  const jauge = rendu('offre.ariaJauge', { clients: 1, limite: 30 })
  assert.ok(
    plat(BANDEAU).includes(jauge),
    `libellé de jauge absent de la capture : « ${jauge} »`
  )

  const atteint = rendu('offre.msgAtteint', { clients: 3 })
  // Le bundle interpole le nombre (`"".concat(e," clients ont déjà…")`) : on
  // compare donc le corps de la phrase, nombre retiré.
  assert.ok(
    DICT_PAGE_LISIBLE.includes(atteint.replace(/^3 /, '')),
    `phrase de plafond atteint divergente : « ${atteint} »`
  )

  // Les deux formes de l'urgence : la cible accorde « client » / « clients ».
  assert.match(rendu('offre.msgUrgentUn', { reste: 1, limite: 30 }), /^Plus que 1 client :/)
  assert.match(rendu('offre.msgUrgentPlusieurs', { reste: 2, limite: 30 }), /^Plus que 2 clients :/)
  assert.ok(DICT_BANDEAU_LISIBLE.includes("le scan s'arrête"), 'le mot « scan » a disparu de la cible')
})

test('textes — la progression de `/billing` est celle de la capture', () => {
  const progression = rendu('page.abonnement.progressionUn', { clients: 1, limite: 30 })
  assert.ok(
    plat(FACTURE).includes(progression),
    `progression absente de la capture : « ${progression} »`
  )
  for (const temoin of ['Votre abonnement', '397 MAD par point de vente', 'Une question avant de vous abonner ?']) {
    assert.ok(plat(FACTURE).includes(temoin), `témoin absent de la capture : « ${temoin} »`)
  }
})

test('textes — aucune phrase du bandeau n’écrit le seuil en dur', () => {
  // Le seuil est un paramètre (`{limite}`) : une phrase qui contiendrait « 30 »
  // en clair afficherait 30 pour un commerce dont le plafond a changé.
  for (const cle of ['offre.msgCalme', 'offre.msgUrgentUn', 'offre.msgUrgentPlusieurs', 'offre.surLimite']) {
    assert.equal(/\b30\b/.test(FR[cle]), false, `seuil écrit en dur dans « ${cle} »`)
    assert.ok(FR[cle].includes('{limite}'), `paramètre {limite} absent de « ${cle} »`)
  }
  // L'avertissement, lui, ne connaît que le reste — c'est ce que dit sa phrase.
  assert.ok(FR['offre.msgAttention'].includes('{reste}'))
})

/* ---------------------------------------------------------------------------
   4. Le raccordement — page, base, cache
   ------------------------------------------------------------------------ */

test('layout — le bandeau d’offre a quitté la coque', () => {
  // Retiré à la demande du produit : plus de bandeau sur les écrans du tableau
  // de bord, et donc plus de lecture du compteur à chaque navigation. `/billing`
  // reste la seule surface qui lise le plafond, pour lui-même.
  assert.equal(/<BandeauOffre/.test(LAYOUT), false, 'le bandeau est revenu dans la coque')
  assert.equal(
    /plafondDuCommerce\(\)/.test(LAYOUT),
    false,
    'la coque repaie un aller-retour Supabase pour un compteur qu’elle n’affiche plus'
  )
})

test('page — l’activation n’est pas simulée, et la migration est nommée', () => {
  assert.match(PAGE, /migrations\/0012_plafond_clients\.sql/, 'le fichier à exécuter n’est pas nommé')
  assert.match(PAGE, /page\.abonnement\.activationAbsente/)
  // Aucun bouton d'activation : il n'y a pas de paiement derrière. On lit le
  // **code**, pas l'en-tête — le commentaire cite « Activer — 397 MAD » pour
  // expliquer pourquoi il n'est pas rendu.
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ')
  assert.equal(/<button/.test(code), false, 'un bouton sans paiement a été ajouté')
  assert.equal(/Activer/.test(code), false, '« Activer » promet un débit inexistant')
  // Pas de faux zéro : le compteur absent passe par `EtatBloque`.
  assert.match(PAGE, /<EtatBloque/)
  assert.match(PAGE, /lecture\.etat === 'ok' \? lirePlafond/)
})

test('cache — seuls les états stables sont mémorisés', () => {
  assert.match(DONNEES, /plafondDuCommerce/)
  assert.match(
    DONNEES,
    /resultat\.etat === 'ok' \|\| resultat\.etat === 'nonMigre'/,
    'une panne mémorisée dix secondes se croirait à jour'
  )
})

/* Les gardes du SQL vivent dans `migration-0012.test.mjs` : un fichier par
   migration, comme `0003` → `0011`. Ce fichier-ci juge le module, le bandeau et
   la page. */

test('onglets — « Mon compte » ne promet pas la page qui n’existe pas', () => {
  assert.deepEqual(
    ONGLETS_COMPTE.map((onglet) => onglet.href),
    ['/settings', '/billing']
  )
  assert.equal(routesPromises().filter((href) => href === '/donnees-clients').length, 0)
  const promesses = routesPromises()
  assert.equal(new Set(promesses).size, promesses.length, 'route promise deux fois')
  assert.ok(promesses.includes('/billing'), '`/billing` n’est promis par aucune navigation')
})

