/* ============================================================================
   REA Fidelix — A4 : la file hors ligne de la CAISSE, lue dans le code livré.

   Objet : mesurer la MÉCANIQUE de file de la caisse — où elle est stockée, sous
   quelle forme, quand elle se vide, ce qu'elle affiche hors ligne — et la
   DISTINGUER de la POLITIQUE DE REJEU, déjà relevée en A2 (§3.1 de
   `Fidelix_API_Contrats.md`). Deux sujets voisins, deux contrats différents :

       mécanique : magasin, forme d'un élément, identité, ordre, minuteur,
                   cache de cartes, ce qui s'affiche sans réseau ;
       politique : quels statuts jettent, lesquels conservent, quand on bloque.

   Ce module est PUR (aucune I/O, aucun réseau). La CLI `relever-caisse.mjs` lit
   des bundles DÉJÀ CAPTURÉS et imprime. Tout ce qui décide est testé hors ligne
   (`tools/rea/tests/caisse.test.mjs`).

   Quatre pièges, tous mesurés le 2026-10-27, sont encodés ici :

    1. **Le nom du fichier n'est pas le propriétaire du code.** Le bundle
       `app/caisse/page-*.js` ne contient AUCUN jeton de file : il ne fait que
       déclarer une dépendance vers le chunk `6866`. Chercher « dans le bundle
       de la page » aurait donné « il n'y a pas de file » — faux. D'où `foyer`,
       qui dit dans QUEL genre de fichier chaque occurrence vit.
    2. **Une clé de stockage n'est pas un contrat réseau.** `file_attente`,
       `fidelix_caisse_programme`, `cartes` sont des noms locaux ; les compter
       comme des routes fabriquerait un contrat qui n'existe pas (lesson §18.1).
       D'où `origine`, qui range chaque occurrence : magasin local / contrat
       réseau / hôte navigateur / prose.
    3. **`/api/transaction` est un préfixe de `/api/transaction/annuler`.**
       Un relevé par `includes` transforme deux contrats en un seul, avec un
       compte double. D'où `releverCaisse`, qui applique la règle du §19.3 :
       un relevé = le jeton le PLUS LONG qui couvre la position.
    4. **Le corpus écrit `\xe9`, pas « é ».** Un témoin de prose en UTF-8 ne
       matche pas un bundle minifié (lesson §19.4 n°2). D'où
       `decoderEchappements`, et des témoins de prose cherchés sur le texte
       décodé — jamais écrits « comme le produit s'affiche ».
   ========================================================================== */

import { argumentDe, litterauxApi } from './contrats.mjs'
import { genreAppel, chaineContenant } from './wallet.mjs'

/* ---------------------------------------------------------------------------
   0. Témoins — la réponse est connue AVANT de lire le corpus.
      Un instrument qui se trompe toujours du même côté est indiscernable d'un
      fait (lesson §17) : on le calibre sur des cas dont on connaît la réponse.
   ------------------------------------------------------------------------ */

export const TEMOINS_CAISSE = Object.freeze({
  /** Nom de la base IndexedDB. Présent dans le chunk de la caisse. */
  positifBase: 'fidelix-caisse',
  /** Nom du magasin de file. Présent, et c'est le sujet de l'étape. */
  positifMagasin: 'file_attente',
  /** Clé localStorage du programme : un magasin local, pas une route. */
  positifCleLs: 'fidelix_caisse_programme',
  /** Champ d'idempotence : le seul jeton qui relie file et contrat réseau. */
  positifIdempotence: 'client_operation_id',
  /** Prose ASCII, telle que le corpus l'écrit (aucun accent : rien à décoder). */
  positifProse: "en attente d'envoi",
  /** Prose ASCII : l'aveu que le solde affiché hors ligne est périmé. */
  positifSolde: 'Solde au dernier passage',
  /** La route que la file rejoue. */
  positifRoute: '/api/transaction',

  /** Leurre : le même mot (`localStorage`) dans une BIBLIOTHÈQUE. Le jeton
      existe dans le corpus, mais il n'y a pas de file — c'est le stockage du
      jeton d'auth de supabase. Un relevé sans foyer le compterait à tort. */
  leurreFoyer: '@supabase/auth-js',

  /** Absents du corpus entier. Un kit de synchronisation laisserait ces
      traces : leur présence signalerait une file que ce relevé ne voit pas. */
  negatif: 'workbox',
  negatif2: 'idb-keyval',
  negatif3: 'Background Sync',

  /** Négatif de forme : un nom de magasin plausible, de la même famille, mais
      qui n'est le préfixe d'aucun jeton suivi. `file_attente_v2` ne convient
      PAS : il contient `file_attente`, que le lexer relèverait à juste titre —
      c'est le premier essai, et le test a crié. */
  negatifMagasin: 'file_envoi',
})

