/* ============================================================================
   REA Fidelix — A5 : Fidelia AI, ce qui est réellement dans le corpus.

   Ce module ne fait AUCUNE requête et ne lit aucun fichier : il ne reçoit que
   des chaînes déjà capturées. Le CLI `relever-fidelia.mjs` l'alimente.

   Le sujet de l'étape est un partage d'origines. « Fidelia AI » apparaît dans
   un `aria-label`, `/api/fidelia` dans un `fetch`, `/conseiller` dans une
   liste d'exclusion : trois occurrences du même sujet, trois natures qui ne
   se remplacent pas. Un libellé d'interface n'est pas un contrat.

   Convention héritée d'A4 (lesson §20.2) : on ne matche jamais les octets du
   fichier, on matche le texte DÉCODÉ (`\xe9` est une échappement JavaScript,
   donc UN caractère, pas un octet UTF-8).
   ========================================================================== */

import { argumentDe, litterauxApi } from './contrats.mjs'
import { chaineContenant, genreAppel } from './wallet.mjs'
import { decoderEchappements, releverJetons } from './caisse.mjs'

// Ré-export : le décodeur d'échappements est la règle de lecture du corpus
// (§20.2), et le CLI comme les tests en ont besoin au même titre que ce module.
export { decoderEchappements }

/* ---------------------------------------------------------------------------
   1. Témoins. Chacun doit répondre ce qu'on attend de lui — y compris quand
      la réponse attendue est « rien ». « Fidelia AI » est un LIBELLÉ : s'il
      ressort comme contrat, le classement est faux, même si le compte est bon.
   ------------------------------------------------------------------------ */

export const TEMOINS_FIDELIA = Object.freeze({
  // Contrats : lus dans un `fetch(...)`, et recoupés par le réseau observé.
  positifContrat: '/api/fidelia',
  positifResume: '/api/fidelia?resume=1',
  // Magasins locaux : deux clés nommées, un préfixe de fil.
  positifCleCoin: 'fidelia_coin',
  positifCleResume: 'fidelia_resume',
  positifFil: 'fidelix_conseiller_',
  // Route jamais capturée, mais nommée dans une liste d'exclusion.
  positifRouteMasquee: '/conseiller',
  // Champ de sortie : consommé par le bundle ET présent dans la réponse.
  positifChamp: 'donneesInsuffisantes',
  // LEURRE : présent 14 fois dans les pages capturées, et pas un contrat.
  leurreLibelle: 'Fidelia AI',
  // Négatifs : une variante plausible qui n'existe nulle part.
  negatifFlux: '/api/fidelia/stream',
  negatifChat: '/api/fidelia?chat=',
  negatifPrompt: 'systemPrompt',
  negatifOpenai: 'openai',
  // Témoin de décodage, à réponse connue d'avance (§20.2) : la longueur DOIT
  // diminuer, puisque quatre caractères source deviennent un seul.
  temoinDecodage: 'R\\xe9essayez',
})

/* ---------------------------------------------------------------------------
   2. Jetons relevés, et le rôle de chacun. Le rôle est une DÉCLARATION : c'est
      ce qui interdit à un libellé de devenir un contrat par accident.
   ------------------------------------------------------------------------ */

export const ROLES_FIDELIA = Object.freeze({
  '/api/fidelia?resume=1': 'contrat-reseau',
  '/api/fidelia': 'contrat-reseau',
  fidelia_coin: 'magasin-local',
  fidelia_resume: 'magasin-local',
  fidelix_conseiller_: 'magasin-local',
  '/conseiller': 'route-navigation',
  donneesInsuffisantes: 'champ-sortie',
  synthese: 'champ-sortie',
  urgents: 'champ-sortie',
  'Fidelia AI': 'libelle',
  'Ouvrir Fidelia AI': 'libelle',
  'Posez-moi une question': 'libelle',
  "Voir l'analyse complète": 'libelle',
})

