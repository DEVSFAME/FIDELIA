import { redirect } from 'next/navigation'

/* L'entrée non authentifiée, c'est la connexion. Pas de page d'accueil ici :
   elle existe déjà, scrapée, et R1 n'a pas à la refaire. */
export default function Page() {
  redirect('/login')
}
