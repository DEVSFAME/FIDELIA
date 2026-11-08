/* ============================================================================
   Garde sur `migrations/0012` — le compteur du plafond (P0-3).

   La migration n'est pas exécutée ici. On vérifie ce qui casserait **en
   silence** une fois passée :

     1. **un compteur qui ne compte pas la bonne chose** — la règle mesurée est
        « clients inscrits » (`docs/regle-comptage-30-2026-11-02.md`), donc
        `count(*)` sur `clients`, pas sur les visites ni sur le mois ;
     2. **une limite recopiée côté application** — elle sort de la fonction,
        l'appelant ne la connaît pas ;
     3. **un verrou posé sans clé** — la migration ne doit toucher aucune
        fonction d'écriture : il n'existe aucun état payant pour lever la
        limite ;
     4. **`anon` accordé par distraction** — le compteur est une information
        commerciale ;
     5. **une fonction sans `search_path` figé** — le piège d'escalade déjà
        documenté dans `0003`/`0004`/`0011`.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   bandeau (`plafond.test.mjs`, `web/src/lib/plafond.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0012_plafond_clients.sql')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0012 — le compteur compte les clients inscrits, et rien d’autre', () => {
  assert.match(CODE, /select\s+count\(\*\)\s+into\s+v_clients\s+from\s+public\.clients/i)
  // Le mois, les visites et les cartes ne sont pas le sujet : les compter ici
  // ferait un second chiffre sous le mot « clients ».
  assert.equal(/date_trunc|interval|loyalty_transactions|loyalty_cards/i.test(CODE), false)
})

test('0012 — la limite sort de la fonction, en un seul endroit', () => {
  assert.match(CODE, /v_limite\s+constant\s+integer\s*:=\s*30/i)
  assert.match(CODE, /'limite',\s*v_limite/i)
  // Une seule occurrence du seuil dans le **code exécutable** : la description
  // de la fonction cite 30 en prose, ce n'est pas une seconde décision.
  const executable = CODE.replace(/comment\s+on\s+function[\s\S]*?;/i, ' ')
  assert.equal(
    (executable.match(/\b30\b/g) ?? []).length,
    1,
    'le seuil est écrit deux fois dans le code'
  )
})

test('0012 — la fonction est close : `definer`, `search_path` figé, décrite', () => {
  assert.match(CODE, /security\s+definer/i)
  assert.match(CODE, /set\s+search_path\s*=\s*public/i)
  assert.match(SQL, /comment\s+on\s+function\s+public\.plafond_clients\(\)\s+is/i)
  assert.match(CODE, /returns\s+json/i)
})

test('0012 — les droits : trois rôles révoqués, deux rendus, `anon` exclu', () => {
  assert.match(
    CODE,
    /revoke\s+execute\s+on\s+function\s+public\.plafond_clients\(\)\s+from\s+public,\s*anon,\s*authenticated/i
  )
  assert.match(
    CODE,
    /grant\s+execute\s+on\s+function\s+public\.plafond_clients\(\)\s+to\s+authenticated,\s*service_role/i
  )
  // Aucun `grant … to … anon` : la page publique n'a pas besoin du compteur.
  assert.equal(/grant[\s\S]{0,80}\banon\b/i.test(CODE), false, '`anon` a reçu un droit')
})

test('0012 — aucun verrou, aucune table : la migration ne fait qu’une lecture', () => {
  for (const nom of ['join_loyalty_program', 'award_loyalty_points', 'redeem_loyalty_reward']) {
    assert.equal(
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nom}`, 'i').test(CODE),
      false,
      `la migration réécrit « ${nom} » : le plafond serait appliqué sans état payant`
    )
  }
  assert.equal(/create\s+table/i.test(CODE), false, 'une table d’abonnement inventée')
  assert.equal(/insert\s+into|update\s+public|delete\s+from/i.test(CODE), false, 'écriture ajoutée')
})
