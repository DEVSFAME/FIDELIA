/* ============================================================================
   R3 — le choix de la caisse sur `/join/<slug>` (mesuré, puis `0009`)

   La dette était nommée ainsi dans `PROGRESS.md` : « `0007` sait recevoir
   `p_staff_id`, mais aucune page ne l'envoie donc « Cartes » vaudra 0, exactement.
   À mesurer avant d'être écrit. » Elle est mesurée, et la mesure dit **écrire** :

     `_captures/2026-10-26/raw/pages/p17-join.html`
     `_captures/2026-10-26/raw/assets/_next_static_chunks_app_join_%5Bslug%5D_page-*`

   Quatre maillons peuvent casser sans qu'aucun autre test ne le voie :

     1. **la copie**. « Qui vous a servi ? » et « (facultatif) » sont dans la
        capture. On les y cherche d'abord (témoin), puis on exige l'égalité du
        dictionnaire — jamais deux fois la même constante (§24.2) ;
     2. **la forme mesurée**. Groupe `role="group"` + `aria-labelledby`, boutons
        `aria-pressed`, sélection **défaisable**. Un `<select>` ou des radios
        seraient une autre interface sous le même mot ;
     3. **le champ disparaît quand la liste est vide** (`A.length>0 &&`) ;
     4. **la chaîne d'écriture** : la caisse part dans `p_staff_id`, et elle n'y
        part que si elle existe. Une caisse envoyée sans validation ferait lever
        `STAFF_NOT_FOUND` — donc une carte perdue pour un prénom.

   Deux règles de méthode, apprises ici même : les **commentaires sont retirés**
   avant tout jugement de forme (§37.6), et une **mesure qui passe au vert en ne
   lisant rien** est le défaut le plus dangereux (c'est arrivé deux fois sur ce
   fichier, cf. les deux tests corrigés ci-dessous).

   Ce que ce fichier ne juge pas : l'exécution en base (les appels RPC sont
   relus dans le source, jamais lancés) ni le rendu au pixel.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DICTIONNAIRES } from '../../../web/src/i18n/dictionnaires.mjs'
import {
  basculerCaisse,
  caisseChoisie,
  caisseDemandee,
  designationPerdue,
  lireCaissesPubliques,
  repriseSansCaisse,
} from '../../../web/src/lib/adhesion.mjs'

const fr = DICTIONNAIRES.fr

/* Les chemins sont résolus par `resolve`, **pas** par `new URL` : le nom du
   chunk porte `%5B`/`%5D` (crochets encodés par la capture), et `new URL` les
   décode en `[`/`]` — le fichier n'existe alors plus, et le test échoue sur un
   `ENOENT` qui ne dit rien de ce qu'il mesurait. */
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (relatif) => readFileSync(resolve(RACINE, relatif), 'utf8')

const CAPTURE = lire('01_REA_Fidelix/_captures/2026-10-26/raw/pages/p17-join.html')
const CHUNK = lire(
  '01_REA_Fidelix/_captures/2026-10-26/raw/assets/_next_static_chunks_app_join_%5Bslug%5D_page-5ffb58c0ed9fd59d.js'
)
const PAGE = lire('web/src/app/join/[slug]/page.jsx')
const ACTIONS = lire('web/src/app/join/[slug]/actions.js')
const COMPOSANT = lire('web/src/components/adhesion/ChoixCaisse.jsx')
const DONNEES = lire('web/src/lib/donnees.mjs')
const MIGRATION_0009 = lire('migrations/0009_caisses_publiques.sql')


/** Le code seul : un commentaire décrit l'intention, pas ce qui est écrit. */
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const normaliser = (texte) => String(texte).replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim()

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'

/* ---------------------------------------------------------------------------
   1. La copie : témoin dans la capture, puis égalité du dictionnaire
   ------------------------------------------------------------------------ */

const MESURES = {
  'page.adhesion.caisse': 'Qui vous a servi ?',
  'page.adhesion.caisseFacultatif': '(facultatif)',
}

test('caisse — les libellés existent d’abord dans la capture (témoin)', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.ok(
      CAPTURE.includes(valeur),
      `témoin manquant : « ${valeur} » (${cle}) n’est plus dans p17-join.html`
    )
  }
  // Le libellé est **lié** au groupe dans la cible : si l'identifiant disparaît,
  // c'est la structure mesurée qui a changé, pas la copie.
  assert.match(CAPTURE, /id="qui-vous-a-servi"/, "l'identifiant mesuré du libellé a disparu")
})

