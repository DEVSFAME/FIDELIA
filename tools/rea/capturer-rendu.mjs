#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — capture RENDUE (Playwright).

   Complète `capturer-fidelix.mjs`, qui ne voit que le HTML servi. Ici on
   observe l'état RÉELLEMENT rendu : DOM après hydratation, capture pleine
   page, console, et surtout les requêtes XHR/fetch que l'application émet
   d'elle-même — c'est la matière première des contrats d'écriture.

   USAGE
     node tools/rea/capturer-rendu.mjs --manifeste 01_REA_Fidelix/_captures/cibles-auth.json
     node tools/rea/capturer-rendu.mjs --manifeste … --cdp http://127.0.0.1:9222
     node tools/rea/capturer-rendu.mjs --manifeste … --profil "/chemin/profil"
     node tools/rea/capturer-rendu.mjs --manifeste … --mobile --ecraser

   SESSION (une des trois, jamais un secret en argument)
     FIDELIX_COOKIE=…   voie A — cookies injectés dans un contexte neuf
     --cdp <url>        voie B — Chrome DÉJÀ connecté, lancé avec
                        --remote-debugging-port=9222
     --profil <dir>     voie B' — profil Chrome persistant, Chrome FERMÉ

   Refus explicite : si l'application sert une AUTRE route que celle demandée
   (ex. `/admin` -> `/dashboard` quand le rôle ne suffit pas, ou `/login`
   quand on est déjà connecté), aucun fichier n'est écrit pour cette cible —
   un DOM enregistré sous le nom d'un module qu'il n'est pas serait une preuve
   fausse.
   ========================================================================== */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { cookiesDepuisEnTete } from './session.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')
const BASE = 'https://fidelix.ma'

const argv = process.argv.slice(2)
const option = (n) => argv.includes(n)
const valeur = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

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

/** « a=1; b=2 » → cookies Playwright pour fidelix.ma (implémentation partagée). */
/** Capture d'une cible. Ne devine rien : mesure, puis accepte ou rejette. */
async function capturerCible(contexte, cible, dossier, options) {
  const page = await contexte.newPage({
    viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  })
  const reseau = []
  const journaux = []
  const parUrl = new Map()

  page.on('request', (r) => {
    const e = { methode: r.method(), url: r.url(), type: r.resourceType(), statut: null }
    reseau.push(e)
    parUrl.set(r.url(), e)
  })
  page.on('response', (r) => {
    const e = parUrl.get(r.url())
    if (e) e.statut = r.status()
  })
  page.on('console', (m) =>
    journaux.push({ source: 'console', type: m.type(), texte: m.text().slice(0, 400) })
  )
  page.on('pageerror', (e) =>
    journaux.push({ source: 'pageerror', type: 'error', texte: String(e.message || e).slice(0, 400) })
  )

  let http = null
  let erreur = null
  try {
    const rep = await page.goto(BASE + cible.chemin, { waitUntil: 'domcontentloaded', timeout: 45000 })
    http = rep ? rep.status() : null
    // `networkidle` peut ne jamais se stabiliser (polling) : on le borne.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200) // laisse l'hydratation peindre l'état
  } catch (e) {
    erreur = e.message.split('\n')[0]
  }

  const urlFinale = page.url()
  let cheminFinal = urlFinale
  try {
    cheminFinal = new URL(urlFinale).pathname
  } catch {
    /* URL illisible : on garde la chaîne brute */
  }
  const cheminVise = cible.chemin.split('?')[0]
  /* Rejet : si l'application sert une AUTRE route que celle demandée, le
     DOM/PNG produit ne représente pas la cible. Cas mesurés le 2026-10-26 sur
     ce compte : `/admin` -> `/dashboard` (rôle insuffisant) et `/onboarding`
     -> `/dashboard` (déjà onboardé). Les archiver sous le nom du module serait
     une fausse preuve ; `/login` est un cas particulier de la même règle. */
  const nu = (p) => '/' + String(p).replace(/^\/+|\/+$/g, '')
  const cheminDerive = nu(cheminFinal) === nu(cheminVise) ? null : cheminFinal
  const rejete = cheminDerive
    ? `atterri sur ${cheminDerive} — aucun fichier écrit (route différente de ${cheminVise})`
    : null

  // Les seuls faits utiles aux contrats : méthode + chemin + statut.
  const vue = (r) => {
    try {
      return `${r.methode} ${new URL(r.url).pathname} ${r.statut ?? '—'}`
    } catch {
      return `${r.methode} ${r.url.slice(0, 120)} ${r.statut ?? '—'}`
    }
  }
  const apiObservee = [...new Set(reseau.filter((r) => r.url.includes('/api/')).map(vue))]
  const supabaseObserve = [...new Set(reseau.filter((r) => r.url.includes('.supabase.co')).map(vue))]

  const commun = {
    id: cible.id,
    chemin: cible.chemin,
    http,
    urlFinale,
    redirection: cheminFinal !== cheminVise,
    erreur,
    apiObservee,
    supabaseObserve,
    journaux: journaux.length,
  }

  if (rejete) {
    await page.close()
    return { ...commun, rejete }
  }

  await mkdir(dossier, { recursive: true })
  const png = await page.screenshot({ fullPage: true })
  const html = await page.content()
  const titre = await page.title()

  await writeFile(join(dossier, `${cible.id}.png`), png)
  await writeFile(join(dossier, `${cible.id}.html`), html)
  // Le réseau est conservé SANS les valeurs de query (jetons, identifiants).
  await writeFile(
    join(dossier, `${cible.id}.reseau.json`),
    JSON.stringify(
      {
        url: urlFinale,
        http,
        apiObservee,
        supabaseObserve,
        journaux,
        requetes: reseau.map((r) => ({
          methode: r.methode,
          chemin: r.url.replace(/\?.*$/, '?…'),
          type: r.type,
          statut: r.statut,
        })),
      },
      null,
      2
    ) + '\n'
  )
  await page.close()

  return {
    ...commun,
    titre,
    png: { octets: png.length, sha256: sha256(png) },
    html: { octets: Buffer.byteLength(html), sha256: sha256(Buffer.from(html)) },
  }
}


