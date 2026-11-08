/* ============================================================================
   REA Fidelix — A1 : briques PURES de la mesure du modèle de données.

   Aucune I/O, aucun réseau ici : tout ce qui décide est testable hors ligne
   (`tools/rea/tests/modele.test.mjs`). La CLI `mesurer-modele.mjs` ne fait
   que transporter des octets.

   Règle de fond (lesson-learned §15) : on mesure des NOMS et des TYPES, jamais
   des valeurs. Une colonne s'appelle `solde` et contient un nombre ; on ne
   recopie ni le nombre, ni l'identifiant du client qui le porte.
   ========================================================================== */

/** Cookies Supabase : `sb-<ref>-auth-token`, découpé `.0`, `.1`… au-delà de 3180 o. */
export const RE_COOKIE_AUTH = /^sb-([a-z0-9]+)-auth-token(?:\.(\d+))?$/i

/**
 * Décode la valeur d'un cookie d'auth Supabase.
 *
 * Trois formes observées dans la nature :
 *   - `base64-<base64url>`  (@supabase/ssr ≥ 0.5, le cas de ce projet)
 *   - JSON en clair        (anciens clients, ou après découpage déjà décodé)
 *   - valeur URL-encodée   (dépôt manuel par DevTools)
 */
export function decodervaleurCookie(valeur) {
  const v = String(valeur ?? '').trim()
  if (!v) return ''
  if (v.startsWith('base64-')) {
    const b64 = v.slice(7).replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(b64, 'base64').toString('utf8')
  }
  if (v.startsWith('{') || v.startsWith('[')) return v
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/**
 * Recompose le jeton d'auth à partir des cookies d'un profil.
 * Renvoie `{ ref, valeur }` — `valeur` est le JSON décodé, ou `null`.
 * Ne journalise jamais la valeur : l'appelant décide, et ne l'affiche pas.
 */
export function jetonDepuisCookies(cookies = []) {
  const parts = []
  for (const c of cookies) {
    const m = RE_COOKIE_AUTH.exec(String(c.name || ''))
    if (m) parts.push({ ref: m[1].toLowerCase(), index: m[2] === undefined ? 0 : Number(m[2]), value: c.value })
  }
  if (!parts.length) return { ref: null, valeur: null }
  // Un seul projet Supabase par profil : on prend la référence du premier cookie.
  const ref = parts[0].ref
  const duProjet = parts.filter((p) => p.ref === ref).sort((a, b) => a.index - b.index)
  const brut = duProjet.map((p) => p.value).join('')
  return { ref, valeur: decodervaleurCookie(brut) }
}

/** Extrait l'`access_token` d'un JSON de session Supabase (objet ou tableau). */
export function accessTokenDepuisSession(valeur) {
  if (!valeur) return null
  let data
  try {
    data = JSON.parse(valeur)
  } catch {
    return null
  }
  const s = Array.isArray(data) ? data[0] : data
  const jeton = s && (s.access_token || (s.currentSession && s.currentSession.access_token))
  return typeof jeton === 'string' && jeton.split('.').length === 3 ? jeton : null
}

/** Décodage SANS VÉRIFICATION de la charge utile d'un JWT (lecture seule). */
export function chargeJwt(jeton) {
  if (typeof jeton !== 'string') return null
  const parts = jeton.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** Type JSON d'une valeur de cellule — jamais la valeur elle-même. */
export function typeValeur(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v // string | boolean
}

/**
 * Colonnes RÉELLEMENT renvoyées par PostgREST : union des clés de toutes les
 * lignes échantillonnées, avec les types observés et la nullabilité constatée.
 * Aucune valeur n'est conservée.
 */
export function colonnesObservees(lignes = []) {
  const parNom = new Map()
  let n = 0
  for (const ligne of lignes) {
    if (!ligne || typeof ligne !== 'object' || Array.isArray(ligne)) continue
    n += 1
    for (const [nom, valeur] of Object.entries(ligne)) {
      const c = parNom.get(nom) || { nom, types: new Set(), nulls: 0, presents: 0 }
      c.presents += 1
      c.types.add(typeValeur(valeur))
      if (valeur === null) c.nulls += 1
      parNom.set(nom, c)
    }
  }
  return [...parNom.values()].map((c) => ({
    nom: c.nom,
    types: [...c.types].sort(),
    nullable: c.nulls > 0,
    presents: c.presents,
    lignes: n,
  }))
}

/** Lit « 0-2/57 » → { debut, fin, total } ; une plage vide (« étoile/0 ») donne total = 0. */
export function lireContentRange(valeur) {
  const v = String(valeur || '').trim()
  const vide = /^\*\/(\d+|\*)$/.exec(v)
  if (vide) return { debut: null, fin: null, total: vide[1] === '*' ? null : Number(vide[1]) }
  const m = /^(\d+)-(\d+)\/(\d+|\*)$/.exec(v)
  if (!m) return null
  return { debut: Number(m[1]), fin: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) }
}

/**
 * Résume une spécification OpenAPI 2.0 servie par PostgREST.
 * - `paths['/<table>']` → table exposée AU RÔLE COURANT ;
 * - `paths['/rpc/<fonction>']` → fonction exposée, `POST` uniquement ;
 * - `definitions[<nom>]` → colonnes déclarées (type, format, description).
 *
 * Une table absente de `paths` n'est pas « inexistante » : elle n'est pas
 * exposée à ce rôle. La distinction est faite par l'appelant, pas devinée ici.
 */
export function resumerOpenapi(spec = {}) {
  const defs = spec.definitions || {}
  const paths = spec.paths || {}
  const tables = []
  const rpc = []

  for (const [route, item] of Object.entries(paths)) {
    const nom = route.replace(/^\/rpc\//, '').replace(/^\//, '')
    const methodes = Object.keys(item || {})
      .filter((m) => m !== 'parameters')
      .map((m) => m.toUpperCase())
      .sort()

    if (route.startsWith('/rpc/')) {
      const post = (item && item.post) || {}
      const body = (post.parameters || []).find((p) => p && p.in === 'body')
      const schema = (body && body.schema) || {}
      const ref = schema.$ref ? String(schema.$ref).replace(/^#\/definitions\//, '') : null
      const proprietes = (ref && defs[ref] && defs[ref].properties) || schema.properties || {}
      rpc.push({
        nom,
        methodes,
        corps: ref,
        arguments: Object.entries(proprietes).map(([n, p]) => ({
          nom: n,
          type: (p && (p.type || p.format)) || 'inconnu',
          format: (p && p.format) || null,
          description: (p && p.description) || null,
        })),
      })
      continue
    }

    const def = defs[nom] || {}
    tables.push({
      nom,
      methodes,
      colonnes: Object.entries(def.properties || {}).map(([n, p]) => ({
        nom: n,
        type: (p && (p.type || p.format)) || 'inconnu',
        format: (p && p.format) || null,
        description: (p && p.description) || null,
        nullable: Boolean(p && (p.nullable || (Array.isArray(p.enum) && p.enum.includes(null)))),
      })),
    })
  }

  return {
    tables: tables.sort((a, b) => a.nom.localeCompare(b.nom)),
    rpc: rpc.sort((a, b) => a.nom.localeCompare(b.nom)),
  }
}

/** Marque lisible d'une colonne : observée, déclarée, ou les deux. */
export function statutColonne(observee, declaree) {
  if (observee && declaree) return 'observée + déclarée'
  if (observee) return 'observée seule'
  if (declaree) return 'déclarée seule (0 ligne renvoyée)'
  return 'inconnue'
}

/** Masque tout UUID d'un texte : une preuve peut être écrite sans identifiant client. */
export function masquerUuid(texte) {
  return String(texte || '').replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':uuid',
  )
}

/**
 * Verdict sur un lien de fiche client — la partie qui a menti une fois, donc
 * la partie testée. Règles, dans l'ordre :
 *   1. un dialogue visible ⇒ route interceptée (H2) ;
 *   2. fiche servie en GET direct + contraste (UUID nul 404, route inconnue 404)
 *      ⇒ la route EXISTE ; un 404 sur UUID synthétique ne dit rien d'elle (H1 réfutée) ;
 *   3. fiche servie sans contraste ⇒ à qualifier (prudence) ;
 *   4. page 404 même avec l'UUID réel ⇒ route non servie ;
 *   5. contenu identique à la liste ⇒ aucune vue de détail ;
 *   6. navigation sans contenu distinct ⇒ à qualifier.
 */
export function classerLien({ dialogues = 0, direct = null, contrastes = null, page404 = false, memeContenuListe = false, navigation = false } = {}) {
  const c = contrastes || {}
  const fiche = Boolean(direct && direct.statut === 200 && (direct.liens || 0) > 0)
  const contrasteNet = Boolean(
    c.uuidNul && c.uuidNul.statut === 404 && c.routeInconnue && c.routeInconnue.statut === 404,
  )

  if (dialogues > 0) {
    return "H2 confirmée — un dialogue s'ouvre, la route est interceptée côté client"
  }
  if (fiche && contrasteNet) {
    return (
      "H1 RÉFUTÉE — la route existe : le clic rend une fiche ET le GET direct avec l'UUID réel " +
      `répond 200 (${direct.octets} o, ${direct.liens} liens), tandis que l'UUID nul ` +
      'et une route inconnue répondent 404. Le 404 de S3 qualifiait « client inconnu », pas « route absente ».'
    )
  }
  if (fiche) {
    return `route servie en direct (HTTP 200, ${direct.octets} o) — contraste incomplet : à qualifier`
  }
  if (page404) return '404 même avec l\'UUID réel : la route n\'est pas servie'
  if (memeContenuListe) return 'le clic affiche la LISTE Clients : aucune vue de détail'
  if (navigation) return 'navigation sans contenu distinct : à qualifier'
  return 'aucune navigation, aucun dialogue : le clic est sans effet observable'
}
