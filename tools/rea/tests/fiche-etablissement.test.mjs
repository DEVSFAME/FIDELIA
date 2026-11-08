/* ============================================================================
   P0-2 — la page `/settings` (fiche établissement), de la mesure au raccordement.

   Ce que ce fichier empêche :
     1. **la copie recopiée à moitié** — chaque libellé comparé à son témoin
        dans `c01-settings.html` ;
     2. **un champ renommé** — les 14 `name` de la capture confrontés à la page ;
     3. **un refus sans texte**, ou un code qui n'est pas dans `CODES_CONNUS` ;
     4. **une borne perdue** (`min=50`, `max=2000`, `step=50`, `maxlength=120`) ;
     5. **ce qui n'est pas rendu qui revient sans décision** — mot de passe,
        résiliation, couverture calculée ;
     6. **un oubli d'invalidation du cache** : le nom est un des champs, et il
        est servi par `programmeDuCommerce()`.

   Aucun navigateur, aucune connexion : on lit la capture, les sources et les
   modules purs.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'
import { ENTREES } from '../../../web/src/lib/navigation.mjs'
import {
  NOM_MAX,
  RAYON_DEFAUT,
  RAYON_MAX,
  RAYON_MIN,
  RAYON_PAS,
  TEXTE_MAX,
  TYPES_ACTIVITE,
  ficheDepuisFormulaire,
  lireFiche,
  nomValide,
  rayonValide,
  refusFiche,
  texteValide,
  typeActiviteValide,
} from '../../../web/src/lib/etablissement.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const CAPTURE = lire('01_REA_Fidelix', '_captures', '2026-11-02-a7', 'rendu', 'c01-settings.html')
const PAGE = lire('web', 'src', 'app', '(dashboard)', 'settings', 'page.jsx')
const ACTION = lire('web', 'src', 'app', '(dashboard)', 'settings', 'actions.js')
const DONNEES = lire('web', 'src', 'lib', 'donnees.mjs')

const FR = dictionnaire('fr')

/** Les 14 contrôles mesurés, dans l'ordre du DOM de la cible. */
const NOMS = Object.freeze([
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
])

/** Texte visible de la capture : balises retirées, entités résolues. */
const TEXTE = CAPTURE.replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')

/* L'apostrophe est une typographie, pas une mesure : la capture écrit `'`, le
   dictionnaire écrit `’`. On normalise, et seulement l'apostrophe. */
const plat = (texte) => String(texte).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()

/** Rend un gabarit du dictionnaire, comme le fait `traduire()`. */
const rendu = (cle, variables) =>
  plat(
    FR[cle].replace(/\{(\w+)\}/g, (entier, nom) =>
      Object.hasOwn(variables ?? {}, nom) ? String(variables[nom]) : entier
    )
  )

/* ---------------------------------------------------------------------------
   1. Les témoins — la mesure est toujours là, et c'est elle qui décide
   ------------------------------------------------------------------------ */

test('capture — les quatorze contrôles nommés sont dans le DOM mesuré', () => {
  for (const nom of NOMS) {
    assert.ok(CAPTURE.includes(`name="${nom}"`), `contrôle absent de la capture : « ${nom} »`)
  }
  assert.equal(NOMS.length, 14, 'la cible porte quatorze contrôles, pas treize')

  // Les trois valeurs du menu, lues dans le balisage.
  for (const valeur of TYPES_ACTIVITE) {
    assert.ok(CAPTURE.includes(`value="${valeur}"`), `option absente de la capture : « ${valeur} »`)
  }

  // Les deux bornes qui sont des règles, pas des exemples.
  assert.ok(CAPTURE.includes('min="50"'), 'borne basse du rayon disparue')
  assert.ok(CAPTURE.includes('max="2000"'), 'borne haute du rayon disparue')
  assert.ok(CAPTURE.includes('step="50"'), 'pas du rayon disparu')
  assert.ok(CAPTURE.includes('maxlength="120"'), 'borne du message disparue')
})

