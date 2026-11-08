/* ============================================================================
   REA Fidelix — A2 : briques PURES de lecture des contrats côté client.

   Objet de cette étape : savoir ce que le NAVIGATEUR envoie, sans jamais
   émettre la moindre requête d'écriture. On lit donc les bundles déjà capturés
   en S3 (`_captures/2026-10-27-auth-s3/raw/assets/`), qui sont la seule source
   de vérité sur les corps de POST — un corps n'a jamais été observé sur le fil.

   Aucune I/O, aucun réseau ici : la CLI `relever-contrats.mjs` ne fait que lire
   des fichiers et imprimer. Tout ce qui décide est testable hors ligne
   (`tools/rea/tests/contrats.test.mjs`).

   Règle de fond (lesson-learned §17) : un instrument qui se trompe toujours du
   même côté est indiscernable d'un fait. Chaque sonde exportée ici est donc
   calibrée par un TÉMOIN — positif (un cas dont on connaît la réponse) et
   négatif (une sentinelle qui ne doit jamais ressortir). Voir `TEMOINS`.

   Deux faux positifs mesurés le 2026-10-27, encodés comme tests de non-régression :
     - `method:"POST"` apparaît 7 fois dans le chunk 7383 (supabase-js :
       `.insert()`, realtime broadcast, Iceberg) → ce ne sont PAS des contrats ;
     - le littéral `/api/broadcast` existe dans ce même chunk comme chemin de
       websocket, et la route répond **404** : le littéral ne prouve pas la route.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   0. Témoins de calibration — la réponse est connue AVANT de sonder le corpus.
   ------------------------------------------------------------------------ */

export const TEMOINS = Object.freeze({
  /** Présent, méthode prouvée GET (défaut, pas de `method:` au site d'appel). */
  positif: '/api/commerce/actif',
  /** Méthode prouvée POST (site d'appel `fetch("/api/transaction",{method:"POST"})`). */
  positifPost: '/api/transaction',
  /** Déclaré dans un manifeste `{path,method:"POST"}` (chunk main-app). */
  positifManifeste: '/api/liste-attente',
  /** Littéral présent mais d'origine BIBLIOTHÈQUE ; la route répond 404 (S3). */
  leurre: '/api/broadcast',
  /** Ne doit jamais ressortir : nom inventé, forme identique aux voisins. */
  negatif: '/api/zzz-temoin-rea-inexistant',
})

/* ---------------------------------------------------------------------------
   1. Lecture de chaînes et d'expressions — le corpus est minifié, pas d'AST.
      On reste volontairement bête : profondeur + sensibilité aux chaînes.
   ------------------------------------------------------------------------ */

const OUVRANTES = '([{'
const FERMANTES = ')]}'
const GUILLEMETS = new Set(['"', "'", '`'])

/**
 * `i` pointe sur un guillemet ouvrant. Renvoie l'index JUSTE APRÈS le guillemet
 * fermant. Gère les échappements `\x` et `\u` sans les interpréter (on ne veut
 * pas décoder, seulement ne pas se tromper de frontière).
 */
export function finChaine(source, i) {
  const q = source[i]
  if (!GUILLEMETS.has(q)) return i
  let k = i + 1
  while (k < source.length) {
    const c = source[k]
    if (c === '\\') {
      k += 2
      continue
    }
    if (c === q) return k + 1
    k++
  }
  return source.length
}

/** Avance en sautant les espaces. */
export function sansEspaces(source, i) {
  let k = i
  while (k < source.length && /\s/.test(source[k])) k++
  return k
}

/** Caractère non blanc précédant `i` (utile pour reconnaître une position de valeur). */
export function precedent(source, i) {
  let k = i - 1
  while (k >= 0 && /\s/.test(source[k])) k--
  return k >= 0 ? source[k] : ''
}


/**
 * Lit un littéral `{ ... }` équilibré à partir de `i` (qui DOIT être `{`).
 *
 * Renvoie `{ entrees, fin, clos }` où chaque entrée vaut
 * `{ nom, valeur, etalement }` :
 *   - `nom`       : clé de premier niveau (dé-quotée si écrite `"nom":`),
 *   - `valeur`    : texte brut de la valeur (non décodé),
 *   - `etalement` : true si l'entrée est un `...spread` (nom = ce qui suit les points).
 *
 * `clos` dit si l'accolade fermante a été trouvée : un bundle tronqué ne doit pas
 * produire un objet silencieusement partiel.
 */
