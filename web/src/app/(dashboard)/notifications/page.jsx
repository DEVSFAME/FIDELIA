import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { messagesDuCommerce } from '@/lib/donnees.mjs'
import {
  HISTORIQUE,
  MESSAGE_MAX,
  MESSAGE_MIN,
  TITRE_MAX,
  TITRE_MIN,
  cleStatut,
  etatQuota,
  lireMessages,
} from '@/lib/messages.mjs'
import { dateHeureCourte } from '@/lib/tableau.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { envoyer } from './actions'

/* Page `/notifications` — onglet « Notifications » de l'écran « Messages » (P0-4).

   Projection mesurée : `_captures/2026-11-02-a7b/rendu/d01-notifications.html`
   (passe A7b, 200, session réelle). Ce que la cible y met, dans l'ordre : le
   `h1` « Messages », la barre d'onglets (Notifications · Automatiques ·
   Emails), le bloc « Nouvelle notification » avec son compteur `0 / 3
   aujourd'hui`, les trois champs, la phrase de modération, le bouton, puis
   « Historique des notifications ».

   CE QUI N'EST PAS RENDU, ET POURQUOI
   -----------------------------------
     - **la barre d'onglets** : `/automations` et `/campaigns` n'ont pas de page
       ici. Un onglet vers une route absente est exactement le lien mort que
       `navigation.test.mjs` interdit — la doctrine du projet est « la page
       d'abord, le lien ensuite » ;
     - **l'aperçu de la notification** : la cible le rend en direct (React, sans
       aller-retour). Sans JavaScript, un aperçu figé serait faux dès la
       première frappe ;
     - **les compteurs `0/50` et `0/150`** : même raison — un compteur statique
       sur un champ vide afficherait « 0 » quoi qu'on tape ;
     - **la phrase de modération** : la cible modère côté serveur, sa fonction
       n'est pas observable. On ne promet pas un filtre qu'on n'a pas écrit ;
     - **les totaux « 2 iPhone · 1 Android »** : ils viennent des appareils
       touchés par un envoi. Aucun envoi n'existe ici (P0-4b).

   Ce que la page dit à la place, et qui est vrai : les messages sont **en
   file**. La base les garde, aucun canal ne les sort, et l'écran le dit pour
   chaque ligne — jamais « Envoyée ».
*/

const CHAMP = 'uc-champ'

/** Les refus de l'action, nommés un par un (exigence d'`etat-action.test`). */
const MESSAGES_ERREUR = {
  titre: 'page.messages.erreur.titre',
  titreLong: 'page.messages.erreur.titreLong',
  corps: 'page.messages.erreur.corps',
  corpsLong: 'page.messages.erreur.corpsLong',
  lien: 'page.messages.erreur.lien',
  quota: 'page.messages.erreur.quota',
  refus: 'page.messages.erreur.refus',
  /* `migration` : l'action écrit ce code quand `enfiler_message` est absente.
     La clé est celle d'`EtatBloque` — une seconde copie ferait diverger la
     phrase selon le chemin emprunté. */
  migration: 'tableau.etat.migrationTexte',
}

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.messages.titre') }
}

