import { notFound } from 'next/navigation'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { caissesPubliques, programmePublic } from '@/lib/donnees.mjs'
import { lireCaissesPubliques } from '@/lib/adhesion.mjs'
import { codeCarteValide } from '@/lib/carte.mjs'
import { QrCode } from '@/components/tableau/QrCode'
import { ChoixCaisse } from '@/components/adhesion/ChoixCaisse'
import { rejoindreCarte } from './actions.js'


export async function generateMetadata({ params }) {
  const { slug } = await params
  const { t } = pour(await localeRequete())
  const programme = await programmePublic(slug)
  return {
    title: programme.etat === 'ok' ? programme.donnees.nom : t('page.adhesion.titre'),
  }
}

/* Page publique d'adhésion — **cible du QR code**.
 *
 * Elle est volontairement hors du tableau de bord : le client final n'a pas de
 * compte, et lui en demander un au moment où il scanne un QR sur un comptoir
 * ferait perdre la carte. Aucune redirection vers `/login`.
 *
 * Les paliers s'affichent **avant** l'adhésion : c'est l'accroche mesurée
 * (« 45 points = Boisson offerte »), et c'est ce qui donne envie de prendre la
 * carte. Ils restent affichés après, avec le code, pour que le client sache
 * quoi gagner.
 *
 * LE CHOIX DE LA CAISSE (mesuré : `p17-join.html`, `id="qui-vous-a-servi"`)
 *
 * La cible demande « Qui vous a servi ? (facultatif) » avant de délivrer la
 * carte. C'est ce geste qui alimente la colonne « Cartes » de `/caisses` : sans
 * lui, `clients.designated_staff_id` reste nul et le classement affiche **0,
 * exactement et inutilement**.
 *
 * Quatre décisions, toutes lisibles ici :
 *
 *   1. **la liste n'est lue que si elle peut être choisie.** Une page qui
 *      affiche déjà le code n'a rien à proposer : on n'appelle pas la fonction
 *      pour rien ;
 *   2. **rien n'est affiché quand la liste est vide** — et pas de phrase
 *      d'excuse : c'est le comportement mesuré (`A.length>0 &&` dans le chunk).
 *      Une lecture ratée (`nonMigre`, `indisponible`) tombe dans le même cas,
 *      et c'est voulu : le champ est un bonus, son absence ne doit jamais
 *      empêcher une inscription ;
 *   3. **la perte d'une désignation se dit** (`?sansDesignation=1`) : la carte
 *      est créée, la caisse choisie ne l'est pas. Le taire serait un abandon
 *      silencieux d'un choix explicite ;
 *   4. **le champ est un composant client.** Le DOM mesuré est un groupe de
 *      boutons `aria-pressed` — dont le second clic **défait** la sélection —
 *      et cela ne se reproduit pas sans état local. Sans JavaScript, le groupe
 *      est inerte et l'inscription aboutit sans désignation (`0007` la rend
 *      facultative).
 */
export default async function PageAdhesion({ params, searchParams }) {
  const { slug } = await params
  const { carte, etat, sansDesignation } = await searchParams
  const locale = await localeRequete()
  const { t } = pour(locale)
  const programme = await programmePublic(slug)

  if (programme.etat === 'refuse') notFound()

  const code = typeof carte === 'string' && codeCarteValide(carte) ? carte : null

  // `lireCaissesPubliques` rend `[]` (aucune caisse active) ou `null` (réponse
  // d'une autre forme) : les deux n'affichent rien, et la distinction est
  // conservée pour un écran qui saurait, un jour, dire pourquoi.
  const lectureCaisses = code === null ? await caissesPubliques(slug) : null
  const caisses = lectureCaisses ? lireCaissesPubliques(lectureCaisses.donnees) : null
  const proposerCaisses = Array.isArray(caisses) && caisses.length > 0


  if (programme.etat !== 'ok') {
    const migration = programme.etat === 'nonMigre' || programme.etat === 'configuration'
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">{t('page.adhesion.titre')}</h1>
        <p className="mt-3 text-sm leading-relaxed opacity-75">
          {migration ? t('tableau.etat.migrationTexte') : t('page.adhesion.ferme')}
        </p>
        {migration ? (
          <code className="mt-4 block break-words rounded-xl border border-white/15 px-3 py-2 font-mono text-xs opacity-80">
            migrations/0003_r3_programme_join_lecture.sql
          </code>
        ) : null}
      </main>
    )
  }

  const { nom, paliers } = programme.donnees

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
        {t('page.adhesion.surtitre')}
      </p>
      <h1 className="mt-2 font-impact text-4xl leading-tight tracking-tight">{nom}</h1>

      {paliers.length > 0 ? (
        <ol className="mt-8 grid gap-3">
          {paliers.map((palier) => (
            <li
              key={palier.rang}
              className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3"
            >
              <span className="text-sm font-semibold">{palier.libelle}</span>
              <span className="font-mono text-sm opacity-75">{palier.cout} pts</span>
            </li>
          ))}
        </ol>
      ) : null}

      {code ? (
        <section className="mt-10">
          <p className="text-sm font-semibold">{t('page.adhesion.succes')}</p>
          <p className="mt-2 font-impact text-4xl tracking-[0.2em]">{code}</p>
          <p className="mt-2 text-xs opacity-60">{t('page.adhesion.conserver')}</p>
          {/* La carte existe, la caisse choisie n'a pas pu être écrite : on le
              dit ici, à côté du code, et pas dans une page d'échec — il n'y a
              pas eu d'échec. */}
          {sansDesignation === '1' ? (
            <p role="status" className="mt-4 rounded-xl border border-white/15 px-3 py-2 text-xs leading-relaxed">
              {t('page.adhesion.sansDesignation')}
            </p>
          ) : null}
          {/* Le QR encode le **code lui-même**, pas une URL : c'est exactement
              ce que lit le scanner du comptoir. Encoder une URL `/card/<code>`
              aurait exigé une route publique de lecture de carte — un second
              oracle de soldes, pour aucun gain. */}
          <div className="mt-6">
            <QrCode texte={code} taille={180} />
          </div>
        </section>
      ) : (
        <form action={rejoindreCarte} className="mt-10">
          <input type="hidden" name="slug" value={slug} />
          {proposerCaisses ? <ChoixCaisse caisses={caisses} locale={locale} /> : null}
          <button
            type="submit"
            className="mt-6 flex h-[3.25rem] w-full items-center justify-center rounded-xl bg-ink text-base font-bold text-white transition-all active:scale-95"
          >
            {t('page.adhesion.action')}
          </button>
          <p className="mt-3 text-center text-xs opacity-55">{t('page.adhesion.sansDonnees')}</p>
        </form>
      )}


      {etat === 'ferme' ? (
        <p role="alert" className="mt-6 rounded-2xl border border-white/15 px-4 py-3 text-sm">
          {t('page.adhesion.ferme')}
        </p>
      ) : null}
      {etat === 'indisponible' ? (
        <p role="alert" className="mt-6 rounded-2xl border border-white/15 px-4 py-3 text-sm">
          {t('tableau.etat.refus')}
        </p>
      ) : null}
      {etat === 'migration' ? (
        <p role="alert" className="mt-6 rounded-2xl border border-white/15 px-4 py-3 text-sm">
          {t('tableau.etat.migrationTexte')}
        </p>
      ) : null}
    </main>
  )
}
