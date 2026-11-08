/* ============================================================================
   R1 — validation des formulaires d'authentification : le module **pur**.

   Ce module est la seule autorité sur ce qui entre dans la base : les mêmes
   règles tournent au navigateur (les trois coches du mot de passe) et dans la
   server action (la décision). S'il se trompe, l'écran et le serveur se
   contredisent — et c'est l'écran qui a l'air cassé.

   Le piège propre à ce projet : le module rend des **clés** de dictionnaire,
   pas des phrases. Une clé mal orthographiée ne se voit pas dans un test de
   validation — elle lève au rendu, en production, sur une seule locale. D'où
   la vérification systématique : toute clé rendue existe dans `fr`.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import {
  MOT_DE_PASSE_MINIMUM,
  NOM_MINIMUM,
  REGLES_MOT_DE_PASSE,
  TELEPHONE_CHIFFRES,
  chiffresDe,
  emailValide,
  erreurConnexion,
  erreurDemandeReinitialisation,
  erreurMotDePasse,
  verifierInscription,
  verifierNouveauMotDePasse,
} from '../../../web/src/lib/validation-compte.mjs'

const fr = dictionnaire('fr')
const cleExiste = (cle) => Object.hasOwn(fr, cle)

/** Saisie valide de référence : chaque test n'en casse qu'un champ. */
const VALIDE = {
  nom: 'Karim Benjelloun',
  email: 'karim@moncommerce.ma',
  telephone: '06 12 34 56 78',
  motDePasse: 'Fidelia2026',
  confirmation: 'Fidelia2026',
  consentement: true,
}

const erreursDe = (surcharge) => verifierInscription({ ...VALIDE, ...surcharge }).erreurs

test('validation — les seuils sont ceux du schéma mesuré', () => {
  assert.equal(NOM_MINIMUM, 2)
  assert.equal(MOT_DE_PASSE_MINIMUM, 8)
  assert.equal(TELEPHONE_CHIFFRES, 9)
  assert.equal(REGLES_MOT_DE_PASSE.length, 3, 'trois règles affichées par la cible')
})

test('validation — une saisie valide ne produit aucune erreur', () => {
  assert.deepEqual(erreursDe({}), {})
})


test('validation — chaque champ manquant produit sa clé, et rien d’autre', () => {
  const cas = [
    [{ nom: '' }, 'nom', 'auth.nom.requis'],
    [{ email: 'pas-un-email' }, 'email', 'auth.email.invalide'],
    [{ telephone: '06 12 34' }, 'telephone', 'auth.telephone.incomplet'],
    [{ motDePasse: 'court1A', confirmation: 'court1A' }, 'motDePasse', 'auth.motDePasse.minimum'],
    [
      { motDePasse: 'sansmajuscule1', confirmation: 'sansmajuscule1' },
      'motDePasse',
      'auth.motDePasse.majusculeRequise',
    ],
    [
      { motDePasse: 'SansChiffre', confirmation: 'SansChiffre' },
      'motDePasse',
      'auth.motDePasse.chiffreRequis',
    ],
    [{ confirmation: 'Autre2026' }, 'confirmation', 'auth.confirmation.differente'],
    [{ consentement: false }, 'consentement', 'auth.consentement.requis'],
  ]

  for (const [surcharge, champ, cle] of cas) {
    const erreurs = erreursDe(surcharge)
    assert.deepEqual(Object.keys(erreurs), [champ], `${champ} : seul ce champ doit échouer`)
    assert.equal(erreurs[champ], cle)
    assert.ok(cleExiste(cle), `clé absente du dictionnaire : ${cle}`)
  }
})

test('nouveau mot de passe — les mêmes règles que l’inscription, sans le reste', () => {
  // L'écran de récupération n'a ni nom, ni email, ni consentement : s'il
  // réclamait l'un d'eux, le formulaire serait infaisable. Il ne doit rendre que
  // les deux clés du couple (mot de passe, confirmation).
  assert.deepEqual(verifierNouveauMotDePasse({}).erreurs, {
    motDePasse: 'auth.motDePasse.minimum',
    confirmation: 'auth.confirmation.differente',
  })

  assert.deepEqual(verifierNouveauMotDePasse({ motDePasse: 'Fidelia2026', confirmation: 'Fidelia2026' }).erreurs, {})
  assert.deepEqual(
    verifierNouveauMotDePasse({ motDePasse: 'Fidelia2026', confirmation: 'Fidelia2025' }).erreurs,
    { confirmation: 'auth.confirmation.differente' }
  )
  // Les trois règles sont **celles du module**, pas une copie : la clé rendue
  // est celle que l'inscription rend pour la même saisie.
  for (const faible of ['court1A', 'sansmajuscule1', 'SansChiffre']) {
    assert.equal(
      verifierNouveauMotDePasse({ motDePasse: faible, confirmation: faible }).erreurs.motDePasse,
      erreursDe({ motDePasse: faible, confirmation: faible }).motDePasse,
      `« ${faible} » n’est pas jugé comme à l’inscription`
    )
  }
  // Et toute clé rendue existe au dictionnaire : une clé fautive lèverait au
  // rendu, en production, sur le seul écran qui ne peut pas être réessayé.
  for (const cle of Object.values(verifierNouveauMotDePasse({}).erreurs)) {
    assert.ok(cleExiste(cle), `clé absente du dictionnaire : ${cle}`)
  }
})

