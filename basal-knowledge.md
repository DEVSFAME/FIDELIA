# Basal Knowledge — `Fidelia`, clone isofonctionnel de Fidelix

> **Ce fichier n'est pas un audit.** L'audit, c'est
> `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md` : 22 écarts, ce qui manque, ce qui
> est dangereux. Ici, c'est l'inverse — **tout ce qui est réutilisable pour
> construire**, rangé par problème d'implémentation et non par source.
>
> Décision qui commande ce fichier : **D-1 = A**, clone isofonctionnel, nommé
> `Fidelia` (2026-10-28, 03:10). La **cible mesurée est la référence** ; les deux
> documents (`conversation.md`, spec QR) sont des **points de départ**.

---

## 0. Règle de lecture — trois régimes de preuve, jamais mélangés

| Marque | Sens | Droit d'usage |
|---|---|---|
| **[M]** | **Mesuré** sur la cible `fidelix.ma` (A1→A5) | **Fais foi.** C'est le contrat à reproduire. |
| **[D]** | **Document** : écrit dans `conversation.md` ou la spec QR | **Piste.** Souvent juste, parfois faux — R0 a trouvé 22 écarts. |
| **[G]** | **Général** : connaissance d'ingénierie, **non vérifiée dans ce dépôt** | **À confirmer** avant de coder. Jamais une preuve. |

**Pourquoi cette discipline.** Les documents n'ont pas été confrontés à la cible
quand ils ont été écrits. La spec affirme « RLS » sans une seule politique
(E-19) ; `conversation.md` croit régler le double crédit avec un bouton (E-21).
Un fichier de connaissances qui mélangerait les trois régimes reproduirait
exactement ces erreurs, en plus grand.

**Corollaire** : quand ce fichier dit **[G]**, ce n'est pas une hésitation, c'est
une **dette de vérification** nommée. Chaque section dit comment la payer.

---

## 1. Ce que D-1 = A change concrètement

| Avant (D-1 ouvert) | Après (A retenu) |
|---|---|
| Les 22 écarts étaient des **objections** | Ce sont des **exigences de parité** |
| La base actuelle « pouvait suffire » (option B) | Elle est **incompatible** : `conforme = true` vis-à-vis de `conversation.md`, `false` vis-à-vis de la cible → **migration due** |
| On pouvait ignorer E-01 (multi-tenant) | **E-01 est le cœur du clone** : `restaurants`, `loyalty_programs`, `reward_tiers` |
| E-19/E-21 = défauts d'un concurrent | **Pièges à ne pas recopier** |

**La règle qui en découle** : quand les documents et la mesure se contredisent,
**la mesure gagne**. C'est la seule façon qu'un clone reste un clone.

---

## 2. Apple Wallet / Google Wallet — la carte dans le téléphone du client

### 2.1 Ce que la cible fait réellement **[M]**

Trois routes, mesurées le 2026-10-27 (A3), et **le genre d'appel fait partie du
contrat** :

| Route | Méthode | Genre d'appel | Rôle |
|---|---|---|---|
| `/api/wallet/apple/<cardId>` | **GET** | `window.location.href = …` | la réponse **est** le fichier `.pkpass` |
| `/api/wallet/apple/<cardId>/statut` | **GET** | `fetch(…, {cache:"no-store"})` | `{ajoutee: boolean}` |
| `/api/wallet/google/<cardId>` | **GET** | `window.location.href = …` | **redirection** vers l'ajout Google |

Trois faits qui coûtent cher si on les ignore :

1. **Les deux routes de génération sont des navigations, pas des `fetch`.**
   Le navigateur **quitte** la page. Un clone qui les appellerait en `fetch`
   recevrait des octets que personne n'ouvrirait — **rien ne se passerait côté
   iOS**. C'est le piège n°1 de tout le parcours Wallet.
2. **Il n'y a pas de `/statut` Google.** Mesuré : `404`. Le code ne l'appelle
   pas. L'asymétrie est réelle dans les deux sens, ce n'est pas un oubli de
   lecture.
3. **L'échec revient par un paramètre d'URL** : `/card/<id>?wallet=erreur`
   affiche « L'ajout au Wallet n'a pas abouti », puis le paramètre est retiré par
   `history.replaceState`. Ce chemin est **attendu par le code, non mesuré** (on
   n'a pas provoqué d'échec).

Quatre détails de contrat, tous mesurés :

- **`{ajoutee:false}` ne veut pas dire « carte inconnue »** : un UUID inexistant
  répond **200 `{ajoutee:false}`**. Donc `false` n'est **pas** un discriminant
  d'existence — ne jamais en faire un.
- **`{ajoutee:true}`** veut dire que le pass est **réellement enregistré côté
  serveur**. Le circuit n'est pas une maquette : il y a un état persisté.
