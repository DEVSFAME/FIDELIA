#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — extraction de contrats (reproductible).

   Ne devine rien : lit les fichiers stockés dans `_captures/<date>/raw/` et
   écrit un JSON de faits mesurables. Chaque fait porte `sources` (fichier) et
   `preuves` (nombre d'occurrences), pour être citable dans le vault.

   USAGE
     node tools/rea/analyser-fidelix.mjs [--date 2026-10-26]
   ========================================================================== */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..', '..')
const CAPTURES = join(RACINE, '01_REA_Fidelix', '_captures')

const argv = process.argv.slice(2)
const date = argv[argv.indexOf('--date') + 1] || '2026-10-26'
const RACINE_PASSE = join(CAPTURES, date)

const compter = (map, cle) => map.set(cle, (map.get(cle) || 0) + 1)
const trier = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

/** Concatène un dossier de fichiers texte. */
async function lireDossier(rel, extensions) {
  const dir = join(RACINE_PASSE, rel)
  if (!existsSync(dir)) return { fichiers: [], contenu: '' }
  const noms = (await readdir(dir)).filter((n) => extensions.some((e) => n.endsWith(e)))
  const morceaux = []
  for (const n of noms) morceaux.push(await readFile(join(dir, n), 'utf8'))
  return { fichiers: noms, contenu: morceaux.join('\n') }
}

const pages = await lireDossier('raw/pages', ['.html'])
const assets = await lireDossier('raw/assets', ['.js', '.css'])

/* --- 1. Routes déclarées (HTML rendu + payload RSC échappé) --------------- */
const routes = new Map()
for (const re of [/\\"href\\":\\"([^"\\]+)\\"/g, /\bhref="([^"]+)"/g]) {
  for (const m of pages.contenu.matchAll(re)) compter(routes, m[1])
}

/* --- 2. Endpoints API ----------------------------------------------------- */
const api = new Map()
for (const m of pages.contenu.concat(assets.contenu).matchAll(/"(\/api\/[^"\\]+)"/g)) {
  compter(api, m[1])
}

/* --- 3. Clés de stockage local ------------------------------------------- */
const stockage = new Map()
for (const m of assets.contenu.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\("([^"]+)"/g)) {
  compter(stockage, m[1])
}

/* --- 4. Backend observé dans le client ----------------------------------- */
const supabase = [...new Set(assets.contenu.match(/https:\/\/[a-z0-9]+\.supabase\.co/g) || [])]
const services = new Map()
for (const m of assets.contenu.matchAll(/(rest|functions)\/v1/g)) compter(services, m[1])
const fournisseurs = new Map()
for (const m of assets.contenu.matchAll(/\b(payzone|stripe|twilio|resend|firebase|onesignal|wallet|passkit)\b/gi)) {
  compter(fournisseurs, m[1].toLowerCase())
}

/* --- 5. Design system : polices et couleurs ----------------------------- */
const polices = new Map()
for (const m of assets.contenu.matchAll(/font-family:\s*([^;}]+)/g)) {
  const f = m[1].split(',')[0].replace(/["']/g, '').trim()
  if (f && !f.startsWith('var(')) compter(polices, f)
}
const couleurs = new Map()
for (const m of assets.contenu.matchAll(/#[0-9a-fA-F]{6}\b/g)) compter(couleurs, m[0].toLowerCase())

/* --- 6. Locales --------------------------------------------------------- */
const locales = new Map()
for (const m of pages.contenu.matchAll(/<html[^>]*\blang="([^"]+)"/g)) compter(locales, m[1])
const arabe = (pages.contenu.match(/[\u0600-\u06FF]/g) || []).length

const sortie = {
  date,
  genere: new Date().toISOString(),
  source: 'FIDELIX/tools/rea/analyser-fidelix.mjs',
  corpus: { pages: pages.fichiers.length, assets: assets.fichiers.length },
  routes: trier(routes).slice(0, 120),
  api: trier(api),
  stockage: trier(stockage),
  backend: { supabase, services: trier(services), fournisseurs: trier(fournisseurs) },
  design: { polices: trier(polices), couleurs: trier(couleurs).slice(0, 30) },
  locales: { balises: trier(locales), caracteresArabes: arabe },
}

const fichier = join(RACINE_PASSE, 'contrats.json')
await writeFile(fichier, JSON.stringify(sortie, null, 2) + '\n')
console.log(`${fichier}`)
console.log(
  `routes ${sortie.routes.length} · api ${sortie.api.length} · stockage ${sortie.stockage.length} · ` +
    `polices ${sortie.design.polices.length} · couleurs ${sortie.design.couleurs.length}`
)
