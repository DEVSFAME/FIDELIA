---
type: rea
status: done
module: global
tags: [rea, fidelix, api, contrats, a2, a3, wallet]
updated: 2026-10-27
---

# Contrats d'API — A2 (écriture) et A3 (wallet), **lecture seule**

> **Périmètre tenu.** **Aucun POST n'a été émis**, aucun compte créé, aucune
> écriture tentée sur la production. Tout ce qui suit est lu dans des fichiers
> **déjà capturés**, plus, pour A3, **18 requêtes de lecture** (3 GET de page,
> 5 GET de sondage, 10 `OPTIONS`) sans effet de bord. Les routes d'écriture et
> les deux routes de **génération** de pass n'ont jamais été appelées.
>
> **A2** — contrats d'écriture : 65 bundles `_captures/2026-10-27-auth-s3/`.
> **A3** — contrat wallet : le bundle public de `/card/<cardId>`
> (`_captures/2026-10-27-a3/`), que S2/S3 n'avaient pas capturé.
>
> Reproductible :
> `node tools/rea/relever-contrats.mjs` (module `tools/rea/contrats.mjs`, 36 tests)
> et `node tools/rea/relever-wallet.mjs` (module `tools/rea/wallet.mjs`, 25 tests)
> — **135/135** au total, hors ligne.
> Sorties brutes : `_captures/2026-10-27-a2/contrats-bundles.json` et
> `_captures/2026-10-27-a3/{releve-wallet,mesure-a3}.json` (gitignorés).

## 1. Le décompte change — et pourquoi

S3 avait sondé **21 endpoints en GET** et en avait trouvé **12 en 405**
(*Method Not Allowed*). Le brief en a fait « les 12 endpoints POST ». C'était
**vrai pour la sonde**, pas pour l'application.

Les bundles authentifiés déclarent **28** endpoints POST. Les deux ensembles
se recoupent sur **11**.

| Ensemble | Preuve | Cardinalité |
|---|---|---|
| A — sondé en GET, 405 | réponse serveur (S3) | **12** |
| B — déclaré en POST | code client (A2) | **28** |
| A ∩ B | les deux | **11** |
| B − A | code client seulement | **17** |
| A − B | sonde seulement | **1** (`/api/demarrer`) |

**Ce que ça dit.** La sonde 405 ne pouvait trouver que ce qu'elle avait
essayé. Les 17 endpoints qu'elle n'a jamais touchés existent bel et bien :
ils sont appelés par les pages du dashboard capturées. Inversement
`/api/demarrer` est **prouvé POST** par son 405 mais n'apparaît dans aucun
bundle de ce corpus — il appartient au parcours public, non capturé ici.

⇒ Le chiffre « 12 » était un **plancher mesuré**, pas un inventaire.

## 2. Méthode : quatre sondes, chacune calibrée

Le module expose quatre lectures indépendantes, du plus fort au plus faible :

| Sonde | Ce qu'elle lit | Ce qu'elle prouve |
|---|---|---|
| `manifestes` | `{path:"/api/x",method:"POST"}` | une **déclaration** explicite de méthode (garde Next) |
| `methodesDeclarees` | `fetch("/api/x",{method:"POST"})` | un **site d'appel** réel |
| `routesIndirectes` | `route:"/api/x"` + `fetch(<o>.route,{method:"POST"})` | appel indirect, **même fichier** |
| `aidesIndirectes` | `F("/api/x",…)` où `F` fait `fetch(e,{method:"POST"})` | helper générique |

Le **genre** est conservé par contrat : une preuve indirecte ne vaut pas une
preuve directe, et les tableaux du §3 le disent colonne par colonne.

### 2.1 Les témoins (rejoués à chaque lancement)

| Témoin | Attendu | Constaté |
|---|---|---|
| `/api/commerce/actif` | trouvé, **GET** | trouvé, GET |
| `/api/transaction` | classé **POST** | POST, genre `fetch` |
| `/api/liste-attente` | genre **`manifeste`** | `manifeste` |
| `/api/broadcast` (leurre) | littéral présent, **aucun contrat** | 1 bundle, contrat : aucun |
| `/api/zzz-temoin-rea-inexistant` | **jamais** présent | non sorti |

`VERDICT : calibré` — 0 écart. Si un témoin tombe du mauvais côté, la CLI sort
en **exit 3** et refuse de conclure.

### 2.2 Deux faux positifs mesurés, encodés en tests

1. **`method:"POST"` n'est pas un POST Fidelix.** Le chunk `7383` en contient
   **7**, tous dans **supabase-js** : `.insert()` construit
   `new R({method:"POST",url:s,…})`, la diffusion realtime, le client Iceberg.
   Compter naïvement aurait fabriqué 7 endpoints fantômes. La règle retenue
   n'accepte un POST que si **l'argument 0 d'un `fetch(` contient un `/api/…`**.
2. **Un littéral n'est pas une route.** `/api/broadcast` est présent dans ce
   même chunk comme **chemin de websocket** — et la route répond **404**
   (mesuré en S3). La CLI distingue donc « littéral vu » de « contrat
   déclaré », et le rapport affiche les deux séparément.

