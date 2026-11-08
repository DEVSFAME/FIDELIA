#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — capture rejouable, avec empreintes.
   ----------------------------------------------------------------------------
   Hérité du protocole Onify (`UNICITY/tools/rea/capturer-onify.mjs`) : une
   preuve qui n'est pas rejouable n'est plus une preuve, c'est une mémoire.

   Contrat tenu ici :
     - la session est lue dans `FIDELIX/.env` (gitignoré), JAMAIS en argument ;
     - chaque cible est enregistrée octet à octet dans `raw/` ;
     - chaque cible est empreintée (SHA-256) dans `manifeste.json` ;
     - `--verifier` re-télécharge et COMPARE : si le site a changé, la
       vérification échoue au lieu de mentir ;
     - les assets Next.js ne sont pas devinés : ils sont DÉCOUVERTS dans le
       HTML capturé (une passe = pages puis assets référencés).

   USAGE
     node tools/rea/capturer-fidelix.mjs                # capture pages + assets
     node tools/rea/capturer-fidelix.mjs --pages        # pages seulement
     node tools/rea/capturer-fidelix.mjs --sans-sondes  # sans les GET /api/*
     node tools/rea/capturer-fidelix.mjs --preflight    # la session est-elle ouverte ?
     node tools/rea/capturer-fidelix.mjs --manifeste _captures/cibles-auth.json
     node tools/rea/capturer-fidelix.mjs --manifeste _captures/cibles-auth.json --profil .profil-rea
     node tools/rea/capturer-fidelix.mjs --verifier     # re-vérifie les empreintes
     node tools/rea/capturer-fidelix.mjs --inventaire <fichier.html>
     node tools/rea/capturer-fidelix.mjs --diag <chemin>  # 2 tirages + diff

   GARDE-FOUS (ajoutés 2026-10-26, après mesure du garde « catch-all »)
     - le manifeste déclare `modeAttendu` : un écart de mode REFUSE la capture
       avant toute écriture (un ledger anonyme étiqueté « authentifié » serait
       une fausse preuve) ;
     - un ledger existant n'est jamais écrasé sans `--ecraser` explicite ;
     - un cookie présent ne suffit pas : en mode authentifié, `/dashboard` doit
       répondre 200 AVANT la première écriture (sinon session expirée = refus).
       `/api/me` NE convient pas : mesuré 401 en anonyme, 404 en authentifié ;
     - une cible dont la réponse redirige vers une AUTRE route est REJETÉE et
       consignée dans `refuses` — cas mesurés : `/login` -> `/dashboard` (déjà
       connecté) et `/admin` -> `/dashboard` (rôle insuffisant). Le corps d'une
       page n'est jamais archivé sous le nom d'un module qu'elle n'est pas.

   SESSION (facultatif — mode anonyme par défaut ; voir tools/rea/session.mjs)
     --profil <dir>                     priorité 1 — profil Chromium persistant
                                        (celui qu'écrit ouvrir-session.mjs)
     FIDELIX_COOKIE=<Cookie complet>    priorité 2 — dans FIDELIX/.env
     .profil-rea/                       priorité 3 — lu SEULEMENT si un cookie
                                        d'authentification y est présent
     FIDELIX_UA=<user-agent>            (facultatif)
   ========================================================================== */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { empreinteContenu, normaliser, sha256, zonesDivergence } from './empreinte.mjs'
import { BASE, resoudreSession, routeDerivee, sessionVivante, SONDE_SESSION, versLogin } from './session.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..') // FIDELIX/
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')
const MANIFESTE = join(CAPTURES, 'cibles.json')
/** Profil persistant de la voie 1 — lu en dernier recours, jamais par défaut. */
const PROFIL_DEFAUT = join(RACINE, '.profil-rea')

/* ---------------------------------------------------------------------------
   1. Session — lue dans `.env`, jamais sur la ligne de commande.
   ------------------------------------------------------------------------ */

