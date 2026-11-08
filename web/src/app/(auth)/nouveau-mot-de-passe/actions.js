'use server'

import { redirect } from 'next/navigation'
import { clientServeur } from '@/lib/supabase/server.mjs'
import { verifierNouveauMotDePasse } from '@/lib/validation-compte.mjs'

/**
 * Enregistrement du nouveau mot de passe, après vérification du lien de
 * récupération par `/auth/confirm`.
 *
 * Trois règles, toutes dans le même esprit que le reste du socle :
 *
 *  1. **Le serveur est l'autorité.** Le formulaire coche les trois règles en
 *     direct, mais `verifierNouveauMotDePasse` les rejoue ici — un champ
 *     `minlength` se contourne avec une requête forgée, et un mot de passe trop
 *     faible serait alors accepté par Supabase sans que rien ne le dise.
 *  2. **Un échec de session ne s'affiche pas sous un champ.** Une règle de mot
 *     de passe est locale et se corrige sur place ; une session morte ne se
 *     répare pas dans ce formulaire. Deux natures, deux endroits — d'où l'état
 *     de session dans l'URL, et non une clé de plus sous la bordure rouge.
 *  3. **La redirection reste hors du `try`.** Elle lève une exception interne à
 *     Next : l'attraper transformerait un succès en formulaire immobile.
 *
 * Destination en cas de succès : `/dashboard`. La session de récupération est
 * une session comme une autre, et le commerçant vient de prouver qu'il en a une
 * — le renvoyer vers `/login` lui ferait saisir une troisième fois le mot de
 * passe qu'il vient de choisir.
 *
 * ⚠️ Ne jamais citer la syntaxe de l'état ou de la redirection dans un
 * commentaire de ce fichier : le balayage de `etat-action.test.mjs` lit le texte
 * brut et prendrait la prose pour une production (§27.4). C'est la seule raison
 * pour laquelle les phrases ci-dessus parlent d'« état de session ».
 */
export async function enregistrerNouveauMotDePasse(_etat, donnees) {
  const motDePasse = String(donnees.get('motDePasse') ?? '')
  const confirmation = String(donnees.get('confirmation') ?? '')

  const { erreurs } = verifierNouveauMotDePasse({ motDePasse, confirmation })
  if (Object.keys(erreurs).length > 0) return { erreurs, succes: false }

  let supabase
  try {
    supabase = await clientServeur()
  } catch {
    return { erreurs: { general: 'auth.erreurConfiguration' }, succes: false }
  }

  let erreur = null
  try {
    const reponse = await supabase.auth.updateUser({ password: motDePasse })
    erreur = reponse.error
  } catch (levee) {
    // Le client lève sur une session illisible plutôt que de rendre `error` :
    // les deux mènent au même écran, et l'un n'est pas un bug de plus.
    erreur = levee
  }

  // Le chemin est écrit en littéral : c'est lui que lit le balayage de l'état,
  // et c'est ce qui prouve que la valeur atterrit sur une page qui la rend.
  if (erreur) redirect('/nouveau-mot-de-passe?etat=session')

  redirect('/dashboard')
}
