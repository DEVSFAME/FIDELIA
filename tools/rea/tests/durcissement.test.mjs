/* ============================================================================
   R1.2 — tests du vérificateur de durcissement. Aucun réseau, aucune base.

   Deux tests portent la thèse de R1.2, et méritent d'être lus avant les autres :

   - `REVOKE … FROM anon seul est un no-op` : le droit vient de PUBLIC, pas
     d'anon. Une migration qui ne révoque que anon se lit comme une protection
     et n'en est pas une. Le test garde ce piège fermé.
   - `le GRANT à service_role n'est pas décoratif` : si service_role tenait son
     droit de PUBLIC, révoquer PUBLIC le lui retirerait. Le durcissement
     casserait le backend en croyant le protéger.

   Un troisième verrouille la migration RÉELLE, pas un exemple : le fichier
   livré doit passer les invariants. C'est l'assertion « pas de régression ».

   Depuis la fusion de `0001` et `0002` (2026-10-31), trois gardes sont ajoutés :
   le fichier unique ne doit laisser AUCUN rôle fermé sans son droit d'écrire.
   C'est l'erreur qui a motivé la fusion — deux fichiers dont le second annulait
   le premier, et l'ordre d'exécution décidait si l'application fonctionnait. Une
   seule migration ne peut plus avoir d'ordre.
   ========================================================================== */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RPC_MESUREES,
  TABLES_MESUREES,
  RPC_HORS_BASE,
  sansCommentaires,
  normaliser,
  instructions,
  signatureNormalisee,
  droitsExecute,
  revoquesSansPublic,
  rpcDurcies,
  tablesRlsActivee,
  forceRls,
  politiquesOuvrantes,
  grantsTablesOuverts,
  occurrencesEnCode,
  auditer,
} from '../durcissement.mjs'
import { construireAttribution } from '../../../web/src/lib/rpc.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const MIGRATION = join(RACINE, 'migrations', '0001_acl_rls_durcissement.sql')
const MIGRATION_ABSORBEE = join(RACINE, 'migrations', '0002_r2_execute_rpc.sql')
const CAPTURE = join(RACINE, '01_REA_Fidelix', '_captures', '2026-10-28-r0', 'sonde-base.json')

const A = 'award_loyalty_points(varchar, numeric, integer, uuid)'
const R = 'redeem_loyalty_reward(varchar, integer, varchar, uuid)'

/* Types des paramètres, dans l'ordre où `construireAttribution()` les envoie.
   C'est la seule table de correspondance du fichier, et elle est confrontée au
   code ci-dessous — pas à elle-même. */
const TYPES_PARAMETRES = Object.freeze({
  p_card_token: 'varchar',
  p_amount_spent: 'numeric',
  p_points_to_add: 'integer',
  p_staff_id: 'uuid',
})

/* ---------------------------------------------------------------------------
   0. LA GARDE QUI MANQUAIT — l'ordre des types, pas seulement leur présence.

   Trou mesuré le 2026-10-31, en exécutant pour de vrai :
   `to_regprocedure('public.award_loyalty_points(numeric,varchar,integer,uuid)')`
   → **NULL**. PostgreSQL identifie une fonction par ses types *dans l'ordre* ;
   `award` reçoit `p_card_token varchar` d'abord. La migration écrivait
   `(numeric, varchar, …)` : son premier `REVOKE` levait « function does not
   exist », et la transaction entière était annulée. Aucun test ne bronchait,
   parce que `A` portait la même erreur que le fichier : un vérificateur qui
   mesure le fichier avec sa propre constante ne mesure rien.

   D'où cette garde : la signature est confrontée à l'ordre réel des arguments
   que `construireAttribution()` produit. Inverser deux types casse ici, avant
   d'atteindre la base.
   ------------------------------------------------------------------------ */

test('signature : l’ordre des types de `award` est celui des arguments envoyés par le code', () => {
  const { nom, args } = construireAttribution({ jeton: 'C-AB12CD', montant: 12.5, points: 3 })
  assert.equal(nom, 'award_loyalty_points')

  const ordre = Object.keys(args).map((cle) => TYPES_PARAMETRES[cle])
  assert.deepEqual(
    ordre,
    ['varchar', 'numeric', 'integer'],
    'l’ordre des clés de `construireAttribution` a changé : la signature SQL doit suivre',
  )
  assert.equal(
    `award_loyalty_points(${ordre.join(', ')}, uuid)`,
    A,
    'la constante du test et le code ne disent plus la même signature',
  )
})

