# Fidelix — Fidelia AI (A5)

> **0 requête.** Ce document ne s'appuie que sur des fichiers déjà capturés :
> 65 bundles, 22 pages, 21 sondes de `_captures/2026-10-27-auth-s3/`, plus le
> réseau observé de `_captures/2026-10-26-auth/`. **Aucune génération n'a été
> déclenchée.** Outil : `tools/rea/relever-fidelia.mjs` + module
> `tools/rea/fidelia.mjs` (**50 tests**), **218/218** au total.
> Sortie archivée : `_captures/2026-10-27-a5/releve-fidelia.{json,txt}`.

---

## 1. Le résultat en une phrase

**« Fidelia AI » n'est pas un chat : c'est un conseiller déterministe.** Le
client n'envoie **aucune entrée** — deux `GET` nus, sans corps ni en-tête — et
la « conversation » (dix questions) est une **grille déjà présente dans la
réponse**, parcourue localement. Il n'y a donc **pas de prompt système dans le
code livré** : non pas « caché », mais **absent**, et surtout **sans canal pour
en recevoir un**.

| Question de l'étape | Réponse mesurée | Genre de preuve |
|---|---|---|
| Prompt système | **absent des 65 bundles** (0/11 marqueurs de modèle) | absence mesurée |
| Entrées envoyées | **aucune** : `fetch(url)` à un seul argument | lu dans le code |
| Forme de la sortie | 8 champs (`/api/fidelia`), 1 champ (`?resume=1`) | lu sur les octets |
| Garde-fous | **12**, tous présents et nommés | prédicats + extraits |
| Où vit le code | chunk `app__dashboard__layout`, **pas** un chunk `fidelia` | graphe, pas le nom |

---

## 2. La correction de cadre, la troisième du projet

La demande disait « mesure `/api/fidelia` **dans les bundles du dashboard** ».
C'est juste — mais le réflexe naturel, chercher `app/(dashboard)/fidelia/page`,
donne **zéro fichier** : il n'existe **aucun chunk nommé `fidelia`** dans les
165 assets capturés.

Le contrat vit dans `_next_static_chunks_app__dashboard__layout-aa8914c1bd963665.js`
— **52 158 octets, 52 144 caractères** (14 octets de surplus = 7 caractères
non-ASCII écrits en clair). C'est le **layout** qui porte l'assistant, pas une
page : le bouton flottant est présent sur **14 pages** parce qu'il est monté une
fois, dans la coquille.

Même mécanisme qu'en A4 (§20) : Next nomme un chunk d'après la route qui l'a
fait **extraire**, pas d'après le code qu'il contient. Ici le nom du fichier ne
mentionne même pas le sujet.

---

## 3. Le contrat réseau : deux `GET`, aucune entrée

Lecture exacte (`appelsFidelia`) :

```js
fetch("/api/fidelia")            // ouverture du panneau
fetch("/api/fidelia?resume=1")   // montage du layout, à chaque page
```

| | `/api/fidelia` | `/api/fidelia?resume=1` |
|---|---|---|
| Méthode déclarée | **aucune** → GET par défaut | **aucune** → GET par défaut |
| Second argument (`options`) | **absent** | **absent** |
| Corps | **aucun** | **aucun** |
| En-têtes | **aucun** | **aucun** |
| Déclencheur | `O()` — premier clic sur le bouton | `useEffect` au montage |

**Conséquence, et c'est le garde-fou principal :** il n'existe **aucun canal**
par lequel un texte utilisateur pourrait atteindre le serveur. L'injection de
prompt n'est pas « filtrée », elle est **impossible par construction** sur ce
contrat. Un clone qui ajouterait un `POST {question}` ne reproduirait pas
Fidelia : il ferait autre chose.

