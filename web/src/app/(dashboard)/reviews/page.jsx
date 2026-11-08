import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { EntetePage, EtatPage } from '@/components/tableau/EntetePage'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.avis.titre') }
}

export default async function PageAvis() {
  const locale = await localeRequete()
  const { t } = pour(locale)

  return (
    <>
      <EntetePage surtitre={t('page.avis.surtitre')} titre={t('page.avis.titre')} />
      <EtatPage
        resume={t('page.avis.resume')}
        source={t('tableau.page.source', { source: '/reviews · /api/caisse/reviews' })}
        vide={t('page.avis.vide')}
        ariaLabel={t('tableau.page.sourceAria')}
      />
    </>
  )
}
