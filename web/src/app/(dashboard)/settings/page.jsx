import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { ficheDuCommerce } from '@/lib/donnees.mjs'
import { TYPES_ACTIVITE, lireFiche } from '@/lib/etablissement.mjs'
import { couvertureM } from '@/lib/proximite.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { OngletsCompte } from '@/components/tableau/OngletsCompte'
import { enregistrer } from './actions.js'

/* Page `/settings` — « Mon compte » (écart P0-2).
 * Projection mesurée : `_captures/2026-11-02-a7/rendu/c01-settings.html` et
 * `_captures/2026-11-04-a8/raw/pages/e01-settings.html`.
 *
 * La « Couverture réelle » est rendue depuis la passe A8 : la formule est lue
 * dans le chunk (`round(min(rayon−250, 3825/(2π)) + 250)`), donc l'écran peut
 * annoncer un chiffre sans l'inventer — `lib/proximite.mjs` en est la seule
 * copie. Le champ d'emplacement, lui, ré-affiche des **coordonnées** et non le
 * lien collé : c'est ce que la base garde depuis `0017`.
 *
 * Non rendu, et déclaré : « Mot de passe » et « Résiliation » (non mesurés,
 * hors socle), « Langue » (darija hors périmètre), et le masquage des écrans
 * Caisse quand le commerce est en ligne.
 */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.compte.metaTitre') }
}

const CHAMP = 'uc-champ'
const LIBELLE = 'grid gap-1.5 text-sm font-semibold'

/* Clés littérales : une clé construite par gabarit échappe au balayage
   d'`i18n-ui`, donc une faute de frappe ne se verrait qu'à l'affichage. */
const MESSAGES_ERREUR = {
  nom: 'page.compte.erreur.nom',
  type: 'page.compte.erreur.type',
  emplacement: 'page.compte.erreur.emplacement',
  emplacementCourt: 'page.compte.erreur.emplacementCourt',
  rayon: 'page.compte.erreur.rayon',
  texte: 'page.compte.erreur.texte',
  refus: 'page.compte.erreur.refus',
  migration: 'tableau.etat.migrationTexte',
}

const LIBELLES_TYPE = {
  physique: 'page.compte.type.physique',
  en_ligne: 'page.compte.type.enLigne',
  mixte: 'page.compte.type.mixte',
}

/** Un champ texte de la fiche : même gabarit pour les onze. */
function Champ({ nom, etiquette, aide, ...reste }) {
  return (
    <label className={LIBELLE}>
      <span className="opacity-75">{etiquette}</span>
      <input name={nom} className={CHAMP} {...reste} />
      {aide ? <span className="uc-aide">{aide}</span> : null}
    </label>
  )
}

