/* ============================================================================
   R1 — design system « verre » : le ledger, pas l'œil.

   Le CSS de la cible n'est pas une référence esthétique, c'est une **source de
   valeurs**. Ce module en extrait un ledger `(at-rule, sélecteur, propriété,
   valeur)` et le compare à notre implémentation **dans les deux sens** :

   - `manquants`  : la cible déclare, nous non  → infidélité ;
   - `divergents` : même clé, valeur différente → invention silencieuse ;
   - `inventes`   : nous déclarons, la cible non → invention franche.

   Pourquoi un extracteur plutôt qu'une liste recopiée à la main : une liste
   écrite à la main vieillit et se trompe. Ici, la vérité est relue dans
   `_captures/` à chaque exécution. Si la capture change, le verdict change.

   Aucun réseau, aucun navigateur, aucune dépendance : le CSS est du texte.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   1. Ce qui est surveillé

   Le périmètre est **explicite**. Tout ce qui n'est pas listé ici (polices, ou
   une variable d'un mode non capturé) sort du ledger — et donc ne peut ni
   « manquer » ni être « inventé » : il est hors sujet.
   ------------------------------------------------------------------------ */

const PREFIXES_SURVEILLES = [
  // les familles de polices : `--font-sans:"Inter","Inter Fallback"` etc.
  // Leur valeur est une **pile mesurée**, pas un goût. La deuxième feuille de
  // style de la cible (`d34d95ecc21099a8.css`) les déclare ; c'est la raison
  // pour laquelle `CAPTURES` en contient deux.
  'font',
  // la couche « verre » (le sujet de R1)
  'verre',
  'vitre',
  'arete',
  'grain',
  'fond-page',
  'lumiere',
  // la palette sur laquelle la couche s'appuie (mesurée dans `:root`)
  'coral',
  'sur',
  'champ',
  'brand',
  'ink',
  'cream',
  'slate',
  // le vocabulaire shadcn/Tailwind consommé par les composants
  'radius',
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
]

/** Vrai si la propriété CSS est une variable custom du périmètre surveillé. */
export function estSurveillee(propriete) {
  if (!propriete.startsWith('--')) return false
  const nom = propriete.slice(2)
  return PREFIXES_SURVEILLES.some(
    (prefixe) => nom === prefixe || nom.startsWith(prefixe + '-')
  )
}

/* ---------------------------------------------------------------------------
   2. Découpage du CSS

   Le CSS capturé est minifié (`a{b:c}d{e:f}`). Une regex `([^{}]*)\{([^{}]*)\}`
   suffit pour les règles feuilles mais **perd le contexte** des at-rules :
   dans `@media (x){a{b:c}}`, le préfixe ne contient pas `@media`. On descend
   donc récursivement dans le corps d'un at-rule en conservant son en-tête.
   ------------------------------------------------------------------------ */

/** Retire les commentaires CSS. Un commentaire n'est pas du code. */
export function sansCommentaires(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Index de l'accolade fermante appariée à celle ouverte en `ouvert`. */
function fermeture(css, ouvert) {
  let profondeur = 0
  for (let i = ouvert; i < css.length; i += 1) {
    const c = css[i]
    if (c === '{') profondeur += 1
    else if (c === '}') {
      profondeur -= 1
      if (profondeur === 0) return i
    }
  }
  return -1
}

/** Normalise un sélecteur : espaces, virgules, combinateurs. */
export function normaliserSelecteur(selecteur) {
  return selecteur
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\s*,\s*/g, ',')
    .trim()
}

/** Normalise une valeur : `rgb(255 255 255/0.48)` ≡ `rgb(255 255 255 / .48)`. */
export function normaliserValeur(valeur) {
  return valeur
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim()
}

/** Normalise un en-tête d'at-rule (espaces supprimés : la forme n'importe pas). */
export function normaliserAtRule(atRule) {
  return (atRule || '').replace(/\s+/g, '').trim()
}

