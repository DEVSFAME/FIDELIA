import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cookiesDepuisEnTete,
  enteteDepuisCookies,
  estCookieAuth,
  resoudreSession,
  routeDerivee,
  sessionDepuisProfil,
  sessionVivante,
  SONDE_SESSION,
  versLogin,
} from '../session.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const PROFIL_DEFAUT = resolve(ICI, '..', '..', '..', '.profil-rea')

/* ---------------------------------------------------------------------------
   1. Reconnaissance du cookie d'authentification Supabase.
   Un cookie `sb-*` qui n'est PAS un jeton de session (ex. code-verifier) ne
   doit pas faire croire à une session : c'est le cœur du garde anti-fausse-preuve.
   ------------------------------------------------------------------------ */

test('estCookieAuth : reconnaît le jeton, y compris découpé', () => {
  assert.equal(estCookieAuth('sb-abcdefghij-auth-token'), true)
  assert.equal(estCookieAuth('sb-abcdefghij-auth-token.0'), true)
  assert.equal(estCookieAuth('sb-abcdefghij-auth-token.12'), true)
})

test('estCookieAuth : refuse ce qui n’est pas un jeton de session', () => {
  assert.equal(estCookieAuth('lswt-0.80935134583044870'), false)
  assert.equal(estCookieAuth('sb-abcdefghij-auth-token-code-verifier'), false)
  assert.equal(estCookieAuth('_ga'), false)
  assert.equal(estCookieAuth(''), false)
})

/* ---------------------------------------------------------------------------
   2. Aller-retour en-tête ⇄ cookies (une seule implémentation, partagée).
   ------------------------------------------------------------------------ */

test('cookiesDepuisEnTete : découpe, trim, ignore les fragments vides', () => {
  const c = cookiesDepuisEnTete(' a=1;  b=2 ;; c=3 ')
  assert.deepEqual(
    c.map((x) => [x.name, x.value]),
    [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]
  )
  assert.equal(c[0].domain, 'fidelix.ma')
  assert.equal(c[0].path, '/')
})

test('cookiesDepuisEnTete : ignore un fragment sans « = »', () => {
  assert.deepEqual(cookiesDepuisEnTete('orphelin; a=1').map((x) => x.name), ['a'])
})

test('enteteDepuisCookies : reconstruit un en-tête valide', () => {
  assert.equal(
    enteteDepuisCookies([{ name: 'a', value: '1' }, { name: 'b', value: 'x=y' }]),
    'a=1; b=x=y'
  )
})

test('aller-retour : entete → cookies → entete est stable', () => {
  const entete = 'sb-rea-auth-token=abc.def; autre=2'
  assert.equal(enteteDepuisCookies(cookiesDepuisEnTete(entete)), entete)
})

/* ---------------------------------------------------------------------------
   3. Priorité de résolution — la règle annoncée doit être la règle appliquée.
   ------------------------------------------------------------------------ */

test('resoudreSession : sans rien → anonyme, et elle le dit', async () => {
  const s = await resoudreSession({ env: {} })
  assert.equal(s.cookie, null)
  assert.equal(s.auth, false)
  assert.match(s.source, /anonyme/)
})

test('resoudreSession : FIDELIX_COOKIE a priorité sur le profil par défaut', async () => {
  const s = await resoudreSession({
    env: { FIDELIX_COOKIE: 'sb-rea-auth-token=faux' },
    profilDefaut: '/chemin/inexistant',
  })
  assert.equal(s.cookie, 'sb-rea-auth-token=faux')
  assert.match(s.source, /\.env/)
})

test('resoudreSession : profil explicite introuvable → refus explicite, pas de silence', async () => {
  const s = await resoudreSession({ env: {}, profil: '/chemin/inexistant' })
  assert.equal(s.cookie, null)
  assert.equal(s.auth, false)
  assert.match(s.source, /illisible|introuvable/)
})

test('resoudreSession : profil par défaut ABSENT → anonyme sans erreur', async () => {
  const s = await resoudreSession({ env: {}, profilDefaut: '/chemin/inexistant' })
  assert.equal(s.cookie, null)
})

/* ---------------------------------------------------------------------------
   5. La sonde de session — la table MESURÉE le 2026-10-26 devient un test.
   Ce bloc existe parce que `/api/me` a servi de garde alors qu'il ne renvoie
   jamais 200 : une session valide était déclarée « ABSENTE ». Ces tests figent
   la table pour que la régression ne puisse pas revenir en silence.
   ------------------------------------------------------------------------ */

test('SONDE_SESSION : la sonde est /dashboard, pas /api/me', () => {
  assert.equal(SONDE_SESSION, '/dashboard')
})

test('sessionVivante : 200 sans redirection = session ouverte', () => {
  assert.equal(sessionVivante({ http: 200, location: null }), true)
})

test('sessionVivante : une redirection n’est jamais une session ouverte', () => {
  assert.equal(sessionVivante({ http: 307, location: '/login' }), false)
  assert.equal(sessionVivante({ http: 200, location: '/login' }), false)
})

