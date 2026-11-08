---
type: rea
status: done
module: global
tags: [rea, fidelix, r0, etat-basal, reconstruction, arbitrage, supabase]
updated: 2026-10-28
---

# État basal — R0

> **Ce que ce document est.** Le point zéro de la reconstruction : ce que la
> Phase 1 a établi, ce qui peut servir de fondation, ce que contient réellement
> la base Supabase de reconstruction, et ce que l'axe directeur « QR + points »
> décide — confronté ligne à ligne aux contrats déjà mesurés.
>
> **Ce que ce document n'est pas.** R1. Aucune ligne d'application n'a été
> écrite, aucun projet Next.js créé, aucune table modifiée. R0 constate.

## 0. Périmètre, méthode, et ce qui a été exécuté

### 0.1 Les quatre entrées, vérifiées avant lecture

| Entrée | Taille | État | Conséquence |
|---|---:|---|---|
| `FIDELIX/PROGRESS.md` | 39 818 o | lu | — |
| `FIDELIX/conversation.md` | **107 919 o** | **non vide** | volet 4 **mesurable** (B-4 levé) |
| `FIDELIX/Spécifications techniques plateforme de fidélité QR code.md` | **14 204 o** | **non vide** | **3ᵉ source**, volet 4 réouvert (§4.5) |
| `FIDELIX/env.supabase.md` | **593 o** | **non vide** | volet 3 **mesurable** (B-4 levé) |
| `git check-ignore FIDELIX/env.supabase.md` | — | **exit 0** (`.gitignore:73`) | identifiants hors versionnement |

**B-4 est clos.** Il avait été ouvert le 2026-10-28 sur deux fichiers à **0
octet**. Les deux sont désormais renseignés : le blocage ne vient plus d'une
entrée absente, il se déplace sur le **choix** (cf. §5).

### 0.2 Ce que R0 a réellement exécuté

| Geste | Volume | Preuve |
|---|---|---|
| Lecture du corpus documentaire | 7 docs `Global/` + 6 `Modules/` + 1 `UI/` | cités section par section |
| Lecture de `conversation.md` | 2 926 lignes, 107 919 o | DDL et sites d'appel lus |
| Lecture de la spec | 247 lignes, 14 204 o, sha256 `70ea6ad9…` | DDL, arborescence, plan §8 |
| Sonde de la base de reconstruction | 7 `GET` (1 OpenAPI + 3 tables × 2 rôles) | `_captures/2026-10-28-r0/sonde-base.json` |
| RPC appelées | **0** | la sonde n'émet que des `GET` |
| Écritures en base | **0** | idem |
| Tests hors ligne | **256/256** (218 + **38** nouveaux) | `node --test tools/rea/tests/*.test.mjs` |
| Projet Next.js créé | **0** | — |

Nouvel outillage, pour que le volet 3 soit **rejouable** et non un `curl`
jetable : `tools/rea/base.mjs` (pur, 30 tests) et `tools/rea/sonder-base.mjs`
(lecture seule par construction). L'artefact ne contient **aucune clé** —
garanti par `aucunSecret`, qui reçoit les secrets réels et **lève** s'il les
retrouve dans la sortie (garde falsifiable, lesson §21.5).

### 0.3 Convention de ce document

Trois marqueurs, jamais mélangés :

- **[M]** *mesuré* — adossé à une capture, un statut HTTP, une ligne renvoyée ou
  un test qui passe. **Fait autorité.**
- **[D]** *déclaré* — écrit dans un document ou dans `conversation.md`, non
  observé. Utile, **non contraignant**.
- **[?]** *non mesuré* — explicitement hors de portée. N'est **jamais** comblé
  par une inférence.

Une affirmation sans marqueur serait un défaut de ce document.

## 1. Inventaire du corpus — ce que A1–A5 établissent, et ce qu'ils laissent ouvert

### 1.1 Vue d'ensemble

| Cycle | Objet | Établi **[M]** | Laissé ouvert **[?]** |
|---|---|---|---|
| **S1–S3** | Routes et pages | 22 routes métier, 3 réfutations (`/loyalty`, `/account`, `/abonnement`), 67 assets, `--verifier` 109/109 | `/admin` (rôle insuffisant, B-2), état **appairé** de `/caisse` (B-3) |
| **A1** | Modèle de données | 8 tables interrogées ; colonnes de 4 tables ; `rewards` **n'existe pas** ; `customers` **sans GRANT** ; relations par *embedding* | colonnes de `automations`/`till_sessions` (0 ligne) ; expressions RLS ; signatures RPC |
| **A2** | Contrats d'écriture | **28** endpoints POST, **24** corps, **5** schémas zod, **8** GET | 4 corps (routes publiques non capturées), `/api/demarrer`, 4 signatures RPC |
| **A3** | Wallet | 2 routes de génération en **GET-navigation**, 1 route `/statut` **Apple seulement**, page `/card/<cardId>` **publique** | contenu exact du pass ; échec `?wallet=erreur` jamais provoqué |
| **A4** | File hors ligne | IndexedDB `fidelix-caisse` v2, FIFO par `cree_le`, 65 s, politique `{400,403,404,422}`, `client_operation_id` = id d'élément | forme de `/api/scan/cards`, nombre de cartes servies |
| **A5** | Fidelia AI | 2 `GET` **nus**, grille locale 10/10/10, `donneesInsuffisantes` = porte, 12 garde-fous, TTL `18e5` | `/conseiller` inatteignable ; sens métier des 10 branches |

### 1.2 Ce que le corpus établit sur l'axe « QR + points », précisément

C'est la partie qui décide de R1, et elle est **plus mince** qu'on ne le croit.

