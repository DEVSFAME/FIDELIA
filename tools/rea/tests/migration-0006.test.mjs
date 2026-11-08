/* ============================================================================
   Garde sur `migrations/0006` — le **modèle** d'équipe et la désignation.

   Une migration ne s'exécute pas ici : on vérifie ce qui se relit et qui casse
   silencieusement. Les fautes que cette migration existe pour ne pas commettre :

     1. **`on delete cascade` sur `clients.designated_staff_id`.** Supprimer une
        caisse effacerait des **clients** — donc leurs cartes, donc leurs
        transactions. Aucune erreur, aucun écran rouge : « Cartes » tombe à
        zéro. C'est la faute la plus coûteuse du fichier, et la plus discrète.
     2. **`on delete cascade` sur `loyalty_transactions.staff_id`.** Supprimer
        une caisse retirerait ses scans du chiffre d'affaires. Le CA baisse, et
        rien ne le dit. Une transaction est une pièce comptable : `RESTRICT`.
     3. **RLS non activée, ou table rendue à `anon`/`authenticated`.** `staff`
        porte des noms d'employés : une liste nominative ne s'ouvre pas par
        héritage de schéma.
     4. **La désignation posée sur `loyalty_cards`.** « Cartes » compte les
        **clients** qui ont désigné (la capture le dit mot pour mot) ; compter
        des cartes serait un autre chiffre sous le même mot (`§31.3`).
     5. **Un vocabulaire de rôle inventé.** Les deux portées mesurées sont
        « Caisses employé » et « Responsables ». Un troisième rôle serait une
        valeur que l'écran ne sait pas afficher.
     6. **Un DDL non idempotent.** Rejouer le fichier doit être sans effet : la
        leçon de la fusion `0001`/`0002`.
     7. **Un `INSERT` de amorçage.** Une migration de schéma ne laisse pas de
        ligne derrière elle ; la base doit rester telle qu'on l'a trouvée.
     8. **Une colonne `not null`.** `join_loyalty_program` écrit un client
        anonyme sans désignation : `not null` casserait l'inscription.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter la
   migration) ni le futur écran (`equipe_du_commerce()` n'existe pas encore).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0006_equipe_et_designation.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

/** La capture rendue de `/caisses` — le témoin du vocabulaire et des définitions. */
const CAPTURE = readFileSync(
  fileURLToPath(
    new URL(
      '../../../01_REA_Fidelix/_captures/2026-10-26-auth/rendu/a09-caisses.html',
      import.meta.url
    )
  ),
  'utf8'
)

/** Texte rendu, espaces normalisés : la capture coupe les phrases sur des balises. */
const TEXTE = CAPTURE
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')

