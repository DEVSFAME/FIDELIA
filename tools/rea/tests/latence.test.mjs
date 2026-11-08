/* ============================================================================
   `lib/cache.mjs` — la mémoire courte qui évite un aller-retour Supabase, et
   `(dashboard)/loading.jsx` — la frontière qui rend l'attente visible.

   Aucun réseau, aucun Next : on teste l'**horloge** (injectée), la règle
   d'invalidation, et le fait que le squelette existe là où Next le cherche.

   Ce qui est en jeu, chiffres du 2026-11-01 : un aller-retour Supabase coûte
   0,55 à 0,81 s, le rendu serveur 9 à 78 ms. Une page sans frontière de
   chargement passe donc 0,7 s à ne **rien** montrer — et une mémoire courte
   mal invalidée ferait afficher un barème périmé au moment où il compte.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TTL_PAR_DEFAUT, cacheCourt } from '../../../web/src/lib/cache.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

/** Horloge pilotée : le test décide quand le temps passe. */
function horloge(depart = 1_000_000) {
  let t = depart
  return { maintenant: () => t, avancer: (ms) => (t += ms) }
}

test('cache — une valeur écrite est relue, et seulement avant l’échéance', () => {
  const h = horloge()
  const cache = cacheCourt({ ttlMs: 10_000, maintenant: h.maintenant })

  assert.equal(cache.lire(), undefined, 'un cache neuf ne rend rien')

  cache.ecrire({ etat: 'ok' })
  assert.deepEqual(cache.lire(), { etat: 'ok' })

  h.avancer(9_999)
  assert.deepEqual(cache.lire(), { etat: 'ok' }, 'à 9,999 s, la valeur est encore valide')

  h.avancer(1)
  assert.equal(cache.lire(), undefined, 'à l’échéance exacte, elle ne l’est plus')
})

test('cache — `undefined` et `null` ne se confondent pas', () => {
  // `null` est une valeur légitime (un programme absent). La confondre avec
  // « rien en cache » ferait relire la base à chaque navigation d'un commerce
  // qui n'a pas encore créé son programme.
  const h = horloge()
  const cache = cacheCourt({ maintenant: h.maintenant })

  cache.ecrire(null)
  assert.equal(cache.lire(), null, '`null` mémorisé doit ressortir tel quel')

  cache.ecrire(0)
  assert.equal(cache.lire(), 0, '`0` est une valeur, pas une absence')
})

test('cache — `oublier` invalide immédiatement', () => {
  const h = horloge()
  const cache = cacheCourt({ ttlMs: 60_000, maintenant: h.maintenant })
  cache.ecrire('valeur')
  cache.oublier()
  assert.equal(cache.lire(), undefined, 'une écriture doit être vue sans attendre le TTL')
})

test('cache — un TTL absurde est refusé, pas corrigé en silence', () => {
  for (const mauvais of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    assert.throws(() => cacheCourt({ ttlMs: mauvais }), RangeError, `ttlMs=${String(mauvais)}`)
  }
  assert.equal(cacheCourt().ttlMs, TTL_PAR_DEFAUT)
})

