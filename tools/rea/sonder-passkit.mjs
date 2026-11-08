#!/usr/bin/env node
/* ============================================================================
   PassKit — sonde de contrat (P0-5, étape 1).

   Elle répond à quatre questions, dans cet ordre, et **n'en suppose aucune** :

     U3  quel est le préfixe d'API de ce compte ? (`/v1` ou rien)
     U3  l'authentification passe-t-elle ? (401 = non, 200 = oui)
     U2  où est l'**URL d'installation** du pass, dans la réponse d'un membre ?
     U1  quelle est la **valeur du code-barres** — la nôtre, ou celle de PassKit ?

   U1 est la seule bloquante : si le code-barres n'est pas notre `card_token`,
   `/scan` ne reconnaît plus la carte. La sonde l'affiche tel quel, sans
   l'interpréter.

   LECTURE SEULE PAR DÉFAUT : la seule méthode émise est `GET`. Créer un membre
   de test exige `--ecrire`, et c'est le seul chemin qui écrit chez PassKit.

   USAGE
     node --env-file=web/.env.local tools/rea/sonder-passkit.mjs
     node --env-file=web/.env.local tools/rea/sonder-passkit.mjs --ecrire

   Les identifiants viennent de `.env.local` (gitignoré) et **ne sont jamais
   imprimés** : seule la fonction `masquer` les traverse, et elle n'en garde que
   quatre caractères.
   ========================================================================== */

import {
  CLES_ENV,
  cheminsProgrammes,
  construireUrl,
  lireConfiguration,
  masquer,
  resumeMembre,
} from './passkit.mjs'

const ECRIRE = process.argv.includes('--ecrire')

/** Une requête, un statut, un corps — jamais d'exception qui arrête la sonde. */
async function appeler(url, jeton, options = {}) {
  try {
    const reponse = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${jeton}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    const texte = await reponse.text()
    let corps = null
    try {
      corps = texte ? JSON.parse(texte) : null
    } catch {
      corps = null
    }
    return { statut: reponse.status, texte, corps }
  } catch (erreur) {
    return { statut: 0, texte: erreur instanceof Error ? erreur.message : 'réseau', corps: null }
  }
}

const titre = (texte) => console.log(`\n— ${texte} — `)

async function principal() {
  const config = lireConfiguration(process.env)

  titre('configuration')
  const ligne = (cle, valeur) => console.log(`  ${cle.padEnd(22)}: ${valeur}`)
  ligne(CLES_ENV.actif, config.actif ? 'true' : 'false')
  ligne(CLES_ENV.url, config.url ?? '—')
  ligne(CLES_ENV.jeton, masquer(config.jeton))
  ligne(CLES_ENV.programme, config.programme ?? '—')
  ligne(CLES_ENV.palier, config.palier ?? '—')

  if (!config.pret) {
    titre('rien à mesurer : configuration incomplète')
    for (const manquante of config.manquantes) console.log(`  manque ${manquante}`)
    console.log('\n  Renseigner web/.env.local (ou web/.env) puis relancer :')
    console.log('    node --env-file=web/.env.local tools/rea/sonder-passkit.mjs')
    console.log('\n  (les valeurs viennent du portail PassKit → Developer Tools)')
    return 0
  }

  titre('U3 — quel préfixe répond ?')
  let base = null
  for (const chemin of cheminsProgrammes(config.programme)) {
    const url = construireUrl(config.url, chemin)
    const { statut, texte } = await appeler(url, config.jeton)
    console.log(`  GET ${chemin.padEnd(34)} → ${statut}${statut === 200 ? '  OK' : ''}`)
    if (statut === 200 && base === null) base = chemin
    if (statut !== 200) console.log(`      ${texte.slice(0, 140).replace(/\s+/g, ' ')}`)
  }

  if (base === null) {
    titre('conclusion')
    console.log('  Aucun chemin n’a répondu 200. Trois causes, à lever dans cet ordre :')
    console.log('  jeton invalide (401), préfixe de région différent de celui du compte')
    console.log('  (404), ou chemin inexistant (404). Vérifier Developer Tools.')
    return 1
  }

  titre('conclusion')
  console.log(`  Authentification et préfixe : OK (${base})`)

  if (!ECRIRE) {
    console.log('\n  U1/U2 non mesurées : elles demandent la réponse d’un membre.')
    console.log('  Relancer avec --ecrire (une ligne chez PassKit, supprimable au portail) :')
    console.log('    node --env-file=web/.env.local tools/rea/sonder-passkit.mjs --ecrire')
    return 0
  }

  if (!config.pretAEcrire) {
    console.log(`\n  --ecrire exige ${CLES_ENV.programme} ET ${CLES_ENV.palier} :`)
    console.log('  un membre appartient toujours à un programme et à un palier.')
    return 1
  }

  titre('U1/U2 — création d’un membre de test')
  const racine = base.replace(/\/program.*$/, '')
  const urlMembre = construireUrl(config.url, `${racine}/member`)
  const { statut, texte, corps } = await appeler(urlMembre, config.jeton, {
    method: 'POST',
    body: JSON.stringify({
      programId: config.programme,
      tierId: config.palier,
      externalId: `sonde-${Date.now()}`,
      person: { displayName: 'Sonde Fidelia' },
    }),
  })

  console.log(`  POST ${urlMembre} → ${statut}`)
  if (statut !== 200 && statut !== 201) {
    console.log(`  ${texte.slice(0, 400).replace(/\s+/g, ' ')}`)
    console.log('\n  Ce chemin d’écriture n’est donc pas le bon : le lire dans le')
    console.log('  Swagger du portail (Developer Tools → API reference).')
    return 1
  }

  const resume = resumeMembre(corps)
  console.log(`  clés de la réponse : ${resume.cles.join(', ') || '—'}`)

  console.log('\n  U2 — tout ce qui ressemble à une URL :')
  for (const entree of resume.urls) console.log(`    ${entree.chemin} = ${entree.valeur}`)
  if (resume.urls.length === 0) console.log('    (aucune : l’URL vient peut-être de la Distribution API)')

  console.log('\n  U1 — tout ce qui ressemble à un code-barres :')
  for (const entree of resume.codes) console.log(`    ${entree.chemin} = ${entree.valeur}`)
  if (resume.codes.length === 0) console.log('    (aucun : le code-barres est peut-être fixé côté programme)')

  console.log('\n  Comparer la valeur ci-dessus à notre `card_token`. Si elles diffèrent,')
  console.log('  la parade est déjà écrite : `wallet_member_id` + `carte_par_code()`.')
  return 0
}

principal().then((code) => process.exit(code))
