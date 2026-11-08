import Link from 'next/link'
import { Surface } from '@/components/verre/Surface'
import { FormulaireInscription } from '@/components/auth/FormulaireInscription'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'

/* Inscription — copie **mesurée** (`_next_static_chunks_app__auth__register_page-…js`) :
   « CRÉEZ / VOTRE ESPACE », « Programme de fidélité en 2 minutes »,
   « Créer mon compte gratuitement », « Déjà un compte ? / Se connecter ».

   Pourquoi `max-w-md` et pas `max-w-sm` comme la connexion : six champs, trois
   coches et un bloc de consentement ne tiennent pas dans 24 rem sans casser les
   libellés. Aucune valeur de style nouvelle — c'est la même échelle d'espacement
   mesurée, un cran au-dessus. */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('auth.inscription.metaTitre') }
}

export default async function PageInscription() {
  const locale = await localeRequete()
  const { t } = pour(locale)

  return (
    <Surface
      variante="verre"
      className="w-full max-w-md rounded-[2rem] p-7 shadow-float sm:p-8"
    >
      <div className="mb-8">
        <h1 className="font-impact text-5xl uppercase leading-[0.9] tracking-tight text-ink">
          {t('auth.inscription.titreLigne1')}
          <br />
          {t('auth.inscription.titreLigne2')}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/55">{t('auth.inscription.sousTitre')}</p>
      </div>

      <FormulaireInscription locale={locale} />

      <p className="pt-3 text-center text-sm text-ink/50">
        {t('auth.inscription.pied')}{' '}
        <Link
          href="/login"
          className="font-bold text-ink underline underline-offset-4 transition-colors hover:text-coral"
        >
          {t('navigation.connexion')}
        </Link>
      </p>
    </Surface>
  )
}
