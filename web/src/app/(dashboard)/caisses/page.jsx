import Link from 'next/link'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { equipeDuCommerce } from '@/lib/donnees.mjs'
import {
  PERIODES,
  PERIODE_PAR_DEFAUT,
  PORTEES,
  PORTEE_PAR_DEFAUT,
  caissesActivesDe,
  estPortee,
  jourValide,
  lireEquipe,
} from '@/lib/equipe.mjs'
import { VIDE, dateHeureCourte } from '@/lib/tableau.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { IconeTrophee } from '@/components/unicity/Icones'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.equipe.titre') }
}

const CELLULE = 'uc-cellule'

/* Écran Équipe — la troisième page servie par une **RPC de lecture** (`0007`).
 *
 * La projection suit la capture `a09-caisses.html` : `h1` « Équipe », les deux
 * portées, les quatre périodes, les sept `th`, puis « Caisses actives ». Ce qui
 * est mesuré est repris ; ce qui ne l'est pas est **écrit** et déclaré dans
 * `docs/design-system.md` §3.
 *
 * CINQ ÉTATS, CINQ TEXTES — c'est la règle d'`EtatBloque`, avec un cas de plus :
 *   - la période « Un jour précis » demandée **sans date** : aucune lecture n'est
 *     même tentée (l'écran en sait plus que la base, qui refuserait
 *     `JOUR_MANQUANT`) ;
 *   - la fonction manque (`nonMigre`) ou Supabase n'est pas configuré ;
 *   - la base refuse (`PERIODE_INCONNUE`, `JOUR_MANQUANT`, `FUSEAU_INCONNU` —
 *     les trois refus de `0007`, désormais dans `CODES_CONNUS` : un refus n'est
 *     pas une panne) ;
 *   - la base répond une forme inattendue (`lireEquipe` rend `null`) ;
 *   - la base répond, et le classement se rend.
 * Aucun zéro n'est affiché quand la lecture n'a pas eu lieu.
 *
 * CE QUE LA CAPTURE MONTRE ET QUE L'ÉCRAN NE FAIT PAS — dettes nommées :
 *   1. **Le drill-down.** La cible ouvre « les opérations » d'une ligne
 *      (`role="button"` sur chaque `tr`, `aria-label="Voir les opérations de …"`).
 *      Il faudrait une RPC par caisse, que ce socle n'a pas. Rendre une ligne
 *      cliquable qui ne fait rien, et afficher « Touchez une ligne pour voir le
 *      détail », serait une promesse sans bouton : on n'affiche ni l'un ni
 *      l'autre.
 *   2. **« Nouvelle caisse ».** Aucune fonction d'écriture de `staff` n'existe
 *      (`0006` n'ouvre la table qu'à `service_role`). Le formulaire est remplacé
 *      par une phrase qui dit pourquoi — un champ qui ne peut pas écrire est
 *      pire qu'une absence expliquée.
 *   3. **« Avis ».** La cible affiche « 0 » : elle a une table d'avis. Ici, la
 *      fonction rend `null` et **déclare** l'absence ; l'écran affiche un tiret
 *      et la raison. Un `0` serait un fait inventé.
 *
 * L'ORDRE N'EST PAS TRIÉ ICI. `0007` impose un ordre total ; l'écran numérote
 * ce qu'il reçoit (`rang`). Retrier localement ferait diverger l'écran de la
 * fonction au premier changement de règle, sans que rien ne le signale.
 */
