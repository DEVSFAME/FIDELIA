'use server'

import { headers } from 'next/headers'
import { clientServeur } from '@/lib/supabase/server.mjs'
import { erreurDemandeReinitialisation } from '@/lib/validation-compte.mjs'
import { origineDepuisEntetes, urlReinitialisation } from '@/lib/confirmation.mjs'

/**
 * Demande de lien de réinitialisation.
 *
 * La cible `POST` `/api/auth/reinitialiser` et ne traite que **deux** statuts :
 * `429` (limitation de débit) et `403` (contrôle navigateur) ; tout le reste —
 * y compris une panne réseau — mène au même écran « Email envoyé ». C'est
 * délibéré : l'écran ne doit pas dire si l'adresse existe.
 *
 * On reproduit ce comportement avec `resetPasswordForEmail` :
 *   - erreur `429` → message de débit (mesuré, mot pour mot) ;
 *   - toute autre erreur → succès neutre. Un formulaire qui affiche « échec »
 *     seulement pour une adresse inconnue est un oracle, et c'est exactement
 *     ce qu'on vient d'éviter ailleurs.
 *
 * Le contrôle `403` de la cible (empreinte de navigateur) n'a pas d'équivalent
 * ici : il n'y a pas de fournisseur anti-bot dans ce socle. Écart déclaré.
 *
 * **Le lien doit revenir chez nous.** Sans `redirectTo`, Supabase substitue
 * l'URL de site du projet : le `?code=` atterrit sur `/`, personne ne l'échange,
 * et le commerçant voit la page d'accueil — un lien mort qui n'a l'air de rien.
 * On envoie donc l'URL de `/auth/confirm` **avec le marqueur de flux**
 * (`urlReinitialisation`) : c'est ce marqueur qui fera atterrir la session
 * vérifiée sur l'écran de saisie plutôt que sur le tableau de bord.
 *
 * Pas de `redirect()` : la page affiche l'état de succès, comme la cible
 * (qui reste sur `/forgot-password`).
 */
export async function demanderReinitialisation(_etat, donnees) {
  const email = String(donnees.get('email') ?? '').trim()

  const erreurSaisie = erreurDemandeReinitialisation({ email })
  if (erreurSaisie) return { erreur: erreurSaisie, succes: false, email: '' }

  let supabase
  let redirectTo = null
  try {
    supabase = await clientServeur()
    // L'origine décide de l'hôte du lien **et** de son retour. Une
    // `NEXT_PUBLIC_SITE_URL` mal formée doit échouer ici, pas expédier des
    // liens perdus : `origineDepuisEntetes` lève dans ce cas.
    redirectTo = urlReinitialisation(origineDepuisEntetes(await headers()))
  } catch {
    return { erreur: 'auth.erreurConfiguration', succes: false, email: '' }
  }

  // Sans origine connue, l'option est **omise** : Supabase retombe sur l'URL de
  // site du projet. Le lien reste valide, mais il ne portera pas le marqueur de
  // flux — c'est le seul cas où l'écran de saisie ne serait pas atteint, et il
  // est visible dans les journaux, pas deviné ici.
  const options = redirectTo === null ? {} : { redirectTo }

  const { error } = await supabase.auth.resetPasswordForEmail(email, options)

  if (error && error.status === 429) {
    return { erreur: 'auth.oubli.tropDeDemandes', succes: false, email: '' }
  }

  return { erreur: null, succes: true, email }
}
