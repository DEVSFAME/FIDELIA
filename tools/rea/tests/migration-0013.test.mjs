/* ============================================================================
   Garde sur `migrations/0013` — la file des messages (P0-4).

   La migration n'est pas exécutée ici. On vérifie ce qui casserait **en
   silence** une fois passée :

     1. **un message qui se déclare envoyé** — aucun canal n'existe dans ce
        socle (`docs/mesure-p0-4-messages-2026-11-02.md` §6) ; la seule valeur
        écrite doit être `en_attente`, et rien ne doit pouvoir passer à `envoye` ;
     2. **des bornes recopiées côté application seulement** — le `maxlength` HTML
        se retire en trois clics, donc les trois `check` doivent être en base ;
     3. **un quota sans vérification** — le compte du jour est comparé **avant**
        l'insertion, sinon deux onglets dépassent trois messages ;
     4. **un fuseau implicite** — le jour est compté à Casablanca, explicitement ;
     5. **`anon` accordé par distraction** — la file appartient au commerçant ;
     6. **une fonction sans `search_path` figé** — le piège déjà documenté dans
        `0003`/`0004`/`0011`/`0012`.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni la
   validation d'écran (`messages.test.mjs`, `web/src/lib/messages.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0013_messages.sql')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0013 — la fonction de lecture rend les quatre faits, et le quota', () => {
  assert.match(CODE, /v_limite\s+constant\s+integer\s*:=\s*3/i)
  for (const cle of ['limite', 'aujourdhui', 'joignables', 'messages']) {
    assert.match(CODE, new RegExp(`'${cle}'`), `la clé « ${cle} » manque à la réponse`)
  }
})

test('0013 — le jour du quota est compté à Casablanca, pas au fuseau du serveur', () => {
  assert.match(CODE, /at time zone 'Africa\/Casablanca'/i)
  // Un `date_trunc('day', now())` nu dépendrait du fuseau du serveur (UTC sur
  // Supabase) : le quota se réinitialiserait à 01:00 heure marocaine.
  assert.equal(/date_trunc\(\s*'day'/i.test(CODE), false)
})

test('0013 — les bornes de la cible sont tenues en base', () => {
  assert.match(CODE, /char_length\(btrim\(titre\)\)\s+between\s+3\s+and\s+50/i)
  assert.match(CODE, /char_length\(btrim\(corps\)\)\s+between\s+10\s+and\s+150/i)
  // Et dans la fonction d'écriture, sinon un appelant direct les contournerait.
  assert.match(CODE, /char_length\(v_titre\)\s*<\s*3/i)
  assert.match(CODE, /char_length\(v_corps\)\s*>\s*150/i)
})

test('0013 — le quota est vérifié avant l’insertion', () => {
  const verrou = CODE.search(/if\s+v_aujourdhui\s*>=\s*v_limite/i)
  const insertion = CODE.search(/insert\s+into\s+public\.messages_envoyes/i)
  assert.ok(verrou > 0, 'le quota n’est pas vérifié')
  assert.ok(insertion > verrou, 'l’insertion précède la vérification du quota')
  assert.match(CODE, /raise\s+exception\s+'QUOTA_ATTEINT'/i)
})

test('0013 — rien ne peut se déclarer envoyé', () => {
  // La colonne accepte `envoye` pour le jour du canal, mais aucun `update`,
  // aucun `insert` ne doit l'écrire : le seul statut produit est le défaut.
  assert.equal(/update\s+public\.messages_envoyes/i.test(CODE), false)
  const insertions = CODE.match(/insert\s+into\s+public\.messages_envoyes[\s\S]*?;/gi) ?? []
  assert.equal(insertions.length, 1, 'une seule insertion est attendue')
  assert.equal(/statut/i.test(insertions[0]), false, 'l’insertion impose un statut')
})

test('0013 — la table est fermée, et les deux fonctions sont closes', () => {
  assert.match(CODE, /alter\s+table\s+public\.messages_envoyes\s+enable\s+row\s+level\s+security/i)
  assert.equal(
    /create\s+policy/i.test(CODE),
    false,
    'une politique RLS rouvrirait la table en lecture directe'
  )
  assert.match(CODE, /revoke\s+all\s+on\s+table\s+public\.messages_envoyes\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.equal(
    (CODE.match(/security\s+definer/gi) ?? []).length,
    2,
    'les deux fonctions doivent être `security definer`'
  )
  assert.equal(
    (CODE.match(/set\s+search_path\s*=\s*public/gi) ?? []).length,
    2,
    'les deux fonctions doivent figer leur `search_path`'
  )
})

test('0013 — `anon` ne lit ni n’écrit la file', () => {
  for (const fonction of ['messages_du_commerce\\(\\)', 'enfiler_message\\(varchar,\\s*varchar,\\s*text\\)']) {
    const grant = CODE.match(new RegExp(`grant[^;]*${fonction}[^;]*;`, 'i'))
    assert.ok(grant, `aucun GRANT sur ${fonction}`)
    assert.equal(/\banon\b/.test(grant[0]), false, `anon est accordé sur ${fonction}`)
    assert.match(grant[0], /authenticated/)
  }
})

test('0013 — les six refus sont nommés, et aucun ne se tait', () => {
  for (const code of [
    'TITRE_TROP_COURT',
    'TITRE_TROP_LONG',
    'MESSAGE_TROP_COURT',
    'MESSAGE_TROP_LONG',
    'LIEN_INVALIDE',
    'QUOTA_ATTEINT',
  ]) {
    assert.match(CODE, new RegExp(`raise\\s+exception\\s+'${code}'`), `refus « ${code} » absent`)
  }
})
