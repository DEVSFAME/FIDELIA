'use server'

import { redirect } from 'next/navigation'
import { clientServeur } from '@/lib/supabase/server.mjs'
import { erreurConnexion } from '@/lib/validation-compte.mjs'

/**
 * Connexion par mot de passe.
 *
 * Trois règles, toutes non négociables :
 *
 *  1. **Message d'erreur unique.** « Identifiants refusés », quel que soit le
 *     motif réel (compte inconnu, mot de passe faux, email non confirmé). Un
 *     message plus précis transforme le formulaire en oracle : on énumère les
 *     comptes d'un commerce en quelques secondes. Écart **assumé** avec la
 *     cible, qui énumère (`email_not_confirmed`, `over_request_rate_limit`,
 *     `user_already_exists`…) dans `_next_static_chunks_app__auth__login_page-…js`.
 *  2. **Clés, pas de phrases.** L'action rend une clé de dictionnaire ; la
 *     traduction se fait à l'écran, sinon `/ar` afficherait du français. Une
 *     clé inconnue lève (`i18n/index.mjs`) au lieu de s'afficher.
 *  3. `redirect()` **hors** du `try`. Il fonctionne en levant une exception
 *     interne à Next ; l'attraper produirait un succès silencieux suivi d'un
 *     formulaire qui ne bouge pas.
 */
export async function seConnecter(_etat, donnees) {
  const email = String(donnees.get('email') ?? '').trim()
  const motDePasse = String(donnees.get('motDePasse') ?? '')

  const erreurSaisie = erreurConnexion({ email, motDePasse })
  if (erreurSaisie) return { erreur: erreurSaisie }

  let supabase
  try {
    supabase = await clientServeur()
  } catch {
    // Configuration absente ou invalide. On le dit — un formulaire muet ferait
    // chercher le problème du mauvais côté — sans jamais citer de valeur.
    return { erreur: 'auth.erreurConfiguration' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
  if (error) return { erreur: 'auth.connexion.refuses' }

  redirect('/dashboard')
}
