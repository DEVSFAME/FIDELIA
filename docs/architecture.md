# Architecture observée — Fidelix

> Tout ce qui suit est **mesuré** (en-têtes HTTP, noms de chunks, littéraux de
> bundles) ou **cité du produit** (`/guide`). Rien n'est supposé.

## 1. Vue d'ensemble

```
                    ┌──────────────────────────────────────────┐
   navigateur ─────▶│  Next.js (App Router) — Vercel fra1      │
   (commerçant)     │  RSC + client components, Tailwind CSS   │
                    └───────────────┬──────────────────────────┘
                                    │ fetch serveur + client
                    ┌───────────────▼──────────────────────────┐
                    │  Routes /api/* (Node — gardées, 401)     │
                    │  transaction · scan · caisse · payments  │
                    │  fidelia · broadcast · push · rendez-vous│
                    └───────────────┬──────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
   Supabase (auth + DB+RPC)     Payzone (paiement)        Resend (email)
   GoTrue · PostgREST · rpc()   /api/payments/payzone/…    /api/email/welcome
                                    │
                                    ▼
                             Wallet (Apple/Google) — pass générés côté serveur
```

Preuves : `raw/assets/` (littéraux `/api/*`, `supabase.co`, `payzone`, `resend`),
`contrats.json` §`backend`, `manifeste.json` §`releves`.

## 2. Découpage applicatif (App Router)

| Groupe de routes | Preuve | Contenu observé |
|---|---|---|
| `(auth)` | chunk `app/(auth)/layout`, `app/(auth)/login/page` | `/login`, `/register`, `/forgot-password` |
| `(dashboard)` | chunk `app/(dashboard)/layout` | shell privé : nav, Fidelia AI, thème |
| `(admin)` | chunk `app/(admin)/layout` | console interne |
| public | chunks `app/page`, `app/guide/page`, `app/en/page`, `app/ar/page`, `app/conditions|confidentialite|mentions-legales/page` | marketing + légal |
| `recompenses/[slug]` | chunk `app/recompenses/%5Bslug%5D/page` | 27 programmes publics |
| `caisse` | `app/caisse/layout`, `app/caisse/page`, `app/caisse/error` + **manifeste propre** | POS PWA |
| `join/[slug]` | chunk `app/join/%5Bslug%5D/page` | adhésion client |

**Deux applications PWA** : `scope: /` et `scope: /caisse` (manifestes séparés,
`theme_color` différents : `#f94c3a` vs `#1a1a1a`).

## 3. Authentification

- **Supabase GoTrue** : `auth.signInWithPassword`, `signUp`, `resend`, `signOut`,
  `getSession`, `onAuthStateChange`, `getUser` (bundle `raw/assets/*.js`).
- Validation **Zod** côté client : `password.min(6)`, `same_password`,
  `weak_password` (codes d'erreur Supabase).
- **Garde serveur** : toute route privée répond `307 → /login` (12 mesurées).
- **Garde API** : `/api/*` répond `401` **sans distinguer le chemin** (une route
  inexistante répond aussi 401) ⇒ l'énumération par statut est impossible.
- Session attendue sous forme de cookies Supabase (`sb-<ref>-auth-token`) —
  **à confirmer en Phase 1**.

## 4. Domaines fonctionnels et leur contrat d'écriture

| Domaine | Routes API observées | Statut |
|---|---|---|
| Transaction caisse | `POST /api/transaction`, `/api/transaction/annuler` | corps **non observé** |
| Scan | `/api/scan/card?id=`, `/api/scan/cards` | corps **non observé** |
| Caisse | `/api/caisse/appairer`, `caisse/reviews`, `caisse/parrainage-valide`, `caisse/cadeau-filleul` | corps **non observé** |
| Adhésion client | `rpc("join_loyalty_program")` (Supabase) | signature **non observée** |
| Paiement | `/api/payments/payzone/initiate` | corps **non observé** |
| Emails | `/api/email/welcome`, `/api/broadcast` | corps **non observé** |
| Push | `/api/push/subscribe` | corps **non observé** |
| IA | `/api/fidelia`, `/api/fidelia?resume=1` | corps **non observé** |
| Commerce | `/api/commerce/select` | corps **non observé** |
| Équipe | `/api/equipe/activer` | corps **non observé** |
| Compte | `/api/auth/reinitialiser` | corps **non observé** |
| Acquisition | `/api/liste-attente`, `/api/rendez-vous` | corps **non observé** |

## 5. Stockage local (préférences d'interface)

| Clé | Rôle |
|---|---|
| `fidelix_theme` | clair / sombre |
| `fidelix_skin` | « nouveau look » / « ancien look » |
| `fidelix_rail` | rail de navigation rangé/déployé |
| `fidelix_caisse_devise` | devise du POS |
| `fidelix_caisse_programme` | programme sélectionné en caisse |
| `fidelix_conseiller_` (préfixe) | état du conseiller IA |

## 6. Ce qui manque à cette architecture (Phase 1)

1. Modèle de données (tables, colonnes, RLS) — déductible des requêtes PostgREST.
2. Formes exactes des corps d'écriture (12 endpoints).
3. Contrat wallet (génération et mise à jour des pass).
4. Mécanique hors ligne (stockage, résolution de conflits, idempotence).
5. Découpage réel des écrans du dashboard (ce que `layout` promet vs ce que les
   pages rendent).
