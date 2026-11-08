import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { PRIX_PLAQUE_MAD } from '@/lib/plafond.mjs'

/* Le bandeau d'offre — présent sur **chaque** écran du tableau de bord.

   Mesuré quatre fois, à l'identique : `c01-settings.html:29706`,
   `c02-billing.html:29973`, `d01-notifications.html:29589`,
   `d02-clients.html:31987`. Il porte quatre informations et rien de plus :
   l'offre, le compte (`1 / 30`), la jauge, et la phrase d'état. Le lien
   « Voir l'abonnement » mène à `/billing` — c'est **la** porte mesurée vers
   cette page, elle n'est pas dans le rail.

   Pourquoi il vit dans le layout : la cible le répète sur chaque écran, et le
   recopier dans dix pages aurait produit dix compteurs à tenir à jour.

   Ce qu'il ne fait pas : il n'affiche **rien** quand le compte n'est pas
   lisible (`plafond === null`). Un bandeau qui écrirait « 0 / 30 » sur une
   lecture échouée serait le mensonge que `EtatBloque` existe pour éviter ;
   ici, l'absence est préférable — la page `/billing` dit, elle, pourquoi.

   Les clés i18n sont écrites **en littéral** : `i18n-ui` ne voit que les appels
   à argument littéral, et une clé composée depuis l'état échapperait au
   balayage (même piège que `MESSAGES_ERREUR` dans `/settings`).
*/
const MESSAGES = Object.freeze({
  large: 'offre.msgCalme',
  attention: 'offre.msgAttention',
  atteint: 'offre.msgAtteint',
})

export function BandeauOffre({ plafond, locale = 'fr' }) {
  const { t } = pour(locale)
  if (!plafond) return null

  const { clients, limite, reste, pourcent, etat } = plafond
  const titre = etat === 'atteint' ? t('offre.epuisee') : t('offre.titre')
  // L'urgence change au pluriel : la cible écrit `client` / `clients` selon le
  // reste (`a(e,"","s")` dans son bundle), donc deux clés plutôt qu'un « (s) ».
  const cle =
    etat === 'urgent'
      ? reste > 1
        ? 'offre.msgUrgentPlusieurs'
        : 'offre.msgUrgentUn'
      : MESSAGES[etat] ?? 'offre.msgCalme'

  return (
    <section className="uc-card uc-bloc">
      <div className="uc-card-corps">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-55">{titre}</p>
          <p className="text-2xl font-semibold tracking-tight">
            {clients}
            <span className="text-sm font-semibold opacity-45">
              {t('offre.surLimite', { limite })}
            </span>
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limite}
          aria-valuenow={clients}
          aria-label={t('offre.ariaJauge', { clients, limite })}
          className="uc-jauge"
        >
          <div className="uc-jauge-remplie" style={{ width: `${pourcent}%` }} />
        </div>

        <p className="uc-bloc-texte mt-2">{t(cle, { clients, limite, reste })}</p>

        <p className="uc-bloc-rang">
          <strong>{t('offre.plaqueTitre')}</strong>{' '}
          {t('offre.plaqueTexte', { prix: PRIX_PLAQUE_MAD })}
        </p>

        <p className="mt-3">
          <Link href="/billing" className="uc-btn uc-btn-outline uc-btn-sm">
            {t('offre.voirAbonnement')}
          </Link>
        </p>
      </div>
    </section>
  )
}