export default async function PageCompte({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { etat } = await searchParams
  const lecture = await ficheDuCommerce()
  /* La barre d'onglets est **mesurée sur cette page aussi** (`c01-settings.html`,
     onglet courant « Paramètres ») : elle n'est pas un ajout de `/billing`.
     `/donnees-clients` n'est pas rendu — ni page, ni capture. */
  const entete = (
    <>
      <EntetePage titre={t('page.compte.titre')} />
      <OngletsCompte chemin="/settings" locale={locale} />
    </>
  )

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0011_fiche_etablissement.sql puis migrations/0017_proximite_coordonnees.sql"
        />
      </>
    )
  }

  if (lecture.etat === 'absent') {
    return (
      <>
        {entete}
        <EtatBloque titre={t('page.compte.aucunTitre')} texte={t('page.compte.aucunTexte')} />
        <p className="mt-3">
          <Link href="/rewards" className="uc-btn uc-btn-primary uc-btn-sm">
            {t('page.compte.aucunLien')}
          </Link>
        </p>
      </>
    )
  }

  if (lecture.etat !== 'ok') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.illisibleTitre')}
          texte={
            lecture.etat === 'refuse' ? t('tableau.rpc.inconnu') : t('tableau.rpc.indisponible')
          }
        />
      </>
    )
  }

  const fiche = lireFiche(lecture.donnees)

  /* La couverture affichée est calculée, pas recopiée : même fonction que le
     chunk mesuré, donc le plafond s'applique au lieu d'être écrit ici. */
  const couverture = couvertureM(fiche.rayon)

  return (
    <>
      {entete}

      <section className="uc-card uc-bloc uc-carte-pad">
        {etat === 'ok' ? (
          <p role="status" className="rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t('page.compte.ok')}
          </p>
        ) : null}
        {/* Une branche par valeur écrite par l'action — `etat-action` exige la
            comparaison explicite, pas seulement la table. */}
        {etat === 'nom' ||
        etat === 'type' ||
        etat === 'emplacement' ||
        etat === 'emplacementCourt' ||
        etat === 'rayon' ||
        etat === 'texte' ||
        etat === 'refus' ||
        etat === 'migration' ? (
          <p role="alert" className="rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t(MESSAGES_ERREUR[etat])}
          </p>
        ) : null}

        <form action={enregistrer} className="mt-6 grid gap-6">
          <h2 className="uc-card-title">{t('page.compte.etablissement')}</h2>

          <Champ
            nom="name"
            etiquette={t('page.compte.nom')}
            defaultValue={fiche.nom}
            required
            maxLength={120}
          />

          <label className={LIBELLE}>
            <span className="opacity-75">{t('page.compte.typeActivite')}</span>
            <select name="type_activite" defaultValue={fiche.typeActivite} className={CHAMP}>
              {TYPES_ACTIVITE.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {t(LIBELLES_TYPE[valeur])}
                </option>
              ))}
            </select>
          </label>

          <Champ
            nom="phone"
            etiquette={t('page.compte.phone')}
            dir="ltr"
            type="tel"
            placeholder={t('page.compte.exemple.phone')}
            defaultValue={fiche.phone}
          />
          <Champ
            nom="city"
            etiquette={t('page.compte.city')}
            placeholder={t('page.compte.exemple.city')}
            defaultValue={fiche.city}
          />
          <Champ
            nom="address"
            etiquette={t('page.compte.address')}
            placeholder={t('page.compte.exemple.address')}
            defaultValue={fiche.address}
          />
          <Champ
            nom="description"
            etiquette={t('page.compte.description')}
            placeholder={t('page.compte.exemple.description')}
            defaultValue={fiche.description}
          />

          <div className="grid gap-3">
            <p className="uc-card-title">{t('page.compte.liens')}</p>
            <p className="uc-aide">{t('page.compte.liensAide')}</p>
            <Champ
              nom="site_url"
              etiquette={t('page.compte.site')}
              placeholder={t('page.compte.exemple.site')}
              defaultValue={fiche.siteUrl}
            />
            <Champ
              nom="reservation_url"
              etiquette={t('page.compte.reservation')}
              placeholder={t('page.compte.exemple.reservation')}
              defaultValue={fiche.reservationUrl}
            />
            <Champ
              nom="instagram_url"
              etiquette={t('page.compte.instagram')}
              placeholder={t('page.compte.exemple.instagram')}
              defaultValue={fiche.instagramUrl}
            />
            <Champ
              nom="facebook_url"
              etiquette={t('page.compte.facebook')}
              placeholder={t('page.compte.exemple.facebook')}
              defaultValue={fiche.facebookUrl}
            />
            <Champ
              nom="tiktok_url"
              etiquette={t('page.compte.tiktok')}
              placeholder={t('page.compte.exemple.tiktok')}
              defaultValue={fiche.tiktokUrl}
            />
          </div>

          <h2 className="uc-card-title">{t('page.compte.proximite')}</h2>
          <p className="uc-aide">{t('page.compte.proximiteAide')}</p>

          <Champ
            nom="lien_localisation"
            etiquette={t('page.compte.emplacement')}
            placeholder={t('page.compte.exemple.emplacement')}
            aide={t('page.compte.emplacementAide')}
            type="text"
            defaultValue={fiche.lienLocalisation}
          />
          <Champ
            nom="geofence_radius_m"
            etiquette={t('page.compte.rayon')}
            placeholder={t('page.compte.exemple.rayon')}
            aide={
              <>
                {t('page.compte.rayonAide1')}
                <strong>{t('page.compte.couverture', { metres: couverture })}</strong>
                {t('page.compte.rayonAide2')}
              </>
            }
            type="number"
            min="50"
            max="2000"
            step="50"
            inputMode="numeric"
            defaultValue={fiche.rayon}
          />
          <Champ
            nom="geofence_texte"
            etiquette={t('page.compte.texte')}
            placeholder={t('page.compte.exemple.texte')}
            aide={t('page.compte.texteAide', { commerce: fiche.nom })}
            maxLength={120}
            defaultValue={fiche.texte}
          />

          <button type="submit" className="uc-btn uc-btn-primary h-11">
            {t('page.compte.action')}
          </button>
        </form>
      </section>
    </>
  )
}