> **Limite honnête.** Le réseau observé (`_captures/2026-10-26-auth/rendu/*.reseau.json`)
> enregistre **9 appels** à `/api/fidelia`, un par page du dashboard — mais l'URL
> y est **tronquée en `?…`**. La capture **ne permet pas** de distinguer
> `?resume=1` d'un autre paramètre. L'attribution vient du **code**
> (`fetch("/api/fidelia?resume=1")`), pas du réseau. Les deux mesures sont
> concordantes, elles ne sont pas interchangeables.

---

## 4. Le « prompt » : ce qu'on trouve à la place

**0 marqueur de modèle sur 11** dans les 65 bundles : `systemPrompt`,
`system_prompt`, `role:"system"`, `openai`, `anthropic`, `chat/completions`,
`gpt-`, `claude-`, `temperature`, `max_tokens`. Aucun.

Deux marqueurs **de flux** existent, mais ailleurs — et ce ne sont pas des
preuves de LLM :

| Marqueur | Fichier | Lecture |
|---|---|---|
| `text/event-stream` | chunk `7383` | diffusion (`/api/broadcast`), pas Fidelia |
| `getReader()` | chunk `7631` | lecture de flux générique |

C'est la leçon d'A2 qui se rejoue : *une forme sans domaine n'est pas une
preuve*. `getReader()` dans un bundle n'annonce pas un modèle, exactement comme
`method:"POST"` dans supabase-js n'annonçait pas un contrat.

**Ce que l'absence prouve, et ce qu'elle ne prouve pas.** Elle prouve qu'aucun
client LLM n'est livré. Elle **ne prouve pas** qu'aucun modèle ne tourne côté
serveur : ce code-là n'est pas observable depuis le navigateur. La consigne
interdisait de déclencher une génération ; la question reste donc **ouverte, et
non tranchée par défaut**.

---

## 5. La forme de la sortie — lue sur les octets

### 5.1 `GET /api/fidelia` — 4 988 o / 4 903 car, 200

Huit champs, tous présents :

| Champ | Type | Mesure |
|---|---|---|
| `cle` | string | 36 caractères (UUID textuel, **non résolu**) |
| `synthese` | string | 169 caractères |
| `donneesInsuffisantes` | boolean | `true` |
| `conseils` | array | **0** élément (forme non observée) |
| `libelles` | object | **10** clés |
| `reponses` | object | **10** clés, identiques |
| `rebonds` | object | **10** clés, chacune un tableau |
| `ouverture` | array | **4** clés de question |

Exemple de `synthese` observée, qui dit à elle seule que le texte est **calculé
depuis les données**, pas généré :

> « Votre programme n'a pas encore de clients inscrits. Posez la plaque QR en
> caisse et faites scanner vos premiers clients : le conseiller aura alors de
> quoi vous répondre. »

### 5.2 `GET /api/fidelia?resume=1` — 13 o, 200

```json
{"urgents":0}
```

Un seul champ, un compteur. C'est un **indicateur de badge**, pas une synthèse :
13 octets contre 4 988. Il est appelé **au montage du layout**, donc sur
**chaque page** du dashboard, et son résultat est mis en cache **30 minutes**
(voir §7).

### 5.3 La grille : dix questions, quatre en ouverture

Le client vérifie (`grilleQuestions`) et **la grille ferme** — aucune clé
orpheline, aucun rebond hors grille, aucun rebond sur soi-même, tous les liens
d'action internes :

| Question (libellé rendu) | Lien d'action |
|---|---|
| Comment s'est passée ma semaine ? | `/dashboard` |
| Qu'est-ce que je n'utilise pas encore ? | `/automations` |
| Mes clients reviennent-ils ? | `/qrcode` |
| Comment les faire revenir plus souvent ? | `/automations` |
| Que faire des clients que je ne vois plus ? | `/automations` |
| Ma récompense est-elle bien réglée ? | `/rewards` |
| Comment inscrire plus de clients ? | `/qrcode` |
| Qui sont mes meilleurs clients ? | `/customers` |
| Quel est mon meilleur moment ? | `/dashboard` |
| Que dois-je faire en priorité ? | `/dashboard` |