- **`HEAD /card/<cardId>`** sert au client à vérifier qu'une carte mémorisée
  existe encore (`404` → on efface la clé locale et on réaffiche le formulaire).
- Les boutons viennent de **props serveur** (`walletEnabled`,
  `googleWalletEnabled`), qui ne correspondent à **aucune** colonne mesurée : le
  portail est donc piloté par configuration serveur, ce qui permet de
  **désactiver** le Wallet tant que les certificats ne sont pas là. **À
  reproduire tel quel** — c'est ce qui permet de livrer sans Apple.

### 2.2 Ce que les documents disent — et ce qu'ils ne disent pas **[D]**

`conversation.md` (lignes 41-43) est le **seul** endroit du corpus qui parle de
Wallet :

> « Option Apple Wallet / Google Wallet : Librairies comme **passkit-generator**
> (Node.js) ou des services comme **PassKit / MakePass** pour exporter la carte
> directement dans l'application Cartes (Apple Wallet) du client. »

C'est un **pointeur**, pas une recette. Mesure sur les deux documents :

| Mot-clé de la mécanique | `conversation.md` | Spec QR |
|---|---:|---:|
| `passkit-generator` | **1** | 0 |
| `passTypeIdentifier` | **0** | 0 |
| `teamIdentifier` | **0** | 0 |
| `webServiceURL` | **0** | 0 |
| `authenticationToken` | **0** | 0 |
| `pkpass` | **0** | 0 |
| `vnd.apple.pkpass` | **0** | 0 |
| `serialNumber` | **0** | 0 |

**Conclusion honnête : les documents nomment l'outil et ignorent tout du
mécanisme** — 1 nom d'outil, et 7 mots-clés de mécanique tous absents. Ce qui suit est donc
**[G]**, et c'est précisément la partie que le corpus ne pouvait pas donner.


### 2.3 Le prérequis qui bloque tout : un compte Apple Developer **[G]**

**Aucun code ne remplace ceci.** Un `.pkpass` n'est pas un PDF : c'est une
archive **signée cryptographiquement**. Sans les éléments ci-dessous, la route ne
peut que renvoyer une erreur.

| Élément | Où | Coût / délai |
|---|---|---|
| **Apple Developer Program** | `developer.apple.com` | **payant, annuel** — prérequis absolu |
| **Pass Type ID** (ex. `pass.ma.fidelia.card`) | onglet Identifiers | gratuit, une fois le compte actif |
| **Certificat** de ce Pass Type ID (`.p12` + mot de passe) | Certificates | à renouveler périodiquement |
| **Certificat intermédiaire Apple WWDR** (`.cer`) | Apple PKI | gratuit |
| **Team ID** (10 caractères) | Account > Membership | — |

**Conséquence de planification, à ne pas découvrir en R3** : le Wallet est le
**seul** bloc du clone dont le démarrage dépend d'un tiers payant. Il doit donc
être **développé en dernier** et **désactivable** — ce que la cible fait déjà
**[M]** avec `walletEnabled`. Le reste du produit se livre sans Apple.

**À vérifier avant de coder**, dans cet ordre :
1. le compte existe et est **actif** (pas seulement créé) ;
2. le **Pass Type ID** est créé et son certificat généré ;
3. le `.p12` a été exporté **avec sa clé privée** — exporter sans la clé donne un
   fichier inutilisable, et c'est l'erreur la plus fréquente.

### 2.4 Anatomie d'un `.pkpass` **[G]**

Un `.pkpass` est une **archive ZIP** (extension renommée) :

```
card.pkpass  (ZIP)
├── pass.json          # la carte : champs, couleurs, code-barres
├── manifest.json      # SHA-1 de CHAQUE fichier de l'archive
├── signature          # PKCS#7 détachée, certificats inclus
├── icon.png           # OBLIGATOIRE (29×29)
├── icon@2x.png        # OBLIGATOIRE (58×58)
├── logo.png / logo@2x.png
├── strip.png / strip@2x.png        # bandeau
├── thumbnail.png                   # vignette
└── background.png / footer.png     # optionnels
```

Trois pièges de packaging, tous silencieux :

- **`manifest.json` liste les hachages de tous les fichiers SAUF lui-même et
  `signature`** (on ne peut pas hacher sa propre liste). Se tromper ici produit un
  pass qui s'ouvre sur « Carte non valide ».
- **Les images doivent être de vrais PNG** — renommer un JPEG en `.png` échoue à
  la validation, sans message utile.
- **L'`icon.png` est obligatoire même si le visuel ne l'utilise pas** : c'est lui
  qui s'affiche dans la liste des cartes.


### 2.5 `pass.json` minimal, avec le QR dedans **[G]**

