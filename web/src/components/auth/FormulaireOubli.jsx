'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { demanderReinitialisation } from '@/app/(auth)/forgot-password/actions.js'
import { pour } from '@/i18n/index.mjs'
import { Champ } from './Champ'
import { EnveloppeCoche, FlecheGauche, FlecheDroite, CercleCharge } from './Icones'

/* Mot de passe oublié — copie **mesurée**
   (`_next_static_chunks_app__auth__forgot-password_page-…js`).

   Deux états, comme la cible : le formulaire, puis « Email envoyé ». Le
   deuxième remplace le premier — un écran qui laisse le formulaire visible
   après l'envoi invite à cliquer deux fois, et deux envois, c'est deux
   messages dans la boîte de l'utilisateur.

   `echec` arrive du serveur (`?echec=expire|appareil|invalide`) et non d'un
   `useEffect` sur `window.location`. Même affichage, mais il fonctionne sans
   JavaScript, et la valeur est validée par une fonction pure testée
   (`messageEchec`) au lieu d'être recopiée dans l'URL telle quelle. */

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
          {t('auth.oubli.actionEnCours')}
        </>
      ) : (
        <>
          {t('auth.oubli.action')}
          <FlecheDroite className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}

export function FormulaireOubli({ locale = 'fr', echec = null }) {
  const { t } = pour(locale)
  const [etat, action] = useActionState(demanderReinitialisation, {
    erreur: null,
    succes: false,
    email: '',
  })

  /* Deux natures d'erreur, deux endroits : sous le champ quand c'est le champ
     qui est en cause, au-dessus du bouton quand c'est la demande entière
     (débit, configuration). Les mélanger placerait « trop de demandes » sous
     une bordure rouge d'email, ce qui accuserait le mauvais coupable. */
  const erreurChamp = etat.erreur === 'auth.email.invalide' ? t(etat.erreur) : undefined
  const erreurForme = etat.erreur && etat.erreur !== 'auth.email.invalide' ? t(etat.erreur) : null

  if (etat.succes) {
    return (
      <div className="py-4 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-coral/10">
          <EnveloppeCoche className="h-8 w-8 text-coral" />
        </div>
        <h2 className="font-impact text-4xl uppercase leading-[0.9] tracking-tight text-ink">
          {t('auth.oubli.succesTitre')}
        </h2>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-ink/55">
          {t('auth.oubli.succesTexte')}
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink transition-colors hover:text-coral"
        >
          <FlecheGauche />
          {t('auth.oubli.lienRetour')}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5">
      {/* Le message d'échec de lien (`?echec=`) est produit par `/auth/confirm`
          (`destinationEchec`) : c'est un retour réel, pas une valeur d'URL
          décorative. Il est rendu ici, à sa place mesurée — en haut du
          formulaire, avant le champ. */}
      {echec ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          {t(echec)}
        </p>
      ) : null}

      <Champ
        id="email"
        libelle={t('champ.emailProfessionnel')}
        type="email"
        name="email"
        placeholder={t('champ.exempleEmail')}
        autoComplete="email"
        required
        erreur={erreurChamp}
      />

      {erreurForme ? (
        <p role="alert" className="rounded-xl bg-coral/10 px-3.5 py-2.5 text-sm text-coral-dark">
          {erreurForme}
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