test('capture — les libellés et les exemples sont dans le texte rendu', () => {
  const temoins = [
    'Établissement',
    'Nom *',
    'Type d’activité',
    'Téléphone',
    'Ville',
    'Adresse',
    'Description courte',
    'Liens sur la carte',
    'Site web',
    'Réservation en ligne',
    'Instagram',
    'Facebook',
    'TikTok',
    'Notification à proximité',
    'Emplacement de la boutique',
    'Distance de déclenchement',
    'Message affiché',
    'Enregistrer',
  ]
  const texte = plat(TEXTE)
  for (const temoin of temoins) {
    assert.ok(texte.includes(plat(temoin)), `témoin absent de la capture : « ${temoin} »`)
  }

  for (const placeholder of [
    '+212 6 00 00 00 00',
    'Casablanca',
    '123 rue Mohammed V',
    'Restaurant marocain traditionnel...',
    'moncafe.ma',
    'moncafe.ma/reserver',
    'instagram.com/moncafe',
    'facebook.com/moncafe',
    'tiktok.com/@moncafe',
    'Collez votre lien Google Maps',
    '1000',
    'Un café vous attend chez nous ☕',
  ]) {
    assert.ok(
      CAPTURE.includes(`placeholder="${placeholder}"`),
      `placeholder mesuré disparu : « ${placeholder} »`
    )
  }
})

/* ---------------------------------------------------------------------------
   2. La copie — le dictionnaire doit rendre le texte de la capture
   ------------------------------------------------------------------------ */

test('copie — les libellés rendus sont, au caractère près, ceux de la capture', () => {
  assert.equal(rendu('page.compte.titre'), 'Mon compte')
  assert.equal(rendu('page.compte.etablissement'), 'Établissement')
  assert.equal(rendu('page.compte.nom'), 'Nom *')
  assert.equal(rendu('page.compte.typeActivite'), "Type d'activité")
  assert.equal(rendu('page.compte.phone'), 'Téléphone')
  assert.equal(rendu('page.compte.city'), 'Ville')
  assert.equal(rendu('page.compte.address'), 'Adresse')
  assert.equal(rendu('page.compte.description'), 'Description courte')
  assert.equal(rendu('page.compte.liens'), 'Liens sur la carte')
  assert.equal(rendu('page.compte.site'), 'Site web')
  assert.equal(rendu('page.compte.reservation'), 'Réservation en ligne')
  assert.equal(rendu('page.compte.instagram'), 'Instagram')
  assert.equal(rendu('page.compte.facebook'), 'Facebook')
  assert.equal(rendu('page.compte.tiktok'), 'TikTok')
  assert.equal(rendu('page.compte.proximite'), 'Notification à proximité')
  assert.equal(rendu('page.compte.emplacement'), 'Emplacement de la boutique')
  assert.equal(rendu('page.compte.rayon'), 'Distance de déclenchement')
  assert.equal(rendu('page.compte.texte'), 'Message affiché')
  assert.equal(rendu('page.compte.action'), 'Enregistrer')

  assert.equal(
    rendu('page.compte.type.physique'),
    'Commerce physique — mes clients viennent sur place'
  )
  assert.equal(rendu('page.compte.type.enLigne'), 'Commerce en ligne — je vends à distance')
  assert.equal(rendu('page.compte.type.mixte'), 'Les deux')
})

test('copie — les phrases d’aide sont celles de la capture', () => {
  assert.equal(
    rendu('page.compte.liensAide'),
    "Affichés au dos de la carte de vos clients, dans leur wallet. L'adresse et le " +
      'téléphone ci-dessus y figurent aussi, et sont cliquables.'
  )
  assert.equal(
    rendu('page.compte.emplacementAide'),
    'Sur Google Maps : trouvez votre boutique, appuyez sur Partager, puis copiez le lien. ' +
      'Vous pouvez aussi saisir vos coordonnées : 33.5731, -7.5898. Laissez vide pour désactiver.'
  )
  /* Depuis la passe A8 la couverture est **rendue** : la formule a été lue
     dans le chunk, donc le chiffre ne s'invente plus. Les deux fragments et le
     gabarit sont comparés à la mesure, mot pour mot. */
  assert.equal(
    rendu('page.compte.rayonAide1'),
    "En mètres, jusqu'à 2000. Couverture réelle :"
  )
  assert.equal(rendu('page.compte.couverture', { metres: 859 }), '≈ 859 m')
  assert.equal(
    rendu('page.compte.rayonAide2'),
    '. Apple et Google fixent eux-mêmes la portée de chaque point ; nous en ' +
      'plaçons plusieurs autour de votre boutique pour couvrir la zone, sans jamais ' +
      'pouvoir dépasser ce plafond.'
  )

  /* Le gabarit rendu avec le texte **de la cible** redonne la phrase mesurée. */
  assert.equal(
    rendu('page.compte.texteAide', { commerce: '[votre commerce]' }),
    '120 caractères maximum. Vide = « Vous êtes près de [votre commerce] ».'
  )
})

/* ---------------------------------------------------------------------------
   3. Les champs — la page porte les `name` de la cible, pas les siens
   ------------------------------------------------------------------------ */

