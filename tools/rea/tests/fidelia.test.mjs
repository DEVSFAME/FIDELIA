/* ============================================================================
   A5 — tests du relevé de Fidelia AI. Aucun réseau, aucun fichier temporaire.

   Ces tests couvrent les quatre défauts trouvés EN ÉCRIVANT l'instrument :
     1. les offsets de `litterauxApi` tombent après le guillemet ouvrant ;
     2. `tableauContenant` ne reculait pas au-delà du premier élément ;
     3. `systemPrompt` et `text/event-stream` ne sont pas la même famille ;
     4. trois copies d'un chunk ne sont pas trois propriétaires.
   Chacun a son test de régression, et un contre-témoin qui doit ÉCHOUER.
   ========================================================================== */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appelsFidelia,
  calibrer,
  classerCorpus,
  classerOrigine,
  decoderEchappements,
  familleDeFichier,
  formeSortie,
  gardeFousSource,
  grilleQuestions,
  marqueursLlm,
  presence,
  releverFidelia,
  tableauContenant,
  TEMOINS_FIDELIA,
  JETONS_FIDELIA,
  ORIGINE_DE_ROLE,
} from '../fidelia.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CAPTURES = join(RACINE, '01_REA_Fidelix/_captures')
const ASSETS = join(CAPTURES, '2026-10-27-auth-s3/raw/assets')
const PAGES = join(CAPTURES, '2026-10-27-auth-s3/raw/pages')
const SONDES = join(CAPTURES, '2026-10-27-auth-s3/raw/sondes')
const PORTEUR = join(ASSETS, '_next_static_chunks_app__dashboard__layout-aa8914c1bd963665.js')

const lire = (p) => readFileSync(p, 'utf8')
const bundles = readdirSync(ASSETS)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => ({ fichier: f, source: lire(join(ASSETS, f)) }))
const pages = readdirSync(PAGES)
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => ({ fichier: f, source: lire(join(PAGES, f)) }))
const source = lire(PORTEUR)
const reponses = ['b12-api-fidelia.html', 'b13-api-fidelia-resume.html'].map((f) => ({
  fichier: f,
  objet: JSON.parse(lire(join(SONDES, f))),
}))

/* --------------------------------------------------------------------------
   1. Décodage — la règle §20.2, avec sa réponse connue d'avance.
   ----------------------------------------------------------------------- */

test('décodage : 4 caractères source deviennent UN caractère', () => {
  const source4 = TEMOINS_FIDELIA.temoinDecodage
  const sortie = decoderEchappements(source4)
  assert.equal(sortie, 'Réessayez')
  assert.equal(source4.length - sortie.length, 3)
})

test('décodage : un accent fait un seul caractère, pas deux octets', () => {
  const sortie = decoderEchappements('\\xe9')
  assert.equal(sortie, 'é')
  assert.equal([...sortie].length, 1)
})

test('décodage : \\xc3\\xa9 vaut « Ã© », le recoller serait une invention', () => {
  assert.equal(decoderEchappements('\\xc3\\xa9'), 'Ã©')
})

test('décodage : le porteur contient « Réessayez » une fois décodé', () => {
  assert.ok(decoderEchappements(source).includes('Réessayez'))
})

/* --------------------------------------------------------------------------
   2. Relevé — pas de double comptage.
   ----------------------------------------------------------------------- */

test('relevé : « Ouvrir Fidelia AI » ne produit pas un second « Fidelia AI »', () => {
  const s = 'aria-label:"Ouvrir Fidelia AI"'
  const jetons = releverFidelia(s).map((x) => x.jeton)
  assert.deepEqual(jetons, ['Ouvrir Fidelia AI'])
})

test('relevé : les deux contrats sont distincts, pas emboîtés', () => {
  const s = 'fetch("/api/fidelia"),fetch("/api/fidelia?resume=1")'
  const jetons = releverFidelia(s).map((x) => x.jeton)
  assert.deepEqual(jetons, ['/api/fidelia', '/api/fidelia?resume=1'])
})

test('relevé : sur le porteur, les deux contrats sortent en contrat réseau', () => {
  const items = releverFidelia(source).map(({ jeton, debut }) => ({ jeton, ...classerOrigine(source, debut, jeton) }))
  const contrats = items.filter((i) => i.origine === ORIGINE_DE_ROLE['contrat-reseau']).map((i) => i.jeton)
  assert.deepEqual(contrats.sort(), ['/api/fidelia', '/api/fidelia?resume=1'])
})