> C'est la leçon §17 appliquée : un instrument qui se trompe toujours du même
> côté est indiscernable d'un fait. On le calibre avec un cas dont la réponse
> est connue **avant** de sonder.

### 2.3 Deux pièges de lecture, corrigés parce que mesurés

- **Un décalage d'un caractère fausse tout.** `lireObjet` commençait à balayer
  *sur* l'accolade ouvrante : la profondeur ne revenait jamais à zéro, aucun
  corps n'était extrait, et le silence ressemblait à « pas de corps ». Trois
  tests couvrent ce cas.
- **Une URL n'est pas toujours un littéral nu.** La caisse écrit
  `fetch("cadeau"===e?"/api/caisse/cadeau-filleul":"/api/caisse/parrainage-valide",…)`.
  La première version, qui n'acceptait qu'un littéral en tête d'argument,
  **perdait silencieusement deux endpoints**. Corrigé : tous les `/api/…` de
  l'argument 0 reçoivent la méthode. Deux tests de non-régression.

## 3. Les 28 contrats POST

`G` = genre de preuve (`M`anifeste, `F`etch, `R`oute, `A`ide). La colonne
« corps » liste les **clés de premier niveau** telles que le code les écrit ;
`?{…}` / `:{…}` = branches d'un ternaire qui s'excluent ; `+{x}` = clé ajoutée
par un `...spread` conditionnel ; `k[]{…}` = tableau d'objets ; **†** = lu à la
main dans une indirection que le module refuse de deviner (voir §5.1).

| # | Endpoint | G | Corps lu dans le code |
|---|---|---|---|
| 1 | `/api/auth/reinitialiser` | M | *(corps non lisible — §5.1)* |
| 2 | `/api/automations/save` | F | `?{type,is_active,message,days}` · `?{type,is_active,titre,message,jours}` · `:{type,is_active,remaining}` |
| 3 | `/api/billing/pack-emails` | F | `{supplement}` |
| 4 | `/api/billing/resiliation` | F | `?{action,raison}` · `:{action}` |
| 5 | `/api/branding/save` | F | `{name,primary_color,commerce_type,+logo_url,+wallet_bg_url,style_bandeau,stamp_icon,+stamps_total}` |
| 6 | `/api/branding/upload` | F | **FormData** : `file`, `kind` |
| 7 | `/api/caisse/appairer` | R | † `{code}` |
| 8 | `/api/caisse/cadeau-filleul` | F | `{cardId}` |
| 9 | `/api/caisse/parrainage-valide` | F | `{cardId}` |
| 10 | `/api/caisse/reviews` | F | `{claimId,action}` |
| 11 | `/api/caisses/appairage` | A | † `{id}` |
| 12 | `/api/caisses/create` | A | † `{label}` |
| 13 | `/api/caisses/revoke` | A | † `{id}` |
| 14 | `/api/commerce/select` | F | `{commerceId}` |
| 15 | `/api/email/welcome` | M | *(corps non lisible — §5.1)* |
| 16 | `/api/equipe/activer` | R | † `{code}` |
| 17 | `/api/equipe/managers` | F | POST `{restaurantId,label}` · **DELETE** `body:JSON.stringify(e)` (variable) |
| 18 | `/api/liste-attente` | M | *(corps non lisible — §5.1)* |
| 19 | `/api/notifications` | F | `{restaurant_id,title,body,cta_url}` |
| 20 | `/api/payments/payzone/initiate` | F | `{purpose}` · `{purpose,pack_emails}` · `{purpose,rythme,points_de_vente,confirmer}` |
| 21 | `/api/program/save` | F | `{reward_description,reward_threshold,points_per_purchase,min_purchase_mad,stamps_total,points_expiry_days,referral_reward,review_reward_enabled,review_reward,google_review_url,stamp_icon,devise,+deduction_libre}` |
| 22 | `/api/push/subscribe` | M | *(corps non lisible — §5.1)* |
| 23 | `/api/reviews/claims` | F | `{claimId,action}` |
| 24 | `/api/rewards/save` | F | `{tiers[]{id,title,description,cost}}` |
| 25 | `/api/settings/password` | F | `{currentPassword,newPassword}` |
| 26 | `/api/settings/save` | F | `{name,type_activite,phone,address,city,description,site_url,instagram_url,facebook_url,tiktok_url,reservation_url,lien_localisation,geofence_radius_m,geofence_texte}` |
| 27 | `/api/transaction` | F | `{card_id,type,amount_mad,client_operation_id}` · `{card_id,type,amount_mad,reward_tier_id,points,client_operation_id}` |
| 28 | `/api/transaction/annuler` | F | `{transaction_id}` |

**19 corps relevés automatiquement**, **5 de plus lus à la main** (†) — soit
**24 sur 28**. Les quatre restants sont déclarés sans corps lisible ici (§5.1).

### 3.1 Quatre contrats qui décident de l'architecture

**`/api/transaction` — deux corps, un seul type d'opération à la fois.**
`type` ∈ `add_stamp` | `earn_points` | `redeem_points`. Le champ
`client_operation_id` est un `crypto.randomUUID()` **seulement** pour
`add_stamp` et `earn_points` :

