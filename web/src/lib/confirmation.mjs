/* ============================================================================
   Retour de lien de confirmation — la logique **pure**, sans Next.

   Pourquoi ce fichier existe : `/auth/confirm` est un endpoint de redirection.
   Il ne rend rien, ne se visite pas, et n'a donc aucun écran où constater une
   erreur à l'œil. Tout ce qui peut y mal tourner doit être décidé par du code
   testable hors serveur — sinon la seule preuve serait « ça n'a pas marché ».

   Ce que la cible A MESURÉ, et qu'on alimente enfin : la page `/forgot-password`
   lit trois valeurs dans l'URL — `expire`, `appareil`, `invalide`
   (`_next_static_chunks_app__auth__forgot-password_page-…js`). Jusqu'à cette
   route, **aucune** ne les produisait : c'était la dette nommée par R1. Le
   couplage est désormais vérifié par un test — `destinationEchec()` ne peut pas
   produire une valeur que `messageEchec()` refuse d'afficher.

   Les deux formes de lien, et pourquoi les deux :

     - `?code=…` — PKCE, forme par défaut de `@supabase/ssr`. L'échange exige le
       *code verifier* déposé en cookie au moment de la demande. Ouverte sur un
       autre appareil, la même URL échoue : c'est exactement `appareil`, et
       c'est le seul cas qui le produit.
     - `?token_hash=…&type=…` — gabarit d'email personnalisé. Vérification sans
       cookie, donc le lien s'ouvre n'importe où. Le message mesuré le promet
       déjà mot pour mot : « les liens actuels s'ouvrent où vous voulez ».

   Rien n'est deviné : une valeur inconnue ne devient jamais un motif, et un
   motif inconnu ne devient jamais une URL.
   ========================================================================== */

import { validerUrl } from './supabase/config.mjs'

/** Chemin du retour de lien (mesuré : `emailRedirectTo: "/auth/confirm…"`). */
export const CHEMIN_CONFIRMATION = '/auth/confirm'

/** Page qui affiche les trois échecs (elle lit déjà `?echec=`). */
export const CHEMIN_ECHEC = '/forgot-password'

/** Seule destination authentifiée du socle : `/onboarding` n'existe pas ici. */
export const DESTINATION_SUCCES = '/dashboard'

/** Écran « nouveau mot de passe » — l'autre destination de succès, et la seule. */
export const PAGE_NOUVEAU_MOT_DE_PASSE = '/nouveau-mot-de-passe'

/**
 * Paramètre qui **marque** une demande de récupération dans `redirectTo`.
 *
 * Pourquoi un marqueur, et pourquoi celui-là : la forme `?code=` (PKCE) ne
 * transporte **aucun type**. Après échange, une session de récupération et une
 * session d'inscription sont indiscernables — or l'une doit mener à l'écran de
 * saisie, l'autre au tableau de bord. Le type doit donc voyager dans l'URL de
 * retour, que nous construisons.
 *
 * `next=` est écarté : mesuré chez la cible (`?next=/onboarding`), il accepte un
 * chemin arbitraire — c'est une redirection ouverte depuis un lien reçu par
 * courriel. Ici la valeur ne désigne pas un chemin, elle désigne **un flux**,
 * et un flux inconnu ne détourne rien (`destinationSucces` retombe sur
 * `/dashboard`).
 */
export const PARAMETRE_FLUX = 'flux'

/** La seule valeur de marqueur acceptée. Un flux inconnu est ignoré, pas suivi. */
export const FLUX_RECUPERATION = 'recuperation'

/** Type GoTrue d'un lien de récupération (`verifyOtp({ type: 'recovery' })`). */
export const TYPE_RECUPERATION = 'recovery'

/** Variable d'environnement qui fixe l'origine des liens envoyés par courriel. */
export const NOM_ORIGINE = 'NEXT_PUBLIC_SITE_URL'

/**
 * Types de jeton acceptés par `verifyOtp` **dans ce socle**.
 *
 * `recovery` y figure depuis que l'écran « nouveau mot de passe » existe. Il en
 * était exclu tant qu'aucune page ne pouvait poser le mot de passe : vérifier un
 * jeton de récupération ouvrait alors une session **sans issue**, et refuser le
 * lien (le message mesuré invite à en demander un nouveau) valait mieux qu'une
 * session qui ne sert à rien. La raison de l'exclusion a disparu avec elle — la
 * garde suit, plutôt que de rester verte sur une décision qui n'a plus d'objet.
 */
export const TYPES_CONFIRMATION = Object.freeze([
  'signup',
  'email',
  'invite',
  'magiclink',
  'email_change',
  // `recovery` **doit** figurer ici : la page `/nouveau-mot-de-passe` existe, et
  // c'est elle qui rend le jeton utile. Il manquait dans cette liste alors que le
  // commentaire ci-dessus et `confirmation.test.mjs` l'exigeaient — le lien de
  // réinitialisation était donc refusé comme « invalide », et le mot de passe
  // restait impossible à changer. Constaté en exécutant la suite : 1 test rouge.
  'recovery',
])

