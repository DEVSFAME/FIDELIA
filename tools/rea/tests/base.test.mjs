/* ============================================================================
   R0 — tests de la sonde d'état basal. Aucun réseau : on teste des décisions.

   Deux tests méritent d'être lus avant les autres, parce qu'ils portent la
   thèse de R0 :

   - `403 n'est pas 404` : un GRANT manquant prouve l'existence de la table ;
     un `PGRST205` prouve son absence. Confondre les deux inverse le fait.
   - `une table vide ne rend pas ses colonnes "manquantes"` : c'est le garde qui
     empêche de reprocher à la reconstruction ce que la cible n'a pas montré.
   ========================================================================== */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  lireEnv,
  longueurSecrete,
  aucunSecret,
  colonnesDe,
  tablesDe,
  signaturesRpc,
  lireContentRange,
  classerAcces,
  comparerModele,
  estConforme,
  MODELE_CIBLE,
  MODELE_CONVERSATION,
  MODELE_SPECIFICATION,
  TABLES_CIBLE,
  CLEFS,
} from '../base.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/* ---------------------------------------------------------------------------
   1. `env.supabase.md` — le fichier est du Markdown, pas du `.env`.
   ------------------------------------------------------------------------ */

const ENV = `ID : "refprojet"
NEXT_PUBLIC_SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiJ9.anon"
SUPABASE_SERVICE_ROLE_KEY : "eyJhbGciOiJIUzI1NiJ9.srv"
NEXT_PUBLIC_SUPABASE_URL : "https://refprojet.supabase.co"`

test('lireEnv : lit les quatre clés, guillemets retirés', () => {
  const env = lireEnv(ENV)
  assert.equal(env.id, 'refprojet')
  assert.equal(env.url, 'https://refprojet.supabase.co')
  assert.equal(env.anon, 'eyJhbGciOiJIUzI1NiJ9.anon')
  assert.equal(env.service, 'eyJhbGciOiJIUzI1NiJ9.srv')
})

test('lireEnv : tolère l’absence de guillemets et les espaces', () => {
  const env = lireEnv(
    'NEXT_PUBLIC_SUPABASE_URL:https://abc.supabase.co\n' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY :   k1  \n' +
      'SUPABASE_SERVICE_ROLE_KEY: k2\n',
  )
  assert.equal(env.url, 'https://abc.supabase.co')
  assert.equal(env.anon, 'k1')
  assert.equal(env.service, 'k2')
})

test('lireEnv : refuse une clé requise absente (aucune valeur par défaut)', () => {
  assert.throws(
    () =>
      lireEnv(
        'NEXT_PUBLIC_SUPABASE_URL : "https://a.supabase.co"\nNEXT_PUBLIC_SUPABASE_ANON_KEY : "k"\n',
      ),
    /SUPABASE_SERVICE_ROLE_KEY manquant/,
  )
})

test('lireEnv : refuse un ID qui contredit l’URL (copier-coller partiel)', () => {
  assert.throws(
    () =>
      lireEnv(
        'ID : "autre"\nNEXT_PUBLIC_SUPABASE_URL : "https://a.supabase.co"\n' +
          'NEXT_PUBLIC_SUPABASE_ANON_KEY : "k"\nSUPABASE_SERVICE_ROLE_KEY : "s"\n',
      ),
    /incohérence/,
  )
})

test('lireEnv : un ID absent ne bloque pas — il est facultatif', () => {
  const env = lireEnv(
    'NEXT_PUBLIC_SUPABASE_URL : "https://a.supabase.co"\n' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY : "k"\nSUPABASE_SERVICE_ROLE_KEY : "s"\n',
  )
  assert.equal(env.id, '')
})

test('CLEFS : les noms sont ceux du fichier réel, pas des approximations', () => {
  assert.equal(CLEFS.service, 'SUPABASE_SERVICE_ROLE_KEY')
  assert.equal(CLEFS.url, 'NEXT_PUBLIC_SUPABASE_URL')
})

