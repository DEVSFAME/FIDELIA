/* ============================================================================
   Garde sur `migrations/0007` — le chemin de la désignation, puis la lecture.

   Une migration ne s'exécute pas ici : on vérifie ce qui se relit et qui casse
   silencieusement. Les fautes que ce fichier existe pour ne pas commettre :

     1. **« Cartes » compté sur `loyalty_cards`.** La capture définit la colonne
        mot pour mot : « les clients qui ont **désigné** ce caissier ». Compter
        des cartes serait un autre chiffre sous le même mot (`§31.3`, `§32.1`),
        et aucun écran ne le verrait. C'est la faute la plus coûteuse du lot.
     2. **« Avis » rendu à `0`.** Aucune table d'avis n'existe : `0` serait un
        fait inventé. L'absence se déclare, elle ne se compte pas.
     3. **Un titulaire filtré.** `staff_id IS NULL` **est** la ligne du
        titulaire (`§32.2`) ; la traiter comme une anomalie ferait disparaître
        la seule ligne que la capture montre.
     4. **Une période qui dérive.** 30 jours devenus 7, ou une clé inconnue qui
        retombe sur un défaut : rien n'échoue, et l'écran affirme autre chose
        (`§31.4`). Le vocabulaire est fermé et les quatre fenêtres sont ici.
     5. **La surcharge à un argument laissée en place.** Deux candidates pour
        l'appel `{ p_slug }`, donc une ambiguïté à l'adhésion.
     6. **La désignation avalée.** Un identifiant de caisse inconnu écrit en
        `null` perd le choix du client sans un mot, et la clé étrangère ne le
        voit pas (`null` est valide).
     7. **`REVOKE … FROM PUBLIC` seul**, ou l'inverse : `anon` qui lit le
        classement (prénoms + chiffre d'affaires), ou `anon` qui perd
        l'inscription publique.
     8. **Un libellé dans le SQL.** « Vous », « Titulaire », « Cartes » : la
        fonction rend des clés, le dictionnaire rend les mots (`§31.6`).
     9. **Une écriture hors des fonctions**, ou un DDL non rejouable.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni
   l'écran `/caisses` (il n'existe pas encore).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0007_equipe_lecture.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

/** Le code hors des corps de fonction : c'est là que vivent les DDL. */
const HORS_FONCTIONS = CODE.replace(/\$fonction\$[\s\S]*?\$fonction\$/g, ' $fonction$ ')

/** La capture rendue de `/caisses` — témoin des libellés et des définitions. */
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

/** Les quatre périodes : le libellé de la capture, la clé du SQL, la fenêtre. */
const PERIODES = [
  { libelle: '7 jours', cle: '7j', jours: 7 },
  { libelle: '30 jours', cle: '30j', jours: 30 },
  { libelle: 'Depuis le début', cle: 'depuis_le_debut', jours: null },
  { libelle: 'Un jour précis', cle: 'jour', jours: null },
]

const corpsDe = (nom) => {
  const bloc = CODE.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nom}\\s*\\([^)]*\\)[\\s\\S]*?\\$fonction\\$;`, 'i')
  )
  assert.ok(bloc, `la fonction \`${nom}\` est introuvable`)
  return bloc[0]
}
/* ---------------------------------------------------------------------------
   1. Le contrat d'exécution : deux fonctions, definer, chemin figé.
   ------------------------------------------------------------------------ */

test('0007 — les deux fonctions sont SECURITY DEFINER avec search_path figé', () => {
  for (const nom of ['join_loyalty_program', 'equipe_du_commerce']) {
    const bloc = corpsDe(nom)
    assert.match(bloc, /security\s+definer/i, `${nom} doit être SECURITY DEFINER`)
    assert.match(bloc, /set\s+search_path\s*=\s*public\s*$/im, `${nom} : search_path doit valoir « public »`)
    assert.equal(/pg_temp/.test(bloc), false, `${nom} : pg_temp n’a rien à faire dans le search_path`)
  }
})

