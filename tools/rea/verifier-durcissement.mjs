#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — R1.2 : vérificateur de la migration de durcissement.

   Ce que l'outil fait : lit un fichier SQL, applique les invariants de R1.2
   (`durcissement.mjs`) et rend un verdict. Aucun réseau, aucune écriture en
   base, aucun secret.

   Ce que l'outil NE fait PAS : exécuter la migration. Le périmètre de R1.2
   interdit d'écrire sur la base ; ce vérificateur dit donc « le DDL porte les
   invariants », jamais « la base est durcie ». La seconde phrase demande une
   exécution, qui reste une décision humaine.

   USAGE
     node tools/rea/verifier-durcissement.mjs
     node tools/rea/verifier-durcissement.mjs --migration migrations/0001_acl_rls_durcissement.sql

   SORTIE : code 0 si tous les invariants tiennent, 1 sinon.
   ========================================================================== */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditer, RPC_MESUREES, TABLES_MESUREES, RPC_HORS_BASE } from './durcissement.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const argv = process.argv.slice(2)
const valeur = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}

const CHEMIN = resolve(
  RACINE,
  valeur('--migration') || 'migrations/0001_acl_rls_durcissement.sql',
)

async function main() {
  const sql = await readFile(CHEMIN, 'utf8')
  const v = auditer(sql)

  console.log(`Migration : ${CHEMIN}`)
  console.log(`  ${Buffer.byteLength(sql)} o`)

  console.log('\n— Périmètre attendu (mesuré en R0) —')
  for (const r of RPC_MESUREES) console.log(`  RPC   ${r}`)
  for (const t of TABLES_MESUREES) console.log(`  table ${t}`)

  console.log('\n— Constats —')
  console.log(`  RPC durcies            : ${v.rpcDurcies.length ? v.rpcDurcies.join(', ') : '—'}`)
  console.log(`  RLS activée            : ${v.tablesRlsActivee.join(', ') || '—'}`)
  console.log(`  REVOKE sans PUBLIC     : ${v.revoquesSansPublic.length}`)
  console.log(`  FORCE ROW LEVEL SEC.   : ${v.forceRls}`)
  console.log(`  Politiques permissives : ${v.politiquesOuvrantes}`)
  console.log(`  ${RPC_HORS_BASE} en code : ${v.occurrencesHorsBaseEnCode.length}`)

  if (v.ok) {
    console.log('\nVERDICT : CONFORME — le DDL porte les invariants de R1.2.')
    console.log('           (Ne dit rien de l’effet en base : le DDL est lu, pas exécuté.)')
    return
  }

  console.log('\nVERDICT : NON CONFORME')
  for (const e of v.ecarts) console.log(`  - ${e}`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`\nERREUR : ${e.message}`)
  process.exit(1)
})