```js
let a = "add_stamp"===e || "earn_points"===e
let s = a ? crypto.randomUUID() : void 0      // rien pour redeem_points
```

⇒ **L'émission est idempotente, la consommation ne l'est pas.** C'est un choix
de conception, pas un oubli : consommer deux fois ne peut pas être neutralisé
par une clé. Utiliser directement le même UUID pour les trois serait un
contresens sur le modèle.

**`/api/transaction` — la file hors ligne a sa propre politique.**
Le rejeu (`6866`) traite `new Set([400,403,404,422])` comme « certainement
refusé ⇒ on jette l'élément », `ok` ⇒ « on retire », tout le reste (dont 5xx et
réseau) ⇒ **on garde et on s'arrête**. `tentatives>=3` alimente le compteur
`bloquees`. Preuve directe pour A4, lue et non supposée.

⇒ **La mécanique de cette file** (magasins, forme des éléments, identité,
FIFO, minuteur, cache de cartes, messages hors ligne) est mesurée en **A4** :
`01_REA_Fidelix/Global/Fidelix_Caisse.md`. Ce paragraphe-ci ne dit que la
politique ; l'autre dit où et quand.

**`/api/equipe/managers` — le même chemin porte deux méthodes.** POST crée une
invitation et renvoie `{invitation:{label},code,expireLe,lien}` ; DELETE retire
un manager. Un routeur qui ne mappe qu'une méthode par chemin perd la moitié du
contrat.

**`/api/rewards/save` — le client envoie la liste entière, pas un delta.**
`{tiers:[{id,title,description,cost}]}` avec `description` normalisée
(`.trim() || null`) et `cost` passé par `Number()`. Le serveur reçoit donc un
**état complet** : le clone devra traiter l'absence d'un palier comme une
suppression, ou refuser la requête — c'est un choix à trancher en R3.

### 3.2 Les sept GET (pour mémoire, ils ne sont pas des contrats d'écriture)

`/api/commerce/actif` (7 bundles, `cache:"no-store"`), `/api/fidelia`,
`/api/fidelia?resume=1`, `/api/scan/cards`, `/api/scan/card?id=`,
`/api/email/campaign`, `/api/equipe/managers?restaurantId=`.

Un `fetch` **sans** `method` vaut GET : la sonde ne l'a pas inventé, elle lit
l'absence. C'est pour ça que `/api/commerce/actif` est classé GET alors qu'il
n'écrit jamais `method:"GET"`.

**Trois GET de plus, trouvés en A3** — hors dashboard, donc hors de ce corpus :
`/api/wallet/apple/<cardId>`, `/api/wallet/apple/<cardId>/statut`,
`/api/wallet/google/<cardId>`. Ce ne sont pas des contrats d'écriture, mais ce
sont des contrats : ils sont décrits au **§5.4**.


## 4. Les schémas de validation côté client (zod)

Zod **est** dans le bundle client : le chunk `5125`, module `10822`. Ses
exports y sont renommés, et la table de correspondance a été **lue dans le
bundle**, pas devinée :

| Alias | Définition lue | Signification |
|---|---|---|
| `Ik` | `()=>eZ`, `eZ=…` | `z.object` |
| `Yj` | `()=>ex` | `z.string` |
| `k5` | `()=>eS`, `eS=eo.create` | `z.enum` |
| `eu` | `()=>eA`, `eA=el.create` | `z.literal` |
| `au` | `()=>eT` (`{string,number,boolean,…}` coerce) | `z.coerce` |
| `zM` | `()=>ew`, `ew=L.create` | `z.boolean` |
| `vk` | `()=>eC`, `eC=eh.createWithPreprocess` | `z.preprocess` |

Lecture faite par `schemasClient()` : `X = <mod>.Ik({ … })`. **5 schémas**
trouvés, tous branchés sur `react-hook-form` (`resolver:(0,l.u)(X)`).

### 4.1 `P` — branding (`/api/branding/save`)

```js
z.object({
  name: z.string().min(2),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  commerce_type: z.string().optional(),
  style_bandeau: z.enum(["tampons","photo"]).optional(),
  stamps_total: z.coerce.number().min(2).max(30).optional(),
})
```

Le serveur reçoit donc un corps **validé côté client** : couleur hexadécimale
stricte à 6 chiffres, bandeau limité à deux valeurs, `stamps_total` entre 2 et
30. Un clone qui n'applique pas ces bornes acceptera des états que l'original
refuse — et inversement.

### 4.2 `C` — notifications (`/api/notifications`)

```js
z.object({
  title: z.string().min(3, "Titre trop court").max(50, "Titre trop long (50 caractères max)"),
  body: z.string().min(10, "Message trop court").max(150, "Message trop long (150 caractères max)"),
  cta_url: z.string().url("URL invalide").optional().or(z.literal("")),
})
```

`cta_url` accepte **l'URL valide OU la chaîne vide** — deux états, pas un
« optionnel » vague. Les messages d'erreur sont **en français et destinés à
l'utilisateur** : ce sont des libellés d'interface, donc à parité en R3.

### 4.3 `R` — programme de fidélité (`/api/program/save`)

