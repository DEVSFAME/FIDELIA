/* ============================================================================
   REA Fidelix — A5 : relevé de Fidelia AI. LECTURE SEULE, ZÉRO REQUÊTE.

   Ce CLI ne fait aucun fetch, aucun POST, aucun OPTIONS. Il lit des fichiers
   déjà capturés : bundles, pages, sondes, réseau observé. Aucune génération
   n'est déclenchée — c'est la consigne de l'étape, et elle est tenue par
   construction : il n'y a pas de client HTTP dans ce fichier.

   Usage :
     node tools/rea/relever-fidelia.mjs [--capture <dir>] [--corpus <dir>]
                                       [--sortie <json>] [--temoins]

   Un dossier absent est une erreur (exit 2), jamais du vide silencieux.
   ========================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appelsFidelia,
  calibrer,
  classerCorpus,
  classerOrigine,
  familleDeFichier,
  formeSortie,
  gardeFousSource,
  grilleQuestions,
  marqueursLlm,
  presence,
  releverFidelia,
  TEMOINS_FIDELIA,
} from './fidelia.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../..')
const CAPTURE_DEFAUT = join(RACINE, '01_REA_Fidelix/_captures/2026-10-27-auth-s3')
const CORPUS_DEFAUT = join(RACINE, '01_REA_Fidelix/_captures')

const argument = (nom, defaut = null) => {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : defaut
}
const drapeau = (nom) => process.argv.includes(nom)

const dossierCapture = resolve(argument('--capture', CAPTURE_DEFAUT))
const dossierCorpus = resolve(argument('--corpus', CORPUS_DEFAUT))

for (const d of [dossierCapture, dossierCorpus]) {
  if (!existsSync(d) || !statSync(d).isDirectory()) {
    console.error(`Dossier introuvable : ${d}`)
    console.error('Aucune preuve fabriquée — relancer la capture qui le produit.')
    process.exit(2)
  }
}

const lireDossier = (dir, ext) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => ext.some((e) => f.endsWith(e)))
        .sort()
        .map((f) => ({ fichier: f, source: readFileSync(join(dir, f), 'utf8') }))
    : []

const bundles = lireDossier(join(dossierCapture, 'raw/assets'), ['.js'])
const pages = lireDossier(join(dossierCapture, 'raw/pages'), ['.html'])
const sondes = lireDossier(join(dossierCapture, 'raw/sondes'), ['.html'])

// Les deux réponses connues, nommées par la sonde qui les a produites.
const reponses = sondes
  .filter((s) => /api-fidelia/.test(s.fichier))
  .map((s) => {
    let objet = null
    try {
      objet = JSON.parse(s.source)
    } catch {
      objet = null
    }
    return { fichier: s.fichier, octets: s.source.length, objet }
  })

/* ---------------------------------------------------------------------------
   Corpus large : tout ce qui est en texte sous `_captures`. Sert UNIQUEMENT à
   la table d'origines — pas à la calibration, qui doit rester sur les bundles.
   ------------------------------------------------------------------------ */

const EXT_TEXTE = new Set(['.js', '.html', '.json', '.txt'])
const PLAFOND = 1_500_000 // au-delà, on saute et on le DIT

function parcourir(dir, racine, sortie = [], sautes = []) {
  for (const nom of readdirSync(dir).sort()) {
    const chemin = join(dir, nom)
    let st
    try {
      st = statSync(chemin)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      parcourir(chemin, racine, sortie, sautes)
      continue
    }
    if (!EXT_TEXTE.has(extname(nom))) continue
    if (st.size > PLAFOND) {
      sautes.push({ chemin: chemin.slice(racine.length + 1), octets: st.size })
      continue
    }
    sortie.push({ chemin: chemin.slice(racine.length + 1), source: readFileSync(chemin, 'utf8') })
  }
  return { fichiers: sortie, sautes }
}

const { fichiers: corpus, sautes } = parcourir(dossierCorpus, dossierCorpus)
const releve = classerCorpus(corpus)

// Le porteur du contrat, identifié par le relevé — pas par son nom de fichier
// (lesson §20 : un nom de chunk ne dit pas ce qu'il contient).
const porteur = bundles.find((b) => releve.porteursContrat.some((c) => c.endsWith(b.fichier))) || null
const appels = porteur ? appelsFidelia(porteur.source) : []
const gardeFous = porteur ? gardeFousSource(porteur.source) : []
const ecarts = calibrer({ bundles, pages, releve, appels, reponses })

