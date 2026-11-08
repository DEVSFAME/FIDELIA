/* ============================================================================
   URL Configuration Supabase — juger `site_url` et `uri_allow_list` hors ligne.

   Ces deux valeurs ne sont **pas** en base et `/auth/v1/settings` ne les publie
   pas (mesuré le 2026-11-09 : huit clés, ni l'une ni l'autre) : seule l'API
   Management les rend. Une fois recopiées, il reste à dire si elles acceptent
   les URL que le code construit — c'est ce que fait ce module, sans réseau.

   Les URL exigées ne sont jamais recopiées ici : elles sortent de
   `urlConfirmation` / `urlReinitialisation`, donc du code qui les envoie.
   ========================================================================== */

import { validerUrl, ErreurConfiguration } from '../../web/src/lib/supabase/config.mjs'
import { NOM_ORIGINE, urlConfirmation, urlReinitialisation } from '../../web/src/lib/confirmation.mjs'

/** Trois verdicts par URL : prouvé, plausible, refusé. Aucun quatrième. */
export const NIVEAUX = Object.freeze(['certaine', 'probable', 'absente'])

/** Caractères à neutraliser avant de composer une expression régulière. */
const SPECIAUX = '\\^$.|?+()[]{}'

/**
 * Découpe `uri_allow_list` en motifs.
 * La Management API rend une chaîne séparée par des virgules, mais un tableau
 * est toléré : la forme n'est pas garantie, le contenu l'est.
 */
export function decouperListe(valeur) {
  const brut = Array.isArray(valeur) ? valeur : typeof valeur === 'string' ? valeur.split(',') : []
  const vus = new Set()
  for (const morceau of brut) {
    const motif = String(morceau ?? '').trim()
    if (motif !== '') vus.add(motif)
  }
  return [...vus]
}

/**
 * Traduit un motif GoTrue en expression régulière ancrée.
 *
 * `traversant` fixe le sens de `*` : GoTrue s'appuie sur `gobwas/glob` **sans
 * séparateur**, où `*` traverse `/`. Le mode strict (`[^/]*`) sert de seconde
 * lecture : un motif qui n'accepte qu'ainsi n'est pas prouvé, il est plausible.
 */
export function motifVersRegex(motif, { traversant = true } = {}) {
  let source = ''
  for (let i = 0; i < motif.length; i += 1) {
    const c = motif[i]
    if (c === '*') {
      if (motif[i + 1] === '*') {
        source += '.*'
        i += 1
      } else {
        source += traversant ? '.*' : '[^/]*'
      }
    } else if (SPECIAUX.includes(c)) {
      source += `\\${c}`
    } else {
      source += c
    }
  }
  return new RegExp(`^${source}$`)
}

/** Vrai si `motif` accepte `url` avec `*` traversant `/` (sémantique GoTrue). */
export function correspondLiberal(motif, url) {
  try {
    return motifVersRegex(motif).test(url)
  } catch {
    return false
  }
}

/** Vrai si `motif` accepte `url` même en interdisant à `*` de traverser `/`. */
export function correspondStrict(motif, url) {
  try {
    return motifVersRegex(motif, { traversant: false }).test(url)
  } catch {
    return false
  }
}

/**
 * Meilleur verdict de la liste pour une URL : `certaine` si un motif l'accepte
 * sous les deux lectures, `probable` si un seul (la libérale), `absente` sinon.
 */
export function accepter(liste, url) {
  const liberaux = liste.filter((motif) => correspondLiberal(motif, url))
  const certains = liberaux.filter((motif) => correspondStrict(motif, url))
  if (certains.length > 0) return { niveau: 'certaine', motifs: certains }
  if (liberaux.length > 0) return { niveau: 'probable', motifs: liberaux }
  return { niveau: 'absente', motifs: [] }
}

/** Les URL que le code envoie réellement, dérivées de l'origine de déploiement. */
export function urlsRequises(origine) {
  return [urlConfirmation(origine), urlReinitialisation(origine)].filter((u) => typeof u === 'string')
}

/** Chemin de confirmation, pour illustrer la concaténation des gabarits. */
function cheminConfirmation() {
  const exemple = urlConfirmation('https://exemple.invalid')
  return exemple === null ? '/auth/confirm' : exemple.replace('https://exemple.invalid', '')
}


