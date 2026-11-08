/* ============================================================================
   REA Fidelix — A3 : le contrat wallet, lu dans le code livré.

   Objet : trouver où les pass Apple/Google sont PRODUITS. A2 avait conclu, à
   juste titre, qu'aucun endpoint de génération n'est appelé par le dashboard —
   mais le dashboard n'est pas le seul client. Le parcours public `/join/<slug>`
   mène à `/card/<cardId>`, et c'est là que vivent les deux boutons.

   Ce module est PUR (aucune I/O, aucun réseau). La CLI `relever-wallet.mjs` lit
   des bundles déjà capturés et imprime. Tout ce qui décide est testé hors ligne
   (`tools/rea/tests/wallet.test.mjs`).

   Trois pièges, tous mesurés le 2026-10-27, sont encodés ici :

   1. `wallet` est aussi un mot de supabase `auth-js` (`signInWithWeb3`, wallets
      Ethereum/Solana) : 20 occurrences dans le corpus authentifié. Un comptage
      sans foyer d'origine fabrique un faux contrat (lesson §18.1). D'où `foyer`.
   2. La route n'est pas le littéral : `"/api/wallet/apple/".concat(t)` désigne
      `/api/wallet/apple/<var>`. D'où `expressionRoute`, qui assemble les
      morceaux littéraux et marque les variables — sans deviner leur nom.
   3. Le verbe d'appel décide du contrat : `window.location.href=` est une
      NAVIGATION (la réponse *est* le fichier de pass), `fetch(` est une lecture
      JSON. Deux contrats différents pour deux URL voisines. D'où `genreAppel`.
   ========================================================================== */

import { argumentDe, finChaine } from './contrats.mjs'

/* ---------------------------------------------------------------------------
   0. Témoins — la réponse est connue AVANT de sonder le corpus.
      Un instrument qui se trompe toujours du même côté est indiscernable d'un
      fait (lesson §17) : on le calibre sur un cas dont on connaît la réponse.
   ------------------------------------------------------------------------ */

export const TEMOINS_WALLET = Object.freeze({
  /** Présent dans le bundle de la page carte : la route de génération Apple. */
  positifRoute: '/api/wallet/apple/',
  /** Présent dans la page branding : champ de design du pass. */
  positifChamp: 'wallet_bg_url',
  /** Présent dans le chunk `app/card/[cardId]` : libellé du bouton. Écrit
      échappé dans le bundle minifié (`Ajouter \xe0 …`) — un témoin en UTF-8
      échoue, et c'est ce qui est arrivé au premier essai. */
  positifProse: 'Ajouter \\xe0 Apple Wallet',
  /** Leurre : `wallet` présent, mais c'est une bibliothèque, pas un contrat. */
  leurreFoyer: '@supabase/auth-js',
  /** Absents du corpus entier. Le format d'un pass Apple ne s'écrit pas ici. */
  negatif: 'pkpass',
  negatif2: 'passTypeIdentifier',
  /** Absent : nom inventé, de la même forme que les routes voisines. */
  negatifRoute: '/api/wallet/zzz-inexistant',
})

/** Jetons suivis, du plus spécifique au plus général. */
export const JETONS = Object.freeze([
  'wallet_bg_url',
  'message_wallet_le',
  'message_wallet',
  'taux_desinscription_wallet',
  'walletEnabled',
  'googleWalletEnabled',
  'wallet_enabled',
  'google_wallet_enabled',
  '/api/wallet/',
  'Apple Wallet',
  'Google Wallet',
  'pkpass',
  'passTypeIdentifier',
  'walletobjects',
  'wallet.google',
  'passes.apple',
  'wallet',
])

/* ---------------------------------------------------------------------------
   1. Lecture — le corpus est minifié, pas d'AST. On reste bête et borné.
   ------------------------------------------------------------------------ */

/** Index de toutes les occurrences de `jeton`, insensible à la casse. */
export function occurrences(source, jeton) {
  const out = []
  if (!source || !jeton) return out
  const a = source.toLowerCase()
  const j = jeton.toLowerCase()
  let i = -1
  while ((i = a.indexOf(j, i + 1)) !== -1) out.push(i)
  return out
}

/** Le mot entier qui contient `i` (`wallet_bg_url`, `walletEnabled`…). */
export function motIdentifiant(source, i, longueur) {
  let d = i
  let f = i + longueur
  while (d > 0 && /[A-Za-z0-9_$]/.test(source[d - 1])) d--
  while (f < source.length && /[A-Za-z0-9_$]/.test(source[f])) f++
  return source.slice(d, f)
}

/**
 * Le littéral de chaîne qui CONTIENT `cible`, ou `null` si la position est
 * dans du code. Réutilise `finChaine` : une seule implémentation du saut de
 * chaîne dans le projet (une copie locale avait déjà divergé, cf. session.mjs).
 */
