import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { cartesDuCommerce } from '@/lib/donnees.mjs'
import { initiales, lireListeCartes } from '@/lib/carte.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.clients.titre') }
}

const CELLULE = 'uc-cellule'

/* Écran Clients — le premier alimenté par une **RPC de lecture** (`0004`).
 *
 * Ce qui est mesuré, et ce qui ne l'est pas :
 *   - les quatre colonnes, le titre « Clients » (`<h1>` de la capture ; « Mes
 *     clients » y est l'onglet voisin, pas le titre), le titre de section
 *     « Liste des membres » et le compteur « 1 client inscrit » viennent de la
 *     capture authentifiée `_captures/2026-10-27-auth-s3/raw/pages/
 *     a17-customers.html` (texte rendu). Ils sont donc repris **tels quels**,
 *     et `clients-lecture.test.mjs` les confronte à la capture ;
 *   - la phrase d'état vide, elle, est **écrite** : la cible avait un client,
 *     donc son écran vide n'a jamais été capturé. Elle est déclarée dans
 *     `docs/design-system.md` §3.
 *
 * Quatre états, quatre textes, aucune confusion (règle d'`EtatBloque`) :
 *   - la fonction manque (`nonMigre`) ou Supabase n'est pas configuré  -> bloc
 *     migration, avec le nom du fichier à exécuter ;
 *   - la base refuse ou ne répond pas                                -> bloc refus ;
 *   - la base répond une forme inattendue                            -> bloc refus,
 *     avec un texte propre : ce n'est pas « aucune carte » ;
 *   - la base répond une liste vide                                  -> état vide.
 *
 * Aucun zéro n'est affiché quand la lecture n'a pas eu lieu.
 */
export default async function PageClients() {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const lecture = await cartesDuCommerce()
  const liste = lecture.etat === 'ok' ? lireListeCartes(lecture.donnees) : null

  const entete = (
    <EntetePage surtitre={t('page.clients.surtitre')} titre={t('page.clients.titre')} />
  )

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0004_lecture_cartes.sql"
        />
      </>
    )
  }

  if (lecture.etat !== 'ok' || liste === null) {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('page.clients.illisibleTitre')}
          texte={
            lecture.etat === 'ok' ? t('page.clients.illisible') : t('tableau.etat.refus')
          }
        />
      </>
    )
  }

  if (liste.cartes.length === 0) {
    return (
      <>
        {entete}
        <EtatBloque titre={t('page.clients.videTitre')} texte={t('page.clients.vide')} />
      </>
    )
  }

  return (
    <>
      {entete}

      <p className="mt-3 text-sm opacity-70">
        {liste.total === 1
          ? t('page.clients.compteUn', { n: liste.total })
          : t('page.clients.comptePlusieurs', { n: liste.total })}
      </p>

      <section className="uc-card uc-bloc uc-carte-pad">
        <table className="uc-table">
          <caption className="text-left font-display text-lg font-semibold">
            {t('page.clients.liste')}
          </caption>
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide opacity-55">
              <th scope="col" className={`${CELLULE} text-left`}>
                {t('page.clients.colonneCode')}
              </th>
              <th scope="col" className={`${CELLULE} text-right`}>
                {t('page.clients.colonnePoints')}
              </th>
              <th scope="col" className={`${CELLULE} text-right`}>
                {t('page.clients.colonneRecompenses')}
              </th>
              <th scope="col" className={`${CELLULE} text-right`}>
                {t('page.clients.colonneInscription')}
              </th>
            </tr>
          </thead>
          <tbody>
            {liste.cartes.map((carte) => {
              const marque = initiales(carte.prenom, carte.nom)
              return (
                <tr key={carte.code}>
                  <td className={CELLULE}>
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="uc-avatar"
                      >
                        {marque || '—'}
                      </span>
                      <span className="font-mono font-semibold">{carte.code}</span>
                    </span>
                  </td>
                  <td className={`${CELLULE} text-right font-mono`}>{carte.points}</td>
                  <td className={`${CELLULE} text-right font-mono`}>{carte.recompenses}</td>
                  <td className={`${CELLULE} text-right opacity-75`}>{carte.inscritLe}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {liste.tronquee ? (
          <p className="mt-4 text-xs opacity-60">
            {t('page.clients.tronquee', { limite: liste.limite })}
          </p>
        ) : null}
      </section>
    </>
  )
}

