'use server'

import { redirect } from 'next/navigation'

import {
  caisseChoisie,
  caisseDemandee,
  designationPerdue,
  lireCaissesPubliques,
  repriseSansCaisse,
} from '@/lib/adhesion.mjs'
import { caissesPubliques, rejoindre as rejoindreProgramme } from '@/lib/donnees.mjs'
import { normaliserSlug, slugValide } from '@/lib/programme.mjs'

/**
 * Adhésion publique — le seul écran que voit le **client final**.
 *
 * Aucune donnée demandée : ni nom, ni email, ni téléphone. C'est la promesse
 * mesurée sur la cible, et elle est tenue par la base (le client est créé
 * anonyme, seules `first_name`/`last_name` restent vides).
 *
 * LE CHOIX DE LA CAISSE (mesuré, `p17-join.html`) traverse ce fichier en trois
 * temps, et chacun a une raison :
 *
 *   1. **la liste est relue** au moment du geste. Ce n'est pas de la défiance
 *      envers le navigateur, c'est la seule façon de tenir « une caisse
 *      proposée est une caisse acceptée » : un identifiant absent de cette
 *      lecture (caisse supprimée, champ falsifié) n'atteint pas la fonction ;
 *   2. **la désignation ne fait jamais perdre la carte.** `0007` refuse une
 *      caisse inconnue avant d'écrire ; si la course se produit quand même
 *      (suppression entre l'affichage et l'envoi), on rejoue **une** fois sans
 *      elle plutôt que de rendre une page d'échec à un client qui n'a rien fait
 *      de mal. C'est le même principe que la caisse désactivée, acceptée là-bas ;
 *   3. **la perte se dit.** `?sansDesignation=1` sur l'URL de succès : le client
 *      voit sa carte *et* la raison pour laquelle son choix n'y figure pas. Un
 *      abandon silencieux serait exactement le défaut que ce socle refuse.
 *
 * Après succès, on **redirige** vers la même page avec le code dans l'URL :
 * un rafraîchissement ne crée pas une seconde carte (le `POST` disparaît), et
 * le client peut mettre l'écran en favori ou le montrer au comptoir.
 */
export async function rejoindreCarte(donnees) {
  const slug = normaliserSlug(donnees.get('slug'))
  if (!slugValide(slug)) redirect('/')

  const demandee = caisseDemandee(donnees.get('caisse'))
  const liste = lireCaissesPubliques((await caissesPubliques(slug)).donnees)
  const choisie = caisseChoisie(liste, demandee)

  let resultat = await rejoindreProgramme(slug, choisie)
  let perdue = designationPerdue(demandee, choisie)

  if (repriseSansCaisse(resultat)) {
    resultat = await rejoindreProgramme(slug)
    perdue = designationPerdue(demandee, null)
  }

  if (resultat.etat === 'ok') {
    const code = encodeURIComponent(resultat.donnees.card_token)
    redirect(
      perdue
        ? `/join/${slug}?carte=${code}&sansDesignation=1`
        : `/join/${slug}?carte=${code}`
    )
  }

  const etat =
    resultat.etat === 'nonMigre'
      ? 'migration'
      : resultat.etat === 'introuvable' || resultat.code === 'PROGRAM_NOT_FOUND'
        ? 'ferme'
        : 'indisponible'

  redirect(`/join/${slug}?etat=${etat}`)
}

