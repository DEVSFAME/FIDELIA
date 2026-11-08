import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { carteParToken } from '@/lib/donnees.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { normaliserCode } from '@/lib/carte.mjs'
import { nomComplet } from '@/lib/personne.mjs'
import { paliersAtteignables } from '@/lib/programme.mjs'
import { CHEMIN_MANIFESTE } from '@/lib/pwa.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { JaugePoints } from '@/components/tableau/JaugePoints'
import { CameraScanner } from '@/components/scan/CameraScanner'
import { CrediterCaisse } from '@/components/caisse/CrediterCaisse'
import { FileAttente } from '@/components/caisse/FileAttente'
import { echangerRecompense } from './actions.js'

/* La caisse est la **coque PWA** du socle : `/caisse/manifest.webmanifest`
 * (route engendrée, cf. `lib/pwa.mjs`) et `public/sw.js` (portée racine, règles
 * limitées à la caisse). Ces deux liens sont déclarés ici et non dans le
 * layout : le manifeste vaut pour cette route, comme dans la cible
 * (`p09-caisse.html`).
 */
export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return {
    title: t('page.caisse.titre'),
    manifest: CHEMIN_MANIFESTE,
    appleWebApp: {
      capable: true,
      title: t('page.caisse.shortName'),
      statusBarStyle: 'black-translucent',
    },
  }
}


const CHAMP = 'uc-champ'

/* Module 3 — Caisse.
 *
 * Le geste réel, mesuré sur la cible : « Code client C-XXXXXX, ou lien de la
 * carte » -> on voit le solde -> on échange. On ne propose **que** les paliers
 * atteignables : afficher une récompense à 120 points devant un client qui en a
 * 40 est une promesse qu'on ne peut pas tenir, et le refus qui suivrait
 * (points insuffisants) ferait douter du solde, pas du palier.
 *
 * Le coût part en `value` du bouton radio ; l'intitulé est relu côté serveur
 * depuis le programme. Un champ caché se modifie, pas une relecture.
 *
 * MISE EN PAGE (2026-11-01)
 * -------------------------
 * L'ordre suit le geste, pas le code : **identifier** (caméra, puis code à la
 * main), **lire le solde**, **choisir**. Sur mobile c'est une colonne et le
 * pouce descend ; à partir de 1240 px, les récompenses passent en colonne de
 * droite (`.uc-grille`) sans qu'une seule ligne du DOM change — donc sans rien
 * casser pour un clavier ni pour un lecteur d'écran, qui suivent l'ordre de
 * lecture et non la position visuelle.
 *
 * **`&etat=configuration` est rendu (2026-10-31).** Même défaut que sur `/scan` :
 * `echangerRecompense` redirige ici avec ce paramètre quand le client Supabase ne
 * peut pas être construit, et la page ne le lisait pas — l'écran retombait sur un
 * état vide normal, comme si l'échange n'avait jamais été demandé. La copie est
 * `tableau.etat.configuration` : ici, dire « la base n'est pas encore migrée »
 * serait doublement faux (la migration n'est pas tentée, et la base n'est pas en
 * cause). Rôle ARIA : alerte, parce que le message répond à un clic — le
 * commerçant vient de croire qu'il débitait des points. Sur `/login`, le même mot
 * est présent au chargement et reste un état d'écran (§26.3). Le couplage est
 * **lu** par `etat-action.test.mjs`.
 */