export function chaineContenant(source, cible) {
  let i = 0
  while (i < source.length && i <= cible) {
    const c = source[i]
    if (c === '"' || c === "'" || c === '`') {
      const fin = finChaine(source, i)
      if (cible > i && cible < fin - 1) return { debut: i, fin, texte: source.slice(i + 1, fin - 1) }
      i = fin
      continue
    }
    i++
  }
  return null
}

/**
 * Assemble l'expression qui commence à la chaîne contenant `i`.
 *
 * `"/api/wallet/apple/".concat(t,"/statut")` → `/api/wallet/apple/<var>/statut`
 * avec `variables: ['t']`. Les noms de variables sont CONSERVÉS tels quels :
 * on ne les renomme pas en `cardId` — le nom du paramètre n'est pas dans le
 * littéral. Le deviner serait une inférence, pas une mesure.
 */
export function expressionRoute(source, i) {
  const lit = chaineContenant(source, i)
  if (!lit) return null
  let route = lit.texte
  const variables = []
  let k = lit.fin
  while (source[k] === ' ') k++
  if (source.startsWith('.concat(', k)) {
    const iParen = k + '.concat'.length
    for (let n = 0; n < 8; n++) {
      const a = argumentDe(source, iParen, n)
      if (!a) break
      const t = a.texte
      const estLitteral = t.length > 1 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]
      if (estLitteral) route += t.slice(1, -1)
      else {
        route += '<var>'
        variables.push(t)
      }
    }
  }
  return { route, variables, littoral: lit.texte }
}

