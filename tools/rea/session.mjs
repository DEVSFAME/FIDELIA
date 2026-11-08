/* ============================================================================
   REA Fidelix — résolution de session, en UN seul endroit.

   Pourquoi ce fichier existe (mesuré le 2026-10-26, après échec du préflight) :
   `ouvrir-session.mjs` (voie 1) persiste la session dans un profil Chromium
   (`FIDELIX/.profil-rea/`, gitignoré) — mais `capturer-fidelix.mjs`, qui produit
   les EMPREINTES, ne savait lire que `FIDELIX_COOKIE` dans `.env`. Résultat :
   une connexion humaine réussie laissait quand même la passe authentifiée
   « ANONYME », donc refusée par le garde `modeAttendu`. Le pont manquait.

   Ici, une seule règle de priorité, explicite et journalisée :
     1. `--profil <dir>`  — profil désigné à la main (tous ses cookies fidelix.ma)
     2. `FIDELIX_COOKIE`  — en-tête Cookie fourni dans `FIDELIX/.env`
     3. `.profil-rea/`    — profil par défaut, MAIS seulement si un cookie
                            d'authentification y est présent
     4. sinon             — anonyme, et on le dit

   Aucun secret n'est affiché : on ne rend que des longueurs et des NOMS de
   cookies `sb-*` (qui identifient le projet Supabase, pas la personne).
   ========================================================================== */

import { existsSync } from 'node:fs'

export const BASE = 'https://fidelix.ma'

/** Cookies Supabase : `sb-<ref>-auth-token`, éventuellement découpé `.0`, `.1`. */
export function estCookieAuth(nom) {
  return /^sb-[a-z0-9]+-auth-token(\.\d+)?$/i.test(nom)
}

/** « a=1; b=2 » → [{ name, value, domain, path }] pour fidelix.ma. */
export function cookiesDepuisEnTete(entete, domaine = 'fidelix.ma') {
  return String(entete || '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=')
      return i < 0 ? null : { name: p.slice(0, i).trim(), value: p.slice(i + 1), domain: domaine, path: '/' }
    })
    .filter(Boolean)
}

/** [{ name, value }] → « a=1; b=2 » (l'en-tête attendu par `fetch`). */
export function enteteDepuisCookies(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/**
 * Lit les cookies RÉELLEMENT déposés dans un profil persistant.
 * Chromium les chiffre (Keychain macOS) : on ne les déchiffre pas à la main,
 * on demande au navigateur lui-même — donc Playwright, chargé à la demande.
 */
export async function sessionDepuisProfil(profil) {
  if (!existsSync(profil)) {
    return { erreur: 'profil introuvable', cookies: [], entete: '', auth: false }
  }
  let contexte
  try {
    const { chromium } = await import('playwright')
    contexte = await chromium.launchPersistentContext(profil, { headless: true })
    const tous = await contexte.cookies(BASE)
    const propres = tous.filter((c) => (c.domain || '').replace(/^\./, '').endsWith('fidelix.ma'))
    return {
      cookies: propres,
      entete: enteteDepuisCookies(propres),
      auth: propres.some((c) => estCookieAuth(c.name)),
    }
  } catch (e) {
    // Profil déjà ouvert ailleurs (fenêtre interactive) : cas fréquent, pas une panne.
    const msg = String(e.message || e).split('\n')[0]
    return { erreur: msg, cookies: [], entete: '', auth: false }
  } finally {
    if (contexte) await contexte.close().catch(() => {})
  }
}

/** Résout la session selon la priorité documentée en tête de fichier. */
export async function resoudreSession({ env = {}, profil = null, profilDefaut = null } = {}) {
  if (profil) {
    const r = await sessionDepuisProfil(profil)
    if (r.erreur) {
      return { cookie: null, source: `profil ${profil} — illisible (${r.erreur})`, profil, auth: false }
    }
    return {
      cookie: r.entete || null,
      source: `profil ${profil} (${r.cookies.length} cookie(s) fidelix.ma, auth ${r.auth ? 'présente' : 'ABSENTE'})`,
      profil,
      auth: r.auth,
    }
  }

  if (env.FIDELIX_COOKIE) {
    return { cookie: env.FIDELIX_COOKIE, source: 'FIDELIX/.env — FIDELIX_COOKIE', auth: true }
  }

  if (profilDefaut && existsSync(profilDefaut)) {
    const r = await sessionDepuisProfil(profilDefaut)
    const detail = r.erreur ? ` (${r.erreur})` : ''
    if (!r.erreur && r.auth) {
      return {
        cookie: r.entete,
        source: `profil par défaut ${profilDefaut} (${r.cookies.length} cookie(s), auth présente)`,
        profil: profilDefaut,
        auth: true,
      }
    }
    // Des cookies sans jeton d'auth (ex. `lswt-*`) ne font PAS une session :
    // les injecter laisserait croire à un mode authentifié qui n'existe pas.
    return {
      cookie: null,
      source: `profil par défaut ${profilDefaut} — aucun cookie d'auth${detail}`,
      profil: profilDefaut,
      auth: false,
    }
  }

  return { cookie: null, source: 'aucune source de session (anonyme)', auth: false }
}

/* ---------------------------------------------------------------------------
   La sonde de session — MESURÉE le 2026-10-26 (23:57), pas déduite.

   Deux passes sur la production, mêmes en-têtes, deux états réels :

     cible         anonyme         authentifié
     /dashboard    307 -> /login   200
     /api/me       401             404
     /admin        307 -> /login   307 -> /dashboard   (module refusé : rôle)
     /login        200             307 -> /dashboard

   Conséquence, et c'est la leçon : `/api/me` ne renvoie JAMAIS 200. Il servait
   pourtant de garde « la session est-elle vivante ? » dans le préflight, dans le
   garde n°3 de la capture et dans `ouvrir-session.mjs`. Un cookie d'auth valide
   (mesuré : 2 cookies `sb-*-auth-token.*`, expiration 2027) donnait donc
   `session ABSENTE`, la passe authentifiée était refusée, et la fenêtre
   interactive ne se fermait jamais — elle attendait un 200 impossible.

   La seule sonde valide est `/dashboard` : 200 = session ouverte,
   307 -> /login = session absente.
--------------------------------------------------------------------------- */

/** Cible unique de la mesure de session. */
export const SONDE_SESSION = '/dashboard'

/** Statuts qui déplacent réellement la navigation. */
const REDIRECTIONS = [301, 302, 303, 307, 308]

/** Vrai si un relevé `{ http, location }` désigne la page de connexion. */
export function versLogin({ http, location }) {
  return REDIRECTIONS.includes(http) && /\/login(?:[?#]|$)/.test(String(location || ''))
}

/** Vrai si la session est OUVERTE : `/dashboard` répond 200 sans renvoi. */
export function sessionVivante(releve) {
  return releve.http === 200 && !releve.location
}

/**
 * Route réellement servie quand une redirection mène à une AUTRE route que
 * celle demandée — ex. `/admin` -> `/dashboard` (module refusé faute de rôle).
 * Renvoie `null` si la cible est servie telle quelle (ou simple variante `/`).
 *
 * Sans ce contrôle, `/admin` serait archivé sous le nom `/admin` avec le HTML
 * du dashboard : une preuve fausse, exactement ce que le projet interdit.
 */
export function routeDerivee({ http, location }, chemin) {
  if (!REDIRECTIONS.includes(http) || !location) return null
  const nu = (p) => '/' + String(p).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
  return nu(location) === nu(chemin) ? null : String(location)
}

