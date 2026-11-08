/* ============================================================================
   Racine du document.

   `data-skin="premium"` est sur `<html>` : c'est exactement ce que sert la
   cible (`<html lang="fr" data-skin="premium">`). Le poser sur un `<div>`
   marcherait aussi, mais les sélecteurs mesurés `[data-skin=premium] .verre`
   deviendraient `[data-skin=premium] .verre` sous un ancêtre différent — et
   `[data-skin=premium].dark` ne pourrait plus jamais s'appliquer, puisque
   `.dark` devrait alors être sur le `<div>`.

   Ordre des feuilles : Tailwind d'abord, puis les polices, puis les valeurs
   mesurées, puis les matériaux, puis la peau bleu nuit. Une couche qui doit
   pouvoir surcharger une autre vient après elle — pas l'inverse.

   `CLASSES_POLICES` n'est pas une liste écrite à la main : ce sont les classes
   `.__variable_*` extraites de la cible par `tools/rea/extrait-polices.mjs`.
   C'est `<body>` qui les porte dans la cible, et c'est de là que viennent les
   `--font-sans` / `--font-impact` / etc. Les écrire ici en dur les figerait au
   premier changement de build.
   ========================================================================== */

import '@/app/globals.css'
import '@/styles/polices.css'
import '@/styles/tokens.css'
import '@/styles/verre.css'
import '@/styles/nuit.css'

import { CLASSES_POLICES } from '@/styles/polices.mjs'
import { dictionnaire, traduire } from '@/i18n/index.mjs'

/* Le nom de marque a **une** source : le dictionnaire. Il était écrit en dur
   dans deux fichiers au premier jet, avec deux orthographes (le scrape dit
   Fidelix, la décision D-1 dit Fidelia). L'arbitrage est rendu — `Fidelia`
   (cf. `dictionnaires.mjs`, en tête) — et `meta.titre` **interpole** la clé au
   lieu de la recopier : la prochaine fois, c'est une ligne. */
const d = dictionnaire('fr')
const marque = d['marque.nom']

export const metadata = {
  title: {
    default: traduire('fr', 'meta.titre', { marque }),
    template: `%s · ${marque}`,
  },
  description: d['meta.description'],
}

export default function Racine({ children }) {
  return (
    <html lang="fr" data-skin="premium">
      <body className={`${CLASSES_POLICES.join(' ')} font-sans antialiased`}>{children}</body>
    </html>
  )
}
