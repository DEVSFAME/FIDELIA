/* ============================================================================
   Garde sur `migrations/0010` — les sept réglages du programme (page `/program`).

   La migration n'est **pas** exécutée ici : elle ne l'est pas encore en base au
   moment où ces lignes sont écrites. Ce fichier vérifie donc ce qui se relit
   dans le texte, et surtout ce qui casserait en silence une fois passée :

     1. **Une colonne sans borne.** `points_expiry_days` à `null` se lirait
        « inconnu » là où `0` veut dire « jamais » ; un `min_purchase` négatif
        ferait un programme qui ne crédite jamais rien sans le dire. Chaque
        colonne doit porter son `not null`, son défaut et son `check`.
     2. **Un second barème.** `credits_par_euro` (`0008`) est la seule source du
        taux que lit la caisse. Une colonne « points par tranche » ajoutée ici
        créerait deux vérités pour un même réglage, et la caisse créditerait un
        nombre que l'écran n'a jamais affiché.
     3. **Une lecture sans refus.** Sans `PROGRAM_NOT_FOUND`, un commerce sans
        programme lirait un objet vide et l'écran afficherait sept zéros comme
        s'ils étaient réglés.
     4. **Un refus qui n'est pas un refus.** Chaque `raise` doit lever un code
        que `lib/donnees.mjs` connaît (`CODES_CONNUS`) ; sinon il tombe en
        `indisponible`, et l'écran annonce une panne là où la base vient de
        répondre « non » — en détail.
     5. **`anon` accordé par distraction.** `programme_public` (`0003`) est
        publique ; la configuration commerciale ne l'est pas. Un `grant` à
        `anon` publierait le bonus de parrainage, le lien d'avis et le plafond
        d'expiration à qui connaît le slug.
     6. **Un `REVOKE … FROM PUBLIC` seul**, qui ne révoque rien : `create
        function` hérite des privilèges par défaut du schéma.
     7. **Une écriture qui crée.** `enregistrer_reglages_programme` met à jour ;
        créer un programme est le travail de `enregistrer_programme`, avec un
        slug que quelqu'un a choisi.
     8. **Un libellé français dans le SQL.** « Bonus avis Google » appartient au
        dictionnaire (`lesson-learned` §31.6).

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   rendu de l'écran (`reglages-programme.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0010_reglages_programme.sql')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

/** Le code hors des corps de fonction : c'est là que vivent le DDL et les droits. */
const HORS_FONCTIONS = CODE.replace(/\$fonction\$[\s\S]*?\$fonction\$/g, ' $fonction$ ')

const corpsDe = (nom) => {
  const bloc = CODE.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${nom}\\s*\\([\\s\\S]*?\\$fonction\\$;`,
      'i'
    )
  )
  assert.ok(bloc, `la fonction « ${nom} » est introuvable`)
  return bloc[0]
}

const LECTURE = corpsDe('reglages_du_programme')
const ECRITURE = corpsDe('enregistrer_reglages_programme')

/* ---------------------------------------------------------------------------
   1. Les colonnes
   ------------------------------------------------------------------------ */

test('0010 — chaque colonne porte un type, un défaut et sa borne', () => {
  /* Les cinq colonnes qui n'existaient nulle part, plus les deux du bonus
     d'avis. `devise` et `credits_par_euro` viennent de `0008` : les redéclarer
     ici les rendrait dépendantes de deux migrations. */
  const colonnes = {
    min_purchase: /numeric\(10,\s*2\)\s+not\s+null\s+default\s+0\s+check\s*\(\s*min_purchase\s*>=\s*0\s*\)/i,
    deduction_libre: /boolean\s+not\s+null\s+default\s+false/i,
    points_expiry_days: /integer\s+not\s+null\s+default\s+0\s+check\s*\(\s*points_expiry_days\s*>=\s*0\s*\)/i,
    referral_reward: /integer\s+not\s+null\s+default\s+0\s+check\s*\(\s*referral_reward\s*>=\s*0\s*\)/i,
    review_reward_enabled: /boolean\s+not\s+null\s+default\s+false/i,
    review_reward: /integer\s+not\s+null\s+default\s+0\s+check\s*\(\s*review_reward\s*>=\s*0\s*\)/i,
    google_review_url: /text\s+check\s*\(\s*google_review_url\s+is\s+null\s+or\s+google_review_url\s+~\*\s*'\^https:\/\/'/i,
  }

  for (const [colonne, motif] of Object.entries(colonnes)) {
    assert.match(HORS_FONCTIONS, motif, `la colonne « ${colonne} » n’a plus sa définition`)
    assert.match(
      HORS_FONCTIONS,
      new RegExp(`add column if not exists ${colonne}\\b`, 'i'),
      `« ${colonne} » n’est pas ajoutée avec \`if not exists\``
    )
    // Et elle est commentée : une colonne sans commentaire se relit mal.
    assert.match(
      HORS_FONCTIONS,
      new RegExp(`comment on column public\\.loyalty_programs\\.${colonne}\\b`, 'i'),
      `« ${colonne} » n’est pas commentée`
    )
  }

  // Sept colonnes, pas huit : le barème n'est **pas** dupliqué.
  const ajouts = [...HORS_FONCTIONS.matchAll(/add column if not exists ([a-z_]+)/gi)].map(
    (trouve) => trouve[1]
  )
  assert.deepEqual(ajouts, Object.keys(colonnes), `colonnes ajoutées : ${ajouts}`)
  assert.equal(
    /points_per_purchase|points_par_tranche/i.test(CODE),
    false,
    'un second barème est apparu : `credits_par_euro` doit rester la seule source'
  )
})