/* --------------------------------------------------------------------------
   3. Classement d'origine — « un libellé d'interface n'est pas un contrat ».
      Le premier test est le plus important : il doit rester vrai même quand
      le libellé est dans un contexte qui ressemble à un appel.
   ----------------------------------------------------------------------- */

test('origine : un libellé déclaré reste un libellé, même dans un fetch', () => {
  const s = 'fetch("Fidelia AI")'
  const i = s.indexOf('Fidelia AI')
  assert.equal(classerOrigine(s, i, 'Fidelia AI').origine, ORIGINE_DE_ROLE.libelle)
})

test('origine : contrat réseau quand la chaîne est argument de fetch', () => {
  const s = 'let e=await fetch("/api/fidelia")'
  const i = s.indexOf('/api/fidelia')
  const c = classerOrigine(s, i, '/api/fidelia')
  assert.equal(c.origine, ORIGINE_DE_ROLE['contrat-reseau'])
  assert.equal(c.contexte, 'argument de fetch')
})

test('régression : l’offset de litterauxApi tombe APRÈS le guillemet', () => {
  // Le bug d'origine : comparer source.slice(i-48, i) à `fetch(` échouait
  // toujours, parce que `i` pointe le contenu de la chaîne, pas son guillemet.
  const s = 'fetch("/api/fidelia")'
  const i = s.indexOf('/api/fidelia')
  assert.notEqual(s[i - 1], '(')
  assert.equal(s[i - 1], '"')
  assert.equal(classerOrigine(s, i, '/api/fidelia').role, 'contrat-reseau')
})

test('origine : un littéral de contrat jamais appelé est « cité, non émis »', () => {
  const s = 'const cibles=["/api/fidelia"]'
  const i = s.indexOf('/api/fidelia')
  const c = classerOrigine(s, i, '/api/fidelia')
  assert.equal(c.origine, ORIGINE_DE_ROLE['cite-non-emis'])
  assert.notEqual(c.origine, ORIGINE_DE_ROLE['contrat-reseau'])
})

test('origine : /conseiller dans la liste v est une route exclue', () => {
  const s = 'v=["/scan","/conseiller","/branding"]'
  const i = s.indexOf('/conseiller')
  const c = classerOrigine(s, i, '/conseiller')
  assert.equal(c.role, 'route-exclue')
  assert.equal(c.contexte, "liste d'exclusion")
})

test('régression : tableauContenant recule au-delà du premier élément', () => {
  const s = 'v=["/scan","/conseiller","/branding"]'
  const t = tableauContenant(s, s.indexOf('/conseiller'))
  assert.deepEqual(t.elements, ['/scan', '/conseiller', '/branding'])
})

test('tableauContenant : un tableau d’objets n’est pas une liste de routes', () => {
  const s = 'x=[{a:1},"/conseiller"]'
  assert.equal(tableauContenant(s, s.indexOf('/conseiller')), null)
})

test('origine : /conseiller en href est une navigation', () => {
  const s = 'href:"/conseiller"'
  const i = s.indexOf('/conseiller')
  assert.equal(classerOrigine(s, i, '/conseiller').contexte, 'href')
})

test('origine : un champ de sortie est un accès propriété, pas de la prose', () => {
  const s = '!N.donneesInsuffisantes&&x'
  const i = s.indexOf('donneesInsuffisantes')
  const c = classerOrigine(s, i, 'donneesInsuffisantes')
  assert.equal(c.role, 'champ-sortie')
  assert.equal(c.contexte, 'accès propriété')
})

test('origine : les magasins locaux ne sont jamais des contrats', () => {
  for (const j of ['fidelia_coin', 'fidelia_resume', 'fidelix_conseiller_']) {
    const s = `localStorage.getItem("${j}")`
    const c = classerOrigine(s, s.indexOf(j), j)
    assert.equal(c.origine, ORIGINE_DE_ROLE['magasin-local'])
  }
})

/* --------------------------------------------------------------------------
   4. Les appels — l'absence de canal d'entrée.
   ----------------------------------------------------------------------- */

test('appels : deux appels, aucun second argument', () => {
  const a = appelsFidelia(source)
  assert.equal(a.length, 2)
  for (const x of a) {
    assert.equal(x.appele, true)
    assert.equal(x.options, null)
    assert.equal(x.corpsDeclare, false)
    assert.equal(x.entetesDeclarees, false)
    assert.equal(x.methodeDeclaree, null, 'aucune méthode déclarée donc GET par défaut')
  }
})

