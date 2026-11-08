/* ============================================================================
   R1/R3 — `?etat=configuration` : le producteur et son consommateur.

   La dette disait : « `/dashboard` redirige vers `/login?etat=configuration`
   quand Supabase n'est pas configuré, mais aucune page ne lit ce paramètre ».
   Un producteur sans consommateur : la garde écrivait un message dans une URL
   que personne n'affichait. C'est la **même famille** que le `?echec=` de
   `/forgot-password` avant `/auth/confirm`, fermé le 2026-10-31.

   **Pourquoi ce test lit des fichiers au lieu d'importer une constante.** Si le
   producteur et le consommateur partageaient un `ETAT_CONFIGURATION` exporté,
   le test comparerait cette constante à elle-même : juste ou fausse, il serait
   vert. C'est le §24.2 de `lesson-learned.md` — un vérificateur qui partage la
   constante de l'objet vérifié ne mesure rien. On extrait donc le **littéral**
   écrit dans le fichier de la garde, on le donne à `messageEtat`, et on vérifie
   que la réponse est une clé qui existe vraiment au dictionnaire.

   Quatre familles de défauts silencieux :

     1. la valeur produite n'est pas affichable (bandeau muet) — ou, pire, le
        producteur change de valeur et le consommateur ne suit pas ;
     2. le balayage rate ce qu'il prétend mesurer : une redirection écrite dans
        un gabarit (`redirect(\`/login?etat=${x}\`)`) échapperait à la lecture
        étroite et le test passerait au vert sans rien avoir vu ;
     3. la copie nomme `NEXT_PUBLIC_SUPABASE_URL` à un commerçant, ou promet un
        réessai qui ne peut pas aboutir — une cause affichée comme une autre ;
     4. le bandeau est rendu en `role="alert"`, ou lu côté client : il manque
        exactement quand le JavaScript ne tourne pas.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { messageEtat } from '../../../web/src/lib/connexion.mjs'
import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { LOCALES } from '../../../web/src/i18n/locales.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')

/** La garde de l'espace authentifié — c'est **elle** qui produit le paramètre.
    Elle a suivi la coque : un layout de segment (`dashboard/layout.jsx`) ne
    couvrait que `/dashboard`, la garde vit donc dans le layout du groupe. */
const GARDE = ['app', '(dashboard)', 'layout.jsx']
/** L'écran qui le consomme, et le seul composant client de cet écran. */
const PAGE = ['app', '(auth)', 'login', 'page.jsx']
const COMPOSANT = ['components', 'auth', 'FormulaireConnexion.jsx']

test('producteur — ce que la garde écrit dans l’URL, le consommateur l’affiche', () => {
  const source = lire(...GARDE)

  // Balayage **large** : toute valeur de `etat=` écrite dans ce fichier, quelle
  // que soit la syntaxe. C'est le témoin du balayage étroit ci-dessous.
  const larges = [...source.matchAll(/[?&]etat=([A-Za-z0-9_-]+)/g)].map((t) => t[1])

  // Balayage **étroit** : les redirections littérales, qu'on sait relire.
  const chemins = [...source.matchAll(/redirect\('([^']*\?etat=[^']*)'\)/g)].map((t) => t[1])

  // Un balayage qui ne trouve rien est vert pour de mauvaises raisons : la
  // garde produisait un `?etat=` avant ce test, et doit continuer.
  assert.ok(larges.length > 0, 'la garde du tableau de bord ne produit plus aucun `?etat=`')
  assert.ok(
    chemins.length > 0,
    'aucune redirection littérale n’est relisible : le test ne mesure rien'
  )

  // Le garde-fou du garde-fou : un `?etat=` écrit dans un gabarit serait vu par
  // le balayage large et manqué par le balayage étroit. L'écart de compte le dit.
  assert.equal(
    chemins.length,
    larges.length,
    'une valeur de `?etat=` échappe à la lecture : elle est produite sans être vérifiée'
  )

  // La cible existe : `i18n-ui` vérifie les `href=`, pas les `redirect()`.
  assert.doesNotThrow(() => lire(...PAGE), 'la redirection pointe vers une page absente')

  for (const chemin of chemins) {
    const url = new URL(chemin, 'https://exemple.ma')
    assert.equal(url.pathname, '/login', 'la garde doit renvoyer vers l’écran de connexion')

    const valeur = url.searchParams.get('etat')
    assert.ok(valeur, 'une redirection `?etat=` sans valeur n’affiche rien')
    assert.equal(
      typeof messageEtat(valeur),
      'string',
      `« ${valeur} » est produit par la garde mais n’est pas affichable par \`/login\``
    )
  }
})

