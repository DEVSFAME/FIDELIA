/* ============================================================================
   R1.2 — Analyse statique de la migration de durcissement.

   POURQUOI DE L'ANALYSE STATIQUE, ET PAS UNE SONDE RÉSEAU
   R1.2 produit du DDL, et le périmètre interdit d'écrire sur la base. Une sonde
   qui « vérifierait » les droits devrait soit appliquer la migration, soit
   appeler les RPC — les deux sont des écritures. Ce module vérifie donc ce qui
   est réellement vérifiable ici : le TEXTE de la migration porte-t-il les
   invariants qu'on prétend lui faire porter ?

   Ce que cela prouve     : la migration ne contient pas le piège qu'elle
                            prétend éviter, et son périmètre est exactement
                            celui mesuré en R0.
   Ce que cela ne prouve pas : que PostgreSQL l'acceptera, ni que la base se
                            comportera comme annoncé. Cela demande une
                            exécution — hors périmètre (voir PROGRESS.md).

   CONVENTIONS : fonctions pures, aucun réseau, aucun accès disque. Le CLI
   (`verifier-durcissement.mjs`) fait l'entrée/sortie.
   ========================================================================== */

/** Les 2 fonctions réellement présentes dans l'OpenAPI de la base (R0).
 *
 *  L'ORDRE des types est celui de `pg_get_function_identity_arguments`
 *  (mesuré le 2026-10-31), **pas** celui de l'OpenAPI : `award` reçoit
 *  `p_card_token varchar` en premier argument, `p_amount_spent numeric` en
 *  second. La version précédente portait `(numeric, varchar, …)` et rendait la
 *  migration inapplicable — `to_regprocedure(…)` → NULL — sans qu'aucun test
 *  ne bronche, puisque le test et la migration partageaient la même erreur.
 *  `durcissement.test.mjs` vérifie désormais cet ordre contre celui des
 *  arguments construits par `construireAttribution()`.
 */
export const RPC_MESUREES = Object.freeze([
  'award_loyalty_points(varchar, numeric, integer, uuid)',
  'redeem_loyalty_reward(varchar, integer, varchar, uuid)',
])

/** Les 3 tables réellement présentes, et seules (`tablesEnPlus` de R0). */
export const TABLES_MESUREES = Object.freeze([
  'clients',
  'loyalty_cards',
  'loyalty_transactions',
])

/** RPC appelée par le bundle client mais ABSENTE de la base : cible seulement. */
export const RPC_HORS_BASE = Object.freeze(['join_loyalty_program'])

/** Rôles qui ne doivent plus rien pouvoir, ni hériter de PUBLIC. */
export const ROLES_FERMES = Object.freeze(['anon', 'authenticated'])

/** Seul rôle conservé côté backend. */
export const ROLE_SERVEUR = 'service_role'

/**
 * Retire les commentaires SQL (`-- …` et `/* … *\/`).
 * Indispensable : la migration PARLE de `join_loyalty_program` et de
 * `revoke … from anon` dans ses commentaires. Chercher ces motifs dans le texte
 * brut produirait des faux positifs — un commentaire n'est pas du code.
 */