```js
z.object({
  reward_description: z.string().min(3, "Requis"),
  reward_threshold: z.coerce.number().min(1),
  points_per_purchase: z.coerce.number().min(0).optional(),
  min_purchase_mad: z.coerce.number().min(0).optional(),
  stamps_total: z.coerce.number().min(2).max(30).optional(),
  points_expiry_days: z.coerce.number().min(0).optional(),
  referral_reward: z.coerce.number().min(0).max(1e4).optional(),
  review_reward_enabled: z.boolean().optional(),
  review_reward: z.coerce.number().min(0).max(1e4).optional(),
  google_review_url: z.string().url("Lien invalide").refine(M.cD,{message:M.O0}).or(z.literal("")).optional(),
  stamp_icon: z.string().nullable().optional(),
  devise: z.enum(O.I9).optional(),
  deduction_libre: z.boolean().optional(),
})
```

Puis un `superRefine` **conditionnel** — c'est lui qui porte la règle métier :

```js
.superRefine((e,t)=>{
  e.review_reward_enabled && (
    (0,M.cU)(e.google_review_url) || t.addIssue({path:["google_review_url"], ...}),
    (e.review_reward ?? 0) < 1       && t.addIssue({path:["review_reward"], ...})
  )
})
```

⇒ **Activer le bonus d'avis exige un lien Google valide ET une récompense ≥ 1.**
Deux champs deviennent obligatoires ensemble, décision qui n'est visible ni dans
le corps envoyé ni dans le modèle de données. `refine(M.cD)` et `enum(O.I9)`
prennent leurs valeurs dans des modules partagés : le prédicat exact reste
**non résolu** (voir §5.1).

### 4.4 `_` — mot de passe (`/api/settings/password`)

```js
z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(8, "8 caractères minimum")
                 .regex(/[A-Z]/, "Une majuscule requise")
                 .regex(/[0-9]/, "Un chiffre requis"),
  confirmPassword: z.string(),
})
.refine(e => e.newPassword === e.confirmPassword,
        { path:["confirmPassword"], message:"Les mots de passe ne correspondent pas" })
```

**`confirmPassword` n'est pas envoyé** : le corps POST ne porte que
`{currentPassword,newPassword}`. Le champ n'existe que pour la validation
côté client — un clone qui l'enverrait élargirait le contrat sans nécessité.

La page applique **une seconde barrière** que zod ne peut pas porter : un
contrôle « mot de passe trop courant » contre une liste de fuites connues,
**avant** l'appel réseau.

### 4.5 `T` — réglages (`/api/settings/save`)

```js
z.object({
  name: z.string().min(2),
  type_activite: z.enum(["physique","en_ligne","mixte"]),
  phone, address, city, description, site_url, instagram_url,
  facebook_url, tiktok_url, reservation_url, lien_localisation:
      z.string().optional(),                       // 10 champs libres
  geofence_radius_m: z.preprocess(
      e => (e===""||e==null ? undefined : e),
      z.coerce.number().int().min(50).max(2e3).optional()),
  geofence_texte: z.string().max(120).optional(),
})
```

`geofence_radius_m` est le cas intéressant : un `<input type="number">` renvoie
**la chaîne vide** quand il est vidé. Sans le `preprocess`, `z.coerce.number()`
lirait `0` et le `min(50)` refuserait — l'utilisateur verrait une erreur sur un
champ qu'il croyait facultatif. Le `preprocess` transforme `""` en `undefined`.
C'est un détail de contrat, pas de style.

### 4.6 Ce que les schémas ne couvrent PAS

Sur 28 contrats POST, **5 seulement** ont un schéma client. Les 23 autres
envoient des corps **non validés par zod dans le navigateur** : la caisse
(`transaction`, `caisse/*`), la caisse (`caisses/*`), les campagnes,
l'équipe, le parrainage, la facturation. Deux lectures possibles, et je ne
tranche pas sans le serveur :

1. la validation est **entièrement côté serveur** pour ces routes (probable
   pour `transaction`, qui est le cœur métier) ;
2. ou elle est **absente**, et le corps n'est borné que par PostgREST/Postgres.

**Aucune des deux n'est prouvée.** Ce qui est prouvé : ce n'est pas le
navigateur qui les valide.


## 5. Ce qui reste explicitement inconnu — sauf le wallet (§5.4)

> **Exception, ajoutée en A3.** Les §5.1 à §5.3 et §5.5 listent ce qui n'est
> **pas** établi. Le **§5.4** est l'inverse : c'est le seul contrat **trouvé**
> après A2, et il a changé de client (le client final, pas le commerçant). Il
> garde son numéro parce que c'est là qu'A3 devait l'écrire, mais il ne
> ressemble pas aux autres sections de ce chapitre.

### 5.1 Quatre corps non construits dans ce corpus

Le relevé automatique n'associe pas **cinq** corps qu'on lit pourtant à l'œil :
les deux routes en `fetch(<o>.route,…)` et les trois appels du helper `F(url,corps)`.
Ils sont donc portés au tableau §3 avec **†**, et vérifiés un par un :

