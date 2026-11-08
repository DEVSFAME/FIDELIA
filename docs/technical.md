# Stack & conventions — Fidelix

## 1. Stack observée (cible)

| Couche | Technologie | Preuve |
|---|---|---|
| Framework | **Next.js (App Router)**, React Server Components | `x-powered-by: Next.js`, chunks `app/**/page-*.js` |
| Hébergement | **Vercel**, région `fra1` (Paris) | `server: Vercel`, `x-vercel-id: fra1::…` |
| Style | **Tailwind CSS** + tokens CSS custom | `--tw-*` (63 occurrences), `--verre-*`, `--vitre-*` |
| Auth | **Supabase GoTrue** | `auth.signInWithPassword` etc. |
| Données | **Supabase** (PostgREST + RPC) | URL projet + `rpc("join_loyalty_program")` |
| Paiement | **Payzone** (Maroc) | `/api/payments/payzone/initiate` |
| Email | **Resend** | `/api/email/welcome`, `resend` (5 occurrences) |
| Wallet | Apple Wallet + Google Wallet | 18 occurrences `wallet`, `/guide` §03 |
| Validation | **Zod** | `same_password`, `weak_password`, `min(6)` |
| Analytics pub | Meta Pixel (consentement explicite) | texte `/demarrer` |
| i18n | FR (défaut), EN, AR | `/`, `/en`, `/ar` + 13 364 caractères arabes |

## 2. Conventions de mesure (protocole hérité d'Onify)

1. **Toute affirmation porte une preuve** : fichier de `raw/` + ligne ou compte.
2. **`absent` ≠ `introuvable`** : avant de conclure qu'une chose n'existe pas,
   vérifier qu'on l'a *demandée* (route sondée, asset téléchargé).
3. **`307 → /login` est une preuve d'existence**, pas une absence.
4. **Une cible ajoutée au manifeste porte son motif** (`pourquoi` dans `cibles.json`).
5. **Aucune écriture** sur la production : GET uniquement, jamais de POST.

## 3. Outillage

```bash
cd FIDELIX
node tools/rea/capturer-fidelix.mjs              # passe complète
node tools/rea/capturer-fidelix.mjs --pages      # pages seules
node tools/rea/capturer-fidelix.mjs --verifier   # vérifie les empreintes
node tools/rea/capturer-fidelix.mjs --diag /login
node tools/rea/analyser-fidelix.mjs              # régénère contrats.json
```

- `cibles.json` : manifeste des cibles (pages + sondes), avec `pourquoi`.
- `manifeste.json` : ledger de la passe (statut, octets, SHA-256, stable/dynamique).
- `contrats.json` : routes, endpoints, stockage, polices, couleurs, locales.
- `raw/` : **le contenu réel**, octet à octet (`pages/`, `sondes/`, `assets/`).

## 4. Session

```bash
# FIDELIX/.env  (gitignoré)
FIDELIX_COOKIE=sb-xxxx-auth-token=...; sb-xxxx-auth-token-code-verifier=...
FIDELIX_UA=                 # facultatif
```

Sans `FIDELIX_COOKIE`, l'outil tourne en **mode ANONYME** (comportement par défaut,
et c'est ce qui a produit la passe du 2026-10-26).

## 5. Design system (extrait mesuré)

| Rôle | Valeur | Preuve |
|---|---|---|
| Accent / `theme_color` | `#f94c3a` | manifeste + CSS |
| Encre foncée | `#1d1a18` | CSS (5 occurrences) |
| Fond clair | `#faf9f8`, `#fcede7` | CSS + manifeste |
| POS `theme_color` | `#1a1a1a` | manifeste caisse |
| WhatsApp | `#25d366` | CSS (bouton) |
| Script | **Caveat** | `font-family` (13) |
| Display | **Space Grotesk** | (10) |
| Texte | **Inter** | (8) |
| Mono | **JetBrains Mono** | (7) |
| Impact / titres | **Anton** | (4) |

**Motif « verre »** (glassmorphism) piloté par variables :

```
--verre-flou: 22px | 0px          --verre-flou-fort: 34px | 0px
--verre-saturation: 140% | 165%   --verre-opacite: 0.17 → 1
--verre-bord: 255 255 255         --verre-bord-opacite: 0.09 → 1
--vitre-fond: #2a2826             --vitre-arete: rgb(255 255 255 / 0.1–0.7)
--grain-opacite: 0.045 | 0.055    (texture de grain SVG, cf. filtre `feTurbulence`)
```

Deux jeux de valeurs cohabitent (clair/sombre et « nouveau/ancien look ») —
c'est ce que pilotent `fidelix_theme` et `fidelix_skin`.

## 6. Contraintes de reconstruction

- **Maroc** : DH, WhatsApp, Payzone, AR (RTL) — le `lang="fr"` observé sur `/ar`
  est une anomalie à trancher, pas à recopier aveuglément.
- **Deux PWA** : ne pas fusionner caisse et dashboard.
- **Hors ligne obligatoire** sur le POS.
- **Aucune installation** côté client final : wallet seulement.
