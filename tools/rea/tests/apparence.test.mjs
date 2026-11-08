/* ============================================================================
   P0-5 — la page `/branding` (module Apparence), de la mesure au raccordement.

   La capture est celle du 2026-11-02 (`2026-11-02-a6/rendu/a08-branding.html`),
   et le chunk de la page est lu **en texte** : c'est lui qui porte les valeurs
   que le DOM ne montre pas (le schéma zod, les huit couleurs, le tableau des
   dix types, les colonnes écrites par `POST /api/branding/save`).

   Ce que ce fichier empêche :
     1. **un type renommé** — les dix valeurs sont celles de la cible, dans son
        ordre ; en changer une seule rend l'apparence illisible pour la carte ;
     2. **une couleur hors format** — `#fff`, `red`, `rgb(…)` finiraient dans un
        `style` sans que rien ne rougisse ;
     3. **une adresse d'image qui n'en est pas une** — `javascript:`, `data:`,
        un chemin nu : ces valeurs vont dans un `src` ;
     4. **un refus muet** — chaque code rendu par `refusApparence` doit avoir sa
        clé de dictionnaire, et cette clé doit exister ;
     5. **une clé de libellé qui n'existe pas** : les dix libellés de type sont
        des clés littérales dans `TYPES_ETABLISSEMENT` — une faute de frappe ne
        se verrait qu'à l'écran, donc elle se voit ici ;
     6. **un aperçu qui promet plus qu'il ne fait** — la légende doit nommer les
        valeurs d'exemple, et le code affiché doit être celui de la capture ;
     7. **un oubli d'invalidation du cache** : le nom est un des champs, et
        `programmeDuCommerce()` le sert à trois écrans.

   Aucun navigateur, aucune connexion : on lit la capture, le chunk, les sources
   et les modules purs.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import {
  CODE_EXEMPLE,
  COULEURS,
  COULEUR_DEFAUT,
  NOM_MAX,
  NOM_MIN,
  POINTS_EXEMPLE,
  TYPES_ETABLISSEMENT,
  TYPE_DEFAUT,
  URL_MAX,
  VALEURS_TYPE,
  apparenceDepuisFormulaire,
  couleurValide,
  emojiDeType,
  lireApparence,
  moisAnnee,
  nomValide,
  normaliserCouleur,
  recompenseDuMenu,
  refusApparence,
  typeValide,
  urlImageValide,
} from '../../../web/src/lib/apparence.mjs'

const lire = (...morceaux) =>
  readFileSync(fileURLToPath(new URL(`../../../${morceaux.join('/')}`, import.meta.url)), 'utf8')

const FR = dictionnaire('fr')

const CAPTURE = lire(
  '01_REA_Fidelix', '_captures', '2026-11-02-a6', 'rendu', 'a08-branding.html'
)
const CHUNK = lire(
  '01_REA_Fidelix', '_captures', '2026-11-02-a6', 'raw', 'assets',
  '_next_static_chunks_app__dashboard__branding_page-badcb0936c16a5ca.js'
)
const PAGE = lire('web', 'src', 'app', '(dashboard)', 'branding', 'page.jsx')
const ACTION = lire('web', 'src', 'app', '(dashboard)', 'branding', 'actions.js')
const EDITEUR = lire('web', 'src', 'components', 'apparence', 'EditeurApparence.jsx')
const APERCU = lire('web', 'src', 'components', 'apparence', 'ApercuCarte.jsx')

test('apparence — les dix types sont ceux de la cible, dans son ordre', () => {
  // Le tableau `L` du chunk, dans l'ordre : c'est la seule source de vérité.
  const mesure = [...CHUNK.matchAll(/\{value:"([a-z]+)",label:"/g)].map((m) => m[1])
  assert.equal(mesure.length, 10, 'le chunk ne porte plus dix types : la mesure a bougé')
  assert.deepEqual([...VALEURS_TYPE], mesure)
  assert.deepEqual([...VALEURS_TYPE], [
    'restaurant', 'cafe', 'coiffure', 'barbershop', 'pressing',
    'retoucherie', 'boucherie', 'patisserie', 'librairie', 'autre',
  ])
  // …et la capture les rend, un par un, dans le même ordre (le DOM, pas le chunk).
  for (const type of TYPES_ETABLISSEMENT) {
    assert.ok(CAPTURE.includes(type.emoji), `emoji ${type.emoji} absent de la capture`)
  }
})

test('apparence — chaque type a un libellé traduit, et un seul', () => {
  for (const type of TYPES_ETABLISSEMENT) {
    assert.equal(
      typeof FR[type.cle],
      'string',
      `le libellé de « ${type.valeur} » manque au dictionnaire (${type.cle})`
    )
    assert.ok(FR[type.cle].trim() !== '', `le libellé de « ${type.valeur} » est vide`)
  }
  // Deux types qui partagent une clé afficheraient le même nom : le doublon est
  // invisible à l'écran, et c'est ce qui le rend coûteux.
  assert.equal(new Set(TYPES_ETABLISSEMENT.map((t) => t.cle)).size, TYPES_ETABLISSEMENT.length)
})

test('apparence — les huit couleurs sont celles du chunk, dans son ordre', () => {
  const mesure = CHUNK.match(/\["#1a1a1a","#f94c3a"[^\]]*\]/)
  assert.ok(mesure, 'le tableau de couleurs du chunk est introuvable')
  const valeurs = [...mesure[0].matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1])
  assert.equal(valeurs.length, 8)
  assert.deepEqual([...COULEURS], valeurs)
  // La première est le défaut de colonne **et** de repli : si elle quitte la
  // liste, l'écran propose huit teintes dont aucune n'est celle qu'il applique.
  assert.equal(COULEURS[0], COULEUR_DEFAUT)
})

test('apparence — une couleur est un `#rrggbb`, jamais un nom ni trois chiffres', () => {
  assert.equal(couleurValide('#f94c3a'), true)
  assert.equal(couleurValide('#F94C3A'), true)
  assert.equal(couleurValide('  #065f46 '), true)

  for (const refus of ['', '#fff', 'f94c3a', 'red', 'rgb(0,0,0)', '#gggggg', '#f94c3', null, 12]) {
    assert.equal(couleurValide(refus), false, `« ${refus} » accepté à tort`)
  }

  // La normalisation est ce qui empêche deux pastilles d'être actives ensemble.
  assert.equal(normaliserCouleur('#F94C3A'), '#f94c3a')
  assert.equal(normaliserCouleur(null), '')
})

test('apparence — une adresse d’image est `https://` ou `/`, et rien d’autre', () => {
  assert.equal(urlImageValide('https://cdn.exemple.ma/logo.png'), true)
  assert.equal(urlImageValide('/brand/logo-mark.png'), true)
  assert.equal(urlImageValide(''), true, 'une chaîne vide dit « pas d’image »')
  assert.equal(urlImageValide(null), true)

  for (const refus of [
    'logo.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://exemple.ma/logo.png',
    'https://exemple.ma/logo avec espace.png',
    `https://exemple.ma/${'a'.repeat(URL_MAX)}.png`,
  ]) {
    assert.equal(urlImageValide(refus), false, `« ${refus} » accepté à tort`)
  }
})

test('apparence — le nom suit les deux bornes de la cible', () => {
  // `z.string().min(2)` (chunk) et `varchar(120)` (colonne `0003`).
  assert.ok(CHUNK.includes('name:i.Yj().min(2)'), 'le minimum mesuré a bougé')
  assert.equal(NOM_MIN, 2)
  assert.equal(NOM_MAX, 120)

  assert.equal(nomValide('a'), false)
  assert.equal(nomValide('  a  '), false, 'le détourage précède la mesure')
  assert.equal(nomValide('ab'), true)
  assert.equal(nomValide('x'.repeat(NOM_MAX)), true)
  assert.equal(nomValide('x'.repeat(NOM_MAX + 1)), false)
  assert.equal(nomValide(null), false)
})

const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

/** Le code sans ses commentaires : la prose cite des valeurs, elle ne les code pas. */
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')


