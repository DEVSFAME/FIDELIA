/* ============================================================================
   R2 — le contrat des RPC réelles est-il celui qui a été mesuré ?

   Ce fichier fige trois choses, et rien de plus :

     1. les **noms de paramètres** (`p_card_token`, `p_amount_spent`,
        `p_points_to_add`, `p_points_cost`, `p_reward_label`) — ils viennent de
        l'OpenAPI de la base, pas de la documentation Supabase ;
     2. les **deux codes d'erreur observés** (`CARD_NOT_FOUND`, `INVALID_COST`)
        et le fait qu'un code inconnu n'est pas rapproché d'un cas connu ;
     3. le fait qu'un refus métier **ne lève pas** : il rend un état, parce
        qu'une exception dans une action serveur remplace l'écran par la page
        d'erreur de Next et fait perdre le geste en cours.

   Aucun appel réseau : `appeler()` reçoit un client factice.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CLES_ETAT_ATTRIBUTION,
  CLES_ETAT_ECHANGE,
  ErreurArguments,
  LONGUEUR_MAX_JETON,
  NOM_ATTRIBUTION,
  NOM_ECHANGE,
  appeler,
  construireAttribution,
  construireEchange,
  interpreterErreur,
  jetonValide,
} from '../../../web/src/lib/rpc.mjs'
import { cles } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('rpc — les noms de fonctions sont ceux de l’OpenAPI', () => {
  assert.equal(NOM_ATTRIBUTION, 'award_loyalty_points')
  assert.equal(NOM_ECHANGE, 'redeem_loyalty_reward')
})

test('rpc — attribution : noms de paramètres exacts, valeurs transmises', () => {
  const { nom, args } = construireAttribution({ jeton: '  ABC123  ', montant: 40, points: 4 })
  assert.equal(nom, 'award_loyalty_points')
  assert.deepEqual(args, {
    p_card_token: 'ABC123',
    p_amount_spent: 40,
    p_points_to_add: 4,
  })
  // `p_staff_id` est facultatif : absent tant qu'on ne le fournit pas.
  assert.equal('p_staff_id' in args, false)

  const avecPersonnel = construireAttribution({
    jeton: 'ABC123',
    montant: 0,
    points: 0,
    personnel: '00000000-0000-0000-0000-000000000000',
  })
  assert.equal(avecPersonnel.args.p_staff_id, '00000000-0000-0000-0000-000000000000')
})

test('rpc — échange : noms de paramètres exacts, coût strictement positif', () => {
  const { nom, args } = construireEchange({ jeton: 'ABC', cout: 10, libelle: 'Café offert' })
  assert.equal(nom, 'redeem_loyalty_reward')
  assert.deepEqual(args, {
    p_card_token: 'ABC',
    p_points_cost: 10,
    p_reward_label: 'Café offert',
  })

  // `INVALID_COST` est mesuré : la base refuse un coût nul. On refuse avant
  // elle, avec une clé d'écran plutôt qu'un aller-retour réseau.
  assert.throws(() => construireEchange({ jeton: 'ABC', cout: 0, libelle: 'X' }), ErreurArguments)
  assert.throws(() => construireEchange({ jeton: 'ABC', cout: -1, libelle: 'X' }), ErreurArguments)
  assert.throws(() => construireEchange({ jeton: 'ABC', cout: 1.5, libelle: 'X' }), ErreurArguments)
})

test('rpc — la saisie est refusée avant le réseau', () => {
  assert.throws(() => construireAttribution({}), ErreurArguments)
  assert.throws(
    () => construireAttribution({ jeton: 'A'.repeat(LONGUEUR_MAX_JETON + 1), montant: 1, points: 1 }),
    ErreurArguments
  )
  assert.throws(
    () => construireAttribution({ jeton: 'A', montant: -1, points: 1 }),
    ErreurArguments
  )
  assert.throws(
    () => construireAttribution({ jeton: 'A', montant: 1, points: 1.5 }),
    ErreurArguments
  )
  assert.throws(() => construireEchange({ jeton: 'A', cout: 1, libelle: '   ' }), ErreurArguments)

  // La borne est inclusive : 64 caractères passent.
  assert.equal(jetonValide('A'.repeat(LONGUEUR_MAX_JETON)), true)
})

test('rpc — un code mesuré devient un état, un code inconnu reste inconnu', () => {
  assert.deepEqual(interpreterErreur(null), { etat: 'ok', code: null })

  assert.deepEqual(interpreterErreur({ message: 'CARD_NOT_FOUND', code: 'P0001' }), {
    etat: 'carteInconnue',
    code: 'CARD_NOT_FOUND',
  })
  assert.deepEqual(interpreterErreur({ message: 'INVALID_COST', code: 'P0001' }), {
    etat: 'coutInvalide',
    code: 'INVALID_COST',
  })

  // Un code jamais observé n'est PAS rapproché d'un cas connu au hasard.
  const autre = interpreterErreur({ message: 'INSUFFICIENT_POINTS', code: 'P0001' })
  assert.equal(autre.etat, 'inconnu')
  assert.equal(autre.code, 'P0001')

  // Ni une erreur sans message.
  assert.equal(interpreterErreur({}).etat, 'inconnu')
})

test('rpc — un refus métier rend un état, jamais une exception', async () => {
  const refus = { rpc: async () => ({ data: null, error: { message: 'CARD_NOT_FOUND' } }) }
  const resultat = await appeler(refus, { nom: NOM_ATTRIBUTION, args: {} })
  assert.equal(resultat.etat, 'carteInconnue')

  const succes = { rpc: async () => ({ data: { id: 1 }, error: null }) }
  assert.equal((await appeler(succes, { nom: NOM_ATTRIBUTION, args: {} })).etat, 'ok')

  // Panne réseau / configuration absente : état distinct, pas une exception.
  const enPanne = {
    rpc: async () => {
      throw new TypeError('fetch failed')
    },
  }
  const panne = await appeler(enPanne, { nom: NOM_ATTRIBUTION, args: {} })
  assert.equal(panne.etat, 'indisponible')
  assert.equal(panne.detail, 'TypeError')
})

test('rpc — chaque clé d’état existe en fr et en', () => {
  const fr = new Set(cles('fr'))
  const en = new Set(cles('en'))
  for (const famille of [CLES_ETAT_ATTRIBUTION, CLES_ETAT_ECHANGE]) {
    for (const [etat, cle] of Object.entries(famille)) {
      assert.ok(fr.has(cle), `clé fr absente : ${cle} (${etat})`)
      assert.ok(en.has(cle), `clé en absente : ${cle} (${etat})`)
    }
  }
})

/* ---------------------------------------------------------------------------
   La migration d'écriture est du texte : on peut donc la contrôler.

   Trois règles, celles que R1.2 a payées :

     1. un `REVOKE … FROM PUBLIC` sur une fonction doit avoir, dans le même
        fichier, un `GRANT` à un rôle **nommé** — sinon la fonction devient
        inutilisable et personne ne l'a décidé ;
     2. aucune politique RLS : pas de politique sans colonne d'appartenance
        mesurée ;
     3. le statut « NON EXÉCUTÉE » reste écrit : une migration qui se présente
        comme appliquée alors qu'elle ne l'est pas est un mensonge de plus.

   Ce contrôle portait sur `0002_r2_execute_rpc.sql`. Depuis la fusion du
   2026-10-31, il porte sur `0001_acl_rls_durcissement.sql` : le fichier unique
   est la seule référence, et `0002` n'existe plus (son contenu est dedans).
   ------------------------------------------------------------------------- */

