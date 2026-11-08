# Parité fonctionnelle Fidelia ↔ Fidelix — passe A6/A7/A7b du 2026-11-02

> **But de cette passe.** Le projet est avancé ; la question n'est plus « que fait
> la cible ? » mais « **avons-nous les mêmes fonctions ?** ». Cette passe rouvre
> la reconnaissance sur une session marchande réelle, mesure la cible **module
> par module**, et confronte le résultat au code de `web/`. **L'IA (Fidelia AI)
> est explicitement hors périmètre** — elle est marquée `hors périmètre` partout
> où elle apparaît.

## 1. Ce que la passe a réellement exécuté

| Passe | Manifeste | Résultat mesuré | Ledger |
|---|---|---|---|
| **A6** (HTTP, 15 cibles) | `_captures/cibles-auth-2026-11-02.json` | **13 × 200**, 2 rejets (`/admin`, `/onboarding` → `/dashboard`), 3 × 404 (`/loyalty`, `/account`, `/abonnement`), **61/61 assets en 200**, 0 erreur | `_captures/2026-11-02-a6/manifeste.json` |
| **A6** (rendu) | idem | **13/15** DOM hydratés, 0 erreur | `_captures/2026-11-02-a6/rendu.json` |
| **Découverte** | 13 DOM lus | **22 cibles distinctes, 11 nouvelles** (dont `/api-cles`, `/campaigns`, `/equipe`, `/settings`, `/billing`, `/api/commerce/actif`) | `_captures/decouverte-2026-11-02-a6.json` |
| **A7** (HTTP + rendu) | `_captures/cibles-a7-2026-11-02.json` | 5 × 200 + **1 × 404** (`/customers/<uuid nul>`), 0 erreur | `_captures/2026-11-02-a7/` |
| **A7b** (HTTP + rendu) | `_captures/cibles-a7b-2026-11-02.json` | **2/2 en 200** | `_captures/2026-11-02-a7b/` |

**Aucun POST, aucune écriture, aucun compte créé.** 4 pages `404` et 2 rejets sont
des **mesures**, pas des échecs : `/loyalty`, `/account`, `/abonnement` n'existent
pas (réfutés), `/admin` et `/onboarding` redirigent vers `/dashboard` (rôle
insuffisant / parcours déjà fait).

### 1.1 Le vrai résultat de la passe : le manifeste avait deux angles morts

Le manifeste du 2026-10-26 listait 15 pages. Il lui manquait **`/notifications`
(« Messages ») et `/customers` (« Clients »)** — deux entrées présentes dans le
rail privé de **13 DOM sur 13**. Un module non capturé n'est pas un module
absent : c'était un **trou du manifeste**, pas du produit. A7b le ferme.

