/**
 * Gardes de `basal-knowledge.md`.
 *
 * Ce fichier contient des tableaux de **comptages** (« 1 nom d'outil contre 8
 * mots-clés absents »). Un comptage écrit de mémoire dérive ; un comptage
 * vérifié casse quand la source change — et c'est exactement ce qu'on veut :
 * si un document se met à documenter la mécanique Wallet, la conclusion
 * « les documents nomment l'outil et ignorent le mécanisme » devient fausse, et
 * ce test doit le dire.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (nom) => readFileSync(join(RACINE, nom), 'utf8')
const compter = (texte, motif) => (texte.match(motif) || []).length

const SPEC = 'Spécifications techniques plateforme de fidélité QR code.md'
const CONV = 'conversation.md'
const CONTRATS = '01_REA_Fidelix/Global/Fidelix_API_Contrats.md'

test('basal-knowledge.md existe et porte les trois régimes de preuve', () => {
  const chemin = join(RACINE, 'basal-knowledge.md')
  assert.ok(existsSync(chemin), 'le fichier doit exister à la racine de FIDELIX')
  const k = readFileSync(chemin, 'utf8')
  for (const marque of ['**[M]**', '**[D]**', '**[G]**']) {
    assert.ok(k.includes(marque), `la marque ${marque} doit être définie et utilisée`)
  }
})

test('§2.2 : les documents citent l’outil Wallet UNE fois et zéro mécanisme', () => {
  const conv = lire(CONV)
  const spec = lire(SPEC)
  assert.equal(compter(conv, /passkit-generator/g), 1)
  assert.equal(compter(spec, /passkit-generator/g), 0)

  // Les 7 mots-clés de la mécanique : 0 partout, dans les deux documents.
  const mecanique = [
    /passTypeIdentifier/g, /teamIdentifier/g, /webServiceURL/g,
    /authenticationToken/g, /pkpass/g, /vnd\.apple\.pkpass/g, /serialNumber/g,
  ]
  for (const m of mecanique) {
    assert.equal(compter(conv, m), 0, `${m} doit rester absent de conversation.md`)
    assert.equal(compter(spec, m), 0, `${m} doit rester absent de la spec`)
  }
})

test('§2.2 : le décompte du tableau est verrouillé — 1 outil + 7 mots-clés = 8 lignes', () => {
  const k = readFileSync(join(RACINE, 'basal-knowledge.md'), 'utf8')
  // Le libellé doit dire 7, pas 8 : 8 est le nombre de LIGNES, pas de mots-clés.
  assert.ok(k.includes('7 mots-clés de mécanique'))
  assert.equal(/contre 8 mots-clés/.test(k), false, 'un off-by-one est déjà arrivé ici')
  // Et le tableau de §2.2 porte bien 8 lignes de données.
  const debut = k.indexOf('| Mot-clé de la mécanique |')
  assert.notEqual(debut, -1)
  const fin = k.indexOf('\n\n', debut)
  const lignes = k.slice(debut, fin).split('\n').filter((l) => l.startsWith('|'))
  // 1 en-tête + 1 séparateur + 8 données
  assert.equal(lignes.length, 10)
})

test('la spec ne parle pas du tout de Wallet — donc aucun conseil à en tirer', () => {
  assert.equal(compter(lire(SPEC), /wallet/gi), 0)
})

test('§2.1 : les trois routes wallet sont bien dans le contrat mesuré', () => {
  const c = lire(CONTRATS)
  for (const route of [
    '/api/wallet/apple/<cardId>',
    '/api/wallet/apple/<cardId>/statut',
    '/api/wallet/google/<cardId>',
  ]) {
    assert.ok(c.includes(route), `le contrat mesuré doit contenir ${route}`)
  }
  // Et l'asymétrie : le 404 de statut Google est mesuré, pas supposé.
  assert.ok(/google\/<id>\/statut/.test(c) || /google\/<uuid réel>\/statut/.test(c))
})

test('§3.2 : `html5-qrcode` est bien cité par LES DEUX documents', () => {
  assert.ok(lire(CONV).includes('html5-qrcode'))
  assert.ok(lire(SPEC).includes('html5-qrcode'))
  // `@zxing` n'apparaît que dans la conversation : la spec ne le reprend pas.
  assert.ok(lire(CONV).includes('zxing'))
})

test('§11 : l’i18n n’a aucun contrat mesuré — c’est écrit dans l’état basal', () => {
  const eb = lire('01_REA_Fidelix/Global/Fidelix_Etat_Basal.md')
  assert.ok(/i18n FR\/EN\/AR\s*\|\s*aucun contrat/i.test(eb))
})