test('consommateur — une valeur inconnue n’affiche rien et ne se recopie jamais', () => {
  // Une URL se modifie à la main. Recopier l'inconnue à l'écran serait le défaut
  // qu'on ferme, retourné : un message fabriqué à partir de rien.
  for (const inconnu of [
    undefined,
    null,
    '',
    'autre',
    'ok',
    'migration',
    '../../etc/passwd',
    '<script>alert(1)</script>',
  ]) {
    assert.equal(messageEtat(inconnu), null, `« ${String(inconnu)} » ne doit rien afficher`)
  }

  // Témoin positif, et il compte : `ok`, `introuvable`, `refus`, `arguments`
  // sont produits par d'AUTRES écrans (`/scan`, `/caisse`, `/rewards`). Si
  // `messageEtat` les acceptait, il ne mesurerait plus le couplage de `/login` —
  // il accepterait n'importe quel `?etat=` recopié à la main dans l'URL.
  assert.equal(messageEtat('configuration'), 'auth.connexion.etatConfiguration')
})

test('copie — la clé existe, sans nom de variable ni promesse de réessai', () => {
  const cle = messageEtat('configuration')
  const enFrancais = dictionnaire('fr')[cle]

  for (const locale of LOCALES) {
    const texte = dictionnaire(locale)[cle]
    assert.equal(typeof texte, 'string', `${cle} manque en ${locale}`)
    assert.notEqual(texte.trim(), '', `${cle} est vide en ${locale}`)

    // Cet écran est lu par un commerçant qui vient se connecter : lui nommer une
    // variable d'environnement, c'est lui demander de réparer son serveur.
    assert.doesNotMatch(
      texte,
      /NEXT_PUBLIC_|SUPABASE_|service_role|\.env/,
      'le bandeau de connexion nomme une variable d’environnement'
    )
    // Et aucune promesse de réessai : une configuration absente ne se répare pas
    // en rechargeant la page. Un « réessayez plus tard » ferait boucler.
    assert.doesNotMatch(texte, /réessay|recharge|actualis|patientez/i)
  }

  // Le contrôle **discrimine** — sinon il ne peut jamais échouer. La clé voisine,
  // destinée à qui installe le projet, nomme bien les variables : c'est la même
  // information, adressée à quelqu'un d'autre.
  const technique = dictionnaire('fr')['auth.erreurConfiguration']
  assert.match(technique, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.notEqual(enFrancais, technique)
})

test('page — lu au rendu serveur, donc affiché sans JavaScript', () => {
  const page = lire(...PAGE)

  assert.match(page, /searchParams/, 'la page de connexion ne lit pas `searchParams`')
  assert.match(page, /messageEtat\(parametres\?\.etat\)/, 'la valeur ne passe pas par `messageEtat`')
  assert.match(page, /etatEcran=\{etatEcran\}/, 'la clé n’est pas transmise au formulaire')

  // Un `useEffect` ou `useSearchParams` afficherait le bandeau **après**
  // hydratation : jamais quand le JavaScript échoue, c'est-à-dire précisément
  // quand l'écran doit expliquer quelque chose.
  assert.doesNotMatch(page, /useEffect|useSearchParams|window\.location/)

  // Aucune phrase recopiée : le texte vit au dictionnaire, sinon il dérive sans
  // que personne ne le voie (et un « Supabase » en dur reviendrait à l'écran).
  assert.doesNotMatch(page, /n’est pas configuré|n'est pas configuré/)
  assert.doesNotMatch(page, /administrateur/)
})

test('rendu — le bandeau est un état d’écran (`status`), pas une alerte', () => {
  const composant = lire(...COMPOSANT)

  const debut = composant.indexOf('{etatEcran ? (')
  assert.ok(debut > 0, 'le bandeau `etatEcran` a disparu du formulaire')
  const fin = composant.indexOf(') : null}', debut)
  assert.ok(fin > debut, 'le bloc `etatEcran` n’est pas refermé')

  const bloc = composant.slice(debut, fin)
  assert.match(bloc, /role="status"/, 'un état d’écran se rend en `status`, pas en alerte')
  assert.doesNotMatch(bloc, /role="alert"/)
  assert.match(bloc, /\{t\(etatEcran\)\}/, 'la clé n’est pas traduite à l’affichage')
  assert.doesNotMatch(bloc, /etat\.erreur/, 'l’état d’écran et l’échec d’action sont confondus')

  // La découpe est bien **délimitée** : le formulaire porte par ailleurs une
  // vraie alerte (l'échec d'action). Si elle disparaissait, les assertions
  // ci-dessus pourraient porter sur n'importe quoi et rester vertes.
  const alerte = composant.indexOf('role="alert"')
  assert.ok(alerte > 0, 'l’alerte de l’échec d’action a disparu')
  assert.ok(
    alerte > fin,
    'l’alerte doit rester hors du bloc d’état : elle répond à un geste, l’état est là au chargement'
  )
})