/** L'ordre compte : le plus long d'abord, pour que `releverJetons` ne double pas. */
export const JETONS_FIDELIA = Object.freeze([
  '/api/fidelia?resume=1',
  '/api/fidelia',
  'fidelix_conseiller_',
  'fidelia_coin',
  'fidelia_resume',
  '/conseiller',
  'donneesInsuffisantes',
  'Ouvrir Fidelia AI',
  'Fidelia AI',
  'Posez-moi une question',
  "Voir l'analyse complète",
  'synthese',
  'urgents',
])

export const ORIGINE_DE_ROLE = Object.freeze({
  'contrat-reseau': 'contrat réseau',
  'magasin-local': 'magasin local',
  'route-navigation': 'route de navigation',
  'route-exclue': 'route exclue (garde-fou)',
  'champ-sortie': 'champ de sortie',
  libelle: "libellé d'interface",
  // Un contrat CITÉ (dans un manifeste, un rapport, une liste de cibles) n'est
  // pas un contrat ÉMIS. Les confondre gonfle le décompte d'un facteur 14.
  'cite-non-emis': 'cité, non émis',
  prose: 'prose',
})

/* ---------------------------------------------------------------------------
   3. Marqueurs d'un client LLM. Deux familles, et il faut les séparer : une
      API de flux (`getReader`, `text/event-stream`) sert aussi aux
      notifications ; un marqueur de MODÈLE (`systemPrompt`, `openai`, …) ne
      sert qu'à un LLM. Les confondre ferait dire « il y a du LLM » à un
      système de notifications.

      Aucun marqueur de modèle n'est présent dans les bundles : c'est une
      ABSENCE mesurée, pas une opinion. Ce que ça ne prouve pas : qu'aucun
      modèle ne tourne côté serveur — cela n'est pas observable d'ici.
   ------------------------------------------------------------------------ */

export const MARQUEURS_MODELE = Object.freeze([
  'systemPrompt',
  'system_prompt',
  'role:"system"',
  "role:'system'",
  'openai',
  'anthropic',
  'chat/completions',
  'gpt-',
  'claude-',
  'temperature',
  'max_tokens',
])

export const MARQUEURS_FLUX = Object.freeze(['text/event-stream', 'getReader()'])

/** Conservé pour compatibilité de lecture : la liste entière, modèle d'abord. */
export const MARQUEURS_LLM = Object.freeze([...MARQUEURS_MODELE, ...MARQUEURS_FLUX])

/* ---------------------------------------------------------------------------
   4. Relevé et classement. Un compte sans origine ne dit rien : « Fidelia AI
      apparaît 14 fois » est vrai des pages et faux du contrat.
   ------------------------------------------------------------------------ */

export function releverFidelia(source) {
  return releverJetons(source, JETONS_FIDELIA)
}

/**
 * Si la chaîne contenant `i` est un élément d'un tableau littéral de chaînes,
 * rend ce tableau. Sert à distinguer `href:"/conseiller"` (navigation) de
 * `v=["/scan","/conseiller",…]` (liste d'exclusion) : c'est le même jeton,
 * ce n'est pas le même rôle, et le confondre ferait passer une garde pour un
 * lien.
 */
export function tableauContenant(source, i) {
  const chaine = chaineContenant(source, i)
  if (!chaine) return null
  // Reculer jusqu'au `[` ouvrant : on saute les espaces, les virgules, et les
  // chaînes précédentes du même tableau. Sans cette boucle, seul le PREMIER
  // élément (`/scan`) était reconnu, et `/conseiller` passait pour un lien.
  let k = chaine.debut - 1
  for (;;) {
    while (k >= 0 && /[\s,]/.test(source[k])) k--
    if (k >= 0 && source[k] === '"') {
      let j = k - 1
      while (j >= 0 && source[j] !== '"') j--
      if (j < 0) return null
      k = j - 1
      continue
    }
    break
  }
  if (source[k] !== '[') return null
  const debut = k
  const fenetre = source.slice(debut, Math.min(source.length, debut + 400))
  const fin = fenetre.indexOf(']')
  if (fin === -1) return null
  const corps = fenetre.slice(1, fin)
  // Un tableau simple : des chaînes séparées par des virgules, rien d'autre.
  if (!/^[^[\]{}()]*$/.test(corps)) return null
  const elements = [...corps.matchAll(/"([^"]*)"/g)].map((x) => x[1])
  if (!elements.length) return null
  return { elements, debut, fin: debut + fin }
}

