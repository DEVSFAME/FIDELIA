#!/usr/bin/env node
/* ============================================================================
   R1 — CLI : le design system « verre » est-il fidèle, ou seulement joli ?

     node tools/rea/verifier-design.mjs              # verdict (exit 0 | 1)
     node tools/rea/verifier-design.mjs --ledger     # dump du ledger capturé
     node tools/rea/verifier-design.mjs --verbose    # détail des écarts

   Ce que le CLI prouve : chaque variable `--verre-*` / `--vitre-*` / `--font-*`
   … déclarée par la cible existe chez nous, sous le **même** scope (at-rule
   comprise) et avec la **même** valeur ; chaque `@font-face` pointe le même
   binaire ; et nous n'avons rien ajouté hors de la liste `HORS_LEDGER`.

   Ce qu'il ne prouve pas : le rendu. `getComputedStyle` est la seule mesure du
   rendu, et elle demande un navigateur — hors périmètre de cette commande.
   ========================================================================== */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditerAvecPolices, cle, ledger, formaterLedger } from './design-system.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const ASSETS = join(RACINE, '01_REA_Fidelix', '_captures', '2026-10-26', 'raw', 'assets')

/* Deux feuilles, dans l'ordre du document (`data-precedence=next`) :
     d34d…  thème : `@font-face` + `--font-*`
     0baee… application : palette, verre, utilitaires
   N'en lire qu'une seule — c'était le cas au départ — laisse croire que les
   polices ne sont pas mesurées alors qu'elles le sont depuis la première
   capture. La concaténation respecte la cascade : le dernier gagne. */
export const CAPTURES = [
  join(ASSETS, '_next_static_css_d34d95ecc21099a8.css'),
  join(ASSETS, '_next_static_css_0baee74d463a534b.css'),
]

export const NOTRES = [
  join(RACINE, 'web', 'src', 'styles', 'tokens.css'),
  join(RACINE, 'web', 'src', 'styles', 'verre.css'),
  join(RACINE, 'web', 'src', 'styles', 'nuit.css'),
  join(RACINE, 'web', 'src', 'styles', 'polices.css'),
]

/** Les classes dont l'effet ne tient pas dans des variables : on compare le corps. */
export const CLASSES_SURVEILLEES = [
  '[data-skin=premium] .verre',
  '[data-skin=premium] .verre-fort',
  '[data-skin=premium] .verre-refracte',
  '[data-skin=premium] .vitre',
  '[data-skin=premium] .vitre.vitre-menu',
  '[data-skin=premium] .grain-premium',
  '[data-skin=premium] .fond-premium',
  '.shadow-sticker',
  '.shadow-float',
  '.shadow-soft',
]

/* ---------------------------------------------------------------------------
   Déviation déclarée.

   Toute invention figure ici AVEC sa raison. Ce qui n'y est pas fait échouer la
   vérification : c'est le seul moyen qu'une déviation reste une décision
   visible plutôt qu'une dérive silencieuse.

   Cas présent : la peau « bleu nuit » du tableau de bord (demande produit).
   Trois déclarations, dont deux réutilisent une valeur mesurée (0.16).
   ------------------------------------------------------------------------ */
export const HORS_LEDGER = [
  {
    cle: cle('', '[data-skin=premium].dark.nuit', '--fond-page'),
    raison: 'fond bleu nuit du tableau de bord (décision produit, cf. nuit.css)',
  },
  {
    cle: cle('', '[data-skin=premium].dark.nuit .verre', '--verre-bord-opacite'),
    raison: 'arête remontée sur fond très sombre ; 0.16 repris du cran prefers-reduced-transparency mesuré',
  },
  {
    cle: cle('', '[data-skin=premium].dark.nuit .verre-fort', '--verre-bord-opacite'),
    raison: 'arête remontée sur fond très sombre, densité forte ; même valeur mesurée 0.16',
  },
]

const lire = (chemin) => readFileSync(chemin, 'utf8')

function principal(argv) {
  const capture = CAPTURES.map(lire).join('\n')

  if (argv.includes('--ledger')) {
    process.stdout.write(formaterLedger(ledger(capture)) + '\n')
    return 0
  }

  const notres = NOTRES.map(lire)
  const verdict = auditerAvecPolices({
    capture,
    notres,
    selecteurs: CLASSES_SURVEILLEES,
    inventionsAutorisees: HORS_LEDGER.map((d) => d.cle),
  })

  const total = (cote) =>
    cote.manquants.length + cote.divergents.length + cote.inventes.length
  const lignes = []
  for (const [nom, cote] of [
    ['variables', verdict.tokens],
    ['classes', verdict.classes],
    ['polices', verdict.polices],
  ]) {
    lignes.push(
      `${nom} : ${cote.manquants.length} manquant(s), ` +
        `${cote.divergents.length} divergent(s), ${cote.inventes.length} inventé(s)`
    )
    if (argv.includes('--verbose') || total(cote) > 0) {
      for (const m of cote.manquants) lignes.push(`  MANQUE   ${m.cle} = ${m.attendu.valeur}`)
      for (const d of cote.divergents)
        lignes.push(`  DIVERGE  ${d.cle} : capturé ${d.attendu}, écrit ${d.obtenu}`)
      for (const i of cote.inventes) lignes.push(`  INVENTÉ  ${i.cle} = ${i.obtenu}`)
    }
    if (argv.includes('--verbose')) {
      for (const t of cote.tolerees) lignes.push(`  DÉCLARÉ  ${t.cle}`)
    }
  }

  lignes.push(verdict.ok ? 'VERDICT : CONFORME' : 'VERDICT : NON CONFORME')
  if (verdict.ok) {
    lignes.push(
      `${HORS_LEDGER.length} déviation(s) déclarée(s) (HORS_LEDGER) ; ` +
        "le RENDU n'est pas mesuré ici"
    )
  }
  process.stdout.write(lignes.join('\n') + '\n')
  return verdict.ok ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(principal(process.argv.slice(2)))
}
