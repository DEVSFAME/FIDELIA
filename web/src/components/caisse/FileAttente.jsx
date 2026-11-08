'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { pour } from '@/i18n/index.mjs'
import {
  apresRejeu,
  compterBloquees,
  corpsRequete,
  ordonner,
  prochainDelai,
} from '@/lib/file-caisse.mjs'
import {
  EVENEMENT_FILE,
  ecrire,
  lireFile,
  ouvrirBase,
  retirer,
} from '@/lib/file-caisse-navigateur.mjs'
import { CHEMIN_SERVICE_WORKER } from '@/lib/pwa.mjs'

/* La file hors ligne, vue du comptoir — et le seul endroit où le service worker
   est enregistré.
 *
 * Elle est montée deux fois : sur `/caisse` (quand tout va bien, pour dire
 * combien d'opérations attendent) et sur `/caisse-hors-ligne`, l'écran de repli
 * du service worker. Un seul composant, donc un seul comportement — et
 * l'écran de repli n'a besoin d'aucune donnée serveur : tout vient
 * d'IndexedDB.
 *
 * Ce que ce composant ne fait **jamais** : décider du destin d'une opération.
 * La décision est dans `apresRejeu` (`file-caisse.mjs`), testée sans navigateur.
 */
export function FileAttente({ locale = 'fr' }) {
  const { t } = pour(locale)
  const [restantes, setRestantes] = useState(0)
  const [bloquees, setBloquees] = useState(0)
  const [pret, setPret] = useState(false)
  const base = useRef(null)
  const envoi = useRef(false)

  const rafraichir = useCallback(async () => {
    if (!base.current) return
    try {
      const file = ordonner(await lireFile(base.current))
      setRestantes(file.length)
      setBloquees(compterBloquees(file))
    } catch {
      // Base illisible : on n'affiche pas un zéro qui ferait croire à une file vide.
      setRestantes(0)
      setBloquees(0)
    }
  }, [])

  const rejouer = useCallback(async () => {
    if (envoi.current || !base.current) return
    envoi.current = true
    try {
      for (const operation of ordonner(await lireFile(base.current))) {
        let statut
        try {
          const reponse = await fetch('/api/caisse/operation', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(corpsRequete(operation)),
          })
          statut = reponse.status
        } catch {
          // Panne réseau : elle n'a rien dit de l'opération, donc on s'arrête
          // sans incrémenter les tentatives (mesuré, A4).
          break
        }

        const suite = apresRejeu(operation, { statut })
        if (!suite.operation) {
          await retirer(base.current, operation.id)
          continue
        }
        await ecrire(base.current, suite.operation)
        // Mesuré (A4) : on s'arrête au premier élément conservé. Continuer
        // ferait passer des opérations plus récentes devant celle qui bloque,
        // et l'ordre du comptoir n'est plus celui de l'historique.
        break
      }
    } catch {
      // Rien à faire de plus : la file reste, le prochain cycle réessaiera.
    } finally {
      envoi.current = false
      await rafraichir()
    }
  }, [rafraichir])

  // Ouverture de la base + enregistrement du service worker. Le worker est
  // enregistré ici et pas au chargement global : hors de la caisse, il n'a
  // aucune raison de tourner.
  useEffect(() => {
    let vivant = true
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(CHEMIN_SERVICE_WORKER).catch(() => undefined)
    }
    ouvrirBase()
      .then(async (ouverte) => {
        if (!vivant) return
        base.current = ouverte
        await rafraichir()
        setPret(true)
        if ((await lireFile(ouverte)).length > 0) await rejouer()
      })
      .catch(() => {
        if (vivant) setPret(true)
      })
    return () => {
      vivant = false
    }
  }, [rafraichir, rejouer])

  // Cadence mesurée : 65 s, et seulement s'il reste quelque chose à envoyer.
  useEffect(() => {
    const enLigne = typeof navigator === 'undefined' ? true : navigator.onLine
    const delai = prochainDelai({ restantes, enLigne })
    if (delai === null) return undefined
    const minuteur = setInterval(rejouer, delai)
    return () => clearInterval(minuteur)
  }, [restantes, rejouer])

  // Retour du réseau, et signal d'un ajout fait par le formulaire voisin.
  useEffect(() => {
    const surLigne = () => rejouer()
    const surFile = () => rafraichir()
    window.addEventListener('online', surLigne)
    window.addEventListener(EVENEMENT_FILE, surFile)
    return () => {
      window.removeEventListener('online', surLigne)
      window.removeEventListener(EVENEMENT_FILE, surFile)
    }
  }, [rejouer, rafraichir])

  if (!pret) return null

  return (
    <section className="uc-card uc-bloc uc-carte-pad">
      <h2 className="uc-card-title">{t('page.caisse.fileTitre')}</h2>
      <p className="uc-card-sub mt-1">{t('page.caisse.fileAide')}</p>

      <p role="status" className="mt-3 text-sm font-semibold">
        {restantes === 0
          ? t('page.caisse.fileVide')
          : t('page.caisse.fileNombre', { n: restantes })}
      </p>

      {bloquees > 0 ? (
        <p className="uc-aide mt-2">{t('page.caisse.fileBloquees', { n: bloquees })}</p>
      ) : null}

      {restantes > 0 ? (
        <p className="mt-3">
          <button type="button" className="uc-btn uc-btn-outline uc-btn-sm" onClick={rejouer}>
            {t('page.caisse.fileRejouer')}
          </button>
        </p>
      ) : null}
    </section>
  )
}
