#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — R0 : sonde d'état basal de la base de reconstruction.

   Ce que l'outil fait, et rien d'autre :
     1. lit `FIDELIX/env.supabase.md` (gitignoré) et refuse un fichier
        incomplet ou incohérent ;
     2. `GET /rest/v1/` avec la clé `service_role` — la seule requête qui dise
        quelles tables et quelles RPC sont exposées, et avec quels types ;
     3. pour chaque table : `GET /rest/v1/<table>?select=*&limit=1` avec
        `Prefer: count=exact`, une fois en `service_role`, une fois en `anon` ;
        l'écart entre les deux mesure ce que GRANT et RLS laissent passer — pas
        la règle qui le décide ;
     4. confronte le résultat au modèle MESURÉ de la cible (`base.mjs`) ;
     5. écrit un artefact SANS aucune clé — garanti par `aucunSecret`, qui
        reçoit les secrets réels et lève s'il les retrouve dans la sortie.

   LECTURE SEULE par construction : la seule méthode émise est `GET`. Aucune RPC
   n'est appelée (PostgREST ne les sert qu'en POST, et une RPC écrit). Aucune
   ligne n'est créée, modifiée ni supprimée.

   USAGE
     node tools/rea/sonder-base.mjs
     node tools/rea/sonder-base.mjs --env FIDELIX/env.supabase.md
     node tools/rea/sonder-base.mjs --capture 2026-10-28-r0
   ========================================================================== */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  lireEnv,
  longueurSecrete,
  aucunSecret,
  colonnesDe,
  tablesDe,
  signaturesRpc,
  classerAcces,
  comparerModele,
  estConforme,
  MODELE_CONVERSATION,
  MODELE_SPECIFICATION,
} from './base.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')

const argv = process.argv.slice(2)
const valeur = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}

const CHEMIN_ENV = resolve(RACINE, valeur('--env') || 'env.supabase.md')
const CAPTURE = valeur('--capture') || `${new Date().toISOString().slice(0, 10)}-r0`

const METHODE = 'GET' // invariant : la sonde ne sait faire que lire

/** Un GET PostgREST avec la clé demandée : statut, en-tête de comptage, corps. */
async function get(url, cle, entetesSupplementaires = {}) {
  const r = await fetch(url, {
    method: METHODE,
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, ...entetesSupplementaires },
  })
  const texte = await r.text()
  return {
    statut: r.status,
    contentRange: r.headers.get('content-range'),
    corps: texte,
    json: (() => {
      try {
        return JSON.parse(texte)
      } catch {
        return null
      }
    })(),
  }
}

function messageErreur(reponse) {
  const j = reponse.json
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  return [j.code, j.message, j.hint].filter(Boolean).join(' · ') || null
}