/* ---------------------------------------------------------------------------
   1. Jetons suivis, et ce que chacun EST dans le code.

      `role` décide de `origine`. C'est le seul endroit où la sémantique est
      écrite à la main — et elle est courte, explicite, testée.
   ------------------------------------------------------------------------ */

export const JETONS_CAISSE = Object.freeze([
  // --- magasins locaux (jamais des contrats réseau) -------------------------
  'fidelix_caisse_programme',
  'fidelix_caisse_devise',
  'fidelix-caisse',
  'file_attente',
  // `cartes` n'est PAS suivi : c'est aussi un mot français (« vos cartes »).
  // Mesuré : 8 occurrences dans le corpus, 2 seulement désignent le magasin.
  // Un jeton qui ne discrimine pas n'est pas un jeton (lesson §18.1 de A2) —
  // le magasin est relevé par `magasinsIndexedDb`, qui résout la variable.
  'cree_le',
  'maj_le',
  'tentatives',
  // --- champs de requête ----------------------------------------------------
  'client_operation_id',
  // --- hôtes navigateur -----------------------------------------------------
  'navigator.onLine',
  'crypto.randomUUID',
  'indexedDB',
  'localStorage',
  'serviceWorker',
  // --- contrats réseau (le plus long AVANT son préfixe) ---------------------
  '/api/transaction/annuler',
  '/api/transaction',
  '/api/scan/card?id=',
  '/api/scan/cards',
  '/api/caisse/cadeau-filleul',
  '/api/caisse/parrainage-valide',
  '/sw.js',
])

export const ROLES_CAISSE = Object.freeze({
  'fidelix-caisse': 'magasin-base',
  file_attente: 'magasin-magasin',
  fidelix_caisse_programme: 'magasin-cle',
  fidelix_caisse_devise: 'magasin-cle',
  cree_le: 'champ-file',
  maj_le: 'champ-cache',
  tentatives: 'champ-file',
  client_operation_id: 'champ-requete',
  'navigator.onLine': 'hote',
  'crypto.randomUUID': 'hote',
  indexedDB: 'hote',
  localStorage: 'hote',
  serviceWorker: 'hote',
  // `/sw.js` n'est pas un contrat d'API : c'est une ressource enregistrée par
  // l'hôte. La mettre en « contrat réseau » gonflerait le compte d'un faux.
  '/sw.js': 'hote',
})

/** role → origine. C'est la table que la doc cite, et le point de l'étape. */
export const ORIGINE_DE_ROLE = Object.freeze({
  'magasin-base': 'magasin local',
  'magasin-magasin': 'magasin local',
  'magasin-cle': 'magasin local',
  'champ-file': 'magasin local',
  'champ-cache': 'magasin local',
  'champ-requete': 'contrat réseau',
  hote: 'hôte navigateur',
  route: 'contrat réseau',
})

/* ---------------------------------------------------------------------------
   2. Lire le corpus minifié. Pas d'AST : on reste bête et borné.
   ------------------------------------------------------------------------ */

const RE_ECHAPPEMENT = /^\\x([0-9a-f]{2})/i

/**
 * `d\xe9duit` devient « déduit ».
 *
 * MESURÉ, et c'est un piège de plus : `\xe9` n'est PAS un OCTET UTF-8, c'est
 * une ÉCHAPPEMENT DE CARACTÈRE JavaScript (U+00E9). Décoder `\xNN` comme un
 * octet — la première version de cette fonction — rendait « d\uFFFDu » pour
 * `\xe9` seul, parce que 0xE9 n'est pas une séquence UTF-8 valide. La règle
 * juste est `String.fromCharCode`. Corollaire : `\xc3\xa9` vaut « Ã© » en JS,
 * et c'est bien ainsi qu'il faut le lire ; le recoller serait une invention.
 *
 * Ce que ça change pour les témoins : un témoin de prose écrit en UTF-8 ne
 * matche pas un bundle minifié (lesson §19.4 n°2). On cherche donc sur le
 * texte décodé, jamais sur les octets du fichier.
 */
