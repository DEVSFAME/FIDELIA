import Link from 'next/link'
import { headers } from 'next/headers'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { origineDepuisEntetes } from '@/lib/confirmation.mjs'
import { programmeDuCommerce } from '@/lib/donnees.mjs'
import { urlAdhesion } from '@/lib/qr.mjs'
import { EntetePage } from '@/components/tableau/EntetePage'
import { EtatBloque } from '@/components/tableau/EtatBloque'
import { QrCode } from '@/components/tableau/QrCode'
import { BoutonImpression } from '@/components/tableau/BoutonImpression'

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('page.qrcode.titre') }
}

/* Module 1 — QR code.
 *
 * Ce que le QR encode, exactement : l'URL d'adhésion `/join/<slug>`, forme
 * mesurée sur la cible (27 slugs publics dans `sitemap.xml`). Pas un lien de
 * carte, pas un identifiant de commerce : c'est la page que le client final
 * ouvre pour obtenir sa carte, et le seul objet que le commerçant imprime.
 *
 * L'origine vient de la requête et non d'un domaine en dur : `marque.domaine`
 * est toujours une dette non arbitrée, et un QR imprimé avec un domaine
 * provisoire est un QR mort collé sur un comptoir.
 *
 * Sans programme, il n'y a pas de slug, donc pas d'URL : la page le dit et
 * renvoie vers l'écran Programme, au lieu d'afficher un QR qui mènerait à une
 * page inexistante.
 *
 * MISE EN PAGE (2026-11-01)
 * -------------------------
 * L'écran sert à produire un **objet physique**. La forme suit donc la feuille :
 * une affiche blanche (contraste du QR, ce que verra le téléphone), puis, à
 * droite sur grand écran, ce qu'il faut pour comprendre et décider — l'adresse
 * encodée, la règle de contraste, et le chemin vers la modification du
 * programme. Sur mobile, l'affiche vient d'abord : c'est ce qu'on imprime.
 */
export default async function PageQrCode() {
  const locale = await localeRequete()
  const { t } = pour(locale)
  const programme = await programmeDuCommerce()

  const entete = (
    <EntetePage
      surtitre={t('page.qrcode.surtitre')}
      titre={t('page.qrcode.titre')}
      actions={<BoutonImpression>{t('page.qrcode.imprimer')}</BoutonImpression>}
    />
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

  if (programme.etat !== 'ok') {
    return (
      <>
        {entete}
        <EtatBloque titre={t('page.qrcode.aucunTitre')} texte={t('page.qrcode.aucunTexte')} />
        <p className="uc-bloc mt-4">
          <Link href="/rewards" className="uc-btn uc-btn-primary">
            {t('page.qrcode.creer')}
          </Link>
        </p>
      </>
    )
  }

  const origine = origineDepuisEntetes(await headers())
  const url = origine ? urlAdhesion(origine, programme.donnees.slug) : null


  return (
    <>
      {entete}

      <div className="uc-grille">
        <section className="uc-card uc-bloc uc-carte-pad">
          <p className="uc-card-sub">{t('page.qrcode.resume')}</p>

          {url ? (
            /* Une affiche, pas une vignette : fond blanc, marque en tête, et
               l'adresse écrite sous le code. C'est la feuille qui sera collée
               au comptoir — si elle ne se suffit pas à elle-même, il faudra
               l'expliquer à chaque client. Le cadre pointillé marque le format
               à découper, et disparaît à l'impression (`.uc-affiche`). */
            <div className="uc-affiche mt-4">
              <span className="uc-affiche-marque">{t('marque.nom')}</span>
              <QrCode texte={url} taille={232} legende={t('page.qrcode.legende')} />
              <span className="uc-affiche-lien">{url}</span>
              <p className="uc-affiche-note">{t('page.qrcode.afficheNote')}</p>
            </div>
          ) : (
            <p className="uc-bloc-texte mt-4">{t('tableau.etat.origineInconnue')}</p>
          )}
        </section>

        <aside className="uc-card uc-bloc uc-carte-pad">
          <h2 className="uc-card-title">{t('page.qrcode.affiche')}</h2>

          {url ? (
            <div className="uc-filet-haut mt-3 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
                {t('page.qrcode.lien')}
              </p>
              <p className="mt-2 break-all font-mono text-sm opacity-90">{url}</p>
            </div>
          ) : null}

          <p className="uc-aide mt-4">{t('page.qrcode.aide')}</p>

          <p className="uc-filet-haut mt-4 pt-3">
            <Link href="/rewards" className="uc-btn uc-btn-ghost uc-btn-sm">
              {t('page.qrcode.creer')}
            </Link>
          </p>
        </aside>
      </div>
    </>
  )
}
