import { manifesteCaisse } from '@/lib/pwa.mjs'

/* Le manifeste de la caisse, engendré — pas un fichier statique.
 *
 * Pourquoi une route et non `public/caisse/manifest.webmanifest` : le nom porte
 * la **marque**, qui a une seule source (`marque.nom` au dictionnaire). Un JSON
 * écrit à la main aurait été la deuxième, et `i18n-ui` ne balaie que `src/` :
 * la divergence serait passée inaperçue jusqu'à l'installation.
 *
 * Le type MIME est celui de la spécification (`application/manifest+json`) ;
 * `Response.json` poserait `application/json`, ce que Chrome lit mais que la
 * spec ne prévoit pas.
 */
export function GET() {
  return new Response(JSON.stringify(manifesteCaisse()), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  })
}