| Question de l'axe | Ce que la mesure dit | Marqueur |
|---|---|---|
| Y a-t-il un QR côté client ? | **Non mesuré.** La page `/card/<cardId>` est publique et porte **deux boutons wallet** ; aucun QR n'y a été relevé. | **[?]** |
| Y a-t-il une page QR côté commerçant ? | **Oui** : `/qrcode` → **307** (route gardée), citée **5×** dans la navigation du dashboard. Son **contenu** n'est pas capturé. | **[M]** existence / **[?]** contenu |
| Comment le commerçant identifie-t-il un client ? | **(a)** `/scan` = route gardée (307) ; **(b)** `GET /api/scan/cards` (catalogue) et `GET /api/scan/card?id=` (une carte) ; **(c)** `/caisse`, PWA séparée, écran « Pointez vers le QR code du client » en mode caméra. | **[M]** |
| Le QR encode-t-il un jeton ou une URL ? | **Non mesuré.** Aucune capture de QR décodé. `/card/<cardId>` est une **URL** dont le segment est un **UUID** (format relevé sur `00000000-0000-4000-8000-…`). | **[M]** format / **[?]** contenu |
| Comment les points sont-ils crédités ? | `POST /api/transaction` avec `type` ∈ {`add_stamp`, `earn_points`, …}, `amount_mad:integer`, `client_operation_id` **pour ces deux types seulement**. | **[M]** |
| Y a-t-il **aussi** des tampons ? | **Oui** : `loyalty_programs.stamps_total`, `transactions.stamps_delta`, `stamp_icon`, `style_bandeau` ∈ {`tampons`,`photo`}, et la caisse branche sur `programType === "stamps"`. | **[M]** |
| Multi-commerce ? | **Oui** : `restaurants` est la racine (34 col.), `loyalty_programs.restaurant_id`, **309** programmes, **81** paliers, **27** slugs publics, `join_loyalty_program(p_restaurant_id, p_program_id)`. | **[M]** |

> **Conséquence pour l'axe directeur.** « Génération de QR code avec points de
> fidélité » décrit **une partie** du produit mesuré, pas son tout : le produit
> mesuré est un **SaaS multi-commerce** avec **deux mécaniques** (tampons *et*
> points), **deux applications** (client/commerçant et caisse), une **caisse
> appairée** et un **wallet**. Un clone qui n'implémente que « QR + points »
> n'est pas isofonctionnel — c'est un produit plus petit. Le dire maintenant
> évite de le découvrir en R5.


## 2. Tri de ce qui sert à reconstruire

### 2.1 La règle d'arbitrage

> **En cas de conflit, c'est la mesure qui tranche.** Non pas parce qu'elle est
> plus récente, mais parce qu'elle est **falsifiable** : elle est datée, elle
> nomme son instrument, et elle peut être rejouée. Une architecture écrite dans
> une conversation ne peut pas être contredite — elle peut seulement être
> préférée. Ce sont deux régimes de preuve différents, et les confondre est
> exactement ce que R0 doit empêcher.

### 2.2 Fondation — fait autorité, ne se renégocie pas sans mesure contraire

| # | Fondation **[M]** | Preuve |
|---|---|---|
| F-1 | **Multi-tenant** : `restaurants` est la racine, tout pend à un commerce | 34 col. / 1 ligne ; 5 relations inverses ; `PGRST200` là où la relation manque |
| F-2 | **Deux mécaniques** : tampons (`stamps_total`, `stamps_delta`) *et* points (`points_delta`) | 23 col. de `loyalty_programs`, 16 de `transactions`, `programType==="stamps"` dans `6866` |
| F-3 | **Le solde n'est pas la vérité** : `transactions` est un journal de deltas, signés | `points_delta`/`stamps_delta` entiers, `redeem` écrit un delta **négatif** côté conversation |
| F-4 | **Idempotence asymétrique** : `client_operation_id` exigé pour `add_stamp`/`earn_points` seulement | site d'appel lu dans `6866`, corps de `/api/transaction` en A2 |
| F-5 | **File hors ligne** : IndexedDB `file_attente`, FIFO, 65 s, rejet `{400,403,404,422}` | `Fidelix_Caisse.md` §3.1–3.5 |
| F-6 | **La caisse est une PWA séparée**, appairée par code à 6 chiffres | 2 manifestes distincts (`/caisse`, scope `/caisse`), `/api/caisse/appairer` |
| F-7 | **`customers` n'est PAS lisible par le navigateur** (`42501`) | A1 : GRANT absent pour `authenticated` ; lecture côté serveur Next |
| F-8 | **`rewards` n'est pas une table** (`PGRST205`) | A1 : le `hint` propose `reward_tiers` |
| F-9 | **Wallet = 2 GET-navigation + 1 `/statut` Apple** | A3 : `OPTIONS 204 Allow: GET,HEAD,OPTIONS`, `/statut` 200, Google `/statut` **404** |
| F-10 | **Fidelia n'a aucune entrée** : 2 GET nus, sortie rendue localement | A5 : `fetch()` à **un seul argument**, 0/11 marqueur de modèle |
| F-11 | **Montants en `integer` MAD** + `devise` par programme | `amount_mad:integer`, `loyalty_programs.devise`, `fidelix_caisse_devise` |

### 2.3 Contexte — utile, non contraignant

| Élément **[D]** | Pourquoi il ne tranche pas |
|---|---|
| `conversation.md` | réponse de Gemini, sans accès à la cible ; **source du volet 4**, pas de la fondation |
| `Spécifications techniques… QR code.md` | même statut : proposition d'architecte, plus proche de la mesure sur l'auth, **pas** sur le schéma |
| Les libellés d'interface (« Fidelia AI », « Posez-moi une question ») | un libellé n'est pas un contrat (lesson §21.5) — A5 a mesuré l'écart |
| Les 27 slugs, UUID, noms de commerces | ce sont des **données**, pas des chemins ni des contrats |
| La stack « Next.js + Supabase » | cohérente avec la cible **[M]** (`x-powered-by: Next.js`, PostgREST), mais le choix reste ouvert à R1 |
| Le design « verre » (`--vitre-*`, `--verre-*`) | capturé côté cible, à confronter au design system en R1 |

