/* ============================================================================
   R1/R3 — « nouveau mot de passe » : le flux de récupération de bout en bout.

   **Le défaut, tel qu'il était.** `/forgot-password` appelait
   `resetPasswordForEmail(email)` **sans** `redirectTo` : Supabase substituait
   l'URL de site du projet, le `?code=` atterrissait sur `/`, personne ne
   l'échangeait — un lien mort qui n'avait l'air de rien. Et `/auth/confirm`
   refusait `type=recovery` en `?echec=invalide`, décision juste tant qu'aucune
   page ne pouvait poser le mot de passe, fausse dès qu'elle existe.

   **Ce que ce fichier mesure, et que rien d'autre ne mesure.** Trois maillons
   peuvent casser **sans faire échouer** le reste :

     1. **l'adresse** (§27.5). Un producteur écrit dans une URL, pas dans une
        page. Si `redirectTo` visait `/dashboard`, la demande serait correcte,
        la page correcte, et le commerçant ne verrait jamais l'écran de saisie.
        On part donc de l'URL **réellement produite**, on lui ajoute le `code`
        que GoTrue ajoutera, on la fait relire par le module, et on exige que la
        destination soit une page **du disque** — lue dans l'arborescence App
        Router, groupes de routes compris.
     2. **le couplage des valeurs**. `?etat=session` est écrit par l'action et
        rendu par la page. Le test lit les valeurs **chez le producteur** et les
        cherche **chez le consommateur** : aucune constante partagée, sinon il
        comparerait une constante à elle-même et serait vert juste ou faux
        (§24.2). Un ensemble vide est un **échec** (§28.2) : un producteur qui
        change de syntaxe rendrait zéro valeur, et « toutes les valeurs ont une
        branche » serait vrai sur rien.
     3. **les noms de champs**. Le formulaire envoie `motDePasse`, l'action lit
        `donnees.get('motDePasse')`. Deux copies du même mot : renommé d'un
        côté, le champ arrive vide et le formulaire reproche « 8 caractères
        minimum » à chaque envoi — sans qu'aucun test ne parle. Ici les deux
        listes sont extraites des sources et comparées entre elles.

   Ce que ce fichier ne juge pas : la copie de l'écran — les **libellés de
   champ** sont désormais mesurés et gardés par `copie-mesuree.test.mjs`, mais le
   titre, le sous-titre et la phrase d'échec restent écrits (aucune capture de
   cet écran n'existe chez la cible, déclaré dans `docs/design-system.md` §3) —
   ni le rendu : les rôles ARIA et les classes appartiennent aux tests d'écran.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  destinationEchec,
  destinationSucces,
  lireParametresConfirmation,
  urlReinitialisation,
} from '../../../web/src/lib/confirmation.mjs'
import { messageEchec } from '../../../web/src/lib/reinitialisation.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC = join(RACINE, 'web', 'src')
const APP = join(SRC, 'app')

const lire = (...morceaux) => readFileSync(join(SRC, ...morceaux), 'utf8')
const lireDansApp = (relatif) => readFileSync(join(APP, relatif), 'utf8')

const DEMANDE = ['app', '(auth)', 'forgot-password', 'actions.js']
const ACTION = ['app', '(auth)', 'nouveau-mot-de-passe', 'actions.js']
const PAGE = ['app', '(auth)', 'nouveau-mot-de-passe', 'page.jsx']
const FORMULAIRE = ['components', 'auth', 'FormulaireNouveauMotDePasse.jsx']
const ROUTE = ['app', 'auth', 'confirm', 'route.js']

/* ---------------------------------------------------------------------------
   Le disque : quelles pages servent quelles routes
   ------------------------------------------------------------------------ */

/** Tous les fichiers d'un nom donné sous `web/src/app`, en POSIX relatif. */
function marcher(dossier, nom) {
  const absolus = []
  const parcourir = (racine) => {
    for (const entree of readdirSync(racine, { withFileTypes: true })) {
      const chemin = join(racine, entree.name)
      if (entree.isDirectory()) parcourir(chemin)
      else if (entree.name === nom) absolus.push(chemin)
    }
  }
  parcourir(dossier)
  // Relativisation **une seule fois**, au retour : la faire dans la récursion
  // relativiserait deux fois chaque chemin (§28.6).
  return absolus.sort().map((chemin) => relative(APP, chemin).split(sep).join('/'))
}