test('page — chaque contrôle porte le `name` mesuré, et aucun autre', () => {
  // Sens 1 : les quatorze de la capture sont dans la page.
  for (const nom of NOMS) {
    const motif = nom === 'type_activite' ? `name="${nom}"` : `nom="${nom}"`
    assert.ok(PAGE.includes(motif), `la page a perdu le contrôle « ${nom} »`)
  }

  // Sens 2 : la page n'invente pas de champ.
  const dansLaPage = [...PAGE.matchAll(/\bnom="([a-z_]+)"/g)].map((trouve) => trouve[1])
  for (const nom of dansLaPage) {
    assert.ok(NOMS.includes(nom), `champ absent de la mesure : « ${nom} »`)
  }
  assert.equal(dansLaPage.length, NOMS.length - 1, 'un champ rendu deux fois ?')
})

test('page — les bornes mesurées sont posées sur les contrôles', () => {
  assert.ok(PAGE.includes('min="50"'), 'borne basse du rayon absente')
  assert.ok(PAGE.includes('max="2000"'), 'borne haute du rayon absente')
  assert.ok(PAGE.includes('step="50"'), 'pas du rayon absent')
  assert.ok(PAGE.includes('maxLength={120}'), 'borne du message absente')
  assert.ok(PAGE.includes('required'), 'le nom n’est plus obligatoire')
  assert.ok(PAGE.includes('action={enregistrer}'), 'le formulaire n’appelle plus l’action')
})


/* ---------------------------------------------------------------------------
   4. Les règles pures
   ------------------------------------------------------------------------ */

test('module — le rayon tient dans les bornes ET sur le pas mesuré', () => {
  for (const bon of [RAYON_MIN, 100, RAYON_DEFAUT, RAYON_MAX]) {
    assert.equal(rayonValide(bon), true, `refusé à tort : ${bon}`)
  }
  for (const mauvais of [0, RAYON_MIN - 1, 125, RAYON_MAX + 50, 10.5, '100', null]) {
    assert.equal(rayonValide(mauvais), false, `accepté à tort : ${String(mauvais)}`)
  }
  assert.equal(RAYON_PAS, 50)
})

test('module — le nom et le message ont les bornes de la colonne et du balisage', () => {
  assert.equal(nomValide('Mon café'), true)
  assert.equal(nomValide('   '), false, 'un nom d’espaces n’est pas un nom')
  assert.equal(nomValide('x'.repeat(NOM_MAX)), true)
  assert.equal(nomValide('x'.repeat(NOM_MAX + 1)), false)
  assert.equal(nomValide(null), false)

  assert.equal(texteValide(''), true, 'le message est facultatif')
  assert.equal(texteValide(null), true)
  assert.equal(texteValide('x'.repeat(TEXTE_MAX)), true)
  assert.equal(texteValide('x'.repeat(TEXTE_MAX + 1)), false)
})

test('refus — cinq codes, ordre fixe, et chacun a son texte', () => {
  const valide = {
    nom: 'Mon café',
    typeActivite: 'physique',
    emplacement: { etat: 'ok', code: null },
    rayon: RAYON_DEFAUT,
    texte: '',
  }
  assert.deepEqual(refusFiche(valide), [], 'un jeu valide ne doit rien refuser')

  const cas = [
    ['nom', { nom: '  ' }],
    ['type', { typeActivite: 'franchise' }],
    ['emplacement', { emplacement: { etat: 'refus', code: 'invalide' } }],
    ['emplacementCourt', { emplacement: { etat: 'refus', code: 'lienCourt' } }],
    ['rayon', { rayon: 125 }],
    ['texte', { texte: 'x'.repeat(TEXTE_MAX + 1) }],
  ]
  for (const [code, surcharge] of cas) {
    assert.deepEqual(refusFiche({ ...valide, ...surcharge }), [code], `code attendu : ${code}`)
  }

  // L'ordre est fixe : deux refus sortent dans l'ordre déclaré, pas dans
  // l'ordre des clés de l'objet.
  assert.deepEqual(
    refusFiche({
      nom: '',
      typeActivite: 'x',
      emplacement: { etat: 'refus', code: 'invalide' },
      rayon: 0,
      texte: 'y'.repeat(200),
    }),
    ['nom', 'type', 'emplacement', 'rayon', 'texte']
  )

  // Un code sans texte s'afficherait en exception.
  for (const code of [
    'nom',
    'type',
    'emplacement',
    'emplacementCourt',
    'rayon',
    'texte',
    'refus',
  ]) {
    assert.ok(FR[`page.compte.erreur.${code}`], `message manquant pour « ${code} »`)
  }
  assert.equal(typeActiviteValide('mixte'), true)
  assert.equal(typeActiviteValide('MIXTE'), false, 'les valeurs sont celles du menu, en minuscules')
})

