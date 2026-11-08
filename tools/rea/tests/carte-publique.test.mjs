/* ============================================================================
   Garde sur `/card/<cardId>` — la surface publique, et son refus du code.

   Ce que ce fichier empêche :
     1. **un code client dans l'URL.** La clé est l'UUID (mesuré : `/card/test`
        rend 404, l'UUID rend 200). Accepter `C-XXXXXX` rouvrirait l'oracle de
        soldes que `/join` a explicitement refusé ;
     2. **une page qui distingue « URL cassée » de « carte disparue ».** Les deux
        rendent le même 404, comme sur la cible ;
     3. **une page indexable.** L'URL est personnelle ; une page indexée publie
        des codes clients dans un moteur de recherche ;
     4. **une réponse à moitié comprise affichée comme une carte.** Un champ de
        forme inattendue rend `null`, pas une carte vide ;
     5. **une page qui promet la proximité.** La phrase de mise au point doit
        rester dans le rendu.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formaterDepuis,
  identifiantCarteValide,
  lireCartePublique,
} from '../../../web/src/lib/carte-publique.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PAGE = readFileSync(
  join(RACINE, 'web', 'src', 'app', 'card', '[cardId]', 'page.jsx'),
  'utf8'
)

/** La mesure qui autorise cette page : trois lectures anonymes de la cible. */
const MESURE = JSON.parse(
  readFileSync(join(RACINE, '01_REA_Fidelix', '_captures', '2026-10-27-a3', 'mesure-a3.json'), 'utf8')
)

const CARTE = '0b7c3f6a-1d2e-4f5a-9c8b-7a6d5e4f3c2b'

/** Une réponse complète de `carte_publique(uuid)`. */
const REPONSE = {
  card_id: CARTE,
  card_token: 'C-4F2A91',
  points: 42,
  prenom: 'Sonia',
  depuis: '2026-10-26T10:00:00Z',
  programme: { nom: 'Café Fidèle', seuil: 50 },
  paliers: [{ rang: 1, libelle: 'Boisson offerte', cout: 45 }],
}

test('carte — la mesure de la cible est bien celle qu’on a lue', () => {
  const cibles = MESURE.page_carte.cibles
  assert.equal(cibles.length, 3)

  const [reelle, uuidNul, texte] = cibles
  assert.equal(reelle.statut, 200)
  assert.match(reelle.titre, /^Carte fidélité —/)
  // Le témoin qui manquait : deux 404 de la même famille, dont un pour une
  // chaîne qui n'est pas un UUID. C'est ce qui prouve que la route existe.
  assert.equal(uuidNul.statut, 404)
  assert.equal(texte.statut, 404)
  assert.match(MESURE.page_carte.chunk_de_la_page, /app\/card\/%5BcardId%5D\/page-/)
})

test('carte — seul un UUID est un identifiant de carte', () => {
  assert.equal(identifiantCarteValide(CARTE), true)
  assert.equal(identifiantCarteValide(CARTE.toUpperCase()), true, 'la casse ne fait pas une carte')
  for (const faux of ['C-4F2A91', 'test', '', null, undefined, 42, `${CARTE}x`]) {
    assert.equal(identifiantCarteValide(faux), false, `« ${String(faux)} » accepté à tort`)
  }
})

test('carte — « membre depuis » dit le mois, jamais le jour', () => {
  assert.equal(formaterDepuis('2026-10-26T10:00:00Z'), 'octobre 2026')
  assert.equal(formaterDepuis('2026-01-01T00:00:00Z'), 'janvier 2026')
  for (const faux of ['', 'hier', null, undefined]) {
    assert.equal(formaterDepuis(faux), '', `« ${String(faux)} » ne doit rien afficher`)
  }
})

test('carte — une réponse complète se lit, et ne garde que le nécessaire', () => {
  const lu = lireCartePublique(REPONSE)
  assert.ok(lu)
  assert.deepEqual(lu, {
    id: CARTE,
    code: 'C-4F2A91',
    points: 42,
    prenom: 'Sonia',
    nomCommerce: 'Café Fidèle',
    seuil: 50,
    depuis: 'octobre 2026',
    paliers: [{ rang: 1, libelle: 'Boisson offerte', cout: 45 }],
  })
  // Le nom de famille n'existe pas dans la réponse : rien à en faire.
  assert.equal('nom' in lu, false)
})

test('carte — une réponse d’une autre forme n’est pas une carte vide', () => {
  for (const casse of [
    null,
    'texte',
    {},
    { ...REPONSE, card_id: 'test' },
    { ...REPONSE, card_token: '' },
    { ...REPONSE, points: -1 },
    { ...REPONSE, points: '42' },
    { ...REPONSE, programme: null },
    { ...REPONSE, programme: { nom: '   ' } },
  ]) {
    assert.equal(lireCartePublique(casse), null, `accepté à tort : ${JSON.stringify(casse)}`)
  }

  // Les cas tolérés, et pourquoi : pas de prénom (carte anonyme), pas de
  // paliers (`json_agg` vide), pas de seuil (colonne nulle).
  const sansPrenom = lireCartePublique({ ...REPONSE, prenom: '' })
  assert.equal(sansPrenom.prenom, '')
  assert.deepEqual(lireCartePublique({ ...REPONSE, paliers: null }).paliers, [])
  assert.equal(lireCartePublique({ ...REPONSE, programme: { nom: 'Café' } }).seuil, null)
})

test('carte — la page est dynamique, non indexable, et publique', () => {
  // Un solde mis en cache servirait une valeur périmée à qui vient le vérifier.
  assert.match(PAGE, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/)
  // L'URL est personnelle : indexée, elle publierait des codes clients.
  assert.match(PAGE, /const SANS_INDEX = \{ index: false, follow: false \}/)
  assert.equal((PAGE.match(/robots: SANS_INDEX/g) ?? []).length, 2, 'les deux metadata doivent le porter')

  // Aucune redirection vers `/login` : le client final n'a pas de compte.
  assert.equal(/redirect\(\s*['"]\/login/.test(PAGE), false, 'la page renvoie vers la connexion')
  assert.match(PAGE, /notFound\(\)/, 'un UUID inconnu doit rendre un 404')
})

test('carte — la page n’affiche que ce que la RPC a rendu', () => {
  // Le QR encode **le code**, pas l'URL : c'est ce que lit le scanner du comptoir.
  assert.match(PAGE, /<QrCode texte=\{carte\.code\}/)
  // Le prochain palier est calculé par `programme.mjs`, pas recopié ici.
  assert.match(PAGE, /prochainPalier\(carte\.points, carte\.paliers\)/)
  // Les deux appels lourds sont dédupliqués à l'échelle de la requête.
  assert.match(PAGE, /const lireCarte = cache\(cartePublique\)/)
  // La clé VAPID est lue côté serveur : un composant client n'a pas `process.env`.
  assert.match(PAGE, /process\.env\.NEXT_PUBLIC_VAPID_PUBLIC_KEY/)
})

test('carte — la phrase qui empêche de confondre push et proximité reste rendue', () => {
  assert.match(PAGE, /t\('page\.carte\.proximite'\)/)
  // Et le bloc de notifications ne remplace pas cette phrase : les deux vivent
  // dans le rendu, l'un après l'autre.
  assert.match(PAGE, /<ActiverNotifications/)
  assert.ok(
    PAGE.indexOf("t('page.carte.proximite')") > PAGE.indexOf('<ActiverNotifications'),
    'la mise au point doit venir après le bloc de notifications'
  )
})