test('caisse — le dictionnaire porte exactement les libellés mesurés', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.equal(normaliser(fr[cle]), normaliser(valeur), `« ${cle} » ne porte plus le texte mesuré`)
  }
})

test('caisse — la phrase de désignation perdue est écrite, et ne promet aucun geste', () => {
  const phrase = fr['page.adhesion.sansDesignation']
  assert.ok(phrase, 'la perte d’une désignation ne se dit plus')
  // Il n'existe aucune fonction qui redésigne une carte après coup : promettre
  // un rattrapage au comptoir serait une promesse sans geste (§38).
  assert.equal(
    /comptoir|pourrez|plus tard/i.test(phrase),
    false,
    'la phrase promet un rattrapage qui n’existe pas'
  )
})

/* ---------------------------------------------------------------------------
   2. La lecture : ce que `caisses_publiques()` rend, et ce qu'on en refuse
   ------------------------------------------------------------------------ */


test('caisse — une liste conforme est rendue, prénom détouré et id normalisé', () => {
  const liste = lireCaissesPubliques({
    caisses: [
      { id: U1, prenom: '  Youssef ' },
      { id: U2.toUpperCase(), prenom: 'Salma' },
    ],
  })
  assert.deepEqual(liste, [
    { id: U1, prenom: 'Youssef' },
    { id: U2, prenom: 'Salma' },
  ])
})

test('caisse — une liste vide est un fait, une réponse illisible n’en est pas un', () => {
  // `[]` : aucune caisse active. La page n'affiche rien, mais c'est une réponse.
  assert.deepEqual(lireCaissesPubliques({ caisses: [] }), [])
  // `null` : on ne comprend pas la réponse. La page n'affiche rien non plus,
  // et c'est précisément pourquoi les deux ne doivent pas être confondus.
  for (const illisible of [null, undefined, 'x', {}, { caisses: null }, { caisses: 'x' }]) {
    assert.equal(lireCaissesPubliques(illisible), null, `« ${JSON.stringify(illisible)} » passe`)
  }
})

test('caisse — une entrée inutilisable fait refuser toute la liste', () => {
  const mauvaises = [
    { id: U1, prenom: '' },
    { id: U1, prenom: '   ' },
    { id: U1 },
    { id: 'pas-un-uuid', prenom: 'Youssef' },
    { prenom: 'Youssef' },
    { id: U1, prenom: 42 },
    null,
    'Youssef',
  ]
  for (const entree of mauvaises) {
    assert.equal(
      lireCaissesPubliques({ caisses: [{ id: U2, prenom: 'Salma' }, entree] }),
      null,
      `« ${JSON.stringify(entree)} » passerait : bouton sans nom, ou sans caisse`
    )
  }
})

test('caisse — deux boutons pour la même caisse sont refusés', () => {
  // Une clé de liste dupliquée, et un clic qui désignerait deux choses.
  assert.equal(
    lireCaissesPubliques({
      caisses: [
        { id: U1, prenom: 'Youssef' },
        { id: U1.toUpperCase(), prenom: 'Youssef' },
      ],
    }),
    null
  )
})

/* ---------------------------------------------------------------------------
   3. La bascule — unique, et réversible (mesuré : `void 0`)
   ------------------------------------------------------------------------ */

test('caisse — un clic choisit, un second clic défait', () => {
  assert.equal(basculerCaisse(null, U1), U1, 'le premier clic ne choisit rien')
  assert.equal(basculerCaisse(U1, U2), U2, 'un autre clic ne déplace pas le choix')
  assert.equal(basculerCaisse(U1, U1), null, 'recliquer ne défait pas le choix')
  assert.equal(basculerCaisse(null, undefined), null, 'une puce sans identifiant choisit quelque chose')
})

/* ---------------------------------------------------------------------------
   4. La validation : « une caisse proposée est une caisse acceptée »
   ------------------------------------------------------------------------ */

test('caisse — un identifiant demandé n’est retenu que s’il était affiché', () => {
  const liste = [
    { id: U1, prenom: 'Youssef' },
    { id: U2, prenom: 'Salma' },
  ]

  assert.equal(caisseChoisie(liste, U1), U1, 'une caisse affichée n’est plus acceptée')
  assert.equal(caisseChoisie(liste, U1.toUpperCase()), U1, 'la casse de l’uuid bloque le choix')

  // Falsification du formulaire, ou caisse supprimée depuis l'affichage.
  assert.equal(caisseChoisie(liste, U3), null, 'une caisse jamais affichée est envoyée')
  assert.equal(caisseChoisie([], U1), null, 'une liste vide accepte quand même une caisse')
  assert.equal(caisseChoisie(null, U1), null, 'une réponse illisible accepte une caisse')
})