| Endpoint | Corps | Où |
|---|---|---|
| `/api/caisse/appairer` | `{code}` | `fetch(a.route,{method:"POST",body:JSON.stringify({code:e})})` — code de 6 chiffres (`Array(6)`), destination `/caisse` |
| `/api/equipe/activer` | `{code}` | même fonction, destination `/dashboard` |
| `/api/caisses/create` | `{label}` | `F("/api/caisses/create",{label:y.trim()})` |
| `/api/caisses/appairage` | `{id}` | `F("/api/caisses/appairage",{id:t})` |
| `/api/caisses/revoke` | `{id}` | `F("/api/caisses/revoke",{id:t})` |

Pourquoi le module les rate, et pourquoi c'est **volontaire** : le helper est
générique (`fetch(e,{method:"POST",body:JSON.stringify(t)})`). Relier un appel à
son helper est une inférence ; plusieurs appelants le partagent, et une
correspondance devinée fabriquerait un faux contrat. Le relevé automatique s'en
tient donc à ce qui est **prouvé sans inférence**, et la doc porte le reste à la
main, marqué.

Il reste **quatre** corps réellement inconnus, tous des routes publiques dont le
bundle n'est pas dans ce corpus :

| Endpoint | Genre de preuve | Pourquoi |
|---|---|---|
| `/api/auth/reinitialiser` | manifeste | parcours `/login`, non capturé ici |
| `/api/email/welcome` | manifeste | idem |
| `/api/liste-attente` | manifeste | idem |
| `/api/push/subscribe` | manifeste | idem |

Ces quatre-là sont **déclarés POST** par le manifeste de garde Next du chunk
`main-app` — méthode prouvée, corps non. Ne pas les confondre avec des
endpoints non relevés.

### 5.2 `/api/demarrer`

Prouvé **POST** par un 405 (S3), **absent de tous les bundles de ce corpus**.
Il appartient au parcours d'inscription (public). Corps inconnu, et il le reste.

### 5.3 Les signatures RPC — trois sur sept sont maintenant connues

A1 avait nommé **six** RPC sans pouvoir en donner une seule **signature** (la
sonde `GET /rest/v1/rpc/<nom>` ne discrimine rien) ; A2 y a ajouté
`join_loyalty_program`, lu dans un bundle public. A3 a lu **trois signatures**
aux sites d'appel, sans émettre un seul POST :

| RPC | Signature mesurée | Site d'appel |
|---|---|---|
| `join_loyalty_program` | 11 paramètres, 5 conditionnels (ci-dessous) | page `/join/<slug>` |
| `taux_desinscription_wallet` | `{ p_restaurant_id, p_jours }` | page Notifications |
| `notifications_envoyees_aujourdhui` | `{ p_restaurant_id }` | page Notifications |

La plus riche, et la seule à arguments conditionnels :

```
join_loyalty_program({
  p_restaurant_id, p_program_id, p_email?, p_marketing_consent,
  p_first_name?, p_last_name?, p_ref_code?, p_till_session_id?,
  p_birthdate?, p_consentement_cndp: true, p_consentement_version
})
```

`p_email` n'est envoyé que si l'emailing est actif, `p_first_name`/`p_last_name`
que si le commerce les exige, `p_ref_code` que si un parrainage est présent.
`p_consentement_cndp` est **toujours** `true` et `p_consentement_version` vient
d'une constante du bundle : le consentement n'est pas optionnel côté client.

Et le serveur **parle** : le client teste trois messages qui encodent des règles
métier invisibles ailleurs — `date_naissance_requise`, `nom_requis`,
`nom_invalide` (« Prénom ou nom trop long : 60 caractères au plus »). Ce sont des
**noms de codes serveur**, pas de la prose d'interface : ils sont reproductibles.

Restent de **signature inconnue** : `classement_caisses`,
`mon_role_point_de_vente`, `parrainages_du_commerce`, `journal_operateur`.

### 5.4 Le contrat wallet — mesuré le 2026-10-27 (A3)

**Ce qu'A2 avait écrit, et ce qui manquait.** « Aucun endpoint de génération de
pass n'est appelé par *le dashboard* » — exact, et insuffisant : le dashboard
n'**installe** pas de pass, le client si. Le parcours mesuré est :

```
/join/<slug>  →  supabase.rpc("join_loyalty_program")  →  router.push("/card/<id>")
                                                          (après 1200 ms)
/card/<cardId>  →  deux boutons  →  window.location.href = "/api/wallet/…"
```

La page carte est **publique** (200 sans cookie) ; c'est elle qui porte le
contrat. Son bundle, `app/card/%5BcardId%5D/page-198959bafc7eadc0.js`
(34 120 o, sha256 `12b1f7db…21c611`), est archivé dans
`_captures/2026-10-27-a3/raw/assets/`.

#### Les trois routes

| Route | Méthode | Genre d'appel | Rôle | Preuve |
|---|---|---|---|---|
| `/api/wallet/apple/<cardId>` | **GET** | `window.location.href=` | la réponse **est** le fichier de pass | code + `OPTIONS` 204 `Allow: GET, HEAD, OPTIONS` |
| `/api/wallet/apple/<cardId>/statut` | **GET** | `fetch(…,{cache:"no-store"})` | `{ajoutee: boolean}` | code + **200 mesuré** |
| `/api/wallet/google/<cardId>` | **GET** | `window.location.href=` | redirection d'ajout Google | code + `OPTIONS` 204 `Allow: GET, HEAD, OPTIONS` |

