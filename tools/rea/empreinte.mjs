/* ============================================================================
   REA Fidelix — empreintes : normalisation, contenu, localisation des écarts.

   Ces trois fonctions étaient enfouies dans `capturer-fidelix.mjs`. Elles en
   sortent pour une seule raison : elles décident si une preuve est valable, et
   une décision de cette importance doit être TESTABLE sans réseau.

   Doctrine : on normalise MINUTIEUSEMENT. Chaque règle ajoutée ici retire du
   pouvoir de détection, donc chaque règle doit être justifiée par une mesure
   (`--diag`) et neutraliser UNE seule forme de bruit connue.
   ========================================================================== */

import { createHash } from 'node:crypto'

export const sha256 = (b) => createHash('sha256').update(b).digest('hex')

export const REGLES_NORMALISATION = [
  // Next.js embarque des identifiants de build/déploiement dans le HTML.
  [/\b(?:buildId|build_id|dplId)["']?\s*[:=]\s*["'][^"']+["']/g, 'buildId:"<build>"'],
]

/**
 * Normalisation bornée. Ne neutralise QUE le bruit de build mesuré.
 * N'essaie PAS de stabiliser une page instable : c'est le rôle de `variantes`
 * et de `empreinteContenu` (voir lesson-learned §14).
 */
export function normaliser(buf) {
  let txt = buf.toString('utf8')
  let remplacements = 0
  for (const [re, remplacement] of REGLES_NORMALISATION) {
    txt = txt.replace(re, () => {
      remplacements++
      return remplacement
    })
  }
  return { texte: txt, remplacements }
}

/**
 * Empreinte de CONTENU — ce que la page dit, indépendamment de son graphe de
 * build. Sert aux pages mesurées instables à l'octet : là, comparer des octets
 * revient à tirer à pile ou face, alors que comparer le contenu reste un test
 * strict (un libellé, un lien, un prix qui change fait échouer l'empreinte).
 *
 * Mesuré le 2026-10-27 sur `/equipe` : 3 formes d'octets sur 6 tirages
 * (73 865 o ×4, 73 865 o ×1 autre graphe, 73 908 o ×1), et un seul contenu
 * (même titre, même texte de 770 o, mêmes 18 liens).
 */
export function empreinteContenu(buf) {
  const html = buf.toString('utf8')
  const sansScript = html.replace(/<script[\s\S]*?<\/script>/g, '')
  const texte = sansScript
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const liens = [...new Set(html.match(/href=\\?"[^"\\]+/g) || [])]
    .map((l) => l.replace(/^href=\\?"/, ''))
    .sort()
  const titre = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  return {
    sha256: sha256(Buffer.from(titre + '\n' + texte + '\n' + liens.join('\n'), 'utf8')),
    titre,
    octetsTexte: texte.length,
    liens: liens.length,
  }
}

/**
 * Localise les divergences au CARACTÈRE, pas à la ligne.
 *
 * Le HTML de cette application est minifié : une page entière tient sur UNE
 * ligne. Un diff ligne à ligne répond donc « ligne 1 » — exact et inutilisable.
 * C'est ce qui a masqué, pendant deux mesures, que `/equipe` divergeait à
 * l'octet 60291 (référence de composant client dans la charge RSC).
 *
 * Parcours strictement linéaire : aucune alternative imbriquée, donc aucun
 * backtracking. Un candidat `(?:[^\[\]]|\\.)*` ne terminait PAS sur 74 Ko
 * (mesuré : processus suspendu plus de 5 minutes, tué).
 */
export function zonesDivergence(a, b, max = 6) {
  const zones = []
  let i = 0
  while (i < Math.min(a.length, b.length) && zones.length < max) {
    if (a[i] === b[i]) {
      i++
      continue
    }
    const debut = i
    let j = i
    let dernier = j
    while (j < Math.min(a.length, b.length)) {
      if (a[j] !== b[j]) dernier = j
      else if (j - dernier > 60) break
      j++
    }
    zones.push({
      debut,
      longueur: dernier - debut + 1,
      a: a.slice(debut, debut + 200),
      b: b.slice(debut, debut + 200),
    })
    i = j
  }
  return zones
}
