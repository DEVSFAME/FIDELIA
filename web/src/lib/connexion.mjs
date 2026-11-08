/* ============================================================================
   Écran de connexion — le `?etat=` que la garde du tableau de bord produit.

   **Le défaut que ce module ferme.** `(dashboard)/dashboard/layout.jsx` redirige
   vers `/login?etat=configuration` quand le client Supabase ne peut pas être
   construit (variables absentes ou invalides). La page de connexion, elle, ne
   lisait pas ce paramètre : un producteur sans consommateur. C'est la **même
   famille** que le `?echec=` de `/forgot-password` avant `/auth/confirm` —
   une valeur qu'on écrit dans une URL et que personne n'affiche.

   **Pourquoi le couplage n'est pas vérifié ici par une constante partagée.**
   Le test (`tools/rea/tests/etat-connexion.test.mjs`) **lit le littéral** dans
   le fichier du producteur et l'injecte dans `messageEtat`. Exporter un
   `ETAT_CONFIGURATION` que le producteur importerait rendrait le test
   tautologique : les deux côtés porteraient la même valeur, juste ou fausse,
   et le vérificateur ne mesurerait que lui-même (c'est le §24.2 de
   `lesson-learned.md`). Le producteur reste donc un littéral, et le test le lit.

   **Le message est un état d'écran, pas une page d'erreur.** La page de
   connexion reste servie — avec son formulaire — et le bandeau s'ajoute.
   Deux conséquences :

   1. il est rendu en `role="status"`, pas en `role="alert"` : il est là au
      chargement, il ne répond à aucun geste, et une annonce assertive à chaque
      ouverture d'écran est un bruit, pas une information. L'échec **d'action**
      (`auth.erreurConfiguration`, rendu par le formulaire quand
      `signInWithPassword` n'a pas pu être appelé) reste une alerte : celui-là
      répond à un clic ;
   2. sa copie **ne nomme aucune variable d'environnement**. `auth.erreurConfiguration`
      cite `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` parce
      qu'elle s'adresse à qui installe le projet ; ce bandeau-ci s'adresse au
      commerçant qui vient se connecter. Nommer des variables à l'écran, c'est
      lui demander de réparer ce qu'il ne peut pas réparer.
   ========================================================================== */

/**
 * Clé de dictionnaire à afficher pour une valeur de `?etat=`, ou `null` si elle
 * est inconnue.
 *
 * `null` est le défaut **volontaire** : une URL se modifie à la main, et
 * recopier une valeur inconnue à l'écran serait le défaut qu'on vient de
 * fermer, en sens inverse. Deux valeurs ont un texte, et deux seulement :
 *
 *   - `configuration` — produite par la garde du tableau de bord quand le client
 *     Supabase ne peut pas être construit ;
 *   - `reprise` — produite par le proxy quand une soumission ne pouvait aboutir
 *     (mesure du 2026-11-09 : `POST /` ⇒ 400 muet ⇒ page d'erreur Chrome). La
 *     copie réutilise `auth.connexion.champsVides` : après ce détour les champs
 *     sont réellement vides, donc la phrase est vraie. Aucune copie inventée —
 *     la cible n'a pas d'écran pour ce cas.
 *
 * @param {string|null|undefined} valeur
 * @returns {string|null} clé de dictionnaire
 */
export function messageEtat(valeur) {
  switch (valeur) {
    case 'configuration':
      return 'auth.connexion.etatConfiguration'
    case 'reprise':
      return 'auth.connexion.champsVides'
    default:
      return null
  }
}
