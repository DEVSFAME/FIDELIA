'use server'

import { redirect } from 'next/navigation'

import { clientServeur } from '@/lib/supabase/server.mjs'
import { normaliserCode } from '@/lib/carte.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { ErreurArguments, appeler, construireEchange } from '@/lib/rpc.mjs'

/**
 * Échange des points contre une récompense, puis revient sur la fiche.
 *
 * Le formulaire n'envoie que le **code** et le **coût**. L'intitulé de la
 * récompense est relu depuis le programme, pas repris du formulaire : un champ
 * caché se modifie en trois clics, et l'historique garderait trace d'une
 * récompense qui n'existe pas.
 *
 * Même raison que côté scanner pour la redirection : le solde affiché après
 * l'échange doit venir de la base, pas de ce que le navigateur croyait savoir.
 */
export async function echangerRecompense(donnees) {
  const jeton = normaliserCode(donnees.get('jeton'))
  const cout = Number(donnees.get('cout'))
  const retour = `/caisse?code=${encodeURIComponent(jeton)}`

  const programme = await programmeDuCommerce()
  const palier =
    programme.etat === 'ok'
      ? (programme.donnees.paliers ?? []).find((p) => p.cout === cout)
      : null

  if (!palier) redirect(`${retour}&etat=arguments`)

  let appel
  try {
    appel = construireEchange({ jeton, cout: palier.cout, libelle: palier.libelle })
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
    const solde = resultat.donnees?.new_balance
    redirect(`${retour}&etat=ok${Number.isFinite(solde) ? `&solde=${solde}` : ''}`)
  }

  redirect(`${retour}&etat=${resultat.etat === 'carteInconnue' ? 'introuvable' : 'refus'}`)
}
