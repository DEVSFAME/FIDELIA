/* ============================================================================
   R3 — le rejeu de la caisse : classer une sonde, juger deux appels.

   Pur, sans I/O : la CLI `verifier-idempotence-caisse.mjs` émet les POST et
   passe les réponses. Tests : `tests/idempotence.test.mjs`.

   Deux pièges, mesurés le 2026-11-03 :

   1. **`PGRST202` ne dit pas « la fonction manque ».** PostgREST le rend aussi
      quand le nom existe et que le corps n'envoie pas tous les arguments
      attendus. D'où `corpsSonde`, qui envoie toujours les quatre.
   2. **`p_operation_id` nul n'écrit rien.** `0016` lève
      `OPERATION_ID_MANQUANT` avant `award_loyalty_points` : la sonde traverse
      donc un `GRANT` trop large sans créditer un seul point.
   ========================================================================== */

/** Les quatre états possibles d'une sonde de présence — aucun cinquième. */
export const ETATS_SONDE = Object.freeze(['absente', 'fermee', 'appelable', 'inconnue'])

/** Corps lisible depuis une réponse PostgREST (texte ou objet), sinon `null`. */
function json(corps) {
  if (corps && typeof corps === 'object') return corps
  try {
    return JSON.parse(String(corps ?? ''))
  } catch {
    return null
  }
}

/** `{code, message}` d'une réponse, tolérant à un corps non-JSON (502 HTML). */
export function lireErreur(corps) {
  const lu = json(corps)
  return { code: lu?.code ?? null, message: lu?.message ?? null }
}

/**
 * Corps de la sonde : les quatre arguments de `0016`, `operation_id` **nul**.
 * Envoyer les quatre est ce qui distingue « absente » de « arguments incomplets ».
 */
export function corpsSonde() {
  return {
    p_operation_id: null,
    p_card_token: 'sonde-0016',
    p_amount_spent: 0,
    p_points_to_add: 0,
  }
}

/** Corps d'une opération réelle — noms d'arguments de `0016`, sans invention. */
export function corpsOperation({ operationId, jeton, montant, points } = {}) {
  return {
    p_operation_id: operationId,
    p_card_token: jeton,
    p_amount_spent: montant,
    p_points_to_add: points,
  }
}

/**
 * Classe la réponse à `corpsSonde()` :
 *  - `absente`   : `PGRST202` — `0016` n'est pas dans le cache de schéma ;
 *  - `fermee`    : `42501` — la fonction existe, `anon` n'a pas `EXECUTE` (attendu) ;
 *  - `appelable` : `OPERATION_ID_MANQUANT` — elle existe **et** `anon` l'atteint,
 *                  donc le `GRANT` de `0016` est plus large qu'écrit ;
 *  - `inconnue`  : tout le reste — un code non mesuré n'est rapproché de rien.
 */
export function classerSonde({ statut, corps } = {}) {
  const { code, message } = lireErreur(corps)
  if (statut === 404 && code === 'PGRST202') return { etat: 'absente', code, message }
  if ((statut === 401 || statut === 403) && code === '42501') {
    return { etat: 'fermee', code, message }
  }
  if (statut === 400 && String(message ?? '').startsWith('OPERATION_ID_MANQUANT')) {
    return { etat: 'appelable', code, message }
  }
  return { etat: 'inconnue', code, message }
}

/** Entier ou `null` — jamais `NaN`, et surtout jamais `0` pour une absence :
 *  `Number(null)` vaut `0`, ce qui ferait passer deux soldes manquants pour
 *  deux soldes égaux. */
const entier = (valeur) =>
  valeur === null || valeur === undefined || valeur === ''
    ? null
    : Number.isFinite(Number(valeur))
      ? Number(valeur)
      : null

/** Résultat d'un appel, normalisé pour comparaison (succès comme erreur). */
export function normaliserResultat({ statut, corps } = {}) {
  const lu = json(corps)
  if (statut >= 200 && statut < 300 && lu && typeof lu === 'object') {
    return {
      ok: true,
      erreur: null,
      statut,
      idempotent: lu.idempotent === true,
      transaction_id: lu.transaction_id ?? null,
      card_id: lu.card_id ?? null,
      points_added: entier(lu.points_added),
      new_balance: entier(lu.new_balance),
    }
  }
  const { code, message } = lireErreur(lu)
  return {
    ok: false,
    erreur: message ?? code ?? `HTTP ${statut}`,
    statut,
    idempotent: null,
    transaction_id: null,
    card_id: null,
    points_added: null,
    new_balance: null,
  }
}

/**
 * Juge le rejeu : deux appels du **même** `operationId` ont-ils produit **une**
 * transaction ? Chaque critère manqué devient une raison, jamais un booléen muet.
 *
 * `new_balance` identique est la preuve du solde : un second crédit rendrait
 * `X + 2p`, pas `X + p`.
 */
export function verdictRejeu({ premier, second } = {}) {
  const a = normaliserResultat(premier)
  const b = normaliserResultat(second)
  const raisons = []

  if (!a.ok) raisons.push(`la première écriture a échoué : ${a.erreur}`)
  if (!b.ok) raisons.push(`le rejeu a échoué : ${b.erreur}`)

  if (a.ok && b.ok) {
    if (a.idempotent !== false) raisons.push('la première écriture se dit déjà idempotente')
    if (b.idempotent !== true) raisons.push('le rejeu ne s’est pas reconnu : `idempotent` absent')
    if (!a.transaction_id || a.transaction_id !== b.transaction_id) {
      raisons.push('deux transactions différentes : le rejeu a réécrit')
    }
    if (a.new_balance === null) {
      raisons.push('aucun solde rendu : la preuve du solde manque')
    } else if (a.new_balance !== b.new_balance) {
      raisons.push(`le solde a bougé deux fois (${a.new_balance} puis ${b.new_balance})`)
    }
    if (a.points_added !== b.points_added) {
      raisons.push('le rejeu ne rend pas le même nombre de points')
    }
    if (a.card_id !== b.card_id) raisons.push('deux cartes différentes')
  }

  return { ok: raisons.length === 0, raisons, premier: a, second: b }
}
