import { CODE_EXEMPLE, POINTS_EXEMPLE, emojiDeType, urlImageValide } from '@/lib/apparence.mjs'

/* Aperçu de la carte — la seule promesse de l'écran, et elle doit être tenue.
 *
 * Ce qui est **réel** ici : le nom, la couleur, l'icône (logo ou emoji du type)
 * et l'image de fond, tous relus depuis l'état du formulaire — la frappe met
 * l'aperçu à jour sans aller-retour, comme sur la cible (« apparaît aussitôt
 * sur la carte »).
 *
 * Ce qui est un **exemple**, et que la légende dit : le code client (`C-4F2A91`
 * mesuré), les 120 points, et le mois de départ. Aucune carte n'existe encore
 * pour ce commerce au moment où l'on règle son apparence ; afficher des valeurs
 * lues d'un client réel demanderait de choisir lequel, et ce choix serait une
 * invention.
 *
 * `<img>` et non `next/image` : l'adresse est saisie par le commerçant, donc
 * aucun hôte ne peut être déclaré dans `images.remotePatterns`. Le jour où
 * l'envoi de fichier existera, les images viendront de notre stockage et
 * `next/image` redeviendra possible.
 */
export function ApercuCarte({ apparence, recompense, depuis, t }) {
  const { nom, couleur, type, logo, image } = apparence
  const imageSure = urlImageValide(image) && image !== '' ? image : ''
  const logoSur = urlImageValide(logo) && logo !== '' ? logo : ''

  return (
    <section className="uc-card uc-bloc" aria-label={t('page.apparence.apercuTitre')}>
      <div className="uc-card-corps">
        <div
          className="apercu-carte"
          style={{ '--apercu-teinte': couleur }}
          data-testid="apercu-carte"
        >
          <div
            className="apercu-haut"
            style={imageSure ? { backgroundImage: `url(${imageSure})` } : undefined}
          >
            <span className="apercu-voile" aria-hidden="true" />
            <div className="apercu-marque">
              {logoSur ? (
                <img className="apercu-logo" src={logoSur} alt="" />
              ) : (
                <span className="apercu-icone" aria-hidden="true">
                  {emojiDeType(type)}
                </span>
              )}
            </div>
            <div>
              <p className="apercu-nom">{nom === '' ? t('page.apparence.nom') : nom}</p>
              {imageSure ? null : (
                <p className="apercu-sans-image">{t('page.apparence.imageAjouter')}</p>
              )}
            </div>
          </div>

          <dl className="apercu-lignes">
            <div className="apercu-ligne">
              <dt className="apercu-cle">{t('page.apparence.apercuRecompense')}</dt>
              <dd className="apercu-val">
                {recompense ?? t('page.apparence.apercuSansRecompense')}
              </dd>
            </div>
            <div className="apercu-ligne">
              <dt className="apercu-cle">{t('page.apparence.apercuCode')}</dt>
              <dd className="apercu-val">{CODE_EXEMPLE}</dd>
            </div>
            <div className="apercu-ligne">
              <dt className="apercu-cle">{t('page.apparence.apercuPoints')}</dt>
              <dd className="apercu-val">{POINTS_EXEMPLE}</dd>
            </div>
            <div className="apercu-ligne">
              <dt className="apercu-cle">{t('page.apparence.apercuDepuis')}</dt>
              <dd className="apercu-val">{depuis}</dd>
            </div>
          </dl>
        </div>
        <p className="uc-aide">{t('page.apparence.apercuLegende')}</p>
      </div>
    </section>
  )
}
