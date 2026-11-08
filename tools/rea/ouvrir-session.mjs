#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — ouverture de session SANS transmission d'identifiants.

   Principe : l'agent ne saisit rien, ne lit rien, ne stocke rien. Une fenêtre
   Chromium dédiée s'ouvre sur /login ; c'est l'UTILISATEUR qui tape ses
   identifiants. Le mot de passe ne quitte donc jamais son clavier : il va de
   lui à fidelix.ma en TLS, sans passer par le chat, un fichier ni un journal.

   La session vit ensuite dans un profil persistant (`FIDELIX/.profil-rea/`,
   gitignoré), que `capturer-rendu.mjs --profil` réutilise.

   USAGE
     node tools/rea/ouvrir-session.mjs                 # fenêtre interactive (Entrée)
     node tools/rea/ouvrir-session.mjs --attendre 300  # ferme dès /dashboard = 200
     node tools/rea/ouvrir-session.mjs --verifier      # test à froid, sans fenêtre
   ========================================================================== */

import { chromium } from 'playwright'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE, sessionVivante, SONDE_SESSION } from './session.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const PROFIL = process.env.FIDELIX_PROFIL || join(RACINE, '.profil-rea')
const verifierSeulement = process.argv.includes('--verifier')
const valeur = (n) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/**
 * Le cookie de session est écrit par le JavaScript de la page : on demande donc
 * à l'APPLICATION si la session est ouverte, en suivant la seule sonde valide.
 *
 * `/api/me` a été essayé et rejeté par la mesure (2026-10-26) : 401 en anonyme,
 * **404 en authentifié** — il ne renvoie jamais 200, donc `--attendre` ne
 * pouvait pas se déclencher et la fenêtre ne se fermait jamais. La sonde est
 * `/dashboard` : 200 = connecté, 307 -> /login = pas connecté.
 */
async function etatSession(page) {
  const r = await page.request.get(BASE + SONDE_SESSION, { maxRedirects: 0 })
  return { http: r.status(), location: r.headers()['location'] || null }
}

const contexte = await chromium.launchPersistentContext(PROFIL, {
  headless: verifierSeulement,
  viewport: { width: 1280, height: 900 },
  locale: 'fr-FR',
})
const page = contexte.pages()[0] || (await contexte.newPage())
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })

console.log(`Profil : ${PROFIL}`)
console.log(`Page   : ${page.url()}`)

if (verifierSeulement) {
  const e = await etatSession(page)
  console.log(
    `GET ${SONDE_SESSION} -> HTTP ${e.http}${e.location ? ' -> ' + e.location : ''}` +
      ' (307 vers /login attendu sans session)'
  )
  await contexte.close()
  process.exit(0)
}

const attente = Number(valeur('--attendre') || 0)

console.log('\nConnecte-toi DANS LA FENÊTRE. Je ne lis pas le formulaire.')
if (attente > 0) {
  console.log(`Détection automatique de la session, pendant ${attente} s (Ctrl-C pour annuler)…\n`)
} else {
  console.log("Quand ton dashboard est affiché, reviens ici et appuie sur Entrée.\n")
  await new Promise((res) => {
    process.stdin.resume()
    process.stdin.once('data', res)
  })
}

let etat = await etatSession(page)
if (attente > 0) {
  const fin = Date.now() + attente * 1000
  while (!sessionVivante(etat) && Date.now() < fin) {
    await page.waitForTimeout(2000)
    etat = await etatSession(page)
  }
}
console.log(
  `Vérification : GET ${SONDE_SESSION} -> HTTP ${etat.http}` +
    `${etat.location ? ' -> ' + etat.location : ''}`
)
await contexte.close()

if (!sessionVivante(etat)) {
  console.log("Session NON établie : rien n'a été enregistré, rien n'a été supposé.")
  process.exit(1)
}
console.log('Session établie et persistée dans le profil. Étape suivante :')
console.log('  node tools/rea/capturer-rendu.mjs --manifeste 01_REA_Fidelix/_captures/cibles-auth.json --profil ' + PROFIL)