Trois choses que le **genre d'appel** décide, et qu'un simple relevé d'URL
aurait perdues :

1. **Les deux routes de génération sont des navigations, pas des `fetch`.** Le
   navigateur *quitte* la page ; il n'y a pas de JSON à lire. Un clone qui les
   appellerait en `fetch` ne déclencherait rien côté iOS.
2. **Il n'y a pas de `/statut` Google.** Le code ne l'appelle pas ; le serveur
   répond **404** sur `/api/wallet/google/<id>/statut` (mesuré). L'asymétrie est
   donc dans les deux sens, pas un oubli de lecture.
3. **Le retour d'échec est un paramètre d'URL** : au chargement,
   `?wallet=erreur` déclenche « L'ajout au Wallet n'a pas abouti. Réessayez dans
   un instant. » puis le paramètre est retiré par `history.replaceState`. Le
   client *attend* donc que la route de génération redirige vers
   `/card/<id>?wallet=erreur` en cas d'échec — **attendu par le code, non
   mesuré** (on n'a pas provoqué d'échec).

#### Un quatrième verbe, sur la page elle-même : `HEAD /card/<cardId>`

Le parcours d'entrée ne se contente pas d'afficher la carte : quand un
`localStorage["fidelix-carte-<restaurantId>"]` existe, `/join/<slug>` fait

```
fetch("/card/".concat(id), { method: "HEAD", cache: "no-store" })
  → si 404 : la carte n'existe plus, on efface la clé et on réaffiche le formulaire
```

C'est la **seule** vérification d'existence côté client, et elle explique le
`HEAD` présent dans l'`Allow` mesuré plus bas. Le clone devra donc répondre un
**404 sec** en `HEAD` pour une carte inconnue — ce que le 200/404 de `GET`
garantit déjà ici (contraste mesuré : UUID réel 200, UUID nul 404).


`OPTIONS` n'exécute pas le handler `GET` : c'est le seul moyen de prouver
l'existence d'une route de **génération** sans en demander une. Mais
l'instrument ment d'un seul côté (lesson §17) : sous `/api/`, **hors
`/api/wallet`**, le middleware répond **401 aussi bien pour une route existante
que pour une route inexistante**.

| Cible | `OPTIONS` | `Allow` | Lecture |
|---|---|---|---|
| `/api/commerce/actif` (témoin positif) | 401 | — | masqué par le middleware |
| `/api/zzz-temoin-rea-inexistant` (témoin négatif) | **401** | — | **identique au positif** ⇒ non discriminant |
| `/api/wallet/zzz-inexistant` | 404 | — | négatif **propre** à la sous-namespace |
| `/api/wallet/apple` (sans segment) | 404 | — | `[cardId]` obligatoire |
| `/api/wallet/apple/<uuid>` | **204** | `GET, HEAD, OPTIONS` | **route existante**, et **hors middleware** |
| `/api/wallet/google/<uuid>` | **204** | `GET, HEAD, OPTIONS` | idem |

Sans le témoin négatif, on aurait conclu « `/api/commerce/actif` n'existe
pas ». Et le 204 est **indépendant de l'identifiant** : il prouve la route,
jamais la ressource (leçon §16, appliquée à `OPTIONS`).

#### La forme de la réponse de statut

| Cible | Statut | Corps |
|---|---|---|
| `/api/wallet/apple/<uuid réel>/statut` | 200 | `{"ajoutee":true}` |
| `/api/wallet/apple/<uuid nul>/statut` | **200** | `{"ajoutee":false}` |
| `/api/wallet/google/<uuid réel>/statut` | 404 | page HTML Next |

**Un UUID qui n'existe pas répond 200 `{ajoutee:false}`.** Donc `false` ne
signifie pas « carte inconnue » : ce n'est pas un discriminant d'existence, et
le clone ne doit pas en faire un.

Le `true` dit autre chose d'utile : pour cette carte, **le pass Apple est
réellement enregistré côté serveur**. Le circuit n'est pas une maquette.

#### Où la génération vit : serveur, et c'est prouvé par les données

- Le portail des boutons vient de **props serveur** (`walletEnabled`,
  `googleWalletEnabled` dans le payload RSC de la page carte).
- Ces deux noms **ne sont dans aucune colonne mesurée** : ni les **34** de
  `restaurants`, ni les **23** de `loyalty_programs` (A1). Le portail est donc
  **calculé** par le serveur à partir de quelque chose qui n'est pas exposé —
  typiquement la présence d'un certificat Apple Pass Type / d'un identifiant
  Google Wallet. **Non prouvé**, mais l'absence dans le modèle est mesurée.
- Les **données** du pass, elles, sont bien des colonnes de `restaurants` :
  `wallet_bg_url`, `message_wallet`, `message_wallet_le`. Une seule a un site
  d'écriture client : `wallet_bg_url` dans `/api/branding/save` (§3).
  **`message_wallet` n'a aucun site d'écriture dans le corpus** : son écriture
  est serveur-only ou n'existe pas. À ne pas inventer en R4.