test('0010 — la migration est rejouable et atomique', () => {
  assert.match(CODE, /^\s*begin\s*;/im, 'aucun `begin` : une erreur au milieu laisserait la base à moitié migrée')
  assert.match(CODE, /^\s*commit\s*;/im, 'aucun `commit`')
  // `if not exists` partout : une seconde exécution ne doit pas lever.
  assert.equal(
    /add column(?!\s+if\s+not\s+exists)/i.test(HORS_FONCTIONS),
    false,
    'un `add column` sans `if not exists` casserait la seconde exécution'
  )
  // Aucun `alter column type` ni `drop` : cette migration ajoute, elle ne
  // réécrit pas ce que `0003`/`0008` ont posé.
  assert.equal(/\bdrop\s+(column|table|function)\b/i.test(CODE), false, 'la migration supprime un objet')
})

/* ---------------------------------------------------------------------------
   2. La lecture
   ------------------------------------------------------------------------ */

test('0010 — la lecture est SECURITY DEFINER, avec un search_path figé', () => {
  assert.match(LECTURE, /security\s+definer/i, 'sans definer, RLS sans politique rend zéro ligne')
  assert.match(LECTURE, /set\s+search_path\s*=\s*public\s*$/im)
  assert.equal(/pg_temp/.test(LECTURE), false, 'pg_temp n’a rien à faire ici')
  assert.match(LECTURE, /returns\s+json/i, 'la lecture doit rendre un objet, pas une table')
  assert.equal(
    /returns\s+setof|returns\s+table/i.test(LECTURE),
    false,
    'un `setof` rendrait sept lignes pour sept réglages'
  )
})

test('0010 — la lecture rend les neuf clés que l’écran attend', () => {
  const cles = [...LECTURE.matchAll(/'([a-z_]+)',\s+v_programme\./g)].map((trouve) => trouve[1])
  assert.deepEqual(cles, [
    'devise',
    'credits_par_euro',
    'min_purchase',
    'deduction_libre',
    'points_expiry_days',
    'referral_reward',
    'review_reward_enabled',
    'review_reward',
    'google_review_url',
  ])
  // Chaque clé doit encore correspondre à une colonne lue : une clé ajoutée au
  // `json_build_object` sans son `select` rendrait `null` sans le dire.
  for (const cle of cles) {
    assert.match(LECTURE, new RegExp(`p\\.${cle}\\b`), `« ${cle} » n’est plus lue depuis la table`)
  }
})

test('0010 — un commerce sans programme est refusé, pas rendu à zéro', () => {
  assert.match(LECTURE, /raise\s+exception\s+'PROGRAM_NOT_FOUND'/i)
  assert.match(LECTURE, /order\s+by\s+p\.created_at,\s*p\.id/i, 'le départage a disparu')
  assert.match(LECTURE, /where\s+p\.active/i, 'un programme désactivé serait lu')
  assert.match(LECTURE, /limit\s+1/i, 'deux programmes actifs rendraient deux objets')
})


/* ---------------------------------------------------------------------------
   3. L'écriture
   ------------------------------------------------------------------------ */

