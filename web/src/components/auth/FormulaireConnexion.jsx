'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { seConnecter } from '@/app/(auth)/login/actions.js'
import { pour } from '@/i18n/index.mjs'
import { Champ } from './Champ'
import { Oeil, OeilBarre, FlecheDroite, CercleCharge } from './Icones'

/* `useActionState` (React 19) plutôt qu'un `fetch` manuel : la page reste un
   composant serveur, le formulaire fonctionne **sans JavaScript**, et l'état
   d'erreur vient du serveur — donc il ne peut pas mentir.

   La copie est celle du bundle mesuré : « BON / RETOUR », « Email
   professionnel », « Mot de passe oublié ? », « Pas encore de compte ? /
   Créer un compte ». Le titre est dans la page (serveur) ; ici, ce qui a un
   état : les champs, l'œil, l'erreur.

   Le bouton porte les classes mesurées `bg-coral text-white` dans la cible.
   On garde `bg-ink` : #f94c3a sur blanc donne 3,06:1, sous le seuil AA
   (4,5:1) pour du texte de 16 px en gras. Écart déclaré dans
   `docs/design-system.md` §3 — la lisibilité prime, comme pour l'encre nuit. */

function Bouton({ t }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group mt-2 flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-bold text-white transition-all active:scale-95 disabled:scale-100 disabled:opacity-60"
    >
      {pending ? (
        <>
          <CercleCharge className="h-4 w-4 animate-spin" />
          {t('auth.connexion.actionEnCours')}
        </>
      ) : (
        <>
          {t('auth.connexion.action')}
          <FlecheDroite className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}

export function FormulaireConnexion({ locale = 'fr', etatEcran = null }) {
  const { t } = pour(locale)
  const [etat, action] = useActionState(seConnecter, { erreur: null })
  const [visible, setVisible] = useState(false)

  /* Une clé inconnue lève dans `traduire` : c'est voulu (une clé affichée telle
     quelle en production est un défaut que personne ne signale). */
  const erreur = etat.erreur ? t(etat.erreur) : null

  return (
    <form action={action} className="mt-7 space-y-4">
      {/* `etatEcran` vient du `?etat=` de l'URL, déjà traduit en clé par
          `messageEtat` **côté serveur** — la page le passe en propriété, donc il
          est là même sans JavaScript.

          Il est nommé `etatEcran` et non `etat` parce que `etat` est déjà
          l'état du formulaire (`useActionState`) : deux choses différentes sous
          un même nom se confondent à la première relecture.

          Le rôle ARIA est `status`, pas celui d'une alerte : c'est un état de
          l'écran au chargement, il ne répond à aucun geste. L'alerte est
          réservée à l'échec d'une **action** — juste en dessous, et pour la
          même cause quand la personne clique sur « Se connecter ». Annoncer un
          état persistant de façon assertive à chaque ouverture écraserait ce
          qui précède.

          Les noms d'attributs ne sont pas recopiés dans ce commentaire : il
          part dans le bundle, et une garde qui cherche un jeton le trouve
          aussi bien ici que dans le code (leçon du composant caméra). */}
      {etatEcran ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900"
        >
          {t(etatEcran)}
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
      />

      <Champ
        id="motDePasse"
        libelle={t('champ.motDePasse')}
        type={visible ? 'text' : 'password'}
        name="motDePasse"
        placeholder={t('champ.motDePasseMasque')}
        autoComplete="current-password"
        required
        avecBouton
        aide={
          <Link
            href="/forgot-password"
            className="-my-2 py-2 text-sm text-ink/55 transition-colors hover:text-coral"
          >
            {t('champ.motDePasseOublie')}
          </Link>
        }
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

      {/* `role="alert"` : un lecteur d'écran annonce l'échec sans qu'on ait à
          déplacer le focus. */}
      {erreur ? (
        <p role="alert" className="rounded-xl bg-coral/10 px-3.5 py-2.5 text-sm text-coral-dark">
          {erreur}
        </p>
      ) : null}

      <Bouton t={t} />
    </form>
  )
}
