/* ============================================================================
   RPC de fidélité — le contrat **réel**, mesuré sur la base de reconstruction.

   Rien ici n'est supposé. Tout vient de l'OpenAPI du projet
   (`GET /rest/v1/`, réponse de 13 805 o, lue avec `service_role`) :

       /rpc/award_loyalty_points
         p_amount_spent   numeric
         p_card_token     character varying
         p_points_to_add  int32
         p_staff_id       uuid     (facultatif)
         requis : p_card_token, p_amount_spent, p_points_to_add

       /rpc/redeem_loyalty_reward
         p_card_token     character varying
         p_points_cost    int32
         p_reward_label   character varying
         p_staff_id       uuid     (facultatif)
         requis : p_card_token, p_points_cost, p_reward_label

   Et de la sonde d'EXECUTE du 2026-10-31 :

       anon -> award_loyalty_points   HTTP 400 P0001 CARD_NOT_FOUND
       anon -> redeem_loyalty_reward  HTTP 400 P0001 INVALID_COST
       lignes avant = lignes après = 0 sur les 3 tables

   Trois enseignements, tous nécessaires à ce module :

     1. `anon` **détient** `EXECUTE` — sinon PostgreSQL aurait répondu `42501`
        (`permission denied for function`). Le droit vient de `PUBLIC`, comme
        l'explique `migrations/0001_…sql`.
     2. les fonctions **lèvent** des codes métier lisibles (`CARD_NOT_FOUND`,
        `INVALID_COST`), et `redeem` valide le coût **avant** de chercher la
        carte (c'est `INVALID_COST` qui sort, pas `CARD_NOT_FOUND`).
     3. aucune de ces deux sondes n'a écrit de ligne — les comptages avant/après
        sont identiques : le jeton n'existe pas et les tables sont vides.

   ---------------------------------------------------------------------------
   CE QUE CE MODULE NE FAIT PAS
   ---------------------------------------------------------------------------
   Il ne devine **aucun** code d'erreur au-delà des deux mesurés : un code
   inconnu retombe sur `inconnu`, et le message brut reste pour le journal —
   jamais affiché tel quel.
   ========================================================================== */

/** Noms RPC exacts (l'OpenAPI les expose sous `/rpc/<nom>`). */
export const NOM_ATTRIBUTION = 'award_loyalty_points'
export const NOM_ECHANGE = 'redeem_loyalty_reward'

/** Longueur mesurée de `loyalty_cards.card_token` (`maxLength: 64`). */
export const LONGUEUR_MAX_JETON = 64

/** Codes métier **mesurés**. Le reste est `inconnu` — on n'en invente pas. */
export const CODES_MESURES = Object.freeze({
  CARD_NOT_FOUND: 'carteInconnue',
  INVALID_COST: 'coutInvalide',
})

/** Erreur de saisie locale — levée avant tout appel réseau. */
export class ErreurArguments extends Error {
  constructor(champ, raison) {
    super(`RPC : « ${champ} » ${raison}`)
    this.name = 'ErreurArguments'
    this.champ = champ
  }
}

const entierPositif = (valeur) => Number.isInteger(valeur) && valeur >= 0

/** Vrai si la valeur ressemble à un jeton de carte exploitable. */
export function jetonValide(valeur) {
  return (
    typeof valeur === 'string' &&
    valeur.trim().length > 0 &&
    valeur.trim().length <= LONGUEUR_MAX_JETON
  )
}

/**
 * Construit l'appel d'attribution de points — **pur**, testable sans réseau.
 *
 * @param {{jeton: string, montant: number, points: number, personnel?: string}} saisie
 * @returns {{nom: string, args: Record<string, string|number>}}
 */
export function construireAttribution({ jeton, montant, points, personnel } = {}) {
  if (!jetonValide(jeton)) {
    throw new ErreurArguments('jeton', `doit faire 1 à ${LONGUEUR_MAX_JETON} caractères`)
  }
  if (typeof montant !== 'number' || !Number.isFinite(montant) || montant < 0) {
    throw new ErreurArguments('montant', 'doit être un nombre positif ou nul')
  }
  if (!entierPositif(points)) {
    throw new ErreurArguments('points', 'doit être un entier positif ou nul')
  }
  const args = {
    p_card_token: jeton.trim(),
    p_amount_spent: montant,
    p_points_to_add: points,
  }
  if (personnel) args.p_staff_id = personnel
  return { nom: NOM_ATTRIBUTION, args }
}

