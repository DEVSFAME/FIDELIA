#!/usr/bin/env node
/* ============================================================================
   R3 — prouver le rejeu de la caisse : deux POST, un seul `operationId`.

   Ce que l'outil fait : sonde la présence de `0016`, puis (avec `--confirmer`)
   émet DEUX fois la même opération et juge si elle a produit UNE transaction.

   Ce qu'il ne fait pas : exécuter la migration. Le DDL demande l'éditeur SQL du
   projet ou une clé `service_role` — l'outil mesure, il n'applique rien.

   Codes de sortie : 0 rejeu absorbé · 1 rejeu non absorbé · 2 `0016` absente ·
   3 aucun jeton d'écriture · 4 `--carte` manquant · 5 configuration illisible.

   USAGE
     node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718
     node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718 --confirmer
   ========================================================================== */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lireEnv, aucunSecret, longueurSecrete } from './base.mjs'
import { NOM_RPC_OPERATION } from '../../web/src/lib/file-caisse.mjs'
import { corpsSonde, corpsOperation, classerSonde, verdictRejeu } from './idempotence.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')

const argv = process.argv.slice(2)
const drapeau = (nom) => argv.includes(nom)
const valeur = (nom) => {
  const i = argv.indexOf(nom)
  return i >= 0 ? argv[i + 1] : undefined
}

const CONF = resolve(RACINE, valeur('--env') || 'web/.env.local')
const CARTE = valeur('--carte')
const MONTANT = Number(valeur('--montant') ?? 1)
const POINTS = Number(valeur('--points') ?? 1)
const CONFIRMER = drapeau('--confirmer')

const dire = (texte = '') => console.log(texte)
const sortir = (code, texte) => {
  dire(texte)
  process.exit(code)
}

