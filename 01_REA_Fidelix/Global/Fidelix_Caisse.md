# Caisse — la file hors ligne (A4), **lecture seule**

> **Objet.** Mesurer la *mécanique* de file de la caisse : où elle est stockée,
> sous quelle forme, quand elle se vide, ce qui s'affiche sans réseau. La
> *politique de rejeu* (quels statuts jettent, quand on bloque) avait déjà été
> lue en A2 et est reprise ici au §5 — mais **extraite**, plus recopiée.
>
> **Aucune requête émise.** Ni GET, ni POST, ni OPTIONS. Tout vient de bundles
> et de pages déjà capturés. Corpus : `_captures/2026-10-26/raw/` (passe
> **anonyme**, donc aucune donnée de client réel).
>
> **Instrument.** `tools/rea/relever-caisse.mjs` + module pur `caisse.mjs`,
> **33 tests** hors ligne (`node --test tools/rea/tests/caisse.test.mjs`),
> **168/168** au total du projet. Sortie archivée :
> `_captures/2026-10-27-a4/releve-caisse.{json,txt}`.

---

## 1. Le résultat en une phrase, et l'endroit où il n'était pas

La caisse tient une **file IndexedDB** (`fidelix-caisse` v2, magasin
`file_attente`) de **stampements et de gains de points** non envoyés, qu'elle
rejoue toutes les **65 s** vers `POST /api/transaction` avec
`client_operation_id` = l'**identifiant de l'élément de file**. Elle affiche,
pour les cartes qu'elle connaît déjà, le **solde du dernier chargement du
catalogue**, en le nommant honnêtement « Solde au dernier passage ».

**Et cette file n'est pas dans le fichier qui porte son nom.** Le bundle
`app/caisse/page-*.js` fait **6 464 octets** et ne contient **aucun** jeton de
file. Il contient autre chose. La file est dans le chunk **`6866`**, que ce
bundle se contente de déclarer en dépendance.

### 1.1 Les quatre fichiers de la route, mesurés

