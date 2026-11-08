/* ============================================================================
   Les règles pures des quatre écrans : paliers, codes de carte, QR.

   Ce qui est vérifié ici ne demande ni base, ni navigateur — donc tourne en
   quelques millisecondes et échoue au premier raisonnement faux.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  creditsParEuroValide,
  formaterTaux,
  normaliserSlug,
  paliersAtteignables,
  pointsDepuisMontant,
  prochainPalier,
  progression,
  refusPaliers,
  slugValide,
} from '../../../web/src/lib/programme.mjs'
import { codeCarteValide, normaliserCode } from '../../../web/src/lib/carte.mjs'
import { MARGE_MODULES, cheminSvg, matriceQr, urlAdhesion } from '../../../web/src/lib/qr.mjs'

const PALIERS = [
  { rang: 1, libelle: 'Boisson offerte', cout: 45 },
  { rang: 2, libelle: 'Dessert offert', cout: 75 },
  { rang: 3, libelle: 'Plat offert', cout: 120 },
]

test('programme — slug : forme mesurée, normalisation des fautes d’usage', () => {
  assert.equal(slugValide('cafe-test-cei3'), true)
  assert.equal(slugValide('ab'), false, 'trop court')
  assert.equal(slugValide('Cafe Test'), false, 'espaces et majuscules')
  assert.equal(slugValide('-debut'), false, 'ne commence pas par un tiret')
  assert.equal(normaliserSlug('  Cafe Test '), 'cafe-test')
})

test('programme — paliers : non vides, coûts strictement croissants', () => {
  assert.deepEqual(refusPaliers(PALIERS), [])
  assert.deepEqual(refusPaliers([]), ['aucun palier'])
  assert.equal(refusPaliers([{ libelle: '', cout: 10 }]).length > 0, true)
  assert.equal(refusPaliers([{ libelle: 'A', cout: 0 }]).length > 0, true)
  assert.equal(refusPaliers([{ libelle: 'A', cout: 1.5 }]).length > 0, true)

  // Deux paliers au même coût : le second devient inatteignable en pratique.
  const egaux = refusPaliers([
    { libelle: 'A', cout: 45 },
    { libelle: 'B', cout: 45 },
  ])
  assert.match(egaux.join(' '), /dépasser 45/)

  const inverse = refusPaliers([
    { libelle: 'A', cout: 75 },
    { libelle: 'B', cout: 45 },
  ])
  assert.match(inverse.join(' '), /dépasser 75/)
})

test('programme — prochain palier : « encore N points »', () => {
  assert.deepEqual(prochainPalier(0, PALIERS), { ...PALIERS[0], reste: 45 })
  assert.equal(prochainPalier(10, PALIERS).reste, 35)
  assert.equal(prochainPalier(45, PALIERS).cout, 75, 'atteint, on annonce le suivant')
  assert.equal(prochainPalier(45, PALIERS).reste, 30)
  assert.equal(prochainPalier(500, PALIERS), null)
  assert.equal(prochainPalier(NaN, []), null)
  assert.equal(prochainPalier(undefined, undefined), null)
})

test('programme — progression bornée, jamais NaN', () => {
  assert.equal(progression(0, 45), 0)
  assert.equal(progression(45, 45), 1)
  assert.equal(progression(90, 45), 1, 'un solde supérieur ne dépasse pas 1')
  assert.equal(progression(10, 0), 0, 'un coût nul ne divise pas par zéro')
  assert.equal(progression(undefined, 45), 0)
})

test('programme — ce que la caisse peut proposer', () => {
  assert.deepEqual(paliersAtteignables(0, PALIERS), [])
  assert.deepEqual(
    paliersAtteignables(80, PALIERS).map((p) => p.cout),
    [45, 75]
  )
  assert.deepEqual(paliersAtteignables(1000, PALIERS), PALIERS)
})

test('carte — le code est normalisé avant comparaison', () => {
  // Les trois saisies réelles du POS : clavier, collage, lien.
  for (const saisie of [
    'C-AB12CD',
    'c-ab12cd',
    '  C-ab12cd  ',
    'https://fidelia.ma/card/c-ab12cd',
  ]) {
    assert.equal(normaliserCode(saisie), 'C-AB12CD', `saisie : ${saisie}`)
    assert.equal(codeCarteValide(saisie), true, `saisie : ${saisie}`)
  }

  assert.equal(codeCarteValide('C-AB12C'), false, '5 caractères')
  assert.equal(codeCarteValide('AB12CD'), false, 'sans préfixe')
  assert.equal(codeCarteValide(''), false)
  assert.equal(normaliserCode(''), '')
})


test('qr — structure conforme : taille, marge, motifs de repère', () => {
  const { taille, modules } = matriceQr('https://fidelia.ma/join/cafe-test-cei3')

  // Une version QR n a une taille de 21 + 4*(n-1).
  assert.equal((taille - 21) % 4, 0, `taille inattendue : ${taille}`)
  assert.equal(modules.length, taille)
  assert.equal(modules[0].length, taille)

  // Les trois motifs de repère (7×7) sont aux coins haut-gauche, haut-droit,
  // bas-gauche : leur absence signifie un QR illisible.
  for (const [l, c] of [
    [0, 0],
    [0, taille - 7],
    [taille - 7, 0],
  ]) {
    assert.equal(modules[l][c], true, `coin noir absent en ${l},${c}`)
    assert.equal(modules[l][c + 6], true, `barre haute incomplète en ${l},${c}`)
    assert.equal(modules[l + 6][c], true, `barre basse incomplète en ${l},${c}`)
    assert.equal(modules[l + 1][c + 1], false, 'le cœur du motif doit être clair')
  }
})

test('qr — marge obligatoire et chemin compact', () => {
  const matrice = matriceQr('C-AB12CD')
  const { d, cote } = cheminSvg(matrice)
  assert.equal(cote, matrice.taille + MARGE_MODULES * 2, 'la marge est dans le viewBox')
  assert.ok(d.length > 0)
  // Un `<rect>` par module produirait ~1 300 commandes ; la fusion par segment
  // doit rester largement en dessous.
  const commandes = (d.match(/M/g) || []).length
  assert.ok(commandes < (matrice.taille * matrice.taille) / 2, `trop de segments : ${commandes}`)
  assert.equal(/NaN|undefined/.test(d), false, 'chemin corrompu')
})

test('qr — même texte, même matrice (pas de hasard)', () => {
  const a = JSON.stringify(matriceQr('https://fidelia.ma/join/x'))
  const b = JSON.stringify(matriceQr('https://fidelia.ma/join/x'))
  assert.equal(a, b)
})

test('qr — entrées invalides refusées explicitement', () => {
  assert.throws(() => matriceQr(''), /vide/)
  assert.throws(() => matriceQr('   '), /vide/)
  assert.throws(() => matriceQr('x', { correction: 'Z' }), /correction inconnue/)
  assert.equal(urlAdhesion('https://fidelia.ma/', 'cafe'), 'https://fidelia.ma/join/cafe')
})

/* ---------------------------------------------------------------------------
   Taux de conversion — « crédits par euro » (migration `0008`)
   ---------------------------------------------------------------------------
   Ce que ces cas empêchent : un taux `NaN` qui produit des points `NaN`, un
   `0` silencieux qui mettrait le programme à zéro point par euro, et un arrondi
   par troncature qui ferait perdre un point à chaque achat.
*/
test('taux — la plage acceptée est celle de la base (0,01 à 1000)', () => {
  for (const bon of [0.01, 1, 1.5, 2.25, 1000]) {
    assert.equal(creditsParEuroValide(bon), true, `refusé à tort : ${bon}`)
  }
  for (const mauvais of [0, -1, 0.001, 1000.01, NaN, Infinity, '1', null, undefined, {}]) {
    assert.equal(creditsParEuroValide(mauvais), false, `accepté à tort : ${String(mauvais)}`)
  }
})

