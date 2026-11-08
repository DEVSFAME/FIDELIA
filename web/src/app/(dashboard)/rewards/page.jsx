import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { formaterTaux, pointsDepuisMontant } from '@/lib/programme.mjs'
import { formaterMontant, symboleDevise } from '@/lib/tableau.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { OngletsProgramme } from '@/components/tableau/OngletsProgramme'
import { enregistrer } from './actions.js'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.programme.titre') }
}

/* Module 4 — Programme.
 *
 * C'est la **racine** des trois autres : sans programme, pas de slug (donc pas
 * de QR), pas de paliers (donc rien à proposer en caisse), et `join` lève
 * `PROGRAM_NOT_FOUND`.
 *
 * Le formulaire est en HTML pur : quatre lignes de palier, un bouton. Pas de
 * JavaScript, pas d'état local — le serveur valide, la base décide, et la page
 * relue affiche le résultat. C'est le seul écran dont une erreur de saisie doit
 * être corrigeable depuis un téléphone, en caisse, sans build.
 */
const CHAMPS_CLASS = 'uc-champ'

/* Clés **littérales** : une clé construite par gabarit échappe au balayage
   d'`i18n-ui`, donc une faute de frappe ne se verrait qu'à l'affichage. */
const MESSAGES_ERREUR = {
  slug: 'page.programme.erreur.slug',
  seuil: 'page.programme.erreur.seuil',
  credits: 'page.programme.erreur.credits',
  paliers: 'page.programme.erreur.paliers',
  refus: 'page.programme.erreur.refus',
  /* `migration` : l'action écrit `?etat=migration` quand `enregistrer_programme`
     est absente de la base. Le bloc bloqué plus bas couvre le cas où la
     **lecture** manque aussi ; cette clé couvre celui où elle répond. Sans
     elle, l'URL porterait un état que rien ne rendrait — et une seconde copie
     ferait diverger la phrase selon le chemin. */
  migration: 'tableau.etat.migrationTexte',
}


function Ligne({ rang, libelle, cout, description, t }) {
  return (
    <div className="grid gap-2 rounded-2xl uc-encadre p-3 sm:grid-cols-[1fr_7rem]">
      <input
        name={`libelle${rang}`}
        defaultValue={libelle}
        placeholder={t('tableau.champ.libelle')}
        className={CHAMPS_CLASS}
      />
      <input
        name={`cout${rang}`}
        type="number"
        min="1"
        step="1"
        defaultValue={cout}
        placeholder={t('tableau.champ.cout')}
        className={CHAMPS_CLASS}
      />
      <input
        name={`description${rang}`}
        defaultValue={description ?? ''}
        placeholder={t('tableau.champ.description')}
        className={`${CHAMPS_CLASS} sm:col-span-2`}
      />
    </div>
  )
}

