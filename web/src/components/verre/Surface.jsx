/* ============================================================================
   `Surface` — le seul point d'entrée vers les classes de matériau.

   Pourquoi un composant et pas des classes écrites à la main dans chaque page :
   les variantes forment un ensemble **fermé**. Une faute de frappe
   (`className="verre-forts"`) ne casse rien visiblement — elle rend juste un
   div transparent. Ici, une variante inconnue lève.

   Les valeurs ne sont pas dans ce fichier : elles sont dans `styles/verre.css`,
   lui-même vérifié contre la capture par `verifier-design.mjs`.
   ========================================================================== */

const VARIANTES = {
  verre: 'verre',
  fort: 'verre-fort',
  refracte: 'verre-refracte',
  vitre: 'vitre',
  'vitre-menu': 'vitre vitre-menu',
}

/**
 * @param {object} props
 * @param {'verre'|'fort'|'refracte'|'vitre'|'vitre-menu'} [props.variante]
 * @param {'orange'|'encre'} [props.sur]  sur quoi la surface est posée
 * @param {keyof JSX.IntrinsicElements} [props.as]
 */
export function Surface({ variante = 'verre', sur, as: Balise = 'div', className = '', children, ...reste }) {
  const classe = VARIANTES[variante]
  if (!classe) {
    throw new Error(
      `Surface : variante inconnue « ${variante} ». Valeurs admises : ${Object.keys(VARIANTES).join(', ')}`
    )
  }
  return (
    <Balise className={`${classe} ${className}`.trim()} data-sur={sur} {...reste}>
      {children}
    </Balise>
  )
}