test('caisse — un champ vide ou altéré ne devient pas un identifiant', () => {
  for (const valeur of ['', '   ', null, undefined, 'pas-un-uuid', 42]) {
    assert.equal(
      caisseDemandee(valeur),
      null,
      `« ${JSON.stringify(valeur)} » devient un identifiant envoyé à la fonction`
    )
  }
  assert.equal(caisseDemandee(` ${U1} `), U1, 'un uuid entouré d’espaces est refusé')
})

test('caisse — une désignation demandée et non retenue se dit', () => {
  assert.equal(designationPerdue(U1, null), true, 'la perte d’un choix explicite n’est plus signalée')
  assert.equal(designationPerdue(U1, U1), false, 'une désignation retenue est annoncée perdue')
  assert.equal(designationPerdue(null, null), false, 'ne rien demander devient une perte')
})

test('caisse — seule `STAFF_NOT_FOUND` justifie de rejouer sans la caisse', () => {
  assert.equal(repriseSansCaisse({ etat: 'refuse', code: 'STAFF_NOT_FOUND' }), true)
  // Un autre refus se rejouerait pour échouer pareil — et l'écran afficherait

/* ---------------------------------------------------------------------------
   5. Le DOM mesuré : un groupe de boutons, pas un menu déroulant
   ------------------------------------------------------------------------ */

test('caisse — le chunk de la cible porte le groupe tel qu’on le reproduit (témoin)', () => {
  // Sans ce témoin, les classes et le rôle ci-dessous pourraient être deux
  // inventions cohérentes entre elles et fausses ensemble.
  assert.match(CHUNK, /role:"group","aria-labelledby":"qui-vous-a-servi"/, 'le groupe mesuré a disparu')
  assert.match(CHUNK, /"aria-pressed":O===e\.id/, 'l’état pressé mesuré a disparu')
  assert.match(CHUNK, /A\.length>0&&/, 'le rendu conditionnel mesuré a disparu')
  assert.match(CHUNK, /border-coral bg-coral text-white/, 'la classe « choisi » mesurée a disparu')
  assert.match(
    CHUNK,
    /border-ink\/10 bg-white text-ink hover:border-coral\/40/,
    'la classe « libre » mesurée a disparu'
  )
})

test('caisse — le composant reproduit le groupe, la bascule et le champ caché', () => {
  const code = sansCommentaires(COMPOSANT)

  assert.match(code, /role="group"/, 'le groupe n’est plus annoncé comme un groupe')
  assert.match(code, /aria-labelledby="qui-vous-a-servi"/, 'le groupe n’est plus nommé par son libellé')
  assert.match(code, /id="qui-vous-a-servi"/, 'le libellé a perdu l’identifiant mesuré')
  assert.match(code, /aria-pressed=\{choisie === caisse\.id\}/, 'l’état choisi n’est plus annoncé')
  assert.match(
    code,
    /setChoisie\(basculerCaisse\(choisie, caisse\.id\)\)/,
    'la bascule mesurée n’est plus utilisée : la sélection ne se défait plus'
  )
  assert.match(code, /name="caisse"/, 'la valeur ne part plus dans le formulaire')

  // La cible n'a **pas** de `<select>` : en ajouter un serait une autre
  // interface sous le même libellé, et personne ne verrait le changement.
  assert.equal(/<select/.test(code), false, 'un menu déroulant a remplacé le groupe mesuré')

  // Les trois classes de la capture, à la lettre.
  assert.match(code, /min-h-11 rounded-xl border-2 px-3\.5 text-sm font-semibold transition-colors/)
  assert.match(code, /border-coral bg-coral text-white/)
  assert.match(code, /border-ink\/10 bg-white text-ink hover:border-coral\/40/)
})

  // une panne après un second appel inutile.
  assert.equal(repriseSansCaisse({ etat: 'refuse', code: 'PROGRAM_NOT_FOUND' }), false)
  assert.equal(repriseSansCaisse({ etat: 'indisponible', code: 'PGRST202' }), false)
  assert.equal(repriseSansCaisse({ etat: 'ok', code: null }), false)
  assert.equal(repriseSansCaisse(null), false)
})