/** Une route de disque réduite à sa clé : groupes `(…)` retirés, `[x]` → `:`. */
function cleDePage(relatif) {
  return relatif
    .split('/')
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => (/^\[.+\]$/.test(segment) ? ':' : segment))
    .join('/')
}

/** Les pages du disque, par clé de route (`''` pour la racine). */
function pagesParRoute() {
  const table = new Map()
  for (const page of marcher(APP, 'page.jsx')) table.set(cleDePage(page), page)
  return table
}

/** Une URL ou un chemin réduit à sa clé de route. */
function cleDeRoute(chemin) {
  return String(chemin ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.includes('${') ? ':' : segment))
    .join('/')
}

/* ---------------------------------------------------------------------------
   1. L'adresse : la demande, le retour, la page
   ------------------------------------------------------------------------ */

test('demande — `resetPasswordForEmail` envoie une URL de retour, pas le silence', () => {
  const demande = lire(...DEMANDE)

  // Sans second argument, Supabase retombe sur l'URL de site : le `code` arrive
  // sur `/` et personne ne l'échange. C'est le défaut d'origine.
  assert.match(
    demande,
    /resetPasswordForEmail\(email,\s*options\)/,
    'la demande ne passe plus d’options : la redirection de retour n’est plus envoyée'
  )
  assert.match(
    demande,
    /urlReinitialisation\(/,
    'l’URL de retour ne vient pas de la fonction qui ajoute le marqueur de flux'
  )

  // Une origine connue produit l'URL ; une origine inconnue **omet** l'option.
  // `{ redirectTo: null }` ferait échouer la demande pour une raison qui n'a
  // rien à voir avec l'adresse saisie.
  assert.match(demande, /redirectTo === null/, 'l’option n’est plus conditionnée à une origine connue')
  assert.doesNotMatch(demande, /redirectTo:\s*(null|undefined)/, 'une option vide est envoyée à Supabase')

  // Aucun domaine recopié : celui du clone est encore provisoire.
  assert.doesNotMatch(demande, /fidelia\.ma|fidelix\.ma/)
})

test('chaîne — l’URL de retour atterrit sur une page qui existe', () => {
  const url = urlReinitialisation('https://exemple.ma')
  assert.ok(url, 'sans URL absolue, Supabase choisit l’hôte : le lien mort revient')

  // GoTrue ajoute son `code` à l'URL fournie, sans effacer la requête existante.
  const lu = new URL(url)
  assert.equal(lu.pathname, '/auth/confirm')
  lu.searchParams.set('code', 'abc-123')

  const lecture = lireParametresConfirmation(lu.searchParams)
  assert.equal(lecture.sorte, 'code', 'le retour n’est plus reconnu comme un échange PKCE')

  const destination = destinationSucces(lecture)
  assert.equal(
    destination,
    '/nouveau-mot-de-passe',
    'une session de récupération mène au tableau de bord : mot de passe inchangé, commerçant trompé'
  )

  // Et l'adresse **arrive** : la destination est une page du disque, pas un
  // chemin plausible.
  const page = pagesParRoute().get(cleDeRoute(destination))
  assert.ok(page, `\`${destination}\` n’est servie par aucune page : le colis n’arrive pas (§27.5)`)
  assert.match(page, /(^|\/)nouveau-mot-de-passe\/page\.jsx$/, `\`${destination}\` est servie par ${page}`)
})

test('route — la destination de succès vient du flux, pas d’une valeur écrite ici', () => {
  const route = lire(...ROUTE)

  assert.ok(
    route.includes('redirect(destinationSucces(lecture))'),
    '`/auth/confirm` a cessé de lire la destination dans le flux'
  )
  // Un `redirect('/dashboard')` en dur marcherait pour l'inscription et
  // déposerait une récupération sur le tableau de bord.
  assert.doesNotMatch(route, /redirect\(\s*'\/dashboard'/, 'une destination est écrite en dur dans la route')
  assert.doesNotMatch(route, /redirect\(DESTINATION_SUCCES\)/)
})


/* ---------------------------------------------------------------------------
   2. Le couplage `?etat=` : produit par l'action, rendu par la page
   ------------------------------------------------------------------------ */

/** Les valeurs littérales écrites après `?etat=` / `&etat=` dans un fichier. */
function valeursEtat(source) {
  const valeurs = new Set()
  for (const trouve of source.matchAll(/[?&]etat=([A-Za-z0-9_-]+)/g)) valeurs.add(trouve[1])
  return [...valeurs].sort()
}

test('couplage — chaque `?etat=` écrit par l’action a sa branche dans la page', () => {
  const valeurs = valeursEtat(lire(...ACTION))

  // §28.2 : un balayage qui ne lit rien est vert pour de mauvaises raisons.
  assert.ok(
    valeurs.length > 0,
    'aucune valeur `?etat=` lue chez le producteur : la syntaxe a changé, le test ne mesure plus rien'
  )

  const page = lire(...PAGE)

  // C'est ce qui fait de `etat` le paramètre d'URL — et donc ce qui autorise à
  // comparer `etat` sans le confondre avec un état de données.
  assert.match(
    page,
    /const\s*\{[^}]*\betat\b[^}]*\}\s*=\s*await\s+searchParams/,
    'la page ne lit pas `etat` dans `searchParams`, au rendu serveur'
  )
  // Une lecture client afficherait le message après hydratation — jamais quand
  // le JavaScript échoue, c'est-à-dire précisément quand il faut expliquer.
  assert.doesNotMatch(page, /useSearchParams|useEffect|window\.location/)
  assert.doesNotMatch(page, /^'use client'/m)

  const sansBranche = valeurs.filter(
    (valeur) => !new RegExp(`(?<![.\\w$])etat\\s*===\\s*['"]${valeur}['"]`).test(page)
  )
  assert.deepEqual(sansBranche, [], 'des valeurs sont écrites dans une URL que la page ne rend pas')
})

