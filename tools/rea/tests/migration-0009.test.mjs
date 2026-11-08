/* ============================================================================
   Garde sur `migrations/0009` — la lecture publique des caisses.

   Une migration ne s'exécute pas ici : on vérifie ce qui se relit et qui casse
   silencieusement. Les fautes que ce fichier existe pour ne pas commettre :

     1. **Rendre plus que le prénom.** `caisses_publiques()` est accordée à
        `anon` ; `equipe_du_commerce()` ne l'est pas. Si cette fonction se met à
        rendre `role`, `ca`, `scans` ou `points`, la page publique devient un
        second classement — sans qu'aucun écran ne change, et sans que personne
        ne le voie. La projection est donc vérifiée **clé par clé**.
     2. **Proposer une caisse désactivée.** La capture montre l'équipe du jour.
        Une caisse partie serait désignée pour un chiffre qui ne remonterait
        jamais. Le filtre `s.active` est le contrat, pas un détail.
     3. **Un ordre absent.** Sans `order by` total, six prénoms changent de
        place entre deux appels, et le client vise un bouton qui a bougé
        (`lesson-learned` §31.5).
     4. **`REVOKE … FROM PUBLIC` seul** : `create function` hérite des
        privilèges par défaut du schéma, donc la révocation ne révoque rien — et
        `anon` garde `EXECUTE` par héritage.
     5. **`anon` oublié.** C'est l'écart voulu avec `0007` : sans ce `GRANT`, la
        page publique appelle une fonction interdite, l'inscription se fait sans
        désignation, et « Cartes » retombe à 0 — exactement la dette que cette
        migration paie.
     6. **Un libellé dans le SQL** : « Qui vous a servi ? » appartient au
        dictionnaire (`§31.6`).
     7. **Un DDL non rejouable**, ou une table rouverte (une seule fonction
        `SECURITY DEFINER`, aucun `GRANT` de table).

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   rendu de la page (classes et copie : `adhesion-caisse.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0009_caisses_publiques.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

/** Le code hors des corps de fonction : c'est là que vivent les DDL et les droits. */
const HORS_FONCTIONS = CODE.replace(/\$fonction\$[\s\S]*?\$fonction\$/g, ' $fonction$ ')

