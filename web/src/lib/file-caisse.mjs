/* ============================================================================
   File d'attente de la caisse — le contrat, sans navigateur.

   Mesuré sur la cible (`tools/rea/relever-caisse.mjs`, A4) : magasin
   `file_attente`, FIFO par `cree_le`, rejeu toutes les **65 000 ms**, et
   **trois issues** par élément — retiré (2xx), jeté (400/403/404/422), conservé
   (tout le reste). Une panne réseau n'incrémente aucune tentative : elle n'a
   rien dit de l'opération. « Bloqué » (≥ 3) n'abandonne rien, ça compte.

   Ce que la cible fait et que nous refusons : **échanger** une récompense hors
   ligne. Le solde d'un échange dépend de ce que les autres caisses ont écrit ;
   créditer est additif et rejouable avec une clé, échanger ne l'est pas.
   ========================================================================== */

import { codeCarteValide, normaliserCode } from './carte.mjs'

/** Base IndexedDB, magasin et version — la nôtre, pas `fidelix-caisse`. */
export const BASE_FILE = 'fidelia-caisse'
export const VERSION_FILE = 1
export const MAGASIN_FILE = 'file_attente'

/** Cadence de rejeu mesurée sur la cible (A4 : « rejeu 65 s »). */
export const DELAI_REJEU_MS = 65_000

/** Au-delà, l'élément est *signalé* comme bloqué — jamais abandonné. */
export const SEUIL_BLOQUE = 3

/** Les seuls codes qui disent « ne réessaie pas » (A4, mesurés). */
export const STATUTS_ECARTES = Object.freeze([400, 403, 404, 422])

/** RPC d'écriture idempotente (`migrations/0016_operations_caisse.sql`). */
export const NOM_RPC_OPERATION = 'enregistrer_operation_caisse'

/** Forme d'un identifiant d'opération — `crypto.randomUUID()`, vérifié. */
const FORME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Construit un élément de file. L'identifiant est **créé à l'enfilage** et ne
 * change plus : le rejeu renvoie le même, c'est ce qui rend l'écriture
 * idempotente. Générer l'identifiant au renvoi créditerait deux fois.
 *
 * @param {{jeton?: string, montant?: unknown, points?: unknown, id?: string, creeLe?: string}} saisie
 * @returns {{etat: 'ok', operation: object} | {etat: 'refus', champ: string}}
 */
export function nouvelleOperation({ jeton, montant, points, id, creeLe } = {}) {
  const code = normaliserCode(jeton)
  if (!codeCarteValide(code)) return { etat: 'refus', champ: 'jeton' }

  const valeurMontant = Number(montant)
  if (!Number.isFinite(valeurMontant) || valeurMontant < 0) {
    return { etat: 'refus', champ: 'montant' }
  }

  const valeurPoints = Number(points)
  if (!Number.isInteger(valeurPoints) || valeurPoints < 0) {
    return { etat: 'refus', champ: 'points' }
  }

  if (typeof id !== 'string' || !FORME_ID.test(id)) return { etat: 'refus', champ: 'id' }

  return {
    etat: 'ok',
    operation: {
      id,
      jeton: code,
      montant: valeurMontant,
      points: valeurPoints,
      creeLe: typeof creeLe === 'string' && creeLe !== '' ? creeLe : new Date().toISOString(),
      tentatives: 0,
      bloque: false,
    },
  }
}

/**
 * Destin d'un élément selon le statut HTTP du rejeu.
 * @param {number} [statut] absent = la requête n'a pas abouti (réseau)
 * @returns {'retiree'|'ecartee'|'conservee'}
 */
export function issueRejeu(statut) {
  if (Number.isInteger(statut) && statut >= 200 && statut < 300) return 'retiree'
  if (STATUTS_ECARTES.includes(statut)) return 'ecartee'
  return 'conservee'
}

/**
 * Nouvel état de l'élément après un rejeu.
 *
 * `operation: null` quand l'élément quitte la file (retiré ou jeté) ; sinon
 * l'élément revient avec son compteur — incrémenté **seulement** si le serveur
 * a répondu (400+), jamais sur une coupure réseau.
 *
 * @param {{tentatives?: number}} operation
 * @param {{statut?: number}} [reponse]
 */
export function apresRejeu(operation, { statut } = {}) {
  const issue = issueRejeu(statut)
  if (issue !== 'conservee') return { issue, operation: null }

  const repondu = Number.isInteger(statut) && statut >= 400
  const tentatives = (Number.isInteger(operation?.tentatives) ? operation.tentatives : 0) +
    (repondu ? 1 : 0)

  return {
    issue,
    operation: { ...operation, tentatives, bloque: tentatives >= SEUIL_BLOQUE },
  }
}

/**
 * Délai avant le prochain rejeu, ou `null` s'il n'y a rien à rejouer.
 * La file ne tourne pas à vide : c'est la même règle que le minuteur de la
 * cible, replanifié seulement si `restantes > 0 && navigator.onLine`.
 */
export function prochainDelai({ restantes = 0, enLigne = true } = {}) {
  return restantes > 0 && enLigne ? DELAI_REJEU_MS : null
}

/**
 * File dans l'ordre de départ : plus ancien d'abord, identifiant en second.
 * L'ordre est **total** — deux éléments créés dans la même milliseconde ne
 * peuvent pas s'échanger d'un rejeu à l'autre.
 */
export function ordonner(file) {
  return [...(Array.isArray(file) ? file : [])].sort((a, b) => {
    const date = String(a?.creeLe ?? '').localeCompare(String(b?.creeLe ?? ''))
    return date !== 0 ? date : String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
}

/** Nombre d'éléments revenus `SEUIL_BLOQUE` fois sans réponse exploitable. */
export function compterBloquees(file) {
  return (Array.isArray(file) ? file : []).filter((element) => element?.bloque === true).length
}

/**
 * Corps JSON échangé entre le navigateur et `POST /api/caisse/operation`.
 * Les noms sont ceux des paramètres de la RPC : un seul vocabulaire.
 */
export function corpsRequete(operation) {
  return {
    operationId: operation.id,
    jeton: operation.jeton,
    montant: operation.montant,
    points: operation.points,
  }
}

/** Statut HTTP que l'écran reçoit pour chaque état d'écriture. */
export const STATUTS_ETAT = Object.freeze({
  ok: 200,
  arguments: 400,
  carteInconnue: 404,
  refus: 422,
  migration: 503,
  configuration: 503,
  indisponible: 502,
  inconnu: 502,
})