test('0006 — une seule table est créée, et c’est l’équipe', () => {
  const creations = [...CODE.matchAll(/create\s+table\b/gi)]
  assert.equal(creations.length, 1, `une seule table attendue, trouvé ${creations.length}`)
  assert.match(CODE, /create\s+table\s+if\s+not\s+exists\s+public\.staff\s*\(/i)

  // L'écran a « Avis », mais aucune table d'avis n'existe : l'inventer ici
  // serait combler une absence de modèle en la déplaçant.
  for (const interdit of ['public.reviews', 'public.avis', 'public.restaurants']) {
    assert.equal(CODE.includes(interdit), false, `${interdit} n’appartient pas à cette migration`)
  }
})

test('0006 — les cinq colonnes de l’équipe, et les deux rôles mesurés', () => {
  const corps = CODE.match(/create\s+table\s+if\s+not\s+exists\s+public\.staff\s*\(([\s\S]*?)\);/i)
  assert.ok(corps, 'le corps de `staff` est introuvable')

  assert.match(corps[1], /id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i)
  assert.match(corps[1], /first_name\s+varchar\(80\)\s+not\s+null/i)
  assert.match(corps[1], /role\s+varchar\(16\)\s+not\s+null\s+default\s+'caisse'/i)
  assert.match(corps[1], /active\s+boolean\s+not\s+null\s+default\s+true/i)
  assert.match(corps[1], /created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i)

  const vocabulaire = corps[1].match(/check\s*\(\s*role\s+in\s*\(([^)]*)\)\s*\)/i)
  assert.ok(vocabulaire, 'aucune contrainte sur `role` : un rôle libre est une valeur non affichable')
  const valeurs = vocabulaire[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
  assert.deepEqual(valeurs, ['caisse', 'responsable'], `rôles attendus : caisse, responsable`)

  // Une caisse sans nom afficherait une cellule « Caissier » vide.
  assert.match(
    corps[1],
    /check\s*\(\s*length\(btrim\(first_name\)\)\s+between\s+1\s+and\s+80\s*\)/i,
    'un prénom vide doit être refusé par la contrainte, pas par l’écran'
  )
})

test('0006 — le vocabulaire des rôles vient de la capture (témoin)', () => {
  // Si les libellés disparaissent de la capture, le test le dit au lieu de
  // comparer deux fois la même constante (§24.2).
  assert.ok(
    TEXTE.includes('Caisses employé'),
    'la capture ne porte plus « Caisses employé » : le rôle `caisse` n’a plus de témoin'
  )
  assert.ok(
    TEXTE.includes('Responsables'),
    'la capture ne porte plus « Responsables » : le rôle `responsable` n’a plus de témoin'
  )

  // La phrase qui définit « Cartes » — c'est elle qui justifie la colonne sur
  // `clients` plutôt que sur `loyalty_cards`.
  assert.ok(
    TEXTE.includes('ont désigné ce caissier'),
    'la capture ne définit plus « Cartes » : la désignation n’a plus de témoin'
  )
})

test('0006 — la RLS est activée et aucune politique n’est créée', () => {
  assert.match(
    CODE,
    /alter\s+table\s+public\.staff\s+enable\s+row\s+level\s+security\s*;/i,
    'la RLS doit être activée sur `staff`'
  )
  assert.equal(
    /create\s+policy/i.test(CODE),
    false,
    'aucune CREATE POLICY : refus par défaut, comme les cinq tables mesurées'
  )
  assert.equal(
    /disable\s+row\s+level\s+security/i.test(CODE),
    false,
    'la RLS ne doit être désactivée nulle part'
  )
})

test('0006 — l’équipe n’est lisible ni par anon ni par authenticated', () => {
  const revokes = [...CODE.matchAll(/revoke\s+all\s+on\s+table\s+([^;]*?)\s+from\s+([^;]*);/gi)]
  assert.equal(revokes.length, 1, `un seul REVOKE de table attendu, trouvé ${revokes.length}`)
  assert.match(revokes[0][1], /public\.staff/i, 'le REVOKE doit porter sur `public.staff`')
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(revokes[0][2], new RegExp(`\\b${role}\\b`, 'i'), `le REVOKE doit nommer ${role}`)
  }

  const grants = [...CODE.matchAll(/grant\s+([^;]*?)\s+on\s+table\s+([^;]*?)\s+to\s+([^;]*);/gi)]
  assert.ok(grants.length > 0, 'aucun GRANT de table : `service_role` perdrait l’accès')
  for (const grant of grants) {
    assert.match(grant[2], /public\.staff/i, `un GRANT hors de \`staff\` : ${grant[2].trim()}`)
    assert.equal(/\banon\b/i.test(grant[3]), false, 'la liste nominative ne s’ouvre pas à `anon`')
    assert.equal(
      /\bauthenticated\b/i.test(grant[3]),
      false,
      'la liste nominative ne s’ouvre pas à `authenticated` : elle passe par une fonction'
    )
  }
})

test('0006 — la désignation est posée sur `clients`, et elle reste nullable', () => {
  const ajout = CODE.match(
    /alter\s+table\s+public\.clients\s+add\s+column\s+if\s+not\s+exists\s+([a-z_]+)\s+([a-z]+)\s*;/i
  )
  assert.ok(ajout, 'aucune colonne ajoutée à `clients`')
  assert.equal(ajout[1], 'designated_staff_id', `colonne attendue : designated_staff_id`)
  assert.equal(ajout[2].toLowerCase(), 'uuid')
  assert.equal(
    /not\s+null/i.test(ajout[0]),
    false,
    '`join_loyalty_program` écrit un client sans désignation : `not null` casserait l’inscription'
  )

  // « Cartes » compte des clients : la colonne ne peut pas vivre sur la carte.
  assert.equal(
    /alter\s+table\s+public\.loyalty_cards/i.test(CODE),
    false,
    '`loyalty_cards` n’est pas modifiée : compter des cartes serait un autre chiffre sous le même mot'
  )
})

test('0006 — supprimer une caisse ne supprime pas un client (SET NULL)', () => {
  const fk = CODE.match(/add\s+constraint\s+clients_designated_staff_id_fkey[\s\S]*?;/i)
  assert.ok(fk, 'la clé étrangère de la désignation est introuvable')

  assert.match(fk[0], /foreign\s+key\s*\(\s*designated_staff_id\s*\)\s*references\s+public\.staff\s*\(\s*id\s*\)/i)
  assert.match(fk[0], /on\s+delete\s+set\s+null/i, 'règle attendue : ON DELETE SET NULL')
  assert.equal(
    /on\s+delete\s+cascade/i.test(fk[0]),
    false,
    'CASCADE ici effacerait des clients — donc leurs cartes, donc leurs transactions'
  )
})