test('signature : la migration porte EXACTEMENT celle qu’on vient de vérifier', () => {
  const sql = sansCommentaires(readFileSync(MIGRATION, 'utf8'))
  assert.equal(sql.includes(`award_loyalty_points(${A.slice(A.indexOf('(') + 1, -1)})`), true)
  assert.equal(
    /award_loyalty_points\(\s*numeric\s*,\s*varchar/.test(sql),
    false,
    'ordre alphabétique de l’OpenAPI : le REVOKE ne trouve aucune fonction et la migration échoue',
  )
  assert.equal(sql.includes(`redeem_loyalty_reward(${R.slice(R.indexOf('(') + 1, -1)})`), true)
})

/* ---------------------------------------------------------------------------
   1. Découpage : un commentaire n'est pas du code.
   ------------------------------------------------------------------------ */

test('sansCommentaires : retire `--` et `/* … */`, garde le code', () => {
  const sql = 'a; -- revoke from anon\n/* grant to public */ b;'
  const nu = sansCommentaires(sql)
  assert.equal(nu.includes('anon'), false)
  assert.equal(nu.includes('public'), false)
  assert.equal(nu.includes('a;'), true)
  assert.equal(nu.includes('b;'), true)
})

test('instructions : découpe, normalise, ignore le vide', () => {
  const i = instructions('  REVOKE   execute\n ON FUNCTION f() FROM PUBLIC ;\n\n ; ')
  assert.deepEqual(i, ['revoke execute on function f() from public'])
})

test('signatureNormalisee : compacte les espaces des arguments', () => {
  assert.equal(signatureNormalisee('f', ' numeric ,  varchar ,integer '), 'f(numeric, varchar, integer)')
})

test('normaliser : minuscules et espaces compactés', () => {
  assert.equal(normaliser('  ALTER\n\tTABLE  x  '), 'alter table x')
})

/* ---------------------------------------------------------------------------
   2. Lecture des droits EXECUTE.
   ------------------------------------------------------------------------ */

test('droitsExecute : retire le préfixe `public.` et expose les rôles', () => {
  const d = droitsExecute(`revoke execute on function public.${A} from public, anon;`)
  assert.equal(d.length, 1)
  assert.equal(d[0].verbe, 'revoke')
  assert.equal(d[0].fonction, 'award_loyalty_points')
  assert.equal(d[0].signature, A)
  assert.deepEqual(d[0].roles, ['public', 'anon'])
})

test('droitsExecute : ignore un GRANT de table (pas une fonction)', () => {
  assert.deepEqual(droitsExecute('grant select on table public.clients to service_role;'), [])
})

/* ---------------------------------------------------------------------------
   3. Le piège fondateur, et son miroir.
   ------------------------------------------------------------------------ */

test('piège : `REVOKE … FROM anon` seul est un no-op — PUBLIC n’est pas révoqué', () => {
  const sql = `revoke execute on function public.${A} from anon;`
  assert.deepEqual(revoquesSansPublic(sql), [A])
  assert.deepEqual(rpcDurcies(sql), [])
})

test('piège : sans révoquer PUBLIC, accorder service_role ne durcit rien', () => {
  const sql = `revoke execute on function public.${A} from anon;\ngrant execute on function public.${A} to service_role;`
  assert.deepEqual(rpcDurcies(sql), [], 'PUBLIC garde son droit hérité')
  assert.deepEqual(revoquesSansPublic(sql), [A])
})

test('miroir : révoquer PUBLIC sans re-grader service_role casse le backend', () => {
  const sql = `revoke execute on function public.${A} from public;`
  assert.deepEqual(rpcDurcies(sql), [], 'aucun GRANT ne rend le droit au serveur')
})

test('forme durcie : PUBLIC révoqué ET service_role ré-granté — par rôle, pas sur la même ligne', () => {
  const sql = [
    `revoke execute on function public.${A} from public;`,
    `revoke execute on function public.${A} from anon;`,
    `grant  execute on function public.${A} to service_role;`,
  ].join('\n')
  assert.deepEqual(rpcDurcies(sql), [A])
  assert.deepEqual(revoquesSansPublic(sql), [])
})

/* ---------------------------------------------------------------------------
   4. RLS : activer oui, FORCER non, ouvrir jamais.
   ------------------------------------------------------------------------ */

test('tablesRlsActivee : lit les tables, ignore `DISABLE`', () => {
  const sql = [
    'alter table public.clients enable row level security;',
    'alter table "loyalty_cards" enable row level security;',
    'alter table public.loyalty_transactions disable row level security;',
  ].join('\n')
  assert.deepEqual(tablesRlsActivee(sql), ['clients'])
})

test('forceRls : `FORCE` est détecté — il soumettrait le propriétaire à la RLS', () => {
  const sql = 'alter table public.clients force row level security;'
  assert.equal(forceRls(sql).length, 1)
  assert.equal(forceRls('alter table public.clients enable row level security;').length, 0)
})

test('politiquesOuvrantes : `using (true)` et `to anon` détectés, `to service_role` non', () => {
  const ouv = [
    'create policy p on public.clients for select using (true);',
    'create policy p on public.clients for select to anon using (false);',
    'create policy p on public.clients for select to authenticated using (false);',
  ].join('\n')
  assert.equal(politiquesOuvrantes(ouv).length, 3)
  const ferme = 'create policy p on public.clients for all to service_role using (false);'
  assert.equal(politiquesOuvrantes(ferme).length, 0)
})

test('grantsTablesOuverts : un GRANT de table à anon annulerait le REVOKE', () => {
  assert.equal(grantsTablesOuverts('grant select on table public.clients to anon;').length, 1)
  assert.equal(grantsTablesOuverts('grant select on table public.clients to service_role;').length, 0)
})

test('grantsTablesOuverts : un GRANT EXECUTE de fonction n’est PAS un GRANT de table', () => {
  // Régression mesurée le 2026-10-31 : ce filtre comptait
  // `grant execute on function … to anon` comme une ouverture de table. Il
  // déclarait donc non conforme la seule migration correcte — celle qui rend
  // EXECUTE à `anon`, le rôle que la sonde a réellement exercé.
  const execute = [
    'grant execute on function public.f() to anon;',
    'grant execute on function public.f() to authenticated;',
    'grant execute on function public.f() to service_role;',
  ].join('\n')
  assert.deepEqual(grantsTablesOuverts(execute), [])

  // Un GRANT de table, lui, reste détecté — la correction ne desserre pas le
  // verrou qu'elle vise.
  assert.equal(grantsTablesOuverts('grant all on table public.clients to authenticated;').length, 1)

  // `grant execute on function … to service_role` ne doit pas non plus compter.
  assert.equal(grantsTablesOuverts('grant usage on schema public to anon;').length, 0)
})

test('occurrencesEnCode : un nom cité en commentaire ne compte pas', () => {
  const sql = `-- ne pas révoquer join_loyalty_program ici\nselect 1;`
  assert.equal(occurrencesEnCode(sql, 'join_loyalty_program'), 0)
  assert.equal(occurrencesEnCode('select join_loyalty_program();', 'join_loyalty_program'), 1)
})

/* ---------------------------------------------------------------------------
   5. Verdict d'ensemble : le périmètre est exact, ni moins ni plus.
   ------------------------------------------------------------------------ */

const MINIMAL = `
revoke execute on function public.${A} from public;
revoke execute on function public.${R} from public;
grant  execute on function public.${A} to service_role;
grant  execute on function public.${R} to service_role;
alter table public.clients enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.loyalty_transactions enable row level security;
`

test('auditer : un DDL minimal conforme est accepté', () => {
  const v = auditer(MINIMAL)
  assert.deepEqual(v.ecarts, [])
  assert.equal(v.ok, true)
  assert.deepEqual(v.rpcDurcies.sort(), [A, R].sort())
})

test('auditer : une 4e table sous RLS est hors périmètre mesuré', () => {
  const v = auditer(`${MINIMAL}\nalter table public.restaurants enable row level security;`)
  assert.equal(v.ok, false)
  assert.match(v.ecarts.join('\n'), /hors périmètre mesuré : restaurants/)
})

test('auditer : une RPC en trop est hors périmètre mesuré', () => {
  const enTrop = [
    'revoke execute on function public.autre() from public;',
    'grant  execute on function public.autre() to service_role;',
  ].join('\n')
  const v = auditer(`${MINIMAL}\n${enTrop}`)
  assert.equal(v.ok, false)
  assert.match(v.ecarts.join('\n'), /hors périmètre mesuré : autre\(\)/)
})

test('auditer : révoquer un objet absent de la base est signalé', () => {
  const v = auditer(`${MINIMAL}\nrevoke execute on function public.join_loyalty_program(varchar) from public;`)
  assert.equal(v.ok, false)
  assert.match(v.ecarts.join('\n'), /join_loyalty_program/)
})

/* ---------------------------------------------------------------------------
   6. La migration LIVRÉE doit passer — c'est l'assertion anti-régression.
   ------------------------------------------------------------------------ */

test('migration livrée : conforme, 2 RPC durcies, 3 tables sous RLS', () => {
  assert.equal(existsSync(MIGRATION), true, `migration absente : ${MIGRATION}`)
  const sql = readFileSync(MIGRATION, 'utf8')
  const v = auditer(sql)
  assert.deepEqual(v.ecarts, [])
  assert.deepEqual(v.rpcDurcies.sort(), [A, R].sort())
  assert.deepEqual(v.tablesRlsActivee.sort(), [...TABLES_MESUREES].sort())
})

test('migration livrée : anon ET authenticated révoqués, aucune politique créée', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  const roles = droitsExecute(sql).filter((d) => d.verbe === 'revoke').flatMap((d) => d.roles)
  for (const r of ['public', 'anon', 'authenticated']) {
    assert.equal(roles.includes(r), true, `aucun REVOKE visant ${r}`)
  }
  assert.equal(instructions(sql).filter((i) => i.startsWith('create policy')).length, 0)
  assert.equal(forceRls(sql).length, 0)
})

