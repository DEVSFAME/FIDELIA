/* ============================================================================
   R1 — retour de lien de confirmation : ce qui casse sans se voir.

   `/auth/confirm` ne rend **rien**. Aucun écran ne montrera qu'il envoie au
   mauvais endroit, qu'il accepte un jeton qu'il ne sait pas vérifier, ou qu'il
   produit un `?echec=` que la page d'arrivée refuse d'afficher. Trois familles
   de défauts sont donc vérifiées ici, hors serveur :

     1. **la valeur recopiée.** Un `?echec=` construit à la main (`?echec=` +
        texte libre) transforme une URL en champ libre ; on vérifie qu'un motif
        inconnu retombe sur `invalide` et que le producteur ne peut pas produire
         ce que `messageEchec` refuse de traduire ;
     2. **la mauvaise conclusion.** Un lien ouvert sur un autre appareil et un
        lien expiré n'appellent pas la même phrase. La cartographie est testée
        sur les messages réels de Supabase, pas sur une intuition ;
     3. **le lien mort.** `signUp` doit envoyer une URL **absolue** vers une
        route qui existe : l'absence d'origine n'ajoute pas d'option (Supabase
        retombe sur l'URL de site), et aucune valeur de domaine n'est recopiée.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CHEMIN_CONFIRMATION,
  CHEMIN_ECHEC,
  DESTINATION_SUCCES,
  NOM_ORIGINE,
  destinationEchec,
  destinationSucces,
  lireParametresConfirmation,
  motifDepuisErreur,
  origineDepuisEntetes,
  urlConfirmation,
  urlReinitialisation,
} from '../../../web/src/lib/confirmation.mjs'
import { messageEchec } from '../../../web/src/lib/reinitialisation.mjs'
import { LOCALES } from '../../../web/src/i18n/locales.mjs'
import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, 'web', 'src', ...morceaux), 'utf8')

const ROUTE = ['app', 'auth', 'confirm', 'route.js']
const ACTION = ['app', '(auth)', 'register', 'actions.js']

/** En-têtes d'une requête, sous la forme que lit `origineDepuisEntetes`. */
const entetes = (table) => new Map(Object.entries(table))

test('lecture — un lien sans paramètre est invalide', () => {
  for (const rien of [undefined, null, {}, new URLSearchParams()]) {
    assert.deepEqual(lireParametresConfirmation(rien), { sorte: 'echec', motif: 'invalide' })
  }
})

test('lecture — `?code=…` est la forme PKCE de `@supabase/ssr`', () => {
  assert.deepEqual(lireParametresConfirmation(new URLSearchParams('code=abc-123')), {
    sorte: 'code',
    code: 'abc-123',
  })
})

test('lecture — `?token_hash=…&type=…` est la forme qui s’ouvre partout', () => {
  const lecture = lireParametresConfirmation(
    new URLSearchParams('token_hash=jeton&type=signup')
  )
  assert.deepEqual(lecture, { sorte: 'token_hash', tokenHash: 'jeton', type: 'signup' })
  // Le type arrive parfois en capitales dans une URL recopiée : on normalise.
  assert.equal(
    lireParametresConfirmation(new URLSearchParams('token_hash=j&type=EMAIL')).type,
    'email'
  )
})

test('lecture — un type absent ou inconnu ne vérifie rien', () => {
  // `recovery` n'est plus dans cette liste : la raison de son exclusion — aucune
  // page « nouveau mot de passe » n'existait — a disparu avec elle. Le test qui
  // le concerne est juste en dessous, et il vérifie qu'il **mène quelque part**.
  for (const requete of [
    'token_hash=jeton',
    'token_hash=jeton&type=autre',
    'token_hash=jeton&type=',
  ]) {
    assert.deepEqual(lireParametresConfirmation(new URLSearchParams(requete)), {
      sorte: 'echec',
      motif: 'invalide',
    })
  }
})

test('lecture — `type=recovery` vérifie, et mène à l’écran de saisie', () => {
  const lecture = lireParametresConfirmation(new URLSearchParams('token_hash=jeton&type=recovery'))
  assert.deepEqual(lecture, { sorte: 'token_hash', tokenHash: 'jeton', type: 'recovery', flux: 'recuperation' })
  // La destination est écrite en littéral ici : comparer la constante du module
  // à elle-même ne mesurerait rien (§24.2).
  assert.equal(destinationSucces(lecture), '/nouveau-mot-de-passe')
})

