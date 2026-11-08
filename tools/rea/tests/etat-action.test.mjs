/* ============================================================================
   R3/R4 — `?etat=` : tout ce qu'un producteur écrit dans l'URL a un rendu.

   **Le défaut, tel qu'il a été mesuré (R3).** `scan/actions.js` et
   `caisse/actions.js` redirigaient vers `…&etat=configuration` quand
   `clientServeur()` lève, et aucune des deux pages ne testait cette valeur :
   le commerçant retombait sur un écran vide **normal**, comme si rien n'avait
   été tenté. Même famille que le `?echec=` de `/forgot-password` avant
   `/auth/confirm`, et que `/login` avant le 2026-10-31.

   **Le défaut de la garde elle-même (R4).** La première version nommait deux
   `actions.js` en dur. Un troisième écran aurait rouvert le défaut sans que
   rien ne le voie : le test aurait continué de couvrir deux fichiers sur huit.
   Ce fichier balaie donc tous les `actions.js` sous `web/src/app`, et la **couverture est
   prouvée** (les neuf chemins, les cinq producteurs, les valeurs témoins)
   au lieu d'être supposée. Le balayage a immédiatement trouvé un trou réel :
   `/rewards` recevait `?etat=migration` sans branche pour le rendre.

   **Le couplage est lu, il n'est pas partagé.** Le test extrait les valeurs
   que chaque `actions.js` écrit réellement dans l'URL, puis exige que la page
   qui reçoit cette URL ait une branche pour **chacune**. Aucune constante
   commune entre le producteur et le consommateur : si elles l'étaient, le test
   comparerait la constante à elle-même et serait vert juste ou faux (§24.2).

   **La page est résolue par l'URL, pas par le dossier** (§27.5). Le producteur
   n'écrit pas « dans `/scan` » : il écrit dans `retour`, puis y ajoute
   `&etat=`. Si `retour` visait `/dashboard`, producteur et consommateur
   resteraient tous deux « corrects » et **rien** ne s'afficherait. Ici la cible
   est lue dans la redirection puis cherchée sur le disque (groupes de routes et
   segments dynamiques compris) : une cible fausse tombe sur une page sans
   branche, et le test échoue.

   Trois syntaxes sont lues — et les deux difficiles ont leur **témoin** :
     - le littéral       `&etat=arguments`                  (scan, caisse, rewards) ;
     - le gabarit        `&etat=${cond ? 'a' : 'b'}`         → témoins
                         `introuvable` / `refus`, qui ne viennent que de là ;
     - l'identifiant     `?etat=${etat}`, dont la valeur est déclarée plus haut
                         dans le fichier → témoin `ferme` (join).
   Dans une expression, on retire d'abord les **comparaisons** (`=== 'carteInconnue'`) :
   un code qu'on teste est une entrée du code, pas une valeur écrite dans l'URL.
   Les extraire ferait réclamer au consommateur une branche qui n'existe pas et
   ne doit pas exister (§27.3).

   Ce que ce fichier ne juge **pas** : le rôle ARIA. Il dépend du couple
   (cause, moment) et pas du mot (§27.1) — `configuration` est `status` sur
   `/login` et `alert` sur `/scan`. Les rôles sont mesurés par les tests
   d'écran ; ici, seulement la présence du rendu.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { LOCALES } from '../../../web/src/i18n/locales.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const APP = join(RACINE, 'web', 'src', 'app')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')
const lireDansApp = (relatif) => readFileSync(join(APP, relatif), 'utf8')

/** Les deux écrans dont les **décisions d'écran** sont testées plus bas. */
const ECRANS = [
  { nom: '/scan', page: ['app', '(dashboard)', 'scan', 'page.jsx'] },
  { nom: '/caisse', page: ['app', '(dashboard)', 'caisse', 'page.jsx'] },
]

/* Ce que le balayage doit voir. Écrit à la main : c'est la **couverture**, pas
   une déduction. Si un fichier disparaît, le test le dit au lieu de couvrir
   silencieusement moins. Un fichier **ajouté** est balayé sans qu'on y touche. */
const ACTIONS_CONNUES = [
  '(auth)/forgot-password/actions.js',
  '(auth)/login/actions.js',
  '(auth)/nouveau-mot-de-passe/actions.js',
  '(auth)/register/actions.js',
  '(dashboard)/branding/actions.js',
  '(dashboard)/caisse/actions.js',
  '(dashboard)/dashboard/actions.js',
  '(dashboard)/program/actions.js',
  '(dashboard)/rewards/actions.js',
  '(dashboard)/scan/actions.js',
  '(dashboard)/settings/actions.js',
  'join/[slug]/actions.js',
]

