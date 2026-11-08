/* ============================================================================
   `/api/wallet/google/<token>` — le lien qu'un client touche (P0-5).

   Rôle unique : **rediriger** vers `pay.google.com/gp/v/save/<JWT>`. Aucun
   rendu, donc aucune valeur de style à vérifier au ledger — et rien à traduire.

   Trois états, distincts à dessein :

     - **drapeau éteint / configuration incomplète** → `503` JSON
       `walletIndisponible`. Ce n'est pas une carte inconnue : c'est le canal qui
       n'est pas branché. Les confondre ferait dire « cette carte n'existe pas » à
       un client dont la carte existe très bien.
     - **jeton inconnu** → `404` JSON `carteInconnue` (la RPC a répondu
       `CARD_NOT_FOUND`, mesuré sur `0003`).
     - **succès** → `307` vers Google, avec `Cache-Control: no-store` : un JWT
       signé a une durée de vie, et un lien mémorisé par un proxy finirait par
       servir un jeton expiré (`INVALID_JWT`).

   Ce que cette route ne fait **pas** : enregistrer l'objet chez Google. Le JWT
   suffit à créer le pass au moment du clic (`loyaltyObjects` dans `payload`).
   Écrire `wallet_member_id` ici serait faux — le client peut très bien ne pas
   confirmer l'enregistrement.
   ========================================================================== */

import { NextResponse } from 'next/server'

import { cartePourWallet } from '@/lib/donnees.mjs'
import {
  lireConfiguration,
  construireObjet,
  construireChargeUtile,
  signerJwt,
  lienEnregistrement,
} from '@/lib/google-wallet.mjs'

export const dynamic = 'force-dynamic'

/** Réponse JSON courte : cette route est appelée par un client, pas par un écran. */
function refus(statut, etat) {
  return NextResponse.json({ etat }, { status: statut, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_requete, { params }) {
  const { token } = await params
  const config = lireConfiguration(process.env)

  if (!config.pret) return refus(503, 'walletIndisponible')

  const lecture = await cartePourWallet(token)
  if (lecture.etat === 'introuvable') return refus(404, 'carteInconnue')
  if (lecture.etat !== 'ok') return refus(503, 'walletIndisponible')

  const carte = lecture.donnees
  if (!carte || typeof carte !== 'object' || !carte.card_token) {
    return refus(503, 'walletIndisponible')
  }

  const objet = construireObjet({
    issuerId: config.issuerId,
    cardId: carte.card_id,
    token: carte.card_token,
    points: carte.points,
    prenom: carte.prenom,
    programme: carte.programme,
  })

  let jwt
  try {
    jwt = signerJwt({
      charge: construireChargeUtile(objet),
      compte: config.compte,
      cle: config.cle,
      origine: config.origine,
    })
  } catch {
    /* Une clé mal collée est une panne d'exploitation, pas une erreur du client :
       on ne lui montre pas un message technique, et on ne fabrique pas un pass. */
    return refus(503, 'walletIndisponible')
  }

  return NextResponse.redirect(lienEnregistrement(jwt), {
    status: 307,
    headers: { 'Cache-Control': 'no-store' },
  })
}
