/* ============================================================================
   Équipe — ce que rend `equipe_du_commerce()` (migration 0007)

   Mesuré sur la capture authentifiée de `/caisses`
   (`_captures/2026-10-26-auth/rendu/a09-caisses.html`) :

     h1   « Équipe »
     deux portées   « Caisses employé » · « Responsables »
     h3   « Classement de l'équipe »
     quatre périodes  « 7 jours » · « 30 jours » · « Depuis le début » ·
                      « Un jour précis »
     sept `th`  « # | Caissier | Cartes | Scans | points | CA | Avis »
     ligne  trophée (`lucide-trophy`) · « Titulaire » + « Vous » ·
            « 0 » · « 1 » · « 8 » · « 40 € » · « 0 »

   Trois choses que la capture dit et que ce module **ne refait pas** :

     1. **L'ordre.** La fonction impose un ordre total (points, CA, scans,
        cartes, titulaire d'abord à égalité, prénom, id) — `0007` le documente.
        L'écran ne retrie donc rien : il numérote ce qu'il reçoit. Un tri local
        ferait diverger l'écran et la fonction au premier changement de règle,
        sans que rien ne le signale.
     2. **Les définitions.** « Cartes » compte des **clients**, « Scans » des
        transactions, « CA » une somme de montants : ce module ne décide d'aucun
        de ces trois chiffres, il les met en forme.
     3. **« Avis » n'a aucune table.** La fonction rend `null` **et** déclare
        l'absence (`absences: ["avis"]`). `0` serait un fait inventé — la
        capture, elle, affiche « 0 » parce que la cible a une table d'avis. Cet
        écart est **déclaré**, pas corrigé en silence (`docs/design-system.md`
        §3).

   Une forme inattendue rend `null` : l'écran affiche alors « Réponse
   inattendue », jamais une équipe vide. C'est exactement la distinction que
   `EtatBloque` existe pour porter — une lecture ratée et une équipe sans caisse
   n'ont pas le même remède.
   ========================================================================== */

import { formaterMontant, formaterNombre } from './tableau.mjs'

/** Période par défaut : celle de la fonction (`p_periode default`). */
export const PERIODE_PAR_DEFAUT = 'depuis_le_debut'

/* Le vocabulaire est **fermé**, et c'est celui de `0007` : la fonction refuse
   tout le reste (`PERIODE_INCONNUE`). Les quatre libellés sont ceux de la
   capture, dans son ordre d'affichage. */
export const PERIODES = Object.freeze([
  Object.freeze({ cle: '7j', copie: 'page.equipe.periode7j' }),
  Object.freeze({ cle: '30j', copie: 'page.equipe.periode30j' }),
  Object.freeze({ cle: 'depuis_le_debut', copie: 'page.equipe.periodeDepuis' }),
  Object.freeze({ cle: 'jour', copie: 'page.equipe.periodeJour' }),
])

/* Les deux portées mesurées, et les deux seules valeurs de `staff.role`
   (`0006` : `check (role in ('caisse', 'responsable'))`). Un troisième rôle
   serait une valeur que l'écran ne sait pas afficher, dans une colonne qu'il
   filtre. */
export const PORTEES = Object.freeze([
  Object.freeze({ cle: 'caisse', copie: 'page.equipe.porteeCaisse' }),
  Object.freeze({ cle: 'responsable', copie: 'page.equipe.porteeResponsable' }),
])

export const PORTEE_PAR_DEFAUT = 'caisse'

/** Les deux rôles du modèle — `null` pour le titulaire, qui n'en est pas un. */
const ROLES = Object.freeze(['caisse', 'responsable'])

/** Vrai si la clé de période est celle qu'attend la fonction. */
export function estPeriode(valeur) {
  return PERIODES.some((p) => p.cle === valeur)
}

/** Vrai si la clé de portée est l'une des deux valeurs de `staff.role`. */
export function estPortee(valeur) {
  return PORTEES.some((p) => p.cle === valeur)
}

/**
 * Vrai si la valeur est un jour au format que `<input type="date">` produit et
 * que PostgreSQL lit sans ambiguïté (`AAAA-MM-JJ`).
 *
 * La forme **et** le calendrier sont vérifiés : `2026-02-31` a la bonne forme et
 * n'existe pas. Sans ce second contrôle, la fonction recevrait une date
 * fabriquée par le navigateur au lieu d'un jour choisi.
 *
 * @param {unknown} valeur
 */