test('apparence — le formulaire est lu tel qu’il est posté', () => {
  const donnees = new Map([
    ['name', '  Café des Amis  '],
    ['primary_color', ' #F94C3A '],
    ['commerce_type', 'cafe'],
    ['logo_url', ' https://exemple.ma/logo.png '],
    ['wallet_bg_url', ''],
  ])
  const apparence = apparenceDepuisFormulaire({ get: (nom) => donnees.get(nom) })

  assert.deepEqual(apparence, {
    nom: 'Café des Amis',
    couleur: '#f94c3a',
    type: 'cafe',
    logo: 'https://exemple.ma/logo.png',
    image: '',
  })

  // Un formulaire vide ne lève pas : c'est `refusApparence` qui tranche.
  assert.deepEqual(apparenceDepuisFormulaire(undefined), {
    nom: '',
    couleur: '',
    type: '',
    logo: '',
    image: '',
  })
})

test('apparence — les refus sortent dans l’ordre des champs, un par règle', () => {
  const bon = { nom: 'Café', couleur: '#1a1a1a', type: 'cafe', logo: '', image: '' }
  assert.deepEqual(refusApparence(bon), [])

  assert.deepEqual(refusApparence({ ...bon, nom: '' }), ['nom'])
  assert.deepEqual(refusApparence({ ...bon, nom: 'x'.repeat(NOM_MAX + 1) }), ['nomLong'])
  assert.deepEqual(refusApparence({ ...bon, couleur: 'rouge' }), ['couleur'])
  assert.deepEqual(refusApparence({ ...bon, type: 'epicerie' }), ['type'])
  assert.deepEqual(refusApparence({ ...bon, logo: 'logo.png' }), ['logo'])
  assert.deepEqual(refusApparence({ ...bon, image: 'data:image/png;base64,AA' }), ['image'])

  // Deux fautes : la première est celle que l'écran dit. L'ordre est donc une
  // garantie d'interface, pas un détail d'implémentation.
  assert.deepEqual(refusApparence({ ...bon, couleur: 'rouge', type: 'epicerie' }), [
    'couleur',
    'type',
  ])
  assert.deepEqual(refusApparence(null), ['nom', 'couleur', 'type'])
})