```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.ma.fidelia.card",
  "serialNumber": "<cardId>",
  "teamIdentifier": "ABCD123456",
  "organizationName": "Fidelia",
  "description": "Carte de fidélité Fidelia",
  "logoText": "Fidelia",
  "foregroundColor": "rgb(29,26,24)",
  "backgroundColor": "rgb(249,76,58)",
  "storeCard": {
    "primaryFields":   [{ "key": "points", "label": "POINTS", "value": 120 }],
    "secondaryFields": [{ "key": "nom",    "label": "Client", "value": "Yacine" }]
  },
  "barcodes": [
    {
      "format": "PKBarcodeFormatQR",
      "message": "https://app.fidelia.ma/scan?cardId=<uuid>",
      "messageEncoding": "iso-8859-1",
      "altText": "<uuid>"
    }
  ]
}
```

**La règle de cohérence qui compte** : le `message` du code-barres doit être
**exactement le même payload** que le QR de la carte web **[M]**
(`…/scan?cardId=UUID`). Sinon le commerçant scanne deux choses différentes selon
que le client montre son écran ou sa carte Wallet — et le solde diverge.

Notes de fidélité au réel :
- `foregroundColor` / `backgroundColor` sont les **tokens mesurés du design
  system** (`#1d1a18`, `#f94c3a`) **[M]** — le pass doit ressembler au produit.
- `serialNumber` = `cardId` : c'est la clé qui servira à **mettre à jour** le pass.
- `formatVersion: 1` est obligatoire — l'oublier est un refus silencieux.

### 2.6 Signer, côté serveur Node **[G]**

| Outil | Statut | Remarque |
|---|---|---|
| **`passkit-generator`** | cité par `conversation.md` **[D]** | certificats PEM + modèles ; adapté à Next.js |
| `@walletpass/pass-js` | alternative | plus bas niveau, plus de contrôle sur la signature |

La chaîne, dans l'ordre :

1. construire tous les fichiers (images, `pass.json`) ;
2. calculer `manifest.json` = SHA-1 de chacun (sauf lui-même et `signature`) ;
3. signer `manifest.json` en **PKCS#7 détaché**, avec la chaîne
   `certificat Pass Type ID` + `WWDR` ;
4. zipper le tout, **`manifest.json` et `signature` compris** ;
5. servir avec `Content-Type: application/vnd.apple.pkpass`.

**Le piège de service** : le `Content-Type` n'est pas cosmétique, c'est lui qui
déclenche l'ouverture dans Wallet côté iOS. Un `application/octet-stream`
télécharge un fichier que l'utilisateur devra retrouver à la main.

**Où vit la clé** : jamais dans le dépôt, jamais en `NEXT_PUBLIC_*`. Variables
serveur uniquement (`APPLE_PASS_CERT_P12_BASE64`, `APPLE_WWDR_CER_BASE64`,
`APPLE_PASS_PASSWORD`). C'est un **secret de signature** : qui l'a peut émettre
des cartes au nom du produit.

### 2.7 Google Wallet — le chemin le plus court, et le plus différent **[G]**

Ce n'est **pas** un fichier. Google attend un **JWT signé RS256** par un compte
de service, passé à une URL d'ajout.

| Élément | Détail |
|---|---|
| Prérequis | compte **Google Wallet API Issuer** (gratuit) + **compte de service** (clé JSON) |
| Objet | `GenericObject` (ou `LoyaltyObject`) : `classId`, `id`, `barcode`, `state` |
| Signature | JWT RS256 : `iss` = email du compte de service, `aud` = `google`, `typ` = `savetowallet` |
| Livraison | **redirection** vers `https://pay.google.com/gp/v2/save?jwt=<jwt>` |

**Ce que [M] confirme, ce que [G] explique.** La cible répond sur
`/api/wallet/google/<cardId>` par une **redirection** **[M]**. Le seul type de
redirection qui a du sens pour Google Wallet est celle ci-dessus. L'architecture
mesurée **et** la mécanique générale s'accordent — mais le `Location` exact n'a
jamais été lu. **Hypothèse cohérente, à confirmer** au premier essai réel.

Différence de coût à retenir : **Google est plus simple à démarrer** (pas de
certificat à faire signer, une clé JSON), **Apple est plus difficile** (compte
payant, certificats, ZIP signé). Un clone qui veut livrer vite active Google
d'abord — c'est exactement ce que permettent les **deux flags serveur distincts**
(`walletEnabled`, `googleWalletEnabled`) **[M]**.

### 2.8 Récapitulatif des pièges Wallet

| Piège | Conséquence | Source |
|---|---|---|
| Appeler la route de génération en `fetch` | rien ne s'ouvre sur iOS | **[M]** |
| Croire que `{ajoutee:false}` = carte inconnue | on supprime des cartes valides | **[M]** |
| Oublier le `Content-Type: vnd.apple.pkpass` | simple téléchargement | **[G]** |
| Hacher `manifest.json` dans son propre manifeste | « Carte non valide » | **[G]** |
| `icon.png` manquant | pass refusé | **[G]** |
| Clé de signature en `NEXT_PUBLIC_*` | émission de passes par un tiers | **[G]** |
| Coder le Wallet avant d'avoir le compte Apple | blocage en fin de projet | **[G]** |