Trois modules entièrement inconnus apparaissent en plus, tous en 200, tous
**liés depuis le rail** : `/api-cles` (« API »), `/settings` (« Mon compte »),
`/billing` (« Voir l'abonnement »). Plus deux cibles liées depuis un seul écran :
`/equipe` (« Nouveau responsable ») et `/campaigns` (« Messages → Emails »).

## 2. Matrice de parité, module par module

Légende : ✅ conforme · 🟡 partiel (la fonction existe, il manque des éléments mesurés) · ⛔ absent · 🧱 absence déclarée (stub honnête, il ne ment pas mais ne rend pas le service)

| # | Cible | Éléments mesurés dans le DOM de la cible | Fidelia | Verdict |
|---|---|---|---|---|
| 1 | `/dashboard` | 4 indicateurs (**Clients, Visites, Reviennent, CA**) + **Vos responsables** + **Meilleurs clients** + **Clients à relancer** + **Venus par parrainage** + **Transactions récentes** | 4 indicateurs + transactions récentes + totaux | 🟡 **4 sections sur 6 absentes** |
| 2 | `/customers` | « Mes clients », **Importer**, badge **Actif**, `1 client inscrit`, colonnes *Code / Points-Tampons / Récompenses / Inscrit le* | Liste + colonnes + compte + troncature | 🟡 import et statut absents |
| 3 | `/customers/:id` | Fiche client (route **existe** : 404 sur UUID nul, href observé) | — | ⛔ absent |
| 4 | `/program` | Configuration : **devise**, points, **achat minimum**, **mode cashback**, **expiration des points**, **bonus de parrainage**, **bonus avis Google + lien** | Partiellement dans `/rewards` (devise, crédits, paliers, seuil, type, slug) | ⛔ **page absente** ; 5 réglages manquants |
| 5 | `/rewards` | « Vos récompenses », **Ajouter une récompense**, **Partager**, **Copier le lien**, **« Ce que verra votre client »**, **« Ce que vous pouvez gagner »** | Paliers + enregistrement | 🟡 édition OK, **partage et aperçu client absents** |
| 6 | `/scan` | Un seul champ : *« Code client C-XXXXXX, ou lien de la carte »* + **OK** | Jeton + montant + points + chercher | 🟡 même fonction, **saisie différente** |
| 7 | `/notifications` | **Nouvelle notification** (Titre, Message, Lien optionnel) + **Envoyer** + **Historique** | `EtatPage` (aucune lecture) | 🧱 **stub** — la cible envoie vraiment |
| 8 | `/automations` | 4 blocs : **Relance client inactif**, **Bientôt une récompense**, **Anniversaire**, **Mon message à moi** + Enregistrer | — | ⛔ absent |
| 9 | `/campaigns` | Onglets **Notifications / Automatiques / Emails** + « **Les campagnes demandent un pack** » | — | ⛔ absent |
| 10 | `/reviews` | **Validation des demandes de bonus** après vérification de l'avis + « Aucune demande en attente » | `EtatPage` | 🧱 **stub** — la cible valide/refuse |
| 11 | `/caisses` | **Nouvelle caisse** (Prénom de l'employé) + Classement + Caisses actives + périodes 7 j / 30 j / depuis / 1 jour | Classement + périodes + caisses actives | 🟡 **création absente** (déjà déclarée) |
| 12 | `/equipe` | **Nouveau responsable** (Prénom du responsable) + **Responsables actifs** | — | ⛔ absent (« Responsables » n'existe que comme **portée de lecture**) |
| 13 | `/qrcode` | **Copier le lien**, **Télécharger SVG** | Affiche + lien en texte + impression | 🟡 **2 actions absentes** |
| 14 | `/branding` | 3 étapes (commerce + logo + **10 types d'établissement** / couleur / haut de carte) | `EtatPage` | 🧱 **stub** — la cible enregistre |
| 15 | `/api-cles` | **Créer une clé** (Nom de la clé) + **Vos clés** | — | ⛔ absent |
| 16 | `/settings` | **Établissement** (11 champs : nom, type, tél, ville, adresse, description, site, réservation, Instagram, Facebook, TikTok), **Notification à proximité** (emplacement, distance, message), **Langue**, **Mot de passe**, **Résiliation** | login / register / oubli / nouveau mot de passe | ⛔ **page absente** (seul le mot de passe existe) |
| 17 | `/billing` | Offre gratuite, **Mensuel / 6 mois −1 / 12 mois −2**, **Activer — 397 MAD**, **Point de vente supplémentaire — 397 MAD**, **packs email 10 000 / 25 000 / 50 000** (200 / 400 / 700 MAD) | — | ⛔ absent |
| 18 | `/caisse` | Activation par **QR du gérant** | POS : jeton, solde, récompenses, échange | 🟡 **appairage absent** (B-3) |
| — | Fidelia AI | hors périmètre de cette passe | — | ⏸ **exclu à la demande** |

Bilan brut : **3 modules partiellement conformes sans écart de fond**, **7 partiels**,
**8 absents**, dont **3 stubs honnêtes** qui ne mentent pas mais ne rendent pas le service.

## 3. Éléments transverses — présents sur **toutes** les pages de la cible

Ce sont les écarts les plus coûteux, parce qu'ils touchent chaque écran :

| Élément mesuré | Où | Fidelia |
|---|---|---|
| **Bandeau d'offre** : « Offre gratuite · 1 / 30 clients », « Voir l'abonnement », **plaque NFC 150 MAD** | 15/15 DOM | ⛔ absent → **le plafond de 30 clients n'est appliqué nulle part** |
| **Sélecteur d'établissement** (multi-points de vente) + `GET /api/commerce/actif` (XHR ×7) | 9/9 DOM | ⛔ absent |
| **Mode sombre** + **« Nouveau look »** | 15/15 DOM | ⛔ absent (design system « verre » seul) |
| **Langues : FR + الدارجة (darija)** | 15/15 DOM | FR seul — **décision humaine du 2026-10-31**, écart assumé ; à re-trancher si la parité inclut la darija |
| **Rail de 13 entrées** | 9/9 DOM | 10 entrées ; **3 manquantes** : API, Mon compte, Voir l'abonnement |

## 4. Contrats de données observés (XHR de la cible, passe A6)

| Appel | Méthode | Fréquence | Fidelia |
|---|---|---|---|
| `/api/commerce/actif` | GET | ×7 sur 5 pages | ⛔ pas d'équivalent |
| `/rest/v1/rpc/classement_caisses` | POST | ×1 | ✅ `equipe_du_commerce` (nom différent, rôle proche) |
| `/rest/v1/rpc/parrainages_du_commerce` | POST | ×1 | ⛔ **parrainage non implémenté** |
| `/rest/v1/rpc/mon_role_point_de_vente` | POST | ×1 | ⛔ **rôles / PDV non implémentés** |
| tables `automations`, `loyalty_programs`, `restaurants`, `reward_tiers`, `till_sessions` | GET | ×1–5 | schéma propre (D-1 l'autorise), **mais 2 fonctions n'ont aucune table** : automatisations, campagnes |

## 5. Écarts classés par coût de parité

**P0 — bloquants pour « isofonctionnel » (8)**
1. `/program` — config programme : cashback, expiration, parrainage, bonus avis
2. `/settings` — fiche établissement + résiliation (`/billing` en dépend)
3. `/billing` + **plafond 30 clients** + plaque NFC (le bandeau est sur chaque écran)
4. `/notifications` (envoi réel) + `/campaigns` + `/automations`
5. `/branding` — apparence : logo, couleur, type d'établissement
6. `/reviews` — validation des demandes de bonus
7. Parrainage (`parrainages_du_commerce`, bonus, « Venus par parrainage »)
8. Multi-points de vente + rôles (`mon_role_point_de_vente`)

**P1 — parité d'écran (5)**
9. Fiche client `/customers/:id` + import de clients
10. `/equipe` (responsables), distinct de `/caisses` (caisses)
11. `/api-cles`
12. Dashboard : les 4 sections manquantes (responsables, meilleurs clients, à relancer, parrainage)
13. QR : copier le lien + télécharger SVG

**P2 — finition (3)**
14. Mode sombre + « Nouveau look »
15. Création de caisse / appairage POS (`/caisse`)
16. Darija (décision produit, pas technique)

## 6. Ce que cette passe **ne** prouve pas

- **Rien sur l'IA** : `/api/fidelia` et `/api/fidelia?resume=1` répondent 200 (sonde
  inchangée), mais ce périmètre est exclu à la demande.
- **Rien sur les écritures** : aucun POST n'a été émis. « La cible enregistre » est
  lu dans le DOM (bouton + champs), **pas** observé à l'exécution.
- **Rien sur `/admin`** : 307 → `/dashboard`, rôle insuffisant (B-2, inchangé).
- **Rien sur l'état appairé de `/caisse`** : non appairée (B-3, inchangé).
- **Rien sur les prix futurs** : 397 MAD et les packs email sont lus **à cet instant**.
- **Rien de nominatif** : l'inventaire est structurel (titres, boutons, libellés,
  `href`), les UUID sont normalisés en `:id`, et la fiche client a été demandée
  avec un **UUID nul** (404) pour ne pas archiver la fiche d'un client réel.