export default async function PageProgramme({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { etat } = await searchParams
  const programme = await programmeDuCommerce()
  const donnees = programme.etat === 'ok' ? programme.donnees : null
  const paliers = donnees?.paliers ?? []

  /* Le taux et la devise viennent de la **donnée**, jamais d'une constante de
     l'écran : `Number(...)` parce que PostgREST peut rendre un `numeric` en
     chaîne, et `EUR` seulement en repli quand aucun programme n'existe encore
     (le formulaire est alors vide, mais le champ doit afficher une valeur). */
  const taux = Number(donnees?.credits_par_euro ?? 1)
  const devise = donnees?.devise ?? 'EUR'
  const exemple = 10

  /* La barre d'onglets de la section, telle que la cible la porte sur **cette**
     page aussi (`a03-rewards.html` : « Récompenses » actif, « Règles » →
     `/program`). Sans elle, la page des règles ne serait joignable que par un
     lien mort ou par l'URL — et c'est l'onglet qui fait la section. */
  const entete = (
    <>
      <EntetePage surtitre={t('page.programme.surtitre')} titre={t('page.programme.titre')} />
      <OngletsProgramme chemin="/rewards" locale={locale} />
    </>
  )

  if (programme.etat === 'nonMigre' || programme.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0003_r3_programme_join_lecture.sql"
        />
      </>
    )
  }

  return (
    <>
      {entete}
      <section className="uc-card uc-bloc uc-carte-pad">
        <p className="text-sm leading-relaxed opacity-80">{t('page.programme.resume')}</p>

        {etat === 'ok' ? (
          <p role="status" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t('page.programme.ok')}
          </p>
        ) : null}
        {etat === 'slug' || etat === 'seuil' || etat === 'credits' || etat === 'paliers' || etat === 'refus' || etat === 'migration' ? (
          <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t(MESSAGES_ERREUR[etat])}
          </p>
        ) : null}

        <form action={enregistrer} className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('tableau.champ.nom')}</span>
            <input name="nom" defaultValue={donnees?.nom ?? ''} required className={CHAMPS_CLASS} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('tableau.champ.slug')}</span>
              <input
                name="slug"
                defaultValue={donnees?.slug ?? ''}
                placeholder="cafe-test-cei3"
                required
                className={CHAMPS_CLASS}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('tableau.champ.seuil')}</span>
              <input
                name="seuil"
                type="number"
                min="1"
                step="1"
                defaultValue={donnees?.seuil ?? 50}
                required
                className={CHAMPS_CLASS}
              />
            </label>
          </div>

          {/* L'unité est un **fait du socle**, pas un réglage : la caisse crédite
              des points (`award_loyalty_points`, sans paramètre de tampon) et
              aucune carte ne dessine de grille de tampons. Le dire ici évite de
              chercher un choix qui n'existe pas — et de le promettre en caisse. */}
          <div className="uc-bloc-aide">
            <p>{t('page.programme.unitePoints')}</p>
          </div>

          {/* Le taux de conversion — la règle qui manquait.
              Il est **facultatif à la lecture** (`default 1` en base) mais
              obligatoire au formulaire : un programme sans taux implicite est
              exactement ce qui laissait deux champs indépendants en caisse.

              Le champ et son aide sont empilés, pas côte à côte : une grille à
              deux colonnes aligne les boîtes, et l'aide (deux lignes) aurait
              flotté à mi-hauteur du champ. */}
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.programme.champCredits')}</span>
            <input
              name="credits"
              type="number"
              min="0.01"
              max="1000"
              step="0.01"
              inputMode="decimal"
              defaultValue={formaterTaux(taux) || '1'}
              required
              className={CHAMPS_CLASS}
            />
          </label>

          {/* L'exemple est calculé **côté serveur**, avec le taux enregistré :
              il montre ce que le réglage produit réellement, et se met à jour
              au premier rechargement après enregistrement. Pas d'aperçu en
              direct — il demanderait du JavaScript sur un écran qui doit rester
              utilisable sans. */}
          <div className="uc-bloc-aide">
            <p>
              {t('page.programme.creditsAide', {
                montant: formaterMontant(exemple, devise),
                points: pointsDepuisMontant(exemple, taux),
              })}
            </p>
            <p className="mt-1">
              {t('page.programme.devise')} : {symboleDevise(devise)} ({devise})
            </p>
          </div>

          <p className="mt-2 text-sm font-semibold opacity-75">
            {t('page.programme.paliersTitre')}
          </p>
          {[1, 2, 3, 4].map((rang) => (
            <Ligne
              key={rang}
              rang={rang}
              t={t}
              libelle={paliers[rang - 1]?.libelle ?? ''}
              cout={paliers[rang - 1]?.cout ?? ''}
              description={paliers[rang - 1]?.description}
            />
          ))}

          <button
            type="submit"
            className="mt-2 flex h-[3.25rem] w-full items-center justify-center rounded-xl bg-ink text-base font-bold text-white transition-all active:scale-95"
          >
            {t('page.programme.action')}
          </button>
        </form>
      </section>
    </>
  )
}
