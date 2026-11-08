/* ============================================================================
   Client Supabase — navigateur.

   La clé utilisée est **toujours** la clé publique validée par `config.mjs` ;
   `service_role` est refusée en amont. Le client est mémorisé par couple
   (url, clé) : instancier un client par rendu réouvrirait un canal Realtime à
   chaque navigation.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js'
import { lireConfigPublique } from './config.mjs'

const cache = new Map()

/**
 * Client navigateur (singleton par configuration).
 * @param {Record<string, string|undefined>} [env]
 */
export function clientNavigateur(env) {
  const { url, clePublique } = lireConfigPublique(
    env ?? (typeof process !== 'undefined' ? process.env : {})
  )
  const marque = `${url}|${clePublique}`
  if (!cache.has(marque)) {
    cache.set(
      marque,
      createClient(url, clePublique, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    )
  }
  return cache.get(marque)
}

/** Vide le cache (tests, changement de configuration à chaud). */
export function oublierClients() {
  cache.clear()
}