- `pkpass`, `passTypeIdentifier`, `webServiceURL`, `authenticationToken`,
  `walletobjects`, `wallet.google`, `passes.apple`, `apple.com/pass` :
  **0 occurrence** dans les 114 bundles des trois corpus. Le format du pass ne
  s'écrit pas dans le navigateur — cohérent avec un certificat serveur, et
  c'est tout ce que le corpus permet de dire.

#### La mesure qui prouve que les pass vivent ailleurs

Le dashboard n'affiche pas les pass, mais il **compte les désabonnements** :

```
supabase.rpc("taux_desinscription_wallet", { p_restaurant_id, p_jours: 7 })
```

(page Notifications). Signature **lue au site d'appel**, pas devinée. Un taux de
désinscription suppose des inscriptions : le serveur sait, le client ne fait
que compter.

#### Ce que le corpus ne peut pas dire, par construction

Les endpoints **PassKit** (`/v1/devices/…/registrations/…`, `/v1/passes/…`,
`/v1/log`) sont appelés par **iOS**, pas par le navigateur. Aucun bundle ne les
contiendra jamais. Il en va de même du contenu du `.pkpass` et de son
`content-type`. Pour les obtenir il faudrait **générer un pass** — ce qui n'est
pas une lecture. **Non fait, et c'est volontaire.**

#### Sécurité : constat, pas verdict

Les deux routes de génération sont **publiques** — c'est mesuré, pas supposé :
`OPTIONS` rend **204** là où les autres routes `/api/*` testées rendent **401**,
et `/api/wallet/zzz-inexistant` rend **404** (et non 401), donc la
sous-arborescence `/api/wallet` est **hors middleware**. Elles sont aussi **sans
jeton** : la seule clé est le `cardId`, un UUID qui figure dans l'URL publique de
la carte. Toute personne disposant de cette URL peut demander le pass. Ce n'est
pas une faille *démontrée* — le pass d'une carte n'a peut-être aucun secret à
protéger — mais c'est le modèle d'accès mesuré, et il doit être signalé au
client avant toute reprise.

#### Le comptage, refait et corrigé

A2 écrivait « `wallet` 30 fois, dont **26** dans auth-js ». Le second chiffre
était faux : c'est **20**. Relevé reproductible
(`node tools/rea/relever-wallet.mjs`), **sans double comptage** — `wallet` est
contenu dans `wallet_bg_url`, `walletEnabled`, `Apple Wallet` et
`/api/wallet/`, et compter chaque jeton séparément gonflait le total :

| Corpus | Occurrences | Dont supabase `auth-js` |
|---|---|---|
| `2026-10-26` anonyme (48 bundles) | 21 | 20 (dont 2 hors chaîne : `{wallet:w}`) |
| `2026-10-27-auth-s3` (65 bundles) | 30 | 20 |
| `2026-10-27-a3` chunk carte (1) | 21 | 0 |
| **Total** | **72** | **40** |

Rôles dans le corpus authentifié (les 30) : **20 dans supabase `auth-js`**
(18 messages de bibliothèque + 2 hors chaîne, `{wallet:w}`), et **10 dans les
pages** — 7 prose d'interface, 2 `champ` (`wallet_bg_url` ×2), 1 `mesure`
(`taux_desinscription_wallet`), **0 route**. Les 3 routes n'apparaissent que
dans le corpus A3 — celui que S2/S3 n'avaient pas capturé.

> Leçon inchangée : un mot-clé n'est pas un sujet. Ce qui a changé, c'est
> qu'on a cherché **là où le client installe**, pas là où le commerçant regarde.

> C'est le même piège qu'au §2.2 : un comptage de mots-clés sans classement
> d'origine fabrique une conclusion. `wallet` compté naïvement aurait dit
> « le wallet est partout » ; classé, il dit « auth-js, un champ, une phrase ».

### 5.5 Les réponses

Ce document décrit des **requêtes**. Les réponses ne sont connues que là où le
code les déstructure :

| Endpoint | Réponse lue dans le code |
|---|---|
| `/api/transaction/annuler` | `{newPoints,newStamps,message?\|error?}` |
| `/api/equipe/managers` (POST) | `{invitation:{label},code,expireLe,lien}` |
| `/api/reviews/claims`, `/api/caisse/reviews` | `{error?}` + `refresh()` de la page |
| `/api/rewards/save` | `{tiers:[{id,title,description,cost}]}` |
| `/api/caisses/create` | `{error?}` ; `appairage` → `{code}` ; `revoke` → `{error?}` |
| `/api/notifications` | `{blocked?,reason?,quota_atteint?,error?}` |
| `/api/caisse/cadeau-filleul` | `{remisLe}` ; `parrainage-valide` → `{valideLe}` |
| `/api/payzone/initiate` | `{…}` validé par un prédicat client ; `409` + `error:"paiement_en_cours"` |

Ce sont des **formes déstructurées**, pas des schémas complets : un champ
supplémentaire dans la réponse ne serait pas visible.

## 6. Conséquences pour la reconstruction