/** Découpe un corps de déclarations `a:b;c:d` en paires. */
function declarations(corps) {
  const paires = []
  for (const morceau of corps.split(';')) {
    const i = morceau.indexOf(':')
    if (i === -1) continue
    const propriete = morceau.slice(0, i).trim()
  const valeur = morceau.slice(i + 1).trim()
  if (!propriete || !valeur) continue
  paires.push([propriete, normaliserValeur(valeur)])
  }
  return paires
}

/**
 * Blocs feuilles du CSS, avec leur contexte d'at-rule.
 * @returns {{atRule: string, selecteurs: string[], declarations: [string,string][]}[]}
 */
export function extraireBlocs(css, atRule = '') {
  const source = sansCommentaires(css)
  const blocs = []
  let curseur = 0
  while (curseur < source.length) {
    const ouvert = source.indexOf('{', curseur)
    if (ouvert === -1) break
    const entete = source.slice(curseur, ouvert).trim()
    const ferme = fermeture(source, ouvert)
    if (ferme === -1) break
    const corps = source.slice(ouvert + 1, ferme)

    if (entete.startsWith('@')) {
      // at-rule : on descend, en préfixant le contexte.
      blocs.push(...extraireBlocs(corps, normaliserAtRule(`${atRule} ${entete}`)))
    } else {
      const selecteurs = entete
        .split(',')
        .map(normaliserSelecteur)
        .filter(Boolean)
      blocs.push({
        atRule: normaliserAtRule(atRule),
        selecteurs,
        declarations: declarations(corps),
      })
    }
    curseur = ferme + 1
  }
  return blocs
}

/* ---------------------------------------------------------------------------
   3. Le ledger

   Clé = `at-rule|sélecteur|propriété`. La cascade est respectée : à clé égale,
   la **dernière** déclaration gagne — c'est ce que ferait le navigateur.
   ------------------------------------------------------------------------ */

/** Clé stable d'une déclaration. */
export function cle(atRule, selecteur, propriete) {
  return `${normaliserAtRule(atRule)}|${normaliserSelecteur(selecteur)}|${propriete}`
}

/**
 * Ledger des variables surveillées.
 * @returns {Map<string, {atRule:string, selecteur:string, propriete:string, valeur:string}>}
 */
export function ledger(css) {
  const table = new Map()
  for (const bloc of extraireBlocs(css)) {
    for (const selecteur of bloc.selecteurs) {
      for (const [propriete, valeur] of bloc.declarations) {
        if (!estSurveillee(propriete)) continue
        table.set(cle(bloc.atRule, selecteur, propriete), {
          atRule: bloc.atRule,
          selecteur,
          propriete,
          valeur,
        })
      }
    }
  }
  return table
}

/**
 * Corps complet (toutes propriétés, variables ou non) d'une liste de sélecteurs.
 * Sert aux classes qui portent leur effet dans `backdrop-filter`, `box-shadow`
 * ou `transition` — c'est-à-dire hors variables.
 *
 * `avecAtRules` : inclure les blocs sous `@media` / `@supports`. C'est
 * indispensable ici : la cible **conditionne** `.verre-refracte` à
 * `@supports (backdrop-filter:url(#verre-liquide))` puis à
 * `@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)
 * and (prefers-reduced-transparency:no-preference)`. Comparer seulement l'état
 * de base laisserait donc croire qu'une réfraction inconditionnelle est fidèle.
 * @returns {Map<string, Map<string,string>>}
 */
export function corpsDesClasses(css, selecteurs, avecAtRules = false) {
  const voulus = new Set(selecteurs.map(normaliserSelecteur))
  const table = new Map(selecteurs.map((s) => [normaliserSelecteur(s), new Map()]))
  for (const bloc of extraireBlocs(css)) {
    if (!avecAtRules && bloc.atRule !== '') continue // l'état de base seulement
    for (const selecteur of bloc.selecteurs) {
      if (!voulus.has(selecteur)) continue
      const cible = table.get(selecteur)
      for (const [propriete, valeur] of bloc.declarations) cible.set(propriete, valeur)
    }
  }
  return table
}

/* ---------------------------------------------------------------------------
   4. Comparaison
   ------------------------------------------------------------------------ */