test('module — le formulaire est détouré, et un rayon vide vaut le défaut', () => {
  const double = (valeurs) => ({ get: (nom) => valeurs[nom] ?? null })

  const lue = ficheDepuisFormulaire(
    double({
      name: '  Mon café  ',
      type_activite: 'mixte',
      phone: ' +212 600000000 ',
      city: 'Casablanca',
      address: '',
      description: 'Café de quartier',
      site_url: 'moncafe.ma',
      reservation_url: '',
      instagram_url: 'instagram.com/moncafe',
      facebook_url: '',
      tiktok_url: '',
      lien_localisation: '33.5731, -7.5898',
      geofence_radius_m: '',
      geofence_texte: 'Un café vous attend',
    })
  )

  assert.equal(lue.nom, 'Mon café')
  assert.equal(lue.phone, '+212 600000000')
  assert.equal(lue.rayon, RAYON_DEFAUT, 'un rayon vide ne doit pas devenir NaN')
  assert.deepEqual(refusFiche(lue), [], 'le formulaire lu doit être valide')

  // L'emplacement : la chaîne reste pour l'écran, les nombres partent en base.
  assert.equal(lue.lienLocalisation, '33.5731, -7.5898')
  assert.equal(lue.latitude, 33.5731)
  assert.equal(lue.longitude, -7.5898)
  assert.deepEqual(lue.emplacement, { etat: 'ok', code: null })

  // Un champ présent mais vide reste une chaîne vide : c'est `0011` qui en
  // fait `NULL`, et l'écran qui l'affiche vide.
  assert.equal(lue.address, '')
})

test('module — un emplacement vide désactive, un lien court est refusé', () => {
  const double = (valeurs) => ({ get: (nom) => valeurs[nom] ?? null })
  const base = {
    name: 'Mon café',
    type_activite: 'physique',
    lien_localisation: '',
    geofence_radius_m: '1000',
  }

  const vide = ficheDepuisFormulaire(double(base))
  assert.deepEqual(vide.emplacement, { etat: 'vide', code: null })
  assert.equal(vide.latitude, null)
  assert.equal(vide.longitude, null)
  assert.deepEqual(refusFiche(vide), [], 'vide = désactivé, pas une faute')

  const court = ficheDepuisFormulaire(
    double({ ...base, lien_localisation: 'https://maps.app.goo.gl/abc123' })
  )
  assert.deepEqual(court.emplacement, { etat: 'refus', code: 'lienCourt' })
  assert.deepEqual(refusFiche(court), ['emplacementCourt'])

  const illisible = ficheDepuisFormulaire(
    double({ ...base, lien_localisation: 'devant la poste' })
  )
  assert.deepEqual(refusFiche(illisible), ['emplacement'])
})

test('module — une réponse RPC est typée, jamais devinée', () => {
  const lue = lireFiche({
    name: 'Mon café',
    type_activite: 'inconnu',
    phone: null,
    city: 'Rabat',
    geofence_radius_m: '500',
    geofence_texte: null,
  })

  assert.equal(lue.nom, 'Mon café')
  assert.equal(lue.typeActivite, 'physique', 'un type inconnu retombe sur le défaut')
  assert.equal(lue.phone, '', 'un `null` de texte devient une chaîne vide')
  assert.equal(lue.rayon, 500, 'un entier rendu en chaîne reste un entier')
  assert.equal(lue.texte, '')
  assert.deepEqual(refusFiche(lue), [], 'la fiche lue doit être enregistrable')

  // Une réponse vide ne doit pas lever.
  assert.equal(lireFiche(null).rayon, RAYON_DEFAUT)
})



/* ---------------------------------------------------------------------------
   5. Ce qui n'est pas rendu — et pourquoi c'est une décision, pas un oubli
   ------------------------------------------------------------------------ */

test('page — les blocs non mesurés ne sont pas rendus, et le disent', () => {
  // « Mot de passe » et « Résiliation » : présents dans la cible, hors socle.
  for (const interdit of ['currentPassword', 'newPassword', 'confirmPassword', 'password']) {
    assert.equal(PAGE.includes(interdit), false, `écran de mot de passe rendu : « ${interdit} »`)
  }
  assert.equal(ACTION.includes('password'), false, 'action de mot de passe branchée')

  /* La couverture est rendue, mais **calculée** : un « 859 » écrit en dur dans
     l'écran serait une constante d'affichage, valable pour un seul rayon. */
  assert.equal(PAGE.includes('859'), false, 'couverture recopiée au lieu d’être calculée')
  assert.ok(PAGE.includes('couvertureM('), 'la page n’appelle pas la formule mesurée')
  assert.ok(PAGE.includes('page.compte.couverture'), 'le gabarit « ≈ {m} m » a disparu')

  // Le commentaire d'en-tête doit porter les absences : sans lui, la prochaine
  // passe les prendrait pour des oublis et les « corrigerait ».
  for (const absence of ['Mot de passe', 'Résiliation', 'Langue']) {
    assert.ok(PAGE.includes(absence), `absence non déclarée : « ${absence} »`)
  }
})

