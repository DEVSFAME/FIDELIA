---
type: rea
status: done
module: marketing
tags: [rea, fidelix, marketing, pricing]
updated: 2026-10-26
---

# Marketing public & acquisition

Sources : `raw/pages/p01-home.html` (206 867 o), `p04-guide.html`, `p13-register.html`,
`p14-demarrer.html`, `p15-rendez-vous.html`, `p02-home-en.html`, `p03-home-ar.html`.

## 1. `/` — page de vente

Sections mesurées (dans l'ordre du DOM) :

1. **Hero** — « Rendez chaque client fidèle » + preuve visuelle : trois cartes
   mock (« Pharmacie les Lilas » 45 pts `C-6H4BSM`, « Le barbier » 85,
   « My Nails » 120) avec libellés `POINTS`, `CODE CLIENT`, `IL VOUS MANQUE`,
   `DEPUIS`.
2. **Bandeau capacités** — Apple Wallet · Scan en caisse · Cartes wallet ·
   Récompenses · Campagnes email.
3. **Avant/Après** — « Sans Fidelix » (4 douleurs) vs « Avec Fidelix » (4 gains).
4. **Calculateur de ROI** — 4 curseurs (clients/jour 50, panier moyen 70 DH,
   26 jours/mois, gain 10 %) → CA additionnel 9 100 DH, coût 397 DH,
   bénéfice 8 703 DH, ROI ×23, projection annuelle 104 436 DH.
   → **Formules vérifiées à l'unité** :
   `50 × 70 × 26 = 91 000` ; `91 000 × 10 % = 9 100` ;
   `9 100 − 397 = 8 703` ; `9 100 / 397 = 22,92 → ×23` ;
   `8 703 × 12 = 104 436`. Le calcul est donc **entièrement reproductible**, sans
   arrondi caché. (Le coût 397 est celui du Standard 1 PDV.)
5. **« Fidelix est fait pour vous si… »** — 2 personas.
6. **Tout-en-un** — fonctions détaillées (carte, paliers, campagnes, stats).
7. **Preuve sociale** — « Darb Side », « La Table Du Burger » (verbatims courts).
8. **Tarifs** (voir §3).
9. **CTA final** + footer (Confidentialité, CGV, Mentions légales).

## 2. `/guide` — le produit raconté par lui-même

10 sections ; c'est la **meilleure source de spécification fonctionnelle** :

| § | Titre | Contenu clé |
|---|---|---|
| 01 | Choisir votre programme | tampons vs points ; seuil atteignable en **5–8 semaines** |
| 02 | Écrire votre menu de récompenses | 3 paliers (rapide / cible / aspirationnel) ; palier désactivable |
| 03 | Habiller votre carte | logo ≥ 300 px, couleur principale, image assombrie auto |
| 04 | Afficher votre QR code | « porte d'entrée » ; email seul ; **10 secondes** |
| 05 | Encaisser au comptoir | scan, tampon, correction |
| 06 | Donner un accès à vos employés | accès limités et révocables |
| 07 | Faire revenir vos clients | push **3/jour max**, email **3/semaine max**, 5 000 emails/PDV/mois |
| 08 | Recruter par vos clients | parrainage (bonus double) + bonus avis Google **validé au comptoir** |
| 09 | Lire vos chiffres | 3 KPI : cartes actives, taux de retour, récompenses remises |
| 10 | FAQ | changement de téléphone, seuil, refus d'email, erreur d'employé, 2ᵉ boutique, **loi 09-08**, responsables |

Trois affirmations structurantes à conserver dans le clone :
- « La carte est liée à son **email**, pas à son appareil » ⇒ récupération par re-scan.
- « La loi 09-08 réserve la collecte aux organismes déclarés CNDP : Fidelix l'est,
  votre commerce ne l'est pas » ⇒ **le commerçant voit un code `C-7K4M2P`**, jamais
  l'identité. C'est une contrainte d'architecture, pas un choix d'UI.
- « Le bonus d'avis se valide au comptoir, jamais automatiquement : Google interdit
  de conditionner un avis à une contrepartie automatique. »

## 3. Tarification mesurée

| Offre | Prix | Détail |
|---|---|---|
| Gratuit | 0 | jusqu'à **30 clients**, « toutes les fonctionnalités, sans carte bancaire », on paie au 30ᵉ client |
| Standard | **397 MAD/mois/PDV** TTC | mensuel / semestriel / annuel ; résiliable |
| Emails | 10 000 → **200** · 25 000 → **400** · 50 000 → **700** MAD/mois | pack ajouté à l'abonnement, effet au prélèvement suivant |
| Carte NFC | **150 MAD** une fois | prix dégressif selon quantité |
| API / volume | sur devis | pare-feu dédié |

Inclus dans le Standard (liste du produit) : clients illimités, carte personnalisée,
Apple & Google Wallet, paliers, **scan illimité même sans internet**, accès employés
limités/révocables, push & campagnes, parrainage + avis Google, stats temps réel,
formation, **conseiller IA et notification à proximité**, support prioritaire.

## 4. Funnels

### `/demarrer` (3 étapes affichées)
1. Tes infos — prénom, nom du commerce, WhatsApp
2. La vidéo
3. Ton compte
Consentement explicite : « Fidelix utilise mes informations pour me recontacter…
et que **Meta mesure ma visite** » ⇒ pixel Meta sur le funnel.

### `/rendez-vous`
Démo 15 min : prénom, WhatsApp, nom du commerce, ville, adresse (facultatif),
nombre de PDV (1→5+), créneau (matin/après-midi/soir/peu importe).
« Sur place à **Casablanca** ; ailleurs au Maroc, démo en visio. »
Bouton « Ajouter la carte démo » (pass wallet de démonstration).

### `/register`
Nom complet · email pro · téléphone · mot de passe ×2 · CGU + confidentialité.

## 5. i18n — anomalie mesurée

| Page | Taille | `lang` | Arabe |
|---|---|---|---|
| `/` | 206 867 o | `fr` | — |
| `/en` | 204 464 o | `fr` | — |
| `/ar` | 201 456 o | **`fr`** | **13 364 caractères arabes** |

⇒ `/ar` est bien traduit mais **déclare `lang="fr"`**. À trancher en reconstruction :
fidélité (recopier) ou correction (accessibilité). **Décision produit, pas bug d'outil.**
