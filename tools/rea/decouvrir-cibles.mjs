#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — découverte de cibles (S3 et suivantes).

   Le protocole interdit de DEVINER une route. Une cible n'entre dans un
   manifeste que si elle a été VUE : dans un `href` du HTML rendu, dans la
   charge RSC que Next.js sérialise (`href\":\"/equipe\"`), ou dans une requête
   que l'application a réellement émise (XHR/fetch/RSC prefetch) — c'est ce que
   `capturer-rendu.mjs` consigne dans `*.reseau.json`.

   Ce que l'outil fait, et rien de plus :
     - il lit les couples `<id>.html` + `<id>.reseau.json` d'une passe ;
     - il agrège chaque cible avec son MOTIF (pages sources, occurrences,
       statuts observés) ;
     - il normalise les routes paramétrées (`/customers/<uuid>` -> `/customers/:id`)
       pour que deux UUID différents ne comptent pas comme deux routes ;
     - il sépare le Supabase (hors périmètre de capture HTTP, matière A1) ;
     - il diffe contre un manifeste existant : « connue » ou « nouvelle ».

   Il n'émet AUCUNE requête réseau. Il ne décide pas : il propose, et le
   manifeste garde la décision et son motif.

   USAGE
     node tools/rea/decouvrir-cibles.mjs \
       --captures 01_REA_Fidelix/_captures/2026-10-27-auth-s3 \
       --connues   01_REA_Fidelix/_captures/cibles-auth-s3.json

     --json                 sortie machine (sinon tableau lisible)
     --sortie <fichier>     écrit le relevé complet (JSON) dans un fichier
     --seulement-nouvelles masque les cibles déjà connues

   GARDE-FOU : une route paramétrée n'est PAS capturée avec l'identifiant
   observé. Le manifeste doit déclarer un identifiant SYNTHÉTIQUE (UUID nul) :
   le statut 200/404 de la route se prouve sans extraire la fiche d'un client
   réel. La découverte remplace donc l'UUID par `:id` et le signale.
   ========================================================================== */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..') // FIDELIX/

export const BASE = 'https://fidelix.ma'
const HOTE = new URL(BASE).hostname

/** Extensions qui ne sont pas des routes : ce sont des fichiers. */
const EXT_ASSET =
  /\.(?:png|jpe?g|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|css|js|mjs|cjs|map|webmanifest|txt|xml|json|pdf|csv|zip)$/i

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ---------------------------------------------------------------------------
   1. Extraction — trois sources, une seule vérité : ce qui a été VU.
   ------------------------------------------------------------------------ */

/**
 * Tous les `href` d'un HTML rendu, dédoublonnés.
 *
 * Deux écritures coexistent dans une page Next.js App Router :
 *   - l'attribut HTML      <a href="/equipe">
 *   - la charge RSC        {\"href\":\"/equipe\"}   (backslash littéral)
 * N'en lire qu'une rate la moitié des liens : mesuré sur S2, `/billing` et
 * `/equipe` n'apparaissent QUE dans la charge RSC sur certaines pages.
 */
