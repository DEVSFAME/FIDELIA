/* Les onglets du groupe « Mon compte » — « Paramètres » et « Abonnement ».

   Mesuré deux fois, à l'identique, de part et d'autre du groupe :
   `_captures/2026-11-02-a7/rendu/c01-settings.html` (onglet courant :
   Paramètres) et `c02-billing.html` (onglet courant : Abonnement). La cible en
   porte un troisième, « Données clients », qui n'a **ni page ni capture** chez
   nous : il n'est pas rendu, et la dette est déclarée dans
   `docs/design-system.md` §3.

   Même matériau qu'`OngletsProgramme` (`.uc-periodes` / `.uc-periode`) : c'est
   le seul jeu de la feuille qui porte une cible tactile de 44 px et un état
   courant visible. Deux composants, un seul dessin d'onglet.
*/

import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { ONGLETS_COMPTE } from '@/lib/navigation.mjs'

export function OngletsCompte({ chemin, locale = 'fr' }) {
  const { t } = pour(locale)

  return (
    <nav aria-label={t('page.abonnement.ongletsAria')}>
      <ul className="uc-periodes">
        {ONGLETS_COMPTE.map((onglet) => (
          <li key={onglet.href}>
            <Link
              href={onglet.href}
              className="uc-periode"
              aria-current={chemin === onglet.href ? 'page' : undefined}
            >
              {t(onglet.cle)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
