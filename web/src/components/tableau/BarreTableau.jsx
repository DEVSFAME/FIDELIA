import Link from 'next/link'
import { seDeconnecter } from '@/app/(dashboard)/dashboard/actions.js'
import { pour } from '@/i18n/index.mjs'
import { IconeScan, IconeSortie } from '@/components/unicity/Icones'

/* Barre haute du tableau de bord — le `topbar` d'Unicity (`layout.css` l.201).

   Elle garde ce qui doit rester **toujours** visible, quel que soit l'écran :
   la marque (retour à l'accueil), l'identité de la session, et la sortie. La
   navigation est dans `Navigation` (dock latéral + barre basse) : dix libellés
   ne tiennent pas dans une barre de 56 px, et les entasser produirait un
   débordement silencieux à 375 px.

   Le bouton « Scanner » est une **action**, pas une destination de plus : il
   reprend l'entrée `/scan` déjà présente dans la navigation, avec l'icône du
   même jeu (`Icones`). Sur mobile il passe en icône seule — le libellé reste
   dans `aria-label`, donc rien n'est perdu pour un lecteur d'écran.
*/
export function BarreTableau({ email, locale = 'fr' }) {
  const { t } = pour(locale)

  return (
    <header className="uc-topbar">
      <Link href="/dashboard" className="uc-btn uc-btn-ghost uc-btn-sm">
        {t('marque.nom')}
      </Link>

      <div className="uc-topbar-actions">
        <Link
          href="/scan"
          className="uc-btn uc-btn-accent uc-btn-sm"
          aria-label={t('tableau.nav.scanner')}
          title={t('tableau.nav.scanner')}
        >
          <IconeScan />
          <span className="uc-topbar-libelle">{t('tableau.nav.scanner')}</span>
        </Link>

        <span className="uc-topbar-email">{email}</span>

        <form action={seDeconnecter}>
          <button
            type="submit"
            className="uc-btn uc-btn-outline uc-btn-sm"
            aria-label={t('tableau.nav.deconnexion')}
            title={t('tableau.nav.deconnexion')}
          >
            <IconeSortie />
            <span className="uc-topbar-libelle">{t('tableau.nav.deconnexion')}</span>
          </button>
        </form>
      </div>
    </header>
  )
}


