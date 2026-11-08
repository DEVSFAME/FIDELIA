/* ============================================================================
   Jeu d'icônes du dock — SVG inline, aucune dépendance.

   Pourquoi pas une bibliothèque : le dépôt n'en embarque aucune, et ajouter
   `lucide-react` pour quinze traits de 22 px ferait entrer un paquet entier
   dans une image qu'on vient de rendre plus légère.

   Règles communes, portées par `Icone` : `viewBox 0 0 24 24`, trait de 1,7 px,
   bouts arrondis, `stroke="currentColor"` — donc la couleur vient du CSS
   (`color`), jamais du composant. `aria-hidden` : ces icônes doublent toujours
   un libellé lisible ; les annoncer ferait dire deux fois la même chose.

   `ICONE_PAR_ROUTE` est la seule table de correspondance : une entrée de
   `lib/navigation.mjs` sans icône retombe sur `IconePoint`, visiblement
   générique — un oubli se voit, il ne casse pas la page.
   ========================================================================== */

function Icone({ children, ...reste }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...reste}
    >
      {children}
    </svg>
  )
}

/** Accueil — `/dashboard`. */
export function IconeAccueil(props) {
  return (
    <Icone {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Icone>
  )
}

/** Scanner — `/scan`. */
export function IconeScan(props) {
  return (
    <Icone {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Icone>
  )
}

/** Clients — `/customers`. */
export function IconeClients(props) {
  return (
    <Icone {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icone>
  )
}

/** Programme — `/rewards`. */
export function IconeCadeau(props) {
  return (
    <Icone {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 1 1 0 5" />
    </Icone>
  )
}

/** Messages — `/notifications`. */
export function IconeCloche(props) {
  return (
    <Icone {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Icone>
  )
}

/** Avis Google — `/reviews`. */
export function IconeEtoile(props) {
  return (
    <Icone {...props}>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </Icone>
  )
}

/** Équipe — `/caisses`. */
export function IconeEquipe(props) {
  return (
    <Icone {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20v-1.4A5.6 5.6 0 0 1 8.1 13h1.8a5.6 5.6 0 0 1 5.6 5.6V20" />
      <path d="M17 5.3a3.2 3.2 0 0 1 0 6.1" />
      <path d="M18.5 13.4A5.6 5.6 0 0 1 21.5 18.6V20" />
    </Icone>
  )
}

/* Trophée du premier rang — la colonne `#` de `/caisses`.
 *
 * Ce n'est pas une icône inventée : la cible dessine `lucide-trophy` dans
 * cette cellule (mesuré, `a09-caisses.html`, `text-amber-500`). Les tracés
 * ci-dessous sont les siens, au trait près.
 *
 * Elle ne remplace pas le rang : le composant ajoute le nombre en `.uc-sr`.
 * Une icône seule ne s'annonce pas, et « premier » est une information, pas
 * une décoration. */
export function IconeTrophee(props) {
  return (
    <Icone {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </Icone>
  )
}

/** QR Code — `/qrcode`. */
export function IconeQr(props) {
  return (
    <Icone {...props}>
      <rect x="3" y="3" width="6.5" height="6.5" rx="1" />
      <rect x="14.5" y="3" width="6.5" height="6.5" rx="1" />
      <rect x="3" y="14.5" width="6.5" height="6.5" rx="1" />
      <path d="M14.5 14.5h2.5v2.5h-2.5z" />
      <path d="M20 14.5h1M14.5 20h1M18 18h3v3h-3z" />
    </Icone>
  )
}

/** Apparence — `/branding`. */
export function IconePalette(props) {
  return (
    <Icone {...props}>
      <path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 9 9 0 0 0-9-9z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </Icone>
  )
}

/** Mon compte — `/settings`. */
export function IconeCompte(props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1" />
    </Icone>
  )
}

/** Caisse — `/caisse` (action de terrain, hors dock horizontal). */
export function IconeCaisse(props) {
  return (
    <Icone {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 15h3" />
    </Icone>
  )
}

/** Le « plus » de la barre mobile. */
export function IconePlus(props) {
  return (
    <Icone {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icone>
  )
}

/** Le repli : une entrée sans icône déclarée. */
export function IconePoint(props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="8" />
    </Icone>
  )
}

/* ---- Icônes des titres de carte ----------------------------------------- */

/* L'éclair qui marque « Configuration » sur la page Règles. Géométrie **relevée**
   dans la capture (`_captures/2026-11-02-a6/rendu/a02-program.html`,
   `<svg class="lucide lucide-zap w-4 h-4 text-coral">`) : le tracé est repris
   tel quel, seule la couleur vient d'ici (le `text-coral` de la cible
   appartenait à la peau « verre », retirée). */
export function IconeEclair(props) {
  return (
    <Icone {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Icone>
  )
}

/* ---- Icônes des indicateurs (pastille + filigrane) ---- */

/* Clients : **le même dessin** que le dock, exporté sous un autre nom pour que
   le tableau de bord et la navigation ne puissent pas diverger. */
export { IconeClients as IconeIndClients }

/** Visites — un repère de lieu : on passe. */
export function IconeIndVisites(props) {
  return (
    <Icone {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </Icone>
  )
}

/** Reviennent — une flèche qui revient sur elle-même. */
export function IconeIndReviennent(props) {
  return (
    <Icone {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v5h5" />
    </Icone>
  )
}

/** Chiffre d'affaires — un billet. */
export function IconeIndCa(props) {
  return (
    <Icone {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Icone>
  )
}

/** Recherche — la loupe de la barre haute. */
export function IconeRecherche(props) {
  return (
    <Icone {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icone>
  )
}

/** Une flèche vers la droite — les raccourcis de carte. */
export function IconeFleche(props) {
  return (
    <Icone {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icone>
  )
}

/** Sortie — la déconnexion. */
export function IconeSortie(props) {
  return (
    <Icone {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icone>
  )
}

/* ---------------------------------------------------------------------------
   Table route -> icône. Une seule correspondance pour le dock **et** la barre
   mobile : les deux ne peuvent pas afficher deux symboles différents pour la
   même destination.
   ------------------------------------------------------------------------ */
export const ICONE_PAR_ROUTE = Object.freeze({
  '/dashboard': IconeAccueil,
  '/scan': IconeScan,
  '/customers': IconeClients,
  '/rewards': IconeCadeau,
  '/notifications': IconeCloche,
  '/reviews': IconeEtoile,
  '/caisses': IconeEquipe,
  '/qrcode': IconeQr,
  '/branding': IconePalette,
  '/settings': IconeCompte,
  '/caisse': IconeCaisse,
})

/** Rend l'icône d'une route, ou le repli. */
export function iconeDe(href) {
  return ICONE_PAR_ROUTE[href] ?? IconePoint
}
