---
type: rea
status: done
module: global
tags: [rea, fidelix, serveur, infra, modele-donnees]
updated: 2026-10-27
---

# Serveur & infrastructure

## 1. En-têtes mesurés

```
HTTP/2 200
server: Vercel
x-powered-by: Next.js
x-vercel-cache: MISS
x-vercel-id: fra1::fra1::mvn24-1793051310995-5abbdf6a5f29
strict-transport-security: max-age=63072000
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
link: </_next/static/media/*.woff2>; rel=preload; as="font"   (×5)
```

Lectures certaines :
- **Vercel** + **Next.js** ; exécution dans la région **`fra1`** (Paris, pas Casablanca).
- `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`
  ⇒ **App Router avec RSC et prefetch** (pas Pages Router).
- Marketing en `no-store` ⇒ pages rendues dynamiquement (pas de cache CDN statique).
- 5 polices préchargées ⇒ design typographique assumé (cf. [[Fidelix_Design_System]]).

## 2. Garde d'authentification

```
GET /dashboard   → 307  location: /login
GET /admin       → 307  location: /login
GET /onboarding  → 307  location: /login
```

La garde est **côté serveur (middleware)** : le 307 arrive avant tout HTML.

## 3. Répartition des assets

| Type | Nombre | Taille |
|---|---|---|
| JS (`/_next/static/chunks/*`) | 48 | 1,7 Mo |
| CSS (`/_next/static/css/*`) | 2 | 148 Ko (132 499 o + 12 316 o) |
| **Total assets** | **50** | — |

Ledger complet : 21 pages + 19 sondes + 50 assets = **90 cibles**
(`_captures/2026-10-26/manifeste.json`).

## 4. Identifiants de déploiement

Les URLs d'assets portent `?dpl=dpl_4DcaK7zj7wzMAtLd6TQFxNDKBX5c`.
- C'est un **identifiant de déploiement Vercel**, pas un secret.
- Il change à chaque déploiement ⇒ **une empreinte de page change aussi**.
  Conséquence pour la recette de fidélité : comparer à **déploiement constant**.

## 5. Deux applications PWA

```json
// /manifest.webmanifest
{ "name": "Fidelix", "start_url": "/", "scope": implicite "/",
  "theme_color": "#f94c3a", "background_color": "#fcede7", "display": "standalone" }

// /caisse/manifest.webmanifest
{ "name": "Caisse Fidelix", "short_name": "Caisse", "start_url": "/caisse",
  "scope": "/caisse", "theme_color": "#1a1a1a", "background_color": "#faf9f8",
  "display": "standalone" }
```

⇒ La caisse est **installable séparément** avec son propre chrome visuel.
Preuve : `raw/pages/p20-manifest.webmanifest`, `p21-caisse-manifest.webmanifest`.

## 6. Indexation

```
User-Agent: *
Allow: /
Disallow: /admin      Disallow: /caisse     Disallow: /dashboard
Disallow: /onboarding Disallow: /api/       Disallow: /card/
Disallow: /r/
Sitemap: https://fidelix.ma/sitemap.xml
```

`/card/` et `/r/` sont **déclarés mais non résolus** (`404` sur des identifiants
factices) : ce sont des routes à identifiant (carte client publique, lien court),
pas des pages fixes. **Statut : existence probable, contrat inconnu.**

## 7. Points ouverts

- [ ] Quel CDN/wrapper sert les pass wallet (Apple PassKit, Google Pay API) ?
- [ ] Configuration CORS des endpoints `/api/*` (non testable sans origine).
- [ ] Middleware : redirige-t-il aussi `/loyalty` par une règle générique ou liste-t-il
      les 12 préfixes ? (testable en Phase 1 avec une route inconnue).

## 8. Modèle de données — A1 (2026-10-27, **lecture seule**)

> **Périmètre.** Aucun `POST`, aucune écriture, aucun compte créé. Toutes les
> mesures ci-dessous viennent de `GET` sur PostgREST
> (`https://<ref>.supabase.co/rest/v1/…`), avec **la session du profil** et la
> clé `anon` (publique, relue dans les assets capturés, jamais recopiée ici).
> Outil : `tools/rea/mesurer-modele.mjs` (`--tirages 6`). Sortie brute, gitignorée :
> `_captures/2026-10-27-a1/modele.json` — **noms et types de colonnes seulement**.

### 8.1 Ce que la mesure a dû corriger pour pouvoir mesurer