**R2 (caisse) est le poste le plus contraint, et c'est maintenant chiffré.**

1. **Idempotence asymétrique** (§3.1) : `client_operation_id` pour l'émission,
   rien pour la consommation. Le clone doit reproduire cette asymétrie, pas la
   « corriger » — sinon il autorise un double débit que l'original empêche.
2. **Politique de rejeu déjà écrite** : `{400,403,404,422}` ⇒ jeter,
   `ok` ⇒ retirer, autre ⇒ garder et s'arrêter, `tentatives>=3` ⇒ signaler.
   A4 n'a plus qu'à confirmer cette lecture par l'UI, pas à l'inventer.
3. **Un chemin, deux méthodes** (`/api/equipe/managers` POST+DELETE) : le
   routeur du clone doit le prévoir dès le départ.
4. **`/api/rewards/save` envoie l'état complet** : la sémantique de suppression
   implicite est une décision à prendre explicitement en R3.

**R3 (dashboard)** : 12 modules, **23 contrats POST**. Quatre pages portent
5 schémas zod, dont un `superRefine` conditionnel (§4.3) qui encode une règle
métier invisible ailleurs. Parité = mêmes bornes, mêmes messages, même
comportement du `cta_url` vide.

**Le corps n'est pas le contrat complet.** `transaction` envoie 5 ou 6 clés
selon l'opération ; `payzone/initiate` en a **trois variantes** (`point_de_vente`,
`pack_emails`, `subscription`) discriminées par `purpose`. Un type unique avec
tout optionnel serait plus simple — et faux.

**R4 (public) gagne trois contraintes mesurées.**

1. **`/card/<cardId>` est le vrai point d'entrée du wallet** (§5.4), pas le
   dashboard. Un clone qui n'implémente pas cette page n'a pas de wallet, même
   s'il a des boutons ailleurs.
2. **Les deux routes de génération sont des navigations et exigent un
   certificat.** Pas de `.pkpass` sans certificat Apple Pass Type ; pas de lien
   Google sans identifiant d'émetteur. Le clone doit prévoir un mode « wallet
   non configuré » — l'original en a un, avec un texte dédié (« L'intégration
   Apple Wallet sera activée très prochainement par votre restaurateur ») et des
   boutons qui n'appellent rien. Ce n'est pas une erreur à corriger : c'est un
   état à reproduire.
3. **Le portail est calculé côté serveur** : `walletEnabled` /
   `googleWalletEnabled` ne sont pas des colonnes. La reconstruction doit
   décider *où* vit ce calcul, et le documenter — sinon la valeur sera
   recopiée d'un `.env` en dur.

## 7. Limites de cette étape

- **Aucun POST** : ce qui n'est pas dans le code client n'est pas ici. Les
  validations serveur restent invisibles (§4.6).
- **Corpus A2 = bundles authentifiés S3**, 65 fichiers. Le parcours public
  (`/login`, `/register`, `/demarrer`, `/rendez-vous`) n'y est pas : ses corps
  manquent, dont `/api/demarrer`.
- **Corpus A3 = page carte publique**, 1 bundle + la page rendue. Ce qui n'y est
  pas : le **contenu du `.pkpass`**, son `content-type`, et les endpoints
  **PassKit** que seul iOS appelle. Obtenables uniquement en **générant un
  pass** — non fait, volontairement (§5.4).
- **Les routes de génération n'ont pas été appelées.** Leur existence est
  prouvée par `OPTIONS` (204 + `Allow`), pas par un GET. Restent inconnus : le
  statut en cas de certificat absent, le corps d'erreur, et la redirection
  réelle vers `?wallet=erreur`.
- **`message_wallet` n'a pas de site d'écriture** dans le corpus : serveur-only
  ou inexistant, non tranché.
- **`walletEnabled` / `googleWalletEnabled`** sont dans le payload serveur mais
  dans **aucune colonne mesurée** : leur source n'est pas établie.
- **Le minifié n'est pas la source.** Un alias zod mal lu fabriquerait un faux
  schéma ; la table §4 vient de la lecture des définitions (`eZ=Y.create`, etc.),
  pas d'une inférence par usage.
- **Les messages français sont décodés.** Le bundle écrit `\xe8` pour `è` ;
  l'affichage ci-dessus est décodé pour la lecture, la valeur d'origine est
  conservée dans le JSON. Ce piège a coûté un témoin (§5.4).
- **Périmètre d'écriture** : ce document, `tools/rea/contrats.mjs`,
  `tools/rea/relever-contrats.mjs`, `tools/rea/wallet.mjs`,
  `tools/rea/relever-wallet.mjs`, leurs deux fichiers de tests,
  `_captures/2026-10-27-a2/`, `_captures/2026-10-27-a3/` (gitignorés) et les
  fichiers de mémoire du projet. **Rien hors de `FIDELIX/`.**
- **Aucune requête d'écriture.** A2 n'a émis aucun appel réseau ; A3 a émis
  **18 requêtes de lecture** — 3 GET de page, 5 GET de sondage, 10 `OPTIONS` —
  consignées dans `_captures/2026-10-27-a3/mesure-a3.json`. Les deux routes de
  génération n'ont pas été appelées.

