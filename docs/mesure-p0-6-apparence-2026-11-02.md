# `/branding` — module Apparence : ce que la cible fait, et ce que nous en avons fait

> Passe du **2026-11-02**, sur la capture authentifiée de A6 :
> `01_REA_Fidelix/_captures/2026-11-02-a6/rendu/a08-branding.html` (**200**,
> 103 581 o) et son chunk
> `.../raw/assets/_next_static_chunks_app__dashboard__branding_page-badcb0936c16a5ca.js`
> (39 680 o). Aucune nouvelle requête n'a été émise : tout ce qui suit se lit
> dans ces deux fichiers.

## 1. Ce que la page rend (DOM mesuré)

Ordre du document, à la lettre :

| # | Élément | Valeur mesurée |
|---|---|---|
| 1 | `h1` | « Apparence » |
| 2 | surtitre | « Votre DA » |
| 3 | chapeau | « Tout ce que vous changez ici apparaît aussitôt sur la carte, telle que vos clients la verront dans leur téléphone. » |
| 4 | aperçu | nom du commerce, « Ajoutez une image de fond », puis quatre lignes |
| 5 | aperçu, lignes | `PROCHAINE RÉCOMPENSE` / `MENU au choix` · `CODE CLIENT` / `C-4F2A91` · `POINTS` / `120` · `DEPUIS` / `octobre 2026` |
| 6 | légende | « Aperçu réel du pass Apple Wallet. La carte Google et la carte web reprennent les mêmes couleurs. » |
| 7 | section 1 | « 1 · Votre commerce » |
| 8 | champ | `label for="nom-carte"` → « Nom affiché sur la carte », `name="name"`, `placeholder` « Le nom que vos clients connaissent » |
| 9 | logo | bouton `aria-label="Ajouter un logo"`, aide « Carré de préférence · redimensionné automatiquement », `input[type=file][accept="image/*"]` |
| 10 | types | « Type d'établissement », aide « Sert d'icône tant que vous n'avez pas de logo. », **dix** boutons `aria-pressed` |
| 11 | section 2 | « 2 · Votre couleur », **huit** pastilles `aria-label="Couleur #…"`, `input[type=color]` `value="#f94c3a"`, `input[name="primary_color"]` |
| 12 | section 3 | « 3 · Le haut de la carte », « Image » / « Ajouter une image », aide « Affichée en haut de la carte. », `input[type=file][accept="image/*"]` |
| 13 | action | un **seul** `button[type=submit]` : « Enregistrer » |

Les dix types, dans l'ordre du DOM et du tableau `L` du chunk :

| valeur | libellé | emoji |
|---|---|---|
| `restaurant` | Restaurant | 🍽️ |
| `cafe` | Café | ☕ |
| `coiffure` | Coiffure | ✂️ |
| `barbershop` | Barbershop | 💈 |
| `pressing` | Pressing | 👔 |
| `retoucherie` | Retoucherie | 🧵 |
| `boucherie` | Boucherie | 🥩 |
| `patisserie` | Pâtisserie | 🥐 |
| `librairie` | Librairie | 📚 |
| `autre` | Autre | 🏪 |

Les huit couleurs, dans l'ordre du chunk : `#1a1a1a`, `#f94c3a`, `#1e3a5f`,
`#7c3aed`, `#be123c`, `#065f46`, `#92400e`, `#831843`.

## 2. Ce que le chunk dit, et que le DOM ne montre pas

- **Lecture** : `supabase.from("restaurants").select("*").eq("id", id).maybeSingle()`
  — donc `logo_url`, `wallet_bg_url`, `commerce_type`, `primary_color`,
  `name`, plus `style_bandeau`, `stamp_icon`, `stamps_total`.
  Le même effet de bord lit `loyalty_programs` (`type`, `stamps_total`,
  `stamp_icon`, `reward_description`) et le premier `reward_tiers` actif par
  `cost` croissant : c'est la ligne « PROCHAINE RÉCOMPENSE ».
- **Écriture** : `POST /api/branding/save` avec
  `{name, primary_color, commerce_type, logo_url?, wallet_bg_url?, style_bandeau, stamp_icon, stamps_total?}`.
- **Envoi de fichier** : `POST /api/branding/upload`, `FormData(file, kind)` où
  `kind ∈ {logo, background}`, réponse `{url}`. Trois erreurs distinctes côté
  cible : `imageIllisible`, `echecEnvoiLogo`, `echecEnvoiFond`.
- **Schéma zod** (client) : `name: min(2)`, `primary_color:
  /^#[0-9A-Fa-f]{6}$/`, `commerce_type?`, `style_bandeau: (tampons|photo)?`,
  `stamps_total: 2..30`.
- **Défauts** : `primary_color ?? "#1a1a1a"`, `commerce_type ?? "restaurant"`,
  `stamps_total ?? 10`.
- **Sections conditionnelles** : la section « 4 · Tampons par carte »
  (`stamps_total`, `stamp_icon`) et le choix « Les tampons / Votre photo »
  (`style_bandeau`) ne se rendent que pour un programme **à tampons**. La
  capture est un programme **à points** : la section 3 n'y porte que l'image, et
  l'aide est `imageAidePoints` (« Affichée en haut de la carte. »). L'aide
  alternative existe dans le chunk (`imageAideTampons` : « Visible si vous
  choisissez « Votre photo », ou au-delà de 12 cases. »).

## 3. Ce que nous avons livré