| Fait mesuré | Conséquence |
|---|---|
| Le cookie d'auth du profil portait un `access_token` **expiré de 22 min** : PostgREST répondait `PGRST303 JWT expired` alors que `/dashboard` répondait 200. | Le préflight dit « session vivante », pas « jeton valide ». L'outil **rafraîchit par un simple GET** de `/dashboard` : c'est l'application qui renouvelle ses cookies (exp +3 596 s). Aucun POST, aucun `refresh_token` manipulé à la main. |
| `GET /rest/v1/` (racine OpenAPI) → **401**, `{"message":"Invalid API key","hint":"Only the service_role API key can be used for this endpoint."}` | Le **schéma déclaré est fermé** à tout rôle non-`service_role`. Les colonnes ne peuvent donc venir que des **lignes réellement renvoyées**. |
| `GET /rest/v1/rpc/<nom>` répond `PGRST202 … without parameters` **aussi pour un nom inventé** (`zzz_temoin_rea_inexistant`). | Cette sonde **ne discrimine rien** : elle ne prouve ni l'existence ni l'absence d'une RPC. Elle a donc été écartée, pas interprétée. |

### 8.2 Vue d'ensemble — 8 tables interrogées

`Prefer: count=exact` donne le total ; `limit=3` donne les colonnes réellement
servies. « anon » = même requête **sans** jeton, clé `anon` seule.

| Table | Avec session | anon (sans jeton) | Colonnes | Lecture |
|---|---|---|---|---|
| `loyalty_programs` | **206**, 309 lignes | **206, 309 lignes** | **23** | lisible **en public**, sans filtrage |
| `reward_tiers` | **206**, 81 lignes | **206, 81 lignes** | **10** | lisible **en public**, sans filtrage |
| `restaurants` | 200, **1** ligne | 200, **0** ligne | **34** | RLS : le commerce du compte seulement |
| `transactions` | 200, **1** ligne | 200, **0** ligne | **16** | RLS : le commerce du compte seulement |
| `automations` | 200, **0** ligne | 200, 0 ligne | 0 | vide **ou** filtré — non distinguable sans écrire |
| `till_sessions` | 200, **0** ligne | 200, 0 ligne | 0 | idem |
| `customers` | **403** `42501` | **401** `42501` | 0 | `permission denied for table customers` |
| `rewards` | **404** `PGRST205` | 404 | 0 | **la table n'existe pas** |

Deux 4xx qui se ressemblent et ne disent pas la même chose — c'est le point
méthodologique de cette passe :

- `42501` sur `customers` ⇒ **la table existe**, le rôle n'a **aucun GRANT**.
  Le `hint` de PostgREST le dit explicitement :
  `GRANT SELECT ON public.customers TO authenticated`. Le dashboard affiche donc
  des clients **sans les lire en direct** : la lecture passe par le serveur Next
  (rôle `service_role`), pas par le navigateur.
- `PGRST205` sur `rewards` ⇒ **la table n'existe pas** ; le `hint` propose
  `reward_tiers`. `/rewards` est une **route**, pas une table : l'hypothèse
  « table `rewards` » est réfutée par la mesure.



### 8.3 Colonnes observées (les seules qui soient prouvées)

`?` = `null` observé dans l'échantillon. Types = types JSON réellement servis.

**`loyalty_programs`** (23) —
`id:string`, `restaurant_id:string`, `name:string`, `type:string`,
`points_per_purchase:integer?`, `min_purchase_mad:integer?`, `stamps_total:integer?`,
`reward_description:string`, `reward_threshold:integer`, `points_expiry_days:null?`,
`is_active:boolean`, `created_at:string`, `updated_at:string`,
`referral_reward:integer`, `review_reward:integer`, `review_reward_enabled:boolean`,
`google_review_url:null?`, `enseigne_id:string`, `stamp_icon:null?`, `devise:string`,
`deduction_libre:boolean`, `referral_reward_filleul:null?`, `referral_cadeau_filleul:null?`

**`restaurants`** (34) —
`id`, `user_id`, `name`, `slug`, `description?`, `phone?`, `address?`, `city?`,
`country`, `logo_url?`, `primary_color`, `secondary_color`, `accent_color`,
`is_active`, `created_at`, `updated_at`, `commerce_type`, `wallet_bg_url?`,
`type_activite`, `message_wallet?`, `message_wallet_le?`, `latitude?`, `longitude?`,
`geofence_radius_m`, `geofence_texte?`, `billing_exempt`, `site_url?`,
`instagram_url?`, `facebook_url?`, `tiktok_url?`, `reservation_url?`,
`style_bandeau`, `enseigne_id`, `country_code`
(tous `string` sauf `is_active`/`billing_exempt` booléens et `geofence_radius_m` entier).

**`transactions`** (16) —
`id`, `card_id`, `restaurant_id`, `type`, `points_delta:integer`,
`stamps_delta:integer`, `amount_mad:integer`, `note?`, `employee_id?`,
`table_number?`, `pos_reference?`, `created_at`, `reward_tier_id?`,
`client_operation_id:string`, `till_session_id?`, `auteur_id`

**`reward_tiers`** (10) —
`id`, `program_id`, `title`, `description?`, `cost:integer`, `position:integer`,
`is_active:boolean`, `created_at`, `updated_at`, `restaurant_id?`

