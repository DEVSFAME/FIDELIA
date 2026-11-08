'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { pour } from '@/i18n/index.mjs'
import { corpsRequete, nouvelleOperation } from '@/lib/file-caisse.mjs'
import { EVENEMENT_FILE, ecrire, ouvrirBase } from '@/lib/file-caisse-navigateur.mjs'
import { pointsDepuisMontant } from '@/lib/programme.mjs'

/* Créditer des points depuis la caisse — le geste qui survit à une coupure.
 *
 * Pourquoi ce formulaire n'est pas une Server Action comme celui de `/scan` :
 * une action serveur ne se rejoue pas depuis `fetch` (identifiant de build et
 * jeton d'action qui changent à chaque déploiement), et le rejeu peut traverser
 * un déploiement. Le contrat commun aux deux chemins est la RPC
 * `enregistrer_operation_caisse` (`migrations/0016`), appelée ici par
 * `POST /api/caisse/operation`.
 *
 * Ce que ce formulaire ne fait pas : échanger une récompense hors ligne. Un
 * échange dépend d'un solde que le rejeu ne connaît pas ; l'écran le dit
 * (`page.caisse.horsLigneEchange`) au lieu de le tenter.
 *
 * Limite déclarée : ce formulaire demande JavaScript. Sans lui, `/scan` reste le
 * chemin de crédit — aucun chemin n'est perdu, un chemin est ajouté.
 */

/** Clés **littérales** : une clé construite par gabarit échappe au balayage d'`i18n-ui`. */
const MESSAGES = {
  ok: 'page.caisse.crediterOk',
  attente: 'page.caisse.crediterAttente',
  carte: 'page.caisse.crediterErreurCarte',
  refus: 'page.caisse.crediterErreurRefus',
  arguments: 'tableau.etat.arguments',
  erreur: 'tableau.etat.refus',
}

/** Les états qui répondent à un geste : alerte, pas un état d'écran. */
const ALERTES = new Set(['carte', 'refus', 'arguments', 'erreur'])

/** Un identifiant d'opération, stable et conforme à la forme attendue en base. */
function identifiant() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const octets = new Uint8Array(16)
  crypto.getRandomValues(octets)
  octets[6] = (octets[6] & 0x0f) | 0x40
  octets[8] = (octets[8] & 0x3f) | 0x80
  const hex = [...octets].map((octet) => octet.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function CrediterCaisse({ jeton, taux = 1, locale = 'fr' }) {
  const { t } = pour(locale)
  const router = useRouter()
  const [etat, setEtat] = useState('repos')
  const [solde, setSolde] = useState(null)

  const enfiler = useCallback(async (operation) => {
    try {
      const base = await ouvrirBase()
      await ecrire(base, operation)
      setEtat('attente')
      window.dispatchEvent(new Event(EVENEMENT_FILE))
    } catch {
      // Ni IndexedDB ni réseau : l'opération n'existe nulle part, et le dire
      // vaut mieux que l'annoncer en attente.
      setEtat('erreur')
    }
  }, [])

  async function envoyer(evenement) {
    evenement.preventDefault()
    if (etat === 'envoi') return

    const formulaire = new FormData(evenement.currentTarget)
    const montant = Number(formulaire.get('montant'))
    const saisie = String(formulaire.get('points') ?? '').trim()
    const bareme = Number.isFinite(taux) && taux > 0 ? taux : 1
    const points = saisie === '' ? pointsDepuisMontant(montant, bareme) : Number(saisie)

    const construit = nouvelleOperation({ jeton, montant, points, id: identifiant() })
    if (construit.etat !== 'ok') {
      setEtat('arguments')
      return
    }

    const { operation } = construit
    setEtat('envoi')

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enfiler(operation)
      return
    }

    let reponse
    try {
      reponse = await fetch('/api/caisse/operation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpsRequete(operation)),
      })
    } catch {
      // Le réseau est tombé pendant l'envoi : la file prend le relais.
      await enfiler(operation)
      return
    }

    if (reponse.ok) {
      const corps = await reponse.json().catch(() => ({}))
      const nouveau = Number(corps?.solde)
      setSolde(Number.isFinite(nouveau) ? nouveau : null)
      setEtat('ok')
      router.refresh()
      return
    }

    if (reponse.status === 404) {
      setEtat('carte')
      return
    }
    if (reponse.status === 422) {
      setEtat('refus')
      return
    }
    if (reponse.status === 400) {
      setEtat('arguments')
      return
    }

    await enfiler(operation)
  }

  const message = etat === 'repos' || etat === 'envoi' ? null : MESSAGES[etat]

  return (
    <section className="uc-card uc-bloc uc-carte-pad">
      <h2 className="uc-card-title">{t('page.caisse.crediterTitre')}</h2>
      <p className="uc-card-sub mt-1">{t('page.caisse.crediterAide')}</p>

      <form onSubmit={envoyer} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          <span className="opacity-75">{t('page.caisse.crediterMontant')}</span>
          <input
            name="montant"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            className="uc-champ"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          <span className="opacity-75">{t('page.caisse.crediterPoints')}</span>
          <input
            name="points"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            placeholder={t('page.caisse.crediterPointsAuto')}
            className="uc-champ"
          />
        </label>

        <p className="uc-aide sm:col-span-2">
          {t('page.caisse.crediterTaux', { taux })}
        </p>

        <button type="submit" className="uc-action sm:col-span-2" disabled={etat === 'envoi'}>
          {etat === 'envoi' ? t('page.caisse.crediterEnCours') : t('page.caisse.crediterAction')}
        </button>
      </form>

      {message ? (
        <p
          role={ALERTES.has(etat) ? 'alert' : 'status'}
          className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm"
        >
          {etat === 'ok' ? t(message, { solde: solde ?? '—' }) : t(message)}
        </p>
      ) : null}
    </section>
  )
}