/* ---------------------------------------------------------------------------
   2. Le garde de fuite — falsifiable, sinon il décore (lesson §21.5).
   ------------------------------------------------------------------------ */

test('longueurSecrete : rend la longueur, jamais la valeur', () => {
  assert.equal(longueurSecrete('abcdef'), '6 o')
  assert.equal(longueurSecrete(''), 'absent')
})

test('aucunSecret : détecte la forme d’un JWT Supabase', () => {
  assert.equal(aucunSecret('{"k":"eyJhbGciOiJIUzI1NiIsInR5cCI6"}'), false)
})

test('aucunSecret : détecte la présence littérale d’un secret fourni', () => {
  assert.equal(aucunSecret('rien à voir', ['s3cr3t']), true)
  assert.equal(aucunSecret('la clé vaut s3cr3t ici', ['s3cr3t']), false)
})

test('aucunSecret : accepte une sortie propre', () => {
  assert.equal(aucunSecret('{"tables":["clients"],"lignes":0}', ['k1', 'k2']), true)
})

/* ---------------------------------------------------------------------------
   3. Lecture de l'OpenAPI — calée sur la forme réellement servie par PostgREST.
      La fixture reproduit ce que la base de reconstruction a renvoyé, y compris
      l'encodage de la PK/FK dans `description` (c'est ainsi que PostgREST le
      fait, et c'est ce qui permet de lire le modèle sans `pg_catalog`).
   ------------------------------------------------------------------------ */

const OPENAPI = {
  definitions: {
    loyalty_transactions: {
      properties: {
        id: { type: 'string', format: 'uuid', default: 'gen_random_uuid()', description: 'Note:\nThis is a Primary Key.<pk/>' },
        card_id: { type: 'string', format: 'uuid', description: "Note:\nThis is a Foreign Key to `loyalty_cards.id`.<fk table='loyalty_cards' column='id'/>" },
        amount_spent: { type: 'number', format: 'numeric' },
        reward_label: { type: 'string', format: 'character varying', maxLength: 150 },
      },
    },
    clients: {
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Note:\nThis is a Primary Key.<pk/>' },
        email: { type: 'string', format: 'character varying', maxLength: 255 },
      },
    },
  },
  paths: {
    '/clients': { get: { parameters: [] }, post: { parameters: [] } },
    '/rpc/award_loyalty_points': {
      post: {
        parameters: [
          {
            in: 'body',
            name: 'args',
            schema: {
              properties: {
                p_card_token: { type: 'string', format: 'character varying' },
                p_amount_spent: { type: 'number', format: 'numeric' },
                p_staff_id: { type: 'string', format: 'uuid' },
              },
              required: ['p_card_token', 'p_amount_spent'],
            },
          },
        ],
      },
    },
    '/rpc/sans_parametre': { post: { parameters: [] } },
  },
}

test('colonnesDe : PK, FK, format et longueur max lus dans la définition', () => {
  const cols = colonnesDe(OPENAPI.definitions.loyalty_transactions)
  const par = Object.fromEntries(cols.map((c) => [c.nom, c]))
  assert.equal(par.id.pk, true)
  assert.equal(par.id.defaut, 'gen_random_uuid()')
  assert.equal(par.card_id.pk, false)
  assert.equal(par.card_id.fk, 'loyalty_cards.id')
  assert.equal(par.reward_label.maxLength, 150)
  assert.equal(par.amount_spent.type, 'number')
})

test('colonnesDe : une colonne sans description n’est ni PK ni FK', () => {
  const [c] = colonnesDe({ properties: { x: { type: 'integer' } } })
  assert.equal(c.pk, false)
  assert.equal(c.fk, null)
})

test('tablesDe : trié, stable, ne dépend pas de l’ordre d’OpenAPI', () => {
  assert.deepEqual(tablesDe(OPENAPI), ['clients', 'loyalty_transactions'])
  assert.deepEqual(tablesDe({}), [])
})

