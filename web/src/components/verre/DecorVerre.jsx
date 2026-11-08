/* ============================================================================
   Le décor « verre » : trois couches, toutes mesurées.

   1. Le filtre SVG `#verre-liquide` — `feTurbulence` fractal animée sur 18 s,
      puis `feDisplacementMap` (scale 10, canaux R/G). C'est la **réfraction** :
      les bords du verre ondulent, sans image ni WebGL.
   2. Le grain — une image SVG de bruit, désaturée (`feColorMatrix saturate 0`),
      passée à `--grain-image` et révélée par `--grain-opacite`.
   3. Les halos — `.fond-premium`.

   Le grain et les halos sont `aria-hidden` et `pointer-events-none` : ils ne
   doivent ni être lus, ni intercepter un clic.
   ========================================================================== */

// Reproduit octet pour octet le data-URI de la cible (p01-home.html), `#` → %23.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function DecorVerre() {
  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter
            id="verre-liquide"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.012"
              numOctaves="2"
              seed="3"
              result="ondes"
            >
              <animate
                attributeName="baseFrequency"
                dur="18s"
                values="0.008 0.012;0.012 0.008;0.008 0.012"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="ondes"
              scale="10"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div aria-hidden="true" className="grain-premium" style={{ '--grain-image': GRAIN }} />
      <div aria-hidden="true" className="fond-premium pointer-events-none fixed inset-0" />
    </>
  )
}
