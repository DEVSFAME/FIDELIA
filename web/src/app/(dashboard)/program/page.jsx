import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { reglagesDuCommerce } from '@/lib/donnees.mjs'
import {
  DEVISES,
  TRANCHE,
  formaterPointsParTranche,
  lireReglages,
  pointsDepuisMontant,
} from '@/lib/programme.mjs'
import { formaterMontant, symboleDevise } from '@/lib/tableau.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { OngletsProgramme } from '@/components/tableau/OngletsProgramme'
import { IconeEclair } from '@/components/unicity/Icones'
import { enregistrer } from './actions.js'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  /* « Règles », pas « Programme » : `/rewards` porte déjà ce titre, et deux
     pages qui annoncent le même nom dans l'onglet du navigateur sont
     indiscernables. Le `h1`, lui, reste « Programme » — c'est ce que la cible
     affiche sur les deux pages (mesuré). */
  return { title: t('page.programme.regles.metaTitre') }
}

/* Page `/program` — l'onglet « Règles » de la section Programme (écart P0-1).
 *
 * PROJECTION MESURÉE. `_captures/2026-11-02-a6/rendu/a02-program.html` :
 *   h1 « Programme », deux onglets (« Récompenses » → `/rewards`, « Règles »
 *   actif), une carte « Configuration » et **sept** réglages, puis
 *   l'énoncé « Enregistrer ». Les `name` des contrôles sont ceux de la cible,
 *   au caractère près — c'est ce qui permet à `reglages-programme.test.mjs` de
 *   confronter le formulaire à la capture au lieu de le confronter à lui-même.
 *
 * CE QUE L'ÉCRAN N'AFFICHE PAS, ET POURQUOI (déclaré dans `design-system.md` §3)
 *   - « Demander sur WhatsApp » : le lien mesuré porte le numéro du support de
 *     **la cible**. Reprendre un lien qui n'est pas le nôtre enverrait les
 *     commerçants chez quelqu'un d'autre. « Trouver mon Place ID » (documentation
 *     publique de Google) est repris, lui, sans réserve.
 *   - les `<b>` de la dernière phrase : une chaîne du dictionnaire n'a pas de
 *     balises, et découper une phrase mesurée en trois clés la rendrait
 *     intraduisible.
 *
 * L'EXEMPLE CHIFFRÉ est calculé **côté serveur**, avec le barème enregistré —
 * « Un ticket de 250 € créditera 50 points » quand le taux est de 2 points par
 * tranche. Il se met à jour au premier rechargement qui suit l'enregistrement,
 * pas à la frappe : le formulaire reste sans JavaScript, comme celui de
 * `/rewards`, pour rester utilisable depuis le téléphone d'une caisse.
 */
const CHAMPS_CLASS = 'uc-champ'

/** Le ticket d'exemple : celui de la capture (« Un ticket de 250 € … »). */
const MONTANT_EXEMPLE = 250

/* Clés **littérales** : une clé construite par gabarit échappe au balayage
   d'`i18n-ui`, donc une faute de frappe ne se verrait qu'à l'affichage. */
const MESSAGES_ERREUR = {
  devise: 'page.programme.regles.erreur.devise',
  points: 'page.programme.regles.erreur.points',
  minimum: 'page.programme.regles.erreur.minimum',
  expiration: 'page.programme.regles.erreur.expiration',
  parrainage: 'page.programme.regles.erreur.parrainage',
  avisPoints: 'page.programme.regles.erreur.avisPoints',
  avisActif: 'page.programme.regles.erreur.avisActif',
  avisLien: 'page.programme.regles.erreur.avisLien',
  avisSansLien: 'page.programme.regles.erreur.avisSansLien',
  refus: 'page.programme.regles.erreur.refus',
  /* `migration` : l'action écrit `?etat=migration` quand
     `enregistrer_reglages_programme` est absente de la base. La clé est celle
     d'`EtatBloque` — une seconde copie ferait diverger la phrase selon le
     chemin emprunté. */
  migration: 'tableau.etat.migrationTexte',
}

