---
type: rea
status: partiel
module: dashboard
tags: [rea, fidelix, shell, navigation]
updated: 2026-10-26
---

# Shell du dashboard — **navigation connue, écrans non observés**

> ⚠️ Statut : **partiel assumé**. La nav, les peaux et le bandeau d'abonnement sont
> **mesurés dans un bundle public**. Les écrans eux-mêmes ne le sont pas (12 routes
> en `307 → /login`). Aucun contenu d'écran n'est décrit ici.

## 1. Preuve d'origine

`raw/assets/_next_static_chunks_app__dashboard__layout-aa8914c1bd963665.js`
(52 158 o), servi publiquement et référencé par `/login`.

Occurrences mesurées dans ce fichier : `clients` ×22, `scan` ×13, `program` ×8,
`equipe` ×9, `branding` ×6, `caisses` ×6, `abonnement` ×6, `qrcode` ×5,
`rewards` ×4, `fidelia` ×4, `reviews` ×3, `automations` ×2.

## 2. Entrées de navigation (libellés exacts du bundle)

| Libellé | Route gardée correspondante (oracle) |
|---|---|
| **Accueil** | `/dashboard` |
| **Clients** | (route non sondée sous ce nom ; `/clients` à tester) |
| **Programme** | `/program` |
| **Récompenses** (`Trophy`) | `/rewards` |
| **Scanner** / « Scanner un client » | `/scan` |
| **Avis Google** | `/reviews` |
| **Messages** | (route inconnue) |
| **Points de vente** / « Mes points de vente » | (route inconnue ; `/caisses` = caisses employé) |
| **Apparence** (`Palette`) | `/branding` |
| **Mon compte** | (route inconnue) |
| **Console Admin** | `/admin` |
| **Fidelia AI** | panneau latéral, pas une route |
| **QR code** | `/qrcode` |
| **Automatisations** | `/automations` |
| **Équipe** | `/caisses` (page « Caisses employé ») |

Autres chaînes du shell : `LayoutDashboard`, `Store`, `Trophy`, `Sun`, `Moon`,
`PanelLeftClose`, `Ellipsis`, `Plus`, `Minus`, `ArrowRight` (jeu d'icônes
**Lucide**, cohérent avec `LayoutDashboard`/`PanelLeftClose`).

## 3. Chrome & préférences

- **Thème** : « Mode clair » / « Mode sombre » (`Sun` / `Moon`) → `fidelix_theme`.
- **Peau** : « Nouveau look » / « Ancien look » / « Essayer le nouveau look »
  → `fidelix_skin`. ⇒ **deux design systems cohabitent en production**.
- **Rail** : « Ranger le menu » (`PanelLeftClose`), `Plus`/`Minus` → `fidelix_rail`.
- **Palette** (`Palette`) : sélecteur de couleur d'accent, probablement par commerce.

## 4. Abonnement & paywall (mesuré dans le layout)

Chaînes du chunk `(dashboard)/layout` : `" mois offert"`, `F.moisOfferts > 0`,
`F.moisCouverts`, `k.limite`, `k.clients - k.limite > 1`, `"Payer et ouvrir mon
espace"`, `"Rythme de paiement"`, `"Mensuel"`.

Lecture : le shell contient un **bandeau d'essai/paywall** qui compare
`clients` à `limite` et pousse vers le paiement. C'est cohérent avec l'offre
« gratuit jusqu'à 30 clients » (`limite = 30`).
⇒ **Le quota est vérifié dans le shell, pas seulement à l'inscription.**

## 5. Ce qui manque (Phase 1)

- [ ] Arborescence exacte des routes sous `/dashboard/*` (les 12 préfixes sont
      connus, leur imbrication non).
- [ ] Contenu de chaque écran (tableaux, filtres, formulaires, modales).
- [ ] Bandeau d'essai : conditions exactes d'affichage et de disparition.
- [ ] Rôle employé : quelles entrées disparaissent ?
- [ ] `Console Admin` : visible pour qui ?
