/* ============================================================================
   Garde sur `migrations/0011` — la fiche établissement (page `/settings`, P0-2).

   La migration n'est pas exécutée ici (elle ne l'est pas encore en base au
   moment où ces lignes sont écrites). On vérifie ce qui se relit dans le texte,
   et surtout ce qui casserait **en silence** une fois passée :

     1. **Une colonne sans borne ni description.** `geofence_radius_m` sans
        `check` accepterait 12 km ; `type_activite` sans `check` accepterait
        « franchise » et l'écran n'aurait plus de menu d'où le corriger.
     2. **Un `add column` sans `if not exists`** : la migration rejouée sur une
        base à moitié migrée s'arrête au milieu, et le déploiement bloque.
     3. **Un pas de 50 vérifié seulement dans le navigateur.** Le `step="50"` de
        la cible est une règle d'interface ; un `POST` direct passe outre. Le
        `% 50` doit être dans la fonction.
     6. **Une lecture sans refus** (`PROGRAM_NOT_FOUND`) : l'écran afficherait
        quatorze champs vides comme s'ils étaient enregistrés.
     4. **Un refus qui n'est pas un refus** : chaque `raise` doit lever un code
        présent dans `CODES_CONNUS` (`lib/donnees.mjs`), sinon il tombe en
        `indisponible` et l'écran annonce une panne là où la base a dit « non ».
     5. **`anon` accordé par distraction** : la fiche porte le téléphone,
        l'adresse et la géofence du commerçant.
     7. **Une écriture qui crée, ou qui touche à `programme_public`** : la fiche
        est commerciale, la page publique d'adhésion a son propre contrat
        (`0003`), et `enregistrer_programme` reste seul à créer un programme.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   rendu de l'écran (`fiche-etablissement.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0011_fiche_etablissement.sql')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
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

const LECTURE = corpsDe('fiche_du_commerce')
const ECRITURE = corpsDe('enregistrer_fiche_etablissement')

/** Les treize colonnes ajoutées, avec le type attendu. */
const COLONNES = Object.freeze([
  ['type_activite', 'varchar(16)'],
  ['phone', 'text'],
  ['city', 'text'],
  ['address', 'text'],
  ['description', 'text'],
  ['site_url', 'text'],
  ['reservation_url', 'text'],
  ['instagram_url', 'text'],
  ['facebook_url', 'text'],
  ['tiktok_url', 'text'],
  ['lien_localisation', 'text'],
  ['geofence_radius_m', 'integer'],
  ['geofence_texte', 'varchar(120)'],
])

/* ---------------------------------------------------------------------------
   1. Les colonnes
   ------------------------------------------------------------------------ */

test('0011 — les treize colonnes sont ajoutées, rejouables, et décrites', () => {
  for (const [colonne, type] of COLONNES) {
    assert.ok(
      new RegExp(
        `add\\s+column\\s+if\\s+not\\s+exists\\s+${colonne}\\s+${type.replace(/[()]/g, '\\$&')}`,
        'i'
      ).test(CODE),
      `colonne absente, mal typée ou non rejouable : « ${colonne} »`
    )
    assert.ok(
      new RegExp(`comment\\s+on\\s+column\\s+public\\.loyalty_programs\\.${colonne}\\s+is`, 'i').test(
        CODE
      ),
      `colonne sans description : « ${colonne} »`
    )
  }
  assert.equal(COLONNES.length, 13, 'la cible porte treize colonnes nouvelles')
})

