---
type: rea
status: done
module: global
tags: [rea, fidelix, methode]
updated: 2026-10-26
---

# Méthodologie — oracle de routes

## Principe

Sonder **en GET, sans session**, et lire le code comme un contrat :

| Réponse | Lecture |
|---|---|
| `200` | route publique (ou page d'erreur rendue) |
| `307 → /login` | **la route existe** et elle est gardée |
| `404` | route inexistante **ou** identifiant invalide (voir piège §3) |
| `401` | API gardée, **aveugle au chemin** |

⚠️ **`/api/*` n'est pas énumérable par statut** : `/api/vous-navez-pas-invente`
répond `401` comme `/api/transaction`. L'inventaire API vient donc **exclusivement
des littéraux du bundle** (`"/api/…"`), pas du sondage.

## Table mesurée du 2026-10-26

| Chemin | Code | Lecture |
|---|---|---|
| `/dashboard` | 307 | module gardé |
| `/admin` | 307 | console interne |
| `/onboarding` | 307 | parcours d'activation |
| `/program` | 307 | programme de fidélité |
| `/rewards` | 307 | récompenses |
| `/scan` | 307 | scan |
| `/reviews` | 307 | avis |
| `/qrcode` | 307 | QR code |
| `/automations` | 307 | automatisations |
| `/branding` | 307 | apparence |
| `/caisses` | 307 | caisses/employés |
| `/loyalty` | 307 | route gardée, rôle inconnu |
| `/caisse` | **200** | POS : écran d'activation public |
| `/recompenses/<slug>` | 200 | catalogue client (27 slugs) |
| `/join/<slug>` | 200 | adhésion client |
| `/register` `/demarrer` `/rendez-vous` `/forgot-password` | 200 | acquisition/auth |
| `/recompenses` (sans slug) | 404 | pas de page d'index |
| `/r/test`, `/card/test` | 404 | routes à identifiant valide attendu |

## Règles d'or

1. **Deux documents fondent le périmètre** : `robots.txt` (zones privées) et
   `sitemap.xml` (pages publiques). Rien d'autre n'est « supposé exister ».
2. Un `307` vaut une **preuve d'existence** ; ne jamais le lire comme une absence.
3. Les **noms de chunks Next.js** sont une source de premier ordre :
   `app/(dashboard)/layout-*.js` nomme le groupe de routes privées.
4. Un `404` sur une route à identifiant (`/card/<id>`) ne prouve **pas** que la
   route n'existe pas — seulement que l'identifiant est faux.
5. Toute cible ajoutée au manifeste porte son **`pourquoi`** (champ du JSON).

## Ce que la méthode ne donne pas

- Les corps de requête (exigent une session + un POST, donc Phase 1, et **jamais**
  sur des données réelles : compte de test uniquement).
- Les écrans (le HTML anonyme d'une page gardée n'existe pas : le 307 arrive avant).
