/* ============================================================================
   Manifeste de la caisse — la coque PWA des quatre modules.

   Forme **mesurée** sur la cible (`_captures/2026-10-26/raw/pages/
   p21-caisse-manifest.html`, 453 o) : même `start_url`, même `scope`, même
   `display`, mêmes couleurs, mêmes icônes. Une seule valeur change, et c'est
   une décision : `name` porte **notre** marque. `basal-knowledge.md` §14
   interdit de réutiliser « Fidelix » dans la PWA ; le nom vient donc du
   dictionnaire, source unique, et `pwa.test.mjs` le compare à la capture.

   `short_name` reste « Caisse » — c'est le libellé de l'icône, pas la marque.
   ========================================================================== */

import { dictionnaire } from '../i18n/index.mjs'

/** URL exacte servie par la cible (balise `<link rel="manifest">` de `p09`). */
export const CHEMIN_MANIFESTE = '/caisse/manifest.webmanifest'

/** Chemin sous lequel le service worker est servi (racine ⇒ portée globale). */
export const CHEMIN_SERVICE_WORKER = '/sw.js'

/** Écran de repli hors ligne : public, donc lisible sans session. */
export const CHEMIN_REPLI = '/caisse-hors-ligne'

/** Les trois entrées d'icônes de la capture, à l'octet. */
export const ICONES = Object.freeze([
  Object.freeze({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
  Object.freeze({ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
  Object.freeze({ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
])

/**
 * Le manifeste, dans l'ordre de clés de la capture.
 * @param {{marque?: string}} [options]
 */
export function manifesteCaisse({ marque = dictionnaire('fr')['marque.nom'] } = {}) {
  return {
    name: `Caisse ${marque}`,
    short_name: 'Caisse',
    description: 'Scanner les cartes de fidélité en caisse.',
    start_url: '/caisse',
    scope: '/caisse',
    display: 'standalone',
    background_color: '#faf9f8',
    theme_color: '#1a1a1a',
    icons: ICONES.map((icone) => ({ ...icone })),
  }
}
