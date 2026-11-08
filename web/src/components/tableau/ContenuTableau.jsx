import Link from 'next/link'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { pour } from '@/i18n/index.mjs'
import { initiales } from '@/lib/carte.mjs'
import {
  VIDE,
  formaterMontant,
  formaterNombre,
  formaterPoints,
  indicateurs,
} from '@/lib/tableau.mjs'
import {
  IconeFleche,
  IconeIndCa,
  IconeIndClients,
  IconeIndReviennent,
  IconeIndVisites,
} from '@/components/unicity/Icones'

/* Le contenu du tableau de bord, extrait de la page pour être **rendu à
   l'identique** par l'aperçu de développement. Une seule source : si le
   contenu change, l'aperçu change, et les deux ne peuvent pas diverger.

   MISE EN PAGE — reprise de l'accueil d'Unicity (`features.css` l.62-160,
   218-248, 446-490) :

     en-tête   : salutation manuscrite + titre + pastille d'état ;
     héro      : le chiffre d'affaires en très grand, quatre « coins » à filets
                 (clients, visites, reviennent, transactions) ;
     grille    : quatre indicateurs à pastille + filigrane ;
     colonne 1 : les transactions récentes, en tableau ;
     colonne 2 : les totaux, les garanties, et les deux raccourcis utiles.

   Ce qui n'a **pas** changé, et ne doit pas changer :

     - `INDICATEURS` reste la liste des quatre clés mesurées (test
       `apercu.test.mjs`) : la copie vient du dictionnaire, jamais d'un littéral ;
     - `tableau` absent ne produit aucun chiffre — les cartes affichent « — »,
       parce qu'un « 0 » se lirait comme un fait mesuré ;
     - les états « on ne peut pas encore » passent par `EtatBloque`.

   Le rendu est **mobile d'abord** : une colonne, puis la grille à deux colonnes
   à partir de 1240 px (voir `styles/unicity.css`, §14).
*/

const INDICATEURS = ['clients', 'visites', 'reviennent', 'ca']

const GARANTIES = ['garde', 'mesure', 'nuit', 'formulaire']

/** Une icône par indicateur — même jeu que le dock, donc même langage visuel. */
const ICONES = {
  clients: IconeIndClients,
  visites: IconeIndVisites,
  reviennent: IconeIndReviennent,
  ca: IconeIndCa,
}

/** La copie d'un indicateur non lu : même clé, aucune valeur. */
function vides() {
  return INDICATEURS.map((cle) => ({ cle, valeur: VIDE, sous: null, sousParams: {} }))
}

/** L'état d'accueil quand la lecture n'a pas eu lieu. */
function Etat({ etat, t }) {
  if (etat === 'nonMigre' || etat === 'configuration') {
    return (
      <EtatBloque
        titre={t('tableau.etat.migrationTitre')}
        texte={t('tableau.etat.migrationTexte')}
        commande="migrations/0005_lecture_tableau.sql"
      />
    )
  }
  if (etat === 'illisible') {
    return <EtatBloque titre={t('tableau.illisibleTitre')} texte={t('tableau.illisible')} />
  }
  return <EtatBloque titre={t('tableau.illisibleTitre')} texte={t('tableau.etat.refus')} />
}

/** Le libellé d'un indicateur — `CA` porte sa devise, les autres non.
 *
 * Sans devise lue, on n'écrit pas « CA () » : une parenthèse vide se lit comme
 * un gabarit cassé. La clé de repli dit simplement « CA », et l'unité reste
 * absente parce qu'on ne la connaît pas.
 */
function libelle(carte, t, devise) {
  if (carte.cle !== 'ca') return t(`tableau.indicateur.${carte.cle}`)
  return devise
    ? t('tableau.indicateur.ca', { devise })
    : t('tableau.indicateur.caSansDevise')
}

