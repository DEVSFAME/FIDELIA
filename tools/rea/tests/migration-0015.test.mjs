/* ============================================================================
   Garde sur `migrations/0015` — l'apparence (page `/branding`, P0-5).

   La migration n'est pas exécutée ici. On vérifie ce qui se relit dans le texte,
   et surtout ce qui casserait **en silence** une fois passée :

     1. **Une colonne sans borne.** `primary_color` sans `check` accepterait
        `red`, et l'écran peindrait un fond transparent ; `commerce_type` sans
        `check` accepterait un onzième type que l'écran ne sait pas dessiner.
     2. **Un `add column` sans `if not exists`** : la migration rejouée sur une
        base à moitié migrée s'arrête au milieu et le déploiement bloque.
     3. **Une adresse d'image non contrainte** : `javascript:` finirait dans un
        `src`, donc dans le navigateur du client.
     4. **Une lecture sans refus** (`PROGRAM_NOT_FOUND`) : l'écran afficherait
        cinq champs vides comme s'ils étaient enregistrés.
     5. **Un refus qui n'est pas un refus** : chaque `raise` doit lever un code
        présent dans `CODES_CONNUS` (`lib/donnees.mjs`), sinon il tombe en
        `indisponible` et l'écran annonce une panne là où la base a dit « non ».
     6. **`anon` accordé par distraction**, et **un `GRANT` sans `REVOKE`**
        préalable — `create function` hérite des privilèges du schéma.
     7. **Une écriture qui crée un programme** : `0015` habille un programme
        existant, elle ne l'invente pas (`enregistrer_programme` reste seul).

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   rendu de l'écran (`apparence.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0015_apparence.sql')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

/** Le code sans les commentaires `--` : la prose cite la syntaxe, elle n'en est pas. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

const TYPES = [
  'restaurant', 'cafe', 'coiffure', 'barbershop', 'pressing',
  'retoucherie', 'boucherie', 'patisserie', 'librairie', 'autre',
]

test('0015 — les quatre colonnes existent, avec `if not exists`', () => {
  for (const colonne of ['primary_color', 'commerce_type', 'logo_url', 'wallet_bg_url']) {
    assert.match(
      CODE,
      new RegExp(`add column if not exists ${colonne}\\b`),
      `la colonne ${colonne} manque, ou n’est pas rejouable`
    )
  }
  // Les bornes de type : `varchar(7)` pour `#rrggbb`, `varchar(16)` pour un type,
  // et deux `text` pour des adresses (500 caractères contrôlés par `check`).
  assert.match(CODE, /primary_color varchar\(7\)/)
  assert.match(CODE, /commerce_type varchar\(16\)/)
})

test('0015 — les défauts sont ceux de la mesure', () => {
  // `#1a1a1a` : le repli du chunk (`primary_color ?? "#1a1a1a"`) et le premier
  // des huit échantillons. `restaurant` : le repli de `commerce_type`.
  assert.match(CODE, /primary_color varchar\(7\)\s+not null default '#1a1a1a'/)
  assert.match(CODE, /commerce_type varchar\(16\) not null default 'restaurant'/)
  // Les deux adresses restent nullables : une image absente n'est pas `''`.
  assert.equal(/logo_url\s+text default/.test(CODE), false)
  assert.equal(/wallet_bg_url\s+text default/.test(CODE), false)
})

test('0015 — les dix types sont contraints, et ce sont les dix mesurés', () => {
  const bloc = CODE.slice(CODE.indexOf('loyalty_programs_commerce_type_check'))
  const valeurs = [...bloc.slice(0, 600).matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  assert.deepEqual(valeurs.slice(0, 10), TYPES, 'la liste des types a bougé')
})

test('0015 — une couleur et une adresse d’image sont contraintes en base', () => {
  // Le motif de la cible (`z.string().regex(/^#[0-9A-Fa-f]{6}$/)`), écrit ici en
  // Postgres. Sans lui, une base écrite à la main peindrait un fond transparent.
  assert.match(CODE, /primary_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'/)

  // Deux formes d'adresse, et deux seulement : `https://` ou `/`. Le motif est
  // écrit quatre fois — deux `check` de colonne et les deux contrôles de la
  // fonction — et les quatre doivent être le même.
  assert.equal((CODE.match(/~\ '\^\(https:\/\/\|\//g) ?? []).length, 4)
  assert.equal(
    (CODE.match(/char_length\((logo_url|wallet_bg_url)\) between 1 and 500/g) ?? []).length,
    2
  )
})


test('0015 — la lecture refuse l’absence de programme', () => {
  assert.match(CODE, /create or replace function public\.apparence_du_commerce\(\)/)
  assert.match(CODE, /raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001'/)
  assert.match(CODE, /security definer/)
  assert.match(CODE, /set search_path = public/)

  // Cinq champs, ceux que l'écran rend — pas la table entière.
  for (const champ of ['name', 'primary_color', 'commerce_type', 'logo_url', 'wallet_bg_url']) {
    assert.ok(CODE.includes(`'${champ}'`), `la lecture ne rend plus ${champ}`)
  }
})

test('0015 — l’écriture valide avant d’écrire, et relit ce qu’elle a écrit', () => {
  const debut = CODE.indexOf('create or replace function public.enregistrer_apparence')
  assert.ok(debut > 0, 'la fonction d’écriture manque')
  const corps = CODE.slice(debut, CODE.indexOf('$fonction$;', debut))

  // Un seul `update`, et il vient **après** les cinq contrôles.
  const positionUpdate = corps.indexOf('update public.loyalty_programs')
  assert.ok(positionUpdate > 0, 'aucun update : la fonction ne peut pas écrire')
  for (const controle of [
    'INVALID_NAME',
    'INVALID_COLOR',
    'INVALID_COMMERCE_TYPE',
    'INVALID_LOGO_URL',
    'INVALID_IMAGE_URL',
  ]) {
    const position = corps.indexOf(controle)
    assert.ok(position > 0, `${controle} n’est plus levé`)
    assert.ok(position < positionUpdate, `${controle} est vérifié après l’écriture`)
  }
  assert.equal((corps.match(/update public\.loyalty_programs/g) ?? []).length, 1)

  // Le rendu est l'état **relu**, pas les paramètres reçus.
  assert.match(corps, /return public\.apparence_du_commerce\(\)/)

  // Un champ vidé efface : `nullif(btrim(coalesce(...)))` sur les deux adresses.
  assert.ok((corps.match(/nullif\(btrim\(coalesce\(/g) ?? []).length >= 2)
})

test('0015 — chaque `raise` lève un code que le raccordement connaît', () => {
  const codes = new Set([...SQL.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))
  assert.deepEqual([...codes].sort(), [
    'INVALID_COLOR',
    'INVALID_COMMERCE_TYPE',
    'INVALID_IMAGE_URL',
    'INVALID_LOGO_URL',
    'INVALID_NAME',
    'PROGRAM_NOT_FOUND',
  ])

  for (const code of codes) {
    assert.ok(
      DONNEES.includes(`'${code}'`),
      `${code} n’est pas dans CODES_CONNUS : il sortirait en « indisponible »`
    )
  }
})

test('0015 — les droits : `REVOKE` d’abord, `anon` jamais', () => {
  const positionRevoque = CODE.indexOf('revoke execute on function public.apparence_du_commerce')
  const positionAccord = CODE.indexOf('grant execute on function public.apparence_du_commerce')
  assert.ok(positionRevoque > 0, 'aucun REVOKE : le GRANT ne fermerait rien')
  assert.ok(positionAccord > positionRevoque, 'le GRANT précède le REVOKE')

  // `PUBLIC` est retiré explicitement : `create function` hérite des privilèges
  // du schéma, donc un `REVOKE` partiel laisserait `PUBLIC` passer.
  assert.equal(CODE.includes('from public, anon, authenticated'), true)

  // Les `grant` s'étalent sur plusieurs lignes (la signature aussi) : on lit
  // chaque instruction jusqu'à son point-virgule, pas ligne par ligne.
  const accords = [...CODE.matchAll(/grant execute on function[\s\S]*?;/g)].map((m) => m[0])
  assert.equal(accords.length, 2)
  for (const instruction of accords) {
    assert.ok(
      instruction.includes('authenticated') && instruction.includes('service_role'),
      'un GRANT ne vise plus les deux rôles'
    )
    assert.equal(instruction.includes('anon'), false, 'anon est accordé par distraction')
  }
})

test('0015 — la migration habille un programme, elle n’en crée pas', () => {
  for (const interdit of ['insert into public.loyalty_programs', 'drop table', 'delete from']) {
    assert.equal(
      CODE.toLowerCase().includes(interdit),
      false,
      `« ${interdit} » n’a rien à faire ici`
    )
  }
  // Elle ne réécrit pas non plus les fonctions des autres écrans.
  for (const autre of ['programme_public', 'programme_du_commerce', 'enregistrer_programme']) {
    assert.equal(
      CODE.includes(`function public.${autre}`),
      false,
      `0015 ne doit pas redéfinir ${autre}`
    )
  }
  // Une transaction, une seule : la migration s'applique en entier ou pas du tout.
  assert.equal((CODE.match(/^begin;$/gm) ?? []).length, 1)
  assert.equal((CODE.match(/^commit;$/gm) ?? []).length, 1)
})
