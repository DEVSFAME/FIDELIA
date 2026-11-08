'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { clientServeur } from '@/lib/supabase/server.mjs'
import { verifierInscription } from '@/lib/validation-compte.mjs'
import { REFERENCE_CNDP } from '@/lib/reinitialisation.mjs'
import { origineDepuisEntetes, urlConfirmation } from '@/lib/confirmation.mjs'

/**
 * Inscription d'un commerce.
 *
 * Ce que la cible fait, et qu'on reproduit (`_next_static_chunks_app__auth__register_page-…js`) :
 *
 *  - `supabase.auth.signUp` avec quatre clés de `user_metadata` — `full_name`,
 *    `phone`, `consentement_cndp_le`, `consentement_cndp_version`. Ce sont des
 *    métadonnées, pas des colonnes : aucune des tables mesurées n'en porte, et
 *    en inventer une contredirait le modèle relevé en A1.
 *  - **Un seul message d'échec**, quel que soit le motif. La cible le fait déjà
 *    (« Impossible de créer le compte avec ces informations… ») et c'est aussi
 *    ce qui empêche le formulaire de devenir un oracle d'existence de compte.
 *
 * Ce qu'elle fait et qu'on ne peut pas reprendre tel quel :
 *  - `emailRedirectTo: "/auth/confirm?next=/onboarding"` — le **chemin** est
 *    repris (la route existe depuis cette tâche), `next` ne l'est pas :
 *    `/onboarding` n'existe pas dans ce socle, et accepter un `next` arbitraire
 *    ouvrirait une redirection ouverte. On envoie l'URL **absolue**, sans quoi
 *    Supabase retombe sur l'URL de site du projet : en local, le lien pointerait
 *    ailleurs. L'origine vient de `NEXT_PUBLIC_SITE_URL` ou, à défaut, des
 *    en-têtes de la requête (`origineDepuisEntetes`).
 *  - `toast` + `router.push` — on n'a ni bibliothèque de toasts ni route
 *    d'accueil post-inscription ; l'état de succès est rendu par le formulaire
 *    (même phrase, même écran), et la session éventuelle va au tableau de bord.
 *
 * `redirect()` reste **hors** du `try` : il lève une exception interne à Next,
 * l'attraper transformerait un succès en formulaire immobile.
 */
export async function sInscrire(_etat, donnees) {
  const saisie = {
    nom: donnees.get('nom'),
    email: donnees.get('email'),
    telephone: donnees.get('telephone'),
    motDePasse: donnees.get('motDePasse'),
    confirmation: donnees.get('confirmation'),
    consentement: donnees.get('consentement') === 'oui',
  }

  const { erreurs, valeurs } = verifierInscription(saisie)
  if (Object.keys(erreurs).length > 0) return { erreurs, valeurs, succes: null }

  let supabase
  let origine = null
  try {
    supabase = await clientServeur()
    // L'origine lue ici décide de l'hôte du lien envoyé par courriel : une
    // `NEXT_PUBLIC_SITE_URL` mal formée doit donc échouer **maintenant**, avec
    // le message de configuration, plutôt que d'expédier des liens perdus.
    origine = origineDepuisEntetes(await headers())
  } catch {
    return { erreurs: { general: 'auth.erreurConfiguration' }, valeurs, succes: null }
  }

  const metadonnees = {
    full_name: valeurs.nom,
    phone: valeurs.telephone,
    consentement_cndp_le: new Date().toISOString(),
    consentement_cndp_version: REFERENCE_CNDP,
  }

  // Sans origine connue, on **omet** l'option : Supabase retombe sur l'URL de
  // site du projet. C'est un lien valide (peut-être pas le nôtre), jamais mort.
  const options =
    origine === null
      ? { data: metadonnees }
      : { data: metadonnees, emailRedirectTo: urlConfirmation(origine) }

  const { data, error } = await supabase.auth.signUp({
    email: valeurs.email,
    password: saisie.motDePasse,
    options,
  })

  if (error) return { erreurs: { general: 'auth.inscription.erreurGenerique' }, valeurs, succes: null }

  // Confirmation d'email désactivée sur le projet : la session existe déjà.
  if (data.session) redirect('/dashboard')

  return { erreurs: {}, valeurs, succes: valeurs.email }
}
