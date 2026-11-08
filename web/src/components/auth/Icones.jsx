/* ============================================================================
   Icônes des écrans d'authentification — **chemins mesurés**, aucun paquet.

   La cible utilise `lucide-react` (les noms de composants et les `key` internes
   apparaissent dans ses bundles). On n'ajoute pas la dépendance pour sept
   icônes : chaque tracé ci-dessous est recopié **du bundle de la cible**, donc
   le dessin est celui qu'on a mesuré, et `npm install` ne change pas.

   Les attributs du conteneur sont aussi ceux de lucide (`viewBox 24`,
   `stroke-width 2`, `round`), sinon les tracés ne se dessinent pas à
   l'identique.

   `aria-hidden` + `focusable="false"` : une icône purement décorative ne doit
   pas être annoncée ; quand elle porte un sens, c'est le bouton qui porte
   `aria-label` (cf. `FormulaireInscription`).
   ========================================================================== */

function Icone({ className = 'h-4 w-4', children }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function Oeil(props) {
  return (
    <Icone {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Icone>
  )
}

export function OeilBarre(props) {
  return (
    <Icone {...props}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </Icone>
  )
}

export function FlecheDroite(props) {
  return (
    <Icone {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icone>
  )
}

export function FlecheGauche(props) {
  return (
    <Icone {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Icone>
  )
}

export function EnveloppeCoche(props) {
  return (
    <Icone {...props}>
      <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      <path d="m16 19 2 2 4-4" />
    </Icone>
  )
}

export function CercleCoche(props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icone>
  )
}

export function CercleCharge(props) {
  return (
    <Icone {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icone>
  )
}
