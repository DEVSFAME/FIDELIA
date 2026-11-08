/* ============================================================================
   REA Fidelix — R0 : état basal de la base de RECONSTRUCTION.

   Objet : répondre par la mesure, pas par la déclaration, à une seule question
   — « que contient réellement la base Supabase désignée par
   `FIDELIX/env.supabase.md` ? » — puis confronter ce contenu au modèle
   **mesuré** de la cible (A1, `Fidelix_Serveur.md` §8).

   Ce module est PUR (aucune I/O, aucun réseau). La CLI `sonder-base.mjs` fait
   les GET et écrit l'artefact. Tout ce qui décide est testé hors ligne
   (`tools/rea/tests/base.test.mjs`).

   Quatre pièges, hérités des cycles précédents et encodés ici :

   1. `401` n'est pas `403` n'est pas `404` (A1 §8.2). Un `403` `42501` prouve
      que la TABLE EXISTE et que le GRANT manque ; un `404` `PGRST205` prouve
      qu'elle N'EXISTE PAS. Les confondre inverse le fait.
   2. Une table **vide** ne dit rien de ses **colonnes**. A1 a refusé d'inventer
      celles de `automations`/`till_sessions` ; `comparerModele` refuse donc de
      les compter comme « manquantes » : l'état est porté par la donnée.
   3. Un **schéma lisible** n'est pas un **droit de lecture** : sur la cible,
      l'OpenAPI de PostgREST est fermé à tout rôle autre que `service_role`
      (A1 §8.1). Sa disponibilité ici est donc elle-même une mesure.
   4. Une sonde qui imprime une clé est une fuite (lesson §15). `aucunSecret`
      est un garde **falsifiable** : il reçoit les secrets réels et échoue s'ils
      apparaissent dans la sortie.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   0. Lecture de `env.supabase.md`
      Le fichier est en Markdown lisible par l'agent, pas en `.env` : les lignes
      sont de la forme `CLE : "valeur"`. On ne suppose ni l'ordre, ni les
      espaces, ni la présence des quatre clés.
   ------------------------------------------------------------------------ */

export const CLEFS = Object.freeze({
  id: 'ID',
  url: 'NEXT_PUBLIC_SUPABASE_URL',
  anon: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  service: 'SUPABASE_SERVICE_ROLE_KEY',
})

/** Clés sans lesquelles aucune sonde n'est possible. */
export const CLEFS_REQUISES = Object.freeze(['url', 'anon', 'service'])

/**
 * Lit un `env.supabase.md` et rend les quatre valeurs.
 * Lève si une clé requise manque : jamais de valeur par défaut — une URL
 * inventée produirait une mesure sur la mauvaise base.
 */
export function lireEnv(texte) {
  const brut = {}
  for (const ligne of String(texte ?? '').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*:\s*"?([^"\r\n]*)"?\s*$/.exec(ligne)
    if (m) brut[m[1]] = m[2].trim()
  }
  const env = {}
  for (const [role, cle] of Object.entries(CLEFS)) env[role] = brut[cle] || ''

  const absentes = CLEFS_REQUISES.filter((r) => !env[r])
  if (absentes.length) {
    throw new Error(
      `env.supabase.md incomplet : ${absentes.map((r) => CLEFS[r]).join(', ')} manquant(s)`,
    )
  }
  // L'`ID` du projet est facultatif, mais s'il est présent il doit concorder :
  // un identifiant et une URL qui se contredisent signalent un copier-coller
  // partiel — donc une sonde sur une base qui n'est pas celle qu'on croit.
  if (env.id && !env.url.includes(env.id)) {
    throw new Error(
      `incohérence : ID="${env.id}" absent de NEXT_PUBLIC_SUPABASE_URL — vérifier le fichier`,
    )
  }
  return env
}

/** Longueur d'un secret, jamais sa valeur : c'est ce qu'on peut journaliser. */
export function longueurSecrete(valeur) {
  return valeur ? `${String(valeur).length} o` : 'absent'
}

/**
 * Garde falsifiable : la sortie ne doit contenir AUCUN secret.
 * Deux contrôles indépendants, parce qu'un seul se trompe d'un côté —
 * la forme d'un JWT Supabase (`eyJ…`) et la présence littérale de chaque secret.
 */