test('migration livrée : `join_loyalty_program` n’apparaît qu’en commentaire', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  assert.equal(sql.includes('join_loyalty_program'), true, 'la contrainte avant doit être documentée')
  assert.equal(occurrencesEnCode(sql, 'join_loyalty_program'), 0)
  assert.deepEqual(RPC_HORS_BASE, ['join_loyalty_program'])
})

/* ---------------------------------------------------------------------------
   7. Anti-dérive : les constantes du module suivent la mesure de R0.
   ------------------------------------------------------------------------ */

test('constantes : identiques à sonde-base.json (mesure R0)', { skip: !existsSync(CAPTURE) }, () => {
  const sonde = JSON.parse(readFileSync(CAPTURE, 'utf8'))
  assert.deepEqual(sonde.tables.map((t) => t.nom).sort(), [...TABLES_MESUREES].sort())

  /* L'OpenAPI trie les paramètres PAR NOM : `p_amount_spent` (numeric) précède
     `p_card_token` (varchar), alors que la définition SQL reçoit le jeton en
     premier. Comparer les deux **ordres** a donc fait passer pour juste une
     signature `(numeric, varchar, …)` que PostgreSQL refuse — `to_regprocedure`
     rend NULL. Cette capture ne peut pas trancher l'ordre : on ne lui demande
     que le multiensemble des types. L'ordre est gardé par le §0, contre
     `construireAttribution()`. */
  const typesTries = (s) => {
    const i = s.indexOf('(')
    return (
      s.slice(0, i) +
      '(' +
      s
        .slice(i + 1, -1)
        .split(',')
        .map((t) => t.trim())
        .sort()
        .join(', ') +
      ')'
    )
  }
  const depuisCapture = sonde.rpc
    .map((r) => {
      const args = r.parametres
        .map((p) => p.format.replace('character varying', 'varchar').replace('int32', 'integer'))
        .join(', ')
      return typesTries(`${r.nom}(${args})`)
    })
    .sort()

  assert.deepEqual(depuisCapture, RPC_MESUREES.map(typesTries).sort())
  assert.deepEqual(
    sonde.rpc.map((r) => r.nom).sort(),
    ['award_loyalty_points', 'redeem_loyalty_reward'],
    'la base ne porte pas exactement les deux RPC mesurées',
  )
})

