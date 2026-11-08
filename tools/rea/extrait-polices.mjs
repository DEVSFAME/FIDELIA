#!/usr/bin/env node
/* ============================================================================
   R1 — transcription des polices : du CSS capturé vers `web/src/styles/polices.css`.

     node tools/rea/extrait-polices.mjs            # vérifie, n'écrit rien
     node tools/rea/extrait-polices.mjs --verifier # idem (lisible)
     node tools/rea/extrait-polices.mjs --ecrire    # transcrit + copie les binaires

   Ce que fait la commande, et rien de plus :

     1. lit les `@font-face` de la feuille de polices **capturée** ;
     2. réécrit chaque `url(../media/x.woff2)` en `url(/polices/x.woff2)` ;
     3. copie les binaires référencés dans `web/public/polices/` ;
     4. échoue si un binaire manque — un `@font-face` sans fichier est une
        fausse déclaration : le navigateur retombe en silence sur la police
        système et l'écart ne se voit qu'à l'œil.

   Aucune valeur n'est écrite ici : tout sort du CSS capturé. Changer une
   graisse, c'est changer la capture, pas ce script.
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extrairePolices, ledgerPolices } from './design-system.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Feuille de polices de la cible (2ᵉ feuille de style du build mesuré). */
export const CSS_POLICES = join(
  RACINE,
  '01_REA_Fidelix',
  '_captures',
  '2026-10-26',
  'raw',
  'assets',
  '_next_static_css_d34d95ecc21099a8.css'
)

/** Les binaires `.woff2` ne sont pas dans `raw/assets/` : ils sont servis à
 *  part. Le scrape public (`SITE/`) en conserve une copie complète — c'est
 *  notre seule source de binaires, et elle est liée au CSS par empreinte. */
export const DEPOT_BINAIRES = join(RACINE, 'SITE', '_next', 'static', 'media')

export const SORTIE_CSS = join(RACINE, 'web', 'src', 'styles', 'polices.css')
export const SORTIE_BINAIRES = join(RACINE, 'web', 'public', 'polices')
/** Module jumeau : les classes `__variable_*` à poser sur `<body>`. */
export const SORTIE_MODULE = join(RACINE, 'web', 'src', 'styles', 'polices.mjs')

const empreinte = (chemin) =>
  createHash('sha256').update(readFileSync(chemin)).digest('hex')

/** URL des fichiers : deux formes rencontrées, un seul résultat.
 *  - capture (`raw/assets/`) : `url("/_next/static/media/x.woff2")` — l'outil de
 *    capture a réécrit les chemins en absolu ;
 *  - scrape public (`SITE/`) : `url("../media/x.woff2")`.
 *  Nous servons toujours `url("/polices/x.woff2")`. */
