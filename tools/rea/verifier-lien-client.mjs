#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — trancher `/customers/<uuid>` par le GESTE, pas par la déduction.

   Mesures déjà acquises (S3) : le dashboard rend un `<a href="/customers/<uuid>">`,
   le GET direct répond un 404 Next nu, et le build ne contient aucun chunk
   `customers/[id]/page-*.js`. Deux hypothèses restaient :
     H1 — lien mort (la route n'existe pas) ;
     H2 — route interceptée côté client (modale), qui ne laisse pas de chunk
          de route mais un composant partagé.

   Cet outil clique le lien dans un navigateur réel et relève ce qui se passe :
   navigation ? statut du document ? dialogue visible ? requêtes émises ?
   Aucune donnée client n'est écrite : l'UUID est masqué, le texte du lien
   n'est pas recopié, seule sa longueur est notée.

   USAGE
     node tools/rea/verifier-lien-client.mjs
     node tools/rea/verifier-lien-client.mjs --chemin /dashboard --attente 6000
   ========================================================================== */

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { BASE, resoudreSession } from './session.mjs'
import { masquerUuid, classerLien } from './modele.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const SORTIE = join(RACINE, '01_REA_Fidelix', '_captures', '2026-10-27-a1')

const argv = process.argv.slice(2)
const valeur = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const CHEMIN = valeur('--chemin') || '/dashboard'
const ATTENTE = Number(valeur('--attente')) || 6000

const masque = masquerUuid

function lireEnv() {
  const chemin = join(RACINE, '.env')
  if (!existsSync(chemin)) return {}
  const env = {}
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const l = ligne.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * Empreinte du TEXTE VISIBLE : permet de comparer deux pages sans en recopier
 * une seule ligne. Deux pages identiques ont la même empreinte ; une fiche
 * client et une liste n'en ont jamais la même.
 */
const empreintePage = async (page) => {
  const texte = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
  return { empreinte: createHash('sha256').update(texte).digest('hex').slice(0, 16), longueur: texte.length }
}

/** Compte les dialogues VISIBLES — c'est le seul signe d'une modale. */
const compterDialogues = (page) =>
  page.evaluate(() => {
    const selecteurs = ['[role="dialog"]', 'dialog[open]', '[data-state="open"][role="dialog"]', '[aria-modal="true"]']
    const vus = new Set()
    for (const s of selecteurs) for (const el of document.querySelectorAll(s)) vus.add(el)
    let visibles = 0
    for (const el of vus) {
      const st = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0) visibles += 1
    }
    return visibles
  })


async function main() {
  const env = lireEnv()
  const session = await resoudreSession({ env, profilDefaut: join(RACINE, '.profil-rea') })
  if (!session.auth) {
    console.error("VERDICT : session ABSENTE — aucun clic, rien n'a été écrit.")
    process.exit(2)
  }

  await mkdir(SORTIE, { recursive: true })
  const contexte = await chromium.launchPersistentContext(
    session.profil || join(RACINE, '.profil-rea'),
    { headless: true, viewport: { width: 1440, height: 1000 } },
  )
  const page = await contexte.newPage()
  const reseau = []
  page.on('request', (r) =>
    reseau.push({ methode: r.method(), url: masque(r.url()), type: r.resourceType() }),
  )

  const resultat = {
    outil: 'FIDELIX/tools/rea/verifier-lien-client.mjs',
    horodatage: new Date().toISOString(),
    chemin: CHEMIN,
    page: null,
    lien: null,
    apres: null,
    verdict: null,
  }

  try {
    const reponse = await page.goto(BASE + CHEMIN, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(2500)
    resultat.page = { url: masque(page.url()), statutHttp: reponse ? reponse.status() : null }
    resultat.page.empreinte = await empreintePage(page)
    resultat.page.serviceWorker = await page.evaluate(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller))

    const collecter = async () => {
      const liens = page.locator('a[href^="/customers/"]')
      const total = await liens.count()
      const inventaire = []
      let visible = null
      for (let i = 0; i < total; i++) {
        const l = liens.nth(i)
        const v = await l.isVisible()
        const boite = await l.boundingBox()
        if (v && !visible) visible = l
        inventaire.push({
          href: masque(await l.getAttribute('href')),
          visible: v,
          boite: boite ? { l: Math.round(boite.width), h: Math.round(boite.height) } : null,
        })
      }
      return { total, inventaire, lien: visible }
    }

    let etat = await collecter()
    const resumeLiens = (e) => ({
      total: e.total,
      visibles: e.inventaire.filter((x) => x.visible).length,
      inventaire: e.inventaire,
    })
    resultat.liens = resumeLiens(etat)

    if (argv.includes('--diag')) {
      resultat.diagnostic = await page.evaluate(() => {
        const a = document.querySelector('a[href^="/customers/"]')
        if (!a) return null
        const chaine = []
        let el = a
        for (let i = 0; i < 8 && el; i++) {
          const st = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          chaine.push({
            balise: el.tagName.toLowerCase(),
            classes: String(el.className || '').slice(0, 120),
            display: st.display,
            visibility: st.visibility,
            opacite: st.opacity,
            ariaHidden: el.getAttribute('aria-hidden'),
            hidden: el.hasAttribute('hidden') || el.hidden === true,
            boite: `${Math.round(r.width)}x${Math.round(r.height)}`,
          })
          el = el.parentElement
        }
        return { chaine, titre: document.title, pret: document.readyState, hauteur: document.body.scrollHeight }
      })
      console.log(JSON.stringify(resultat.diagnostic, null, 2))
    }

    if (!etat.lien) {
      // Le lien peut être dans un `<details>` replié (mesuré : hauteur 50 pour
      // un contenu de 828). On l'ouvre par son `<summary>` — geste utilisateur.
      const etatDetails = await page.evaluate(() => {
        const a = document.querySelector('a[href^="/customers/"]')
        const d = a && a.closest('details')
        return d ? { ouvert: d.open } : null
      })
      resultat.details = etatDetails
      if (etatDetails && !etatDetails.ouvert) {
        await page.locator('details:has(a[href^="/customers/"]) > summary').first().click()
        await page.waitForTimeout(800)
        etat = await collecter()
        resultat.liensApresOuverture = resumeLiens(etat)
      }
    }

    const lien = etat.lien
    if (!lien) {
      resultat.verdict =
        `${etat.total} lien(s) /customers/ présent(s) dans le DOM, AUCUN visible ` +
        "même après ouverture du <details> : rien à conclure sur la route"
      console.log(JSON.stringify(resultat.liensApresOuverture || resultat.liens, null, 2))
      console.log(resultat.verdict)
      await writeFile(join(SORTIE, 'lien-client.json'), JSON.stringify(resultat, null, 2))
      return
    }

    await lien.scrollIntoViewIfNeeded().catch(() => {})
    const href = await lien.getAttribute('href')
    const texte = (await lien.innerText()).trim()
    resultat.lien = {
      href: masque(href),
      uuidPresent: /\/([0-9a-f-]{36})$/.test(String(href || '')),
      texteLongueur: texte.length,
      dialoguesAvant: await compterDialogues(page),
    }

    const avant = page.url()
    const urlObservees = []
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) urlObservees.push(masque(f.url()))
    })
    // Les réponses réelles : document (navigation dure) et RSC (navigation douce
    // de Next). Un service worker peut réécrire le statut d'un `fetch` manuel,
    // pas celui de la requête RSC que le routeur émet lui-même.
    const reponses = []
    page.on('response', (r) => {
      const u = r.url()
      if (r.request().resourceType() === 'document' || /[?&]_rsc=/.test(u)) {
        reponses.push({ url: masque(u), statut: r.status(), type: r.request().resourceType() })
      }
    })

    await lien.click({ timeout: 10_000 })
    await page.waitForTimeout(ATTENTE)

    const apres = page.url()
    const titre = await page.title()
    const texteLongueur = await page.evaluate(() => (document.body.innerText || '').trim().length)
    const nbLiens = await page.locator('a').count()
    resultat.apres = {
      url: masque(apres),
      navigation: apres !== avant,
      dialogues: await compterDialogues(page),
      titre,
      texteLongueur,
      nbLiens,
      empreinte: await empreintePage(page),
      reponses: reponses.slice(-6),
    }

    // Références : la liste des clients et le dashboard, chargés à neuf.
    // On ne compare que des empreintes — aucune donnée client n'est écrite.
    const temoin = await contexte.newPage()
    try {
      await temoin.goto(BASE + '/customers', { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await temoin.waitForTimeout(2000)
      resultat.references = { liste: await empreintePage(temoin) }
      await temoin.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await temoin.waitForTimeout(2000)
      resultat.references.dashboard = await empreintePage(temoin)
    } finally {
      await temoin.close().catch(() => {})
    }

    await page.screenshot({ path: join(SORTIE, 'lien-client.png'), fullPage: false })

    // Verdict fondé sur ce que la page MONTRE, pas sur un statut de fetch
    // (mesuré : le fetch de contrôle a répondu 200 là où le document servi
    // était un 404 — service worker). Un 404 Next nu : titre « Page
    // introuvable », corps quasi vide (= le titre), zéro lien.
    const page404 = /introuvable/i.test(titre) && texteLongueur < 200 && nbLiens === 0
    const statutRsc = (reponses.find((r) => r.type !== 'document') || {}).statut ?? null

    resultat.apres.statutRsc = statutRsc
    resultat.apres.page404 = page404

    resultat.navigationUrls = urlObservees

    // Vérité SERVEUR, hors navigateur : même GET, même cookie, ni SW ni cache.
    const sonder = async (chemin) => {
      try {
        const r = await fetch(new URL(chemin, BASE).toString(), {
          headers: { Cookie: session.cookie || '', Accept: 'text/html' },
          redirect: 'manual',
          signal: AbortSignal.timeout(25_000),
        })
        const html = await r.text()
        return {
          chemin: masque(chemin),
          statut: r.status,
          location: masque(r.headers.get('location')),
          octets: html.length,
          titre: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim(),
          liens: (html.match(/<a\s/gi) || []).length,
        }
      } catch (e) {
        return { chemin: masque(chemin), erreur: String(e.message || e) }
      }
    }

    resultat.direct = await sonder(String(href))
    // Contraste indispensable : le même chemin avec un UUID NUL, et une route
    // qui n'existe pas. Si les deux répondent 404 et la fiche 200, alors le 404
    // de S3 qualifiait l'IDENTIFIANT, pas la route.
    resultat.contrastes = {
      uuidNul: await sonder('/customers/00000000-0000-4000-8000-000000000000'),
      routeInconnue: await sonder('/clients-inexistant-rea'),
    }

    resultat.verdict = classerLien({
      dialogues: resultat.apres.dialogues,
      direct: resultat.direct,
      contrastes: resultat.contrastes,
      page404,
      memeContenuListe:
        resultat.apres.empreinte.empreinte === resultat.references.liste.empreinte,
      navigation: apres !== avant,
    })

    if (apres !== avant) {
      const statutRechargement = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(1500)
      resultat.rechargement = {
        statutHttp: statutRechargement ? statutRechargement.status() : null,
        titre: await page.title(),
        empreinte: await empreintePage(page),
        dialogues: await compterDialogues(page),
      }
      resultat.rechargement.page404 =
        /introuvable/i.test(resultat.rechargement.titre) && resultat.rechargement.empreinte.longueur < 200
    }
    console.log(
      JSON.stringify(
        {
          lien: resultat.lien,
          apres: resultat.apres,
          direct: resultat.direct,
          rechargement: resultat.rechargement,
          verdict: resultat.verdict,
        },
        null,
        2,
      ),
    )
    await writeFile(join(SORTIE, 'lien-client.json'), JSON.stringify(resultat, null, 2))
  } finally {
    await contexte.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ERREUR :', e && e.stack ? e.stack : e)
  process.exit(1)
})
