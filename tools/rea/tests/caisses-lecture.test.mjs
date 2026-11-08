/* ============================================================================
   R3 — l'écran Équipe (`/caisses`), servie par `equipe_du_commerce()` (`0007`).

   Quatre maillons peuvent casser sans qu'aucun autre test ne le voie :

     1. **la copie**. Les portées, les périodes, les sept `th`, les deux
        définitions et l'état vide sont **dans la capture**
        (`a09-caisses.html`). On les y cherche d'abord — témoin : si la chaîne
        disparaît de la capture, le test le dit au lieu de comparer deux fois la
        même constante ; puis on exige que le dictionnaire porte ces valeurs.
     2. **le vocabulaire**. Les quatre clés de période et les deux rôles ne sont
        pas des choix d'écran : ce sont ceux de `0007` (`v_periode not in (…)`)
        et de `0006` (`check (role in (…))`). Le test les relit dans le SQL.
     3. **le nom de la migration affichée**, résolu sur le disque.
     4. **les cinq états** : jour manquant, migration, refus, réponse illisible,
        classement. Confondre « aucune caisse » avec « je n'ai pas compris »
        ferait chercher le problème du mauvais côté.

   Deux règles de méthode, apprises ici même :

     - **les commentaires sont retirés** avant tout jugement de forme (§37.6) :
       un test qui lit un commentaire fabrique un faux vert — le dangereux ;
     - **l'ordre rendu n'est pas retrié**. `0007` impose un ordre total ;
       `lireEquipe` numérote ce qu'il reçoit. Si l'écran se remettait à trier,
       deux vérités coexisteraient sans que rien ne rougisse.

   Ce que ce fichier ne juge pas : le rendu (les classes appartiennent à
   `verifier-design.mjs` et la mesure au pixel demande une session).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DICTIONNAIRES } from '../../../web/src/i18n/dictionnaires.mjs'
import {
  PERIODES,
  PERIODE_PAR_DEFAUT,
  PORTEES,
  caissesActivesDe,
  estPeriode,
  estPortee,
  jourValide,
  lireEquipe,
} from '../../../web/src/lib/equipe.mjs'

const fr = DICTIONNAIRES.fr

const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8')

const CAPTURE = lire(
  '../../../01_REA_Fidelix/_captures/2026-10-26-auth/rendu/a09-caisses.html'
)
const PAGE = lire('../../../web/src/app/(dashboard)/caisses/page.jsx')
const EQUIPE = lire('../../../web/src/lib/equipe.mjs')
const DONNEES = lire('../../../web/src/lib/donnees.mjs')
const ICONES = lire('../../../web/src/components/unicity/Icones.jsx')
const CSS = lire('../../../web/src/styles/unicity.css')
const MIGRATION_0007 = lire('../../../migrations/0007_equipe_lecture.sql')
const MIGRATION_0006 = lire('../../../migrations/0006_equipe_et_designation.sql')

/** Le code seul : un commentaire décrit l'intention, pas ce qui est écrit. */
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Texte rendu de la capture, espaces normalisés, apostrophes droites. */
const TEXTE = CAPTURE
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\u2019/g, "'")
  .replace(/\s+/g, ' ')
  .trim()

const normaliser = (texte) => String(texte).replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim()

/* Les libellés **mesurés**, clé par clé. Aucune constante partagée avec le
   dictionnaire : c'est la capture et le dictionnaire qui sont comparés. */
