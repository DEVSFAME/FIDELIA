#!/usr/bin/env node
/* ============================================================================
   REA Fidelix — vérificateur de l'« URL Configuration » Supabase.

   Lit un JSON contenant `site_url` et `uri_allow_list` (sortie de
   `GET /v1/projects/{ref}/config/auth`, ou deux valeurs recopiées) et juge leur
   conformité aux URL que le code envoie. Aucun réseau, aucune écriture, aucun
   secret : seules ces deux clés sont lues, rien d'autre n'est affiché.

   USAGE
     curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
       https://api.supabase.com/v1/projects/sevqegfhmdezsqwvwsam/config/auth > /tmp/auth.json
     NEXT_PUBLIC_SITE_URL=https://fideliatest.site \
       node tools/rea/verifier-url-auth.mjs --fichier /tmp/auth.json

   SORTIE : code 0 si la configuration accepte les deux URL du code, 1 sinon.
   ========================================================================== */

import { readFile } from 'node:fs/promises'

import { auditer } from './url-auth.mjs'

const argv = process.argv.slice(2)
const valeur = (nom) => {
  const i = argv.indexOf(nom)
  return i >= 0 ? argv[i + 1] : undefined
}

/** Lit le JSON depuis `--fichier` ou l'entrée standard (jamais les deux). */
async function lireEntree() {
  const chemin = valeur('--fichier')
  const texte = chemin ? await readFile(chemin, 'utf8') : await lireStdin()
  const lu = JSON.parse(texte)
  // La Management API rend les champs à la racine ; un `{config:{…}}` est toléré.
  return lu?.site_url || lu?.uri_allow_list ? lu : (lu?.config ?? lu)
}

function lireStdin() {
  return new Promise((resoudre, rejeter) => {
    let tampon = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (bloc) => (tampon += bloc))
    process.stdin.on('error', rejeter)
    process.stdin.on('end', () => resoudre(tampon))
  })
}

async function main() {
  const origine = valeur('--origine') ?? process.env.NEXT_PUBLIC_SITE_URL
  if (!origine) {
    console.error("Origine de déploiement inconnue : passez --origine ou NEXT_PUBLIC_SITE_URL.")
    process.exitCode = 2
    return
  }

  const config = await lireEntree()
  const v = auditer(config, { origine })

  console.log(`Origine de l'application : ${v.origine}`)
  console.log(`site_url                  : ${config?.site_url ?? '—'}`)
  console.log(`uri_allow_list            : ${JSON.stringify(config?.uri_allow_list ?? '—')}`)

  console.log('\n— URL que le code envoie —')
  for (const item of v.liste.requis) {
    const motifs = item.motifs.length > 0 ? ` par ${item.motifs.join(', ')}` : ''
    console.log(`  ${item.niveau.padEnd(9)} ${item.url}${motifs}`)
  }

  if (v.avertissements.length > 0) {
    console.log('\n— Avertissements —')
    for (const a of v.avertissements) console.log(`  ! ${a}`)
  }

  if (v.echecs.length > 0) {
    console.log('\n— Échecs —')
    for (const e of v.echecs) console.log(`  × ${e}`)
    console.log('\nVERDICT : NON CONFORME')
    process.exitCode = 1
    return
  }

  console.log('\nVERDICT : CONFORME')
}

main().catch((erreur) => {
  console.error(`Lecture impossible : ${erreur?.message ?? erreur}`)
  process.exitCode = 2
})