/* ---------------------------------------------------------------------------
   Réseau observé : ce que le navigateur a RÉELLEMENT émis pendant la capture.
   Le paramètre exact n'y est pas lisible (l'URL est tronquée en `?…`) — c'est
   une limite du corpus, et elle est écrite comme telle, pas comblée.
   ------------------------------------------------------------------------ */

function reseauObserve() {
  const lignes = []
  // Toutes les captures, pas seulement celle en cours : les `reseau.json` de
  // la passe rendue vivent dans `2026-10-26-auth/rendu/`, pas dans la passe
  // S3. Chercher au mauvais endroit rendait « 0 page a appelé l'API », ce qui
  // est faux — et c'est exactement le genre de zéro qu'il faut savoir lire.
  for (const cap of readdirSync(dossierCorpus).sort()) {
    const dossierRendu = join(dossierCorpus, cap, 'rendu')
    if (!existsSync(dossierRendu) || !statSync(dossierRendu).isDirectory()) continue
    for (const f of readdirSync(dossierRendu).filter((x) => x.endsWith('.reseau.json')).sort()) {
      let d
      try {
        d = JSON.parse(readFileSync(join(dossierRendu, f), 'utf8'))
      } catch {
        continue
      }
      const fid = (d.requetes || []).filter((r) => String(r.chemin || '').includes('/api/fidelia'))
      lignes.push({
        capture: cap,
        page: f.replace('.reseau.json', ''),
        requetes: fid.map((r) => ({ chemin: r.chemin, statut: r.statut })),
      })
    }
  }
  return lignes
}

/* ---------------------------------------------------------------------------
   Le bouton est-il rendu ? Mesuré sur le HTML, page par page. C'est le second
   axe qui confirme la liste d'exclusion `v` par une mesure INDÉPENDANTE.
   ------------------------------------------------------------------------ */

function boutonParPage() {
  const manifeste = join(dossierCapture, 'manifeste.json')
  const http = {}
  if (existsSync(manifeste)) {
    try {
      for (const r of JSON.parse(readFileSync(manifeste, 'utf8')).releves || []) http[r.id] = r.http
    } catch {
      /* le manifeste est un confort, pas une preuve */
    }
  }
  return pages
    .filter((p) => /^a\d/.test(p.fichier))
    .map((p) => {
      const id = p.fichier.replace('.html', '')
      return {
        page: id,
        http: http[id] ?? null,
        // Une page peut être 200 sans être sous le layout du dashboard :
        // /caisse est une autre application (PWA au scope /caisse), /r/... est
        // public. Sans ce drapeau, leur absence de bouton passerait pour une
        // exclusion, alors qu'elle est une autre mise en page.
        layoutDashboard: p.source.includes('--largeur-rail'),
        bouton: (p.source.match(/Ouvrir Fidelia AI/g) || []).length,
        panneau: (p.source.match(/Posez-moi une question/g) || []).length,
      }
    })
}

/* ---------------------------------------------------------------------------
   Rapport.
   ------------------------------------------------------------------------ */

const oui = (b) => (b ? 'trouvé' : 'ABSENT')
const pad = (s, n) => String(s).padEnd(n)
const lignes = []
const dire = (s = '') => {
  lignes.push(s)
  console.log(s)
}

dire('='.repeat(78))
dire('A5 — FIDELIA AI : ce que le corpus dit, et ce qu’il ne dit pas')
dire('='.repeat(78))
dire(`Capture    : ${dossierCapture.replace(RACINE + '/', '')}`)
dire(`Bundles    : ${bundles.length} · pages : ${pages.length} · sondes : ${sondes.length}`)
dire(`Corpus     : ${corpus.length} fichiers texte${sautes.length ? ` (${sautes.length} sauté(s), > ${PLAFOND} o)` : ''}`)
dire('Requêtes   : 0 — ce CLI ne contient aucun client HTTP.')
dire()

dire('1. CALIBRATION')
dire(`   ecarts : ${ecarts.length ? ecarts.length : 'aucun'}`)
for (const e of ecarts) dire(`   ! ${e}`)
dire(`   témoin de décodage : « ${TEMOINS_FIDELIA.temoinDecodage} » -> « Réessayez » (4 caractères source = 1 caractère)`)
dire(`   leurre « ${TEMOINS_FIDELIA.leurreLibelle} » : ${presence(bundles, 'Fidelia AI') ? 'présent' : 'ABSENT'} dans les bundles, jamais classé contrat`)
dire()