| Cible | Ici | Où |
|---|---|---|
| `restaurants.{logo_url, wallet_bg_url, primary_color, commerce_type}` | les mêmes colonnes sur `loyalty_programs` | `migrations/0015_apparence.sql` |
| lecture de la ligne | `apparence_du_commerce()` (json, `PROGRAM_NOT_FOUND`) | idem |
| `POST /api/branding/save` | `enregistrer_apparence(...)` — un `update` après cinq contrôles | idem |
| schéma zod | `refusApparence` / `couleurValide` / `urlImageValide` / `nomValide` | `web/src/lib/apparence.mjs` |
| aperçu vivant | `ApercuCarte` + état du formulaire | `web/src/components/apparence/` |
| 8 pastilles | 8 boutons `aria-pressed` (raccourcis) **et** un `input[type=color]` (champ réel) | `EditeurApparence.jsx` |
| 10 types | 10 `radio` dans un `fieldset`, style `.uc-choix` | idem |
| « Enregistrer » | une seule action serveur (`useActionState`), un seul bouton | `branding/actions.js` |

## 4. Écarts déclarés, chacun avec sa raison

1. **Pas d'envoi de fichier.** `POST /api/branding/upload` demande un espace de
   stockage et une clé de service : `web/.env.local` ne porte que l'URL et la
   clé anonyme. Les deux champs attendent donc une **adresse** (`https://…` ou
   `/…`), contrainte en base. L'écran le dit sous le champ
   (`page.apparence.envoiAbsent`). Conséquence mesurable : un commerçant sans
   hébergement ne peut pas changer son logo — c'est une limite, pas un oubli.
2. **Pas de section « 4 · Tampons par carte »**, ni `style_bandeau`, ni
   `stamp_icon`. Aucun écran d'ici ne dessine de grille de tampons : la caisse
   crédite des points (`award_loyalty_points`, sans paramètre de tampon). Un
   interrupteur que rien ne lit est le défaut que P0-4 a refusé pour
   `/automations`. **Décision produit du 2026-11-02 : refusé, pas reporté.**
   `P0-6b` est close, et l'option « Tampons » que `/rewards` proposait encore a
   été retirée — elle était le même interrupteur, déjà en place depuis `0003`.
3. **La légende de l'aperçu n'est pas celle de la cible.** « Aperçu réel du
   pass Apple Wallet » est faux ici : aucune classe PassKit n'existe (P0-5
   Wallet attend Apple). La légende dit ce qui est vrai — nom, logo, type et
   couleur réels ; code, points et date d'exemple.
4. **Le code, les points et la date de l'aperçu sont des exemples** (les valeurs
   mesurées), et la légende le dit. Aucune carte n'existe encore pour ce
   commerce au moment du réglage ; choisir « un » client réel serait un choix
   inventé.
5. **L'aperçu parle en points — la seule unité que ce socle compte.**
   `/rewards` ne propose plus « Tampons » : la valeur était stockée et lue par
   personne (`kind` n'a aucun lecteur dans `web/src`). Même cause que l'écart 2.
6. **Les huit pastilles sont des raccourcis, pas le champ.** Le champ réel est
   le nuancier natif : il s'envoie sans JavaScript, il accepte toute teinte. Les
   pastilles ne fonctionnent qu'avec JavaScript — c'est écrit dans l'aide de
   l'écran, pas seulement ici.

## 5. Preuves

- `tools/rea/tests/apparence.test.mjs` — **18 tests** : dix types et leur ordre
  (contre le chunk), huit couleurs (contre le chunk), bornes du nom (`min(2)`
  cité du chunk), adresses d'image, ordre des refus, lecture typée, aperçu
  (code et points confrontés à la capture), légende, cinq `name` du formulaire,
  codes `INVALID_*`, invalidation de cache, absence des champs non lus, trois
  sections et un seul bouton.
- `tools/rea/tests/migration-0015.test.mjs` — **9 tests** : colonnes rejouables,
  défauts mesurés, dix valeurs contraintes, motif de couleur et d'adresse,
  `PROGRAM_NOT_FOUND`, validation avant écriture, codes connus de
  `CODES_CONNUS`, `REVOKE` avant `GRANT`, `anon` jamais, une seule transaction.
- `tools/rea/tests/unite-programme.test.mjs` — **6 tests** : la constante
  `TYPE_PROGRAMME`, l'absence de tout `select`/`value="tampons"` sur `/rewards`,
  l'action qui n'écoute plus le formulaire, la phrase d'explication (et sa clé),
  les deux anciennes clés disparues, et un balayage de `web/src` qui refuse toute
  valeur `"tampons"` envoyable.
- Suite hors ligne : **727 tests / 0 échec / 1 ignoré** (`node --test`).
- `next build` : **exit 0**, `/branding` listée en route dynamique.

## 6. Ce qui n'a pas été observé

- **Le rendu authentifié de `/branding`.** Le conteneur local lit
  `sevqegfhmdezsqwvwsam`, la session du profil REA appartient à
  `rozagopjfkkblyxtjdgw` : la page répond `307 → /login` (la garde fait son
  travail), mais son corps n'a pas été vu à l'écran. Même dette que `/program`,
  `/settings` et `/notifications`.
- **`0015` n'est pas exécutée.** Tant qu'elle ne l'est pas, `/branding` affiche
  honnêtement « la base n'est pas encore migrée » avec le nom du fichier.
