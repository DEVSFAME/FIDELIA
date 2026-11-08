'use server'

import { redirect } from 'next/navigation'
import { clientServeur } from '@/lib/supabase/server.mjs'

/** Déconnexion : `scope: 'local'` — on révoque la session de cet appareil, pas
 *  celles des autres caisses du commerce. */
export async function seDeconnecter() {
  try {
    const supabase = await clientServeur()
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Session déjà absente ou configuration retirée : l'effet voulu — plus de
    // session côté navigateur — est obtenu en redirigeant vers /login.
  }
  redirect('/login')
}