export function ContenuTableau({ locale = 'fr', tableau = null, etat = 'ok' }) {
  const { t } = pour(locale)
  const devise = tableau?.devise ?? null
  const cartes = tableau ? indicateurs(tableau) : vides()

  /* Les quatre valeurs du héro. Sans lecture, ce sont des tirets : le héro ne
     peut pas afficher un chiffre que personne n'a lu.

     Les libellés des trois premiers coins viennent de `cartes` — donc de
     `INDICATEURS` — et **non** d'un littéral : `tableau-lecture.test.mjs`
     interdit les clés d'indicateur écrites en dur dans ce fichier, parce qu'un
     cinquième indicateur ajouté à la liste ne serait alors jamais rendu. Seul
     « Transactions » n'est pas un indicateur : il a sa propre clé.
  */
  const coins = [
    ...cartes
      .filter((carte) => carte.cle !== 'ca')
      .map((carte) => ({ cle: carte.cle, lbl: libelle(carte, t, devise), val: carte.valeur })),
    {
      cle: 'transactions',
      lbl: t('tableau.total.transactions'),
      val: tableau ? String(tableau.transactions.total) : VIDE,
    },
  ]

  /* Le héro porte le CA en très grand, et son total en sous-titre. Les deux
     passent par `formaterNombre` : c'est le module qui sait qu'un montant
     illisible vaut « — », pas « 0 ». */
  const caTrenteJours = tableau ? formaterNombre(tableau.ca.trente_jours) : VIDE
  const caTotal = tableau ? formaterNombre(tableau.ca.total) : VIDE


  return (
    <>
      <header className="uc-page-tete">
        <div>
          <p className="uc-page-sur">{t('tableau.surtitre')}</p>
          <h1 className="uc-page-titre">{t('tableau.titre')}</h1>
        </div>
        {tableau ? null : (
          <p className="uc-pill uc-pill-warning">{t('tableau.nonBranche')}</p>
        )}
      </header>

      {etat !== 'ok' ? (
        <Etat etat={etat} t={t} />
      ) : (
        <div className="uc-grille">
          <div className="uc-colonne">
            {/* ---------- Héro : le chiffre d'affaires en grand ---------- */}
            <section className="uc-hero" aria-labelledby="heroCa">
              <div className="uc-hero-bg" aria-hidden="true" />
              <div className="uc-hero-corps">
                <p className="uc-hero-sur" id="heroCa">
                  {devise
                    ? t('tableau.indicateur.ca', { devise })
                    : t('tableau.indicateur.caSansDevise')}
                </p>
                <p className="uc-hero-big">
                  <span className="uc-hero-val num">{caTrenteJours}</span>
                  {devise ? <span className="uc-hero-unite">{devise}</span> : null}
                </p>
                <p className="uc-hero-note">
                  {tableau
                    ? t('tableau.sous.caTrenteJours', { total: caTotal })
                    : t('tableau.aucuneDonnee')}
                </p>
                <div className="uc-hero-pied">
                  <Link href="/scan" className="uc-btn uc-btn-primary uc-btn-sm">
                    {t('tableau.nav.scanner')}
                  </Link>
                  <Link href="/customers" className="uc-btn uc-btn-outline uc-btn-sm">
                    {t('tableau.nav.clients')}
                  </Link>
                </div>
              </div>

              <div className="uc-hero-coins">
                {coins.map((coin) => (
                  <div className="uc-hero-coin" key={coin.cle}>
                    <p className="uc-hero-coin-lbl">{coin.lbl}</p>
                    <p className="uc-hero-coin-val num">{coin.val}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------- Les quatre indicateurs ---------- */}
            <section aria-label={t('tableau.indicateurs.ariaLabel')} className="uc-kpis">
              {cartes.map((carte) => {
                const Icone = ICONES[carte.cle] ?? IconeIndClients
                return (
                  <article className="uc-kpi" key={carte.cle}>
                    <div className="uc-kpi-tete">
                      <span className="uc-kpi-pastille" aria-hidden="true">
                        <Icone />
                      </span>
                      <h2 className="uc-kpi-lbl">{libelle(carte, t, devise)}</h2>
                    </div>
                    <p className="uc-kpi-val num">{carte.valeur}</p>
                    <p className="uc-kpi-sous">
                      {carte.sous
                        ? t(`tableau.sous.${carte.sous}`, carte.sousParams)
                        : t('tableau.aucuneDonnee')}
                    </p>
                    <span className="uc-kpi-emblem" aria-hidden="true">
                      <Icone />
                    </span>
                  </article>
                )
              })}
            </section>

            {/* ---------- Transactions récentes ---------- */}
            {tableau ? (
              <section className="uc-card" aria-labelledby="recentesTitre">
                <div className="uc-card-head">
                  <h2 className="uc-card-title" id="recentesTitre">
                    {t('tableau.recentes.titre')}
                  </h2>
                  <span className="uc-pill">{tableau.recentes.length}</span>
                  <Link
                    href="/customers"
                    className="uc-card-link"
                    aria-label={t('tableau.nav.clients')}
                  >
                    <IconeFleche />
                  </Link>
                </div>

                <div className="uc-card-corps uc-defile">
                  {tableau.recentes.length === 0 ? (
                    <p className="uc-bloc-texte">{t('tableau.recentes.vide')}</p>
                  ) : (
                    <table className="uc-table">
                      <thead>
                        <tr>
                          <th scope="col">{t('tableau.recentes.colonneClient')}</th>
                          <th scope="col">{t('tableau.recentes.colonneType')}</th>
                          <th scope="col" className="uc-droite">
                            {t('tableau.recentes.colonnePoints')}
                          </th>
                          <th scope="col" className="uc-droite">
                            {t('tableau.recentes.colonneMontant')}
                          </th>
                          <th scope="col" className="uc-droite">
                            {t('tableau.recentes.colonneDate')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableau.recentes.map((ligne, rang) => {
                          const marque = initiales(ligne.prenom, ligne.nom)
                          return (
                            <tr key={`${ligne.code}-${rang}`}>
                              <td>
                                <span className="uc-cellule-client">
                                  <span className="uc-avatar" aria-hidden="true">
                                    {marque || '—'}
                                  </span>
                                  <span className="uc-code">{ligne.code}</span>
                                </span>
                              </td>
                              <td>{ligne.recompense ?? t('tableau.recentes.typePoints')}</td>
                              <td className="uc-droite num">{formaterPoints(ligne.points)}</td>
                              <td className="uc-droite num">
                                {formaterMontant(ligne.montant, devise)}
                              </td>
                              <td className="uc-droite uc-muted">{ligne.date}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            ) : null}
          </div>

          {/* ---------- Colonne de droite : totaux, garanties, raccourcis ---------- */}
          <aside className="uc-colonne">
            <section className="uc-card" aria-labelledby="totauxTitre">
              <div className="uc-card-head">
                <h2 className="uc-card-title" id="totauxTitre">
                  {t('tableau.total.titre')}
                </h2>
              </div>
              <div className="uc-card-corps">
                {tableau ? (
                  <dl className="uc-totaux">
                    <div className="uc-total-rang">
                      <dt>{t('tableau.total.transactions')}</dt>
                      <dd className="num">{tableau.transactions.total}</dd>
                    </div>
                    <div className="uc-total-rang">
                      <dt>{t('tableau.total.recompenses')}</dt>
                      <dd className="num">{tableau.transactions.recompenses}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="uc-bloc-texte">{t('tableau.aucuneDonnee')}</p>
                )}
              </div>
            </section>

            <section className="uc-card" aria-labelledby="garantiesTitre">
              <div className="uc-card-head">
                <h2 className="uc-card-title" id="garantiesTitre">
                  {t('tableau.garanties.titre')}
                </h2>
              </div>
              <div className="uc-card-corps">
                <ul className="uc-liste">
                  {GARANTIES.map((cle) => (
                    <li className="uc-liste-rang" key={cle}>
                      <span className="uc-liste-point" aria-hidden="true" />
                      <span className="uc-liste-titre">{t(`tableau.garanties.${cle}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="uc-card" aria-labelledby="raccourcisTitre">
              <div className="uc-card-head">
                <h2 className="uc-card-title" id="raccourcisTitre">
                  {t('tableau.nav.ariaLabel')}
                </h2>
              </div>
              <div className="uc-card-actions">
                <Link href="/caisses" className="uc-btn uc-btn-ghost uc-btn-sm">
                  {t('tableau.nav.equipe')}
                  <IconeFleche />
                </Link>
                <Link href="/qrcode" className="uc-btn uc-btn-ghost uc-btn-sm">
                  {t('tableau.nav.qrcode')}
                  <IconeFleche />
                </Link>
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  )
}