export function decoderEchappements(texte) {
  const sortie = []
  let i = 0
  while (i < texte.length) {
    const m = RE_ECHAPPEMENT.exec(texte.slice(i, i + 4))
    if (m) {
      sortie.push(String.fromCharCode(parseInt(m[1], 16)))
      i += 4
      continue
    }
    sortie.push(texte[i])
    i++
  }
  return sortie.join('')
}

/**
 * Relevé SANS double comptage : un relevé = le jeton le plus long qui COUVRE
 * la position (§19.3). Traite les deux pièges à la fois :
 *   `/api/transaction/annuler` couvre `/api/transaction` (même départ) ;
 *   `navigator.onLine` n'est pas doublé par un jeton `onLine` plus court.
 */
export function releverJetons(source, jetons) {
  const bas = source.toLowerCase()
  const bruts = []
  const vus = new Set()
  for (const jeton of jetons) {
    const j = jeton.toLowerCase()
    for (let i = bas.indexOf(j); i !== -1; i = bas.indexOf(j, i + 1)) {
      const cle = jeton + '@' + i
      if (vus.has(cle)) continue
      vus.add(cle)
      bruts.push({ jeton, debut: i, fin: i + j.length })
    }
  }
  // Plus long d'abord (à départ égal), puis on écarte ce qui est déjà couvert.
  bruts.sort((a, b) => a.debut - b.debut || b.fin - a.fin || b.jeton.length - a.jeton.length)
  const gardes = []
  for (const t of bruts) {
    if (gardes.some((g) => g.debut <= t.debut && g.fin >= t.fin)) continue
    gardes.push(t)
  }
  return gardes.map(({ jeton, debut }) => ({ jeton, debut }))
}

/** Relevé de la caisse, sans double comptage. Délègue au générique d'A5. */
export function releverCaisse(source) {
  return releverJetons(source, JETONS_CAISSE)
}

/** Prose : cherchée sur le texte DÉCODÉ, sans position (les offsets bougent). */
export const PROSE_CAISSE = Object.freeze([
  "en attente d'envoi",
  'Hors ligne — les',
  'Solde au dernier passage',
  'ne peuvent pas être remises hors ligne',
  'ne peut pas être déduit hors ligne',
  'hors ligne refus',
  'sont enregistrés sur cet appareil',
])

export function proseCaisse(source) {
  const texte = decoderEchappements(source)
  const sortie = []
  for (const p of PROSE_CAISSE) {
    let n = 0
    for (let i = texte.indexOf(p); i !== -1; i = texte.indexOf(p, i + 1)) n++
    if (n) sortie.push({ jeton: p, nombre: n })
  }
  return sortie
}

/* ---------------------------------------------------------------------------
   3. Résolution d'un identifiant minifié : `k="file_attente"` puis
      `createObjectStore(k, …)`. On ne devine pas — on cherche la déclaration.
   ------------------------------------------------------------------------ */

const echapperRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function constanteDe(source, nom) {
  if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return null
  const re = new RegExp('(?:^|[,;({}\\s])' + echapperRegex(nom) + '\\s*=\\s*["\'`]([^"\'`]+)["\'`]')
  const m = re.exec(source)
  return m ? m[1] : null
}

