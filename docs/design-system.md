# Design system « verre » — ce qui est mesuré, ce qui est décidé

> **Règle unique :** une valeur s'écrit ici parce qu'elle a été **lue** dans la
> cible, ou parce qu'elle est **déclarée** comme déviation. Il n'existe pas de
> troisième cas. `node tools/rea/verifier-design.mjs` fait respecter cette règle
> et échoue sinon.

## 1. Sources

Deux feuilles de style, servies dans cet ordre (`data-precedence="next"`) :

| Fichier | Rôle | SHA-256 | Taille |
|---|---|---|---|
| `_next_static_css_d34d95ecc21099a8.css` | `@font-face`, `--font-*`, reset | `0532366308774fa0…` | 12 316 o |
| `_next_static_css_0baee74d463a534b.css` | palette, verre, utilitaires (tailwindcss 3.4.19) | `7374ee7821fc8cf…` | 132 499 o |

Les deux vivent dans `01_REA_Fidelix/_captures/2026-10-26/raw/assets/`.

**Les copies d'écran aussi sont mesurées** — les feuilles ne disent rien du
texte. Les trois écrans d'authentification viennent de leurs chunks, dans le
même dossier :

| Chunk | Ce qu'il a donné |
|---|---|
| `_next_static_chunks_app__auth__login_page-fdb96a58c9171993.js` | « BON / RETOUR », « Email professionnel », « Mot de passe oublié ? », « Pas encore de compte ? / Créer un compte », et l'énumération des motifs d'échec qu'on **n'a pas** reprise |
| `_next_static_chunks_app__auth__register_page-624b8d1e8d80be44.js` | « CRÉEZ / VOTRE ESPACE », les six champs, le schéma Zod (donc les messages), les quatre clés de `user_metadata`, le texte CNDP |
| `_next_static_chunks_app__auth__forgot-password_page-c17cec5863baf4b5.js` | « MOT DE PASSE / OUBLIÉ ? », « Envoyer le lien / Envoi… », « Email envoyé », les trois valeurs de `?echec=`, `POST /api/auth/reinitialiser` |
| `_next_static_chunks_app__auth__layout-06d42ad8b90aae00.js` | la coque : `data-skin`, `fond-premium`, filtre SVG, grain — **pas** de carte |

Les chemins d'icônes (œil, flèches, enveloppe cochée, cercle de chargement)
viennent des mêmes chunks : la cible utilise `lucide-react`, dont les tracés
sont recopiés dans `components/auth/Icones.jsx` plutôt que d'ajouter le paquet
pour sept dessins.

**Correction de trajectoire.** La première version du design system ne lisait que
la seconde et affirmait qu'« aucun `.woff2` n'a été capturé ». C'était faux deux
fois : les `@font-face` étaient dans la première feuille, et les 23 binaires
étaient dans le scrape public (`SITE/_next/static/media/`). Le vérificateur ne
pouvait pas le voir, parce que `extraireBlocs()` cherche une accolade à
l'intérieur d'un at-rule : sur `@font-face{font-family:Inter;…}` il n'en trouve
pas et **perdait le bloc en silence**. D'où `extrairePolices()`, qui traite les
`@font-face` comme un ensemble de déclarations et non comme une règle de style.

## 2. Ce qui est transcrit

| Fichier | Contenu | Vérifié |
|---|---|---|
| `web/src/styles/tokens.css` | palette `:root` / `.dark`, modes de contraste, `[data-skin=premium]` | oui |
| `web/src/styles/verre.css` | `.verre`, `.vitre`, `.grain-premium`, `.fond-premium`, `.shadow-*` | oui |
| `web/src/styles/polices.css` | 42 `@font-face`, 10 familles, 23 binaires + `--font-*` | oui (généré) |
| `web/src/styles/nuit.css` | peau bleu nuit du tableau de bord | **déclaré hors ledger** |

`polices.css` et `polices.mjs` sont **générés** :
`node tools/rea/extrait-polices.mjs --ecrire`. Ne pas les éditer : le générateur
échoue si un binaire référencé manque, parce qu'un `@font-face` sans fichier ne
casse rien visiblement — le navigateur retombe sur la police système, et l'écart
ne se voit qu'à l'œil.

Les `--font-*` ne sont **pas** dans `:root` : la cible les déclare sur les
classes `.__variable_*` de `next/font/local`, et c'est `<body>` qui les porte.
`polices.mjs` exporte `CLASSES_POLICES`, consommé par `app/layout.jsx` — aucun
hash n'est codé en dur dans un composant.

## 3. Ce qui est décidé (et déclaré)

`HORS_LEDGER`, dans `tools/rea/verifier-design.mjs` — trois clés, chacune avec sa
raison. Le CLI les affiche en `DÉCLARÉ` ; les retirer de la liste fait échouer la
vérification.

| Clé | Valeur | Pourquoi |
|---|---|---|
| `[data-skin=premium].dark.nuit` `--fond-page` | `#0b1220` | fond bleu nuit (demande produit) |
| `… .verre` `--verre-bord-opacite` | `0.16` | arête lisible sur fond très sombre ; valeur **reprise** du cran `prefers-reduced-transparency` mesuré |
| `… .verre-fort` `--verre-bord-opacite` | `0.16` | idem, densité forte |

Le sélecteur `.nuit` est **distinct** de celui du ledger
(`[data-skin=premium].dark`), donc il ne peut pas écraser une valeur mesurée par
inadvertance. Tout le reste de la peau sombre — opacités, flous, saturation,
ombres, grain, halos — vient de la couche mesurée.

### Placement de `data-skin`

La cible sert `<html lang="fr" data-skin="premium">`. On reproduit ce placement
dans `app/layout.jsx`, et le tableau de bord le répète sur sa coque parce que
`.dark` doit être sur **le même élément** : les sélecteurs mesurés sont composés
(`[data-skin=premium].dark .verre`). Un `.dark` posé sur un descendant ne
déclencherait rien, et l'écran resterait clair sans le moindre message.

### L'encre se recalcule sur la coque, pas sur `body`

`globals.css` déclare `body { color: rgb(var(--ink-rgb)) }`. La couleur est donc
calculée **une fois**, sur `<body>`, avec l'encre de la peau claire
(`22 21 20`). Or notre `.dark` est sur un **élément descendant** — il ne peut pas
être sur `<html>`, que les pages claires partagent — et **rien ne relit
`--ink-rgb` plus bas** : les enfants héritent de la couleur *calculée*, pas de la
variable. À l'écran : du texte presque noir sur le bleu nuit.

D'où, dans `nuit.css`, `color: rgb(var(--ink-rgb))` sur
`[data-skin=premium].dark.nuit`. Ce n'est **pas une valeur nouvelle** — `243 239 236`
est l'encre sombre **mesurée** dans `tokens.css`, et la déclaration est mot pour
mot celle de `body`. Seul le **placement** est décidé. C'est pourquoi elle n'a
pas d'entrée dans `HORS_LEDGER` : le vérificateur ne suit que les propriétés
`--*`, c'est-à-dire les valeurs, pas les héritages à rétablir.

Dans la cible, `.dark` est sur `<html>` et le problème n'existe pas. Il n'existe
ici que parce que le socle doit servir les deux peaux depuis une racine unique.

### Ce qui est décidé pour la copie des écrans alimentés (2026-10-31)

Deux écrans sont désormais servis par une RPC de lecture (`/customers` par
`0004`, `/dashboard` par `0005`). La règle appliquée aux deux : **le libellé est
mesuré dans la capture, jamais composé** — à une exception près, déclarée ici.

| Libellé | Capture | Chez nous | Pourquoi |
|---|---|---|---|
| « CA (€) » | `a01-dashboard.html` | `CA ({devise})` | `loyalty_programs.devise` vaut `MAD` par défaut (mesuré : `column_default`). Recopier le symbole de la cible afficherait une unité fausse sur un programme en dirhams. |

