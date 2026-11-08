# La notification « à proximité » — ce que la cible fait vraiment

**Passe A8 — 2026-11-04.** Session marchande **vivante** (profil `.profil-rea`,
`GET /dashboard` → 200 avant la première écriture). Capture authentifiée de
`/settings` **avec ses assets** (A7 n'avait archivé que la page), plus `/sw.js`
en sonde. **Aucun POST, aucune écriture, aucun pass généré** : seuls des `GET`.

Régimes de preuve, jamais mélangés : **[M]** mesuré sur la cible · **[D]**
documenté par un tiers · **[?]** non mesuré.

| Artefact | Contenu |
|---|---|
| `_captures/2026-11-04-a8/manifeste.json` | 2/2 en 200, **30/30 assets**, 0 erreur, empreintes SHA-256 |
| `_captures/2026-11-04-a8/raw/pages/e01-settings.html` | 80 114 o — carte « Notification à proximité » rendue |
| `_captures/…/raw/assets/_next_static_chunks_app__dashboard__settings_page-dd121c1258082851.js` | 22 098 o — **formule, chargement, sauvegarde** |
| `_captures/…/raw/sondes/f01-sw-js.html` | `/sw.js` — rendu d'une notification push |
| `_captures/cibles-a8-2026-11-04.json` | le manifeste de la passe (chaque cible porte son `pourquoi`) |

---

## 1. Le résultat en une phrase

**La notification n'est pas envoyée : elle est déclenchée par le téléphone.**

Le commerçant ne fait que **décrire une zone** (un point, un rayon, un texte) ;
la plateforme **inscrit ce point dans le pass Wallet** ; c'est iOS ou Android
qui, en entrant dans la zone, affiche la carte sur l'écran verrouillé. **Il
n'existe aucun envoi au moment du passage** — donc aucun journal, aucun
« destinataires », aucun quota : c'est pour cela que le module Notifications
(`/notifications`, plafond 3/jour) est un **autre** canal, et que les deux ne se
rejoignent jamais.

Conséquence directe, écrite dans l'écran lui-même **[M]** :

> « Il faut que la carte soit dans leur wallet. »

Un client qui a scanné son QR mais jamais installé sa carte **ne recevra
jamais** cette notification. Ce n'est pas un défaut : c'est la condition du
canal.

---

## 2. Côté commerçant — ce que `/settings` demande, mot pour mot **[M]**

Carte « **Notification à proximité** », quatre éléments, tous lus dans le DOM
rendu (`e01-settings.html`, offsets 40 586 → 43 651) et dans le chunk client :

| Élément | Texte mesuré |
|---|---|
| Aide | « Vos clients reçoivent une notification quand ils passent près de chez vous, **sans que vous ayez rien à envoyer**. Il faut que la carte soit dans leur wallet. Comptez quelques minutes après leur entrée dans la zone : **le téléphone n'écoute pas le GPS en continu**, il se réveille par intermittence pour préserver la batterie. » |
| `lien_localisation` | label « Emplacement de la boutique » · placeholder « Collez votre lien Google Maps » · aide : « Sur Google Maps : trouvez votre boutique, appuyez sur **Partager**, puis copiez le lien. Vous pouvez aussi saisir vos coordonnées : `33.5731, -7.5898`. **Laissez vide pour désactiver.** » |
| `geofence_radius_m` | label « Distance de déclenchement » · `type=number`, **min 50 / max 2000 / step 50**, placeholder `1000` · aide : « En mètres, jusqu'à 2000. Couverture réelle : **≈ 859 m**. Apple et Google fixent eux-mêmes la portée de chaque point ; **nous en plaçons plusieurs autour de votre boutique** pour couvrir la zone, sans jamais pouvoir dépasser ce plafond. » |
| `geofence_texte` | label « Message affiché » · `maxlength=120`, placeholder « Un café vous attend chez nous ☕ » · aide : « 120 caractères maximum. Vide = « Vous êtes près de [votre commerce] ». » |

Deux formats d'entrée sont donc acceptés pour l'emplacement : **un lien de
partage Google Maps**, ou **« latitude, longitude »**. Le vide **désactive**.

### 2.1 Le chargement — la base stocke des coordonnées, pas le lien **[M]**

`settings_page-dd12…js` (offset ≈ 15 200) : lecture
`from("restaurants").select("*").eq("id", commerceActif.id).maybeSingle()`, puis

```js
lien_localisation: a.latitude != null && a.longitude != null
  ? `${a.latitude}, ${a.longitude}` : "",
geofence_radius_m: a.geofence_radius_m ?? 1000,
geofence_texte:    a.geofence_texte ?? "",
```

Trois faits en découlent, et ils comptent pour un clone :

1. la colonne du lien **n'existe pas** : ce sont `restaurants.latitude` et
   `restaurants.longitude` qui persistent [M — corroboré par
   `Fidelix_Serveur.md` §8.3, qui relève `latitude?`, `longitude?`,
   `geofence_radius_m`, `geofence_texte?` parmi les **34** colonnes de
   `restaurants`] ;
2. le formulaire **ré-affiche** les coordonnées, pas l'URL collée : l'analyse du
   lien est donc **serveur**, à la sauvegarde ;
3. le défaut affiché d'un rayon absent est **1000**, alors que la colonne n'a
   peut-être pas de valeur — le `??` est côté client.

### 2.2 La sauvegarde — `POST /api/settings/save` **[M]**

Corps construit par le chunk (offset ≈ 13 464), tel quel :

```js
{ name, type_activite,
  phone: e.phone || undefined, … address, city, description,
  site_url: e.site_url ?? "", … reservation_url: e.reservation_url ?? "",
  lien_localisation: e.lien_localisation ?? "",   // la CHAÎNE, pas les coordonnées
  geofence_radius_m: e.geofence_radius_m,         // valeur brute du <input>
  geofence_texte: e.geofence_texte || "" }
```

Le schéma zod client (`Fidelix_API_Contrats.md` §4.5) borne exactement les
mêmes valeurs : `min(50).max(2000)` en entiers, `geofence_texte ≤ 120`, et un
`preprocess` qui transforme le **`""` d'un champ vidé** en `undefined` — sans
lui, `z.coerce.number()` lirait `0` et le `min(50)` refuserait un champ
pourtant facultatif.

**Ce que le serveur fait de `lien_localisation` est serveur** : ni l'analyse du
lien Google Maps (quels motifs d'URL ? `/@lat,lng,15z`, `?q=`, `maps.app.goo.gl` ?)
ni l'écriture des colonnes ne sont dans un bundle. **[?] côté serveur : inconnu,
et non deviné.**

---

## 3. La couverture réelle — la formule, à la ligne **[M]**

Le chiffre « ≈ 859 m » n'est pas une constante marketing : c'est un calcul, lu
dans le chunk (offset ≈ 20 164), identique **au caractère près** dans le chunk
du **2026-10-27** (`settings_page-7bb560c4…`, passe S3) :

```js
!Number.isFinite(e = D || 1000) || e <= 250
  ? 250
  : Math.round(Math.min(e - 250, 3825 / (2 * Math.PI)) + 250)
```

Soit, en clair :

```
anneau     = min(rayon − 250, 3825/(2π))     // 3825/(2π) ≈ 608,66 m
couverture = round(anneau + 250)             // plancher 250, plafond 859
```

| Rayon saisi | Couverture affichée |
|---|---|
| ≤ 250 (ou vide / non numérique) | **250 m** (un seul point : pas d'anneau) |
| 300 | 300 m |
| 500 | 500 m |
| 600 | 600 m |
| 858 | 858 m |
| **≥ 859** | **859 m** — plafond atteint dès ~859 ; **2000 donne 859** |

Trois lectures, et une seule est mesurée : **(a)** chaque point porte une portée
de **250 m** ; **(b)** les points sont posés sur un **anneau** de rayon
`rayon − 250`, donc la couverture vaut `anneau + 250` ; **(c)** l'anneau est
plafonné par une **circonférence de 3 825 m**, ce qui borne le nombre de points à
`3825 / espacement`. L'espacement, lui, n'est pas dans le client **[?]**.

**Le recoupement extérieur, à titre indicatif [D]** : Apple Wallet accepte
**10 emplacements par pass** et Google **10 par classe + 10 par objet**, avec un
rayon de déclenchement **décidé par l'OS** pour Google et **~100 m par défaut**
pour une carte de fidélité côté Apple. 3 825 m = 15 × 255 m : la constante
suppose donc soit 15 points espacés de 255 m, soit 10 points espacés de 382,5 m.
**Le nombre réel de points est serveur : non mesuré, non affirmé ici.**

### 3.1 Deux corrections, mesurées par **exécution** de l'expression capturée

Le tableau ci-dessus a été lu ; cette note vient de l'**exécuter** — l'expression
est extraite du chunk, `var e;` ajouté, et appelée sur toute la plage
(`tools/rea/tests/proximite.test.mjs`, test « notre calcul rend exactement ce
que rend la cible »). Deux lignes ne disent pas ce que le code fait **[M]** :

| Entrée | Tableau ci-dessus | Ce que le code rend |
|---|---|---|
| champ **vide** (`''`, `undefined`, `null`, `0`) | 250 m | **859 m** — `D \|\| 1000` transforme le vide en 1000, donc au plafond |
| `« 500 »` (chaîne numérique) | 500 m | **250 m** — `Number.isFinite("500")` est faux, donc le plancher |

Ce n'est pas un détail de copie : le premier cas est celui de tout formulaire
dont le rayon n'a jamais été rempli, le second est un piège de typage (l'écran
passe la valeur brute d'un `<input>`, donc une chaîne). Notre écran, lui, passe
toujours un **nombre** (`lireFiche`), donc seul le premier cas le concerne — et
il est rendu à l'identique.

---

## 4. Ce que le serveur doit produire — et ce qui n'est pas mesuré

Le pass est **généré côté serveur** : `GET /api/wallet/apple/<cardId>` (la
réponse **est** le `.pkpass`) et `GET /api/wallet/google/<cardId>`, tous deux
appelés en **navigation** depuis la page carte — mesuré en A3, et re-lu ici dans
`app/card/[cardId]/page-198959ba…js` (`/api/wallet/apple/`, `/api/wallet/google/`).

Le contrat attendu par les plateformes **[D]** :

| Plateforme | Champ | Ce qu'on peut y mettre |
|---|---|---|
| Apple (`pass.json`) | `locations[]` — `{latitude, longitude, altitude?, relevantText?, maxDistance?}` | **10 max** ; `relevantText` = le texte affiché (`geofence_texte`, défaut « Vous êtes près de <commerce> ») |
| Google (`loyaltyClass` / `loyaltyObject`) | `merchantLocations[]` — `{latitude, longitude}` | **10 par classe + 10 par objet**, **aucun rayon**, **texte imposé par Google** |

**Le contenu réel du pass n'a pas été mesuré** : le télécharger exigerait de
**générer** un pass pour une carte réelle — geste que la doctrine de la passe A3
refuse (« une génération de pass n'est pas une lecture »). Ce qui est prouvé :
les **entrées** (point + rayon + texte), la **condition** (carte dans le wallet),
la **formule de couverture**, et les **deux routes** de génération. Ce qui ne
l'est pas : le tableau `locations` lui-même, et le nombre de points.

**Comment le lever sans écrire chez la cible** : générer **notre** pass (compte
PassKit en essai, ou `passkit-generator` + certificat) avec le même rayon, puis
lire **notre** `pass.json` et vérifier sur un iPhone réel que la carte apparaît à
~250 m. C'est un test de notre chaîne, pas une sonde de la leur.


---

## 5. Le second canal — web push, et pourquoi ce n'est pas la proximité **[M]**

La page carte publique `/card/<cardId>` embarque un **opt-in** complet, lu dans
`app/card/[cardId]/page-198959ba…js` (offset ≈ 9 489) :

```js
Notification.requestPermission()                       // refus → message dédié
navigator.serviceWorker.register("/sw.js")
reg.pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey: <clé VAPID publique, base64url> })
fetch("/api/push/subscribe", { method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ card_id, endpoint, p256dh, auth }) })
```

Cinq états nommés (`loading | unsupported | denied | idle | subscribed`) et trois
refus rédigés : « Autorisez les notifications quand votre téléphone vous le
demande, puis réessayez. », « L'activation n'a pas pu être enregistrée.
Réessayez dans un instant. », « L'activation a échoué. Vérifiez votre connexion,
puis réessayez. » Un échec du `POST` **désabonne** l'abonnement navigateur créé
juste avant — pas de jeton orphelin.

`/sw.js` **[M]** ferme la boucle de réception :

```js
payload  = event.data.json()           // { title, body, icon?, url? }
fallback = { title: "Fidelix", body: event.data.text() }
options  = { body, icon: payload.icon || "/icon-192.png", badge: "/icon-192.png",
             data: { url: payload.url || "/" }, vibrate: [100,50,100] }
notificationclick → focus d'un onglet déjà sur l'URL, sinon openWindow(url)
```

**Ce canal sert les messages du commerçant** (`/notifications`, relances), pas la
proximité : `navigator.geolocation` **n'apparaît nulle part** dans le chunk de la
carte (recherche `getCurrentPosition|geolocation|coords` → **0**). Le texte de
`/settings` le dit autrement : la proximité exige **le wallet**, pas
l'autorisation de notifications.

Les deux canaux se rejoignent sur une seule phrase, mesurée en P0-4 : « Aucun
client joignable pour l'instant — ils le deviennent **en ajoutant leur carte au
Wallet ou en activant les notifications**. » Le pass donne la proximité, le
`PushSubscription` donne les messages ; **le même client peut n'avoir que l'un
des deux.**

---

## 6. Dérive entre les passes — zéro

| | 2026-10-27 (S3) | 2026-11-04 (A8) |
|---|---|---|
| chunk `settings/page` | `7bb560c4de073cfb` (30 367 o) | `dd121c1258082851` (22 098 o) |
| formule de couverture | `min(e-250, 3825/(2π))+250` | **identique** |
| bornes du champ rayon | 50 / 2000 / pas 50 | **identique** |
| texte « ≈ 859 m » | présent | **présent** |

Le chunk a **maigri de 8 269 o** (découpage Next) ; les **constantes n'ont pas
bougé**. Le mécanisme est stable sur huit jours : c'est le seul point de ce
dossier qui autorise à parler de « contrat » plutôt que d'« état observé ».

---

## 7. Ce qu'un clone doit faire — et où le nôtre s'arrête

> **État au 2026-11-04 au matin.** Cette table décrit la mesure ; ce qui a été
> livré **depuis** est au §9 (coordonnées, analyse, `merchantLocations`, formule
> à l'écran) puis au §10 (page carte publique, `sw.js`, abonnements). La ligne 5
> (Apple) reste seule ouverte.

| # | À faire | État ici |
|---|---|---|
| 1 | Stocker **`latitude` + `longitude`** (pas le lien collé) | **écart** : `0011` écrit `loyalty_programs.lien_localisation text` — le lien brut, non analysé |
| 2 | Analyser **les deux formats** (lien Google Maps, `lat, lng`), `null` = désactivé | **absent** |
| 3 | Borner le rayon **50→2000, pas de 50**, défaut 1000 | **fait** (`0011` : `check` + `% 50`) |
| 4 | Texte ≤ 120, vide → « Vous êtes près de <commerce> » | **fait** (contrainte + `nullif(btrim(...))`) |
| 5 | Écrire `locations[]` dans le **pass** avec `relevantText` = ce texte | **absent** : `lib/google-wallet.mjs` ne pose **aucun** emplacement (`merchantLocations` introuvable) ; pas de route Apple |
| 6 | Calculer la couverture avec **la même formule** (250 / 3 825) | **absent** |
| 7 | Opt-in web push sur la carte + `/sw.js` qui rend `{title, body, url}` | **livré, éteint** : `/card/<uuid>`, `sw.js`, `0019`, `POST /api/push/subscribe`. Sans `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, l'opt-in ne s'affiche pas — voir §10 |
| 8 | Écran : la carte, ses quatre textes, l'état « vide = désactivé » | **partiel** (`settings/page.jsx` porte la carte et les trois champs) |

**La formulation à ne pas recopier** : appeler « notification » un affichage
d'écran verrouillé est un raccourci du produit, pas une faute — mais un clone qui
promettrait une **notification push** à cet endroit mentirait sur le canal.

---

## 8. Procédure rejouable

```bash
cd FIDELIX
node tools/rea/capturer-fidelix.mjs --preflight                    # session vivante ?
node tools/rea/capturer-fidelix.mjs \
  --manifeste 01_REA_Fidelix/_captures/cibles-a8-2026-11-04.json \
  --profil .profil-rea                                             # 1 page + 30 assets
node tools/rea/capturer-fidelix.mjs \
  --manifeste 01_REA_Fidelix/_captures/cibles-a8-2026-11-04.json \
  --profil .profil-rea --verifier                                  # empreintes
```

La fenêtre d'authentification (`tools/rea/ouvrir-session.mjs --attendre`) **n'a
pas été nécessaire** : le profil persistant portait encore une session valide, et
le préflight l'a prouvé **avant** la première écriture (`/dashboard` 200).


---

## 9. P0-2b — ce que le clone a livré, et ce qu'il refuse encore

**Passe du 2026-11-04 (soir).** Trois pièces sur quatre du backlog P0-2b. Ce qui
suit n'est ni une promesse ni un plan : c'est l'état des fichiers, et la preuve
qui va avec.

| # | Pièce | État | Preuve |
|---|---|---|---|
| 1 | `latitude`/`longitude` en base, `null` = désactivé | **livré** | `migrations/0017_proximite_coordonnees.sql`, **exécutée deux fois** dans un Postgres 16 jetable, exit `0` les deux fois |
| 2 | analyse des deux formats, refus explicites | **livré** | `web/src/lib/localisation.mjs` + `tests/localisation.test.mjs` (7 tests) |
| 3 | `merchantLocations[]` dans le pass (**Google**), formule de couverture à l'écran | **livré côté Google** | `web/src/lib/proximite.mjs`, `construireObjet()`, `tests/proximite.test.mjs` (10 tests) |
| 3 bis | `locations[]` + `relevantText` (**Apple**) | **refusé** | aucune route Apple n'existe ici ; un `.pkpass` exige une signature **PKCS#7**, que `node:crypto` ne produit pas — il faudrait une dépendance ou un certificat. Rien n'a été simulé |
| 4 | web push (`/sw.js` + `POST /api/push/subscribe`) | **livré depuis** | voir §10 — la surface `/card/<cardId>` existe désormais, et l'abonnement s'écrit ; **aucun émetteur**, donc aucun envoi |

### 9.1 Ce que le dry-run a corrigé — deux fois

1. **La contrainte ne tenait pas la paire.** Écrite d'abord
   `(latitude is null and longitude is null) or (latitude between -90 and 90 and …)`,
   elle **laissait passer** `latitude = 33, longitude = null` : un `CHECK` rend
   `NULL` quand un opérande manque, et PostgreSQL **accepte** `NULL`. Mesuré sur
   la base jetable (l'`UPDATE` passait), corrigé par un second
   `latitude is not null and longitude is not null`.
2. **Le rejeu cassait.** La reprise lisait `lien_localisation`, supprimée au
   premier passage : la seconde exécution échouait (`column p.lien_localisation
   does not exist`). Corrigé par un garde `information_schema` + SQL dynamique.

### 9.2 Ce que la reprise a rendu, sur six lignes d'essai

Quatre motifs analysés (`33.5731, -7.5898`, `@lat,lng`, `?q=`, `!3d…!4d…`), un
lien court laissé `null` **et compté** (`1 emplacement(s) non analysable(s)`),
un champ vide laissé `null`. Aucune ligne détruite en silence : c'est l'`UPDATE`
qui précède le `DROP COLUMN`, et le `DROP` est `if exists`.

### 9.3 La phrase à ne pas déplacer

Le pass Google porte `merchantLocations` — **sans rayon**. C'est la plateforme
qui décide de la portée de chaque point ; le rayon saisi ne sert qu'à savoir
combien de points poser et jusqu'où. Écrire un `radius` là-dedans serait un
champ que Google ignore : une promesse d'interface, pas un réglage.


---

## 10. P0-2b, seconde moitié — la carte publique, puis le web push

**Passe du 2026-11-04 (nuit).** Ce qui suit est l'état des fichiers, avec la
preuve qui va avec. Aucun envoi n'a été fait ; aucune ligne n'a été écrite en
production.

### 10.1 La surface qui manquait — `/card/<cardId>`

La mesure qui autorise la page est celle de §5, complétée par
`_captures/2026-10-27-a3/mesure-a3.json` : `GET /card/<uuid>` → **200**
(« Carte fidélité — <commerce> »), `/card/test` → **404**, UUID nul → **404**.

| Pièce | Fichier | État |
|---|---|---|
| lecture publique, par **UUID** | `migrations/0018_carte_publique.sql` | **exécutée deux fois** dans un Postgres 16 jetable, exit `0` |
| lecture typée, sans table | `web/src/lib/carte-publique.mjs` | 8 tests |
| page publique | `web/src/app/card/[cardId]/page.jsx` | `ƒ` au build, `noindex`, `force-dynamic` |

**La clé est l'UUID, pas le code** — et ce n'est pas un détail. `/join` avait
refusé une URL `/card/<code>` (« un second oracle de soldes ») : un code de six
caractères s'énumère, un UUID non. La cible fait exactement ce choix ; le code
reste l'identifiant de **scan**, affiché sur la carte et encodé dans le QR.

Ce que la fonction rend : `card_token`, `points`, `prenom`, `depuis`,
`programme.nom`, `paliers`. Ce qu'elle ne lit **pas** : `last_name`, `email`,
`wallet_object_id` — vérifié en base jetable sur une ligne dont le nom de
famille était renseigné (`position('Benali' in …) = 0`).

### 10.2 Le canal des messages — livré, et éteint

| Pièce | Fichier | État |
|---|---|---|
| table + RPC d'abonnement | `migrations/0019_push_abonnements.sql` | **exécutée deux fois**, exit `0` ; plafond de 5 vérifié (le 6ᵉ sort `TROP_D_ABONNEMENTS`) |
| validation pure du corps | `web/src/lib/push.mjs` | 10 tests, dont la clé VAPID **de la cible** (87 car. → 65 octets, préfixe `0x04`) |
| route | `web/src/app/api/push/subscribe/route.js` | `400` / `404` / `409` / `503`, `no-store` |
| réception | `web/public/sw.js` | `push` + `notificationclick`, **exécuté** dans un `vm` (5 tests) |
| opt-in | `web/src/components/carte/ActiverNotifications.jsx` | 5 états, repli par carte, désabonnement sur échec |

**Éteint par construction** : sans `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, le composant
ne rend **rien** et aucun abonnement ne s'écrit — c'est la même règle que
`WALLET_ENABLED=false` pour Google Wallet. Une clé publique sans émetteur
(la clé **privée** signe les envois) produirait un jeton orphelin, exactement ce
que la cible évite en `unsubscribe()`-ant quand son `POST` échoue.

### 10.3 La phrase qui tient les deux canaux séparés

La page carte rend, **après** le bloc de notifications :

> « Cette page n'active pas la notification de proximité : celle-ci dépend de la
> carte ajoutée au Wallet. »

Elle n'est pas décorative : c'est la seule chose qui empêche de lire le bouton
« Activer les notifications » comme « prévenez-moi quand je passe devant ».
`push.test.mjs` vérifie que **aucun** texte `carte.push.*` ne contient
« proximit… » ou « près de chez ».

### 10.4 Ce qui reste ouvert

- **Apple** (`locations[]` + `relevantText`) : inchangé, §9 ligne 3 bis. Blocage
  réel : signature **PKCS#7**.
- **L'émetteur** (P0-4b) : `push_abonnements` est écrite, jamais lue. Envoyer
  demande la clé privée VAPID et la purge des endpoints `410 Gone` — c'est un
  chantier, pas un réglage.
- **La migration en production** : `0018` et `0019` sont écrites et répétées en
  base jetable, **pas** passées sur le projet Supabase. Tant qu'elles ne le sont
  pas, `/card/<uuid>` affiche « migration à passer » avec le nom du fichier
  (mesuré sur le conteneur : `HTTP 200` + `migrations/0018_carte_publique.sql`),
  et `/card/test` rend `404` (mesuré).


