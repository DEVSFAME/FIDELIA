'use server'

import { revalidatePath } from 'next/cache'

import { enregistrerApparence } from '@/lib/donnees.mjs'
import { apparenceDepuisFormulaire, refusApparence } from '@/lib/apparence.mjs'

/** Les refus de la base, ramenés au champ qui les a causés. */
const CHAMP_PAR_CODE = {
  INVALID_NAME: 'nom',
  INVALID_COLOR: 'couleur',
  INVALID_COMMERCE_TYPE: 'type',
  INVALID_LOGO_URL: 'logo',
  INVALID_IMAGE_URL: 'image',
}

/**
 * Enregistre l'apparence (`/branding`, écart P0-5 du plan de parité).
 *
 * Rend une **clé** de dictionnaire, jamais une phrase : l'écran est bilingue par
 * construction (`pour(locale)`), et un message écrit ici s'afficherait en
 * français sous `/ar`. C'est la règle de `seConnecter`, reprise telle quelle.
 *
 * Deux validations, la même liste : celle du module pour éviter un aller-retour,
 * celle de `enregistrer_apparence` pour tenir les bornes en base. Si les deux
 * divergent un jour, le code `INVALID_*` sortira et l'écran dira « Réessayez »
 * — raison pour laquelle les quatre codes sont nommés un par un plutôt
 * qu'avalés.
 *
 * Pas de `redirect()` : le formulaire est un composant client
 * (`useActionState`), l'état de succès s'affiche dans la page. Une redirection
 * perdrait la saisie en cas d'erreur de la base, et ferait clignoter l'aperçu.
 */
export async function enregistrer(_etatPrecedent, donnees) {
  const apparence = apparenceDepuisFormulaire(donnees)
  const refus = refusApparence(apparence)

  if (refus.length > 0) return { erreur: refus[0], ok: false }

  const resultat = await enregistrerApparence(apparence)

  if (resultat.etat === 'ok') {
    /* Le nom peut avoir changé : il sert `/join/<slug>`, `/caisse` et `/qrcode`,
       et `enregistrerApparence` a déjà vidé la mémoire du programme. */
    revalidatePath('/branding')
    return { erreur: null, ok: true }
  }

  if (resultat.etat === 'nonMigre' || resultat.etat === 'configuration') {
    return { erreur: 'migration', ok: false }
  }

  return { erreur: CHAMP_PAR_CODE[resultat.code] ?? 'refus', ok: false }
}