const MESURES = {
  'page.equipe.titre': 'Équipe',
  'page.equipe.porteeCaisse': 'Caisses employé',
  'page.equipe.porteeResponsable': 'Responsables',
  'page.equipe.porteeCaisseDesc':
    'Un accès limité au scan pour chaque employé — sans vos chiffres ni vos réglages.',
  'page.equipe.classement': "Classement de l'équipe",
  'page.equipe.periode7j': '7 jours',
  'page.equipe.periode30j': '30 jours',
  'page.equipe.periodeDepuis': 'Depuis le début',
  'page.equipe.periodeJour': 'Un jour précis',
  'page.equipe.colonneRang': '#',
  'page.equipe.colonneCaissier': 'Caissier',
  'page.equipe.colonneCartes': 'Cartes',
  'page.equipe.colonneScans': 'Scans',
  'page.equipe.colonnePoints': 'points',
  'page.equipe.colonneCa': 'CA',
  'page.equipe.colonneAvis': 'Avis',
  'page.equipe.titulaire': 'Titulaire',
  'page.equipe.vous': 'Vous',
  'page.equipe.actives': 'Caisses actives',
  'page.equipe.aucuneCaisse':
    "Aucune caisse pour l'instant. Vous continuez à encaisser normalement depuis votre propre compte.",
  'page.equipe.tableauDefinition':
    'Ce tableau compte toutes les opérations du point de vente : les caisses employé, et ce que vous ou vos responsables encaissez depuis le tableau de bord.',
}

test('équipe — les libellés existent d’abord dans la capture (témoin)', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.ok(
      TEXTE.includes(normaliser(valeur)),
      `témoin manquant : « ${valeur} » (${cle}) n’est plus dans la capture a09-caisses.html`
    )
  }

  // Les deux marques de la capture qui ne sont pas du texte : le trophée du
  // premier rang, et la couleur que la cible lui donne.
  assert.match(CAPTURE, /lucide-trophy/, 'le trophée de la ligne de tête a disparu')
  assert.match(CAPTURE, /text-amber-500/, 'la couleur du trophée a changé de source')

  // La ligne de la capture : « Cartes 0 · Scans 1 · points 8 · CA 40 € ».
  assert.ok(TEXTE.includes('40 €'), 'le montant mesuré a disparu de la capture')
})

test('équipe — le dictionnaire porte exactement les libellés mesurés', () => {
  for (const [cle, valeur] of Object.entries(MESURES)) {
    assert.equal(
      normaliser(fr[cle]),
      normaliser(valeur),
      `« ${cle} » ne porte plus le texte de la capture`
    )
  }
})

test('équipe — la définition des « cartes » interpole la marque au lieu de la recopier', () => {
  // La cible écrit SON nom dans cette phrase ; la décision de nommage interdit
  // de le réutiliser. Le gabarit est donc le même, à `{marque}` près.
  const mesure = normaliser(
    "Les cartes comptent les clients qui ont désigné ce caissier sur la page d'inscription. C'est le geste qui installe Fidelix dans votre commerce — et celui qui mérite d'être récompensé."
  )
  assert.ok(TEXTE.includes(mesure), 'la phrase mesurée a disparu de la capture')

  const gabarit = normaliser(fr['page.equipe.cartesDefinition'])
  assert.ok(gabarit.includes('{marque}'), 'la marque doit être un paramètre')
  assert.equal(gabarit, mesure.replace('Fidelix', '{marque}'))
  assert.equal(gabarit.includes('Fidelix'), false, 'le nom de la cible est recopié')
  assert.equal(gabarit.includes(fr['marque.nom']), false, 'la marque est écrite en dur')
})