/** Le libellé d'une devise : deux clés distinctes, un seul `{symbole}`. */
function libelleDevise(t, code) {
  if (code === 'MAD') return t('page.programme.regles.deviseMAD')
  return t('page.programme.regles.deviseEUR', { symbole: symboleDevise(code) })
}

export default async function PageRegles({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { etat } = await searchParams
  const lecture = await reglagesDuCommerce()

  const entete = (
    <>
      <EntetePage titre={t('page.programme.titre')} />
      <OngletsProgramme chemin="/program" locale={locale} />
    </>
  )

  /* Trois causes de ne rien pouvoir régler, trois textes — c'est la règle
     d'`EtatBloque` : « aucun programme » ne se dit pas comme « la migration
     manque », et aucun des deux ne se dit « la base ne répond pas ». */
  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0010_reglages_programme.sql"
        />
      </>
    )
  }

  if (lecture.etat === 'absent') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('page.programme.regles.aucunTitre')}
          texte={t('page.programme.regles.aucunTexte')}
        />
        <p className="mt-3">
          <Link href="/rewards" className="uc-btn uc-btn-primary uc-btn-sm">
            {t('page.programme.regles.aucunLien')}
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

  const reglages = lireReglages(lecture.donnees)
  const symbole = symboleDevise(reglages.devise)
  const exemple = pointsDepuisMontant(MONTANT_EXEMPLE, reglages.creditsParEuro)

  return (
    <>
      {entete}

      <section className="uc-card uc-bloc uc-carte-pad">
        <h2 className="uc-card-title flex items-center gap-2">
          <IconeEclair className="h-4 w-4" />
          {t('page.programme.regles.configuration')}
        </h2>

        {etat === 'ok' ? (
          <p role="status" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t('page.programme.regles.ok')}
          </p>
        ) : null}
        {/* Neuf refus possibles, **nommés un par un** : le test `etat-action`
            exige que chaque `?etat=` écrit par l'action ait sa branche ici, et
            il a raison — une table seule (`MESSAGES_ERREUR[etat]`) laisserait
            passer une valeur que rien ne rend. */}
        {etat === 'devise' ||
        etat === 'points' ||
        etat === 'minimum' ||
        etat === 'expiration' ||
        etat === 'parrainage' ||
        etat === 'avisPoints' ||
        etat === 'avisActif' ||
        etat === 'avisLien' ||
        etat === 'avisSansLien' ||
        etat === 'refus' ||
        etat === 'migration' ? (
          <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t(MESSAGES_ERREUR[etat])}
          </p>
        ) : null}

        <form action={enregistrer} className="mt-6 grid gap-6">

          {/* 1. La devise — deux boutons radio, pas un `<select>` : la cible en
              montre deux côte à côte, et un menu déroulant cacherait la moitié
              du choix derrière un clic de plus. */}
          <fieldset className="uc-choix-grille">
            <legend className="uc-choix-legende">{t('page.programme.regles.devise')}</legend>
            {DEVISES.map((code) => (
              <label key={code} className="uc-choix">
                <input
                  type="radio"
                  name="devise"
                  value={code}
                  defaultChecked={reglages.devise === code}
                  required
                />
                <span className="uc-choix-corps">
                  <span className="uc-choix-titre">{libelleDevise(t, code)}</span>
                </span>
              </label>
            ))}
            <p className="uc-aide">{t('page.programme.regles.deviseAide')}</p>
          </fieldset>

          {/* 2. Le barème. `step="0.1"` et non `step="0.01"` (écart déclaré) :
              la base garde deux décimales de taux **par euro**, donc un pas de
              0,01 point par tranche produirait un arrondi silencieux. */}
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">
              {t('page.programme.regles.points', { tranche: TRANCHE, symbole })}
            </span>
            <input
              name="points_per_purchase"
              type="number"
              step="0.1"
              min="0.1"
              max="10000"
              inputMode="decimal"
              defaultValue={formaterPointsParTranche(reglages.creditsParEuro)}
              required
              className={CHAMPS_CLASS}
            />
            <span className="uc-aide font-normal">
              {t('page.programme.regles.pointsAide', { tranche: TRANCHE, symbole })}
            </span>
          </label>

          {/* 3. L'achat minimum, et l'exemple calculé qui le rend concret. */}
          <div className="grid gap-1.5">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.programme.regles.minimum', { symbole })}</span>
              <input
                name="min_purchase_mad"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={reglages.minimum}
                className={CHAMPS_CLASS}
              />
            </label>
            <p className="uc-aide">{t('page.programme.regles.minimumAide')}</p>
            <p className="uc-aide">
              {t('page.programme.regles.minimumExemple', {
                montant: formaterMontant(MONTANT_EXEMPLE, reglages.devise),
                points: exemple,
              })}
            </p>
          </div>

          {/* 4. Le cashback — la phrase mesurée est **dans** le libellé, comme
              sur la cible : c'est le seul endroit où le commerçant lit ce que
              ce mode change en caisse. */}
          <label className="uc-choix">
            <input type="checkbox" name="deduction_libre" defaultChecked={reglages.cashback} />
            <span className="uc-choix-corps">
              <span className="uc-choix-titre">{t('page.programme.regles.cashback')}</span>
              <span className="uc-choix-desc">
                {t('page.programme.regles.cashbackAide', { symbole })}
              </span>
            </span>
          </label>

          {/* 5. L'expiration. `0` est une valeur, pas un vide : la colonne a
              `default 0`, et l'écran écrit « 0 = jamais » dans son libellé. */}
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.programme.regles.expiration')}</span>
            <input
              name="points_expiry_days"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={reglages.expiration}
              className={CHAMPS_CLASS}
            />
          </label>

          {/* 6. Le parrainage. */}
          <div className="grid gap-1.5">
            <p className="uc-card-title">{t('page.programme.regles.parrainage')}</p>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.programme.regles.parrainageChamp')}</span>
              <input
                name="referral_reward"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder={t('page.programme.regles.parrainageVide')}
                defaultValue={reglages.parrainage}
                className={CHAMPS_CLASS}
              />
            </label>
            <p className="uc-aide">{t('page.programme.regles.parrainageAide')}</p>
          </div>


          {/* 7. Le bonus d'avis — trois contrôles, un seul réglage.
              L'activation, les points et le lien : `refusReglages` refuse un
              bonus activé qui n'accorde rien, ou que le client ne peut pas
              réclamer faute de lien. */}
          <div className="grid gap-3">
            <p className="uc-card-title">{t('page.programme.regles.avis')}</p>

            <label className="uc-choix">
              <input
                type="checkbox"
                name="review_reward_enabled"
                defaultChecked={reglages.avisActif}
              />
              <span className="uc-choix-corps">
                <span className="uc-choix-titre">{t('page.programme.regles.avisActiver')}</span>
              </span>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.programme.regles.avisPoints')}</span>
              <input
                name="review_reward"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder={t('page.programme.regles.avisPointsVide')}
                defaultValue={reglages.avisPoints}
                className={CHAMPS_CLASS}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.programme.regles.avisLien')}</span>
              <input
                name="google_review_url"
                type="url"
                dir="ltr"
                placeholder={t('page.programme.regles.avisLienGabarit')}
                defaultValue={reglages.avisLien}
                className={CHAMPS_CLASS}
              />
            </label>

            <p className="uc-aide">
              {t('page.programme.regles.avisLienAide')}{' '}
              <a
                href="https://developers.google.com/maps/documentation/places/web-service/place-id?hl=fr"
                target="_blank"
                rel="noopener noreferrer"
                className="uc-card-link"
              >
                {t('page.programme.regles.avisTrouver')}
              </a>
            </p>
            <p className="uc-aide">{t('page.programme.regles.avisNote')}</p>
          </div>

          <button type="submit" className="uc-btn uc-btn-primary h-11">
            {t('page.programme.regles.action')}
          </button>
        </form>
      </section>
    </>
  )
}