/** Les fichiers qui écrivent réellement un `?etat=` (les autres redirigent sans). */
const PRODUCTEURS_CONNUS = [
  '(auth)/nouveau-mot-de-passe/actions.js',
  '(dashboard)/caisse/actions.js',
  '(dashboard)/program/actions.js',
  '(dashboard)/rewards/actions.js',
  '(dashboard)/scan/actions.js',
  '(dashboard)/settings/actions.js',
  'join/[slug]/actions.js',
]

/* Valeurs qu'on ne peut lire que par la syntaxe difficile. Sans elles, un
   balayage cassé rendrait un ensemble plus petit — et « toutes les valeurs ont
   un consommateur » serait vrai sur un ensemble vide (§27.3). */
const TEMOINS = {
  introuvable: 'ternaire dans un gabarit : `&etat=${cond ? … }`',
  refus: 'ternaire dans un gabarit : `&etat=${cond ? … }`',
  ferme: 'identifiant déclaré : `?etat=${etat}` résolu par sa déclaration',
}

/* ---------------------------------------------------------------------------
   Lecture du dépôt
   ------------------------------------------------------------------------ */

/** Tous les fichiers d'un nom donné sous `web/src/app`, triés, en POSIX relatif. */
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
  // La conversion en relatif se fait **une fois**, au retour : la faire dans la
  // récursion relativiserait deux fois chaque chemin.
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

/** Les pages du disque, par clé de route (`scan`, `join/:`, `''` pour la racine). */
function pagesParRoute() {
  const table = new Map()
  for (const page of marcher(APP, 'page.jsx')) table.set(cleDePage(page), page)
  return table
}

/** Une URL écrite par un producteur, réduite à sa clé de route. */
function cleDeRoute(url) {
  if (!url) return null
  return url
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.includes('${') ? ':' : segment))
    .join('/')
}

/* ---------------------------------------------------------------------------
   Lecture d'une production : `?etat=` dans un `actions.js`
   ------------------------------------------------------------------------ */

/**
 * Les déclarations `const id = <initialiseur>` du fichier, bornées à la
 * déclaration. Sert à résoudre `?etat=${etat}` : la valeur n'est pas dans le
 * gabarit, elle est dans l'initialiseur.
 */
function declarations(source) {
  const table = new Map()
  for (const trouve of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const debut = trouve.index + trouve[0].length
    let fin
    if (source[debut] === '`') {
      const fermeture = source.indexOf('`', debut + 1)
      fin = fermeture < 0 ? source.length : fermeture + 1
    } else {
      const reste = source.slice(debut)
      const coupe = reste.search(
        /\n\s*\n|\n\s*\}|\n\s*(?:redirect|revalidatePath|return|if|const|let)\b/
      )
      fin = debut + (coupe < 0 ? reste.length : coupe)
    }
    table.set(trouve[1], source.slice(debut, fin))
  }
  return table
}

/** Littéraux d'une expression, **comparaisons retirées** : `=== 'x'` est une
    entrée du code, pas une valeur possible de l'URL (§27.3). */