test('0010 — neuf paramètres, dans l’ordre de la signature, le lien facultatif en dernier', () => {
  /* Le lien a `default null` et vient en dernier : c'est la seule façon
     d'appeler la fonction avec huit arguments — le cas courant d'un commerce
     qui n'a pas encore collé son Place ID. Un `default` au milieu rendrait
     l'appel à huit arguments impossible sans nommer les suivants. */
  const signature = ECRITURE.match(
    /create\s+or\s+replace\s+function\s+public\.enregistrer_reglages_programme\s*\(([\s\S]*?)\)\s*returns/i
  )
  assert.ok(signature, 'la signature est introuvable')

  const parametres = [...signature[1].matchAll(/(p_[a-z_]+)\s+([a-z]+(?:\(\d+(?:,\s*\d+)?\))?)([^,]*,?)/gi)].map(
    (trouve) => ({ nom: trouve[1], type: trouve[2].toLowerCase(), reste: trouve[3] })
  )
  assert.deepEqual(
    parametres.map((parametre) => parametre.nom),
    [
      'p_devise',
      'p_credits_par_euro',
      'p_min_purchase',
      'p_deduction_libre',
      'p_points_expiry_days',
      'p_referral_reward',
      'p_review_reward_enabled',
      'p_review_reward',
      'p_google_review_url',
    ]
  )
  assert.deepEqual(
    parametres.map((parametre) => parametre.type),
    ['varchar', 'numeric', 'numeric', 'boolean', 'integer', 'integer', 'boolean', 'integer', 'text']
  )
  assert.match(parametres.at(-1).reste, /default\s+null/i, 'le lien doit être facultatif')
  for (const parametre of parametres.slice(0, -1)) {
    assert.equal(/default/i.test(parametre.reste), false, `« ${parametre.nom} » ne doit pas avoir de défaut`)
  }

  // Le `revoke`/`grant` doit porter la **même** liste de types, sans quoi il ne
  // s'applique pas (Postgres compare la signature complète).
  assert.match(
    HORS_FONCTIONS,
    /revoke execute on function public\.enregistrer_reglages_programme\(\s*varchar, numeric, numeric, boolean, integer, integer, boolean, integer, text\s*\)/i
  )
})

test('0010 — l’écriture valide tout, puis écrit une seule fois', () => {
  assert.match(ECRITURE, /security\s+definer/i)
  assert.match(ECRITURE, /set\s+search_path\s*=\s*public\s*$/im)
  assert.match(ECRITURE, /returns\s+json/i)

  // La devise est normalisée avant d'être comparée : « eur » et « Eur » passent.
  assert.match(ECRITURE, /upper\(trim\(coalesce\(p_devise,\s*''\)\)\)/i)
  assert.match(ECRITURE, /v_devise\s+not\s+in\s*\(\s*'MAD',\s*'EUR'\s*\)/i)

  /* Deux décimales : la colonne de `0008` n'en garde pas davantage, et arrondir
     ici changerait le barème en silence — le commerçant saisirait 0,225 et la
     caisse appliquerait 0,22. */
  assert.match(ECRITURE, /round\(p_credits_par_euro\s*\*\s*100\)/i)

  // Un lien vidé vaut `null` : une seule façon de dire « aucun lien ».
  assert.match(ECRITURE, /nullif\(trim\(coalesce\(p_google_review_url,\s*''\)\),\s*''\)/i)

  // Une seule écriture, et c'est un `update` : cette fonction ne crée rien.
  const ecritures = [...ECRITURE.matchAll(/\b(insert\s+into|update|delete\s+from)\s+public\./gi)].map(
    (trouve) => trouve[1].toLowerCase()
  )
  assert.deepEqual(ecritures, ['update'], `écritures trouvées : ${ecritures}`)
  assert.match(ECRITURE, /update\s+public\.loyalty_programs\s+set\s+devise\s*=\s*v_devise/i)

  // L'état rendu est celui de la base, relu — pas les paramètres reçus.
  assert.match(ECRITURE, /return\s+public\.reglages_du_programme\(\)/i)
})


test('0010 — chaque refus lève son code, et aucun ne lève après l’écriture', () => {
  const refus = [...ECRITURE.matchAll(/raise\s+exception\s+'([A-Z_]+)'/g)].map((trouve) => trouve[1])

  assert.deepEqual(refus, [
    'INVALID_DEVISE',
    'INVALID_CREDITS',
    'INVALID_MIN_PURCHASE',
    'INVALID_EXPIRY',
    'INVALID_REFERRAL',
    'INVALID_REVIEW',
    'INVALID_REVIEW_URL',
    'REVIEW_WITHOUT_POINTS',
    'REVIEW_WITHOUT_URL',
    'PROGRAM_NOT_FOUND',
  ])

  /* Tous **avant** le `update` : un refus levé après coup laisserait la colonne
     écrite et l'écran en erreur — le pire des deux mondes. */
  const positionEcriture = ECRITURE.search(/update\s+public\.loyalty_programs/i)
  assert.ok(positionEcriture > 0, 'aucun `update` : la fonction ne fait plus rien')
  for (const trouve of ECRITURE.matchAll(/raise\s+exception\s+'([A-Z_]+)'/g)) {
    if (trouve[1] === 'PROGRAM_NOT_FOUND') continue // levé deux fois : lecture puis écriture
    assert.ok(
      trouve.index < positionEcriture,
      `« ${trouve[1]} » est levé après l’écriture`
    )
  }

  // `PROGRAM_NOT_FOUND` est levé aussi avant l'écriture, via la sélection.
  const selection = ECRITURE.search(/select\s+p\.id\s+into\s+v_programme/i)
  const premierNotFound = ECRITURE.indexOf("raise exception 'PROGRAM_NOT_FOUND'")
  assert.ok(selection > 0 && selection < premierNotFound, 'le programme est cherché après son refus')

  // Les deux règles de cohérence, et pas seulement de forme.
  assert.match(ECRITURE, /v_avis\s+and\s+p_review_reward\s*=\s*0/i, 'un bonus à 0 point passerait')
  assert.match(ECRITURE, /v_avis\s+and\s+v_lien\s+is\s+null/i, 'un bonus sans lien passerait')
})

