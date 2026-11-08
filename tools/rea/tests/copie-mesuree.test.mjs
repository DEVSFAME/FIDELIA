/* ============================================================================
   Dette « la copie de l'écran nouveau mot de passe n'est pas mesurée » — tranchée
   pour sa part mesurable.

   Ce qui était écrit sans preuve : `auth.nouveau.*`. Or la cible **a** un
   formulaire de mot de passe capturé : la page Réglages, dont le chunk est
   `_next_static_chunks_app__dashboard__settings_page-7bb560c4de073cfb.js`. On y
   lit, entre autres :

       « Mot de passe actuel »
       « Nouveau mot de passe »
       « Confirmer le nouveau mot de passe »
       « Changer le mot de passe »

   Les deux libellés du formulaire de récupération sont donc **mesurés**, et pas
   empruntés à `/register` (qui dit « Mot de passe », pour un autre champ).

   **Ce que ce fichier ne prétend pas.** L'écran de récupération lui-même n'a
   jamais été capturé (la cible n'expose aucune route de ce nom dans son build),
   donc le titre sur deux lignes, le sous-titre et la phrase d'échec de session
   restent **écrits** — c'est déclaré dans `docs/design-system.md` §3, et une
   assertion qui certifierait le contraire serait un mensonge (cf. §29.3).

   Chaque assertion a son **témoin** dans le chunk : si la chaîne disparaît de la
   capture, le test échoue en le disant, au lieu de comparer le dictionnaire à
   lui-même (§24.2).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DICTIONNAIRES } from '../../../web/src/i18n/dictionnaires.mjs'

const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8')

const CHUNK = lire(
  '../../../01_REA_Fidelix/_captures/2026-10-27-auth-s3/raw/assets/_next_static_chunks_app__dashboard__settings_page-7bb560c4de073cfb.js'
)
const FORMULAIRE = lire('../../../web/src/components/auth/FormulaireNouveauMotDePasse.jsx')
const fr = DICTIONNAIRES.fr

test('copie — les libellés du formulaire de mot de passe sont dans la capture', () => {
  assert.ok(CHUNK.includes('Mot de passe actuel'), 'témoin : le champ « actuel » a disparu')
  assert.ok(CHUNK.includes('Nouveau mot de passe'), 'témoin : « Nouveau mot de passe » a disparu')
  assert.ok(
    CHUNK.includes('Confirmer le nouveau mot de passe'),
    'témoin : « Confirmer le nouveau mot de passe » a disparu'
  )
})

test('copie — le dictionnaire porte exactement les libellés mesurés', () => {
  assert.equal(fr['auth.nouveau.champMotDePasse'], 'Nouveau mot de passe')
  assert.equal(fr['auth.nouveau.champConfirmation'], 'Confirmer le nouveau mot de passe')

  // Le libellé de `/register` n'est pas celui d'un écran de récupération : si
  // les deux valeurs redevenaient identiques, c'est que l'un des deux écrans
  // aurait été aligné sur l'autre sans mesure.
  assert.notEqual(fr['champ.motDePasse'], fr['auth.nouveau.champMotDePasse'])
})

test('copie — le formulaire utilise ces clés, pas celles de l’inscription', () => {
  assert.ok(
    FORMULAIRE.includes('auth.nouveau.champMotDePasse'),
    'le champ « nouveau » n’utilise pas son libellé mesuré'
  )
  assert.ok(
    FORMULAIRE.includes('auth.nouveau.champConfirmation'),
    'le champ de confirmation n’utilise pas son libellé mesuré'
  )
  assert.equal(
    FORMULAIRE.includes("t('champ.motDePasse')"),
    false,
    'le libellé de l’inscription ne doit plus servir ici'
  )
})
