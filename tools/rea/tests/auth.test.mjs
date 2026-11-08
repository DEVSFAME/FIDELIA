/* ============================================================================
   R1 — inscription et mot de passe oublié : ce qui peut casser sans qu'on le
   voie.

   Les deux écrans sont neufs, et trois familles de défauts y sont silencieuses :

     1. **l'oracle d'énumération.** Un message d'erreur qui distingue « adresse
        déjà utilisée » de « mot de passe trop faible » transforme le formulaire
        en outil de recensement des commerces inscrits. On vérifie que l'action
        ne rend **qu'une** clé d'échec ;
     2. **la copie qui dérive.** Les libellés sont désormais dans le
        dictionnaire ; un mot changé « pour faire mieux » s'y verrait, mais un
        écran qui réécrit la chaîne en dur ne se verrait pas. On vérifie les
        chaînes mesurées, mot pour mot ;
     3. **la dépendance ajoutée sans le dire.** La cible utilise `zod`,
        `react-hook-form` et `framer-motion` dans ces deux bundles. Les
        reprendre aurait ajouté trois paquets pour deux formulaires. Le test
        interdit leur import : si quelqu'un les ajoute, il devra le justifier.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { messageEchec, REFERENCE_CNDP } from '../../../web/src/lib/reinitialisation.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')

const INSCRIPTION_ACTION = ['app', '(auth)', 'register', 'actions.js']
const INSCRIPTION_FORM = ['components', 'auth', 'FormulaireInscription.jsx']
const OUBLI_PAGE = ['app', '(auth)', 'forgot-password', 'page.jsx']
const OUBLI_ACTION = ['app', '(auth)', 'forgot-password', 'actions.js']

const fr = dictionnaire('fr')

/** Chaînes **mesurées** dans les bundles de la cible, au caractère près. */
const COPIE_MESUREE = {
  'auth.connexion.titreLigne1': 'BON',
  'auth.connexion.titreLigne2': 'RETOUR',
  'auth.connexion.sousTitre': 'Connectez-vous à votre espace commerçant',
  'auth.inscription.titreLigne1': 'CRÉEZ',
  'auth.inscription.titreLigne2': 'VOTRE ESPACE',
  'auth.inscription.sousTitre': 'Programme de fidélité en 2 minutes',
  'auth.inscription.action': 'Créer mon compte gratuitement',
  'auth.inscription.actionEnCours': 'Création du compte…',
  'auth.inscription.succesTitre': 'Vérifiez votre email',
  'auth.oubli.titreLigne1': 'MOT DE PASSE',
  'auth.oubli.titreLigne2': 'OUBLIÉ ?',
  'auth.oubli.sousTitre': 'Entrez votre email, on vous envoie un lien de réinitialisation',
  'auth.oubli.action': 'Envoyer le lien',
  'auth.oubli.actionEnCours': 'Envoi…',
  'auth.oubli.succesTitre': 'Email envoyé',
  'champ.emailProfessionnel': 'Email professionnel',
  'champ.motDePasseOublie': 'Mot de passe oublié ?',
  'champ.nomComplet': 'Nom complet',
  'champ.confirmerMotDePasse': 'Confirmer le mot de passe',
  'auth.motDePasse.minimum': '8 caractères minimum',
  'auth.telephone.incomplet': 'Écrivez votre numéro en entier. Exemple : 06 12 34 56 78.',
  'auth.confirmation.differente': 'Les mots de passe ne correspondent pas',
  'auth.consentement.requis': 'Vous devez accepter pour créer un compte',
}

test('copie — les chaînes mesurées sont transcrites au caractère près', () => {
  for (const [cle, attendu] of Object.entries(COPIE_MESUREE)) {
    assert.equal(fr[cle], attendu, `la clé ${cle} a dérivé`)
  }
})