### 2.4 Inconnu — interdit d'invention

| Point **[?]** | Pourquoi il reste ouvert | Ce qu'il faudrait |
|---|---|---|
| Colonnes de `automations`, `till_sessions` | **0 ligne** renvoyée ; OpenAPI fermé sur la cible | une ligne, ou un accès `service_role` côté cible |
| Expressions RLS de la cible | `pg_policies` non exposé ; seule l'issue est lisible | accès SQL direct |
| Signatures de 4 RPC (`classement_caisses`, `mon_role_point_de_vente`, `parrainages_du_commerce`, `journal_operateur`) | PostgREST ne les sert qu'en **POST** ; le périmètre interdit le POST | décision humaine |
| Contenu de `/qrcode` | route **307**, jamais rendue | capture authentifiée de la page |
| État **appairé** de `/caisse` | B-3 : appairage = action humaine | code d'appairage dans le dashboard |
| `/admin` | B-2 : rôle insuffisant | un compte admin |
| Contenu du QR | aucun QR décodé | capture d'un QR réel, ou son code de génération |
| Corps de 4 endpoints publics | bundles non capturés | capture du parcours public |


## 3. État de la base Supabase de reconstruction — **sondée**, pas supposée

> **Instrument.** `node tools/rea/sonder-base.mjs --capture 2026-10-28-r0`
> — **7 `GET`**, **0 POST**, **0 RPC appelée**, **0 écriture**.
> **Artefact** : `01_REA_Fidelix/_captures/2026-10-28-r0/sonde-base.json`
> (8 375 o, **aucune clé** — vérifié). Réponses à la question « vide ? schéma ?
> RLS ? », dans cet ordre.

### 3.1 La base répond, et son schéma est **lisible**

| Mesure | Valeur | Lecture |
|---|---|---|
| `GET /rest/v1/` avec `service_role` | **200**, 13 805 o | schéma **accessible** |
| Version PostgREST | **14.18** | — |
| Tables/vues exposées | **3** | `clients`, `loyalty_cards`, `loyalty_transactions` |
| RPC exposées | **2** | `award_loyalty_points`, `redeem_loyalty_reward` |

**Écart avec la cible, et sa cause exacte.** Sur `fidelix.ma`, la même racine
répond **401 — « Only the service_role API key can be used for this endpoint »**
(A1 §8.1) : le schéma est resté **fermé** pendant tout le REA, faute de clé
`service_role`. Ici la clé est fournie, donc la racine s'ouvre. La différence
n'est **pas** une propriété de la cible — c'est un **droit d'accès**. Conséquence
méthodologique directe : le modèle de la cible a dû être déduit des **lignes
renvoyées** ; celui de la base de reconstruction est lu dans le **schéma
déclaré**, PK, FK et longueurs comprises. Les deux ne sont pas de même force, et
ce document les distingue.

### 3.2 Il n'y a **aucune donnée** — mais ce n'est pas « vide » au sens où on l'entend

| Table | Colonnes | Lignes (`count=exact`) via `service_role` | via `anon` |
|---|---:|---:|---|
| `clients` | **5** | **0** | **0** |
| `loyalty_cards` | **6** | **0** | **0** |
| `loyalty_transactions` | **7** | **0** | **0** |

`Content-Range: */0` sur les six requêtes. **Base de schéma, sans données.**

### 3.3 Le schéma, colonne par colonne (lu dans l'OpenAPI de la base)

| `clients` | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | **PK**, `gen_random_uuid()` |
| `first_name` | `varchar(100)` | — |
| `last_name` | `varchar(100)` | — |
| `email` | `varchar(255)` | — |
| `created_at` | `timestamptz` | `now()` |

| `loyalty_cards` | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | **PK**, `gen_random_uuid()` |
| `client_id` | `uuid` | **FK → `clients.id`** |
| `card_token` | `varchar(64)` | — |
| `current_points` | `integer` | `0` |
| `updated_at` | `timestamptz` | `now()` |
| `created_at` | `timestamptz` | `now()` |

| `loyalty_transactions` | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | **PK**, `gen_random_uuid()` |
| `card_id` | `uuid` | **FK → `loyalty_cards.id`** |
| `amount_spent` | `numeric` | — |
| `points_awarded` | `integer` | — |
| `staff_id` | `uuid` | *(aucune FK)* |
| `created_at` | `timestamptz` | `now()` |
| `reward_label` | `varchar(150)` | — |

**RPC, signature lue (jamais appelée)** — c'est ce que A1 et A2 n'avaient **pas**
pu obtenir sur la cible :

```
award_loyalty_points( p_card_token varchar *, p_amount_spent numeric *,
                      p_points_to_add int, p_staff_id uuid )        * = requis
redeem_loyalty_reward( p_card_token varchar *, p_points_cost int *,
                       p_reward_label varchar *, p_staff_id uuid )
```

### 3.4 RLS : ce qui est mesurable, et ce qui ne l'est **pas**

| Affirmation | Marqueur | Preuve |
|---|---|---|
| `anon` obtient **200** sur les trois tables (pas 401, pas 403) | **[M]** | six requêtes, verdict `lisible` |
| ⇒ un **GRANT SELECT** existe pour `anon` sur les trois tables | **[M]** | un `42501` aurait donné 403, comme `customers` en A1 |
| RLS **activée ou non** | **[?]** | **indissociable d'une table vide** par une lecture : `[]` dans les deux cas |
| Politiques RLS effectives | **[?]** | `pg_policies` n'est pas exposé par PostgREST |
| Droits d'écriture (`INSERT`/`UPDATE`/`DELETE`) | **[?]** | les tester exigerait d'écrire — refusé en R0 |

