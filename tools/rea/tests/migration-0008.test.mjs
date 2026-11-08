/* ============================================================================
   Garde sur `migrations/0008` — « crédits par euro », et la devise en euro.

   La migration a été exécutée et mesurée (colonne, contrainte, défaut, reprise
   des lignes, refus de `0`). Ce fichier vérifie ce qui se **relit** et qui
   casserait sans bruit :

     1. **Un taux `numeric(10,2)` devenu `integer`.** 1,5 point par euro est
        courant ; l'arrondir à 2 choisit à la place du commerce, et l'écart ne
        se voit qu'à la première vente.
     2. **Un défaut sans contrainte (ou l'inverse).** `default 1` sans
        `check (> 0)` laisse écrire `0`, donc un programme qui ne crédite plus
        rien ; la contrainte seule fait échouer les insertions anciennes.
     3. **Le défaut de devise changé, les lignes oubliées.** Les programmes
        existants resteraient en `MAD` sous un écran qui affiche « € ».
     4. **Un `update` sans `where devise = 'MAD'`.** Une base portant déjà une
        autre devise serait convertie de force par une migration qui n'en sait
        rien.
     5. **`create or replace` sur une signature différente.** Il crée une
        **seconde** fonction : un appel à cinq arguments continuerait d'écrire
        un programme en ignorant le taux, silencieusement. Le `drop` de
        l'ancienne doit donc précéder la création.
     6. **Un `REVOKE` qui ne nomme pas les rôles**, ou un `GRANT` à `anon` :
        n'importe qui réécrirait les paliers d'un commerce.
     7. **Un taux jamais validé côté serveur** : la borne haute et le refus de
        `0` appartiennent à la fonction, pas au formulaire.
     8. **Un symbole monétaire dans le SQL** : `EUR` est une donnée, `€` est un
        rendu (`symboleDevise`, `tableau.mjs`).

   Ce que ce fichier ne juge pas : l'effet en base (mesuré à la main), ni les
   écrans (couverts par `modules.test.mjs`, `caisse.test.mjs`,
   `scan-camera.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CHEMIN = fileURLToPath(
  new URL('../../../migrations/0008_credits_par_euro.sql', import.meta.url)
)
const SQL = readFileSync(CHEMIN, 'utf8')

/** Retire les commentaires `--` : la prose cite la syntaxe, elle n'est pas du code. */
const CODE = SQL.split('\n')
  .map((ligne) => ligne.replace(/--.*$/, ''))
  .join('\n')

/** Le code hors des corps de fonction : c'est là que vivent les DDL. */
const HORS_FONCTIONS = CODE.replace(/\$fonction\$[\s\S]*?\$fonction\$/g, ' $fonction$ ')

/** Le corps de `enregistrer_programme`, borné par son `create`. */
const DEBUT_ENREGISTRER = CODE.indexOf(
  'create or replace function public.enregistrer_programme('
)
const CORPS_ENREGISTRER = (() => {
  assert.ok(DEBUT_ENREGISTRER > -1, 'enregistrer_programme n’est plus créée par cette migration')
  const fin = CODE.indexOf('end;\n$fonction$;', DEBUT_ENREGISTRER)
  assert.ok(fin > DEBUT_ENREGISTRER, 'le corps de enregistrer_programme est illisible')
  return CODE.slice(DEBUT_ENREGISTRER, fin)
})()

test('0008 — la migration est encadrée par une transaction', () => {
  assert.ok(/^\s*begin;/m.test(CODE), 'pas de `begin;` : un échec laisse la base à moitié migrée')
  assert.ok(/^\s*commit;/m.test(CODE), 'pas de `commit;` : rien n’est validé')
})


test('0008 — le taux existe, à deux décimales, strictement positif', () => {
  const ajout = HORS_FONCTIONS.match(
    /alter table public\.loyalty_programs\s+add column if not exists credits_par_euro[^;]*;/
  )
  assert.ok(ajout, 'la colonne credits_par_euro n’est pas ajoutée')
  const definition = ajout[0].replace(/\s+/g, ' ')

  assert.match(definition, /numeric\s*\(\s*10\s*,\s*2\s*\)/i, 'un integer arrondirait 1,5 à 2')
  assert.match(definition, /not null/i, 'un taux nullable rendrait le calcul optionnel')
  assert.match(definition, /default 1\b/i, 'sans défaut, les insertions anciennes échouent')
  assert.match(
    definition,
    /check\s*\(\s*credits_par_euro\s*>\s*0\s*\)/i,
    'rien n’empêche un taux à 0, donc un programme qui ne crédite rien'
  )
})