/* ---------------------------------------------------------------------------
   8. Fusion de `0001` et `0002` — un seul fichier, donc plus d'ordre à subir.

   Le défaut d'origine n'était pas une faute de SQL : les deux migrations
   étaient justes séparément. C'était une faute d'ORDRE — `0002` annulait `0001`
   sur les `EXECUTE`, et appliquer `0001` en second retirait à `anon` et
   `authenticated` le seul chemin d'écriture qui fonctionnait. Aucun test ne
   pouvait le voir, puisque le socle n'a pas de session pour l'exercer.

   Les deux tests ci-dessous rendent la régression impossible :
     - il ne doit rester qu'UNE migration d'EXECUTE (pas de second fichier qui
       puisse passer après) ;
     - l'état FINAL de chaque signature doit être explicite : `anon`,
       `authenticated` et `service_role` finissent sur `GRANT`, `PUBLIC` sur
       `REVOKE`.
   ------------------------------------------------------------------------ */

test('fusion : `0002_r2_execute_rpc.sql` n’existe plus — une seule source', () => {
  assert.equal(
    existsSync(MIGRATION_ABSORBEE),
    false,
    '0002 doit être absorbée dans 0001 puis supprimée : deux fichiers = un ordre à subir'
  )
})

test('fusion : l’état final est explicite — GRANT pour qui sert, REVOKE pour PUBLIC', () => {
  const droits = droitsExecute(readFileSync(MIGRATION, 'utf8'))

  // Le DERNIER verbe de la séquence décide de l'état final : un `revoke` en
  // dernier annule tous les `grant` qui le précèdent, quel que soit leur ordre.
  const dernierVerbe = (signature, role) => {
    const suite = droits.filter((d) => d.signature === signature && d.roles.includes(role))
    return suite.length ? suite[suite.length - 1].verbe : null
  }

  for (const signature of [A, R]) {
    assert.equal(
      dernierVerbe(signature, 'public'),
      'revoke',
      `${signature} : PUBLIC doit finir révoqué`
    )
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        dernierVerbe(signature, role),
        'grant',
        `${signature} : ${role} doit finir accordé — sinon l'écriture est cassée`
      )
    }
  }
})