/* ---------------------------------------------------------------------------
   Entrée
   ------------------------------------------------------------------------ */

try {
  const env = await lireEnv()
  const cheminManifeste = resolve(
    RACINE,
    valeur('--manifeste') || '01_REA_Fidelix/_captures/cibles-auth.json'
  )
  if (!existsSync(cheminManifeste)) throw new Error(`manifeste introuvable : ${cheminManifeste}`)
  const manifeste = JSON.parse(await readFile(cheminManifeste, 'utf8'))
  const modeAttendu = manifeste.modeAttendu || 'ANONYME'

  const cdp = valeur('--cdp')
  const profil = valeur('--profil')
  const mode = cdp ? 'CDP' : profil ? 'PROFIL' : env.FIDELIX_COOKIE ? 'COOKIE' : 'ANONYME'

  console.log(`Manifeste : ${cheminManifeste.replace(RACINE + '/', '')}`)
  console.log(`Cibles    : ${manifeste.pages.length} · session ${mode} · mode exigé ${modeAttendu}`)

  if (modeAttendu === 'AUTHENTIFIÉ' && mode === 'ANONYME' && !option('--force-mode')) {
    throw new Error(
      "session absente — rien n'a été capturé. Mesure d'abord : " +
        'node tools/rea/capturer-fidelix.mjs --preflight --manifeste ' +
        cheminManifeste.replace(RACINE + '/', '')
    )
  }

  const dossier = join(CAPTURES, manifeste.date, 'rendu')
  const ledgerPath = join(CAPTURES, manifeste.date, 'rendu.json')
  if (existsSync(ledgerPath) && !option('--ecraser')) {
    throw new Error(
      `ledger déjà présent : ${ledgerPath.replace(RACINE + '/', '')} — ` +
        `l'écraser détruirait la preuve. Passe --ecraser pour refaire.`
    )
  }

  let navigateur = null
  let contexte = null
  let fermer = null

  if (cdp) {
    // Voie B : on s'attache à un Chrome DÉJÀ connecté. Aucun cookie manipulé.
    navigateur = await chromium.connectOverCDP(cdp)
    contexte = navigateur.contexts()[0]
    if (!contexte) throw new Error('CDP : aucun contexte de navigateur exposé.')
    fermer = () => navigateur.close()
  } else if (profil) {
    // Voie B' : profil persistant (Chrome doit être FERMÉ, sinon verrou).
    contexte = await chromium.launchPersistentContext(profil, {
      headless: false,
      viewport: option('--mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: 'fr-FR',
    })
    if (env.FIDELIX_COOKIE) await contexte.addCookies(cookiesDepuisEnTete(env.FIDELIX_COOKIE))
    fermer = () => contexte.close()
  } else {
    // Voie A : contexte neuf + cookies injectés depuis FIDELIX/.env.
    navigateur = await chromium.launch({ headless: true })
    contexte = await navigateur.newContext({
      viewport: option('--mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: 'fr-FR',
    })
    if (env.FIDELIX_COOKIE) await contexte.addCookies(cookiesDepuisEnTete(env.FIDELIX_COOKIE))
    fermer = () => navigateur.close()
  }

  const releves = []
  for (const cible of manifeste.pages) {
    const r = await capturerCible(contexte, cible, dossier, { mobile: option('--mobile') })
    releves.push(r)
    const marque = r.rejete ? 'REJETÉ' : r.erreur ? 'ERR   ' : `${String(r.http).padEnd(3)}   `
    const fin = r.redirection ? ` -> ${r.urlFinale.replace(BASE, '')}` : ''
    console.log(`${marque} ${cible.chemin}${fin}${r.rejete ? '  (' + r.rejete + ')' : ''}`)
  }
  await fermer()

  const ledger = {
    passe: manifeste.passe,
    manifeste: cheminManifeste.replace(RACINE + '/', ''),
    date: manifeste.date,
    horodatage: new Date().toISOString(),
    source: 'FIDELIX/tools/rea/capturer-rendu.mjs',
    base: BASE,
    mode,
    modeAttendu,
    viewport: option('--mobile') ? '390x844' : '1440x900',
    cibles: releves.length,
    captures: releves.filter((r) => r.png).length,
    rejetees: releves.filter((r) => r.rejete).length,
    erreurs: releves.filter((r) => r.erreur).length,
    releves,
  }

  await mkdir(join(CAPTURES, manifeste.date), { recursive: true })
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n')
  console.log(`\nLedger : ${ledgerPath.replace(RACINE + '/', '')}`)
  console.log(
    `${ledger.captures}/${ledger.cibles} capture(s) · ${ledger.rejetees} rejet(s) · ` +
      `${ledger.erreurs} erreur(s)`
  )
  process.exit(ledger.rejetees || ledger.erreurs ? 1 : 0)
} catch (e) {
  console.error(`capturer-rendu : ${e.message}`)
  process.exit(2)
}

