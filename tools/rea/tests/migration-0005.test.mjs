/* ============================================================================
   Garde sur `migrations/0005` — la deuxième RPC de **lecture**.

   Une migration ne s'exécute pas ici : on vérifie ce qui se relit et qui casse
   silencieusement. Les quatre fautes déjà payées dans ce projet, plus celles
   que cette migration existe pour ne pas commettre :

     1. `SECURITY DEFINER` sans `search_path` : la fonction s'exécuterait avec le
        chemin de l'appelant, et un schéma homonyme détournerait la résolution
        des noms (`0004` a déjà réparé les deux fonctions d'écriture).
     2. `REVOKE … FROM PUBLIC` seul : no-op, parce que `create function` hérite
        des privilèges par défaut du schéma (Supabase accorde `EXECUTE` à
        `anon`, `authenticated`, `service_role`). On exige les **trois rôles
        nommés**.
     3. `GRANT` absent après le `REVOKE` : la fonction devient inappelable, et
        l'erreur n'apparaît qu'à l'usage.
     4. `GRANT … TO anon` : ce tableau agrège le chiffre d'affaires et le nombre
        de clients. Il ne s'ouvre pas comme une page publique de programme.
     5. **Une table rouverte au passage** : un `GRANT SELECT` ou une politique
        RLS rendrait la RPC inutile *et* rouvrirait la lecture directe, sans que
        les écrans cessent de fonctionner — donc sans que personne ne le voie.

   Et deux gardes propres à cette migration : **les définitions sont celles des
   sous-titres mesurés** (« au moins 2 visites » reste `>= 2`, la fenêtre reste
   30 jours, la borne reste celle qu'annonce `lib/tableau.mjs`), et **l'ordre
   est total** — sans clé unique, deux lignes permutent d'un appel à l'autre.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { LIMITE_RECENTES } from '../../../web/src/lib/tableau.mjs'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0005_lecture_tableau.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0005 — la lecture est SECURITY DEFINER avec un search_path figé sur public', () => {
  const definition = CODE.match(
    /create\s+or\s+replace\s+function\s+public\.tableau_du_commerce\s*\([^)]*\)[\s\S]*?\$fonction\$/i
  )
  assert.ok(definition, 'la fonction `tableau_du_commerce()` est introuvable')

  const entete = definition[0]
  assert.match(entete, /security\s+definer/i)
  assert.match(entete, /set\s+search_path\s*=\s*public\s*$/im, 'search_path doit valoir « public »')
  assert.equal(/pg_temp/.test(entete), false, 'pg_temp ne doit pas figurer dans le search_path')
})

test('0005 — le REVOKE nomme les trois rôles, pas seulement PUBLIC', () => {
  const revoke = CODE.match(
    /revoke\s+execute\s+on\s+function\s+public\.tableau_du_commerce\s*\(\s*\)[^;]*;/i
  )
  assert.ok(revoke, 'REVOKE absent : la fonction hériterait du droit par défaut')

  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(revoke[0], new RegExp(`\\b${role}\\b`, 'i'), `le REVOKE doit nommer ${role}`)
  }
})

test('0005 — le GRANT rend la lecture à authenticated et service_role, jamais à anon', () => {
  const grant = CODE.match(
    /grant\s+execute\s+on\s+function\s+public\.tableau_du_commerce\s*\(\s*\)[^;]*;/i
  )
  assert.ok(grant, 'GRANT absent : la fonction serait inappelable')

  assert.match(grant[0], /\bauthenticated\b/i, 'le dashboard lit avec `authenticated`')
  assert.match(grant[0], /\bservice_role\b/i)
  assert.equal(
    /\banon\b/i.test(grant[0]),
    false,
    'un agrégat de chiffre d’affaires ne s’ouvre pas à `anon`'
  )
})

test('0005 — aucune table n’est ouverte, aucune politique n’est créée', () => {
  assert.equal(
    /grant\s+[^;]*\bon\s+table\b/i.test(CODE),
    false,
    'aucun GRANT de table : tout passe par les fonctions'
  )
  assert.equal(/create\s+policy/i.test(CODE), false, 'aucune CREATE POLICY attendue')
  assert.equal(
    /alter\s+table\s+[^;]*disable\s+row\s+level\s+security/i.test(CODE),
    false,
    'la RLS ne doit pas être désactivée'
  )
})

test('0005 — la projection est celle de la capture, sans email ni identifiant interne', () => {
  const cles = ['devise', 'clients', 'visites', 'reviennent', 'ca', 'transactions', 'recentes']
  for (const cle of cles) {
    assert.match(CODE, new RegExp(`'${cle}'`), `la clé « ${cle} » manque à la projection`)
  }

  // Une colonne rendue est une colonne exposée : la cible n'affiche ni email,
  // ni identifiant interne dans cette liste.
  for (const interdit of ["'email'", "'client_id'", "'card_id'", "'staff_id'"]) {
    assert.equal(CODE.includes(interdit), false, `${interdit} ne doit pas être rendu`)
  }
})

test('0005 — une seule transaction, et elle encadre le corps', () => {
  const debuts = [...CODE.matchAll(/^\s*begin\s*;/gim)]
  const fins = [...CODE.matchAll(/^\s*commit\s*;/gim)]
  assert.equal(debuts.length, 1, `« begin; » attendu une fois, trouvé ${debuts.length}`)
  assert.equal(fins.length, 1, `« commit; » attendu une fois, trouvé ${fins.length}`)

  const premierCorps = CODE.search(/^\s*(create|alter)\s/im)
  assert.ok(premierCorps > 0, 'aucun DDL trouvé')
  assert.ok(debuts[0].index < premierCorps, '« begin; » doit précéder le premier DDL')
  assert.ok(
    fins[0].index > CODE.lastIndexOf('revoke'),
    '« commit; » doit suivre le dernier REVOKE/GRANT'
  )

  const apres = CODE.slice(fins[0].index + fins[0][0].length).trim()
  assert.equal(apres, '', `du SQL traîne après le « commit; » : « ${apres.slice(0, 60)} »`)
})

test('0005 — les définitions sont celles des sous-titres mesurés', () => {
  // « Reviennent | au moins 2 visites » : le seuil est dans le sous-titre de la
  // capture, pas dans une intuition.
  assert.match(
    CODE,
    /having\s+count\(\*\)\s*>=\s*2/i,
    'le seuil « au moins 2 visites » doit rester `>= 2`'
  )

  // « Visites | 30 derniers jours » et « CA (€) | 30 j · total 40 ».
  const fenetres = [...CODE.matchAll(/interval\s+'(\d+)\s+days?'/gi)].map((m) => Number(m[1]))
  assert.ok(fenetres.length > 0, 'aucune fenêtre de 30 jours trouvée')
  assert.deepEqual(
    [...new Set(fenetres)],
    [30],
    `une seule fenêtre attendue (30 jours), trouvée : ${fenetres.join(', ')}`
  )

  // La borne rendue par la fonction et la constante de l'écran doivent coïncider :
  // deux valeurs qui divergent ici ne cassent rien, elles changent le sens.
  assert.match(
    CODE,
    new RegExp(`limit\\s+${LIMITE_RECENTES}\\b`, 'i'),
    `la fonction doit borner à ${LIMITE_RECENTES} lignes, comme LIMITE_RECENTES`
  )
})

test('0005 — l’ordre est total, pas seulement « le plus récent d’abord »', () => {
  const ordres = [...CODE.matchAll(/order\s+by\s+([^;\n]*)/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  )
  assert.ok(ordres.length > 0, 'aucun ORDER BY trouvé')
  for (const ordre of ordres) {
    assert.match(
      ordre,
      /\.id\b/i,
      `un ORDER BY sans clé unique laisse deux lignes permuter : « ${ordre} »`
    )
  }
})

