/* En-tête commun aux pages du tableau de bord.

   Les libellés sont passés **en clair** (`titre`, `surtitre`) et non par une clé
   préfixée ici : `i18n-ui` balaie les sources à la recherche d'appels de
   traduction **à argument littéral**. Composer la clé depuis ce composant
   rendrait les neuf titres invisibles au test — une faute de frappe ne serait
   plus détectée qu'à l'affichage.

   Matériau : celui d'Unicity (`uc-page-*`), pas une classe écrite à la main.
   Le titre n'est plus en capitales Impact : Unicity titre en bas de casse, avec
   un interlettrage serré, et une salutation manuscrite au-dessus.
*/
export function EntetePage({ surtitre, titre, actions = null }) {
  return (
    <header className="uc-page-tete">
      <div>
        {surtitre ? <p className="uc-page-sur">{surtitre}</p> : null}
        <h1 className="uc-page-titre">{titre}</h1>
      </div>
      {actions}
    </header>
  )
}

/* Le corps d'une page non encore alimentée par une RPC de lecture.
 *
 * Trois informations, et pas une de plus :
 *   - `resume` : ce que la page fera ;
 *   - `source` : d'où viendront les données, **tel que mesuré** sur la cible ;
 *   - `vide`   : l'état réel aujourd'hui.
 *
 * Aucun chiffre n'est affiché. « 0 client » se lirait comme un fait mesuré
 * alors que la table est vide *et* la lecture non branchée : deux raisons
 * différentes de ne rien montrer, qu'un zéro confondrait.
 */
export function EtatPage({ resume, source, vide, ariaLabel }) {
  return (
    <section className="uc-card uc-bloc">
      <div className="uc-card-corps">
        <p className="uc-bloc-texte">{resume}</p>
        <p className="uc-bloc-commande" aria-label={ariaLabel}>
          {source}
        </p>
        <p className="uc-bloc-rang">{vide}</p>
      </div>
    </section>
  )
}

