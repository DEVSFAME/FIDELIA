/* L'état « on ne peut pas encore » — distinct d'une erreur et distinct d'un vide.
 *
 * Trois causes possibles, trois textes différents, une seule règle : ne jamais
 * afficher « aucun client » quand la vérité est « la lecture est interdite » ou
 * « la fonction n'existe pas ». C'est la même faute que le « 0 » inventé, avec
 * un cran de plus : elle ferait chercher le problème du mauvais côté.
 *
 * `commande` n'est pas décoratif : quand une migration manque, on affiche son
 * **nom de fichier** pour que la personne sache quoi exécuter, au lieu d'un
 * « contactez l'administrateur » qui ne dit rien.
 *
 * Matériau : une carte Unicity, et un liseré d'avertissement à gauche — le seul
 * endroit où la couleur porte un sens sans mot : « ceci n'est pas une donnée ».
 */
export function EtatBloque({ titre, texte, commande }) {
  return (
    <section className="uc-card uc-bloc uc-bloc-alerte">
      <div className="uc-card-corps">
        <p className="uc-bloc-titre">{titre}</p>
        <p className="uc-bloc-texte">{texte}</p>
        {commande ? <code className="uc-bloc-commande">{commande}</code> : null}
      </div>
    </section>
  )
}

