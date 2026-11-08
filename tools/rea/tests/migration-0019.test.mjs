/* ============================================================================
   Garde sur `migrations/0019` — les abonnements web push.

   La migration n'est pas exécutée ici. Ce fichier vérifie ce qui casserait
   **en silence** une fois passée :

     1. **un plafond qui se refuse lui-même.** Compter les abonnements *avec*
        l'endpoint réabonné interdit le cinquième appareil légitime et rend le
        réabonnement d'un endpoint existant impossible dès la limite atteinte.
     2. **un `on conflict` sans contrainte.** Un `on conflict (endpoint)` sur une
        colonne non unique lève `42P10` à l'exécution — la migration passerait,
        l'écriture échouerait.
     3. **un abonnement écrit pour une carte qui n'existe pas.** Sans la lecture
        préalable de `loyalty_cards`, la clé étrangère lèverait `23503`, donc un
        code que `donnees.mjs` traduirait en `indisponible` — « la base ne
        répond pas » pour une carte simplement inconnue.
     4. **un `select` laissé ouvert.** La table nomme un appareil et son lien
        d'envoi ; elle ne se lit que par l'émetteur, en `service_role`.
     5. **un refus non déclaré.** `TROP_D_ABONNEMENTS` et `ABONNEMENT_INVALIDE`
        doivent être dans `CODES_CONNUS`, sinon la route annonce une panne là où
        la base a dit « non ».
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0019_push_abonnements.sql')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')
const ROUTE = lire('web', 'src', 'app', 'api', 'push', 'subscribe', 'route.js')

const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

const CORPS = (() => {
  const bloc = CODE.match(
    /create\s+or\s+replace\s+function\s+public\.enregistrer_abonnement_push\s*\([\s\S]*?\$fonction\$;/i
  )
  assert.ok(bloc, 'la fonction « enregistrer_abonnement_push » est introuvable')
  return bloc[0]
})()

const TABLE = (() => {
  const bloc = CODE.match(
    /create\s+table\s+if\s+not\s+exists\s+public\.push_abonnements\s*\([\s\S]*?\n\);/i
  )
  assert.ok(bloc, 'la table « push_abonnements » est introuvable')
  return bloc[0]
})()

test('0019 — une seule transaction, sans méta-commande psql', () => {
  assert.match(CODE, /^\s*begin\s*;/i)
  assert.match(CODE, /commit\s*;\s*$/i)
  assert.equal((CODE.match(/^\s*begin\s*;/gim) ?? []).length, 1, 'deux transactions ?')
  assert.equal(/^\\[a-z]/im.test(CODE), false, 'méta-commande psql : la migration ne se rejouerait pas')
})

test('0019 — la table : cascade, endpoint unique, aucune lecture par défaut', () => {
  // Une carte supprimée doit emporter ses abonnements : sans `on delete cascade`,
  // la suppression de la carte échouerait (`23503`) et le commerçant ne
  // pourrait plus supprimer un client.
  assert.match(TABLE, /references\s+public\.loyalty_cards\(id\)\s+on\s+delete\s+cascade/i)
  assert.match(TABLE, /unique\s*\(endpoint\)/i)

  assert.match(CODE, /alter\s+table\s+public\.push_abonnements\s+enable\s+row\s+level\s+security/i)
  assert.match(
    CODE,
    /revoke\s+all\s+on\s+table\s+public\.push_abonnements\s+from\s+public,\s*anon,\s*authenticated/i
  )
})

test('0019 — les bornes du `check` sont celles que la fonction refuse', () => {
  // Endpoint : `https` obligatoire. Un `http` n'est pas un service de push.
  assert.match(TABLE, /endpoint\s*~\s*'\^https:\/\//i)
  assert.match(TABLE, /char_length\(endpoint\)\s+between\s+10\s+and\s+1024/i)
  assert.match(TABLE, /char_length\(p256dh\)\s+between\s+16\s+and\s+200/i)
  assert.match(TABLE, /char_length\(auth\)\s+between\s+8\s+and\s+100/i)
})


test('0019 — la carte est vérifiée AVANT toute écriture', () => {
  const lecture = CORPS.search(/select\s+c\.id\s+into\s+v_carte\s+from\s+public\.loyalty_cards/i)
  const ecriture = CORPS.search(/insert\s+into\s+public\.push_abonnements/i)

  assert.ok(lecture > 0, 'la fonction ne vérifie pas que la carte existe')
  assert.ok(ecriture > lecture, 'l’insertion précède la vérification de la carte')
  assert.match(CORPS, /raise\s+exception\s+'CARD_NOT_FOUND'/i)

  // Et la validation de forme vient, elle aussi, avant l'insertion.
  const validation = CORPS.search(/raise\s+exception\s+'ABONNEMENT_INVALIDE'/i)
  assert.ok(validation > 0 && validation < ecriture, 'un corps invalide atteindrait l’insertion')
})

test('0019 — le plafond compte les AUTRES abonnements, sinon il se refuse lui-même', () => {
  const plafond = CORPS.match(/select\s+count\(\*\)[\s\S]*?into\s+v_autres[\s\S]*?;/i)
  assert.ok(plafond, 'aucun comptage des abonnements de la carte')
  assert.match(plafond[0], /where\s+a\.card_id\s*=\s*v_carte/i)
  assert.match(
    plafond[0],
    /and\s+a\.endpoint\s*<>\s*v_endpoint/i,
    'le comptage inclut l’endpoint réabonné : le cinquième se refuserait'
  )
  assert.match(CORPS, /if\s+v_autres\s*>=\s*5\s+then/i)
  assert.match(CORPS, /raise\s+exception\s+'TROP_D_ABONNEMENTS'/i)
})

test('0019 — le réabonnement met à jour au lieu de dupliquer', () => {
  assert.match(CORPS, /on\s+conflict\s*\(endpoint\)\s+do\s+update/i)
  assert.match(CORPS, /set\s+card_id\s*=\s*excluded\.card_id/i)
  assert.match(CORPS, /vu_le\s*=\s*now\(\)/i)
})

test('0019 — `anon` écrit, personne ne lit la table', () => {
  const revocation = CODE.search(
    /revoke\s+execute\s+on\s+function\s+public\.enregistrer_abonnement_push/i
  )
  const octroi = CODE.search(
    /grant\s+execute\s+on\s+function\s+public\.enregistrer_abonnement_push/i
  )

  assert.ok(revocation > 0, 'aucun `revoke` : `PUBLIC` garderait l’EXECUTE par défaut')
  assert.ok(octroi > revocation, 'le `grant` précède le `revoke`')
  assert.match(CODE.slice(octroi), /to\s+anon,\s*authenticated,\s*service_role/i)

  // Aucun `grant select` sur la table : l'émetteur (P0-4b) passera par
  // `service_role`, qui contourne RLS — pas par une politique publique.
  assert.equal(/grant\s+select\s+on\s+(table\s+)?public\.push_abonnements/i.test(CODE), false)
})

test('0019 — les deux refus sont déclarés, donc lisibles par l’écran', () => {
  assert.match(DONNEES, /'ABONNEMENT_INVALIDE'/)
  assert.match(DONNEES, /'TROP_D_ABONNEMENTS'/)
  assert.match(DONNEES, /rpc\('enregistrer_abonnement_push'/)
})

test('0019 — la route traduit les refus au lieu de les aplatir en 500', () => {
  assert.match(ROUTE, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/)
  assert.match(ROUTE, /export\s+async\s+function\s+POST/)
  assert.match(ROUTE, /analyserAbonnement\(/)
  assert.match(ROUTE, /refus\(400,\s*'abonnementInvalide'\)/)
  assert.match(ROUTE, /refus\(404,\s*'carteInconnue'\)/)
  assert.match(ROUTE, /refus\(409,\s*'plafondAtteint'\)/)
  assert.match(ROUTE, /Cache-Control':\s*'no-store'/)

  // Ce que la route ne doit **jamais** faire : envoyer une notification.
  assert.equal(/web-push|sendNotification|showNotification/.test(ROUTE), false, 'la route émet')
})
