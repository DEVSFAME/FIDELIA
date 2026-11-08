/* ============================================================================
   R1 — i18n branchée dans l'UI : les quatre défauts qui ne se voient qu'en
   production.

     1. **une clé mal orthographiée.** `t('auth.connexion.sousTitre')` avec un
        `s` de trop lève au rendu — mieux qu'un affichage brut, mais seulement
        quand la page est visitée. On balaie les sources.
     2. **une clé dupliquée dans un dictionnaire.** Deux `'marque.nom'` dans le
        même objet JS : le second gagne, en silence, et le test d'égalité des
        jeux de clés n'y voit rien (les clés sont égales… parce qu'il n'en
        reste qu'une).
     3. **la marque recopiée.** `marque.nom` est la source unique ; une chaîne
        « Fidelia » écrite dans un composant réintroduit le défaut corrigé deux
        fois déjà (deux orthographes dans deux fichiers).
     4. **un lien interne mort.** `<Link href="/register">` a été livré une
        fois alors que la route n'existait pas. On calcule les routes **du
        disque** et on vérifie chaque `href`.

   Le test lit les sources : c'est le seul moyen de vérifier une décision de
   structure sans navigateur.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LOCALES } from '../../../web/src/i18n/locales.mjs'
import { cles, dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC = join(RACINE, 'web', 'src')
const APP = join(SRC, 'app')
const DICTIONNAIRES = join(SRC, 'i18n', 'dictionnaires.mjs')

/** Tous les fichiers source, hors dictionnaires (traités à part). */
function fichiersSource(dossier = SRC, acc = []) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const complet = join(dossier, entree.name)
    if (entree.isDirectory()) fichiersSource(complet, acc)
    else if (/\.(jsx?|mjs)$/.test(entree.name)) acc.push(complet)
  }
  return acc
}

/** Routes réelles, lues dans l'arborescence App Router (groupes retirés). */
function routes() {
  const trouvees = new Set()
  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name)
      if (entree.isDirectory()) {
        parcourir(complet)
        continue
      }
      if (entree.name !== 'page.jsx' && entree.name !== 'route.js') continue
      const segments = relative(APP, dossier)
        .split('/')
        .filter(Boolean)
        .filter((segment) => !/^\(.*\)$/.test(segment))
      trouvees.add(segments.length === 0 ? '/' : `/${segments.join('/')}`)
    }
  }
  parcourir(APP)
  return trouvees
}

/**
 * Une route du disque accepte-t-elle cette cible ?
 *
 * Un `href` peut être **dynamique** (`` `/join/${slug}` ``) : le segment
 * construit n'est pas écrit sur le disque, il y est écrit `[slug]`. Comparer
 * les deux à la chaîne près déclarerait morte une route qui fonctionne — et
 * cet angle mort s'ouvre exactement quand une page publique en lie une autre.
 *
 * Rien n'est assoupli pour autant :
 *   - un segment **dynamique du code** ne peut correspondre qu'à un segment
 *     dynamique du disque, jamais à un nom fixe ;
 *   - un segment **fixe du code** doit être identique, ou tomber sur un segment
 *     dynamique du disque (une route `[slug]` accepte n'importe quelle valeur) ;
 *   - le nombre de segments doit être le même — `/join` n'est pas `/join/x`.
 */
function correspond(cible, existantes) {
  if (existantes.has(cible)) return true

  const voulus = cible.split('/')
  return [...existantes].some((route) => {
    const morceaux = route.split('/')
    if (morceaux.length !== voulus.length) return false
    return morceaux.every(
      (morceau, index) => /^\[.*\]$/.test(morceau) || morceau === voulus[index]
    )
  })
}