> **Le piège que ce tableau évite.** Une table vide qui répond `200` *ressemble*
> à une table protégée par RLS. Elle ressemble tout autant à une table **sans**
> RLS. Les deux hypothèses produisent la **même** observation ; les départager
> par le raisonnement serait exactement l'inference que R0 interdit. Le test qui
> trancherait — insérer une ligne témoin puis la relire en `anon` — est une
> **écriture**, donc il appartient à R1.2, pas à R0.

### 3.5 Triangulation — trois références, une seule base

La base n'a qu'un contenu. On peut donc la confronter aux **trois** modèles dont
on dispose, et regarder **lequel elle satisfait**. Ce n'est plus une
ressemblance : c'est une appartenance.

| Référence | Origine | `conforme` |
|---|---|---|
| **Modèle mesuré de la cible** (A1) | captures `fidelix.ma` | **`false`** |
| **`conversation.md`** | Gemini, §1 + sa 2ᵉ migration | **`true`** ✅ |
| **`Spécifications techniques… QR code.md`** | spec « Architecte Senior » | **`false`** |

**La base est l'implémentation de `conversation.md`** — et de lui seul. Le
`true` n'est pas une impression : `comparerModele` compare les 3 tables et les
**18 colonnes** une à une, et ne trouve **ni manquante ni superflue**.

Ce que la spec, elle, ne peut pas expliquer :

| Divergence | Spec | Base réelle |
|---|---|---|
| Colonne du delta de points | `points_delta` | **`points_awarded`** |
| Total dépensé | `total_spent` | **absent** |
| Auteur de l'écriture | `staff_user_id → auth.users` | **`staff_id`** (sans FK) |
| Trace d'une récompense | `notes` | **`reward_label`** |
| Fonction de débit | **aucune** | **`redeem_loyalty_reward`** |

Conséquence **opérationnelle**, pas théorique. Le `CREATE TABLE` de la spec
échouerait **d'abord** sur `relation "clients" already exists` — les trois tables
existent. Et si l'on sautait les `CREATE`, la fonction de crédit insérerait
`points_delta` dans une table qui n'a que `points_awarded`. Deux échecs
distincts, tous deux certains ; ce n'est pas une opinion sur la qualité de la
spec, c'est un fait de schéma.

Les longueurs déclarées corroborent, sans être nécessaires :

| Longueur déclarée dans `conversation.md` | Mesurée dans la base |
|---|---:|
| `card_token VARCHAR(64)` | **64** |
| `first_name` / `last_name` `VARCHAR(100)` | **100** / **100** |
| `email VARCHAR(255)` | **255** |
| `reward_label VARCHAR(150)` *(2ᵉ migration)* | **150** |

Et un détail qui achève de départager : la spec déclare
`card_token … DEFAULT encode(gen_random_bytes(16),'hex')`. La base n'expose
**aucun défaut** sur `card_token` — cohérent avec `conversation.md`, qui génère
le jeton **côté Node** (`crypto.randomBytes(16).toString('hex')`).

### 3.6 Ce que la base est, en une ligne

**La base actuelle n'est pas un début de reconstruction de Fidelix, ni une
implémentation de la spec — c'est celle de `conversation.md`.**

| Confrontation au modèle mesuré (A1) | Résultat |
|---|---|
| Tables de la cible **absentes** de la base (7) | `restaurants`, `loyalty_programs`, `reward_tiers`, `transactions`, `customers`, `automations`, `till_sessions` |
| Tables de la base **absentes de la cible** (3) | `clients`, `loyalty_cards`, `loyalty_transactions` |
| `conforme_modele_cible` | **`false`** |


## 4. Arbitrage de l'axe directeur — **deux propositions**, confrontées aux contrats mesurés

Trois sources sont en présence, et elles ne parlent pas du même produit :

| Source | Nature | Produit décrit |
|---|---|---|
| Phase 1 (A1→A5) | **mesure** de `fidelix.ma` | SaaS multi-commerce, tampons **et** points, caisse appairée |
| `conversation.md` | réponse de **Gemini** | mono-commerce, points seuls |
| `Spécifications techniques… QR code.md` | spec « **Architecte Senior** » | mono-commerce, points seuls |

Les deux documents sont des **propositions**, pas des mesures. La méthode est la
même pour les deux ; la spec a simplement son propre jeu d'écarts (§4.5).