Conséquence testée : `tableau-lecture.test.mjs` cherche « CA (€) » **dans la
capture** (témoin), puis vérifie que la valeur du dictionnaire est le **gabarit**
et qu'aucune valeur du dictionnaire ne contient « € ». Une réintroduction du
symbole fait échouer deux assertions et la mutation M33.

Trois phrases sont **écrites**, pas relevées, et n'ont donc pas de capture à
citer :

| Clé | Contexte |
|---|---|
| `tableau.recentes.vide` | la cible avait une opération ; son état vide n'a jamais été capturé |
| `tableau.illisible` | une réponse illisible ne se capture pas |
| `page.clients.vide` / `.illisible` | idem, côté Clients (déjà déclaré plus haut) |

Les sous-titres, eux, sont **mesurés** et portent les définitions des chiffres :
« +1 ce mois », « 30 derniers jours », « au moins 2 visites », « 30 j ·
total 40 ». C'est ce qui empêche un chiffre de changer de sens sans que la copie
change — et `migration-0005.test.mjs` vérifie que le SQL tient la même
définition (`>= 2`, une seule fenêtre de 30 jours).

### Ce qui est décidé pour l'écran Équipe (2026-11-01)

`/caisses` est servi par `equipe_du_commerce()` (`0007`). La projection suit
`a09-caisses.html` ; trois écarts sont **décidés**, pas subis, et
`caisses-lecture.test.mjs` garde la copie mesurée (témoin dans la capture, puis
égalité du dictionnaire).

| Point | Capture | Chez nous | Pourquoi |
|---|---|---|---|
| « Avis » | `0` | `—` + phrase d'absence déclarée | Aucune table d'avis n'existe ici : `0` serait un fait inventé. `0007` rend `null` **et** déclare `absences: ["avis"]` ; l'écran refuse même une réponse qui afficherait le tiret sans la déclaration (M90). |
| Paragraphe « Les cartes comptent… » | nomme la marque de la cible | même phrase, `{marque}` interpolé | La décision de nommage interdit de réutiliser ce nom. Même mécanisme que `meta.titre`. |
| Colonne `#` | `lucide-trophy` en `text-amber-500` | même tracé, même valeur (`#f59e0b`) + rang en `.uc-sr` | L'icône est **mesurée** ; seul l'ajout du rang annoncé est décidé — une icône seule ne dit pas « premier ». |

Cinq phrases sont **écrites**, sans capture, et déclarées comme telles dans le
dictionnaire (commentaire au-dessus de chaque clé) :

| Clé | Contexte |
|---|---|
| `page.equipe.aucunePortee` | la cible avait zéro caisse : son état vide **filtré** par une portée n'a jamais été rendu |
| `page.equipe.avisAbsent` | aucune source d'avis n'est branchée ; l'absence est déclarée |
| `page.equipe.formulaireAbsent` | « Nouvelle caisse » n'a aucune fonction d'écriture : on dit pourquoi, on n'affiche pas un champ mort |
| `page.equipe.fenetre` / `.fenetreOuverte` | la fenêtre **appliquée** vient de la fonction ; l'écran la répète au lieu de la redéfinir |
| `page.equipe.refusTitre` / `.refus`, `.illisibleTitre` / `.illisible`, `.jourManquantTitre` / `.jourManquant` | les états d'échec d'une lecture ne se capturent pas (même règle que `tableau.illisible`) |

**Deux éléments de la capture ne sont pas rendus, et c'est dit** :

- le **drill-down** (`role="button"` sur chaque ligne, « Touchez une ligne pour
  voir le détail de ses opérations ») — il demande une RPC par caisse que ce
  socle n'a pas. Une ligne cliquable qui ne fait rien est pire qu'une ligne
  inerte : ni l'un ni l'autre n'est affiché ;
- le formulaire **« Nouvelle caisse »** — remplacé par la phrase ci-dessus.

Le titre de section est un `h2` chez nous : la cible écrit `h3` dans sa propre
hiérarchie, et sauter un niveau sous notre `h1` serait un défaut d'accessibilité.

### Ce qui est décidé pour le choix de la caisse (2026-11-01)

`/join/<slug>` demande « Qui vous a servi ? (facultatif) » avant de délivrer la
carte. C'est mesuré (`p17-join.html`, `id="qui-vous-a-servi"` ; chunk
`app_join_[slug]_page-…js`), et c'est ce geste qui alimente la colonne
« Cartes » de `/caisses` — sans lui, `clients.designated_staff_id` reste nul et
le classement affiche **0, exactement et inutilement**.

