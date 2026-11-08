/* ============================================================================
   R3 — l'écran d'accueil, deuxième page servie par une **RPC de lecture**.

   Quatre maillons peuvent casser sans qu'aucun autre test ne le voie :

     1. **la copie**. Les quatre indicateurs, leurs sous-titres, les deux totaux
        et les cinq colonnes sont **dans la capture** (`a01-dashboard.html`). On
        les y cherche d'abord — témoin : si la chaîne disparaît de la capture, le
        test le dit au lieu de comparer deux fois la même constante ; puis on
        exige que le dictionnaire porte exactement ces valeurs (§24.2).
     2. **l'unité du chiffre d'affaires**. Seule valeur **non** recopiée : la
        cible écrit « CA (€) », notre devise est une donnée (`MAD` par défaut).
        Le test interdit donc « € » dans le dictionnaire et exige un gabarit.
     3. **le nom de la migration affichée**. `EtatBloque` affiche un nom de
        fichier ; un nom qui ne correspond à rien envoie exécuter un fichier
        inexistant. Le test résout le nom écrit dans le composant **sur le
        disque**.
     4. **les quatre états** : (nonMigre / configuration), refus, réponse
        illisible, et lecture réussie. Confondre « aucune activité » avec « je
        n'ai pas compris » ferait chercher le problème du mauvais côté.

   Ce que ce fichier ne juge pas : le rendu (les classes appartiennent à
   `verifier-design.mjs`) ni le HTML produit (il faudrait un serveur).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DICTIONNAIRES } from '../../../web/src/i18n/dictionnaires.mjs'
import {
  dateHeureCourte,
  formaterMontant,
  symboleDevise,
  formaterPoints,
  formaterPourcentage,
  lireTableau,
  pourcentageRevient,
} from '../../../web/src/lib/tableau.mjs'

const fr = DICTIONNAIRES.fr

const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8')

const CAPTURE = lire(
  '../../../01_REA_Fidelix/_captures/2026-10-27-auth-s3/raw/pages/a01-dashboard.html'
)
const COMPOSANT = lire('../../../web/src/components/tableau/ContenuTableau.jsx')
const PAGE = lire('../../../web/src/app/(dashboard)/dashboard/page.jsx')

/** Texte rendu de la capture — les balises et les commentaires ne sont pas de la copie. */
const TEXTE = CAPTURE
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&')

const MESURES = {
  'tableau.indicateur.clients': 'Clients',
  'tableau.indicateur.visites': 'Visites',
  'tableau.indicateur.reviennent': 'Reviennent',
  'tableau.sous.trenteJours': '30 derniers jours',
  'tableau.sous.deuxVisites': 'au moins 2 visites',
  'tableau.total.transactions': 'Transactions au total',
  'tableau.total.recompenses': 'Récompenses distribuées',
  'tableau.recentes.titre': 'Transactions récentes',
  'tableau.recentes.colonneClient': 'Client',
  'tableau.recentes.colonneType': 'Type',
  'tableau.recentes.colonnePoints': 'Pts / Tampons',
  'tableau.recentes.colonneMontant': 'Montant',
  'tableau.recentes.colonneDate': 'Date',
  'tableau.recentes.typePoints': 'Points gagnés',
}

test('accueil — les libellés existent d’abord dans la capture (témoin)', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.ok(
      TEXTE.includes(valeur),
      `témoin manquant : « ${valeur} » (${cle}) n’est plus dans la capture a01-dashboard.html`
    )
  }
  // Les formes de valeur, elles aussi mesurées : c'est d'elles que dépendent
  // `formaterPoints`, `formaterPourcentage` et `dateHeureCourte`.
  for (const forme of ['+1 ce mois', '30 j · total 40', '0 %', '+8 pts', '26 oct. 15:31']) {
    assert.ok(TEXTE.includes(forme), `forme mesurée disparue de la capture : « ${forme} »`)
  }
  assert.ok(TEXTE.includes('C-CR7QZX'), 'la ligne de la capture a disparu')
})