test('appels : un littéral non appelé est marqué appele=false', () => {
  const a = appelsFidelia('const r=["/api/fidelia"]')
  assert.equal(a.length, 1)
  assert.equal(a[0].appele, false)
})

test('appels : un POST déclaré serait vu (contre-témoin)', () => {
  const a = appelsFidelia('fetch("/api/fidelia",{method:"POST",body:"{}"})')
  assert.equal(a[0].methodeDeclaree, 'POST')
  assert.equal(a[0].corpsDeclare, true)
})

/* --------------------------------------------------------------------------
   5. Forme de la sortie — lue sur les octets.
   ----------------------------------------------------------------------- */

test('forme : la synthèse porte 8 champs, dont la grille', () => {
  const f = formeSortie(reponses[0].objet)
  assert.equal(f.json, true)
  assert.deepEqual(
    f.champs.map((c) => c.nom),
    ['cle', 'synthese', 'donneesInsuffisantes', 'conseils', 'libelles', 'reponses', 'rebonds', 'ouverture'],
  )
  const par = Object.fromEntries(f.champs.map((c) => [c.nom, c]))
  assert.equal(par.cle.type, 'string')
  assert.equal(par.cle.longueur, 36, 'un UUID textuel, non résolu')
  assert.equal(par.donneesInsuffisantes.valeur, true)
  assert.equal(par.conseils.longueur, 0)
  assert.equal(par.libelles.cles.length, 10)
  assert.equal(par.ouverture.longueur, 4)
})

test('forme : le résumé ne porte qu’un compteur', () => {
  const f = formeSortie(reponses[1].objet)
  assert.equal(f.champs.length, 1)
  assert.equal(f.champs[0].nom, 'urgents')
  assert.equal(f.champs[0].type, 'number')
  assert.equal(f.champs[0].valeur, 0)
})

test('forme : un tableau nu n’est pas un objet à champs', () => {
  assert.equal(formeSortie([1, 2]).json, false)
})

/* --------------------------------------------------------------------------
   6. La grille — la « conversation » ne quitte pas le navigateur.
   ----------------------------------------------------------------------- */

test('grille : la grille observée ferme (10 questions, 4 en ouverture)', () => {
  const g = grilleQuestions(reponses[0].objet)
  assert.equal(g.coherent, true, g.ecarts.join(' | '))
  assert.equal(g.stats.questions, 10)
  assert.equal(g.stats.ouverture, 4)
  assert.deepEqual(g.stats.liens.sort(), ['/automations', '/customers', '/dashboard', '/qrcode', '/rewards'])
})

test('grille : un rebond hors grille est un écart', () => {
  const g = grilleQuestions({
    libelles: { a: 'A', b: 'B' },
    reponses: {
      a: { paragraphes: ['x'], action: { libelle: 'L', lien: '/x' } },
      b: { paragraphes: ['y'], action: { libelle: 'L', lien: '/y' } },
    },
    rebonds: { a: ['zzz'], b: ['a'] },
    ouverture: ['a'],
  })
  assert.equal(g.coherent, false)
  assert.ok(g.ecarts.some((e) => e.includes('rebond hors grille')))
})

test('grille : un rebond sur soi-même est un écart', () => {
  const g = grilleQuestions({
    libelles: { a: 'A' },
    reponses: { a: { paragraphes: ['x'], action: { libelle: 'L', lien: '/x' } } },
    rebonds: { a: ['a'] },
    ouverture: ['a'],
  })
  assert.ok(g.ecarts.some((e) => e.includes('sur soi-même')))
})

test('grille : des clés qui diffèrent sont un écart', () => {
  const g = grilleQuestions({
    libelles: { a: 'A' },
    reponses: {
      a: { paragraphes: ['x'], action: { libelle: 'L', lien: '/x' } },
      b: { paragraphes: ['y'], action: { libelle: 'L', lien: '/y' } },
    },
    rebonds: { a: [] },
    ouverture: ['a'],
  })
  assert.ok(g.ecarts.some((e) => e.includes('different')))
})

test('grille : un lien d’action externe est un écart', () => {
  const g = grilleQuestions({
    libelles: { a: 'A' },
    reponses: { a: { paragraphes: ['x'], action: { libelle: 'L', lien: 'https://ailleurs' } } },
    rebonds: { a: [] },
    ouverture: ['a'],
  })
  assert.ok(g.ecarts.some((e) => e.includes('lien non interne')))
})