`FIDELIX/conversation.md` (2 926 lignes) est un échange avec **Gemini** — l'URL
`gemini.google.com/app/e587e704df4d1dfc` figure ligne 2, et la pagination
d'impression aux lignes 176, 688, 1284… Ce n'est donc ni une spécification
validée, ni une mesure : c'est une **proposition**, avec sa qualité (le parcours
QR y est décrit sans ambiguïté) et son angle mort (elle n'a jamais vu la cible).

> **Règle appliquée ici.** Aucune ligne de `conversation.md` n'est réécrite. Ses
> décisions sont conservées telles quelles, et chaque conflit avec un contrat
> mesuré devient un **écart numéroté**, avec sa gravité. Un écart n'est pas une
> faute : c'est un choix qui doit être **assumé** ou **abandonné**, en
> connaissance de cause.

### 4.1 Deux pièges de lecture, mesurés sur ce corpus

**Piège 1 — `stamp` ≠ `stamps`.** Un relevé naïf de « stamp » rend **15
occurrences**. Toutes sont dans **`timestamp`** : `grep -o -i 'stamps'` rend
**0**. La conversation ne décrit donc **aucune** mécanique de tampon — alors
qu'un comptage par sous-chaîne l'aurait annoncée présente. Même famille que le
`new Set([1,2,3])` des polyfills (A4) : *un jeton qui ne discrimine pas n'est pas
un jeton* (lesson §20.1).

**Piège 2 — `restaurant` = 0.** Le mot n'apparaît **aucune** fois dans les 2 926
lignes ; `commerce` non plus. Le mot employé est `boutique` (6 fois), toujours au
**singulier** : « ma boutique », « la boutique ». Ce n'est pas une préférence
lexicale, c'est le modèle : **mono-commerce**. La base, on l'a vu, ne porte
aucune colonne de rattachement.


### 4.2 Les écarts, numérotés

Gravité : **⛔ bloquant** (le clone est faux ou dangereux sans correction) ·
**⚠️ majeur** (parité fonctionnelle perdue) · **○ mineur** (précision).

**Décompte : 22 écarts — 10 bloquants, 10 majeurs, 2 mineurs.** Les compteurs sont
vérifiables par `grep -c` sur ce tableau ; ils le sont parce qu'un « dont N
bloquants » écrit de mémoire se trompe d'une unité, et j'ai commencé par écrire
**7** pour 8.

| # | Décision dans `conversation.md` **[D]** | Contrat mesuré **[M]** | Écart | Grav. |
|---|---|---|---|---|
| **E-01** | Un seul commerce. `clients` et `loyalty_cards` n'ont **aucun** rattachement. | `restaurants` racine (34 col.), **309** programmes, **81** paliers, **27** slugs publics, `join_loyalty_program(p_restaurant_id, p_program_id)` | mono ⇄ multi-tenant | ⛔ |
| **E-02** | **Aucun tampon** (`stamps` = 0 occurrence). `current_points INT` seulement. | `stamps_total`, `stamps_delta`, `stamp_icon`, `style_bandeau`, `programType === "stamps"` | une mécanique sur deux manque | ⛔ |
| **E-03** | `card_token VARCHAR(64)`, généré par `crypto.randomBytes(16).toString('hex')` → **32 hex**. URL `/card/<token>`. | `/card/<cardId>`, `cardId` de format **UUID** ; `/api/wallet/apple/<cardId>` | format et sémantique d'identifiant | ⚠️ |
| **E-04** | QR encode `…/admin/scan?cardId=UUID` **ou le token brut**. | `/scan` (307), `GET /api/scan/cards`, `GET /api/scan/card?id=`, **et** `/caisse` en PWA séparée. Aucune route `/admin/scan` mesurée. | chemin et porteur du scan | ⚠️ |
| **E-05** | Scan **dans la même application**, autorisé par un **PIN à 4 chiffres** (`x-admin-pin`, `ADMIN_PIN_SECRET="1234"` dans la doc, conservé en `sessionStorage`). | PWA `/caisse` (manifeste propre, scope `/caisse`), **appairage par code à 6 chiffres** (`/api/caisse/appairer`), `till_sessions`, `mon_role_point_de_vente` | architecture + authentification | ⛔ |
| **E-06** | `FOR SELECT USING (true)` sur `clients`, `loyalty_cards` **et** `loyalty_transactions` — « lecture publique ». | `customers` : **aucun GRANT** (42501) → lecture serveur seulement ; `restaurants`/`transactions` : 1 ligne avec session, **0** sans | **fuite de données personnelles** | ⛔ |
| **E-07** | **Aucune idempotence** (`idempot` = 0, `client_operation_id` = 0). `FOR UPDATE` protège la **concurrence**, pas le **renvoi**. | `client_operation_id` exigé pour `add_stamp`/`earn_points` ; la file hors ligne rejoue **la même clé** | double crédit possible | ⛔ |
| **E-08** | **Aucune file hors ligne** (IndexedDB, `file_attente` : 0 occurrence). | IndexedDB v2, magasin `file_attente`, FIFO, rejeu 65 s, rejet `{400,403,404,422}` | perte totale en boutique sans réseau | ⚠️ |
| **E-09** | `amount_spent DECIMAL(10,2)`, règle **codée en dur** `POINTS_PER_EURO = 1`, montants en **€**. | `amount_mad:integer`, `devise` **par programme** (`MAD`\|`EUR`), `points_per_purchase` + `min_purchase_mad` | devise, type, règle non configurable | ⚠️ |
| **E-10** | `redeem_loyalty_reward(p_points_cost, p_reward_label)` : **coût et libellé viennent de l'appelant** ; les paliers sont une **constante client** (`src/lib/rewards.ts`). | `reward_tiers` (10 col., `cost`, `position`, `is_active`) + `POST /api/rewards/save` qui envoie la **liste entière** | **intégrité** : aucun catalogue serveur | ⛔ |
| **E-11** | Rôle = PIN partagé. `staff_id` libre, **sans FK**, non vérifié. | GoTrue + middleware 307 + `/api/*` 401 ; `restaurants.user_id`, `/api/equipe/managers`, `transactions.auteur_id` | pas de RBAC, pas d'audit fiable | ⛔ |
| **E-12** | `loyalty_cards.current_points` est **la** source de vérité (dénormalisée). | Aucun solde mesuré comme colonne ; `transactions` porte `points_delta`/`stamps_delta` signés | solde ⇄ journal | ⚠️ |
| **E-13** | **Aucune expiration** (`expiry`/`expiration` = 0). | `points_expiry_days` (23 col.), présent dans `POST /api/program/save` | points éternels | ⚠️ |
| **E-14** | **Aucun parrainage ni bonus d'avis** (`parrainage` = 0, `referral` = 0). | `referral_reward`, `review_reward`, `google_review_url`, `/api/caisse/cadeau-filleul`, `/api/caisse/parrainage-valide`, `superRefine` conditionnel | deux modules entiers absents | ⚠️ |
| **E-15** | Wallet = **option** (`passkit-generator` cité). | 2 routes **GET-navigation** + `/statut` **Apple seulement** (Google `/statut` → **404**) | gap, pas contradiction | ○ |
| **E-16** | **Aucun consentement** ; email « facultatif ». | `p_consentement_cndp: true` **toujours**, `p_consentement_version`, `p_marketing_consent`, `p_birthdate` conditionnel | **risque juridique** (CNDP, loi 09-08) | ⛔ |
| **E-17** | `ALTER PUBLICATION supabase_realtime ADD TABLE loyalty_cards` → solde en direct. | Aucun contrat realtime mesuré ; `text/event-stream`/`getReader()` seulement dans des chunks **génériques** (`7383`, `7631`) | **non mesuré** — ni confirmé, ni réfuté | ○ |
| **E-18** | QR boutique pointe vers `/join` (sans slug). | `/join/<slug>` → **200**, et `join_loyalty_program` exige `p_restaurant_id` **et** `p_program_id` | sans slug, le commerce est indéterminable | ⚠️ |


### 4.3 Ce sur quoi les propositions et la mesure **convergent** — et qui n'a pas à être rejugé

| Point | `conversation.md` **[D]** | Cible **[M]** |
|---|---|---|
| Nom de la table des cartes | `loyalty_cards` | `loyalty_cards` (A1) |
| Route de la carte client | `/card/[token]` | `/card/<cardId>` |
| Jeton non devinable | `crypto.randomBytes(16)` | UUID (format relevé) |
| Le QR **est** porté par la carte client | oui | oui (`/card/<id>` publique) |
| Montant → points, écriture atomique | RPC `FOR UPDATE` | RPC serveur + `POST /api/transaction` |
| Stack | Next.js + Supabase + PostgREST | `x-powered-by: Next.js` ; PostgREST **14.18** *(mesuré sur la base)* |
| Historique des mouvements | `loyalty_transactions` | `transactions` |

Sur ces sept points, les deux sources disent **la même chose**. Ce sont les seuls
endroits où l'on peut avancer sans arbitrage.

### 4.4 Un effet de bord de E-05 et E-11 qui mérite sa propre ligne

`conversation.md` place le contrôle d'accès **dans la route Next** :

```js
const pin = request.headers.get('x-admin-pin')
if (!pin || pin !== process.env.ADMIN_PIN_SECRET) { … 401 … }
```

et la fonction de base est déclarée `SECURITY DEFINER` — **[D]**, lu dans le DDL
de la conversation. Or les deux fonctions sont **exposées par PostgREST**
**[M]** (elles figurent dans l'OpenAPI avec leur signature complète).

Conséquence, énoncée comme une **chaîne** et non comme un fait isolé :

1. **[M]** `POST /rest/v1/rpc/award_loyalty_points` est une **route** de la base.
2. **[D]** La fonction ne vérifie **aucun** PIN : le contrôle est dans Next.
3. **[?]** On ignore si `anon` a `EXECUTE` — le tester serait une écriture, donc
   hors R0.

⇒ **Si** `anon` a `EXECUTE` (défaut Supabase pour une fonction `public`), **alors**
la clé `anon` — publique par conception, présente dans le navigateur de chaque
client — suffit à créditer des points sans PIN. Le contrôle d'accès serait
**contourné, pas renforcé**, par l'existence de la RPC. La vérification tient en
un `GRANT`/`REVOKE` à lire en R1.2, et elle est **bloquante** avant toute mise en
ligne.


### 4.5 La troisième source — `Spécifications techniques… QR code.md`

Fichier de **14 204 o / 247 lignes**, sha256 `70ea6ad9…49622d`, à la racine de
`FIDELIX/`. C'est une spec rédigée **du point de vue du développeur** (« Tu es un
Architecte Logiciel… »), avec une arborescence et un plan d'exécution. Ce n'est
pas un doublon de `conversation.md` : c'est une **variante** de la même
architecture, et elle corrige plusieurs choses.

**Ce qu'elle corrige — et qui la rapproche de la mesure.**

| Point | `conversation.md` | Spec | Cible **[M]** |
|---|---|---|---|
| Auth commerçant | PIN **4 chiffres** en `sessionStorage` | **Supabase Auth** + `middleware.ts` sur `/admin/*` | GoTrue + middleware **307** |
| Audit de l'auteur | `staff_id` libre, sans FK | `staff_user_id UUID REFERENCES auth.users(id)` | `auteur_id`, `employee_id` |
| Anti-double-clic | aucun | `isSubmitting` sur le bouton | `client_operation_id` (serveur) |
| Validation | zod client | zod **serveur** + plafond (< 10 000) | `superRefine` conditionnel |
| PWA | implicite | `manifest.json` explicite | **2** manifestes distincts |

Sur l'**authentification** et l'**audit**, la spec est objectivement **plus
proche** de la mesure que la conversation. C'est un progrès réel, et il faut le
dire avant de lister ce qui reste faux.

**Ce qu'elle ne corrige pas** — les écarts E-01 (mono-commerce), E-02 (aucun
tampon : `stamps` = **0**, ses 4 « stamp » sont des `TIMESTAMP`), E-09 (€ et
`DECIMAL`), E-10 (paliers dans `loyalty-engine.ts`, côté client), E-18 (`/join`
sans slug) sont **identiques**. Elle ajoute les quatre siens.