/**
 * Origine d'UNE occurrence, à sa position.
 *
 * Trois règles, dans cet ordre, et la première est la plus importante :
 *   1. un libellé déclaré reste un libellé, quel que soit son contexte ;
 *   2. une URL argument direct de `fetch` est un contrat réseau ;
 *   3. une URL en `href` est une route de navigation ; élément d'un tableau de
 *      chemins commençant par `/`, c'est une route exclue (garde-fou).
 * Ce qui ne tombe dans aucun cas est rendu `prose` : l'inconnu ne s'invente pas.
 *
 * MESURÉ en écrivant l'instrument : les offsets rendus par `litterauxApi`
 * tombent APRÈS le guillemet ouvrant. Comparer `source.slice(i-48, i)` à
 * `fetch(` échouait donc systématiquement, et les deux contrats sortaient en
 * `prose`. On raisonne désormais sur la position du guillemet (`chaine.debut`).
 */
export function classerOrigine(source, i, jeton) {
  const role = ROLES_FIDELIA[jeton] || 'prose'
  if (role === 'libelle') return { origine: ORIGINE_DE_ROLE.libelle, role, contexte: 'chaîne rendue' }

  const chaine = chaineContenant(source, i)
  const debut = chaine ? chaine.debut : i
  const avant = source.slice(Math.max(0, debut - 48), debut)

  const enAppel = /fetch\s*\(\s*$/.test(avant) || /fetch\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*$/.test(avant)
  const enHref = /(?:href|push|replace)\s*[:=]\s*$/.test(avant)

  if (role === 'contrat-reseau') {
    if (enAppel) return { origine: ORIGINE_DE_ROLE['contrat-reseau'], role, contexte: 'argument de fetch' }
    return { origine: ORIGINE_DE_ROLE['cite-non-emis'], role: 'cite', contexte: 'littéral non appelé' }
  }
  if (role === 'route-navigation') {
    const tableau = tableauContenant(source, i)
    if (tableau && tableau.elements.every((e) => e.startsWith('/')))
      return { origine: ORIGINE_DE_ROLE['route-exclue'], role: 'route-exclue', contexte: "liste d'exclusion" }
    if (enHref) return { origine: ORIGINE_DE_ROLE['route-navigation'], role, contexte: 'href' }
    return { origine: ORIGINE_DE_ROLE['route-navigation'], role, contexte: 'littéral de route' }
  }
  if (role === 'champ-sortie') {
    const dansChaine = chaine !== null
    return {
      origine: ORIGINE_DE_ROLE['champ-sortie'],
      role,
      contexte: dansChaine ? 'clé JSON' : 'accès propriété',
    }
  }
  return { origine: ORIGINE_DE_ROLE[role] || ORIGINE_DE_ROLE.prose, role }
}

/* ---------------------------------------------------------------------------
   5. Les appels. « GET » n'est pas affirmé, il est LU : `fetch(url)` avec un
      seul argument n'a ni méthode, ni en-têtes, ni corps. C'est la preuve
      qu'aucune entrée ne part — donc qu'aucun prompt ne peut être injecté.
   ------------------------------------------------------------------------ */

export function appelsFidelia(source) {
  const sortie = []
  for (const { url, offset } of litterauxApi(source)) {
    if (!url.startsWith('/api/fidelia')) continue
    // La parenthèse ouvrante de l'appel est celle qui précède la chaîne, via
    // `fetch(`. Si elle manque, le littéral n'est pas un appel.
    const iParen = source.lastIndexOf('(', offset)
    const entete = iParen >= 0 ? source.slice(Math.max(0, iParen - 6), iParen) : ''
    if (!/fetch\s*$/.test(entete)) {
      sortie.push({ url, appele: false, genre: genreAppel(source, offset), argument: null, options: null })
      continue
    }
    const premier = argumentDe(source, iParen, 0)
    const second = argumentDe(source, iParen, 1)
    const mMethod = second ? /method\s*:\s*["'](\w+)["']/.exec(second.texte) : null
    sortie.push({
      url,
      appele: true,
      genre: genreAppel(source, offset),
      argument: premier ? premier.texte : null,
      // Conséquence directe, et c'est le garde-fou : sans second argument, il
      // n'y a pas de `method` (donc GET par défaut) et pas de `body`.
      options: second ? second.texte.slice(0, 200) : null,
      methodeDeclaree: mMethod ? mMethod[1] : null,
      corpsDeclare: second ? /body\s*:/.test(second.texte) : false,
      entetesDeclarees: second ? /headers\s*:/.test(second.texte) : false,
    })
  }
  return sortie
}

/* ---------------------------------------------------------------------------
   6. Forme de la sortie — lue sur les OCTETS de la sonde, pas sur le code.
      Le code dit quels champs sont CONSOMMÉS ; la sonde dit lesquels existent.
      Les deux ne coïncident pas toujours, et c'est la différence qui compte.
   ------------------------------------------------------------------------ */

const typeDe = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return typeof v
}

export function formeSortie(objet, octets = null) {
  if (objet === null || typeof objet !== 'object' || Array.isArray(objet)) {
    return { type: typeDe(objet), champs: [], octets, json: false }
  }
  const champs = Object.entries(objet).map(([nom, valeur]) => {
    const type = typeDe(valeur)
    const champ = { nom, type }
    if (type === 'array') champ.longueur = valeur.length
    if (type === 'object') champ.cles = Object.keys(valeur)
    if (type === 'string') champ.longueur = valeur.length
    if (type === 'number' || type === 'boolean') champ.valeur = valeur
    return champ
  })
  return { type: 'object', champs, octets, json: true }
}

/**
 * Cohérence de la grille de questions : les dix clés doivent être les mêmes
 * dans `libelles`, `reponses` et `rebonds`, l'ouverture doit être un sous-
 * ensemble, et chaque rebond doit désigner une question existante et jamais
 * elle-même. Une grille qui ne ferme pas casse l'interface au premier clic.
 */
export function grilleQuestions(reponse) {
  const libelles = reponse && typeof reponse.libelles === 'object' && reponse.libelles ? reponse.libelles : {}
  const reponses = reponse && typeof reponse.reponses === 'object' && reponse.reponses ? reponse.reponses : {}
  const rebonds = reponse && typeof reponse.rebonds === 'object' && reponse.rebonds ? reponse.rebonds : {}
  const ouverture = Array.isArray(reponse && reponse.ouverture) ? reponse.ouverture : []

  const clesL = Object.keys(libelles).sort()
  const clesR = Object.keys(reponses).sort()
  const clesB = Object.keys(rebonds).sort()
  const ecarts = []

  const egal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  if (clesL.length === 0) ecarts.push('aucun libellé')
  if (!egal(clesL, clesR)) ecarts.push('clés libelles different des clés reponses')
  if (!egal(clesL, clesB)) ecarts.push('clés libelles different des clés rebonds')

  for (const k of ouverture) if (!clesL.includes(k)) ecarts.push(`ouverture hors grille : ${k}`)
  for (const [k, cibles] of Object.entries(rebonds)) {
    if (!Array.isArray(cibles)) {
      ecarts.push(`rebonds.${k} n'est pas un tableau`)
      continue
    }
    for (const c of cibles) {
      if (!clesL.includes(c)) ecarts.push(`rebond hors grille : ${k} vers ${c}`)
      if (c === k) ecarts.push(`rebond sur soi-même : ${k}`)
    }
  }
  for (const [k, r] of Object.entries(reponses)) {
    if (!r || typeof r !== 'object') {
      ecarts.push(`reponses.${k} n'est pas un objet`)
      continue
    }
    if (!Array.isArray(r.paragraphes) || r.paragraphes.length === 0)
      ecarts.push(`reponses.${k}.paragraphes absent ou vide`)
    const a = r.action
    if (!a || typeof a !== 'object') ecarts.push(`reponses.${k}.action absent`)
    else {
      if (typeof a.libelle !== 'string' || !a.libelle) ecarts.push(`reponses.${k}.action.libelle absent`)
      if (typeof a.lien !== 'string' || !a.lien.startsWith('/')) ecarts.push(`reponses.${k}.action.lien non interne`)
    }
  }

  return {
    coherent: ecarts.length === 0,
    ecarts,
    stats: {
      questions: clesL.length,
      reponses: clesR.length,
      rebonds: clesB.length,
      ouverture: ouverture.length,
      liens: [...new Set(Object.values(reponses).map((r) => r && r.action && r.action.lien).filter(Boolean))],
    },
  }
}

/* ---------------------------------------------------------------------------
   7. Garde-fous. Chacun est une PRÉDICAT sur le source décodé, avec sa preuve.
      Aucun n'est « recommandé » : tous sont lus, ou déclarés absents.
   ------------------------------------------------------------------------ */

export const GARDE_FOUS = Object.freeze([
  { id: 'anti-re-appel', libelle: 'Aucun second appel si la synthèse est déjà là', motif: /if\(!N&&!S\)/ },
  { id: 'synthese-obligatoire', libelle: 'Une réponse sans `synthese` est traitée comme un échec', motif: /t\.synthese\)\?/ },
  { id: 'erreur-typee', libelle: "`error` n'est affiché que s'il est une chaîne", motif: /"string"==typeof/ },
  { id: 'message-reseau', libelle: 'Échec réseau couvert par un message dédié', motif: /Connexion interrompue/ },
  { id: 'gate-donnees-insuffisantes', libelle: 'Le Q&A est masqué si `donneesInsuffisantes`', motif: /!N\.donneesInsuffisantes&&/ },
  { id: 'urgents-type-nombre', libelle: "`urgents` ne compte que si c'est un nombre", motif: /"number"==typeof/ },
  { id: 'badge-vu', libelle: "Le badge s'éteint après ouverture (`vu`)", motif: /vu:!0/ },
  {
    id: 'routes-masquees',
    libelle: 'Le bouton est masqué sur /scan, /conseiller, /branding',
    motif: /v=\["\/scan","\/conseiller","\/branding"\]/,
  },
  { id: 'dedup-questions', libelle: 'Une question déjà posée disparaît des choix', motif: /!p\.includes\(e\)/ },
  { id: 'historique-filtre', libelle: 'Un id inconnu en stockage est ignoré', motif: /filter\(e=>e in s\)/ },
  { id: 'dialogue-aria', libelle: 'Panneau exposé comme `dialog` avec libellé', motif: /role:"dialog","aria-label":"Fidelia AI"/ },
])

