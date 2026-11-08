/* ============================================================================
   R3 — l'écran Clients, première page servie par une **RPC de lecture**.

   Trois maillons peuvent casser sans qu'aucun autre test ne le voie :

     1. **la copie**. Le titre, la section et les quatre colonnes de la cible
        sont **dans la capture** (`a17-customers.html`). On les y cherche
        d'abord — témoin : si la chaîne disparaît de la capture, le test le dit
        au lieu de comparer deux fois la même constante ; puis on exige que le
        dictionnaire porte exactement ces valeurs. Aucune constante partagée :
        c'est le dictionnaire et la capture qui sont comparés, pas le code à
        lui-même (§24.2).
     2. **le nom de la migration affichée**. `EtatBloque` affiche un nom de
        fichier pour que la personne sache quoi exécuter. Un nom qui ne
        correspond à aucun fichier envoie exécuter un fichier inexistant — et
        l'écran reste « base non migrée » sans que rien ne l'explique. Le test
        résout donc le nom écrit dans la page **sur le disque**.
     3. **les quatre états**. (`nonMigre` / `configuration`), refus, réponse
        illisible, liste vide. Confondre « aucune carte » avec « je n'ai pas
        compris » ferait chercher le problème du mauvais côté ; c'est la règle
        d'`EtatBloque`, et elle se lit dans le source.

   Ce que ce fichier ne juge pas : le rendu (les classes appartiennent à
   `verifier-design.mjs`) ni le HTML produit (il faudrait un serveur).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DICTIONNAIRES } from '../../../web/src/i18n/dictionnaires.mjs'
import { dateCourte, initiales, lireListeCartes } from '../../../web/src/lib/carte.mjs'

const fr = DICTIONNAIRES.fr

const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8')

const CAPTURE = lire('../../../01_REA_Fidelix/_captures/2026-10-27-auth-s3/raw/pages/a17-customers.html')
const PAGE = lire('../../../web/src/app/(dashboard)/customers/page.jsx')

/** Texte rendu de la capture — les balises et les commentaires ne sont pas de la copie. */
const TEXTE = CAPTURE
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&')

const MESURES = {
  'page.clients.titre': 'Clients',
  'page.clients.liste': 'Liste des membres',
  'page.clients.colonneCode': 'Code client',
  'page.clients.colonnePoints': 'Points / Tampons',
  'page.clients.colonneRecompenses': 'Récompenses',
  'page.clients.colonneInscription': 'Inscrit le',
}

test('clients — les libellés existent d’abord dans la capture (témoin)', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.ok(
      TEXTE.includes(valeur),
      `témoin manquant : « ${valeur} » (${cle}) n’est plus dans la capture a17-customers.html`
    )
  }
  assert.ok(TEXTE.includes('1 client inscrit'), 'le compteur mesuré a disparu de la capture')
  assert.ok(TEXTE.includes('C-CR7QZX'), 'la ligne de la capture a disparu')
  assert.ok(TEXTE.includes('26 oct. 2026'), 'le format de date mesuré a disparu')
})

test('clients — le dictionnaire porte exactement les libellés mesurés', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.equal(fr[cle], valeur, `${cle} doit valoir « ${valeur} » (mesuré)`)
  }
  assert.equal(fr['page.clients.compteUn'], '{n} client inscrit')
  assert.equal(fr['page.clients.comptePlusieurs'], '{n} clients inscrits')
})

test('clients — la page rend les quatre colonnes et le compteur', () => {
  for (const cle of [
    ...Object.keys(MESURES),
    'page.clients.compteUn',
    'page.clients.comptePlusieurs',
  ]) {
    assert.ok(PAGE.includes(cle), `la page ne rend pas « ${cle} »`)
  }
})

test('clients — la migration affichée existe sur le disque', () => {
  const commande = PAGE.match(/commande="([^"]+)"/)
  assert.ok(commande, 'la page n’affiche aucun nom de migration')

  const surDisque = existsSync(
    fileURLToPath(new URL(`../../../${commande[1]}`, import.meta.url))
  )
  assert.ok(surDisque, `« ${commande[1]} » est affiché mais n’existe pas`)
})