/**
 * Juge `site_url` contre l'origine que l'application utilise.
 *
 * Deux fautes sont bloquantes parce qu'elles cassent un lien sans message :
 * un hôte différent (le repli part ailleurs) et une barre finale (les gabarits
 * concatènent `{{ .SiteURL }}/auth/confirm`, ce qui donnerait `//auth/confirm`).
 * Un chemin, lui, n'est qu'un avertissement : le repli est déjà sans issue.
 */
export function auditerSiteUrl(siteUrl, origine) {
  const echecs = []
  const avertissements = []
  const brut = typeof siteUrl === 'string' ? siteUrl.trim() : ''

  if (brut === '') {
    echecs.push('site_url absente : GoTrue retombe sur une valeur par défaut non maîtrisée')
    return { valeur: null, echecs, avertissements }
  }

  let lue
  try {
    lue = validerUrl(brut, 'site_url')
  } catch (erreur) {
    const raison = erreur instanceof ErreurConfiguration ? erreur.message : 'illisible'
    echecs.push(`site_url refusée — ${raison}`)
    return { valeur: null, echecs, avertissements }
  }

  if (lue !== origine) {
    echecs.push(`site_url (${lue}) ≠ origine de l'application (${origine}) : le repli enverrait ailleurs`)
  }
  if (brut !== lue) {
    if (brut.endsWith('/')) {
      echecs.push(`site_url porte une barre finale (« ${brut} ») : « {{ .SiteURL }}${cheminConfirmation()} » deviendrait « //… »`)
    } else {
      avertissements.push(`site_url porte un chemin ou une requête (« ${brut} ») : le repli perd le jeton`)
    }
  }

  return { valeur: lue, echecs, avertissements }
}

/**
 * Juge la liste : les URL du code doivent être acceptées, et aucune origine
 * tierce ne doit l'être.
 *
 * Le second point n'est pas du zèle : `confirmation.mjs` dérive l'origine de
 * l'en-tête `host` quand la variable de déploiement manque, et nomme
 * l'allow-list comme « le second verrou ». Un motif assez large pour accepter
 * `https://attaquant.example/…` retire ce verrou.
 */
export function auditerAllowList(valeur, options) {
  const { origine, origineTierce = 'https://attaquant.example', local = 'http://localhost:3000' } =
    options ?? {}
  const echecs = []
  const avertissements = []
  const liste = decouperListe(valeur)

  if (liste.length === 0) {
    echecs.push('uri_allow_list vide : GoTrue refuse tout `redirect_to` et retombe sur site_url')
    return { liste, requis: [], echecs, avertissements }
  }

  const requis = urlsRequises(origine).map((url) => ({ url, ...accepter(liste, url) }))
  for (const item of requis) {
    if (item.niveau === 'absente') {
      echecs.push(`allow-list refuse ${item.url}`)
    } else if (item.niveau === 'probable') {
      avertissements.push(
        `allow-list accepte ${item.url} seulement si « * » traverse « / » (${item.motifs.join(', ')}) — à confirmer par un envoi réel`
      )
    }
  }

  const tierces = liste.filter((motif) => correspondLiberal(motif, `${origineTierce}/auth/confirm`))
  if (tierces.length > 0) {
    echecs.push(`allow-list accepte une origine tierce (${tierces.join(', ')}) : le verrou anti-redirection tombe`)
  }

  if (!liste.some((motif) => correspondLiberal(motif, `${local}/auth/confirm`))) {
    avertissements.push(`aucun motif « ${local} » : les liens de développement seront refusés`)
  }

  return { liste, requis, echecs, avertissements }
}

/**
 * Verdict complet sur la configuration recopiée.
 * @param {{site_url?: string, uri_allow_list?: string|string[]}} config
 * @param {{origine: string, origineTierce?: string}} options
 */
export function auditer(config, options) {
  const origine = validerUrl(options?.origine, NOM_ORIGINE)
  const source = config ?? {}
  const site = auditerSiteUrl(source.site_url, origine)
  const liste = auditerAllowList(source.uri_allow_list, {
    origine,
    origineTierce: options?.origineTierce,
  })

  const echecs = [...site.echecs, ...liste.echecs]
  const avertissements = [...site.avertissements, ...liste.avertissements]

  return { ok: echecs.length === 0, origine, site, liste, echecs, avertissements }
}
