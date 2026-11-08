/* ============================================================================
   URL Configuration : ce qui se voit seulement quand un courriel est parti.

   Ni `/auth/v1/settings` ni la base ne rendent `site_url` et `uri_allow_list`
   (mesuré le 2026-11-09). Le seul juge possible avant le premier envoi réel est
   donc ce module : les tests fixent ce qu'il doit refuser, et vérifient qu'il
   tire ses URL de `confirmation.mjs` plutôt que de constantes recopiées.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  accepter,
  auditer,
  auditerAllowList,
  auditerSiteUrl,
  correspondLiberal,
  correspondStrict,
  decouperListe,
  urlsRequises,
} from '../url-auth.mjs'
import { urlConfirmation, urlReinitialisation } from '../../../web/src/lib/confirmation.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ORIGINE = 'https://fideliatest.site'
const MODULE = readFileSync(join(RACINE, 'tools', 'rea', 'url-auth.mjs'), 'utf8')

test('liste — la forme rendue par la console est une chaîne à virgules', () => {
  assert.deepEqual(decouperListe('https://a.test/**, http://localhost:3000/**'), [
    'https://a.test/**',
    'http://localhost:3000/**',
  ])
  assert.deepEqual(decouperListe(['https://a.test/**']), ['https://a.test/**'])
  assert.deepEqual(decouperListe('https://a.test/**,'), ['https://a.test/**'])
  assert.deepEqual(decouperListe('  https://a.test/** , ,https://a.test/** '), ['https://a.test/**'])
  assert.deepEqual(decouperListe(null), [])
  assert.deepEqual(decouperListe(undefined), [])
})

test('motifs — `*` traverse `/`, `**` aussi : c’est la sémantique GoTrue', () => {
  const url = `${ORIGINE}/auth/confirm`
  assert.equal(correspondLiberal(`${ORIGINE}/*`, url), true)
  assert.equal(correspondLiberal(`${ORIGINE}/**`, url), true)
  assert.equal(correspondLiberal(`${ORIGINE}/auth/*`, url), true)
  assert.equal(correspondLiberal(`${ORIGINE}/autre`, url), false)
  // Le point du domaine n’est pas un joker.
  assert.equal(correspondLiberal('https://fideliatestXsite/**', url), false)
})

test('motifs — la lecture stricte refuse à `*` de traverser `/`', () => {
  const url = `${ORIGINE}/auth/confirm`
  assert.equal(correspondStrict(`${ORIGINE}/*`, url), false)
  assert.equal(correspondStrict(`${ORIGINE}/**`, url), true)
  assert.equal(correspondStrict(`${ORIGINE}/auth/confirm`, url), true)
})

test('verdict par URL — trois niveaux, et le plus sûr gagne', () => {
  const url = `${ORIGINE}/auth/confirm`
  assert.deepEqual(accepter([`${ORIGINE}/**`], url), { niveau: 'certaine', motifs: [`${ORIGINE}/**`] })
  assert.deepEqual(accepter([`${ORIGINE}/*`], url), { niveau: 'probable', motifs: [`${ORIGINE}/*`] })
  assert.deepEqual(accepter(['https://autre.test/**'], url), { niveau: 'absente', motifs: [] })
  assert.equal(
    accepter([`${ORIGINE}/*`, `${ORIGINE}/**`], url).niveau,
    'certaine',
    'un motif sûr suffit, même à côté d’un motif large'
  )
})

test('URL exigées — elles sortent du code, pas d’une recopie', () => {
  assert.deepEqual(urlsRequises(ORIGINE), [urlConfirmation(ORIGINE), urlReinitialisation(ORIGINE)])
  assert.equal(urlConfirmation(ORIGINE), `${ORIGINE}/auth/confirm`)
  assert.equal(urlReinitialisation(ORIGINE), `${ORIGINE}/auth/confirm?flux=recuperation`)
})

test('site_url — l’origine de déploiement passe', () => {
  const v = auditerSiteUrl(ORIGINE, ORIGINE)
  assert.deepEqual(v.echecs, [])
  assert.equal(v.valeur, ORIGINE)
})

test('site_url — une barre finale casse la concaténation des gabarits', () => {
  const v = auditerSiteUrl(`${ORIGINE}/`, ORIGINE)
  assert.equal(v.echecs.length, 1)
  assert.match(v.echecs[0], /barre finale/)
})

test('site_url — un hôte différent envoie le repli ailleurs', () => {
  const v = auditerSiteUrl('https://autre.test', ORIGINE)
  assert.equal(v.echecs.length, 1)
  assert.match(v.echecs[0], /≠ origine/)
})

test('site_url — `http` hors local et valeur vide sont refusés', () => {
  assert.match(auditerSiteUrl('http://fideliatest.site', ORIGINE).echecs[0], /https/)
  assert.match(auditerSiteUrl('', ORIGINE).echecs[0], /absente/)
  assert.match(auditerSiteUrl('fideliatest.site', ORIGINE).echecs[0], /URL absolue/)
})

test('site_url — un chemin n’est qu’un avertissement, il ne bloque pas', () => {
  const v = auditerSiteUrl(`${ORIGINE}/login`, ORIGINE)
  assert.deepEqual(v.echecs, [])
  assert.match(v.avertissements[0], /perd le jeton/)
})


test('allow-list — un joker profond accepte les deux URL du code', () => {
  const v = auditerAllowList(`${ORIGINE}/**,http://localhost:3000/**`, { origine: ORIGINE })
  assert.deepEqual(v.echecs, [])
  assert.deepEqual(
    v.requis.map((r) => r.niveau),
    ['certaine', 'certaine']
  )
})

test('allow-list — `*` simple n’est que plausible, donc pas une preuve', () => {
  const v = auditerAllowList(`${ORIGINE}/*,http://localhost:3000/**`, { origine: ORIGINE })
  assert.deepEqual(v.echecs, [], 'accepté sous la lecture GoTrue')
  assert.equal(v.requis[0].niveau, 'probable')
  assert.match(v.avertissements[0], /traverse « \/ »/)
})

test('allow-list — une liste muette refuse tout `redirect_to`', () => {
  assert.match(auditerAllowList('', { origine: ORIGINE }).echecs[0], /vide/)
  assert.match(auditerAllowList(undefined, { origine: ORIGINE }).echecs[0], /vide/)
})

test('allow-list — un motif qui manque est un échec, pas un doute', () => {
  const v = auditerAllowList('https://autre.test/**', { origine: ORIGINE })
  // Les deux URL du code tombent : confirmation **et** récupération.
  assert.equal(v.echecs.filter((e) => /refuse/.test(e)).length, 2)
  assert.deepEqual(
    v.requis.map((r) => r.niveau),
    ['absente', 'absente']
  )
  assert.equal(v.requis[0].url, urlConfirmation(ORIGINE))
})

test('allow-list — un joker d’origine tierce retire le second verrou', () => {
  for (const large of ['*', 'https://*', 'http*://*']) {
    const v = auditerAllowList(`${ORIGINE}/**,${large}`, { origine: ORIGINE })
    assert.match(v.echecs.at(-1), /origine tierce/, `« ${large} » doit être vu`)
  }
})

test('allow-list — l’absence de motif localhost est signalée, sans bloquer', () => {
  const v = auditerAllowList(`${ORIGINE}/**`, { origine: ORIGINE })
  assert.deepEqual(v.echecs, [])
  assert.match(v.avertissements.at(-1), /localhost/)
})

test('auditer — la configuration attendue rend CONFORME', () => {
  const v = auditer(
    { site_url: ORIGINE, uri_allow_list: `${ORIGINE}/**,http://localhost:3000/**` },
    { origine: ORIGINE }
  )
  assert.equal(v.ok, true)
  assert.deepEqual(v.echecs, [])
  assert.deepEqual(v.avertissements, [])
  assert.equal(v.origine, ORIGINE)
})

test('auditer — un hôte de repli fautif suffit à refuser l’ensemble', () => {
  const v = auditer(
    { site_url: 'https://ancien.test', uri_allow_list: `${ORIGINE}/**,http://localhost:3000/**` },
    { origine: ORIGINE }
  )
  assert.equal(v.ok, false)
  assert.equal(v.echecs.length, 1)
})

test('auditer — une origine attendue invalide lève au lieu de juger', () => {
  assert.throws(() => auditer({}, { origine: 'pas-une-url' }), /URL absolue/)
  assert.throws(() => auditer({}, { origine: 'http://fideliatest.site' }), /https/)
})

test('garde de source — aucun domaine de production recopié dans le module', () => {
  assert.doesNotMatch(MODULE, /fideliatest/i, 'le domaine doit venir de l’appelant')
  assert.match(MODULE, /from '\.\.\/\.\.\/web\/src\/lib\/confirmation\.mjs'/)
  assert.match(MODULE, /urlReinitialisation/)
})
