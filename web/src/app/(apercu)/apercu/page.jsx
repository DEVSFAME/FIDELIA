import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { ContenuTableau } from '@/components/tableau/ContenuTableau'

/* Même contenu que `/dashboard/page.jsx`, à la lettre. Le titre du document
   diffère pour qu'on sache, dans l'onglet, qu'on regarde un aperçu — il est
   composé ici et non dans le dictionnaire : c'est une mention de développement,
   pas une chaîne du produit. */
export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: `Aperçu · ${t('tableau.titre')}` }
}

export default async function PageApercu() {
  const locale = await localeRequete()
  return <ContenuTableau locale={locale} />
}