/** Les trois motifs mesurés, et rien d'autre. */
export const MOTIFS = Object.freeze(['expire', 'appareil', 'invalide'])

/** Lit un paramètre d'URL depuis `URLSearchParams` **ou** un objet simple. */
function parametre(source, nom) {
  if (!source) return null
  const brut =
    typeof source.get === 'function' ? source.get(nom) : Object.hasOwn(source, nom) ? source[nom] : null
  return typeof brut === 'string' && brut.trim() !== '' ? brut.trim() : null
}

/**
 * Motif d'échec correspondant à une erreur de Supabase (objet, ou chaîne).
 *
 * L'ordre des tests n'est pas cosmétique : un message qui parle de *code
 * verifier* est un problème d'appareil même s'il contient le mot « invalid ».
 * @param {unknown} erreur
 * @returns {'expire'|'appareil'|'invalide'}
 */
export function motifDepuisErreur(erreur) {
  const texte =
    typeof erreur === 'string'
      ? erreur
      : [
          erreur?.message,
          erreur?.error_description,
          erreur?.code,
          erreur?.error_code,
          erreur?.error,
          erreur?.name,
        ]
          .filter((morceau) => typeof morceau === 'string' && morceau !== '')
          .join(' ')

  const valeur = String(texte ?? '').toLowerCase()
  if (valeur.trim() === '') return 'invalide'

  // « PKCE code verifier not found in storage… different browser or device ».
  if (/code verifier|different (browser|device)|pkce/.test(valeur)) return 'appareil'
  // « Email link is invalid or has expired », « invalid flow state », otp_expired.
  if (/expir|flow state|already (been )?used/.test(valeur)) return 'expire'
  return 'invalide'
}

/**
 * Marque de récupération, ou rien. Deux sources, et elles ne se contredisent
 * pas : le gabarit `token_hash` **nomme** son type (`type=recovery`), la forme
 * PKCE ne le peut pas — c'est donc notre `?flux=` qui parle, et lui seul.
 * @param {URLSearchParams|Record<string, string>|null|undefined} parametres
 * @param {string|null} type type GoTrue déjà normalisé, ou `null` (forme PKCE)
 * @returns {{flux?: string}} un fragment à étaler dans le résultat
 */
function marqueRecuperation(parametres, type) {
  if (type === TYPE_RECUPERATION) return { flux: FLUX_RECUPERATION }
  const flux = parametre(parametres, PARAMETRE_FLUX)
  return flux && flux.toLowerCase() === FLUX_RECUPERATION ? { flux: FLUX_RECUPERATION } : {}
}

/**
 * Ce que dit l'URL de retour : de quoi vérifier, ou pourquoi c'est déjà perdu.
 *
 * `error`/`error_code` sont lus **avant** `code` : quand GoTrue refuse un jeton,
 * il ajoute ses paramètres d'erreur à l'URL de redirection, et un `code`
 * résiduel ne doit pas masquer le refus.
 *
 * `flux` n'apparaît **que** quand la demande est une récupération. Ce n'est pas
 * une coquetterie : les liens d'inscription n'ont pas de flux, et une clé
 * toujours présente à `null` ferait échouer chaque comparaison stricte existante
 * pour dire la même chose. Un flux **inconnu** (`?flux=autre`) n'ouvre rien : il
 * est absent du résultat, donc la destination reste `/dashboard`.
 *
 * @param {URLSearchParams|Record<string, string>|null|undefined} parametres
 * @returns {{sorte: 'code', code: string, flux?: string}
 *          |{sorte: 'token_hash', tokenHash: string, type: string, flux?: string}
 *          |{sorte: 'echec', motif: 'expire'|'appareil'|'invalide'}}
 */
export function lireParametresConfirmation(parametres) {
  const codeErreur = parametre(parametres, 'error_code')
  const erreur = parametre(parametres, 'error')
  if (codeErreur || erreur) {
    const description = parametre(parametres, 'error_description')
    return {
      sorte: 'echec',
      motif: motifDepuisErreur({ code: codeErreur, message: description ?? erreur }),
    }
  }

  const code = parametre(parametres, 'code')
  if (code) return { sorte: 'code', code, ...marqueRecuperation(parametres, null) }

  const jeton = parametre(parametres, 'token_hash')
  if (jeton) {
    const type = (parametre(parametres, 'type') ?? '').toLowerCase()
    if (!TYPES_CONFIRMATION.includes(type)) return { sorte: 'echec', motif: 'invalide' }
    return {
      sorte: 'token_hash',
      tokenHash: jeton,
      type,
      ...marqueRecuperation(parametres, type),
    }
  }

  return { sorte: 'echec', motif: 'invalide' }
}

