import { cheminSvg, matriceQr } from '@/lib/qr.mjs'

/* Affichage d'un QR — **noir sur blanc**, et ce n'est pas une préférence.
 *
 * Un QR se lit par contraste : posé sur le verre bleu nuit, un code clair sur
 * fond sombre passe sur certains lecteurs et échoue sur d'autres. On l'impose
 * donc dans un carré blanc, avec des modules **noirs** (`#000`), pas la couleur
 * de la marque. C'est une contrainte de scannabilité, déclarée dans
 * `docs/design-system.md` §3.
 *
 * Le composant est un composant **serveur** : la matrice est calculée une fois
 * au rendu, sans JavaScript côté client, et le SVG pèse moins qu'une image.
 */
export function QrCode({ texte, taille = 220, legende }) {
  const matrice = matriceQr(texte)
  const { d, cote } = cheminSvg(matrice)

  return (
    <figure className="m-0 inline-flex flex-col items-center gap-2">
      <div className="rounded-2xl bg-white p-3">
        <svg
          role="img"
          aria-label={legende ?? 'QR code'}
          width={taille}
          height={taille}
          viewBox={`0 0 ${cote} ${cote}`}
          shapeRendering="crispEdges"
        >
          {/* `fill="none"` sur un seul <path> : le blanc est celui du conteneur,
              donc le contraste ne dépend pas du thème. */}
          <rect width={cote} height={cote} fill="#ffffff" />
          <path d={d} fill="#000000" />
        </svg>
      </div>
      {legende ? <figcaption className="text-xs opacity-60">{legende}</figcaption> : null}
    </figure>
  )
}