test('0010 — tous les codes levés sont connus de `lib/donnees.mjs`', () => {
  /* Un code inconnu ne remonte pas comme un refus : `rpc()` le traduit en
     `indisponible`, et l'écran annonce « la base ne répond pas » pour une base
     qui vient de répondre, très clairement. */
  const bloc = DONNEES.match(/const CODES_CONNUS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(bloc, 'la liste `CODES_CONNUS` est introuvable')
  const connus = new Set([...bloc[1].matchAll(/'([A-Z_]+)'/g)].map((trouve) => trouve[1]))

  const leves = new Set(
    [...CODE.matchAll(/raise\s+exception\s+'([A-Z_]+)'/g)].map((trouve) => trouve[1])
  )
  assert.ok(leves.size >= 10, `codes levés : ${[...leves]}`)

  const inconnus = [...leves].filter((code) => !connus.has(code))
  assert.deepEqual(inconnus, [], `codes levés que l’écran lirait comme une panne : ${inconnus}`)
})

/* ---------------------------------------------------------------------------
   4. Les droits, et ce que le fichier ne doit pas contenir
   ------------------------------------------------------------------------ */

test('0010 — `authenticated` et `service_role` seulement, jamais `anon`', () => {
  /* `REVOKE … FROM PUBLIC` **et** les deux rôles nommés : `create function`
     hérite des privilèges par défaut du schéma, donc révoquer `anon` seul ne
     retirerait rien. */
  for (const signature of [
    'public\\.reglages_du_programme\\(\\)',
    'public\\.enregistrer_reglages_programme\\([\\s\\S]*?\\)',
  ]) {
    const revoke = HORS_FONCTIONS.match(
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${signature}\\s+from\\s+([^;]+);`, 'i')
    )
    assert.ok(revoke, `aucun \`revoke\` pour ${signature}`)
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(revoke[1], new RegExp(`\\b${role}\\b`, 'i'), `« ${role} » n’est pas révoqué`)
    }
  }

  // Le `grant` nomme deux rôles, et **pas** `anon` : c'est l'écart avec `0009`.
  const grants = [...HORS_FONCTIONS.matchAll(/grant\s+execute\s+on\s+function([\s\S]*?);/gi)].map(
    (trouve) => trouve[1]
  )
  assert.equal(grants.length, 2, `un \`grant\` inattendu : ${grants.length}`)
  for (const grant of grants) {
    assert.match(grant, /to\s+authenticated,\s*service_role/i)
    assert.equal(/\banon\b/i.test(grant), false, '`anon` ne doit jamais recevoir ces fonctions')
  }

  // Et la configuration commerciale ne fuit pas par la page publique.
  assert.equal(/grant\s+[a-z\s,]*\s+on\s+table/i.test(HORS_FONCTIONS), false, 'une table est rouverte')
  assert.equal(/create\s+policy/i.test(HORS_FONCTIONS), false, 'une politique RLS remplace la doctrine')
  for (const fonction of ['programme_public', 'enregistrer_programme']) {
    assert.equal(
      new RegExp(`function\\s+public\\.${fonction}\\b`, 'i').test(CODE),
      false,
      `« ${fonction} » est réécrite ici : elle appartient à 0003/0008`
    )
  }
})

test('0010 — aucun libellé d’affichage dans le SQL', () => {
  /* On lit le **code**, pas le fichier : l'en-tête cite la capture (« Points par
     10 <devise> dépensés »), et c'est une citation. Un test qui lit un
     commentaire fabrique un faux rouge ici, et un faux vert ailleurs (§37.6). */
  for (const mot of ['Points par', 'Achat minimum', 'Mode cashback', 'Bonus avis', 'Dirham', '€']) {
    assert.equal(CODE.includes(mot), false, `« ${mot} » appartient au dictionnaire`)
  }
  assert.equal(CODE.includes('Fidelix'), false, 'le nom de la cible est recopié dans le SQL')
})

