'use server'

import { redirect } from 'next/navigation'

import { clientServeur } from '@/lib/supabase/server.mjs'
import { normaliserCode } from '@/lib/carte.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { pointsDepuisMontant } from '@/lib/programme.mjs'
import { ErreurArguments, NOM_ATTRIBUTION, appeler, construireAttribution } from '@/lib/rpc.mjs'

/**
 * Crédite des points sur une carte, puis **revient sur la fiche** de cette carte.
 *
 * Pourquoi une redirection plutôt qu'un état local : après l'appel, le solde
 * affiché doit être celui de la base, pas celui que le navigateur croit. Un
 * retour sur `/scan?code=…` fait relire la carte par la RPC de lecture — le
 * commerçant voit le vrai solde, même si une autre caisse a écrit entre-temps.
 *
 * `redirect()` est **hors** du `try` : il lève une exception interne à Next, et
 * l'attraper produirait un succès silencieux suivi d'un écran figé.
 */
export async function crediterPoints(donnees) {
  const jeton = normaliserCode(donnees.get('jeton'))
  const montant = Number(donnees.get('montant'))
  const retour = `/scan?code=${encodeURIComponent(jeton)}`

  /* Les points sont **facultatifs** : laissé vide, le barème du programme
     (`credits_par_euro`, migration `0008`) les calcule. C'est la raison d'être
     du réglage — sans cette lecture, le taux serait une décoration dans l'écran
     Programme, et la caisse continuerait de saisir deux nombres sans lien.

     `Number('')` vaut `0`, et zéro point est une valeur *légitime* (un achat
     peut ne rien rapporter). On distingue donc les deux cas sur la chaîne, pas
     sur le nombre : vide = « calcule », `0` = « n'en donne aucun ». */
  const pointsSaisis = String(donnees.get('points') ?? '').trim()
  let points
  if (pointsSaisis === '') {
    /* `frais: true` — **jamais** la mémoire courte (dix secondes, cf.
       `lib/cache.mjs`). Ce chemin écrit : un barème périmé créditerait le
       mauvais nombre de points, et rien à l'écran ne le montrerait. Le cache
       existe pour l'affichage, pas pour la caisse. */
    const programme = await programmeDuCommerce({ frais: true })
    const taux =
      programme.etat === 'ok' ? Number(programme.donnees?.credits_par_euro ?? 1) : 1
    points = pointsDepuisMontant(montant, Number.isFinite(taux) && taux > 0 ? taux : 1)
  } else {
    points = Number(pointsSaisis)
  }

  let appel
  try {
    appel = construireAttribution({ jeton, montant, points })
  } catch (erreur) {
    if (erreur instanceof ErreurArguments) redirect(`${retour}&etat=arguments`)
    redirect(`${retour}&etat=indisponible`)
  }

  let client
  try {
    client = await clientServeur()
  } catch {
    redirect(`${retour}&etat=configuration`)
  }

  const resultat = await appeler(client, appel)
  if (resultat.etat === 'ok') {
    // Le solde rendu par la RPC est déjà la vérité : on le passe en clair pour
    // que l'écran l'affiche même si la relecture échoue juste après.
    const solde = resultat.donnees?.new_balance
    redirect(`${retour}&etat=ok${Number.isFinite(solde) ? `&solde=${solde}` : ''}`)
  }

  redirect(`${retour}&etat=${resultat.etat === 'carteInconnue' ? 'introuvable' : 'refus'}`)
}
