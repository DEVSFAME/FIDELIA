# Plan de tâches — Fidelix

Légende : ✅ fait et prouvé · 🚧 en cours · ⏸ bloqué · ⬜ à faire

## Phase 0 — REA surface publique

| # | Tâche | Statut | Preuve |
|---|---|---|---|
| 0.1 | Identité serveur (framework, hébergeur, région) | ✅ | en-têtes HTTP, `manifeste.json` |
| 0.2 | Périmètre depuis `robots.txt` + `sitemap.xml` | ✅ | `raw/pages/p18-sitemap.xml`, `p19-robots.txt` |
| 0.3 | Outil de capture rejouable (SHA-256, `--verifier`) | ✅ | `tools/rea/capturer-fidelix.mjs` |
| 0.4 | Passe 1 (12 pages) puis passe 2 (+9 cibles découvertes) | ✅ | 21 pages en 200, 50 assets, 0 erreur |
| 0.5 | Oracle de routes | ✅ | 12 × `307 → /login` |
| 0.6 | Auth (GoTrue) + validation (Zod) | ✅ | littéraux de bundles |
| 0.7 | Inventaire des 20 endpoints `/api/*` | ✅ | `contrats.json` §api |
| 0.8 | Cartographie des 12 modules gardés | ✅ | `/guide` + nav du layout privé |
| 0.9 | Design system (tokens verre, polices, couleurs) | ✅ | CSS capturé |
| 0.10 | Tarification | ✅ | texte de `/` |
| 0.11 | Corpus vault (11 notes) | ✅ | `01_REA_Fidelix/` |

## Phase 1 — REA authentifiée ✅ débloquée (2026-10-26 00:15)

| # | Tâche | Statut | Preuve / Déblocage |
|---|---|---|---|
| 1.0 | Obtenir une session (`ouvrir-session.mjs`, `FIDELIX_COOKIE`, ou `--cdp`) | ✅ | 2 cookies `sb-*-auth-token.*` ; préflight `ACTIVE` exit 0 |
| 1.0b | Outiller le déblocage (préflight, garde `modeAttendu`, anti-écrasement, capture rendue) | ✅ | 22 tests ; sonde `/dashboard` ; cookie transmis |
| 1.1 | Capturer les modules gardés + `/caisse` | ✅ | 11 pages 200 + 53/53 assets, `2026-10-26-auth/` |
| 1.1b | Trancher `/account`, `/abonnement`, `/loyalty` | ✅ | **404** pour les trois → réfutées |
| 1.2 | Capturer la console admin | ⏸ **B-2** | `/admin` → 307 `/dashboard` : rôle insuffisant |
| 1.3 | Capturer la caisse **appairée** | ⏸ **B-3** | non appairée (40 ko) ; activation par code requise |
| 1.4 | Relever les contrats d'écriture | ✅ **A2** | **0 POST émis** ; 28 endpoints POST lus dans les bundles (11 recoupent les 12 × 405) ; 19 corps lisibles ; 5 schémas zod côté client ; 36 tests, 110/110 |
| 1.5 | Inférer le modèle de données (tables/relations/RLS) | ✅ | **A1** : 8 tables en GET ; colonnes observées (23/34/16/10) ; relations par *embedding* ; `customers` 42501 ; `rewards` PGRST205 ; RLS vs GRANT distingués |
| 1.6 | Contrat wallet (génération/mise à jour des pass) | ✅ **A3** | **0 écriture** : 2 routes de génération en **GET-navigation** (`/api/wallet/apple/<id>`, `/api/wallet/google/<id>`), 1 `/statut` **Apple seulement** (Google → 404) ; page publique `/card/<cardId>` ; 25 tests, 135/135 |
| 1.7 | Mécanique hors ligne (file, idempotence, conflits) | ✅ **A4** | **0 requête** : IndexedDB `fidelix-caisse` v2, magasins `file_attente` + `cartes`, FIFO par `cree_le`, rejeu **65 s**, rejet `{400,403,404,422}`, `client_operation_id` = id d'élément ; **le chunk 6866**, pas `app/caisse/page` |
| 1.8 | Fidelia AI (entrées, sorties, garde-fous) | ✅ **A5** | **0 requête** : 2 `GET` **nus** (aucune entrée), grille locale 10/10/10, `donneesInsuffisantes` = porte, 12 garde-fous, TTL `18e5` ; contrat dans le **layout**, 0 chunk `fidelia` ; 50 tests, 218/218 |
| 1.9 | **Re-mesure de parité (A6)** — 15 cibles HTTP + rendu | ✅ **2026-11-02** | **13 × 200**, 2 rejets (`/admin`, `/onboarding` → `/dashboard`), 3 × 404 (`/loyalty`, `/account`, `/abonnement`), **61/61 assets**, rendu **13/15**, 0 erreur — `_captures/2026-11-02-a6/` |
| 1.10 | **Découverte + fermeture des angles morts (A7/A7b)** | ✅ **2026-11-02** | **11 cibles nouvelles** sur 22 (`/api-cles`, `/billing`, `/settings`, `/equipe`, `/campaigns`, `/api/commerce/actif`) → A7 **5 × 200 + 1 × 404** ; `/notifications` et `/customers`, absents de **tous** les manifestes, capturés en A7b **2/2 en 200** — `_captures/decouverte-2026-11-02-a6.json` |
| 1.11 | **Matrice de parité fonctionnelle (hors IA)** | ✅ **2026-11-02** | **16 écarts** mesurés et classés P0/P1/P2 : `docs/parite-fonctionnelle-2026-11-02.md` |