async function lireEnv() {
  const chemin = join(RACINE, '.env')
  if (!existsSync(chemin)) return {}
  const txt = await readFile(chemin, 'utf8')
  const env = {}
  for (const ligne of txt.split('\n')) {
    const l = ligne.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function entetes(env, cookie = null) {
  const h = {
    'User-Agent':
      env.FIDELIX_UA ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 REA-Fidelix-Capture',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  }
  // Le cookie vient de `resoudreSession` (profil OU .env) : il est passé en
  // argument. Cette fonction ne lisait QUE `env.FIDELIX_COOKIE` — le cookie du
  // profil n'était donc jamais envoyé, et toute la passe authentifiée partait
  // en anonyme (mesuré : 307 -> /login malgré « auth présente »).
  const valeur = cookie || env.FIDELIX_COOKIE
  if (valeur) h.Cookie = valeur
  return h
}

/* ---------------------------------------------------------------------------
   2. Utilitaires
   ------------------------------------------------------------------------ */

/* sha256, normaliser, empreinteContenu et zonesDivergence vivent dans
   `empreinte.mjs` : elles décident si une preuve est valable, donc elles doivent
   être testables SANS réseau. Une copie locale avait déjà divergé une fois
   (`entetes`), on ne recommence pas. */

/** Nom de fichier sûr et LISIBLE : le chemin d'origine reste reconnaissable. */
function nomFichier(chemin) {
  const sansQuery = chemin.split('?')[0]
  const plat = sansQuery.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '')
  const base = plat === '' ? 'index' : plat
  return base.replace(/[/\\:*?"<>|()]/g, '_').slice(-180) || 'index'
}

/** Un 307/302 vers /login en passe authentifiée = session morte, pas un module. */
// `versLogin` vit dans session.mjs : une seule implémentation, partagée avec
// le préflight et les tests. Une copie locale avait déjà divergé une fois.

/** Un aller-retour HTTP. `redirect: manual` : un 307 est une PREUVE, pas un détail. */
async function tirer(chemin, headers) {
  const url = chemin.startsWith('http') ? chemin : BASE + chemin
  const res = await fetch(url, { headers, redirect: 'manual' })
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    http: res.status,
    location: res.headers.get('location') || null,
    type: res.headers.get('content-type') || null,
    buf,
  }
}

/** Assets Next.js référencés par un HTML — mesuré, jamais deviné. */
function inventaire(html) {
  const refs = new Set()
  const re = /\/_next\/static\/[^"'\\\s>]+?\.(?:js|css)/g
  for (const m of html.matchAll(re)) refs.add(m[0].replace(/\\+$/, ''))
  return [...refs].sort()
}

/* ---------------------------------------------------------------------------
   3. Capture
   ------------------------------------------------------------------------ */

async function lireManifeste(chemin = MANIFESTE) {
  if (!existsSync(chemin)) throw new Error(`manifeste introuvable : ${chemin}`)
  const m = JSON.parse(await readFile(chemin, 'utf8'))
  // `fichier` est recopié dans le ledger : une preuve doit citer son manifeste.
  return { ...m, fichier: chemin.replace(RACINE + '/', '') }
}

/** Écrit un relevé dans `raw/` et renvoie son empreinte brute + normalisée. */
async function enregistrer(dossier, sousDossier, nom, r) {
  const dir = join(dossier, sousDossier)
  await mkdir(dir, { recursive: true })
  const fichier = join(dir, nom)
  await writeFile(fichier, r.buf)
  const { texte, remplacements } = normaliser(r.buf)
  const contenu = empreinteContenu(r.buf)
  return {
    fichier: fichier.replace(RACINE + '/', ''),
    octets: r.buf.length,
    sha256: sha256(r.buf),
    sha256Stable: sha256(Buffer.from(texte, 'utf8')),
    sha256Contenu: contenu.sha256,
    contenu: { titre: contenu.titre, octetsTexte: contenu.octetsTexte, liens: contenu.liens },
    normalisations: remplacements,
  }
}

async function programmeCapture(env, manifeste, options) {
  const session = await resoudreSession({
    env,
    profil: options.profil || null,
    profilDefaut: PROFIL_DEFAUT,
  })
  const headers = entetes(env, session.cookie)
  const dossier = join(CAPTURES, manifeste.date)
  const sortieLedger = join(dossier, 'manifeste.json')

  const mode = session.cookie ? 'AUTHENTIFIÉ' : 'ANONYME'
  const attendu = manifeste.modeAttendu || 'ANONYME'
  console.log(`Session : ${session.source}`)

  /* --- Garde-fous : refuser AVANT d'écrire, jamais après ------------------ */

  // 1. Un ledger anonyme étiqueté « authentifié » serait une fausse preuve.
  if (mode !== attendu && !options.forceMode) {
    throw new Error(
      `mode ${mode} alors que le manifeste « ${manifeste.passe} » exige ${attendu} — ` +
        `rien n'a été capturé. Connecte-toi via tools/rea/ouvrir-session.mjs, ou renseigne ` +
        `FIDELIX_COOKIE dans FIDELIX/.env, ou force avec --force-mode si le manifeste est en tort.`
    )
  }

  // 2. Écraser un ledger, c'est détruire une preuve : sur accord explicite seulement.
  if (existsSync(sortieLedger) && !options.ecraser) {
    throw new Error(
      `ledger déjà présent : ${sortieLedger.replace(RACINE + '/', '')} — ` +
        `l'écraser détruirait la preuve existante. Change de manifeste/date, ou passe --ecraser.`
    )
  }

  // 3. Un cookie PRÉSENT ne prouve pas une session VIVANTE. Sans ce contrôle,
  //    une session expirée produirait un ledger « AUTHENTIFIÉ » rempli de pages
  //    /login — exactement la fausse preuve que le garde n°1 veut empêcher.
  //    La sonde est `/dashboard` : mesuré le 2026-10-26, `/api/me` renvoie 401
  //    en anonyme et 404 en authentifié — il ne peut donc PAS servir de garde
  //    (c'est ce qui bloquait la Phase 1 en refusant une session valide).
  if (mode === 'AUTHENTIFIÉ' && !options.forceMode) {
    const sonde = await tirer(SONDE_SESSION, headers)
    if (!sessionVivante(sonde)) {
      throw new Error(
        `session annoncée (${session.source}) mais GET ${SONDE_SESSION} -> HTTP ${sonde.http}` +
          `${sonde.location ? ' -> ' + sonde.location : ''} : session morte ou expirée. ` +
          `Rien n'a été capturé, rien n'a été écrit.`
      )
    }
    console.log(`Contrôle de vie : GET ${SONDE_SESSION} -> HTTP 200 (session utilisable).`)
  }

  const releves = []
  const echecs = []

  /**
   * Refus : une cible qui atterrit sur /login pendant une passe authentifiée
   * n'est PAS enregistrée. Sinon le HTML de connexion serait archivé sous le
   * nom du module — `capturer-rendu.mjs` interdit déjà cela, la passe HTTP
   * devait le faire aussi.
   */
  const refuses = []

  console.log(`Passe ${manifeste.passe} — mode ${mode} — ${manifeste.pages.length} page(s)`)

  for (const cible of manifeste.pages) {
    try {
      const r = await tirer(cible.chemin, headers)
      /* Rejet : en passe authentifiée, une redirection qui CHANGE de route n'est
         pas le module demandé. Mesuré le 2026-10-26 : `/admin` -> 307
         `/dashboard` (rôle refusé) et `/login` -> 307 `/dashboard`. Archiver ces
         corps sous le nom du module demandé serait une preuve fausse ; ils vont
         donc dans `refuses`, jamais dans `raw/`. */
      const derivee = mode === 'AUTHENTIFIÉ' ? routeDerivee(r, cible.chemin) : null
      if (mode === 'AUTHENTIFIÉ' && (versLogin(r) || derivee)) {
        /* Un refus DÉCLARÉ n'est pas un échec, c'est une preuve : le manifeste
           annonce `refusAttendu` (ex. /admin -> /dashboard : le rôle ne suffit
           pas). Sans cette distinction, toute passe portant une cible refusée
           sortait en code 1 — et un code 1 permanent ne signale plus rien.
           Un refus INATTENDU reste une alarme : la page a changé de camp. */
        const attendu = cible.refusAttendu || null
        const conforme = attendu ? attendu === derivee : null
        refuses.push({
          id: cible.id,
          chemin: cible.chemin,
          http: r.http,
          location: r.location,
          attendu,
          conforme,
          motif: versLogin(r)
            ? 'atterrit sur /login en passe authentifiée'
            : `redirigé vers ${derivee} : route différente de celle demandée`,
        })
        console.log(
          `REJ ${cible.chemin} -> ${r.location} (route différente : rien écrit)` +
            (conforme === true ? ' · CONFORME au refus déclaré' : conforme === false ? ' · INATTENDU' : '')
        )
        continue
      }
      /* Instabilité DÉCLARÉE par le manifeste (`variantes: N`).
         Une page dont l'empreinte n'est pas reproductible au niveau octet doit
         être mesurée avec `--diag` AVANT d'être figée. Mesuré le 2026-10-27 sur
         `/equipe` : 2 variantes sur 4 tirages, même longueur, même titre, même
         texte visible, mêmes liens, mêmes chunks — seule la table de références
         de composants clients diffère (`21:I[14586,[…]` vs `21:I[34766,[…]`).
         Figer une seule empreinte reviendrait à tirer à pile ou face : on
         archive TOUTES les variantes et `--verifier` les accepte toutes. */
      const demandes = Math.max(1, Number(cible.variantes) || 1)
      const tirages = [r]
      for (let k = 1; k < demandes; k++) tirages.push(await tirer(cible.chemin, headers))

      const vues = []
      for (const t of tirages) {
        const empreinte = sha256(t.buf)
        if (!vues.some((v) => v.sha256 === empreinte)) vues.push({ buf: t.buf, sha256: empreinte })
      }

      const enregistrees = []
      for (let k = 0; k < vues.length; k++) {
        const nom = k === 0 ? `${cible.id}.html` : `${cible.id}.variante-${k}.html`
        enregistrees.push(await enregistrer(dossier, 'raw/pages', nom, vues[k]))
      }

      const e = enregistrees[0]
      const releve = {
        id: cible.id,
        famille: cible.famille,
        chemin: cible.chemin,
        http: r.http,
        location: r.location,
        ...e,
      }
      if (demandes > 1) {
        releve.stabilite = {
          tirages: tirages.length,
          variantes: enregistrees.length,
          motif: cible.motifStabilite || null,
          toutes: enregistrees,
        }
      }
      releves.push(releve)
      console.log(
        `${String(r.http).padEnd(3)} ${cible.chemin}${r.location ? ' -> ' + r.location : ''} (${e.octets} o)` +
          (enregistrees.length > 1
            ? ` · INSTABLE : ${enregistrees.length} variantes sur ${tirages.length} tirages`
            : '')
      )
    } catch (e) {
      echecs.push({ id: cible.id, chemin: cible.chemin, erreur: e.message })
      console.log(`ERR ${cible.chemin} : ${e.message}`)
    }
  }

  // Sondes : GET uniquement. `--sans-sondes` permet de s'arrêter aux pages.
  for (const sonde of options.sansSondes ? [] : manifeste.sondes || []) {
    try {
      const r = await tirer(sonde.chemin, headers)
      // Le corps est CONSERVÉ : mesuré le 2026-10-26, `/card/test` (404) varie
      // de 43 octets d'un appel à l'autre — sans le corps sur disque, cette
      // divergence serait invérifiable.
      const e = await enregistrer(dossier, 'raw/sondes', `${sonde.id}.html`, r)
      releves.push({
        id: sonde.id,
        famille: 'sonde',
        chemin: sonde.chemin,
        http: r.http,
        location: r.location,
        ...e,
        apercu: r.buf.toString('utf8').slice(0, 160),
      })
      console.log(`${String(r.http).padEnd(3)} [sonde] ${sonde.chemin}`)
    } catch (e) {
      echecs.push({ id: sonde.id, chemin: sonde.chemin, erreur: e.message })
    }
  }

  /* --- Assets : découverts dans le HTML réellement capturé ---------------- */
  let assets = []
  if (options.avecAssets) {
    const refs = new Set()
    for (const rel of releves) {
      if (!rel.fichier || !rel.fichier.endsWith('.html')) continue
      const html = await readFile(join(RACINE, rel.fichier), 'utf8')
      for (const ref of inventaire(html)) refs.add(ref)
    }
    console.log(`\n${refs.size} asset(s) référencé(s) par les pages capturées.`)
    for (const ref of [...refs].sort()) {
      try {
        const r = await tirer(ref, headers)
        const e = await enregistrer(dossier, 'raw/assets', nomFichier(ref), r)
        assets.push({ chemin: ref, http: r.http, ...e })
      } catch (e) {
        echecs.push({ chemin: ref, erreur: e.message })
      }
    }
    console.log(`${assets.filter((a) => a.http === 200).length}/${assets.length} asset(s) en 200.`)
  }

  const ledger = {
    passe: manifeste.passe,
    manifeste: manifeste.fichier,
    date: manifeste.date,
    horodatage: new Date().toISOString(),
    source: 'FIDELIX/tools/rea/capturer-fidelix.mjs',
    base: BASE,
    mode,
    modeAttendu: attendu,
    session: session.source,
    cibles: releves.length,
    ok: releves.filter((r) => r.http === 200).length,
    redirections: releves.filter((r) => r.location).length,
    echecs: echecs.length,
    stables: releves.filter((r) => r.sha256 === r.sha256Stable).length,
    dynamiques: releves.filter((r) => r.sha256 !== r.sha256Stable).length,
    instables: releves.filter((r) => r.stabilite).length,
    refusesAttendus: refuses.filter((r) => r.conforme === true).length,
    refusesInattendus: refuses.filter((r) => r.conforme === false).length,
    releves,
    assets,
    erreurs: echecs,
    refuses,
  }
  const sortie = sortieLedger
  await writeFile(sortie, JSON.stringify(ledger, null, 2) + '\n')
  console.log(`\nManifeste : ${sortie}`)
  console.log(
    `${ledger.ok}/${ledger.cibles} en 200 · ${ledger.redirections} redirection(s) · ` +
      `${assets.length} asset(s) · ${echecs.length} erreur(s) · ${refuses.length} refus` +
      (ledger.instables ? ` · ${ledger.instables} cible(s) INSTABLE(S) (variantes archivées)` : '')
  )
  const inattendus = refuses.filter((r) => r.conforme === false)
  if (inattendus.length) {
    console.log(
      `\nATTENTION : ${inattendus.length} refus INATTENDU(S) — ` +
        inattendus.map((r) => `${r.chemin} -> ${r.location}`).join(', ')
    )
  }
  // Un refus déclaré conforme est une PREUVE ; seul un refus imprévu alerte.
  return echecs.length || inattendus.length ? 1 : 0
}


/* ---------------------------------------------------------------------------
   4. Vérification — l'empreinte STABLE, jamais l'empreinte brute.
   ------------------------------------------------------------------------ */

async function programmeVerifier(env, manifeste, options = {}) {
  const cheminLedger = join(CAPTURES, manifeste.date, 'manifeste.json')
  if (!existsSync(cheminLedger)) throw new Error(`ledger introuvable : ${cheminLedger}`)
  const ledger = JSON.parse(await readFile(cheminLedger, 'utf8'))
  // On re-vérifie une empreinte DANS LE MODE où elle a été prise : vérifier un
  // ledger anonyme avec une session produirait des écarts qui ne prouvent rien.
  const session =
    ledger.mode === 'ANONYME'
      ? { cookie: null, source: 'alignée sur le ledger (ANONYME)' }
      : await resoudreSession({
          env,
          profil: options.profil || null,
          profilDefaut: PROFIL_DEFAUT,
        })
  const headers = entetes(env, session.cookie)
  console.log(`Session : ${session.source}`)
  let ecarts = 0
  let verifies = 0

  const toutes = [...ledger.releves, ...(ledger.assets || [])]
  for (const cible of toutes) {
    if (cible.erreur) continue
    const r = await tirer(cible.chemin, headers)
    const e = normaliser(r.buf)
    const stable = sha256(Buffer.from(e.texte, 'utf8'))
    const contenuVivant = empreinteContenu(r.buf)
    /* Doctrine d'empreinte, en deux étages :
       — l'OCTET dit ce qui a été servi à l'instant T ; il est archivé tel quel,
         mais il n'est PAS un test de stabilité : mesuré le 2026-10-27,
         `/equipe` a servi 3 formes et `/billing` 1 forme transitoire alors que
         10 tirages consécutifs étaient identiques — c'est un déploiement ou une
         instance edge, pas la page.
       — le CONTENU (titre + texte visible + liens triés) est l'invariant : un
         libellé, un prix ou un lien qui change le fait échouer.
       Les ledgers antérieurs (S2) n'ont pas d'empreinte de contenu : pour eux on
       retombe sur la comparaison d'octets, sans prétendre mieux. */
    const connues = [cible.sha256Stable, ...(cible.stabilite?.toutes || []).map((v) => v.sha256Stable)]
    const rang = connues.indexOf(stable)
    const aContenu = Boolean(cible.sha256Contenu)
    const meme = aContenu ? contenuVivant.sha256 === cible.sha256Contenu : rang >= 0
    if (!meme) ecarts++
    verifies++

    let mention = ''
    if (aContenu) {
      if (!meme) mention = ' (CONTENU MODIFIÉ — la page ne dit plus la même chose)'
      else if (rang >= 0) mention = ` (octets identiques, forme ${rang + 1}/${connues.length})`
      else mention = ' (contenu identique, forme d’octets NOUVELLE)'
    } else if (rang > 0) {
      mention = ` (variante ${rang + 1}/${connues.length})`
    }
    console.log(
      `${meme ? 'STABLE ' : 'DIVERGE'} ${cible.chemin}${mention}\n` +
        `        ledger ${(aContenu ? cible.sha256Contenu : cible.sha256Stable).slice(0, 16)}… (${cible.octets} o)\n` +
        `        vivant ${(aContenu ? contenuVivant.sha256 : stable).slice(0, 16)}… (${r.buf.length} o, HTTP ${r.http})`
    )
  }
  console.log(`\n${ecarts} divergence(s) sur ${verifies} cible(s) vérifiée(s).`)
  return ecarts ? 1 : 0
}

/* ---------------------------------------------------------------------------
   5. Diagnostic — mesurer avant de normaliser quoi que ce soit.
   ------------------------------------------------------------------------ */

async function programmeDiag(env, chemin, tirages = 2) {
  // Sans session, `--diag /dashboard` mesurerait deux fois la page de connexion
  // et conclurait « identique » : une mesure juste sur la mauvaise page.
  const session = await resoudreSession({ env, profilDefaut: PROFIL_DEFAUT })
  const headers = entetes(env, session.cookie)
  if (session.cookie) console.log(`Session : ${session.source}`)

  /* Un diagnostic à DEUX tirages ne peut pas voir une page bimodale : mesuré
     le 2026-10-27, `/equipe` alterne deux formes à ~50/50, et deux tirages ont
     conclu « identique » juste après une mesure qui montrait l'inverse. Le
     nombre de tirages est donc réglable : `--diag <chemin> --tirages 6`. */
  const n = Math.max(2, Number(tirages) || 2)
  const tous = []
  for (let k = 0; k < n; k++) tous.push(await tirer(chemin, headers))

  const formes = new Map()
  for (const t of tous) {
    const memo = normaliser(t.buf).texte
    const cle = sha256(Buffer.from(memo, 'utf8'))
    if (!formes.has(cle)) formes.set(cle, { memo, http: t.http, octets: t.buf.length, vus: 0 })
    formes.get(cle).vus++
  }

  const [premiere] = [...formes.values()]
  console.log(
    `HTTP ${tous.map((t) => t.http).join('/')} · ${tous.map((t) => t.buf.length).join(' / ')} o` +
      ` · ${tous.length} tirages`
  )
  if (formes.size === 1) {
    console.log(`TOUS IDENTIQUES après normalisation (${tous.length} tirages) — empreinte stable utilisable.`)
    return 0
  }

  console.log(
    `INSTABLE : ${formes.size} forme(s) distincte(s) sur ${tous.length} tirages ` +
      `(${[...formes.values()].map((f) => f.vus + '×').join(', ')})`
  )
  let rang = 0
  for (const [cle, f] of formes) {
    rang++
    if (f === premiere) continue
    const zones = zonesDivergence(premiere.memo, f.memo)
    console.log(
      `\n— forme ${rang}/${formes.size} (${f.vus} tirage(s), ${f.octets} o, ${cle.slice(0, 12)}…) : ` +
        `${zones.length} zone(s)`
    )
    for (const z of zones) {
      console.log(`  caractères ${z.debut}–${z.debut + z.longueur - 1}`)
      console.log(`    A: ${JSON.stringify(z.a)}`)
      console.log(`    B: ${JSON.stringify(z.b)}`)
    }
  }
  console.log(
    `\nUne empreinte unique serait un pile ou face : déclarer « variantes: ${n} » dans le manifeste ` +
      `pour archiver toutes les formes, et re-mesurer le CONTENU (texte, liens) avant de conclure.`
  )
  return 1
}

/* ---------------------------------------------------------------------------
   6. Préflight — la session est-elle réellement ouverte ?
   ------------------------------------------------------------------------ */

/**
 * Mesure l'état de session AVANT toute capture. Trois réponses :
 *   0 = session active   — `/dashboard` répond 200 sans redirection
 *   1 = session absente  — `/dashboard` renvoie vers /login (ou `/api/me` = 401)
 *   2 = indéterminé      — tout autre statut : à vérifier à la main
 *
 * Une seule sonde fait foi : `/dashboard` (SONDE_SESSION). `/api/me` est relevé
 * à titre informatif seulement — mesuré le 2026-10-26 : 401 en anonyme, 404 en
 * authentifié, donc jamais 200. C'est ce qui a fait afficher « ABSENTE » à une
 * session pourtant valide.
 */
async function programmePreflight(env, manifeste, options = {}) {
  const session = await resoudreSession({
    env,
    profil: options.profil || null,
    profilDefaut: PROFIL_DEFAUT,
  })
  const headers = entetes(env, session.cookie)
  const mode = session.cookie ? 'AUTHENTIFIÉ' : 'ANONYME'
  const attendu = manifeste.modeAttendu || 'ANONYME'
  console.log(`Session     : ${session.source}`)
  console.log(`Mode local  : ${mode}`)
  console.log(`Mode exigé  : ${attendu} — ${manifeste.fichier}`)

  const dash = await tirer(SONDE_SESSION, headers)
  const me = await tirer('/api/me', headers)
  console.log(`GET ${SONDE_SESSION} : HTTP ${dash.http}${dash.location ? ' -> ' + dash.location : ''}`)
  console.log(`GET /api/me    : HTTP ${me.http} (informatif : 401 anonyme, 404 authentifié)`)

  if (sessionVivante(dash)) {
    console.log('\nVERDICT : session ACTIVE — la passe authentifiée peut être lancée.')
    return 0
  }
  if (dash.http === 307 || dash.http === 302 || me.http === 401) {
    console.log(
      '\nVERDICT : session ABSENTE — la passe authentifiée est impossible.' +
        (mode === 'AUTHENTIFIÉ'
          ? `\n  Un cookie EST présent mais ${SONDE_SESSION} renvoie sur ${dash.location || '/login'} :\n` +
            '  session expirée ou révoquée. Reconnecte-toi.\n'
          : '\n') +
        "  Voie A : node tools/rea/ouvrir-session.mjs --attendre 300 (tu te connectes dans la fenêtre ;\n" +
        '           le préflight lira ensuite le profil .profil-rea sans que tu copies rien).\n' +
        "  Voie B : coller l'en-tête Cookie de fidelix.ma dans FIDELIX/.env (FIDELIX_COOKIE=…).\n" +
        "  Voie C : Chrome connecté ouvert avec --remote-debugging-port=9222 (capturer-rendu.mjs --cdp).\n" +
        "  Rien n'a été capturé : aucune preuve n'est inventée."
    )
    return 1
  }
  console.log(`\nVERDICT : INDÉTERMINÉ (dashboard ${dash.http}) — à vérifier.`)
  return 2
}

/* ---------------------------------------------------------------------------
   7. Entrée
   ------------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const option = (nom) => argv.includes(nom)
const valeur = (nom) => {
  const i = argv.indexOf(nom)
  return i >= 0 ? argv[i + 1] : undefined
}

try {
  const env = await lireEnv()
  const cheminManifeste = valeur('--manifeste')
    ? resolve(RACINE, valeur('--manifeste'))
    : MANIFESTE

  if (argv[0] === '--inventaire') {
    const html = await readFile(resolve(argv[1]), 'utf8')
    const refs = inventaire(html)
    console.log(refs.join('\n'))
    console.log(`\n${refs.length} référence(s) d'assets.`)
  } else if (argv[0] === '--diag') {
    if (!argv[1]) throw new Error('usage : --diag <chemin> [--tirages N]')
    process.exit(await programmeDiag(env, argv[1], valeur('--tirages')))
  } else if (argv[0] === '--preflight') {
    process.exit(
      await programmePreflight(env, await lireManifeste(cheminManifeste), {
        profil: valeur('--profil'),
      })
    )
  } else if (argv[0] === '--verifier') {
    process.exit(
      await programmeVerifier(env, await lireManifeste(cheminManifeste), {
        profil: valeur('--profil'),
      })
    )
  } else {
    const manifeste = await lireManifeste(cheminManifeste)
    process.exit(
      await programmeCapture(env, manifeste, {
        avecAssets: !option('--pages'),
        sansSondes: option('--sans-sondes'),
        forceMode: option('--force-mode'),
        ecraser: option('--ecraser'),
        profil: valeur('--profil'),
      })
    )
  }
} catch (e) {
  console.error(`capturer-fidelix : ${e.message}`)
  process.exit(2)
}
