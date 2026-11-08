/* ============================================================================
   REA Fidelix — A3 : où sont PRODUITS les pass Apple/Google ?

   Lit des bundles DÉJÀ CAPTURÉS. N'émet aucune requête (ni GET, ni OPTIONS) :
   la sonde réseau d'A3 est consignée dans
   `01_REA_Fidelix/_captures/2026-10-27-a3/sondes.json`, et les deux routes de
   GÉNÉRATION n'ont délibérément pas été appelées (voir la doc §5.4 : une
   génération de pass n'est pas une lecture).

   Usage :
     node tools/rea/relever-wallet.mjs [--assets <dir>]… [--sortie <json>]
                                       [--temoins] [--fichiers]

   Sans `--assets`, on prend les trois corpus connus (anonyme 2026-10-26,
   authentifié 2026-10-27, page carte 2026-10-27-a3). Un dossier absent est
   signalé, jamais remplacé par du vide silencieux (exit 2).
   ========================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classerCorpus, calibrer, presence, TEMOINS_WALLET } from './wallet.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../..')
const DEFAUT = [
  '01_REA_Fidelix/_captures/2026-10-26/raw/assets',
  '01_REA_Fidelix/_captures/2026-10-27-auth-s3/raw/assets',
  '01_REA_Fidelix/_captures/2026-10-27-a3/raw/assets',
].map((p) => join(RACINE, p))

function argumentsDe(nom) {
  const out = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === nom && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) out.push(process.argv[i + 1])
  }
  return out
}
const drapeau = (nom) => process.argv.includes(nom)

const dossiers = (argumentsDe('--assets').length ? argumentsDe('--assets') : DEFAUT).map((d) => resolve(d))

const corpus = []
for (const dossier of dossiers) {
  if (!existsSync(dossier) || !statSync(dossier).isDirectory()) {
    console.error(`Bundles introuvables : ${dossier}`)
    console.error('Aucune preuve fabriquée — relancer la capture qui les produit.')
    process.exit(2)
  }
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.js')).sort()
  corpus.push({
    dossier,
    bundles: fichiers.map((f) => ({ fichier: f, source: readFileSync(join(dossier, f), 'utf8') })),
  })
}

const tous = corpus.flatMap((c) => c.bundles)
const releve = classerCorpus(tous)
const ecarts = calibrer({ bundles: tous, routes: releve.routes })
const temoin = (j) => presence(tous, j)

/* ------------------------------------------------------------------ rapport */

const total = Object.values(releve.parJeton).reduce((a, j) => a + j.total, 0)
console.log('CORPUS')
for (const c of corpus) console.log(`  ${String(c.bundles.length).padStart(3)} bundle(s)  ${c.dossier.replace(RACINE + '/', '')}`)
console.log(`\nOCCURRENCES (sans double comptage) : ${total}\n`)

console.log('PAR ORIGINE')
for (const [k, v] of Object.entries(releve.parOrigine).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(3)}`)
}

console.log('\nPAR JETON')
for (const [k, j] of Object.entries(releve.parJeton).sort((a, b) => b[1].total - a[1].total)) {
  const o = Object.entries(j.origines)
    .map(([a, n]) => `${a}:${n}`)
    .join(' ')
  console.log(`  ${k.padEnd(30)} ${String(j.total).padStart(3)}   ${o}`)
}

console.log('\nCONTRATS RELEVÉS')
if (!releve.routes.length) console.log('  aucun')
for (const r of releve.routes) {
  console.log(`  ${r.route.padEnd(42)} [${r.genres.join('+')}]`)
  for (const f of r.fichiers) console.log(`      ${f}`)
}

if (drapeau('--fichiers')) {
  console.log('\nFICHIERS')
  for (const f of releve.parFichier.sort((a, b) => b.total - a.total)) {
    const o = {}
    for (const it of f.items) o[it.origine] = (o[it.origine] || 0) + 1
    console.log(`  ${String(f.total).padStart(3)}  ${f.foyer.padEnd(18)} ${f.fichier}`)
    console.log(`       ${Object.entries(o).map(([k, n]) => `${k}:${n}`).join(' ')}`)
  }
}

console.log('\nCALIBRATION')
const verdict = (ok, oui, non) => (ok ? oui : non)
console.log(`  positif route    : ${TEMOINS_WALLET.positifRoute.padEnd(26)} ${verdict(releve.routes.some((r) => r.route.startsWith(TEMOINS_WALLET.positifRoute)), 'trouvé', 'ABSENT')}`)
console.log(`  positif champ    : ${TEMOINS_WALLET.positifChamp.padEnd(26)} ${verdict(temoin(TEMOINS_WALLET.positifChamp), 'trouvé', 'ABSENT')}`)
console.log(`  positif prose    : ${TEMOINS_WALLET.positifProse.padEnd(26)} ${verdict(temoin(TEMOINS_WALLET.positifProse), 'trouvé', 'ABSENT')}`)
console.log(`  négatif format   : ${TEMOINS_WALLET.negatif.padEnd(26)} ${verdict(temoin(TEMOINS_WALLET.negatif), 'SORTI — ANORMAL', 'non sorti')}`)
console.log(`  négatif format   : ${TEMOINS_WALLET.negatif2.padEnd(26)} ${verdict(temoin(TEMOINS_WALLET.negatif2), 'SORTI — ANORMAL', 'non sorti')}`)
console.log(`  leurre auth-js   : ${(releve.parOrigine['supabase auth-js'] || 0).toString().padEnd(26)} classé bibliothèque, jamais en contrat`)
console.log(ecarts.length ? `  VERDICT : ${ecarts.length} écart(s)` : '  VERDICT : calibré')
for (const e of ecarts) console.log(`    ! ${e}`)

if (drapeau('--temoins')) process.exit(ecarts.length ? 3 : 0)

const sortie = argumentsDe('--sortie')[0]
if (sortie) {
  const chemin = resolve(sortie)
  mkdirSync(dirname(chemin), { recursive: true })
  const charge = {
    date: new Date().toISOString(),
    corpus: corpus.map((c) => ({ dossier: c.dossier, bundles: c.bundles.map((b) => b.fichier) })),
    releve,
    calibration: { ecarts, temoins: TEMOINS_WALLET },
  }
  writeFileSync(chemin, JSON.stringify(charge, null, 1))
  console.log(`\nJSON : ${chemin}`)
}
