'use client'

import { useState } from 'react'

import { basculerCaisse } from '@/lib/adhesion.mjs'
import { pour } from '@/i18n/index.mjs'

/* Le choix de la caisse — **reproduction du DOM mesuré**, pas une invention.

   `_captures/2026-10-26/raw/pages/p17-join.html` :

     <label id="qui-vous-a-servi">Qui vous a servi ?
       <span class="font-medium text-ink/40">(facultatif)</span></label>
     <div role="group" aria-labelledby="qui-vous-a-servi" class="flex flex-wrap gap-2">
       <button type="button" aria-pressed="false" class="min-h-11 rounded-xl border-2
         px-3.5 text-sm font-semibold transition-colors border-ink/10 bg-white text-ink
         hover:border-coral/40">Youssef</button>

   et son chunk (`app_join_[slug]_page-…js`) :

     aria-pressed={O === e.id}
     onClick={() => D(O === e.id ? void 0 : e.id)}
     class = "… " + (O === e.id ? "border-coral bg-coral text-white"
                                : "border-ink/10 bg-white text-ink hover:border-coral/40")

   Trois choses sont donc reprises telles quelles, et deux sont dites :

     * des **boutons** `aria-pressed`, pas un `<select>` ni des radios : c'est ce
       qui rend la sélection **défaisable** d'un second clic, geste mesuré, et
       qu'un `<input type="radio">` ne sait pas faire ;
     * l'état choisi est **annoncé** (`aria-pressed`), pas seulement colorié ;
     * la valeur part par un champ caché, donc dans le `FormData` de l'action
       serveur — aucun `fetch`, aucun état à sérialiser.

   CE QUI EST DIT, ET POURQUOI :
     * **sans JavaScript, le groupe est inerte.** Les puces ne basculent pas, et
       aucune caisse n'est envoyée. L'inscription, elle, aboutit quand même : la
       désignation est facultative (`0007`). C'est la dégradation honnête — un
       `<noscript>` qui expliquerait cela attirerait l'œil sur un choix dont
       l'absence ne coûte rien ;
     * **le groupe n'est rendu que si la liste est non vide**, décidé par
       l'appelant (`A.length>0 &&` dans la cible). Ce composant ne reçoit jamais
       une liste vide : il n'a pas d'état « rien à proposer ».
 */

function classes(choisie) {
  return (
    'min-h-11 rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ' +
    (choisie ? 'border-coral bg-coral text-white' : 'border-ink/10 bg-white text-ink hover:border-coral/40')
  )
}

export function ChoixCaisse({ caisses, locale }) {
  const { t } = pour(locale)

  // `null` = aucune caisse choisie. C'est l'état mesuré d'un groupe dont aucune
  // puce n'est pressée, et c'est aussi l'état auquel on revient en recliquant.
  const [choisie, setChoisie] = useState(null)

  return (
    <div className="space-y-2 pt-1">
      <p id="qui-vous-a-servi" className="text-sm font-bold">
        {t('page.adhesion.caisse')}{' '}
        <span className="text-xs font-medium opacity-40">
          {t('page.adhesion.caisseFacultatif')}
        </span>
      </p>

      <div role="group" aria-labelledby="qui-vous-a-servi" className="flex flex-wrap gap-2">
        <input type="hidden" name="caisse" value={choisie ?? ''} />
        {caisses.map((caisse) => (
          <button
            key={caisse.id}
            type="button"
            aria-pressed={choisie === caisse.id}
            onClick={() => setChoisie(basculerCaisse(choisie, caisse.id))}
            className={classes(choisie === caisse.id)}
          >
            {caisse.prenom}
          </button>
        ))}
      </div>
    </div>
  )
}
