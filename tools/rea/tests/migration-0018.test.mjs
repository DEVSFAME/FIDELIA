/* ============================================================================
   Garde sur `migrations/0018` — la lecture publique d'une carte.

   La migration n'est pas exécutée ici. Ce fichier vérifie ce qui casserait
   **en silence** une fois passée :

     1. **une fonction qui rend plus que la carte.** Un `select` qui ramène
        `last_name` ou `email` ne se voit pas à l'écran : la page n'affiche que
        ce qu'elle demande. Le surplus partirait quand même dans une réponse
        `anon`, donc dans n'importe quel `curl`.
     2. **`anon` non accordé.** La page est publique ; sans le `grant`, elle
        rendrait `nonMigre` pour une migration pourtant passée — le pire des
        diagnostics, puisque le nom du fichier est juste.
     3. **`PUBLIC` laissé ouvert.** `create or replace function` rétablit les
        privilèges par défaut ; un `revoke` oublié ouvre la fonction à tous les
        rôles, y compris ceux qu'on n'a pas nommés.
     4. **un UUID nul accepté.** `null` doit sortir par `CARD_NOT_FOUND`, comme
        une carte inconnue : sinon la page distinguerait « URL cassée » de
        « carte disparue », ce que la cible ne fait pas (même 404).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0018_carte_publique.sql')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

/** Le SQL sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

const corpsDe = (nom) => {
  const bloc = CODE.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${nom}\\s*\\([\\s\\S]*?\\$fonction\\$;`,
      'i'
    )
  )
  assert.ok(bloc, `la fonction « ${nom} » est introuvable`)
  return bloc[0]
}

const CORPS = corpsDe('carte_publique')

test('0018 — une seule transaction, sans méta-commande psql', () => {
  assert.match(CODE, /^\s*begin\s*;/i, 'la migration ne s’ouvre pas par `begin;`')
  assert.match(CODE, /commit\s*;\s*$/i, 'la migration ne se ferme pas par `commit;`')
  assert.equal((CODE.match(/^\s*begin\s*;/gim) ?? []).length, 1, 'deux transactions ?')
  assert.equal(/^\\[a-z]/im.test(CODE), false, 'méta-commande psql : la migration ne se rejouerait pas')
})

test('0018 — la fonction est `security definer` avec un `search_path` fixé', () => {
  // Sans `security definer`, la RLS sans politique de `loyalty_cards` rendrait
  // `[]` à `anon` : la page dirait « carte inconnue » pour toutes les cartes.
  assert.match(CORPS, /security\s+definer/i)
  assert.match(CORPS, /set\s+search_path\s*=\s*public/i)
})

test('0018 — un UUID nul sort par `CARD_NOT_FOUND`, comme un UUID inconnu', () => {
  // Le garde doit **précéder** le `select` : sinon `where c.id = null` ne rend
  // aucune ligne et le refus tombe plus bas, par accident plutôt que par règle.
  const garde = CORPS.search(/if\s+p_card_id\s+is\s+null\s+then/i)
  assert.ok(garde > 0, 'aucun garde sur `p_card_id is null`')
  assert.ok(
    garde < CORPS.search(/from\s+public\.loyalty_cards/i),
    'le garde arrive après la lecture : il ne protège rien'
  )
  assert.match(CORPS, /raise\s+exception\s+'CARD_NOT_FOUND'/i)
})

test('0018 — la réponse ne porte rien de nominatif au-delà du prénom', () => {
  for (const interdit of ['last_name', 'email', 'wallet_object_id', 'designated_staff_id']) {
    assert.equal(
      CORPS.includes(interdit),
      false,
      `« ${interdit} » est lu par une fonction accordée à anon`
    )
  }
  // Le prénom, lui, est bien là — et vidé proprement, pas rendu `null`.
  assert.match(CORPS, /nullif\(btrim\(coalesce\(cl\.first_name/i)
  assert.match(CORPS, /'prenom',\s*coalesce\(v_prenom,\s*''\)/i)
})

test('0018 — les droits : révoqués d’abord, `anon` accordé ensuite', () => {
  const revocation = CODE.search(/revoke\s+execute\s+on\s+function\s+public\.carte_publique/i)
  const octroi = CODE.search(/grant\s+execute\s+on\s+function\s+public\.carte_publique/i)

  assert.ok(revocation > 0, 'aucun `revoke` : `PUBLIC` garderait l’EXECUTE par défaut')
  assert.ok(octroi > revocation, 'le `grant` précède le `revoke` : l’ordre est inversé')

  const blocRevoke = CODE.slice(revocation, octroi)
  assert.match(blocRevoke, /from\s+public,\s*anon,\s*authenticated/i)

  const blocGrant = CODE.slice(octroi)
  assert.match(blocGrant, /to\s+anon,\s*authenticated,\s*service_role/i)
  // `public` n'est jamais réaccordé : ce serait rouvrir ce qu'on vient de fermer.
  assert.equal(/grant[\s\S]{0,120}\bto\s+public\b/i.test(blocGrant), false, '`PUBLIC` réaccordé')
})

test('0018 — `donnees.mjs` appelle la fonction, et ne lit aucune table', () => {
  assert.match(DONNEES, /export async function cartePublique\(cardId\)/)
  assert.match(DONNEES, /rpc\('carte_publique',\s*\{\s*p_card_id:/)
  // La règle du module : accès uniquement par RPC (RLS sans politique).
  assert.equal(/from\('loyalty_cards'\)/.test(DONNEES), false, 'lecture de table directe')
})
