/* ============================================================================
   R3 — une soumission ne finit plus sur une route qui ne porte aucune action.

   **Le défaut, mesuré le 2026-11-09.** Un utilisateur a saisi ses identifiants,
   et Chrome a affiché sa page d'erreur réseau : « This page couldn't load ».
   Le journal de l'edge donne la requête exacte, à la seconde de l'erreur du
   conteneur :

       GET  /        307
       GET  /login   200
       POST /        400   30 octets   (referer absent)

   et le conteneur, lui, a dit : `The Server Reference ID did not match the
   expected format. Received "y"`. Rejoué à la main : `POST /` avec
   `Next-Action: y` rend **400**, `content-length: 30`, corps **vide**,
   `x-nextjs-action-not-found: 1`. C'est byte pour byte ce que le navigateur a
   reçu — donc pas une hypothèse.

   Deux causes, une seule règle :
     1. `/` est **prérendue** (`307 → /login`, `cache-control: s-maxage=31536000`)
        et ne déclare aucune action : tout POST y est perdu par construction ;
     2. l'identifiant d'action valait **`y`** — un caractère, là où le manifeste
        du build porte 42 hexadécimaux (`6058212f…b583fbbb`).

   Quatre familles de défauts silencieux, et ce que ce fichier en vérifie :

     1. la règle intercepte une requête **légitime** (une action valide, un
        `POST` de route handler) : la connexion et l'abonnement push casseraient ;
     2. elle **laisse passer** ce qu'elle prétend fermer (`POST /`, id tronqué),
        parce qu'un cas a été oublié ;
     3. la cible est un **307** : le POST serait rejoué sur la cible, donc la
        même requête refusée, et la boucle serait invisible ;
     4. la valeur `?etat=` produite n'est **pas affichable** : bandeau muet, donc
        l'utilisateur retombe sur un écran qui ne dit rien (le défaut d'origine).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cibleDeRepli,
  ETAT_REPRISE,
  LONGUEUR_MIN_ID,
} from '../../../web/src/lib/action-perdue.mjs'
import { messageEtat } from '../../../web/src/lib/connexion.mjs'
import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')

/** L'identifiant réel de `seConnecter`, lu dans le manifeste déployé. */
const ID_VALIDE = '6058212fcd5f832af2b8ff54dd62a811a1b583fbbb'

test('action perdue — une lecture n’est jamais interceptée', () => {
  for (const methode of ['GET', 'HEAD']) {
    assert.equal(
      cibleDeRepli({ methode, chemin: '/', idAction: null }),
      null,
      `${methode} / doit passer : c'est la redirection de la page racine`
    )
  }
})

test('action perdue — POST / renvoie sur la connexion, avec ou sans en-tête', () => {
  const attendu = `/login?etat=${ETAT_REPRISE}`
  assert.equal(cibleDeRepli({ methode: 'POST', chemin: '/', idAction: null }), attendu)
  assert.equal(cibleDeRepli({ methode: 'POST', chemin: '/', idAction: 'y' }), attendu)
  assert.equal(
    cibleDeRepli({ methode: 'POST', chemin: '/', idAction: ID_VALIDE }),
    attendu,
    'même un identifiant valide ne peut pas aboutir sur une route sans action'
  )
})

test('action perdue — un identifiant tronqué rend la page demandée', () => {
  assert.equal(cibleDeRepli({ methode: 'POST', chemin: '/login', idAction: 'y' }), '/login')
  assert.equal(
    cibleDeRepli({ methode: 'POST', chemin: '/dashboard', idAction: 'y' }),
    '/dashboard',
    'l’écran reste celui sur lequel l’utilisateur travaillait'
  )
  assert.equal(cibleDeRepli({ methode: 'POST', chemin: '/login', idAction: '' }), null)
})

test('action perdue — une action valide et un POST de route handler passent', () => {
  assert.equal(
    cibleDeRepli({ methode: 'POST', chemin: '/login', idAction: ID_VALIDE }),
    null,
    'la connexion doit continuer de fonctionner'
  )
  assert.equal(
    cibleDeRepli({ methode: 'POST', chemin: '/api/push/subscribe', idAction: null }),
    null,
    'un route handler n’envoie aucun `Next-Action`'
  )
  assert.equal(
    cibleDeRepli({ methode: 'POST', chemin: '/login', idAction: 'a'.repeat(LONGUEUR_MIN_ID) }),
    null,
    `la borne (${LONGUEUR_MIN_ID}) est acceptée : aucune marge inventée`
  )
  assert.equal(
    cibleDeRepli({
      methode: 'POST',
      chemin: '/login',
      idAction: 'a'.repeat(LONGUEUR_MIN_ID - 1),
    }),
    '/login',
    'un caractère de moins est refusé'
  )
})

test('action perdue — le proxy applique la règle en 303, jamais en 307', () => {
  const source = lire('proxy.js')

  assert.match(
    source,
    /import\s*\{\s*cibleDeRepli\s*\}\s*from\s*'\.\/lib\/action-perdue\.mjs'/,
    'la règle doit être importée, pas recopiée'
  )
  assert.match(
    source,
    /NextResponse\.redirect\(new URL\(repli, request\.nextUrl\.origin\), 303\)/,
    'un 307 rejouerait le POST sur la cible : la boucle serait invisible'
  )
  assert.match(source, /request\.headers\.get\('next-action'\)/, 'l’en-tête lu est celui de Next')
})

test('action perdue — / cesse d’être prérendue et mise en cache un an', () => {
  const source = lire('app', 'page.jsx')

  assert.match(
    source,
    /export const dynamic = 'force-dynamic'/,
    'sans cela Next sert la redirection avec `cache-control: s-maxage=31536000`'
  )
  assert.match(source, /redirect\('\/login'\)/, 'la cible de la redirection ne change pas')
})

test('action perdue — le ?etat= produit est affichable, et sa copie est vraie', () => {
  const cle = messageEtat(ETAT_REPRISE)

  assert.ok(cle, 'une valeur produite sans consommateur serait un bandeau muet')
  assert.ok(
    dictionnaire('fr')[cle],
    `la clé ${cle} doit exister au dictionnaire, sinon i18n lève à l’écran`
  )
  assert.match(
    lire('lib', 'connexion.mjs'),
    new RegExp(`case '${ETAT_REPRISE}'`),
    'le consommateur doit nommer la valeur produite'
  )
})