export function lireObjet(source, i) {
  const debut = sansEspaces(source, i)
  if (source[debut] !== '{') return { entrees: [], fin: i, clos: false }

  const entrees = []
  const ouvre = []
  let k = debut + 1
  let debutEntree = debut + 1

  const pousser = (jusqua) => {
    const brut = source.slice(debutEntree, jusqua)
    const t = brut.trim()
    if (!t) return
    // Un `...spread` est sans ambiguïté : il porte son propre `?`/`:` de
    // ternaire (`...cond?{a:1}:{}`) qu'il ne faut PAS prendre pour une clé.
    if (t.startsWith('...')) {
      entrees.push({ nom: t.slice(3).trim(), valeur: null, etalement: true })
      return
    }
    const sep = positionDeuxPoints(source, debutEntree, jusqua)
    if (sep < 0) {
      entrees.push({ nom: t, valeur: null, etalement: false })
      return
    }
    let nom = source.slice(debutEntree, sep).trim()
    if (GUILLEMETS.has(nom[0])) nom = nom.slice(1, -1)
    entrees.push({ nom, valeur: source.slice(sep + 1, jusqua).trim(), etalement: false })
  }

  while (k < source.length) {
    const c = source[k]
    if (GUILLEMETS.has(c)) {
      k = finChaine(source, k)
      continue
    }
    if (OUVRANTES.includes(c)) {
      ouvre.push(c)
      k++
      continue
    }
    if (FERMANTES.includes(c)) {
      if (!ouvre.length) {
        if (c === '}') {
          pousser(k)
          return { entrees, fin: k + 1, clos: true }
        }
        k++
        continue
      }
      ouvre.pop()
      k++
      continue
    }
    if (c === ',' && !ouvre.length) {
      pousser(k)
      debutEntree = k + 1
      k++
      continue
    }
    k++
  }
  return { entrees: [], fin: source.length, clos: false }
}

/** Premier `:` de premier niveau entre `debut` et `fin`, hors chaînes et hors imbrication. */
function positionDeuxPoints(source, debut, fin) {
  let k = debut
  let prof = 0
  while (k < fin) {
    const c = source[k]
    if (GUILLEMETS.has(c)) {
      k = finChaine(source, k)
      continue
    }
    if (OUVRANTES.includes(c)) prof++
    else if (FERMANTES.includes(c)) prof--
    else if (c === ':' && prof === 0) return k
    k++
  }
  return -1
}

/**
 * Texte de l'argument n° `n` d'un appel dont la parenthèse ouvrante est en
 * `iParen` (index de `(`). Renvoie `{ texte, fin }` ou `null`.
 */
export function argumentDe(source, iParen, n = 0) {
  if (source[iParen] !== '(') return null
  let k = iParen + 1
  let prof = 0
  let courant = 0
  let debut = k
  while (k < source.length) {
    const c = source[k]
    if (GUILLEMETS.has(c)) {
      k = finChaine(source, k)
      continue
    }
    if (OUVRANTES.includes(c)) {
      prof++
      k++
      continue
    }
    if (FERMANTES.includes(c)) {
      if (!prof) {
        if (c === ')') {
          return courant === n ? { texte: source.slice(debut, k).trim(), fin: k } : null
        }
        k++
        continue
      }
      prof--
      k++
      continue
    }
    if (c === ',' && !prof) {
      if (courant === n) return { texte: source.slice(debut, k).trim(), fin: k }
      courant++
      debut = k + 1
      k++
      continue
    }
    k++
  }
  return null
}

/* ---------------------------------------------------------------------------
   2. Sonde A — les littéraux `/api/…` d'un bundle.
      Ce que ça prouve : le CHEMIN est présent dans du code client.
      Ce que ça ne prouve pas : que la route existe (cf. `/api/broadcast` → 404).
   ------------------------------------------------------------------------ */