test('cache — l’âge rend `null` dès l’expiration, jamais un négatif', () => {
  const h = horloge()
  const cache = cacheCourt({ ttlMs: 1_000, maintenant: h.maintenant })
  assert.equal(cache.age(), null, 'sans entrée, pas d’âge')
  cache.ecrire('x')
  assert.equal(cache.age(), 0)
  h.avancer(400)
  assert.equal(cache.age(), 400)
  h.avancer(600)
  assert.equal(cache.age(), null, 'expiré : plus d’âge, pas `-100`')

test('chargement — la frontière existe là où Next la cherche, et ne ment pas', () => {
  const source = lire('web', 'src', 'app', '(dashboard)', 'loading.jsx')
  // Le **code**, pas l'en-tête : le commentaire du fichier cite
  // `role="status"` et `aria-busy` pour expliquer le choix.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ')

  // Le fichier doit être dans le **groupe**, pas dans un segment : c'est la même
  // leçon que la garde d'authentification (§35.1). Un `loading.jsx` posé dans
  // `dashboard/` ne couvrirait qu'un écran sur dix.
  assert.match(code, /export default async function/, 'le squelette lit la locale : il doit être async')

  // Un squelette qui ne s'annonce pas est un écran mort pour un lecteur
  // d'écran : rien ne bouge, et aucune annonce ne dit pourquoi.
  assert.match(code, /role="status"/)
  assert.match(code, /aria-busy="true"/)
  assert.match(code, /aria-hidden="true"/, 'les blocs décoratifs doivent être ignorés')

  // Le texte vient du dictionnaire : un « Loading… » figé serait faux en FR.
  assert.match(code, /t\('tableau\.chargement'\)/)
})

test('chargement — la même frontière couvre les dix écrans du groupe', () => {
  // Le groupe est le seul endroit qui garantit la couverture. On vérifie qu'il
  // n'existe **pas** de `loading.jsx` de segment, qui aurait l'air de couvrir
  // et ne couvrirait qu'un écran — et que le groupe, lui, en a un.
  const groupe = join(RACINE, 'web', 'src', 'app', '(dashboard)')
  assert.ok(existsSync(join(groupe, 'loading.jsx')), 'le groupe n’a pas de frontière de chargement')

  const segments = readdirSync(groupe, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((nom) => existsSync(join(groupe, nom, 'loading.jsx')))
  assert.deepEqual(segments, [], 'une frontière de segment réapparaît : elle ne couvre qu’un écran')
})

test('latence — le programme n’est pas lu deux fois de suite par la même page', () => {
  const donnees = lire('web', 'src', 'lib', 'donnees.mjs')

  // La mémoire est posée sur la lecture d'affichage…
  assert.match(donnees, /export async function programmeDuCommerce\(\{ frais = false \} = \{\}\)/)
  assert.match(donnees, /const memo = cacheProgramme\.lire\(\)/)
  assert.match(donnees, /if \(memo !== undefined\) return memo/)

  // …jamais sur une panne : un `indisponible` mémorisé dix secondes deviendrait
  // un écran bloqué qui se croit à jour.
  assert.match(
    donnees,
    /resultat\.etat === 'ok' \|\| resultat\.etat === 'absent' \|\| resultat\.etat === 'nonMigre'/,
    'les états instables entrent dans la mémoire courte'
  )
  assert.equal(
    /cacheProgramme\.ecrire\(r\)/.test(donnees),
    false,
    'la valeur non filtrée est mémorisée : `indisponible` y compris'
  )

  // L'écriture invalide. C'est le seul écrivain du programme dans ce socle.
  assert.match(donnees, /if \(resultat\.etat === 'ok'\) cacheProgramme\.oublier\(\)/)
})

test('latence — les écrans d’affichage ne paient qu’un aller-retour', () => {
  // `/scan` enchaînait `carteParToken` puis `programmeDuCommerce` : deux RPC
  // indépendantes, donc 0,7 s de trop à chaque code saisi.
  const scan = lire('web', 'src', 'app', '(dashboard)', 'scan', 'page.jsx')
  assert.match(scan, /await Promise\.all\(\[/, '/scan enchaîne encore ses deux lectures')
  assert.match(scan, /carteParToken\(jeton\)/)
  assert.match(scan, /programmeDuCommerce\(\)/)

  // Les pages d'affichage **n'exigent pas** la fraîcheur : c'est tout l'intérêt.
  for (const page of ['scan', 'rewards', 'qrcode', 'caisse']) {
    const source = lire('web', 'src', 'app', '(dashboard)', page, 'page.jsx')
    assert.equal(
      /programmeDuCommerce\(\{ frais: true \}\)/.test(source),
      false,
      `/${page} contourne la mémoire courte alors qu’il n’écrit pas`
    )
  }
})

})
