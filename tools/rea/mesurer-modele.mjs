#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — A1 : mesure du modèle de données, LECTURE SEULE.

   Ce que l'outil fait, et rien d'autre :
     1. résout la session du profil (aucun secret en argument) ;
     2. en déduit la référence du projet Supabase et l'`access_token` ;
     3. lit la spécification OpenAPI du PostgREST (un GET) — c'est elle qui
        dit quelles tables et quelles RPC sont exposées AU RÔLE COURANT ;
     4. pour chaque table demandée : `GET /rest/v1/<table>?select=*&limit=N`
        avec `Prefer: count=exact`, et relève les NOMS de colonnes, les TYPES
        observés, la nullabilité et le nombre total de lignes ;
     5. refait le même GET SANS jeton (clé anon seule) : l'écart entre les deux
        est la mesure de ce que la RLS et les GRANT laissent passer ;
     6. relève la signature des RPC dans OpenAPI — et ne les appelle JAMAIS
        (PostgREST n'expose les fonctions qu'en POST).

   Aucune valeur n'est écrite : ni identifiant, ni nom, ni montant (§15).
   Le JSON de sortie ne contient que des noms de colonnes, des types et des
   comptages.

   USAGE
     node tools/rea/mesurer-modele.mjs
     node tools/rea/mesurer-modele.mjs --tables loyalty_programs,automations,customers,transactions,rewards
     node tools/rea/mesurer-modele.mjs --tirages 6 --echantillon 3 --profil "/chemin/profil"
   ========================================================================== */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resoudreSession, cookiesDepuisEnTete, BASE, SONDE_SESSION } from './session.mjs'
import {
  jetonDepuisCookies,
  accessTokenDepuisSession,
  chargeJwt,
  colonnesObservees,
  lireContentRange,
  resumerOpenapi,
  typeValeur,
} from './modele.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')

const argv = process.argv.slice(2)
const valeur = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const nombre = (n, defaut) => {
  const v = Number(valeur(n))
  return Number.isFinite(v) && v > 0 ? v : defaut
}

const TABLES = String(
  valeur('--tables') ||
    'loyalty_programs,automations,customers,transactions,rewards,restaurants,reward_tiers,till_sessions',
)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)

/** RPC vues dans les rendus ou les bundles ; on mesure leur EXISTENCE, pas leur signature. */
const RPC = String(
  valeur('--rpc') ||
    'classement_caisses,mon_role_point_de_vente,parrainages_du_commerce,journal_operateur,taux_desinscription_wallet,notifications_envoyees_aujourdhui',
)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)
const TIRAGES = nombre('--tirages', 3)
const ECHANTILLON = nombre('--echantillon', 3)
const SORTIE = resolve(valeur('--sortie') || join(CAPTURES, '2026-10-27-a1'))

