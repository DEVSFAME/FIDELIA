'use client'

import Link from 'next/link'
import { ENTREES, ENTREES_MOBILE, ENTREES_PLUS } from '@/lib/navigation.mjs'
import { pour } from '@/i18n/index.mjs'
import { LienNavigation, OngletMobile } from './LienNavigation'
import { IconePlus } from './Icones'

/* Les deux navigations de la coque, dans **un seul** fichier client.

   Pourquoi les deux ici : elles lisent la même source (`ENTREES`) et doivent
   afficher les mêmes destinations. Les séparer en deux fichiers aurait permis
   qu'une des deux oublie une entrée au premier ajout.

   - `Dock` : rail latéral, visible à partir de 900 px. Icônes seules de 900 à
     1240 px, icône + libellé au-delà (`.uc-dock-label`, révélé en CSS).
   - `BarreMobile` : barre basse fixe sous 900 px — quatre destinations
     quotidiennes plus « Plus », qui ouvre un panneau.

   Le panneau « Plus » est un `<details>` natif : il s'ouvre sans JavaScript.
   Ce n'est pas un détail — la barre est le seul moyen de naviguer sur mobile,
   et elle ne doit pas dépendre du succès de l'hydratation.
*/

export function Dock({ locale }) {
  const { t } = pour(locale)

  return (
    <nav aria-label={t('tableau.nav.ariaLabel')} className="uc-dock-nav">
      {ENTREES.map((entree) => (
        <LienNavigation key={entree.href} entree={entree} locale={locale} variante="dock" />
      ))}
    </nav>
  )
}

export function BarreMobile({ locale }) {
  const { t } = pour(locale)

  return (
    <nav aria-label={t('tableau.nav.ariaLabelMobile')} className="uc-bottom">
      {ENTREES_MOBILE.map((entree) => (
        <OngletMobile key={entree.href} entree={entree} locale={locale} />
      ))}

      <details className="uc-plus">
        <summary className="uc-bottom-lien" aria-label={t('tableau.nav.plus')}>
          <IconePlus />
          <span aria-hidden="true">{t('tableau.nav.plus')}</span>
        </summary>
        <div className="uc-plus-panneau">
          {ENTREES_PLUS.map((entree) => (
            <LienNavigation key={entree.href} entree={entree} locale={locale} variante="panneau" />
          ))}
        </div>
      </details>
    </nav>
  )
}

/* Le pied du dock : l'identité de la session.
 *
 * Ce n'est **pas** un lien : la destination « Mon compte » est désormais une
 * entrée du rail (`/settings`, P0-2), et un avatar cliquable vers la même route
 * ferait deux fois le même lien. L'adresse reste lisible en `title`.
 */
export function PiedDock({ initiales, email = '' }) {
  return (
    <div className="uc-dock-foot">
      <span className="uc-dock-avatar" title={email || undefined} aria-hidden="true">
        {initiales || '?'}
      </span>
    </div>
  )
}
