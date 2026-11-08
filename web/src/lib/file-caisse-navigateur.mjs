/* ============================================================================
   File d'attente — l'adaptateur navigateur, et rien de plus.

   Toute la **décision** (trois issues, 65 s, compteur de tentatives, ordre) est
   dans `file-caisse.mjs`, qui se teste sans navigateur. Ici il n'y a que
   `indexedDB`, c'est-à-dire une API qu'aucun test hors ligne ne peut ouvrir.

   D'où la règle de ce fichier : chaque fonction fait **une** chose et rend une
   promesse. Aucune politique, aucun message, aucun `console.log` — un échec
   d'IndexedDB (navigation privée, quota) remonte à l'appelant, qui décide quoi
   dire au comptoir.
   ========================================================================== */

import { BASE_FILE, MAGASIN_FILE, VERSION_FILE } from './file-caisse.mjs'

/** Ouvre (et crée au besoin) la base. */
export function ouvrirBase(factory = globalThis.indexedDB) {
  return new Promise((ok, ko) => {
    if (!factory) {
      ko(new Error('indexedDB absent'))
      return
    }
    const requete = factory.open(BASE_FILE, VERSION_FILE)
    requete.onupgradeneeded = () => {
      const base = requete.result
      if (!base.objectStoreNames.contains(MAGASIN_FILE)) {
        base.createObjectStore(MAGASIN_FILE, { keyPath: 'id' })
      }
    }
    requete.onsuccess = () => ok(requete.result)
    requete.onerror = () => ko(requete.error ?? new Error('ouverture impossible'))
  })
}

function attendre(requete) {
  return new Promise((ok, ko) => {
    requete.onsuccess = () => ok(requete.result)
    requete.onerror = () => ko(requete.error ?? new Error('requête impossible'))
  })
}

/** Tous les éléments, dans l'ordre du magasin (l'ordre de départ est calculé). */
export async function lireFile(base) {
  const magasin = base.transaction(MAGASIN_FILE, 'readonly').objectStore(MAGASIN_FILE)
  return (await attendre(magasin.getAll())) ?? []
}

/** Ajoute ou remplace un élément (même `id` = même opération). */
export async function ecrire(base, operation) {
  const magasin = base.transaction(MAGASIN_FILE, 'readwrite').objectStore(MAGASIN_FILE)
  await attendre(magasin.put(operation))
  return operation
}

/** Retire un élément — appelé seulement quand il a quitté la file. */
export async function retirer(base, id) {
  const magasin = base.transaction(MAGASIN_FILE, 'readwrite').objectStore(MAGASIN_FILE)
  await attendre(magasin.delete(id))
}

/** Événement interne : la file a changé, l'écran se relit. */
export const EVENEMENT_FILE = 'fidelia:file'