async function lireEnv() {
  const chemin = join(RACINE, '.env')
  if (!existsSync(chemin)) return {}
  const env = {}
  for (const ligne of (await readFile(chemin, 'utf8')).split('\n')) {
    const l = ligne.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/** Liste récursive des fichiers sous `dir` (assets Next.js, un seul niveau en pratique). */
async function fichiersRecursifs(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await fichiersRecursifs(p, acc)
    else acc.push(p)
  }
  return acc
}

/**
 * La clé `anon` est publique par conception — elle est dans le HTML servi.
 * On ne la recopie ni dans un doc ni dans un log : on la relit dans les assets
 * DÉJÀ capturés, et on ne rend que sa provenance.
 */
async function trouverCleAnon(ref) {
  const dossiers = (await readdir(CAPTURES, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => join(CAPTURES, e.name, 'raw', 'assets'))
  const fichiers = []
  for (const d of dossiers) await fichiersRecursifs(d, fichiers)

  for (const f of fichiers) {
    let texte
    try {
      texte = await readFile(f, 'utf8')
    } catch {
      continue
    }
    for (const m of texte.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
      const charge = chargeJwt(m[0])
      if (charge && charge.role === 'anon' && (!charge.ref || charge.ref === ref)) {
        return { cle: m[0], source: f.replace(RACINE + '/', '') }
      }
    }
  }
  return { cle: null, source: null }
}


/**
 * Un cookie présent n'est pas un jeton VALIDE (mesuré ici : le cookie du profil
 * portait un `access_token` expiré depuis 22 min, et PostgREST répondait
 * `PGRST303 JWT expired` alors que `/dashboard` répondait 200).
 *
 * Le rafraîchissement se fait par un simple GET de la sonde de session : c'est
 * l'APPLICATION qui renouvelle son jeton et réécrit ses cookies ; nous
 * n'émettons aucun POST et ne touchons pas au `refresh_token` nous-mêmes.
 */
async function rafraichirDepuisProfil(profil) {
  const { chromium } = await import('playwright')
  let contexte
  try {
    contexte = await chromium.launchPersistentContext(profil, { headless: true })
    const page = await contexte.newPage()
    const reponse = await page.goto(BASE + SONDE_SESSION, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    // Le middleware SSR écrit les nouveaux cookies pendant/après la réponse.
    await page.waitForTimeout(2_500)
    const cookies = (await contexte.cookies(BASE)).filter((c) =>
      (c.domain || '').replace(/^\./, '').endsWith('fidelix.ma'),
    )
    return { statut: reponse ? reponse.status() : null, cookies }
  } catch (e) {
    return { statut: null, cookies: [], erreur: String(e.message || e).split('\n')[0] }
  } finally {
    if (contexte) await contexte.close().catch(() => {})
  }
}


async function appeler(url, { apikey, jeton, accept = 'application/json', methode = 'GET' } = {}) {
  const entetes = { apikey, Accept: accept }
  if (jeton) entetes.Authorization = `Bearer ${jeton}`
  if (methode === 'GET') entetes.Prefer = 'count=exact'
  let reponse
  try {
    reponse = await fetch(url, { method: methode, headers: entetes, signal: AbortSignal.timeout(25_000) })
  } catch (e) {
    return { erreur: String(e.message || e), statut: null }
  }
  const texte = await reponse.text()
  let json = null
  try {
    json = JSON.parse(texte)
  } catch {
    /* PostgREST renvoie du JSON ; sinon on garde un extrait pour le diagnostic */
  }
  return {
    statut: reponse.status,
    contentRange: reponse.headers.get('content-range'),
    typeContenu: reponse.headers.get('content-type'),
    json,
    texte: json ? null : texte.slice(0, 400),
  }
}

const erreurPg = (r) =>
  r && r.json && typeof r.json === 'object' && (r.json.code || r.json.message)
    ? {
        code: r.json.code || null,
        message: r.json.message || null,
        details: r.json.details || null,
        hint: r.json.hint || null,
      }
    : null

async function main() {
  const env = await lireEnv()
  const profil = valeur('--profil')
  const session = await resoudreSession({
    env,
    profil: profil ? resolve(profil) : null,
    profilDefaut: join(RACINE, '.profil-rea'),
  })

  console.log(`Session     : ${session.source}`)
  if (!session.auth) {
    console.error("VERDICT : session ABSENTE — aucune mesure lancée, rien n'a été écrit.")
    process.exit(2)
  }

  // `resoudreSession` rend l'en-tête (voie .env) OU les cookies (voie profil).
  // On repasse toujours par l'en-tête : un seul chemin, donc un seul bug possible.
  let cookies = session.cookies || cookiesDepuisEnTete(session.cookie || '')
  let rafraichi = null

  if (session.profil) {
    const avant = accessTokenDepuisSession(jetonDepuisCookies(cookies).valeur)
    const expAvant = (chargeJwt(avant) || {}).exp || null
    const maintenant = Math.floor(Date.now() / 1000)
    const expire = expAvant !== null && expAvant <= maintenant + 30
    if (expire) {
      console.log(`Jeton       : expiré (exp ${expAvant}) — rafraîchissement par GET ${SONDE_SESSION}`)
      const r = await rafraichirDepuisProfil(session.profil)
      rafraichi = { statutHttp: r.statut, erreur: r.erreur || null, cookies: r.cookies.length }
      if (r.cookies.length) cookies = r.cookies
    }
  }

  const { ref, valeur: brut } = jetonDepuisCookies(cookies)
  const jeton = accessTokenDepuisSession(brut)
  const charge = chargeJwt(jeton)
  console.log(`Projet      : ${ref ? ref.slice(0, 6) + '…' : 'inconnu'} (référence lue dans le cookie)`)
  console.log(
    `Jeton       : ${jeton ? 'présent' : 'ABSENT'}${charge ? ` — rôle ${charge.role || '?'}, exp ${charge.exp || '?'}` : ''}`,
  )
  if (!ref || !jeton) {
    console.error("VERDICT : impossible de dériver le projet ou le jeton — rien n'a été écrit.")
    process.exit(2)
  }
  const maintenant = Math.floor(Date.now() / 1000)
  if (!charge || !charge.exp || charge.exp <= maintenant) {
    console.error(
      `VERDICT : le jeton est encore expiré après rafraîchissement (exp ${charge && charge.exp}) — rien n'a été écrit.`,
    )
    process.exit(4)
  }

  const urlBase = `https://${ref}.supabase.co`
  const { cle: apikey, source: sourceCle } = await trouverCleAnon(ref)
  if (!apikey) {
    console.error("VERDICT : clé anon introuvable dans les assets capturés — rien n'a été écrit.")
    process.exit(3)
  }
  console.log(`Clé anon    : trouvée dans ${sourceCle} (publique, non recopiée)`)

  const mesures = {
    outil: 'FIDELIX/tools/rea/mesurer-modele.mjs',
    horodatage: new Date().toISOString(),
    projet: ref,
    urlBase,
    session: { source: session.source, role: charge.role || null, exp: charge.exp || null },
    rafraichissement: rafraichi,
    tablesDemandees: TABLES,
    tirages: TIRAGES,
    echantillon: ECHANTILLON,
    openapi: null,
    tables: [],
    rpc: [],
  }


  /* 0. Diagnostic demandé : pourquoi la racine refuse-t-elle ? (GET seulement) */
  if (argv.includes('--diag-openapi')) {
    const variantes = [
      { nom: 'apikey + openapi', url: `${urlBase}/rest/v1/`, entetes: { apikey, Accept: 'application/openapi+json' } },
      { nom: 'apikey + jeton + openapi', url: `${urlBase}/rest/v1/`, entetes: { apikey, Accept: 'application/openapi+json', Authorization: `Bearer ${jeton}` } },
      { nom: 'apikey + jeton + json', url: `${urlBase}/rest/v1/`, entetes: { apikey, Accept: 'application/json', Authorization: `Bearer ${jeton}` } },
      { nom: 'apikey + jeton + openapi, sans slash', url: `${urlBase}/rest/v1`, entetes: { apikey, Accept: 'application/openapi+json', Authorization: `Bearer ${jeton}` } },
      { nom: 'apikey + jeton + openapi, table témoin', url: `${urlBase}/rest/v1/loyalty_programs?select=*&limit=1`, entetes: { apikey, Accept: 'application/openapi+json', Authorization: `Bearer ${jeton}` } },
    ]
    for (const v of variantes) {
      let r
      try {
        r = await fetch(v.url, { headers: v.entetes, signal: AbortSignal.timeout(20_000) })
      } catch (e) {
        console.log(`${v.nom.padEnd(46)} ERREUR ${e.message}`)
        continue
      }
      const t = await r.text()
      console.log(`${v.nom.padEnd(46)} HTTP ${r.status} ${r.headers.get('content-type') || ''} | ${t.slice(0, 120)}`)
    }
    return
  }

  /* 1. OpenAPI — la seule source qui décrive le schéma exposé au rôle courant. */
  const openapi = await appeler(`${urlBase}/rest/v1/`, {
    apikey,
    jeton,
    accept: 'application/openapi+json',
  })
  const resume = openapi.json ? resumerOpenapi(openapi.json) : { tables: [], rpc: [] }
  mesures.openapi = {
    statut: openapi.statut,
    tables: resume.tables.length,
    rpc: resume.rpc.length,
    erreur: erreurPg(openapi),
  }
  console.log(
    `\nOpenAPI     : HTTP ${openapi.statut} — ${resume.tables.length} table(s), ${resume.rpc.length} RPC exposées au rôle`,
  )

  await mkdir(SORTIE, { recursive: true })
  if (openapi.json) {
    await writeFile(join(SORTIE, 'openapi.json'), JSON.stringify(openapi.json, null, 2))
  }

  /* 2. Colonnes réellement renvoyées, et stabilité sur N tirages. */
  for (const table of TABLES) {
    const declaree = resume.tables.find((t) => t.nom === table) || null
    const url = `${urlBase}/rest/v1/${table}?select=*&limit=${ECHANTILLON}`
    const avec = await appeler(url, { apikey, jeton })
    const colonnes = avec.json && Array.isArray(avec.json) ? colonnesObservees(avec.json) : []

    // Stabilité : mêmes noms de colonnes et même total sur N tirages ?
    const formes = new Set()
    const totaux = new Set()
    for (let i = 0; i < TIRAGES; i++) {
      const r = i === 0 ? avec : await appeler(url, { apikey, jeton })
      const cols = r.json && Array.isArray(r.json) ? colonnesObservees(r.json).map((c) => c.nom).sort() : null
      formes.add(cols ? cols.join(',') : `HTTP ${r.statut}`)
      const cr = lireContentRange(r.contentRange)
      if (cr && cr.total !== null) totaux.add(cr.total)
    }

    // 3. Sans jeton : la clé anon seule. L'écart est la mesure RLS/GRANT.
    const sans = await appeler(url, { apikey })
    const colonnesSans = sans.json && Array.isArray(sans.json) ? colonnesObservees(sans.json) : []

    const mesure = {
      table,
      url: `/rest/v1/${table}?select=*&limit=${ECHANTILLON}`,
      avecSession: {
        statut: avec.statut,
        total: (lireContentRange(avec.contentRange) || {}).total ?? null,
        colonnes,
        erreur: erreurPg(avec),
      },
      sansJeton: {
        statut: sans.statut,
        total: (lireContentRange(sans.contentRange) || {}).total ?? null,
        colonnes: colonnesSans.map((c) => c.nom),
        erreur: erreurPg(sans),
      },
      declaree: declaree
        ? { exposee: true, colonnes: declaree.colonnes, methodes: declaree.methodes }
        : { exposee: false, colonnes: [], methodes: [] },
      stabilite: { tirages: TIRAGES, formes: formes.size, totaux: [...totaux] },
    }
    mesures.tables.push(mesure)

    const etat =
      avec.statut >= 200 && avec.statut < 300
        ? `${colonnes.length} colonne(s), ${mesure.avecSession.total ?? '?'} ligne(s)`
        : `HTTP ${avec.statut}${mesure.avecSession.erreur ? ' ' + mesure.avecSession.erreur.code : ''}`
    console.log(
      `${table.padEnd(18)} avec session : ${etat.padEnd(34)} | anon : HTTP ${sans.statut}` +
        ` | formes ${mesure.stabilite.formes}/${TIRAGES}`,
    )
  }

  /* 4. Relations mesurées par EMBEDDING PostgREST : `select=*,cible(*)`.
        Un 200 avec clé imbriquée prouve la relation ; PGRST200 prouve son
        absence. Aucune valeur n'est conservée — seulement sa forme. */
  const lisibles = mesures.tables.filter((t) => t.avecSession.statut >= 200 && t.avecSession.statut < 300)
  mesures.relations = []
  if (lisibles.length > 1) {
    console.log(`\nRelations (embedding, GET) :`)
    for (const src of lisibles) {
      for (const cible of lisibles) {
        if (cible.table === src.table) continue
        const r = await appeler(
          `${urlBase}/rest/v1/${src.table}?select=*,${cible.table}(*)&limit=1`,
          { apikey, jeton },
        )
        const ligne = Array.isArray(r.json) ? r.json[0] : null
        const imbrique =
          ligne && Object.prototype.hasOwnProperty.call(ligne, cible.table)
            ? typeValeur(ligne[cible.table])
            : null
        mesures.relations.push({
          source: src.table,
          cible: cible.table,
          statut: r.statut,
          imbrique,
          observable: Boolean(ligne),
          erreur: erreurPg(r),
        })
        const ok = r.statut >= 200 && r.statut < 300
        const marque = imbrique
          ? `relation mesurée (${imbrique})`
          : ok
            ? ligne
              ? 'aucune relation (réponse sans clé imbriquée)'
              : 'non observable (0 ligne renvoyée)'
            : `HTTP ${r.statut} ${(erreurPg(r) || {}).code || ''}`.trim()
        console.log(`  ${src.table} -> ${cible.table} : ${marque}`)
      }
    }
  }

  /* 5. RPC : EXISTENCE seulement. Get sur /rpc/<nom> — PostgREST ne les sert
        qu'en POST, donc aucun corps n'est exécuté. La signature reste inconnue. */
  mesures.rpc = []
  console.log(`\nRPC (existence seule — aucun appel POST) :`)
  // Témoin négatif : un nom inventé. Si sa réponse est identique à celle des
  // vraies RPC, la sonde ne discrimine rien et on le dira au lieu de conclure.
  const temoin = 'zzz_temoin_rea_inexistant'
  for (const nom of [...RPC, temoin]) {
    const r = await appeler(`${urlBase}/rest/v1/rpc/${nom}`, { apikey, jeton })
    const err = erreurPg(r)
    mesures.rpc.push({ nom, temoin: nom === temoin, statut: r.statut, erreur: err })
    console.log(`  ${nom.padEnd(34)} HTTP ${r.statut} ${err ? (err.code || '') + ' ' + (err.message || '') : ''}`.trimEnd())
  }

  await writeFile(join(SORTIE, 'modele.json'), JSON.stringify(mesures, null, 2))
  console.log(`\nÉcrit : ${SORTIE.replace(RACINE + '/', '')}/modele.json (noms/types uniquement, aucune valeur)`)
  console.log('VERDICT : mesure A1 terminée — aucun POST, aucune écriture sur la production.')
}

main().catch((e) => {
  console.error('ERREUR :', e && e.stack ? e.stack : e)
  process.exit(1)
})