export function sansCommentaires(sql = '') {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

/** Minuscules, espaces compactés : deux écritures équivalentes se comparent. */
export function normaliser(fragment = '') {
  return String(fragment).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Instructions du code seul (commentaires retirés), normalisées, non vides. */
export function instructions(sql = '') {
  return sansCommentaires(sql)
    .split(';')
    .map(normaliser)
    .filter(Boolean)
}

/** `nom ( a , b )` -> `nom(a, b)` : la forme sous laquelle Postgres identifie. */
export function signatureNormalisee(nom, args) {
  const liste = String(args)
    .split(',')
    .map((a) => normaliser(a))
    .filter(Boolean)
    .join(', ')
  return `${normaliser(nom)}(${liste})`
}

const RE_FONCTION =
  /^(revoke|grant)\s+execute\s+on\s+function\s+([a-z_][a-z0-9_.]*)\s*\(([^)]*)\)\s+(?:from|to)\s+(.+)$/

/** Droits EXECUTE émis par la migration, dans l'ordre du fichier. */
export function droitsExecute(sql = '') {
  const droits = []
  for (const i of instructions(sql)) {
    const m = i.match(RE_FONCTION)
    if (!m) continue
    const [, verbe, nom, args, roles] = m
    const nomNu = nom.replace(/^public\./, '')
    droits.push({
      verbe,
      fonction: nomNu,
      signature: signatureNormalisee(nomNu, args),
      roles: roles
        .split(',')
        .map((r) => normaliser(r))
        .filter(Boolean),
    })
  }
  return droits
}

/** Le piège fondateur : révoquer `anon` sans révoquer `PUBLIC` ne retire rien. */
export function revoquesSansPublic(sql = '') {
  const droits = droitsExecute(sql)
  const publicOk = new Set(
    droits
      .filter((d) => d.verbe === 'revoke' && d.roles.includes('public'))
      .map((d) => d.signature),
  )
  return droits
    .filter((d) => d.verbe === 'revoke' && !d.roles.includes('public'))
    .filter((d) => d.roles.some((r) => ROLES_FERMES.includes(r)))
    .map((d) => d.signature)
    .filter((s) => !publicOk.has(s))
}

/**
 * Signatures durcies : REVOKE … FROM PUBLIC **et** GRANT … TO service_role.
 *
 * Les deux conditions sont cherchées PAR SIGNATURE, pas par instruction : la
 * forme SQL idiomatique émet un REVOKE par rôle. Exiger les deux sur la même
 * ligne ferait passer une migration correcte pour non conforme — c'est
 * exactement l'erreur que le premier jet a commise.
 *
 * `FROM PUBLIC` est la condition qui agit (anon/authenticated en héritent) ;
 * `TO service_role` répare ce que la première aurait pu casser.
 */
export function rpcDurcies(sql = '') {
  const droits = droitsExecute(sql)
  const signatures = [...new Set(droits.map((d) => d.signature))]
  return signatures.filter((s) => {
    const pourCetteSignature = droits.filter((d) => d.signature === s)
    const revoquePublic = pourCetteSignature.some(
      (d) => d.verbe === 'revoke' && d.roles.includes('public'),
    )
    const renduAuServeur = pourCetteSignature.some(
      (d) => d.verbe === 'grant' && d.roles.includes(ROLE_SERVEUR),
    )
    return revoquePublic && renduAuServeur
  })
}

/** Tables dont la migration active la RLS. */
export function tablesRlsActivee(sql = '') {
  const actives = []
  for (const i of instructions(sql)) {
    const m = i.match(
      /^alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security$/,
    )
    if (m) actives.push(m[1])
  }
  return actives
}

/** `FORCE` soumettrait le propriétaire à la RLS : risque de casser les RPC. */
export function forceRls(sql = '') {
  return instructions(sql).filter((i) => /force\s+row\s+level\s+security$/.test(i))
}

/** Politiques qui ouvriraient la table : rôle ouvert, ou prédicat toujours vrai. */
export function politiquesOuvrantes(sql = '') {
  return instructions(sql)
    .filter((i) => i.startsWith('create policy'))
    .filter(
      (i) =>
        /\bto\s+(public|anon|authenticated)\b/.test(i) ||
        /using\s*\(\s*true\s*\)/.test(i) ||
        /with\s+check\s*\(\s*true\s*\)/.test(i),
    )
}

/**
 * `GRANT … ON FUNCTION` n'est PAS un GRANT de table.
 *
 * Erreur corrigée le 2026-10-31, révélée par la fusion de `0001` et `0002` : le
 * filtre ne regardait que `grant` + `to <rôle fermé>`, donc il comptait
 * `grant execute on function … to anon` comme une ouverture de table. Résultat :
 * toute migration accordant EXECUTE à `anon` — c'est-à-dire la migration
 * CORRECTE, celle que la mesure impose — était déclarée non conforme. Un
 * vérificateur qui refuse la seule forme juste ne protège plus rien : il pousse
 * à écrire la forme fausse.
 */
const RE_GRANT_HORS_TABLE = /\bon\s+(?:function|routine|procedure|schema)\b/

/** GRANT de table accordé à un rôle fermé — annulerait le §2 de la migration. */
export function grantsTablesOuverts(sql = '') {
  return instructions(sql).filter(
    (i) =>
      i.startsWith('grant ') &&
      !RE_GRANT_HORS_TABLE.test(i) &&
      /\bto\s+(public|anon|authenticated)\b/.test(i),
  )
}

/** Occurrences d'un nom DANS LE CODE (commentaires exclus). */
export function occurrencesEnCode(sql = '', nom = '') {
  const re = new RegExp(`\\b${nom}\\b`, 'g')
  return (sansCommentaires(sql).match(re) || []).length
}

/**
 * Verdict d'ensemble. `ok` n'est vrai que si CHAQUE invariant tient, et si le
 * périmètre est exactement celui mesuré — ni moins, ni plus.
 */
export function auditer(sql = '', { rpc = RPC_MESUREES, tables = TABLES_MESUREES } = {}) {
  const durcies = rpcDurcies(sql)
  const actives = tablesRlsActivee(sql)
  const sansPublic = revoquesSansPublic(sql)
  const force = forceRls(sql)
  const ouvrantes = politiquesOuvrantes(sql)
  const grantsOuverts = grantsTablesOuverts(sql)
  const horsBaseEnCode = RPC_HORS_BASE.filter((n) => occurrencesEnCode(sql, n) > 0)

  const rpcAttendues = [...rpc].sort()
  const tablesAttendues = [...tables].sort()
  const ecarts = []

  if (sansPublic.length) ecarts.push(`REVOKE sans PUBLIC (no-op) sur : ${sansPublic.join(', ')}`)

  const rpcManquantes = rpcAttendues.filter((r) => !durcies.includes(r))
  if (rpcManquantes.length) {
    ecarts.push(`RPC non durcie (REVOKE PUBLIC + GRANT service_role) : ${rpcManquantes.join(', ')}`)
  }
  const rpcEnTrop = durcies.filter((r) => !rpcAttendues.includes(r))
  if (rpcEnTrop.length) ecarts.push(`RPC durcie hors périmètre mesuré : ${rpcEnTrop.join(', ')}`)

  const tablesManquantes = tablesAttendues.filter((t) => !actives.includes(t))
  if (tablesManquantes.length) ecarts.push(`RLS non activée : ${tablesManquantes.join(', ')}`)
  const tablesEnTrop = actives.filter((t) => !tablesAttendues.includes(t))
  if (tablesEnTrop.length) ecarts.push(`RLS activée hors périmètre mesuré : ${tablesEnTrop.join(', ')}`)

  if (force.length) {
    ecarts.push(`FORCE ROW LEVEL SECURITY (risque sur les RPC SECURITY DEFINER) : ${force.join(' | ')}`)
  }
  if (ouvrantes.length) ecarts.push(`Politique permissive inventée : ${ouvrantes.join(' | ')}`)
  if (grantsOuverts.length) ecarts.push(`GRANT de table à un rôle fermé : ${grantsOuverts.join(' | ')}`)
  if (horsBaseEnCode.length) {
    ecarts.push(`Objet hors base manipulé dans le code : ${horsBaseEnCode.join(', ')}`)
  }

  return {
    ok: ecarts.length === 0,
    ecarts,
    rpcDurcies: durcies,
    tablesRlsActivee: actives,
    revoquesSansPublic: sansPublic,
    forceRls: force.length,
    politiquesOuvrantes: ouvrantes.length,
    occurrencesHorsBaseEnCode: horsBaseEnCode,
  }
}