export default async function PageMessages({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { etat } = await searchParams
  const lecture = await messagesDuCommerce()

  const entete = (
    <EntetePage surtitre={t('page.messages.surtitre')} titre={t('page.messages.titre')} />
  )

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0013_messages.sql"
        />
      </>
    )
  }

  const file = lecture.etat === 'ok' ? lireMessages(lecture.donnees) : null

  /* Trois causes de ne rien pouvoir écrire, trois textes — c'est la règle
     d'`EtatBloque` : « la migration manque » ne se dit pas « la base ne
     répond pas », et aucun des deux ne se dit « aucun message ». */
  if (!file) {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.illisibleTitre')}
          texte={lecture.etat === 'refuse' ? t('tableau.rpc.inconnu') : t('tableau.rpc.indisponible')}
        />
      </>
    )
  }

  const quota = etatQuota(file)

  return (
    <>
      {entete}

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps">
          <div className="flex items-center justify-between gap-3">
            <p className="uc-card-title">{t('page.messages.nouvelle')}</p>
            <span className="uc-bloc-rang tabular-nums" aria-label={t('page.messages.ariaQuota')}>
              {t('page.messages.compteur', { aujourdhui: file.aujourdhui, limite: file.limite })}
            </span>
          </div>

          <p className="uc-aide">
            {quota === 'atteint'
              ? t('page.messages.aideAtteint', { limite: file.limite })
              : t('page.messages.aide', { limite: file.limite })}
          </p>

          {/* Huit refus possibles, **nommés un par un** : `etat-action.test`
              exige que chaque `?etat=` écrit par l'action ait sa branche ici, et
              il a raison — une table seule (`MESSAGES_ERREUR[etat]`) laisserait
              passer un code que rien ne rend. La table ne sert qu'au texte. */}
          {etat === 'titre' ||
          etat === 'titreLong' ||
          etat === 'corps' ||
          etat === 'corpsLong' ||
          etat === 'lien' ||
          etat === 'quota' ||
          etat === 'refus' ||
          etat === 'migration' ? (
            <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
              {t(MESSAGES_ERREUR[etat])}
            </p>
          ) : null}

          {etat === 'enfiler' ? (
            <p role="status" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
              {t('page.messages.enfile')}
            </p>
          ) : null}

          {quota === 'atteint' ? (
            /* La cible **remplace** le bouton par cette phrase au lieu de le
               désactiver (mesuré : `U ? « Prochaine notification demain » :
               <button>`). On fait pareil — un bouton grisé laisse croire à une
               panne passagère. */
            <p className="uc-aide mt-4">{t('page.messages.prochaineDemain')}</p>
          ) : (
            <form action={envoyer} className="mt-5 grid gap-5">
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="opacity-75">{t('page.messages.champTitre')}</span>
                <input
                  name="titre"
                  maxLength={TITRE_MAX}
                  minLength={TITRE_MIN}
                  required
                  placeholder={t('page.messages.placeholderTitre')}
                  className={CHAMP}
                />
                <span className="uc-aide font-normal">
                  {t('page.messages.borneTitre', { min: TITRE_MIN, max: TITRE_MAX })}
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="opacity-75">{t('page.messages.champMessage')}</span>
                <textarea
                  name="corps"
                  rows={3}
                  maxLength={MESSAGE_MAX}
                  minLength={MESSAGE_MIN}
                  required
                  placeholder={t('page.messages.placeholderMessage')}
                  className={CHAMP}
                />
                <span className="uc-aide font-normal">
                  {t('page.messages.borneMessage', { min: MESSAGE_MIN, max: MESSAGE_MAX })}
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="opacity-75">{t('page.messages.champLien')}</span>
                <input
                  name="lien"
                  type="url"
                  dir="ltr"
                  placeholder={t('page.messages.placeholderLien')}
                  className={CHAMP}
                />
                <span className="uc-aide font-normal">{t('page.messages.lienAide')}</span>
              </label>

              <button type="submit" className="uc-btn uc-btn-primary h-11">
                {t('page.messages.action')}
              </button>
            </form>
          )}

          <p className="uc-aide mt-4">{t('page.messages.fileAide')}</p>
          <p className="uc-aide">
            {file.joignables === 1
              ? t('page.messages.joignablesUn')
              : t('page.messages.joignables', { joignables: file.joignables })}
          </p>
        </div>
      </section>

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps">
          <p className="uc-card-title">{t('page.messages.historique')}</p>

          {file.messages.length === 0 ? (
            <p className="uc-bloc-rang">{t('page.messages.historiqueVide')}</p>
          ) : (
            <ul className="grid gap-3">
              {file.messages.slice(0, HISTORIQUE).map((message) => (
                <li key={message.id} className="uc-encadre rounded-2xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{message.titre}</p>
                    <span className="uc-bloc-rang shrink-0">{t(cleStatut(message.statut))}</span>
                  </div>
                  <p className="uc-bloc-texte mt-0.5">{message.corps}</p>
                  <p className="uc-aide mt-1">
                    {dateHeureCourte(message.created_at)}
                    {message.lien ? ` · ${message.lien}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

