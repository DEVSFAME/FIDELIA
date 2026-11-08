'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enregistrerReglages } from '@/lib/donnees.mjs'
import {
  creditsDepuisPointsParTranche,
  refusReglages,
  reglagesDepuisFormulaire,
} from '@/lib/programme.mjs'

/**
 * Enregistre les sept réglages du programme (`/program`, écart P0-1).
 *
 * Le formulaire est **sans JavaScript** : `action={enregistrer}` posé sur le
 * `<form>` suffit, et la validation se fait ici, côté serveur. Un `required`
 * HTML ne protège de rien — il se retire en trois clics — mais il évite un
 * aller-retour dans le cas courant, et c'est pour ça qu'il est posé aussi.
 *
 * TROIS DÉCISIONS QUI SE VOIENT DANS LA FORME
 * -------------------------------------------
 *  1. **Un refus à la fois, en clair.** `refusReglages` rend ses codes dans un
 *     ordre fixe ; chaque cas est écrit en toutes lettres — un `if` par code,
 *     une URL littérale par code — plutôt que composé depuis le tableau. Ce
 *     n'est pas de la verbosité : `etat-action.test.mjs` ne sait lire une
 *     valeur d'URL que si elle est littérale, et une valeur qu'il ne lit pas
 *     passerait pour un état que rien ne rend, donc pour un écran qui ment.
 *  2. **Le taux est converti ici, une fois.** L'écran parle « points par 10 »,
 *     la base parle « points par euro » (`credits_par_euro`, lue par la
 *     caisse). `creditsDepuisPointsParTranche` rend `null` sur un barème non
 *     représentable ; on refuse alors au lieu d'envoyer un `null` à une colonne
 *     `not null`.
 *  3. **Aucune écriture de slug, de nom, de seuil ni de palier.** C'est le
 *     travail de `enregistrer_programme` (l'onglet « Récompenses »), et une
 *     page de réglages qui réécrirait le programme effacerait des paliers sans
 *     le dire.
 *
 * La redirection finale est **hors** de tout `try` : la fonction de Next lève
 * une exception interne, et l'attraper produirait un succès silencieux suivi
 * d'un formulaire figé.
 */
export async function enregistrer(donnees) {
  const reglages = reglagesDepuisFormulaire(donnees)
  const refus = refusReglages(reglages)

  if (refus.includes('devise')) redirect('/program?etat=devise')
  if (refus.includes('points')) redirect('/program?etat=points')
  if (refus.includes('minimum')) redirect('/program?etat=minimum')
  if (refus.includes('expiration')) redirect('/program?etat=expiration')
  if (refus.includes('parrainage')) redirect('/program?etat=parrainage')
  if (refus.includes('avisPoints')) redirect('/program?etat=avisPoints')
  if (refus.includes('avisActif')) redirect('/program?etat=avisActif')
  if (refus.includes('avisLien')) redirect('/program?etat=avisLien')
  if (refus.includes('avisSansLien')) redirect('/program?etat=avisSansLien')

  const creditsParEuro = creditsDepuisPointsParTranche(reglages.pointsParTranche)
  if (creditsParEuro === null) redirect('/program?etat=points')

  const resultat = await enregistrerReglages({ ...reglages, creditsParEuro })

  if (resultat.etat === 'ok') {
    // Le barème vient de changer : `/rewards` affiche son aide calculée à
    // partir du taux, et `/scan` crédite avec. Les deux doivent relire.
    revalidatePath('/program')
    revalidatePath('/rewards')
    redirect('/program?etat=ok')
  }

  redirect(`/program?etat=${resultat.etat === 'nonMigre' ? 'migration' : 'refus'}`)
}
