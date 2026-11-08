/* ============================================================================
   Client Supabase — serveur (RSC, Server Actions, Route Handlers).

   `cookies()` est **asynchrone** depuis Next 15 : l'oublier rend un client sans
   session et toutes les lectures retombent en `anon`. D'où l'`await` — et la
   fonction est elle-même `async`.

   Le `try/catch` autour de `setAll` n'est pas de la timidité : dans un Server
   Component, l'écriture de cookie est interdite et lève. La session est alors
   rafraîchie par `proxy.js`, qui, lui, peut écrire. Sans ce `catch`, chaque
   rendu serveur authentifié planterait.
   ========================================================================== */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { lireConfigPublique } from './config.mjs'

/**
 * Client serveur lié à la requête courante.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function clientServeur() {
  const magasin = await cookies()
  const { url, clePublique } = lireConfigPublique()

  return createServerClient(url, clePublique, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (liste) => {
        try {
          for (const { name, value, options } of liste) {
            magasin.set(name, value, options)
          }
        } catch {
          // Server Component : écriture impossible. `proxy.js` rafraîchit la
          // session sur la requête suivante. Ne rien faire est le comportement
          // documenté de `@supabase/ssr`.
        }
      },
    },
  })
}
