/* ============================================================================
   Proxy (ex-« middleware », renommé en Next 16 : `middleware` est déprécié).

   Rôle en R1 : **une seule** décision de routage, la locale. La garde
   d'authentification (`307 → /login`, 12 routes mesurées) appartient à 2.3 et
   n'est pas improvisée ici : une garde à moitié écrite laisse passer des pages
   privées, ce qui est pire que pas de garde du tout.

   Depuis le 2026-11-09, une **seconde** décision, fermée par mesure : une
   soumission qui ne peut aboutir nulle part (`POST /`, ou identifiant d'action
   tronqué) est renvoyée sur une page réelle au lieu du `400` muet de Next que
   Chrome rend en page d'erreur réseau. La règle est pure et testée :
   `lib/action-perdue.mjs`.

   La décision de locale est **pure** (`redirectionLocale`) et testée hors Next :
   `tools/rea/tests/i18n.test.mjs`.
   ========================================================================== */

import { NextResponse } from 'next/server'
import { redirectionLocale } from './i18n/routage.mjs'
import { cibleDeRepli } from './lib/action-perdue.mjs'

/**
 * @param {import('next/server').NextRequest} request
 */
export function proxy(request) {
  const repli = cibleDeRepli({
    methode: request.method,
    chemin: request.nextUrl.pathname,
    idAction: request.headers.get('next-action'),
  })
  if (repli !== null) {
    /* 303, jamais 307 : un 307 rejouerait le POST sur la cible, donc la même
       requête refusée. 303 la transforme en GET de la page. */
    return NextResponse.redirect(new URL(repli, request.nextUrl.origin), 303)
  }

  const cible = redirectionLocale(request.nextUrl.pathname)
  if (cible !== null) {
    const url = request.nextUrl.clone()
    url.pathname = cible
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

/* Sans `matcher`, le proxy tourne **sur les fichiers statiques** et peut
   bloquer CSS, JS et images. On exclut explicitement `_next/*` et les médias. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)'],
}