/**
 * Construit l'appel d'échange de récompense — **pur**, testable sans réseau.
 * `p_points_cost` est un **coût** : zéro n'a pas de sens, et la base le refuse
 * (`INVALID_COST`, mesuré).
 *
 * @param {{jeton: string, cout: number, libelle: string, personnel?: string}} saisie
 * @returns {{nom: string, args: Record<string, string|number>}}
 */
export function construireEchange({ jeton, cout, libelle, personnel } = {}) {
  if (!jetonValide(jeton)) {
    throw new ErreurArguments('jeton', `doit faire 1 à ${LONGUEUR_MAX_JETON} caractères`)
  }
  if (!Number.isInteger(cout) || cout < 1) {
    throw new ErreurArguments('cout', 'doit être un entier strictement positif')
  }
  if (typeof libelle !== 'string' || libelle.trim() === '') {
    throw new ErreurArguments('libelle', 'ne peut pas être vide')
  }
  const args = {
    p_card_token: jeton.trim(),
    p_points_cost: cout,
    p_reward_label: libelle.trim(),
  }
  if (personnel) args.p_staff_id = personnel
  return { nom: NOM_ECHANGE, args }
}

/** Clés i18n des états d'écran, par famille d'appel.
 *
 * Elles vivent **ici** et non dans les fichiers d'action : un module
 * `'use server'` ne peut exporter que des fonctions asynchrones, et `rpc.test.mjs`
 * doit pouvoir les importer pour vérifier qu'elles existent dans les trois
 * langues.
 */
export const CLES_ETAT_ATTRIBUTION = Object.freeze({
  ok: 'page.scanner.ok',
  jeton: 'page.scanner.erreurJeton',
  montant: 'page.scanner.erreurMontant',
  points: 'page.scanner.erreurPoints',
  carteInconnue: 'tableau.rpc.carteInconnue',
  coutInvalide: 'tableau.rpc.coutInvalide',
  configuration: 'tableau.rpc.configuration',
  indisponible: 'tableau.rpc.indisponible',
  inconnu: 'tableau.rpc.inconnu',
})

export const CLES_ETAT_ECHANGE = Object.freeze({
  ok: 'page.caisse.ok',
  jeton: 'page.caisse.erreurJeton',
  cout: 'page.caisse.erreurCout',
  libelle: 'page.caisse.erreurLibelle',
  carteInconnue: 'tableau.rpc.carteInconnue',
  coutInvalide: 'tableau.rpc.coutInvalide',
  configuration: 'tableau.rpc.configuration',
  indisponible: 'tableau.rpc.indisponible',
  inconnu: 'tableau.rpc.inconnu',
})

/**
 * Traduit une erreur PostgREST/Supabase en état d'écran.
 * Un code non mesuré n'est pas rapproché d'un cas connu au hasard.
 *
 * @param {{message?: string, code?: string}|null|undefined} erreur
 * @returns {{etat: 'ok'|'carteInconnue'|'coutInvalide'|'inconnu', code: string|null}}
 */
export function interpreterErreur(erreur) {
  if (!erreur) return { etat: 'ok', code: null }
  const message = typeof erreur.message === 'string' ? erreur.message : ''
  const cle = message.trim().split(/\s+/)[0]
  const etat = CODES_MESURES[cle]
  if (etat) return { etat, code: cle }
  return { etat: 'inconnu', code: typeof erreur.code === 'string' ? erreur.code : null }
}

/**
 * Appelle une RPC et rend un état, jamais une exception.
 *
 * Un `throw` dans un Server Action se traduit par une page d'erreur générique :
 * le commerçant perd le geste qu'il venait de faire, sans savoir pourquoi. On
 * rend donc l'état, et l'écran décide quoi en dire.
 *
 * @param {{rpc: (nom: string, args: object) => Promise<{data?: unknown, error?: object|null}>}} client
 * @param {{nom: string, args: Record<string, string|number>}} appel
 */
export async function appeler(client, { nom, args }) {
  try {
    const { data, error } = await client.rpc(nom, args)
    const { etat, code } = interpreterErreur(error)
    return { etat, code, donnees: data ?? null }
  } catch (erreur) {
    // Panne réseau ou configuration absente : ce n'est pas un refus métier.
    return {
      etat: 'indisponible',
      code: null,
      donnees: null,
      detail: erreur instanceof Error ? erreur.name : 'inconnu',
    }
  }
}
