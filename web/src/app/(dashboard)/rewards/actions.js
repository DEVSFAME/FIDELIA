'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enregistrerProgramme } from '@/lib/donnees.mjs'
import {
  creditsParEuroValide,
  normaliserSlug,
  refusPaliers,
  slugValide,
  TYPE_PROGRAMME,
} from '@/lib/programme.mjs'

/**
 * Crée ou remplace le programme et ses paliers.
 *
 * Le formulaire est **sans JavaScript** : `action={enregistrer}` posé sur un
 * `<form>` suffit, et la validation se fait ici, côté serveur — un `required`
 * HTML ne protège de rien (il se retire en trois clics).
 *
 * Les paliers viennent de quatre lignes fixes plutôt que d'une liste
 * dynamique : ajouter une ligne demande du JavaScript, et le formulaire doit
 * rester utilisable sur le téléphone d'une caisse, hors réseau. Quatre paliers,
 * c'est le nombre mesuré sur la page publique de la cible.
 *
 * `redirect()` est **hors** du `try` : il lève une exception interne à Next, et
 * l'attraper produirait un succès silencieux suivi d'un formulaire figé.
 */
export async function enregistrer(donnees) {
  const slug = normaliserSlug(donnees.get('slug'))
  const nom = String(donnees.get('nom') ?? '').trim()
  const seuil = Number(donnees.get('seuil'))

  /* Le taux de conversion — « crédits par euro ».
     `Number('')` vaut `0`, d'où le `creditsParEuroValide` qui refuse 0 comme
     `NaN` : un champ vidé n'est pas « 0 point par euro », c'est une saisie
     incomplète, et l'accepter aurait mis le programme à zéro point par euro en
     silence. La virgule décimale (`1,5`) donne `NaN` : elle est refusée avec le
     même message, qui dit la plage acceptée. */
  const creditsParEuro = Number(donnees.get('credits'))

  const paliers = []
  for (let rang = 1; rang <= 4; rang += 1) {
    const libelle = String(donnees.get(`libelle${rang}`) ?? '').trim()
    const cout = Number(donnees.get(`cout${rang}`))
    if (libelle === '' && !cout) continue
    paliers.push({
      libelle,
      description: String(donnees.get(`description${rang}`) ?? '').trim() || null,
      cout: Number.isInteger(cout) ? cout : Math.trunc(cout || 0),
    })
  }

  // Validation locale d'abord : elle donne un message précis sans aller-retour,
  // et reproduit exactement les contraintes de la fonction SQL.
  if (!slugValide(slug)) redirect('/rewards?etat=slug')
  if (!Number.isInteger(seuil) || seuil <= 0) redirect('/rewards?etat=seuil')
  if (!creditsParEuroValide(creditsParEuro)) redirect('/rewards?etat=credits')
  const refus = refusPaliers(paliers)
  if (refus.length > 0) redirect(`/rewards?etat=paliers`)

  /* L'unité n'est pas lue dans le formulaire : elle est fixée par le module.
     La lire ferait entrer dans la base une valeur choisie par un `select` que
     personne ne consomme — le défaut que cette passe a retiré de l'écran. */
  const resultat = await enregistrerProgramme({
    slug,
    nom,
    seuil,
    type: TYPE_PROGRAMME,
    paliers,
    creditsParEuro,
  })

  if (resultat.etat === 'ok') {
    revalidatePath('/rewards')
    revalidatePath('/qrcode')
    redirect('/rewards?etat=ok')
  }

  redirect(`/rewards?etat=${resultat.etat === 'nonMigre' ? 'migration' : 'refus'}`)
}