/**
 * Où envoyer l'utilisateur **après** vérification du jeton.
 *
 * Une session ouverte ne dit pas ce qu'on est venu faire. Sans cette décision,
 * un lien de récupération réussissait et déposait le commerçant sur son tableau
 * de bord, mot de passe **inchangé** : le pire des deux mondes, puisqu'il croit
 * l'avoir changé. La destination se lit donc dans le flux, et dans lui seul.
 * @param {{flux?: string}|null|undefined} lecture
 * @returns {string} un chemin du disque
 */
export function destinationSucces(lecture) {
  return lecture?.flux === FLUX_RECUPERATION ? PAGE_NOUVEAU_MOT_DE_PASSE : DESTINATION_SUCCES
}

/**
 * URL de retour d'échec, dans la forme exacte que lit `/forgot-password`.
 * Un motif inconnu retombe sur `invalide` : on ne recopie jamais une valeur
 * d'URL dans la nôtre.
 * @param {string} motif
 * @returns {string}
 */
export function destinationEchec(motif) {
  const sur = MOTIFS.includes(motif) ? motif : 'invalide'
  return `${CHEMIN_ECHEC}?echec=${sur}`
}

/**
 * URL absolue du retour de lien, ou `null` si l'origine est inconnue.
 * @param {string|null|undefined} origine
 * @returns {string|null}
 */
export function urlConfirmation(origine) {
  const base = String(origine ?? '').replace(/\/+$/, '')
  return base === '' ? null : `${base}${CHEMIN_CONFIRMATION}`
}

/**
 * URL absolue du retour de lien **de récupération**.
 *
 * Ce n'est pas `urlConfirmation` : le marqueur de flux doit être dans l'URL que
 * Supabase nous rendra. GoTrue ajoute son `code` (ou `token_hash`+`type`) à la
 * valeur qu'on lui donne, sans effacer la chaîne de requête existante ; c'est
 * déjà ce que le gabarit mesuré de la cible utilise (`?next=…`).
 *
 * ⚠️ Hypothèse de déploiement : l'allow-list « Redirect URLs » du projet doit
 * accepter l'URL **avec** sa requête (motif `…/auth/confirm*` ou joker). Sinon
 * Supabase retombe sur l'URL de site — lien valide, mais hors du flux, et le
 * marqueur serait perdu. C'est un réglage de console, pas de code : à vérifier
 * au premier envoi réel.
 * @param {string|null|undefined} origine
 * @returns {string|null}
 */
export function urlReinitialisation(origine) {
  const base = urlConfirmation(origine)
  return base === null ? null : `${base}?${PARAMETRE_FLUX}=${FLUX_RECUPERATION}`
}

/** Premier élément d'un en-tête qui peut être une liste (`a, b`). */
function premier(entetes, nom) {
  try {
    const valeur = entetes?.get?.(nom)
    if (typeof valeur !== 'string') return null
    const [tete] = valeur.split(',')
    return tete.trim() === '' ? null : tete.trim()
  } catch {
    return null
  }
}

/** `localhost`, `127.0.0.1` et `[::1]` sont les seuls hôtes servis en `http`. */
function estLocal(hote) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(hote)
}

/**
 * Origine à utiliser dans le lien de confirmation.
 *
 * Ordre de confiance, du plus sûr au plus exposé :
 *   1. `NEXT_PUBLIC_SITE_URL` — valeur de déploiement, explicite. Invalide, elle
 *      **lève** : une faute de frappe qui enverrait tous les liens vers un hôte
 *      inexistant doit se voir tout de suite, pas dans la boîte d'un client.
 *   2. `x-forwarded-host` / `host` — l'hôte de la requête, pour que le lien
 *      fonctionne en local, en aperçu et en production sans trois valeurs en
 *      dur. Forgé, il est refusé par l'allow-list « Redirect URLs » du projet :
 *      c'est le second verrou, et il est côté Supabase.
 *
 * @param {{get?: (nom: string) => string|null}|null} entetes
 * @param {Record<string, string|undefined>} [env]
 * @returns {string|null}
 */
export function origineDepuisEntetes(entetes, env = process.env) {
  const declaree = env?.[NOM_ORIGINE]
  if (typeof declaree === 'string' && declaree.trim() !== '') {
    return validerUrl(declaree, NOM_ORIGINE)
  }

  const hote = premier(entetes, 'x-forwarded-host') ?? premier(entetes, 'host')
  if (!hote) return null

  const transmis = premier(entetes, 'x-forwarded-proto')
  const protocole =
    transmis === 'http' || transmis === 'https' ? transmis : estLocal(hote) ? 'http' : 'https'

  try {
    return validerUrl(`${protocole}://${hote}`, NOM_ORIGINE)
  } catch {
    // Hôte illisible (port exotique, caractère interdit) : pas d'origine, donc
    // pas de `emailRedirectTo`. Supabase retombe sur l'URL de site du projet —
    // c'est un lien valide, jamais un lien mort.
    return null
  }
}