test('sessionVivante : 404 sur /api/me n’est PAS une session (mesure réelle)', () => {
  // Mesuré en authentifié : /api/me -> 404. C'était pourtant le garde.
  assert.equal(sessionVivante({ http: 404, location: null }), false)
  assert.equal(sessionVivante({ http: 401, location: null }), false)
})

test('versLogin : reconnaît 307 et 302 vers /login', () => {
  assert.equal(versLogin({ http: 307, location: '/login' }), true)
  assert.equal(versLogin({ http: 302, location: 'https://fidelix.ma/login?next=%2Fdashboard' }), true)
  assert.equal(versLogin({ http: 307, location: '/dashboard' }), false)
  assert.equal(versLogin({ http: 200, location: null }), false)
})

test('routeDerivee : /admin -> /dashboard est une dérive (rôle refusé)', () => {
  assert.equal(routeDerivee({ http: 307, location: '/dashboard' }, '/admin'), '/dashboard')
})

test('routeDerivee : /login -> /dashboard est une dérive (déjà connecté)', () => {
  assert.equal(routeDerivee({ http: 307, location: '/dashboard' }, '/login'), '/dashboard')
})

test('routeDerivee : servir la cible demandée n’est pas une dérive', () => {
  assert.equal(routeDerivee({ http: 200, location: null }, '/dashboard'), null)
  // Variante de barre finale : même route, pas une dérive.
  assert.equal(routeDerivee({ http: 308, location: '/dashboard/' }, '/dashboard'), null)
  // Redirection absolue vers la MÊME route : pas une dérive.
  assert.equal(routeDerivee({ http: 307, location: 'https://fidelix.ma/admin' }, '/admin'), null)
})

test('routeDerivee : une autre route est bien signalée (→ /login comprise)', () => {
  assert.equal(routeDerivee({ http: 307, location: '/login' }, '/admin'), '/login')
})

/* ---------------------------------------------------------------------------
   6. Garde de non-régression textuelle : plus aucun outil ne parie sur /api/me.
   ------------------------------------------------------------------------ */

test('aucun outil ne traite /api/me comme une sonde de session', async () => {
  const dossier = resolve(ICI, '..')
  for (const fichier of ['capturer-fidelix.mjs', 'ouvrir-session.mjs']) {
    const src = await readFile(join(dossier, fichier), 'utf8')
    assert.ok(
      !/tirer\('\/api\/me'[\s\S]{0,200}=== 200/.test(src),
      `${fichier} utilise encore /api/me comme si 200 était possible`
    )
    assert.ok(
      !/etatSession[\s\S]{0,80}\/api\/me/.test(src),
      `${fichier} mesure encore la session sur /api/me`
    )
  }
})

test('entetes() envoie le cookie reçu, pas seulement celui du .env', async () => {
  // Bug mesuré le 2026-10-26 : `entetes(env, cookie)` ignorait son 2e argument.
  // Le cookie du profil n'était donc jamais envoyé → 307 sur toutes les pages
  // privées alors que « auth présente » était affiché. Un test textuel est le
  // seul moyen ici : ce module s'exécute à l'import, il n'est pas importable.
  const src = await readFile(resolve(ICI, '..', 'capturer-fidelix.mjs'), 'utf8')
  const fn = src.match(/function entetes\([^)]*\)[\s\S]*?\n}/)
  assert.ok(fn, 'entetes() introuvable dans capturer-fidelix.mjs')
  assert.match(fn[0], /cookie = null/, 'le 2e paramètre doit être déclaré')
  assert.match(fn[0], /cookie \|\| env\.FIDELIX_COOKIE/, 'le cookie reçu doit être utilisé')
})

/* ---------------------------------------------------------------------------
   4. Intégration : le profil réel du dépôt. Ce test CONSTATE, il n'exige rien
   — le jour où la session existe, il passera à « auth présente » sans être
   modifié, et c'est précisément ce qu'on veut mesurer.
   ------------------------------------------------------------------------ */

test('sessionDepuisProfil : le .profil-rea du dépôt est lisible et cohérent', async (t) => {
  if (!existsSync(PROFIL_DEFAUT)) {
    t.skip(`pas de profil à ${PROFIL_DEFAUT}`)
    return
  }
  const r = await sessionDepuisProfil(PROFIL_DEFAUT)
  assert.equal(r.erreur, undefined, `profil illisible : ${r.erreur}`)
  assert.ok(Array.isArray(r.cookies))
  // Aucun cookie ne doit être un jeton d'auth tant que la connexion n'a pas eu lieu.
  const jetons = r.cookies.filter((c) => estCookieAuth(c.name))
  if (jetons.length === 0) assert.equal(r.auth, false)
  else assert.equal(r.auth, true)
  // Le nom du cookie est une information de projet, pas une personne : on peut l'afficher.
  console.log(`  profil : ${r.cookies.length} cookie(s), auth=${r.auth}${jetons.length ? ' [' + jetons.map((c) => c.name).join(', ') + ']' : ''}`)
})
