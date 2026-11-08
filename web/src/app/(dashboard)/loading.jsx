import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'

/* Frontière de chargement de **tout** l'espace authentifié.

   POURQUOI CE FICHIER EXISTE (mesuré le 2026-11-01)
   -------------------------------------------------
   Aucun `loading.jsx` n'existait dans `(dashboard)`. Or chaque page du groupe
   attend au moins un aller-retour Supabase — **0,55 à 0,81 s mesurés**, cinq
   tirages — pendant lequel il ne se passait **rien** à l'écran : l'URL ne
   changeait pas, la page précédente restait figée, et le clic semblait perdu.
   C'est exactement la latence ressentie : pas du calcul (le rendu serveur de
   Next prend 9 à 78 ms), mais une attente sans retour visuel.

   Ce que cette frontière change, en deux temps :
     1. **Perception** — le routeur affiche ce squelette immédiatement, avant le
        rendu serveur de la page. L'attente devient visible, donc lisible.
     2. **Préchargement** — en Next 16, une route dynamique n'est préchargée
        que jusqu'à la frontière la plus proche. Sans frontière, `prefetch` ne
        préchargeait **rien** d'utile ; avec elle, l'aller-retour se fait à
        l'affichage du lien et le squelette est déjà là au clic.

   Ce qu'il n'est pas : une page d'erreur, ni un `Suspense` de données. Il ne
   remplace aucun état — chaque écran garde ses `EtatBloque`. Il occupe la place
   du contenu, il ne décide rien.

   `role="status"` + `aria-busy` : un lecteur d'écran annonce le chargement une
   fois, sans relire les blocs décoratifs (`aria-hidden`). Le texte vient du
   dictionnaire, donc la langue est celle de la requête — pas un « Loading… »
   figé.
*/
export default async function ChargementEspace() {
  const { t } = pour(await localeRequete())

  return (
    <div className="uc-squelette" role="status" aria-live="polite" aria-busy="true">
      <span className="uc-sr">{t('tableau.chargement')}</span>

      <div aria-hidden="true">
        <span className="uc-squelette-ligne uc-squelette-sur" />
        <span className="uc-squelette-ligne uc-squelette-titre" />
      </div>

      <div className="uc-squelette-carte" aria-hidden="true">
        <span className="uc-squelette-ligne uc-squelette-pleine" />
        <span className="uc-squelette-ligne" />
        <span className="uc-squelette-ligne uc-squelette-courte" />

        <div className="uc-squelette-grille">
          <span className="uc-squelette-bloc" />
          <span className="uc-squelette-bloc" />
        </div>
      </div>
    </div>
  )
}
