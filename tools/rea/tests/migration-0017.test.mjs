/* ============================================================================
   Garde sur `migrations/0017` — les coordonnées de la proximité (P0-2b).

   La migration n'est pas exécutée ici. Ce fichier vérifie ce qui casserait
   **en silence** une fois passée :

     1. **une reprise après la suppression.** Le `drop column` doit venir
        *après* le `update` qui lit la colonne : dans l'autre ordre, la reprise
        échoue et tout lien déjà saisi est perdu — sans un mot.
     2. **une coordonnée seule.** Un point n'a pas de moitié : sans contrainte
        de paire, `latitude` à 33 et `longitude` à `null` passeraient, et le
        pass porterait un point au méridien zéro.
     3. **une surcharge au lieu d'un remplacement.** L'ancienne signature à
        quatorze arguments doit être **supprimée** : deux fonctions du même nom
        rendent l'appel PostgREST ambigu (`PGRST202`), donc « migration à
        passer » à l'écran.
     4. **un refus qui n'est pas un refus** : `INVALID_COORDONNEES` doit être
        dans `CODES_CONNUS`, sinon l'écran annonce une panne là où la base a
        dit « non ».
     5. **`anon` accordé par distraction** — la fiche porte l'adresse et la
        géofence du commerçant.
     6. **un point sans rayon dans le pass** : `carte_pour_wallet` doit exposer
        les coordonnées *et* le rayon, sans rien de nominatif de plus.

   Ce que ce fichier ne juge pas : l'effet en base (il faudrait exécuter), ni le
   rendu de l'écran (`fiche-etablissement.test.mjs`).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const SQL = lire('migrations', '0017_proximite_coordonnees.sql')
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

const position = (motif) => {
  const trouve = CODE.search(motif)
  assert.ok(trouve > 0, `motif introuvable : ${motif}`)
  return trouve
}

/* ---------------------------------------------------------------------------
   1. La transaction, et les deux colonnes
   ------------------------------------------------------------------------ */

test('0017 — une seule transaction, sans méta-commande psql', () => {
  assert.match(CODE, /^\s*begin\s*;/i, 'la migration ne s’ouvre pas par `begin;`')
  assert.match(CODE, /commit\s*;\s*$/i, 'la migration ne se ferme pas par `commit;`')
  assert.equal((CODE.match(/^\s*begin\s*;/gim) ?? []).length, 1, 'deux transactions ?')
  // Une méta-commande `\…` en début de ligne sortirait du `begin`/`commit`.
  assert.equal(/^\\[a-z]/im.test(CODE), false, 'méta-commande psql : la migration ne se rejouerait pas')
})

test('0017 — les deux colonnes, sans casser une base à moitié migrée', () => {
  assert.match(CODE, /add column if not exists latitude\s+numeric\(9,\s*6\)/i)
  assert.match(CODE, /add column if not exists longitude\s+numeric\(9,\s*6\)/i)

  // Chaque colonne est décrite : sans commentaire, personne ne saurait que
  // `null` veut dire « désactivé ».
  assert.match(CODE, /comment on column public\.loyalty_programs\.latitude/i)
  assert.match(CODE, /comment on column public\.loyalty_programs\.longitude/i)
})

test('0017 — la contrainte porte les bornes ET la paire, et se rejoue sans bruit', () => {
  assert.match(CODE, /from\s+pg_constraint/i, 'la contrainte n’est pas gardée par `pg_constraint`')
  assert.match(CODE, /conname\s*=\s*'loyalty_programs_coordonnees_bornes'/i)

  const contrainte = CODE.match(/add constraint loyalty_programs_coordonnees_bornes[\s\S]*?\)\s*;/i)
  assert.ok(contrainte, 'la contrainte est absente')
  assert.match(contrainte[0], /latitude between -90 and 90/i)
  assert.match(contrainte[0], /longitude between -180 and 180/i)
  assert.match(
    contrainte[0],
    /latitude is null and longitude is null/i,
    'rien n’impose que les deux coordonnées aillent ensemble'
  )
  /* Le second `is not null` est la partie qui **fait** la paire : sans lui, un
     `CHECK` rend `NULL` pour `latitude = 33, longitude = null`, et PostgreSQL
     accepte `NULL`. Mesuré sur la base jetable — une coordonnée seule passait. */
  assert.match(
    contrainte[0],
    /latitude is not null and longitude is not null/i,
    'le `CHECK` accepte `NULL` : une coordonnée seule passerait'
  )
})


/* ---------------------------------------------------------------------------
   2. La reprise, puis la suppression — dans cet ordre
   ------------------------------------------------------------------------ */