test('lecture — un lien ordinaire n’a pas de flux, et va au tableau de bord', () => {
  // Une clé `flux` toujours présente à `null` ferait échouer chaque comparaison
  // stricte existante pour dire la même chose : elle n'apparaît qu'en récupération.
  for (const requete of ['code=abc', 'token_hash=jeton&type=signup']) {
    const lecture = lireParametresConfirmation(new URLSearchParams(requete))
    assert.equal('flux' in lecture, false, `${requete} : un flux a été inventé`)
    assert.equal(destinationSucces(lecture), '/dashboard')
  }
  assert.equal(destinationSucces({ sorte: 'echec', motif: 'expire' }), '/dashboard')
  assert.equal(destinationSucces(undefined), '/dashboard')
})

test('lecture — un flux inconnu ne détourne pas la session', () => {
  // `?flux=` est écrit par nous, mais l'URL peut être réécrite à la main. Une
  // valeur non reconnue ne doit pas devenir une destination : la liste des flux
  // est fermée, comme celle des motifs d'échec.
  for (const flux of ['autre', '../../etc/passwd', 'recuperation2', '0']) {
    const lecture = lireParametresConfirmation(new URLSearchParams(`code=abc&flux=${flux}`))
    assert.equal(destinationSucces(lecture), '/dashboard', `flux « ${flux} » a détourné la session`)
  }
  // La casse et les espaces de bord, eux, ne changent rien : le module normalise
  // **tous** ses paramètres de la même façon (`type` compris), et un gabarit
  // d'email peut réécrire la valeur. Ce n'est pas une tolérance de plus, c'est
  // la même règle appliquée au même endroit.
  for (const flux of ['Recuperation', ' RECUPERATION ']) {
    assert.equal(
      destinationSucces(lireParametresConfirmation(new URLSearchParams(`code=abc&flux=${flux}`))),
      '/nouveau-mot-de-passe',
      `« ${flux} » est le même flux, mal écrit`
    )
  }
})

test('lien — `urlReinitialisation` porte le marqueur que le lecteur comprend', () => {
  const url = urlReinitialisation('https://fidelia.ma')
  assert.ok(url, 'une origine connue doit produire une URL')
  const lu = new URL(url)
  assert.equal(lu.pathname, '/auth/confirm')
  // Le marqueur n'est pas comparé à une constante importée mais relu **par le
  // module** : c'est l'aller-retour qui prouve le couplage, pas l'égalité.
  const marqueur = lu.searchParams.get('flux')
  assert.ok(marqueur, 'aucun marqueur de flux dans l’URL de retour')

  // GoTrue ajoute son `code` à cette URL sans effacer la requête existante.
  lu.searchParams.set('code', 'abc-123')
  const lecture = lireParametresConfirmation(lu.searchParams)
  assert.equal(lecture.sorte, 'code')
  assert.equal(destinationSucces(lecture), '/nouveau-mot-de-passe')

  // Sans origine, pas d'URL : l'appelant doit alors **omettre** l'option plutôt
  // que d'envoyer `null`, qui ferait échouer la demande pour une autre raison.
  assert.equal(urlReinitialisation(null), null)
  assert.equal(urlReinitialisation(''), null)
})


test('lecture — les paramètres d’erreur de GoTrue passent avant le code', () => {
  // GoTrue ajoute `error`/`error_code` à l'URL de redirection quand il refuse un
  // jeton. Un `code` résiduel ne doit pas faire croire à un lien valide.
  assert.deepEqual(
    lireParametresConfirmation(
      new URLSearchParams('error=access_denied&error_code=otp_expired&code=zzz')
    ),
    { sorte: 'echec', motif: 'expire' }
  )
  assert.deepEqual(
    lireParametresConfirmation(new URLSearchParams('error=access_denied')),
    { sorte: 'echec', motif: 'invalide' }
  )
})

test('lecture — une valeur vide ne compte pas pour un paramètre', () => {
  assert.deepEqual(lireParametresConfirmation(new URLSearchParams('code=&token_hash=')), {
    sorte: 'echec',
    motif: 'invalide',
  })
  // Un objet simple (au lieu de `URLSearchParams`) donne le même résultat.
  assert.deepEqual(lireParametresConfirmation({ code: 'abc' }), { sorte: 'code', code: 'abc' })
})


