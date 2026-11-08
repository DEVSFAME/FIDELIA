/* ============================================================================
   Routage des locales — logique pure, testable sans Next.

   Forme mesurée sur la cible : la locale par défaut (`fr`) n'a **pas** de
   préfixe (`/`, `/login`, `/dashboard`), les deux autres en ont un
   (`/en`, `/en/login`, `/ar/...`). Ce n'est pas un choix esthétique : c'est ce
   que `sitemap.xml` et les captures montrent.

   Le piège que ces fonctions évitent : `/arbres` n'est pas `/ar` + `bres`.
   Un préfixe ne compte que s'il est un **segment entier**.
   ========================================================================== */

import { LOCALE_PAR_DEFAUT, PREFIXES_RETIRES, estLocale } from './locales.mjs'

/** Réduit un chemin à sa forme canonique : commence par `/`, sans `//` final. */
export function normaliserChemin(chemin) {
  const brut = typeof chemin === 'string' && chemin.length > 0 ? chemin : '/'
  const avecSlash = brut.startsWith('/') ? brut : `/${brut}`
  return avecSlash.length > 1 ? avecSlash.replace(/\/+$/, '') : '/'
}

/**
 * Sépare la locale du reste du chemin.
 * @param {string} chemin
 * @returns {{locale: string, reste: string, prefixe: boolean}}
 *   `prefixe` dit si la locale était explicite dans l'URL.
 */
export function decouperChemin(chemin) {
  const normal = normaliserChemin(chemin)
  const [, premier = '', ...queue] = normal.split('/')
  if (estLocale(premier)) {
    const reste = `/${queue.join('/')}`
    return { locale: premier, reste: reste === '/' ? '/' : normaliserChemin(reste), prefixe: true }
  }
  return { locale: LOCALE_PAR_DEFAUT, reste: normal, prefixe: false }
}

/** Construit le chemin d'une locale (sans préfixe pour la locale par défaut). */
export function cheminLocalise(chemin, locale) {
  const sur = estLocale(locale) ? locale : LOCALE_PAR_DEFAUT
  const { reste } = decouperChemin(chemin)
  const corps = sur === LOCALE_PAR_DEFAUT ? reste : `/${sur}${reste === '/' ? '' : reste}`
  return corps === '' ? '/' : corps
}

/**
 * Choisit une locale depuis un en-tête `Accept-Language`.
 * Volontairement simple : `fr-CH;q=0.9` → `fr`, `de` → défaut. On ne devine
 * pas `ar` derrière `ar-MA` par hasard : c'est le sous-étiquette primaire.
 */
export function negocierLocale(entete, defaut = LOCALE_PAR_DEFAUT) {
  if (typeof entete !== 'string' || entete.trim() === '') return defaut
  const langues = entete
    .split(',')
    .map((morceau) => {
      const [etiquette, ...parametres] = morceau.trim().split(';')
      const q = parametres.find((p) => p.trim().startsWith('q='))
      const qualite = q ? Number.parseFloat(q.split('=')[1]) : 1
      return { primaire: etiquette.trim().toLowerCase().split('-')[0], qualite }
    })
    .filter((l) => l.primaire && Number.isFinite(l.qualite) && l.qualite > 0)
    .sort((a, b) => b.qualite - a.qualite)
  for (const { primaire } of langues) {
    if (estLocale(primaire)) return primaire
  }
  return defaut
}


/**
 * Redirige vers la forme canonique d'une URL de locale :
 *   - `/fr/...` -> `/...`  (la locale par défaut ne porte pas de préfixe) ;
 *   - `/en/...`, `/ar/...` -> `/...`  (locales retirées, cf. `PREFIXES_RETIRES`).
 *
 * Sans la seconde règle, un favori `/en/caisse` tomberait en 404 alors que la
 * page existe en français : l'utilisateur conclurait à une panne, pas à un
 * changement de périmètre.
 *
 * Rend `null` quand il n'y a rien à rediriger — c'est le cas majoritaire.
 * @param {string} chemin
 * @returns {string|null}
 */
export function redirectionLocale(chemin) {
  const normal = normaliserChemin(chemin)
  const segments = normal.split('/').filter(Boolean)
  const premier = segments[0]
  if (premier !== LOCALE_PAR_DEFAUT && !PREFIXES_RETIRES.includes(premier)) return null
  const reste = segments.slice(1).join('/')
  return reste === '' ? '/' : `/${reste}`
}