export function litterauxApi(source) {
  const vus = new Map()
  const re = /(["'`])(\/api\/[^"'`\s\\]*)/g
  let m
  while ((m = re.exec(source))) {
    if (!vus.has(m[2])) vus.set(m[2], m.index)
  }
  return [...vus].map(([url, offset]) => ({ url, offset }))
}

/* ---------------------------------------------------------------------------
   3. Sonde B — la méthode, et son GENRE de preuve.
      Quatre genres, du plus fort au plus faible :
        `manifeste` : `{path:"/api/x",method:"POST"}` — déclaration explicite ;
        `fetch`     : `fetch("/api/x",{method:"POST"})` — site d'appel direct ;
        `route`     : `route:"/api/x"` + `fetch(<x>.route,{method:"POST"})` ;
        `aide`      : helper `F(url,corps)` dont le `fetch` est générique.
      Le genre est TOUJOURS conservé : une preuve indirecte ne vaut pas une
      preuve directe, et la doc doit pouvoir le dire.
   ------------------------------------------------------------------------ */

const RE_METHODE = /method:\s*"([A-Z]+)"/

/** Méthode la plus proche APRÈS `offset`, dans une fenêtre bornée. */
export function methodePres(source, offset, fenetre = 220) {
  const m = RE_METHODE.exec(source.slice(offset, offset + fenetre))
  return m ? m[1] : null
}

/** Manifestes `{path:"/api/…",method:"…"}` (chunk `main-app`, guard Next). */
export function manifestes(source) {
  const out = []
  const re = /path:\s*"(\/api\/[^"]+)"\s*,\s*method:\s*"([A-Z]+)"/g
  let m
  while ((m = re.exec(source))) out.push({ url: m[1], methode: m[2], offset: m.index, genre: 'manifeste' })
  return out
}

/**
 * Routes déclarées dans un objet d'application (`{caisse:{route:"/api/…"}}`)
 * puis consommées par `fetch(<x>.route, {method:"POST"})`. On ne relie la route
 * à POST que si les deux motifs coexistent dans le MÊME fichier — c'est faible,
 * mais c'est mesuré, et c'est étiqueté `route`.
 */
export function routesIndirectes(source) {
  const routes = []
  const re = /route:\s*"(\/api\/[^"]+)"/g
  let m
  while ((m = re.exec(source))) routes.push({ url: m[1], offset: m.index })
  if (!routes.length) return []

  const viaFetchRoute = /fetch\(\s*[A-Za-z_$][\w$]*\.route\s*,\s*\{[^}]*?method:\s*"POST"/.test(source)
  if (!viaFetchRoute) return []
  return routes.map((r) => ({ ...r, methode: 'POST', genre: 'route' }))
}

/**
 * Aides génériques : `async function F(e,t){ … fetch(e,{method:"POST"}) … }`
 * puis `F("/api/x",{…})`. Le premier argument du helper est une variable, donc
 * aucun littéral n'est adjacent à `method` : c'est l'appelant qui porte le chemin.
 */
export function aidesIndirectes(source) {
  const noms = new Set()
  const reAide =
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[^}]{0,400}?fetch\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{[^}]*?method:\s*"POST"/g
  let m
  while ((m = reAide.exec(source))) noms.add(m[1])
  if (!noms.size) return []

  const out = []
  for (const nom of noms) {
    const reAppel = new RegExp(`(?:^|[^\\w$.])${nom}\\(\\s*"(\\/api\\/[^"]+)"`, 'g')
    let a
    while ((a = reAppel.exec(source))) {
      out.push({ url: a[1], offset: a.index, methode: 'POST', genre: 'aide' })
    }
  }
  return out
}

/**
 * Table `url -> méthode` d'un bundle, avec le genre de la preuve la plus forte.
 * Les genres ne sont jamais fusionnés : `manifeste` > `fetch` > `route` > `aide`.
 */
