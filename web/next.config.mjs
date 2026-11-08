/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Turbopack est le bundler par défaut en Next 16 : aucune option à activer.
  // Rien n'est ajouté ici tant qu'une mesure ne l'exige pas.
  //
  // `distDir` : exigé par une mesure. Vérifier qu'une route est bien un 404 en
  // production demande `next build` + `next start` — et un `build` écrit dans
  // `.next`, donc **casse le serveur de développement** qui sert la même
  // arborescence. Avec `FIDELIX_DIST_DIR=.next-build`, la vérification tourne
  // dans un répertoire à part, le dev reste debout, et l'artefact se supprime.
  // Sans la variable, le comportement est celui de Next, à l'identique.
  distDir: process.env.FIDELIX_DIST_DIR || '.next',
}

export default nextConfig
