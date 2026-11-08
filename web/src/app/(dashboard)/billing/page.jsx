import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { plafondDuCommerce } from '@/lib/donnees.mjs'
import { PRIX_MOIS_MAD, PRIX_PLAQUE_MAD, lirePlafond } from '@/lib/plafond.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { OngletsCompte } from '@/components/tableau/OngletsCompte'

/* Page `/billing` — onglet « Abonnement » du groupe « Mon compte » (P0-3).

   Projection mesurée : `_captures/2026-11-02-a7/rendu/c02-billing.html`
   (passe A7, 200) et `_captures/2026-10-27-auth-s3/raw/pages/a16-billing.html`
   (session authentifiée, même contenu). Ce que la cible y met, dans l'ordre :
   le `h1` « Mon compte », la barre d'onglets, le bloc « Votre abonnement »
   (397 MAD/mois, rythme, points de vente, packs d'emails, conditions), puis le
   bloc « Offre gratuite » (progression, jauge, prix, plaque NFC).

   Ce qui est rendu ici : **l'offre gratuite**, et l'aveu de ce qui manque.
   Ce qui n'est pas rendu, et pourquoi :

     - **l'activation** (rythme, « Activer — 397 MAD », prochain prélèvement,
       conditions du pack) : aucun moyen de paiement n'est branché et aucune
       table d'abonnement n'existe. Un bouton qui ne débite rien est le mensonge
       suivant — l'écran dit donc que l'activation n'est pas disponible au lieu
       de la simuler (cf. `docs/regle-comptage-30-2026-11-02.md` §5) ;
     - **les packs d'emails et les points de vente supplémentaires** : ils
       dépendent du même paiement, et des campagnes (P0-4), absentes ;
     - **le numéro WhatsApp de la cible** : c'est le standard de *Fidelix*, pas
       le nôtre. Le recopier ferait signer un contrat à quelqu'un d'autre.

   Les deux prix sont dans `lib/plafond.mjs` (une seule source, deux écrans).
*/

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.abonnement.metaTitre') }
}

export default async function PageAbonnement() {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const lecture = await plafondDuCommerce()
  const plafond = lecture.etat === 'ok' ? lirePlafond(lecture.donnees) : null

  const entete = (
    <>
      <EntetePage titre={t('page.abonnement.titre')} />
      <OngletsCompte chemin="/billing" locale={locale} />
    </>
  )

  /* Le prix ne dépend d'aucune lecture : il s'affiche même quand la migration
     manque, parce qu'il est vrai indépendamment de la base. Ce qui disparaît,
     c'est le **compteur** — jamais remplacé par un zéro. */
  const offre = (
    <section className="uc-card uc-bloc">
      <div className="uc-card-corps">
        <p className="uc-card-title">{t('page.abonnement.votre')}</p>
        <p className="uc-bloc-texte">{t('page.abonnement.aucun')}</p>

        <p className="mt-3 text-2xl font-semibold tracking-tight">
          {t('page.abonnement.prixMois', { prix: PRIX_MOIS_MAD })}
        </p>
        <p className="uc-aide">{t('page.abonnement.parPoint', { prix: PRIX_MOIS_MAD })}</p>
        <p className="uc-aide">{t('page.abonnement.inclus')}</p>

        <p className="uc-bloc-rang">
          <strong>{t('page.abonnement.plaquePrix', { prix: PRIX_PLAQUE_MAD })}</strong>{' '}
          {t('page.abonnement.plaqueUneFois')} — {t('page.abonnement.plaqueTexte')}
        </p>

        <p className="uc-bloc-texte mt-3">{t('page.abonnement.activationAbsente')}</p>
        <p className="uc-aide">{t('page.abonnement.nonRendu')}</p>
      </div>
    </section>
  )

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0012_plafond_clients.sql"
        />
        {offre}
      </>
    )
  }

  if (!plafond) {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.illisibleTitre')}
          texte={lecture.etat === 'refuse' ? t('tableau.rpc.inconnu') : t('tableau.rpc.indisponible')}
        />
        {offre}
      </>
    )
  }

  return (
    <>
      {entete}

      {offre}

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps">
          <p className="uc-card-title">{t('offre.titre')}</p>
          <p className="uc-bloc-texte">
            {plafond.clients === 1
              ? t('page.abonnement.progressionUn', {
                  clients: plafond.clients,
                  limite: plafond.limite,
                })
              : t('page.abonnement.progressionPlusieurs', {
                  clients: plafond.clients,
                  limite: plafond.limite,
                })}
          </p>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plafond.limite}
            aria-valuenow={plafond.clients}
            aria-label={t('page.abonnement.ariaJauge')}
            className="uc-jauge"
          >
            <div className="uc-jauge-remplie" style={{ width: `${plafond.pourcent}%` }} />
          </div>
        </div>
      </section>
    </>
  )
}