test('0011 — `type_activite` ne peut valoir que les trois options du menu', () => {
  const definition = CODE.match(/add\s+column\s+if\s+not\s+exists\s+type_activite[\s\S]{0,200}/i)
  assert.ok(definition, 'définition de `type_activite` introuvable')
  assert.match(definition[0], /not\s+null/i)
  assert.match(definition[0], /default\s+'physique'/i, 'le menu n’a pas d’option vide')
  assert.match(
    definition[0],
    /check\s*\(\s*type_activite\s+in\s*\(\s*'physique'\s*,\s*'en_ligne'\s*,\s*'mixte'\s*\)/i
  )
})

test('0011 — le rayon naît à 1000 et ne sort pas de 50–2000', () => {
  const definition = CODE.match(/add\s+column\s+if\s+not\s+exists\s+geofence_radius_m[\s\S]{0,300}/i)
  assert.ok(definition, 'définition du rayon introuvable')
  assert.match(definition[0], /not\s+null/i)
  assert.match(definition[0], /default\s+1000/i, 'le `placeholder` de la cible vaut 1000')
  // `between` est inclusif : 50 et 2000 sont des valeurs permises par la cible.
  assert.match(definition[0], /geofence_radius_m\s+between\s+50\s+and\s+2000/i)
})

test('0011 — le message est borné à 120, sans défaut figé', () => {
  const definition = CODE.match(/add\s+column\s+if\s+not\s+exists\s+geofence_texte[\s\S]{0,150}/i)
  assert.ok(definition, 'définition du message introuvable')
  assert.equal(
    /default/i.test(definition[0]),
    false,
    'un défaut figé empêcherait le nom du commerce de changer dans le message'
  )
})

/* ---------------------------------------------------------------------------
   2. La lecture
   ------------------------------------------------------------------------ */

test('0011 — la lecture est définie par le propriétaire et départage comme `0003`', () => {
  assert.match(LECTURE, /security\s+definer/i)
  assert.match(LECTURE, /set\s+search_path\s*=\s*public/i)
  assert.match(LECTURE, /returns\s+json/i)
  assert.match(LECTURE, /where\s+p\.active/i, 'la fiche est celle du programme actif')
  assert.match(LECTURE, /order\s+by\s+p\.created_at\s*,\s*p\.id/i, 'départage différent de `0003`')
  assert.match(LECTURE, /raise\s+exception\s+'PROGRAM_NOT_FOUND'/i)
})

test('0011 — la lecture rend les quatorze champs, sans en oublier un', () => {
  for (const champ of [
    'name',
    'type_activite',
    'phone',
    'city',
    'address',
    'description',
    'site_url',
    'reservation_url',
    'instagram_url',
    'facebook_url',
    'tiktok_url',
    'lien_localisation',
    'geofence_radius_m',
    'geofence_texte',
  ]) {
    assert.ok(LECTURE.includes(`'${champ}'`), `champ non rendu par la lecture : « ${champ} »`)
  }
})

/* ---------------------------------------------------------------------------
   3. L'écriture
   ------------------------------------------------------------------------ */

test('0011 — l’écriture prend les quatorze paramètres, un par champ', () => {
  const signature = ECRITURE.slice(0, ECRITURE.indexOf('returns'))
  for (const champ of [
    'name',
    'type_activite',
    'phone',
    'city',
    'address',
    'description',
    'site_url',
    'reservation_url',
    'instagram_url',
    'facebook_url',
    'tiktok_url',
    'lien_localisation',
    'geofence_radius_m',
    'geofence_texte',
  ]) {
    assert.match(signature, new RegExp(`\\bp_${champ}\\b`), `paramètre manquant : « p_${champ} »`)
  }
  assert.match(ECRITURE, /security\s+definer/i)
  assert.match(ECRITURE, /set\s+search_path\s*=\s*public/i)
})

test('0011 — un seul `update`, après les refus : jamais la moitié d’une fiche', () => {
  const misesAJour = ECRITURE.match(/\bupdate\s+public\.loyalty_programs\b/gi) ?? []
  assert.equal(misesAJour.length, 1, 'l’écriture doit tenir en un seul `update`')

  assert.equal(/insert\s+into/i.test(ECRITURE), false, 'la fiche ne crée pas de programme')
  assert.equal(/delete\s+from/i.test(ECRITURE), false, 'la fiche ne supprime rien')

  // Les refus vivent avant l'update : après, ils n'empêcheraient plus rien.
  const premierRefus = ECRITURE.search(/raise\s+exception/i)
  const update = ECRITURE.search(/update\s+public\.loyalty_programs/i)
  assert.ok(premierRefus > 0 && premierRefus < update, 'un refus est vérifié après l’écriture')
})

test('0011 — le pas de 50 et l’effacement sont vérifiés en base', () => {
  // Le `step="50"` du formulaire est une règle d'interface : un POST direct passe.
  assert.match(ECRITURE, /%\s*50\s*(<>|!=)\s*0|mod\s*\(\s*p_geofence_radius_m\s*,\s*50\s*\)/i)
  // Un champ vidé efface la colonne : `nullif(btrim(…))`, sinon il resterait l'ancienne.
  assert.match(ECRITURE, /nullif\s*\(\s*btrim\s*\(/i)
})

test('0011 — chaque refus lève un code que `donnees.mjs` connaît', () => {
  const codes = [...ECRITURE.matchAll(/raise\s+exception\s+'([A-Z0-9_]+)'/g)].map(
    (trouve) => trouve[1]
  )
  assert.deepEqual(codes.sort(), [
    'INVALID_GEOFENCE_TEXTE',
    'INVALID_NAME',
    'INVALID_RADIUS',
    'INVALID_TYPE_ACTIVITE',
    // Une base sans programme n'a pas de fiche à mettre à jour : le refus est
    // le même qu'à la lecture, et l'écran l'a déjà traduit.
    'PROGRAM_NOT_FOUND',
  ])

  const connus = DONNEES.slice(DONNEES.indexOf('CODES_CONNUS'), DONNEES.indexOf('])', DONNEES.indexOf('CODES_CONNUS')))
  for (const code of codes) {
    assert.ok(connus.includes(`'${code}'`), `code absent de CODES_CONNUS : « ${code} »`)
  }

  // Un libellé français dans un `raise` s'afficherait tel quel à l'écran.
  for (const libelle of ECRITURE.matchAll(/raise\s+exception\s+'([^']*)'/g)) {
    assert.match(libelle[1], /^[A-Z0-9_]+$/, `message non codé : « ${libelle[1]} »`)
  }
})

/* ---------------------------------------------------------------------------
   4. Les droits
   ------------------------------------------------------------------------ */

test('0011 — les deux fonctions sont révoquées puis accordées à `authenticated`', () => {
  const revokes = [...CODE.matchAll(/revoke\s+execute\s+on\s+function[\s\S]{0,200}?;/gi)].map(
    (trouve) => trouve[0]
  )
  assert.equal(revokes.length, 2, 'un `revoke` par fonction')
  for (const revoke of revokes) {
    assert.match(revoke, /from\s+public\s*,\s*anon\s*,\s*authenticated/i)
  }

  const grants = [...CODE.matchAll(/grant\s+execute\s+on\s+function[\s\S]{0,200}?;/gi)].map(
    (trouve) => trouve[0]
  )
  assert.equal(grants.length, 2, 'un `grant` par fonction')
  for (const grant of grants) {
    assert.match(grant, /to\s+authenticated\s*,\s*service_role/i)
    assert.equal(/\banon\b/i.test(grant), false, '`anon` ne lit pas la fiche')
  }

  // Aucun droit de table : la doctrine `0003` → `0010` ne change pas ici.
  assert.equal(/grant\s+(select|insert|update|delete)\s+on/i.test(CODE), false, 'droit de table')
  assert.equal(/alter\s+table[\s\S]{0,100}enable\s+row\s+level\s+security/i.test(CODE), false)
})

test('0011 — la fiche ne touche ni `programme_public` ni `enregistrer_programme`', () => {
  for (const intouchable of ['programme_public', 'enregistrer_programme', 'credits_par_euro']) {
    assert.equal(
      CODE.includes(intouchable),
      false,
      `la fiche modifie « ${intouchable} » — contrat d’une autre page`
    )
  }
})

test('0011 — la migration est une seule transaction, refermée', () => {
  assert.equal((CODE.match(/\bbegin\s*;/gi) ?? []).length, 1, 'un seul `begin;`')
  assert.equal((CODE.match(/\bcommit\s*;/gi) ?? []).length, 1, 'un seul `commit;`')
  assert.match(CODE.trimEnd(), /commit\s*;$/i, 'la migration ne se referme pas')

  // Pas de `drop` : une colonne retirée efface des données que l'écran relit.
  assert.equal(/drop\s+(column|table)/i.test(CODE), false, 'la migration détruit une colonne')
})