**Ouverture** : `semaine`, `inutilise`, `meilleurs`, `priorite`.

**Et la conversation s'arrête là.** Cliquer une question **n'émet aucune
requête** : le composant cherche `reponses[id]` dans l'objet déjà reçu, affiche
les paragraphes, puis propose `rebonds[id]`. C'est un **arbre de décision**, pas
un dialogue.


---

## 6. Origine des occurrences : un libellé n'est pas un contrat

C'est le cœur de l'étape. Le même sujet apparaît **sous six natures**, sur
324 fichiers texte :

| Jeton | Total | Origines mesurées |
|---|---:|---|
| `Fidelia AI` | 52 | **libellé d'interface × 52** |
| `/api/fidelia` | 43 | cité, non émis × 40 · **contrat réseau × 3** |
| `Ouvrir Fidelia AI` | 34 | libellé d'interface × 34 |
| `urgents` | 19 | champ de sortie × 19 |
| `/api/fidelia?resume=1` | 10 | cité, non émis × 7 · **contrat réseau × 3** |
| `synthese` | 10 | champ de sortie × 10 |
| `/conseiller` | 9 | route de navigation × 6 · **route exclue × 3** |
| `donneesInsuffisantes` | 5 | champ de sortie × 5 |
| `fidelix_conseiller_` | 5 | magasin local × 5 |
| `fidelia_coin` / `fidelia_resume` | 3 / 3 | magasin local |

Trois lectures, et chacune corrige une erreur possible :

1. **`43` occurrences, deux contrats.** Les **3** « contrat réseau » sont la
   **même ligne de code** vue dans **trois captures** du même chunk (2026-10-26,
   2026-10-26-auth, 2026-10-27-auth-s3). Le porteur est compté **par nom de
   fichier** : **un** propriétaire, trois copies. Compter les chemins annonçait
   « 3 porteurs » — et faisait échouer la calibration sur un artefact de
   rangement.
2. **`40` « cité, non émis ».** Ce sont nos propres manifestes (`cibles-auth.json`),
   rapports (`contrats-bundles.json`) et le manifeste de capture. Ils **citent**
   la cible ; ils ne l'émettent pas. Les additionner aux contrats gonflerait le
   décompte d'un facteur 14.
3. **`52` libellés, zéro contrat.** `"Fidelia AI"` est un `aria-label`, un
   `title`, un titre de panneau, et — détail qui compte — la **valeur** d'une
   table `"/conseiller": "Fidelia AI"`. Un libellé d'interface, jamais une URL.

**Par famille de fichier** : bundle 72, page capturée 51, manifeste de capture
19, réseau observé 18, rendu de page 14, rapport de nos outils 8, artefact de
nos outils 8, sonde HTTP 6. Deux axes indépendants : le **rôle** du jeton et la
**provenance** du fichier.

**`/conseiller` : trois occurrences, trois natures.**