| # | Constat dans la spec **[D]** | Ce que la mesure dit **[M]** | Gravité |
|---|---|---|---|
| **E-19** | L'arborescence annonce `0001_initial_schema.sql # Script SQL complet (Tables, Index, **RLS**, Fonctions RPC)`. Le script contient **0** `ENABLE ROW LEVEL SECURITY` et **0** `CREATE POLICY`. | Sur Supabase, une table `public` sans RLS **et** avec les GRANT par défaut est lisible **et inscriptible** par `anon`. La conversation posait au moins 3 politiques permissives : la spec est **plus ouverte** qu'elle. | ⛔ |
| **E-20** | `points_delta`, `total_spent`, `staff_user_id`, `notes` ; pas de `redeem_loyalty_reward`. | La base a `points_awarded`, `staff_id`, `reward_label`, **et** `redeem_loyalty_reward`. Un `INSERT` écrit pour la spec **échoue** sur la base en place. | ⚠️ |
| **E-21** | §7.2 : « désactive immédiatement le bouton… pour éviter de créditer les points deux fois **si le réseau de la boutique est lent** ». | Un bouton désactivé protège du **double clic**. Il ne protège **pas** du cas nommé : la requête atteint le serveur et la **réponse se perd** — le seul cas que `client_operation_id` couvre (F-4). La spec présente un garde **client** comme une solution à un problème **serveur**. | ⛔ |
| **E-22** | §8 : « **Étape 1 (Setup & DB)** : initialise… et le fichier SQL de migration. » | Appliquer E-20 casse la base en place ; et créer le projet **avant** R0 est exactement ce que la feuille de route interdisait. Le plan est un **ordre d'exécution**, pas une validation. | ⚠️ |