test('0007 — la surcharge à un argument est retirée, la neuve reste facultative', () => {
  // `web/src/lib/donnees.mjs` appelle `{ p_slug }` : si `p_staff_id` perdait sa
  // valeur par défaut, l’inscription cesserait de fonctionner — sans erreur de
  // compilation, seulement à l’usage.
  const entete = CODE.match(
    /create\s+or\s+replace\s+function\s+public\.join_loyalty_program\s*\(([^)]*)\)/i
  )
  assert.ok(entete, 'la signature de `join_loyalty_program` est introuvable')
  assert.match(entete[1], /p_slug\s+varchar\s+default\s+null/i, 'p_slug doit rester facultatif')
  assert.match(
    entete[1],
    /p_staff_id\s+uuid\s+default\s+null/i,
    'p_staff_id doit avoir une valeur par défaut, sinon l’appelant existant casse'
  )

  // Deux candidates pour un même corps JSON, c’est une ambiguïté à l’adhésion.
  const drop = CODE.match(/drop\s+function\s+[^;]*;/gi) ?? []
  assert.equal(drop.length, 1, `un seul DROP FUNCTION attendu, trouvé ${drop.length}`)
  assert.match(drop[0], /if\s+exists/i, 'le DROP doit être sous garde : rejouer ne doit rien lever')
  assert.match(drop[0], /public\.join_loyalty_program\s*\(\s*varchar\s*\)/i, 'c’est bien la signature à un argument qui disparaît')
})

test('0007 — la désignation est écrite dans le même INSERT que le client', () => {
  const insert = CODE.match(/insert\s+into\s+public\.clients\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i)
  assert.ok(insert, 'aucun INSERT de client trouvé')
  assert.equal(
    insert[1].replace(/\s+/g, ' ').trim(),
    'first_name, last_name, email, designated_staff_id',
    'la désignation doit être écrite avec le client, pas dans un second INSERT'
  )
  assert.match(insert[2], /p_staff_id/, 'la valeur insérée doit être celle reçue')

  // Une seconde écriture séparée laisserait, entre les deux, un client sans
  // désignation : l’état que « Cartes » ne sait pas distinguer d’une abstention.
  const mises = [...CODE.matchAll(/insert\s+into\s+public\.clients/gi)]
  assert.equal(mises.length, 1, `un seul INSERT dans \`clients\` attendu, trouvé ${mises.length}`)
  assert.equal(
    /update\s+public\.clients/i.test(CODE),
    false,
    'aucun UPDATE de rattrapage : la désignation s’écrit à la création'
  )
  assert.equal(
    /update\s+public\.loyalty_cards/i.test(CODE),
    false,
    'la désignation ne vit pas sur la carte'
  )
})

test('0007 — une caisse inconnue est refusée, et le refus précède l’écriture', () => {
  const corps = corpsDe('join_loyalty_program')
  assert.match(corps, /raise\s+exception\s+'STAFF_NOT_FOUND'/i, 'le refus doit être nommé, pas silencieux')
  assert.match(
    corps,
    /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.staff/i,
    'l’existence de la caisse doit être vérifiée sur `public.staff`'
  )

  // Le refus doit tomber AVANT l’insertion : après, il resterait un client.
  const garde = corps.search(/STAFF_NOT_FOUND/i)
  const ecriture = corps.search(/insert\s+into\s+public\.clients/i)
  assert.ok(garde > 0 && ecriture > 0, 'garde ou écriture introuvable')
  assert.ok(garde < ecriture, 'la vérification doit précéder l’insertion du client')

  // Une caisse désactivée reste désignable : refuser ici casserait une
  // inscription au moment où le client découvre le produit.
  assert.equal(
    /from\s+public\.staff\s+\w+\s+where[^;]*\bactive\b/i.test(corps),
    false,
    'une caisse désactivée reste désignable : ne pas filtrer sur `active`'
  )
})


