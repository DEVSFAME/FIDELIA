/* ============================================================================
   `web/public/sw.js` — exécuté, pas relu.

   Un service worker n'a ni build ni import : le relire caractère par caractère
   ne prouve rien. On l'exécute donc dans un contexte `vm` avec un faux `self`,
   et on **déclenche** les évènements pour lire ce qu'il produit.

   Ce que ce fichier empêche :
     1. **une notification vide.** Un `push` sans JSON, ou un JSON sans `title`,
        tombe sur un repli neutre — jamais sur un titre vide, qui ne s'affiche
        pas du tout ;
     2. **deux onglets pour la même carte.** Le clic doit **focaliser** un onglet
        déjà ouvert sur l'URL, et n'ouvrir que s'il n'y en a pas ;
     3. **un `openWindow` relatif.** Une URL relative ouvrirait un chemin du
        service worker, pas la page ;
     4. **une exception qui avale la notification.** `json()` peut lever : le
        repli texte doit tenir.
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SOURCE = readFileSync(join(RACINE, 'web', 'public', 'sw.js'), 'utf8')

/** Le service worker, chargé dans un contexte isolé avec ses observateurs. */
function charger() {
  const ecouteurs = new Map()
  const notifications = []
  const ouvertes = []
  const fenetres = []
  const focalisees = []

  const self = {
    location: { origin: 'https://fidelia.ma' },
    addEventListener(type, gestionnaire) {
      ecouteurs.set(type, gestionnaire)
    },
    registration: {
      showNotification(titre, options) {
        notifications.push({ titre, options })
        return Promise.resolve()
      },
    },
    clients: {
      matchAll: async () => fenetres,
      openWindow: async (url) => {
        ouvertes.push(url)
        return null
      },
      claim: async () => undefined,
    },
  }

  const contexte = vm.createContext({ self, URL, Response, console: { warn() {} } })
  vm.runInContext(SOURCE, contexte, { filename: 'sw.js' })

  /** Ajoute une fenêtre ouverte, avec son `focus` espionné. */
  function fenetre(url) {
    const entree = {
      url,
      focus: async () => {
        focalisees.push(url)
      },
    }
    fenetres.push(entree)
    return entree
  }

  return { ecouteurs, notifications, ouvertes, focalisees, fenetre }
}

/** Déclenche un évènement et attend son `waitUntil`. */
async function declencher(ecouteurs, type, evenement) {
  const gestionnaire = ecouteurs.get(type)
  assert.ok(gestionnaire, `aucun gestionnaire « ${type} »`)
  let attente
  gestionnaire({ ...evenement, waitUntil: (promesse) => (attente = promesse) })
  await attente
}

test('sw — les cinq évènements sont écoutés, dont `push` et `notificationclick`', () => {
  const { ecouteurs } = charger()
  for (const type of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
    assert.ok(ecouteurs.has(type), `« ${type} » n’est pas écouté`)
  }
})

test('sw — un push JSON devient une notification complète', async () => {
  const sw = charger()
  const charge = { title: 'Café offert', body: 'Ce week-end', icon: '/brand/logo.png', url: '/card/x' }

  await declencher(sw.ecouteurs, 'push', {
    data: { text: () => JSON.stringify(charge), json: () => charge },
  })

  assert.equal(sw.notifications.length, 1)
  const { titre, options } = sw.notifications[0]
  assert.equal(titre, 'Café offert')
  assert.equal(options.body, 'Ce week-end')
  assert.equal(options.icon, '/brand/logo.png')
  assert.equal(options.badge, '/icon-192.png')
  /* Les objets rendus naissent dans le contexte `vm` : leur prototype n'est pas
     celui de ce fichier, et `deepStrictEqual` le verrait. On compare le contenu,
     pas la provenance. */
  assert.deepEqual({ ...options.data }, { url: '/card/x' })
  assert.deepEqual([...options.vibrate], [100, 50, 100])
})

test('sw — un push sans JSON (ou au JSON cassé) garde un titre neutre', async () => {
  // Cas 1 : du texte brut, sans `json()` du tout.
  const brut = charger()
  await declencher(brut.ecouteurs, 'push', { data: { text: () => 'Message brut' } })
  assert.equal(brut.notifications[0].titre, 'Notification')
  assert.equal(brut.notifications[0].options.body, 'Message brut')
  assert.equal(brut.notifications[0].options.icon, '/icon-192.png')
  assert.deepEqual({ ...brut.notifications[0].options.data }, { url: '/' })

  // Cas 2 : `json()` qui lève — c'est ce que fait un corps tronqué.
  const casse = charger()
  await declencher(casse.ecouteurs, 'push', {
    data: {
      text: () => 'reste du corps',
      json: () => {
        throw new Error('JSON invalide')
      },
    },
  })
  assert.equal(casse.notifications[0].titre, 'Notification')
  assert.equal(casse.notifications[0].options.body, 'reste du corps')

  // Cas 3 : un JSON sans `title` — un émetteur qui n'a rien décidé.
  const sansTitre = charger()
  await declencher(sansTitre.ecouteurs, 'push', {
    data: { text: () => '{}', json: () => ({ body: 'Sans titre' }) },
  })
  assert.equal(sansTitre.notifications[0].titre, 'Notification')
  assert.equal(sansTitre.notifications[0].options.body, 'Sans titre')
})

test('sw — le clic focalise l’onglet déjà ouvert, sinon en ouvre un', async () => {
  const sw = charger()

  // Un onglet existe sur la même page, avec un paramètre de plus : c'est le
  // même onglet (la comparaison porte sur l'origine + le chemin).
  sw.fenetre('https://fidelia.ma/card/abc?source=push')
  await declencher(sw.ecouteurs, 'notificationclick', {
    notification: { close() {}, data: { url: '/card/abc' } },
  })
  assert.deepEqual(sw.focalisees, ['https://fidelia.ma/card/abc?source=push'])
  assert.deepEqual(sw.ouvertes, [], 'un second onglet a été ouvert pour la même page')

  // Aucun onglet sur cette page : on en ouvre un, en absolu.
  const ailleurs = charger()
  ailleurs.fenetre('https://fidelia.ma/dashboard')
  await declencher(ailleurs.ecouteurs, 'notificationclick', {
    notification: { close() {}, data: { url: '/card/abc' } },
  })
  assert.deepEqual(ailleurs.focalisees, [])
  assert.deepEqual(ailleurs.ouvertes, ['https://fidelia.ma/card/abc'])

  // Pas d'URL dans la notification : la racine, jamais `undefined`.
  const sansUrl = charger()
  await declencher(sansUrl.ecouteurs, 'notificationclick', {
    notification: { close() {}, data: null },
  })
  assert.deepEqual(sansUrl.ouvertes, ['https://fidelia.ma/'])
})

test('sw — la notification est fermée dès le clic', async () => {
  const sw = charger()
  let fermee = false
  await declencher(sw.ecouteurs, 'notificationclick', {
    notification: {
      close() {
        fermee = true
      },
      data: { url: '/' },
    },
  })
  assert.equal(fermee, true, 'la notification reste affichée après le clic')
})

