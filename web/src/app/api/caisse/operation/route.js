import { NextResponse } from 'next/server'

import { clientServeur } from '@/lib/supabase/server.mjs'
import { NOM_RPC_OPERATION, STATUTS_ETAT, nouvelleOperation } from '@/lib/file-caisse.mjs'
import { interpreterErreur } from '@/lib/rpc.mjs'

/* Le seul chemin d'écriture utilisable **par la file hors ligne**.
 *
 * Pourquoi une route et pas l'action serveur de `/scan` : une Server Action ne
 * se rejoue pas depuis `fetch` — elle porte un identifiant de build et un
 * jeton d'action qui changent à chaque déploiement. Or le rejeu peut traverser
 * un déploiement. Un POST stable avec un corps explicite, lui, se rejoue.
 *
 * Trois principes, tous lisibles dans le code :
 *   1. **aucune confiance dans le corps** : il repasse par `nouvelleOperation`
 *      (mêmes règles que le formulaire), donc un jeton mal formé ne part pas ;
 *   2. **aucune exception** : chaque issue devient un statut HTTP, parce que
 *      c'est le statut qui décide du destin de l'élément dans la file (2xx
 *      retiré, 400/403/404/422 jeté, le reste conservé) ;
 *   3. **l'état est traduit, pas le message** : `interpreterErreur` ne devine
 *      aucun code non mesuré (cf. `lib/rpc.mjs`).
 */

/** Réponse JSON homogène : `{etat, ...}` + le statut qui pilote la file. */
function reponse(etat, extra = {}) {
  return NextResponse.json(
    { etat, ...extra },
    { status: STATUTS_ETAT[etat] ?? 500, headers: { 'cache-control': 'no-store' } }
  )
}

export async function POST(request) {
  let corps
  try {
    corps = await request.json()
  } catch {
    return reponse('arguments')
  }

  const construit = nouvelleOperation({
    jeton: corps?.jeton,
    montant: corps?.montant,
    points: corps?.points,
    id: corps?.operationId,
  })
  if (construit.etat !== 'ok') return reponse('arguments')

  const { operation } = construit

  let client
  try {
    client = await clientServeur()
  } catch {
    // Rien n'est parti : c'est une configuration absente, pas un refus.
    return reponse('configuration')
  }

  let resultat
  try {
    resultat = await client.rpc(NOM_RPC_OPERATION, {
      p_operation_id: operation.id,
      p_card_token: operation.jeton,
      p_amount_spent: operation.montant,
      p_points_to_add: operation.points,
    })
  } catch {
    return reponse('indisponible')
  }

  const { data, error } = resultat

  if (error) {
    /* `PGRST202` = la fonction n'est pas dans le cache de schéma : `0016` n'est
       pas passée. 503 ⇒ conservée : le jour de la migration, la file repart
       seule, sans qu'on touche au terminal du comptoir. */
    if (error.code === 'PGRST202') return reponse('migration', { code: 'PGRST202' })

    const { etat, code } = interpreterErreur(error)
    if (etat === 'carteInconnue') return reponse('carteInconnue', { code })
    return reponse('refus', { code: code ?? null })
  }

  const solde = Number(data?.new_balance)
  return reponse('ok', {
    solde: Number.isFinite(solde) ? solde : null,
    points: Number(data?.points_added),
    idempotent: data?.idempotent === true,
  })
}
