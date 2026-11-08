/* ============================================================================
   Configuration Supabase — validation **pure**, sans réseau.

   Deux invariants, appris de R1.2 (le durcissement ACL/RLS) et transposés au
   client :

   1. **La clé `service_role` ne franchit jamais `NEXT_PUBLIC_*`.** Un
      `service_role` collé par erreur dans une variable publique est embarqué
      dans le bundle : il contourne toute RLS et tout `REVOKE`. On ne se
      contente donc pas de lire la variable, on **inspecte le JWT** (`role`).
   2. **Un message d'erreur ne cite jamais la valeur.** Nommer la variable
      suffit à corriger ; recopier le secret dans les logs le diffuse.

   Noms de variables **mesurés** dans `env.supabase.md` (gitignoré) :
     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
     SUPABASE_SERVICE_ROLE_KEY.
   ========================================================================== */

export const NOM_URL = 'NEXT_PUBLIC_SUPABASE_URL'
export const NOM_CLE_PUBLIQUE = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
export const NOM_CLE_SERVEUR = 'SUPABASE_SERVICE_ROLE_KEY'

/** Erreur de configuration : le message nomme la variable, jamais sa valeur. */
export class ErreurConfiguration extends Error {
  constructor(variable, raison) {
    super(`Configuration Supabase : ${variable} ${raison}`)
    this.name = 'ErreurConfiguration'
    this.variable = variable
  }
}

/** Décode une chaîne base64 (ou base64url) en texte, sans `Buffer`.
 *  `atob` existe dans Node 18+ **et** dans le navigateur : le module reste
 *  importable des deux côtés sans polyfill. */
function decoderBase64(texte) {
  const binaire = atob(texte)
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(octets)
}

/** Décode la charge utile d'un JWT sans vérifier la signature — pour lire `role`. */
export function chargeJwt(jeton) {
  if (typeof jeton !== 'string') return null
  const morceaux = jeton.split('.')
  if (morceaux.length !== 3) return null
  try {
    const base64 = morceaux[1].replace(/-/g, '+').replace(/_/g, '/')
    const rembourre = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const charge = JSON.parse(decoderBase64(rembourre))
    return charge && typeof charge === 'object' ? charge : null
  } catch {
    return null
  }
}

/** Rôle déclaré par un jeton Supabase, ou `null` si ce n'est pas un JWT lisible. */
export function roleDuJeton(jeton) {
  return chargeJwt(jeton)?.role ?? null
}

/** Vrai si la valeur est (ou prétend être) une clé `service_role`. */
export function estCleService(jeton) {
  return roleDuJeton(jeton) === 'service_role'
}

/**
 * Refuse une URL qui n'est pas une origine `https` exploitable.
 * `http` n'est toléré que sur `localhost` / `127.0.0.1` (développement).
 *
 * `nom` sert uniquement au message d'erreur : `NEXT_PUBLIC_SITE_URL` (origine
 * des liens de confirmation) passe par la même règle, et une erreur qui
 * désignerait `NEXT_PUBLIC_SUPABASE_URL` enverrait chercher la faute du mauvais
 * côté. La valeur par défaut garde le contrat d'origine.
 */
export function validerUrl(valeur, nom = NOM_URL) {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new ErreurConfiguration(nom, 'est absente')
  }
  let url
  try {
    url = new URL(valeur.trim())
  } catch {
    throw new ErreurConfiguration(nom, "n'est pas une URL absolue")
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ErreurConfiguration(nom, 'doit être en https (http toléré en local)')
  }
  return url.origin
}

/**
 * Valide la clé publique : présente, et **pas** `service_role`.
 * Le test de rôle est la seule protection réelle : une clé `anon` et une clé
 * `service_role` ont exactement la même forme.
 */
export function validerClePublique(valeur) {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new ErreurConfiguration(NOM_CLE_PUBLIQUE, 'est absente')
  }
  if (estCleService(valeur.trim())) {
    throw new ErreurConfiguration(
      NOM_CLE_PUBLIQUE,
      'contient un JWT de rôle « service_role » : cette clé contourne RLS et REVOKE, elle ne doit jamais être publique'
    )
  }
  return valeur.trim()
}

/**
 * Lit et valide la configuration publique.
 * @param {Record<string, string|undefined>} [env]
 * @returns {{url: string, clePublique: string}}
 */
export function lireConfigPublique(env = process.env) {
  const url = validerUrl(env?.[NOM_URL])
  const clePublique = validerClePublique(env?.[NOM_CLE_PUBLIQUE])
  return Object.freeze({ url, clePublique })
}

/**
 * Erreur si une variable **publique** porte une clé de service.
 * Appelé au démarrage du serveur : mieux vaut un refus net qu'une fuite.
 * @param {Record<string, string|undefined>} [env]
 * @returns {string[]} noms des variables fautives (jamais leur valeur)
 */
export function variablesPubliquesCompromises(env = process.env) {
  return Object.entries(env ?? {})
    .filter(([nom]) => nom.startsWith('NEXT_PUBLIC_'))
    .filter(([, valeur]) => estCleService(valeur))
    .map(([nom]) => nom)
}

/** Lève si une variable publique porte une clé de service. */
export function refuserFuiteService(env = process.env) {
  const fautives = variablesPubliquesCompromises(env)
  if (fautives.length > 0) {
    throw new ErreurConfiguration(
      fautives.join(', '),
      'expose(nt) un JWT « service_role » au navigateur'
    )
  }
}