/** Navigation (la réponse EST le pass), lecture JSON, lien, ou inconnu. */
export function genreAppel(source, i) {
  const avant = source.slice(Math.max(0, i - 90), i)
  if (/location\s*\.\s*(href|assign|replace)\s*[=(]/.test(avant)) return 'navigation'
  if (/fetch\s*\(/.test(avant)) return 'fetch'
  if (/href\s*:/.test(avant)) return 'lien'
  return 'inconnu'
}

/* ---------------------------------------------------------------------------
   2. Relevé SANS double comptage.
      `wallet` est contenu dans `wallet_bg_url`, `walletEnabled`, `/api/wallet/`,
      `Apple Wallet`… Compter chaque jeton séparément gonflerait le total et
      ferait croire à un sujet partout présent. Ici un relevé = un jeton, le
      plus LONG qui couvre la position (même règle que le lexer le plus long).
   ------------------------------------------------------------------------ */

/** Racines assez larges pour couvrir tous les jetons de `JETONS`. */
const RACINES = Object.freeze(['wallet', 'pkpass', 'passtypeidentifier', 'passes.apple'])

export function relever(source) {
  const bas = source.toLowerCase()
  const vus = new Map()
  for (const racine of RACINES) {
    for (const i of occurrences(source, racine)) {
      let meilleur = null
      for (const j of JETONS) {
        const lj = j.toLowerCase()
        for (let k = lj.length - 1; k >= 0; k--) {
          const debut = i - k
          if (debut < 0) continue
          if (!bas.startsWith(lj, debut)) continue
          const candidat = { jeton: j, debut }
          if (
            !meilleur ||
            candidat.jeton.length > meilleur.jeton.length ||
            (candidat.jeton.length === meilleur.jeton.length && candidat.debut < meilleur.debut)
          ) {
            meilleur = candidat
          }
          break
        }
      }
      if (meilleur) {
        const deja = vus.get(meilleur.debut)
        if (!deja || meilleur.jeton.length > deja.jeton.length) vus.set(meilleur.debut, meilleur)
      }
    }
  }
  return [...vus.values()].sort((a, b) => a.debut - b.debut)
}

/* ---------------------------------------------------------------------------
   3. Classement — DEUX axes indépendants, et c'est le point de l'étape :
        `role`  : ce que l'occurrence EST dans le code (route / champ / prose) ;
        `foyer` : à QUI elle appartient (page applicative / supabase auth-js).
      « wallet apparaît 30 fois » ne dit rien ; « 20 fois dans auth-js, jamais
      en route » dit tout. Un comptage sans les deux axes est une impression
      chiffrée (lesson §18.1).
   ------------------------------------------------------------------------ */

/** Rôle attendu de chaque jeton — décidé par sa FORME, pas par son contexte. */
export const ROLES = Object.freeze({
  '/api/wallet/': 'route',
  wallet_bg_url: 'champ',
  message_wallet: 'champ',
  message_wallet_le: 'champ',
  walletEnabled: 'champ',
  googleWalletEnabled: 'champ',
  wallet_enabled: 'champ',
  google_wallet_enabled: 'champ',
  taux_desinscription_wallet: 'mesure',
  pkpass: 'format',
  passTypeIdentifier: 'format',
  walletobjects: 'format',
  'wallet.google': 'format',
  'passes.apple': 'format',
  'Apple Wallet': 'libelle',
  'Google Wallet': 'libelle',
  wallet: 'mot',
})

export function foyer(source, nomFichier = '') {
  if (source.includes('@supabase/auth-js')) return 'supabase auth-js'
  if (/app_/.test(nomFichier)) return 'page applicative'
  return 'chunk partagé'
}

/**
 * `role` vient du jeton ; seul `mot`/`libelle` dépend du contexte.
 * Un `mot` dans une chaîne est de la prose ; hors chaîne, du code.
 */
export function classerOccurrence(source, i, jeton) {
  const lit = chaineContenant(source, i)
  const roleJeton = ROLES[jeton] || 'mot'
  if (roleJeton === 'route') {
    return { origine: 'route', genre: genreAppel(source, lit?.debut ?? i), route: expressionRoute(source, i)?.route }
  }
  if (roleJeton === 'champ') return { origine: 'champ', mot: jeton }
  if (roleJeton === 'mesure') return { origine: 'mesure', mot: jeton }
  if (roleJeton === 'format') return { origine: 'format', mot: jeton }
  return { origine: lit ? 'prose' : 'code', mot: jeton }
}

/** Agrège un corpus. Aucune décision ici : uniquement des comptes et des listes. */
export function classerCorpus(bundles) {
  const parOrigine = {}
  const parJeton = {}
  const parFichier = []
  const routes = new Map()
  for (const b of bundles) {
    const f = foyer(b.source, b.fichier)
    const items = relever(b.source).map(({ jeton, debut }) => ({
      jeton,
      ...classerOccurrence(b.source, debut, jeton),
    }))
    for (const it of items) {
      parOrigine[it.origine] = (parOrigine[it.origine] || 0) + 1
      parOrigine[f] = (parOrigine[f] || 0) + 1
      const cle = `${it.jeton}`
      parJeton[cle] = parJeton[cle] || { total: 0, origines: {} }
      parJeton[cle].total += 1
      parJeton[cle].origines[it.origine] = (parJeton[cle].origines[it.origine] || 0) + 1
      if (it.origine === 'route' && it.route) {
        const r = routes.get(it.route) || { route: it.route, genres: new Set(), jetons: new Set(), fichiers: new Set() }
        r.genres.add(it.genre)
        r.jetons.add(it.jeton)
        r.fichiers.add(b.fichier)
        routes.set(it.route, r)
      }
    }
    if (items.length) parFichier.push({ fichier: b.fichier, foyer: f, total: items.length, items })
  }
  return {
    parOrigine,
    parJeton,
    parFichier,
    routes: [...routes.values()].map((r) => ({
      ...r,
      genres: [...r.genres],
      jetons: [...r.jetons],
      fichiers: [...r.fichiers],
    })),
  }
}

/** Présence brute d'un jeton dans le corpus — sert aux témoins, pas au relevé. */
export function presence(bundles, jeton) {
  const j = jeton.toLowerCase()
  return bundles.some((b) => b.source.toLowerCase().includes(j))
}

/** Calibration : chaque témoin doit répondre ce qu'on attend de lui. */
export function calibrer({ bundles, routes }) {
  const ecarts = []
  const contient = (j) => presence(bundles, j)
  if (!contient(TEMOINS_WALLET.positifRoute)) ecarts.push(`témoin positif route ABSENT : ${TEMOINS_WALLET.positifRoute}`)
  if (!contient(TEMOINS_WALLET.positifChamp)) ecarts.push(`témoin positif champ ABSENT : ${TEMOINS_WALLET.positifChamp}`)
  if (!contient(TEMOINS_WALLET.positifProse)) ecarts.push(`témoin positif prose ABSENT : ${TEMOINS_WALLET.positifProse}`)
  if (contient(TEMOINS_WALLET.negatif)) ecarts.push(`témoin négatif SORTI : ${TEMOINS_WALLET.negatif}`)
  if (contient(TEMOINS_WALLET.negatif2)) ecarts.push(`témoin négatif SORTI : ${TEMOINS_WALLET.negatif2}`)
  if (routes.some((r) => r.route === TEMOINS_WALLET.negatifRoute)) ecarts.push('route inventée classée : ' + TEMOINS_WALLET.negatifRoute)
  if (!routes.some((r) => r.route.startsWith(TEMOINS_WALLET.positifRoute))) ecarts.push('aucune route wallet relevée')
  // Le leurre doit être présent ET ne produire aucun contrat.
  if (contient(TEMOINS_WALLET.leurreFoyer) && routes.some((r) => r.fichiers.some((f) => /44530001/.test(f))))
    ecarts.push('leurre auth-js promu en contrat')
  return ecarts
}
