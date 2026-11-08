/* Les deux onglets de la section « Programme » — « Récompenses » et « Règles ».

   Mesuré deux fois, à l'identique, sur les deux pages de la section :
   `_captures/2026-11-02-a6/rendu/a02-program.html` (page `/program`) et
   `a03-rewards.html` (page `/rewards`). La barre est la **même** des deux côtés,
   et l'onglet courant y porte `aria-current="page"`.

   Pourquoi un composant et pas deux copies : une barre d'onglets recopiée
   finirait par diverger (c'est exactement ce que les deux dictionnaires de
   marque avaient fait avant arbitrage). Les libellés et les `href` vivent dans
   `lib/navigation.mjs`, donc `navigation.test.mjs` les vérifie contre le disque
   — un onglet sans page fait échouer un test au lieu de produire un 404.

   Matériau : `.uc-periodes` / `.uc-periode`, déjà employés par les filtres de
   `/caisses`. C'est le seul jeu de la feuille qui porte une cible tactile de
   44 px et un état courant visible (`.uc-periode[aria-current='page']`) : un
   onglet dont on ne voit pas qu'il est actif n'est pas un onglet.
*/

import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { ONGLETS_PROGRAMME } from '@/lib/navigation.mjs'

export function OngletsProgramme({ chemin, locale = 'fr' }) {
  const { t } = pour(locale)

  return (
    <nav aria-label={t('tableau.programme.ongletsAria')}>
      <ul className="uc-periodes">
        {ONGLETS_PROGRAMME.map((onglet) => (
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