test('rendu — `?etat=session` remplace le formulaire et se dit comme une alerte', () => {
  const page = lire(...PAGE)

  // La valeur est **lue chez le producteur**, jamais réécrite ici : la renommer
  // des deux côtés reste cohérent, et ce test le suit au lieu de crier.
  const valeurs = valeursEtat(lire(...ACTION))
  assert.equal(
    valeurs.length,
    1,
    `l’écran ne répond plus à exactement une valeur d’état (${valeurs.join(', ') || 'aucune'}) : la branche examinée ci-dessous n’est plus celle du producteur`
  )
  const valeur = valeurs[0]

  // Le bloc rendu pour cette valeur, borné par sa condition.
  const debut = page.indexOf(`etat === '${valeur}'`)
  assert.ok(debut > 0, `la branche « ${valeur} » a disparu`)

  // Le message répond à l'envoi du formulaire : c'est une alerte, pas un état
  // d'écran (§27.1 — le moment départage, pas le mot).
  const bloc = page.slice(debut, page.indexOf(') : (', debut))
  assert.match(bloc, /role="alert"/, 'la session expirée n’est pas rendue comme une alerte')
  assert.doesNotMatch(bloc, /role="status"/, 'un rôle d’état d’écran sur une réponse à un geste')

  // Le formulaire est **remplacé**, pas surmonté : un champ qui ne peut pas
  // aboutir est une invitation à le remplir pour rien.
  assert.match(
    page,
    new RegExp(`etat === '${valeur}'[\\s\\S]*?\\)\\s*:\\s*\\(\\s*<FormulaireNouveauMotDePasse`),
    'le formulaire reste affiché alors qu’il ne peut pas aboutir'
  )

  // La cause est une phrase du dictionnaire, et elle dit l'issue : rien n'a été
  // enregistré.
  assert.match(bloc, /t\('auth\.nouveau\.etatSession'\)/, 'la copie n’est pas lue au dictionnaire')
})

