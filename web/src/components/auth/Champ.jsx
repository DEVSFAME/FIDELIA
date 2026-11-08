/* ============================================================================
   `Champ` — un champ de formulaire, tel que la cible le sert.

   Les trois classes viennent du bundle mesuré, à la lettre :
     label  `text-sm font-semibold text-ink`
     input  `h-12 rounded-xl border-2 bg-white focus:border-coral`
            + `border-ink/15` (ou `border-destructive` en erreur)
     erreur `text-xs text-destructive`

   Pourquoi un composant : les mêmes six attributs sont répétés sur trois
   écrans (connexion, inscription, mot de passe oublié). Recopiés, ils
   divergent — c'est la bordure d'un seul champ qui reste grise en erreur, et
   personne ne le voit avant l'utilisateur.

   Aucun hook ici : le composant doit pouvoir être rendu par un composant
   serveur (les pages) **et** par un composant client (les formulaires). Un
   `useId` l'aurait condamné au client ; les `id` sont donc explicites.
   ========================================================================== */

/**
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.libelle  texte déjà traduit
 * @param {string} [props.erreur] texte déjà traduit, ou rien
 * @param {string} [props.aide]   lien ou mention à droite du libellé
 * @param {boolean} [props.avecBouton] place pour un bouton (œil) dans le champ
 */
export function Champ({ id, libelle, erreur, aide, avecBouton = false, children, ...reste }) {
  const bordure = erreur ? 'border-destructive' : 'border-ink/15'
  const paddingDroit = avecBouton ? ' pr-12' : ''

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {libelle}
        </label>
        {aide}
      </div>

      {avecBouton ? (
        <div className="relative">
          <input
            id={id}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? `${id}-erreur` : undefined}
            className={`h-12 w-full rounded-xl border-2 bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-coral${paddingDroit} ${bordure}`}
            {...reste}
          />
          {children}
        </div>
      ) : (
        <input
          id={id}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? `${id}-erreur` : undefined}
          className={`h-12 w-full rounded-xl border-2 bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-coral ${bordure}`}
          {...reste}
        />
      )}

      {erreur ? (
        <p id={`${id}-erreur`} className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  )
}