function litteraux(expression) {
  const sansComparaisons = expression.replace(/[!=]==\s*(['"])[^'"]*\1/g, '')
  const sortie = []
  for (const trouve of sansComparaisons.matchAll(/'([A-Za-z0-9_-]+)'|"([A-Za-z0-9_-]+)"/g)) {
    sortie.push(trouve[1] ?? trouve[2])
  }
  return sortie
}


/**
 * Une tranche par `redirect(` — jusqu'à la redirection suivante. C'est la borne
 * qui attribue une valeur à **sa** cible sans écrire un analyseur JavaScript.
 * Conséquence assumée : une ligne entre deux redirections qui contiendrait
 * `etat=` serait lue comme produite. Le défaut est bruyant (valeur sans
 * branche), jamais silencieux.
 */
function tranches(source) {
  const debuts = [...source.matchAll(/redirect\s*\(/g)].map((trouve) => trouve.index)
  return debuts.map((debut, rang) => ({
    texte: source.slice(debut, rang + 1 < debuts.length ? debuts[rang + 1] : source.length),
  }))
}

/**
 * Le chemin visé. Deux formes seulement, et chacune lue dans **son** texte :
 *   - `retour` (`redirect(`${retour}&etat=…`)`) → la déclaration de `retour` ;
 *   - un littéral ou un gabarit qui commence par `/` → lui-même, coupé à `?`.
 * On ne développe **pas** les autres identifiants du chemin : `${slug}` n'est
 * pas une route, et substituer sa déclaration abîmerait le chemin.
 */
function cheminVise(tranche, locaux) {
  const indirect = tranche.match(/^redirect\s*\(\s*`?\$\{([A-Za-z_$][\w$]*)\}/)
  const source = indirect && locaux.has(indirect[1]) ? locaux.get(indirect[1]) : tranche
  const trouve = source.match(/['"`]\/([^\s'"`?#),]*)/)
  return trouve ? '/' + trouve[1].replace(/\/$/, '') : null
}

/**
 * Valeurs de `?etat=` d'une tranche : littéral, ou `${…}` aux accolades
 * équilibrées (un gabarit peut en contenir d'autres).
 *
 * `?etat=${etat}` ne contient **aucune** valeur littérale : la valeur est dans
 * la déclaration de `etat`, plus haut. On la résout là, et là seulement — une
 * expression qui n'est pas un simple identifiant est lue telle quelle.
 */
function valeursEcrites(tranche, locaux) {
  const valeurs = new Set()
  for (let i = 0; i < tranche.length; i += 1) {
    if (!/[?&]/.test(tranche[i]) || tranche.slice(i + 1, i + 5) !== 'etat') continue
    let j = i + 5
    if (tranche[j] !== '=') continue
    j += 1
    if (tranche[j] === '$' && tranche[j + 1] === '{') {
      let profondeur = 0
      let k = j + 1
      for (; k < tranche.length; k += 1) {
        if (tranche[k] === '{') profondeur += 1
        else if (tranche[k] === '}') {
          profondeur -= 1
          if (profondeur === 0) break
        }
      }
      let expression = tranche.slice(j + 2, k)
      const nu = expression.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(nu) && locaux.has(nu)) expression = locaux.get(nu)
      for (const valeur of litteraux(expression)) valeurs.add(valeur)
      i = k
    } else {
      const litteral = tranche.slice(j).match(/^([A-Za-z0-9_-]+)/)
      if (litteral) valeurs.add(litteral[1])
      i = j
    }
  }
  return [...valeurs].sort()
}

/** Ce qu'un `actions.js` écrit : une entrée par redirection qui porte `?etat=`. */
function liensProduction(source) {
  const locaux = declarations(source)
  const liens = []
  for (const { texte } of tranches(source)) {
    if (!/[?&]etat=/.test(texte)) continue
    liens.push({ route: cheminVise(texte, locaux), valeurs: valeursEcrites(texte, locaux) })
  }
  return liens
}

/** Les producteurs du dépôt, avec leurs liens. */
function productions() {
  return marcher(APP, 'actions.js')
    .map((fichier) => ({ fichier, liens: liensProduction(lireDansApp(fichier)) }))
    .filter((production) => production.liens.length > 0)
}

/** Une branche de rendu pour cette valeur, **sur le paramètre d'URL**.
    L'antécédent interdit `carte?.etat` ou `resultat.etat` : ce sont des états de
    données, pas le paramètre que la page reçoit.

    La forme exigée est la comparaison **explicite** `etat === '<valeur>'` dans
    la condition de la branche. Le rendu peut ensuite passer par une table
    (`MESSAGES_ERREUR[etat]`, comme `/rewards`) : c'est la condition qui nomme la
    valeur, pas la copie. Une page qui ne testerait **que** la table, sans
    comparaison, échouerait — bruyamment, à charge d'étendre le test. Une garde
    qui rate doit parler, pas se taire. */
function branche(page, valeur) {
  return new RegExp(`(?<![.\\w$])etat\\s*===\\s*['"]${valeur}['"]`).test(page)
}

/** La page lit `etat` dans `searchParams` : c'est ce qui fait de `etat` le
    paramètre, et donc ce qui rend `branche()` applicable. */
const LIT_ETAT = /const\s*\{[^}]*\betat\b[^}]*\}\s*=\s*await\s+searchParams/


/* ---------------------------------------------------------------------------
   La garde générique
   ------------------------------------------------------------------------ */

test('balayage — les onze `actions.js` du dépôt sont lus, et sept produisent un état', () => {
  const fichiers = marcher(APP, 'actions.js')

  // La couverture est annoncée, donc elle se vérifie. Un fichier retiré ou un
  // filtre cassé doit se voir : un balayage plus étroit serait vert sur ce
  // qu'il ne lit plus.
  assert.deepEqual(
    ACTIONS_CONNUES.filter((connu) => !fichiers.includes(connu)),
    [],
    'le balayage ne voit plus tous les `actions.js` : la couverture est plus étroite qu’annoncée'
  )

  const producteurs = productions()
  assert.deepEqual(
    PRODUCTEURS_CONNUS.filter((connu) => !producteurs.some((p) => p.fichier === connu)),
    [],
    'un fichier qui écrivait un `?etat=` ne le fait plus : la garde ne mesure plus rien sur lui'
  )

  // Les valeurs témoins : elles ne s'obtiennent que par la syntaxe difficile.
  // Sans elles, « toutes les valeurs ont un consommateur » serait vrai sur un
  // ensemble plus petit que la réalité — voire vide (§27.3).
  const valeurs = new Set(producteurs.flatMap((p) => p.liens.flatMap((l) => l.valeurs)))
  for (const [valeur, provenance] of Object.entries(TEMOINS)) {
    assert.ok(
      valeurs.has(valeur),
      `témoin \`${valeur}\` absent (${provenance}) : c’est le balayage qui est cassé, pas le producteur`
    )
  }
})

test('couplage — chaque valeur écrite dans une URL a sa branche dans la page qui la reçoit', () => {
  const pages = pagesParRoute()
  const ecarts = []

  for (const { fichier, liens } of productions()) {
    for (const lien of liens) {
      // Un gabarit qu'on ne sait pas lire rendrait zéro valeur : la boucle
      // suivante serait vide et le fichier passerait au vert sans avoir été lu (§27.3).
      assert.ok(
        lien.valeurs.length > 0,
        `${fichier} : \`${lien.route}\` porte un \`?etat=\` dont aucune valeur n’a été lue`
      )

      const page = pages.get(cleDeRoute(lien.route))
      if (!page) {
        ecarts.push(`${fichier} écrit dans \`${lien.route}\`, qu’aucune page du disque ne sert`)
        continue
      }

      const texte = lireDansApp(page)
      for (const valeur of lien.valeurs) {
        if (!branche(texte, valeur)) {
          ecarts.push(`${fichier} → \`${lien.route}?etat=${valeur}\` : rien dans ${page}`)
        }
      }
    }
  }

  assert.deepEqual(ecarts, [], 'des valeurs sont écrites dans une URL que la page ne rend pas')
})

test('chaîne — la cible est une page du disque qui lit `etat` dans `searchParams`', () => {
  const pages = pagesParRoute()
  const cibles = productions().flatMap((p) =>
    p.liens.map((l) => ({ fichier: p.fichier, ...l }))
  )

  // Un balayage qui ne trouve presque rien est vert pour de mauvaises raisons.
  assert.ok(
    cibles.length >= 12,
    `le balayage ne lit plus que ${cibles.length} redirection(s) portant un état`
  )

  for (const cible of cibles) {
    const page = pages.get(cleDeRoute(cible.route))
    assert.ok(page, `${cible.fichier} : \`${cible.route}\` ne correspond à aucune page`)
    // C'est ce qui fait de `etat` le paramètre d'URL, et donc ce qui autorise
    // `branche()` à comparer `etat` sans confondre avec `carte?.etat`.
    assert.match(
      lireDansApp(page),
      LIT_ETAT,
      `${page} ne destructure pas \`etat\` de \`searchParams\``
    )
  }

  // Le cas difficile du résolveur : `join/[slug]` est la seule cible construite
  // avec un segment dynamique. On vérifie la **paire** attendue, pas seulement
  // « au moins une » : c'est ce qui prouve que la route dynamique a été
  // résolue vers sa page, et pas silencieusement écartée du balayage.
  const dynamique = cibles.find((cible) => /\/\$\{/.test(cible.route))
  assert.ok(dynamique, 'témoin : plus aucune cible dynamique, le cas `[slug]` n’est plus exercé')
  assert.equal(
    pages.get(cleDeRoute(dynamique.route)),
    'join/[slug]/page.jsx',
    `la cible dynamique \`${dynamique.route}\` ne résout pas vers la page \`[slug]\``
  )
})


/* ---------------------------------------------------------------------------
   Les décisions d'écran de R3 (`/scan`, `/caisse`)
   ------------------------------------------------------------------------ */

/** Le bloc JSX rendu pour `etat === 'configuration'`, borné. */
function blocConfiguration(page, nom) {
  const debut = page.indexOf("{etat === 'configuration' ? (")
  assert.ok(debut > 0, `${nom} ne rend pas l’état \`configuration\``)

  const fin = page.indexOf(') : null}', debut)
  assert.ok(fin > debut, `${nom} : le bloc \`configuration\` n’est pas refermé`)

  return page.slice(debut, fin)
}

test('rendu — `configuration` est une alerte, et elle dit que rien n’a été écrit', () => {
  for (const ecran of ECRANS) {
    const page = lire(...ecran.page)
    const bloc = blocConfiguration(page, ecran.nom)

    // Le message répond à la soumission du formulaire : c'est une alerte. Un
    // état d'écran serait le rôle de `/login`, où le même mot est là au
    // chargement — le moment départage, pas le mot (§27.1).
    assert.match(bloc, /role="alert"/, `${ecran.nom} : configuration n’est pas rendu comme une alerte`)
    assert.doesNotMatch(bloc, /role="status"/, `${ecran.nom} : rôle d’état d’écran sur une réponse à un geste`)

    // La copie vit au dictionnaire, et c'est **celle-ci** — pas celle de la RPC.
    assert.match(
      bloc,
      /t\('tableau\.etat\.configuration'\)/,
      `${ecran.nom} : la clé rendue n’est pas la bonne`
    )
    assert.doesNotMatch(
      bloc,
      /migrationTexte|migrationTitre/,
      `${ecran.nom} : la cause affichée est « base non migrée » — fausse, la requête n’est jamais partie`
    )
    // `EtatBloque` porte déjà la cause « configuration » de la **RPC** plus bas
    // dans la page : y déléguer confondrait deux causes sous un même mot.
    assert.doesNotMatch(
      bloc,
      /EtatBloque/,
      `${ecran.nom} : deux causes « configuration » dans le même rendu`
    )

    // Témoin de discrimination : la page sait encore rendre un **état d'écran**
    // (`ok`). Sans lui, l'assertion d'alerte ci-dessus ne prouverait rien sur la
    // façon dont ce fichier choisit ses rôles.
    assert.match(
      page,
      /role="status"/,
      `${ecran.nom} : plus aucun état d’écran, le choix de rôle n’est plus mesuré`
    )
  }
})

test('copie — propre aux deux écrans, et pas celle de /login ni celle de la migration', () => {
  const CLE = 'tableau.etat.configuration'

  for (const locale of LOCALES) {
    const texte = dictionnaire(locale)[CLE]
    assert.equal(typeof texte, 'string', `${CLE} manque en ${locale}`)
    assert.notEqual(texte.trim(), '', `${CLE} est vide en ${locale}`)
  }

  const texte = dictionnaire('fr')[CLE]

  // Cet écran est lu par un commerçant : lui nommer une variable d'environnement,
  // c'est lui demander de réparer ce qu'il ne peut pas réparer.
  assert.doesNotMatch(texte, /NEXT_PUBLIC_|SUPABASE_|service_role|\.env/, 'la copie nomme une variable')
  assert.doesNotMatch(
    texte,
    /réessay|recharge|actualis|patientez/i,
    'la copie promet un réessai qui ne peut pas aboutir'
  )

  // La cause fausse, nommément : « la base n'est pas encore migrée ».
  assert.doesNotMatch(texte, /migr/i, 'la copie met une migration en cause')
  // Et le mot de l'autre écran : ici, ce n'est pas une connexion qui échoue.
  assert.doesNotMatch(texte, /connexion/i, 'la copie décrit une connexion, pas un geste perdu')
  // Ni le fournisseur : le commerçant n'y peut rien.
  assert.doesNotMatch(texte, /Supabase/i, 'la copie nomme le fournisseur')

  /* Les interdictions ci-dessus doivent pouvoir mordre : chaque témoin porte le
     mot que la copie n'a pas le droit d'avoir. Sans ces deux lignes, un
     `doesNotMatch` qui ne peut jamais échouer passerait pour une mesure (§17). */
  assert.match(dictionnaire('fr')['auth.connexion.etatConfiguration'], /connexion/i, 'témoin : /login ne parle plus de connexion')
  assert.match(dictionnaire('fr')['tableau.etat.migrationTexte'], /migr/i, 'témoin : la copie de migration ne parle plus de migration')

  // Le témoin décisif : `tableau.rpc.configuration` **existait** et disait la
  // vraie cause. Il n'a pas été réutilisé — il nomme le fournisseur et ne dit
  // pas l'issue du geste, qui est la seule chose utile ici.
  const voisine = dictionnaire('fr')['tableau.rpc.configuration']
  assert.match(voisine, /Supabase/, 'témoin : la copie RPC ne nomme plus le fournisseur')
  assert.doesNotMatch(
    voisine,
    /Aucun point/i,
    'témoin : la copie RPC dit l’issue du geste, l’argument de la copie propre tombe'
  )
})

test('page — lu au rendu serveur, donc affiché sans JavaScript', () => {
  for (const ecran of ECRANS) {
    const page = lire(...ecran.page)

    assert.doesNotMatch(page, /^'use client'/m, `${ecran.nom} est devenu un composant client`)

    // Une lecture client afficherait le bandeau **après** hydratation : jamais
    // quand le JavaScript échoue, c'est-à-dire précisément quand l'écran doit
    // expliquer quelque chose.
    assert.doesNotMatch(
      page,
      /useSearchParams|useEffect|window\.location/,
      `${ecran.nom} lit le paramètre côté client`
    )

    assert.match(
      page,
      LIT_ETAT,
      `${ecran.nom} ne lit pas le paramètre dans searchParams au rendu serveur`
    )

    // Le texte vit au dictionnaire : recopié, il dériverait sans que personne ne
    // le voie. On ne cherche que le **début** de la phrase, parce que la page
    // cite volontairement la mauvaise copie dans un commentaire d'arbitrage.
    assert.doesNotMatch(
      page,
      /n’est pas configuré|n'est pas configuré/,
      `${ecran.nom} recopie la phrase au lieu de lire la clé`
    )
    assert.doesNotMatch(page, /administrateur/, `${ecran.nom} recopie l’adresse de la phrase`)
  }
})


/* ---------------------------------------------------------------------------
   Le trou que la garde générique a trouvé : `/rewards?etat=migration`
   ------------------------------------------------------------------------ */

test('rendu — `/rewards` rend `?etat=migration`, avec la phrase de l’état bloqué', () => {
  const page = lireDansApp('(dashboard)/rewards/page.jsx')

  // `rewards/actions.js` écrit `?etat=migration` quand `enregistrer_programme`
  // n'existe pas. Le bloc rendu plus haut couvre le cas où la **lecture** manque
  // aussi ; cette branche couvre celui où elle répond. Sans elle, l'URL porterait
  // un état que rien ne rendrait — exactement le défaut fermé en R3.
  assert.match(page, /etat === 'migration'/, '`?etat=migration` n’est pas rendu par la page')

  // Une cause, une phrase : la clé de « migration » est celle de l'état bloqué,
  // et elle vit dans la table **littérale** de la page (une clé construite par
  // gabarit échapperait au balayage d'`i18n-ui`).
  assert.match(
    page,
    /migration:\s*'tableau\.etat\.migrationTexte'/,
    'la cause « migration » ne lit pas la phrase de l’état bloqué'
  )

  const debut = page.indexOf("etat === 'slug'")
  assert.ok(debut > 0, 'le bloc d’échec du formulaire a disparu')
  const bloc = page.slice(debut, page.indexOf(') : null}', debut))
  // La branche rend par la table : c'est ce qui relie le mot de l'URL à la
  // phrase, et ce qui empêche une seconde copie de s'installer à côté.
  assert.match(bloc, /MESSAGES_ERREUR\[etat\]/, 'la branche de migration ne lit pas la table des causes')
  // Le message répond à la soumission : `alert`, comme les autres échecs de ce
  // formulaire (§27.1 — le moment départage, pas le mot).
  assert.match(bloc, /role="alert"/, 'la branche de migration n’est pas une alerte')
  assert.doesNotMatch(bloc, /role="status"/, 'un état d’écran sur une réponse à un geste')

  // Témoin : le bloc bloqué existe toujours et rend la même clé. Sans lui, la
  // branche d'URL pourrait être la seule à parler de migration — et la phrase
  // changerait selon le chemin qui a mené à l'écran.
  const ouverture = page.indexOf('<EtatBloque')
  assert.ok(ouverture > 0, 'témoin : l’état bloqué de migration a disparu')
  const bloque = page.slice(ouverture, page.indexOf('/>', ouverture))
  assert.match(
    bloque,
    /tableau\.etat\.migrationTexte/,
    'témoin : l’état bloqué ne rend plus la phrase de migration'
  )
})

