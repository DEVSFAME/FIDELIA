import Link from 'next/link'
import { Surface } from '@/components/verre/Surface'
import { FormulaireNouveauMotDePasse } from '@/components/auth/FormulaireNouveauMotDePasse'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'

/* Écran « nouveau mot de passe » — la destination d'un lien `type=recovery`
   que `/auth/confirm` vient de vérifier.

   Pourquoi il existe : sans lui, le flux de récupération n'avait **aucune**
   fin. Vérifier le jeton ouvrait une session que rien ne distinguait d'une
   connexion ordinaire, le commerçant atterrissait sur son tableau de bord avec
   son ancien mot de passe, et il croyait l'avoir changé. `/auth/confirm`
   refusait donc ces liens (`?echec=invalide`) — une décision juste tant que la
   page manquait, fausse dès qu'elle existe.

   Il vit dans le groupe `(auth)` et non `(dashboard)` : c'est un écran
   d'identifiants, il en a la peau mesurée (carte « verre », titre Anton sur
   deux lignes), et il n'a rien à faire sous la navigation du tableau de bord.

   `?etat=session` est lu côté **serveur**, comme `?echec=` sur
   `/forgot-password` : le message s'affiche sans JavaScript, et une valeur
   inconnue n'affiche rien plutôt que de recracher l'URL.
   La valeur est produite par `actions.js` quand `updateUser` échoue ; elle
   n'est pas partagée par une constante, et c'est un test qui lit les deux
   côtés (`tools/rea/tests/nouveau-mot-de-passe.test.mjs`). */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('auth.nouveau.metaTitre') }
}

export default async function PageNouveauMotDePasse({ searchParams }) {
  const { etat } = await searchParams
  const locale = await localeRequete()
  const { t } = pour(locale)

  return (
    <Surface variante="verre" className="w-full max-w-sm rounded-[2rem] p-7 shadow-float sm:p-8">
      <div className="mb-8">
        <h1 className="font-impact text-5xl uppercase leading-[0.9] tracking-tight text-ink">
          {t('auth.nouveau.titreLigne1')}
          <br />
          {t('auth.nouveau.titreLigne2')}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/55">{t('auth.nouveau.sousTitre')}</p>
      </div>

      {/* Le formulaire est **remplacé**, pas surmonté : un champ qui ne peut pas
          aboutir est une invitation à le remplir pour rien. Le rôle est `alert`
          parce que l'état répond à un geste (l'envoi du formulaire) et non à la
          façon dont l'écran se présente au chargement (§27.1 — c'est le moment
          qui départage, pas le mot). */}
      {etat === 'session' ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900"
        >
          <p>{t('auth.nouveau.etatSession')}</p>
          <Link
            href="/forgot-password"
            className="mt-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
          >
            {t('auth.nouveau.nouveauLien')}
          </Link>
        </div>
      ) : (
        <FormulaireNouveauMotDePasse locale={locale} />
      )}
    </Surface>
  )
}
