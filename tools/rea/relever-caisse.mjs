/* ============================================================================
   REA Fidelix — A4 : où vit la file hors ligne de la caisse, et ce qu'elle dit.

   Lit des bundles et des pages DÉJÀ CAPTURÉS. N'émet aucune requête : pas de
   GET, pas de POST, pas d'OPTIONS. Le corpus par défaut est la passe ANONYME
   du 2026-10-26 — celle qui contient déjà le chunk de la caisse, donc aucune
   donnée de client réel n'est touchée ici (lesson §15).

   Usage :
     node tools/rea/relever-caisse.mjs [--assets <dir>] [--pages <dir>]
                                       [--sortie <json>] [--temoins] [--fichiers]

   Un dossier absent est une erreur (exit 2), jamais du vide silencieux.
   ========================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classerCorpus,
  calibrer,
  presenceProse,
  TEMOINS_CAISSE,
  TYPES_ENFILES,
  TYPES_REFUSES_HORS_LIGNE,
} from './caisse.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../..')
const ASSETS_DEFAUT = join(RACINE, '01_REA_Fidelix/_captures/2026-10-26/raw/assets')
const PAGES_DEFAUT = join(RACINE, '01_REA_Fidelix/_captures/2026-10-26/raw/pages')

const argument = (nom, defaut = null) => {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : defaut
}
const drapeau = (nom) => process.argv.includes(nom)

const dossierAssets = resolve(argument('--assets', ASSETS_DEFAUT))
const dossierPages = resolve(argument('--pages', PAGES_DEFAUT))

if (!existsSync(dossierAssets) || !statSync(dossierAssets).isDirectory()) {
  console.error(`Bundles introuvables : ${dossierAssets}`)
  console.error('Aucune preuve fabriquée — relancer la capture qui les produit.')
  process.exit(2)
}

const bundles = readdirSync(dossierAssets)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => ({ fichier: f, source: readFileSync(join(dossierAssets, f), 'utf8') }))

const pages = existsSync(dossierPages)
  ? readdirSync(dossierPages)
      .filter((f) => f.endsWith('.html'))
      .sort()
      .map((f) => ({ fichier: f, source: readFileSync(join(dossierPages, f), 'utf8') }))
  : []

const releve = classerCorpus(bundles)
const ecarts = calibrer({ bundles, releve })

/* ------------------------------------------------------------------ rapport */

console.log(`Bundles lus        : ${bundles.length}  (${dossierAssets.replace(RACINE + '/', '')})`)
console.log(`Pages lues         : ${pages.length}  (${dossierPages.replace(RACINE + '/', '')})`)
console.log('')

console.log('CALIBRATION (témoins — la réponse est connue avant de lire)')
const oui = (b) => (b ? 'trouvé' : 'ABSENT')
const dedans = (j) => bundles.some((b) => b.source.includes(j))
console.log(`  positif base        : ${TEMOINS_CAISSE.positifBase.padEnd(24)} ${oui(dedans(TEMOINS_CAISSE.positifBase))}`)
console.log(`  positif magasin     : ${TEMOINS_CAISSE.positifMagasin.padEnd(24)} ${oui(dedans(TEMOINS_CAISSE.positifMagasin))}`)
console.log(`  positif clé LS      : ${TEMOINS_CAISSE.positifCleLs.padEnd(24)} ${oui(dedans(TEMOINS_CAISSE.positifCleLs))}`)
console.log(`  positif idempotence : ${TEMOINS_CAISSE.positifIdempotence.padEnd(24)} ${oui(dedans(TEMOINS_CAISSE.positifIdempotence))}`)
console.log(`  positif prose       : ${TEMOINS_CAISSE.positifProse.padEnd(24)} ${oui(presenceProse(bundles, TEMOINS_CAISSE.positifProse))}  (après décodage)`)
console.log(`  positif solde       : ${TEMOINS_CAISSE.positifSolde.padEnd(24)} ${oui(presenceProse(bundles, TEMOINS_CAISSE.positifSolde))}  (après décodage)`)
for (const n of [TEMOINS_CAISSE.negatif, TEMOINS_CAISSE.negatif2, TEMOINS_CAISSE.negatif3])
  console.log(`  négatif             : ${n.padEnd(24)} ${dedans(n) ? 'SORTI — ANORMAL' : 'non sorti'}`)
console.log(`  leurre auth-js      : ${'localStorage'.padEnd(24)} ${releve.parFoyer['supabase auth-js'] ?? 0} jeton(s) dans auth-js, 0 magasin de file, 0 prose`)
console.log(ecarts.length ? `  VERDICT : ${ecarts.length} écart(s)` : '  VERDICT : calibré')
for (const e of ecarts) console.log(`    ! ${e}`)
console.log('')

if (drapeau('--temoins')) process.exit(ecarts.length ? 3 : 0)

