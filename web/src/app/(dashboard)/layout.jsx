import { redirect } from 'next/navigation'
import { clientServeur } from '@/lib/supabase/server.mjs'
import { CoqueTableau } from '@/components/tableau/CoqueTableau'
import { localeRequete } from '@/lib/locale.mjs'

/* Coque **et** garde de tout l'espace authentifié.

   POURQUOI CE FICHIER EXISTE (et pourquoi il n'est pas dans `dashboard/`)
   ---------------------------------------------------------------------
   La garde vivait dans `app/(dashboard)/dashboard/layout.jsx`. Un `layout.jsx`
   ne s'applique qu'à son **segment** : celui-là ne couvrait donc que
   `/dashboard`. Les neuf autres écrans du groupe — `/customers`, `/rewards`,
   `/scan`, `/caisses`, `/qrcode`, `/branding`, `/notifications`, `/reviews`,
   `/caisse` — n'avaient **ni garde ni coque**. Mesuré : `GET /customers`
   répondait **200** sans session (les données restaient protégées par la RLS,
   mais la page s'affichait : ni barre, ni navigation, ni cohérence visuelle).

   Le layout du groupe, lui, s'applique à tous les segments. Une garde, un
   matériau, dix écrans — et un écran ajouté demain en hérite sans rien écrire.

   Ce qui reste vrai de la règle d'origine : la décision d'accès est **ici**, et
   nulle part ailleurs ; `CoqueTableau` ne porte que le matériau, ce qui permet
   à l'aperçu de développement (`app/(apercu)`) de le rendre sans dupliquer une
   ligne de style.

   `generateMetadata` n'est pas ici : chaque page calcule son titre, et le
   gabarit de la racine y ajoute la marque (`%s · Fidelia`).
*/
export default async function LayoutEspace({ children }) {
  let utilisateur = null
  try {
    const supabase = await clientServeur()
    const { data } = await supabase.auth.getUser()
    utilisateur = data.user ?? null
  } catch {
    // Configuration absente : sans clé, `getUser()` ne peut rien prouver. On
    // renvoie vers la connexion avec un motif lisible plutôt que d'afficher un
    // tableau de bord vide qui laisserait croire à une session valide.
    redirect('/login?etat=configuration')
  }

  if (!utilisateur) redirect('/login')

  const locale = await localeRequete()

  /* Le bandeau « Offre gratuite » vivait ici, sur chaque écran. Il a été retiré
     à la demande du produit : sa lecture (`plafondDuCommerce`) coûtait donc un
     aller-retour Supabase par navigation pour un chiffre désormais affiché
     seulement dans `/billing`, qui le lit lui-même. */
  return (
    <CoqueTableau email={utilisateur.email ?? ''} locale={locale}>
      {children}
    </CoqueTableau>
  )
}
