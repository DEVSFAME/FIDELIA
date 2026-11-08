---
type: rea
status: done
module: ui
tags: [rea, fidelix, ui, flows, public]
updated: 2026-10-26
---

# Parcours publics (UI flows)

Chaque étape ci-dessous est **lue dans le HTML/les bundles capturés**. Les états
visuels (couleurs, espacements) ne sont pas mesurés ici : il faudra des captures
rendues (Phase 1, option B).

## 1. Découverte → essai

```
/  (hero + calculateur ROI + tarifs)
 ├─ "Commencer gratuitement" ─▶ /demarrer
 │     étape 1 : prénom · commerce · WhatsApp   (+ consentement Meta)
 │     étape 2 : vidéo
 │     étape 3 : compte                          ─▶ /register
 ├─ "Demander une démo" ──────▶ /rendez-vous
 │     prénom · WhatsApp · commerce · ville · adresse (opt.) · nb PDV · créneau
 ├─ "Ajouter la carte démo" ──▶ pass wallet de démonstration
 └─ nav : #fonctionnalites · #etapes · #tarifs · FR / EN / AR · Connexion
```

Points durs à reproduire :
- Le CTA « Commencer » mène à **`/demarrer`** (tunnel court, tutoiement) et non
  directement à `/register` (vouvoiement). **Deux tonalités, deux funnels.**
- Le calculateur est **interactif dès le premier écran** (4 curseurs) : c'est un
  argument de vente, pas un formulaire.

## 2. Inscription commerçant

```
/login ──"Créer un compte"──▶ /register
   Nom complet · Email pro · Téléphone · Mot de passe · Confirmation
   ☑ conditions  ☑ confidentialité
   [Créer mon compte gratuitement]  ─▶ (inconnu : /onboarding ? /dashboard ?)
/login ──"Mot de passe oublié ?"──▶ /forgot-password ──▶ POST /api/auth/reinitialiser
```

Les champs sont validés **avant** l'appel (Zod) et les erreurs Supabase sont
**traduites en français** (cf. [[Fidelix_Authentification]]).

## 3. Adhésion d'un client final (le cœur du produit)

```
QR affiché en boutique (guide §04)
   └─▶ /recompenses/<slug>      « Voici ce que vous allez gagner »
         4 paliers listés · [Obtenir ma carte gratuite]
           └─▶ /join/<slug>     « Votre carte en 30 secondes »
                 Qui vous a servi ? (opt.)   Date de naissance (opt.)
                 ☑ conditions  ☑ confidentialité
                 [Obtenir ma carte]  ─▶ rpc("join_loyalty_program")
                       └─▶ pass Apple/Google (contrat non observé)
```

Contraintes mesurées :
- **Aucun prénom, aucun nom, aucun téléphone** n'est demandé.
- L'email n'est demandé **que si** le commerçant fait des campagnes (guide §10).
- L'identité rendue au commerçant est un **code** (`C-XXXXXX`), pas une personne.
- L'employé choisi à l'adhésion est **attribué** (liste de prénoms du commerce).

## 4. Caisse

```
/caisse  (public, installable seule — scope /caisse)
   « Activer cette caisse »
     ├─ scanner le QR du gérant
     └─ saisir le code fourni depuis « Caisses employé »
          └─▶ POST /api/caisse/appairer  ─▶ écran de scan (non observé)
                 ├─ caméra « Pointez vers le QR code du client »
                 ├─ code C-XXXXXX ou lien de la carte (fallback)
                 ├─ « Ajouter un tampon » ▶ /api/transaction
                 └─ hors ligne ▶ file « en attente d'envoi »
```

## 5. Modules gardés (aucun écran observé)

```
/program  /rewards  /scan  /reviews  /qrcode  /automations  /branding
/caisses  /loyalty  /dashboard  /admin  /onboarding        → 307 /login
```

## 6. Écarts & décisions à prendre en reconstruction

| # | Constat | Décision nécessaire |
|---|---|---|
| U1 | `/ar` déclare `lang="fr"` | fidélité ou accessibilité ? |
| U2 | Deux tonalités (tutoiement `/demarrer`, vouvoiement ailleurs) | conserver tel quel (c'est un choix marketing assumé) |
| U3 | Deux design systems (`fidelix_skin`) | reconstruire les deux ou une seule ? |
| U4 | `/join` dit « aucune donnée personnelle collectée », le guide dit « laisse son email » | la collecte est un **réglage**, pas une constante |
| U5 | `/card/` et `/r/` déclarés au robots mais 404 | contrats à lever (Phase 1) |