const corpsDe = (nom) => {
  const bloc = CODE.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${nom}\\s*\\([^)]*\\)[\\s\\S]*?\\$fonction\\$;`,
      'i'
    )
  )
  assert.ok(bloc, 'la fonction « ' + nom + ' » est introuvable')
  return bloc[0]
}

const CAISSES = corpsDe('caisses_publiques')
/* ---------------------------------------------------------------------------
   1. Le contrat d'exécution
   ------------------------------------------------------------------------ */

test('0009 — la lecture est SECURITY DEFINER, avec un search_path figé', () => {
  assert.match(CAISSES, /security\s+definer/i, 'sans definer, RLS sans politique rend zéro ligne')
  assert.match(CAISSES, /set\s+search_path\s*=\s*public\s*$/im, 'search_path doit valoir « public »')
  assert.equal(/pg_temp/.test(CAISSES), false, 'pg_temp n’a rien à faire dans le search_path')
})

test('0009 — la migration est encadrée par une transaction', () => {
  assert.equal(CODE.includes('\nbegin;'), true, 'la migration n’ouvre pas de transaction')
  assert.equal(/^commit;/m.test(CODE), true, 'la migration ne referme pas sa transaction')
})

/* ---------------------------------------------------------------------------
   2. La projection : `id` et `prenom`, et rien d'autre
   ------------------------------------------------------------------------ */

test('0009 — la fonction ne rend que `id` et `prenom`', () => {
  const projection = CAISSES.match(/json_build_object\(([\s\S]*?)\)\s*order by/i)
  assert.ok(projection, 'la projection a disparu ou a changé de forme')

  const cles = [...projection[1].matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1])
  assert.deepEqual(
    cles,
    ['id', 'prenom'],
    'la fonction publique rend autre chose que de quoi dessiner un bouton'
  )

  // Les quatre chiffres du classement n'ont aucune raison d'être ici : c'est la
  // différence exacte avec `equipe_du_commerce()`, qui n'est pas accordée à `anon`.
  for (const fuite of ['ca', 'scans', 'points', 'cartes', 'role', 'actif']) {
    assert.equal(
      new RegExp(`'${fuite}'\\s*,`).test(projection[1]),
      false,
      `« ${fuite} » est rendu par une fonction publique`
    )
  }
})

test('0009 — seules les caisses actives sont proposées', () => {
  const filtre = CAISSES.match(/from\s+public\.staff\s+s\s+where\s+([^\n;]+)/i)
  assert.ok(filtre, 'la fonction ne lit plus `public.staff`')
  assert.match(filtre[1], /s\.active/, 'une caisse désactivée serait proposée au client')
})

test('0009 — l’ordre est total : prénom, puis identifiant', () => {
  /* L'`order by` cherché est celui de **la liste**, pas celui du programme :
     la première version de ce test prenait le premier `order by` du fichier
     (`p.created_at, p.id`) et passait au vert en ne mesurant rien de la liste —
     le faux vert du §37.6. On ancre donc sur `json_build_object`, et l'assertion
     porte sur la clause qui le suit. */
  const ordre = CAISSES.match(/json_build_object\([\s\S]*?\)\s*order\s+by\s+([^)]+)\)/i)
  assert.ok(ordre, 'aucun ordre sur la liste : elle peut changer de place d’un appel à l’autre')
  assert.match(ordre[1], /s\.first_name/i, 'l’ordre ne commence plus par le prénom')
  assert.match(ordre[1], /s\.id/i, 'l’ordre n’est pas départagé par l’identifiant')
})


test('0009 — le slug valide un programme, il ne filtre pas la liste', () => {
  // Même contrat de départage que `0003`/`0007` : deux programmes actifs ne
  // doivent pas rendre un slug différent d'un appel à l'autre.
  assert.match(
    CAISSES,
    /order\s+by\s+p\.created_at,\s*p\.id/i,
    'le départage du programme a disparu'
  )
  assert.match(
    CAISSES,
    /raise\s+exception\s+'PROGRAM_NOT_FOUND'/i,
    'le refus `PROGRAM_NOT_FOUND` a disparu'
  )
})


/* ---------------------------------------------------------------------------
   3. Les droits
   ------------------------------------------------------------------------ */

test('0009 — le `REVOKE` nomme les trois rôles, puis `anon` reçoit `EXECUTE`', () => {
  assert.equal(
    /grant\s+execute\s+on\s+function\s+public\.caisses_publiques\(varchar\)\s+to\s+anon/i.test(
      HORS_FONCTIONS
    ),
    true,
    'la page publique n’a pas le droit d’appeler sa propre lecture'
  )

  const revoke = HORS_FONCTIONS.match(
    /revoke\s+execute\s+on\s+function\s+public\.caisses_publiques\(varchar\)\s+from\s+([^;]+);/i
  )
  assert.ok(revoke, 'aucun `revoke` : le privilège par défaut du schéma reste')
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(revoke[1], new RegExp(`\\b${role}\\b`, 'i'), `« ${role} » n’est pas révoqué`)
  }
})

test('0009 — aucune table n’est rouverte', () => {
  assert.equal(
    /grant\s+[a-z\s,]*\s+on\s+table/i.test(HORS_FONCTIONS),
    false,
    'un `GRANT` de table ouvre `staff` là où une fonction suffit'
  )
  assert.equal(
    /create\s+policy/i.test(HORS_FONCTIONS),
    false,
    'une politique RLS remplace la doctrine « tout par fonction »'
  )
})

/* ---------------------------------------------------------------------------
   4. Ce que le SQL ne doit pas contenir
   ------------------------------------------------------------------------ */

test('0009 — aucun libellé d’affichage dans le SQL', () => {
  /* On lit le **code**, pas le fichier : l'en-tête cite la capture mot pour mot
     (« Qui vous a servi ? »), et c'est une citation, pas une production. Un
     test qui lit un commentaire fabrique un faux rouge ici, et un faux vert
     partout ailleurs (§37.6). */
  for (const mot of ['Qui vous a servi', 'facultatif']) {
    assert.equal(CODE.includes(mot), false, `« ${mot} » appartient au dictionnaire`)
  }
  // Et aucun nom de cible recopié : la décision de nommage l'interdit.
  assert.equal(CODE.includes('Fidelix'), false, 'le nom de la cible est recopié dans le SQL')
})