`automations` et `till_sessions` n'ont renvoyé **aucune ligne** : leurs colonnes
ne sont **pas mesurées** et ne seront pas inventées (l'OpenAPI est fermé, cf. 8.1).

### 8.4 Relations mesurées (`select=*,<cible>(*)`)

Une clé imbriquée prouve la relation ; `PGRST200` prouve son absence.

| De → vers | Mesure |
|---|---|
| `transactions` → `restaurants` | relation (objet) |
| `transactions` → `reward_tiers` | relation (valeur `null` sur l'échantillon) |
| `transactions` → `till_sessions` | relation (valeur `null`) |
| `reward_tiers` → `loyalty_programs` | relation (objet) — via `program_id` |
| `reward_tiers` → `restaurants` | relation (valeur `null`) |
| `loyalty_programs` → `restaurants` | relation (valeur `null`) |
| `loyalty_programs` → `reward_tiers` | relation (tableau) — inverse de `program_id` |
| `restaurants` → `loyalty_programs`, `automations`, `transactions`, `reward_tiers`, `till_sessions` | 5 relations (tableaux) |
| `loyalty_programs` → `automations` / `transactions` / `till_sessions` | **aucune** (`PGRST200`) |
| `reward_tiers` → `automations` / `till_sessions` | **aucune** |

Lecture : tout passe par `restaurants` (le commerce) ; `reward_tiers` pend à
`loyalty_programs` ; `transactions` porte trois clés étrangères nullables.
`customers` est absent du graphe **parce qu'il est inaccessible** (42501), pas
parce qu'il est sans relation.

### 8.5 RPC — ce qui est prouvé, et ce qui ne l'est pas

| RPC | Existence | Signature |
|---|---|---|
| `classement_caisses`, `mon_role_point_de_vente`, `parrainages_du_commerce` | **prouvée par l'appel réel** observé en S2/S3 (XHR `POST`) | **inconnue** |
| `journal_operateur`, `taux_desinscription_wallet`, `notifications_envoyees_aujourdhui` | **prouvée par le bundle** (`rpc("…")`) — jamais appelées devant nous | **inconnue** |

PostgREST ne sert une fonction **qu'en `POST`** : obtenir sa signature exige
d'émettre un `POST`, ce que le périmètre interdit. La sonde `GET /rpc/<nom>` a
été calibrée avec un **témoin négatif** et s'est révélée **non discriminante** :
elle n'est pas utilisée comme preuve.

### 8.6 `/customers/<uuid>` — tranché le 2026-10-27

Outil : `tools/rea/verifier-lien-client.mjs` (clic réel + GET direct de contrôle).
Mesures, toutes avec la session du profil :

| Cible | Statut | Taille | Titre | Liens |
|---|---|---|---|---|
| `/customers/<uuid réel>` (lien du dashboard) | **200** | **92 595 o** | « Fidelix — La fidélité qui régale » | **21** |
| `/customers/00000000-0000-4000-8000-000000000000` | **404** | 38 069 o | « Page introuvable — Fidelix » | 0 |
| `/clients-inexistant-rea` | **404** | 38 186 o | « Page introuvable — Fidelix » | 1 |

Le clic dans un navigateur réel ouvre la **fiche client** (identité, solde,
historique) ; un `reload` sert **la même vue** (même empreinte de texte, 765 o).

> **Correction.** S3 avait sondé `/customers/00000000-…` — un UUID **synthétique**,
> choisi exprès pour ne pas archiver la fiche d'un client réel — et concluait
> « 404 Next nu, donc lien mort (probable) ». La mesure d'aujourd'hui **réfute**
> cette conclusion : le 404 qualifiait **l'identifiant** (« client inconnu »),
> pas la route. La fiche existe et se sert en `GET` direct.
> Le manifeste S3 disait d'ailleurs le contraire du commentaire : « un 404 avec
> cet identifiant signifie “client inconnu”, PAS “route absente” ».

### 8.7 Limites explicites de A1

1. **Expressions RLS non lisibles** : on mesure *ce qui passe* (309 lignes vs 1,
   anonyme vs authentifié), pas *la règle* qui le décide. `pg_policies` n'est pas
   exposé par PostgREST.
2. **Colonnes des tables vides inconnues** (`automations`, `till_sessions`).
3. **Signatures des RPC inconnues** (POST interdit).
4. **`loyalty_programs` et `reward_tiers` sont lisibles par la clé `anon`** :
   309 programmes et 81 paliers, tous commerces confondus. C'est cohérent avec
   les pages publiques `/recompenses/<slug>`, mais **ce n'est pas « filtré »** —
   à signaler au client comme choix de conception à confirmer, pas comme fuite
   prouvée (aucune donnée personnelle dans ces deux tables).

parce qu'il est sans relation.