> ✅ **Débloqué le 2026-10-26 (00:15).** Le blocage B-1 n'était pas une absence
> de session : c'était **l'outil** qui la refusait. Deux mesures l'ont établi —
> (1) `/api/me` ne renvoie **jamais** 200 (401 anonyme, 404 authentifié) : il
> servait pourtant de sonde ; (2) `entetes(env, cookie)` **ignorait** le cookie
> du profil. Corrigés, couverts par des tests, et la passe authentifiée est
> passée : **13 pages HTTP · 20 sondes · 13 rendus · 0 erreur · 2 rejets nommés**.
> Restent **B-2** (pas de compte admin) et **B-3** (caisse non appairée).


## Phase 2 — Reconstruction

> ✅ **Porte D-1 — FRANCHIE le 2026-10-28 (03:10).** Décision **humaine** :
> **option A — clone isofonctionnel de Fidelix, nommé `Fidelia`.**
> La cible redevient la **référence** ; les **22 écarts** de R0 deviennent des
> **exigences de parité**. `conversation.md` et la spec restent des points de
> départ, jamais des autorités. **B-5 levé.**
>
> Conséquence immédiate : la base de reconstruction reste celle de
> `conversation.md` (`conforme = true`) et donc **incompatible avec la cible** —
> la migration est **due**. Les écarts E-19/E-21 deviennent des **pièges à ne pas
> recopier** (RLS nommée sans politique, bouton au lieu d'une clé d'idempotence).

