'use client'

import { useCallback, useEffect, useState } from 'react'

import { pour } from '@/i18n/index.mjs'
import {
  ETATS,
  VALEUR_REPLI,
  cleDepuisBase64url,
  cleStockage,
  corpsAbonnement,
  etatDepuisReponse,
  etatInitial,
  messageRefus,
} from '@/lib/push.mjs'

/* L'opt-in web push de la carte — **la forme mesurée**, état par état.

   Source : module 61618 du chunk `app/card/[cardId]/page-198959ba….js`.

   Ce que ce composant fait, et dans cet ordre :

     1. **il ne demande rien au chargement.** L'état se lit par
        `serviceWorker.getRegistration()` puis `pushManager.getSubscription()` ;
        un `Notification.requestPermission()` au montage est le meilleur moyen
        d'obtenir un refus définitif ;
     2. **il n'affiche rien sans clé VAPID.** Pas de clé = pas de canal branché :
        s'abonner produirait un jeton que personne ne pourrait utiliser. C'est la
        même règle que `WALLET_ENABLED=false` pour Google Wallet ;
     3. **il désabonne quand l'enregistrement échoue.** Le `PushSubscription`
        créé juste avant est annulé : la cible fait exactement cela, et sans
        cela un `POST` raté laisserait le navigateur abonné à un serveur qui ne
        connaît pas la carte ;
     4. **il retient un « non » explicite** (`localStorage['push-optin-<id>']`),
        par carte — un client peut en avoir deux, et fermer la proposition sur
        l'une n'est pas un refus sur l'autre.

   Ce que ce bloc ne promet **jamais** : la notification « à proximité ». Le
   texte parle d'offres et de récompenses, comme celui de la cible. La proximité
   passe par le Wallet, et par lui seul.
 */
export function ActiverNotifications({ cardId, nomCommerce, clePublique, locale }) {
  const { t } = pour(locale)

  const [etat, setEtat] = useState(ETATS.chargement)
  const [erreur, setErreur] = useState(null)
  const [replie, setReplie] = useState(false)

  /* La clé est convertie **une fois** (base64url → `Uint8Array`). `null` veut
     dire « canal non branché », et ce n'est pas une erreur : on n'affiche rien. */
  const cle = cleDepuisBase64url(clePublique)

  useEffect(() => {
    if (cle === null) return undefined

    try {
      if (localStorage.getItem(cleStockage(cardId)) === VALEUR_REPLI) setReplie(true)
    } catch {
      // Navigation privée, stockage plein : on continue sans mémoriser le repli.
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEtat(ETATS.nonSupporte)
      return undefined
    }

    let vivant = true

    navigator.serviceWorker
      .getRegistration()
      .then(async (enregistrement) => {
        const abonnement = enregistrement
          ? await enregistrement.pushManager.getSubscription()
          : null
        if (!vivant) return
        setEtat(
          etatInitial({
            supporte: true,
            permission: Notification.permission,
            abonne: Boolean(abonnement),
          })
        )
      })
      .catch(() => {
        // Une lecture d'état ratée n'est pas un refus : on propose le geste,
        // qui redemandera la permission et rouvrira un enregistrement.
        if (vivant) setEtat(ETATS.inactif)
      })

    return () => {
      vivant = false
    }
  }, [cardId, cle])


  const abonner = useCallback(async () => {
    if (cle === null) return
    setEtat(ETATS.abonnement)
    setErreur(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? ETATS.refuse : ETATS.inactif)
        if (permission !== 'denied') setErreur(t('carte.push.erreurPermission'))
        return
      }

      const enregistrement = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const abonnement = await enregistrement.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cle,
      })

      const brut = abonnement.toJSON()
      const reponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          corpsAbonnement({
            carte: cardId,
            endpoint: brut.endpoint,
            p256dh: brut.keys ? brut.keys.p256dh : '',
            auth: brut.keys ? brut.keys.auth : '',
          })
        ),
      })

      if (!reponse.ok) {
        // Pas de jeton orphelin : sans cette annulation, le navigateur resterait
        // abonné alors qu'aucune ligne ne le relie à une carte.
        await abonnement.unsubscribe().catch(() => undefined)
        setEtat(ETATS.inactif)
        setErreur(t(messageRefus(etatDepuisReponse(reponse.status)) ?? 'carte.push.erreurReseau'))
        return
      }

      setEtat(ETATS.abonne)
    } catch {
      setEtat(ETATS.inactif)
      setErreur(t('carte.push.erreurReseau'))
    }
  }, [cardId, cle, t])

  function replier() {
    try {
      localStorage.setItem(cleStockage(cardId), VALEUR_REPLI)
    } catch {
      // Sans stockage, le repli ne survit pas au rechargement — et c'est tout.
    }
    setReplie(true)
  }

  /* Rien à proposer : canal non branché, navigateur sans push, ou client ayant
     déjà fermé la proposition sans s'abonner. */
  if (cle === null || etat === ETATS.chargement || etat === ETATS.nonSupporte) return null
  if (replie && etat !== ETATS.abonne) return null

  if (etat === ETATS.abonne) {
    return (
      <section className="mt-6 w-full max-w-sm" aria-live="polite">
        <p className="flex items-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-xs font-semibold">
          {t('carte.push.active')}
        </p>
      </section>
    )
  }

  if (etat === ETATS.refuse) {
    return (
      <section className="mt-6 w-full max-w-sm">
        <div className="rounded-2xl border border-white/15 px-4 py-3.5">
          <p className="text-sm font-bold">{t('carte.push.bloquees')}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-70">
            {t('carte.push.bloqueesTexte', { commerce: nomCommerce })}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-6 w-full max-w-sm">
      <div className="rounded-2xl bg-ink p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">
          {t('carte.push.surtitre')}
        </p>
        <h2 className="mt-2 font-impact text-[1.9rem] uppercase leading-[0.9] tracking-tight">
          {t('carte.push.titre')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed opacity-90">{t('carte.push.texte')}</p>

        {erreur ? (
          <p role="alert" className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium">
            {erreur}
          </p>
        ) : null}

        <button
          type="button"
          onClick={abonner}
          disabled={etat === ETATS.abonnement}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-bold text-ink transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          {etat === ETATS.abonnement ? t('carte.push.activation') : t('carte.push.activer')}
        </button>
      </div>

      {/* Le repli est un geste, pas un refus : le bouton ne désabonne rien et ne
          change aucune permission. Il cache la proposition pour cette carte. */}
      <button
        type="button"
        onClick={replier}
        className="mt-2 w-full py-2 text-xs underline opacity-60"
      >
        {t('carte.push.fermer')}
      </button>
    </section>
  )
}