/** `"x"` → x ; `k` → la constante qu'il désigne ; sinon `null` (jamais deviné). */
export function resoudre(source, expression) {
  const t = String(expression || '').trim()
  const litteral = /^["'`]([^"'`]+)["'`]$/.exec(t)
  if (litteral) return litteral[1]
  if (/^[A-Za-z_$][\w$]*$/.test(t)) return constanteDe(source, t)
  return null
}

/* ---------------------------------------------------------------------------
   4. Magasins locaux — base IndexedDB, magasins, clés localStorage.
      C'est la moitié « mécanique » de l'étape : ce qui survit sans réseau.
   ------------------------------------------------------------------------ */

export function magasinsIndexedDb(source) {
  const bases = []
  const re = /indexedDB\.open\(\s*([^,)]+?)\s*(?:,\s*(\d+)\s*)?\)/g
  let m
  while ((m = re.exec(source))) {
    const nom = resoudre(source, m[1])
    if (!nom) continue
    bases.push({ nom, version: m[2] ? Number(m[2]) : null, magasins: [] })
  }
  const base = bases[0]
  if (!base) return []

  const crees = /createObjectStore\(\s*([^,)]+?)\s*,\s*\{[^}]*keyPath\s*:\s*["']([^"']+)["']/g
  while ((m = crees.exec(source))) {
    const nom = resoudre(source, m[1])
    if (nom) base.magasins.push({ nom, keyPath: m[2], effaceAupgrade: false })
  }

  const effaces = /deleteObjectStore\(\s*([^,)]+?)\s*\)/g
  while ((m = effaces.exec(source))) {
    const nom = resoudre(source, m[1])
    const magasin = base.magasins.find((x) => x.nom === nom)
    if (magasin) magasin.effaceAupgrade = true
  }
  return bases
}

export function clesLocalStorage(source) {
  const cles = new Map()
  const re = /localStorage\.(setItem|getItem|removeItem)\(\s*([^,)]+)/g
  let m
  while ((m = re.exec(source))) {
    const nom = resoudre(source, m[2])
    if (!nom) continue
    const cle = cles.get(nom) || { nom, ecritures: 0, lectures: 0 }
    if (m[1] === 'getItem') cle.lectures++
    else cle.ecritures++
    cles.set(nom, cle)
  }
  return [...cles.values()]
}

/* ---------------------------------------------------------------------------
   5. Politique de rejeu — les nombres qui décident, EXTRAITS et non supposés.
      C'est la moitié déjà relevée en A2 §3.1 : ici on sait d'où vient chacun.
   ------------------------------------------------------------------------ */

export function politiqueRejeu(source) {
  // Un `new Set([...])` n'est une politique de rejeu que si ses valeurs sont
  // des CODES HTTP. Sans ce garde, `polyfills` fournit `new Set([1,2,3])` et le
  // relevé invente une politique là où il n'y a qu'un polyfill — même famille
  // de faux positif que les 7 `method:"POST"` de supabase-js en A2 (§2.2).
  // Témoin négatif encodé : `[1,2,3]` doit être ÉCARTÉ, pas classé.
  const ensembles = []
  const reSet = /new\s+Set\(\s*\[([0-9,\s]*)\]\s*\)/g
  let s
  while ((s = reSet.exec(source))) {
    const codes = s[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite)
    if (codes.length && codes.every((n) => n >= 400 && n <= 599)) ensembles.push(codes)
  }
  const seuil = /tentatives\s*>=\s*(\d+)/.exec(source)
  const delais = []
  const re = /setTimeout\(/g
  let m
  while ((m = re.exec(source))) {
    const iParen = m.index + 'setTimeout'.length
    const rappel = argumentDe(source, iParen, 0)
    const delai = argumentDe(source, iParen, 1)
    if (!delai) continue
    const ms = Number(delai.texte.replace(/[_\s]/g, ''))
    if (!Number.isFinite(ms)) continue
    delais.push({ ms, rappel: (rappel ? rappel.texte : '').slice(0, 46) })
  }
  return {
    // `[]` et non `null` : « pas trouvé » doit se voir, et ne pas se confondre
    // avec « trouvé vide ».
    rejet: ensembles[0] || [],
    seuilBloque: seuil ? Number(seuil[1]) : null,
    delais,
  }
}

/* ---------------------------------------------------------------------------
   6. Contrats réseau de la caisse, et — le point de l'étape — lesquels entrent
      dans la file. « Enfilable » n'est pas une opinion : c'est la condition
      écrite dans le code (`a="add_stamp"===e||"earn_points"===e`), et c'est la
      MÊME que celle de `client_operation_id` en A2 §3.1.
   ------------------------------------------------------------------------ */

/** Types d'opération que le client accepte de mettre en file. */
export const TYPES_ENFILES = Object.freeze(['add_stamp', 'earn_points'])

/** Types qui, en échec réseau, ne sont PAS mis en file : « rien n'a été
    enregistré ». `redeem_points` et `redeem_reward` exigent le serveur. */
export const TYPES_REFUSES_HORS_LIGNE = Object.freeze(['redeem_points', 'redeem_reward'])

export function routesCaisse(source) {
  return litterauxApi(source).map(({ url, offset }) => ({
    route: url,
    genre: genreAppel(source, offset),
    // Une seule route est rejouée : celle dont le corps porte
    // `client_operation_id`. Les autres ne sont jamais mises en file.
    enfilee: url === '/api/transaction',
  }))
}

/** Chemins non-`/api/` enregistrés par le client (service worker). */
export function cheminsHote(source) {
  const sortie = []
  const re = /serviceWorker\.register\(\s*["']([^"']+)["']/g
  let m
  while ((m = re.exec(source))) sortie.push(m[1])
  return sortie
}

/* ---------------------------------------------------------------------------
   7. Classement par ORIGINE puis FOYER — deux axes indépendants.
      « file_attente apparaît 1 fois » ne dit rien ; « 1 fois, dans un magasin
      local, dans un chunk que seule /caisse charge » dit tout.
   ------------------------------------------------------------------------ */

export function foyer(source, nomFichier = '') {
  if (source.includes('@supabase/auth-js')) return 'supabase auth-js'
  if (/page-/.test(nomFichier)) return 'entrée de route'
  if (/^_next_static_chunks_\d/.test(nomFichier)) return 'chunk partagé'
  return 'autre'
}

export function classerOccurrence(source, i, jeton) {
  const role = ROLES_CAISSE[jeton] || (jeton.startsWith('/') ? 'route' : 'mot')
  // Deuxième faux positif mesuré : `tentatives` est AUSSI un mot français.
  // La page /login écrit « Trop de tentatives. Patientez une minute ». Un champ
  // de code est un identifiant (hors chaîne) ; dans une chaîne, c'est de la
  // prose. C'est le même partage que `wallet.mjs` fait pour `mot`/`libelle`.
  const dansUneChaine = chaineContenant(source, i) !== null
  if (dansUneChaine && (role === 'champ-file' || role === 'champ-cache'))
    return { origine: 'prose', role: 'prose' }
  return { origine: ORIGINE_DE_ROLE[role] || 'inconnu', role }
}

/** Agrège un corpus. Uniquement des comptes et des listes — aucune décision. */
export function classerCorpus(bundles) {
  const parOrigine = {}
  const parFoyer = {}
  const parJeton = {}
  const parFichier = []
  const routes = new Map()
  const magasins = []
  const cles = []
  const politiques = []
  const chemins = new Set()

  for (const b of bundles) {
    const f = foyer(b.source, b.fichier)
    const items = releverCaisse(b.source).map(({ jeton, debut }) => ({
      jeton,
      ...classerOccurrence(b.source, debut, jeton),
    }))
    const prose = proseCaisse(b.source)
    const proseTotal = prose.reduce((a, p) => a + p.nombre, 0)

    for (const it of items) {
      parOrigine[it.origine] = (parOrigine[it.origine] || 0) + 1
      parFoyer[f] = (parFoyer[f] || 0) + 1
      parJeton[it.jeton] = parJeton[it.jeton] || { total: 0, origines: {} }
      parJeton[it.jeton].total += 1
      parJeton[it.jeton].origines[it.origine] = (parJeton[it.jeton].origines[it.origine] || 0) + 1
    }
    if (proseTotal) {
      parOrigine.prose = (parOrigine.prose || 0) + proseTotal
      for (const p of prose) {
        parJeton[p.jeton] = parJeton[p.jeton] || { total: 0, origines: {} }
        parJeton[p.jeton].total += p.nombre
        parJeton[p.jeton].origines.prose = (parJeton[p.jeton].origines.prose || 0) + p.nombre
      }
    }

    // Les contrats ne sont agrégés que depuis le fichier qui PORTE la file :
    // sinon le rapport « contrats de la caisse » listerait les 40 routes du
    // corpus entier, ce qui est vrai du corpus et faux de la caisse.
    const porteFile = b.source.includes(TEMOINS_CAISSE.positifBase)
    if (porteFile) {
      for (const r of routesCaisse(b.source)) {
        const e = routes.get(r.route) || { route: r.route, genres: new Set(), fichiers: new Set(), enfilee: r.enfilee }
        e.genres.add(r.genre)
        e.fichiers.add(b.fichier)
        routes.set(r.route, e)
      }
    }
    for (const db of magasinsIndexedDb(b.source)) magasins.push({ ...db, fichier: b.fichier })
    for (const c of clesLocalStorage(b.source)) cles.push({ ...c, fichier: b.fichier })
    const p = politiqueRejeu(b.source)
    if (p.rejet.length || p.seuilBloque !== null) politiques.push({ fichier: b.fichier, ...p })
    for (const c of cheminsHote(b.source)) chemins.add(c)

    if (items.length || proseTotal) {
      parFichier.push({ fichier: b.fichier, foyer: f, total: items.length + proseTotal, items, prose })
    }
  }

  return {
    parOrigine,
    parFoyer,
    parJeton,
    parFichier,
    magasins,
    cles,
    politiques,
    chemins: [...chemins],
    routes: [...routes.values()].map((r) => ({ ...r, genres: [...r.genres], fichiers: [...r.fichiers] })),
  }
}

/** Présence brute d'un jeton — sert aux témoins, jamais au relevé. */
export function presence(bundles, jeton) {
  const j = String(jeton).toLowerCase()
  return bundles.some((b) => b.source.toLowerCase().includes(j))
}

/** Présence de prose — après décodage, sinon le témoin ment (lesson §19.4). */
export function presenceProse(bundles, jeton) {
  return bundles.some((b) => proseCaisse(b.source).some((p) => p.jeton === jeton))
}

/* ---------------------------------------------------------------------------
   8. Calibration. Chaque témoin doit répondre ce qu'on attend de lui — y
      compris quand la réponse attendue est « rien ».
   ------------------------------------------------------------------------ */

export function calibrer({ bundles, releve }) {
  const ecarts = []
  const la = (j) => presence(bundles, j)

  const positifs = [
    TEMOINS_CAISSE.positifBase,
    TEMOINS_CAISSE.positifMagasin,
    TEMOINS_CAISSE.positifCleLs,
    TEMOINS_CAISSE.positifIdempotence,
    TEMOINS_CAISSE.positifRoute,
  ]
  for (const p of positifs) if (!la(p)) ecarts.push('témoin positif ABSENT : ' + p)

  for (const p of [TEMOINS_CAISSE.positifProse, TEMOINS_CAISSE.positifSolde])
    if (!presenceProse(bundles, p)) ecarts.push('témoin de prose ABSENT après décodage : ' + p)

  for (const n of [TEMOINS_CAISSE.negatif, TEMOINS_CAISSE.negatif2, TEMOINS_CAISSE.negatif3, TEMOINS_CAISSE.negatifMagasin])
    if (la(n)) ecarts.push('témoin négatif SORTI : ' + n)

  // Le leurre : `localStorage` existe dans auth-js, et ne doit produire AUCUN
  // magasin de file ni prose de caisse. C'est le test que la doc cite.
  const leurre = bundles.filter((b) => foyer(b.source, b.fichier) === 'supabase auth-js')
  if (la(TEMOINS_CAISSE.leurreFoyer) && !leurre.length) ecarts.push('leurre auth-js annoncé mais introuvable')
  for (const b of leurre) {
    if (magasinsIndexedDb(b.source).some((x) => x.nom === TEMOINS_CAISSE.positifBase))
      ecarts.push('leurre auth-js attribué à la base de la caisse : ' + b.fichier)
    if (proseCaisse(b.source).length) ecarts.push('leurre auth-js porteur de prose de caisse : ' + b.fichier)
  }

  // Une file sans magasin serait une croyance : la mécanique doit être LUE.
  const aLeMagasin = releve.magasins.some((m) => (m.magasins || []).some((x) => x.nom === TEMOINS_CAISSE.positifMagasin))
  if (!aLeMagasin) ecarts.push('magasin de file introuvable — la mécanique n’est pas mesurée')
  if (!releve.politiques.some((p) => p.rejet.length)) ecarts.push('politique de rejeu introuvable')
  if (!releve.routes.some((r) => r.enfilee)) ecarts.push('aucune route rejouée identifiée')

  return ecarts
}