test('taux — les points sont arrondis au plus proche, jamais tronqués', () => {
  // 12,50 × 1,5 = 18,75 -> 19 (tronquer donnerait 18, donc un point perdu).
  assert.equal(pointsDepuisMontant(12.5, 1.5), 19)
  assert.equal(pointsDepuisMontant(10, 1), 10)
  assert.equal(pointsDepuisMontant(10, 2.5), 25)
  assert.equal(pointsDepuisMontant(0.4, 1), 0, 'moins d’un demi-point ne crédite rien')

  // Une entrée inexploitable rend 0, jamais NaN : « NaN pts » n'a aucun sens
  // en caisse, et `construireAttribution` refuserait l'appel après coup.
  assert.equal(pointsDepuisMontant(10, NaN), 0)
  assert.equal(pointsDepuisMontant(NaN, 1), 0)
  assert.equal(pointsDepuisMontant(-5, 1), 0)
  assert.equal(pointsDepuisMontant(10, 0), 0, 'un taux nul n’est pas un taux')
})

test('taux — l’affichage ne garde pas de zéro inutile', () => {
  assert.equal(formaterTaux(1), '1')
  assert.equal(formaterTaux(1.5), '1.5')
  assert.equal(formaterTaux('2.25'), '2.25')
  assert.equal(formaterTaux(2.5001), '2.5')
  assert.equal(formaterTaux(0), '')
  assert.equal(formaterTaux(null), '')
})
