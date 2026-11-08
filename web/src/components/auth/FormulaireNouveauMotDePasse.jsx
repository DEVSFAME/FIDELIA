'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { enregistrerNouveauMotDePasse } from '@/app/(auth)/nouveau-mot-de-passe/actions.js'
import { pour } from '@/i18n/index.mjs'
import { REGLES_MOT_DE_PASSE } from '@/lib/validation-compte.mjs'
import { Champ } from './Champ'
import { Oeil, OeilBarre, FlecheDroite, CercleCharge, CercleCoche } from './Icones'

/* Écran « nouveau mot de passe » — la moitié manquante du retour de lien.
 *
 * Même forme que l'inscription, réduite à ce qui compte ici : deux champs, les
 * trois règles mesurées en direct, et le même bouton. Rien de neuf n'est
 * inventé : `Champ`, `REGLES_MOT_DE_PASSE` et les icônes sont ceux du socle,
 * donc une correction de bordure ou de contraste profite aux trois écrans.
 *
 * Ce que ce formulaire **ne** fait pas : lire l'URL. `?etat=session` est rendu
 * par la page, côté serveur — un écran qui lirait `window.location` afficherait
 * son message seulement après hydratation, c'est-à-dire jamais quand le
 * JavaScript a échoué.
 */

function Bouton({ t }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-bold text-white transition-all active:scale-95 disabled:scale-100 disabled:opacity-60"
    >
      {pending ? (
        <>
          <CercleCharge className="h-4 w-4 animate-spin" />
          {t('auth.nouveau.actionEnCours')}
        </>
      ) : (
        <>
          {t('auth.nouveau.action')}
          <FlecheDroite className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}

export function FormulaireNouveauMotDePasse({ locale = 'fr' }) {
  const { t } = pour(locale)
  const [etat, action] = useActionState(enregistrerNouveauMotDePasse, { erreurs: {}, succes: false })
  const [visible, setVisible] = useState(false)
  const [motDePasse, setMotDePasse] = useState('')

  const erreur = (nom) => {
    const cle = etat.erreurs?.[nom]
    return cle ? t(cle) : undefined
  }

  return (
    <form action={action} className="space-y-5">
      <Champ
        id="motDePasse"
        libelle={t('auth.nouveau.champMotDePasse')}
        type={visible ? 'text' : 'password'}
        name="motDePasse"
        placeholder={t('champ.motDePasseMasque')}
        autoComplete="new-password"
        required
        avecBouton
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        erreur={erreur('motDePasse')}
      >
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('champ.masquerMotDePasse') : t('champ.afficherMotDePasse')}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink/40 transition-colors hover:text-ink"
        >
          {visible ? <OeilBarre /> : <Oeil />}
        </button>
      </Champ>

      {/* Rien ne s'affiche tant que le champ est vide : trois manques reprochés
          avant la première frappe, c'est un formulaire hostile. */}
      {motDePasse.length > 0 ? (
        <ul className="space-y-1 pt-1">
          {REGLES_MOT_DE_PASSE.map((regle) => {
            const tenue = regle.test(motDePasse)
            return (
              <li key={regle.cle} className="flex items-center gap-1.5">
                <CercleCoche
                  className={`h-3.5 w-3.5 transition-colors ${tenue ? 'text-emerald-500' : 'text-ink/20'}`}
                />
                <span
                  className={`text-xs transition-colors ${tenue ? 'text-emerald-600' : 'text-ink/40'}`}
                >
                  {t(regle.cle)}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Champ
        id="confirmation"
        libelle={t('auth.nouveau.champConfirmation')}
        type="password"
        name="confirmation"
        placeholder={t('champ.motDePasseMasque')}
        autoComplete="new-password"
        required
        erreur={erreur('confirmation')}
      />

      {erreur('general') ? (
        <p role="alert" className="rounded-xl bg-coral/10 px-3.5 py-2.5 text-sm text-coral-dark">
          {erreur('general')}
        </p>
      ) : null}

      <Bouton t={t} />

      <p className="pt-1 text-center text-sm text-ink/50">
        <Link
          href="/login"
          className="font-bold text-ink underline underline-offset-4 transition-colors hover:text-coral"
        >
          {t('auth.oubli.lienRetour')}
        </Link>
      </p>
    </form>
  )
}