test('signaturesRpc : nom, paramètres et caractère requis', () => {
  const [rpc] = signaturesRpc(OPENAPI).filter((r) => r.nom === 'award_loyalty_points')
  assert.deepEqual(rpc.parametres.map((p) => p.nom), [
    'p_card_token',
    'p_amount_spent',
    'p_staff_id',
  ])
  assert.deepEqual(rpc.parametres.filter((p) => p.requis).map((p) => p.nom), [
    'p_card_token',
    'p_amount_spent',
  ])
  assert.equal(rpc.corpsSansParametre, false)
})

test('signaturesRpc : une RPC sans corps est signalée, pas inventée', () => {
  const rpc = signaturesRpc(OPENAPI).find((r) => r.nom === 'sans_parametre')
  assert.equal(rpc.corpsSansParametre, true)
  assert.deepEqual(rpc.parametres, [])
})

/* ---------------------------------------------------------------------------
   4. `Content-Range` et classement d'accès.
   ------------------------------------------------------------------------ */

test('lireContentRange : les trois formes réellement observées', () => {
  assert.deepEqual(lireContentRange('*/0'), { plage: '*', total: 0 })
  assert.deepEqual(lireContentRange('0-0/309'), { plage: '0-0', total: 309 })
  assert.deepEqual(lireContentRange('0-0/*'), { plage: '0-0', total: null })
  assert.equal(lireContentRange('n’importe quoi'), null)
  assert.equal(lireContentRange(undefined), null)
})

test('classerAcces : 200 sur table vide ⇒ lisible, 0 ligne (pas « absente »)', () => {
  assert.deepEqual(classerAcces({ statut: 200, contentRange: '*/0' }), {
    verdict: 'lisible',
    lignes: 0,
  })
})

test('classerAcces : 403 (GRANT manquant) n’est PAS 404 (table absente)', () => {
  assert.equal(classerAcces({ statut: 403 }).verdict, 'refuse_403')
  assert.equal(classerAcces({ statut: 404 }).verdict, 'absente')
  assert.notEqual(classerAcces({ statut: 403 }).verdict, classerAcces({ statut: 404 }).verdict)
})

test('classerAcces : 401 est distinct de 403', () => {
  assert.equal(classerAcces({ statut: 401 }).verdict, 'refuse_401')
})

test('classerAcces : un statut imprévu n’est pas rangé de force', () => {
  assert.deepEqual(classerAcces({ statut: 500 }), { verdict: 'erreur', statut: 500, lignes: null })
})


/* ---------------------------------------------------------------------------
   5. Comparaison base ⇄ modèle mesuré — et le garde anti-invention.
   ------------------------------------------------------------------------ */

test('comparerModele : une table de la cible absente est nommée', () => {
  const c = comparerModele({ clients: ['id'] })
  assert.ok(c.tablesManquantes.includes('restaurants'))
  assert.ok(c.tablesManquantes.includes('transactions'))
  assert.deepEqual(c.tablesEnPlus, ['clients'])
})

test('comparerModele : une colonne structurelle manquante est nommée', () => {
  const c = comparerModele({ transactions: ['id', 'card_id', 'amount_mad'] })
  const t = c.colonnes.transactions
  assert.ok(t.manquantes.includes('stamps_delta'))
  assert.ok(t.manquantes.includes('client_operation_id'))
  assert.ok(t.manquantes.includes('till_session_id'))
  assert.equal(t.nonMesuree, false)
})

test('comparerModele : une colonne en plus est signalée, jamais absorbée', () => {
  const c = comparerModele({
    transactions: [...(MODELE_CIBLE.transactions.colonnes || []), 'reward_label'],
  })
  assert.deepEqual(c.colonnes.transactions.manquantes, [])
  assert.deepEqual(c.colonnes.transactions.enPlus, ['reward_label'])
})

test('comparerModele : une table VIDE de la cible ne rend pas ses colonnes « manquantes »', () => {
  // `automations` a rendu 0 ligne : ses colonnes sont inconnues, pas absentes.
  const c = comparerModele({ automations: [], till_sessions: [] })
  assert.equal(c.colonnes.automations.nonMesuree, true)
  assert.equal(c.colonnes.automations.etat, 'vide')
  assert.deepEqual(c.colonnes.automations.manquantes, [])
  assert.deepEqual(c.colonnes.till_sessions.manquantes, [])
})