La forme est reproduite, pas réinventée : `role="group"` +
`aria-labelledby`, boutons `aria-pressed` (donc sélection **défaisable** d'un
second clic, ce qu'un `<input type="radio">` ne sait pas faire), classes de la
capture à la lettre — `min-h-11` (44 px, vérifié compilé en
`min-height: 2.75rem` dans le CSS produit), `rounded-xl border-2 px-3.5
text-sm font-semibold transition-colors`, puis `border-coral bg-coral
text-white` ou `border-ink/10 bg-white text-ink hover:border-coral/40`.

Quatre écarts sont **décidés**, et deux d'entre eux sont des **absences** :

| Point | Capture | Chez nous | Pourquoi |
|---|---|---|---|
| Source de la liste | `staff` du commerce, lue par une page sans session | `caisses_publiques()` (`0009`), `anon` autorisé, **`id` + `prenom` seulement** | `equipe_du_commerce()` donne le prénom **avec** le CA et n'est pas accordée à `anon`. Ouvrir le classement pour dessiner six boutons serait une fuite gratuite. |
| Caisses désactivées | non observable (l'équipe capturée est active) | **non proposées** | Décision : on ne fait pas désigner quelqu'un qui ne sert plus. L'**écriture** continue de les accepter (`0007`) — un onglet resté ouvert ne doit pas coûter sa carte. Montré ⊆ accepté. |
| Ordre | ordre d'insertion, non reproductible ici | ordre **total** (prénom, id) | Un ordre non total fait bouger les boutons d'un appel à l'autre : le client vise une puce qui a changé de place (`lesson-learned` §31.5). |
| Sans JavaScript | la cible est une application cliente | groupe **inerte**, carte créée **sans** désignation | Le champ est un bonus ; son absence ne doit jamais empêcher une inscription (même principe que `0006` avec `not null`). |

Un détail d'élément est **corrigé**, pas copié : la cible pose le libellé sur un
`<label>` **sans `for`**, qui n'étiquette donc aucun contrôle. On garde
l'identifiant (`id="qui-vous-a-servi"`) et le nommage du groupe
(`aria-labelledby`), sur un `<p>` : c'est la même information, portée par un
élément qui ne prétend pas étiqueter un champ. Un test peut casser si la cible
change de balise ; aucun lecteur d'écran ne perd le nom du groupe.

**Deux éléments de la capture ne sont pas repris, et c'est dit** : le champ
**date de naissance** et la case **« conditions d'utilisation »**. Le socle
promet « aucune donnée personnelle n'est collectée » et ne stocke rien qui
pourrait honorer l'un ou l'autre — reprendre le formulaire sans le stockage
serait un champ mort, et le stocker serait une décision de vie privée qu'un
écran ne prend pas.

Une phrase est **écrite**, sans capture (l'état n'a jamais été rendu) :

| Clé | Contexte |
|---|---|
| `page.adhesion.sansDesignation` | la carte est créée, la caisse choisie ne l'est pas (caisse supprimée entre l'affichage et l'envoi). Elle ne promet **aucun** rattrapage : aucune fonction ne redésigne une carte après coup (`lesson-learned` §38). |

### Ce qui est décidé pour les écrans d'authentification (2026-10-30)


`HORS_LEDGER` reste à **trois** entrées, et ce n'est pas un oubli : le
vérificateur ne suit que les propriétés `--*` des feuilles. Une décision qui
porte sur une **classe utilitaires**, une **chaîne** ou un **comportement** ne
peut pas y entrer — elle est donc déclarée ici. Même règle : une raison, ou le
retour au mesuré.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Nom de marque | « Fidelix » partout (`fidelix.ma`, JSON-LD, texte CNDP du bundle, `contact@fidelix.ma`) | **Fidelia**, une seule clé (`marque.nom`) | Le scrape a mesuré **la cible**, pas le clone. `basal-knowledge.md` §14 : « Le nom “Fidelix” et ses marques ne doivent pas être réutilisés dans le clone ». Le domaine de contact `fidelia.ma` est **provisoire** — à arbitrer avant production. |
| Bouton principal | `bg-coral text-white` (`shadow-hard-coral`) | `bg-ink text-white`, sans ombre | `#f94c3a` sur blanc = **3,06:1**, sous le seuil AA (4,5:1) pour du 16 px gras. Même arbitrage que pour l'encre : la lisibilité prime. `.shadow-hard*` reste au backlog (§4). |
| Titres d'écran | `text-5xl` sur deux lignes (`CRÉEZ / VOTRE ESPACE`) | idem, dans la carte `verre` | La cible n'a **pas** de carte : la page est posée sur `fond-premium`. La carte est une décision du socle (déjà en place pour `/login`) ; on la garde pour que les trois écrans soient cohérents. |
| Largeur du formulaire | aucune contrainte | `max-w-sm` (connexion, oubli), `max-w-md` (inscription) | Six champs, trois coches et un bloc de consentement ne tiennent pas dans 24 rem sans casser les libellés. Même échelle d'espacement, un cran au-dessus. |
| Consentement | liens vers `/conditions` et `/confidentialite` | texte **sans lien** | Ces routes n'existent pas dans ce socle. Un `<Link>` vers une page absente est exactement le défaut livré une fois (`<link href="/register">`) ; `i18n-ui.test.mjs` l'interdit désormais par calcul des routes du disque. |
| Texte CNDP | phrase mesurée, `contact@fidelix.ma`, version `cndp-2026-10` | phrase reprise, `{marque}`/`{domaine}` interpolés, référence isolée dans `REFERENCE_CNDP` | La **déclaration citée est celle de la cible** : elle doit être remplacée avant toute mise en production. C'est écrit dans `lib/reinitialisation.mjs`, et l'apostrophe de "déclaration" n'est pas un détail : un formulaire qui affirme une conformité qu'on n'a pas déposée est pire qu'un formulaire muet. |
| Étapes « Tes infos / La vidéo / Ton compte », pixel Meta, `localStorage['fidelix_prospect']`, `api.pwnedpasswords.com` | présents (`?depuis=pub`) | non repris | Pistage publicitaire et appel à un tiers depuis un formulaire d'inscription : deux décisions de vie privée, pas deux détails d'UI. Au backlog. |
| `?echec=expire\|appareil\|invalide` | lu par `window.location.search` | lu par `searchParams` côté serveur, validé par `messageEchec()` | Même affichage, mais il tient **sans JavaScript** et une valeur inconnue n'affiche rien. Le producteur (retour de lien de confirmation) viendra avec `/auth/confirm`. |
| Langue | `<html lang="fr">` partout, `dir="rtl"` sur un `div` | `lang`/`dir` sur le `div` de coque, négociés par `Accept-Language` | Structure mesurée conservée (cf. `src/i18n/locales.mjs`), et le calcul de `dir` est fait une fois, pas recopié. |

**Vérification du rendu, cette fois par mesure et non à l'œil** : `next start`
sur le build de production a rendu `/register` avec `h1` en `Anton` à 48 px,
couleur `rgb(22, 21, 20)`, carte de 448 px à `border-radius: 32px`, bouton
390×52 px, `scrollWidth === clientWidth` (aucun débordement), et — avec
`Accept-Language: ar` — `div[lang=ar][dir=rtl]` propagé jusqu'au `form`
(`getComputedStyle → rtl`). Le CLI ne pouvait pas le dire ; le navigateur, si.

### Ce qui est décidé pour le retour de lien (2026-10-31)

`HORS_LEDGER` reste à **trois** entrées : `/auth/confirm` ne rend rien, donc il
n'introduit aucune valeur CSS. Ce qui est décidé ici porte sur un comportement,
une chaîne d'URL ou une origine — donc, même règle, une raison ou le retour au
mesuré.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Retour de lien | `emailRedirectTo: "/auth/confirm?next=/onboarding"` (mesuré dans le chunk d'inscription) ; `/forgot-password` lit `?echec=expire\|appareil\|invalide` | Route Handler `app/auth/confirm/route.js` : **aucun rendu**, redirection vers `/dashboard` ou `/forgot-password?echec=…` | Un écran intermédiaire clignote et n'ajoute rien ; un endpoint qui ne rend rien ne peut pas hériter d'une décision de style, donc rien de neuf au ledger. Surtout : le `?echec=` mesuré n'avait **aucun producteur** — la dette nommée par R1 est fermée, et un test vérifie que `destinationEchec()` ne peut pas produire une valeur que `messageEchec()` refuse d'afficher. |
| `?next=` | mesuré (`?next=/onboarding`) | non repris | `/onboarding` n'existe pas dans ce socle, et accepter un `next` arbitraire ouvrirait une redirection ouverte depuis un lien reçu par courriel. La seule destination authentifiée est `/dashboard`. |
| `type=recovery` | gabarit standard Supabase | **accepté** (2026-10-31) ; `resetPasswordForEmail` envoie `redirectTo: …/auth/confirm?flux=recuperation`, et la session vérifiée atterrit sur `/nouveau-mot-de-passe` | Le refus précédent tenait à une absence, pas à un choix : aucune page ne pouvait poser le mot de passe, donc vérifier le jeton ouvrait une session **sans issue** et déposait le commerçant sur `/dashboard` avec son ancien mot de passe. La page existe ; le refus, lui, n'a plus d'objet. Le marqueur `flux` — et non `next=` — est une **liste fermée** : une valeur inconnue retombe sur `/dashboard`, jamais sur un chemin fourni par l'URL. |
| Écran « nouveau mot de passe » | **libellés de champ mesurés** dans le chunk des Réglages (`…settings_page-….js`) : « Nouveau mot de passe », « Confirmer le nouveau mot de passe », « Changer le mot de passe » ; l'écran lui-même n'a jamais été capturé | carte `verre` `max-w-sm`, titre Anton 5xl sur deux lignes (`NOUVEAU` / `MOT DE PASSE`), deux champs (`auth.nouveau.champMotDePasse`, `auth.nouveau.champConfirmation`) et les **trois règles mesurées** réutilisées telles quelles | C'est un écran d'identifiants : il reprend la coque et les composants des trois autres (`Surface`, `Champ`, `REGLES_MOT_DE_PASSE`), donc une correction de bordure ou de contraste y profite sans copie. Les deux libellés de champ sont **mesurés** depuis le 2026-10-31 et gardés par `copie-mesuree.test.mjs` ; le titre, le sous-titre et la phrase d'échec restent **écrits** (dette déclarée, `i18n/dictionnaires.mjs`, bloc `auth.nouveau.*`). |
| Origine du lien | URL de site du projet, réglée en console | `NEXT_PUBLIC_SITE_URL` si définie, sinon `x-forwarded-host`/`host` — `http` seulement sur `localhost`/`127.0.0.1` | Le lien doit fonctionner en local, en aperçu et en production sans trois valeurs en dur (le domaine du clone est encore une dette à arbitrer). Le second verrou est l'allow-list « Redirect URLs » du projet : un hôte forgé est refusé par Supabase, pas par nous. Sans origine connue, l'option est **omise** — Supabase retombe sur l'URL de site, donc un lien valide, jamais mort. |
| Deux formes de lien | non mesuré (la cible passait `emailRedirectTo` seul) | `?code=` (PKCE) **et** `?token_hash=&type=` | `?code=` exige le *code verifier* en cookie : ouvert sur un autre appareil, il échoue — c'est le seul cas qui produit `appareil`, la valeur que le message mesuré décrit mot pour mot (« les liens actuels s'ouvrent où vous voulez »). `?token_hash=` est cette promesse-là, et c'est ce que produit un gabarit d'email personnalisé. |

**Le ledger ne bouge pas pour autant** : `/auth/confirm` ne rend toujours rien,
et `/nouveau-mot-de-passe` n'emploie que des classes déjà surveillées
(`verre`, `shadow-float`, `font-impact`, `text-ink`, `bg-ink`) — aucune variable
`--verre-*` / `--font-*` ajoutée, ce que `verifier-design.mjs` confirme
(**0 inventée**). Une décision de **copie** n'entre pas dans `HORS_LEDGER`, qui
ne suit que des propriétés `--*` : elle est donc déclarée dans le tableau
ci-dessus, comme les précédentes.

### Ce qui est décidé pour la navigation du tableau de bord (2026-10-31)

`HORS_LEDGER` reste à **trois** entrées : R2 n'ajoute **aucune** variable CSS.
Les écrans réutilisent `Surface` et les utilitaires déjà présents ; rien n'est
recopié de `verre.css`. Ce qui suit porte sur des **comportements**, des
**routes** et une **absence d'icônes** — donc, même règle, une raison ou le
retour au mesuré.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Ordre du menu | `Scanner un client` **avant** `Accueil` (rail vertical) | `Accueil` d'abord, puis les neuf | Le nôtre est une rangée **horizontale** : commencer par une action plutôt que par le point d'entrée se lit mal dans ce sens. L'ordre relatif des neuf autres est celui du rendu mesuré. |
| `/caisse` dans la navigation | absente du menu : c'est une **PWA séparée** (`scope: /caisse`, `theme_color: #1a1a1a`) | ajoutée comme 9ᵉ entrée, servie par la coque du dashboard | R2 doit **livrer la page** ; la séparation en PWA (manifeste propre, hors-ligne, service worker) est un travail de R3. La clé `tableau.nav.caisse` existait déjà au dictionnaire. |
| Forme de la navigation | rail vertical rangé/dépliable (`fidelix_rail`) | rangée `vitre` défilante (`overflow-x-auto`) sous la barre | Dix libellés ne tiennent pas dans une barre de 56 px ; les entasser produirait un débordement silencieux à 375 px. Le défilement horizontal fonctionne aussi en `dir="rtl"`. |
| Icônes | `LayoutDashboard`, `Store`, `Trophy`, … (Lucide) | **aucune** : libellés seuls | Les **noms** d'icônes sont mesurés, les **tracés** non. Recopier neuf SVG de mémoire produirait neuf faux dessins — exactement ce que la règle du ledger interdit. Les tracés viendront avec leur source, pas avant. |
| État actif | non mesuré (le rail surligne l'entrée courante) | `aria-current="page"` + fond `bg-white/10`, via `estActif()` | La couleur seule ne suffit pas (daltonisme) et un lecteur d'écran ne lit pas les classes. La règle est pure et testée : `/customers/<uuid>` allume « Clients », `/customers-archives` non. |
| Scanner | caméra + `BarcodeDetector` (mesuré dans le chunk `scan`) | caméra branchée (`components/scan/CameraScanner.jsx`) **et** champ « jeton de carte » conservé | La caméra ne parle pas à la base : elle lit un QR et **navigue** vers `/scan?code=…`, donc même RPC, même contrat que le champ — c'est ce qui permet de la brancher sans toucher au serveur. La permission est un **état d'écran** (`refus`, `sansCamera`, `nonSupporte`, `indisponible`), avec quatre textes distincts, et la saisie manuelle reste affichée dans tous les cas. La demande part d'un clic : un prompt au chargement se fait bloquer pour tout le site. **Non mesuré** : le rendu de l'aperçu et le comportement d'un appareil réel — `BarcodeDetector` n'existe pas sur iOS Safari, donc cet écran y tombera sur `nonSupporte`, ce qui est le repli prévu mais non observé. |
| Pages sans lecture | listes, paliers, avis, équipe | état vide **explicite**, jamais de zéro | « 0 client » se lirait comme un fait mesuré. La base est vide **et** aucune RPC de lecture n'existe : deux raisons distinctes de ne rien afficher, qu'un zéro confondrait. |
| Codes d'erreur RPC | non mesurés côté client | `CARD_NOT_FOUND` → « carte inconnue », `INVALID_COST` → « coût refusé » ; tout autre code → « motif non reconnu » | Ces deux codes sont les seuls **observés** (sonde du 2026-10-31, HTTP 400 `P0001`, zéro ligne écrite). Rapprocher un code inconnu d'un cas connu serait une invention. |
| Langue servie | `fr` / `en` / `ar` servis | **`fr` seul** ; `/en` et `/ar` redirigés vers la version française | Décision humaine du 2026-10-31 : « pas de version EN, que du FR » — elle remplace la décision du même jour qui suspendait seulement `ar`. Les dictionnaires `en` et `ar` sont **supprimés**, pas laissés à moitié : un dictionnaire partiel ne casse que sur les pages que personne n'ouvre, donc il ne se voit jamais. `PREFIXES_RETIRES` les redirige pour qu'un favori `/en/caisse` ne tombe pas en 404 sur une page qui existe. |
| Prénom / nom | `first_name` / `last_name` | mapping **unique** : `first_name` = prénom, `last_name` = nom ; affichage « prénom nom », tri « nom prénom » | Un échange des deux ne lève **aucune** erreur : il affiche « Dupont Jean » sur toutes les fiches, et personne ne s'en aperçoit avant un mailing signé du mauvais nom. Le mapping vit dans `lib/personne.mjs` ; `personne.test.mjs` échoue si on l'inverse. |
| Contenu du QR | `/join/<slug>` (27 slugs au `sitemap.xml`) | idem | C'est la seule page publique dont le commerçant imprime l'adresse. Encoder une **carte** aurait lié le QR à un client au lieu d'une adhésion : le même papier n'aurait servi qu'une fois. |
| Contraste du QR | non mesuré (aucun QR capturé) | **noir `#000` sur blanc `#fff`**, marge de 4 modules dans le chemin | Un QR clair posé sur le verre sombre passe sur certains lecteurs et échoue sur d'autres. La marge vit dans `cheminSvg()`, donc aucun écran ne peut l'omettre ; le noir ne dépend pas du thème. |
| Origine de l'URL | domaine du commerce | `NEXT_PUBLIC_SITE_URL`, sinon l'hôte de la requête | Un QR imprimé avec un domaine provisoire est un QR mort collé sur un comptoir. `marque.domaine` reste une dette **non arbitrée** : elle ne doit pas finir sur du papier. |
| Adhésion | ni nom, ni email, ni téléphone | idem, client **anonyme** | Promesse mesurée, tenue par la base : `0003` §1 bis rend `first_name`/`last_name` facultatifs — la contrainte `NOT NULL` bloquait la carte anonyme (mesuré : `23502`). |
| Lecture d'une carte | RPC inconnue de la cible | `carte_par_token`, **authenticated seulement** | Accordée à `anon`, ce serait un oracle de soldes : `C-` + 6 caractères ≈ 16,7 M de combinaisons, balayables. Le scanner et la caisse sont authentifiés ; la page publique n'en a pas besoin. |
| Écriture du programme | inconnue | `enregistrer_programme`, authenticated, remplacement **atomique** des paliers | Sans elle, aucun programme ne peut exister, donc `join` lève `PROGRAM_NOT_FOUND` et le QR ne mène à rien. C'est ce qui rend l'écran Programme fonctionnel plutôt que décoratif. |
| États bloqués | néant | `EtatBloque` : « base non migrée » (avec le **nom du fichier**), « aucun programme », « carte inconnue » | Trois causes distinctes, trois textes. Un « aucun résultat » unique les confondrait et ferait chercher du mauvais côté — c'est la même faute que le « 0 client » inventé, un cran plus loin. |
| Vitrine publique `/recompenses/<slug>` | chunk `app/recompenses/%5Bslug%5D/page`, 27 slugs au `sitemap.xml` ; les paliers s'affichent **avant** l'adhésion | `app/recompenses/[slug]/page.jsx`, servie par `programme_public` (déjà accordée à `anon`), **aucune RPC nouvelle** | Une seconde fonction pour le même `json` aurait doublé la surface à révoquer et à accorder, sans une donnée de plus. C'est aussi pourquoi la page ne lit **aucune table** (`loyalty_programs`/`reward_tiers` sont sous RLS sans politique : un SELECT direct rendrait `[]`, donc « pas de programme »). Un slug inconnu (`PROGRAM_NOT_FOUND`) est un **404**, pas un écran de panne — même choix que `/join/<slug>`. L'accroche (« 45 points = Boisson offerte ») vient de `prochainPalier(0, …)`, donc du **plus petit coût** et non du premier élément du tableau. Le seul appel à l'action est `/join/<slug>`, la route que le QR encode : le client qui a lu le barème n'a qu'un geste, celui du comptoir. |

### Ce qui est décidé pour l'écran Clients (2026-10-31)

Premier écran servi par une **RPC de lecture** (`migrations/0004`). La projection
d'une fonction est une décision d'affichage : rendre une colonne de plus, c'est
l'exposer. Elle est donc dérivée de la capture, pas composée.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Colonnes de la liste | capture authentifiée `a17-customers.html` : « Liste des membres », puis « Code client / Points / Tampons / Récompenses / Inscrit le » ; ligne `C-CR7QZX · 8 pts · 0 · 26 oct. 2026` ; compteur « 1 client inscrit » | projection de `cartes_du_commerce()` (`card_token`, `points`, `recompenses`, `inscrit_le`, `prenom`, `nom`), rendue en `<table>` dont le `<caption>` porte le titre de section | Le tableau est la forme que la cible donne à ces données ; le `<caption>` évite un second titre qui dirait la même chose. **Pas d'email** : la cible ne l'affiche pas ici, et `migration-0004.test.mjs` refuse qu'on l'ajoute. |
| Titre de la page | `<h1>` = « Clients » ; « Mes clients » est l'**onglet** voisin | `page.clients.titre` = « Clients » | Prendre l'onglet pour le titre aurait recopié l'étiquette d'un composant qu'on ne rend pas. Les deux chaînes sont dans la capture ; c'est leur **rôle** qui départage. |
| Accès à la liste | inconnu (le dashboard de la cible lit via son serveur Next, `service_role`) | `cartes_du_commerce` : `authenticated` + `service_role`, **jamais** `anon` | Une liste est un annuaire : ouverte à `anon`, elle énumère tous les jetons d'un coup, ce que `carte_par_token` refuse déjà à l'unité. Aucune table n'est rouverte (pas de `GRANT`, pas de politique) — mesuré par `has_table_privilege`. |
| Deux états non capturés | la cible avait **un** client : ni son état vide ni une réponse illisible n'ont d'image | deux textes distincts (`Aucune carte pour l'instant` / `Réponse inattendue`) | Ce sont deux causes différentes. Les confondre ferait chercher un problème de données là où la lecture a échoué — même règle qu'`EtatBloque`. |
| `search_path` des RPC d'écriture | non mesuré | `alter function … set search_path = public` sur `award_loyalty_points` et `redeem_loyalty_reward` | Mesuré : elles étaient `SECURITY DEFINER` **sans** chemin figé. Une fonction `definer` sans `search_path` s'exécute avec le chemin de l'appelant : c'est une escalade, pas un détail de style. |

**Le ledger CSS ne bouge pas** : l'écran n'ajoute aucune valeur — il emploie
`Surface`, les classes de bordure et d'opacité déjà surveillées, et `font-mono`
pour les jetons. `verifier-design.mjs` reste à trois déviations déclarées.

**Non vérifié pour autant** : le rendu de la rangée à 375 px, le défilement en
`rtl`, et l'anneau de focus sur le premier lien (rogné ou non par le conteneur).
Le CLI ne les voit pas ; `/apercu` les montre. Rien de tout cela n'a été mesuré
au navigateur dans cette passe.

### Ce qui est décidé pour l'offre et `/billing` (2026-11-02, P0-3)

Le plafond de 30 clients n'était appliqué nulle part. La **règle de comptage**
est mesurée avant tout le reste : `docs/regle-comptage-30-2026-11-02.md`. Ce qui
est compté, c'est le nombre de clients **inscrits** (cumulé, à l'échelle du
commerce) — ni les visites, ni le mois, ni le chiffre d'affaires.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Le compteur | `aria-label="Clients inscrits sur l'offre gratuite"` ; « N clients ont déjà leur carte » | `count(*)` sur `clients` (`0012`), une carte par inscription (`0003`) | C'est la même définition que `tableau_du_commerce` (`0005`) : deux définitions du même chiffre divergeraient au premier écran qui compte autrement. |
| Où vit le seuil | un seul paramètre (`{limite}`), rendu partout ailleurs | `v_limite constant integer := 30` dans la fonction ; l'application ne connaît pas 30 | Un 30 recopié dans le bandeau, la page et un test ferait trois endroits à corriger le jour où le plafond change. |
| Le bandeau | présent sur **chaque** écran (mesuré 4 fois) | dans le layout du groupe, une seule fois | Dix copies = dix compteurs à tenir à jour. |
| Le compteur, en cache | — | mémoire de 10 s, états `ok`/`nonMigre` seulement | Le bandeau est sur chaque navigation : sans mémoire, un aller-retour Supabase mesuré à 0,55–0,81 s pour un chiffre immobile. |
| Compteur illisible | — | **aucun bandeau** (il ne rend rien), et `/billing` nomme la migration à exécuter | Un « 0 / 30 » sur une lecture échouée est le faux zéro que `EtatBloque` existe pour éviter. |
| Seuils intermédiaires | trois messages, aucun état rendu capturé | `attention` à 5 places restantes, `urgent` à 1 — **choix déclaré**, pas mesure | Seul `urgent` se déduit du texte (« au 30e, le scan s'arrête »). Le reste est un cran lisible, borné par un test. |
| Bouton « Activer » | radiogroupe de rythme, « Activer — 397 MAD », prochain prélèvement, conditions | **non rendu** : ni bouton, ni radio | Aucun paiement n'est branché (`docs/regle-comptage-30-2026-11-02.md` §5). Un bouton qui ne débite rien est un mensonge ; la page dit que l'activation n'est pas disponible. |
| Onglet « Données clients » | troisième onglet, `/donnees-clients` | **non rendu** (ni page ni capture) | Un onglet vers une route absente est le lien mort que `i18n-ui` et `navigation.test.mjs` interdisent. |
| WhatsApp de la cible | `wa.me/2126…`, « Une question avant de vous abonner ? » | **non repris** | C'est le standard de *Fidelix*. Même raison que « Demander sur WhatsApp » sur `/program`. |

**Ce qui n'est pas vérifié** : l'état « plafond atteint » n'a jamais été rendu
par la cible (son seul compte capturé vaut 1), donc les messages d'avertissement
sont confrontés au **dictionnaire** de la cible, pas à un écran. Et le rendu
authentifié de `/billing` en local n'est pas observé : le conteneur et le profil
REA lisent deux projets Supabase différents, donc la page répond
`307 → /login` (la garde fait son travail).


### Ce qui est décidé pour l'écran Règles du programme (2026-11-02)

Second écran servi par une RPC de lecture **et** d'écriture (`migrations/0010`).
La cible le mesure une fois : `_captures/2026-11-02-a6/rendu/a02-program.html`,
sept réglages sous une carte « Configuration », deux onglets au-dessus.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Barème affiché | « Points par 10 € dépensés », `step="0.01"`, minimum 2 dans l'exemple (« Un ticket de 250 € créditera 50 points ») | l'écran demande « points par 10 », `step="0.1"` ; la colonne reste `credits_par_euro` (`0008`), seule source lue par la caisse | **Pas de seconde colonne** : deux sources pour un même barème divergent au premier enregistrement, et la caisse créditerait un nombre que l'écran n'a jamais montré. Conséquence assumée : le pas est de **0,1** point par tranche, parce que 0,225 point par euro ne tient pas dans `numeric(10,2)` — un « 2,25 par 10 » est donc **refusé**, pas arrondi en silence. |
| Symboles monétaires | « Euro (€) », « Achat minimum (€) », « 1 point = 1 € de remise » | `{symbole}` partout, `symboleDevise(devise)` ; aucun « € » dans une valeur du dictionnaire | La devise est une **donnée** du programme (MAD ou EUR). Recopier « € » aurait figé l'écran en euros — et un programme en dirhams aurait affiché « Achat minimum (€) ». |
| Choix de la devise | deux `<button type="button" aria-pressed>` sans `name` (état client) | groupe de deux `<input type="radio" name="devise">` | Écart de **forme**, pas de valeur : le formulaire doit fonctionner **sans JavaScript** (le téléphone d'une caisse). Les deux valeurs restent celles de la cible. |
| Bonus avis Google | case + entier + lien, `placeholder` « Ex : 10 », aide « Collez votre Place ID … après placeid= » | mêmes trois contrôles, et **deux refus de cohérence** : bonus activé à 0 point, bonus activé sans lien | Une récompense promise qui n'arrive jamais (0 point) ou que le client ne peut pas réclamer (pas de page d'avis) est pire qu'un refus : le commerçant croit avoir réglé quelque chose. |
| Exemple chiffré | « Un ticket de 250 € créditera 50 points » | recalculé **côté serveur** avec le taux enregistré | L'écrire en dur aurait affiché 50 points sur un barème à 1. Il se rafraîchit au rechargement qui suit l'enregistrement, pas à la frappe. |
| `name` du formulaire | huit `name` mesurés, dont `reward_threshold` et `reward_description` (restes de l'onglet voisin) | repris tels quels, **sauf** ces deux-là | Poster `reward_threshold` depuis une page qui ne l'affiche pas réécrirait le seuil d'un palier. Deux fonctions, deux périmètres : `enregistrer_programme` garde le nom, le slug, le seuil et les paliers. |

**Trois écarts déclarés sur la copie** (les seuls de cet écran) :

1. « Demander sur WhatsApp » — **non repris**. Le lien mesuré porte le numéro du
   support de la cible ; envoyer les commerçants chez quelqu'un d'autre est pire
   que ne pas avoir le lien. « Trouver mon Place ID », lui, est repris : c'est
   la documentation publique de Google.
2. les `<b>` de la dernière phrase — **non rendus**. Une chaîne du dictionnaire
   n'a pas de balises, et découper une phrase mesurée en trois clés la rendrait
   intraduisible.
3. `step="0.1"` au lieu de `step="0.01"` — cf. la première ligne du tableau :
   c'est la conséquence visible du refus d'arrondi, pas un oubli.

**Un défaut de copie trouvé par le test, et corrigé** : le dictionnaire écrivait
`1 point = {symbole} de remise`, ce qui rendait « 1 point = € de remise » — le
second « 1 » de la cible manquait. `reglages-programme.test.mjs` compare les
libellés rendus en euros au texte de la capture ; il a échoué, la phrase est
corrigée. C'est exactement ce qu'une comparaison à soi-même ne peut pas voir.

**Non vérifié** : le rendu authentifié de `/program` en local. La session du
profil REA appartient au projet Supabase `rozagopjfkkblyxtjdgw` (fidelix.ma)
alors que le conteneur lit `sevqegfhmdezsqwvwsam` : la page répond `307 → /login`
(donc la route existe et la garde fait son travail), mais son corps n'a pas été
observé. Ce qui **est** vérifié par exécution : `next build` compile la page et
ses composants, les journaux du conteneur sont propres au démarrage, et 18
tests hors ligne couvrent la copie, la conversion et le raccordement.

### Ce qui est décidé pour l'écran Messages · Notifications (2026-11-02, P0-4)

Premier écran qui **écrit** dans une file sans jamais l'envoyer. La cible le
mesure deux fois : `_captures/2026-11-02-a7b/rendu/d01-notifications.html` (DOM
rendu, 200) et le chunk de sa page, qui porte les bornes, le quota et le contrat
d'envoi. Contrat complet : `docs/mesure-p0-4-messages-2026-11-02.md`.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Statut d'un message | `sent` · `draft` · `blocked`, plus « Notification validée ✓ / Aucun client joignable pour l'instant » | `en_attente` à l'écriture, **une seule valeur produite** | Aucun canal sortant n'existe ici : ni jeton push, ni Wallet, ni dépendance d'email. Écrire « Envoyée » serait le seul vrai mensonge de l'écran. La colonne accepte `envoye` pour le jour du canal, mais **rien ne l'écrit** (le test `0013` le vérifie). |
| Barre d'onglets | trois onglets : Notifications · Automatiques · Emails | **pas de barre** tant qu'une seule page existe | La doctrine du projet est « la page d'abord, le lien ensuite » (`navigation.mjs`) : un onglet vers `/automations` ou `/campaigns` serait un lien mort, et `navigation.test.mjs` l'interdit. |
| Compteurs `0/50`, `0/150` | rendus en direct à la frappe | **non rendus** ; la borne est écrite en aide (« 3 à 50 caractères ») | Sans JavaScript, un compteur statique afficherait « 0 » quoi qu'on tape. La borne, elle, est vraie sans script — et tenue **en base**. |
| Aperçu du message | carte noire mise à jour à la frappe | **non rendu** | Même raison : un aperçu figé serait faux dès la première lettre. |
| Phrase de modération | « Les notifications sont modérées automatiquement… sera bloqué et non publié » | **non reprise** | La fonction de modération de la cible n'est pas observable. Promettre un filtre qu'on n'a pas écrit est exactement ce que cet écran évite. |
| Quota de 3 | « 0 / 3 aujourd'hui », au-delà le bouton devient « Prochaine notification demain » | même compteur, même remplacement du bouton, quota **tenu en base** (jour compté à Casablanca) | Un quota vérifié seulement dans l'écran se contourne ; le placer dans la fonction le rend vrai pour tout appelant. |
| Audiences | « 2 iPhone · 1 Android », `taux_desinscription_wallet` | un seul chiffre : **clients qui ont une adresse email** | C'est le seul fait mesurable ici. Les appareils touchés supposent un envoi, le taux de désabonnement Wallet suppose un Wallet. |
| `name` des champs | `title`, `body`, `cta_url` | `titre`, `corps`, `lien` | Aucune contrainte de compatibilité : la cible est une application distincte, et nos `name` sont lus par notre action. Des noms français suivent le reste du socle (`devise`, `points_per_purchase`…). |

**Deux écarts de copie, déclarés** : « Prochain message demain » (la cible dit
« Prochaine notification demain »), et le titre du bouton « Mettre le message en
file » — la cible dit « Envoyer la notification ». Les deux suivent la seule
chose qui soit vraie ici : rien ne part.

**Non vérifié** : le rendu authentifié de `/notifications` en local (même raison
que `/program` : le conteneur lit `sevqegfhmdezsqwvwsam`, la session du profil
REA appartient à `rozagopjfkkblyxtjdgw`). Ce qui **est** vérifié par exécution :
`next build` compile la route et la liste dans sa table, 17 tests neufs
(`messages.test.mjs`, `migration-0013.test.mjs`) passent, et `0013` n'est **pas
exécutée** — la page le dit en nommant le fichier (`PGRST202`).

### Ce qui est décidé pour l'écran Apparence · `/branding` (2026-11-02, P0-6)

Premier écran dont une **valeur de donnée** pilote une couleur. Deux mesures :
`_captures/2026-11-02-a6/rendu/a08-branding.html` (DOM, 200) et son chunk
applicatif (dix types, huit couleurs, schéma zod, colonnes écrites). Contrat
complet : `docs/mesure-p0-6-apparence-2026-11-02.md`.

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| Couleur de la carte | huit pastilles + `input[type=color]` + un `input[name=primary_color]` caché | le **nuancier natif** porte `name="primary_color"` ; les huit pastilles sont des boutons `aria-pressed` qui l'écrivent | Un champ caché piloté par des boutons ne s'envoie pas sans JavaScript. Ici le champ réel est natif (il s'envoie seul), et les pastilles sont des raccourcis — l'aide de l'écran le dit. |
| Type d'établissement | dix boutons `aria-pressed` (état client) | dix `radio` dans un `fieldset`, style `.uc-choix` (déjà celui de `/program` et `/caisse`) | Même sémantique de sélection unique, mais **vraie sans JavaScript** et lisible par un lecteur d'écran comme un groupe. |
| Peinture de la couleur | `style="background-color: rgb(…)` sur les pastilles, `color` sur l'aperçu | `--apercu-teinte` posée en **style inline**, consommée par `.apercu-haut` dans `unicity.css` | Une couleur venue de la base ne peut pas être une classe Tailwind, et l'arrondir à une des huit teintes afficherait une couleur que le commerçant n'a pas choisie. |
| Lisibilité du nom sur la carte | blanc sur la couleur choisie | même chose, **plus** `.apercu-voile` (dégradé sombre) | `#f94c3a` sur blanc donne 3,06:1 : sous le seuil AA. Sur une photo claire, le nom disparaît complètement. |
| Envoi de fichier | `POST /api/branding/upload` (`kind: logo \| background`) | **pas d'envoi** : deux champs d'**adresse**, contraints à `https://…` ou `/…` en base | Le socle n'a ni espace de stockage ni clé de service. Un `<input type=file>` qui ne part nulle part serait un mensonge de plus, pas une fonctionnalité. |
| Section « 4 · Tampons par carte » | `stamps_total`, `stamp_icon`, `style_bandeau` — **seulement** pour un programme à tampons | **refusée** (décision du 2026-11-02) ; `/rewards` ne propose plus « Tampons » et l'écrit (`page.programme.unitePoints`) | Aucune surface d'ici ne dessine de grille de tampons, et `award_loyalty_points` n'a pas de paramètre de tampon : les trois réglages n'auraient aucun lecteur. L'option « Tampons » déjà présente depuis `0003` était ce même interrupteur — elle a été retirée, pas laissée en place. |
| Aperçu | « Aperçu réel du pass Apple Wallet », code `C-4F2A91`, 120 points, « octobre 2026 » | mêmes valeurs, **légende réécrite** : ce qui est réel (nom, logo, type, couleur) et ce qui est un exemple | Aucune classe PassKit n'existe (P0-5 Wallet attend Apple). Garder « réel » aurait été la seule phrase fausse de l'écran. |
| Mois de l'aperçu | figé dans la capture (`octobre 2026`) | calculé **côté serveur** (`moisAnnee`) et passé en propriété | Le recopier vieillirait à l'écran ; le calculer côté client ferait diverger le rendu serveur et l'hydratation au passage d'un mois. |

**Vérifié par exécution** : `next build` exit 0 (`/branding` listée), 27 tests
neufs (`apparence.test.mjs`, `migration-0015.test.mjs`), 6 tests pour l'unité
(`unite-programme.test.mjs`), 727 tests hors ligne au
total. **Non vérifié** : le rendu authentifié en local (même raison que
`/program`), et `0015` n'est pas exécutée — la page le dit en nommant le fichier.
`verifier-design` reste **CONFORME** : `unicity.css` n'ajoute aucune variable,
seulement des classes qui consomment les jetons `--uc-*`.


### Ce qui est décidé pour la caisse hors ligne (2026-11-03, R3)

Le POS `/caisse` devient la **coque PWA** du socle. Le manifeste est mesuré
(`_captures/2026-10-26/raw/pages/p21-caisse-manifest.html`, 453 o) ; la
mécanique de file vient de la mesure A4 (`fidelix-caisse` v2, FIFO par
`cree_le`, rejeu 65 000 ms, trois issues).

| Décision | Ce que dit la cible | Ce qu'on fait | Pourquoi |
|---|---|---|---|
| `name` du manifeste | « Caisse Fidelix » | « Caisse **Fidelia** » (marque du dictionnaire, `lib/pwa.mjs`) | `basal-knowledge.md` §14 interdit de réutiliser la marque de la cible dans la PWA. Toutes les autres clés sont identiques à l'octet sémantique et comparées à la capture par `file-caisse.test.mjs`. |
| Emplacement du manifeste | `/caisse/manifest.webmanifest` (balise de `p09`) | même URL, servie par une **route** (`app/caisse/manifest.webmanifest/route.js`) | Le nom porte la marque, qui a une seule source : un JSON statique aurait été la deuxième, hors du balayage d'`i18n-ui`. |
| Portée du service worker | `scope: /caisse` (manifeste) | script à la **racine** (`/sw.js`), règles limitées à `/caisse` et au repli | Un script sous `/caisse/` ne contrôle pas `/caisse-hors-ligne` (public, hors portée), et l'écran de repli s'ouvrirait sans ses morceaux. La portée du **manifeste** reste `/caisse`, inchangée. |
| Page authentifiée en cache | la cible garde le catalogue des cartes en IndexedDB | **jamais** : aucune navigation n'entre en cache ; seuls `/_next/static/*` et `/polices/*` (immuables) le sont | Un HTML de `/caisse` porte un code client et un solde. Sur une tablette de comptoir partagée, un cache les rendrait lisibles après déconnexion. Écart assumé, écrit dans `sw.js`. |
| Échange hors ligne | la cible met l'opération en file (transaction) | **refusé**, et l'écran le dit (`page.caisse.horsLigneEchange`) | Le solde d'un échange dépend de ce que les autres caisses ont écrit ; rejouer une soustraction sur un solde inconnu peut passer sous zéro. Créditer est additif et rejouable ; échanger ne l'est pas. |
| Idempotence | `client_operation_id` généré **à l'enfilage** | même règle : `crypto.randomUUID()` à l'enfilage, `operations_caisse` (clé primaire) + verrou consultatif | Générer l'identifiant au renvoi crédite deux fois. `0016` sérialise deux rejeux simultanés du même identifiant (`pg_advisory_xact_lock`). |
| Chemin d'écriture du rejeu | `POST /api/transaction` | `POST /api/caisse/operation` (route, pas Server Action) | Une action serveur ne se rejoue pas depuis `fetch` : son identifiant de build et son jeton changent à chaque déploiement, et un rejeu peut traverser un déploiement. |
| Formulaire de crédit sur `/caisse` | la caisse crédite **et** échange | crédit en composant client (`CrediterCaisse`), échange inchangé (Server Action) | Le crédit doit survivre à une coupure ; l'échange doit rester sur le réseau. Limite déclarée : ce formulaire demande JavaScript — `/scan` reste le chemin de crédit sans JS. |
| Icônes | `/icon-192.png`, `/icon-512.png` (aucun fichier dans le dépôt) | PNG **engendrés** (`tools/rea/generer-icones.mjs`), même « F » sur fond `#1a1a1a`, dans la zone sûre *maskable* | Aucune dépendance d'image ici : un binaire opaque serait invérifiable. `file-caisse.test.mjs` décompresse l'`IDAT` et rejoue le générateur (mêmes octets). |

**Vérifié par exécution** : `next build` exit 0 (`/caisse`,
`/caisse-hors-ligne`, `/caisse/manifest.webmanifest`, `/api/caisse/operation`
listées) ; sur `next start` : manifeste **200**
(`application/manifest+json`, « Caisse Fidelia »), repli **200**, `/sw.js`
**200**, icône **200**, `/caisse` **307 → /login** (garde) ; `POST` sans corps
valide → **400**, `POST` valide sans `0016` → **503 `PGRST202`** (donc
« conservée », pas perdue). **Non vérifié** : l'installation réelle de la PWA et
le rejeu effectif — `0016` n'est pas exécutée, et aucun appareil n'a été appairé.


## 3 bis. La peau « Unicity » — refonte du tableau de bord (2026-11-01)

Cette section **déclare** un changement de cible, qui est exactement le cas
prévu par la règle unique : une valeur s'écrit ici parce qu'elle a été lue, ou
parce qu'elle est déclarée. Les deux feuilles ci-dessus restent la transcription
de la capture « verre » ; l'espace authentifié porte désormais la peau du dépôt
voisin `UNICITY`, et cette peau est **une autre source**, citée.

### Sources de la nouvelle peau

| Fichier | Ce qui en est repris |
|---|---|
| `UNICITY/unicity/src/styles/tokens.css` (l.5-123) | toutes les teintes, ombres, rayons et piles de police |
| `UNICITY/unicity/src/layout/layout.css` (l.4-253) | coque `grid 76px / 1fr`, rail qui s'ouvre à 232 px, barre haute collante |
| `UNICITY/unicity/src/components/ui/ui.css` (l.6-53, 112-128) | `.btn` (36 px, rayon 100 px), `.card` |
| `UNICITY/unicity/src/features/features.css` (l.62-160, 218-248, 446-490) | héro à dégradé et quatre coins à filets, KPI à filigrane, colonne de droite |

### Pourquoi une feuille séparée

`web/src/styles/unicity.css` est une **couche ajoutée**, jamais une modification
des quatre feuilles mesurées. Si la palette d'Unicity était entrée dans
`tokens.css`, `verifier-design.mjs` signalerait des jetons divergents — à juste
titre : ces feuilles ne seraient plus la transcription de la capture. Deux
conséquences tenues :

- **tout est préfixé `--uc-` / `.uc-`** : `tokens.css` définit déjà `--ink`,
  `--accent` et `--font-sans`, et les redéfinir changerait la couleur de
  composants voisins sans qu'on l'ait demandé ;
- **`unicity.css` n'entre pas dans `NOTRES`** : elle n'est pas confrontée à la
  capture, parce qu'elle n'en vient pas.

### Écarts déclarés

| Écart | Décision | Raison |
|---|---|---|
| Police `Inter Tight` | repli sur `Inter`, embarqué | `Inter Tight` n'est pas dans les binaires mesurés (`polices.css`, 10 familles). Référencer une famille absente donnerait un repli système silencieux. |
| Dock masqué sous 760 px | barre basse fixe de 5 entrées + panneau « Plus » | Dans Unicity, le mobile perd **toute** navigation. Ici, dix destinations restent atteignables : quatre en bas, six derrière « Plus » (`<details>` natif, donc sans JavaScript). `env(safe-area-inset-bottom)` gère l'encoche. |
| Rail ouvert à 1240 px (232 px) | seuil relevé depuis 1080 | À 1080 px, le rail ouvert laisse 848 px au contenu, sous la largeur où la grille à deux colonnes tient encore. |
| Le verre et la nuit | retirés de l'espace authentifié | La cible de cet espace est désormais Unicity. `verre.css` et `nuit.css` **restent** mesurés et servent encore aux écrans d'authentification. |

### Ce qui n'est pas vérifié

Le rendu au pixel : les valeurs sont recopiées, mais aucune capture d'Unicity
n'a été comparée image par image. Ce qui **est** vérifié, par exécution :
10 entrées de dock, 4 indicateurs, 4 coins de héro, 5 onglets mobiles, 6 cartes,
et la feuille réellement servie (`uc-dock` × 16 dans le chunk CSS).




- **Le rendu.** `getComputedStyle` demande un navigateur ; le vérificateur
  compare du texte CSS. Un `backdrop-filter` refusé par le GPU, une police qui
  n'a pas le glyphe arabe : rien de tout cela n'apparaît ici.
  **Premier contrôle à l'œil : 2026-10-30, via `/apercu`** (aperçu de
  développement du tableau de bord, 404 en production). Il a immédiatement
  révélé le défaut d'encre décrit au §3 — ce que trois centaines de tests ne
  pouvaient pas voir. La leçon est dans le geste : le CLI protège la fidélité,
  l'écran protège la lisibilité, et aucun ne remplace l'autre.
- **`.shadow-hard`** (6 variantes : `:not(.garder-clair…)`, `:hover`, sombre) :
  utilisé par la page publique scrapée, pas par le tableau de bord. Non
  transcrit — inscrit au backlog plutôt que recopié à moitié.
- **Les classes de page** `.racine-page`, `.sans-lueur`, `.aplat` : mesurées,
  utiles à la page publique, hors périmètre R1.
- **La caméra.** `verifier-design.mjs` ne voit pas un flux vidéo, et aucun test
  ne peut ouvrir un appareil photo : ce qui est vérifié est le **contrat**
  (`scan-camera.test.mjs`), pas le rendu de l'aperçu. `BarcodeDetector` n'existe
  pas sur iOS Safari : l'écran y affichera `nonSupporte` et la saisie manuelle —
  comportement voulu, **non observé** sur appareil.
- **`next build` dans ce harnais.** `node` y est un binaire Electron : le CLI
  Next casse sur `semver.satisfies` avant d'analyser une seule page. La syntaxe
  est donc validée par le **SWC embarqué de Next**
  (`loadBindings().transformSync`), qui prouve la syntaxe et **rien de plus** —
  ni les frontières client/serveur, ni le rendu.

## 5. Rejouer

```bash
node tools/rea/verifier-design.mjs --verbose   # verdict + déviations déclarées
node tools/rea/verifier-design.mjs --ledger     # dump du ledger capturé
node tools/rea/extrait-polices.mjs              # contrôle, sans écrire
node --test tools/rea/tests/design-system.test.mjs
node --test tools/rea/tests/auth.test.mjs          # copie mesurée, oracle, dépendances
node --test tools/rea/tests/validation-compte.test.mjs
node --test tools/rea/tests/i18n-ui.test.mjs       # clés, doublons, marque, liens morts
node --test tools/rea/tests/confirmation.test.mjs   # retour de lien, ?echec= produit ET affiché
node --test tools/rea/tests/navigation.test.mjs     # 10 entrées, chaque href a sa page, estActif
node --test tools/rea/tests/rpc.test.mjs            # RPC mesurées, codes mesurés, migration R2
node --test tools/rea/tests/scan-camera.test.mjs    # caméra : contrat seul, RPC non touchée
```

Depuis `web/`, `npm test` lance **toute** la suite. Le chemin du script a été
corrigé le 2026-10-30 : il pointait vers `../../tools/rea/tests/`, c'est-à-dire
hors du dépôt, et `npm test` affichait « 0 test, 0 échec » — un contrôle qui ne
contrôle rien. Le compte est passé de 307 à 332 **parce que les tests ont
recommencé à tourner**, pas parce que 25 défauts ont été trouvés.

Aperçu visuel (le seul contrôle du **rendu**), sans compte dans la base :

```bash
cd web && npx next dev -p 2087     # http://localhost:2087/apercu
```

Et la preuve que cet aperçu **n'existe pas** en production :

```bash
FIDELIX_DIST_DIR=.next-build npx next build
FIDELIX_DIST_DIR=.next-build npx next start -p 2088   # /apercu → 404
rm -rf .next-build
```

Le test vérifie aussi que le vérificateur **sait échouer** (CSS synthétique :
`22px` → `20px` doit produire un divergent). Un contrôle qui ne peut pas échouer
ne contrôle rien.
