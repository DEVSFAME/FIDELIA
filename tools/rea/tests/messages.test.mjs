/* ============================================================================
   P0-4 — `/notifications`, de la capture à la file.

   Ce que ce fichier empêche :
     1. **des bornes inventées** — 3/50 et 10/150 sont lues dans le chunk de la
        cible, pas choisies ; le module les exporte une fois ;
     2. **un message qui part sans canal** — l'écran ne doit jamais écrire
        « Envoyé » : `cleStatut` ne rend `statutEnvoye` que pour un statut
        `envoye`, qu'aucune migration ne produit aujourd'hui ;
     3. **un quota mal borné** — `etatQuota` est testé sur ses frontières ;
     4. **un zéro inventé** — `lireMessages` rend `null` sur une forme inconnue,
        y compris un `messages` qui n'est pas un tableau ;
     5. **un lien dangereux** — `javascript:` et `mailto:` sont refusés, un lien
        vide est accepté (il est simplement absent) ;
     6. **un refus dans le désordre** — l'ordre des codes fixe l'état d'URL que
        l'action choisit ; deux essais identiques doivent afficher la même erreur.

   Aucun navigateur, aucune connexion : captures, sources, modules purs.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import {
  HISTORIQUE,
  LIEN_MAX,
  MESSAGE_MAX,
  MESSAGE_MIN,
  QUOTA_JOUR,
  TITRE_MAX,
  TITRE_MIN,
  cleStatut,
  etatQuota,
  lienValide,
  lireMessages,
  messageDepuisFormulaire,
  refusMessage,
} from '../../../web/src/lib/messages.mjs'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const CAPTURE = lire(
  '01_REA_Fidelix',
  '_captures',
  '2026-11-02-a7b',
  'rendu',
  'd01-notifications.html'
)

const CHUNK = lire(
  '01_REA_Fidelix',
  '_captures',
  '2026-10-27-auth-s3',
  'raw',
  'assets',
  '_next_static_chunks_app__dashboard__notifications_page-955a13495c2b4d76.js'
)

const fr = dictionnaire('fr')

test('P0-4 — les bornes viennent de la cible, pas d’un choix', () => {
  // Témoins lus dans le chunk (Zod). Les accents y sont échappés (`caract\xe8res`),
  // donc on s'arrête avant : c'est la borne qui compte, pas l'orthographe.
  assert.match(CHUNK, /max\(50,"Titre trop long \(50 caract/)
  assert.match(CHUNK, /min\(3,"Titre trop court"\)/)
  assert.match(CHUNK, /min\(10,"Message trop court"\)/)
  assert.match(CHUNK, /max\(150,"Message trop long \(150 caract/)

  assert.deepEqual(
    { TITRE_MIN, TITRE_MAX, MESSAGE_MIN, MESSAGE_MAX },
    { TITRE_MIN: 3, TITRE_MAX: 50, MESSAGE_MIN: 10, MESSAGE_MAX: 150 }
  )
})

test('P0-4 — le quota de 3 est celui de la capture', () => {
  assert.match(CAPTURE, /Jusqu'à 3 notifications par jour/)
  // La cible paramètre son quota : `let N = Number("3")` dans le chunk.
  assert.match(CHUNK, /Number\("3"\)/)
  assert.equal(QUOTA_JOUR, 3)
  // La taille d'historique est mesurée dans le chunk (`.limit(20)`).
  assert.match(CHUNK, /limit\(20\)/)
  assert.equal(HISTORIQUE, 20)
})

test('P0-4 — `etatQuota` sur ses frontières', () => {
  assert.equal(etatQuota({ aujourdhui: 0, limite: 3 }), 'disponible')
  assert.equal(etatQuota({ aujourdhui: 2, limite: 3 }), 'disponible')
  assert.equal(etatQuota({ aujourdhui: 3, limite: 3 }), 'atteint')
  assert.equal(etatQuota({ aujourdhui: 4, limite: 3 }), 'atteint')
})

test('P0-4 — `lireMessages` rend `null` plutôt qu’un faux zéro', () => {
  const forme = (extra) => ({ limite: 3, aujourdhui: 0, joignables: 0, messages: [], ...extra })

  assert.equal(lireMessages(forme()).reste, 3)
  assert.equal(lireMessages(forme({ aujourdhui: 2 })).reste, 1)
  assert.equal(lireMessages(forme({ aujourdhui: 5 })).reste, 0, 'le reste ne passe pas sous zéro')

  for (const casse of [
    null,
    undefined,
    'texte',
    forme({ limite: 0 }),
    forme({ limite: '3' }),
    forme({ aujourdhui: -1 }),
    forme({ joignables: null }),
    forme({ messages: {} }),
    forme({ messages: undefined }),
  ]) {
    assert.equal(lireMessages(casse), null, `forme acceptée à tort : ${JSON.stringify(casse)}`)
  }
})

test('P0-4 — un lien vide est absent, pas invalide', () => {
  assert.equal(lienValide(null), true)
  assert.equal(lienValide('https://votre-site.ma/offre'), true)
  assert.equal(lienValide('http://exemple.ma'), true)
  assert.equal(lienValide(''), false, 'la chaîne vide doit être normalisée en `null` en amont')
  assert.equal(lienValide('votre-site.ma/offre'), false, 'la cible exige un schéma')
  assert.equal(lienValide('javascript:alert(1)'), false)
  assert.equal(lienValide('mailto:a@b.ma'), false)
  assert.equal(lienValide(`https://exemple.ma/${'a'.repeat(LIEN_MAX)}`), false)
})

test('P0-4 — les refus sortent dans l’ordre des champs', () => {
  assert.deepEqual(refusMessage({ titre: 'ab', corps: 'court', lien: null }), ['titre', 'corps'])
  assert.deepEqual(refusMessage({ titre: 'a'.repeat(51), corps: 'm'.repeat(151), lien: null }), [
    'titreLong',
    'corpsLong',
  ])
  assert.deepEqual(refusMessage({ titre: 'Titre', corps: 'Message assez long', lien: 'ftp://x' }), [
    'lien',
  ])
  assert.deepEqual(refusMessage({ titre: 'Titre', corps: 'Message assez long', lien: null }), [])
})

test('P0-4 — `messageDepuisFormulaire` détoure et normalise', () => {
  const formulaire = (valeurs) => ({ get: (nom) => valeurs[nom] })

  assert.deepEqual(
    messageDepuisFormulaire(
      formulaire({
        titre: '  Offre spéciale  ',
        corps: '  Profitez de -20 % ce weekend.  ',
        lien: '   ',
      })
    ),
    { titre: 'Offre spéciale', corps: 'Profitez de -20 % ce weekend.', lien: null }
  )

  assert.deepEqual(messageDepuisFormulaire(formulaire({ titre: 'A', corps: 'B', lien: 'https://x.ma' })), {
    titre: 'A',
    corps: 'B',
    lien: 'https://x.ma',
  })

  assert.deepEqual(messageDepuisFormulaire(null), { titre: '', corps: '', lien: null })
})

test('P0-4 — aucun message ne se dit envoyé', () => {
  // Seule valeur écrite par `0013` : le défaut de la colonne.
  assert.equal(cleStatut('en_attente'), 'page.messages.statutEnAttente')
  assert.equal(cleStatut('autre chose'), 'page.messages.statutEnAttente')
  // La clé existe, mais elle n'est atteinte que par un statut que rien ne produit.
  assert.equal(cleStatut('envoye'), 'page.messages.statutEnvoye')

  for (const cle of ['page.messages.statutEnAttente', 'page.messages.statutEnvoye']) {
    assert.equal(typeof fr[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }
})

test('P0-4 — les textes de l’écran existent tous, et disent la file', () => {
  const cles = [
    'page.messages.nouvelle',
    'page.messages.ariaQuota',
    'page.messages.compteur',
    'page.messages.aide',
    'page.messages.aideAtteint',
    'page.messages.prochaineDemain',
    'page.messages.champTitre',
    'page.messages.borneTitre',
    'page.messages.champMessage',
    'page.messages.borneMessage',
    'page.messages.champLien',
    'page.messages.placeholderTitre',
    'page.messages.placeholderMessage',
    'page.messages.placeholderLien',
    'page.messages.lienAide',
    'page.messages.action',
    'page.messages.enfile',
    'page.messages.fileAide',
    'page.messages.joignables',
    'page.messages.joignablesUn',
    'page.messages.historique',
    'page.messages.historiqueVide',
    'page.messages.erreur.titre',
    'page.messages.erreur.titreLong',
    'page.messages.erreur.corps',
    'page.messages.erreur.corpsLong',
    'page.messages.erreur.lien',
    'page.messages.erreur.quota',
    'page.messages.erreur.refus',
  ]
  for (const cle of cles) assert.equal(typeof fr[cle], 'string', `clé absente : ${cle}`)

  // Les phrases de la cible sont reprises mot pour mot.
  assert.equal(fr['page.messages.nouvelle'], 'Nouvelle notification')
  assert.equal(fr['page.messages.historique'], 'Historique des notifications')
  assert.ok(fr['page.messages.prochaineDemain'].startsWith('Prochain message demain'))

  // Et l'aveu est écrit : aucun canal, donc rien ne part.
  assert.match(fr['page.messages.fileAide'], /Aucun canal d’envoi n’est configuré/)
})

