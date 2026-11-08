/* ============================================================================
   QR — de la chaîne à un chemin SVG, sans React et sans réseau.

   L'encodage lui-même n'est pas de nous : `vendor/qrcode-generator.cjs`
   (MIT, Arase, 1.4.4 — provenance et SHA-256 dans `vendor/README.md`).
   Ce module ne fait que deux choses, et c'est là qu'on teste :

     1. `matriceQr(texte)` → `boolean[][]` (vrai = module sombre) ;
     2. `cheminSvg(matrice)` → un `d` SVG **compact** : les suites horizontales
        de modules sombres sont fusionnées en un seul rectangle. Sans cette
        fusion, un QR de version 3 produit ~1 300 `<rect>` au lieu de ~200
        commandes, et le HTML duplique la même information.

   Le silence (marge blanche) est **obligatoire** pour qu'un lecteur accroche :
   sans lui, le QR collé à un bord échoue au scan. On l'ajoute ici, pas dans le
   CSS, pour qu'il ne puisse pas être oublié par un écran.
   ========================================================================== */

import qrcode from '../vendor/qrcode-generator.cjs'

/** Marge normalisée (4 modules), imposée par la spécification QR. */
export const MARGE_MODULES = 4

/** Niveaux de correction d'erreur admis par la bibliothèque. */
const CORRECTIONS = Object.freeze(['L', 'M', 'Q', 'H'])

/**
 * Matrice de modules d'un texte.
 *
 * @param {string} texte
 * @param {{correction?: 'L'|'M'|'Q'|'H'}} [options]
 * @returns {{taille: number, modules: boolean[][]}} `modules[ligne][colonne]`
 */
export function matriceQr(texte, { correction = 'M' } = {}) {
  if (typeof texte !== 'string' || texte.trim() === '') {
    throw new Error('QR : le texte à encoder ne peut pas être vide')
  }
  if (!CORRECTIONS.includes(correction)) {
    throw new Error(`QR : correction inconnue « ${correction} » (L, M, Q, H)`)
  }
  // `0` = numéro de version automatique : la bibliothèque choisit le plus petit
  // qui contient les données. En coder un en dur casserait dès qu'une URL
  // s'allonge (domaine de production plus long que `localhost`).
  const code = qrcode(0, correction)
  code.addData(texte)
  code.make()

  const taille = code.getModuleCount()
  const modules = Array.from({ length: taille }, (_, ligne) =>
    Array.from({ length: taille }, (_, colonne) => code.isDark(ligne, colonne))
  )
  return { taille, modules }
}

/**
 * Chemin SVG du QR, marge comprise.
 *
 * Le `viewBox` attendu est `0 0 taille+2*marge taille+2*marge` ; `cheminSvg`
 * rend cette valeur pour qu'aucun appelant ne la recalcule de travers.
 *
 * @param {{taille: number, modules: boolean[][]}} matrice
 * @returns {{d: string, cote: number}}
 */
export function cheminSvg({ taille, modules }) {
  const decalage = MARGE_MODULES
  const morceaux = []

  for (let ligne = 0; ligne < taille; ligne += 1) {
    let colonne = 0
    while (colonne < taille) {
      if (!modules[ligne][colonne]) {
        colonne += 1
        continue
      }
      // Suite horizontale sombre : une seule commande pour tout le segment.
      let fin = colonne
      while (fin + 1 < taille && modules[ligne][fin + 1]) fin += 1
      const largeur = fin - colonne + 1
      morceaux.push(`M${colonne + decalage} ${ligne + decalage}h${largeur}v1h-${largeur}z`)
      colonne = fin + 1
    }
  }

  return { d: morceaux.join(''), cote: taille + decalage * 2 }
}

/**
 * URL d'adhésion encodée dans le QR d'un commerce.
 *
 * Forme **mesurée** sur la cible (`/join/<slug>`, `sitemap.xml` : 27 slugs) :
 * c'est cette page que le client final ouvre en scannant la plaque du comptoir.
 *
 * @param {string} origine ex. `https://fideliatest.site`
 * @param {string} slug    ex. `cafe-test-cei3`
 */
export function urlAdhesion(origine, slug) {
  const base = String(origine ?? '').replace(/\/+$/, '')
  return `${base}/join/${String(slug ?? '').trim()}`
}
