import { DecorVerre } from '@/components/verre/DecorVerre'
import { directionDe } from '@/i18n/locales.mjs'
import { localeRequete } from '@/lib/locale.mjs'

/* Coque des écrans publics (connexion, inscription, mot de passe oublié) : la
   peau claire mesurée, telle que la sert la cible. Le décor « verre » est ici,
   pas dans la racine, pour que le tableau de bord puisse avoir le sien (bleu
   nuit).

   `lang` et `dir` sont portés par ce `div`, pas par `<html>` : c'est la
   structure **relevée** sur `/ar` de la cible, où le `dir="rtl"` n'est pas sur
   `<html>` mais sur un `div[lang][dir]` enveloppant. On garde donc la forme
   mesurée, et on renseigne `lang` correctement pour la même raison
   d'accessibilité (cf. `src/i18n/locales.mjs`, écart assumé). */
export default async function LayoutAuth({ children }) {
  const locale = await localeRequete()

  return (
    <div className="relative min-h-[100dvh]">
      <DecorVerre />
      <div
        lang={locale}
        dir={directionDe(locale)}
        className="relative z-[1] flex min-h-[100dvh] items-center justify-center px-5 py-12"
      >
        {children}
      </div>
    </div>
  )
}