test('0008 — la devise par défaut passe à EUR, et les lignes MAD suivent', () => {
  assert.match(
    HORS_FONCTIONS,
    /alter table public\.loyalty_programs alter column devise set default 'EUR'/,
    'le défaut de devise n’a pas changé'
  )

  // Un `update` sans `where` convertirait de force une base en USD ou en GBP :
  // la migration ne sait rien de ces programmes, elle n'a pas à les toucher.
  const maj = HORS_FONCTIONS.match(/update public\.loyalty_programs[^;]*;/)
  assert.ok(maj, 'les lignes existantes ne sont pas reprises : elles resteraient en MAD')
  assert.match(
    maj[0].replace(/\s+/g, ' ').trim(),
    /where devise = 'MAD'\s*;?$/,
    'le `update` doit cibler le dirham, et seulement lui'
  )

  // La devise reste une donnée : le symbole est un rendu, pas une colonne.
  // On regarde le **code**, pas la prose : les commentaires citent « 3 € » pour
  // expliquer la borne haute, et ce n'est pas une écriture.
  assert.equal(CODE.includes('€'), false, 'un `€` dans le SQL figerait la devise dans la base')

test('0008 — `programme_public` rend le taux, sans perdre ses gardes', () => {
  const debut = CODE.indexOf('create or replace function public.programme_public(')
  assert.ok(debut > -1, 'programme_public n’est pas redéfinie')
  const corps = CODE.slice(debut, CODE.indexOf('$fonction$;', debut))

  assert.match(corps, /security definer/i, 'sans SECURITY DEFINER, la lecture échoue sous RLS')
  assert.match(corps, /set search_path = public/i, 'sans search_path figé, la fonction est détournable')
  assert.match(
    corps,
    /'credits_par_euro',\s*v_programme\.credits_par_euro/,
    'le taux ne sort pas du JSON'
  )
  assert.match(corps, /'devise',\s*v_programme\.devise/, 'la devise ne sort plus du JSON')
  assert.match(corps, /'paliers',\s*v_paliers/, 'les paliers ont disparu du JSON')
})

test('0008 — l’ancienne signature est supprimée avant la nouvelle', () => {
  const drop = CODE.indexOf(
    'drop function if exists public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb);'
  )
  assert.ok(drop > -1, 'l’ancienne signature à 5 paramètres reste : deux candidates pour un appel')
  assert.ok(drop < DEBUT_ENREGISTRER, 'le `drop` doit précéder la création, sinon il supprime la nouvelle')

  const signature = CODE.slice(DEBUT_ENREGISTRER, CODE.indexOf('returns json', DEBUT_ENREGISTRER))
  assert.match(
    signature,
    /p_credits_par_euro numeric default 1/,
    'le 6ᵉ paramètre manque, ou n’a pas de défaut (un appelant ancien échouerait)'
  )
  for (const nom of ['p_slug', 'p_name', 'p_threshold', 'p_kind', 'p_tiers']) {
    assert.ok(signature.includes(nom), `paramètre perdu : ${nom}`)
  }
})

test('0008 — le taux est validé par la fonction, pas seulement par l’écran', () => {
  assert.match(
    CORPS_ENREGISTRER,
    /p_credits_par_euro is null or p_credits_par_euro <= 0 or p_credits_par_euro > 1000/,
    'la borne (0 ; 1000] n’est pas vérifiée côté base'
  )
  assert.match(CORPS_ENREGISTRER, /raise exception 'INVALID_CREDITS' using errcode = 'P0001'/)

  // Le taux doit être écrit **et** mis à jour : un `insert` qui l'oublie laisse
  // le défaut `1` à chaque enregistrement, et l'écran affichera toujours 1.
  assert.match(CORPS_ENREGISTRER, /insert into public\.loyalty_programs \([^)]*credits_par_euro/)
  assert.match(CORPS_ENREGISTRER, /credits_par_euro = excluded\.credits_par_euro/)

  // Le refus précède l'écriture : valider après l'insert laisserait une ligne
  // à moitié écrite si la transaction était un jour relâchée.
  assert.ok(
    CORPS_ENREGISTRER.indexOf('INVALID_CREDITS') <
      CORPS_ENREGISTRER.indexOf('insert into public.loyalty_programs'),
    'le taux est validé après l’écriture'
  )
})

test('0008 — les droits nomment les rôles, et `anon` ne récupère rien', () => {
  const signature =
    'enregistrer_programme\\(varchar, varchar, integer, varchar, jsonb, numeric\\)'
  const normaliser = (texte) => texte.replace(/\s+/g, ' ')

  const revoke = HORS_FONCTIONS.match(
    new RegExp(`revoke execute on function public\\.${signature}[^;]*;`)
  )
  assert.ok(revoke, 'aucun REVOKE sur la nouvelle signature')
  // Un `REVOKE … FROM PUBLIC` seul ne retire rien : les privilèges par défaut
  // du schéma accordent EXECUTE à `anon`, `authenticated` et `service_role`
  // nommément. Les trois doivent figurer.
  assert.match(
    normaliser(revoke[0]),
    /from public, anon, authenticated/,
    'le REVOKE ne nomme pas les trois rôles : un droit par défaut survivrait'
  )

  const grant = HORS_FONCTIONS.match(
    new RegExp(`grant execute on function public\\.${signature}[^;]*;`)
  )
  assert.ok(grant, 'le GRANT manque : plus personne ne peut enregistrer un programme')
  assert.match(normaliser(grant[0]), /to authenticated, service_role/)
  assert.equal(
    /\bto\b[^;]*\banon\b/.test(normaliser(grant[0])),
    false,
    '`anon` peut réécrire les paliers d’un commerce'
  )

  // Révoquer l'ancienne signature ne protège rien : elle n'existe plus.
  assert.equal(
    /revoke execute on function public\.enregistrer_programme\(varchar, varchar, integer, varchar, jsonb\)/.test(
      HORS_FONCTIONS
    ),
    false,
    'le REVOKE vise la signature à cinq arguments'
  )
})

})
