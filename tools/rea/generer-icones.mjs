#!/usr/bin/env node
/* ============================================================================
   Icônes de la PWA caisse — engendrées, pas dessinées à la main.

     node tools/rea/generer-icones.mjs      # écrit web/public/icon-{192,512}.png

   Pourquoi un générateur : le manifeste de la cible référence `/icon-192.png`
   et `/icon-512.png`, et ce dépôt n'a **aucun** outil graphique ni dépendance
   d'image. Un PNG écrit à la main serait un binaire opaque ; celui-ci se
   relit : mêmes octets à chaque exécution, dimensions vérifiables, et
   `pwa.test.mjs` décompresse l'IDAT pour le prouver.

   Le motif est un « F » (Fidelia) sur le fond `#1a1a1a` du manifeste, dans la
   zone sûre d'une icône *maskable* (rayon 40 % depuis le centre) : la même
   image sert aux deux entrées, comme dans la capture.
   ========================================================================== */

import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(RACINE, 'web', 'public')

const FOND = [0x1a, 0x1a, 0x1a]
const TRAIT = [0xfa, 0xf9, 0xf8]

/** Table CRC32 (polynôme PNG, réfléchi). */
const TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const octet of buffer) c = TABLE[(c ^ octet) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Un bloc PNG : longueur, type, données, CRC des deux derniers. */
function bloc(type, donnees) {
  const entete = Buffer.alloc(4)
  entete.writeUInt32BE(donnees.length, 0)
  const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corps), 0)
  return Buffer.concat([entete, corps, crc])
}

/** Le « F » : barre verticale, barre haute, barre médiane. */
function dansLeMotif(x, y, largeur, hauteur) {
  const nx = (x + 0.5) / largeur
  const ny = (y + 0.5) / hauteur
  const barre = nx >= 0.3 && nx <= 0.38 && ny >= 0.24 && ny <= 0.76
  const haute = nx >= 0.3 && nx <= 0.7 && ny >= 0.24 && ny <= 0.36
  const mediane = nx >= 0.3 && nx <= 0.62 && ny >= 0.44 && ny <= 0.55
  return barre || haute || mediane
}

/**
 * PNG RVB (8 bits, sans canal alpha) — filtre 0 sur chaque ligne.
 * @param {number} largeur
 * @param {number} hauteur
 */
export function png(largeur, hauteur) {
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(largeur, 0)
  entete.writeUInt32BE(hauteur, 4)
  entete[8] = 8 // profondeur
  entete[9] = 2 // couleur : RVB
  entete[10] = 0
  entete[11] = 0
  entete[12] = 0

  const brut = Buffer.alloc(hauteur * (1 + largeur * 3))
  let curseur = 0
  for (let y = 0; y < hauteur; y += 1) {
    brut[curseur] = 0
    curseur += 1
    for (let x = 0; x < largeur; x += 1) {
      const couleur = dansLeMotif(x, y, largeur, hauteur) ? TRAIT : FOND
      brut[curseur] = couleur[0]
      brut[curseur + 1] = couleur[1]
      brut[curseur + 2] = couleur[2]
      curseur += 3
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const taille of [192, 512]) {
    const fichier = join(PUBLIC, `icon-${taille}.png`)
    const octets = png(taille, taille)
    writeFileSync(fichier, octets)
    const empreinte = createHash('sha256').update(octets).digest('hex')
    console.log(`${fichier} — ${octets.length} o — sha256 ${empreinte}`)
  }
}
