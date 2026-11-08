/* ============================================================================
   `/auth/confirm` — retour de lien : endpoint de **redirection**, pas un écran.

   Mesure : le bundle d'inscription de la cible passe
   `emailRedirectTo: "/auth/confirm?next=/onboarding"`. On garde le chemin, pas
   `next` (cf. `docs/design-system.md` §3).

   Pourquoi une route et pas une page : un écran intermédiaire clignote, ne dit
   rien, et offrirait un endroit de plus où diverger du mesuré. Ici il n'y a
   aucun rendu — donc aucune valeur de style à vérifier au ledger, et rien à
   traduire : le seul texte que voit l'utilisateur est celui de
   `/forgot-password`, de `/nouveau-mot-de-passe` ou du tableau de bord.

   **Deux flux, une route.** Une session ouverte ne dit pas ce qu'on est venu
   faire : un lien d'inscription mène au tableau de bord, un lien de
   récupération doit mener à la saisie d'un nouveau mot de passe — sinon le
   commerçant atterrit sur son espace avec un mot de passe **inchangé**, et il
   croit l'avoir changé. La destination est donc décidée par `destinationSucces`
   à partir du flux lu dans l'URL, jamais d'une valeur écrite ici.

   `redirect()` lève une exception interne à Next : il reste **hors** du `try`,
   sinon l'échange réussi serait avalé et le lien donnerait une page immobile.

   Une configuration Supabase absente **n'est pas** traduite en `?echec=` : elle
   n'est pas un défaut du lien, et dire « ce lien n'est pas valide » à cause
   d'une variable d'environnement manquante serait un mensonge de plus. L'erreur
   remonte (500) et se voit dans les journaux.
   ========================================================================== */

import { redirect } from 'next/navigation'
import { clientServeur } from '@/lib/supabase/server.mjs'
import {
  destinationEchec,
  destinationSucces,
  lireParametresConfirmation,
  motifDepuisErreur,
} from '@/lib/confirmation.mjs'

/* Un lien de confirmation est à usage unique : une réponse mise en cache
   servirait le même 307 à tout le monde, y compris après consommation du jeton. */
export const dynamic = 'force-dynamic'

export async function GET(requete) {
  const lecture = lireParametresConfirmation(requete.nextUrl.searchParams)

  // GoTrue a déjà refusé le jeton et nous l'a dit dans l'URL.
  if (lecture.sorte === 'echec') redirect(destinationEchec(lecture.motif))

  // Hors du `try` : sans client, il n'y a pas d'échange à tenter.
  const supabase = await clientServeur()

  let erreur = null
  try {
    const reponse =
      lecture.sorte === 'code'
        ? // PKCE : exige le *code verifier* posé en cookie sur cet appareil.
          await supabase.auth.exchangeCodeForSession(lecture.code)
        : // Lien `token_hash` : vérification sans cookie, donc valable partout.
          await supabase.auth.verifyOtp({
            token_hash: lecture.tokenHash,
            type: lecture.type,
          })
    erreur = reponse.error
  } catch (levee) {
    // `exchangeCodeForSession` **lève** quand le verifier manque (autre
    // appareil, stockage vidé) — c'est un échec comme un autre, pas un bug.
    erreur = levee
  }

  if (erreur) redirect(destinationEchec(motifDepuisErreur(erreur)))
  redirect(destinationSucces(lecture))
}
