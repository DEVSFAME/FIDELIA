---
type: rea
status: done
module: caisse
tags: [rea, fidelix, pos, offline, pwa]
updated: 2026-10-26
---

# Caisse (POS)

Sources : `raw/pages/p09-caisse.html` (40 321 o),
`raw/assets/_next_static_chunks_app_caisse_*.js` (layout, page, error),
`raw/assets/_next_static_chunks_6866-*.js` (35 632 o — logique POS),
`raw/pages/p21-caisse-manifest.webmanifest`.

## 1. C'est une application séparée

```json
{ "name": "Caisse Fidelix", "short_name": "Caisse", "start_url": "/caisse",
  "scope": "/caisse", "display": "standalone",
  "background_color": "#faf9f8", "theme_color": "#1a1a1a" }
```

- `scope: /caisse` ⇒ navigation confinée, **installable seule** sur le téléphone
  du commerçant/employé.
- `theme_color #1a1a1a` (sombre) ≠ `#f94c3a` (dashboard) ⇒ chrome distinct assumé.
- Chunk `app/caisse/error-*.js` ⇒ **error boundary dédiée** : le POS ne casse pas
  en page blanche.

## 2. Accès public, activation contrôlée

`GET /caisse` = **200 sans session** (mesuré). Le contenu est un écran d'activation :

> « **Activer cette caisse** — Demandez le code au gérant : il l'affiche depuis son
> espace Fidelix, dans la page **Caisses employé**. Scanner le QR du gérant ou
> saisissez le code. »

⇒ Modèle de sécurité : la page est publique, **l'appairage** est le secret.
API : `POST /api/caisse/appairer` (corps non observé).

## 3. Fonctions observées dans le bundle POS

Chaînes relevées (fichier `6866` + `app_caisse_page`) :

| Chaîne | Sens |
|---|---|
| `Ajouter un tampon` | action principale |
| `Code client ou lien de la carte` / `Code client C-XXXXXX, ou lien de la carte` | deux entrées : code **ou** URL de carte |
| `Entrez le code client (C-XXXXXX), ou collez le lien de la carte.` | fallback quand le QR ne passe pas |
| `Pointez vers le QR code du client` | mode caméra |
| `Hors ligne — les …` | bandeau hors ligne |
| ` en attente d'envoi` | **file d'attente** de transactions |
| `Solde au dernier passage — hors ligne` | affichage optimiste d'un solde non confirmé |
| `Refuser la demande de` | réclamation/validation (parrainage ou avis) |

Endpoints liés : `/api/scan/card?id=`, `/api/scan/cards`, `/api/transaction`,
`/api/transaction/annuler`, `/api/caisse/reviews`,
`/api/caisse/parrainage-valide`, `/api/caisse/cadeau-filleul`,
`/api/caisse/appairer`.

## 4. Ce que « hors ligne » implique (déduit, à confirmer)

1. **Lecture** : trouver un client sans réseau ⇒ cache local (probablement
   localStorage/IndexedDB — la clé `fidelix_caisse_*` existe, mais **aucune preuve**
   de la structure de cache).
2. **Écriture** : transactions mises en file (« en attente d'envoi ») puis rejouées.
   ⇒ **l'idempotence est obligatoire**, sinon un rejeu double les tampons.
   Le mécanisme exact (clé d'idempotence ? id généré client ?) est **inconnu**.
3. **Affichage** : « solde au dernier passage » ⇒ l'UI distingue explicitement un
   solde local non confirmé d'un solde serveur.

C'est le point le plus risqué du clone : à lever en Phase 1, priorité haute.

## 5. Multi-programme & devise

Clés `localStorage` mesurées :
- `fidelix_caisse_programme` ⇒ une caisse peut servir **plusieurs programmes**
  (multi-PDV / multi-marque).
- `fidelix_caisse_devise` ⇒ la devise est **paramétrable** (DH par défaut, mais
  stockée comme préférence).

## 6. Ce qui manque

- [ ] Écran réel après appairage (aucune capture).
- [ ] Structure du cache local et stratégie de résolution de conflits.
- [ ] Plafond de la file hors ligne et comportement en cas de rejet serveur.
- [ ] Validation des récompenses au comptoir (retrait d'un palier).
- [ ] Impression / ticket ? (aucune trace observée).