/**
 * Table `url -> méthode` d'un bundle, avec le genre de la preuve la plus forte.
 * Les genres ne sont jamais fusionnés : `manifeste` > `fetch` > `route` > `aide`.
 *
 * L'URL n'est pas toujours un littéral nu : on a mesuré
 * `fetch("cadeau"===e?"/api/a":"/api/b",{method:"POST"})`. On relève donc TOUS
 * les `/api/…` de l'argument 0 et on leur attribue la méthode des options —
 * c'est le seul endroit où un littéral est prouvé « adressé ».
 */
export function methodesDeclarees(source) {
  const rang = { manifeste: 0, fetch: 1, route: 2, aide: 3 }
  const par = new Map()
  const poser = (c) => {
    const deja = par.get(c.url)
    if (!deja || rang[c.genre] < rang[deja.genre]) par.set(c.url, c)
  }

  for (const m of manifestes(source)) poser(m)

  const reFetch = /(?:^|[^.\w$])fetch\(/g
  let m
  while ((m = reFetch.exec(source))) {
    const iParen = source.indexOf('(', m.index)
    const arg0 = argumentDe(source, iParen, 0)
    if (!arg0) continue
    const urls = litterauxApi(arg0.texte)
    if (!urls.length) continue
    const options = argumentDe(source, iParen, 1)
    const methode = (options && RE_METHODE.exec(options.texte)?.[1]) || 'GET'
    for (const u of urls) poser({ url: u.url, offset: m.index, methode, genre: 'fetch' })
  }

  for (const r of routesIndirectes(source)) poser(r)
  for (const a of aidesIndirectes(source)) poser(a)

  return [...par.values()]
}

/* ---------------------------------------------------------------------------
   4. Sonde C — le corps. C'est la seule partie qui n'a jamais été observée
      sur le fil : elle n'est lisible que dans le code qui le fabrique.
   ------------------------------------------------------------------------ */

/**
 * Corps envoyé par un site d'appel `fetch(… , { body: … })`.
 * Renvoie `{ genre, cles }` :
 *   `json`     : `JSON.stringify({…})` — `cles` = clés de premier niveau,
 *                chaque clé portant ses sous-clés si sa valeur est un objet ;
 *   `formdata` : `FormData` + `append("champ", …)` — `cles` = noms de champs ;
 *   `brut`     : `body:<variable>` — indéterminable ici, et on le dit ;
 *   `aucun`    : pas de `body` (GET/DELETE sans corps).
 */
export function corpsDeFetch(source, offsetFetch) {
  const iParen = source.indexOf('(', offsetFetch)
  if (iParen < 0) return { genre: 'aucun', cles: [] }
  const options = argumentDe(source, iParen, 1)
  if (!options) return { genre: 'aucun', cles: [] }

  const iAccolade = options.texte.indexOf('{')
  if (iAccolade < 0) return { genre: 'aucun', cles: [] }
  const optionsEntier = lireObjet(options.texte, iAccolade)
  const corps = optionsEntier.entrees.find((e) => e.nom === 'body')
  if (!corps) return { genre: 'aucun', cles: [] }

  const v = corps.valeur || ''

  // FormData : le corps est construit plus haut ; on lit ses `append`.
  const formdata = champsFormData(source, v)
  if (formdata.length) return { genre: 'formdata', cles: formdata.map((nom) => ({ nom, etalement: false, sousCles: [] })) }

  const iStringify = v.indexOf('JSON.stringify(')
  if (iStringify >= 0) {
    const arg = argumentDe(v, iStringify + 'JSON.stringify'.length, 0)
    if (!arg) return { genre: 'brut', cles: [], exemple: v.slice(0, 80) }
    const cles = clesDeCorps(arg.texte)
    return cles.length ? { genre: 'json', cles } : { genre: 'brut', cles: [], exemple: v.slice(0, 80) }
  }

  return { genre: 'brut', cles: [], exemple: v.slice(0, 80) }
}

/**
 * Clés d'un corps JSON. Gère le ternaire observé
 * (`"winback"===t?{…}:"x"===t?{…}:{…}`) : chaque branche est un corps possible
 * et on les renvoie toutes, marquées `branche:'?'` / `branche:':'`.
 */
export function clesDeCorps(texte) {
  const t = texte.trim()

  if (t.startsWith('{')) {
    const o = lireObjet(t, 0)
    if (o.clos && o.entrees.length) return o.entrees.map(decrireEntree)
  }

  // Branches d'un ternaire : on repère les `{` en position de valeur.
  const sorties = []
  let k = 0
  while (k < t.length) {
    const c = t[k]
    if (GUILLEMETS.has(c)) {
      k = finChaine(t, k)
      continue
    }
    if (c === '{') {
      const p = precedent(t, k)
      if (p === '?' || p === ':') {
        const o = lireObjet(t, k)
        if (o.clos && o.entrees.length) {
          sorties.push(...o.entrees.map((e) => ({ ...decrireEntree(e), branche: p })))
        }
        k = o.clos ? o.fin : k + 1
        continue
      }
      const o = lireObjet(t, k)
      k = o.clos ? o.fin : k + 1
      continue
    }
    k++
  }
  return sorties
}

/** `{ nom, etalement, sousCles }` — sous-clés = objets littéraux dans la valeur. */
function decrireEntree(e) {
  // Un `...spread` conditionnel (`...cond?{a:1}:{}`) ne pose que ses clés
  // littérales : on les remonte, préfixées par `+` plus tard à l'affichage.
  if (e.etalement) {
    const sous = []
    const expr = e.nom || ''
    let k = 0
    while (k < expr.length) {
      const c = expr[k]
      if (GUILLEMETS.has(c)) {
        k = finChaine(expr, k)
        continue
      }
      if (c === '{') {
        const o = lireObjet(expr, k)
        if (o.clos) sous.push(...o.entrees.map((x) => x.nom))
        k = o.clos ? o.fin : k + 1
        continue
      }
      k++
    }
    return { nom: e.nom, etalement: true, sousCles: sous }
  }

  const sous = []
  const v = e.valeur || ''
  let k = 0
  while (k < v.length) {
    const c = v[k]
    if (GUILLEMETS.has(c)) {
      k = finChaine(v, k)
      continue
    }
    if (c === '{') {
      const o = lireObjet(v, k)
      if (o.clos && o.entrees.length) sous.push(...o.entrees.map((x) => x.nom))
      k = o.clos ? o.fin : k + 1
      continue
    }
    k++
  }
  return { nom: e.nom, etalement: false, sousCles: sous }
}

/** Champs d'un `FormData` : `l.append("file",e); l.append("kind",a)`. */
export function champsFormData(source, variable) {
  const nom = String(variable || '').trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return []
  const re = new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\.append\\(\\s*"([^"]+)"`, 'g')
  const out = []
  let m
  while ((m = re.exec(source))) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/* ---------------------------------------------------------------------------
   5. Sonde D — les schémas de validation CÔTÉ CLIENT (zod, minifié).
      Le module zod est le chunk 5125, module 10822 ; ses exports sont renommés.
      La table ci-dessous a été LUE dans le bundle, pas devinée :
        `Ik:()=>eZ`  et `eZ=…`        → ZodObject
        `Yj:()=>ex`                   → ZodString
        `k5:()=>eS`, `eS=eo.create`   → ZodEnum
        `eu:()=>eA`, `eA=el.create`   → ZodLiteral
        `au:()=>eT` (= {string,number,…} coerce) → z.coerce
        `zM:()=>ew`, `ew=L.create`    → ZodBoolean
        `vk:()=>eC`, `eC=eh.createWithPreprocess` → z.preprocess
   ------------------------------------------------------------------------ */

export const ALIAS_ZOD = Object.freeze({
  Ik: 'object',
  Yj: 'string',
  k5: 'enum',
  eu: 'literal',
  au: 'coerce',
  zM: 'boolean',
  vk: 'preprocess',
})

/** Schémas `X = <mod>.Ik({ … })` d'un bundle, exprimés en zod lisible. */
export function schemasClient(source) {
  const out = []
  const re = /([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.Ik\(\s*\{/g
  let m
  while ((m = re.exec(source))) {
    const iAccolade = source.lastIndexOf('{', m.index + m[0].length)
    const o = lireObjet(source, iAccolade)
    if (!o.clos) continue
    out.push({
      nom: m[1],
      module: m[2],
      champs: o.entrees
        .filter((e) => !e.etalement)
        .map((e) => ({ nom: e.nom, zod: normaliserZod(e.valeur || '', m[2]) })),
    })
  }
  return out
}

/** `i.Yj().min(3,"Requis")` → `z.string().min(3,"Requis")` ; `i.au.number()` → `z.coerce.number()`. */
export function normaliserZod(brut, module) {
  let t = String(brut).trim()
  if (module) t = t.split(`${module}.`).join('z.')
  for (const [alias, nom] of Object.entries(ALIAS_ZOD)) {
    // Deux formes observées : appel (`z.Ik({…})`) et propriété (`z.au.number()`).
    t = t.split(`z.${alias}(`).join(`z.${nom}(`)
    t = t.split(`z.${alias}.`).join(`z.${nom}.`)
  }
  return t.replace(/\s+/g, ' ')
}

/* ---------------------------------------------------------------------------
   6. Agrégation — une entrée par URL, avec toutes ses preuves.
   ------------------------------------------------------------------------ */

/**
 * @param {{fichier: string, source: string}[]} bundles
 */
export function agreger(bundles) {
  const par = new Map()
  const entree = (url) => {
    if (!par.has(url)) par.set(url, { url, methodes: [], corps: [] })
    return par.get(url)
  }

  for (const { fichier, source } of bundles) {
    for (const d of methodesDeclarees(source)) {
      entree(d.url).methodes.push({ methode: d.methode || 'GET', genre: d.genre, fichier })
    }

    // Corps : pour chaque `fetch(`, tous les `/api/…` de l'argument 0 partagent
    // le corps des options (cas mesuré : URL choisie par un ternaire).
    const reFetch = /(?:^|[^.\w$])fetch\(/g
    let m
    while ((m = reFetch.exec(source))) {
      const iParen = source.indexOf('(', m.index)
      const arg0 = argumentDe(source, iParen, 0)
      if (!arg0) continue
      const urls = litterauxApi(arg0.texte)
      if (!urls.length) continue
      const corps = corpsDeFetch(source, m.index)
      if (corps.genre === 'aucun') continue
      const options = argumentDe(source, iParen, 1)
      const methode = (options && RE_METHODE.exec(options.texte)?.[1]) || 'GET'
      for (const u of urls) {
        const e = entree(u.url)
        const deja = e.corps.some(
          (c) => c.genre === corps.genre && JSON.stringify(c.cles) === JSON.stringify(corps.cles),
        )
        if (!deja) e.corps.push({ ...corps, methode, fichier })
      }
    }
  }

  return [...par.values()].sort((a, b) => a.url.localeCompare(b.url))
}

/**
 * Calibration : chaque témoin doit tomber du côté attendu.
 * Renvoie la liste des écarts — vide = le corpus se comporte comme annoncé.
 */
export function calibrer(contrats) {
  const trouve = (u) => contrats.find((c) => c.url === u)
  const methode = (u) => trouve(u)?.methodes?.[0]?.methode ?? null
  const ecarts = []

  if (!trouve(TEMOINS.positif)) ecarts.push(`témoin positif absent : ${TEMOINS.positif}`)
  if (methode(TEMOINS.positifPost) !== 'POST') {
    ecarts.push(`témoin POST non classé POST : ${TEMOINS.positifPost} → ${methode(TEMOINS.positifPost)}`)
  }
  const genreManifeste = trouve(TEMOINS.positifManifeste)?.methodes?.[0]?.genre
  if (genreManifeste !== 'manifeste') {
    ecarts.push(`témoin manifeste non reconnu : ${TEMOINS.positifManifeste} → ${genreManifeste}`)
  }
  if (trouve(TEMOINS.negatif)) ecarts.push(`témoin négatif ressorti : ${TEMOINS.negatif}`)
  // Le leurre peut exister comme littéral, mais ne doit JAMAIS être classé POST
  // d'origine application : S3 a mesuré 404 sur cette route.
  if (methode(TEMOINS.leurre) === 'POST') {
    ecarts.push(`leurre classé POST alors que la route répond 404 : ${TEMOINS.leurre}`)
  }

  return ecarts
}
