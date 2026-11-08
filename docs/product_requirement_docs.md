# PRD — Fidelix (reconstruction isofonctionnelle)

## 1. Pourquoi ce projet

Reproduire `https://fidelix.ma` à l'identique fonctionnellement et visuellement :
une plateforme de **fidélité digitale pour commerces marocains**, sans application
mobile côté client final (carte dans Apple/Google Wallet).

## 2. Problème résolu (formulation du produit, citée de `/guide`)

> « Les mêmes offres pour tous, même vos meilleurs clients · Les clients oubliés
> après une seule visite · Aucune idée de qui revient vraiment »
> — `raw/pages/p01-home.html`

La réponse produit : une carte wallet scannée en caisse, des paliers de
récompenses, des relances automatiques et trois indicateurs de pilotage.

## 3. Acteurs

| Acteur | Accès | Preuve |
|---|---|---|
| **Commerçant** (propriétaire) | dashboard complet, abonnement, multi-points de vente | nav du layout privé + `/guide` |
| **Employé / responsable** | accès limité et révocable, un point de vente | guide §06 « Donner un accès à vos employés » ; `sondes /caisses` |
| **Client final** | `/recompenses/<slug>`, `/join/<slug>`, carte wallet — **sans compte** | 27 pages publiques + `/join` |
| **Prospect** | `/`, `/guide`, `/demarrer`, `/rendez-vous`, `/register` | 200 anonymes mesurés |
| **Admin Fidelix** | `/admin` (console) | `robots.txt` + `307` + libellé « Console Admin » |

## 4. Fonctionnalités (périmètre de parité)

### 4.1 Cœur fidélité
- Deux mécaniques exclusives : **tampons** (1 passage = 1 tampon) ou **points**
  (montant dépensé). Détail : `/guide` §01.
- **Paliers de récompenses** (3 recommandés : petit / intermédiaire / gros),
  désactivables individuellement. `/guide` §02.
- **Seuil** réglable ; les soldes en cours ne bougent pas. `/guide` FAQ.
- Carte client identifiée par **code** (`C-XXXXXX`), pas par nom (loi 09-08 / CNDP).

### 4.2 Caisse (POS)
- PWA **autonome** (`scope: /caisse`), appairage par **QR du gérant ou code**.
- Scan du QR/lien client, ajout tampon/point, annulation de transaction.
- **Hors ligne** : file d'attente, solde au dernier passage.
- Avis Google validés au comptoir (jamais automatiques).
- Parrainage (code client, bonus double) et cadeau filleul.

### 4.3 Marketing & rétention
- Notifications push (plafond **3/jour**) et campagnes email (plafond **3/semaine**).
- Emails transactionnels inclus : **5 000 / point de vente / mois**.
- Cartes email par pack : 10 000 = 200 MAD, 25 000 = 400 MAD, 50 000 = 700 MAD.
- Relances automatiques (« il vous manque un tampon »).

### 4.4 Pilotage
- **3 KPI** : cartes actives, taux de retour, récompenses remises.
- **Fidelia AI** : conseiller hebdomadaire, ne voit que des nombres, jamais
  l'identité des clients (`/guide` §09, `/api/fidelia`).
- Statistiques temps réel, notification à proximité.

### 4.5 Structure & compte
- Multi **points de vente**, bascule depuis le menu, tarif par point de vente.
- **Apparence** : logo, couleur principale, image de fond assombrie automatiquement.
- **Abonnement** : mensuel / semestriel / annuel, Payzone, résiliable.
- **Apparence du dashboard** : mode clair/sombre, « nouveau look / ancien look »,
  rail rangeable (preuves : `fidelix_theme`, `fidelix_skin`, `fidelix_rail`).

### 4.6 Public & acquisition
- Marketing FR/EN/AR (`/`, `/en`, `/ar`), calculateur de ROI, tarifs.
- `/demarrer` : funnel en 3 étapes (infos → vidéo → compte), consentement Meta.
- `/rendez-vous` : démo 15 min, rappel WhatsApp, formulaire ville/PDV/créneau.
- `/register` : nom, email pro, téléphone, mot de passe, CGU + confidentialité.

## 5. Tarification (mesurée sur `/`)

| Offre | Prix | Inclus |
|---|---|---|
| Gratuit | 0 | jusqu'à **30 clients**, toutes fonctionnalités, sans carte bancaire |
| Standard | **397 MAD/mois/PDV** TTC | clients illimités, wallet, paliers, scan illimité **même sans internet**, accès employés, push illimitées, 5 000 emails/PDV/mois, parrainage, avis Google, stats temps réel, formation, IA, support prioritaire |
| Packs email | 200 / 400 / 700 MAD | 10 000 / 25 000 / 50 000 emails par mois |
| Carte NFC | **150 MAD** une fois | approche du téléphone, sans QR |
| Sur devis | — | API avec pare-feu dédié, cartes en volume |

## 6. Exigences non fonctionnelles observées

- **Maroc first** : DH, WhatsApp, Payzone, français + arabe + anglais.
- **Sans installation** côté client final (wallet uniquement).
- **Conformité** : loi 09-08 / CNDP — le commerçant ne voit pas l'identité, il voit
  un code ; Fidelix poste les emails.
- **Résilience** : la caisse doit fonctionner sans internet.

## 7. Hors périmètre v1 (à confirmer)

- Console Admin Fidelix (`/admin`) : outil interne, pas une fonction commerçant.
- `/loyalty` : route gardée dont le rôle n'est pas observé.
- API publique sur devis.

## 8. Ce que ce PRD ne sait pas encore

Les écrans internes (dashboard, caisse appairée, admin) n'ont **pas** été observés.
Toute description de leur contenu serait une invention. Voir `PROGRESS.md` (B-1).
