/* ============================================================================
   Service worker de la caisse — vanilla, aucune dépendance, aucun build.

   Servi depuis `/sw.js` (racine) pour une raison mesurable : un script sous
   `/caisse/` ne contrôlerait que `/caisse/*`, or l'écran de repli
   `/caisse-hors-ligne` est public (il doit s'ouvrir sans session). Portée
   globale, donc, mais **règles limitées** :

     - `/_next/static/*` et `/polices/*` : cache d'abord (immuables, hachés) ;
     - navigation vers `/caisse` ou `/caisse-hors-ligne` : réseau d'abord, repli
       sur l'écran hors ligne préchargé ;
     - **tout le reste passe au réseau sans être intercepté**.

   Ce qui n'est délibérément **pas** fait : mettre une page authentifiée en
   cache. Un HTML de `/caisse` contient un solde et un code client ; le garder
   sur une tablette de comptoir le rendrait lisible après déconnexion. La
   cible, elle, garde le catalogue des cartes en IndexedDB — écart assumé :
   ici, hors ligne, on crédite en file et on ne relit aucun solde.
   ========================================================================== */

const CACHE = 'fidelia-caisse-v1'
const REPLI = '/caisse-hors-ligne'
const STATIQUES = ['/_next/static/', '/polices/']
const ECRANS = ['/caisse', REPLI]

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(precharger().then(() => self.skipWaiting()))
})

/* Précharger l'écran de repli **et ses morceaux** : `cache.add` d'un HTML ne
   télécharge pas les scripts qu'il référence, donc l'écran s'ouvrirait hors
   ligne sans pouvoir s'hydrater. On lit le HTML, on en extrait les URLs
   statiques, puis on les met en cache. */
async function precharger() {
  const cache = await caches.open(CACHE)
  let reponse
  try {
    reponse = await fetch(REPLI, { cache: 'reload' })
  } catch {
    return
  }
  if (!reponse.ok) return

  const html = await reponse.clone().text()
  await cache.put(REPLI, reponse)

  const morceaux = new Set()
  for (const trouve of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    morceaux.add(trouve[1])
  }
  await Promise.all([...morceaux].map((url) => cache.add(url).catch(() => undefined)))
}

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) {
        if (nom !== CACHE && nom.startsWith('fidelia-caisse-')) await caches.delete(nom)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request
  if (requete.method !== 'GET') return

  const url = new URL(requete.url)
  if (url.origin !== self.location.origin) return

  if (STATIQUES.some((prefixe) => url.pathname.startsWith(prefixe))) {
    evenement.respondWith(cacheDAbord(requete))
    return
  }

  const ecran = ECRANS.some(
    (chemin) => url.pathname === chemin || url.pathname.startsWith(`${chemin}/`)
  )
  if (requete.mode === 'navigate' && ecran) {
    evenement.respondWith(ecranDAbord(requete))
  }
})

async function cacheDAbord(requete) {
  const cache = await caches.open(CACHE)
  const garde = await cache.match(requete)
  if (garde) return garde

  const reponse = await fetch(requete)
  if (reponse.ok) cache.put(requete, reponse.clone())
  return reponse
}

async function ecranDAbord(requete) {
  try {
    return await fetch(requete)
  } catch {
    const cache = await caches.open(CACHE)
    const garde = (await cache.match(requete)) ?? (await cache.match(REPLI))
    if (garde) return garde
    return new Response('Hors ligne.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }


}
/* ----------------------------------------------------------------------------
   Réception d'un message — ajouté par P0-2b (seconde moitié).

   Forme **mesurée** sur la cible (`_captures/…/raw/sondes/f01-sw-js.html`) :

       payload = event.data.json()                 // { title, body, icon?, url? }
       reapli   = { title: <marque>, body: event.data.text() }
       options  = { body, icon: payload.icon || "/icon-192.png",
                    badge: "/icon-192.png", data: { url: payload.url || "/" },
                    vibrate: [100, 50, 100] }
       notificationclick → focus d'un onglet déjà sur l'URL, sinon openWindow

   Ce que ce bloc **ne dit pas** : « vous êtes près de chez nous ». Un push est
   un message du commerçant (`/notifications`) ; la notification de proximité
   est un géorepérage inscrit dans le pass Wallet, qui n'émet aucun envoi. Les
   confondre ferait attendre ici une alerte que seul le Wallet peut produire.

   Le titre de repli n'est **pas** la marque : `marque.nom` a une source unique
   (`i18n/dictionnaires.mjs`), et un service worker statique ne peut pas
   l'importer. Un émetteur qui n'envoie pas de `title` est de toute façon un
   émetteur qui n'a rien décidé — le repli reste neutre plutôt que faux.
   -------------------------------------------------------------------------- */

const TITRE_REPLI = 'Notification'

/**
 * Lit la charge d'un évènement `push`, quelle que soit sa forme.
 *
 * Trois cas, tous réels : du JSON avec un `title`, du JSON sans `title`, et du
 * texte brut (`event.data.text()`). Aucun ne lève : une exception dans un
 * évènement `push` laisse la notification silencieusement absente.
 */
function lireCharge(donnees) {
  const brut = donnees && typeof donnees.text === 'function' ? donnees.text() : ''

  let objet = null
  if (donnees && typeof donnees.json === 'function') {
    try {
      objet = donnees.json()
    } catch {
      objet = null
    }
  }

  const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '')
  const title = texte(objet && objet.title) || TITRE_REPLI
  const body = texte(objet && objet.body) || brut
  const icon = texte(objet && objet.icon) || '/icon-192.png'
  const url = texte(objet && objet.url) || '/'

  return { title, body, icon, url }
}

self.addEventListener('push', (evenement) => {
  const charge = lireCharge(evenement.data)

  evenement.waitUntil(
    self.registration.showNotification(charge.title, {
      body: charge.body,
      icon: charge.icon,
      badge: '/icon-192.png',
      // L'URL voyage dans `data`, jamais dans le `tag` : deux messages
      // différents doivent pouvoir coexister, deux envois du même message non.
      data: { url: charge.url },
      vibrate: [100, 50, 100],
    })
  )
})

/* Clic sur la notification : **un seul onglet** par URL.
   `openWindow` systématique empêcherait de retrouver la carte déjà ouverte et
   empilerait les onglets à chaque relance. La comparaison porte sur l'origine
   + le chemin, pas sur la chaîne entière : un `?source=push` résiduel ne doit
   pas faire ouvrir un second onglet pour la même page. */
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()

  const adresse = new URL(
    (evenement.notification.data && evenement.notification.data.url) || '/',
    self.location.origin
  )

  evenement.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      for (const fenetre of fenetres) {
        const ouverte = new URL(fenetre.url)
        // Comparaison sur l'origine **et** le chemin, jamais sur l'URL entière :
        // un `?source=push` résiduel ne doit pas ouvrir un second onglet.
        if (ouverte.origin !== adresse.origin || ouverte.pathname !== adresse.pathname) continue
        await fenetre.focus()
        return
      }

      await self.clients.openWindow(adresse.href)
    })()
  )
})

