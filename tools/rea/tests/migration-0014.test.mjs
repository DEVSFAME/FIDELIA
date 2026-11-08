/* ============================================================================
   Garde sur `migrations/0014` — la carte dans Google Wallet (P0-5).

   La migration n'est pas exécutée ici. On vérifie ce qui casserait **en
   silence** une fois passée :

     1. **un alias qui n'en est pas un** — `wallet_object_id` doit être nullable
        (NULL = jamais enregistrée) et **unique** : deux cartes sur le même objet
        Google, la seconde écraserait la première dans le Wallet du client ;
     2. **un pass trop bavard** — la RPC de lecture ne doit rendre ni nom de
        famille, ni email, ni paliers : un pass se lit par-dessus une épaule ;
     3. **un identifiant non validé** — Google n'accepte que des caractères
        bornés ; un id faux resterait à vie dans la colonne ;
     4. **`anon` accordé** — la route tourne en `service_role` ; ouvrir `anon`
        recréerait l'oracle d'énumération que `0003` a refusé ;
     5. **une fonction sans `search_path` figé**.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter) ni la
   signature du JWT (`google-wallet.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0014_wallet_google.sql')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

test('0014 — la colonne est nullable et unique : un objet Google par carte', () => {
  assert.match(CODE, /add column if not exists wallet_object_id varchar\(120\)/i)

  // La colonne doit rester nullable (NULL = jamais enregistrée). On regarde
  // **l'ALTER seul** : l'index contient « is not null », qui n'est pas une
  // contrainte de colonne mais le prédicat du partiel.
  const alter = CODE.match(/alter table public\.loyalty_cards[\s\S]*?;/i)
  assert.ok(alter, 'aucun ALTER TABLE loyalty_cards')
  assert.equal(/not null/i.test(alter[0]), false, 'NULL doit rester possible')

  assert.match(
    CODE,
    /create unique index if not exists loyalty_cards_wallet_object_id_unique[\s\S]*?where wallet_object_id is not null/i
  )
})

test('0014 — le pass ne lit ni nom de famille, ni email, ni paliers', () => {
  const lecture = CODE.match(/create or replace function public\.carte_pour_wallet[\s\S]*?\$fonction\$;/i)
  assert.ok(lecture, 'carte_pour_wallet absente')
  for (const interdit of ['last_name', 'email', 'reward_tiers', 'paliers', 'birthdate']) {
    assert.equal(
      new RegExp(`\\b${interdit}\\b`, 'i').test(lecture[0]),
      false,
      `« ${interdit} » ne doit pas sortir dans un pass`
    )
  }
  // Ce qui doit y être, en revanche : le jeton (pour le QR) et le prénom.
  assert.match(lecture[0], /'card_token'/i)
  assert.match(lecture[0], /first_name/i)
})

test('0014 — l’identifiant d’objet est validé avant d’être écrit', () => {
  assert.match(CODE, /v_id\s*!~\s*'\^\[A-Za-z0-9_-\]/i)
  assert.match(CODE, /raise exception 'OBJECT_ID_INVALIDE'/i)
  // La validation précède l'UPDATE, sinon l'index unique garderait une valeur fausse.
  const controle = CODE.search(/OBJECT_ID_INVALIDE/i)
  const maj = CODE.search(/update public\.loyalty_cards/i)
  assert.ok(controle > 0 && maj > controle, 'l’UPDATE précède la validation')
})

test('0014 — les deux fonctions sont closes, et `anon` reste dehors', () => {
  assert.equal(
    (CODE.match(/security definer/gi) ?? []).length,
    2,
    'les deux fonctions doivent être `security definer`'
  )
  assert.equal((CODE.match(/set search_path = public/gi) ?? []).length, 2)

  for (const signature of ['carte_pour_wallet\\(varchar\\)', 'lier_wallet\\(varchar,\\s*varchar\\)']) {
    const grant = CODE.match(new RegExp(`grant[^;]*${signature}[^;]*;`, 'i'))
    assert.ok(grant, `aucun GRANT sur ${signature}`)
    assert.equal(/\banon\b/.test(grant[0]), false, `anon est accordé sur ${signature}`)
    assert.match(grant[0], /service_role/)
  }
})