/* ---------------------------------------------------------------------------
   2. « Cartes » n’est pas un comptage de cartes — le cœur du fichier.
   ------------------------------------------------------------------------ */

test('0007 — « Cartes » compte des clients qui ont désigné, jamais des cartes', () => {
  const corps = corpsDe('equipe_du_commerce')

  // La source du comptage est `clients`, groupée par la colonne de désignation.
  assert.match(corps, /from\s+public\.clients\s+\w+/i, 'le comptage doit lire `public.clients`')
  assert.match(
    corps,
    /group\s+by\s+\w*\.?designated_staff_id/i,
    'le regroupement doit porter sur `designated_staff_id`'
  )

  // Compter des cartes serait le même mot pour un autre chiffre.
  assert.equal(
    /loyalty_cards/i.test(corps),
    false,
    '`loyalty_cards` n’a rien à faire ici : « Cartes » compte des clients désignés'
  )
  assert.equal(
    /count\s*\(\s*distinct/i.test(corps),
    false,
    'aucun `count(distinct …)` : la cardinalité est déjà celle des clients'
  )
})

test('0007 — « Avis » est une absence déclarée, pas un zéro', () => {
  const corps = corpsDe('equipe_du_commerce')

  assert.match(corps, /'avis',\s*\w+\.avis/i, 'la colonne doit être rendue, même absente')
  assert.match(corps, /null::integer\s+as\s+avis/i, 'la valeur d’une absence est `null`, jamais `0`')
  assert.match(corps, /'absences',\s*json_build_array\(\s*'avis'\s*\)/i, 'l’absence doit être déclarée')

  for (const table of ['reviews', 'avis', 'ratings']) {
    assert.equal(CODE.includes(`public.${table}`), false, `${table} n’existe pas : la migration ne l’invente pas`)
  }
})

test('0007 — le titulaire est toujours une ligne, jamais une anomalie', () => {
  const corps = corpsDe('equipe_du_commerce')

  // Une ligne nulle ajoutée aux caisses : c’est elle, le titulaire (`§32.2`).
  assert.match(corps, /union\s+all/i, 'la ligne du titulaire doit être ajoutée, pas déduite d’un joint')
  assert.match(corps, /select\s+null::uuid/i, 'la ligne du titulaire porte un `staff_id` nul')

  // **Deux** jointures, donc deux appariements : `cartes` ET `scans`. Une seule
  // des deux suffirait à faire tomber les agrégats du titulaire — et une garde
  // qui n’en vérifie qu’une laisse passer exactement la moitié du défaut.
  const appariements = (corps.match(/is\s+not\s+distinct\s+from/gi) ?? []).length
  assert.equal(
    appariements,
    2,
    `les deux jointures doivent apparier le \`null\` (cartes et scans), trouvé ${appariements}`
  )

  // Désactiver une caisse ne doit pas effacer son histoire, ni la ligne du
  // titulaire : aucun filtre sur `active` dans le corps.
  assert.equal(
    /from\s+public\.staff\s+\w+\s+where[^;]*\bactive\b/i.test(corps),
    false,
    'aucune caisse n’est filtrée sur `active` : le classement est une histoire'
  )
  assert.match(corps, /'actif',\s*\w+\.actif/i, 'l’état doit être rendu pour que l’écran le marque')
})

/* ---------------------------------------------------------------------------
   3. Les quatre périodes : un vocabulaire fermé, et des définitions dans le SQL.
   ------------------------------------------------------------------------ */

test('0007 — le vocabulaire des périodes est fermé, et c’est celui de la capture', () => {
  const corps = corpsDe('equipe_du_commerce')
  const vocabulaire = corps.match(/not\s+in\s*\(([^)]*)\)/i)
  assert.ok(vocabulaire, 'aucune liste fermée de périodes : une clé inconnue passerait')

  const cles = vocabulaire[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
  assert.deepEqual(
    cles.sort(),
    PERIODES.map((p) => p.cle).sort(),
    `clés attendues : ${PERIODES.map((p) => p.cle).join(', ')}`
  )

  // Le témoin : les quatre libellés sont dans la capture. S’il en manque un,
  // c’est la capture qui a changé — et le test le dit au lieu de comparer deux
  // fois la même constante (`§24.2`).
  for (const { libelle } of PERIODES) {
    assert.ok(TEXTE.includes(libelle), `la capture ne porte plus « ${libelle} »`)
  }

  // Trois refus nommés : une période inventée, un jour sans date, un fuseau
  // inconnu ne retombent sur aucun défaut silencieux.
  for (const refus of ['PERIODE_INCONNUE', 'JOUR_MANQUANT', 'FUSEAU_INCONNU']) {
    assert.match(corps, new RegExp(`raise\\s+exception\\s+'${refus}'`, 'i'), `le refus ${refus} manque`)
  }
})

test('0007 — les fenêtres sont écrites dans le SQL, pas seulement dans l’écran', () => {
  const corps = corpsDe('equipe_du_commerce')

  // « 7 jours » et « 30 jours » : deux fenêtres, jamais une seule réutilisée.
  const fenetres = [...corps.matchAll(/interval\s+'(\d+)\s+days?'/gi)].map((m) => Number(m[1]))
  assert.deepEqual(
    [...new Set(fenetres)].sort((a, b) => a - b),
    [7, 30],
    `fenêtres attendues : 7 et 30 jours, trouvées : ${fenetres.join(', ')}`
  )

  // « Un jour précis » : la borne est un minuit **dans le fuseau déclaré**, et
  // la fin est le lendemain — pas « maintenant », qui couperait la journée.
  assert.equal(
    (corps.match(/at\s+time\s+zone/gi) ?? []).length,
    2,
    'les deux bornes du jour doivent passer par `AT TIME ZONE`'
  )
  assert.match(corps, /\(\s*p_jour\s*\+\s*1\s*\)/i, 'la fin du jour est le lendemain, pas l’instant courant')

  // « Depuis le début » n’a pas de borne basse : la fenêtre n’est appliquée que
  // si `v_debut` existe, et cette condition doit être la même pour les deux
  // comptages — sinon « Cartes » et « Scans » ne parlent plus de la même période.
  const bornes = [...corps.matchAll(/v_debut\s+is\s+null\s+or\s*\([^)]*created_at\s*>=\s*v_debut\s+and\s+\w+\.created_at\s*<\s*v_fin\)/gi)]
  assert.equal(bornes.length, 2, `deux fenêtres identiques attendues (clients, transactions), trouvées ${bornes.length}`)

  // La définition appliquée est rendue : l’écran ne devine pas la fenêtre.
  for (const cle of ["'debut'", "'fin'", "'fuseau'", "'cle'"]) {
    assert.match(corps, new RegExp(cle), `la période rendue doit porter ${cle}`)
  }
  assert.match(corps, /p_fuseau\s+varchar\s+default\s+'UTC'/i, 'le fuseau par défaut doit être déclaré')
})


