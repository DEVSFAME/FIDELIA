/* ============================================================================
   i18n — le français seul, et ce que cela doit casser si on l'oublie.

   Décision humaine du 2026-10-31 : « pas de version EN, que du FR ». La cible,
   elle, sert trois locales (`/`, `/en`, `/ar`). L'écart est donc **choisi**, et
   un choix doit être vérifiable, sinon il dérive.

   Trois familles de défauts, toutes invisibles à l'œil :

     1. un dictionnaire `en`/`ar` réintroduit « pour plus tard » → il se
        remplit à moitié et casse au premier rendu, sur une page que personne
        n'ouvre ;
     2. un routage qui perd le préfixe (`/fr/caisse` → `/caisse`) ou qui laisse
        un ancien préfixe retiré tomber en 404 ;
     3. une négociation `Accept-Language` qui prend la première langue venue au
        lieu de respecter `q=`.

   Le module est pur (aucun import Next) : il se teste sans build.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LOCALE_PAR_DEFAUT,
  LOCALES,
  PREFIXES_RETIRES,
  directionDe,
  estLocale,
  localeSure,
} from '../../../web/src/i18n/locales.mjs'
import { cles, dictionnaire, pour, traduire } from '../../../web/src/i18n/index.mjs'
import { cheminLocalise, negocierLocale, redirectionLocale } from '../../../web/src/i18n/routage.mjs'

test('i18n — une seule locale servie : le français', () => {
  assert.deepEqual([...LOCALES], ['fr'])
  assert.equal(LOCALE_PAR_DEFAUT, 'fr')
  assert.ok(estLocale('fr'))
  assert.equal(estLocale('en'), false, 'l’anglais n’est plus servi')
  assert.equal(estLocale('ar'), false, 'l’arabe n’est plus servi')
  assert.equal(estLocale(undefined), false)
})

test('i18n — les préfixes retirés sont déclarés, pas oubliés', () => {
  // Ils ont existé (captures, liens partagés) : on les redirige, on ne les
  // laisse pas tomber en 404. S'ils disparaissaient de cette liste, un favori
  // `/en/caisse` casserait.
  assert.deepEqual([...PREFIXES_RETIRES], ['en', 'ar'])
  for (const prefixe of PREFIXES_RETIRES) assert.equal(estLocale(prefixe), false)
})

test('i18n — aucun dictionnaire fantôme : en/ar retombent sur fr', () => {
  // Le repli est volontaire : `pour('en')` ne lève pas, il sert du français.
  // Ce qui compte est qu'aucune table `en`/`ar` ne subsiste pour diverger.
  assert.deepEqual(cles('en'), cles('fr'))
  assert.deepEqual(cles('ar'), cles('fr'))
  assert.equal(pour('en').locale, 'fr')
  assert.equal(pour('ar').locale, 'fr')

  const tables = Object.keys(dictionnaire('fr'))
  assert.ok(tables.length > 0, 'le dictionnaire fr ne doit pas être vide')
  for (const cle of tables) {
    assert.equal(typeof dictionnaire('fr')[cle], 'string', `${cle} doit être une chaîne`)
  }
})

test('i18n — aucune traduction vide (une chaîne vide passe inaperçue à l’écran)', () => {
  for (const locale of LOCALES) {
    for (const [cle, valeur] of Object.entries(dictionnaire(locale))) {
      assert.equal(typeof valeur, 'string', `${locale}/${cle} doit être une chaîne`)
      assert.notEqual(valeur.trim(), '', `${locale}/${cle} est vide`)
    }
  }
})

test('i18n — traduire() rend la valeur, et lève sur une clé inconnue', () => {
  assert.equal(traduire('fr', 'marque.nom'), dictionnaire('fr')['marque.nom'])

  // L'intérêt de lever : une clé affichée telle quelle en production est un
  // défaut que personne ne signale. L'exception, elle, casse le rendu.
  assert.throws(
    () => traduire('fr', 'cle.qui.n.existe.pas'),
    /clé inconnue « cle\.qui\.n\.existe\.pas »/
  )
})

test('i18n — une locale inconnue retombe sur le français, sans lever', () => {
  assert.equal(localeSure('de'), LOCALE_PAR_DEFAUT)
  assert.equal(localeSure('xx-YY'), LOCALE_PAR_DEFAUT)
  assert.equal(localeSure('en'), LOCALE_PAR_DEFAUT)
  assert.equal(pour('fr').dir, 'ltr')
  assert.equal(pour('en').dir, 'ltr')
  assert.equal(directionDe('ar'), 'ltr', 'plus aucune locale rtl servie')
})

test('i18n — cheminLocalise n’ajoute plus aucun préfixe', () => {
  assert.equal(cheminLocalise('/', 'fr'), '/')
  assert.equal(cheminLocalise('/caisse', 'fr'), '/caisse')
  // `en` n'étant plus une locale, il ne produit plus `/en/caisse` : c'est
  // exactement ce qui garantit qu'aucun lien interne ne pointe vers une page
  // qui n'existe pas.
  assert.equal(cheminLocalise('/caisse', 'en'), '/caisse')
  assert.equal(cheminLocalise('/', 'ar'), '/')
  assert.equal(cheminLocalise('/caisse', 'de'), '/caisse')
})

test('i18n — redirectionLocale ramène /fr/* et les préfixes retirés vers /*', () => {
  assert.equal(redirectionLocale('/fr'), '/')
  assert.equal(redirectionLocale('/fr/'), '/')
  assert.equal(redirectionLocale('/fr/caisse'), '/caisse')
  assert.equal(redirectionLocale('/fr/caisse/scan'), '/caisse/scan')

  // Préfixes retirés : redirigés, pas 404.
  assert.equal(redirectionLocale('/en'), '/')
  assert.equal(redirectionLocale('/en/caisse'), '/caisse')
  assert.equal(redirectionLocale('/ar/join/cafe'), '/join/cafe')

  for (const chemin of ['/', '/caisse', '/join/cafe', '/enclume']) {
    assert.equal(redirectionLocale(chemin), null, `${chemin} ne doit pas être redirigé`)
  }
})

test('i18n — negocierLocale respecte les qualités de Accept-Language', () => {
  assert.equal(negocierLocale('fr-FR,fr;q=0.9,en;q=0.8'), 'fr')
  assert.equal(negocierLocale('ar-MA,ar;q=0.9,fr;q=0.5'), 'fr', 'ar n’est plus servi')
  // `q=` prime sur l'ordre d'apparition : c'est le piège classique.
  assert.equal(negocierLocale('en;q=0.2, fr;q=0.9'), 'fr')
  assert.equal(negocierLocale('de-DE,de;q=0.9'), LOCALE_PAR_DEFAUT)
  assert.equal(negocierLocale(''), LOCALE_PAR_DEFAUT)
  assert.equal(negocierLocale(undefined), LOCALE_PAR_DEFAUT)
})
