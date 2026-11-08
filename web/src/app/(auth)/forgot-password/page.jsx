import { Surface } from '@/components/verre/Surface'
import { FormulaireOubli } from '@/components/auth/FormulaireOubli'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { messageEchec } from '@/lib/reinitialisation.mjs'

/* Mot de passe oublié — copie **mesurée** : « MOT DE PASSE / OUBLIÉ ? » sur
   deux lignes, puis « Entrez votre email, on vous envoie un lien de
   réinitialisation ». Source :
   `_next_static_chunks_app__auth__forgot-password_page-c17cec5863baf4b5.js`.

   `?echec=` est lu côté **serveur** (`searchParams`) plutôt que dans un
   `useEffect` : le bandeau s'affiche sans JavaScript, et la valeur passe par
   `messageEchec()` — une valeur inconnue n'affiche rien plutôt que de recracher
   l'URL. La cible lit la même clé, avec les mêmes trois valeurs. */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('auth.oubli.metaTitre') }
}

export default async function PageOubli({ searchParams }) {
  const parametres = await searchParams
  const locale = await localeRequete()
  const { t } = pour(locale)
  const echec = messageEchec(parametres?.echec)

  return (
    <Surface variante="verre" className="w-full max-w-sm rounded-[2rem] p-7 shadow-float sm:p-8">
      <div className="mb-8">
        <h1 className="font-impact text-5xl uppercase leading-[0.9] tracking-tight text-ink">
          {t('auth.oubli.titreLigne1')}
          <br />
          {t('auth.oubli.titreLigne2')}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/55">{t('auth.oubli.sousTitre')}</p>
      </div>

      <FormulaireOubli locale={locale} echec={echec} />
    </Surface>
  )
}
