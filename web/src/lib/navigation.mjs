/* ============================================================================
   Navigation du tableau de bord — modèle **pur**, sans Next ni JSX.

   Pourquoi un module et pas des `<Link>` écrits dans la barre : `BarreTableau`
   portait une seule entrée, parce qu'une seule route existait. Exposer neuf
   liens vers neuf routes absentes aurait produit neuf 404 et un menu qui ment —
   c'est exactement le défaut déjà livré une fois (`<link href="/register">`).
   Le test `i18n-ui` interdit désormais tout `href` interne orphelin.

   D'où cet ordre : **la page d'abord, le lien ensuite**. Ce module est la seule
   liste ; la barre le lit, et `navigation.test.mjs` vérifie que chaque `href`
   correspond à une page réellement présente sur le disque.

   ---------------------------------------------------------------------------
   SOURCE DES `href` — mesurée, pas déduite
   ---------------------------------------------------------------------------
   `01_REA_Fidelix/_captures/2026-10-26-auth/rendu/a01-dashboard.html`
   (dashboard rendu, session réelle). Les ancres du menu y sont, dans cet ordre :

       /dashboard      « Accueil »
       /customers      « Clients »
       /rewards        « Programme »
       /notifications  « Messages »
       /reviews        « Avis Google »
       /caisses        « Équipe »
       /qrcode         « QR Code »
       /branding       « Apparence »
       /settings       « Mon compte »        <- P0-2 (route livrée le 2026-11-02)
       /scan           « Scanner un client » <- action mise en avant
       /billing        « Voir l'abonnement » <- hors périmètre R2

   Deux écarts avec la cible, tous deux déclarés dans `docs/design-system.md` §3 :

     - **Accueil passe en tête.** La cible place « Scanner un client » avant
       « Accueil » dans son rail vertical ; notre barre est horizontale, et un
       menu qui commence par une action plutôt que par son point d'entrée se lit
       mal dans ce sens de lecture.
     - **`/caisse` entre dans la navigation du dashboard.** La cible en fait une
       PWA séparée (manifeste propre, `scope: /caisse`), donc absente de ce menu.
       R2 doit la livrer comme page ; la séparation en PWA est un travail de R3
       (`manifest.json`, `theme_color`, hors-ligne) et non une décision d'ici.
       Le libellé `tableau.nav.caisse` existait déjà au dictionnaire.
   ========================================================================== */

/**
 * @typedef {object} EntreeNavigation
 * @property {string} cle   clé i18n du libellé
 * @property {string} href  route mesurée (ou déclarée, cf. en-tête)
 */

/** Les entrées, dans l'ordre d'affichage. Accueil d'abord, puis les 10 mesurées. */
export const ENTREES = Object.freeze([
  { cle: 'tableau.nav.titre', href: '/dashboard' },
  { cle: 'tableau.nav.scanner', href: '/scan' },
  { cle: 'tableau.nav.clients', href: '/customers' },
  { cle: 'tableau.nav.programme', href: '/rewards' },
  { cle: 'tableau.nav.messages', href: '/notifications' },
  { cle: 'tableau.nav.avis', href: '/reviews' },
  { cle: 'tableau.nav.equipe', href: '/caisses' },
  { cle: 'tableau.nav.qrcode', href: '/qrcode' },
  { cle: 'tableau.nav.apparence', href: '/branding' },
  { cle: 'tableau.nav.compte', href: '/settings' },
  { cle: 'tableau.nav.caisse', href: '/caisse' },
])

/**
 * Vrai si `chemin` désigne `href` ou l'un de ses descendants.
 *
 * Le piège est le préfixe nu : `/clients-archives` ne doit pas allumer
 * « Clients ». On compare donc sur une **frontière de segment**.
 *
 * @param {string} chemin chemin courant (`/dashboard`, `/customers/<uuid>`)
 * @param {string} href   entrée de navigation
 */
export function estActif(chemin, href) {
  if (typeof chemin !== 'string' || typeof href !== 'string') return false
  const c = chemin.length > 1 ? chemin.replace(/\/+$/, '') : '/'
  const h = href.length > 1 ? href.replace(/\/+$/, '') : '/'
  if (h === '/') return c === '/'
  return c === h || c.startsWith(`${h}/`)
}