test('apparence — une lecture ne rend jamais `undefined` ni une couleur illisible', () => {
  assert.deepEqual(lireApparence(null), {
    nom: '',
    couleur: COULEUR_DEFAUT,
    type: TYPE_DEFAUT,
    logo: '',
    image: '',
  })

  // Une couleur stockée hors format (base écrite à la main) retombe sur le
  // défaut : l'afficher telle quelle donnerait un fond transparent.
  const lu = lireApparence({
    name: 'Café',
    primary_color: '#F94C3A',
    commerce_type: 'boulangerie',
    logo_url: null,
    wallet_bg_url: null,
  })
  assert.equal(lu.couleur, '#f94c3a', 'la casse est normalisée, pas la valeur')
  assert.equal(lu.type, TYPE_DEFAUT, 'un type inconnu retombe sur le défaut de colonne')
  assert.equal(lu.logo, '')
  assert.equal(lu.image, '')
})

test('apparence — l’aperçu prend la première récompense du menu', () => {
  assert.equal(
    recompenseDuMenu([{ libelle: 'MENU au choix' }, { libelle: 'Café offert' }]),
    'MENU au choix'
  )
  assert.equal(recompenseDuMenu([{ libelle: '   ' }, { libelle: 'Café' }]), 'Café')
  assert.equal(recompenseDuMenu([]), null)
  assert.equal(recompenseDuMenu(null), null)
  assert.equal(recompenseDuMenu([{ cout: 10 }]), null)
})