export function aucunSecret(texte, secrets = []) {
  const s = String(texte ?? '')
  if (/eyJ[A-Za-z0-9_-]{10,}/.test(s)) return false
  return secrets.filter(Boolean).every((secret) => !s.includes(String(secret)))
}


/* ---------------------------------------------------------------------------
   1. Lecture de l'OpenAPI de PostgREST
      C'est la seule source qui dise quelles tables sont EXPOSÉES AU RÔLE qui
      interroge. Sur la cible elle répond 401 `Only the service_role API key can
      be used` ; ici elle répond 200 — l'écart est un fait, pas une commodité.
   ------------------------------------------------------------------------ */

/** Colonnes d'une définition OpenAPI, avec PK et FK lues dans la description. */
export function colonnesDe(definition = {}) {
  return Object.entries(definition.properties || {}).map(([nom, p]) => ({
    nom,
    type: p.type ?? null,
    format: p.format ?? null,
    maxLength: p.maxLength ?? null,
    pk: /This is a Primary Key/.test(p.description || ''),
    fk: /Foreign Key to `([^`]+)`/.exec(p.description || '')?.[1] ?? null,
    defaut: p.default ?? null,
  }))
}

/** Noms des tables/vues exposées, triés (l'ordre d'OpenAPI n'est pas stable). */
export function tablesDe(openapi = {}) {
  return Object.keys(openapi.definitions || {}).sort()
}

/**
 * Signatures RPC lues dans les chemins `/rpc/<nom>`.
 * PostgREST n'expose une fonction qu'en POST : le corps EST la signature, et
 * c'est précisément ce que A1 et A2 n'avaient pas pu obtenir sur la cible.
 */
export function signaturesRpc(openapi = {}) {
  const sortie = []
  for (const [chemin, item] of Object.entries(openapi.paths || {})) {
    const m = /^\/rpc\/(.+)$/.exec(chemin)
    if (!m) continue
    const corps = (item?.post?.parameters || []).find((p) => p?.in === 'body')
    const proprietes = corps?.schema?.properties || {}
    const requis = corps?.schema?.required || []
    sortie.push({
      nom: m[1],
      methodes: Object.keys(item).sort(),
      parametres: Object.entries(proprietes).map(([nom, p]) => ({
        nom,
        type: p.type ?? null,
        format: p.format ?? null,
        requis: requis.includes(nom),
      })),
      corpsSansParametre: corps === undefined,
    })
  }
  return sortie.sort((a, b) => a.nom.localeCompare(b.nom))
}

/** `Content-Range` → total de lignes, ou `null` si la forme est inconnue. */
export function lireContentRange(valeur) {
  const m = /^(\*|\d+-\d+)\/(\d+|\*)$/.exec(String(valeur ?? '').trim())
  if (!m) return null
  return { plage: m[1], total: m[2] === '*' ? null : Number(m[2]) }
}

/* ---------------------------------------------------------------------------
   2. Classement d'un accès — 401, 403 et 404 ne disent pas la même chose.
      200/206 : lisible (et le total dit s'il y a des lignes).
      401     : rôle non autorisé à interroger (clé ou jeton).
      403     : la table existe, le GRANT manque (`42501`).
      404     : la table n'existe pas (`PGRST205`).
   ------------------------------------------------------------------------ */

export function classerAcces({ statut, contentRange } = {}) {
  if (statut === 200 || statut === 206) {
    const cr = lireContentRange(contentRange)
    return { verdict: 'lisible', lignes: cr ? cr.total : null }
  }
  if (statut === 401) return { verdict: 'refuse_401', lignes: null }
  if (statut === 403) return { verdict: 'refuse_403', lignes: null }
  if (statut === 404) return { verdict: 'absente', lignes: null }
  return { verdict: 'erreur', statut: statut ?? null, lignes: null }
}

/* ---------------------------------------------------------------------------
   3. Le modèle MESURÉ de la cible (A1, `Fidelix_Serveur.md` §8.2/§8.3).
      Recopié ici pour que la comparaison soit REJOUABLE et FALSIFIABLE : si un
      chiffre de la doc est faux, `comparerModele` le contredira au lieu de le
      répéter. `etat` porte ce que la mesure n'a PAS pu établir — c'est cette
      partie qui empêche d'inventer des colonnes.
   ------------------------------------------------------------------------ */

export const MODELE_CIBLE = Object.freeze({
  loyalty_programs: Object.freeze({
    etat: 'mesuree',
    colonnes: Object.freeze([
      'id', 'restaurant_id', 'name', 'type', 'points_per_purchase',
      'min_purchase_mad', 'stamps_total', 'reward_description',
      'reward_threshold', 'points_expiry_days', 'is_active', 'created_at',
      'updated_at', 'referral_reward', 'review_reward', 'review_reward_enabled',
      'google_review_url', 'enseigne_id', 'stamp_icon', 'devise',
      'deduction_libre', 'referral_reward_filleul', 'referral_cadeau_filleul',
    ]),
  }),
  reward_tiers: Object.freeze({
    etat: 'mesuree',
    colonnes: Object.freeze([
      'id', 'program_id', 'title', 'description', 'cost', 'position',
      'is_active', 'created_at', 'updated_at', 'restaurant_id',
    ]),
  }),
  restaurants: Object.freeze({
    etat: 'mesuree',
    colonnes: Object.freeze([
      'id', 'user_id', 'name', 'slug', 'description', 'phone', 'address',
      'city', 'country', 'logo_url', 'primary_color', 'secondary_color',
      'accent_color', 'is_active', 'created_at', 'updated_at', 'commerce_type',
      'wallet_bg_url', 'type_activite', 'message_wallet', 'message_wallet_le',
      'latitude', 'longitude', 'geofence_radius_m', 'geofence_texte',
      'billing_exempt', 'site_url', 'instagram_url', 'facebook_url',
      'tiktok_url', 'reservation_url', 'style_bandeau', 'enseigne_id',
      'country_code',
    ]),
  }),
  transactions: Object.freeze({
    etat: 'mesuree',
    // Le cœur de l'écart : delta de points ET de tampons, clé d'idempotence,
    // rattachement à une session de caisse et à un auteur.
    colonnes: Object.freeze([
      'id', 'card_id', 'restaurant_id', 'type', 'points_delta', 'stamps_delta',
      'amount_mad', 'note', 'employee_id', 'table_number', 'pos_reference',
      'created_at', 'reward_tier_id', 'client_operation_id', 'till_session_id',
      'auteur_id',
    ]),
  }),
  automations: Object.freeze({ etat: 'vide', colonnes: Object.freeze([]) }),
  till_sessions: Object.freeze({ etat: 'vide', colonnes: Object.freeze([]) }),
  customers: Object.freeze({ etat: 'inaccessible', colonnes: Object.freeze([]) }),
  rewards: Object.freeze({ etat: 'inexistante', colonnes: Object.freeze([]) }),
})

export const TABLES_CIBLE = Object.freeze(Object.keys(MODELE_CIBLE).sort())

/* ---------------------------------------------------------------------------
   3bis. Les deux modèles DOCUMENTAIRES, pour trianguler.
      La base de reconstruction n'a qu'un seul contenu ; on peut donc la
      confronter aux trois références disponibles et regarder **laquelle elle
      satisfait**. C'est ce qui transforme « elle ressemble à » en « elle est ».

      `etat: 'declaree'` = colonnes connues parce qu'écrites dans un document,
      pas parce qu'observées sur la cible. Le comparateur les traite comme
      comparables, jamais comme une mesure.
   ------------------------------------------------------------------------ */

/** `conversation.md` — `CREATE TABLE` initial **plus** sa seconde migration
    (`reward_label`), qui est la seule façon d'expliquer la base réelle. */
export const MODELE_CONVERSATION = Object.freeze({
  clients: Object.freeze({
    etat: 'declaree',
    colonnes: Object.freeze(['id', 'first_name', 'last_name', 'email', 'created_at']),
  }),
  loyalty_cards: Object.freeze({
    etat: 'declaree',
    colonnes: Object.freeze([
      'id', 'client_id', 'card_token', 'current_points', 'updated_at', 'created_at',
    ]),
  }),
  loyalty_transactions: Object.freeze({
    etat: 'declaree',
    colonnes: Object.freeze([
      'id', 'card_id', 'amount_spent', 'points_awarded', 'staff_id', 'created_at',
      'reward_label',
    ]),
  }),
})

/** `Spécifications techniques plateforme de fidélité QR code.md` §5. */
export const MODELE_SPECIFICATION = Object.freeze({
  clients: Object.freeze({
    etat: 'declaree',
    colonnes: Object.freeze(['id', 'first_name', 'last_name', 'email', 'created_at']),
  }),
  loyalty_cards: Object.freeze({
    etat: 'declaree',
    // `total_spent` est la première divergence dure avec la base réelle.
    colonnes: Object.freeze([
      'id', 'client_id', 'card_token', 'current_points', 'total_spent',
      'updated_at', 'created_at',
    ]),
  }),
  loyalty_transactions: Object.freeze({
    etat: 'declaree',
    // `points_delta` / `staff_user_id` / `notes` contre
    // `points_awarded` / `staff_id` / `reward_label` de la base. Un script
    // écrit pour l'un ne peut pas s'exécuter sur l'autre.
    colonnes: Object.freeze([
      'id', 'card_id', 'amount_spent', 'points_delta', 'staff_user_id', 'notes',
      'created_at',
    ]),
  }),
})


/* ---------------------------------------------------------------------------
   4. Comparaison base réelle ⇄ modèle mesuré.
      Une règle : on ne reproche jamais à la base de manquer une colonne que la
      CIBLE n'a pas permis de mesurer.
   ------------------------------------------------------------------------ */

/**
 * @param {object} base  `{ <table>: string[] }` — colonnes réellement exposées
 * @param {object} [cible] modèle de référence (défaut : `MODELE_CIBLE`)
 */
export function comparerModele(base = {}, cible = MODELE_CIBLE) {
  const tablesBase = Object.keys(base).sort()
  const tablesCible = Object.keys(cible).sort()

  // Une table que la cible a PROUVÉ absente (`rewards`, PGRST205) ne peut pas
  // être « manquante » : elle n'existe nulle part. La nommer manquante ferait
  // réclamer à la reconstruction de créer une table dont on a mesuré qu'elle
  // n'existe pas.
  const tablesManquantes = tablesCible.filter(
    (t) => cible[t].etat !== 'inexistante' && !tablesBase.includes(t),
  )

  // « En plus » ne veut pas dire « inconnue de la cible » mais « que la cible
  // n'a pas » : une table inconnue est un ajout, et une table réfutée aussi.
  const tablesEnPlus = tablesBase.filter(
    (t) => !cible[t] || cible[t].etat === 'inexistante',
  )

  const colonnes = {}
  for (const t of tablesBase) {
    if (!cible[t]) continue
    const attendu = cible[t]
    // Aucune sémantique de colonne pour une table qui ne doit pas exister.
    if (attendu.etat === 'inexistante') continue
    // `mesuree` (colonnes lues sur la cible) et `declaree` (colonnes écrites
    // dans un document) sont comparables ; tout le reste ne l'est pas.
    if (attendu.etat !== 'mesuree' && attendu.etat !== 'declaree') {
      // 0 colonne connue : on ne dit RIEN des colonnes, on dit POURQUOI.
      colonnes[t] = { nonMesuree: true, etat: attendu.etat, manquantes: [], enPlus: [] }
      continue
    }
    const reelles = new Set(base[t] || [])
    colonnes[t] = {
      nonMesuree: false,
      etat: attendu.etat,
      manquantes: attendu.colonnes.filter((c) => !reelles.has(c)),
      enPlus: (base[t] || []).filter((c) => !attendu.colonnes.includes(c)),
    }
  }

  return { tablesManquantes, tablesEnPlus, colonnes }
}

/** `true` si la base de reconstruction porte le modèle mesuré de la cible. */
export function estConforme(comparaison) {
  // Une comparaison absente ou incomplète n'est PAS une conformité : c'est une
  // mesure qui n'a pas eu lieu. La distinguer est le seul moyen qu'un appel
  // oublié ne se lise pas comme un feu vert.
  if (!comparaison || !Array.isArray(comparaison.tablesManquantes)) return false
  if (!comparaison.colonnes) return false
  const { tablesManquantes, tablesEnPlus, colonnes } = comparaison
  if (tablesManquantes.length || (tablesEnPlus || []).length) return false
  return Object.values(colonnes).every(
    (c) => c.nonMesuree || (c.manquantes.length === 0 && c.enPlus.length === 0),
  )
}