/* ---------------------------------------------------------------------------
   Les onglets de la section « Programme »
   ---------------------------------------------------------------------------
   Mesuré deux fois, et de la même façon :

       `_captures/2026-11-02-a6/rendu/a02-program.html`   (page `/program`)
       `_captures/2026-11-02-a6/rendu/a03-rewards.html`   (page `/rewards`)

   Les deux pages portent la **même** barre à deux onglets, juste sous le `h1` :

       <a href="/rewards">Récompenses</a>
       <a href="/program" aria-current="page">Règles</a>

   Le rail, lui, garde « Programme » → `/rewards` : `/program` n'est pas une
   destination du rail, c'est le second onglet de la section. D'où une liste
   distincte au lieu d'une onzième `ENTREES` — une entrée de plus aurait changé
   le nombre d'icônes du dock pour une route que la cible n'y met pas.
*/
export const ONGLETS_PROGRAMME = Object.freeze([
  { cle: 'tableau.programme.ongletRecompenses', href: '/rewards' },
  { cle: 'tableau.programme.ongletRegles', href: '/program' },
])

/* ---------------------------------------------------------------------------
   Les onglets du groupe « Mon compte » — mesurés sur les deux pages
   ---------------------------------------------------------------------------
   `c01-settings.html:31855` et `c02-billing.html:31965` portent la **même**
   barre, juste sous un `h1` caché en mobile qui vaut « Mon compte ». Trois
   liens, dans cet ordre : `Paramètres` → `/settings` (courant sur la première),
   `Abonnement` → `/billing` (courant sur la seconde), et `Données clients` →
   `/donnees-clients`.

   Deux seulement sont reprises : `/donnees-clients` n'a **ni page ni capture**
   de son contenu (l'écran existe dans la cible, il n'a jamais été ouvert). Un
   troisième onglet vers une route absente serait exactement le lien mort que ce
   module et `navigation.test.mjs` existent pour empêcher — la dette est donc
   bornée et déclarée plutôt que cliquable.
*/
export const ONGLETS_COMPTE = Object.freeze([
  { cle: 'page.abonnement.ongletParametres', href: '/settings' },
  { cle: 'page.abonnement.ongletAbonnement', href: '/billing' },
])

/** Les routes que la navigation promet. Sert au test « aucun lien mort ». */
export function routesPromises() {
  /* Dédoublonné, et ce n'est pas cosmétique : `/rewards` est à la fois une
     entrée du rail (`tableau.nav.programme`) et l'onglet « Récompenses » ; de
     même `/settings` est une entrée du rail **et** l'onglet « Paramètres ». Le
     test qui compare la taille de l'ensemble au nombre de promesses compte des
     **routes**, pas des liens : une route promise deux fois reste une route. */
  return [
    ...new Set([
      ...ENTREES.map((entree) => entree.href),
      ...ONGLETS_PROGRAMME.map((onglet) => onglet.href),
      ...ONGLETS_COMPTE.map((onglet) => onglet.href),
    ]),
  ]
}

/* ---------------------------------------------------------------------------
   Répartition mobile — quelles entrées tiennent dans la barre basse
   ---------------------------------------------------------------------------
   Dix entrées ne tiennent pas dans une barre de 375 px : cinq colonnes est le
   maximum lisible (une cible tactile de 44 px fait déjà 75 px de large sur un
   iPhone SE). On garde donc les **quatre destinations quotidiennes** en bas, et
   tout le reste derrière « Plus » — sans jamais retirer une destination : la
   somme des deux listes doit redonner `ENTREES` en entier, et
   `navigation.test.mjs` le vérifie.

   L'ordre suit `ENTREES`, pas cet ordre de priorité : la barre se lit de la
   même façon que le dock.
*/
const PRIORITAIRES_MOBILE = Object.freeze(['/dashboard', '/scan', '/customers', '/rewards'])

export const ENTREES_MOBILE = Object.freeze(
  ENTREES.filter((entree) => PRIORITAIRES_MOBILE.includes(entree.href))
)

export const ENTREES_PLUS = Object.freeze(
  ENTREES.filter((entree) => !PRIORITAIRES_MOBILE.includes(entree.href))
)