export function jourValide(valeur) {
  if (typeof valeur !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false
  const date = new Date(`${valeur}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false
  // Aller-retour : `2026-02-31` devient « 3 mars », donc l'aller-retour échoue.
  return date.toISOString().slice(0, 10) === valeur
}

/** Entier positif attendu, ou `null`. */
function entier(valeur) {
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : null
}

/** Nombre (entier ou décimal) attendu, ou `null`. */
function nombre(valeur) {
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null
}

/** Lit le bloc `periode` rendu par la fonction, et rend `null` s'il est illisible. */
function lirePeriode(bloc) {
  if (!bloc || typeof bloc !== 'object') return null
  if (!estPeriode(bloc.cle)) return null
  if (typeof bloc.fuseau !== 'string' || bloc.fuseau.trim() === '') return null
  const texte = (v) => (typeof v === 'string' && v !== '' ? v : null)
  return {
    cle: bloc.cle,
    debut: texte(bloc.debut),
    fin: texte(bloc.fin),
    // `jour` n'a de sens que pour la clé `jour` : la fonction rend `null`
    // partout ailleurs, et un jour sur une autre période serait un contresens.
    jour: bloc.cle === 'jour' && jourValide(bloc.jour) ? bloc.jour : null,
    fuseau: bloc.fuseau.trim(),
  }
}

/**
 * Lit le classement rendu par `equipe_du_commerce()` et le met en forme.
 *
 * @param {unknown} donnees
 * @returns {null | {
 *   periode: {cle: string, debut: string|null, fin: string|null, jour: string|null, fuseau: string},
 *   devise: string|null,
 *   lignes: Array<{cle: string, rang: number, titulaire: boolean, prenom: string,
 *     role: string|null, actif: boolean, cartes: number, scans: number, points: number,
 *     ca: number, avis: number|null,
 *     affichage: {cartes: string, scans: string, points: string, ca: string, avis: string|null}}>,
 *   absences: string[],
 * }} `null` si la forme n'est pas celle que la fonction promet.
 */
export function lireEquipe(donnees) {
  if (!donnees || typeof donnees !== 'object') return null

  const periode = lirePeriode(donnees.periode)
  if (!periode) return null

  // La fonction rend **toujours** au moins le titulaire : une liste vide n'est
  // pas « une équipe sans caisse », c'est une réponse qui n'a pas eu lieu.
  if (!Array.isArray(donnees.lignes) || donnees.lignes.length === 0) return null

  const devise =
    typeof donnees.devise === 'string' && donnees.devise !== '' ? donnees.devise : null

  if (donnees.absences !== undefined && !Array.isArray(donnees.absences)) return null
  const absences = (donnees.absences ?? []).filter((a) => typeof a === 'string')

  const lignes = []
  let avisAbsent = false

  for (const ligne of donnees.lignes) {
    if (!ligne || typeof ligne !== 'object') return null
    if (typeof ligne.actif !== 'boolean') return null

    // Le titulaire est **une ligne**, pas un rôle : `staff_id` nul (`0007`).
    const titulaire = ligne.staff_id === null
    if (!titulaire && typeof ligne.staff_id !== 'string') return null

    const cartes = entier(ligne.cartes)
    const scans = entier(ligne.scans)
    const points = entier(ligne.points)
    const ca = nombre(ligne.ca)
    if (cartes === null || scans === null || points === null || ca === null) return null

    if (titulaire) {
      // Le titulaire n'est pas une caisse : il ne porte pas de rôle de caisse.
      if (ligne.role !== null && ligne.role !== undefined) return null
      if (ligne.prenom !== null && ligne.prenom !== undefined) {
        if (typeof ligne.prenom !== 'string') return null
      }
    } else {
      if (!ROLES.includes(ligne.role)) return null
      if (typeof ligne.prenom !== 'string' || ligne.prenom.trim() === '') return null
    }

    const avis = ligne.avis === null ? null : entier(ligne.avis)
    if (avis === null) avisAbsent = true
    else if (!Number.isInteger(ligne.avis)) return null

    lignes.push({
      cle: titulaire ? 'titulaire' : ligne.staff_id,
      rang: lignes.length + 1,
      titulaire,
      prenom: titulaire ? '' : ligne.prenom.trim(),
      role: titulaire ? null : ligne.role,
      actif: ligne.actif,
      cartes,
      scans,
      points,
      ca,
      avis,
      affichage: {
        cartes: formaterNombre(cartes),
        scans: formaterNombre(scans),
        points: formaterNombre(points),
        ca: formaterMontant(ca, devise),
        avis: avis === null ? null : formaterNombre(avis),
      },
    })
  }

  // Une absence affichée sans être déclarée serait un tiret muet : l'écran ne
  // pourrait pas dire **pourquoi** la valeur manque. On refuse la réponse.
  if (avisAbsent && !absences.includes('avis')) return null

  return { periode, devise, lignes, absences }
}

/**
 * Les caisses **actives** d'une portée, dans l'ordre du classement.
 *
 * Trois exclusions, chacune mesurable :
 *   - le titulaire n'a pas de `staff_id` : ce n'est pas une caisse ;
 *   - une caisse désactivée reste au classement (désactiver n'efface pas son
 *     histoire) mais n'est plus « une caisse active » ;
 *   - le rôle filtre la portée choisie.
 *
 * @param {ReturnType<typeof lireEquipe>['lignes']} lignes
 * @param {string} portee
 */
export function caissesActivesDe(lignes, portee = PORTEE_PAR_DEFAUT) {
  if (!Array.isArray(lignes)) return []
  return lignes.filter((l) => !l.titulaire && l.actif && l.role === portee)
}
