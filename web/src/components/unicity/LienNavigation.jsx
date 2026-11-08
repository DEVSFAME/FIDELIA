'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pour } from '@/i18n/index.mjs'
import { estActif } from '@/lib/navigation.mjs'
import { iconeDe } from './Icones'

/* Un seul lien de navigation, trois habillages.

   Pourquoi un composant client : `usePathname()` est le seul moyen de savoir où
   l'on est sans faire porter le chemin par chaque page (le layout ne le reçoit
   pas en App Router). Le reste de l'application demeure serveur.

   `aria-current="page"` est posé en plus de la classe : un lecteur d'écran ne
   lit pas les classes, et la couleur seule ne suffit pas (daltonisme). Le CSS
   s'appuie sur cet attribut — c'est donc l'état accessible qui peint l'état
   visuel, et les deux ne peuvent pas diverger.

   Trois variantes, une seule règle d'activation (`estActif`, testée) :
     - `dock`    : pastille 46 px du rail latéral (icône + libellé masqué) ;
     - `bas`     : onglet de la barre mobile (icône au-dessus du libellé) ;
     - `panneau` : ligne du panneau « Plus » (icône + libellé).
*/

const VARIANTES = {
  dock: { classe: 'uc-dock-item', avecLibelle: true },
  bas: { classe: 'uc-bottom-lien', avecLibelle: true },
  panneau: { classe: '', avecLibelle: true },
}

export function LienNavigation({ entree, locale, variante = 'dock' }) {
  const { t } = pour(locale)
  const chemin = usePathname() ?? ''
  const actif = estActif(chemin, entree.href)
  const reglage = VARIANTES[variante]

  if (!reglage) {
    throw new Error(
      `LienNavigation : variante inconnue « ${variante} ». Valeurs admises : ${Object.keys(VARIANTES).join(', ')}`
    )
  }

  const Icone = iconeDe(entree.href)

  return (
    <Link
      href={entree.href}
      aria-current={actif ? 'page' : undefined}
      className={reglage.classe || undefined}
      title={t(entree.cle)}
    >
      <Icone />
      {reglage.avecLibelle ? <span className="uc-dock-label">{t(entree.cle)}</span> : null}
    </Link>
  )
}

/* Le libellé de l'onglet mobile est **court** : « Scanner un client » ne tient
   pas sous une icône de 21 px. On garde la clé de navigation (donc la même
   destination), et on n'ajoute aucune traduction — le libellé long reste
   l'`aria-label`, ce qui est exactement ce qu'un lecteur d'écran doit lire.
*/
export function OngletMobile({ entree, locale }) {
  const { t } = pour(locale)
  const chemin = usePathname() ?? ''
  const actif = estActif(chemin, entree.href)
  const Icone = iconeDe(entree.href)
  const libelle = t(entree.cle)

  return (
    <Link
      href={entree.href}
      aria-current={actif ? 'page' : undefined}
      aria-label={libelle}
      className="uc-bottom-lien"
    >
      <Icone />
      <span aria-hidden="true">{libelle}</span>
    </Link>
  )
}
