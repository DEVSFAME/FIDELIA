import { redirect } from 'next/navigation'

/* L'entrée non authentifiée, c'est la connexion. Pas de page d'accueil ici :
   elle existe déjà, scrapée, et R1 n'a pas à la refaire. */

/* **Évaluée à chaque requête**, et c'est le correctif du 2026-11-09. Prérendue,
   cette redirection était servie avec `cache-control: s-maxage=31536000` — un
   an — et Next répondait aux POST d'action depuis ce cache par un `400` vide de
   30 octets (`x-nextjs-action-not-found`), que Chrome affiche en page d'erreur
   réseau. Une redirection n'a rien à mémoriser : elle dépend de la requête. */
export const dynamic = 'force-dynamic'

export default function Page() {
  redirect('/login')
}