| Contexte dans le bundle | Origine classée |
|---|---|
| `"/conseiller":"Fidelia AI"` (table titre → libellé) | route de navigation |
| `v=["/scan","/conseiller","/branding"]` | **route exclue (garde-fou)** |
| `href:"/conseiller"` (« Voir l'analyse complète ») | route de navigation |

C'est le seul cas où le **même jeton** change de rôle selon son voisinage
immédiat. Un classement qui fusionne ces trois-là se trompe deux fois : il
compte un lien là où il y a une garde, et une page là où il y a un titre.

---

## 7. Les douze garde-fous, un par un

Tous **lus** dans le porteur, aucun « recommandé » :

| # | Garde-fou | Ce que le code fait |
|---:|---|---|
| 1 | `anti-re-appel` | `if(!N&&!S)` — pas de second appel si la synthèse est là |
| 2 | `synthese-obligatoire` | `…t.synthese)?` — une réponse **sans** `synthese` est un échec |
| 3 | `erreur-typee` | `"string"==typeof e.error` — `error` n'est affiché que s'il est une chaîne |
| 4 | `message-reseau` | « Connexion interrompue. Réessayez. » sur exception |
| 5 | `gate-donnees-insuffisantes` | `!N.donneesInsuffisantes&&` — le Q&A disparaît si le drapeau est vrai |
| 6 | `urgents-type-nombre` | `"number"==typeof e.urgents` — un badge ne s'allume que sur un nombre |
| 7 | `badge-vu` | `vu:!0` — le badge s'éteint à la première ouverture |
| 8 | `routes-masquees` | `v=["/scan","/conseiller","/branding"]` |
| 9 | `dedup-questions` | `!p.includes(e)` — une question posée sort des choix |
| 10 | `historique-filtre` | `filter(e=>e in s)` — un id inconnu en stockage est ignoré |
| 11 | `dialogue-aria` | `role:"dialog"` + `aria-label:"Fidelia AI"` |
| 12 | `ttl-resume` | `Date.now()-t.t<18e5` → **1 800 000 ms = 30 min** |

### 7.1 `18e5` n'est pas « 30 minutes »

Le bundle écrit `18e5`, pas `1800000` ni `30*60*1000` : notation scientifique
minifiée. Le relevé rend **le nombre** (`ttlMs: 1800000`) ; « 30 minutes » est
une **conversion**, pas une citation. Reprendre le vocabulaire de l'interface
serait la faute corrigée en A4 (« bloqué » qui n'abandonne rien).

### 7.2 Deux gardes imbriqués rendent `/conseiller` inatteignable

Le seul lien vers l'analyse complète est dans le panneau :

```js
!N.donneesInsuffisantes && <Panneau …/>              // garde 5
… <a href="/conseiller">Voir l'analyse complète</a>  // à l'intérieur
```

Or la réponse observée porte **`donneesInsuffisantes: true`**. Donc, sur ce
compte : le panneau ne se rend pas → le lien n'existe pas → `/conseiller` n'est
atteignable par **aucun** chemin dans l'interface capturée. Et le bouton est de
toute façon masqué **sur** `/conseiller` (garde 8).

**Ce n'est pas un bug de mesure, c'est une décision produit** : tant que le
programme n'a pas de données, Fidelia se réduit à une synthèse — et le
vocabulaire « posez-moi une question », présent dans le code, n'apparaît sur
**aucune** page.


---

## 8. Ce que la capture confirme, page par page

Le bouton est monté par le layout. Deux mesures **indépendantes** doivent donc
concorder : la liste `v` lue dans le code, et le HTML rendu.

| Mesure | Résultat |
|---|---|
| Pages capturées portant `Ouvrir Fidelia AI` | **14** |
| dont pages 200 sous layout dashboard | **13 / 15** |
| Pages **200 sous layout** sans bouton | **`a04-scan`, `a08-branding`** |
| Liste d'exclusion lue dans le code | `/scan`, `/conseiller`, `/branding` |
| Panneaux ouverts dans les captures | **0** |

**Concordance exacte.** Les deux pages privées de bouton sont précisément deux
des trois chemins de `v`. Le troisième, `/conseiller`, est cohérent par
impossibilité : il n'a jamais été capturé (S3 ne l'a pas découvert, parce que
son seul lien est derrière le garde 5). La garde est donc vérifiée **là où elle
peut l'être**, et son troisième cas reste **non mesuré** — pas « vérifié par
défaut ».

> Détail de méthode : `a15-caisse` et `a23-recompense-publique` sont 200 elles
> aussi, **sans** bouton, et ce n'est **pas** une exclusion : la première est une
> autre PWA (scope `/caisse`), la seconde est publique. Sans le drapeau
> « layout dashboard », elles seraient comptées comme deux exclusions
> imaginaires. Le relevé les sépare.

---

## 9. Le stockage local : trois clés, trois durées de vie

| Clé | Support | Rôle | Durée |
|---|---|---|---|
| `fidelia_coin` | `localStorage` | coin d'ancrage du bouton (`bas-droite` par défaut) | permanente |
| `fidelia_resume` | `sessionStorage` | `{t, urgents, vu}` — badge et TTL | 30 min (`18e5`), puis re-fetch |
| `fidelix_conseiller_<cle>` | `localStorage` | historique des questions, **par programme** | jusqu'à « Effacer » |

Le troisième point mérite d'être dit : la clé d'historique est
`"fidelix_conseiller_".concat(x)` où `x = cle` — **le champ `cle` de la
réponse**. C'est donc un historique **par programme**, pas par navigateur. Un
commerçant qui change de commerce change de fil ; et l'historique rechargé est
**filtré** (`filter(e=>e in s)`) : une question qui n'existe plus dans la
nouvelle grille est ignorée, pas affichée vide.

`cle` reste **non résolu** : 36 caractères, forme d'UUID, jamais mis en relation
avec une table (A1 a montré que `loyalty_programs` a un `id`, mais l'égalité
n'est pas mesurée ici — et ne pas la supposer est la règle).

---

## 10. Ce que le corpus ne dit pas

Quatre silences, et ils comptent autant que les mesures :

1. **Le prompt, s'il existe, est côté serveur.** Aucun bundle ne le contient.
   On ne peut ni l'affirmer ni l'infirmer depuis le navigateur.
2. **Aucune entrée n'a jamais été observée.** Pas de `POST`, pas de corps. Si
   une version ultérieure ajoute un champ de saisie, le contrat changera — et ce
   document sera périmé, pas faux.
3. **`/conseiller` n'a jamais été capturé.** Son existence est **lue** (titre
   `"/conseiller":"Fidelia AI"` + liste `v` + `href`), son **rendu** n'est pas
   mesuré. Aucune requête n'a été faite pour le lever : c'était la consigne.
4. **Le panneau n'a jamais été ouvert.** Les captures ne montrent que le bouton
   fermé ; tout ce qui concerne la grille vient du **code** et de la **réponse
   de la sonde**, pas d'un rendu.

**Ce que la répétition ajoute.** Les deux sondes `b12` et `b13` sont
**byte-identiques** entre la passe du 2026-10-26 et celle du 2026-10-27
(SHA-256 égaux). Sur des données inchangées, une réponse **strictement
identique** à 24 h d'intervalle est le comportement attendu d'un moteur de
règles, et le comportement *inattendu* d'un modèle génératif. Ce n'est pas une
preuve d'absence de LLM — c'est une **présomption forte**, et elle est notée
comme telle.

---

## 11. Ce qu'un clone doit reproduire

| À reproduire | Pourquoi ce n'est pas un détail |
|---|---|
| Deux `GET` nus | aucun canal d'entrée : c'est la définition du produit |
| `synthese` comme sentinelle | sans elle, la réponse est un échec, pas un vide |
| `donneesInsuffisantes` comme **porte** | les dix réponses existent quand même : la porte est un choix d'affichage |
| Grille **fermée** (10/10/10, 4 en ouverture) | une grille ouverte casse au premier clic |
| `rebonds` + `ouverture` | le parcours n'est pas une liste, c'est un graphe |
| Réponses **locales** | zéro requête par question : c'est ce qui rend le coût nul |
| TTL 30 min + `vu` | sans TTL, un badge reste allumé une journée ; sans `vu`, il ne s'éteint jamais |
| Liste `v` | le bouton **sur** `/conseiller` masquerait le panneau qui y mène |
| Historique par `cle` | un historique global mélangerait deux commerces |

**Et ce qu'il ne faut pas reproduire :** l'étiquette. « Fidelia AI » et
« Posez-moi une question » promettent un dialogue ; le contrat livre un arbre de
décision à dix branches. Un clone fidèle au **contrat** doit garder cette
promesse honnête — ou l'assumer explicitement.

