import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { tableauDuCommerce } from '@/lib/donnees.mjs'
import { lireTableau } from '@/lib/tableau.mjs'
import { ContenuTableau } from '@/components/tableau/ContenuTableau'

export async function generateMetadata() {
  const { t, locale } = pour(await localeRequete())
  return { title: t('tableau.titre'), lang: locale }
}

/* La page ne porte que la lecture et le départage des états : le contenu est
   dans `ContenuTableau`, partagé avec l'aperçu de développement, pour que les
   deux rendus ne puissent pas diverger. La garde d'accès est dans le layout.

   Quatre états, et aucun ne se confond avec un autre :
     - la fonction manque (`nonMigre`) ou Supabase n'est pas configuré
       -> bloc migration, avec le nom du fichier à exécuter ;
     - la base refuse ou ne répond pas     -> bloc refus ;
     - la base répond une forme inattendue -> bloc « réponse inattendue » :
       `lireTableau` rend `null`, et ce n'est pas « aucune activité » ;
     - la base répond                      -> les indicateurs, et des zéros
       seulement s'ils ont été **lus**.
*/
export default async function PageTableau() {
  const locale = await localeRequete()
  const lecture = await tableauDuCommerce()
  const tableau = lecture.etat === 'ok' ? lireTableau(lecture.donnees) : null
  const etat = lecture.etat === 'ok' && tableau === null ? 'illisible' : lecture.etat

  return <ContenuTableau locale={locale} tableau={tableau} etat={etat} />
}