async function main() {
  const brut = await readFile(CHEMIN_ENV, 'utf8')
  const env = lireEnv(brut)

  console.log(`Base sondée   : ${env.url}`)
  console.log(`Clé anon      : ${longueurSecrete(env.anon)}`)
  console.log(`Clé service   : ${longueurSecrete(env.service)}`)

  // 1. OpenAPI — seule source qui liste ce qui est exposé au rôle courant.
  const racine = await get(`${env.url}/rest/v1/`, env.service)
  const openapi = racine.json
  console.log(`\nGET /rest/v1/ → ${racine.statut} (${racine.corps.length} o)`)

  const artefact = {
    outil: 'tools/rea/sonder-base.mjs',
    horodatage: new Date().toISOString(),
    regle: 'GET uniquement ; aucune RPC appelée ; aucune écriture ; aucune clé dans la sortie',
    hote: env.url,
    openapi: { statut: racine.statut, octets: racine.corps.length },
    postgrest: openapi?.info?.version ?? null,
    tables: [],
    rpc: [],
    comparaison_modele_cible: null,
    conforme_modele_cible: false,
    non_mesure: [],
  }

  if (racine.statut !== 200 || !openapi) {
    artefact.non_mesure.push(
      `OpenAPI indisponible (${racine.statut}) : ni la liste des tables ni les signatures RPC ne sont mesurables.`,
    )
    await ecrire(artefact, env)
    console.log('\nOpenAPI fermé — aucune conclusion de modèle possible.')
    process.exit(2)
  }

  // 2. Tables : volumétrie + exposition par rôle.
  const tables = tablesDe(openapi)
  console.log(`Tables exposées : ${tables.length} → ${tables.join(', ')}`)

  for (const t of tables) {
    const url = `${env.url}/rest/v1/${t}?select=*&limit=1`
    const entete = { Prefer: 'count=exact' }
    const srv = await get(url, env.service, entete)
    const ano = await get(url, env.anon, entete)

    const colonnesOpenapi = colonnesDe(openapi.definitions[t])
    const colonnesVues = Array.isArray(srv.json) && srv.json[0] ? Object.keys(srv.json[0]) : []

    artefact.tables.push({
      nom: t,
      colonnes_openapi: colonnesOpenapi,
      colonnes_vues: colonnesVues,
      // `select=*` sert toutes les colonnes : un écart signalerait un filtre,
      // pas un oubli de notre part.
      colonnes_declarees_non_vues: colonnesOpenapi
        .map((c) => c.nom)
        .filter((c) => !colonnesVues.includes(c)),
      service_role: { ...classerAcces(srv), octets: srv.corps.length, erreur: messageErreur(srv) },
      anon: { ...classerAcces(ano), octets: ano.corps.length, erreur: messageErreur(ano) },
    })

    const s = artefact.tables.at(-1)
    console.log(
      `  ${t.padEnd(22)} service=${s.service_role.verdict}/${s.service_role.lignes} ` +
        `anon=${s.anon.verdict}/${s.anon.lignes} colonnes=${colonnesOpenapi.length}`,
    )
  }

  // 3. RPC : signature lue dans OpenAPI, jamais appelée.
  artefact.rpc = signaturesRpc(openapi)
  if (artefact.rpc.length) {
    console.log('\nRPC exposées (signature lue, non appelée) :')
    for (const r of artefact.rpc) {
      const requis = r.parametres.filter((p) => p.requis).map((p) => p.nom)
      console.log(`  ${r.nom}(${requis.join(', ')}) — méthodes ${r.methodes.join(',')}`)
    }
  }

  // 4. Confrontation aux TROIS références disponibles. Une seule base, trois
  //    modèles : celui qu'elle satisfait est celui dont elle est l'implémentation.
  const base = {}
  for (const t of artefact.tables) base[t.nom] = t.colonnes_openapi.map((c) => c.nom)

  artefact.comparaison_modele_cible = comparerModele(base)
  artefact.conforme_modele_cible = estConforme(artefact.comparaison_modele_cible)

  artefact.comparaison_conversation = comparerModele(base, MODELE_CONVERSATION)
  artefact.conforme_conversation = estConforme(artefact.comparaison_conversation)

  artefact.comparaison_specification = comparerModele(base, MODELE_SPECIFICATION)
  artefact.conforme_specification = estConforme(artefact.comparaison_specification)

  // 5. Ce que la sonde ne peut PAS dire — nommé, jamais laissé implicite.
  artefact.non_mesure.push(
    "RLS activée ou non : indissociable d'une table vide par une lecture. Il faut soit une ligne, soit `pg_policies` — non exposé par PostgREST.",
    "Politiques RLS effectives : la règle qui décide n'est pas lisible ; seule l'issue l'est (ligne renvoyée ou refus).",
    "Droits d'écriture (INSERT/UPDATE/DELETE) : les tester exigerait d'écrire. Non testés, donc non affirmés.",
    "EXECUTE sur les RPC pour `anon` : l'appeler serait une écriture. La présence dans OpenAPI prouve la ROUTE, pas le droit.",
    'Contraintes (UNIQUE, CHECK, NOT NULL) au-delà de la PK : non exposées par PostgREST.',
    'Triggers, index et extensions : hors de portée du REST.',
  )

  await ecrire(artefact, env)

  const c = artefact.comparaison_modele_cible
  console.log('\n— Triangulation : trois références, une seule base —')
  console.log(`  cible mesurée (A1)        : conforme = ${artefact.conforme_modele_cible}`)
  console.log(`  conversation.md           : conforme = ${artefact.conforme_conversation}`)
  console.log(`  Spécifications techniques : conforme = ${artefact.conforme_specification}`)

  console.log('\n— Écarts au modèle mesuré de la cible (A1) —')
  console.log(`  tables manquantes : ${c.tablesManquantes.join(', ') || '—'}`)
  console.log(`  tables en trop    : ${c.tablesEnPlus.join(', ') || '—'}`)

  for (const [nom, cle] of [
    ['conversation.md', 'comparaison_conversation'],
    ['Spécifications techniques', 'comparaison_specification'],
  ]) {
    const d = artefact[cle]
    const lignes = []
    for (const [t, v] of Object.entries(d.colonnes)) {
      if (v.nonMesuree) continue
      if (v.manquantes.length) lignes.push(`${t}.manquantes=[${v.manquantes.join(',')}]`)
      if (v.enPlus.length) lignes.push(`${t}.en_plus=[${v.enPlus.join(',')}]`)
    }
    if (lignes.length) {
      console.log(`\n  ${nom} — divergences avec la base :`)
      for (const l of lignes) console.log(`    ${l}`)
    }
  }
}

async function ecrire(artefact, env) {
  const texte = JSON.stringify(artefact, null, 2)
  if (!aucunSecret(texte, [env.anon, env.service])) {
    throw new Error('ARRÊT : la sortie contiendrait une clé — artefact non écrit')
  }
  const dossier = join(CAPTURES, CAPTURE)
  await mkdir(dossier, { recursive: true })
  const chemin = join(dossier, 'sonde-base.json')
  const contenu = texte + '\n'
  await writeFile(chemin, contenu)
  // `texte.length` compte des CARACTÈRES, pas des octets : les accents et les
  // tirets cadratins du JSON sont multi-octets (lesson §20.2, cas 35 653/35 632).
  // On mesure donc ce qui est réellement sur le disque, saut de ligne compris.
  console.log(`\nArtefact : ${chemin} (${Buffer.byteLength(contenu)} o, aucune clé)`)
}

main().catch((e) => {
  console.error(`\nERREUR : ${e.message}`)
  process.exit(1)
})