test('comparerModele : `customers` inaccessible ne devient pas « conforme »', () => {
  const c = comparerModele({ customers: [] })
  assert.equal(c.colonnes.customers.nonMesuree, true)
  assert.equal(c.colonnes.customers.etat, 'inaccessible')
})

test('comparerModele : `rewards` (table inexistante) présente dans la base = table en plus', () => {
  const c = comparerModele({ rewards: ['id', 'title'] })
  assert.ok(c.tablesEnPlus.includes('rewards'))
  // Et aucune comparaison de colonnes n'est faite sur une table qui n'existe pas.
  assert.equal(c.colonnes.rewards, undefined)
})

test('comparerModele : ne compare que les tables que la cible mesure', () => {
  const c = comparerModele({ loyalty_cards: ['id', 'current_points'] })
  assert.deepEqual(c.colonnes, {})
  assert.deepEqual(c.tablesEnPlus, ['loyalty_cards'])
})

test('estConforme : faux au moindre écart, vrai sur un modèle identique', () => {
  // Le modèle « parfait » est celui de la cible MOINS `rewards`, dont la cible a
  // prouvé l'absence : la présence de cette table dans la base serait un ajout.
  const modele = {}
  for (const [t, d] of Object.entries(MODELE_CIBLE)) {
    if (d.etat === 'inexistante') continue
    modele[t] = [...d.colonnes]
  }
  assert.equal(estConforme(comparerModele(modele)), true)

  assert.equal(estConforme(comparerModele({ ...modele, transactions: ['id'] })), false)
  assert.equal(estConforme(comparerModele({ clients: ['id'], ...modele })), false)
  assert.equal(estConforme(comparerModele({ ...modele, rewards: ['id'] })), false)
  assert.equal(estConforme(undefined), false)
  assert.equal(estConforme({}), false)
})

/* ---------------------------------------------------------------------------
   6. Contre-vérification de la doc : les cardinaux de `Fidelix_Serveur.md` §8.3.
      Si quelqu'un « corrige » un tableau de la doc sans rejouer la mesure, ce
      test tombe. C'est le seul point où R0 est falsifiable depuis la doc seule.
   ------------------------------------------------------------------------ */

test('MODELE_CIBLE : 23 / 10 / 34 / 16 colonnes, comme mesuré en A1', () => {
  assert.equal(MODELE_CIBLE.loyalty_programs.colonnes.length, 23)
  assert.equal(MODELE_CIBLE.reward_tiers.colonnes.length, 10)
  assert.equal(MODELE_CIBLE.restaurants.colonnes.length, 34)
  assert.equal(MODELE_CIBLE.transactions.colonnes.length, 16)
})

test('MODELE_CIBLE : les quatre tables non mesurées portent leur état, pas des colonnes', () => {
  assert.deepEqual(TABLES_CIBLE, [
    'automations',
    'customers',
    'loyalty_programs',
    'restaurants',
    'reward_tiers',
    'rewards',
    'till_sessions',
    'transactions',
  ])
  assert.equal(MODELE_CIBLE.automations.etat, 'vide')
  assert.equal(MODELE_CIBLE.customers.etat, 'inaccessible')
  assert.equal(MODELE_CIBLE.rewards.etat, 'inexistante')
  for (const t of ['automations', 'customers', 'rewards', 'till_sessions']) {
    assert.deepEqual(MODELE_CIBLE[t].colonnes, [])
  }
})

/* ---------------------------------------------------------------------------
   7. Triangulation : trois références, une seule base.
      Le contenu mesuré de la base de reconstruction, recopié ici pour que
      « la base EST conversation.md » soit un test et non une déduction.
   ------------------------------------------------------------------------ */

const BASE_MESUREE = {
  clients: ['id', 'first_name', 'last_name', 'email', 'created_at'],
  loyalty_cards: ['id', 'client_id', 'card_token', 'current_points', 'updated_at', 'created_at'],
  loyalty_transactions: [
    'id', 'card_id', 'amount_spent', 'points_awarded', 'staff_id', 'created_at', 'reward_label',
  ],
}