test('apparence — le mois de l’aperçu est calculé, pas écrit', () => {
  // La capture affiche « octobre 2026 » : c'est la date de la passe. L'écran ne
  // recopie pas cette valeur — un exemple figé vieillirait à l'écran.
  assert.equal(moisAnnee(new Date(2026, 9, 24)), 'octobre 2026')
  assert.equal(moisAnnee(new Date(2026, 10, 2)), 'novembre 2026')
  assert.equal(/^[a-zéû]+ \d{4}$/.test(moisAnnee()), true)
})

test('apparence — les valeurs d’exemple de l’aperçu sont celles de la capture', () => {
  assert.ok(CAPTURE.includes(CODE_EXEMPLE), 'le code client mesuré a changé')
  assert.equal(POINTS_EXEMPLE, 120)
  assert.ok(CAPTURE.includes('>120<'), 'les 120 points mesurés sont introuvables')
  assert.ok(
    CAPTURE.includes('PROCHAINE RÉCOMPENSE') && CAPTURE.includes('CODE CLIENT'),
    'les intitulés de l’aperçu ont changé'
  )
  assert.equal(emojiDeType('cafe'), '☕')
  assert.equal(emojiDeType('inconnu'), TYPES_ETABLISSEMENT[0].emoji)
  assert.equal(typeValide('librairie'), true)
  assert.equal(typeValide('Librairie'), false, 'la casse ne se devine pas en base')
})

test('apparence — la légende de l’aperçu nomme ses valeurs d’exemple', () => {
  // Sans cette phrase, l'écran afficherait un code et un solde qui ne sont ceux
  // d'aucun client, sous un titre qui dit « aperçu » : c'est le mensonge que la
  // doctrine du dépôt interdit.
  const legende = FR['page.apparence.apercuLegende']
  assert.ok(legende.includes('exemple'), 'la légende ne dit pas que les valeurs sont un exemple')
  assert.ok(/nom|logo|couleur/.test(legende), 'la légende ne dit pas ce qui est réel')

  // Et le composant s'en sert vraiment : une clé juste qu'on n'affiche pas ne
  // protège de rien.
  assert.ok(APERCU.includes("t('page.apparence.apercuLegende')"))
  assert.ok(APERCU.includes('CODE_EXEMPLE') && APERCU.includes('POINTS_EXEMPLE'))
})

test('apparence — l’écran envoie les noms que la fonction attend', () => {
  // Les cinq `name` du formulaire, confrontés aux cinq paramètres de
  // `enregistrer_apparence` : un `name` renommé côté écran ferait écrire `null`
  // dans la colonne, sans erreur, et l'aperçu serait seul à le montrer.
  const LIB = lire('web', 'src', 'lib', 'apparence.mjs')
  for (const nom of ['name', 'primary_color', 'commerce_type', 'logo_url', 'wallet_bg_url']) {
    assert.ok(EDITEUR.includes(`name="${nom}"`), `le champ « ${nom} » a disparu du formulaire`)
    // Lu par `apparenceDepuisFormulaire` : c'est là que le nom d'`input` devient
    // une propriété du module.
    assert.ok(LIB.includes(`texte('${nom}')`), `« ${nom} » n’est plus lu par le module`)
  }
  for (const parametre of [
    'p_name',
    'p_primary_color',
    'p_commerce_type',
    'p_logo_url',
    'p_wallet_bg_url',
  ]) {
    assert.ok(DONNEES.includes(parametre), `le raccordement ne transmet plus ${parametre}`)
  }
})