export function gardeFousSource(source) {
  const texte = decoderEchappements(source)
  const sortie = GARDE_FOUS.map(({ id, libelle, motif }) => ({ id, libelle, present: motif.test(texte) }))
  // Le TTL n'est pas un booléen : c'est 18e5, et 18e5 vaut 1 800 000 ms. On
  // rend le nombre pour que « 30 minutes » soit une conversion, pas une
  // reprise du vocabulaire de l'interface.
  const ttl = /Date\.now\(\)-t\.t<(\d+(?:e\d+)?)/.exec(texte)
  sortie.push({
    id: 'ttl-resume',
    libelle: 'Le résumé est réutilisé moins de 30 min',
    present: Boolean(ttl),
    ttlMs: ttl ? Number(ttl[1]) : null,
  })
  return sortie
}

/** Comptage des marqueurs : rend les fichiers, pas un booléen (on veut voir). */
export function marqueursLlm(fichiers) {
  const chercher = (liste) =>
    liste.map((m) => ({
      marqueur: m,
      modele: MARQUEURS_MODELE.includes(m),
      fichiers: fichiers.filter((f) => f.source.toLowerCase().includes(m.toLowerCase())).map((f) => f.fichier || f.chemin),
    }))
  return { modele: chercher(MARQUEURS_MODELE), flux: chercher(MARQUEURS_FLUX) }
}