/** `.env` / `.env.local` : `CLE=valeur`, commentaires ignorés, guillemets ôtés. */
async function lireDotEnv(chemin) {
  const texte = await readFile(chemin, 'utf8')
  const sortie = {}
  for (const ligne of texte.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne)
    if (m) sortie[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return sortie
}

/** Un POST PostgREST : statut + corps brut (le corps est la mesure). */
async function poster(url, { apikey, jeton }, corps) {
  const r = await fetch(`${url}/rest/v1/rpc/${NOM_RPC_OPERATION}`, {
    method: 'POST',
    headers: {
      apikey,
      authorization: `Bearer ${jeton}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, corps: await r.text() }
}

/**
 * Le jeton qui a le droit d'écrire : `0016` n'accorde `EXECUTE` qu'à
 * `authenticated` et `service_role`. Deux sources, la première sans boîte mail.
 */
async function accesEcriture({ url, anon }) {
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!service) {
    try {
      service = lireEnv(await readFile(join(RACINE, 'env.supabase.md'), 'utf8')).service
    } catch {
      service = '' // fichier absent ou incomplet : ce n'est pas une erreur ici
    }
  }
  if (service) return { apikey: service, jeton: service, role: 'service_role', secret: service }

  const email = process.env.FIDELIX_EMAIL
  const motDePasse = process.env.FIDELIX_MOT_DE_PASSE
  if (!email || !motDePasse) return null

  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: motDePasse }),
  })
  const lu = JSON.parse(await r.text())
  if (!r.ok || !lu.access_token) return null
  return { apikey: anon, jeton: lu.access_token, role: 'authenticated', secret: lu.access_token }
}

async function main() {
  let env
  try {
    env = await lireDotEnv(CONF)
  } catch {
    sortir(5, `Configuration illisible : ${CONF}`)
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) sortir(5, `Configuration incomplète : ${CONF} (URL ou clé publique absente)`)

  dire(`Config     : ${CONF}`)
  dire(`Clé anon   : ${longueurSecrete(anon)}`)

  /* ---- 1. La migration est-elle passée ? -------------------------------- */
  const sonde = classerSonde(await poster(url, { apikey: anon, jeton: anon }, corpsSonde()))
  dire(`Sonde 0016 : ${sonde.etat}${sonde.code ? ` (${sonde.code})` : ''}`)

  if (sonde.etat === 'absente') {
    sortir(
      2,
      [
        '',
        'VERDICT : 0016 ABSENTE — deux appels ne peuvent rien prouver.',
        '  La fonction n’est pas dans le cache de schéma de PostgREST.',
        '  Action (humaine) : coller `migrations/0016_operations_caisse.sql`',
        '  dans l’éditeur SQL du projet, puis relancer cette commande.',
        '  Rien à nettoyer en base : la sonde envoie `operation_id` nul,',
        '  que la fonction refuse avant toute écriture.',
      ].join('\n'),
    )
  }
  if (sonde.etat === 'inconnue') {
    sortir(1, `\nVERDICT : INDÉTERMINÉ — réponse non mesurée : ${sonde.message ?? '—'}`)
  }
  if (sonde.etat === 'appelable') {
    dire('  ⚠ `anon` atteint la fonction : le GRANT de 0016 est plus large qu’écrit.')
  }

  /* ---- 2. Le rejeu ------------------------------------------------------- */
  if (!CARTE) {
    sortir(
      4,
      [
        '',
        'VERDICT : --carte manquant — le rejeu crédite une carte réelle.',
        '  Fournir un `card_token` existant ; `join_loyalty_program()` en rend un',
        '  (carte créée par le parcours d’adhésion public, solde 0).',
      ].join('\n'),
    )
  }

  const acces = await accesEcriture({ url, anon })
  if (!acces) {
    sortir(
      3,
      [
        '',
        'VERDICT : AUCUN JETON D’ÉCRITURE — 0016 n’accorde `EXECUTE` qu’à',
        '  `authenticated` et `service_role`. Deux voies, sans secret dans le chat :',
        '    1. `SUPABASE_SERVICE_ROLE_KEY` dans `env.supabase.md` (ou l’environnement) ;',
        '    2. `FIDELIX_EMAIL` + `FIDELIX_MOT_DE_PASSE` d’un compte confirmé.',
        '  La clé publique ne suffit pas, et c’est voulu.',
      ].join('\n'),
    )
  }
  dire(`Jeton      : ${acces.role} (${longueurSecrete(acces.secret)})`)

  const operationId = randomUUID()
  const corps = corpsOperation({ operationId, jeton: CARTE, montant: MONTANT, points: POINTS })
  dire(`Opération  : ${operationId}`)
  dire(`Corps      : carte ${CARTE}, montant ${MONTANT}, points ${POINTS}`)

  if (!CONFIRMER) {
    sortir(
      0,
      [
        '',
        'RÉPÉTITION À BLANC — rien n’a été écrit.',
        '  Relancer avec `--confirmer` pour émettre les deux POST identiques :',
        '  le premier crédite, le second doit rendre `idempotent: true` et le',
        '  MÊME `new_balance` (un second crédit rendrait `X + 2p`).',
      ].join('\n'),
    )
  }

  const premier = await poster(url, acces, corps)
  dire(`POST 1/2   : ${premier.statut}`)
  const second = await poster(url, acces, corps)
  dire(`POST 2/2   : ${second.statut}`)

  const verdict = verdictRejeu({ premier, second })
  dire('')
  dire(
    verdict.ok
      ? 'VERDICT : REJEU ABSORBÉ — une seule transaction.'
      : 'VERDICT : REJEU NON ABSORBÉ.',
  )
  for (const r of verdict.raisons) dire(`  ✗ ${r}`)
  if (verdict.ok) {
    dire(`  transaction_id commun : ${verdict.premier.transaction_id}`)
    dire(`  solde rendu deux fois : ${verdict.premier.new_balance}`)
    dire(`  points rendus         : ${verdict.premier.points_added}`)
  }

  const artefact = {
    mesure: 'idempotence-caisse',
    le: new Date().toISOString(),
    fonction: NOM_RPC_OPERATION,
    sonde: sonde.etat,
    jeton: acces.role,
    operation_id: operationId,
    carte: CARTE,
    montant: MONTANT,
    points: POINTS,
    premier: verdict.premier,
    second: verdict.second,
    verdict: verdict.ok ? 'absorbe' : 'non_absorbe',
    raisons: verdict.raisons,
  }
  const texte = JSON.stringify(artefact, null, 2) + '\n'
  if (!aucunSecret(texte, [anon, acces.secret])) {
    sortir(1, 'ARRÊT : l’artefact contiendrait un secret — non écrit.')
  }
  await mkdir(CAPTURES, { recursive: true })
  const jour = new Date().toISOString().slice(0, 10)
  const chemin = join(CAPTURES, `mesure-idempotence-caisse-${jour}.json`)
  await writeFile(chemin, texte, 'utf8')
  dire(`\nArtefact   : ${chemin}`)

  process.exit(verdict.ok ? 0 : 1)
}

await main()
