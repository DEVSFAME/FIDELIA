/* ============================================================================
   R3 — caméra du scanner : ce qui se vérifie sans caméra.

   Aucun test ne peut ouvrir un appareil photo : la permission est une décision
   humaine, et Node n'a ni `BarcodeDetector` ni `getUserMedia`. Simuler l'API ne
   prouverait que la simulation. On vérifie donc le **contrat** :

     1. un code n'entre dans l'URL que s'il passe `codeCarteValide` **et**
        `jetonValide` — un EAN de 13 chiffres passe `jetonValide` seul, et c'est
        exactement le faux positif que la seconde garde doit arrêter ;
     2. permission, absence d'API, appareil et panne sont quatre états
        distincts, et une erreur inconnue n'est **jamais** un refus ;
     3. la caméra ne touche pas la RPC : elle navigue vers `/scan?code=…`, la
        même URL que la saisie manuelle ;
     4. chaque état a un texte qui existe au dictionnaire, et le composant le
        rend réellement.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DESTINATIONS_CARTE,
  ETATS_CAMERA,
  FORMAT_LU,
  capacitesCamera,
  cheminCarte,
  classerErreurCamera,
  codeDepuisScan,
  codeDesDetections,
  qrSupporte,
} from '../../../web/src/lib/camera.mjs'
import { FORME_CODE, codeCarteValide, normaliserCode } from '../../../web/src/lib/carte.mjs'
import { LONGUEUR_MAX_JETON, jetonValide } from '../../../web/src/lib/rpc.mjs'
import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')
const PAGE = ['web', 'src', 'app', '(dashboard)', 'scan', 'page.jsx']
const COMPOSANT = ['web', 'src', 'components', 'scan', 'CameraScanner.jsx']

test('caméra — l’absence d’API est un état d’écran, pas une exception', () => {
  const nu = { aLecteur: false, aFlux: false, utilisable: false, etat: ETATS_CAMERA.nonSupporte }
  assert.deepEqual(capacitesCamera(), nu, 'sans argument, rien n’est disponible')

  // Un seul des deux ne suffit pas : lire un QR ne sert à rien sans flux.
  assert.equal(
    capacitesCamera({ BarcodeDetector: class Lecteur {} }).etat,
    ETATS_CAMERA.nonSupporte,
    'lecteur sans flux'
  )
  assert.equal(
    capacitesCamera({ mediaDevices: { getUserMedia() {} } }).etat,
    ETATS_CAMERA.nonSupporte,
    'flux sans lecteur'
  )

  // `BarcodeDetector` doit être **instanciable** : un objet qui porte un
  // `detect()` sans constructeur déplacerait l’échec après la permission.
  const objet = capacitesCamera({
    BarcodeDetector: { detect() {} },
    mediaDevices: { getUserMedia() {} },
  })
  assert.equal(objet.utilisable, false, 'un objet non constructible n’est pas une API')
  assert.equal(objet.etat, ETATS_CAMERA.nonSupporte)

  const complet = capacitesCamera({
    BarcodeDetector: class Lecteur {},
    mediaDevices: { getUserMedia() {} },
  })
  assert.equal(complet.utilisable, true)
  assert.equal(complet.etat, ETATS_CAMERA.repos, 'prêt ne veut pas dire permission accordée')
})

test('caméra — refus, appareil et panne ne se confondent pas', () => {
  for (const nom of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) {
    const classe = classerErreurCamera({ name: nom })
    assert.equal(classe.etat, ETATS_CAMERA.refus, nom)
    assert.equal(classe.permission, true, `${nom} est un refus`)
  }

  for (const nom of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
    const classe = classerErreurCamera({ name: nom })
    assert.equal(classe.etat, ETATS_CAMERA.sansCamera, nom)
    assert.equal(classe.permission, false, `${nom} n’est pas un refus`)
  }

  for (const nom of ['NotReadableError', 'TrackStartError', 'AbortError']) {
    assert.equal(classerErreurCamera({ name: nom }).etat, ETATS_CAMERA.indisponible, nom)
  }

  // La règle qui compte : ce qu’on ne reconnaît pas n’est jamais un refus.
  for (const inconnue of [null, undefined, {}, new Error('boum'), { name: 42 }, { name: 'TypeError' }]) {
    const classe = classerErreurCamera(inconnue)
    assert.equal(classe.etat, ETATS_CAMERA.indisponible)
    assert.equal(classe.permission, false, 'une panne ne se déguise pas en choix')
  }
})

test('caméra — seul un C-XXXXXX sort, quand jetonValide seul dirait oui', () => {
  for (const saisie of ['C-AB12CD', 'c-ab12cd', ' C-ab12cd ', 'https://fidelia.ma/card/c-ab12cd']) {
    const code = codeDepuisScan(saisie)
    assert.equal(code, 'C-AB12CD', `saisie : ${saisie}`)
    // La sortie respecte les deux contrats : forme du code **et** jeton.
    assert.match(code, FORME_CODE)
    assert.ok(code.length <= LONGUEUR_MAX_JETON)
    assert.equal(jetonValide(code), true)
  }

  // Le faux positif à arrêter : un EAN d’emballage est un jeton « valide ».
  const ean = '1234567890123'
  assert.equal(jetonValide(ean), true, 'prémisse : jetonValide ne regarde que la longueur')
  assert.equal(codeCarteValide(ean), false)
  assert.equal(codeDepuisScan(ean), '', 'un code-barres produit n’est pas une carte')

  for (const dechet of ['', '   ', null, undefined, 42, 'C-AB12C', 'AB12CD']) {
    assert.equal(codeDepuisScan(dechet), '', `refus attendu : ${String(dechet)}`)
  }

  // Parité avec le champ manuel : la caméra n'est ni plus stricte (elle
  // refuserait une saisie qui marche au clavier) ni plus laxiste (elle ferait
  // entrer un code que la page refusera). La règle est celle de `carte.mjs`.
  for (const saisie of ['C-AB12CD', 'c-ab12cd', 'C-AB12CDE', 'https://x.ma/c-xy98zw', ean, '', 'zz']) {
    const attendu = codeCarteValide(normaliserCode(saisie)) && jetonValide(normaliserCode(saisie))
      ? normaliserCode(saisie)
      : ''
    assert.equal(codeDepuisScan(saisie), attendu, `parité rompue sur « ${saisie} »`)
  }
})

test('caméra — une image peut porter plusieurs codes, on prend le bon', () => {
  assert.equal(codeDesDetections([]), '')
  assert.equal(codeDesDetections(null), '')
  assert.equal(codeDesDetections([{ rawValue: '1234567890123' }]), '')
  assert.equal(codeDesDetections([null, { rawValue: 'C-AB12CD' }]), 'C-AB12CD')
  assert.equal(
    codeDesDetections([{ rawValue: '1234567890123' }, { rawValue: 'c-xy98zw' }]),
    'C-XY98ZW',
    'le premier code valide gagne, pas la première détection'
  )
})

test('caméra — un code invalide ne peut pas fabriquer d’URL', () => {
  assert.equal(cheminCarte('C-AB12CD'), '/scan?code=C-AB12CD')
  assert.equal(cheminCarte(' c-ab12cd '), '/scan?code=C-AB12CD')
  assert.equal(cheminCarte('1234567890123'), '')
  assert.equal(cheminCarte(''), '')

  // La destination est un **paramètre**, et la liste est fermée : la caméra
  // écrit une URL, donc accepter un chemin quelconque en ferait un redirecteur
  // ouvert. `/caisse` a été ajoutée le 2026-11-01 pour scanner la carte au
  // comptoir ; ce n'est pas une raison pour en accepter une troisième sans la
  // déclarer ici.
  assert.equal(cheminCarte('C-AB12CD', '/caisse'), '/caisse?code=C-AB12CD')
  assert.equal(cheminCarte('1234567890123', '/caisse'), '', 'un code invalide le reste')
  assert.equal(cheminCarte('C-AB12CD', '/dashboard'), '', 'destination non déclarée')
  assert.equal(cheminCarte('C-AB12CD', '/caissee'), '', 'une faute de frappe ne mène nulle part')
  assert.deepEqual([...DESTINATIONS_CARTE], ['/scan', '/caisse'])

  // Le paramètre est celui que la page lit : si l’un renomme, l’autre meurt.
  const page = lire(...PAGE)
  assert.ok(
    page.includes("const { code = '', etat } = await searchParams"),
    'la page ne lit plus `code` dans searchParams'
  )
  assert.ok(page.includes('normaliserCode(code)'), 'la page ne normalise plus le code reçu')
})

test('caméra — énumération absente n’est pas absence de lecteur', () => {
  assert.equal(FORMAT_LU, 'qr_code')
  assert.equal(qrSupporte(null), true, 'API sans énumération : on tente')
  assert.equal(qrSupporte(undefined), true)
  assert.equal(qrSupporte([]), true)
  assert.equal(qrSupporte(['qr_code']), true)
  assert.equal(qrSupporte(['ean_13', 'qr_code']), true)
  assert.equal(qrSupporte(['ean_13', 'code_128']), false, 'liste explicite sans QR : non')
})

test('caméra — le composant ne connaît ni la RPC ni le jeton', () => {
  const composant = lire(...COMPOSANT)
  const page = lire(...PAGE)

  assert.ok(composant.startsWith("'use client'"), 'le composant doit être client')
  assert.equal(page.startsWith("'use client'"), false, 'la page doit rester serveur (elle appelle la RPC)')

  // Rien de ce qui écrit ou lit une carte ne doit se trouver dans le
  // navigateur : la caméra ne produit qu’une URL, la page fait le reste.
  for (const interdit of [
    'award_loyalty_points',
    'redeem_loyalty_reward',
    'carte_par_token',
    'crediterPoints',
    '.rpc(',
    'supabase',
    'fetch(',
  ]) {
    assert.equal(
      composant.includes(interdit),
      false,
      `le composant ne doit pas contenir « ${interdit} »`
    )
  }

  // Le raccordement est une **navigation**, avec l’URL construite par le module.
  assert.ok(
    composant.includes('const cible = cheminCarte(code, destination)'),
    'la caméra ne passe plus la destination à `cheminCarte`'
  )
  assert.ok(composant.includes('window.location.assign(cible)'))

  // La page branche le composant sans changer la RPC d’un pouce. `/scan` garde
  // le défaut (`/scan`), la caisse doit dire explicitement la sienne : sinon un
  // scan au comptoir renvoie vers la fiche carte au lieu d’y rester.
  assert.ok(page.includes("import { CameraScanner } from '@/components/scan/CameraScanner'"))
  assert.ok(page.includes('<CameraScanner locale={locale} />'))
  assert.ok(page.includes('carteParToken(jeton)'), 'la lecture de carte a changé')
  assert.ok(page.includes("import { crediterPoints } from './actions.js'"), 'l’action a changé')
  assert.ok(page.includes('<JaugePoints'), 'la fiche carte a changé')

  const caisse = lire('web', 'src', 'app', '(dashboard)', 'caisse', 'page.jsx')
  const camerasonCaisse = caisse.match(/<CameraScanner[^>]*\/>/)
  assert.ok(camerasonCaisse, 'la caisse n’a pas de caméra')
  assert.ok(
    camerasonCaisse[0].includes('destination="/caisse"'),
    'la caméra de la caisse ne reste pas sur `/caisse`'
  )

  // Toute destination écrite dans un écran doit être déclarée : c’est la liste
  // fermée qui empêche un chemin inventé de devenir une redirection.
  for (const [nom, source] of [
    ['scan', page],
    ['caisse', caisse],
  ]) {
    for (const [, valeur] of source.matchAll(/destination=["']([^"']+)["']/g)) {
      assert.ok(
        DESTINATIONS_CARTE.includes(valeur),
        `destination « ${valeur} » dans ${nom}, absente de DESTINATIONS_CARTE`
      )
    }
  }
})

test('caméra — chaque état a un texte, et le composant le rend vraiment', () => {
  const table = dictionnaire('fr')
  const cles = [
    'page.scanner.camera.titre',
    'page.scanner.camera.aide',
    'page.scanner.camera.activer',
    'page.scanner.camera.demande',
    'page.scanner.camera.arreter',
    'page.scanner.camera.video',
    'page.scanner.camera.actif',
    'page.scanner.camera.refus',
    'page.scanner.camera.sansCamera',
    'page.scanner.camera.nonSupporte',
    'page.scanner.camera.indisponible',
    'page.scanner.camera.repli',
  ]
  assert.deepEqual(
    cles.filter((cle) => typeof table[cle] !== 'string'),
    [],
    'clés manquantes au dictionnaire'
  )

  // Quatre causes, quatre textes : un message unique ferait chercher du mauvais
  // côté (permission refusée ≠ navigateur sans API ≠ pas de caméra ≠ flux KO).
  const echecs = ['refus', 'sansCamera', 'nonSupporte', 'indisponible'].map(
    (etat) => table[`page.scanner.camera.${etat}`]
  )
  assert.equal(new Set(echecs).size, 4)

  const composant = lire(...COMPOSANT)
  for (const etat of ['refus', 'sansCamera', 'nonSupporte', 'indisponible', 'actif', 'demande']) {
    assert.ok(composant.includes(`ETATS_CAMERA.${etat}`), `état jamais rendu : ${etat}`)
  }

  // Un état écrit en dur échapperait au module qui le définit.
  assert.equal(/setEtat\('/.test(composant), false, 'état écrit en dur')
})

test('caméra — la permission est traitée comme un état, jamais comme une panne', () => {
  const composant = lire(...COMPOSANT)

  // La demande part d’un clic, pas du montage : un prompt au chargement est
  // bloqué par le navigateur pour tout le site, et le commerçant n’a rien
  // demandé.
  assert.equal(/useEffect\([^)]*getUserMedia/.test(composant), false, 'permission demandée au montage')

  // Les ressources sont rendues : pistes arrêtées, minuteur coupé, démontage
  // couvert. Une caméra qui reste allumée après un changement de page se voit.
  assert.ok(composant.includes('getTracks()'))
  assert.ok(composant.includes('piste.stop()'))
  assert.ok(composant.includes('clearInterval(minuteur.current)'))
  assert.ok(composant.includes('useEffect(() => liberer, [liberer])'))

  // Aucune exception ne remonte : dans Next, un `throw` côté client devient une
  // frontière d’erreur, donc un écran mort à la place de la saisie manuelle.
  assert.equal(/throw new/.test(composant), false, 'exception levée dans le composant')

  // Une seule navigation, même si deux images lisent le même QR.
  assert.ok(composant.includes('navigation.current = true'))
  assert.equal((composant.match(/location\.assign/g) || []).length, 1, 'une seule navigation')
})