/* ---------------------------------------------------------------------------
   3. Le `?echec=` voisin : il atterrit aussi sur une page qui le rend
   ------------------------------------------------------------------------ */

test('?echec= — chaque motif produit atterrit sur une page qui le rend', () => {
  // `confirmation.test.mjs` vérifie le contrat de `messageEchec` (le motif est
  // traduisible). Ici on vérifie l'**adresse** : la page qui reçoit la valeur
  // existe et la consomme. Un motif traduisible envoyé nulle part reste un
  // bandeau muet.
  const pages = pagesParRoute()
  const manquants = []

  for (const motif of ['expire', 'appareil', 'invalide']) {
    const url = new URL(destinationEchec(motif), 'https://exemple.ma')
    // La valeur est **relue** dans l'URL produite, pas prise dans une constante.
    const valeur = url.searchParams.get('echec')
    if (!messageEchec(valeur)) manquants.push(`${motif} : la valeur produite n’est pas traduisible`)

    const page = pages.get(cleDeRoute(url.pathname))
    if (!page) {
      manquants.push(`${motif} : ${url.pathname} n’est servie par aucune page`)
      continue
    }
    const texte = lireDansApp(page)
    if (!/messageEchec\(/.test(texte)) manquants.push(`${motif} : ${page} ne valide pas la valeur`)
    if (!/echec=\{echec\}/.test(texte)) manquants.push(`${motif} : ${page} ne transmet pas l’échec au formulaire`)
  }

  assert.deepEqual(manquants, [], 'un `?echec=` produit n’est rendu nulle part')
})

/* ---------------------------------------------------------------------------
   4. Forme → action : les champs envoyés sont ceux qui sont lus
   ------------------------------------------------------------------------ */

test('formulaire → action — les noms de champs envoyés sont ceux qui sont lus', () => {
  const formulaire = lire(...FORMULAIRE)
  const action = lire(...ACTION)

  assert.match(
    formulaire,
    /from '@\/app\/\(auth\)\/nouveau-mot-de-passe\/actions\.js'/,
    'le formulaire n’appelle plus l’action de cet écran'
  )

  const envoyes = [...formulaire.matchAll(/name="([^"]+)"/g)].map((trouve) => trouve[1]).sort()
  const lus = [...action.matchAll(/donnees\.get\('([^']+)'\)/g)].map((trouve) => trouve[1]).sort()

  // Témoin de lecture : deux champs, et ce sont les bons. Un formulaire vidé
  // rendrait un ensemble vide, et « tout champ envoyé est lu » serait vrai.
  assert.deepEqual(envoyes, ['confirmation', 'motDePasse'])
  assert.deepEqual(lus, envoyes, 'un champ envoyé n’est jamais lu, ou un champ lu n’est jamais envoyé')
})

test('action — le mot de passe est enregistré, et `redirect` reste hors du `try`', () => {
  const action = lire(...ACTION)

  assert.match(action, /updateUser\(\{\s*password:\s*motDePasse\s*\}\)/, 'le mot de passe n’est plus enregistré')
  assert.match(action, /verifierNouveauMotDePasse\(/, 'le serveur ne rejoue plus les règles du mot de passe')
  // L'écran de saisie n'est pas une seconde demande de lien.
  assert.doesNotMatch(action, /resetPasswordForEmail/, 'l’écran de saisie redemande un lien au lieu d’enregistrer')

  // `redirect()` lève une exception interne à Next : dans le `try`, un succès
  // passerait pour un échec silencieux.
  const finCatch = action.lastIndexOf('} catch (levee)')
  assert.ok(finCatch > 0, 'le `catch` de l’enregistrement doit exister')
  const apres = action.slice(finCatch)
  assert.ok(apres.includes("redirect('/nouveau-mot-de-passe?etat=session')"))
  assert.ok(apres.includes("redirect('/dashboard')"))
})


