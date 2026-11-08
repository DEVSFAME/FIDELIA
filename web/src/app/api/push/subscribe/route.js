/* ============================================================================
   `/api/push/subscribe` — l'enregistrement d'un abonnement web push.

   Forme **mesurée** : le client de la page carte envoie
   `{ card_id, endpoint, p256dh, auth }` (module 61618 du chunk
   `app/card/[cardId]/page-198959ba….js`), et **désabonne** son abonnement
   navigateur si la réponse n'est pas `ok`.

   Quatre états, distincts à dessein :

     - **corps invalide** → `400 abonnementInvalide`. Refusé **avant** la base :
       un `endpoint` qui n'est pas une URL `https` n'a aucune chance de marcher,
       et le dire au client évite cinq retours réseau pour rien ;
     - **carte inconnue** → `404 carteInconnue` (`CARD_NOT_FOUND`, mesuré sur
       `0003`) — c'est le même cas que la page 404, pas une panne ;
     - **plafond atteint** → `409 plafondAtteint`. Cinq navigateurs par carte :
       au-delà, on refuse en le nommant plutôt que de remplir la table ;
     - **succès** → `200 { etat: 'ok' }`, `Cache-Control: no-store` (une réponse
       mémorisée ferait croire à un abonnement qui n'a pas eu lieu).

   Ce que cette route ne fait **pas** : envoyer une notification. Aucun émetteur
   n'existe (P0-4b) ; elle écrit une ligne, elle ne promet pas de livraison.
   ========================================================================== */

import { NextResponse } from 'next/server'

import { enregistrerAbonnementPush } from '@/lib/donnees.mjs'
import { abonnementDepuisAnalyse, analyserAbonnement } from '@/lib/push.mjs'

export const dynamic = 'force-dynamic'

/** Réponse JSON courte : cette route est appelée par un navigateur, pas par un écran. */
function refus(statut, etat) {
  return NextResponse.json({ etat }, { status: statut, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(requete) {
  let corps
  try {
    corps = await requete.json()
  } catch {
    // Un corps qui n'est pas du JSON n'est pas une panne : c'est un appel
    // qui n'a pas la forme attendue, et `400` le dit mieux que `500`.
    return refus(400, 'abonnementInvalide')
  }

  const lu = analyserAbonnement(corps)
  if (lu.etat !== 'ok') return refus(400, 'abonnementInvalide')

  const resultat = await enregistrerAbonnementPush(abonnementDepuisAnalyse(lu))

  if (resultat.etat === 'ok') {
    return NextResponse.json(
      { etat: 'ok', abonne: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (resultat.etat === 'introuvable') return refus(404, 'carteInconnue')
  if (resultat.etat === 'refuse' && resultat.code === 'TROP_D_ABONNEMENTS') {
    return refus(409, 'plafondAtteint')
  }
  if (resultat.etat === 'refuse' && resultat.code === 'ABONNEMENT_INVALIDE') {
    return refus(400, 'abonnementInvalide')
  }
  // `nonMigre` (0019 pas passée) et `indisponible` (base injoignable) se
  // réparent de la même façon côté client : réessayer plus tard.
  return refus(503, 'indisponible')
}
