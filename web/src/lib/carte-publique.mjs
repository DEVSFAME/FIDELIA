/* ============================================================================
   La carte publique — `/card/<cardId>`, la surface qui manquait à P0-2b.

   Source : `01_REA_Fidelix/_captures/2026-10-27-a3/mesure-a3.json`. Trois
   lectures anonymes, sans cookie :

       GET /card/<uuid_carte>    200   56 043 o   « Carte fidélité — <commerce> »
       GET /card/test            404   même page 404 que l'UUID nul
       GET /card/<uuid nul>      404

   Deux enseignements, et le second est une décision :

     1. la route est **publique** — le client final n'a pas de compte ;
     2. la clé est l'**UUID de la carte**, pas le code `C-XXXXXX`. C'est ce qui
        lève l'objection inscrite dans `join/[slug]/page.jsx` (« un second
        oracle de soldes ») : un UUID ne s'énumère pas, un code de six
        caractères si — et le code reste l'identifiant de **scan**.

   Ce module ne décide d'aucune valeur : il vérifie l'identifiant, refuse une
   réponse d'une autre forme, et met en mots ce que la base rend. Le calcul du
   prochain palier n'est pas refait ici — `programme.mjs` le fait déjà, et deux
   copies d'une même règle finissent par diverger.
   ========================================================================== */

import { jetonValide } from './rpc.mjs'

/** Forme d'un identifiant de carte : `loyalty_cards.id`, en minuscules en base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Vrai si la valeur peut être un identifiant de carte.
 *
 * La validation locale est une **défense en profondeur**, pas la règle : c'est
 * la fonction `carte_publique(uuid)` qui décide. On évite seulement d'envoyer
 * au réseau une chaîne que PostgreSQL refuserait en `22P02` — un code que
 * `donnees.mjs` traduirait en `indisponible`, donc en « la base ne répond pas »
 * pour une URL simplement mal orthographiée.
 *
 * @param {unknown} valeur
 */
export function identifiantCarteValide(valeur) {
  return typeof valeur === 'string' && UUID.test(valeur.trim())
}

/** Format mesuré de la cible : `new Date(m).toLocaleDateString("fr-FR", { month:
 *  "long", year: "numeric" })` → « novembre 2026 ». */
const FORMAT_MOIS = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * « Membre depuis » — le mois, jamais le jour : c'est ce que la cible affiche,
 * et un jour exact n'apporte rien à un client qui regarde sa carte.
 *
 * @param {unknown} iso
 * @returns {string} `''` si la valeur n'est pas une date — jamais « Invalid Date ».
 */
export function formaterDepuis(iso) {
  // `new Date(null)` vaut le 1ᵉʳ janvier 1970 — une date *valide*, donc un
  // « membre depuis janvier 1970 » parfaitement faux. On refuse l'entrée qui
  // n'est pas une chaîne avant de la convertir.
  if (typeof iso !== 'string' || iso.trim() === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return FORMAT_MOIS.format(date)
}

/**
 * Lit la réponse de `carte_publique(card_id)` (`0018`) pour l'écran.
 *
 * Rend `null` — et non un objet à moitié rempli — dès qu'un champ obligatoire
 * n'a pas la forme promise : « je n'ai pas compris la réponse » et « cette
 * carte n'existe pas » ne se corrigent pas au même endroit, et les confondre
 * afficherait une carte vide à un client qui a bien une carte (même règle que
 * `lireListeCartes`, `lireCaissesPubliques`).
 *
 * `paliers` est passé **tel quel** : `prochainPalier()` écarte déjà un coût non
 * entier ou nul. Revalider ici créerait une seconde règle pour la même donnée.
 *
 * @param {unknown} donnees
 * @returns {{id: string, code: string, points: number, prenom: string,
 *   nomCommerce: string, seuil: number|null, depuis: string,
 *   paliers: object[]}|null}
 */
export function lireCartePublique(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  if (!identifiantCarteValide(donnees.card_id)) return null
  if (!jetonValide(donnees.card_token)) return null
  if (!Number.isInteger(donnees.points) || donnees.points < 0) return null

  const programme = donnees.programme
  if (!programme || typeof programme !== 'object') return null
  if (typeof programme.nom !== 'string' || programme.nom.trim() === '') return null

  const seuil = Number.isInteger(programme.seuil) && programme.seuil > 0 ? programme.seuil : null

  return {
    id: String(donnees.card_id).trim().toLowerCase(),
    code: String(donnees.card_token).trim(),
    points: donnees.points,
    prenom: typeof donnees.prenom === 'string' ? donnees.prenom.trim() : '',
    nomCommerce: programme.nom.trim(),
    seuil,
    depuis: formaterDepuis(donnees.depuis),
    paliers: Array.isArray(donnees.paliers) ? donnees.paliers : [],
  }
}