/* --------------------------------------------------------------------------
   7. Garde-fous — présents sur le porteur, absents d'un faux porteur.
   ----------------------------------------------------------------------- */

test('garde-fous : les douze sont présents sur le porteur', () => {
  const g = gardeFousSource(source)
  const manquants = g.filter((x) => !x.present).map((x) => x.id)
  assert.deepEqual(manquants, [])
  assert.equal(g.length, 12)
})

test('garde-fous : le TTL vaut 1 800 000 ms, pas « 30 minutes »', () => {
  const ttl = gardeFousSource(source).find((g) => g.id === 'ttl-resume')
  assert.equal(ttl.ttlMs, 1800000)
  assert.equal(ttl.ttlMs / 60000, 30)
})

test('garde-fous : un faux porteur n’en valide aucun (contre-témoin)', () => {
  const g = gardeFousSource('function rien(){}')
  assert.equal(g.filter((x) => x.present).length, 0)
})

test('garde-fous : `routes-masquees` exige les trois chemins, pas un', () => {
  const g = gardeFousSource('v=["/scan","/conseiller"]').find((x) => x.id === 'routes-masquees')
  assert.equal(g.present, false)
})

/* --------------------------------------------------------------------------
   8. Marqueurs — modèle et flux ne sont pas la même famille.
   ----------------------------------------------------------------------- */

test('marqueurs : aucun marqueur de modèle dans les bundles', () => {
  const m = marqueursLlm(bundles)
  const presents = m.modele.filter((x) => x.fichiers.length)
  assert.deepEqual(presents.map((x) => x.marqueur), [])
})

test('marqueurs : un bundle qui contient systemPrompt serait détecté (contre-témoin)', () => {
  const m = marqueursLlm([{ fichier: 'faux.js', source: 'const systemPrompt="tu es…"' }])
  assert.equal(m.modele.find((x) => x.marqueur === 'systemPrompt').fichiers.length, 1)
})

test('marqueurs : le flux générique existe ailleurs, et n’est pas un modèle', () => {
  const m = marqueursLlm(bundles)
  const flux = m.flux.filter((x) => x.fichiers.length).map((x) => x.marqueur)
  assert.ok(flux.length > 0, 'un flux générique est attendu dans le corpus')
  assert.ok(!m.modele.some((x) => x.marqueur.includes('event-stream')))
})


/* --------------------------------------------------------------------------
   9. Provenance des fichiers — deux axes indépendants.
   ----------------------------------------------------------------------- */

test('famille : les familles de fichiers sont reconnues', () => {
  assert.equal(familleDeFichier('2026-10-27-auth-s3/raw/assets/x.js'), 'bundle')
  assert.equal(familleDeFichier('2026-10-27-auth-s3/raw/pages/a01.html'), 'page capturée')
  assert.equal(familleDeFichier('2026-10-27-auth-s3/raw/sondes/b12.html'), 'sonde HTTP')
  assert.equal(familleDeFichier('2026-10-26-auth/rendu/a01.reseau.json'), 'réseau observé')
  assert.equal(familleDeFichier('cibles-auth.json'), 'artefact de nos outils')
  assert.equal(familleDeFichier('2026-10-27-auth-s3/manifeste.json'), 'manifeste de capture')
  assert.equal(familleDeFichier('2026-10-27-a2/contrats-bundles.json'), 'rapport de nos outils')
})

test('corpus : les trois copies du chunk font UN porteur, pas trois', () => {
  const trois = ['2026-10-26', '2026-10-26-auth', '2026-10-27-auth-s3'].map((c) => ({
    chemin: `${c}/raw/assets/_next_static_chunks_app__dashboard__layout-aa8914c1bd963665.js`,
    source,
  }))
  const r = classerCorpus(trois)
  assert.equal(r.porteursContrat.length, 1)
  assert.equal(r.parOrigine[ORIGINE_DE_ROLE['contrat-reseau']], 6, 'deux contrats fois trois copies')
})

test('corpus : le libellé reste un libellé dans les pages capturées', () => {
  const r = classerCorpus(pages)
  const c = r.parJeton[TEMOINS_FIDELIA.leurreLibelle]
  assert.ok(c, 'le leurre doit être présent dans les pages')
  assert.deepEqual(Object.keys(c.origines), [ORIGINE_DE_ROLE.libelle])
})

