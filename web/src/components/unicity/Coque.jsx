import { BarreTableau } from '@/components/tableau/BarreTableau'
import { directionDe } from '@/i18n/locales.mjs'
import { pour } from '@/i18n/index.mjs'
import { BarreMobile, Dock, PiedDock } from './Navigation'

/* Coque authentifiée — matériau **Unicity**, en un seul endroit.

   Ce composant ne dit **pas** qui a le droit d'entrer : la garde reste dans
   `app/(dashboard)/dashboard/layout.jsx`. Il ne porte que le matériau, ce qui
   permet à l'aperçu de développement (`app/(apercu)`) de montrer la même peau
   sans dupliquer une ligne de style — et donc sans diverger.

   La feuille est importée **ici** et nulle part ailleurs : c'est ce qui garantit
   qu'aucune page ne peut afficher la coque sans son style.

   `lang`/`dir` enveloppent le contenu pour la même raison que dans
   `(auth)/layout.jsx` : la structure mesurée porte la langue sur un `div`, pas
   sur `<html>`. L'attribut `dir` compte ici plus qu'ailleurs — le dock et la
   barre basse sont des grilles, et une grille se lit de droite à gauche en
   arabe sans qu'on ait à la réécrire.
*/
import '@/styles/unicity.css'

/** Deux lettres pour l'avatar, tirées de l'adresse (jamais du nom : on ne l'a pas). */
function marqueDe(email) {
  const local = typeof email === 'string' ? email.split('@')[0] : ''
  return local.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
}

export function Coque({ email = '', locale = 'fr', children }) {
  const { t } = pour(locale)

  return (
    <div className="uc" lang={locale} dir={directionDe(locale)}>
      {/* Lien d'évitement : dix entrées de navigation précèdent le contenu. Au
          clavier ou au lecteur d'écran, on ne doit pas les retraverser à chaque
          page. Il n'est visible qu'au focus — sinon il occuperait le haut de
          l'écran pour tout le monde. */}
      <a className="uc-saut" href="#contenu">
        {t('a11y.allerAuContenu')}
      </a>

      <div className="uc-shell">
        <aside className="uc-dock" aria-label={t('marque.nom')}>
          <span className="uc-dock-brand" aria-hidden="true">
            F
          </span>
          <Dock locale={locale} />
          <PiedDock initiales={marqueDe(email)} email={email} />
        </aside>

        <div className="uc-main">
          <BarreTableau email={email} locale={locale} />
          <main className="uc-content" id="contenu">
            {children}
          </main>
        </div>
      </div>

      <BarreMobile locale={locale} />
    </div>
  )
}