/* ---------------------------------------------------------------------------
   6. La page : lu seulement quand c'est utile, rendu seulement s'il y a à choisir
   ------------------------------------------------------------------------ */

test('page — la liste n’est lue que si le code n’est pas déjà affiché', () => {
  const code = sansCommentaires(PAGE)
  assert.match(
    code,
    /const lectureCaisses = code === null \? await caissesPubliques\(slug\) : null/,
    'la liste est lue même sur la page qui affiche déjà la carte'
  )
})

test('page — le champ n’est rendu que si la liste n’est pas vide', () => {
  const code = sansCommentaires(PAGE)
  assert.match(
    code,
    /const proposerCaisses = Array\.isArray\(caisses\) && caisses\.length > 0/,
    'la condition de rendu a disparu : un groupe vide serait affiché'
  )
  assert.match(
    code,
    /\{proposerCaisses \? <ChoixCaisse caisses=\{caisses\} locale=\{locale\} \/> : null\}/,
    'le composant n’est plus conditionné par la liste'
  )
})

test('page — la perte d’une désignation a un rendu, à côté du code', () => {
  const code = sansCommentaires(PAGE)
  assert.match(code, /sansDesignation === '1'/, 'le paramètre de succès n’a pas de branche')
  assert.match(
    code,
    /t\('page\.adhesion\.sansDesignation'\)/,
    'la phrase n’est plus rendue : la perte serait silencieuse'
  )
})

/* ---------------------------------------------------------------------------
   7. La chaîne d'écriture : de la puce jusqu'à `p_staff_id`
   ------------------------------------------------------------------------ */

test('caisse — `caisses_publiques` est appelée avec le slug, et rien d’autre', () => {
  const code = sansCommentaires(DONNEES)
  assert.match(
    code,
    /rpc\('caisses_publiques', \{ p_slug: String\(slug\) \}\)/,
    'la lecture publique n’appelle plus la fonction de `0009`'
  )
  // Le nom de la fonction existe côté SQL : un renommage d'un seul côté rendrait
  // `nonMigre` — un écran sans champ, et « Cartes » à 0, sans un mot.
  assert.match(
    MIGRATION_0009,
    /function public\.caisses_publiques\(p_slug varchar/,
    'la fonction de `0009` a changé de nom ou d’argument'
  )
})

test('caisse — `p_staff_id` ne part que s’il y a une caisse à désigner', () => {
  const code = sansCommentaires(DONNEES)
  assert.match(
    code,
    /if \(caisse\) args\.p_staff_id = caisse/,
    '`p_staff_id` doit être omis quand aucune caisse n’est choisie (défaut de la fonction)'
  )
  assert.match(
    code,
    /export async function rejoindre\(slug, caisse = null\)/,
    'la signature de `rejoindre` ne transporte plus la caisse'
  )
})

test('caisse — `STAFF_NOT_FOUND` est un refus, pas une panne', () => {
  const code = sansCommentaires(DONNEES)
  assert.ok(
    code.includes("'STAFF_NOT_FOUND'"),
    'le refus de `0007` retombe dans `indisponible` : une panne affichée pour un refus'
  )
})

test('actions — la caisse est validée avant d’être envoyée, et la perte est dite', () => {
  const code = sansCommentaires(ACTIONS)

  assert.match(
    code,
    /caisseDemandee\(donnees\.get\('caisse'\)\)/,
    'le champ n’est plus lu dans le formulaire'
  )
  assert.match(
    code,
    /lireCaissesPubliques\(\(await caissesPubliques\(slug\)\)\.donnees\)/,
    'la liste n’est plus relue : une caisse supprimée serait envoyée telle quelle'
  )
  assert.match(
    code,
    /const choisie = caisseChoisie\(liste, demandee\)/,
    'l’identifiant n’est plus confronté à la liste affichée'
  )
  assert.match(
    code,
    /rejoindreProgramme\(slug, choisie\)/,
    'la caisse n’est plus transmise à l’inscription'
  )
  assert.match(
    code,
    /if \(repriseSansCaisse\(resultat\)\) \{[\s\S]*?rejoindreProgramme\(slug\)/,
    'une caisse disparue ferait perdre la carte au client'
  )
  assert.match(code, /sansDesignation=1/, 'la désignation perdue n’est plus déclarée')
})