| Fichier | Octets | sha256 (12 premiers) | Contient la file ? |
|---|---:|---|---|
| `app_caisse_page-e18fb03a63b24353.js` | 6 464 | `1f83f9fc0bf9` | **non** (0 jeton) |
| `app_caisse_layout-fc5aca2fd66ae01b.js` | 4 841 | `5b078305a423` | non (peau « premium ») |
| `app_caisse_error-b985e36f751e8914.js` | 3 181 | `7224c72f9b09` | non (frontière d'erreur) |
| `_next_static_chunks_6866-2c6ed19830232270.js` | **35 653** | `53e862f1ed11` | **oui — 43 occurrences** |

Les trois premiers sont identiques au bit près dans les trois passes
(`2026-10-26/`, `2026-10-26-auth/`, `2026-10-27-auth-s3/`) : la file ne dépend
ni de la session, ni du mode.

### 1.2 Ce que `app/caisse/page` contient vraiment

Cinq modules, aucun n'est la caisse :

| Module | Rôle |
|---|---|
| `20063` | ré-export de `next/navigation` |
| `52056` | icône `TriangleAlert` |
| `52692` | aides du **bonus d'avis Google** (`lienValide`, deux messages de garde) |
| `81750` | composant qui rend **« Avis à valider »** — c'est `/api/reviews/claims`, pas la caisse |
| `88173` | point d'entrée, `Promise.resolve().then(…)` |

Et sa dépendance explicite, lue dans le fichier :

```js
e.O(0,[5604,9779,1356,6211,6440,4008,6866,2128,8441,7631,7358],()=>e(e.s=88173))
```

> **La leçon, mesurée deux fois.** Un nom de chunk Next dit *d'où* un module a
> été extrait, pas *à qui* il appartient. Ici le fichier nommé d'après la caisse
> porte le code des **avis**, et la caisse n'arrive que par une dépendance
> transitive. Chercher « dans le bundle de la page » aurait rendu « il n'y a pas
> de file » — une absence fabriquée par le nom du fichier.


---

## 2. Calibration — avant de conclure quoi que ce soit

Sept témoins positifs, trois négatifs, un leurre. Rejoués à chaque exécution
(`--temoins` sort en code 3 si un seul dévie).

| Témoin | Attendu | Mesuré |
|---|---|---|
| `fidelix-caisse` | présent | trouvé |
| `file_attente` | présent | trouvé |
| `fidelix_caisse_programme` | présent | trouvé |
| `client_operation_id` | présent | trouvé |
| `en attente d'envoi` (prose) | présent | trouvé **après décodage** |
| `Solde au dernier passage` (prose) | présent | trouvé |
| `/api/transaction` | présent | trouvé |
| `workbox`, `idb-keyval`, `Background Sync` | **absents** | non sortis |
| `file_envoi` (magasin inventé) | **absent** | non sorti |
| `@supabase/auth-js` (leurre) | présent, **0 magasin, 0 prose** | 7 jetons, 0 magasin, 0 prose |

### 2.1 Trois faux positifs trouvés **en écrivant l'instrument**

Chacun aurait produit un chiffre plausible et faux, sans jamais échouer.

1. **`cartes` est un mot français.** 8 occurrences dans le corpus, **2**
   seulement désignent le magasin. Le jeton a été **retiré** de la liste : un
   jeton qui ne discrimine pas n'est pas un jeton. Le magasin reste mesuré —
   par résolution de la variable (`S="cartes"`), pas par le mot.
2. **`tentatives` est un mot français.** La page `/login` écrit « Trop de
   **tentatives**. Patientez une minute ». Règle retenue : un champ est un
   identifiant **hors chaîne** ; dans une chaîne, c'est de la prose. `5` devient
   `4` champs + `1` prose.
3. **`new Set([1,2,3])` n'est pas une politique.** `polyfills-*.js` en contient
   un, et le relevé y annonçait une « politique de rejeu ». Garde ajouté : un
   ensemble de rejeu n'est retenu que si **toutes** ses valeurs sont des codes
   HTTP (400–599). Même famille que les 7 `method:"POST"` de supabase-js en A2.

### 2.2 Un piège de décodage, qui a cassé la première version

`\xe9` **n'est pas un octet UTF-8**, c'est une **échappement de caractère
JavaScript** (U+00E9). Décodé comme un octet, il donne `U+FFFD` — la première
version de l'instrument rendait `d<remplacement>duit`. La règle juste est
`String.fromCharCode`, avec une conséquence contre-intuitive : `\xc3\xa9` vaut
« Ã© » **en JS**, et le recoller en « é » serait une invention.

Le fichier mélange d'ailleurs les deux écritures : `\xe9` pour les accents, mais
un tiret cadratin **littéral** en UTF-8 (`—`) dans « Hors ligne — les ». D'où
**35 653 octets pour 35 632 caractères** : 21 octets de surplus, exactement les
caractères non-ASCII écrits en clair.


---

## 3. La mécanique — où, quoi, quand

### 3.1 Les deux magasins locaux

| Magasin | Genre | Nom | Clé | Détail mesuré |
|---|---|---|---|---|
| `fidelix-caisse` | IndexedDB **v2** | `file_attente` | `keyPath:"id"` | la file d'envoi |
| `fidelix-caisse` | IndexedDB v2 | `cartes` | `keyPath:"id"` | cache des cartes ; **effacé à chaque montée de version** |
| — | localStorage | `fidelix_caisse_programme` | — | `{type, stampsTotal}` — le programme, pour l'affichage hors ligne |
| — | localStorage | `fidelix_caisse_devise` | — | `MAD` \| `EUR`, écrit à chaque scan réussi |

```js
let k="file_attente",S="cartes";
a.onupgradeneeded=()=>{let e=a.result;
  e.objectStoreNames.contains(k)||e.createObjectStore(k,{keyPath:"id"}),
  e.objectStoreNames.contains(S)&&e.deleteObjectStore(S),
  e.createObjectStore(S,{keyPath:"id"})}
```

Le magasin `cartes` est **détruit puis recréé** à la montée de version : le cache
de cartes est jetable par conception, la file ne l'est pas.

> **Nuance de comptage.** Le nom `file_attente` n'apparaît **qu'une fois** dans
> tout le corpus : à sa déclaration. Les quatre usages passent par la variable
> `k` (`P(k,…)` ×4). Un relevé par nom sous-compte donc les usages d'un facteur
> 4 — ce n'est pas une absence d'usage, c'est une variable.

### 3.2 La forme d'un élément de file

```js
async function A(e){
  let a={...e, id:null!=e.id?e.id:crypto.randomUUID(),
              cree_le:Date.now(), tentatives:0};
  return await P(k,"readwrite",e=>e.put(a)),a}
```

Un élément = `{id, cree_le, tentatives, card_id, type, amount_mad}`. Rien de
plus : **ni `points`, ni `reward_tier_id`** — ces champs n'existent que pour les
types qui ne sont jamais mis en file (§3.5).

`put` sur `keyPath:"id"` ⇒ **réécrire est impossible** : deux clics avec le même
identifiant remplacent, ils ne dupliquent pas.

### 3.3 L'identité, et le lien avec l'idempotence d'A2

L'identifiant est généré **avant** la tentative réseau, et c'est **le même** qui
part dans le corps de la requête et dans la file :

```js
let a="add_stamp"===e||"earn_points"===e, s=a?crypto.randomUUID():void 0;
fetch("/api/transaction",{…body:JSON.stringify({…, client_operation_id:s})})
catch(t){ if(a&&$){ await A({id:s, card_id:$.id, type:e, amount_mad:…}) } }
```

⇒ **`client_operation_id` = `id` de l'élément de file.** Si la requête a atteint
le serveur mais que la réponse s'est perdue, le rejeu renvoie la **même** clé :
la déduplication côté serveur devient possible, et c'est la seule chose qui
empêche un double tampon. Le contrat d'A2 §3.1 (idempotence asymétrique) et la
mécanique d'A4 sont **la même décision vue des deux côtés**.

### 3.4 L'ordre, le vidage, et ce qui arrête le vidage

| Geste | Code | Effet |
|---|---|---|
| lire | `getAll()` puis `.sort((e,t)=>e.cree_le-t.cree_le)` | **FIFO par date de création** |
| réussite | `e.ok` → `T(id)` | retiré, compteur `envoyees` +1 |
| statut dans `{400,403,404,422}` | `O.has(e.status)` → `T(id)` | **jeté** (`ecartees` +1) |
| tout autre statut | `L(e)` (`tentatives+1`) puis `break` | **conservé**, on s'arrête |
| exception réseau | `break` | conservé, **`tentatives` inchangé** |

```js
let O=new Set([400,403,404,422]),z=null;
…
if(e.ok)await T(s.id),t++;
else if(O.has(e.status))await T(s.id),a++;
else{await L(s);break}
…
function X(e){return e.filter(e=>e.tentatives>=3).length}
```

**Trois propriétés que le mot « bloqué » ne dit pas :**

1. **`tentatives` n'augmente qu'une fois par cycle**, puisqu'on `break` juste
   après. Avec l'intervalle de 65 s, atteindre le seuil de 3 prend ~3 minutes.
2. **« Bloqué » n'abandonne rien.** `X()` ne sert qu'à **compter**. Le vidage
   suivant relit `getAll()` sans filtrer : une opération bloquée est **réessayée
   indéfiniment**, toutes les 65 s.
3. **Une panne réseau n'incrémente rien.** Seuls comptent les statuts *hors* de
   l'ensemble de rejet — donc un `401` de caisse révoquée, un `429`, un `500`.
   Et le rejeu **ne traite pas le 401** : dans `D()`, ni redirection vers
   `/caisse`, ni rafraîchissement de session, alors que l'appel direct les fait.

**Un seul vidage à la fois** : la promesse est mémorisée dans `z` et remise à
`null` en `finally` —

```js
let e=await(!z&&(z=D().finally(()=>{z=null})),z).catch(()=>null)
```

— sans quoi deux déclencheurs (clic « Envoyer » + retour du réseau) pourraient
envoyer deux fois le même élément avant que le premier n'ait été retiré.

**Le minuteur** : `setTimeout(()=>void eW(),65e3)`, replanifié **seulement** si
`restantes>0 && navigator.onLine`. Deux écouteurs : `online` relance le vidage
complet, `offline` ne fait que basculer l'indicateur.

### 3.5 Ce qui n'entre **jamais** dans la file

| Opération | Sort hors ligne | Preuve |
|---|---|---|
| `add_stamp` | **mis en file** | `a = "add_stamp"===e \|\| "earn_points"===e` |
| `earn_points` | **mis en file** | idem |
| `redeem_points` (cashback) | refusé, message | « Le cashback ne peut pas être déduit hors ligne : le solde du client doit être vérifié auprès du serveur. » |
| `redeem_reward` (récompense) | refusé, message | « Les récompenses ne peuvent pas être remises hors ligne : … » |
| `POST /api/transaction/annuler` | refusé, message | « Connexion interrompue. Réessayez. » |
| `POST /api/caisse/cadeau-filleul` | refusé, message | « Connexion interrompue : rien n'a été enregistré. » |
| `POST /api/caisse/parrainage-valide` | refusé, message | idem |

Et un détail d'affichage qui trahit la conception : en file, le solde optimiste
n'avance que pour le tampon —

```js
let t=("stamps"===$.programType?$.currentStamps:$.currentPoints)+ +("add_stamp"===e);
```

— un `earn_points` hors ligne est donc enregistré **sans** créditer de points à
l'écran. Le solde de points n'est pas devinable localement : le client préfère ne
rien montrer plutôt que de se tromper.

### 3.6 Le cache de cartes, et ce que « dernier passage » veut dire

```js
async function t(){let e=await fetch("/api/scan/cards");if(!e.ok)return;
  let{cartes:t,programme:a}=await e.json();await R(t??[]),a&&q(a)}
```

`R()` fait un `put` pour chaque carte reçue, horodaté `maj_le`. **Aucun
`clear()`, aucun `delete`** : une carte supprimée côté serveur reste lisible hors
ligne, indéfiniment.

Et le point qui compte pour la promesse faite au commerçant :

> Le cache est rempli par **`GET /api/scan/cards`** — le **catalogue entier** —
> appelé au montage et sur l'événement `online`. **Pas** par
> `GET /api/scan/card?id=`, qui répond au scan individuel.

⇒ « Solde au dernier passage — hors ligne » est donc exact **au sens du dernier
chargement du catalogue**, pas du dernier passage du client. Le libellé est plus
généreux que la mécanique, et un clone qui le prendrait au mot afficherait un
solde plus frais que le produit.

---

## 4. Ce que la caisse affiche sans réseau

Quatre messages, deux compteurs, et deux issues différentes.

| Condition | Texte | Compteur | Issue réelle |
|---|---|---|---|
| file > 0 et en ligne | « *N* opération(s) **en attente d'envoi** » + bouton **Envoyer** | `enAttente` (relu) | part au prochain cycle |
| hors ligne | « **Hors ligne** — les *points\|tampons* sont enregistrés sur cet appareil » + « Ils partiront tout seuls au retour du réseau. Les récompenses, elles, nécessitent une connexion. » | — | — |
| `tentatives>=3` | « *N* opération(s) **n'ont pas encore pu être enregistrée(s)** » + « Elles sont conservées sur cet appareil et repartiront toutes seules. » | `bloquees` (**recalculé** chaque cycle) | **conservée, réessayée** |
| statut ∈ `{400,403,404,422}` | « *N* opération(s) **hors ligne refusée(s)** : carte inconnue, ou d'une autre enseigne. Rescannez le client… » | `ecartees` (**cumulé**) | **jetée** |

> **Deux mots pour deux destins.** « Refusée » = jetée définitivement.
> « N'a pas encore pu être enregistrée » = conservée et réessayée. Les compter
> ensemble serait une erreur de lecture du produit, pas seulement du code.
> Et le compteur `ecartees` **s'accumule** : il ne revient à zéro que par le
> bouton de fermeture du message (`ey(0)`), pas par un vidage réussi.

Sur la carte, hors ligne (lecture du cache) :

```
« Solde au dernier passage — hors ligne »                    // carte connue
« Cette carte n'a jamais été chargée sur cet appareil.
  Le tampon sera bien enregistré, mais le solde ne peut pas
  être affiché sans connexion. »                             // inconnue (inconnue:!t)
```

Une carte inconnue **est acceptée** : le tampon part en file, et c'est le serveur
qui tranchera — par un `404`, qui la jettera (§3.4). Les champs non cachés sont
neutralisés à la lecture : `tiers:[]`, `rewardThreshold:null`,
`rewardDescription:""`, `restaurantName:""`, `primaryColor:"#1a1a1a"`.

Le code d'accès, lui, est toléré sous deux formes (`e5`) : `^C-[0-9A-Za-z]{4,10}$`
ou un UUID extrait du lien de la carte.

---

## 5. File (A4) et politique de rejeu (A2) — le tableau qui les sépare

C'est la distinction demandée, et c'est celle qui décide de l'architecture.

| | **Mécanique de file** (A4, ce document) | **Politique de rejeu** (A2 §3.1) |
|---|---|---|
| Question | où, quoi, quand, dans quel ordre | quel statut jette / garde / bloque |
| Portée | IndexedDB, forme des éléments, identité, FIFO, cache, minuteur, messages | `Set` de statuts, seuil, sortie de boucle |
| Contrainte pour R2 | schéma du magasin, clé d'idempotence, FIFO, reprise, UI | choix des codes à jeter, nombre d'essais |
| Statut de la preuve | **lu**, chaque valeur a sa ligne citée | **lu**, et maintenant **extrait** : `{400,403,404,422}`, seuil `3`, délai `65000` |

Extraits par l'instrument — l'un des deux n'a rien à voir avec la file :

```
jette sur  : {400,403,404,422}
bloque à   : tentatives >= 3
délai      : 65000 ms   sur « ()=>void eW() »
délai      :  3000 ms   sur « ()=>{J.current&&eE(!1)} »   <- pas la file : le message « ce QR n'est pas une carte »
```

Les **deux délais** sortent ensemble : c'est voulu. Un extracteur qui ne rendrait
que le plus grand aurait caché que l'un des deux n'a rien à voir avec la file.

---

## 6. Ce que le corpus ne peut pas dire

1. **`/sw.js` n'est dans aucune capture.** Le client appelle
   `navigator.serviceWorker.register("/sw.js")` — c'est un fait sur le client.
   L'existence du fichier n'est **pas** mesurée. Conséquence pratique : savoir si
   la caisse *se recharge* hors ligne (et donc si la file est atteignable sans
   réseau) dépend de ce fichier et de ce qu'il met en cache. **Lacune de corpus,
   pas absence** — elle se comble par une capture de `/sw.js`, pas par une
   déduction.
2. **L'état appairé n'a jamais été capturé.** `/caisse` répond 200 en anonyme
   mais rend **194–199 octets** de texte visible : « Activer cette caisse —
   Demandez le code au gérant ». Identique avec session (blocage **B-3**). La
   file est donc **chargée** (chunk 6866 présent dans **1 page sur 21**) mais
   **jamais rendue**. Aucune capture ne peut la montrer.
3. **La forme de la réponse de `/api/scan/cards`** n'est connue que par ce que le
   client en lit : `{cartes:[…], programme:{…}}`, chaque carte portant au moins
   `id`, `solde`, `codeClient`. Le reste (taille, pagination, plafond) est
   inconnu.
4. **Aucun essai réel.** Aucun POST, aucun scan, aucune caisse appairée : les
   comportements décrits sont ceux du **code livré**, pas ceux d'une exécution
   observée.
5. **Le service worker n'a pas été exécuté**, et une page sous SW ne prouve pas
   ce que le serveur sert (lesson §17, bonus). Un `fetch` dans une page
   contrôlée par un SW ne mesurerait pas non plus la file, qui vit dans
   IndexedDB et non dans le réseau.
6. **`/api/scan/cards` n'a pas été appelé** : on ne sait pas combien de cartes il
   renvoie, donc on ne sait pas si le cache « catalogue entier » est réaliste à
   l'échelle. C'est une question pour R2, pas une mesure de plus ici.

---

## 7. Conséquences pour la reconstruction (R2)

1. **La clé d'idempotence est l'identifiant de file.** Un clone qui génère un
   UUID *au moment du rejeu* reproduirait les doubles tampons que la clé existe
   pour éviter. Générer à l'**enfilage**, jamais au renvoi.
2. **FIFO strict par `cree_le`**, avec **arrêt au premier statut inconnu** — pas
   de « on saute et on continue ». L'ordre est un contrat : un tampon ne doit pas
   passer avant celui qui le précède dans la même visite.
3. **Trois issues, pas deux** : envoyer / jeter / conserver. Les fusionner casse
   soit l'affichage, soit les données.
4. **Ne jamais déduire un solde localement.** Le client ne crédite que le tampon
   (`+ +("add_stamp"===e)`) et nomme le reste « dernier passage ». Faire mieux
   serait mentir ; faire moins serait inutile.
5. **Prévoir l'expiration du cache de cartes.** Le produit ne purge jamais
   `cartes` (sauf montée de version) : un clone devrait au minimum borner
   `maj_le`, sinon il affichera des soldes d'un autre mois.
6. **Un seul vidage à la fois.** Le verrou `z` n'est pas décoratif : sans lui, le
   clic « Envoyer » et le retour du réseau peuvent viser le même élément.
7. **`OPTIONS`/`GET` ne suffisent pas ici.** La file et le rejeu se prouvent par
   lecture de code ; un clone ne peut pas être validé sans une caisse appairée.

---

## 8. Limites de cette étape

- **Une seule build mesurée** (48 bundles du 2026-10-26 ; les trois fichiers de
  la caisse sont identiques au bit près sur les trois passes). Une nouvelle build
  peut changer les noms minifiés : l'instrument s'appuie sur des **noms de
  données** (`fidelix-caisse`, `file_attente`, `client_operation_id`,
  `tentatives`) et sur des **formes** (`new Set` de codes HTTP, `tentatives>=N`,
  `setTimeout`), pas sur des identifiants de fonction. Exception assumée :
  `magasinsIndexedDb` et `clesLocalStorage` reposent sur l'**assignation
  littérale** de la variable (`k="file_attente"`) ; si le minifieur inline la
  chaîne, le relevé dira « magasin introuvable » et la calibration **criera** au
  lieu de se taire.
- **Classement sémantique par table** (`ROLES_CAISSE`) : une nouvelle clé de
  stockage non déclarée serait invisible. C'est assumé — un relevé par forme
  seule ne sait pas distinguer `cartes` de « vos cartes », et c'est exactement le
  faux positif qui a été retiré.
- **JavaScript livré seulement** : ni source maps, ni code serveur, ni base.
- **Aucune écriture, aucune sonde** : le périmètre d'A4 est la lecture du code
  déjà capturé. Tout ce qui demanderait une caisse appairée est listé au §6
  comme inconnu, pas comme déduit.

