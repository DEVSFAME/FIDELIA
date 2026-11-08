/* ============================================================================
   Mot de passe oublié — ce qui est **mesuré** dans le bundle de la cible, rangé
   à part pour être testable sans Next.

   Deux éléments, l'un de comportement, l'autre de conformité :

   1. `?echec=` — la page de la cible lit trois valeurs dans l'URL et affiche
      trois phrases distinctes (`_next_static_chunks_app__auth__forgot-password_page-…js`,
      objet `{expire, appareil, invalide}`). Ces valeurs sont produites par
      `/auth/confirm` (`lib/confirmation.mjs` → `destinationEchec`) ; elles ne
      l'étaient pas avant cette route, et le couplage producteur→affichage est
      désormais vérifié par `tools/rea/tests/confirmation.test.mjs`. C'est
      écrit ici pour que personne ne prenne la correspondance pour du code
      mort : `messageEchec` est le seul consommateur du contrat.

   2. `REFERENCE_CNDP` — la cible versionne le consentement (`cndp-2026-10`).
      C'est **sa** déclaration, pas la nôtre. La valeur est reprise pour que le
      formulaire reste isofonctionnel, et elle doit être remplacée par la
      référence réelle du clone **avant toute mise en production** : inscrire
      une déclaration qu'on n'a pas déposée est une fausse déclaration de
      conformité, pas un détail de configuration.
   ========================================================================== */

/**
 * Message à afficher pour une valeur de `?echec=`, ou `null` si elle est
 * inconnue (une URL se modifie à la main ; on n'affiche pas l'inconnu).
 * @param {string|null|undefined} valeur
 * @returns {string|null} clé de dictionnaire
 */
export function messageEchec(valeur) {
  switch (valeur) {
    case 'expire':
      return 'auth.oubli.echecExpire'
    case 'appareil':
      return 'auth.oubli.echecAppareil'
    case 'invalide':
      return 'auth.oubli.echecInvalide'
    default:
      return null
  }
}

/** Version du consentement jointe à `user_metadata` (mesurée : `cndp-2026-10`).
 *  ⚠️ Référence de la **cible** — à remplacer avant production. */
export const REFERENCE_CNDP = 'cndp-2026-10'

/** Clés `user_metadata` écrites à l'inscription — relevées dans le bundle :
 *  `full_name`, `phone`, `consentement_cndp_le`, `consentement_cndp_version`.
 *  Ce ne sont pas des colonnes : les sept tables mesurées n'en portent aucune,
 *  et en inventer une contredirait `basal-knowledge.md` §3. */
export const CHAMPS_METADONNEES = Object.freeze([
  'full_name',
  'phone',
  'consentement_cndp_le',
  'consentement_cndp_version',
])