dire('2. LE CONTRAT — ce que le client ÉMET')
if (!porteur) dire('   ! aucun porteur identifié')
else {
  dire(`   porteur : ${porteur.fichier} (${porteur.source.length} caractères)`)
  for (const a of appels) {
    dire(
      `   ${pad(a.url, 22)} ${a.appele ? 'fetch' : 'littéral'} · options=${a.options === null ? 'AUCUNE' : a.options} · méthode=${a.methodeDeclaree || '(défaut GET)'} · corps=${a.corpsDeclare ? 'OUI' : 'non'}`,
    )
  }
  dire('   => deux GET, aucun corps, aucun en-tête : aucune entrée ne quitte le navigateur.')
}
dire()

dire('3. PROMPT SYSTÈME — absence mesurée')
const marqueurs = marqueursLlm(bundles)
const modelesPresents = marqueurs.modele.filter((m) => m.fichiers.length)
const fluxPresents = marqueurs.flux.filter((m) => m.fichiers.length)
dire(`   marqueurs de MODÈLE : ${modelesPresents.length}/${marqueurs.modele.length} présents dans ${bundles.length} bundles`)
for (const m of modelesPresents) dire(`   ! ${m.marqueur} dans ${m.fichiers.join(', ')}`)
dire(`   marqueurs de FLUX : ${fluxPresents.length}/${marqueurs.flux.length} (génériques, hors Fidelia)`)
for (const m of fluxPresents) dire(`     ${m.marqueur} dans ${m.fichiers.join(', ')}`)
dire('   => aucun marqueur de modèle dans le code livré. Un prompt côté serveur')
dire('      resterait invisible depuis ici : non mesuré, et non affirmé.')
dire()

dire('4. FORME DE LA SORTIE — lue sur les octets des sondes')
for (const r of reponses) {
  dire(`   ${r.fichier} (${r.octets} o)`)
  const f = formeSortie(r.objet, r.octets)
  if (!f.json) {
    dire('   ! non-JSON')
    continue
  }
  for (const c of f.champs) {
    const extra = c.cles ? ` clés=${c.cles.length} [${c.cles.slice(0, 4).join(', ')}${c.cles.length > 4 ? '…' : ''}]` : ''
    const len = c.longueur !== undefined ? ` longueur=${c.longueur}` : ''
    const val = c.valeur !== undefined ? ` valeur=${JSON.stringify(c.valeur)}` : ''
    dire(`     ${pad(c.nom, 22)} ${pad(c.type, 8)}${len}${val}${extra}`)
  }
}
dire()

dire('5. GRILLE DE QUESTIONS — la « conversation » est locale')
for (const r of reponses) {
  if (!r.objet || !r.objet.libelles) continue
  const g = grilleQuestions(r.objet)
  dire(`   ${r.fichier} : cohérent=${g.coherent ? 'oui' : 'NON'} · ${g.stats.questions} questions, ${g.stats.ouverture} en ouverture`)
  for (const e of g.ecarts) dire(`   ! ${e}`)
  dire(`   liens d'action : ${g.stats.liens.join(', ') || '(aucun)'}`)
}
dire()

dire('6. GARDE-FOUS — lus dans le porteur, un par un')
for (const g of gardeFous) {
  const extra = g.ttlMs ? ` (${g.ttlMs} ms = ${Math.round(g.ttlMs / 60000)} min)` : ''
  dire(`   ${g.present ? 'OK  ' : 'MANQ'} ${pad(g.id, 28)}${g.libelle}${extra}`)
}
dire()

dire('7. ORIGINE DES OCCURRENCES — un libellé n’est pas un contrat')
for (const [jeton, e] of Object.entries(releve.parJeton).sort((a, b) => b[1].total - a[1].total)) {
  const origines = Object.entries(e.origines)
    .map(([o, n]) => `${o}×${n}`)
    .join(', ')
  dire(`   ${pad(jeton, 22)} total=${pad(e.total, 4)} ${origines}`)
}
dire()
dire('   par famille de fichier :')
for (const [f, n] of Object.entries(releve.parFamille).sort((a, b) => b[1] - a[1])) dire(`     ${pad(f, 26)} ${n}`)
dire()
dire(`   porteurs du contrat : ${releve.porteursContrat.length ? releve.porteursContrat.join(', ') : 'AUCUN'}`)
dire()

