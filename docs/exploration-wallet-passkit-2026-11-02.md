# Explorer — la carte de fidélité dans Apple Wallet (PassKit)

**Date :** 2026-11-02 · **Statut :** exploration, **aucune ligne de code écrite**.
**Décision humaine :** compte **PassKit Inc.** créé (essai **45 jours**), voie SaaS
retenue. Ce document dit ce qui est **mesuré [M]**, **documenté [D]** et
**inconnu [?]** — jamais mélangés.

---

## 1. Le nom « PassKit » désigne deux produits, et ce n'est pas le même métier

| | Ce que c'est | Ce que ça règle | Coût |
|---|---|---|---|
| **PassKit Inc.** ([passkit.com](https://passkit.com/legal/rate-card/)) | SaaS : conception des pass, **gestion des certificats Apple**, API, analytics, validate/redeem | **supprime le compte Apple Developer** et toute la mécanique de signature | **39,50 $US/mois** minimum (1 utilisateur, ≤ 250 pass multi-usage), puis 0,045 $/pass ; essai **45 jours** [M] |
| **`passkit-generator`** ([MIT, 1,3 k★](https://github.com/alexandercerutti/passkit-generator)) | lib Node qui fabrique et **signe** le `.pkpass` (wwdr + signerCert + signerKey) | rien : il faut nos certificats Apple | gratuit, mais 99 $US/an de compte Apple [D] |

**La cible utilise la lib, pas la plateforme** : `passkit-generator` = 1 occurrence
dans son corpus, contre **0** pour `passTypeIdentifier`, `webServiceURL`, `pkpass`
(`basal-knowledge.md` §2) [M]. Le choix fait ici est donc **différent de la cible**,
et c'est assumé : on échange 39,50 $/mois contre la disparition du blocage
« compte Apple + certificat `.p12` + WWDR ».

**Le seuil qui compte :** 39,50 $ ≈ **390 MAD/mois**, soit presque le prix du
produit (397 MAD/mois). L'essai de 45 jours est donc une **fenêtre de décision**,
pas un confort : après, le Wallet coûte ~un abonnement client par commerce.

---

## 2. Le contrat de l'API, tel que documenté [D]

Tout vient de `docs.passkit.io` (get-started + `protocols/member/grpc-definitions.md`).

| Sujet | Fait documenté |
|---|---|
| Authentification | **JWT généré dynamiquement** à partir des identifiants SDK (recommandé). Les jetons longue durée sont une **exception héritée** à éviter. |
| Configuration | **Région et préfixe d'API propres au compte**, fournis dans *Developer Tools* du portail. Aucune URL de base universelle. |
| Modèle | `Program` → `Tier` → `Member`. Un programme exige **au moins un palier**. |
| Objet `Member` | contient `id`, `externalId`, `programId`, `tierId`, `points`, `person`, `metaData`, `status` (noms de messages vus dans l'index des définitions). |
| Points | `SetPointsRequest` (poser un solde) et `EarnBurnPointsRequest` (créditer/débiter) existent : **le solde se pousse par l'API**, on n'a pas à recalculer chez eux. |
| Facturation | « pricing is based on pass records, **not the number of API calls** » et « no fixed limit, subject to fair use » [M] — donc, à ≤ 250 pass, le coût est **fixe**. |
| Apple + Google | le même programme sert **Apple Wallet et Google Wallet** (une seule intégration) [M]. |
| Portail | sections *Certificate management*, *Pass URLs*, *Enrolment pages*, *Pass updates*, *Validate and redeem*, *Pass analytics* [M, lues dans la navigation]. |

---

## 3. Ce qui reste inconnu, et comment chaque inconnue se lève

Aucune de ces questions ne se devine depuis la documentation publique. Chacune se
lève **par une sonde** (même doctrine que `tools/rea/sonder-base.mjs`), avec les
identifiants dans `.env` — **jamais dans le chat**.

| N° | Inconnue | Pourquoi c'est bloquant | Comment on la lève |
|---|---|---|---|
| **U1** | La **valeur du code-barres** du pass est-elle notre `card_token`, ou l'identifiant PassKit du membre ? | Si c'est leur identifiant, **`/scan` ne reconnaît plus la carte** : c'est le cœur du produit | créer un membre de test, lire le pass généré, comparer la valeur du code-barres |
| **U2** | L'**URL d'installation** du pass par membre (format exact) | c'est le lien qu'on met dans le QR / l'email — sans lui, le client ne peut pas installer | sonde : créer un membre, imprimer la réponse complète |
| **U3** | Les **chemins REST** exacts (le Swagger est par domaine, et le préfixe dépend de la région du compte) | on n'écrit pas d'appel réseau sur un chemin supposé | lire le Swagger rendu dans *Developer Tools* du compte, pas la doc publique |
| **U4** | Le **délai de rafraîchissement** d'un pass après mise à jour du solde | promettre « le solde se met à jour » est faux si c'est J+1 | documenté Apple [D] : iOS interroge seul ; à confirmer par un vrai passage en caisse |

**U1 a déjà sa parade, quelle que soit la réponse.** Si le code-barres n'est pas
notre token, on **n'adapte pas le produit, on adapte la lecture** :

1. `loyalty_cards.wallet_member_id` (colonne, `0015`) — l'identifiant PassKit du membre ;
2. une seule fonction de lecture `carte_par_code(p_code)` qui cherche **d'abord**
   `card_token`, **puis** `wallet_member_id` — même contrat de retour que
   `carte_par_token` (`0003`), donc `/scan` et `/caisse` ne changent pas d'un caractère ;
3. `card_token` reste la vérité du produit ; l'identifiant PassKit n'est qu'un
   **alias de lecture**.

---

## 4. L'architecture, en quatre pièces

```
adhésion (join)  ─┐
                  ├─→  membre PassKit  ──→  URL de pass  ──→  Wallet du client
scan / caisse  ───┘          ▲                                      │
   (points)                  │                                      │
                             └──── SetPoints / EarnBurn ◄────────────┘
                                    (le solde se pousse)
```

| Pièce | Rôle | Où |
|---|---|---|
| **Adaptateur** | un seul module qui parle à PassKit (JWT, membres, points). Aucun `fetch` ailleurs. | `web/src/lib/wallet.mjs` |
| **Routage** | création/rafraîchissement du membre, renvoi de l'URL du pass | `web/src/app/api/wallet/[token]/route.js` |
| **Drapeau** | `WALLET_ENABLED` + identifiants ; **sans identifiants, tout est inerte** et l'écran le dit (doctrine `EtatBloque`) | `.env` (+ `.env.example` documenté) |
| **Alias de lecture** | `carte_par_code(p_code)` : token **ou** identifiant Wallet | `migrations/0015_wallet.sql` |

**Trois règles de conception, non négociables :**

1. **Le drapeau borde tout.** Sans `PASSKIT_*` dans l'environnement, aucune route
   n'appelle le réseau : elle répond `walletIndisponible`, et l'écran l'affiche.
   Un essai de 45 jours qui expire ne doit **pas** casser le scan.
2. **PassKit ne devient jamais la source de vérité.** Les points vivent dans
   `loyalty_cards.current_points` ; PassKit en reçoit une **copie**. Si PassKit
   tombe, la caisse continue de créditer.
3. **Aucune donnée client envoyée au-delà du nécessaire** : prénom + solde +
   identifiant externe (`loyalty_cards.id`). Ni email, ni téléphone, ni historique.
   (Loi 09-08 / RGPD : minimisation, et un sous-traitant nommé dans le registre.)

---

## 5. Le plan, dans l'ordre — et ce qui bloque chaque étape

| # | Étape | Bloquée par |
|---|---|---|
| 1 | **Sonde** `tools/rea/sonder-passkit.mjs` : JWT OK ? programmes ? membre de test ? URL de pass ? valeur du code-barres ? | **écrite** (10 tests) — reste à l'**exécuter** avec les identifiants |
| 2 | `migrations/0015_wallet.sql` : `loyalty_cards.wallet_member_id`, `carte_par_code()` | rien — peut s'écrire avant la sonde |
| 3 | `web/src/lib/wallet.mjs` : authentification, `creerMembre`, `poserPoints`, `lireUrlPass` — **pur testable**, réseau injecté | résultats de la sonde (U2, U3) |
| 4 | `api/wallet/[token]/route.js` : `GET` → URL/redirection du pass, `404` si drapeau éteint | 2 + 3 |
| 5 | Branchement à l'**adhésion** et au **scan** (pousser le solde) | décision d'ergonomie ci-dessous |
| 6 | Tests : module pur (bornes, refus, pas d'appel réseau sans identifiants), migration (`anon` interdit, alias borné), route (drapeau éteint) | 3, 4 |

**La décision qu'il reste à prendre (humaine) : où le client trouve-t-il son lien
d'installation ?** Trois emplacements mesurés chez la cible, **deux** existent ici :

| Option | Disponible ici ? | Remarque |
|---|---|---|
| Page carte publique `/card/<id>` (cible) | **non** — n'existe pas dans ce socle, et `0003` a **refusé** l'accès `anon` à `carte_par_token` pour éviter un oracle d'énumération | supposerait de rouvrir une surface publique |
| Après l'adhésion (`join` → écran de confirmation) | **oui** | le client installe tout de suite, au comptoir |
| Depuis `/customers` (QR/lien par carte) | **oui** | le commerçant fait scanner, ou envoie le lien |

**Recommandation :** adhésion **et** `/customers` — les deux surfaces existent déjà,
aucune n'ouvre de route publique, et la cible a exactement le même geste (bouton
« Ajouter à Apple Wallet » au moment où la carte est créée).

---

## 6. Le coût, dit simplement

| Hypothèse | Coût mensuel | Remarque |
|---|---|---|
| ≤ 250 cartes Wallet | **39,50 $US** (~390 MAD) | minimum, quel que soit l'usage |
| 1 000 cartes | 39,50 + (750 × 0,045) ≈ **73,25 $US** | ~725 MAD |
| Après l'essai, sans Wallet | **0** | drapeau éteint, rien d'autre ne change |

Compare : 397 MAD/mois est le prix du produit. À 250 cartes, le Wallet consomme
**~100 %** du revenu d'un commerce. À 1 000, **~180 %**. Ce n'est donc pas un coût
d'infrastructure : c'est **un choix de positionnement** (inclus ? en option payante ?
réservé au pack ?) — et c'est P0-3c, hors consigne actuelle.

**Conséquence technique immédiate :** le drapeau et la sonde ne coûtent rien et
n'engagent rien ; le **branchement commercial**, lui, se décide avant l'échéance des
45 jours.

---

## 7. Ce qu'on ne fait pas, et pourquoi

- **Pas de signature maison** (`passkit-generator`) : c'est la voie de la cible,
  mais elle exige un compte Apple payant et un certificat à faire tourner. On la
  garde en **plan B** documenté, au cas où l'abonnement PassKit serait refusé.
- **Pas de mise à jour temps réel.** iOS interroge le service à son rythme [D] ;
  une promesse « le solde est à jour à la seconde » serait fausse.
- **Pas de NFC.** Un pass Wallet se scanne par **code-barres** ; le NFC d'un pass
  exige une entitlement Apple accordée au cas par cas. `/scan` (caméra + QR) est
  déjà le bon geste, et il fonctionne avec le code-barres du pass.
- **Pas de portail PassKit dans le produit.** Le commerçant ne doit jamais voir
  un second back-office : le design du pass se règle une fois, côté exploitation.

---

## 9. Changement de voie (2026-11-02, décision humaine) : Google d'abord

Consigne : « fait pour le google wallet en premier temps ». Ce n'est pas un
caprice de goût : **Google supprime l'inconnue bloquante**.

| | PassKit / Apple | Google Wallet |
|---|---|---|
| Coût | 39,50 $/mois minimum | **0** (API incluse) |
| Compte à créer | Apple Developer payant **ou** PassKit | Google Cloud + compte émetteur (gratuits) |
| Valeur du code-barres (**U1**) | **inconnue** — sonde nécessaire | **la nôtre** : `barcode.value` est écrit dans le JWT |
| Mise à jour du solde | push APNs + web service | `PATCH` de l'objet, Google rafraîchit |
| Certificat à faire tourner | oui (`.p12`, WWDR) | non |

**Contrat Google vérifié** (`reference/rest/v1/loyaltyobject`,
`loyalty-cards/use-cases/jwt`) : JWT **RS256**, `aud: "google"`,
`typ: "savetowallet"`, `payload.loyaltyObjects` avec **un seul** objet
(`INVALID_NUM_OBJECTS`), objet nommé `{issuerId}.{suffixe}`, lien
`https://pay.google.com/gp/v/save/<JWT>`.

**Livré dans cette passe** : `migrations/0014_wallet_google.sql` (**non
exécutée**), `web/src/lib/google-wallet.mjs`,
`web/src/app/api/wallet/google/[token]/route.js`, **16 tests**. Le drapeau
`WALLET_ENABLED=false` fait répondre `503 walletIndisponible` — vérifié par
exécution, pas supposé.

**Reste ouvert** : l'écriture de l'objet chez Google (`insert`/`patch`) pour que
le solde se rafraîchisse après un passage en caisse, la **classe**
`loyaltyClass` (créée une fois, puis approuvée par Google), et le bouton
« Ajouter à Google Wallet » sur les deux surfaces retenues — adhésion et
`/customers`.