/** Compare deux `Map<clé, {…, valeur}>`, dans les deux sens. */
export function comparer(reference, notre) {
  const manquants = []
  const divergents = []
  const inventes = []
  for (const [k, attendu] of reference) {
    const obtenu = notre.get(k)
    if (!obtenu) {
      manquants.push({ cle: k, attendu })
      continue
    }
    if (obtenu.valeur !== attendu.valeur) {
      divergents.push({ cle: k, attendu: attendu.valeur, obtenu: obtenu.valeur })
    }
  }
  for (const [k, obtenu] of notre) {
    if (!reference.has(k)) inventes.push({ cle: k, obtenu: obtenu.valeur })
  }
  return { manquants, divergents, inventes }
}

/** Aplatit `corpsDesClasses` en ledger comparable (at-rules incluses). */
export function ledgerDesCorps(css, selecteurs, avecAtRules = false) {
  const table = new Map()
  for (const [selecteur, declarations] of corpsDesClasses(css, selecteurs, avecAtRules)) {
    for (const [propriete, valeur] of declarations) {
      table.set(cle('', selecteur, propriete), { atRule: '', selecteur, propriete, valeur })
    }
  }
  return table
}

/** Ledger des classes, **avec** leur contexte : une règle conditionnée n'est
 *  fidèle que si sa condition l'est aussi. */
export function ledgerDesClasses(css, selecteurs) {
  const voulus = new Set(selecteurs.map(normaliserSelecteur))
  const table = new Map()
  for (const bloc of extraireBlocs(css)) {
    for (const selecteur of bloc.selecteurs) {
      if (!voulus.has(selecteur)) continue
      for (const [propriete, valeur] of bloc.declarations) {
        table.set(cle(bloc.atRule, selecteur, propriete), {
          atRule: bloc.atRule,
          selecteur,
          propriete,
          valeur,
        })
      }
    }
  }
  return table
}

/**
 * Verdict complet : variables **et** classes.
 *
 * `inventionsAutorisees` : les clés des déviations **déclarées** (cf.
 * `HORS_LEDGER` du CLI). Elles sortent du verdict mais restent listées dans
 * `tolerees` — une déviation tolérée doit rester visible, sinon elle devient une
 * dérive.
 * @param {{capture:string, notres:string[], selecteurs:string[],
 *          inventionsAutorisees?:string[]}} entree
 */
export function auditer({ capture, notres, selecteurs, inventionsAutorisees = [] }) {
  const notreCss = notres.join('\n')
  const permises = new Set(inventionsAutorisees)
  const filtrer = (cote) => ({
    ...cote,
    inventes: cote.inventes.filter((i) => !permises.has(i.cle)),
    tolerees: cote.inventes.filter((i) => permises.has(i.cle)),
  })
  const tokens = filtrer(comparer(ledger(capture), ledger(notreCss)))
  const classes = filtrer(
    comparer(
      ledgerDesClasses(capture, selecteurs),
      ledgerDesClasses(notreCss, selecteurs)
    )
  )
  const vide = (c) => c.manquants.length + c.divergents.length + c.inventes.length === 0
  return { ok: vide(tokens) && vide(classes), tokens, classes }
}

/* ---------------------------------------------------------------------------
   5. Rendu lisible — le CLI montre le ledger, il ne le cache pas.
   ------------------------------------------------------------------------ */

