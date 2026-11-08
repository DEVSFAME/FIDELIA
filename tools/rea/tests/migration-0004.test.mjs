/* ============================================================================
   Garde sur `migrations/0004` — la première RPC de **lecture**.

   Une migration ne s'exécute pas ici : on vérifie ce qui se relit et qui casse
   silencieusement. Les quatre fautes déjà vues dans ce projet, plus la
   cinquième que cette migration existe pour corriger :

     1. `SECURITY DEFINER` sans `search_path` : la fonction s'exécute avec le
        chemin de l'appelant, et un schéma homonyme détourne la résolution des
        noms. `award_loyalty_points` et `redeem_loyalty_reward` étaient dans ce
        cas (mesuré : `pg_get_functiondef` ne portait aucun `SET search_path`) ;
        `0004` le corrige, et ce test exige que la correction reste.
     2. `REVOKE … FROM PUBLIC` seul : no-op, parce que `create function` hérite
        des privilèges par défaut du schéma (Supabase accorde `EXECUTE` à
        `anon`, `authenticated`, `service_role`). On exige les **trois rôles
        nommés** au `REVOKE`.
     3. `GRANT` absent après le `REVOKE` : la fonction devient inappelable, et
        l'erreur n'apparaît qu'à l'usage.
     4. `GRANT … TO anon` sur une lecture de liste : c'est un annuaire complet de
        jetons, donc un oracle d'énumération.
     5. **Une table rouverte au passage** : un `GRANT SELECT` ou une politique
        RLS rendrait la RPC inutile *et* rouvrirait la lecture directe, sans que
        les écrans cessent de fonctionner — donc sans que personne ne le voie.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0004_lecture_cartes.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0004 — la lecture est SECURITY DEFINER avec un search_path figé sur public', () => {
  const definition = CODE.match(
    /create\s+or\s+replace\s+function\s+public\.cartes_du_commerce\s*\([\s\S]*?\$fonction\$/i
  )
  assert.ok(definition, 'la fonction `cartes_du_commerce()` est introuvable')

  const entete = definition[0].split('$fonction$')[0]
  assert.match(entete, /security\s+definer/i)
  assert.match(entete, /set\s+search_path\s*=\s*public\s*$/im, 'search_path doit valoir « public »')
  assert.equal(/pg_temp/.test(entete), false, 'pg_temp ne doit pas figurer dans le search_path')
})

test('0004 — le REVOKE nomme les trois rôles, pas seulement PUBLIC', () => {
  const revoke = CODE.match(/revoke\s+execute\s+on\s+function\s+public\.cartes_du_commerce\s*\(\s*\)[^;]*;/i)
  assert.ok(revoke, 'REVOKE absent : la fonction hériterait du droit par défaut')

  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(revoke[0], new RegExp(`\\b${role}\\b`, 'i'), `le REVOKE doit nommer ${role}`)
  }
})

test('0004 — le GRANT rend la lecture à authenticated et service_role, jamais à anon', () => {
  const grant = CODE.match(/grant\s+execute\s+on\s+function\s+public\.cartes_du_commerce\s*\(\s*\)[^;]*;/i)
  assert.ok(grant, 'GRANT absent : la fonction serait inappelable')

  assert.match(grant[0], /\bauthenticated\b/i, 'le dashboard lit avec `authenticated`')
  assert.match(grant[0], /\bservice_role\b/i)
  assert.equal(
    /\banon\b/i.test(grant[0]),
    false,
    'une liste de tous les jetons ne s’ouvre pas à `anon` (annuaire, donc oracle)'
  )
})

test('0004 — aucune table n’est ouverte, aucune politique n’est créée', () => {
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

test('0004 — la projection est celle de la cible, sans email ni identifiant interne', () => {
  for (const cle of ['card_token', 'points', 'recompenses', 'inscrit_le', 'prenom', 'nom']) {
    assert.match(CODE, new RegExp(`'${cle}'`), `la clé « ${cle} » manque à la projection`)
  }

  // Une colonne rendue est une colonne exposée : la cible n'affiche pas l'email
  // dans cette liste, et `client_id` / `card_id` n'ont aucun usage d'écran.
  for (const interdit of ["'email'", "'client_id'", "'card_id'"]) {
    assert.equal(CODE.includes(interdit), false, `${interdit} ne doit pas être rendu`)
  }
})

test('0004 — une seule transaction, et elle encadre le corps', () => {
  // Cette faute a eu lieu : une insertion a coupé l'en-tête, laissant `begin;`
  // **après** le `commit;`. Le SQL restait lisible, les tests de droits
  // passaient, et le fichier n'aurait plus rien exécuté dans une transaction —
  // ou pas du tout, selon l'éditeur. On vérifie donc la forme, pas seulement le
  // contenu.
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

test('0004 — les deux fonctions d’écriture existantes reçoivent un search_path', () => {
  const alterations = [...CODE.matchAll(
    /alter\s+function\s+public\.([a-z_]+)\s*\(([^)]*)\)\s*set\s+search_path\s*=\s*public\s*;/gi
  )]

  const signatures = alterations.map(([, nom, args]) => `${nom}(${args.replace(/\s+/g, '')})`)
  assert.deepEqual(
    signatures.sort(),
    [
      'award_loyalty_points(varchar,numeric,integer,uuid)',
      'redeem_loyalty_reward(varchar,integer,varchar,uuid)',
    ],
    'les deux signatures mesurées doivent être durcies, avec leur ordre de types exact'
  )
})