test('la base réelle satisfait EXACTEMENT le modèle de conversation.md', () => {
  assert.equal(estConforme(comparerModele(BASE_MESUREE, MODELE_CONVERSATION)), true)
})

test('la même base NE satisfait PAS le modèle des Spécifications techniques', () => {
  const c = comparerModele(BASE_MESUREE, MODELE_SPECIFICATION)
  assert.equal(estConforme(c), false)
  assert.deepEqual(c.tablesManquantes, [])
  assert.deepEqual(c.tablesEnPlus, [])
})

test('la divergence décisive : `points_delta` (spec) contre `points_awarded` (base)', () => {
  const t = comparerModele(BASE_MESUREE, MODELE_SPECIFICATION).colonnes.loyalty_transactions
  assert.ok(t.manquantes.includes('points_delta'))
  assert.ok(t.enPlus.includes('points_awarded'))
  // Deux noms pour la même intention : un INSERT écrit pour l'un échoue sur
  // l'autre. C'est ce qui interdit d'appliquer la spec telle quelle.
  assert.equal(t.manquantes.includes('points_awarded'), false)
})

test('la spec ajoute `total_spent`, absent de la base réelle', () => {
  const t = comparerModele(BASE_MESUREE, MODELE_SPECIFICATION).colonnes.loyalty_cards
  assert.deepEqual(t.manquantes, ['total_spent'])
  assert.deepEqual(t.enPlus, [])
})

test('la spec renomme l’audit et l’historique : `staff_user_id`/`notes` contre `staff_id`/`reward_label`', () => {
  const t = comparerModele(BASE_MESUREE, MODELE_SPECIFICATION).colonnes.loyalty_transactions
  assert.ok(t.manquantes.includes('staff_user_id'))
  assert.ok(t.manquantes.includes('notes'))
  assert.ok(t.enPlus.includes('staff_id'))
  assert.ok(t.enPlus.includes('reward_label'))
})

test('`declaree` est traité comme comparable — sinon le test 1 serait un faux positif', () => {
  // Si `declaree` tombait dans la branche « non mesurée », manquantes serait
  // vide et `estConforme` rendrait `true` sans avoir comparé une seule colonne.
  const c = comparerModele({ clients: [] }, MODELE_SPECIFICATION)
  assert.equal(c.colonnes.clients.nonMesuree, false)
  assert.ok(c.colonnes.clients.manquantes.length > 0)
})

/* ---------------------------------------------------------------------------
   8. Un commentaire n'est pas une implémentation.
      La spec annonce « Tables, Index, RLS, Fonctions RPC » dans son arborescence
      et ne contient AUCUNE politique. Le test fige l'écart : si quelqu'un ajoute
      les politiques un jour, il échouera et forcera une relecture de R0.
   ------------------------------------------------------------------------ */

test('la spec ANNONCE la RLS et n’en contient aucune', () => {
  const chemin = join(RACINE, 'Spécifications techniques plateforme de fidélité QR code.md')
  assert.ok(existsSync(chemin), 'la spec doit exister à la racine de FIDELIX')
  const texte = readFileSync(chemin, 'utf8')
  assert.match(texte, /RLS/, 'elle mentionne bien la RLS')
  assert.equal((texte.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length, 0)
  assert.equal((texte.match(/CREATE POLICY/gi) || []).length, 0)
})

test('la spec ne contient aucune mécanique de tampon (`stamps`)', () => {
  const texte = readFileSync(
    join(RACINE, 'Spécifications techniques plateforme de fidélité QR code.md'),
    'utf8',
  )
  assert.equal((texte.match(/stamps/gi) || []).length, 0)
  // Et ses 4 « stamp » sont des `TIMESTAMP` — même piège que dans la conversation.
  const stamps = texte.match(/stamp/gi) || []
  assert.equal(stamps.length, (texte.match(/timestamp/gi) || []).length)
})