/** Rend un ledger en CSS réécrit, trié par at-rule puis sélecteur. */
export function formaterLedger(table) {
  const lignes = []
  let contexte = null
  const triees = [...table.values()].sort((a, b) =>
    `${a.atRule}|${a.selecteur}`.localeCompare(`${b.atRule}|${b.selecteur}`)
  )
  for (const { atRule, selecteur, propriete, valeur } of triees) {
    const marque = `${atRule}|${selecteur}`
    if (marque !== contexte) {
      if (contexte !== null) lignes.push('')
      if (atRule) lignes.push(`${atRule}{`)
      lignes.push(`${selecteur}{`)
      contexte = marque
    }
    lignes.push(`  ${propriete}:${valeur};`)
  }
  return lignes.join('\n')
}
/* ---------------------------------------------------------------------------
   6. Polices

   Pourquoi une section à part : `@font-face` **n'est pas une règle de style**.
   Pas de sélecteur, pas de cascade, pas de clé `sélecteur|propriété`. Le
   découpage par accolades de la section 2 descend dans le corps d'un at-rule en
   cherchant l'accolade suivante — et sur `@font-face{font-family:Inter;…}` il
   n'en trouve pas : le bloc était donc **silencieusement perdu**. C'est
   exactement ce qui a produit la mention « aucun .woff2 capturé » alors que le
   CSS de polices était présent depuis le premier jour.

   On compare donc les `@font-face` comme un **ensemble de déclarations** :
   identité = famille + style + poids + fichier référencé + plage Unicode.
   Le chemin du fichier est réduit à son **nom de base** : la cible sert
   `../media/x.woff2`, nous servons `/polices/x.woff2` — ce qui compte est que ce
   soit le même binaire, pas le même répertoire.
   ------------------------------------------------------------------------ */

/** Nom de fichier d'un `src:url(…)`, débarrassé du chemin. */
function basename(url) {
  return url.split('/').pop().split('?')[0].trim()
}

/**
 * Blocs `@font-face` d'un CSS, normalisés.
 * @returns {{cle:string, famille:string, poids:string, style:string,
 *            fichiers:string[], plageUnicode:string, valeur:string}[]}
 */
export function extrairePolices(css) {
  const source = sansCommentaires(css)
  const polices = []
  const motif = /@font-face\s*\{/g
  let m
  while ((m = motif.exec(source)) !== null) {
    const ouvert = source.indexOf('{', m.index)
    const ferme = fermeture(source, ouvert)
    if (ferme === -1) break
    const corps = source.slice(ouvert + 1, ferme)
    const paires = declarations(corps)
    const lire = (nom) => paires.find(([p]) => p === nom)?.[1] ?? ''

    const famille = lire('font-family').replace(/^["']|["']$/g, '')
    const fichiers = [...corps.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((u) =>
      basename(u[1])
    )
    const plage = lire('unicode-range')

    // L'identité inclut le fichier : deux `@font-face` de même famille et même
    // poids mais de sous-ensembles différents sont deux entrées distinctes.
    const cle = [famille, lire('font-style'), lire('font-weight'), fichiers.join('+'), plage].join('|')

    // La valeur comparable est le bloc **sans** le chemin des fichiers : on ne
    // veut pas qu'un déplacement de répertoire passe pour une divergence.
    const valeur = paires
      .map(([p, v]) => (p === 'src' ? `${p}:${fichiers.join('+')}` : `${p}:${v}`))
      .join(';')

    polices.push({
      cle,
      famille,
      poids: lire('font-weight'),
      style: lire('font-style'),
      fichiers,
      plageUnicode: plage,
      valeur,
    })
    motif.lastIndex = ferme + 1
  }
  return polices
}

/** Ledger des polices, indexé par clé d'identité (la dernière gagne). */
export function ledgerPolices(css) {
  const table = new Map()
  for (const police of extrairePolices(css)) table.set(police.cle, police)
  return table
}

/**
 * Verdict complet : variables, classes **et** polices.
 * @param {{capture:string, notres:string[], selecteurs:string[],
 *          inventionsAutorisees?:string[]}} entree
 */
export function auditerAvecPolices({ capture, notres, selecteurs, inventionsAutorisees = [] }) {
  const base = auditer({ capture, notres, selecteurs, inventionsAutorisees })
  const permises = new Set(inventionsAutorisees)
  const brutes = comparer(ledgerPolices(capture), ledgerPolices(notres.join('\n')))
  const polices = {
    ...brutes,
    inventes: brutes.inventes.filter((i) => !permises.has(i.cle)),
    tolerees: brutes.inventes.filter((i) => permises.has(i.cle)),
  }
  const vide = (c) => c.manquants.length + c.divergents.length + c.inventes.length === 0
  return { ...base, ok: base.ok && vide(polices), polices }
}


