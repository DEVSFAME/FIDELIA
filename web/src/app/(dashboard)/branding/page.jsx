import Link from 'next/link'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { apparenceDuCommerce, programmeDuCommerce } from '@/lib/donnees.mjs'
import { lireApparence, moisAnnee, recompenseDuMenu } from '@/lib/apparence.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { EditeurApparence } from '@/components/apparence/EditeurApparence'

/* Page `/branding` — module Apparence (écart P0-5 du plan de parité, `0015`).
 *
 * Projection mesurée : `_captures/2026-11-02-a6/rendu/a08-branding.html` (200)
 * et son chunk. Ce que la cible y met, dans l'ordre : `h1` « Apparence » (sur
 * « Votre DA »), la phrase « Tout ce que vous changez ici apparaît aussitôt… »,
 * l'aperçu de la carte, puis trois sections et un seul bouton « Enregistrer ».
 *
 * CE QUI N'EST PAS RENDU, ET POURQUOI
 * -----------------------------------
 *   - **l'envoi de fichier** (`POST /api/branding/upload`) : il demande un
 *     espace de stockage et une clé de service, tous deux absents du socle. Le
 *     champ attend donc une **adresse** d'image, et l'écran le dit deux fois
 *     (sous le champ, et dans la légende de l'aperçu) ;
 *   - **la section « 4 · Tampons par carte »** (`stamps_total`, `stamp_icon`) et
 *     le choix « Les tampons / Votre photo » (`style_bandeau`) : la cible ne les
 *     rend que pour un programme à tampons, et aucun écran d'ici n'en dessine —
 *     la caisse crédite des points. **Décision produit du 2026-11-02 : refusés,
 *     pas reportés** (dette `P0-6b` close) ; `/rewards` ne propose plus l'unité,
 *     et l'écrit (`page.programme.unitePoints`) ;
 *   - **l'aperçu « Apple Wallet »** : la légende de la cible dit « Aperçu réel
 *     du pass Apple Wallet ». Ici, aucune classe PassKit n'existe (P0-5 Wallet
 *     est en attente côté Apple) — la légende ne promet donc que ce que la page
 *     fait : un aperçu dont seuls le nom, le logo, le type et la couleur sont
 *     réels, et elle nomme les valeurs d'exemple.
 */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.apparence.titre') }
}

export default async function PageApparence() {
  const locale = await localeRequete()
  const { t } = pour(locale)

  const entete = (
    <EntetePage surtitre={t('page.apparence.surtitre')} titre={t('page.apparence.titre')} />
  )

  const lecture = await apparenceDuCommerce()

  if (lecture.etat === 'nonMigre' || lecture.etat === 'configuration') {
    return (
      <>
        {entete}
        <EtatBloque
          titre={t('tableau.etat.migrationTitre')}
          texte={t('tableau.etat.migrationTexte')}
          commande="migrations/0015_apparence.sql"
        />
      </>
    )
  }

  if (lecture.etat === 'absent') {
    return (
      <>
        {entete}
        <EtatBloque titre={t('page.apparence.aucunTitre')} texte={t('page.apparence.aucunTexte')} />
        <p className="mt-3">
          <Link href="/program" className="uc-btn uc-btn-primary uc-btn-sm">
            {t('page.apparence.aucunLien')}
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
          texte={lecture.etat === 'refuse' ? t('tableau.rpc.inconnu') : t('tableau.rpc.indisponible')}
        />
      </>
    )
  }

  const apparence = lireApparence(lecture.donnees)
  const programme = await programmeDuCommerce()
  const recompense =
    programme.etat === 'ok' ? recompenseDuMenu(programme.donnees?.paliers) : null

  return (
    <>
      {entete}
      <p className="uc-bloc-texte">{t('page.apparence.chapeau')}</p>
      <EditeurApparence
        apparence={apparence}
        recompense={recompense}
        depuis={moisAnnee()}
        locale={locale}
      />
    </>
  )
}