/* ---------------------------------------------------------------------------
   4. Les droits : l’inscription reste publique, le classement ne l’est pas.
   ------------------------------------------------------------------------ */

test('0007 — les deux REVOKE nomment les trois rôles, pas seulement PUBLIC', () => {
  for (const [nom, signature] of [
    ['join_loyalty_program', 'varchar,\\s*uuid'],
    ['equipe_du_commerce', 'varchar,\\s*date,\\s*varchar'],
  ]) {
    const revoke = CODE.match(
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${nom}\\s*\\(\\s*${signature}\\s*\\)[^;]*;`, 'i')
    )
    assert.ok(revoke, `REVOKE absent pour ${nom} : la fonction hériterait du droit par défaut`)
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(revoke[0], new RegExp(`\\b${role}\\b`, 'i'), `${nom} : le REVOKE doit nommer ${role}`)
    }
  }
})

test('0007 — anon garde l’inscription et perd le classement', () => {
  const grantJoin = CODE.match(
    /grant\s+execute\s+on\s+function\s+public\.join_loyalty_program\s*\(\s*varchar,\s*uuid\s*\)[^;]*;/i
  )
  assert.ok(grantJoin, 'aucun GRANT pour `join_loyalty_program` : l’inscription deviendrait inappelable')
  assert.match(grantJoin[0], /\banon\b/i, 'la page d’adhésion est publique depuis `0003` : `anon` doit garder l’appel')
  assert.match(grantJoin[0], /\bservice_role\b/i, '`service_role` doit garder l’appel')

  const grantEquipe = CODE.match(
    /grant\s+execute\s+on\s+function\s+public\.equipe_du_commerce\s*\(\s*varchar,\s*date,\s*varchar\s*\)[^;]*;/i
  )
  assert.ok(grantEquipe, 'aucun GRANT pour `equipe_du_commerce` : la lecture serait inappelable')
  assert.equal(
    /\banon\b/i.test(grantEquipe[0]),
    false,
    'le classement porte des prénoms et un chiffre d’affaires : il ne s’ouvre pas à `anon`'
  )
  for (const role of ['authenticated', 'service_role']) {
    assert.match(grantEquipe[0], new RegExp(`\\b${role}\\b`, 'i'), `le GRANT doit nommer ${role}`)
  }
})

test('0007 — aucune table n’est ouverte, aucune politique n’est créée', () => {
  assert.equal(/grant\s+[^;]*\bon\s+table\b/i.test(CODE), false, 'aucun GRANT de table : tout passe par les fonctions')
  assert.equal(/create\s+policy/i.test(CODE), false, 'aucune CREATE POLICY attendue')
  assert.equal(
    /disable\s+row\s+level\s+security/i.test(CODE),
    false,
    'la RLS ne doit être désactivée nulle part'
  )
  assert.equal(
    /alter\s+table/i.test(CODE),
    false,
    'le modèle est celui de `0006` : cette migration ne le retouche pas'
  )
})


/* ---------------------------------------------------------------------------
   5. Ce que la fonction rend — et ce qu’elle ne dit jamais.
   ------------------------------------------------------------------------ */

test('0007 — les sept th de la capture, et les clés qui les portent', () => {
  const colonnes = [...CAPTURE.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  )
  assert.equal(colonnes.length, 7, `sept th attendus dans la capture, trouvés ${colonnes.length}`)
  assert.deepEqual(colonnes, ['#', 'Caissier', 'Cartes', 'Scans', 'points', 'CA', 'Avis'])

  // Chaque colonne de données a sa clé ; « # » est un rang d’affichage, pas une
  // donnée — l’ordre est rendu par le tableau, l’écran le numérote.
  const corps = corpsDe('equipe_du_commerce')
  for (const cle of ['prenom', 'cartes', 'scans', 'points', 'ca', 'avis']) {
    assert.match(corps, new RegExp(`'${cle}',\\s*\\w+\\.${cle}`), `la clé « ${cle} » manque à la projection`)
  }

  assert.ok(TEXTE.includes('Équipe'), 'la capture ne porte plus le titre « Équipe »')
  assert.ok(TEXTE.includes("Classement de l'équipe"), 'la capture ne porte plus « Classement de l’équipe »')
})

test('0007 — aucun libellé d’affichage dans le SQL', () => {
  // Une chaîne d’affichage ici échapperait au test de copie mesurée : l’écran
  // afficherait un mot que personne ne relit (`§31.6`).
  for (const mot of ['Vous', 'Titulaire', 'Caissier', 'Cartes', 'Scans', 'Avis', '€', 'Classement']) {
    assert.equal(
      CODE.includes(`'${mot}'`),
      false,
      `« ${mot} » est un libellé : sa place est dans le dictionnaire, pas dans le SQL`
    )
  }
})

test('0007 — l’ordre est total, pas seulement « le plus de points d’abord »', () => {
  // Les ORDER BY sont multi-lignes : on compare sur une copie à plat, sinon le
  // motif s’arrête au premier saut de ligne et ne mesure qu’un fragment.
  const PLAT = CODE.replace(/\s+/g, ' ')
  const ordres = [...PLAT.matchAll(/order\s+by\s+(.*?)(?='\[\]'::json|limit\b|;)/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  )
  assert.equal(ordres.length, 3, `trois ORDER BY attendus, trouvés ${ordres.length} : ${ordres.join(' | ')}`)

  for (const ordre of ordres) {
    assert.match(
      ordre,
      /\b(id|staff_id)\b/i,
      `un ORDER BY sans clé unique laisse deux lignes permuter : « ${ordre} »`
    )
  }

  // Le classement part des points, et départage jusqu’à l’identifiant : deux
  // caisses à égalité ne doivent pas changer de place d’un appel à l’autre.
  const classement = ordres.find((o) => o.includes('points'))
  assert.ok(classement, 'aucun ordre par points : le classement n’en serait plus un')
  assert.match(classement, /points\s+desc/i, 'le premier critère du classement est le total de points')
  assert.match(classement, /staff_id\s+asc/i, 'le départage final doit être l’identifiant')
})


/* ---------------------------------------------------------------------------
   6. La forme du fichier : une transaction, aucun semis, tout rejouable.
   ------------------------------------------------------------------------ */

test('0007 — une seule transaction, et elle encadre tout le DDL', () => {
  const debuts = [...CODE.matchAll(/^\s*begin\s*;/gim)]
  const fins = [...CODE.matchAll(/^\s*commit\s*;/gim)]
  assert.equal(debuts.length, 1, `« begin; » attendu une fois, trouvé ${debuts.length}`)
  assert.equal(fins.length, 1, `« commit; » attendu une fois, trouvé ${fins.length}`)

  const premierCorps = CODE.search(/^\s*(create|drop|revoke|grant)\s/im)
  assert.ok(premierCorps > 0, 'aucun DDL trouvé')
  assert.ok(debuts[0].index < premierCorps, '« begin; » doit précéder le premier DDL')
  assert.ok(fins[0].index > CODE.lastIndexOf('grant'), '« commit; » doit suivre le dernier GRANT')

  const apres = CODE.slice(fins[0].index + fins[0][0].length).trim()
  assert.equal(apres, '', `du SQL traîne après le « commit; » : « ${apres.slice(0, 60)} »`)
})

test('0007 — la migration n’écrit aucune ligne hors des fonctions', () => {
  // Un semis ferait apparaître une caisse ou un client que personne n’a créés.
  for (const ecriture of [
    [/\binsert\s+into\b/i, 'INSERT'],
    [/\bupdate\s+public\./i, 'UPDATE'],
    [/\bdelete\s+from\b/i, 'DELETE'],
    [/\btruncate\s+(table\s+)?public\./i, 'TRUNCATE'],
  ]) {
    assert.equal(
      ecriture[0].test(HORS_FONCTIONS),
      false,
      `aucun ${ecriture[1]} hors des fonctions : une migration ne sème pas de données`
    )
  }

  // Les deux `create or replace` sont rejouables par construction ; le seul
  // DDL dont le second passage diffère est le `drop`, et il est sous garde.
  const creations = [...HORS_FONCTIONS.matchAll(/create\s+or\s+replace\s+function/gi)]
  assert.equal(creations.length, 2, `deux fonctions attendues, trouvé ${creations.length}`)
})