**Ce que E-19 et E-21 ont en commun, et pourquoi ils comptent.** Ce sont les deux
endroits où la spec **nomme** une protection qu'elle ne fournit pas : un
commentaire `RLS` sans politique, un anti-double-crédit sans clé. C'est la
troisième occurrence de la même famille dans ce projet (lesson §21.5 : « un garde
qui ne peut pas échouer ne prouve rien »). Un clone qui suit la spec **croira**
être protégé.


## 5. Ce que R0 doit faire trancher avant R1

Aucune de ces décisions n'est technique au fond. Chacune engage le **produit**.
R0 les nomme ; il ne les prend pas.

### 5.1 La décision qui commande toutes les autres — D-1

> **Le projet est-il une reconstruction isofonctionnelle de Fidelix, ou un
> produit « QR + points » plus petit, inspiré de Fidelix ?**

| | **A — Clone isofonctionnel** | **B — Produit mono-commerce** |
|---|---|---|
| Ce que R0 impose | les **22** écarts doivent être traités ; 7 tables à créer | la base actuelle est **presque** le bon modèle (elle est celle de `conversation.md`, pas celle de la spec) |
| Effort | R1→R5 tels que planifiés | un seul cycle, beaucoup plus court |
| Parité de recette | oui (`--verifier`, 22 routes) | non : on ne compare plus à la cible |
| Ce que l'axe directeur devient | une **partie** du produit (E-01, E-02 restent dus) | l'axe **est** le produit |
| Risque | lourd mais borné par la mesure | léger en périmètre, **élevé en sécurité** : E-06, E-10, E-11, E-19, E-21 |

**Le dossier a changé de poids avec la troisième source.** Les **deux**
propositions d'architecture du dépôt — `conversation.md` et la spec — décrivent
toutes les deux **B** : `restaurant` = **0 occurrence** dans l'une, « une
boutique physique » dans l'autre, aucune table de rattachement dans la base.
Seule la feuille de route R1→R5 décrit **A**.

Cela ne tranche pas D-1 — un plan de reconstruction peut parfaitement ignorer
deux documents écrits à côté. Mais cela déplace la charge de la preuve : ce n'est
plus « A par défaut, B à justifier », c'est **« deux sources écrites disent B, la
feuille de route dit A — laquelle exprime l'intention ? »**

**Recommandation, inchangée dans sa prudence et plus informée.** L'axe directeur
énoncé — « génération de QR code avec points de fidélité » — décrit **B**.
La feuille de route R1→R5 et la Phase 1 entière décrivent **A**. Les deux ne
peuvent pas être vrais en même temps, et c'est le
seul point de R0 qu'aucune mesure ne peut trancher : **c'est une décision de
produit.** Tant qu'elle n'est pas prise, R1 ne doit pas toucher au schéma.

### 5.2 Les neuf décisions techniques, avec leur coût

| # | Décision | Contrainte mesurée | Coût du choix sûr |
|---|---|---|---|
| **D-2** | Migrer la base actuelle, ou repartir du modèle mesuré | 3 tables / 0 ligne → **rien à perdre** **[M]** | nul : la base est vide |
| **D-3** | Tampons : les implémenter ou les retirer du périmètre | `stamps_total`/`stamps_delta`/`programType` **[M]** | 1 colonne + 1 branchement |
| **D-4** | Caisse : PWA appairée, ou PIN | 2 manifestes, appairage 6 chiffres, `till_sessions` **[M]** | le PIN est **inacceptable** en production (E-05) |
| **D-5** | Réécrire les politiques RLS | `USING (true)` sur 3 tables **[D]** vs `customers` sans GRANT **[M]** | non négociable : données personnelles |
| **D-6** | Catalogue de récompenses côté serveur | `reward_tiers` **[M]** vs constante client **[D]** | non négociable : intégrité |
| **D-7** | Clé d'idempotence sur les écritures de solde | `client_operation_id` **[M]** | non négociable : double crédit |
| **D-8** | Devise et type de montant | `amount_mad:integer` + `devise` **[M]** vs `DECIMAL` + € **[D]** | faible, mais bloque la parité |
| **D-9** | Consentement CNDP | `p_consentement_cndp` + version **[M]** | non négociable : juridique |
| **D-10** | Realtime : l'implémenter ou l'abandonner | **non mesuré** **[?]** | à trancher par le produit, pas par la mesure |

