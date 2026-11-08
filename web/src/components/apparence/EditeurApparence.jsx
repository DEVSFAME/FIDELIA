'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { pour } from '@/i18n/index.mjs'
import { COULEURS, TYPES_ETABLISSEMENT } from '@/lib/apparence.mjs'
import { ApercuCarte } from './ApercuCarte'
import { enregistrer } from '@/app/(dashboard)/branding/actions.js'

/* Le formulaire d'apparence — un composant client, et pour une seule raison :
 * l'aperçu doit suivre la frappe. Tout le reste (validation, bornes, écriture)
 * est sur le serveur, comme ailleurs.
 *
 * SANS JAVASCRIPT, le formulaire reste utilisable : les dix types sont des
 * `radio` natifs (un seul coché, coeché par `defaultChecked`), le nuancier est un
 * `input type=color` (il s'envoie tout seul), et les champs texte sont non
 * contrôlés. Ce qui ne marche pas sans JavaScript, ce sont les **raccourcis** :
 * les huit pastilles de couleur et la mise à jour de l'aperçu. L'écran ne
 * prétend pas le contraire : `page.apparence.couleurAide` appelle les huit
 * teintes des « raccourcis » et désigne le nuancier comme le champ.
 */

const CHAMP = 'uc-champ'

/** Un refus = une phrase. Clés **littérales** : une clé composée échapperait à `i18n-ui`. */
const MESSAGES_ERREUR = {
  nom: 'page.apparence.erreur.nom',
  nomLong: 'page.apparence.erreur.nomLong',
  couleur: 'page.apparence.erreur.couleur',
  type: 'page.apparence.erreur.type',
  logo: 'page.apparence.erreur.logo',
  image: 'page.apparence.erreur.image',
  refus: 'page.apparence.erreur.refus',
  migration: 'tableau.etat.migrationTexte',
}

function Bouton({ t }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="uc-btn uc-btn-primary h-11 disabled:opacity-60"
    >
      {pending ? t('page.apparence.actionEnCours') : t('page.apparence.action')}
    </button>
  )
}

export function EditeurApparence({ apparence, recompense, depuis, locale }) {
  const { t } = pour(locale)
  const [etatAction, action] = useActionState(enregistrer, { erreur: null, ok: false })
  const [saisie, setSaisie] = useState(apparence)

  const changer = (champ) => (evenement) =>
    setSaisie((precedent) => ({ ...precedent, [champ]: evenement.target.value }))

  const prenom = saisie.nom === '' ? t('page.apparence.nom') : saisie.nom
  const apercu = { ...saisie, nom: prenom }

  return (
    <form action={action} className="grid gap-6">
      <ApercuCarte apparence={apercu} recompense={recompense} depuis={depuis} t={t} />

      {etatAction.erreur ? (
        <p role="alert" className="rounded-2xl uc-encadre px-4 py-3 text-sm">
          {t(MESSAGES_ERREUR[etatAction.erreur] ?? 'page.apparence.erreur.refus')}
        </p>
      ) : null}
      {etatAction.ok ? (
        <p role="status" className="rounded-2xl uc-encadre px-4 py-3 text-sm">
          {t('page.apparence.enregistre')}
        </p>
      ) : null}

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps grid gap-5">
          <h2 className="uc-card-title">{t('page.apparence.section1')}</h2>

          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.apparence.nom')}</span>
            <input
              name="name"
              className={CHAMP}
              placeholder={t('page.apparence.nomExemple')}
              defaultValue={saisie.nom}
              onChange={changer('nom')}
              required
              minLength={2}
              maxLength={120}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.apparence.logoChamp')}</span>
            <input
              name="logo_url"
              className={CHAMP}
              type="text"
              inputMode="url"
              maxLength={500}
              defaultValue={saisie.logo}
              onChange={changer('logo')}
            />
            <span className="uc-aide font-normal">{t('page.apparence.logoAide')}</span>
            <span className="uc-aide font-normal">{t('page.apparence.envoiAbsent')}</span>
          </label>

          {/* Dix types, dix `radio` : un seul peut être coché, et le groupe se
              comporte comme un `<select>` sans en cacher la moitié. */}
          <fieldset className="uc-choix-grille type-grille">
            <legend className="uc-choix-legende">{t('page.apparence.type')}</legend>
            {TYPES_ETABLISSEMENT.map((type) => (
              <label key={type.valeur} className="uc-choix">
                <input
                  type="radio"
                  name="commerce_type"
                  value={type.valeur}
                  defaultChecked={saisie.type === type.valeur}
                  onChange={() =>
                    setSaisie((precedent) => ({ ...precedent, type: type.valeur }))
                  }
                  required
                />
                <span className="uc-choix-corps">
                  <span className="uc-choix-titre">
                    <span aria-hidden="true">{type.emoji}</span> {t(type.cle)}
                  </span>
                </span>
              </label>
            ))}
            <p className="uc-aide">{t('page.apparence.typeAide')}</p>
          </fieldset>
        </div>
      </section>

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps grid gap-4">
          <h2 className="uc-card-title">{t('page.apparence.section2')}</h2>

          {/* Le champ réel : un nuancier natif. Il s'envoie sans JavaScript, il
              accepte n'importe quelle teinte, et il est lu par tous les
              navigateurs depuis vingt ans. */}
          <div className="teinte-grille">
            <label className="teinte-libre">
              <input
                type="color"
                name="primary_color"
                value={saisie.couleur}
                onChange={changer('couleur')}
                aria-label={t('page.apparence.couleurLibre')}
              />
              <span>{saisie.couleur}</span>
            </label>

            {COULEURS.map((code) => (
              <button
                key={code}
                type="button"
                className="teinte"
                style={{ backgroundColor: code }}
                aria-label={t('page.apparence.couleurAria', { code })}
                aria-pressed={saisie.couleur === code}
                onClick={() => setSaisie((precedent) => ({ ...precedent, couleur: code }))}
              />
            ))}
          </div>
          <p className="uc-aide">{t('page.apparence.couleurAide')}</p>
        </div>
      </section>

      <section className="uc-card uc-bloc">
        <div className="uc-card-corps grid gap-3">
          <h2 className="uc-card-title">{t('page.apparence.section3')}</h2>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span className="opacity-75">{t('page.apparence.imageChamp')}</span>
            <input
              name="wallet_bg_url"
              className={CHAMP}
              type="text"
              inputMode="url"
              maxLength={500}
              defaultValue={saisie.image}
              onChange={changer('image')}
            />
            <span className="uc-aide font-normal">{t('page.apparence.imageAide')}</span>
          </label>
        </div>
      </section>

      <div>
        <Bouton t={t} />
      </div>
    </form>
  )
}