test('page — un schéma sans `0011` a son écran, avec le nom du fichier', () => {
  assert.ok(PAGE.includes('nonMigre'), 'la page ne distingue plus le schéma absent')
  assert.ok(
    PAGE.includes('migrations/0011_fiche_etablissement.sql'),
    'la page ne nomme plus la migration à passer'
  )
  assert.ok(PAGE.includes('EtatBloque'), 'le bloc « migration à passer » a disparu')
  assert.ok(PAGE.includes("lecture.etat === 'absent'"), 'le cas « aucun programme » a disparu')
})

test('navigation — `/settings` est une entrée du rail, une seule fois', () => {
  const reglages = ENTREES.filter((entree) => entree.href === '/settings')
  assert.equal(reglages.length, 1, 'une entrée, et une seule')
  assert.equal(reglages[0].cle, 'tableau.nav.compte')
  assert.ok(FR['tableau.nav.compte'], 'libellé de navigation manquant')
})

/* ---------------------------------------------------------------------------
   6. Le raccordement — quatorze arguments, et le cache vidé
   ------------------------------------------------------------------------ */

test('donnees — les deux appels de la fiche sont branchés, et le cache est invalidé', () => {
  assert.ok(DONNEES.includes('fiche_du_commerce'), 'lecture non branchée')
  assert.ok(DONNEES.includes('enregistrer_fiche_etablissement'), 'écriture non branchée')

  // Les quinze paramètres de `0017` (`0011` + les coordonnées), nommés un par
  // un : un `p_…` renommé dans le SQL sans l'être ici ferait un `PGRST202`, lu
  // comme une migration manquante.
  for (const parametre of [
    'p_name',
    'p_type_activite',
    'p_phone',
    'p_city',
    'p_address',
    'p_description',
    'p_site_url',
    'p_reservation_url',
    'p_instagram_url',
    'p_facebook_url',
    'p_tiktok_url',
    'p_latitude',
    'p_longitude',
    'p_geofence_radius_m',
    'p_geofence_texte',
  ]) {
    assert.ok(DONNEES.includes(`${parametre}:`), `paramètre non envoyé : « ${parametre} »`)
  }

  /* Le lien n'est plus un paramètre : `0017` supprime la colonne, et l'envoi
     d'un `p_lien_localisation` ferait échouer l'appel entier (PostgREST refuse
     un argument inconnu). */
  assert.equal(DONNEES.includes('p_lien_localisation'), false, 'le lien est encore envoyé')

  // Le nom est un des champs : sans invalidation, `/join/<slug>` et le comptoir
  // afficheraient l'ancien nom jusqu'à expiration du cache.
  const ecriture = DONNEES.slice(DONNEES.indexOf('export async function enregistrerFiche'))
  assert.ok(ecriture.includes('cacheProgramme.oublier()'), 'cache du programme non invalidé')

  // `PROGRAM_NOT_FOUND` est traduit, sinon l'écran annoncerait une panne là où
  // la base dit seulement « pas encore de programme ».
  assert.ok(DONNEES.includes("resultat.code === 'PROGRAM_NOT_FOUND'"), 'absence non traduite')
})

test('action — une redirection par refus, et une seule revalidation', () => {
  for (const etat of [
    'nom',
    'type',
    'emplacement',
    'emplacementCourt',
    'rayon',
    'texte',
    'ok',
  ]) {
    assert.ok(ACTION.includes(`etat=${etat}`), `action sans état « ${etat} »`)
  }
  /* Les deux issues de la RPC passent par un ternaire : les valeurs sont des
     littéraux, pas des URL écrites `etat=…`. */
  assert.ok(ACTION.includes("'migration'"), 'action sans état « migration »')
  assert.ok(ACTION.includes("'refus'"), 'action sans état « refus »')

  assert.ok(ACTION.includes('refusFiche'), 'l’action n’appelle plus les règles pures')
  assert.ok(ACTION.includes("revalidatePath('/settings')"), 'page non revalidée après écriture')
})
