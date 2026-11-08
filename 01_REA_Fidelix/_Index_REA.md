---
type: index
status: done
module: global
assignee: null
dependencies: []
tags: [rea, fidelix, index]
updated: 2026-10-27
---

# Index REA Fidelix

Source de vérité des preuves extraites de `https://fidelix.ma`.

## Cible
- **Produit** : plateforme de fidélité digitale pour commerces marocains
  (carte Apple/Google Wallet, scan en caisse, récompenses, automatisations).
- **Stack** : Next.js App Router sur **Vercel** (`fra1`), backend **Supabase**.
- **i18n** : FR (défaut), EN, AR.

## Périmètre réellement couvert (2026-10-26)

| Famille | Capturé | Statut |
|---|---|---|
| Marketing public | `/`, `/en`, `/ar`, `/guide` | ✅ 200 |
| Légal | `/conditions`, `/confidentialite`, `/mentions-legales` | ✅ 200 |
| Auth | `/login`, `/register`, `/forgot-password` | ✅ 200 (formulaires) |
| Acquisition | `/demarrer`, `/rendez-vous` | ✅ 200 |
| Client final | `/recompenses/<slug>` (×3 échantillons / 27), `/join/<slug>` | ✅ 200 |
| POS | `/caisse` (écran d'activation) | ✅ 200 |
| PWA | 2 manifestes | ✅ 200 |
| **Modules gardés** | 12 routes | ⏸ `307 → /login` — **contenu non observé** |

## Notes globales
- [[Fidelix_Serveur]]
- [[Fidelix_Authentification]]
- [[Fidelix_Methodologie_Oracle]]
- [[Fidelix_API_Contrats]]
- [[Fidelix_Design_System]]

## Modules
- [[Fidelix_Marketing_Public]]
- [[Fidelix_Caisse_POS]]
- [[Fidelix_Recompenses_et_Join]]
- [[Fidelix_Dashboard_Shell]]
- [[Fidelix_Fidelia_AI]]

## UI
- [[Fidelix_UI_Flows_Public]]

## Passes de capture
- `_captures/cibles.json` — manifeste des 21 pages + 19 sondes (chaque cible porte son `pourquoi`).
- `_captures/2026-10-26/manifeste.json` — ledger empreinté : **21 pages en 200, 12 redirections, 50 assets, 0 erreur**.
- `_captures/2026-10-26/contrats.json` — 51 routes, 20 endpoints, 11 polices, 30 couleurs.
- `_captures/2026-10-26/raw/` — contenu octet à octet (`pages/`, `sondes/`, `assets/`).
- `_captures/2026-11-04-a8/` — **la notification à proximité** : `/settings`
  **avec ses 30 assets** (A7 n'avait archivé que la page) + `/sw.js` en sonde.
  Formule de couverture (`250` / `3825`, plafond **859 m**), persistance en
  `latitude`/`longitude`, et contrat d'opt-in web push →
  `docs/notification-proximite-2026-11-04.md`.
  Manifeste : `_captures/cibles-a8-2026-11-04.json`.

## Outils
- `tools/rea/capturer-fidelix.mjs` — capture / `--verifier` / `--diag` / `--inventaire`.
- `tools/rea/analyser-fidelix.mjs` — extraction de contrats.
- `tools/rea/mesurer-modele.mjs` — **A1** : modèle de données en GET seul
  (`--tirages`, `--tables`, `--diag-openapi`) ; sortie noms/types, jamais de valeurs.
- `tools/rea/verifier-lien-client.mjs` — clic réel sur un lien de fiche + GET de
  contrôle (id réel / id nul / route inconnue) ; UUID masqué.
- `tools/rea/relever-contrats.mjs` — **A2** : relève les contrats d'écriture
  dans les bundles capturés (`--temoins` pour ne sortir que la calibration).
  **N'émet aucune requête** : le module n'importe ni `http` ni `fetch`.
- `tools/rea/relever-wallet.mjs` — **A3** : relève le contrat wallet dans
  **trois** corpus (anonyme, authentifié, page carte) et classe chaque
  occurrence par **rôle** (route / champ / mesure / prose) et par **foyer**
  (page applicative / supabase `auth-js`). `--temoins` pour la calibration seule.
  **N'émet aucune requête** non plus.
- `tools/rea/modele.mjs` — briques pures de A1 (cookies, colonnes, verdict de lien).
- `tools/rea/contrats.mjs` — briques pures de A2 (littéraux `/api/`, méthode +
  genre de preuve, corps de `fetch`, schémas zod, calibration par témoins).
- `tools/rea/wallet.mjs` — briques pures de A3 (relevé sans double comptage,
  assemblage `.concat` → route, genre d'appel navigation/fetch/lien, foyer).
- `node --test tools/rea/tests/*.test.mjs` — **135 tests** hors ligne.

## Contrats d'écriture (A2) et wallet (A3)
- `01_REA_Fidelix/Global/Fidelix_API_Contrats.md` — **28 endpoints POST** lus
  dans le code client, avec le **genre de preuve** (manifeste / fetch / route /
  aide), les corps, les 5 schémas zod, et ce qui reste inconnu.
  **§5.4** : les **3 routes wallet** (2 navigations GET + 1 statut JSON),
  mesurées sur la page **publique** `/card/<cardId>`.
- `_captures/2026-10-27-a2/contrats-bundles.json` — relevé brut (gitignoré).
- `_captures/2026-10-27-a3/` — bundle public de la page carte + relevé +
  sondes (`mesure-a3.json`), sans identifiant client (gitignoré).
- **Aucun POST émis** : ce corpus est du code, pas du trafic. En A3, seuls des
  `OPTIONS` et des `GET` de lecture ont été émis.
