/* ============================================================================
   P0-5 — la sonde PassKit, testée sur sa partie qui décide.

   Ce que ce fichier empêche :
     1. **une base d'API inventée** — `construireUrl` rend `null` sans base :
        deviner `https://api.passkit.com` enverrait un jeton à une adresse que le
        compte n'a pas désignée ;
     2. **un drapeau ignoré** — `WALLET_ENABLED=false` doit rendre `pret: false`
        même avec des identifiants valides, sinon un essai expiré casse le scan ;
     3. **un secret imprimé** — `masquer` ne garde que quatre caractères ;
     4. **un chemin supposé** — les chemins sont des **candidats** : le test
        vérifie qu'ils sont peu nombreux et bien formés, pas qu'ils sont « les
        bons » (ça, seule la sonde le dit) ;
     5. **une lecture qui invente** — `resumeMembre` rend des listes vides quand
        l'URL ou le code-barres sont absents ; une liste vide est un résultat.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CLES_ENV,
  aplatir,
  cheminsProgrammes,
  construireUrl,
  lireConfiguration,
  masquer,
  resumeMembre,
  urlValide,
} from '../passkit.mjs'

const ENV_COMPLET = {
  WALLET_ENABLED: 'true',
  PASSKIT_API_URL: 'https://api.passkit.example',
  PASSKIT_API_TOKEN: 'jeton-secret-0123456789',
  PASSKIT_PROGRAM_ID: 'prog_1',
  PASSKIT_TIER_ID: 'tier_1',
}

test('passkit — une configuration vide n’est pas prête, et dit ce qui manque', () => {
  const config = lireConfiguration({})
  assert.equal(config.pret, false)
  assert.equal(config.actif, false)
  assert.deepEqual(config.manquantes, [`${CLES_ENV.actif}=true`, CLES_ENV.url, CLES_ENV.jeton])
})

test('passkit — le drapeau éteint gagne, même avec des identifiants valides', () => {
  const config = lireConfiguration({ ...ENV_COMPLET, WALLET_ENABLED: 'false' })
  assert.equal(config.actif, false)
  assert.equal(config.pret, false, 'un essai expiré ne doit pas pouvoir appeler le réseau')
  assert.equal(
    config.jeton,
    'jeton-secret-0123456789',
    'le jeton reste lu, il n’est simplement pas utilisé'
  )
})

test('passkit — écrire exige un programme ET un palier', () => {
  assert.equal(lireConfiguration(ENV_COMPLET).pret, true)
  assert.equal(lireConfiguration(ENV_COMPLET).pretAEcrire, true)

  const sansPalier = { ...ENV_COMPLET }
  delete sansPalier.PASSKIT_TIER_ID
  assert.equal(lireConfiguration(sansPalier).pret, true, 'lire ne demande pas de palier')
  assert.equal(lireConfiguration(sansPalier).pretAEcrire, false)
})

test('passkit — une valeur blanche vaut une valeur absente', () => {
  const config = lireConfiguration({ ...ENV_COMPLET, PASSKIT_API_URL: '   ', WALLET_ENABLED: ' TRUE ' })
  assert.equal(config.url, null)
  assert.equal(config.actif, true, 'le drapeau tolère les espaces')
  assert.equal(config.pret, false)
})

test('passkit — aucune base d’API n’est inventée', () => {
  assert.equal(construireUrl(undefined, '/v1/members/program'), null)
  assert.equal(construireUrl('', '/v1/members/program'), null)
  assert.equal(construireUrl('api.passkit.com', '/v1'), null, 'sans schéma, ce n’est pas une URL')
  assert.equal(construireUrl(ENV_COMPLET.PASSKIT_API_URL, 'v1'), null, 'un chemin sans / est refusé')
})

test('passkit — l’URL assemble sans doubler le slash', () => {
  assert.equal(
    construireUrl('https://api.passkit.example/', '/v1/members/program'),
    'https://api.passkit.example/v1/members/program'
  )
  assert.equal(
    construireUrl('https://api.passkit.example', '/v1/members/program'),
    'https://api.passkit.example/v1/members/program'
  )
  assert.equal(urlValide('https://api.passkit.example'), true)
  assert.equal(urlValide('ftp://api.passkit.example'), false)
})

test('passkit — les chemins sont des candidats, en nombre borné', () => {
  const sansProgramme = cheminsProgrammes()
  assert.equal(sansProgramme.length, 2)
  assert.ok(sansProgramme.every((chemin) => chemin.startsWith('/')))

  const avecProgramme = cheminsProgrammes('prog_1')
  assert.equal(avecProgramme.length, 3)
  assert.equal(avecProgramme[0], '/v1/members/program/prog_1', 'le programme connu passe en premier')
  assert.equal(cheminsProgrammes('prog à espaces')[0], '/v1/members/program/prog%20%C3%A0%20espaces')
})

test('passkit — un secret ne fuit jamais', () => {
  assert.equal(masquer(null), '—')
  assert.equal(masquer(''), '—')
  const affiche = masquer('jeton-secret-0123456789')
  assert.ok(affiche.includes('6789'), 'les quatre derniers servent à reconnaître le jeton')
  assert.equal(affiche.includes('jeton-secret'), false, 'le préfixe du secret ne doit pas apparaître')
  assert.equal(affiche.includes('0123456789'), false)
})

test('passkit — `aplatir` descend objets et tableaux, et s’arrête à 4 niveaux', () => {
  assert.deepEqual(aplatir({ a: { b: 1 }, c: [2, 3], d: null }), [
    { chemin: 'a.b', valeur: '1' },
    { chemin: 'c[0]', valeur: '2' },
    { chemin: 'c[1]', valeur: '3' },
    { chemin: 'd', valeur: 'null' },
  ])

  assert.deepEqual(aplatir({ a: { b: { c: { d: { e: { f: 'trop' } } } } } }), [])
})

test('passkit — `resumeMembre` trouve l’URL et le code-barres, et n’invente rien', () => {
  const membre = {
    id: 'mem_1',
    externalId: 'carte-42',
    points: 30,
    passUrl: 'https://pub.pskt.io/abc',
    person: { displayName: 'Sonia' },
    barcode: { format: 'QR', value: 'CARD-TOKEN-42' },
  }
  const resume = resumeMembre(membre)
  assert.ok(resume.cles.includes('passUrl'))
  assert.deepEqual(
    resume.urls.map((entree) => entree.chemin),
    ['passUrl']
  )
  assert.deepEqual(resume.codes, [
    { chemin: 'barcode.format', valeur: 'QR' },
    { chemin: 'barcode.value', valeur: 'CARD-TOKEN-42' },
  ])
  // `externalId` n'est pas un code-barres : c'est l'identifiant qu'on fournit.
  // S'il apparaissait ici, le tri par motif mentirait sur ce qu'il trouve.
  assert.equal(
    resume.codes.some((entree) => entree.chemin === 'externalId'),
    false
  )

  const vide = resumeMembre({ id: 'mem_2', points: 0 })
  assert.deepEqual(vide.urls, [], 'aucune URL : c’est un résultat, pas une erreur')
  assert.deepEqual(vide.codes, [])
  assert.deepEqual(resumeMembre(null), { cles: [], urls: [], codes: [] })
})
