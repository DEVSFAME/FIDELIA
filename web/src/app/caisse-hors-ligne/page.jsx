import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { FileAttente } from '@/components/caisse/FileAttente'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.caisse.horsLigneTitre') }
}

/* L'écran de repli du service worker — **public**, et c'est la contrainte.
 *
 * Il est servi quand une navigation vers `/caisse` échoue faute de réseau
 * (`web/public/sw.js`). Il ne peut donc pas vivre sous `(dashboard)` : la garde
 * d'authentification redirigerait vers `/login`, qui n'existe pas hors ligne
 * non plus. Il ne lit aucune donnée serveur : tout ce qu'il montre vient
 * d'IndexedDB, dans le navigateur.
 *
 * Il ne prétend pas remplacer la caisse : il dit ce qui reste possible
 * (créditer, mis en file) et ce qui ne l'est pas (échanger — le solde n'est pas
 * connu). Une promesse plus large serait un mensonge au comptoir.
 */
export default async function PageHorsLigne() {
  const locale = await localeRequete()
  const { t } = pour(locale)

  return (
    <main className="uc-main mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <section className="uc-card uc-bloc uc-carte-pad">
        <h1 className="uc-page-titre">{t('page.caisse.horsLigneTitre')}</h1>
        <p className="uc-card-sub mt-2">{t('page.caisse.horsLigneTexte')}</p>
        <p className="uc-aide mt-3">{t('page.caisse.horsLigneEchange')}</p>
      </section>

      <FileAttente locale={locale} />
    </main>
  )
}