test('accueil — le dictionnaire porte exactement les libellés mesurés', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.equal(fr[cle], valeur, `${cle} doit valoir « ${valeur} » (mesuré)`)
  }
  assert.equal(fr['tableau.sous.ceMois'], '+{n} ce mois')
  assert.equal(fr['tableau.sous.caTrenteJours'], '30 j · total {total}')
})

test('accueil — l’unité du CA vient de la donnée, jamais de la capture', () => {
  // Témoin : la cible écrit bien « CA (€) ».
  assert.ok(TEXTE.includes('CA (€)'), 'la capture ne porte plus « CA (€) » : la mesure a changé')

  // Et pourtant « € » ne doit apparaître dans aucune valeur du dictionnaire : la
  // devise de ce socle est `MAD` (mesuré : `column_default` de
  // `loyalty_programs.devise`). Recopier le symbole afficherait une unité fausse.
  assert.equal(
    fr['tableau.indicateur.ca'],
    'CA ({devise})',
    'le libellé doit être un gabarit, pas le symbole de la cible'
  )
  const avecEuro = Object.entries(fr)
    .filter(([, valeur]) => typeof valeur === 'string' && valeur.includes('€'))
    .map(([cle]) => cle)
  assert.deepEqual(avecEuro, [], `des clés recopient le symbole de la cible : ${avecEuro.join(', ')}`)
})

test('accueil — le composant rend les quatre indicateurs, les totaux et les colonnes', () => {
  // Clés **littérales** dans le composant : les cartes des totaux, l'en-tête du
  // tableau, ses cinq colonnes, le libellé de type et le gabarit du CA.
  const litterales = [
    'tableau.total.titre',
    'tableau.total.transactions',
    'tableau.total.recompenses',
    'tableau.recentes.titre',
    'tableau.recentes.colonneClient',
    'tableau.recentes.colonneType',
    'tableau.recentes.colonnePoints',
    'tableau.recentes.colonneMontant',
    'tableau.recentes.colonneDate',
    'tableau.recentes.typePoints',
    'tableau.indicateur.ca',
    'tableau.aucuneDonnee',
  ]
  for (const cle of litterales) {
    assert.ok(COMPOSANT.includes(cle), `le composant ne rend pas « ${cle} »`)
  }

  // Clés **construites** depuis la liste : deux préfixes, et rien d'écrit en dur.
  // Sans eux, l'ajout d'un indicateur à `INDICATEURS` ne serait pas rendu.
  assert.match(COMPOSANT, /t\(`tableau\.indicateur\.\$\{carte\.cle\}`\)/)
  assert.match(COMPOSANT, /t\(`tableau\.sous\.\$\{carte\.sous\}`/)
  for (const cle of ['tableau.indicateur.clients', 'tableau.indicateur.visites']) {
    assert.ok(!COMPOSANT.includes(cle), `« ${cle} » ne doit pas être écrit en dur`)
  }
})

test('accueil — la migration affichée existe sur le disque et contient la fonction', () => {
  const nom = COMPOSANT.match(/commande="(migrations\/[^"]+)"/)
  assert.ok(nom, 'l’état « base non migrée » doit nommer le fichier à exécuter')

  const chemin = fileURLToPath(new URL(`../../../${nom[1]}`, import.meta.url))
  assert.ok(existsSync(chemin), `le fichier affiché « ${nom[1]} » n’existe pas`)
  assert.match(
    readFileSync(chemin, 'utf8'),
    /tableau_du_commerce/,
    'le fichier affiché ne contient pas la fonction de cet écran'
  )
})

test('accueil — sans lecture, aucun zéro : le tiret est le contenu', () => {
  // L'aperçu rend le même composant sans données. Y écrire « 0 » ferait lire un
  // fait mesuré là où rien n'a été lu — c'est la faute que R2 avait évitée.
  assert.match(COMPOSANT, /valeur: VIDE/, 'l’état non lu doit rendre VIDE')
  assert.equal(/valeur: '0'/.test(COMPOSANT), false, 'aucun « 0 » inventé sans lecture')
})

