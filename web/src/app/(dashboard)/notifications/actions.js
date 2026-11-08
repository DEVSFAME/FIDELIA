'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enfilerMessage } from '@/lib/donnees.mjs'
import { messageDepuisFormulaire, refusMessage } from '@/lib/messages.mjs'

/**
 * Met un message en file (`/notifications`, écart P0-4).
 *
 * Le formulaire est **sans JavaScript** : `action={envoyer}` suffit, et toute la
 * validation est refaite ici. Un `required`/`maxlength` HTML ne protège de rien
 * (il se retire en trois clics) mais évite un aller-retour dans le cas courant.
 *
 * DEUX DÉCISIONS QUI SE VOIENT
 * ----------------------------
 *  1. **Un refus à la fois, en clair.** Un `if` par code, une URL littérale par
 *     code : `etat-action.test.mjs` ne sait lire une valeur d'URL que si elle
 *     est littérale, et une valeur qu'il ne lit pas passerait pour un état que
 *     rien ne rend (donc pour un écran qui ment).
 *  2. **Aucune promesse d'envoi.** La fonction met en file à l'état
 *     `en_attente` ; rien dans ce socle n'a de canal pour la vider. Rediriger
 *     vers `?etat=envoye` serait le mensonge que cette page existe pour éviter.
 *
 * La redirection finale est **hors** de tout `try` : la fonction de Next lève
 * une exception interne, et l'attraper produirait un succès silencieux.
 */
export async function envoyer(donnees) {
  const message = messageDepuisFormulaire(donnees)
  const refus = refusMessage(message)

  if (refus.includes('titre')) redirect('/notifications?etat=titre')
  if (refus.includes('titreLong')) redirect('/notifications?etat=titreLong')
  if (refus.includes('corps')) redirect('/notifications?etat=corps')
  if (refus.includes('corpsLong')) redirect('/notifications?etat=corpsLong')
  if (refus.includes('lien')) redirect('/notifications?etat=lien')

  const resultat = await enfilerMessage(message)

  if (resultat.etat === 'ok') {
    // La file et le compteur du jour viennent de changer : l'écran doit relire,
    // sinon le message écrit n'apparaîtrait pas dans son propre historique.
    revalidatePath('/notifications')
    redirect('/notifications?etat=enfiler')
  }

  if (resultat.etat === 'nonMigre' || resultat.etat === 'configuration') {
    redirect('/notifications?etat=migration')
  }

  /* Les refus de la base sont nommés un par un : ce sont les mêmes bornes que
     `refusMessage`, tenues en base. S'ils sortent, l'écran et la fonction ont
     divergé — et l'état le dit, plutôt que d'afficher « la base ne répond pas ». */
  if (resultat.code === 'TITRE_TROP_COURT') redirect('/notifications?etat=titre')
  if (resultat.code === 'TITRE_TROP_LONG') redirect('/notifications?etat=titreLong')
  if (resultat.code === 'MESSAGE_TROP_COURT') redirect('/notifications?etat=corps')
  if (resultat.code === 'MESSAGE_TROP_LONG') redirect('/notifications?etat=corpsLong')
  if (resultat.code === 'LIEN_INVALIDE') redirect('/notifications?etat=lien')
  if (resultat.code === 'QUOTA_ATTEINT') redirect('/notifications?etat=quota')

  redirect('/notifications?etat=refus')
}