test('erreurs — les trois motifs mesurés sont distingués', () => {
  // Messages réels de Supabase / GoTrue, recopiés tels qu'ils se présentent.
  assert.equal(
    motifDepuisErreur({
      name: 'AuthPKCEGrantCodeExchangeError',
      message:
        'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.',
    }),
    'appareil'
  )
  assert.equal(
    motifDepuisErreur({
      message: 'invalid request: both auth code and code verifier should be non-empty',
    }),
    'appareil'
  )
  assert.equal(motifDepuisErreur({ message: 'Email link is invalid or has expired' }), 'expire')
  assert.equal(
    motifDepuisErreur({ message: 'invalid flow state, no valid flow state found' }),
    'expire'
  )
  assert.equal(motifDepuisErreur('Token has expired or is invalid'), 'expire')
  assert.equal(motifDepuisErreur({ error_code: 'otp_expired' }), 'expire')
  // « code verifier » gagne sur « invalid » : l'ordre des tests compte.
  assert.equal(
    motifDepuisErreur({ message: 'invalid: code verifier missing' }),
    'appareil',
    'un problème d’appareil ne doit pas être annoncé comme un lien mort'
  )
})

test('erreurs — une erreur muette ou illisible est « invalide », jamais autre chose', () => {
  for (const rien of [undefined, null, {}, { message: '' }, '   ']) {
    assert.equal(motifDepuisErreur(rien), 'invalide')
  }
  assert.equal(motifDepuisErreur({ message: 'boom' }), 'invalide')
})

test('?echec= — le producteur ne peut pas produire ce que l’affichage refuse', () => {
  // C'est le couplage qui manquait : la valeur est « mesurée » côté page depuis
  // R1, et n'était produite nulle part. Une valeur produite que `messageEchec`
  // ignore serait un bandeau muet — exactement le défaut qu'on vient fermer.
  for (const motif of ['expire', 'appareil', 'invalide']) {
    const url = destinationEchec(motif)
    assert.equal(url, `${CHEMIN_ECHEC}?echec=${motif}`)
    const valeur = new URL(url, 'https://exemple.ma').searchParams.get('echec')
    assert.equal(valeur, motif)
    assert.ok(messageEchec(valeur), `« ${motif} » est produit mais n’est pas affichable`)
  }
  // Et chaque clé existe vraiment dans les trois langues : un `?echec=` servirait
  // sinon du français sur `/ar`, ou lèverait au rendu.
  for (const locale of LOCALES) {
    for (const motif of ['expire', 'appareil', 'invalide']) {
      const cle = messageEchec(motif)
      assert.equal(typeof dictionnaire(locale)[cle], 'string', `${cle} manque en ${locale}`)
    }
  }
})

test('?echec= — un motif inconnu ne se recopie jamais dans l’URL', () => {
  for (const inconnu of [undefined, null, '', 'autre', '../../etc/passwd', '<script>']) {
    assert.equal(destinationEchec(inconnu), `${CHEMIN_ECHEC}?echec=invalide`)
  }
})

test('origine — `NEXT_PUBLIC_SITE_URL` l’emporte, et une valeur invalide lève', () => {
  assert.equal(
    origineDepuisEntetes(entetes({ host: 'interne:3000' }), { [NOM_ORIGINE]: 'https://fidelia.ma' }),
    'https://fidelia.ma'
  )
  // Un slash final ne doit pas produire `//auth/confirm`.
  assert.equal(
    origineDepuisEntetes(new Map(), { [NOM_ORIGINE]: 'https://fidelia.ma/' }),
    'https://fidelia.ma'
  )
  // Une faute de frappe dans la variable doit faire du bruit, pas expédier des
  // liens vers un hôte inexistant.
  for (const fautive of ['fidelia.ma', 'http://fidelia.ma', 'javascript:alert(1)']) {
    assert.throws(
      () => origineDepuisEntetes(new Map(), { [NOM_ORIGINE]: fautive }),
      `${fautive} doit être refusée`
    )
  }
})

