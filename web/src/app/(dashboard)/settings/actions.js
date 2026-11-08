'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enregistrerFiche } from '@/lib/donnees.mjs'
import { ficheDepuisFormulaire, refusFiche } from '@/lib/etablissement.mjs'

/**
 * Enregistre la fiche établissement (`/settings`, écart P0-2).
 *
 * Un refus par code, en clair et avec une URL **littérale** : `etat-action`
 * ne sait lire une valeur d'URL que si elle est écrite telle quelle, et une
 * valeur qu'il ne lit pas passerait pour un état que rien ne rend.
 *
 * La redirection finale est hors de tout `try` : l'exception interne de
 * `redirect()` attrapée produirait un succès silencieux et un formulaire figé.
 */
export async function enregistrer(donnees) {
  const fiche = ficheDepuisFormulaire(donnees)
  const refus = refusFiche(fiche)

  if (refus.includes('nom')) redirect('/settings?etat=nom')
  if (refus.includes('type')) redirect('/settings?etat=type')
  if (refus.includes('emplacement')) redirect('/settings?etat=emplacement')
  if (refus.includes('emplacementCourt')) redirect('/settings?etat=emplacementCourt')
  if (refus.includes('rayon')) redirect('/settings?etat=rayon')
  if (refus.includes('texte')) redirect('/settings?etat=texte')

  const resultat = await enregistrerFiche(fiche)

  if (resultat.etat === 'ok') {
    revalidatePath('/settings')
    redirect('/settings?etat=ok')
  }

  redirect(`/settings?etat=${resultat.etat === 'nonMigre' ? 'migration' : 'refus'}`)
}