test('0006 — supprimer une caisse ne retire pas son chiffre d’affaires (RESTRICT)', () => {
  const fk = CODE.match(/add\s+constraint\s+loyalty_transactions_staff_id_fkey[\s\S]*?;/i)
  assert.ok(fk, '`staff_id` flotte encore : aucune clé étrangère vers `staff`')

  assert.match(fk[0], /foreign\s+key\s*\(\s*staff_id\s*\)\s*references\s+public\.staff\s*\(\s*id\s*\)/i)
  assert.match(fk[0], /on\s+delete\s+restrict/i, 'règle attendue : ON DELETE RESTRICT')
  assert.equal(
    /on\s+delete\s+cascade/i.test(fk[0]),
    false,
    'CASCADE retirerait les scans du chiffre d’affaires sans qu’aucun écran ne le voie'
  )

  // `staff_id` nul = le titulaire (mesuré : « Titulaire | Vous »). Le rendre
  // obligatoire obligerait à inventer une caisse pour chaque opération.
  assert.equal(
    /alter\s+table\s+public\.loyalty_transactions\s+alter\s+column\s+staff_id\s+set\s+not\s+null/i.test(
      CODE
    ),
    false,
    '`staff_id` doit rester nullable : nul veut dire « le titulaire »'
  )
})

test('0006 — l’index sert le comptage par caissier désigné', () => {
  const index = CODE.match(
    /create\s+index\s+if\s+not\s+exists\s+([a-z_]+)\s+on\s+public\.clients\s*\(([^)]*)\)/i
  )
  assert.ok(index, 'aucun index sur la désignation : chaque affichage relit `clients` en entier')
  assert.equal(index[1], 'clients_designated_staff_id_idx')
  assert.equal(index[2].trim(), 'designated_staff_id')
})

test('0006 — la migration n’écrit aucune ligne', () => {
  // Une migration de schéma ne sème pas de données : la base doit rester telle
  // qu'on l'a trouvée, et un `INSERT` de amorçage ferait apparaître une caisse
  // que personne n'a créée.
  for (const ecriture of [
    [/\binsert\s+into\b/i, 'INSERT'],
    [/\bupdate\s+public\./i, 'UPDATE'],
    [/\bdelete\s+from\b/i, 'DELETE'],
    [/\btruncate\s+(table\s+)?public\./i, 'TRUNCATE'],
  ]) {
    assert.equal(ecriture[0].test(CODE), false, `aucun ${ecriture[1]} dans une migration de schéma`)
  }
})

test('0006 — chaque objet est créé sous garde : rejouer ne lève rien', () => {
  // `create table` / `create index` / `add column` portent leur garde en clair.
  const creations = [...CODE.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?/gi)]
  for (const creation of creations) {
    assert.match(creation[0], /if\s+not\s+exists/i, `CREATE TABLE sans garde : ${creation[0]}`)
  }
  for (const creation of CODE.matchAll(/create\s+index\s+(?:if\s+not\s+exists\s+)?/gi)) {
    assert.match(creation[0], /if\s+not\s+exists/i, `CREATE INDEX sans garde : ${creation[0]}`)
  }

  // Une clé étrangère ne se nomme pas dans un `add column` : les deux ajouts
  // sont donc dans un bloc `do`, et chaque bloc interroge `pg_constraint`.
  const blocs = [...CODE.matchAll(/do\s+\$garde\$[\s\S]*?end;\s*\$garde\$/gi)]
  assert.equal(blocs.length, 2, `deux blocs de garde attendus, trouvé ${blocs.length}`)
  for (const bloc of blocs) {
    assert.match(bloc[0], /from\s+pg_constraint/i, 'la garde doit interroger `pg_constraint`')
    assert.match(bloc[0], /conname\s*=\s*'[a-z_]+_fkey'/i, 'la garde doit nommer la contrainte')
  }
})

test('0006 — une seule transaction, et c’est un fichier de schéma', () => {
  const debuts = [...CODE.matchAll(/^\s*begin\s*;/gim)]
  const fins = [...CODE.matchAll(/^\s*commit\s*;/gim)]
  assert.equal(debuts.length, 1, `« begin; » attendu une fois, trouvé ${debuts.length}`)
  assert.equal(fins.length, 1, `« commit; » attendu une fois, trouvé ${fins.length}`)

  const premierCorps = CODE.search(/^\s*(create|alter|do|revoke|grant)\s/im)
  assert.ok(premierCorps > 0, 'aucun DDL trouvé')
  assert.ok(debuts[0].index < premierCorps, '« begin; » doit précéder le premier DDL')
  assert.ok(fins[0].index > CODE.lastIndexOf('$garde$'), '« commit; » doit suivre la dernière garde')

  const apres = CODE.slice(fins[0].index + fins[0][0].length).trim()
  assert.equal(apres, '', `du SQL traîne après le « commit; » : « ${apres.slice(0, 60)} »`)

  // Le modèle d'abord : aucune fonction dans ce fichier. `equipe_du_commerce()`
  // est la tâche suivante, et une RPC écrite ici précéderait son modèle.
  assert.equal(
    /create\s+or\s+replace\s+function/i.test(CODE),
    false,
    'aucune fonction : cette migration ne livre que le modèle'
  )
})


