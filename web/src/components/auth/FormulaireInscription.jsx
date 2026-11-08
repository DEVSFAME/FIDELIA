'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { sInscrire } from '@/app/(auth)/register/actions.js'
import { pour } from '@/i18n/index.mjs'
import { REGLES_MOT_DE_PASSE } from '@/lib/validation-compte.mjs'
import { Champ } from './Champ'
import { Oeil, OeilBarre, FlecheDroite, CercleCharge, CercleCoche } from './Icones'

/* Écran d'inscription — copie **mesurée**, comportement réimplémenté.

   Ce que la cible fait avec quatre paquets qu'on n'a pas (`zod`,
   `react-hook-form`, `framer-motion`, un système de toasts) est reproduit avec
   la plateforme : `useActionState` pour l'état, `useFormStatus` pour l'attente,
   et `REGLES_MOT_DE_PASSE` (module pur, testé) pour les trois coches. Aucune
   dépendance ajoutée : `package.json` ne bouge pas.

   Ce qui n'est **pas** repris, et pourquoi :
   - l'indicateur d'étapes « Tes infos / La vidéo / Ton compte » et le pixel
     Meta n'apparaissent que pour `?depuis=pub` (campagne publicitaire) : c'est
     du pistage marketing, hors périmètre d'un socle authentifié ;
   - `localStorage['fidelix_prospect']` — même raison, et le nom de clé porte la
     marque de la cible (§14 de `basal-knowledge.md`) ;
   - le contrôle « mot de passe trop courant » interroge
     `api.pwnedpasswords.com` : appeler un tiers depuis un formulaire
     d'inscription est une décision de vie privée, pas un détail d'UI.
   Chacun est inscrit au backlog de PROGRESS.md plutôt qu'à moitié codé.

   Le consentement s'affiche **sans lien** vers `/conditions` et
   `/confidentialite` : ces routes n'existent pas dans ce socle, et un lien mort
   est exactement le défaut livré une fois déjà (`<link href="/register">`). */

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
          {t('auth.inscription.actionEnCours')}
        </>
      ) : (
        <>
          {t('auth.inscription.action')}
          <FlecheDroite className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}

function PanneauSucces({ t, email }) {
  return (
    <div className="py-4 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-coral/10">
        <CercleCoche className="h-8 w-8 text-coral" />
      </div>
      <h2 className="font-impact text-4xl uppercase leading-[0.9] tracking-tight text-ink">
        {t('auth.inscription.succesTitre')}
      </h2>
      <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-ink/55">
        {t('auth.inscription.succesTexte', { email })}
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-ink transition-colors hover:text-coral"
      >
        {t('auth.oubli.lienRetour')}
      </Link>
    </div>
  )
}

export function FormulaireInscription({ locale = 'fr' }) {
  const { t } = pour(locale)
  const [etat, action] = useActionState(sInscrire, { erreurs: {}, valeurs: {}, succes: null })
  const [visible, setVisible] = useState(false)
  const [motDePasse, setMotDePasse] = useState('')

  /* `etat.erreurs` porte des **clés** ; la traduction se fait ici, une seule
     fois, et une clé inconnue lève plutôt que de s'afficher. */
  const erreur = (champ) => (etat.erreurs?.[champ] ? t(etat.erreurs[champ]) : undefined)

  if (etat.succes) return <PanneauSucces t={t} email={etat.succes} />

  return (
    <form action={action} className="space-y-4">
      <Champ
        id="nom"
        libelle={t('champ.nomComplet')}
        name="nom"
        placeholder={t('champ.exempleNom')}
        autoComplete="name"
        required
        defaultValue={etat.valeurs?.nom ?? ''}
        erreur={erreur('nom')}
      />

      <Champ
        id="email"
        libelle={t('champ.emailProfessionnel')}
        type="email"
        name="email"
        placeholder={t('champ.exempleEmail')}
        autoComplete="email"
        required
        defaultValue={etat.valeurs?.email ?? ''}
        erreur={erreur('email')}
      />

      <Champ
        id="telephone"
        libelle={t('champ.telephone')}
        type="tel"
        name="telephone"
        placeholder={t('champ.exempleTelephone')}
        autoComplete="tel"
        required
        defaultValue={etat.valeurs?.telephone ?? ''}
        erreur={erreur('telephone')}
      />

      <Champ
        id="motDePasse"
        libelle={t('champ.motDePasse')}
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

      {/* Les trois règles de la cible : coche quand la règle est tenue. Rien ne
          s'affiche tant que le champ est vide — un formulaire qui reproche
          trois manques avant la première frappe est hostile. */}
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
        libelle={t('champ.confirmerMotDePasse')}
        type="password"
        name="confirmation"
        placeholder={t('champ.motDePasseMasque')}
        autoComplete="new-password"
        required
        erreur={erreur('confirmation')}
      />

      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="consentement"
            value="oui"
            required
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-coral"
          />
          <span className="text-xs leading-relaxed text-ink/55">
            {t('auth.inscription.consentement')}
          </span>
        </label>
        {erreur('consentement') ? (
          <p className="text-xs text-destructive">{erreur('consentement')}</p>
        ) : null}

        <details className="rounded-xl bg-ink/[0.03] px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink/70">
            {t('auth.inscription.cndpResume')}
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-ink/55">
            {t('auth.inscription.cndp', {
              marque: t('marque.nom'),
              domaine: t('marque.domaine'),
            })}
          </p>
        </details>
      </div>

      {erreur('general') ? (
        <p role="alert" className="rounded-xl bg-coral/10 px-3.5 py-2.5 text-sm text-coral-dark">
          {erreur('general')}
        </p>
      ) : null}

      <Bouton t={t} />
    </form>
  )
}