export function extraireHrefs(html) {
  const refs = new Set()
  for (const m of html.matchAll(/\bhref="([^"]+)"/g)) refs.add(m[1])
  for (const m of html.matchAll(/href\\":\\"([^"\\]+)\\"/g)) refs.add(m[1])
  return [...refs]
}


/**
 * Normalise une valeur de `href`/URL en chemin interne.
 * Renvoie `null` si ce n'est pas une route du site (externe, ancre, mailto…).
 */
export function normaliserChemin(brut) {
  if (typeof brut !== 'string') return null
  let s = brut.trim()
  if (!s || s.startsWith('#')) return null
  if (/^(?:mailto|tel|javascript|data|blob|sms|whatsapp):/i.test(s)) return null
  if (s.startsWith('//')) return null
  if (/^https?:\/\//i.test(s)) {
    let u
    try {
      u = new URL(s)
    } catch {
      return null
    }
    if (u.hostname !== HOTE) return null
    s = u.pathname
  }
  s = s.split('#')[0].split('?')[0]
  if (!s) return null
  if (!s.startsWith('/')) s = '/' + s
  return s.replace(/\/{2,}/g, '/')
}

/** Une route du site, ou un fichier ? */
export function estCible(chemin) {
  if (!chemin || !chemin.startsWith('/')) return false
  if (chemin.startsWith('/_next/')) return false
  if (EXT_ASSET.test(chemin)) return false
  return true
}

/**
 * Remplace les identifiants par un motif : deux fiches client ne sont pas
 * deux routes. On garde la forme, jamais la valeur.
 */
export function parametrer(chemin) {
  return chemin
    .split('/')
    .map((seg) => (UUID.test(seg) ? ':id' : /^\d{4,}$/.test(seg) ? ':n' : seg))
    .join('/')
}

/* ---------------------------------------------------------------------------
   2. Agrégation — chaque cible garde la trace de ce qui l'a fait exister.
   ------------------------------------------------------------------------ */

function ajouter(carte, cle, page, type, statut) {
  let e = carte.get(cle)
  if (!e) {
    e = { chemin: cle, occurrences: 0, types: new Set(), pages: new Set(), statuts: new Set() }
    carte.set(cle, e)
  }
  e.occurrences++
  e.types.add(type)
  e.pages.add(page)
  if (statut !== undefined && statut !== null) e.statuts.add(statut)
  return e
}

/**
 * Découvre les cibles de plusieurs rendus.
 * @param {{rendus: Array<{id: string, html: string, reseau?: object}>}} entree
 * @returns {{rendus: number, pages: Array, supabase: Array, ignores: Array}}
 */
export function decouvrir({ rendus }) {
  const pagesBrutes = new Map()
  const reseauBrut = new Map()
  const supabase = new Map()
  const ignores = new Map()

  const ignorer = (valeur, raison) => {
    const e = ignores.get(valeur) || { valeur, raison, occurrences: 0 }
    e.occurrences++
    ignores.set(valeur, e)
  }

  for (const { id, html, reseau } of rendus) {
    // La page capturée émet une requête `document` vers ELLE-MÊME : la compter
    // comme « découverte » rendrait le diff circulaire (chaque cible du
    // manifeste se prouverait elle-même). Mesuré : /abonnement et /account
    // apparaissaient comme « vus » alors qu'aucun lien ne les pointe.
    const urlPage = normaliserChemin(reseau?.url || '')

    // a) les liens : la preuve la plus directe qu'un humain peut cliquer.
    for (const brut of extraireHrefs(html || '')) {
      const chemin = normaliserChemin(brut)
      if (!chemin) {
        ignorer(brut, 'hors site ou non routable')
        continue
      }
      if (!estCible(chemin)) {
        ignorer(chemin, chemin.startsWith('/_next/') ? 'asset Next.js' : 'fichier, pas une route')
        continue
      }
      ajouter(pagesBrutes, chemin, id, 'href')
    }

    // b) les requêtes réellement émises : le motif le plus fort, parce que
    //    l'application les a appelées d'elle-même (fetch, RSC prefetch, XHR).
    for (const r of reseau?.requetes || []) {
      const brut = r.chemin || ''
      // Auto-référence : la page demandée n'est pas une découverte.
      if (r.type === 'document' && urlPage && normaliserChemin(brut) === urlPage) {
        ignorer(brut, 'la page capturée elle-même (auto-référence)')
        continue
      }
      if (/^https?:\/\//i.test(brut)) {
        let u
        try {
          u = new URL(brut)
        } catch {
          ignorer(brut, 'URL illisible')
          continue
        }
        if (u.hostname !== HOTE) {
          // Supabase : hors périmètre de capture HTTP (apikey + session), mais
          // matière première d'A1. On le nomme sans le tirer.
          const e = supabase.get(u.pathname) || {
            chemin: u.pathname,
            methodes: new Set(),
            pages: new Set(),
            occurrences: 0,
          }
          e.methodes.add(r.methode)
          e.pages.add(id)
          e.occurrences++
          supabase.set(u.pathname, e)
          continue
        }
      }
      const chemin = normaliserChemin(brut)
      if (!chemin) {
        ignorer(brut, 'non routable')
        continue
      }
      if (!estCible(chemin)) {
        ignorer(chemin, 'asset ou fichier (requête de rendu)')
        continue
      }
      ajouter(reseauBrut, chemin, id, r.type === 'fetch' || r.type === 'xhr' ? 'xhr' : 'document', r.statut)
    }
  }

  const fusion = (carte) =>
    [...carte.values()]
      .map((e) => ({
        chemin: e.chemin,
        motif: parametrer(e.chemin),
        occurrences: e.occurrences,
        types: [...e.types].sort(),
        pages: [...e.pages].sort(),
        statuts: [...e.statuts].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.occurrences - a.occurrences || a.chemin.localeCompare(b.chemin))

  // Une page vue ET appelée ne doit pas être comptée deux fois : la fusion se
  // fait par MOTIF, en gardant l'exemple concret quand il diffère du motif.
  const parMotif = new Map()
  for (const e of [...fusion(pagesBrutes), ...fusion(reseauBrut)]) {
    const existant = parMotif.get(e.motif)
    if (!existant) {
      const copie = { ...e }
      if (e.chemin !== e.motif) copie.exemple = e.chemin
      parMotif.set(e.motif, copie)
      continue
    }
    existant.occurrences += e.occurrences
    existant.types = [...new Set([...existant.types, ...e.types])].sort()
    existant.pages = [...new Set([...existant.pages, ...e.pages])].sort()
    existant.statuts = [...new Set([...existant.statuts, ...e.statuts])].sort((a, b) => a - b)
    if (!existant.exemple && e.chemin !== e.motif) existant.exemple = e.chemin
  }

  const pages = [...parMotif.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.motif.localeCompare(b.motif)
  )

  return {
    rendus: rendus.length,
    pages,
    supabase: [...supabase.values()]
      .map((e) => ({
        chemin: e.chemin,
        methodes: [...e.methodes].sort(),
        pages: [...e.pages].sort(),
        occurrences: e.occurrences,
      }))
      .sort((a, b) => a.chemin.localeCompare(b.chemin)),
    ignores: [...ignores.values()].sort((a, b) => b.occurrences - a.occurrences),
  }
}

/* ---------------------------------------------------------------------------
   3. Diff contre un manifeste — « connue » n'est pas « nouvelle ».
   ------------------------------------------------------------------------ */

export function comparer(releve, manifeste) {
  const connues = new Map()
  for (const p of manifeste?.pages || []) {
    const c = normaliserChemin(p.chemin)
    if (c) connues.set(parametrer(c), { famille: 'page', id: p.id })
  }
  for (const s of manifeste?.sondes || []) {
    const c = normaliserChemin(s.chemin)
    if (c) connues.set(parametrer(c), { famille: 'sonde', id: s.id })
  }
  const vues = new Set()
  const nouvelles = []
  const dejaConnues = []
  for (const e of releve.pages) {
    if (connues.has(e.motif)) {
      vues.add(e.motif)
      dejaConnues.push({ ...e, connu: connues.get(e.motif) })
    } else {
      nouvelles.push(e)
    }
  }
  // Une cible du manifeste absente de la passe n'est pas morte : elle peut
  // n'être liée par AUCUNE page (saisie directe, e-mail, QR code). On la liste
  // sans conclure — c'est une question posée, pas une réfutation.
  const disparues = [...connues.entries()]
    .filter(([k]) => !vues.has(k))
    .map(([motif, info]) => ({ motif, ...info }))
  return { nouvelles, connues: dejaConnues, disparues }
}

/** Format lisible d'un motif : « href×18 · 9 page(s) · HTTP 200 ». */
export function resumeMotif(e) {
  const parties = [`${e.types.join('+')}×${e.occurrences}`, `${e.pages.length} page(s)`]
  if (e.statuts.length) parties.push(`HTTP ${e.statuts.join('/')}`)
  return parties.join(' · ')
}

/* ---------------------------------------------------------------------------
   4. Lecture d'une passe + entrée CLI
   ------------------------------------------------------------------------ */

export async function lirePasse(dossierPasse) {
  const dossierRendu = join(dossierPasse, 'rendu')
  if (!existsSync(dossierRendu)) throw new Error(`dossier rendu introuvable : ${dossierRendu}`)
  const fichiers = (await readdir(dossierRendu)).filter((f) => f.endsWith('.html')).sort()
  const rendus = []
  for (const f of fichiers) {
    const id = f.replace(/\.html$/, '')
    const html = await readFile(join(dossierRendu, f), 'utf8')
    let reseau = null
    const cheminReseau = join(dossierRendu, `${id}.reseau.json`)
    if (existsSync(cheminReseau)) reseau = JSON.parse(await readFile(cheminReseau, 'utf8'))
    rendus.push({ id, html, reseau })
  }
  return rendus
}

async function principal() {
  const argv = process.argv.slice(2)
  const valeur = (n) => {
    const i = argv.indexOf(n)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const captures = valeur('--captures')
  if (!captures) {
    throw new Error(
      'usage : --captures <dossier de passe> [--connues <manifeste>] [--json] [--sortie <fichier>]'
    )
  }
  const dossierPasse = resolve(RACINE, captures)

  const rendus = await lirePasse(dossierPasse)
  const releve = decouvrir({ rendus })
  let diff = null
  if (valeur('--connues')) {
    const manifeste = JSON.parse(await readFile(resolve(RACINE, valeur('--connues')), 'utf8'))
    diff = comparer(releve, manifeste)
  }

  const sortie = {
    source: 'FIDELIX/tools/rea/decouvrir-cibles.mjs',
    passe: dossierPasse.replace(RACINE + '/', ''),
    horodatage: new Date().toISOString(),
    manifesteCompare: valeur('--connues') || null,
    rendus: releve.rendus,
    cibles: releve.pages.length,
    nouvelles: diff ? diff.nouvelles.length : null,
    releve,
    ...(diff ? { diff } : {}),
  }
  if (valeur('--sortie')) {
    const f = resolve(RACINE, valeur('--sortie'))
    await writeFile(f, JSON.stringify(sortie, null, 2) + '\n')
    console.log(`Relevé écrit : ${f.replace(RACINE + '/', '')}`)
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(sortie, null, 2))
    return 0
  }

  const nouvelles = diff ? new Set(diff.nouvelles.map((e) => e.motif)) : null
  const seulement = argv.includes('--seulement-nouvelles')
  console.log(`${releve.rendus} rendu(s) lu(s) · ${releve.pages.length} cible(s) distincte(s)\n`)

  if (releve.pages.length) {
    console.log('CIBLES')
    for (const e of releve.pages) {
      if (seulement && nouvelles && !nouvelles.has(e.motif)) continue
      const marque = !nouvelles ? '' : nouvelles.has(e.motif) ? '  ← NOUVEAU' : '  (au manifeste)'
      console.log(`  ${e.motif.padEnd(32)} ${resumeMotif(e)}${marque}`)
      if (e.exemple) console.log(`  ${''.padEnd(32)} observé : ${e.exemple}`)
    }
  }

  if (releve.supabase.length) {
    console.log('\nSUPABASE (hors capture HTTP — matière A1)')
    for (const e of releve.supabase) {
      console.log(`  ${e.chemin.padEnd(32)} ${e.methodes.join('+')}×${e.occurrences} · ${e.pages.length} page(s)`)
    }
  }

  if (diff) {
    console.log(
      `\n${diff.nouvelles.length} nouvelle(s) · ${diff.connues.length} déjà au manifeste · ` +
        `${diff.disparues.length} cible(s) du manifeste NON revue(s) dans cette passe`
    )
    if (diff.disparues.length) {
      console.log("  (non revue ≠ morte : une route peut n'être liée par aucune page)")
      for (const d of diff.disparues.slice(0, 12)) console.log(`  · ${d.motif} (${d.famille} ${d.id})`)
    }
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`decouvrir-cibles : ${e.message}`)
    process.exit(2)
  })
}
