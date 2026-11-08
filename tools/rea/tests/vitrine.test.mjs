/* ============================================================================
   Garde sur `/recompenses/<slug>` — la vitrine publique des paliers.

   Une page JSX ne se teste pas ici (pas de `next build`, cf. dette nommée :
   le `node` du PATH est Electron). Ce qui se vérifie **par lecture**, et qui
   casse silencieusement quand on l'oublie :

     1. une **seconde RPC** de lecture pour la même donnée — donc une seconde
        surface à durcir, alors que `programme_public` est déjà accordée à
        `anon` dans `0003` ;
     2. une lecture **de table** en direct — elle rendrait `[]` sous RLS, donc
        « pas de programme », un mensonge que personne ne remarque ;
     3. le mapping **prénom / nom** recopié hors de `lib/personne.mjs` ;
     4. un slug inconnu traité comme une panne au lieu d'un 404 ;
     5. un lien d'adhésion qui ne serait plus celui que le **QR encode**.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { traduire } from '../../../web/src/i18n/index.mjs'
import { urlAdhesion } from '../../../web/src/lib/qr.mjs'
import { prochainPalier } from '../../../web/src/lib/programme.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PAGE = join(RACINE, 'web', 'src', 'app', 'recompenses', '[slug]', 'page.jsx')

const SOURCE = existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : ''

/* Le **code** seul : la prose cite `programme_public`, `loyalty_programs` et
   « clients » pour expliquer ce qu'on évite — la confondre avec du code ferait
   échouer les gardes sur leurs propres commentaires. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((ligne) => ligne.replace(/\/\/.*$/, ''))
  .join('\n')

test('vitrine — la page existe et route bien /recompenses/[slug]', () => {
  assert.ok(existsSync(PAGE), `page absente : ${PAGE}`)
  assert.match(SOURCE, /await params/, 'les params de Next 16 sont asynchrones')
  assert.match(SOURCE, /generateMetadata/, 'le titre doit venir du programme, pas du gabarit')
})

test('vitrine — aucune seconde RPC : elle réutilise `programme_public`', () => {
  assert.match(
    CODE,
    /import\s*\{[^}]*\bprogrammePublic\b[^}]*\}\s*from\s*'@\/lib\/donnees\.mjs'/,
    'la lecture doit passer par `programmePublic` (donc `programme_public`, accordée à anon)'
  )

  // Un appel direct au client Supabase, ou un nom de RPC écrit à la main,
  // serait une fonction de plus à révoquer et à accorder.
  assert.doesNotMatch(CODE, /clientServeur|createClient|supabase/i, 'accès base direct')
  assert.doesNotMatch(CODE, /\brpc\s*\(/i, 'appel RPC brut')
  assert.doesNotMatch(CODE, /programme_public/, 'la page cite le nom SQL au lieu du module')
})

test('vitrine — aucune lecture de table : les deux tables sont sous RLS sans politique', () => {
  for (const table of ['loyalty_programs', 'reward_tiers', 'loyalty_cards', 'clients']) {
    assert.equal(CODE.includes(table), false, `lecture de table « ${table} »`)
  }
  assert.doesNotMatch(CODE, /\.from\s*\(/, 'un `.from(` lit une table, pas une RPC')
})

test('vitrine — le mapping prénom / nom n’est pas recopié', () => {
  // La vitrine ne montre aucune personne : elle n'a donc rien à mapper. Si un
  // jour elle en affichait une, ce serait par `lib/personne.mjs` — jamais par
  // une seconde correspondance `first_name` / `last_name` écrite ici.
  assert.doesNotMatch(CODE, /first_name|last_name/, 'le mapping vit dans `lib/personne.mjs`')
})

test('vitrine — un slug inconnu est un 404, pas une panne', () => {
  assert.match(CODE, /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*'next\/navigation'/)
  assert.match(CODE, /etat\s*===\s*'refuse'\)\s*notFound\(\)/, 'PROGRAM_NOT_FOUND sans 404')
  // Les états « base non migrée » et « indisponible » restent des écrans, pas des 404.
  assert.match(CODE, /migrationTexte/, 'l’état « base non migrée » doit être dit')
})

test('vitrine — l’appel à l’action est la route d’adhésion, celle que le QR encode', () => {
  // `/join/<slug>` est la forme mesurée ; `urlAdhesion` la produit pour le QR.
  // Si l’une des deux dérive, la page enverrait ailleurs que le comptoir.
  assert.match(CODE, /\/join\/\$\{slug\}/, 'lien d’adhésion construit depuis le slug')

  const attendu = new URL(urlAdhesion('https://exemple.ma', 'cafe-test-cei3')).pathname
  assert.equal(attendu, '/join/cafe-test-cei3')
})

test('vitrine — l’accroche interpole les deux variables du dictionnaire', () => {
  // `traduire` laisse `{x}` en clair quand la variable manque : une faute de
  // frappe (`{point}` au lieu de `{points}`) s’afficherait telle quelle.
  assert.equal(
    traduire('fr', 'page.vitrine.accroche', { points: 45, libelle: 'Boisson offerte' }),
    '45 points = Boisson offerte'
  )
})

test('vitrine — l’accroche est le premier palier atteignable, pas le premier du tableau', () => {
  // La base rend les paliers triés par `rank` ; on ne s’y fie pas à l’aveugle.
  const desordre = [
    { rang: 2, libelle: 'Dessert offert', cout: 75 },
    { rang: 1, libelle: 'Boisson offerte', cout: 45 },
  ]
  assert.deepEqual(prochainPalier(0, desordre), { ...desordre[1], reste: 45 })
  assert.equal(prochainPalier(0, []), null, 'aucun palier : pas d’accroche inventée')
})
