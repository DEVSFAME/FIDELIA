/**
 * Le mapping prénom / nom est **vérifié**, pas commenté.
 *
 * Si quelqu'un inverse les deux colonnes un jour, ce fichier échoue au lieu de
 * laisser passer « Dupont Jean » sur toutes les fiches.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { cleTri, depuisLigne, nomComplet } from '../../../web/src/lib/personne.mjs'

test('personne — `first_name` est le PRÉNOM, `last_name` le NOM', () => {
  const personne = depuisLigne({ first_name: 'Jean', last_name: 'Dupont' })
  assert.equal(personne.prenom, 'Jean')
  assert.equal(personne.nom, 'Dupont')

  // L'erreur classique : croire que `last_name` porte le prénom parce qu'il
  // vient en second. On l'épingle explicitement.
  assert.notEqual(personne.prenom, 'Dupont')
  assert.notEqual(personne.nom, 'Jean')
})

test('personne — affichage « prénom nom »', () => {
  assert.equal(nomComplet({ prenom: 'Jean', nom: 'Dupont' }), 'Jean Dupont')
  assert.equal(nomComplet({ prenom: '  Jean ', nom: ' Dupont  ' }), 'Jean Dupont')
})

test('personne — un nom manquant ne laisse ni trou ni « undefined »', () => {
  assert.equal(nomComplet({ prenom: 'Jean' }), 'Jean')
  assert.equal(nomComplet({ nom: 'Dupont' }), 'Dupont')
  assert.equal(nomComplet({}), '')
  assert.equal(nomComplet(), '')
  assert.equal(depuisLigne(null).prenom, '')
  assert.equal(depuisLigne(undefined).nom, '')
})

test('personne — le tri se fait sur le NOM, pas sur le prénom', () => {
  assert.equal(cleTri({ prenom: 'Jean', nom: 'Dupont' }), 'dupont jean')

  // Deux « Jean » ne doivent pas être voisins si leurs noms diffèrent.
  const liste = [
    { prenom: 'Jean', nom: 'Zola' },
    { prenom: 'Jean', nom: 'Dupont' },
  ].sort((a, b) => cleTri(a).localeCompare(cleTri(b)))

  assert.deepEqual(
    liste.map((p) => p.nom),
    ['Dupont', 'Zola'],
    'le tri sur le prénom aurait laissé l’ordre initial'
  )
})

test('personne — le tri plie les accents', () => {
  assert.equal(cleTri({ nom: 'Élodie' }), 'elodie')
  const liste = [{ nom: 'Zola' }, { nom: 'Élodie' }].sort((a, b) =>
    cleTri(a).localeCompare(cleTri(b))
  )
  assert.deepEqual(liste.map((p) => p.nom), ['Élodie', 'Zola'])
})