test('0017 — la reprise lit la colonne AVANT qu’elle ne soit supprimée', () => {
  const reprise = position(/update public\.loyalty_programs cible/i)
  const suppression = position(/drop column if exists lien_localisation/i)
  assert.ok(
    reprise < suppression,
    'le `drop column` précède la reprise : les coordonnées déjà saisies seraient perdues'
  )

  // Les quatre motifs que Maps produit sont couverts, pas un seul.
  assert.match(CODE, /@\(-\?\[0-9\]/i, 'motif `@lat,lng` absent de la reprise')
  assert.match(CODE, /!3d\(-\?\[0-9\]/i, 'motif `!3d…!4d…` absent de la reprise')
  assert.match(CODE, /\[\?&\]\(\?:q\|query\|ll\|center\)/i, 'motif `?q=` absent de la reprise')

  // Ce qui n'est pas analysable est **compté et dit**, jamais avalé.
  assert.match(CODE, /raise notice '0017/i, 'aucun compte rendu des liens non analysables')
  assert.match(CODE, /v_restant > 0/i)
})

test('0017 — la colonne-lien disparaît, et plus aucune fonction ne la lit', () => {
  assert.match(CODE, /drop column if exists lien_localisation/i)
  for (const nom of ['fiche_du_commerce', 'enregistrer_fiche_etablissement']) {
    assert.equal(
      /lien_localisation/i.test(corpsDe(nom)),
      false,
      `« ${nom} » lit encore la colonne supprimée`
    )
  }
})

/* ---------------------------------------------------------------------------
   3. La lecture, l'écriture, et le pass
   ------------------------------------------------------------------------ */

test('0017 — `fiche_du_commerce()` rend les coordonnées, pas le lien', () => {
  const lecture = corpsDe('fiche_du_commerce')
  assert.match(lecture, /'latitude',\s+v_programme\.latitude/i)
  assert.match(lecture, /'longitude',\s+v_programme\.longitude/i)
  assert.match(lecture, /raise exception 'PROGRAM_NOT_FOUND'/i, 'le refus de lecture a disparu')
  assert.match(lecture, /security definer/i)
})

test('0017 — l’ancienne signature est supprimée avant la nouvelle', () => {
  const suppression = position(
    /drop function if exists public\.enregistrer_fiche_etablissement\(/i
  )
  const creation = position(/create or replace function public\.enregistrer_fiche_etablissement/i)
  assert.ok(suppression < creation, 'la surcharge de quatorze arguments est encore là')

  // La signature supprimée est bien l'ancienne : onze `text`, aucun `numeric`.
  const ancienne = CODE.match(
    /drop function if exists public\.enregistrer_fiche_etablissement\(([^)]*)\)/i
  )[1]
  assert.equal((ancienne.match(/\btext\b/gi) ?? []).length, 11, 'l’ancienne signature a changé')
  assert.equal(/numeric/i.test(ancienne), false, 'l’ancienne signature porte déjà des numeric')

  const ecriture = corpsDe('enregistrer_fiche_etablissement')
  assert.match(ecriture, /p_latitude\s+numeric/i)
  assert.match(ecriture, /p_longitude\s+numeric/i)
  assert.equal(/p_lien_localisation/i.test(ecriture), false, 'le paramètre du lien est encore là')
})

test('0017 — l’écriture refuse une coordonnée seule et un point hors du globe', () => {
  const ecriture = corpsDe('enregistrer_fiche_etablissement')

  // La paire : `(a is null) <> (b is null)` est vraie quand une seule manque.
  assert.match(ecriture, /\(p_latitude is null\)\s*<>\s*\(p_longitude is null\)/i)
  assert.match(ecriture, /p_latitude < -90 or p_latitude > 90/i)
  assert.match(ecriture, /p_longitude < -180 or p_longitude > 180/i)
  assert.equal(
    (ecriture.match(/raise exception 'INVALID_COORDONNEES'/gi) ?? []).length,
    2,
    'les deux refus de coordonnées doivent lever le même code'
  )

  // L'arrondi est celui de la colonne : six décimales.
  assert.match(ecriture, /round\(p_latitude, 6\)/i)
  assert.match(ecriture, /round\(p_longitude, 6\)/i)

  // Le refus précède l'écriture : sinon la ligne serait modifiée à moitié.
  const refus = ecriture.search(/INVALID_COORDONNEES/i)
  const maj = ecriture.search(/update public\.loyalty_programs/i)
  assert.ok(refus > 0 && maj > refus, 'le contrôle de coordonnées suit l’UPDATE')

  /* Le code est connu de `donnees.mjs` : sans lui, il tomberait en
     `indisponible` et l'écran annoncerait une panne réseau. */
  assert.ok(DONNEES.includes("'INVALID_COORDONNEES'"), 'code de refus inconnu de `CODES_CONNUS`')
})

test('0017 — le pass reçoit le point et le rayon, rien de nominatif', () => {
  const pass = corpsDe('carte_pour_wallet')
  for (const cle of ["'latitude'", "'longitude'", "'rayon'"]) {
    assert.ok(pass.includes(cle), `le pass n’expose pas ${cle}`)
  }
  for (const interdit of ['last_name', 'email', 'reward_tiers', 'birthdate']) {
    assert.equal(
      new RegExp(`\\b${interdit}\\b`, 'i').test(pass),
      false,
      `« ${interdit} » ne doit pas sortir dans un pass`
    )
  }
})

/* ---------------------------------------------------------------------------
   4. Les droits
   ------------------------------------------------------------------------ */

test('0017 — `authenticated` seulement, sur les deux fonctions', () => {
  for (const signature of [
    'fiche_du_commerce\\(\\)',
    'enregistrer_fiche_etablissement\\([^)]*numeric,[^)]*\\)',
  ]) {
    const grant = CODE.match(
      new RegExp(`grant execute on function public\\.${signature}[^;]*;`, 'i')
    )
    assert.ok(grant, `aucun GRANT sur ${signature}`)
    assert.equal(/\banon\b/.test(grant[0]), false, `anon est accordé sur ${signature}`)
    assert.match(grant[0], /authenticated/)
  }

  const revoke = CODE.match(
    /revoke execute on function public\.enregistrer_fiche_etablissement[^;]*;/i
  )
  assert.ok(revoke, 'aucun REVOKE : la signature neuve hériterait de `PUBLIC`')
  assert.match(revoke[0], /from public, anon, authenticated/i)
})