/* --------------------------------------------------------------------------
   10. Calibration — et ses contre-témoins.
   ----------------------------------------------------------------------- */

test('calibration : aucune divergence sur le corpus réel', () => {
  const releve = classerCorpus([{ chemin: 'a/raw/assets/porteur.js', source }])
  const ecarts = calibrer({ bundles, pages, releve, appels: appelsFidelia(source), reponses })
  assert.deepEqual(ecarts, [])
})

test('calibration : un leurre en argument de fetch fait échouer la calibration', () => {
  const faux = [{ fichier: 'f.js', source: 'fetch("Fidelia AI")' }]
  const ecarts = calibrer({ bundles: faux, pages: [], releve: null, appels: [], reponses: [] })
  assert.ok(
    ecarts.some((e) => e.includes('libellé en argument de fetch')),
    `écarts attendus, obtenus : ${JSON.stringify(ecarts)}`,
  )
})

test('calibration : un négatif présent fait échouer la calibration', () => {
  const faux = [{ fichier: 'f.js', source: 'fetch("/api/fidelia?chat=1")' }]
  const ecarts = calibrer({ bundles: faux, pages: [], releve: null, appels: [], reponses: [] })
  assert.ok(ecarts.some((e) => e.includes('témoin négatif SORTI')))
})

test('calibration : un témoin positif absent est signalé', () => {
  const ecarts = calibrer({ bundles: [{ fichier: 'f.js', source: 'rien' }], pages: [], releve: null })
  assert.ok(ecarts.filter((e) => e.includes('ABSENT des bundles')).length >= 5)
})

test('calibration : un Q&A rendu malgré donneesInsuffisantes est un écart', () => {
  const fauxPages = [{ fichier: 'a01.html', source: '<h2>Posez-moi une question</h2>' }]
  const ecarts = calibrer({ bundles, pages: fauxPages, releve: null, appels: [], reponses })
  assert.ok(ecarts.some((e) => e.includes('Q&A rendu malgré donneesInsuffisantes')))
})

/* --------------------------------------------------------------------------
   11. Le croisement qui vaut preuve : code -> capture.
       Le code dit que `donneesInsuffisantes` vrai masque le Q&A ; la réponse
       observée le dit vrai ; donc aucune page ne doit rendre la question.
       C'est un témoin dont la réponse était connue AVANT de compter.
   ----------------------------------------------------------------------- */

test('croisement : la réponse observée dit donneesInsuffisantes', () => {
  assert.equal(reponses[0].objet.donneesInsuffisantes, true)
})

test('croisement : aucune page capturée ne rend le Q&A', () => {
  const porteur = pages.filter((p) => p.source.includes('Posez-moi une question'))
  assert.deepEqual(porteur.map((p) => p.fichier), [])
})

test('croisement : le bouton, lui, est rendu sur 14 pages', () => {
  const avecBouton = pages.filter((p) => p.source.includes('Ouvrir Fidelia AI'))
  assert.equal(avecBouton.length, 14)
})

test('croisement : /scan et /branding ne portent pas le bouton', () => {
  for (const f of ['a04-scan.html', 'a08-branding.html']) {
    const p = pages.find((x) => x.fichier === f)
    assert.ok(p, `${f} doit exister dans la capture`)
    assert.equal(p.source.includes('Ouvrir Fidelia AI'), false, f)
  }
})

test('/conseiller : jamais capturé, donc existence non mesurée', () => {
  assert.equal(pages.some((p) => p.fichier.includes('conseiller')), false)
  assert.equal(presence(pages, '/conseiller'), false, 'le HTML des pages ne le contient pas')
  assert.equal(presence(bundles, '/conseiller'), true, 'mais le bundle le nomme')
})

test('les deux réponses sont identiques entre les deux passes', () => {
  for (const f of ['b12-api-fidelia.html', 'b13-api-fidelia-resume.html']) {
    const a = lire(join(CAPTURES, '2026-10-26-auth/raw/sondes', f))
    const b = lire(join(CAPTURES, '2026-10-27-auth-s3/raw/sondes', f))
    assert.equal(a, b, `${f} : deux passes, deux contenus`)
  }
})

test('aucun autre jeton /api/fidelia que les deux contrats', () => {
  const jetons = JETONS_FIDELIA.filter((j) => j.startsWith('/api/fidelia'))
  assert.deepEqual(jetons, ['/api/fidelia?resume=1', '/api/fidelia'])
})