export default async function PageEquipe({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { periode, jour, portee } = await searchParams

  /* La clé demandée part **telle quelle** à la fonction : c'est elle qui tient
     le vocabulaire fermé (`PERIODE_INCONNUE`), et un écran qui corrigerait
     silencieusement une faute d'URL afficherait le classement d'une autre
     période sous l'étiquette demandée. */
  const demandee =
    typeof periode === 'string' && periode !== '' ? periode : PERIODE_PAR_DEFAUT
  const jourChoisi = jourValide(jour) ? jour : null
  const porteeChoisie = estPortee(portee) ? portee : PORTEE_PAR_DEFAUT

  // « Un jour précis » sans date : la base refuserait ; on lui épargne l'appel.
  const jourManquant = demandee === 'jour' && jourChoisi === null
  const lecture = jourManquant
    ? null
    : await equipeDuCommerce({ periode: demandee, jour: jourChoisi })
  const equipe = lecture?.etat === 'ok' ? lireEquipe(lecture.donnees) : null

  // La période **appliquée** vient de la réponse, pas de l'URL : l'écran
  // surligne ce qui a été lu, jamais ce qui a été tenté.
  const appliquee = equipe ? equipe.periode.cle : demandee

  const lien = (clePeriode, clePortee) => `/caisses?periode=${clePeriode}&portee=${clePortee}`

  const entete = (
    <EntetePage surtitre={t('page.equipe.surtitre')} titre={t('page.equipe.titre')} />
  )

  /* Deux bandeaux, deux rôles : la portée choisit **quelles** caisses sont
     listées, la période choisit **quelle fenêtre** le classement couvre. Les
     deux sont des liens — donc partageables, rechargeables, et utilisables sans
     JavaScript. */
  const portees = (
    <nav aria-label={t('page.equipe.portees')}>
      <ul className="uc-periodes">
        {PORTEES.map((p) => (
          <li key={p.cle}>
            <Link
              href={lien(appliquee, p.cle)}
              className="uc-periode"
              aria-current={porteeChoisie === p.cle ? 'page' : undefined}
            >
              {t(p.copie)}
            </Link>
          </li>
        ))}
      </ul>
      {porteeChoisie === 'caisse' ? (
        <p className="uc-aide mt-2">{t('page.equipe.porteeCaisseDesc')}</p>
      ) : null}
    </nav>
  )

  const periodes = (
    <nav aria-label={t('page.equipe.periodes')}>
      <ul className="uc-periodes">
        {PERIODES.map((p) => (
          <li key={p.cle}>
            <Link
              href={lien(p.cle, porteeChoisie)}
              className="uc-periode"
              aria-current={appliquee === p.cle ? 'page' : undefined}
            >
              {t(p.copie)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )

  const tete = (
    <>
      {entete}
      {portees}
      {/* Là où la cible met le formulaire « Nouvelle caisse ». Aucune fonction
          d'écriture de `staff` n'existe : on dit pourquoi, au même endroit, au
          lieu de laisser chercher un bouton qui n'existe pas. */}
      <p className="uc-aide mt-2">{t('page.equipe.formulaireAbsent')}</p>
    </>
  )

  const classement = (contenu) => (
    <section className="uc-bloc">
      <h2 className="uc-card-title">{t('page.equipe.classement')}</h2>
      {periodes}
      {contenu}
    </section>
  )

  if (jourManquant) {
    return (
      <>
        {tete}
        {classement(
          <>
            <div className="uc-card mt-3 uc-carte-pad">
              <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="periode" value="jour" />
                <input type="hidden" name="portee" value={porteeChoisie} />
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span className="opacity-75">{t('page.equipe.champJour')}</span>
                  <input
                    name="jour"
                    type="date"
                    required
                    defaultValue={jourChoisi ?? ''}
                    className="uc-champ"
                  />
                </label>
                <button type="submit" className="uc-btn uc-btn-primary h-11 sm:mt-auto">
                  {t('page.equipe.voirJour')}
                </button>
              </form>
            </div>
            <EtatBloque
              titre={t('page.equipe.jourManquantTitre')}
              texte={t('page.equipe.jourManquant')}
            />
          </>
        )}
      </>
    )
  }

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {tete}
        {classement(
          <EtatBloque
            titre={t('tableau.etat.migrationTitre')}
            texte={t('tableau.etat.migrationTexte')}
            commande="migrations/0007_equipe_lecture.sql"
          />
        )}
      </>
    )
  }

  if (lecture.etat !== 'ok') {
    // `refuse` (les trois refus de `0007`) et `indisponible` ont le même texte
    // ici : dans les deux cas, aucun chiffre n'a été lu. La distinction fine
    // reste dans `code`, que l'écran n'affiche pas — un code PostgREST n'est pas
    // une phrase pour un commerçant. On n'emprunte **pas** `tableau.etat.refus` :
    // cette phrase-là parle d'un solde inchangé, c'est-à-dire d'une écriture.
    return (
      <>
        {tete}
        {classement(
          <EtatBloque titre={t('page.equipe.refusTitre')} texte={t('page.equipe.refus')} />
        )}
      </>
    )
  }

  if (equipe === null) {
    return (
      <>
        {tete}
        {classement(
          <EtatBloque
            titre={t('page.equipe.illisibleTitre')}
            texte={t('page.equipe.illisible')}
          />
        )}
      </>
    )
  }

  const caisses = caissesActivesDe(equipe.lignes, porteeChoisie)
  const fin = dateHeureCourte(equipe.periode.fin)
  const fenetre = equipe.periode.debut
    ? t('page.equipe.fenetre', {
        debut: dateHeureCourte(equipe.periode.debut),
        fin,
        fuseau: equipe.periode.fuseau,
      })
    : t('page.equipe.fenetreOuverte', { fin, fuseau: equipe.periode.fuseau })

  const colonnes = [
    ['page.equipe.colonneCartes', 'cartes'],
    ['page.equipe.colonneScans', 'scans'],
    ['page.equipe.colonnePoints', 'points'],
    ['page.equipe.colonneCa', 'ca'],
    ['page.equipe.colonneAvis', 'avis'],
  ]

  return (
    <>
      {tete}
      {classement(
        <>
          <div className="uc-card mt-3 uc-carte-pad">
            <div className="uc-defile">
              <table className="uc-table">
                <caption className="uc-sr">{t('page.equipe.classement')}</caption>
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide opacity-55">
                    <th scope="col" className={`${CELLULE} text-left`}>
                      {t('page.equipe.colonneRang')}
                    </th>
                    <th scope="col" className={`${CELLULE} text-left`}>
                      {t('page.equipe.colonneCaissier')}
                    </th>
                    {colonnes.map(([cle]) => (
                      <th scope="col" className={`${CELLULE} text-right`} key={cle}>
                        {t(cle)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipe.lignes.map((ligne) => (
                    /* Une caisse désactivée garde sa ligne et ses chiffres —
                       désactiver n'efface pas l'histoire (`0007`) — mais elle
                       est **marquée** : sans la pastille, ses chiffres
                       passeraient pour ceux d'une caisse active. */
                    <tr key={ligne.cle} className={ligne.actif ? undefined : 'uc-muted'}>
                      <td className={CELLULE}>
                        <span className="uc-rang">
                          {ligne.rang === 1 ? <IconeTrophee /> : null}
                          {ligne.rang === 1 ? (
                            <span className="uc-sr">
                              {t('page.equipe.rang', { rang: ligne.rang })}
                            </span>
                          ) : (
                            ligne.rang
                          )}
                        </span>
                      </td>
                      <td className={`${CELLULE} font-semibold`}>
                        <span className="flex flex-wrap items-center gap-2">
                          {ligne.titulaire ? t('page.equipe.titulaire') : ligne.prenom}
                          {ligne.titulaire ? (
                            <span className="uc-pill uc-pill-accent">
                              {t('page.equipe.vous')}
                            </span>
                          ) : null}
                          {ligne.actif ? null : (
                            <span className="uc-pill">{t('page.equipe.desactivee')}</span>
                          )}
                        </span>
                      </td>
                      {colonnes.map(([, champ]) => (
                        <td className={`${CELLULE} text-right font-mono`} key={champ}>
                          {ligne.affichage[champ] ?? VIDE}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="uc-aide mt-3">{fenetre}</p>
            {equipe.absences.includes('avis') ? (
              <p className="uc-aide mt-1">{t('page.equipe.avisAbsent')}</p>
            ) : null}
          </div>

          {/* Les deux définitions de la capture, mot pour mot. Elles portent le
              **sens** des colonnes : sans elles, « Cartes » se lirait comme un
              nombre de cartes (mesuré : 2 désignés pour 4 cartes, `0007`). */}
          <p className="uc-aide mt-3">
            {t('page.equipe.cartesDefinition', { marque: t('marque.nom') })}
          </p>
          <p className="uc-aide mt-1">{t('page.equipe.tableauDefinition')}</p>
        </>
      )}

      <section className="uc-bloc">
        <h2 className="uc-card-title">{t('page.equipe.actives')}</h2>
        {caisses.length === 0 ? (
          <p className="uc-bloc-texte mt-2">
            {porteeChoisie === 'caisse'
              ? t('page.equipe.aucuneCaisse')
              : t('page.equipe.aucunePortee')}
          </p>
        ) : (
          <ul className="uc-liste mt-2">
            {caisses.map((ligne) => (
              <li className="uc-liste-rang" key={ligne.cle}>
                <span className="uc-liste-point" aria-hidden="true" />
                <span className="uc-liste-titre">{ligne.prenom}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