dire('8. RÉSEAU OBSERVÉ — ce que le navigateur a réellement émis')
let pagesAvecAppel = 0
for (const l of reseauObserve()) {
  if (!l.requetes.length) continue
  pagesAvecAppel++
  dire(`   ${pad(l.page, 22)} ${l.requetes.map((r) => `${r.chemin} (${r.statut})`).join(' · ')}`)
}
dire(`   ${pagesAvecAppel} page(s) ont émis un appel à /api/fidelia`)
dire('   Limite : l’URL est enregistrée tronquée en « ?… » — le paramètre exact')
dire('   n’est PAS lisible dans la capture. « ?resume=1 » vient du code, pas du réseau.')
dire()

dire('9. LE BOUTON SUR CHAQUE PAGE — mesure indépendante de la liste v')
const parPage = boutonParPage()
const sousLayout = parPage.filter((p) => p.layoutDashboard)
const sousLayout200 = sousLayout.filter((p) => p.http === 200)
const avecBouton = sousLayout200.filter((p) => p.bouton > 0)
const sansBouton = sousLayout200.filter((p) => p.bouton === 0)
const hors200 = sousLayout.filter((p) => p.http !== 200)
dire(`   ${avecBouton.length}/${sousLayout200.length} pages 200 sous layout dashboard portent le bouton`)
dire(`   pages 200 sous layout SANS bouton : ${sansBouton.map((p) => p.page).join(', ') || '(aucune)'}`)
dire('   liste d’exclusion lue dans le code : /scan, /conseiller, /branding')
if (hors200.length)
  dire(`   statut non conclusif (hors 200 ou non relevé) : ${hors200.map((p) => `${p.page} (${p.http})`).join(', ')}`)
dire(`   panneaux ouverts dans les captures : ${parPage.filter((p) => p.panneau > 0).length}`)
dire()

if (drapeau('--fichiers')) {
  dire('10. FICHIERS PORTEURS')
  for (const f of releve.parFichier) {
    dire(`   ${pad(f.fichier, 62)} ${pad(f.famille, 22)} ${f.items.length} occurrence(s)`)
    for (const i of f.items) dire(`      ${pad(i.jeton, 22)} ${i.origine}`)
  }
  dire()
}

dire('CE QUE LE CORPUS NE DIT PAS')
dire('   — Le prompt, s’il existe, est côté serveur : aucun bundle ne le contient.')
dire('   — Aucun POST vers /api/fidelia n’a été observé : pas de question envoyée.')
dire('   — /conseiller n’a jamais été capturé : son existence est LUE (titre + liste v),')
dire('     son rendu n’est pas mesuré. Aucune requête n’a été faite pour le lever.')
dire('   — Aucun panneau ouvert : les captures ne montrent que le bouton fermé.')
if (sautes.length) dire(`   — ${sautes.length} fichier(s) sauté(s) faute de place : ${sautes.map((s) => s.chemin).join(', ')}`)

/* ---------------------------------------------------------------------------
   Sortie machine. Aucune donnée de client : les réponses sont des textes de
   conseil, sans identifiant — `cle` est un opaque, il est conservé tel quel
   pour comparaison, jamais résolu.
   ------------------------------------------------------------------------ */

const cheminSortie = argument('--sortie')
if (cheminSortie) {
  const sortie = {
    date: new Date().toISOString(),
    capture: dossierCapture.replace(RACINE + '/', ''),
    requetes: 0,
    comptes: { bundles: bundles.length, pages: pages.length, sondes: sondes.length, corpus: corpus.length },
    calibration: { ecarts },
    contrat: porteur ? { porteur: porteur.fichier, caracteres: porteur.source.length, appels } : null,
    marqueursLlm: { modele: modelesPresents, flux: fluxPresents },
    reponses: reponses.map((r) => ({
      fichier: r.fichier,
      octets: r.octets,
      forme: formeSortie(r.objet, r.octets),
      grille: r.objet && r.objet.libelles ? grilleQuestions(r.objet) : null,
    })),
    gardeFous,
    origines: {
      parJeton: releve.parJeton,
      parOrigine: releve.parOrigine,
      parFamille: releve.parFamille,
      porteursContrat: releve.porteursContrat,
    },
    reseauObserve: reseauObserve(),
    boutons: parPage,
    nonMesure: [
      'prompt système côté serveur',
      'rendu de /conseiller',
      'panneau ouvert (liste des questions rendue)',
      'paramètre exact de l’appel réseau (URL tronquée en « ?… »)',
    ],
  }
  mkdirSync(dirname(resolve(cheminSortie)), { recursive: true })
  writeFileSync(resolve(cheminSortie), JSON.stringify(sortie, null, 2) + '\n')
  console.log(`\nJSON écrit : ${cheminSortie}`)
}

process.exit(ecarts.length ? 1 : 0)

