import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { carteParToken } from '@/lib/donnees.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { formaterTaux } from '@/lib/programme.mjs'
import { normaliserCode } from '@/lib/carte.mjs'
import { nomComplet } from '@/lib/personne.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { JaugePoints } from '@/components/tableau/JaugePoints'
import { CameraScanner } from '@/components/scan/CameraScanner'
import { crediterPoints } from './actions.js'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.scanner.titre') }
}

const CHAMP = 'uc-champ'

/* Module 2 — Scanner un client.
 *
 * Deux temps, tous deux côté serveur : on **identifie** la carte (RPC de
 * lecture), puis on **agit** (RPC `award_loyalty_points`, mesurée). Aucun état
 * local : l'URL porte le code, donc l'écran est rechargeable, partageable et
 * fonctionne sans JavaScript.
 *
 * La caméra est branchée **sans toucher à ce contrat** : `CameraScanner` lit un
 * QR et navigue vers `/scan?code=…`, c'est-à-dire exactement ce que produit la
 * saisie manuelle. Elle ne connaît ni la RPC ni le jeton de session ; si elle
 * échoue (refus, API absente, pas de caméra), elle affiche un état et le champ
 * manuel reste là. `lib/camera.mjs` porte les règles, `scan-camera.test.mjs` les
 * vérifie — aucune caméra n'y est simulée, c'est le contrat qui est mesuré.
 *
 * **`&etat=configuration` est rendu (2026-10-31).** Quand le client Supabase ne
 * peut pas être construit, `crediterPoints` redirige ici avec ce paramètre ; la
 * page ne le lisait pas, et l'écran retombait sur un état vide normal — comme si
 * rien n'avait été tenté. Sa copie est `tableau.etat.configuration`, **pas**
 * `tableau.etat.migrationTexte` : « La base n'est pas encore migrée » serait une
 * cause fausse présentée comme connue (la migration n'est même pas tentée, la
 * requête n'est jamais partie). Rôle ARIA : celui d'une alerte, parce que ce
 * message **répond à la soumission** du formulaire et que le commerçant vient de
 * croire qu'il créditait. Sur `/login`, le même mot est un état présent au
 * chargement, et il y est rendu en `status` — le discriminant est le moment, pas
 * le mot (§26.3). Le couplage est **lu** par `etat-action.test.mjs`.
 */
export default async function PageScanner({ searchParams }) {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const { code = '', etat } = await searchParams
  const jeton = normaliserCode(code)

  /* Deux lectures **indépendantes**, donc menées ensemble.
     Mesure du 2026-11-01 : un aller-retour Supabase coûte 0,55 à 0,81 s ici.
     Les enchaîner coûtait deux fois ce prix pour un écran qui n'a besoin ni de
     l'une avant l'autre : la carte ne sert pas à trouver le barème, et le barème
     ne sert pas à trouver la carte. `Promise.all` ne change que le temps.

     Le barème est lu **même sans carte** : il explique ce que « laisser les
     points vides » produira, et il vient du programme — pas d'une constante de
     l'écran. Un programme absent laisse `1`, la valeur par défaut de la base. */
  const [carte, programme] = await Promise.all([
    jeton ? carteParToken(jeton) : Promise.resolve(null),
    programmeDuCommerce(),
  ])
  const lisible = carte?.etat === 'ok' ? carte.donnees : null
  const taux = formaterTaux(programme.etat === 'ok' ? programme.donnees?.credits_par_euro : 1) || '1'

  const entete = (
    <EntetePage surtitre={t('page.scanner.surtitre')} titre={t('page.scanner.titre')} />
  )

  return (
    <>
      {entete}

      <section className="uc-card uc-bloc uc-carte-pad">
        <CameraScanner locale={locale} />

        <form method="get" className="mt-6 grid gap-3 uc-filet-haut pt-6 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.scanner.champJeton')}</span>
            <input
              name="code"
              defaultValue={code}
              autoComplete="off"
              placeholder="C-AB12CD"
              className={CHAMP}
            />
          </label>
          <button
            type="submit"
            className="mt-auto flex h-[2.75rem] items-center justify-center rounded-xl uc-encadre px-4 text-sm font-bold"
          >
            {t('page.scanner.chercher')}
          </button>
        </form>

        {etat === 'ok' ? (
          <p role="status" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t('page.scanner.ok')}
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
            partie, donc aucun point n'a bougé. C'est la réponse au geste qui
            vient d'être fait (le formulaire a été soumis), d'où l'alerte — et
            non un état d'écran, contrairement au même mot sur `/login`. */}
        {etat === 'configuration' ? (
          <p role="alert" className="mt-4 rounded-2xl uc-encadre px-4 py-3 text-sm">
            {t('tableau.etat.configuration')}
          </p>
        ) : null}
      </section>

      {carte?.etat === 'nonMigre' || carte?.etat === 'configuration' ? (
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0003_r3_programme_join_lecture.sql"
        />
      ) : null}

      {carte?.etat === 'introuvable' ? (
        <EtatBloque titre={t('page.scanner.introuvable')} texte={t('tableau.etat.introuvable')} />
      ) : null}

      {lisible ? (
        <section className="uc-card uc-bloc uc-carte-pad">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
            {t('page.scanner.client')}
          </p>
          <p className="mt-1 font-display text-xl font-semibold">
            {nomComplet(lisible.client, locale) || lisible.card_token}
          </p>

          <div className="mt-6">
            <JaugePoints
              points={lisible.points}
              paliers={lisible.paliers}
              libelleProchain={t('page.scanner.prochain')}
              libelleAucun={t('page.scanner.toutAtteint')}
            />
          </div>

          <form action={crediterPoints} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="jeton" value={lisible.card_token} />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.scanner.champMontant')}</span>
              <input
                name="montant"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
                className={CHAMP}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="opacity-75">{t('page.scanner.champPoints')}</span>
              <input
                name="points"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder={t('page.scanner.pointsAuto')}
                className={CHAMP}
              />
            </label>
            <p className="uc-aide sm:col-span-2">
              {t('page.scanner.taux', { taux })}
            </p>
            <button
              type="submit"
              className="uc-action sm:col-span-2"
            >
              {t('page.scanner.action')}
            </button>
          </form>
        </section>
      ) : null}
    </>
  )
}