function reecrireSrc(bloc) {
  return bloc.replace(
    /url\(\s*(["']?)(?:\.\.\/media\/|\/_next\/static\/media\/)/g,
    (_, q) => `url(${q}/polices/`
  )
}

/** Extrait les blocs `@font-face` bruts, dans l'ordre du fichier. */
function blocsBruts(css) {
  const blocs = []
  const motif = /@font-face\s*\{/g
  let m
  while ((m = motif.exec(css)) !== null) {
    const ouvert = css.indexOf('{', m.index)
    let profondeur = 0
    let ferme = -1
    for (let i = ouvert; i < css.length; i += 1) {
      if (css[i] === '{') profondeur += 1
      else if (css[i] === '}') {
        profondeur -= 1
        if (profondeur === 0) {
          ferme = i
          break
        }
      }
    }
    if (ferme === -1) break
    blocs.push(css.slice(m.index, ferme + 1))
    motif.lastIndex = ferme + 1
  }
  return blocs
}

/** Blocs `. __variable_xxxx` : c'est **là** que la cible déclare `--font-*`.
 *  `next/font/local` émet une classe par police, et le `<body>` les porte
 *  toutes. Les mettre dans `:root` « marcherait », mais ne serait pas mesuré —
 *  et la vérification le dit. */
function blocsVariables(css) {
  return [...css.matchAll(/\.__variable_[a-z0-9]+\{[^}]*--font-[^}]*\}/g)].map((m) => m[0])
}

/** Classe → variable, pour que le composant n'ait aucun hash en dur. */
function classesDesVariables(blocs) {
  return blocs.map((bloc) => {
    const nom = bloc.slice(1, bloc.indexOf('{'))
    const variable = bloc.match(/--font-[a-z-]+/)[0]
    return { classe: nom, variable }
  })
}

function construire() {
  const css = readFileSync(CSS_POLICES, 'utf8')
  const blocs = blocsBruts(css)
  const polices = [...ledgerPolices(css).values()]
  const fichiers = [...new Set(polices.flatMap((p) => p.fichiers))]
  const variables = blocsVariables(css)
  const classes = classesDesVariables(variables)

  const manquants = fichiers.filter((f) => !existsSync(join(DEPOT_BINAIRES, f)))

  return { css, blocs, polices, fichiers, manquants, variables, classes }
}

function principal(argv) {
  const { blocs, polices, fichiers, manquants, variables, classes } = construire()

  if (manquants.length) {
    process.stderr.write(
      `Binaire(s) absent(s) de ${DEPOT_BINAIRES} :\n` +
        manquants.map((f) => `  ${f}`).join('\n') +
        '\nTranscrire le CSS sans le fichier produirait une fausse déclaration.\n'
    )
    return 1
  }

  const familles = [...new Set(polices.map((p) => p.famille))]

  if (!argv.includes('--ecrire')) {
    process.stdout.write(
      [
        `polices : ${polices.length} @font-face, ${familles.length} familles, ${fichiers.length} binaires`,
        `familles : ${familles.join(', ')}`,
        `binaires : ${fichiers.length} présents dans ${DEPOT_BINAIRES}`,
        'aucune écriture (ajouter --ecrire)',
      ].join('\n') + '\n'
    )
    return 0
  }

  mkdirSync(SORTIE_BINAIRES, { recursive: true })
  for (const f of fichiers) {
    copyFileSync(join(DEPOT_BINAIRES, f), join(SORTIE_BINAIRES, f))
  }

  const entete = [
    '/* ============================================================================',
    '   Polices — transcription du CSS mesuré. NE PAS ÉDITER À LA MAIN.',
    '',
    '   Généré par : node tools/rea/extrait-polices.mjs --ecrire',
    `   Source      : 01_REA_Fidelix/_captures/2026-10-26/raw/assets/`,
    `                 _next_static_css_d34d95ecc21099a8.css`,
    `                 SHA-256 ${empreinte(CSS_POLICES)}`,
    '   Binaires    : web/public/polices/ (copiés depuis le scrape public)',
    '',
    `   ${polices.length} @font-face, ${familles.length} familles : ${familles.join(', ')}`,
    '',
    '   Les `@font-face` de repli (« Inter Fallback » …) ne sont pas décoratifs :',
    '   ce sont eux qui portent `size-adjust` / `ascent-override` et suppriment le',
    '   décalage de mise en page pendant le chargement. Les omettre rend le premier',
    '   rendu visiblement différent.',
    '   ========================================================================== */',
    '',
  ].join('\n')

  writeFileSync(
    SORTIE_CSS,
    entete +
      blocs.map(reecrireSrc).join('\n') +
      '\n\n/* `--font-*` : déclarées par classe, comme `next/font/local` les émet. */\n' +
      variables.join('\n') +
      '\n',
    'utf8'
  )

  const module = [
    '/* Généré par tools/rea/extrait-polices.mjs — NE PAS ÉDITER. */',
    '',
    '/** Les classes à poser sur `<body>` : chacune déclare une `--font-*`.',
    ' *  Les noms sont des empreintes émises par Next : les coder en dur dans un',
    ' *  composant les figerait à la première capture. */',
    `export const CLASSES_POLICES = ${JSON.stringify(classes.map((c) => c.classe), null, 2)}`,
    '',
    '/** Classe → variable, pour les tests et le diagnostic. */',
    `export const VARIABLES_POLICES = ${JSON.stringify(
      Object.fromEntries(classes.map((c) => [c.classe, c.variable])),
      null,
      2
    )}`,
    '',
  ].join('\n')
  writeFileSync(SORTIE_MODULE, module, 'utf8')

  process.stdout.write(
    `écrit ${SORTIE_CSS}\n` +
      `écrit ${SORTIE_MODULE} (${classes.length} classes __variable_*)\n` +
      `copié ${fichiers.length} binaires dans ${SORTIE_BINAIRES}\n` +
      `${polices.length} @font-face, ${[...new Set(polices.map((p) => p.famille))].length} familles\n`
  )
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(principal(process.argv.slice(2)))
}