test('apparence — chaque refus de l’action a sa phrase, et la phrase existe', () => {
  const codes = ['nom', 'nomLong', 'couleur', 'type', 'logo', 'image']
  for (const code of codes) {
    const cle = `page.apparence.erreur.${code}`
    assert.equal(typeof FR[cle], 'string', `la phrase du refus « ${code} » manque (${cle})`)
  }
  assert.equal(typeof FR['page.apparence.erreur.refus'], 'string')
  assert.ok(EDITEUR.includes("migration: 'tableau.etat.migrationTexte'"))

  // Les quatre codes de la base sont nommés : un code avalé deviendrait
  // « Réessayez », c'est-à-dire « la base n'a pas répondu » pour une base qui
  // vient de répondre.
  for (const code of [
    'INVALID_COLOR',
    'INVALID_COMMERCE_TYPE',
    'INVALID_LOGO_URL',
    'INVALID_IMAGE_URL',
  ]) {
    assert.ok(DONNEES.includes(`'${code}'`), `${code} n’est pas dans CODES_CONNUS`)
    assert.ok(ACTION.includes(code), `${code} n’est pas traduit en champ par l’action`)
  }
})

test('apparence — le cache du programme est invalidé après écriture', () => {
  // Le nom est un des champs, et `programmeDuCommerce()` le sert à
  // `/join/<slug>`, `/caisse` et `/qrcode` : sans invalidation, dix secondes de
  // nom périmé sur trois écrans.
  const bloc = sansCommentaires(DONNEES)
  const debut = bloc.indexOf('export async function enregistrerApparence')
  assert.ok(debut > 0, 'enregistrerApparence a disparu du raccordement')
  const corps = bloc.slice(debut, bloc.indexOf('\n}', debut))
  assert.match(corps, /cacheProgramme\.oublier\(\)/)

  // …et la page relit : une action qui écrit sans `revalidatePath` laisserait
  // l'écran afficher l'ancienne valeur jusqu'au prochain chargement complet.
  assert.ok(ACTION.includes("revalidatePath('/branding')"))
})

test('apparence — la page ne promet pas la section qu’elle ne rend pas', () => {
  // `stamps_total`, `stamp_icon` et `style_bandeau` ne sont pas dans ce socle :
  // aucun écran ne dessine de grille de tampons. Le formulaire ne doit donc
  // contenir aucun champ de ce nom — un `input` orphelin serait un réglage que
  // rien ne lit.
  for (const absent of ['stamps_total', 'stamp_icon', 'style_bandeau']) {
    assert.equal(
      sansCommentaires(EDITEUR).includes(absent),
      false,
      `« ${absent} » est rendu alors que rien ne le lit`
    )
  }
  // La dette est nommée dans la page, pas seulement dans le suivi.
  assert.ok(PAGE.includes('P0-6b'))

  // L'écran dit aussi que l'envoi de fichier n'est pas branché : c'est la seule
  // façon de ne pas laisser croire que le champ accepte un fichier.
  assert.equal(typeof FR['page.apparence.envoiAbsent'], 'string')
  assert.ok(EDITEUR.includes("t('page.apparence.envoiAbsent')"))
  assert.equal(PAGE.includes('/branding/upload'), true, 'la page ne dit plus ce qui manque')
})

test('apparence — les trois sections et les libellés mesurés sont rendus', () => {
  for (const cle of ['section1', 'section2', 'section3']) {
    assert.ok(EDITEUR.includes(`t('page.apparence.${cle}')`), `la section « ${cle} » a disparu`)
  }
  // Les trois titres sont ceux du DOM mesuré, au point médian près.
  for (const titre of ['1 · Votre commerce', '2 · Votre couleur', '3 · Le haut de la carte']) {
    assert.ok(CAPTURE.includes(titre), `« ${titre} » n’est plus dans la capture`)
    assert.ok(
      Object.values(FR).includes(titre),
      `« ${titre} » n’est plus dans le dictionnaire`
    )
  }
  // Le bouton, et un seul : la cible n'en a qu'un pour les trois sections.
  assert.equal((EDITEUR.match(/type="submit"/g) ?? []).length, 1)
})
