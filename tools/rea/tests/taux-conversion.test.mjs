/* ============================================================================
   Le taux de conversion, de l'écran jusqu'à la base — et le retour.

   `migration-0008.test.mjs` juge le SQL, `modules.test.mjs` juge les règles
   pures. Ce fichier juge le **raccordement**, c'est-à-dire l'endroit où les trois
   morceaux peuvent se désaligner sans qu'aucun test unitaire ne bronche :

     1. un champ `credits` ajouté à l'écran mais pas lu par l'action (ou
        l'inverse) : le réglage s'affiche, s'enregistre… sans effet ;
     2. un `p_credits_par_euro` envoyé à `null` : PostgREST distingue
        l'absence de `null`, et `null` ferait échouer la contrainte `not null`
        ou écraserait le taux existant ;
     3. un refus `?etat=credits` que la page ne rend pas : le commerçant croit
        avoir enregistré ;
     4. un symbole monétaire écrit en dur dans un écran : la devise est une
        donnée, le symbole un rendu ;
     5. une caisse qui n'affiche qu'une récompense à la fois, ou qui cache les
        paliers hors de portée.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const PROGRAMME = lire('web', 'src', 'app', '(dashboard)', 'rewards', 'page.jsx')
const PROGRAMME_ACTION = lire('web', 'src', 'app', '(dashboard)', 'rewards', 'actions.js')
const CAISSE = lire('web', 'src', 'app', '(dashboard)', 'caisse', 'page.jsx')
const CAISSE_ACTION = lire('web', 'src', 'app', '(dashboard)', 'caisse', 'actions.js')
const SCAN_ACTION = lire('web', 'src', 'app', '(dashboard)', 'scan', 'actions.js')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

const FR = dictionnaire('fr')

/** Retire les commentaires JSX et `//` : la prose cite `<select>`, ce n'est pas du code. */
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/** Les clés `t('…')` réellement appelées par un écran. */
const cles = (source) => [
  ...new Set([...source.matchAll(/\bt\('([a-z0-9_.]+)'/gi)].map((m) => m[1])),
]

test('taux — l’écran Programme a un champ `credits`, et l’action le lit', () => {
  assert.match(PROGRAMME, /name="credits"/, 'aucun champ `credits` : la valeur ne part jamais')
  assert.match(PROGRAMME, /type="number"/)
  assert.match(PROGRAMME, /step="0\.01"/, 'deux décimales, comme la colonne')
  assert.match(PROGRAMME, /min="0\.01"/, 'le zéro n’est pas un taux')
  assert.match(PROGRAMME, /max="1000"/, 'la borne haute de la fonction SQL')
  assert.match(PROGRAMME, /required/, 'un champ vidé doit être refusé par le navigateur d’abord')

  assert.match(
    PROGRAMME_ACTION,
    /donnees\.get\('credits'\)/,
    'l’action ne lit pas le champ : le taux n’est jamais transmis'
  )
  assert.match(PROGRAMME_ACTION, /creditsParEuroValide\(creditsParEuro\)/)
  assert.match(
    PROGRAMME_ACTION,
    /redirect\('\/rewards\?etat=credits'\)/,
    'un taux invalide doit revenir sur l’écran avec un refus'
  )
  assert.match(PROGRAMME_ACTION, /\bcreditsParEuro,/, 'le taux n’est pas passé à `enregistrerProgramme`')
})


test('taux — `p_credits_par_euro` n’est omis que s’il n’existe pas, jamais `null`', () => {
  // PostgREST voit la différence entre un paramètre absent et un `null` : absent,
  // c'est le `default 1` de la fonction qui s'applique ; `null`, c'est un refus
  // de la contrainte `not null` — ou un taux écrasé sans le dire.
  assert.match(
    DONNEES,
    /if \(typeof creditsParEuro === 'number' && Number\.isFinite\(creditsParEuro\)\)/,
    'le garde d’envoi a changé : `NaN` ou `null` peuvent partir vers la base'
  )
  assert.match(DONNEES, /args\.p_credits_par_euro = creditsParEuro/)
})

test('taux — l’exemple affiché est calculé, pas recopié', () => {
  // L'aide dit « 10 € rapportent N points ». Si N était écrit en dur, il
  // contredirait le taux dès le premier enregistrement.
  assert.match(PROGRAMME, /pointsDepuisMontant\(exemple, taux\)/, 'l’exemple ne suit plus le taux')
  assert.match(PROGRAMME, /formaterMontant\(exemple, devise\)/, 'le montant doit suivre la devise')
  assert.match(
    PROGRAMME,
    /defaultValue=\{formaterTaux\(taux\) \|\| '1'\}/,
    'le champ doit afficher le taux enregistré, et `1` seulement s’il est illisible'
  )

  // Le symbole monétaire est un **rendu** : un « € » dans l'écran afficherait
  // un euro sur un programme en dirhams.
  assert.equal(PROGRAMME.includes('€'), false, 'un « € » écrit en dur dans /rewards')
})

test('taux — le refus `credits` est rendu, et son texte existe', () => {
  assert.match(
    PROGRAMME,
    /credits: 'page\.programme\.erreur\.credits'/,
    'le refus `?etat=credits` n’a pas de message'
  )
  assert.match(
    PROGRAMME,
    /etat === 'credits'/,
    'la page ne rend pas l’état `credits` : le refus serait silencieux'
  )

  for (const cle of cles(PROGRAMME)) {
    assert.equal(typeof FR[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }

test('caisse — tous les paliers sont montrés, y compris ceux hors de portée', () => {
  // Le `<select>` d'avant n'affichait qu'une ligne : le commerçant ne comparait
  // jamais les prix. On vérifie que la boucle parcourt `paliers`, pas `offrables`.
  assert.match(CAISSE, /\{paliers\.map\(/, 'la liste ne parcourt plus tous les paliers')
  assert.equal(
    /\{offrables\.map\(/.test(CAISSE),
    false,
    'seuls les paliers atteignables sont rendus : les autres deviennent invisibles'
  )
  assert.match(CAISSE, /disabled=\{!dispo\}/, 'un palier hors de portée reste sélectionnable')
  assert.match(
    CAISSE,
    /t\('page\.caisse\.manque', \{ n: palier\.cout - lisible\.points \}\)/,
    'un palier hors de portée doit dire combien il manque'
  )
  assert.match(
    CAISSE,
    /defaultChecked=\{dispo && palier\.cout === offrables\[0\]\.cout\}/,
    'le pré-cochage doit tomber sur le premier palier **atteignable**, pas le premier de la liste'
  )

  // Un `<select>` n'a pas de `<fieldset>` : c'est la forme qui a changé, pas
  // seulement le style. La présence des deux signalerait un demi-retour arrière
  // (le commentaire d'en-tête cite l'ancien `<select>`, on lit le code seul).
  assert.match(CAISSE, /<fieldset className="uc-choix-grille">/)
  assert.equal(
    sansCommentaires(CAISSE).includes('<select'),
    false,
    'un `<select>` subsiste dans /caisse'
  )
})

test('caisse — le coût envoyé est un nombre, l’intitulé est relu côté serveur', () => {
  // Le champ caché ne porte que le jeton ; le prix est le `value` du radio, et
  // l'action le convertit. Un `libelle` posté serait modifiable.
  assert.match(CAISSE, /<input type="hidden" name="jeton" value=\{lisible\.card_token\} \/>/)
  assert.match(CAISSE, /name="cout"[\s\S]{0,80}value=\{palier\.cout\}/)
  assert.equal(
    /name="libelle"/.test(CAISSE),
    false,
    'l’intitulé ne doit pas venir du formulaire'
  )
  assert.match(CAISSE_ACTION, /Number\(donnees\.get\('cout'\)\)/, 'l’action ne lit plus le coût')
})

test('scan — les points laissés vides sont calculés par le barème, `0` reste `0`', () => {
  // `Number('')` vaut `0` : sans la distinction sur la **chaîne**, un champ vide
  // créditerait zéro point au lieu d'appliquer le taux.
  assert.match(SCAN_ACTION, /const pointsSaisis = String\(donnees\.get\('points'\) \?\? ''\)\.trim\(\)/)
  assert.match(SCAN_ACTION, /if \(pointsSaisis === ''\) \{/, 'le cas « vide » n’est plus séparé')
  assert.match(SCAN_ACTION, /pointsDepuisMontant\(montant, /, 'le barème n’est pas appliqué')
  // Le chemin qui **écrit** ne lit jamais la mémoire courte (`lib/cache.mjs`) :
  // un barème périmé de dix secondes créditerait le mauvais nombre de points,
  // et le commerçant ne pourrait pas le voir.
  assert.match(
    SCAN_ACTION,
    /programmeDuCommerce\(\{ frais: true \}\)/,
    'la caisse lit le barème mémorisé : elle pourrait créditer une valeur périmée'
  )
  assert.equal(
    /programmeDuCommerce\(\{ frais: false \}\)/.test(SCAN_ACTION),
    false,
    'le chemin d’écriture demande explicitement la valeur en cache'
  )

  // Le champ n'est plus `required` : c'est la condition pour que « vide » existe.
  const page = lire('web', 'src', 'app', '(dashboard)', 'scan', 'page.jsx')
  const champPoints = page.match(/name="points"[\s\S]{0,400}?\/>/)
  assert.ok(champPoints, 'le champ `points` a disparu de /scan')
  assert.equal(/\brequired\b/.test(champPoints[0]), false, 'un champ requis n’a pas d’état « vide »')
  assert.match(champPoints[0], /placeholder=\{t\('page\.scanner\.pointsAuto'\)\}/)
})

  for (const cle of cles(CAISSE)) {
    assert.equal(typeof FR[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }
  assert.equal(typeof FR['page.scanner.taux'], 'string')
  assert.equal(typeof FR['page.scanner.pointsAuto'], 'string')
})