export default async function PageCaisse({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { code = '', etat } = await searchParams
  const jeton = normaliserCode(code)

  /* Deux lectures **indépendantes**, menées ensemble (même mesure que `/scan` :
     0,55 à 0,81 s par aller-retour Supabase). Le taux sert au formulaire de
     crédit ; il vient du programme, jamais d'une constante d'écran, et il est
     ramené à un **nombre** pour que `Number.isFinite` décide, pas une chaîne. */
  const [carte, programme] = await Promise.all([
    jeton ? carteParToken(jeton) : Promise.resolve(null),
    programmeDuCommerce(),
  ])
  const lisible = carte?.etat === 'ok' ? carte.donnees : null
  const tauxBrut = Number(programme.etat === 'ok' ? programme.donnees?.credits_par_euro : 1)
  const taux = Number.isFinite(tauxBrut) && tauxBrut > 0 ? tauxBrut : 1
  const paliers = lisible?.paliers ?? []
  const offrables = lisible ? paliersAtteignables(lisible.points, paliers) : []

  const entete = <EntetePage surtitre={t('page.caisse.surtitre')} titre={t('page.caisse.titre')} />


  return (
    <>
      {entete}

      <div className={lisible ? 'uc-grille' : undefined}>
        <div>
          <section className="uc-card uc-bloc uc-carte-pad">
            <h2 className="uc-card-title">{t('page.caisse.identification')}</h2>

            {/* La caméra est **la même** que celle de `/scan` : un seul composant,
                une seule règle de lecture, et la destination est le seul paramètre
                qui change. Elle navigue vers `/caisse?code=…`, c'est-à-dire
                exactement ce que produit la saisie manuelle juste en dessous — donc
                aucun chemin de code n'est ajouté, seulement un chemin d'entrée. */}
            <div className="mt-3">
              <CameraScanner locale={locale} destination="/caisse" />
            </div>

            <p className="uc-aide uc-filet-haut mt-4 pt-4">{t('page.caisse.saisie')}</p>
            <form method="get" className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="opacity-75">{t('page.caisse.champJeton')}</span>
                <input
                  name="code"
                  defaultValue={code}
                  autoComplete="off"
                  placeholder="C-AB12CD"
                  className={CHAMP}
                />
              </label>
              <button type="submit" className="uc-btn uc-btn-primary h-11 sm:mt-auto">
                {t('page.caisse.chercher')}
              </button>
            </form>

            {etat === 'ok' ? (
              <p role="status" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
                {t('page.caisse.ok')}
              </p>
            ) : null}
            {etat === 'introuvable' ? (
              <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
                {t('tableau.etat.introuvable')}
              </p>
            ) : null}
            {etat === 'arguments' ? (
              <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
                {t('tableau.etat.arguments')}
              </p>
            ) : null}
            {etat === 'refus' || etat === 'indisponible' ? (
              <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
                {t('tableau.etat.refus')}
              </p>
            ) : null}
            {/* Le client Supabase n'a pas pu être construit : aucune requête n'est
                partie, donc aucun point n'a bougé et la récompense n'a pas été
                remise. C'est la réponse au geste qui vient d'être fait (le
                formulaire a été soumis), d'où l'alerte — et non un état d'écran,
                contrairement au même mot sur `/login`. */}
            {etat === 'configuration' ? (
              <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
                {t('tableau.etat.configuration')}
              </p>
            ) : null}
          </section>

          {/* La file est montrée **avant** la fiche client : une opération en
              attente doit se voir même quand aucune carte n'est sélectionnée —
              c'est justement après une coupure qu'on ouvre la caisse sans
              savoir qui était en train d'être servi. */}
          <FileAttente locale={locale} />

          {carte?.etat === 'nonMigre' || carte?.etat === 'configuration' ? (
            <EtatBloque
              titre={t('tableau.etat.migrationTitre')}
              texte={t('tableau.etat.migrationTexte')}
              commande="migrations/0003_r3_programme_join_lecture.sql"
            />
          ) : null}

          {carte?.etat === 'introuvable' ? (
            <EtatBloque titre={t('page.caisse.introuvable')} texte={t('tableau.etat.introuvable')} />
          ) : null}

          {lisible ? (
            <section className="uc-card uc-bloc uc-carte-pad">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
                {t('page.caisse.client')}
              </p>
              <p className="mt-1 font-display text-xl font-semibold">
                {nomComplet(lisible.client, locale) || lisible.card_token}
              </p>

              <div className="uc-filet-haut mt-4 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
                  {t('page.caisse.solde')}
                </p>
                <div className="mt-2">
                  <JaugePoints
                    points={lisible.points}
                    paliers={lisible.paliers}
                    libelleProchain={t('page.caisse.prochain')}
                    libelleAucun={t('page.caisse.toutAtteint')}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {lisible ? (
            <CrediterCaisse jeton={lisible.card_token} taux={taux} locale={locale} />
          ) : null}
        </div>

        {lisible ? (
          <section className="uc-card uc-bloc uc-carte-pad">
            <h2 className="uc-card-title">{t('page.caisse.recompenses')}</h2>
            <p className="uc-card-sub mt-1">{t('page.caisse.recompensesAide')}</p>

            {paliers.length === 0 ? (
              <p className="uc-bloc-texte mt-3">{t('page.caisse.aucunPalier')}</p>
            ) : offrables.length === 0 ? (
              <p className="uc-bloc-texte mt-3">{t('page.caisse.aucuneRecompense')}</p>
            ) : (
              <form action={echangerRecompense} className="mt-3 grid gap-3">
                <input type="hidden" name="jeton" value={lisible.card_token} />

                {/* Les récompenses, en cartes plutôt qu'en `<select>`.
                    Un menu déroulant ne montre qu'une ligne à la fois : le commerçant
                    ne comparait jamais le prix des autres paliers, et devait rouvrir
                    la liste pour vérifier qu'il n'en existait pas un meilleur marché.
                    Ici, **tous** les paliers sont visibles d'un coup ; ceux qui sont
                    hors de portée restent affichés — grisés, non sélectionnables, avec
                    « encore N pts ». Les cacher laisserait croire qu'ils n'existent
                    pas, alors que le client les verra sur la page publique. */}
                <fieldset className="uc-choix-grille">
                  <legend className="uc-choix-legende">{t('page.caisse.champLibelle')}</legend>
                  {paliers.map((palier, rang) => {
                    const dispo = palier.cout <= lisible.points
                    return (
                      <label
                        key={`${palier.cout}-${rang}`}
                        className="uc-choix"
                        data-disponible={dispo ? 'true' : 'false'}
                      >
                        <input
                          type="radio"
                          name="cout"
                          value={palier.cout}
                          disabled={!dispo}
                          /* Le premier palier atteignable est coché : un
                             formulaire qui part sans choix explicite doit
                             proposer la récompense la moins chère, pas la
                             première de la liste (qui peut être hors de portée). */
                          defaultChecked={dispo && palier.cout === offrables[0].cout}
                        />
                        <span className="uc-choix-corps">
                          <span className="uc-choix-titre">{palier.libelle}</span>
                          {palier.description ? (
                            <span className="uc-choix-desc">{palier.description}</span>
                          ) : null}
                          {dispo ? null : (
                            <span className="uc-choix-desc">
                              {t('page.caisse.manque', { n: palier.cout - lisible.points })}
                            </span>
                          )}
                        </span>
                        <span className="uc-choix-cout">
                          {t('page.caisse.coutPoints', { n: palier.cout })}
                        </span>
                      </label>
                    )
                  })}
                </fieldset>

                <button type="submit" className="uc-action">
                  {t('page.caisse.action')}
                </button>
              </form>
            )}

            {/* Une promesse d'écran, pas une limite technique cachée : l'échange
                passe par une Server Action, donc par le réseau. Hors ligne il
                échoue — et le solde d'un échange n'est de toute façon pas connu
                tant que les crédits en file ne sont pas partis. */}
            <p className="uc-aide mt-3">{t('page.caisse.horsLigneEchange')}</p>
          </section>
        ) : null}
      </div>
    </>
  )
}