### 5.3 Ce que R1 peut commencer **sans** attendre D-1

| Chantier | Pourquoi il est sûr |
|---|---|
| Next.js (App Router, RSC, `vary` mesuré) | F-1 à F-11 n'en dépendent pas |
| Design system « verre » (tokens `--vitre-*`/`--verre-*` capturés) | purement présentationnel |
| i18n FR/EN/AR | aucun contrat de données |
| Outillage de recette (`--verifier` rejoué sur nos pages) | indépendant du schéma |

Et ce que R1 ne doit **pas** commencer : **aucune migration de schéma, aucune
route d'écriture, aucune politique RLS.** Une table créée avant D-1 serait une
décision de produit prise par accident — exactement ce que R0 existe pour
empêcher.


## 6. Rejouer R0 — et les limites de ce qu'il établit

### 6.1 Rejouer

```bash
cd FIDELIX
node tools/rea/sonder-base.mjs --capture 2026-10-28-r0   # 7 GET, 0 écriture
node --test tools/rea/tests/*.test.mjs                    # 256/256, hors ligne
```

La sonde doit rendre, dans cet ordre : **`conforme = false`** (cible),
**`true`** (`conversation.md`), **`false`** (spec) ; 3 tables ; 0 ligne ; 2 RPC ;
et les 4 divergences de la spec (`total_spent`, `points_delta`, `staff_user_id`,
`notes`). C'est le **seul feu vert falsifiable** que R0 laisse derrière lui : il
ne passera à `true` du côté de la cible que lorsque les **7** tables manquantes
existeront *et* que les **3** tables en trop auront été traitées. Tant que ce
n'est pas le cas, la sonde le dira — y compris si la migration est partielle, ce
qui est le cas le plus probable.

### 6.2 Limites explicites

1. **La RLS de la base de reconstruction n'est pas mesurée.** Elle est
   *indiscernable* sur une table vide. R0 ne dit ni « activée », ni « absente »,
   ni « permissive » — il dit que `anon` obtient **200** et **0 ligne**.
2. **Aucun droit d'écriture n'est mesuré** — les tester serait écrire.
3. **Aucune RPC n'a été appelée.** Leurs signatures sont lues, pas exercées ;
   `EXECUTE` pour `anon` reste **[?]**.
4. **Le contenu du QR n'est pas mesuré**, ni côté client ni côté `/qrcode`.
   L'écart E-04 porte donc sur un **chemin**, pas sur un encodage observé.
5. **`conversation.md` n'est pas une source.** L'arbitrage du §4 décrit ce qu'il
   *dit* ; il ne valide aucune de ses décisions. Un écart « ○ mineur » n'est pas
   un écart bénin : c'est un écart dont je n'ai pas su mesurer la conséquence.
6. **Le DDL de la conversation est lu, pas exécuté.** E-10 et §4.4 reposent sur
   le `SECURITY DEFINER` **écrit** dans la conversation ; la base, elle, ne
   rend pas le corps des fonctions.
7. **Aucune comparaison pixel** n'a été faite : R0 est un état des **contrats**,
   pas des rendus.
8. **Les 4 RPC de signature inconnue** le restent. R0 ne les comble pas.
9. **E-20 est structurel, pas exécuté.** « Le SQL de la spec ne peut pas
   s'exécuter sur la base en place » se déduit de la **comparaison des colonnes** ;
   aucun `CREATE` n'a été tenté. La conclusion est solide (les noms diffèrent),
   mais elle n'a pas été prouvée par une erreur du serveur.
10. **L'ordre des deux documents n'est pas établi.** Ce qui est mesuré, ce sont
    les `mtime` : spec **2026-10-26 17:00**, `conversation.md` **2026-10-28
    02:01**. Ce qui est **inféré**, c'est la chronologie (« le fichier le plus
    ancien a été écrit en premier ») — un `mtime` est une date de modification,
    pas de rédaction. La triangulation établit en revanche un fait plus solide :
    **la base suit `conversation.md`**, donc c'est son SQL qui a été exécuté.

### 6.3 Ce que R0 change dans le dossier

| Fichier | Nature |
|---|---|
| `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md` | **ce document** — le livrable |
| `tools/rea/base.mjs` | module pur : 3 modèles de référence + comparateur |
| `tools/rea/sonder-base.mjs` | CLI **lecture seule** par construction, triangulation incluse |
| `tools/rea/tests/base.test.mjs` | **38 tests**, dont 3 qui portent la thèse : `403 ≠ 404`, table vide ≠ colonnes manquantes, et **la base EST `conversation.md`** |
| `_captures/2026-10-28-r0/sonde-base.json` | artefact gitignoré, 9 695 o, **aucune clé** |
| `PROGRESS.md` / `active_context.md` / `tasks_plan.md` / `lesson-learned.md` | mis à jour ; **B-4 clos** |

**Total des tests : 256/256.** Rien de ce que R0 a produit ne touche à la
production Fidelix, à la base de reconstruction (hors lecture), ni au dossier
`UNICITY/`.

> **La troisième source est arrivée après la première rédaction de ce document.**
> Elle a été traitée comme les deux autres : lue, datée, empreintée (sha256), et
> confrontée par **test** plutôt que par lecture. Trois choses ont changé — la
> triangulation (§3.5), les écarts E-19 à E-22 (§4.5) et la charge de la preuve
> sur D-1 (§5.1) — et **aucune décision déjà écrite n'a été réécrite en
> silence** : les écarts E-01 à E-18 restent valides, y compris ceux que la spec
> aurait pu corriger.