test('i18n-ui — toute clé citée dans le code existe dans le dictionnaire', () => {
  const reference = new Set(cles('fr'))
  const manquantes = []

  for (const fichier of fichiersSource()) {
    if (fichier === DICTIONNAIRES) continue
    const source = readFileSync(fichier, 'utf8')

    // `t('cle')`, `t('cle', { … })`, `traduire('fr', 'cle')`. Le lookbehind
    // n'est pas cosmétique : sans lui, `donnees.get('email')` et
    // `redirect('/login')` sont lus comme des appels à `t(` — la fin de
    // l'identifiant suffit à tromper une recherche naïve.
    for (const motif of [
      /(?<![A-Za-z0-9_$])t\('([^']+)'\)/g,
      /(?<![A-Za-z0-9_$])t\('([^']+)',\s*\{/g,
      /(?<![A-Za-z0-9_$])traduire\(\s*'[a-z]{2}'\s*,\s*'([^']+)'/g,
    ]) {
      for (const trouve of source.matchAll(motif)) {
        if (!reference.has(trouve[1])) manquantes.push(`${relative(SRC, fichier)} → ${trouve[1]}`)
      }
    }

    // Clés construites : `t(\`tableau.indicateur.${cle}\`)`. On ne peut pas
    // reconstruire la valeur ici, mais on peut exiger que le **préfixe** mène
    // quelque part — une faute de frappe dans le préfixe lève au rendu.
    //
    // Le lookbehind est indispensable ici aussi : `redirect(\`/join/…\`)` et
    // `donnees.get(\`libelle${rang}\`)` finissent par `t(` et étaient lus comme
    // des appels de traduction. Et le préfixe doit ressembler à une clé
    // (`domaine.`), sinon une URL commençant par un point passerait pour une clé.
    for (const trouve of source.matchAll(/(?<![A-Za-z0-9_$])t\(`([^`$]+\.[^`$]*)\$\{/g)) {
      const prefixe = trouve[1]
      if (![...reference].some((cle) => cle.startsWith(prefixe))) {
        manquantes.push(`${relative(SRC, fichier)} → préfixe inconnu « ${prefixe} »`)
      }
    }
  }

  assert.deepEqual(manquantes, [], 'clés inconnues')
})

test('i18n-ui — aucun doublon de clé dans un même dictionnaire', () => {
  const source = readFileSync(DICTIONNAIRES, 'utf8')

  for (const locale of LOCALES) {
    const debut = source.indexOf(`export const ${locale} = {`)
    assert.ok(debut >= 0, `bloc ${locale} introuvable`)
    const fin = source.indexOf('\n}', debut)
    const bloc = source.slice(debut, fin)

    // Une clé écrite deux fois : la seconde gagne, en silence. Le test
    // d'égalité des jeux de clés ne peut pas le voir (il en reste une).
    const clesBloc = [...bloc.matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1])
    const doublons = clesBloc.filter((cle, index) => clesBloc.indexOf(cle) !== index)
    assert.deepEqual(doublons, [], `clés dupliquées dans « ${locale} »`)
  }
})

test('i18n-ui — le nom de marque n’est écrit en dur nulle part', () => {
  const nom = dictionnaire('fr')['marque.nom']
  const fautifs = []

  for (const fichier of fichiersSource()) {
    if (fichier === DICTIONNAIRES) continue
    const source = readFileSync(fichier, 'utf8')
    // Comparaison sur les **littéraux** (`'Fidelia'`, `"Fidelix"`) : un
    // commentaire qui explique l'arbitrage ne déclenche rien, et c'est voulu —
    // la mémoire du projet doit pouvoir nommer les deux orthographes.
    for (const candidat of [nom, 'Fidelix']) {
      if (source.includes(`'${candidat}'`) || source.includes(`"${candidat}"`)) {
        fautifs.push(`${relative(SRC, fichier)} → ${candidat}`)
      }
    }
  }

  assert.deepEqual(fautifs, [], 'la marque doit venir de `marque.nom`')
})

test('i18n-ui — `meta.titre` interpole la marque au lieu de la recopier', () => {
  for (const locale of LOCALES) {
    const table = dictionnaire(locale)
    assert.ok(
      table['meta.titre'].includes('{marque}'),
      `meta.titre (${locale}) doit interpoler {marque}`
    )
    assert.ok(
      !table['meta.titre'].includes(table['marque.nom']),
      `meta.titre (${locale}) recopie encore le nom`
    )
  }
})

test('i18n-ui — chaque `href` interne pointe vers une route qui existe', () => {
  const existantes = routes()
  const orphelins = []

  for (const fichier of fichiersSource()) {
    const source = readFileSync(fichier, 'utf8')
    for (const trouve of source.matchAll(/href=["'{]\s*["']?(\/[^"'`#?]*)/g)) {
      const cible = trouve[1].replace(/\/$/, '') || '/'
      if (!correspond(cible, existantes)) orphelins.push(`${relative(SRC, fichier)} → ${cible}`)
    }
  }

  assert.deepEqual(orphelins, [], 'liens internes morts')

  /* La règle est vérifiée sur elle-même : sans cela, un `correspond` trop
     permissif rendrait le balayage vert pour de mauvaises raisons. */
  assert.equal(correspond('/join/${slug}', existantes), true, 'lien dynamique vers [slug]')
  assert.equal(correspond('/recompenses/${slug}', existantes), true, 'même règle, autre route')
  assert.equal(correspond('/jamais-vu/${slug}', existantes), false, 'route absente du disque')
  assert.equal(correspond('/join', existantes), false, '/join nu n’est pas /join/[slug]')
  // Les routes livrées sont bien celles qu'on croit (le calcul est vérifié).
  for (const attendue of ['/', '/login', '/register', '/forgot-password', '/dashboard', '/apercu', '/auth/confirm']) {
    assert.ok(existantes.has(attendue), `route absente du disque : ${attendue}`)
  }
})

test('i18n-ui — les pages d’authentification branchent la locale, pas le français', () => {
  for (const page of [
    ['app', '(auth)', 'layout.jsx'],
    ['app', '(auth)', 'login', 'page.jsx'],
    ['app', '(auth)', 'register', 'page.jsx'],
    ['app', '(auth)', 'forgot-password', 'page.jsx'],
  ]) {
    const source = readFileSync(join(SRC, ...page), 'utf8')
    assert.match(source, /localeRequete\(\)|directionDe\(/, `${page.join('/')} ignore la locale`)
  }
})

