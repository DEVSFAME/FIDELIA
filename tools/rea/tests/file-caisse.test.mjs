/* ============================================================================
   R3 — la caisse hors ligne : trois issues, un délai, un manifeste mesuré.

   Ce que ce fichier empêche, dans l'ordre du risque :

     1. **une quatrième issue inventée** — la cible n'en a que trois (retiré,
        jeté, conservé) et la borne est mesurée : `{400,403,404,422}`. Une
        coupure réseau qui compterait une tentative jetterait une opération
        réelle au bout de trois essais ;
     2. **un identifiant régénéré au rejeu** — c'est le double crédit ;
     3. **un délai recopié** — 65 000 ms vient de la mesure A4, et le minuteur
        ne doit pas tourner sur une file vide ;
     4. **un manifeste « à peu près »** — il est comparé à la capture
        (`p21-caisse-manifest.html`), sauf la marque, qui est une décision ;
     5. **un service worker qui mettrait une page authentifiée en cache** — un
        solde et un code client ne doivent pas survivre à une déconnexion ;
     6. **une icône déclarée mais absente** — les PNG sont décompressés.

   Aucun navigateur : captures, modules purs, et l'`IDAT` des icônes.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import {
  DELAI_REJEU_MS,
  STATUTS_ECARTES,
  STATUTS_ETAT,
  apresRejeu,
  compterBloquees,
  corpsRequete,
  issueRejeu,
  nouvelleOperation,
  ordonner,
  prochainDelai,
} from '../../../web/src/lib/file-caisse.mjs'
import { CHEMIN_REPLI, ICONES, manifesteCaisse } from '../../../web/src/lib/pwa.mjs'
import { png } from '../generer-icones.mjs'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const lireOctets = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)))

const CAPTURES = ['01_REA_Fidelix', '_captures', '2026-10-26', 'raw', 'pages']

const MANIFESTE_CAPTURE = JSON.parse(lire(...CAPTURES, 'p21-caisse-manifest.html'))
const PAGE_CAISSE_CAPTURE = lire(...CAPTURES, 'p09-caisse.html')

const SW = lire('web', 'public', 'sw.js')
const PAGE_CAISSE = lire('web', 'src', 'app', '(dashboard)', 'caisse', 'page.jsx')
const ROUTE = lire('web', 'src', 'app', 'api', 'caisse', 'operation', 'route.js')

const UUID = '3f2b8c1e-9a4d-4f6b-8c2d-1e5a7b9c0d3e'

test('file — trois issues, bornes mesurées', () => {
  assert.deepEqual([...STATUTS_ECARTES], [400, 403, 404, 422])

  assert.equal(issueRejeu(200), 'retiree')
  assert.equal(issueRejeu(204), 'retiree')
  for (const statut of STATUTS_ECARTES) {
    assert.equal(issueRejeu(statut), 'ecartee', `jeté : ${statut}`)
  }
  assert.equal(issueRejeu(500), 'conservee')
  assert.equal(issueRejeu(503), 'conservee', 'migration absente ⇒ conservée, pas perdue')
  assert.equal(issueRejeu(undefined), 'conservee', 'réseau muet ⇒ conservée')
  assert.equal(issueRejeu(0), 'conservee')
})

test('file — une panne réseau n’incrémente pas les tentatives', () => {
  const operation = { id: UUID, creeLe: '2026-11-03T00:00:00.000Z', tentatives: 0 }

  const reseau = apresRejeu(operation, {})
  assert.equal(reseau.issue, 'conservee')
  assert.equal(reseau.operation.tentatives, 0, 'rien n’a été dit sur l’opération')
  assert.equal(reseau.operation.bloque, false)

  const serveur = apresRejeu(operation, { statut: 503 })
  assert.equal(serveur.operation.tentatives, 1)

  const jete = apresRejeu(operation, { statut: 422 })
  assert.equal(jete.issue, 'ecartee')
  assert.equal(jete.operation, null)

  const fini = apresRejeu(operation, { statut: 200 })
  assert.equal(fini.issue, 'retiree')
  assert.equal(fini.operation, null)
})

test('file — « bloqué » compte, n’abandonne pas', () => {
  let operation = { id: UUID, tentatives: 0 }
  for (let essai = 1; essai <= 4; essai += 1) {
    const suite = apresRejeu(operation, { statut: 500 })
    assert.notEqual(suite.operation, null, 'un élément bloqué reste dans la file')
    operation = suite.operation
  }
  assert.equal(operation.tentatives, 4)
  assert.equal(operation.bloque, true)
  assert.equal(compterBloquees([operation]), 1)
  assert.equal(compterBloquees([{ bloque: false }, { tentatives: 2 }]), 0)
})

test('file — cadence : 65 s, jamais à vide', () => {
  assert.equal(DELAI_REJEU_MS, 65_000)
  assert.equal(prochainDelai({ restantes: 2, enLigne: true }), 65_000)
  assert.equal(prochainDelai({ restantes: 0, enLigne: true }), null)
  assert.equal(prochainDelai({ restantes: 2, enLigne: false }), null)
})

test('file — ordre total, et l’entrée n’est pas triée sur place', () => {
  const entree = [
    { id: 'b', creeLe: '2026-11-03T00:00:02.000Z' },
    { id: 'a', creeLe: '2026-11-03T00:00:01.000Z' },
    { id: 'c', creeLe: '2026-11-03T00:00:01.000Z' },
  ]
  const ordonnee = ordonner(entree)
  assert.deepEqual(ordonnee.map((element) => element.id), ['a', 'c', 'b'])
  assert.equal(entree[0].id, 'b', 'l’ordre de l’entrée a été modifié')
  assert.deepEqual(ordonner(null), [])
})

test('file — l’identifiant est créé à l’enfilage et ne change plus', () => {
  const construit = nouvelleOperation({
    jeton: ' c-ab12cd ',
    montant: 12.5,
    points: 12,
    id: UUID,
  })
  assert.equal(construit.etat, 'ok')
  assert.equal(construit.operation.id, UUID)
  assert.equal(construit.operation.jeton, 'C-AB12CD')
  assert.equal(construit.operation.tentatives, 0)

  const rejoue = apresRejeu({ ...construit.operation, tentatives: 1 }, { statut: 500 })
  assert.equal(rejoue.operation.id, UUID, 'le rejeu doit renvoyer le MÊME identifiant')
})

test('file — ce qui n’est pas une opération est refusé avant le réseau', () => {
  const base = { jeton: 'C-AB12CD', montant: 10, points: 10, id: UUID }

  assert.equal(nouvelleOperation({ ...base, jeton: '4123456789012' }).champ, 'jeton')
  assert.equal(nouvelleOperation({ ...base, montant: -1 }).champ, 'montant')
  assert.equal(nouvelleOperation({ ...base, montant: 'beaucoup' }).champ, 'montant')
  assert.equal(nouvelleOperation({ ...base, points: 1.5 }).champ, 'points')
  assert.equal(nouvelleOperation({ ...base, id: 'pas-un-uuid' }).champ, 'id')
  assert.equal(nouvelleOperation({ ...base, id: undefined }).champ, 'id')
})

test('file — le corps HTTP et les statuts sont ceux de la route', () => {
  const operation = { id: UUID, jeton: 'C-AB12CD', montant: 12.5, points: 12 }
  assert.deepEqual(corpsRequete(operation), {
    operationId: UUID,
    jeton: 'C-AB12CD',
    montant: 12.5,
    points: 12,
  })

  assert.equal(STATUTS_ETAT.ok, 200)
  assert.equal(STATUTS_ETAT.arguments, 400)
  assert.equal(STATUTS_ETAT.carteInconnue, 404)
  assert.equal(STATUTS_ETAT.refus, 422)
  assert.equal(STATUTS_ETAT.migration, 503)
  assert.equal(STATUTS_ETAT.configuration, 503)

  // La route envoie les **noms de paramètres** de la RPC, pas ceux du corps HTTP.
  for (const parametre of ['p_operation_id', 'p_card_token', 'p_amount_spent', 'p_points_to_add']) {
    assert.match(ROUTE, new RegExp(parametre), `la route n’envoie pas ${parametre}`)
  }
  assert.match(ROUTE, /PGRST202/, 'une migration absente doit être reconnue, pas fondue dans « refus »')
})

test('manifeste — identique à la capture, sauf la marque (décision)', () => {
  const notre = manifesteCaisse()
  const marque = dictionnaire('fr')['marque.nom']

  assert.deepEqual(Object.keys(notre), Object.keys(MANIFESTE_CAPTURE), 'ordre des clés différent')
  assert.equal(notre.name, `Caisse ${marque}`)
  assert.notEqual(notre.name, MANIFESTE_CAPTURE.name, 'la marque de la cible est réutilisée')

  const valeurs = [
    'short_name',
    'description',
    'start_url',
    'scope',
    'display',
    'background_color',
    'theme_color',
  ]
  for (const cle of valeurs) {
    assert.equal(notre[cle], MANIFESTE_CAPTURE[cle], `valeur non mesurée : ${cle}`)
  }
  assert.deepEqual(notre.icons, MANIFESTE_CAPTURE.icons)
  assert.deepEqual(notre.icons, ICONES.map((icone) => ({ ...icone })))

  // Le chemin vient de la cible, il n’est pas choisi ici.
  assert.match(PAGE_CAISSE_CAPTURE, /rel="manifest" href="\/caisse\/manifest\.webmanifest"/)
  assert.match(PAGE_CAISSE, /manifest: CHEMIN_MANIFESTE/)
})

test('service worker — portée racine, règles limitées, aucun HTML authentifié en cache', () => {
  assert.equal(CHEMIN_REPLI, '/caisse-hors-ligne')
  assert.match(SW, /const REPLI = '\/caisse-hors-ligne'/)
  assert.match(SW, /const ECRANS = \['\/caisse', REPLI\]/)
  assert.match(SW, /STATIQUES = \['\/_next\/static\/', '\/polices\/'\]/)

  const repli = SW.slice(SW.indexOf('async function ecranDAbord'))
  assert.doesNotMatch(repli, /\.put\(/, 'une page de navigation ne doit pas entrer en cache')
  assert.match(repli, /cache\.match\(REPLI\)/, 'le repli doit être servi hors ligne')

  // Les morceaux du repli sont préchargés : sans eux, l'écran s'ouvre sans JS.
  const precharger = SW.slice(SW.indexOf('async function precharger'), SW.indexOf('activate'))
  assert.match(precharger, /matchAll\(\//, 'les scripts du repli ne sont pas extraits du HTML')
  assert.match(precharger, /cache\.add\(url\)/)
})

test('icônes — déclarées, valides, et identiques au générateur', () => {
  for (const taille of [192, 512]) {
    const octets = lireOctets('web', 'public', `icon-${taille}.png`)

    assert.deepEqual([...octets.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(octets.readUInt32BE(16), taille)
    assert.equal(octets.readUInt32BE(20), taille)

    const longueur = octets.readUInt32BE(33)
    const brut = inflateSync(octets.subarray(41, 41 + longueur))
    assert.equal(brut.length, taille * (1 + taille * 3), 'pixels non décodables')

    // Rejouer le générateur doit rendre le même fichier : pas de binaire opaque.
    assert.equal(Buffer.compare(octets, png(taille, taille)), 0, 'l’icône ne vient pas du générateur')

    // Le fond est celui du manifeste, au premier pixel.
    assert.deepEqual([...brut.subarray(1, 4)], [0x1a, 0x1a, 0x1a])
  }
})

test('écran — la caisse reste serveur, le repli est public et sans données', () => {
  assert.doesNotMatch(PAGE_CAISSE, /^'use client'/m)
  assert.match(PAGE_CAISSE, /<CrediterCaisse jeton=\{lisible\.card_token\}/)
  assert.match(PAGE_CAISSE, /<FileAttente locale=\{locale\} \/>/)

  const repli = lire('web', 'src', 'app', 'caisse-hors-ligne', 'page.jsx')
  assert.doesNotMatch(repli, /'use client'/)
  assert.doesNotMatch(repli, /supabase|donnees\.mjs/, 'l’écran de repli ne lit aucune donnée serveur')
  assert.match(repli, /<FileAttente locale=\{locale\} \/>/)
})