const MIGRATION_ECRITURE = join(RACINE, 'migrations', '0001_acl_rls_durcissement.sql')

test('rpc — la migration d’écriture ne casse aucun EXECUTE et n’ouvre aucune politique', () => {
  const sql = readFileSync(MIGRATION_ECRITURE, 'utf8')

  assert.match(sql, /STATUT\s*:\s*NON EXÉCUTÉE/, 'le statut doit rester explicite')
  assert.equal(/create\s+policy/i.test(sql), false, 'aucune politique RLS sans preuve')

  // Chaque signature révoquée de PUBLIC doit être re-grantée à un rôle nommé.
  const signatures = [...sql.matchAll(/revoke\s+execute\s+on\s+function\s+([^\s]+\([^)]*\))\s+from\s+public/gi)]
    .map((m) => m[1].replace(/\s+/g, ' ').toLowerCase())
  assert.ok(signatures.length > 0, 'aucun revoke de fonction trouvé')

  for (const signature of signatures) {
    const echappee = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+')
    const motif = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${echappee}\\s+to\\s+(anon|authenticated|service_role)`, 'i')
    assert.match(sql, motif, `« ${signature} » est révoquée sans GRANT nommé`)
  }

  // Le rôle mesuré doit figurer : c'est la correction apportée à 0001.
  assert.match(sql, /to\s+anon/i, 'anon (rôle mesuré) doit être re-granté')
  assert.match(sql, /to\s+authenticated/i, 'authenticated (rôle déclaré) doit être re-granté')
})

