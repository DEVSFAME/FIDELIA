/* ============================================================================
   Garde sur `migrations/0016` — l'écriture idempotente de la caisse.

   La migration n'est pas exécutée ici ; on vérifie ce qui casserait **en
   silence** une fois passée :

     1. **un double crédit sous concurrence** — sans verrou transactionnel, deux
        rejeux simultanés du même identifiant lisent tous deux « pas encore
        fait » et créditent deux fois ;
     2. **un rejeu qui réécrit** — le chemin « déjà vu » doit **rendre** le
        résultat mémorisé, pas rappeler `award_loyalty_points` ;
     3. **une règle de crédit dupliquée** — la fonction délègue, elle ne
        réimplémente ni le solde ni la transaction ;
     4. **une clé sans borne** — la table doit refuser un montant négatif ;
     5. **`anon` accordé** — une clé anonyme qui crédite des points est un
        distributeur ouvert ;
     6. **un `GRANT` sans `REVOKE`** — `create function` hérite de `PUBLIC`.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { NOM_RPC_OPERATION } from '../../../web/src/lib/file-caisse.mjs'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0016_operations_caisse.sql')

/** Le SQL sans la prose : les commentaires citent la syntaxe, ils n'en sont pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

const FONCTION = CODE.slice(CODE.indexOf('create or replace function'))

test('0016 — la table des clés est bornée et fermée', () => {
  assert.match(CODE, /create table if not exists public\.operations_caisse/)
  assert.match(CODE, /operation_id\s+uuid primary key/)
  assert.match(CODE, /montant\s+numeric\(10,2\) not null check \(montant >= 0\)/)
  assert.match(CODE, /points\s+integer\s+not null check \(points >= 0\)/)
  assert.match(CODE, /alter table public\.operations_caisse enable row level security/)
  assert.match(CODE, /revoke all on public\.operations_caisse from public, anon, authenticated/)
  assert.doesNotMatch(CODE, /create policy/i, 'une politique rouvrirait la table à un rôle')
})

test('0016 — la fonction est `security definer` avec un `search_path` figé', () => {
  assert.match(FONCTION, /security definer/)
  assert.match(FONCTION, /set search_path = public/)
})

test('0016 — un identifiant absent est refusé, avec un code d’un seul jeton', () => {
  const refus = FONCTION.match(/raise exception '([^']+)'/)
  assert.ok(refus, 'aucun refus explicite')
  // `interpreterErreur` ne lit que le premier mot : un message avec espaces
  // retomberait en `inconnu`, donc en « la base ne répond pas ».
  assert.equal(refus[1], refus[1].trim().split(/\s+/)[0])
  assert.match(refus[1], /^[A-Z_]+$/)
})

test('0016 — deux rejeux simultanés se sérialisent', () => {
  assert.match(
    FONCTION,
    /perform pg_advisory_xact_lock\(hashtextextended\(p_operation_id::text, 0\)\)/,
    'sans verrou, le même identifiant peut créditer deux fois'
  )

  // Le verrou d'abord, la lecture ensuite : l'ordre inverse ne protège rien.
  const verrou = FONCTION.indexOf('pg_advisory_xact_lock')
  const lecture = FONCTION.indexOf('from public.operations_caisse')
  assert.ok(verrou >= 0 && lecture > verrou, 'la lecture doit suivre le verrou')
})

test('0016 — le rejeu rend le résultat mémorisé sans réécrire', () => {
  const debut = FONCTION.indexOf('if found then')
  const dejaVu = FONCTION.slice(debut, FONCTION.indexOf('end if', debut))
  assert.match(dejaVu, /jsonb_build_object\(/)
  assert.match(dejaVu, /'idempotent', true/)
  assert.doesNotMatch(dejaVu, /award_loyalty_points/, 'un rejeu ne doit pas recréditer')
  assert.doesNotMatch(dejaVu, /insert into/, 'un rejeu ne doit rien écrire')
})

test('0016 — la règle de crédit reste dans `award_loyalty_points`', () => {
  const appels = FONCTION.match(/public\.award_loyalty_points\(/g) ?? []
  assert.equal(appels.length, 1, 'la fonction doit déléguer exactement une fois')

  assert.match(FONCTION, /p_amount_spent, p_points_to_add, null/)
  assert.match(FONCTION, /insert into public\.operations_caisse/)
  assert.doesNotMatch(FONCTION, /insert into public\.loyalty_transactions/i)
})

test('0016 — droits : `authenticated` seulement, après un `REVOKE`', () => {
  const revoke = CODE.lastIndexOf('revoke execute on function')
  const grant = CODE.lastIndexOf('grant execute on function')
  assert.ok(revoke >= 0 && grant > revoke, 'le GRANT doit venir après le REVOKE')

  assert.match(CODE, /revoke execute on function public\.enregistrer_operation_caisse\(\s*uuid, varchar, numeric, integer\s*\) from public, anon, authenticated/)
  assert.match(CODE, /grant execute on function public\.enregistrer_operation_caisse\(\s*uuid, varchar, numeric, integer\s*\) to authenticated, service_role/)

  const apresGrant = CODE.slice(grant)
  assert.doesNotMatch(apresGrant, /\bto\b[^;]*\banon\b/, 'anon ne doit jamais obtenir EXECUTE')
})

test('0016 — le nom de la RPC est celui que le module appelle', () => {
  assert.equal(NOM_RPC_OPERATION, 'enregistrer_operation_caisse')
  assert.match(CODE, new RegExp(`function public\\.${NOM_RPC_OPERATION}\\(`))
})
