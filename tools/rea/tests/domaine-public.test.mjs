/* ============================================================================
   Garde sur l'**origine publique** — le domaine réellement détenu.

   Le QR de la plaque comptoir encode `urlAdhesion(origine, slug)`, soit
   `<origine>/join/<slug>`. Cette origine a deux sources, dans cet ordre :
   `NEXT_PUBLIC_SITE_URL` (déploiement) puis `x-forwarded-host` (la requête).
   Derrière l'edge d'OpenShip, `x-forwarded-host` est un hôte **interne** : un
   déploiement qui oublie la variable imprime une affiche qui ne mène nulle part,
   et rien dans le code ne s'en plaint — c'est un QR mort, pas une erreur.

   Ce que ce fichier refuse, par lecture seule :

     1. une origine qui ne produit plus exactement `/join/<slug>` ;
     2. `docker-compose.yml` qui cesse de transmettre la variable au serveur ;
     3. un `openship.json` sans domaine, sans variable, ou dont le
        `rootDirectory` ne contient pas de `Dockerfile` ;
     4. **la dérive entre deux vérités** : le domaine affiché au client
        (`marque.domaine`) et le domaine déployé (`openship.json`). S'ils
        divergent, le texte CNDP parle d'un site qui n'est pas celui du QR ;
     5. une valeur de production recopiée dans `.env.example`, qui est le
        modèle versionné — il documente le **nom**, jamais la valeur.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { traduire } from '../../../web/src/i18n/index.mjs'
import { NOM_ORIGINE, origineDepuisEntetes } from '../../../web/src/lib/confirmation.mjs'
import { urlAdhesion } from '../../../web/src/lib/qr.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const lire = (chemin) => (existsSync(chemin) ? readFileSync(chemin, 'utf8') : '')

const MANIFESTE = join(RACINE, 'openship.json')
const manifeste = JSON.parse(lire(MANIFESTE) || 'null')

/** Entêtes d'une requête interne : ce que l'edge envoie au conteneur. */
function entetes(paires) {
  const table = new Map(Object.entries(paires))
  return { get: (nom) => table.get(nom) ?? null }
}

test('origine — le QR encode exactement `<origine>/join/<slug>`', () => {
  assert.equal(
    urlAdhesion('https://fideliatest.site', 'cafe-test-cei3'),
    'https://fideliatest.site/join/cafe-test-cei3'
  )
  // Un slash final vient toujours d'être tapé à la main une fois.
  assert.equal(
    urlAdhesion('https://fideliatest.site/', 'cafe-test-cei3'),
    'https://fideliatest.site/join/cafe-test-cei3'
  )
})

test('origine — la variable déclarée l’emporte sur l’hôte de la requête', () => {
  // Sans la variable, l'edge décide — et il voit l'hôte **interne** du
  // conteneur. En `https` cette valeur serait encodée telle quelle dans
  // l'affiche ; en `http`, `validerUrl` la refuse et il n'y a **pas** de QR.
  // Ce second verrou protège du pire, il ne dispense pas de la variable.
  const interneHttps = entetes({
    'x-forwarded-host': 'web-7f3a1c:3000',
    'x-forwarded-proto': 'https',
  })
  assert.equal(origineDepuisEntetes(interneHttps, {}), 'https://web-7f3a1c:3000')
  assert.equal(
    origineDepuisEntetes(entetes({ host: 'web-7f3a1c:3000', 'x-forwarded-proto': 'http' }), {}),
    null,
    'un hôte interne en http n’est pas une origine : pas de QR plutôt qu’un QR mort'
  )

  for (const brute of ['https://fideliatest.site', 'https://fideliatest.site/']) {
    assert.equal(origineDepuisEntetes(interneHttps, { [NOM_ORIGINE]: brute }), 'https://fideliatest.site')
  }
})

test('déploiement — compose transmet l’origine au conteneur (pas au build)', () => {
  const compose = lire(join(RACINE, 'docker-compose.yml'))
  assert.ok(compose !== '', 'docker-compose.yml illisible')

  // Six espaces = clé de `environment`, pas un `build.args` (huit espaces) :
  // la variable est lue à la requête, elle n'a rien à faire dans l'image.
  assert.match(
    compose,
    /^ {6}NEXT_PUBLIC_SITE_URL: \$\{NEXT_PUBLIC_SITE_URL:-\}$/m,
    'le service web doit recevoir NEXT_PUBLIC_SITE_URL à l’exécution'
  )
})

test('déploiement — `.env.example` documente le nom, jamais une valeur', () => {
  const modele = lire(join(RACINE, 'web', '.env.example'))
  assert.match(modele, /^NEXT_PUBLIC_SITE_URL=$/m, 'variable absente ou préremplie')

  // Le fichier local est gitignoré ; s'il existe, c'est lui qui porte la valeur.
  const locale = lire(join(RACINE, 'web', '.env.local'))
  if (locale !== '') assert.match(locale, /^NEXT_PUBLIC_SITE_URL=https:\/\/\S+$/m)
})

test('déploiement — `openship.json` décrit l’app réelle', () => {
  assert.ok(manifeste, 'openship.json absent ou illisible')

  assert.equal(manifeste.runtime, 'docker', 'le dépôt porte son propre Dockerfile')
  assert.equal(
    manifeste.productionMode,
    'host',
    'sans ce champ, OpenShip détecte « static » et refuse la route vers le port 3000'
  )
  assert.equal(manifeste.port, 3000, 'le conteneur écoute 3000 (cf. Dockerfile)')
  assert.equal(manifeste.rootDirectory, 'web', 'l’app Next n’est pas à la racine du dépôt')

  const dockerfile = join(RACINE, manifeste.rootDirectory, 'Dockerfile')
  assert.ok(existsSync(dockerfile), `Dockerfile absent : ${dockerfile}`)

  assert.ok(Array.isArray(manifeste.domains) && manifeste.domains.length > 0)
  for (const domaine of manifeste.domains) {
    assert.equal(domaine, domaine.trim().toLowerCase(), `domaine mal formé : ${domaine}`)
    assert.doesNotMatch(domaine, /^https?:\/\//, `protocole interdit dans domains : ${domaine}`)
  }

  const origine = manifeste.env?.[NOM_ORIGINE]
  assert.equal(
    origine,
    `https://${manifeste.domains[0]}`,
    'l’origine déclarée doit être le premier domaine, en https'
  )
  assert.equal(
    origineDepuisEntetes(entetes({ host: 'web:3000' }), { [NOM_ORIGINE]: origine }),
    origine,
    'l’origine du manifeste doit survivre à la validation de `config.mjs`'
  )
})

test('déploiement — le domaine affiché est celui qui est déployé', () => {
  const affiche = traduire('fr', 'marque.domaine')
  assert.equal(affiche, manifeste.domains[0], 'marque.domaine et domains[0] divergent')
  assert.doesNotMatch(affiche, /^https?:\/\//, 'marque.domaine est un domaine, pas une URL')
})

test('origine — l’écran QR passe bien par les deux helpers, sans domaine en dur', () => {
  const page = lire(join(RACINE, 'web', 'src', 'app', '(dashboard)', 'qrcode', 'page.jsx'))
  assert.ok(page !== '', 'page QR illisible')

  const code = page.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(code, /\borigineDepuisEntetes\b/, 'origine lue ailleurs que par le helper')
  assert.match(code, /\burlAdhesion\s*\(/, 'le QR n’est plus construit par urlAdhesion')
  assert.doesNotMatch(
    code,
    /fideliatest\.site|fidelia\.ma/,
    'un domaine en dur ne doit pas être imprimé dans l’affiche'
  )
})

