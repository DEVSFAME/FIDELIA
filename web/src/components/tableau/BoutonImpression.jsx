'use client'

/* Un seul bouton client dans tout l'espace authentifié, et il ne fait qu'une
   chose : ouvrir l'impression du navigateur.

   POURQUOI IL EXISTE
   ------------------
   L'écran `/qrcode` sert à **imprimer une affiche**. Sans ce bouton, il fallait
   connaître `Ctrl+P` — vrai sur un ordinateur, faux sur la tablette d'un
   comptoir, où la barre du navigateur n'existe pas en mode application. Le
   reste de la page demeure un composant serveur : ce fichier ne porte aucun
   état, aucune donnée, et ne s'hydrate qu'après le contenu.

   `window.print()` est synchrone et sans effet réseau. Il est aussi
   volontairement sans repli : dans un navigateur qui l'interdit, le bouton ne
   fait rien et l'utilisateur imprime autrement — on n'affiche pas un message
   d'erreur pour un geste inoffensif.
*/
export function BoutonImpression({ children, className = 'uc-btn uc-btn-outline uc-btn-sm' }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  )
}
