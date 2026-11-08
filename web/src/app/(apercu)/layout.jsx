import { notFound } from 'next/navigation'
import { CoqueTableau } from '@/components/tableau/CoqueTableau'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'

/* Aperçu **de développement** du tableau de bord.

   Pourquoi il existe : la base de reconstruction ne contient aucun compte
   (`/auth/v1/admin/users` → `users: []`), donc `login → dashboard` ne peut pas
   être parcouru à l'œil avant R2. Sans cet écran, la peau bleu nuit ne serait
   vérifiable que par lecture de CSS — et le design system dit explicitement que
   le **rendu** n'est pas vérifié.

   Pourquoi il n'affaiblit rien : il n'est pas dans `(dashboard)`, il ne lit
   aucune session, et il **n'existe pas en production** (`notFound()`). La garde
   de `/dashboard` reste dans son layout, intacte.

   Pourquoi il ne diverge pas : il rend `CoqueTableau` et `ContenuTableau`, les
   mêmes composants que `/dashboard`. Aucune ligne de style n'est recopiée. */
export default async function LayoutApercu({ children }) {
  /* Fermé en production **et** sans drapeau.
   *
   * `process.env.NODE_ENV` est remplacé à la compilation : dans une image de
   * production, aucune variable d'exécution ne peut le rouvrir. C'était donc un
   * écran invérifiable là où il compte le plus — dans le conteneur. Le drapeau
   * `FIDELIX_APERCU=1` (lu à l'exécution) permet de le visiter pour **mesurer**
   * le rendu, sans jamais l'ouvrir par défaut : sans la variable, la condition
   * reste celle d'avant.
   */
  const ferme = process.env.NODE_ENV === 'production' && process.env.FIDELIX_APERCU !== '1'
  if (ferme) notFound()
  const locale = await localeRequete()
  const { t } = pour(locale)
  return (
    <CoqueTableau email={t('tableau.apercu.email')} locale={locale}>
      {children}
    </CoqueTableau>
  )
}
