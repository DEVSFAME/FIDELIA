import { Coque } from '@/components/unicity/Coque'

/* Coque authentifiée — matériau **Unicity**, en un seul endroit.

   Ce composant ne dit **pas** qui a le droit d'entrer : la garde reste dans
   `app/(dashboard)/dashboard/layout.jsx`. Il ne porte que le matériau, ce qui
   permet à l'aperçu de développement (`app/(apercu)`) de montrer la même peau
   sans dupliquer une ligne de style — et donc sans diverger.

   Il n'est plus qu'un relais : le dock, la barre haute et la barre mobile sont
   dans `components/unicity/Coque`. Le nom est conservé parce que c'est le point
   d'entrée que `apercu.test.mjs` et les deux layouts connaissent — renommer un
   contrat stable sans nécessité aurait obligé à toucher trois fichiers et un
   test pour un gain nul.

   Le décor de verre et la peau bleu nuit ont disparu avec la refonte : la cible
   de cette peau est désormais Unicity, pas la capture « verre ».
*/
export function CoqueTableau({ email = '', locale = 'fr', children }) {
  return (
    <Coque email={email} locale={locale}>
      {children}
    </Coque>
  )
}

