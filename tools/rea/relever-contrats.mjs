/* ============================================================================
   REA Fidelix — A2 : relevé des contrats d'écriture CÔTÉ CLIENT.

   Lit des bundles DÉJÀ CAPTURÉS et n'émet aucune requête. Le module
   `contrats.mjs` ne connaît ni `fetch` ni `http` ; cette CLI non plus.

   Usage :
     node tools/rea/relever-contrats.mjs [--assets <dir>] [--sortie <json>]
                                         [--temoins] [--markdown]

   Sans `--assets`, on prend la dernière passe authentifiée connue. Si le
   dossier est absent, on s'arrête (exit 2) : on ne fabrique pas de preuve.
   ========================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agreger, calibrer, schemasClient, litterauxApi, TEMOINS } from './contrats.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../..')
const ASSETS_DEFAUT = join(RACINE, '01_REA_Fidelix/_captures/2026-10-27-auth-s3/raw/assets')

function argument(nom, defaut = null) {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut
}
const drapeau = (nom) => process.argv.includes(nom)

const dossier = resolve(argument('--assets', ASSETS_DEFAUT))

let fichiers
try {
  if (!statSync(dossier).isDirectory()) throw new Error('pas un dossier')
  fichiers = readdirSync(dossier).filter((f) => f.endsWith('.js')).sort()
} catch {
  console.error(`Bundles introuvables : ${dossier}`)
  console.error('Aucune preuve fabriquée — relancer S3 pour les produire.')
  process.exit(2)
}

const bundles = fichiers.map((f) => ({ fichier: f, source: readFileSync(join(dossier, f), 'utf8') }))
const contrats = agreger(bundles)
const ecarts = calibrer(contrats)

/** Nombre de bundles portant le littéral (indépendant du classement en contrat). */
const portantLeLitteral = (u) => bundles.filter((b) => litterauxApi(b.source).some((x) => x.url === u)).length

/* ------------------------------------------------------------------ rapport */

const post = contrats.filter((c) => c.methodes.some((m) => m.methode === 'POST'))
const get = contrats.filter((c) => c.methodes.some((m) => m.methode === 'GET') && !post.includes(c))

console.log(`Bundles lus      : ${bundles.length}`)
console.log(`URL /api/ vues   : ${contrats.length}`)
console.log(`  dont POST       : ${post.length}`)
console.log(`  dont GET seul   : ${get.length}`)
console.log('')

console.log('CALIBRATION (témoins)')
console.log(`  positif GET      : ${TEMOINS.positif.padEnd(30)} ${contrats.find((c) => c.url === TEMOINS.positif) ? 'trouvé' : 'ABSENT'}`)
console.log(`  positif POST     : ${TEMOINS.positifPost.padEnd(30)} ${post.some((c) => c.url === TEMOINS.positifPost) ? 'POST' : 'non classé POST'}`)
console.log(`  positif manifeste: ${TEMOINS.positifManifeste.padEnd(30)} ${contrats.find((c) => c.url === TEMOINS.positifManifeste)?.methodes[0]?.genre ?? 'ABSENT'}`)
console.log(
  `  leurre           : ${TEMOINS.leurre.padEnd(30)} littéral dans ${portantLeLitteral(TEMOINS.leurre)} bundle(s), ` +
    `contrat : ${post.some((c) => c.url === TEMOINS.leurre) ? 'POST — ANORMAL' : 'aucun (conforme : route 404)'}`,
)
console.log(`  négatif          : ${TEMOINS.negatif.padEnd(30)} ${contrats.some((c) => c.url === TEMOINS.negatif) || portantLeLitteral(TEMOINS.negatif) ? 'SORTI — ANORMAL' : 'non sorti'}`)
console.log(ecarts.length ? `  VERDICT : ${ecarts.length} écart(s)` : '  VERDICT : calibré')
for (const e of ecarts) console.log(`    ! ${e}`)
console.log('')

if (drapeau('--temoins')) process.exit(ecarts.length ? 3 : 0)

console.log('CONTRATS POST')
for (const c of post) {
  const m = c.methodes.find((x) => x.methode === 'POST')
  console.log(`  ${c.url.padEnd(34)} [${m.genre.padEnd(9)}] ${c.corps.map(rendreCorps).join('  |  ') || '—'}`)
}

/** `{type,is_active}` + spreads (`+logo_url`) + `clé[]{sous}` + branches `?`/`:`. */
function rendreCorps(c) {
  if (!c.cles.length) {
    const meth = c.methode && c.methode !== 'POST' ? ` [${c.methode}]` : ''
    return `${c.genre}:${c.exemple ? c.exemple.replace(/\s+/g, '') : '?'}${meth}`
  }
  const branches = new Map()
  for (const k of c.cles) {
    const b = k.branche || ''
    if (!branches.has(b)) branches.set(b, [])
    const nom = k.etalement ? `+{${k.sousCles.join(',')}}` : k.nom
    const detail = !k.etalement && k.sousCles.length ? `${nom}[]{${k.sousCles.join(',')}}` : nom
    branches.get(b).push(detail)
  }
  const corps = [...branches].map(([b, cles]) => (b ? `${b}{${cles.join(',')}}` : cles.join(',')))
  return `${c.genre}:${corps.join(' ')}`
}

const schemas = bundles.flatMap((b) => schemasClient(b.source).map((s) => ({ ...s, fichier: b.fichier })))
console.log('')
console.log(`SCHÉMAS ZOD CÔTÉ CLIENT : ${schemas.length}`)
for (const s of schemas) console.log(`  ${s.nom.padEnd(3)} ${s.fichier.slice(0, 46).padEnd(48)} ${s.champs.map((c) => c.nom).join(', ')}`)

const sortie = argument('--sortie')
if (sortie) {
  const chemin = resolve(sortie)
  mkdirSync(dirname(chemin), { recursive: true })
  const charge = {
    date: new Date().toISOString(),
    assets: dossier,
    bundles: bundles.map((b) => b.fichier),
    contrats,
    schemas,
    calibration: { ecarts, temoins: TEMOINS },
    litteraux: Object.fromEntries(
      bundles.map((b) => [b.fichier, litterauxApi(b.source).map((x) => x.url)]),
    ),
  }
  writeFileSync(chemin, JSON.stringify(charge, null, 1))
  console.log(`\nJSON : ${chemin}`)
}