/* ---------------------------------------------------------------------------
   8. Provenance du FICHIER, second axe indépendant du rôle. Un rapport de nos
      outils cite la cible ; il n'est pas la cible. Compter les deux ensemble
      ferait croire à six contrats là où il y en a deux.
   ------------------------------------------------------------------------ */

export function familleDeFichier(chemin) {
  const p = String(chemin).replace(/\\/g, '/')
  if (/\/raw\/assets\//.test(p)) return 'bundle'
  if (/\/raw\/pages\//.test(p)) return 'page capturée'
  if (/\/raw\/sondes\//.test(p)) return 'sonde HTTP'
  if (/\.reseau\.json$/.test(p)) return 'réseau observé'
  if (/\/rendu\/[^/]+\.html$/.test(p)) return 'rendu de page'
  if (/(^|\/)(cibles|decouverte)[^/]*\.json$/.test(p)) return 'artefact de nos outils'
  if (/(^|\/)(manifeste|rendu)\.json$/.test(p)) return 'manifeste de capture'
  if (/(^|\/)(contrats|mesure|releve)[^/]*\.(json|txt)$/.test(p)) return 'rapport de nos outils'
  return 'autre'
}

/**
 * Un relevé par fichier, puis agrégé sur DEUX axes — origine du rôle et
 * famille du fichier. C'est la table qui répond à « est-ce un contrat ? ».
 */
export function classerCorpus(fichiers) {
  const parFichier = []
  const parOrigine = {}
  const parFamille = {}
  const parJeton = {}
  const porteursContrat = new Set()

  for (const f of fichiers) {
    const famille = f.famille || familleDeFichier(f.chemin || f.fichier)
    const items = releverFidelia(f.source).map(({ jeton, debut }) => ({
      jeton,
      ...classerOrigine(f.source, debut, jeton),
    }))
    for (const it of items) {
      parOrigine[it.origine] = (parOrigine[it.origine] || 0) + 1
      parFamille[famille] = (parFamille[famille] || 0) + 1
      const e = parJeton[it.jeton] || { total: 0, origines: {}, familles: {} }
      e.total += 1
      e.origines[it.origine] = (e.origines[it.origine] || 0) + 1
      e.familles[famille] = (e.familles[famille] || 0) + 1
      parJeton[it.jeton] = e
      // Le porteur est compté par NOM DE FICHIER, pas par chemin : le même
      // chunk servi dans trois captures est UN propriétaire et trois copies.
      // Compter les chemins donnait « 3 porteurs », et faisait échouer la
      // calibration sur un artefact de rangement.
      if (it.origine === ORIGINE_DE_ROLE['contrat-reseau'])
        porteursContrat.add(String(f.chemin || f.fichier).split('/').pop())
    }
    if (items.length) parFichier.push({ fichier: f.chemin || f.fichier, famille, items })
  }
  return { parFichier, parOrigine, parFamille, parJeton, porteursContrat: [...porteursContrat] }
}

/** Présence brute — sert aux témoins, jamais au relevé. */
export function presence(fichiers, jeton) {
  const j = String(jeton).toLowerCase()
  return fichiers.some((f) => f.source.toLowerCase().includes(j))
}

/* ---------------------------------------------------------------------------
   9. Calibration. Trois familles de témoins :
      — positifs : ce qui doit être trouvé, à l'endroit annoncé ;
      — leurre   : ce qui doit être trouvé MAIS jamais classé comme contrat ;
      — négatifs : ce qui ne doit pas exister.
      Plus une vérification CROISÉE : une prédiction tirée du code, vérifiée
      sur les captures. C'est elle qui distingue un compteur juste d'un
      compteur qui compte n'importe quoi.
   ------------------------------------------------------------------------ */

export function calibrer({ bundles = [], pages = [], releve = null, appels = [], reponses = [] }) {
  const ecarts = []
  const la = (j) => presence(bundles, j)
  const T = TEMOINS_FIDELIA

  // — positifs dans les bundles
  for (const p of [
    T.positifContrat,
    T.positifResume,
    T.positifCleCoin,
    T.positifCleResume,
    T.positifFil,
    T.positifRouteMasquee,
    T.positifChamp,
  ])
    if (!la(p)) ecarts.push('témoin positif ABSENT des bundles : ' + p)

  // — positifs dans les réponses (le champ n'a de sens que côté sortie)
  const champsSortie = reponses.flatMap((r) => formeSortie(r.objet).champs.map((c) => c.nom))
  if (reponses.length && !champsSortie.includes(T.positifChamp))
    ecarts.push('champ de sortie ABSENT des réponses : ' + T.positifChamp)

  // — le leurre : présent, et JAMAIS contrat.
  //   Nuance mesurée en écrivant ce test : `classerOrigine` APPLIQUE la
  //   déclaration (« un libellé reste un libellé »), il ne la vérifie pas. Un
  //   garde qui ne peut pas se déclencher ne prouve rien. On vérifie donc la
  //   seule chose qui puisse contredire la déclaration : que le libellé
  //   apparaisse en ARGUMENT DE FETCH. Si c'est le cas, c'est notre table de
  //   rôles qui est fausse, et la calibration doit le dire.
  if (!la(T.leurreLibelle)) ecarts.push('leurre introuvable — le test ne prouve rien')
  for (const f of [...bundles, ...pages]) {
    for (const { jeton, debut } of releverFidelia(f.source)) {
      if (jeton !== T.leurreLibelle) continue
      const chaine = chaineContenant(f.source, debut)
      const avant = chaine ? f.source.slice(Math.max(0, chaine.debut - 48), chaine.debut) : ''
      if (/fetch\s*\(\s*$/.test(avant))
        ecarts.push(`libellé en argument de fetch — déclaration fausse : ${f.fichier || f.chemin}`)
      const { origine } = classerOrigine(f.source, debut, jeton)
      if (origine === ORIGINE_DE_ROLE['contrat-reseau'])
        ecarts.push(`libellé classé contrat réseau : ${f.fichier || f.chemin}`)
    }
  }

  // — négatifs
  for (const n of [T.negatifFlux, T.negatifChat]) if (la(n)) ecarts.push('témoin négatif SORTI : ' + n)

  // — décodage, à réponse connue d'avance (§20.2)
  const decode = decoderEchappements(T.temoinDecodage)
  if (decode !== 'Réessayez') ecarts.push(`décodage faux : « ${decode} » au lieu de « Réessayez »`)
  if (decode.length !== T.temoinDecodage.length - 3)
    ecarts.push(`décodage : longueur ${decode.length} au lieu de ${T.temoinDecodage.length - 3}`)
  if ([...decode].filter((c) => c === 'é').length !== 1) ecarts.push('décodage : l’accent ne fait pas UN caractère')

  // — un seul porteur du contrat, sinon « le contrat » n'a pas de propriétaire
  if (releve) {
    if (releve.porteursContrat.length !== 1)
      ecarts.push(`porteurs du contrat : ${releve.porteursContrat.length} (attendu 1)`)
    const r = releve.parJeton[T.positifRouteMasquee]
    if (r && !Object.keys(r.origines).includes(ORIGINE_DE_ROLE['route-exclue']))
      ecarts.push('/conseiller non reconnue comme route exclue')
  }

  // — aucun appel ne déclare de corps : c'est l'absence de canal d'entrée
  for (const a of appels)
    if (a.appele && (a.corpsDeclare || a.methodeDeclaree === 'POST')) ecarts.push(`appel avec entrée déclarée : ${a.url}`)

  // — croisement code vers capture : `donneesInsuffisantes` vrai masque le Q&A
  const insuffisant = reponses.find((r) => r.objet && r.objet.donneesInsuffisantes === true)
  if (insuffisant && pages.length) {
    const porteur = pages.filter((p) => p.source.includes('Posez-moi une question'))
    if (porteur.length)
      ecarts.push(`Q&A rendu malgré donneesInsuffisantes : ${porteur.map((p) => p.fichier || p.chemin).join(', ')}`)
  }

  return ecarts
}