---

## 3. Scan par caméra — comment le commerçant lit un QR

### 3.1 Ce que la cible fait **[M]**

Le scan n'est **pas** un écran du dashboard : c'est une **PWA séparée**.

| Élément | Contrat mesuré |
|---|---|
| `/scan` | route **gardée** (307 sans session) |
| `/caisse` | **PWA séparée**, manifeste propre, `scope: "/caisse"`, `theme_color: #1a1a1a` |
| Écran de scan | « **Pointez vers le QR code du client** » — mode caméra |
| `GET /api/scan/cards` | renvoie le **catalogue entier** `{cartes, programme}` |
| `GET /api/scan/card?id=` | renvoie **une** carte (scan individuel) |
| Appairage | **code à 6 chiffres**, `POST /api/caisse/appairer`, `till_sessions` |

**Pourquoi c'est une PWA séparée et pas un onglet** : l'appareil de caisse a sa
propre icône, son propre `theme_color`, sa propre portée. Un employé l'installe
une fois ; il ne se connecte pas à un dashboard pour encaisser. **À reproduire**
— sinon on obtient un clone qui « marche » mais qu'aucun commerçant n'utilise.

### 3.2 Ce que les documents proposent **[D]**

| Source | Bibliothèque citée | Ligne |
|---|---|---|
| `conversation.md` | **`@zxing/library`** ou **`html5-qrcode`** | 36 |
| spec QR | **`html5-qrcode`** ou **`@yudiel/react-qr-scanner`** | §3 |
| `conversation.md` | `api.qrserver.com` pour **générer** un QR | 49 |

Les deux documents convergent sur **`html5-qrcode`**. Note que `conversation.md`
cite `@zxing/library` — aujourd'hui le paquet maintenu côté navigateur est
surtout **`@zxing/browser`** / `@zxing/library` en sous-couche. **[G]**

### 3.3 Choisir l'outil **[G]**

| Bibliothèque | Force | Faiblesse | Quand la choisir |
|---|---|---|---|
| **`html5-qrcode`** | prête à l'emploi, gère caméra + décodage + overlay | API peu « React », styles à surcharger | **MVP de la caisse** |
| **`@zxing/browser`** | meilleur décodage sur QR abîmés/écrans | plus de câblage | si les scans échouent |
| **`@yudiel/react-qr-scanner`** | composant React direct | dépendance jeune | si le reste est en React pur |
| **`BarcodeDetector`** (natif) | le plus rapide, zéro dépendance | support navigateur **inégal** (Safari) | en **accélération** après détection de disponibilité |

**Recommandation** : `html5-qrcode` pour livrer, avec `BarcodeDetector` en
accélération **détectée à l'exécution** (`"BarcodeDetector" in window`), jamais
supposée.

### 3.4 Les contraintes qui font échouer un scanner **[G]**

| Contrainte | Symptôme si ignorée |
|---|---|
| **HTTPS obligatoire** (`getUserMedia` = *secure context*) | caméra muette en production, alors qu'elle marche en `localhost` |
| **Geste utilisateur** pour démarrer | refus de permission immédiat |
| `facingMode: "environment"` | la caméra frontale s'ouvre, le commerçant filme son visage |
| `playsinline` sur la balise `<video>` | iOS passe en plein écran natif, l'overlay disparaît |
| **arrêter les pistes** au démontage (`track.stop()`) | caméra qui reste allumée, batterie vidée, voyant vert |
| **refus de permission** géré | écran noir sans explication |

**Le test qui compte** : tester sur un **iPhone réel**, pas sur un émulateur. La
plupart des régressions de scanner n'apparaissent que là.

### 3.5 La dégradation gracieuse — la vraie bonne idée du corpus **[M] + [D]**

Le QR encode **une URL**, pas un jeton brut. Conséquence : **l'appareil photo
natif suffit**.

```
QR sur la carte du client
   → payload = https://app.fidelia.ma/scan?cardId=<uuid>
   → app Appareil photo (iOS/Android) → ouvre l'URL
   → écran d'attribution des points, côté serveur
```

C'est ce qui rend le scan **robuste sans code** : pas de permission caméra, pas
de bibliothèque, pas de navigateur compatible. Le scanner intégré à `/caisse`
devient un **confort**, pas une nécessité.

