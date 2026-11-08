/* ============================================================================
   Garde sur `migrations/0003` — les erreurs qu'on ne voit qu'en production.

   Une migration SQL ne se teste pas ici (pas de `psql`, pas de Supabase CLI sur
   cette machine) : on vérifie donc ce qui se relit **par lecture**, et qui casse
   silencieusement quand on l'oublie.

   Quatre fautes réelles, toutes déjà vues dans des projets :

     1. `SECURITY DEFINER` sans `search_path` : la fonction s'exécute alors avec
        le chemin de l'appelant, donc un `public` réécrit par un tiers détourne
        la fonction. C'est une escalade de privilèges, pas un détail de style.
     2. `search_path` incluant `pg_temp` : un objet temporaire homonyme prend le
        pas sur la table réelle.
     3. `REVOKE ... FROM PUBLIC` sans `GRANT` nommé ensuite : la fonction devient
        inappelable, et l'erreur (`permission denied`) n'apparaît qu'à l'usage.
     4. `GRANT ... TO anon` sur une lecture de carte : c'est un oracle de soldes,
        énumérable (`C-` + 6 caractères ≈ 16,7 M de combinaisons).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0003_r3_programme_join_lecture.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` pour ne pas analyser la prose. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0003 — aucune politique RLS créée : les tables restent fermées en direct', () => {
  // Le choix est explicite dans l'en-tête : tout passe par les fonctions.
  // Une politique ajoutée par mégarde rouvrirait la lecture directe sans que
  // personne ne le remarque, puisque les écrans continueraient de fonctionner.
  assert.equal(/create\s+policy/i.test(CODE), false, 'aucune CREATE POLICY attendue')
})

test('0003 — chaque SECURITY DEFINER fixe son search_path', () => {
  const definitions = [...CODE.matchAll(
    /create\s+or\s+replace\s+function\s+([a-z_.]+)\s*\(([\s\S]*?)\$fonction\$/gi
  )]

  assert.ok(definitions.length >= 5, `fonctions trouvées : ${definitions.length}`)

  for (const [, nom, entete] of definitions) {
    assert.match(entete, /security\s+definer/i, `${nom} devrait être SECURITY DEFINER`)
    assert.match(
      entete,
      /set\s+search_path\s*=\s*public\s*$/im,
      `${nom} : search_path doit valoir « public » et rien d'autre`
    )
    assert.equal(
      /pg_temp/.test(entete),
      false,
      `${nom} : pg_temp ne doit pas figurer dans le search_path`
    )
  }
})

test('0003 — chaque REVOKE a un GRANT nommé qui le suit', () => {
  const revokes = [...CODE.matchAll(/revoke\s+execute\s+on\s+function\s+([a-z_.]+\([^)]*\))/gi)]
  assert.ok(revokes.length >= 5, `revokes trouvés : ${revokes.length}`)

  for (const [, signature] of revokes) {
    const echappe = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(
      CODE,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${echappe}`, 'i'),
      `aucun GRANT pour ${signature} : la fonction serait inappelable`
    )
  }
})

test('0003 — les droits sont donnés au rôle qui en a besoin, pas au-delà', () => {
  const ligneDeGrant = (nom) => {
    const trouve = CODE.match(
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${nom}\\([^)]*\\)\\s*([^;]*);`, 'i')
    )
    assert.ok(trouve, `GRANT introuvable pour ${nom}`)
    return trouve[1]
  }

  // L'adhésion est publique : c'est la cible du QR, sans compte.
  assert.match(ligneDeGrant('join_loyalty_program'), /\banon\b/)
  assert.match(ligneDeGrant('programme_public'), /\banon\b/)

  // La lecture d'une carte est un oracle de soldes : jamais pour `anon`.
  assert.equal(
    /\banon\b/.test(ligneDeGrant('carte_par_token')),
    false,
    'carte_par_token ne doit pas être accessible à anon'
  )
  // Réécrire les paliers d'un commerce : jamais pour `anon` non plus.
  assert.equal(/\banon\b/.test(ligneDeGrant('enregistrer_programme')), false)
})

test('0003 — le code `C-XXXXXX` est bien celui de la cible, avec reprise sur collision', () => {
  assert.match(CODE, /'C-'\s*\|\|/, 'le préfixe mesuré est « C- »')
  assert.match(CODE, /unique_violation/i, 'la collision doit être rattrapée, pas subie')
})
