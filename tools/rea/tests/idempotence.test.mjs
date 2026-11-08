/* ============================================================================
   R3 — garde sur le verdict de rejeu. Aucun réseau, aucune base.

   Trois tests portent la thèse du module, et se lisent avant les autres :

   - `PGRST202 ne dit pas « la fonction manque »` : le même code sort quand le
     nom existe et que le corps omet un argument. Un outil qui envoie un corps
     partiel conclut « 0016 absente » sur une fonction présente.
   - `un solde manquant n'est pas un solde égal` : `Number(null)` vaut `0` ;
     deux réponses sans `new_balance` se compareraient égales, et le double
     crédit passerait pour un rejeu absorbé.
   - `les arguments viennent de la migration` : les quatre noms sont relus dans
     `0016`, donc l'outil ne peut pas dériver du contrat qu'il mesure.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  ETATS_SONDE,
  corpsSonde,
  corpsOperation,
  classerSonde,
  normaliserResultat,
  verdictRejeu,
} from '../idempotence.mjs'

const SQL = readFileSync(
  fileURLToPath(new URL('../../../migrations/0016_operations_caisse.sql', import.meta.url)),
  'utf8',
)

const ABSENTE = {
  statut: 404,
  corps: JSON.stringify({
    code: 'PGRST202',
    details:
      'Searched for the function public.enregistrer_operation_caisse with parameters p_amount_spent, p_card_token, p_operation_id, p_points_to_add or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
    hint: null,
    message:
      'Could not find the function public.enregistrer_operation_caisse(p_amount_spent, p_card_token, p_operation_id, p_points_to_add) in the schema cache',
  }),
}

const ecrit = (extra = {}) => ({
  statut: 200,
  corps: JSON.stringify({
    card_id: 'a665796e-ad7f-44d7-a9ce-3688f9009e6f',
    card_token: 'C-2C4718',
    new_balance: 11,
    points_added: 1,
    transaction_id: '11111111-2222-4333-8444-555555555555',
    idempotent: false,
    ...extra,
  }),
})

test('la sonde envoie les quatre arguments, operation_id nul', () => {
  const corps = corpsSonde()
  assert.deepEqual(Object.keys(corps).sort(), [
    'p_amount_spent',
    'p_card_token',
    'p_operation_id',
    'p_points_to_add',
  ])
  assert.equal(corps.p_operation_id, null)
  assert.equal(corps.p_amount_spent, 0)
  assert.equal(corps.p_points_to_add, 0)
})

test('les quatre arguments sont ceux de la migration', () => {
  for (const nom of Object.keys(corpsOperation({}))) {
    assert.ok(SQL.includes(nom), `0016 ne déclare pas ${nom}`)
  }
  assert.ok(/raise exception 'OPERATION_ID_MANQUANT'/.test(SQL))
})

test('PGRST202 404 : la migration est absente', () => {
  assert.equal(classerSonde(ABSENTE).etat, 'absente')
})

test('42501 : la fonction existe, anon n’a pas EXECUTE', () => {
  const sonde = classerSonde({
    statut: 401,
    corps: { code: '42501', message: 'permission denied for function enregistrer_operation_caisse' },
  })
  assert.equal(sonde.etat, 'fermee')
})

test('OPERATION_ID_MANQUANT : anon atteint la fonction (GRANT trop large)', () => {
  const sonde = classerSonde({
    statut: 400,
    corps: textDe({ code: 'P0001', message: 'OPERATION_ID_MANQUANT' }),
  })
  assert.equal(sonde.etat, 'appelable')
})

test('un corps non-JSON reste inconnu, jamais rapproché', () => {
  const sonde = classerSonde({ statut: 502, corps: '<html>bad gateway</html>' })
  assert.equal(sonde.etat, 'inconnue')
  assert.ok(ETATS_SONDE.includes(sonde.etat))
})

test('une première erreur est nommée, pas résumée', () => {
  const verdict = verdictRejeu({
    premier: { statut: 400, corps: textDe({ code: 'P0001', message: 'CARD_NOT_FOUND' }) },
    second: ecrit({ idempotent: true }),
  })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.raisons.some((r) => r.includes('CARD_NOT_FOUND')))
})

test('deux résultats sans solde ne prouvent pas l’absence de double crédit', () => {
  const sansSolde = ecrit({ new_balance: null, idempotent: false })
  const verdict = verdictRejeu({
    premier: sansSolde,
    second: ecrit({ idempotent: true, new_balance: null }),
  })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.raisons.some((r) => r.includes('aucun solde rendu')))
})

test('un second crédit (solde qui bouge) est refusé', () => {
  const verdict = verdictRejeu({
    premier: ecrit({ new_balance: 11 }),
    second: ecrit({ idempotent: true, new_balance: 12 }),
  })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.raisons.some((r) => r.includes('bougé deux fois')))
})

test('deux transactions différentes sont refusées', () => {
  const verdict = verdictRejeu({
    premier: ecrit(),
    second: ecrit({ idempotent: true, transaction_id: '99999999-8888-4777-8666-555544443333' }),
  })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.raisons.some((r) => r.includes('deux transactions')))
})

test('un rejeu qui ne se reconnaît pas est refusé', () => {
  const verdict = verdictRejeu({ premier: ecrit(), second: ecrit() })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.raisons.some((r) => r.includes('`idempotent` absent')))
})

test('le rejeu conforme est accepté, avec ses preuves', () => {
  const verdict = verdictRejeu({ premier: ecrit(), second: ecrit({ idempotent: true }) })
  assert.equal(verdict.ok, true)
  assert.deepEqual(verdict.raisons, [])
  assert.equal(verdict.premier.transaction_id, verdict.second.transaction_id)
  assert.equal(verdict.premier.new_balance, 11)
})

test('normaliserResultat tolère un 502 sans corps JSON', () => {
  const r = normaliserResultat({ statut: 502, corps: 'Bad Gateway' })
  assert.equal(r.ok, false)
  assert.equal(r.erreur, 'HTTP 502')
  assert.equal(r.new_balance, null)
})

/** Un corps JSON sérialisé, pour les cas d'erreur PostgREST. */
function textDe(objet) {
  return JSON.stringify(objet)
}