test('accueil — la page branche les quatre états, sans les confondre', () => {
  assert.match(PAGE, /tableauDuCommerce\(\)/, 'la page ne lit pas la RPC')
  assert.match(PAGE, /lireTableau\(/, 'la page ne met pas la réponse en forme')
  assert.match(PAGE, /'illisible'/, 'une réponse illisible doit être un état, pas une liste vide')

  // Le composant distingue les causes : migration, refus, illisible.
  assert.match(COMPOSANT, /'nonMigre'/)
  assert.match(COMPOSANT, /'configuration'/)
  assert.match(COMPOSANT, /'illisible'/)
  assert.match(COMPOSANT, /tableau\.etat\.refus/)
})

test('accueil — lireTableau refuse une forme inattendue au lieu de rendre des zéros', () => {
  assert.equal(lireTableau(null), null)
  assert.equal(lireTableau({}), null)
  assert.equal(lireTableau({ clients: { total: 0, ce_mois: 0 } }), null, 'blocs manquants')

  const valide = {
    devise: 'MAD',
    clients: { total: 1, ce_mois: 1 },
    visites: { trente_jours: 2 },
    reviennent: { cartes: 1, fideles: 1 },
    ca: { trente_jours: 40, total: 52 },
    transactions: { total: 3, recompenses: 1 },
    recentes: [],
  }
  assert.ok(lireTableau(valide), 'une réponse conforme doit être lue')

  // Une carte à « 1.5 client » est une réponse illisible, pas un arrondi.
  assert.equal(lireTableau({ ...valide, clients: { total: 1.5, ce_mois: 0 } }), null)
  // Une ligne sans jeton ne peut pas être affichée : c'est un refus, pas un vide.
  assert.equal(
    lireTableau({ ...valide, recentes: [{ card_token: '', points: 1, montant: 1 }] }),
    null
  )
  assert.equal(lireTableau({ ...valide, recentes: 'rien' }), null)
})

test('accueil — les formes de valeur rendues sont celles de la cible', () => {
  assert.equal(formaterPoints(8), '+8 pts')
  assert.equal(formaterPoints(-45), '-45 pts')
  assert.equal(formaterPourcentage(0), '0 %')
  assert.equal(formaterMontant(40, 'MAD'), '40 MAD')
  assert.equal(formaterMontant(40, null), '40', 'sans devise : le nombre seul, pas « 40 € »')
  assert.equal(dateHeureCourte('2026-10-26T15:31:00Z'), '26 oct. 15:31')
})

test('accueil — le symbole vient du code de devise, pas d’une constante', () => {
  // `EUR` par défaut depuis `0008` : le « € » de la cible n'est pas recopié,
  // il est retrouvé. Une base en dirhams doit afficher « MAD », pas « € ».
  assert.equal(symboleDevise('EUR'), '€')
  assert.equal(symboleDevise('eur'), '€', 'la casse de la donnée ne doit pas changer l’affichage')
  assert.equal(symboleDevise(' USD '), '$')
  assert.equal(symboleDevise('GBP'), '£')
  assert.equal(symboleDevise('MAD'), 'MAD', 'un code inconnu passe tel quel, il ne devient pas un euro')
  assert.equal(symboleDevise(''), '')
  assert.equal(symboleDevise(null), '')
  assert.equal(symboleDevise(undefined), '')
  assert.equal(formaterMontant(40, 'EUR'), '40 €')
})

test('accueil — « Reviennent » n’affiche pas 0 % quand il n’y a aucune carte', () => {
  assert.equal(pourcentageRevient(0, 0), null, 'aucune carte : la part n’existe pas')
  assert.equal(pourcentageRevient(1, 1), 100)
  assert.equal(pourcentageRevient(1, 3), 33)
  assert.equal(pourcentageRevient(9, 3), 100, 'une part ne dépasse jamais 100 %')
})