test("inscription — un seul message d'échec, jamais un oracle", () => {
  const action = lire(...INSCRIPTION_ACTION)

  // Une seule forme d'échec général, deux fois : configuration absente, puis
  // `signUp` en erreur. Deux branches distinctes (« adresse déjà prise » vs le
  // reste) suffiraient à recenser les comptes existants.
  const clesErreur = [...action.matchAll(/erreurs: \{ general: '([^']+)'/g)].map((m) => m[1])
  assert.equal(clesErreur.length, 2, 'deux échecs généraux attendus')
  for (const cle of clesErreur) assert.ok(fr[cle], `clé d'erreur inconnue : ${cle}`)
  assert.ok(clesErreur.includes('auth.inscription.erreurGenerique'))

  // Aucun message spécifique « compte déjà existant » ne doit apparaître.
  assert.doesNotMatch(action, /already registered|déjà inscrit|email_exists/i)
})

test('inscription — les quatre clés de user_metadata mesurées sont écrites', () => {
  const action = lire(...INSCRIPTION_ACTION)
  for (const champ of ['full_name', 'phone', 'consentement_cndp_le', 'consentement_cndp_version']) {
    assert.match(action, new RegExp(`${champ}:`), `métadonnée manquante : ${champ}`)
  }
  assert.match(action, /supabase\.auth\.signUp\(/)
  // Le consentement porte une **date** et une **version** : une case cochée ne
  // prouve rien en cas de contrôle.
  assert.match(action, /new Date\(\)\.toISOString\(\)/)
  assert.match(action, /REFERENCE_CNDP/)
})

test('inscription — `redirect()` reste hors du `try`', () => {
  const action = lire(...INSCRIPTION_ACTION)
  const positionRedirect = action.indexOf("redirect('/dashboard')")
  assert.ok(positionRedirect > 0, 'la redirection doit exister')
  // Le `try/catch` de configuration doit être **refermé** avant la redirection.
  const fermeture = action.lastIndexOf('} catch', positionRedirect)
  const finCatch = action.indexOf('}', action.indexOf('return { erreurs: { general:', fermeture))
  assert.ok(
    finCatch < positionRedirect,
    'redirect doit être hors du bloc try/catch : il lève, et serait avalé'
  )
})

test('inscription — le consentement est requis, côté écran et côté serveur', () => {
  const formulaire = lire(...INSCRIPTION_FORM)
  assert.match(formulaire, /name="consentement"/)
  assert.match(formulaire, /value="oui"/)
  assert.match(formulaire, /required/)
  // Le serveur ne croit pas la case cochée : il relit la valeur envoyée.
  assert.match(
    lire(...INSCRIPTION_ACTION),
    /consentement: donnees\.get\('consentement'\) === 'oui'/
  )
})

test('inscription — aucune bibliothèque de formulaire ajoutée', () => {
  const dossier = join(RACINE, 'web', 'src')
  const fichiers = []
  const parcourir = (chemin) => {
    for (const entree of readdirSync(chemin, { withFileTypes: true })) {
      const complet = join(chemin, entree.name)
      if (entree.isDirectory()) parcourir(complet)
      else if (/\.(jsx?|mjs)$/.test(entree.name)) fichiers.push(complet)
    }
  }
  parcourir(dossier)

  for (const fichier of fichiers) {
    const source = readFileSync(fichier, 'utf8')
    for (const paquet of ['zod', 'react-hook-form', 'framer-motion']) {
      assert.ok(
        !source.includes(`from '${paquet}`),
        `${fichier} importe ${paquet} : dépendance non mesurée dans ce socle`
      )
    }
  }
})

test('mot de passe oublié — la réponse est neutre, sauf limitation de débit', () => {
  const action = lire(...OUBLI_ACTION)
  assert.match(action, /resetPasswordForEmail/)
  // 429 : message mesuré. Toute autre erreur mène au succès neutre — c'est ce
  // que fait la cible, et c'est ce qui empêche de tester une adresse.
  assert.match(action, /error\.status === 429/)
  assert.match(action, /auth\.oubli\.tropDeDemandes/)
  assert.equal(
    (action.match(/succes: true/g) || []).length,
    1,
    'un seul chemin de succès : la fin de fonction'
  )
})

test('mot de passe oublié — `?echec=` est validé par une fonction pure', () => {
  assert.equal(messageEchec('expire'), 'auth.oubli.echecExpire')
  assert.equal(messageEchec('appareil'), 'auth.oubli.echecAppareil')
  assert.equal(messageEchec('invalide'), 'auth.oubli.echecInvalide')
  for (const inconnue of [null, undefined, '', 'autre', '../../etc/passwd']) {
    assert.equal(messageEchec(inconnue), null, `${inconnue} ne doit rien afficher`)
  }
  // La page lit `searchParams` côté serveur (pas d'effet de bord client).
  const page = lire(...OUBLI_PAGE)
  assert.match(page, /searchParams/)
  assert.match(page, /messageEchec\(/)
})

test('inscription — la référence CNDP est nommée une seule fois', () => {
  // `cndp-2026-10` est la déclaration de **la cible** : le test ne peut pas
  // vérifier une intention, mais il peut exiger que la valeur ne soit pas
  // recopiée à côté du seul endroit qui doit changer.
  assert.equal(REFERENCE_CNDP, 'cndp-2026-10')
  assert.match(lire('lib', 'reinitialisation.mjs'), /avant toute mise en production/i)
  for (const fichier of [INSCRIPTION_FORM, INSCRIPTION_ACTION]) {
    assert.doesNotMatch(
      lire(...fichier),
      /cndp-2026-10/,
      'la référence doit venir de REFERENCE_CNDP, pas d’une chaîne recopiée'
    )
  }
})