test('origine — à défaut, les en-têtes décident (http en local, https ailleurs)', () => {
  // Développement : le serveur local n'est pas derrière un proxy.
  assert.equal(origineDepuisEntetes(entetes({ host: 'localhost:2087' }), {}), 'http://localhost:2087')
  assert.equal(origineDepuisEntetes(entetes({ host: '127.0.0.1:3000' }), {}), 'http://127.0.0.1:3000')
  // Production : `x-forwarded-*` fait foi sur `host`, qui est l'adresse interne.
  assert.equal(
    origineDepuisEntetes(
      entetes({
        'x-forwarded-host': 'app.fidelia.ma',
        'x-forwarded-proto': 'https',
        host: '10.0.0.4:3000',
      }),
      {}
    ),
    'https://app.fidelia.ma'
  )
  // Un en-tête qui liste plusieurs hôtes : le premier est celui du client.
  assert.equal(
    origineDepuisEntetes(entetes({ 'x-forwarded-host': 'app.fidelia.ma, relais.interne' }), {}),
    'https://app.fidelia.ma'
  )
})

test('origine — un hôte illisible ne produit pas d’origine (donc pas de lien mort)', () => {
  for (const rien of [new Map(), entetes({ host: '' }), entetes({ host: 'exem ple.ma' })]) {
    assert.equal(origineDepuisEntetes(rien, {}), null)
  }
  // `http` sur un hôte non local est refusé : on n'envoie pas de lien en clair.
  assert.equal(
    origineDepuisEntetes(entetes({ 'x-forwarded-proto': 'http', host: 'app.fidelia.ma' }), {}),
    null
  )
})

test('lien — `urlConfirmation` est absolu et ne double jamais le slash', () => {
  assert.equal(urlConfirmation('https://fidelia.ma'), `https://fidelia.ma${CHEMIN_CONFIRMATION}`)
  assert.equal(urlConfirmation('https://fidelia.ma///'), `https://fidelia.ma${CHEMIN_CONFIRMATION}`)
  assert.equal(urlConfirmation(null), null)
  assert.equal(urlConfirmation(''), null)
  // La route cible existe sur le disque : le lien ne peut pas être orphelin.
  assert.doesNotThrow(() => lire(...ROUTE))
})

test('source — l’inscription envoie enfin une URL absolue vers la route livrée', () => {
  const action = lire(...ACTION)

  assert.match(action, /emailRedirectTo: urlConfirmation\(origine\)/)
  // L'origine vient d'une fonction, jamais d'un domaine recopié : le domaine du
  // clone est encore provisoire (dette nommée), et un lien figé en dur
  // continuerait de pointer vers l'ancien après l'arbitrage.
  assert.doesNotMatch(action, /fidelia\.ma|fidelix\.ma/)
  // Sans origine, l'option est **omise** : Supabase retombe sur l'URL de site,
  // ce qui donne un lien valide. Un `emailRedirectTo: null` ferait échouer
  // `signUp` pour une raison qui n'a rien à voir avec la demande.
  assert.match(action, /origine === null/)
  assert.match(action, /\? \{ data: metadonnees \}/)
})

test('source — la route vérifie les deux formes et redirige hors du `try`', () => {
  const route = lire(...ROUTE)

  // Les deux formes de lien, sans quoi l'un des deux gabarits d'email casse.
  assert.match(route, /exchangeCodeForSession\(lecture\.code\)/)
  assert.match(route, /verifyOtp\(/)
  assert.match(route, /token_hash: lecture\.tokenHash/)

  // Un lien à usage unique ne peut pas être servi deux fois depuis un cache.
  assert.match(route, /export const dynamic = 'force-dynamic'/)

  // `redirect()` lève : l'appeler dans le `try` ferait passer un succès pour un
  // échec silencieux. Les deux redirections sont après le `catch`.
  const finCatch = route.indexOf('} catch (levee)')
  assert.ok(finCatch > 0, 'le `catch` de la vérification doit exister')
  const apresCatch = route.slice(finCatch)
  assert.ok(apresCatch.includes('if (erreur) redirect(destinationEchec('))
  // La destination de succès n'est plus écrite ici : elle dépend du flux lu dans
  // l'URL. `redirect(DESTINATION_SUCCES)` marcherait pour une inscription et
  // déposerait une récupération sur le tableau de bord, mot de passe inchangé.
  assert.ok(apresCatch.includes('redirect(destinationSucces(lecture))'))
  assert.doesNotMatch(route, /redirect\(DESTINATION_SUCCES\)/)

  // Aucune URL d'échec recopiée ici : la forme vient du module testé plus haut.
  assert.doesNotMatch(route, /'\/forgot-password/)
  assert.doesNotMatch(route, /'\/dashboard'/)
  assert.equal(DESTINATION_SUCCES, '/dashboard')
  assert.equal(CHEMIN_CONFIRMATION, '/auth/confirm')
})