test('validation — le consentement n’est vrai que s’il vaut `true`, pas « oui »', () => {
  // La server action traduit le formulaire (`'oui'`) en booléen **avant**
  // d'appeler ce module. Si elle cessait de le faire, `'oui' !== true` garde le
  // refus : le défaut penche du côté sûr.
  assert.equal(erreursDe({ consentement: 'oui' }).consentement, 'auth.consentement.requis')
  assert.equal(erreursDe({ consentement: 1 }).consentement, 'auth.consentement.requis')
})

test('validation — les valeurs sont rendues pour réafficher le formulaire rempli', () => {
  const { valeurs } = verifierInscription({
    ...VALIDE,
    nom: '  Karim  ',
    email: ' karim@moncommerce.ma ',
  })
  assert.equal(valeurs.nom, 'Karim', 'les espaces de bord sont retirés')
  assert.equal(valeurs.email, 'karim@moncommerce.ma')
  assert.equal(valeurs.telephone, '06 12 34 56 78')
})

test('validation — emailValide accepte le réel et refuse le reste', () => {
  for (const bon of ['a@b.co', 'karim.benjelloun+test@mon-commerce.ma', 'x@sub.domain.io']) {
    assert.equal(emailValide(bon), true, bon)
  }
  for (const mauvais of ['', 'a', 'a@b', 'a b@c.ma', '@b.ma', 'a@.ma', 'a@b.c', null, undefined]) {
    assert.equal(emailValide(mauvais), false, String(mauvais))
  }
})

test('validation — chiffresDe compte les chiffres, pas les caractères', () => {
  assert.equal(chiffresDe('06 12 34 56 78'), '0612345678')
  assert.equal(chiffresDe('+212 6-12-34-56-78'), '212612345678')
  assert.equal(chiffresDe('abc'), '')
  assert.equal(chiffresDe(null), '')
})

test('validation — la connexion ne juge que la présence', () => {
  assert.equal(erreurConnexion({ email: '', motDePasse: 'x' }), 'auth.connexion.champsVides')
  assert.equal(erreurConnexion({ email: 'a@b.co', motDePasse: '' }), 'auth.connexion.champsVides')
  // Volontairement permissif : refuser avant l'appel un mot de passe court
  // produirait un faux négatif impossible à diagnostiquer.
  assert.equal(erreurConnexion({ email: 'a@b.co', motDePasse: 'court' }), null)
})

test('validation — la demande de réinitialisation exige une adresse plausible', () => {
  assert.equal(erreurDemandeReinitialisation({ email: 'karim@moncommerce.ma' }), null)
  assert.equal(erreurDemandeReinitialisation({ email: 'nope' }), 'auth.email.invalide')
  assert.equal(erreurDemandeReinitialisation({}), 'auth.email.invalide')
})

test('validation — toutes les clés rendues existent dans le dictionnaire', () => {
  const rendues = new Set()
  for (const regle of REGLES_MOT_DE_PASSE) {
    rendues.add(regle.cle)
    rendues.add(regle.erreur)
  }
  rendues.add(erreurMotDePasse(''))
  rendues.add(erreurConnexion({ email: '', motDePasse: '' }))
  rendues.add(erreurDemandeReinitialisation({}))
  for (const surcharge of [
    { nom: '' },
    { email: 'x' },
    { telephone: '1' },
    { confirmation: 'autre' },
    { consentement: false },
  ]) {
    for (const cle of Object.values(erreursDe(surcharge))) rendues.add(cle)
  }

  for (const cle of rendues) {
    assert.ok(cle && cleExiste(cle), `clé absente du dictionnaire fr : ${cle}`)
  }
})