console.log('OCCURRENCES PAR ORIGINE — le point de l’étape')
for (const [k, v] of Object.entries(releve.parOrigine).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(4)}${k === 'supabase auth-js' ? '   <- leurre : présent, mais aucune file' : ''}`)
console.log('')

console.log('PAR JETON')
for (const [k, j] of Object.entries(releve.parJeton).sort((a, b) => b[1].total - a[1].total)) {
  const o = Object.entries(j.origines).map(([a, n]) => `${a}:${n}`).join(' ')
  console.log(`  ${k.padEnd(46)} ${String(j.total).padStart(3)}   ${o}`)
}
console.log('')

console.log('MAGASINS LOCAUX  (IndexedDB puis localStorage — ce ne sont pas des contrats réseau)')
let aUnMagasin = false
for (const m of releve.magasins) {
  aUnMagasin = true
  console.log(`  IndexedDB « ${m.nom} » v${m.version ?? '?'}   ${m.fichier}`)
  for (const s of m.magasins)
    console.log(`      magasin ${s.nom.padEnd(14)} keyPath=${s.keyPath}${s.effaceAupgrade ? '   (effacé à la montée de version)' : ''}`)
}
for (const c of releve.cles)
  console.log(`  localStorage « ${c.nom} »  écritures=${c.ecritures} lectures=${c.lectures}   ${c.fichier}`)
if (!aUnMagasin && !releve.cles.length) console.log('  aucun')
console.log('')

console.log('POLITIQUE DE REJEU  (déjà relevée en A2 §3.1 — ici EXTRAITE du code)')
for (const p of releve.politiques) {
  console.log(`  ${p.fichier}`)
  console.log(`      jette sur  : {${p.rejet.join(',')}}`)
  console.log(`      bloque à   : tentatives >= ${p.seuilBloque ?? '?'}`)
  for (const d of p.delais) console.log(`      délai      : ${String(d.ms).padStart(6)} ms   sur « ${d.rappel} »`)
}
if (!releve.politiques.length) console.log('  aucun')
console.log('')

console.log('CONTRATS DE LA CAISSE')
for (const r of releve.routes.sort((a, b) => Number(b.enfilee) - Number(a.enfilee) || a.route.localeCompare(b.route)))
  console.log(`  ${r.route.padEnd(30)} [${r.genres.join('+')}]${r.enfilee ? '  <- rejouée par la file' : ''}`)
if (releve.chemins.length) console.log(`  chemins hôte : ${releve.chemins.join(', ')}`)
console.log(`  types mis en file        : {${TYPES_ENFILES.join(', ')}}`)
console.log(`  types refusés hors ligne : {${TYPES_REFUSES_HORS_LIGNE.join(', ')}}`)
console.log('')

/* ---- couverture : quel fichier porte la file, et quelles pages le chargent */

const porteurs = releve.parFichier.filter((f) => f.items.some((i) => i.origine === 'magasin local'))
console.log('OÙ VIT LA FILE  (le nom du fichier n’est pas le propriétaire du code)')
for (const f of porteurs) console.log(`  ${f.fichier}   (${f.total} occurrence(s) classée(s))`)
if (!porteurs.length) console.log('  aucun fichier porteur')
for (const f of porteurs) {
  const id = /^_next_static_chunks_(\d+)-/.exec(f.fichier)
  if (!id) continue
  const chargeants = pages.filter((p) => p.source.includes(`chunks/${id[1]}-`)).map((p) => p.fichier)
  console.log(`  chunk ${id[1]} chargé par ${chargeants.length}/${pages.length} page(s) : ${chargeants.join(', ') || '—'}`)
}
console.log('')

if (drapeau('--fichiers')) {
  console.log('FICHIERS (occurrences classées)')
  for (const f of releve.parFichier.sort((a, b) => b.total - a.total)) {
    const o = {}
    for (const it of f.items) o[it.origine] = (o[it.origine] || 0) + 1
    console.log(`  ${String(f.total).padStart(4)}  ${f.foyer.padEnd(17)} ${f.fichier}`)
    console.log(`        ${Object.entries(o).map(([k, n]) => `${k}:${n}`).join(' ')}`)
  }
  console.log('')
}

const sortie = argument('--sortie')
if (sortie) {
  const chemin = resolve(sortie)
  mkdirSync(dirname(chemin), { recursive: true })
  const charge = {
    date: new Date().toISOString(),
    assets: dossierAssets.replace(RACINE + '/', ''),
    pages: dossierPages.replace(RACINE + '/', ''),
    bundles: bundles.map((b) => b.fichier),
    releve,
    calibration: { ecarts, temoins: TEMOINS_CAISSE },
  }
  writeFileSync(chemin, JSON.stringify(charge, null, 1))
  console.log(`JSON : ${chemin}`)
}