**C'est exactement l'inverse dans la spec QR** **[D]**, §6.B, qui encode
`${NEXT_PUBLIC_APP_URL}/admin/scan/<token>` — une route qui **n'existe pas** sur
la cible **[M]** (`/admin/scan` n'a jamais été mesurée ; E-04). Le principe est
bon, le chemin est faux.

**Décision recommandée** : encoder l'URL de la cible (`/scan?cardId=<uuid>`), pas
une route inventée. Un clone qui invente un chemin casse le parcours natif.

### 3.6 Ce que contient le QR — et l'ambiguïté à trancher **[M]**

E-04, mesure : la cible encode `…/scan?cardId=UUID` **ou le token brut**. Le
document parle des deux sans choisir.

**Pour le clone, trancher explicitement** :

| Payload | Avantage | Risque |
|---|---|---|
| **URL `…/scan?cardId=<uuid>`** | appareil photo natif, lien partageable | l'UUID est visible ; ne doit **jamais** être un secret |
| token brut | opaque, plus court | **inutilisable** par l'appareil photo → perd la dégradation gracieuse |

**Recommandation** : URL **+ `card_token`**, et non l'UUID interne. On garde la
dégradation native *et* on ne divulgue pas un identifiant de base. C'est un
**écart assumé et documenté** vis-à-vis de la cible, à justifier en revue.


---

## 4. Générer le QR — côté client et côté affiche

**[D]** `conversation.md` cite `api.qrserver.com` (API externe gratuite) ;
la spec impose **`qrcode.react`** en **rendu SVG**.

**Recommandation** : `qrcode.react` en SVG, et **jamais** l'API externe en
production **[G]**.

| Critère | `qrcode.react` (SVG) | `api.qrserver.com` |
|---|---|---|
| Dépendance réseau | aucune | **un appel externe par affiche** |
| Netteté à l'impression | parfaite (vectoriel) | dépend de la taille demandée |
| Données du client vers un tiers | **aucune** | l'URL part chez un tiers |
| Fonctionne hors ligne | oui | non |

Les trois règles de lisibilité **[G]** :

1. **Zone de silence** : ≥ 4 modules de marge blanche. Un QR collé à un bord
   échoue sur un tiers des téléphones.
2. **Contraste** : sombre sur clair, **jamais l'inverse**. Beaucoup de scanners
   refusent les QR inversés.
3. **Taille physique** : ≥ 2 cm sur un écran, ≥ 3 cm sur une affiche. Tester avec
   **deux téléphones différents**, un récent et un ancien — le vieux capteur est
   le vrai juge.

Au niveau d'erreur, **M** (médian) est le bon compromis **[G]** : tolère ~15 % de
dommage sans grossir le code inutilement.

---

## 5. Temps réel — le solde qui bouge tout seul

### 5.1 Ce que les documents prévoient **[D]**

- `conversation.md` : `ALTER PUBLICATION supabase_realtime ADD TABLE
  public.loyalty_cards` + abonnement côté client.
- La spec : « abonne le composant aux changements Supabase Realtime de la ligne
  correspondant à `card_token` », compteur animé.

Les deux sont **cohérents entre eux**, et aucun des deux n'a été vérifié contre la
cible (A1→A5 n'ont pas mesuré de socket).

### 5.2 La tension que personne n'a vue : Realtime **contre** RLS strict **[G]**

C'est le point le plus important de cette section, et il n'est dans aucun
document.

`postgres_changes` respecte la **RLS** : un abonné `anon` ne reçoit un événement
que s'il peut **lire** la ligne. Or :
- pour que le client voie son solde changer, `anon` doit lire `loyalty_cards` ;
- mais laisser `anon` lire `loyalty_cards` ouvre **toutes** les cartes de tous les
  clients (E-06).

**Trois issues, à choisir en connaissance de cause** :

| Option | Mécanisme | Coût |
|---|---|---|
| **A. Broadcast serveur** | le serveur, après la RPC, publie sur un canal `card:<token>` ; le client écoute **sans lire la table** | recommandé : RLS peut rester fermée |
| B. Politique de lecture par token | `SELECT` autorisé si `card_token = current_setting(...)` | fragile : PostgREST ne propage pas de contexte de session |
| C. Laisser `anon` lire | ce que fait la base actuelle | **inacceptable** pour un clone sérieux |

**Recommandation** : **A**. Le temps réel devient un **canal d'événements**, pas
un accès à la table — et la RLS reste stricte. C'est un écart assumé avec les
deux documents, motivé par E-06.

**À vérifier** : que Supabase Realtime *Broadcast* (canaux) est activable sur le
plan utilisé, et que le serveur peut publier (clé `service_role` côté serveur
uniquement).

---

## 6. La caisse hors ligne — le morceau le plus subtil **[M]**

Le corpus A4 a mesuré une mécanique précise. C'est de la **conception**, pas de
l'anecdote : chaque détail a une raison.

| Élément | Valeur mesurée |
|---|---|
| Stockage local | IndexedDB `fidelix-caisse`, **version 2** |
| Ordre de vidage | **FIFO** par `cree_le` |
| Période de réessai | **65 s** |
| Statuts **jetés** | `{400, 403, 404, 422}` |
| Statuts **conservés** | tout le reste, dont `5xx` et coupures réseau |
| Clé d'idempotence | `client_operation_id` = **id de l'élément de file** |
| Cache de cartes | rempli par `GET /api/scan/cards` (**catalogue entier**), au montage et sur `online` |

### 6.1 Les deux mots qui ont deux destins **[M]**

C'est la distinction la plus facile à rater :

| Message | Sens | Devenir de l'opération |
|---|---|---|
| « *N* opération(s) **hors ligne refusée(s)** » | le serveur a dit **non** (400/403/404/422) | **jetée définitivement**, compteur `ecartees` **cumulé** |
| « *N* opération(s) **n'ont pas encore pu être enregistrée(s)** » (`tentatives >= 3`) | le réseau ou le serveur a échoué | **conservée et réessayée** |

**Les compter ensemble serait une erreur de lecture du produit, pas seulement du
code** **[M]**. Un clone qui affiche un seul compteur ment au commerçant sur des
points qu'il croit enregistrés.

### 6.2 Ce que le cache ne fait pas **[M]**

`R()` fait un `put` par carte reçue, horodaté — **aucun `clear()`, aucun
`delete`**. Une carte supprimée côté serveur reste donc lisible hors ligne,
**indéfiniment**.

Et surtout : le libellé « Solde au dernier passage — hors ligne » est plus
généreux que la mécanique. Le solde vient du **dernier chargement du catalogue**,
pas du dernier passage du client. **[M]**

**Décision pour le clone** : soit corriger le libellé, soit charger le catalogue
plus souvent. **Ne pas recopier le libellé sans la mécanique** — c'est une
promesse non tenue.

### 6.3 Implémentation recommandée **[G]**

```
écriture → IndexedDB (outbox, statut "en_attente", client_operation_id = uuid)
        → POST avec client_operation_id
        → 2xx  : supprime l'élément
        → 4xx ∈ politique : marque "refusee" (garde la trace, n'envoie plus)
        → autre : incrémente tentatives, garde
```

Côté serveur, **le `client_operation_id` doit avoir un index UNIQUE** : c'est lui
qui rend le rejeu sûr. Sans index unique, deux envois créent deux crédits, et le
bouton « Envoyer » devient dangereux. **[G]**

**Vérification** : couper le réseau en cours d'envoi, laisser la requête partir,
rétablir — la réponse perdue doit donner **un seul** crédit. C'est le test que la
spec QR ne sait pas passer (E-21).


---

## 7. Persistance de la carte sans mot de passe

**Deux mécanismes, deux métiers** — et les confondre est l'erreur classique.

| Mécanisme | Qui le lit | À quoi il sert | Source |
|---|---|---|---|
| Cookie `loyalty_card_token`, **400 jours**, `httpOnly` | **le serveur** | rediriger `/join` → `/card/<token>` sans repasser par le formulaire | **[D]** spec §6.D |
| `localStorage["fidelix-carte-<restaurantId>"]` | **le client** | savoir quelle carte afficher, et la vérifier | **[M]** cible |

**Le point technique à ne pas rater [G]** : un cookie `httpOnly` **n'est pas
lisible en JavaScript**. Il ne peut donc **pas** servir au client pour savoir
quelle carte ouvrir. Les deux mécanismes ne sont pas redondants : le cookie sert
au **serveur**, le `localStorage` au **client**. La spec les présente comme un
« fallback » l'un de l'autre — c'est inexact.

**La vérification d'existence [M]** : avant d'afficher une carte mémorisée,
`HEAD /card/<id>`. Si `404`, on efface la clé et on réaffiche le formulaire. C'est
la **seule** vérification côté client, et elle est mesurée.

**Piège [G]** : le `localStorage` est indexé par **`restaurantId`**. Sans cette
clé, un client de deux commerces voit la carte du dernier visité. Le clone
multi-tenant doit garder cette dimension (E-01).

---

## 8. Sécurité — les six pièges qui coûtent des points

Ils sont tous documentés dans R0 ; ici, la **parade**.

| # | Piège | Parade |
|---|---|---|
| 1 | **RLS nommée, jamais écrite** (E-19) : la spec annonce « RLS » et livre **0** politique | `ENABLE ROW LEVEL SECURITY` **et** `CREATE POLICY` sur **chaque** table, avec un test qui compte les politiques |
| 2 | **`SECURITY DEFINER` + `EXECUTE` pour `anon`** (§4.4 de R0) : avec la clé anonyme publique, on crédite des points **sans PIN** | `REVOKE EXECUTE ON FUNCTION … FROM anon;` puis `GRANT … TO authenticated`. **Vérifier par mesure**, pas par lecture |
| 3 | **PIN à 4 chiffres** (E-05) : `ADMIN_PIN_SECRET="1234"`, conservé en `sessionStorage` | vraie authentification (Supabase Auth) + middleware sur `/admin/*` **[D]** spec §7.1 |
| 4 | **Anti-double-crédit côté client** (E-21) : bouton `isSubmitting` | `client_operation_id` en base + **index UNIQUE** |
| 5 | **Montant non borné** | `zod` **serveur** : `> 0` et `< 10000` **[D]** |
| 6 | **Solde négatif** | `CHECK (current_points >= 0)` + débit atomique borné dans la même transaction |

**La règle qui les résume** : *toute protection doit pouvoir échouer*. Un
`ENABLE ROW LEVEL SECURITY` peut être vérifié ; un commentaire `RLS` non. Un index
`UNIQUE` peut rejeter un doublon ; un bouton désactivé ne peut pas.

À quoi s'ajoute, sans source dans le corpus, donc **[G]** :
- la clé `service_role` ne quitte **jamais** le serveur (aucun `NEXT_PUBLIC_`) ;
- limitation de débit sur les routes d'écriture ;
- aucun secret dans un log, y compris en cas d'erreur.

---

## 9. PWA — deux applications, pas une

**[M]** : la cible a **deux manifestes distincts**.

| | Boutique / client | Caisse |
|---|---|---|
| Portée | `/` | **`/caisse`** |
| `theme_color` | `#fcede7` | **`#1a1a1a`** |
| Installation | une icône « Fidelia » | une icône **distincte** sur l'appareil de caisse |

**Pourquoi c'est structurant [G]** : `scope` détermine ce que l'app installée
contrôle. Un seul manifeste donnerait **une** icône, et le caissier devrait
naviguer dans le produit client pour encaisser. Deux manifestes = deux
applications perçues, un seul code.

**Pièges [G]** :
- `scope` doit **correspondre** au chemin de `start_url`, sinon l'installation
  est refusée silencieusement ;
- un service worker ne doit **jamais** mettre en cache les `POST` d'écriture ;
- mettre en cache la coquille (HTML/CSS/JS), **pas** les réponses d'API métier.

**[M]** précise aussi que le service worker **n'a pas été exécuté** pendant la
REA : la mécanique de cache de la cible reste donc **non mesurée**. Ce qui est
mesuré, c'est la **coquille hors ligne de la caisse** (§6), pas le SW.

---

## 10. Design system — les tokens mesurés **[M]**

À reprendre tels quels pour que `Fidelia` *ressemble* à Fidelix sans en être une
copie servile.

| Rôle | Valeur | Occurrences |
|---|---|---|
| Accent principal / `theme_color` | `#f94c3a` | 5 |
| Accent chaud | `#f85b04` | 4 |
| Encre foncée | `#1d1a18` | 5 |
| Fond clair | `#faf9f8` | 5 |
| Fond PWA | `#fcede7` | manifeste |
| POS `theme_color` | `#1a1a1a` | manifeste caisse |

| Rôle | Famille | Occurrences |
|---|---|---|
| Script (accroches) | **Caveat** | 13 |
| Display / titres | **Space Grotesk** | 10 |
| Texte | **Inter** | 8 |
| Mono (codes `C-XXXXXX`) | **JetBrains Mono** | 7 |
| Impact (chiffres XL) | **Anton** | 4 |

Palette complète : `contrats.json` §`design.couleurs` (30 valeurs mesurées),
documenté dans `Fidelix_Design_System.md`.

**Réserve [G]** : l'effet « verre » (`backdrop-filter`) coûte cher sur Android
d'entrée de gamme. Le réserver aux surfaces larges, et vérifier un contraste
**≥ 4,5:1** sur texte normal — un verre translucide sur fond clair passe
facilement sous le seuil.


---

## 11. i18n FR/EN/AR — **décision produit, pas élément de clone**

**Fait mesuré, et il est décisif pour la planification** : la cible n'a
**aucun contrat de données** pour l'i18n (`Fidelix_Etat_Basal.md` §5.2 :
« i18n FR/EN/AR — aucun contrat de données »).

Donc, strictement :

| Question | Réponse |
|---|---|
| Le clone **doit**-il gérer FR/EN/AR pour être isofonctionnel ? | **Non** — rien de mesuré ne l'exige |
| Est-ce souhaitable ? | C'est **votre** décision produit |

**Si FR/EN/AR est retenu**, ce que ça coûte techniquement **[G]** :

- **RTL** : `dir="rtl"` sur `<html>` quand la locale est `ar`, et des propriétés
  **logiques** (`margin-inline-start`, `padding-inline-end`) au lieu de
  `margin-left` / `padding-right` — sinon tout se décale en miroir.
- **Police arabe** : **Inter ne contient pas l'arabe**. Il faut une famille
  dédiée (Noto Sans Arabic, IBM Plex Sans Arabic) en plus d'Inter, pas à la place.
- **Formats** : dates et nombres via `Intl.*`, jamais concaténés à la main.
- **Le QR n'est pas traduit** : le payload reste une URL.

**Recommandation** : traiter l'i18n comme une **couche d'affichage** posée après
la parité, jamais comme un prérequis de schéma. Le mettre dans la base serait une
erreur coûteuse en migration.

---

## 12. Ce qui reste **inconnu** — et qu'il ne faut pas inventer

Liste honnête, à relire avant chaque phase. Rien de ceci n'est un oubli : ce sont
des choses que ni les documents ni la mesure n'ont établies.

| # | Inconnu | Impact | Comment le lever |
|---|---|---|---|
| 1 | **Mécanique Wallet** : 0 mot-clé sur 8 dans les documents | tout §2.3→2.7 est **[G]** | premier `.pkpass` signé, ouvert sur un iPhone réel |
| 2 | **Forme de la réponse de `GET /api/scan/cards`** | contrat de la caisse hors ligne | un `GET` authentifié, ou l'appairage d'une caisse |
| 3 | **Le SW de la cible n'a jamais été exécuté** | stratégie de cache inconnue | test réel hors ligne |
| 4 | **4 RPC de signature inconnue** | surface d'API | lecture `pg_proc` |
| 5 | **`EXECUTE` effectif de `anon` sur les 2 RPC** | trou de sécurité majeur (§4.4 R0) | R1.2 — exige une écriture ou un accès SQL |
| 6 | **RLS réellement active** sur la base actuelle | idem | R1.2 |
| 7 | **Le `Location` exact de la redirection Google** | §2.7 est une hypothèse | premier essai réel |
| 8 | **Le retour d'échec Wallet** (`?wallet=erreur`) | **attendu par le code, non mesuré** | provoquer un échec |

**La règle** : on ne code **pas** sur un inconnu de cette liste sans l'avoir
d'abord écrit comme hypothèse dans le code (commentaire + test), pour qu'il soit
retrouvable le jour où il se révèle faux.

---

## 13. Ordre de construction recommandé

Contraint par une seule chose : **le Wallet ne peut pas démarrer sans le compte
Apple**, tout le reste le peut.

| # | Étape | Débloque | Bloqué par |
|---|---|---|---|
| 1 | **Schéma** : 7 tables manquantes, RLS écrite, RPC durcies | tout | — |
| 2 | **Auth** : Supabase Auth, middleware `/admin/*` (pas de PIN) | caisse, admin | — |
| 3 | **Carte client** : `/join/<slug>` → `/card/<id>`, QR `qrcode.react` | scan, wallet | — |
| 4 | **Scan** : `/scan`, `/api/scan/card?id=`, caméra + dégradation native | caisse | — |
| 5 | **Caisse** : PWA séparée, appairage 6 chiffres, outbox IndexedDB | fidélité réelle | — |
| 6 | **Temps réel** : canal serveur (option A de §5.2) | fraîcheur du solde | — |
| 7 | **Google Wallet** | +1 canal | compte Google Wallet (gratuit) |
| 8 | **Apple Wallet** | parité complète | **compte Apple payant** |
| 9 | **PWA + design tokens** | finition | — |

**Pourquoi le Wallet en 7-8 et pas en 3** : c'est le seul bloc dont la donnée
d'entrée (certificats) ne dépend pas de vous. Le coder tôt, c'est prendre le
risque de bloquer toute la fin de projet sur une démarche administrative.

**Ce qui peut avancer en parallèle** de la démarche Apple : tout le reste. C'est
précisément ce que permet `walletEnabled` **[M]**.

---

## 14. Note de nommage

`Fidelia` est le nom du **clone**, pas celui du produit d'origine. Deux points
factuels, à traiter comme des questions juridiques et non techniques **[G]** :

- **Le nom « Fidelix » et ses marques ne doivent pas être réutilisés** dans le
  clone (interface, métadonnées, `organizationName` du pass, PWA).
- Les **tokens visuels** mesurés (§10) décrivent un style ; les reprendre à
  l'identique, y compris le logo et les polices propriétaires, sort du périmètre
  technique de ce document.

Rien de ceci n'est un avis juridique — seulement le rappel que « isofonctionnel »
concerne le **comportement**, pas l'identité.

---

*Fichier créé le 2026-10-28. Sources : `Fidelix_Etat_Basal.md`, corpus A1→A5
(`01_REA_Fidelix/Global/`), `conversation.md`, `Spécifications techniques
plateforme de fidélité QR code.md`. Les affirmations **[G]** n'ont pas été
vérifiées dans ce dépôt et doivent l'être avant d'être codées.*