test('clients — les quatre états ont chacun leur branche', () => {
  assert.match(PAGE, /lecture\.etat === 'nonMigre'/, 'état « non migré » non traité')
  assert.match(PAGE, /lecture\.etat === 'configuration'/, 'état « non configuré » non traité')
  assert.match(PAGE, /lecture\.etat !== 'ok'/, 'état « refus / indisponible » non traité')
  assert.match(PAGE, /liste === null/, 'réponse illisible non distinguée de la liste vide')
  assert.match(PAGE, /cartes\.length === 0/, 'liste vide non traitée')
  assert.match(PAGE, /cartesDuCommerce/, 'la page n’appelle pas la RPC de lecture')
})

test('liste — `lireListeCartes` met en forme ce que la fonction promet', () => {
  const rendu = lireListeCartes({
    total: 2,
    limite: 200,
    cartes: [
      {
        card_token: 'C-CR7QZX',
        points: 8,
        recompenses: 0,
        inscrit_le: '2026-10-26T09:00:00Z',
        prenom: 'Chaima',
        nom: 'Rifai',
      },
      {
        card_token: 'C-AB12CD',
        points: 0,
        recompenses: 3,
        inscrit_le: '2026-10-27T09:00:00Z',
        prenom: '',
        nom: '',
      },
    ],
  })

  assert.deepEqual(rendu, {
    total: 2,
    limite: 200,
    tronquee: false,
    cartes: [
      {
        code: 'C-CR7QZX',
        points: 8,
        recompenses: 0,
        inscritLe: '26 oct. 2026',
        prenom: 'Chaima',
        nom: 'Rifai',
      },
      {
        code: 'C-AB12CD',
        points: 0,
        recompenses: 3,
        inscritLe: '27 oct. 2026',
        prenom: '',
        nom: '',
      },
    ],
  })
})

test('liste — une forme inattendue rend `null`, jamais une liste vide', () => {
  assert.equal(lireListeCartes(null), null)
  assert.equal(lireListeCartes({ total: 0 }), null, 'sans tableau `cartes`, rien n’est lisible')
  assert.equal(
    lireListeCartes({ total: 1, cartes: [{ card_token: 42 }] }),
    null,
    'un jeton non textuel n’est pas un jeton'
  )
  assert.equal(
    lireListeCartes({ total: 1, cartes: [null] }),
    null,
    'une ligne nulle n’est pas une carte'
  )
})

test('liste — `total` ne peut pas contredire les lignes rendues', () => {
  const cartes = Array.from({ length: 3 }, (_, i) => ({
    card_token: `C-AB12C${i}`,
    points: 0,
    recompenses: 0,
    inscrit_le: '2026-10-26T09:00:00Z',
    prenom: '',
    nom: '',
  }))

  // total annoncé supérieur : la liste est bornée, et on le dit.
  const tronquee = lireListeCartes({ total: 640, limite: 200, cartes })
  assert.equal(tronquee.tronquee, true)
  assert.equal(tronquee.total, 640)

  // total incohérent (inférieur au nombre de lignes rendues) : on ne peut pas
  // afficher « 1 client » en montrant trois lignes — on retombe sur le compte lu.
  const incoherent = lireListeCartes({ total: 1, limite: 200, cartes })
  assert.equal(incoherent.total, 3)
})

test('carte — dates et initiales suivent la capture', () => {
  assert.equal(dateCourte('2026-10-26T09:00:00Z'), '26 oct. 2026')
  assert.equal(dateCourte('pas une date'), '')
  assert.equal(dateCourte(undefined), '')
  assert.equal(initiales('Chaima', 'Rifai'), 'CR')
  assert.equal(initiales('', ''), '', 'une carte anonyme n’a pas d’initiales inventées')
})