test('équipe — le vocabulaire des périodes est celui de `0007`, pas celui de l’écran', () => {
  const bloc = MIGRATION_0007.match(/v_periode\s+not\s+in\s*\(([^)]*)\)/)
  assert.ok(bloc, 'le refus `PERIODE_INCONNUE` a disparu de la migration')
  const cles = [...bloc[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  assert.deepEqual(
    cles,
    PERIODES.map((p) => p.cle),
    'l’écran propose une période que la fonction refuse, ou l’inverse'
  )

  // Le défaut de l'écran est celui de la fonction (`p_periode default …`).
  const defaut = MIGRATION_0007.match(/p_periode\s+varchar\s+default\s+'([a-z0-9_]+)'/)
  assert.ok(defaut, 'la fonction n’a plus de période par défaut')
  assert.equal(PERIODE_PAR_DEFAUT, defaut[1])

  for (const periode of PERIODES) {
    assert.ok(estPeriode(periode.cle), `${periode.cle} n’est pas reconnue`)
    assert.ok(fr[periode.copie], `la copie « ${periode.copie} » manque au dictionnaire`)
  }
  assert.equal(estPeriode('hier'), false, 'une clé inconnue ne doit pas passer')
})

test('équipe — les deux portées sont les deux valeurs de `staff.role` (`0006`)', () => {
  const bloc = MIGRATION_0006.match(/check\s*\(\s*role\s+in\s*\(([^)]*)\)/)
  assert.ok(bloc, 'la contrainte de vocabulaire de `staff.role` a disparu')
  const roles = [...bloc[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(
    roles,
    PORTEES.map((p) => p.cle),
    'l’écran affiche une portée qui n’est pas un rôle du modèle'
  )

  for (const portee of PORTEES) {
    assert.ok(estPortee(portee.cle), `${portee.cle} n’est pas reconnue`)
    assert.ok(fr[portee.copie], `la copie « ${portee.copie} » manque au dictionnaire`)
  }
  assert.equal(estPortee('admin'), false, 'un troisième rôle ne doit pas passer')
})

/* Jeu de sonde : celui de `0007` (3 clients, 2 désignés, 4 cartes), réduit à ce
   que la fonction rend. Le titulaire est la ligne `staff_id: null`. */
const DONNEES_EQUIPE = {
  periode: {
    cle: '7j',
    debut: '2026-10-25T18:00:00+00:00',
    fin: '2026-11-01T18:00:00+00:00',
    jour: null,
    fuseau: 'UTC',
  },
  devise: 'EUR',
  lignes: [
    {
      staff_id: null,
      prenom: null,
      role: null,
      actif: true,
      cartes: 0,
      scans: 1,
      points: 8,
      ca: 40,
      avis: null,
    },
    {
      staff_id: 'a1',
      prenom: 'Amina',
      role: 'caisse',
      actif: true,
      cartes: 2,
      scans: 3,
      points: 21,
      ca: 74.5,
      avis: null,
    },
    {
      staff_id: 'b2',
      prenom: 'Youssef',
      role: 'responsable',
      actif: false,
      cartes: 0,
      scans: 0,
      points: 0,
      ca: 0,
      avis: null,
    },
  ],
  absences: ['avis'],
}

test('lireEquipe — met en forme sans rien redécider', () => {
  const rendu = lireEquipe(DONNEES_EQUIPE)
  assert.ok(rendu, 'une réponse conforme doit être lisible')

  // L'ORDRE EST CELUI DE LA FONCTION : le test le prouve en le laissant
  // volontairement non trié (le titulaire n'a pas le plus de points).
  assert.deepEqual(
    rendu.lignes.map((l) => l.prenom),
    ['', 'Amina', 'Youssef']
  )
  assert.deepEqual(
    rendu.lignes.map((l) => l.rang),
    [1, 2, 3],
    'le rang est la position rendue, pas un classement recalculé'
  )

  const [titulaire, amina, youssef] = rendu.lignes
  assert.equal(titulaire.titulaire, true)
  assert.equal(titulaire.role, null, 'le titulaire n’est pas un rôle de caisse')
  assert.equal(amina.titulaire, false)

  // Les valeurs de la capture : « 0 · 1 · 8 · 40 € ».
  assert.deepEqual(titulaire.affichage, {
    cartes: '0',
    scans: '1',
    points: '8',
    ca: '40 €',
    avis: null,
  })
  assert.equal(amina.affichage.ca, '74,5 €', 'la devise vient de la donnée, pas de l’écran')
  assert.equal(youssef.actif, false, 'une caisse désactivée reste rendue et marquée')

  // « Avis » est une absence **déclarée**, jamais un zéro (`0007`).
  for (const ligne of rendu.lignes) {
    assert.equal(ligne.avis, null)
    assert.equal(ligne.affichage.avis, null, 'un avis absent ne s’affiche pas « 0 »')
  }
  assert.deepEqual(rendu.absences, ['avis'])
  assert.equal(rendu.periode.cle, '7j')
  assert.equal(rendu.periode.fuseau, 'UTC')
})

test('lireEquipe — une forme inattendue rend `null`, jamais une équipe vide', () => {
  const variante = (retouche) => ({ ...DONNEES_EQUIPE, ...retouche })
  const ligne = (retouche) => variante({ lignes: [{ ...DONNEES_EQUIPE.lignes[1], ...retouche }] })

  assert.equal(lireEquipe(null), null)
  assert.equal(lireEquipe({}), null, 'sans bloc `periode`, rien n’est lisible')
  assert.equal(
    lireEquipe(variante({ periode: { ...DONNEES_EQUIPE.periode, cle: 'hier' } })),
    null,
    'une période hors vocabulaire n’est pas une période'
  )
  assert.equal(
    lireEquipe(variante({ lignes: [] })),
    null,
    'la fonction rend toujours le titulaire : zéro ligne n’est pas une mesure'
  )
  assert.equal(lireEquipe(ligne({ cartes: 1.5 })), null, 'une demi-carte n’existe pas')
  assert.equal(lireEquipe(ligne({ ca: '40' })), null, 'un montant textuel n’est pas un montant')
  assert.equal(lireEquipe(ligne({ actif: 'oui' })), null, 'un booléen textuel n’est pas un booléen')
  assert.equal(lireEquipe(ligne({ role: 'admin' })), null, 'un rôle hors modèle est refusé')
  assert.equal(lireEquipe(ligne({ prenom: '  ' })), null, 'une caisse sans nom n’est pas affichable')
  assert.equal(
    lireEquipe(
      variante({
        lignes: [{ ...DONNEES_EQUIPE.lignes[0], role: 'caisse' }],
      })
    ),
    null,
    'le titulaire ne porte pas de rôle de caisse'
  )
  assert.equal(
    lireEquipe({ ...DONNEES_EQUIPE, absences: [] }),
    null,
    'un avis absent non déclaré serait un tiret muet'
  )
})

test('caissesActivesDe — trois exclusions, chacune mesurable', () => {
  const rendu = lireEquipe(DONNEES_EQUIPE)
  assert.deepEqual(
    caissesActivesDe(rendu.lignes, 'caisse').map((l) => l.prenom),
    ['Amina'],
    'le titulaire et la caisse désactivée ne sont pas des caisses actives'
  )
  assert.deepEqual(
    caissesActivesDe(rendu.lignes, 'responsable').map((l) => l.prenom),
    [],
    'Youssef est responsable, et désactivé'
  )
  assert.deepEqual(caissesActivesDe(null, 'caisse'), [], 'une liste absente n’est pas une erreur')
})

test('jourValide — la forme **et** le calendrier', () => {
  assert.equal(jourValide('2026-11-01'), true)
  assert.equal(jourValide('2026-02-31'), false, 'un jour qui n’existe pas ne passe pas')
  assert.equal(jourValide('2026-11-1'), false)
  assert.equal(jourValide('2026-11-01T00:00:00Z'), false)
  assert.equal(jourValide(''), false)
  assert.equal(jourValide(null), false)
  assert.equal(jourValide(20261101), false)
})

/* ---------------------------------------------------------------------------
   La page : cinq états, un nom de migration réel, et pas de tri local.
--------------------------------------------------------------------------- */

test('page — les cinq états ont chacun leur branche', () => {
  assert.match(PAGE, /if \(jourManquant\)/, '« Un jour précis » sans date non traité')
  assert.match(PAGE, /lecture\.etat === 'nonMigre'/, 'état « non migré » non traité')
  assert.match(PAGE, /lecture\.etat === 'configuration'/, 'état « non configuré » non traité')
  assert.match(PAGE, /lecture\.etat !== 'ok'/, 'état « refus / indisponible » non traité')
  assert.match(PAGE, /equipe === null/, 'réponse illisible non distinguée d’une équipe vide')
  assert.match(PAGE, /equipeDuCommerce\(/, 'la page n’appelle pas la RPC de lecture')
  assert.match(PAGE, /lireEquipe\(/, 'la page ne met pas la réponse en forme par `lireEquipe`')
})

test('page — le nom de migration affiché existe sur le disque', () => {
  const commande = PAGE.match(/commande="(migrations\/[^"]+)"/)
  assert.ok(commande, 'aucun nom de migration affiché : l’état « non migré » ne dit pas quoi exécuter')
  const surDisque = existsSync(
    fileURLToPath(new URL(`../../../${commande[1]}`, import.meta.url))
  )
  assert.ok(surDisque, `« ${commande[1]} » est affiché mais n’existe pas`)
})

test('page — elle ne retrie pas ce que la fonction a ordonné', () => {
  // `0007` impose un ordre **total** (points, CA, scans, cartes, titulaire,
  // prénom, id). Un `.sort(` ferait diverger l'écran de la fonction sans
  // qu'aucun chiffre ne change — donc sans que rien ne rougisse. Le tri vit
  // dans le SQL ; la mise en forme ne fait que **numéroter**.
  const page = sansCommentaires(PAGE)
  const module = sansCommentaires(EQUIPE)
  assert.equal(page.includes('.sort('), false, 'la page retrie le classement')
  assert.equal(module.includes('.sort('), false, 'la mise en forme retrie le classement')
  assert.match(module, /rang: lignes\.length \+ 1/, 'le rang n’est plus la position rendue')
})

test('page — la période demandée part telle quelle ; `p_jour` seulement pour `jour`', () => {
  const code = sansCommentaires(DONNEES)
  assert.match(
    code,
    /if \(jour\) args\.p_jour = jour/,
    '`p_jour` doit être omis quand aucun jour n’est demandé (défaut de la fonction)'
  )
  // Les trois refus de `0007` sont des **refus**, pas des pannes : sans eux,
  // une période inconnue s'afficherait « la base ne répond pas ».
  for (const refus of ['PERIODE_INCONNUE', 'JOUR_MANQUANT', 'FUSEAU_INCONNU']) {
    assert.ok(code.includes(`'${refus}'`), `« ${refus} » n’est pas reconnu comme un refus`)
  }
})

test('design — le bandeau de périodes et le rang reposent sur des classes servies', () => {
  const code = sansCommentaires(PAGE)
  assert.match(code, /className="uc-periodes"/)
  assert.match(code, /className="uc-periode"/)
  assert.match(code, /aria-current=\{.*'page' : undefined\}/, 'aucun état sélectionné annoncé')

  // Une classe inventée rend un composant nu sans qu'aucun test ne rougisse.
  for (const classe of ['.uc-periodes {', '.uc-periode {', ".uc-periode[aria-current='page'] {", '.uc-rang {']) {
    assert.ok(CSS.includes(classe), `la feuille ne porte pas « ${classe} »`)
  }

  // La cible est tactile : 44 px, pas la hauteur d'un texte.
  const bloc = CSS.slice(CSS.indexOf('.uc-periode {'), CSS.indexOf('.uc-periode:hover'))
  assert.match(bloc, /min-height:\s*44px/, 'la cible tactile du bandeau est retombée sous 44 px')
})

test('design — le trophée du premier rang ne remplace pas l’annonce du rang', () => {
  assert.ok(
    ICONES.includes('export function IconeTrophee'),
    'l’icône mesurée dans la capture a disparu'
  )
  const code = sansCommentaires(PAGE)
  assert.match(code, /<IconeTrophee \/>/, 'la colonne « # » ne dessine plus le trophée')

  /* L'annonce est exigée **sur le rang lui-même**, pas « quelque part dans la
     page » : la première version de cette assertion cherchait
     `className="uc-sr"`, que le `caption` de la table porte aussi — la mutation
     M85 a donc survécu, en changeant le span du rang sous un test vert. C'est
     le faux vert du §37.6, sous une autre forme : un motif qui se contente
     d'exister ailleurs ne prouve rien ici. */
  assert.match(
    code,
    /<span className="uc-sr">\s*\{t\('page\.equipe\.rang', \{ rang: ligne\.rang \}\)\}/,
    'le rang du premier n’est plus annoncé dans le span réservé aux lecteurs d’écran'
  )

  const nullite = sansCommentaires(ICONES)
  assert.equal(/\bbg-coral\b/.test(nullite), false, 'palette « verre » réintroduite dans les icônes')
  assert.equal(/\bfont-impact\b/.test(code), false, 'police de la peau retirée réintroduite')
  assert.equal(/\bbg-white\/10\b/.test(code), false, 'utilitaire de la peau retirée réintroduit')
})
