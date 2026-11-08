/* ============================================================================
   R1 — l'aperçu de développement ne doit pas devenir une porte dérobée.

   Contexte : la base de reconstruction ne contient aucun compte
   (`/auth/v1/admin/users` → `users: []`), donc `login → dashboard` n'est pas
   parcourable à l'œil avant R2. On a donc ajouté `/apercu`, qui rend la **même**
   coque et le **même** contenu sans session.

   Trois choses peuvent casser sans qu'on le voie, et aucune n'est visible à
   l'écran :

     1. l'aperçu survit en production (`notFound()` retiré) → le tableau de bord
        devient public ;
     2. la garde de `/dashboard` s'affaiblit au passage (le déplacement du
        matériau dans `CoqueTableau` touche ce fichier) ;
     3. le contenu est recopié au lieu d'être partagé → l'aperçu et le vrai
        tableau de bord divergent, et l'aperçu ne prouve plus rien.

   Le test lit les sources : c'est le seul moyen de vérifier une décision de
   structure sans navigateur ni serveur.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')

const APERCU_LAYOUT = ['app', '(apercu)', 'layout.jsx']
const APERCU_PAGE = ['app', '(apercu)', 'apercu', 'page.jsx']
/* La garde a quitté `dashboard/layout.jsx` : un layout de **segment** ne
   couvrait que `/dashboard`, et les neuf autres écrans du groupe répondaient
   200 sans session (mesuré). Elle vit désormais dans le layout du **groupe**,
   qui les couvre tous. Le test suit le déplacement — et le durcit : il vérifie
   aussi que ce layout couvre réellement plusieurs pages. */
const DASH_LAYOUT = ['app', '(dashboard)', 'layout.jsx']
const DASH_PAGE = ['app', '(dashboard)', 'dashboard', 'page.jsx']

test('aperçu — le layout rend la coque partagée, pas une copie', () => {
  const source = lire(...APERCU_LAYOUT)
  assert.match(source, /from '@\/components\/tableau\/CoqueTableau'/)
  assert.match(source, /<CoqueTableau\b/)
})

test('aperçu — il n’existe pas en production (notFound avant tout rendu)', () => {
  const source = lire(...APERCU_LAYOUT)
  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /notFound\(\)/)

  // L'ordre compte : un `notFound()` placé après le rendu ne rend rien.
  assert.ok(
    source.indexOf('notFound()') < source.indexOf('<CoqueTableau'),
    'notFound() doit précéder le rendu de la coque'
  )

  // Le drapeau d'aperçu est une **exception explicite**, jamais un défaut : sans
  // `FIDELIX_APERCU=1`, la condition reste celle de la production.
  assert.match(source, /FIDELIX_APERCU !== '1'/, 'le drapeau d’aperçu doit être fermé par défaut')
})

test('aperçu — il ne lit aucune session (sinon il doublerait la garde)', () => {
  const source = lire(...APERCU_LAYOUT) + lire(...APERCU_PAGE)
  assert.doesNotMatch(source, /clientServeur/)
  assert.doesNotMatch(source, /getUser/)
})

test('/dashboard — la garde serveur est intacte après extraction de la coque', () => {
  const source = lire(...DASH_LAYOUT)
  assert.match(source, /clientServeur\(\)/)
  assert.match(source, /supabase\.auth\.getUser\(\)/)
  assert.match(source, /if \(!utilisateur\) redirect\('\/login'\)/)
  // Le matériau a été déplacé : la garde, elle, doit rester dans ce fichier.
  assert.match(source, /<CoqueTableau\b/)
})

test('contenu du tableau de bord — une seule source pour les deux rendus', () => {
  for (const page of [DASH_PAGE, APERCU_PAGE]) {
    const source = lire(...page)
    assert.match(
      source,
      /from '@\/components\/tableau\/ContenuTableau'/,
      `${page.join('/')} doit importer ContenuTableau`
    )
    // Aucun balisage de matériau recopié : une copie passerait ce test sans le
    // composant, et divergerait au premier changement.
    assert.doesNotMatch(source, /<Surface\b/, `${page.join('/')} recopie le contenu`)
    assert.doesNotMatch(source, /font-impact/, `${page.join('/')} recopie la mise en page`)
  }
})

test('contenu du tableau de bord — le composant partagé existe et porte les quatre indicateurs mesurés', () => {
  assert.ok(existsSync(join(RACINE, 'web', 'src', 'components', 'tableau', 'ContenuTableau.jsx')))
  const source = lire('components', 'tableau', 'ContenuTableau.jsx')
  // R2 avait trois indicateurs **écrits** (« Clients inscrits », « Visites ce
  // mois », « Récompenses remises »), affichés « — » faute de lecture.
  // Depuis `0005`, la liste est celle de la capture authentifiée de
  // `/dashboard` : Clients, Visites, Reviennent, CA (€). Le test garde ce qu'il
  // gardait — la liste est **lue**, pas des traductions recopiées — avec les
  // clés que la mesure a fixées.
  const declaration = source.match(/const INDICATEURS = \[([^\]]*)\]/)
  assert.ok(declaration, 'la liste INDICATEURS doit exister')
  for (const cle of ['clients', 'visites', 'reviennent', 'ca']) {
    assert.ok(declaration[1].includes(`'${cle}'`), `indicateur manquant : ${cle}`)
  }
  assert.match(source, /INDICATEURS\.map\(/)
})

test('/dashboard — la garde couvre tous les écrans du groupe, pas un seul segment', () => {
  // La leçon du déplacement : un `layout.jsx` ne s'applique qu'à son segment.
  // La garde doit donc rester dans `(dashboard)/layout.jsx`, et aucune copie
  // segmentaire ne doit réapparaître — elle ne protégerait qu'une page tout en
  // donnant l'illusion que l'espace est gardé.
  assert.equal(
    existsSync(join(RACINE, 'web', 'src', 'app', '(dashboard)', 'dashboard', 'layout.jsx')),
    false,
    'une garde de segment a réapparu : elle ne couvrirait que /dashboard'
  )

  const groupe = join(RACINE, 'web', 'src', 'app', '(dashboard)')
  const pages = readdirSync(groupe, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .filter((entree) => existsSync(join(groupe, entree.name, 'page.jsx')))
    .map((entree) => entree.name)

  // Neuf écrans en plus de l'accueil : c'est la navigation qui le dit, et la
  // navigation est elle-même vérifiée (`navigation.test.mjs`).
  assert.ok(pages.length >= 9, `écrans du groupe : ${pages.length}`)
  assert.match(lire(...DASH_LAYOUT), /<CoqueTableau\b/)
})