| # | Tâche | Statut | Dépend de |
|---|---|---|---|
| 2.0 | **R0 — état basal** : corpus, base sondée + triangulée, 22 écarts | ✅ | A1→A5 |
| 2.0b | **Décision D-1** : **A — clone isofonctionnel `Fidelia`** | ✅ **A retenu** | 2.0 |
| 2.0d | **`basal-knowledge.md`** : boîte à outils (Wallet, scan, temps réel, hors ligne) | ⬜ | 2.0b |
| 2.0c | **R1.2 — durcissement `EXECUTE` + RLS** : `REVOKE … FROM PUBLIC` sur les 2 RPC puis `GRANT` à `anon`, `authenticated`, `service_role` (fichier **fusionné** avec 0002 le 2026-10-31), RLS sur les 3 tables | ✅ | **DDL non exécuté** : `migrations/0001_acl_rls_durcissement.sql` ; vérifié par `verifier-durcissement.mjs` (**exit 0**) + 27 tests ; les 7 tables que le bundle lit **n'existent pas en base** ⇒ aucune lecture mesurée à casser |
| 2.1 | Socle Next.js + Supabase + i18n FR/EN/AR | 🟡 **1/2** | 1.5, **2.0b** — Next 16.4.3/React 19.3.1/TW 3.4.19, `login → dashboard`, `/dashboard` gardé côté serveur (`next build` ✅, `307` sans session) ; **reste** : register/reset, i18n branchée dans l'UI |
| 2.2 | Design system « verre » (tokens capturés) | ✅ | 0.9 — `verifier-design.mjs` **CONFORME** (variables+classes+polices), 3 déviations déclarées `HORS_LEDGER` ; 42 `@font-face`/23 binaires transcrits ; `docs/design-system.md` |
| 2.3 | Auth (login, register, reset, gardes) | 🟡 **login + garde** | login en server action (message unique, pas d'oracle) + garde `getUser()` serveur ; register/reset restent à faire |
| 2.4 | Dashboard : Accueil, Clients, Programme, Récompenses | ⬜ | 1.1 |
| 2.5 | Dashboard : Apparence, QR code, Points de vente, Équipe | 🟡 **3/4** | **Apparence ✅ 2026-11-02** (`/branding`, `0015`, 27 tests, `docs/mesure-p0-6-apparence-2026-11-02.md`) ; QR code ✅ (`/qrcode`) ; Équipe ✅ (`/caisses`, `0006`/`0007`) ; **points de vente** : le relevé est fait (P2-2), l'écran d'appairage reste ⏸ (`/caisse` non appairée, **B-3**) |
| 2.6 | POS `/caisse` (PWA séparée, scan, hors ligne) | 🟡 **PWA + hors ligne ✅ 2026-11-03** | scan ✅ (caméra, `CameraScanner`), manifeste **mesuré** + `sw.js` + icônes engendrées, file `file_attente` idempotente (`0016`, **non exécutée**), crédit rejouable, repli public `/caisse-hors-ligne` ; **reste** : l'**appairage** de la caisse (**B-3**, action humaine) et le rejeu mesuré une fois `0016` passée |
| 2.7 | Automatisations (push 3/j, email 3/sem, relances) | ⬜ | 1.4 |
| 2.8 | Parrainage + bonus avis Google | ⬜ | 1.4 |
| 2.9 | Fidelia AI | ⬜ | 1.8 |
| 2.10 | Abonnement + Payzone | ⬜ | 1.4 |
| 2.11 | Public : marketing, `/recompenses`, `/join`, `/rendez-vous` | ⬜ | 0.0 (déjà capturé) |
| 2.12 | Recette de fidélité (22 routes + empreintes) | ⬜ | 2.1→2.11 |

## Phase 2bis — Parité fonctionnelle mesurée (2026-11-02, hors IA)

> Source : `docs/parite-fonctionnelle-2026-11-02.md`. Ces **13 écarts au plan**
> sortent de la **mesure** (DOM privé + XHR), pas d'un backlog. Une tâche ne se
> ferme qu'avec sa preuve dans `_captures/` et un écran qui la rend.
>
> Trois écarts mesurés sont **hors plan** et ne sont donc pas des tâches :
> multi-PDV + rôles (ex-P0-8), `/api-cles` (ex-P1-3), darija (ex-P2-3). Ils
> restent dans le relevé — le plan se resserre, la mesure ne se réécrit pas.

| # | Écart | Priorité | Dépend de |
|---|---|---|---|
| P0-1 | `/program` — cashback, expiration des points, parrainage, bonus avis Google + lien | P0 | 1.10 |
| P0-2 | `/settings` — fiche établissement (11 champs), notification à proximité, langue, mot de passe, résiliation | P0 | 1.10 — **la notification à proximité est MESURÉE le 2026-11-04** (passe A8 : geofence Wallet, aucune requête au passage, formule `min(rayon−250, 3825/2π)+250` → plafond **859 m**, coordonnées en base ; `docs/notification-proximite-2026-11-04.md`) ; le clone reste **inerte** → **P0-2b** au backlog |
| P0-3 | `/billing` + **plafond 30 clients** + plaque NFC — le bandeau est sur **chaque** écran — **livré partiellement le 2026-11-02** : règle de comptage mesurée (`docs/regle-comptage-30-2026-11-02.md`), compteur `0012`, bandeau, `/billing`, onglets « Mon compte ». **Reste** : le verrou (P0-3b, demande un état payant) et le paiement (P0-3c) | P0 | P0-2 |
| P0-4 | `/notifications` (envoi réel) · `/campaigns` · `/automations` | P0 | 1.10 |
| P0-5 | `/branding` — logo, couleur, type d'établissement (10 valeurs mesurées) | P0 | ✅ **livré le 2026-11-02** (mesure, `0015`, écran + aperçu, 27 tests). **Reste** : envoi de fichier (aucun stockage dans le socle) et section « 4 · Tampons par carte » → **P0-5b/P0-6b** |
| P0-6 | `/reviews` — validation/refus des demandes de bonus | P0 | 1.10 |
| P0-7 | Parrainage (`parrainages_du_commerce`, bonus, « Venus par parrainage ») | P0 | P0-1 |
| P1-1 | Fiche client `/customers/:id` + import de clients | P1 | — |
| P1-2 | `/equipe` (responsables) distinct de `/caisses` (caisses) | P1 | — |
| P1-4 | Dashboard : responsables, meilleurs clients, clients à relancer, parrainage | P1 | P0-7 |
| P1-5 | QR : copier le lien + télécharger SVG | P1 | — |
| P2-1 | Mode sombre + « Nouveau look » | P2 | — |
| P2-2 | Création de caisse + appairage POS (`/caisse`) | P2 | 1.3 |

## Règles de progression

- Une tâche n'est ✅ que si **sa preuve est dans `_captures/`** et rejouable.
- Aucune tâche de reconstruction ne démarre sans son équivalent Phase 1 :
  reconstruire sans avoir observé, c'est inventer.
