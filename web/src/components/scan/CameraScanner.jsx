'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { pour } from '@/i18n/index.mjs'
import {
  ETATS_CAMERA,
  capacitesCamera,
  cheminCarte,
  classerErreurCamera,
  codeDesDetections,
  qrSupporte,
} from '@/lib/camera.mjs'

/* ============================================================================
   Caméra du scanner — le seul composant client de `/scan`.

   Ce qui reste côté serveur : l'identification de la carte et l'écriture des
   points, c'est-à-dire la RPC (les noms exacts vivent dans `lib/rpc.mjs`, et
   `scan-camera.test.mjs` échoue s'ils apparaissent ici). Ici on ne fait
   qu'**une chose** : lire un code et naviguer vers la même URL que la saisie
   manuelle (`/scan?code=…`). La caméra ne connaît ni Supabase, ni jeton, ni
   point : elle ne peut pas créditer quoi que ce soit, même si elle le voulait.

   La permission n'est **jamais** demandée au chargement. Un navigateur qui
   ouvre un prompt sans geste se fait bloquer le prompt pour tout le site ; et
   un commerçant qui ouvre `/scan` pour taper un code n'a pas à répondre à une
   question dont il n'a pas besoin.

   Chaque issue est un **état d'écran** — refus, API absente, pas de caméra,
   flux en échec — et la saisie manuelle reste affichée dans tous les cas. Un
   `throw` deviendrait une frontière d'erreur Next, donc une page blanche : il
   n'y en a pas.
   ========================================================================== */

/** Cadence de lecture : 4 images/s suffit à viser un QR, et laisse le CPU au reste. */
const CADENCE_MS = 250

export function CameraScanner({ locale = 'fr', destination = '/scan' }) {
  const { t } = pour(locale)
  const [etat, setEtat] = useState(ETATS_CAMERA.repos)
  const video = useRef(null)
  const flux = useRef(null)
  const minuteur = useRef(null)
  const lecture = useRef(false)
  const navigation = useRef(false)

  /** Libère les ressources sans toucher à l'état (démontage). */
  const liberer = useCallback(() => {
    if (minuteur.current !== null) {
      clearInterval(minuteur.current)
      minuteur.current = null
    }
    if (flux.current) {
      for (const piste of flux.current.getTracks()) piste.stop()
      flux.current = null
    }
    if (video.current) video.current.srcObject = null
  }, [])

  /** Arrêt demandé par la personne : libère, puis revient au bouton. */
  const arreter = useCallback(() => {
    liberer()
    setEtat(ETATS_CAMERA.repos)
  }, [liberer])

  // Le démontage ne doit pas laisser la caméra allumée : c'est visible, et
  // c'est exactement ce qu'un utilisateur reproche à une PWA.
  useEffect(() => liberer, [liberer])

  const demarrer = useCallback(async () => {
    if (navigation.current) return
    setEtat(ETATS_CAMERA.demande)

    const capacites = capacitesCamera({
      BarcodeDetector: typeof window === 'undefined' ? undefined : window.BarcodeDetector,
      mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
    })
    // Absence d'API : on le dit tout de suite, avant de demander une permission
    // qui ne servirait à rien.
    if (!capacites.utilisable) {
      setEtat(ETATS_CAMERA.nonSupporte)
      return
    }

    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      let formats = null
      try {
        formats = await window.BarcodeDetector.getSupportedFormats()
      } catch {
        formats = null
      }
      if (!qrSupporte(formats)) {
        setEtat(ETATS_CAMERA.nonSupporte)
        return
      }
    }

    try {
      flux.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
    } catch (erreur) {
      // `classerErreurCamera` sépare le refus de la panne : le premier est un
      // état d'écran, le second une indisponibilité. Aucun des deux ne `throw`.
      setEtat(classerErreurCamera(erreur).etat)
      return
    }

    if (video.current) {
      video.current.srcObject = flux.current
      try {
        await video.current.play()
      } catch {
        // Autoplay refusé : le flux reste affiché, la lecture peut commencer.
      }
    }

    let detecteur
    try {
      detecteur = new window.BarcodeDetector({ formats: ['qr_code'] })
    } catch {
      liberer()
      setEtat(ETATS_CAMERA.nonSupporte)
      return
    }

    setEtat(ETATS_CAMERA.actif)

    minuteur.current = setInterval(async () => {
      if (lecture.current || !video.current || video.current.readyState < 2) return
      lecture.current = true
      try {
        const detections = await detecteur.detect(video.current)
        const code = codeDesDetections(detections)
        if (!code) return
        const cible = cheminCarte(code, destination)
        if (!cible) return
        // Une seule navigation, même si deux images lisent le même QR.
        navigation.current = true
        liberer()
        window.location.assign(cible)
      } catch {
        liberer()
        setEtat(ETATS_CAMERA.indisponible)
      } finally {
        lecture.current = false
      }
    }, CADENCE_MS)
    // `destination` est une dépendance : sans elle, changer d'écran sans
    // remonter le composant garderait l'ancienne cible dans la fermeture.
  }, [liberer, destination])

  const actif = etat === ETATS_CAMERA.actif
  const BOUTON = 'uc-btn uc-btn-outline uc-btn-sm'

  return (
    <div className="uc-camera">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="uc-camera-titre">{t('page.scanner.camera.titre')}</p>
          <p className="uc-camera-aide">{t('page.scanner.camera.aide')}</p>
        </div>

        {actif ? (
          <button type="button" onClick={arreter} className={BOUTON}>
            {t('page.scanner.camera.arreter')}
          </button>
        ) : (
          <button
            type="button"
            onClick={demarrer}
            disabled={etat === ETATS_CAMERA.demande}
            className={BOUTON}
          >
            {etat === ETATS_CAMERA.demande
              ? t('page.scanner.camera.demande')
              : t('page.scanner.camera.activer')}
          </button>
        )}
      </div>

      <video
        ref={video}
        muted
        playsInline
        aria-label={t('page.scanner.camera.video')}
        className={actif ? 'uc-camera-video' : 'hidden'}
      />

      {actif ? (
        <p role="status" className="uc-camera-etat uc-encadre">
          {t('page.scanner.camera.actif')}
        </p>
      ) : null}

      {/* Refus de permission : `status`, pas `alert` — la personne a fait un
          choix, l'écran ne l'annonce pas comme une panne. */}
      {etat === ETATS_CAMERA.refus ? (
        <p role="status" className="uc-camera-etat uc-encadre">
          {t('page.scanner.camera.refus')}
        </p>
      ) : null}

      {etat === ETATS_CAMERA.sansCamera ? (
        <p role="status" className="uc-camera-etat uc-encadre">
          {t('page.scanner.camera.sansCamera')}
        </p>
      ) : null}

      {etat === ETATS_CAMERA.nonSupporte ? (
        <p role="status" className="uc-camera-etat uc-encadre">
          {t('page.scanner.camera.nonSupporte')}
        </p>
      ) : null}

      {etat === ETATS_CAMERA.indisponible ? (
        <p role="alert" className="uc-camera-etat uc-encadre">
          {t('page.scanner.camera.indisponible')}
        </p>
      ) : null}

      <p className="uc-camera-note">{t('page.scanner.camera.repli')}</p>
    </div>
  )
}

