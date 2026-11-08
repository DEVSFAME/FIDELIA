# Contexte actif — 2026-10-28 03:35

## 2026-10-28 (03:35) — D-1 = A, et `basal-knowledge.md` ouvert

**Décision humaine, consignée : `Fidelia` = clone isofonctionnel de Fidelix.**
B-5 levé. La cible redevient la référence ; les 22 écarts deviennent des
exigences de parité ; la base actuelle (`conforme = true` vis-à-vis de
`conversation.md`) est donc **incompatible** → migration due.

**Nouveau livrable : `basal-knowledge.md`** — 714 lignes, 34 135 o, 14 sections,
à la racine de `FIDELIX/`. Boîte à outils d'implémentation, **pas** un audit.

**La discipline qui le structure** — trois régimes de preuve, jamais mélangés :

| Marque | Sens | Droit d'usage |
|---|---|---|
| **[M]** | mesuré sur la cible | fais foi |
| **[D]** | écrit dans un document | piste |
| **[G]** | connaissance générale **non vérifiée ici** | dette nommée |

C'est la garde directe contre la faute des documents d'origine : la spec écrit
« RLS » sans politique, `conversation.md` croit régler l'idempotence avec un
bouton. Un fichier qui mélangerait les régimes reproduirait ces erreurs en plus
grand.

**Wallet (§2, le plus développé).** Le corpus donne les **3 routes** et surtout le
**genre d'appel** : les deux routes de génération sont des **navigations**, pas des
`fetch` — un clone qui les appellerait en `fetch` n'ouvrirait rien sur iOS.
`{ajoutee:false}` n'est **pas** « carte inconnue » (UUID nul → **200**). Pas de
`/statut` Google (404 mesuré). Échec via `?wallet=erreur`.

**Ce que les documents ignorent, mesuré** : `passkit-generator` = **1**
occurrence, contre **0** pour les 7 mots-clés de la mécanique
(`passTypeIdentifier`, `teamIdentifier`, `webServiceURL`, `authenticationToken`,
`pkpass`, `vnd.apple.pkpass`, `serialNumber`). Donc toute la partie « comment ça
marche » est **[G]** — et c'est écrit comme tel.

**Le blocage à planifier maintenant** : compte **Apple Developer payant** + Pass
Type ID + `.p12` **avec sa clé** + WWDR. Donc le Wallet se code **en dernier** et
reste **désactivable** — ce que la cible fait déjà (`walletEnabled` **[M]**).

**Une tension que personne n'avait vue (§5.2)** : `postgres_changes` respecte la
RLS ⇒ « temps réel » et « RLS stricte » se contredisent (E-06). Recommandation :
**canal Broadcast serveur**, pas lecture de table.

**Le plus subtil (§6, mesuré)** : « refusée » (jetée) et « pas encore
enregistrée » (réessayée) sont **deux destins** ; les confondre ment au
commerçant. Et « solde au dernier passage » est plus généreux que la mécanique
(cache rempli par le catalogue, sans `clear()`).

**i18n FR/EN/AR : aucun contrat mesuré** → décision produit, pas élément de
clone. Le dire évite une migration inutile.

**7 tests** (`tests/basal-knowledge.test.mjs`) figent les **comptages** : si un
document se met à documenter la mécanique Wallet, le test tombe et la conclusion
« les documents nomment l'outil et ignorent le mécanisme » devient fausse — c'est
le but. **263/263** au total.

---

## 2026-10-28 (02:40) — R0, 3ᵉ source : la triangulation tranche

**Résultat.** `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md` étendu (§3.5
triangulation, §4.5 écarts E-19→E-22, §5.1 rechargée). **263/263 tests**
(8 nouveaux). **0 POST, 0 écriture, 0 projet Next.js.**

**L'entrée.** `FIDELIX/Spécifications techniques plateforme de fidélité QR
code.md` — **14 204 o / 247 lignes**, sha256 `70ea6ad9…49622d`. Ce n'est pas un
doublon de `conversation.md` : c'est une **variante** de la même architecture.

**Ce que la triangulation établit, et qui remplace une déduction.** Le module
porte maintenant **trois** modèles de référence et les compare à la base réelle,
une colonne à la fois :

| Référence | `conforme` |
|---|---|
| Cible mesurée (A1) | **false** |
| `conversation.md` | **true** |
| Spécifications techniques | **false** |

**La base EST `conversation.md`** : 3 tables, 18 colonnes, aucune manquante,
aucune superflue. Ce n'était avant qu'une empreinte de longueurs ; c'est
désormais un **test**. Et la spec ne peut pas l'expliquer : `points_delta` contre
`points_awarded`, `total_spent` absent, `staff_user_id` contre `staff_id`,
`notes` contre `reward_label`. **Son SQL ne s'exécuterait pas sur la base en
place.**

**Deux écarts nouveaux qui comptent plus que les autres.**

- **E-19** — l'arborescence de la spec annonce « Script SQL complet (Tables,
  Index, **RLS**, Fonctions RPC) ». Le script contient **0** `ENABLE ROW LEVEL
  SECURITY` et **0** `CREATE POLICY`. Sur Supabase, une table `public` sans RLS
  avec les GRANT par défaut est lisible **et inscriptible** par `anon` : la spec
  est **plus ouverte** que `conversation.md`, qui posait au moins 3 politiques
  permissives.
- **E-21** — l'anti-double-crédit de la spec est **un bouton désactivé**
  (`isSubmitting`), présenté comme la parade au « réseau lent ». Il protège du
  double **clic**, pas du cas nommé : requête reçue, réponse perdue. C'est
  précisément le trou que `client_operation_id` comble. **Un garde client ne
  remplace pas une clé serveur.**

**Ce qu'il faut lui reconnaître.** La spec corrige deux choses que
`conversation.md` faisait mal, et se rapproche de la mesure : **Supabase Auth +
`middleware.ts` sur `/admin/*`** (au lieu d'un PIN à 4 chiffres en
`sessionStorage`) et **`staff_user_id REFERENCES auth.users(id)`** (au lieu d'un
UUID libre). Le dire évite de jeter un document entier pour deux défauts.

**Le piège `stamp`, troisième occurrence.** `stamps` = **0** dans la spec aussi ;
ses 4 « stamp » sont des `TIMESTAMP`. Deux tests figent désormais des faits de
**document** — « la spec annonce la RLS et n'en contient aucune », « aucune
mécanique de tampon » : ils échoueront si le fichier change, ce qui forcera une
relecture de R0 au lieu d'une confiance renouvelée.

**D-1 ne change pas de nature, mais de charge.** Les **deux** propositions
écrites décrivent **B** (mono-commerce) : seule la feuille de route R1→R5 décrit
**A**. Ce n'est plus « A par défaut », c'est **« deux sources écrites disent B, le
plan dit A — laquelle exprime l'intention ? »**. La décision reste humaine ;
**aucune migration de schéma avant elle** (B-5).

---

## 2026-10-28 (02:20) — R0 : la base de reconstruction n'est pas un début de clone

**Résultat.** `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md` créé (6 sections).
**263/263 tests** (38 nouveaux). **0 POST, 0 RPC appelée, 0 écriture, 0 projet
Next.js.** Artefact : `_captures/2026-10-28-r0/sonde-base.json` (gitignoré,
8 375 o, **aucune clé**).

**Préflight.** `conversation.md` = **107 919 o**, `env.supabase.md` = **593 o**
→ **B-4 clos** ; `git check-ignore FIDELIX/env.supabase.md` → **exit 0**
(`.gitignore:73`). Aucun des deux fichiers n'a été présumé.

**La mesure, et ce qu'elle renverse.** La base n'était pas vide : elle contient
**3 tables** (`clients` 5 col., `loyalty_cards` 6, `loyalty_transactions` 7),
**0 ligne**, et **2 RPC** dont j'ai pu lire les **signatures** — ce que A1 et A2
n'avaient jamais obtenu sur la cible, dont l'OpenAPI répond **401**.

**Ce n'est pas un brouillon de Fidelix, c'est l'implémentation d'une autre
architecture.** L'empreinte est une empreinte DDL, pas une ressemblance :
`card_token` **64**, `first_name`/`last_name` **100**, `email` **255**,
`reward_label` **150** — les cinq longueurs écrites dans `conversation.md` ; plus
`reward_label`, **absent** du `CREATE TABLE` initial et **présent** en base (la
seconde migration de la conversation), plus les deux RPC avec leurs paramètres
exacts. La base a été créée **en exécutant la conversation**.

**Confrontation au modèle mesuré** : `conforme = false`. 7 tables de la cible
manquent, 3 sont en trop. Le seul feu vert laissé derrière est
`comparerModele()` — falsifiable, rejouable.

**Ce que R0 a refusé de conclure.** `anon` obtient **200** sur les 3 tables →
un **GRANT SELECT** existe (mesuré par différence avec `customers`, qui répond
403 en A1). Mais **RLS activée ou non est indissociable d'une table vide** : les
deux hypothèses produisent la même observation. R0 écrit **[?]**, et nomme le
test qui trancherait — une écriture, donc R1.2.

**22 écarts, 10 bloquants.** Les quatre qui décident de R1 : **E-01** mono ⇄
multi-tenant, **E-02** tampons absents, **E-06** RLS `USING (true)` sur les
données personnelles, **E-10** coût et libellé de récompense fournis par
l'appelant.

**Deux pièges de lecture, mesurés sur le corpus.** `stamp` sort **15 fois** —
toutes dans **`timestamp`** ; `stamps` sort **0**. Un comptage par sous-chaîne
aurait annoncé une mécanique de tampon qui n'existe pas (lesson §20.1). Et
`restaurant` sort **0 fois** sur 2 926 lignes : le modèle est **mono-commerce**,
et c'est un fait lexical, pas une impression.

**Deux défauts de comparateur trouvés par les tests** (aucun à la relecture).
`rewards` sortait « manquante » alors que la cible a **prouvé** son absence
(`PGRST205`) — le comparateur réclamait de créer une table dont on avait mesuré
qu'elle n'existe pas. Et `estConforme(undefined)` rendait **true** : une mesure
qui n'a pas eu lieu se lisait comme un feu vert. Les deux sont corrigés et
testés ; la fixture du test « modèle parfait » était elle aussi fausse, et l'a
été pour la même raison.

**Un effet de bord qui mérite sa ligne.** Les deux RPC sont **exposées par
PostgREST** et déclarées `SECURITY DEFINER` **[D]**, sans `SET search_path`.
Le contrôle d'accès de la conversation est un **PIN à 4 chiffres** vérifié dans
la route Next — donc **hors** de la fonction. Si `anon` a `EXECUTE` (défaut
Supabase), la clé publique du navigateur suffit à créditer des points. R0 ne
tranche pas (le tester serait écrire) ; il rend la vérification **bloquante**.

**D-1 — TRANCHÉE le 2026-10-28 (03:10) : option A**, clone isofonctionnel
`Fidelia`. **B-5 clos.** La base actuelle est celle de `conversation.md` → la
migration est due, mais **pas avant R1.2** (`EXECUTE` de `anon`, RLS réelle).

---

## 2026-10-28 (00:45) — A5 : Fidelia AI n'est pas un chat

**Résultat.** `01_REA_Fidelix/Global/Fidelix_Fidelia.md` créé (11 sections).
**0 requête** (ni GET, ni POST, ni OPTIONS). **218 tests** hors ligne (50
nouveaux). Sortie archivée : `_captures/2026-10-27-a5/releve-fidelia.{json,txt}`.

**Préflight.** Relancé avant toute lecture : `auth présente`, `GET /dashboard`
200, `GET /api/me` 404 → **session ACTIVE**, exit 0. La consigne était de ne
rien lancer sinon ; la condition était remplie.

**La mesure, et ce qu'elle renverse.** La demande portait sur « `/api/fidelia`
dans les bundles du dashboard ». Chercher un chunk `fidelia` donne **zéro
fichier** — il n'en existe aucun dans les 165 assets. Le contrat vit dans
`_next_static_chunks_app__dashboard__layout` (52 158 o), parce que l'assistant
est monté **une fois dans la coquille**, pas dans une page. Troisième occurrence
du même piège (§20) : un nom de fichier n'est pas un propriétaire de code.

**Ce que la mécanique ajoute au contrat.**

1. **Aucun prompt système client.** 0/11 marqueurs de modèle sur 65 bundles.
   `text/event-stream` (`7383`) et `getReader()` (`7631`) existent — mais ce sont
   des API de **flux**, utilisées ailleurs. Deux familles confondues = faux
   positif garanti.
2. **Aucune entrée.** Les deux appels ont **un seul argument** : pas de
   `method`, pas de `body`, pas de `headers`. L'injection de prompt n'est pas
   filtrée, elle est **impossible par construction**.
3. **La conversation est un arbre local.** La réponse porte `libelles`,
   `reponses`, `rebonds`, `ouverture` ; cliquer une question n'émet **aucune**
   requête. Dix branches, quatre en ouverture, grille fermée (10/10/10).
4. **`donneesInsuffisantes:true` est une porte.** Les dix réponses sont
   présentes ; c'est l'affichage qui se ferme. Conséquence : le seul lien vers
   `/conseiller` est **dans** le panneau → inatteignable sur ce compte, et le
   bouton est de toute façon masqué **sur** `/conseiller`.
5. **`18e5` = 1 800 000 ms.** Le relevé rend le nombre ; « 30 min » est une
   conversion, pas une citation du produit.

**Quatre défauts trouvés en écrivant l'instrument** (aucun à la relecture).

- Les offsets de `litterauxApi` tombent **après** le guillemet ouvrant : comparer
  `slice(i-48, i)` à `fetch(` échouait toujours → **les deux contrats sortaient
  en « prose »**. Corrigé en raisonnant sur `chaine.debut`.
- `tableauContenant` ne reculait pas au-delà du **premier** élément :
  `/scan` était reconnu, `/conseiller` passait pour un lien.
- Marqueurs de **modèle** et de **flux** dans une seule liste : le relevé
  annonçait « 2 marqueurs présents » en titrant « aucun client LLM ».
- Trois **copies** du même chunk (trois captures) comptaient pour **trois
  porteurs** — la calibration échouait sur un artefact de rangement.

**Un garde qui ne peut pas se déclencher ne prouve rien.** La vérification
« un libellé n'est pas un contrat » **appliquait** la déclaration au lieu de la
tester : son contre-témoin ne pouvait pas échouer. Rendue falsifiable — un
libellé en **argument de `fetch`** est désormais un écart de calibration.

**Calibration.** Trois familles : positifs (7 témoins), leurre (`Fidelia AI`,
52 occurrences, jamais contrat), négatifs (`/api/fidelia/stream`,
`?chat=`, `systemPrompt`, `openai`). Plus le témoin de décodage à réponse connue
(`R\xe9essayez` → `Réessayez`, 4 caractères → 1) et le **croisement code →
capture** : `donneesInsuffisantes:true` ⇒ `Posez-moi une question` doit
apparaître sur **0** page. Résultat : **0 écart**, et la prédiction tient.

**Deux confirmations indépendantes de la liste `v`.** Le code dit
`v=["/scan","/conseiller","/branding"]`. Le HTML rendu dit : **13/15** pages 200
sous layout portent le bouton, et les **2** sans sont exactement `a04-scan` et
`a08-branding`. Aucun panneau ouvert nulle part (0/22).

**Ce que le corpus ne dit pas, et qui compte.** Le prompt, s'il existe, est
côté serveur : invisible ici, et **non affirmé**. `/conseiller` n'a jamais été
capturé : son existence est **lue** (titre + `v` + `href`), son rendu **non
mesuré**. Et `a15-caisse` / `a23-recompense-publique` sont 200 sans bouton sans
être exclues — autre PWA, page publique : sans un drapeau « layout dashboard »,
elles devenaient deux exclusions imaginaires.

**Décision suivante — une seule.** **R0 — état basal**, préalable obligatoire à
R1 : inventaire du corpus, tri de ce qui sert à reconstruire (la mesure est
**fondation**, pas suggestion), état de la base **Supabase** lue dans
`env.supabase.md`, arbitrage de l'**axe directeur « QR code + points de
fidélité »** (`conversation.md`) confronté aux contrats A1–A4.
Blocages : **B-2** (admin), **B-3** (caisse non appairée), **B-4**
(`conversation.md` et `env.supabase.md` = **0 octet** : l'axe est connu par son
intitulé, pas par son contenu ; `env.supabase.md` a été **gitignoré** avant
réception des identifiants).

## 2026-10-27 (03:50) — A4 : la file n'est pas dans le fichier qui porte son nom

**Résultat.** `01_REA_Fidelix/Global/Fidelix_Caisse.md` créé (8 sections).
**0 requête** (ni GET, ni POST, ni OPTIONS). **168 tests** hors ligne (33
nouveaux). Sortie archivée : `_captures/2026-10-27-a4/releve-caisse.{json,txt}`.

**La correction de cadre, encore.** A2 avait lu la politique de rejeu dans le
chunk `6866` sans dire où vivait la file. A4 devait la mesurer « dans le bundle
`app/caisse/page` ». Ce bundle fait **6 464 octets** et ne contient **aucun**
jeton de file : il porte le code des **avis** (« Avis à valider », module
`81750`) et déclare `6866` en dépendance. La file est dans `6866` (35 653 o,
43 occurrences), chargé par **1 page sur 21**.

**Ce que la mécanique ajoute au contrat.**

1. **`client_operation_id` = `id` de l'élément de file.** Généré *avant* la
   requête, réutilisé tel quel au rejeu. C'est ce qui rend la clé utile ; la
   générer au renvoi la rendrait décorative.
2. **Trois issues, pas deux.** `ok` → retiré ; `{400,403,404,422}` → **jeté** ;
   tout le reste → **conservé** + `tentatives+1` + `break`. Et **« bloqué »
   (≥3) n'est qu'un compteur** : rien n'est abandonné, le cycle suivant réessaie.
3. **Une panne réseau n'incrémente pas `tentatives`**, et le rejeu **ne traite
   pas le 401** — pas de retour à `/caisse`, contrairement à l'appel direct. Une
   caisse révoquée accumule donc des opérations « bloquées » en silence.
4. **« Solde au dernier passage » = dernier `/api/scan/cards`.** Le cache est
   rempli par le **catalogue entier**, jamais par le scan individuel, et n'est
   **jamais purgé** (sauf montée de version, qui efface `cartes` et pas
   `file_attente`). Le libellé est plus généreux que la mécanique.
5. **Une carte inconnue est quand même tamponnée** — mise en file, puis jetée
   par le `404` du rejeu. C'est exactement ce que dit le message « carte
   inconnue, ou d'une autre enseigne ».

**Trois faux positifs, tous trouvés en écrivant l'instrument.**
`cartes` = 8 occurrences dont **2** seulement désignent le magasin → le jeton a
été **retiré** (un mot français n'est pas un jeton). `tentatives` = 5 dont **1**
dans « Trop de tentatives » de `/login` → un champ est un identifiant hors
chaîne, dans une chaîne c'est de la prose. Et `new Set([1,2,3])` des polyfills
n'est pas une politique → garde : codes 400–599 seulement.

**Un piège de décodage.** `\xe9` n'est pas un octet UTF-8 mais une
**échappement de caractère** JS (U+00E9). La première version décodait les
octets et rendait `U+FFFD` pour tout accent ; `String.fromCharCode` est la règle
juste, et `\xc3\xa9` vaut « Ã© » — le recoller serait une invention.

**Ce que le corpus ne dit pas, et qui compte.** `/sw.js` n'est dans aucune
capture : l'existence du service worker n'est pas mesurée, donc « la caisse se
recharge hors ligne » reste **non prouvé**. Et l'état appairé n'a jamais été
capturé (B-3) : la file est chargée mais jamais rendue, 194–199 o de texte
visible.

**Décision suivante — une seule.** **A5 — Fidelia AI** : `/api/fidelia` et
`/api/fidelia?resume=1`, en lecture seule (aucune génération déclenchée).

## 2026-10-27 (03:15) — A3 : le wallet n'était pas là où on le cherchait

**Résultat.** `Fidelix_API_Contrats.md` §5.4 réécrit. **Aucune écriture.**
**135 tests** hors ligne (25 nouveaux). Deux nouvelles preuves locales :
`_captures/2026-10-27-a3/raw/assets/…page-198959bafc7eadc0.js` (bundle public,
34 120 o, sha256 vérifiable) et `_captures/2026-10-27-a3/mesure-a3.json`
(sondes, sans corps de page ni identifiant client).

**La correction de cadre.** A2 disait « aucun endpoint de génération de pass ».
C'était vrai du **dashboard**. Un dashboard ne s'installe pas de carte dans le
téléphone : c'est le **client final** qui le fait. Le chemin mesuré :
`/join/<slug>` → `rpc("join_loyalty_program")` → `router.push("/card/<id>")`
→ deux boutons → `window.location.href = "/api/wallet/{apple,google}/<id>"`.

**Ce que la page carte a donné, et que 65 bundles de dashboard n'avaient pas.**

1. **Deux routes de génération**, en **GET**, atteintes par **navigation**
   (`window.location.href`) — pas par `fetch`. La réponse *est* le pass : un
   clone qui appellerait ces URL en `fetch` n'ouvrirait rien.
2. **Une troisième route**, `/api/wallet/apple/<id>/statut`, en `fetch` +
   `{cache:"no-store"}`, qui rend `{ajoutee:boolean}`. **Aucune équivalente
   Google** — et le serveur confirme l'asymétrie par un **404**.
3. **Un retour d'échec par l'URL** : `?wallet=erreur` affiche « L'ajout au
   Wallet n'a pas abouti ». Attendu par le code, **non mesuré** (on n'a pas
   provoqué d'échec).

**L'instrument qui a failli mentir deux fois.** `OPTIONS` semblait parfait pour
prouver l'existence d'une route de génération sans en déclencher une. Or sous
`/api/` (hors `/api/wallet`), le middleware répond **401 pour une route existante
comme pour une route inventée** : sans témoin négatif, j'aurais conclu que
`/api/commerce/actif` n'existe pas. Ce qui discrimine, c'est que les routes
wallet répondent **204 `Allow: GET, HEAD, OPTIONS`** — et que
`/api/wallet/zzz-inexistant` répond **404** là où le reste répond 401 : la
sous-arborescence est **hors middleware**, donc publique. Le 204 ne dit rien de
la ressource (même UUID nul → 204) ; il ne prouve que la route.

**Deux chiffres d'A2 faux, corrigés.** `wallet` sort **20** fois dans supabase
`auth-js`, pas 26. Et le bon total est **72** relevés sans double comptage sur
trois corpus — parce que `wallet` est contenu dans `wallet_bg_url`,
`walletEnabled`, `Apple Wallet` et `/api/wallet/`. Compter chaque jeton
séparément gonflait le total d'un facteur trompeur.

**La génération est serveur-only, et c'est la donnée qui le dit.**
`walletEnabled` / `googleWalletEnabled` sont dans le payload RSC mais dans
**aucune** colonne mesurée (ni les 34 de `restaurants`, ni les 23 de
`loyalty_programs`). Les *données* du pass y sont pourtant : `wallet_bg_url`,
`message_wallet`, `message_wallet_le`. Et le dashboard **compte les
désabonnements** via `rpc("taux_desinscription_wallet", {p_restaurant_id,
p_jours:7})` : il ne génère pas les pass, il mesure ceux qui les retirent.

**Deux bugs trouvés par les tests, pas par la relecture.** `relever` faisait
`break` au lieu de `continue` quand l'extension vers la gauche sortait du
fichier : **toutes les occurrences des 13 premiers caractères étaient perdues**,
silencieusement. Et le témoin de prose, écrit en UTF-8 (`Ajouter à …`), ne
pouvait pas matcher un bundle qui écrit `Ajouter \xe0 …` — le témoin échouait
alors que le corpus allait bien.

**Décision suivante — une seule.** **A4 — hors ligne** : la politique de rejeu
est déjà écrite dans le code (A2), il reste à mesurer la file de la caisse
(`en attente d'envoi`, solde au dernier passage). Aucune écriture nécessaire.

---

## 2026-10-27 (02:05) — A2 : les contrats d'écriture étaient déjà écrits, dans le code

**Résultat.** `Fidelix_API_Contrats.md` réécrit. **0 POST émis**, aucun compte,
aucune écriture. **110 tests** hors ligne (36 nouveaux). Relevé brut :
`_captures/2026-10-27-a2/contrats-bundles.json` (gitignoré).

**La question posée n'avait pas besoin d'être tranchée par un choix.** Entre
« rester en lecture », « relever côté client » et « écrire sur un compte de
test », la deuxième suffisait : les bundles capturés en S3 contiennent les
corps, les méthodes et les schémas. Aucune concession n'a été nécessaire.

**Le chiffre à corriger.** « Les 12 endpoints POST » était « les **12 endpoints
sondés en 405** ». Les 65 bundles déclarent **28** POST : 11 recoupent, **17
n'avaient jamais été sondés**. Et `/api/demarrer` est l'inverse — prouvé POST
par 405, absent du corpus. Un résultat de sonde est borné par sa liste de
cibles (lesson §18).

**Trois choses que seul le code pouvait dire.**

1. **Idempotence asymétrique** — `/api/transaction` envoie
   `client_operation_id: crypto.randomUUID()` **seulement** pour `add_stamp` et
   `earn_points`. Jamais pour `redeem_points`. L'émission est rejouable, la
   consommation ne l'est pas. C'est un choix, pas un oubli.
2. **La politique de rejeu hors ligne est déjà écrite** — `{400,403,404,422}`
   ⇒ jeter ; `ok` ⇒ retirer ; tout le reste ⇒ garder et s'arrêter ;
   `tentatives>=3` ⇒ compter comme bloqué. A4 a de quoi vérifier, pas à
   inventer.
3. **`superRefine` conditionnel** sur le programme : activer le bonus d'avis
   rend le lien Google **et** une récompense ≥ 1 obligatoires ensemble. Règle
   métier invisible dans le corps envoyé comme dans le modèle de données.

**Deux faux positifs, mesurés et encodés en tests.**
`method:"POST"` apparaît **37 fois** dans le corpus — dont **7 dans supabase-js**
(vérifiés un par un : `.insert()`, realtime ×2, Iceberg ×3) et 4 dans un
manifeste de garde Next. Et `/api/broadcast` est un **chemin de websocket** dont
la route répond **404**. Un comptage naïf aurait inventé 7 endpoints ; la règle
retenue n'accepte un POST que si l'argument 0 d'un `fetch(` porte un `/api/…`.

**La correction que je me suis infligée.** J'ai d'abord écrit « aucun endpoint
wallet ». Faux : `wallet` sort **30 fois**. Classé, ça donne 26 × supabase
`auth-js` (wallets Ethereum/Solana), `wallet_bg_url` dans `branding/save`, et
une phrase d'interface. Le fait établi est plus étroit : **aucun endpoint de
génération de pass**. C'est ça qui est écrit, et A3 part de là.

**Trois bugs d'instrument, trouvés par les tests, pas par la relecture.**
`lireObjet` comptait l'accolade ouvrante (profondeur jamais nulle ⇒ **aucun
corps extrait, en silence** — le rapport affichait `—` partout, ce qui ressemble
à « pas de corps ») ; `argumentDe` découpait depuis la mauvaise origine ; une
**URL choisie par ternaire** (`"cadeau"===e?"/api/a":"/api/b"`) perdait deux
endpoints. Le témoin qui a révélé le premier : `/api/notifications`, dont on
savait à la main qu'il **a** un corps.

**Décision suivante — une seule.** **A3 — wallet** : chercher le contrat des
pass là où il peut être (parcours public `/join/<slug>`, ou route Next
serveur-only). Ne pas reconclure « zéro » depuis le dashboard.

---

## 2026-10-27 (01:45) — A1 : le modèle mesuré, et une conclusion de S3 réfutée


**Résultat.** `Fidelix_Serveur.md` §8. **8 tables** interrogées en **GET seul**
(`tools/rea/mesurer-modele.mjs`, `--tirages 6`), **74 tests** hors ligne (21
nouveaux). Aucun POST, aucune écriture, aucun compte.

**Trois obstacles, tous mesurés avant d'être contournés.**
1. **Cookie présent ≠ jeton valide.** Le profil portait un `access_token` expiré
   depuis 22 min : `PGRST303 JWT expired` sur toutes les tables, alors que
   `/dashboard` répondait 200. Le rafraîchissement se fait par un **GET** de la
   sonde (l'application réécrit ses cookies, exp +3 596 s) ; l'outil refuse
   d'écrire si le jeton reste expiré (exit 4).
2. **La racine OpenAPI est fermée** : `401 — Only the service_role API key can be
   used for this endpoint`. Pas de schéma déclaré : les colonnes ne viennent que
   des lignes renvoyées.
3. **`GET /rest/v1/rpc/<nom>` ne discrimine rien** : le témoin négatif
   (`zzz_temoin_rea_inexistant`) renvoie le **même** `PGRST202`. La sonde est
   écartée ; l'existence des RPC reste prouvée par les **POST réels observés**.

**Ce que le modèle est.**
- `loyalty_programs` **23 colonnes / 309 lignes**, `restaurants` **34 / 1**,
  `transactions` **16 / 1**, `reward_tiers` **10 / 81** — colonnes réellement
  servies, types observés, `null` constatés.
- `automations` et `till_sessions` : **0 ligne** ⇒ colonnes **inconnues**, non
  inventées.
- `rewards` : **404 `PGRST205`** + hint `reward_tiers` ⇒ **la table n'existe pas**.
- `customers` : **403 `42501`** + hint `GRANT SELECT … TO authenticated` ⇒ table
  existante, **aucun privilège** pour le rôle utilisateur : les fiches sont lues
  **côté serveur Next**, pas par le navigateur.
- **RLS vs GRANT, distingués** : `restaurants` et `transactions` → 1 ligne avec
  session, **0** avec la clé anon ; `loyalty_programs` (309) et `reward_tiers`
  (81) → **même total sans jeton** (lecture publique, à confirmer comme choix).
- **Relations** par *embedding* : `transactions` → `restaurants`/`reward_tiers`/
  `till_sessions` ; `reward_tiers` → `loyalty_programs` ; 5 relations inverses
  depuis `restaurants` ; `PGRST200` prouve l'absence.

**La conclusion de S3 qui tombe.** `/customers/<uuid>` n'est **pas** un lien mort.
S3 avait sondé un UUID **synthétique** (`00000000-…`) : 404 = « client inconnu ».
Mesure d'aujourd'hui : **GET direct avec l'UUID réel → 200, 92 595 o, 21 liens** ;
clic → fiche rendue ; `reload` → même vue ; UUID nul et route inconnue → 404/404.
`tools/rea/verifier-lien-client.mjs` fait le clic (le lien est dans un `<details>`
replié : on ouvre le `<summary>`, jamais `force: true`).

**Piège d'instrument à retenir.** Le premier `fetch` de contrôle après le clic a
répondu **200** alors que la page était servie par le **service worker** ; et le
premier essai de clic a échoué parce que le lien avait une boîte **0×0**. Les deux
fois, c'est une mesure de structure (SW, chaîne d'ancêtres) qui a tranché, pas le
statut affiché.

**Décision suivante — une seule.** A2 : choisir explicitement entre (1) rester en
lecture, (2) relever les schémas Zod côté client sans cliquer, (3) écrire sur un
compte de test fourni. **Aucun POST ne sera émis sans cette décision.**

---

## 2026-10-27 (00:20) — S3 : les sous-routes sont dérivées, pas devinées

**Résultat.** `_captures/2026-10-27-auth-s3/` : **24 pages + 21 sondes + 67
assets**, **21/42 en 200 · 0 erreur · 3 refus conformes**. `--verifier` :
**109/109 STABLE, 0 divergence**. **53 tests** hors ligne passent.

**La chaîne de preuve, dans l'ordre.**
1. `decouvrir-cibles.mjs` lit les **13 rendus S2** (HTML rendu + réseau observé).
   Il extrait les `href` sous **deux écritures** — attribut HTML *et* charge RSC
   échappée (`\"href\":\"/equipe\"`) — et les XHR. Il agrège par **motif** :
   `b365a328-1326-…` → `/customers/:id`, donc deux UUID = **une** cible.
2. Le relevé est figé : `_captures/decouverte-2026-10-26-auth.json` —
   **13 rendus → 25 cibles, 10 nouvelles**.
3. Le manifeste S3 (`_captures/cibles-auth-s3.json`) reprend les **15 cibles S2 à
   l'identique** et ajoute 9 pages + 1 sonde. **Chaque ajout porte `decouvert`**
   (types, occurrences, pages sources, statut HTTP). Aucune cible inventée.
4. La passe écrit, le garde de dérive rejette : `/`, `/admin`, `/onboarding`
   → 307 `/dashboard`, tous **déclarés** `refusAttendu` donc **conformes**.

**Le fait qui a changé la doctrine d'empreinte.** `/equipe` a servi **3 formes
d'octets en 6 tirages** (73 865 o ×4, 73 865 o ×1 autre graphe, 73 908 o ×1),
divergence toujours à l'octet **60291** : la table de références de composants
clients de la charge RSC (`21:I[14586,…]` vs `21:I[34766,…]`). Et `/billing` a
servi une forme transitoire puis **10 tirages consécutifs identiques**. Le
**contenu ne change jamais** : même titre, même texte (770 o), mêmes 18 hrefs,
mêmes 17 chunks.

→ Conséquence appliquée : `raw/` archive les octets (preuve de ce qui a été
servi), mais `--verifier` compare **`sha256Contenu`** (titre + texte visible +
liens triés). Un libellé ou un prix qui bouge fait échouer la vérification — le
test reste strict, il ne devient pas complaisant. `/equipe` déclare
`variantes: 4` : ses formes distinctes sont archivées et nommées.

**Quatre défauts d'outillage, tous de la même famille (un instrument qui ment
d'un seul côté).**
1. **Auto-référence** : la requête `document` de la page pointe vers l'URL
   demandée, donc `/abonnement` (404) « se découvrait » et validait sa propre
   hypothèse. Exclue → 25 cibles au lieu de 29.
2. **`--diag` à 2 tirages** : a répondu « identique » juste après une mesure
   montrant 2 formes. → `--tirages 6`.
3. **Diff ligne à ligne** : aveugle sur du HTML minifié (page = 1 ligne) ; il
   répondait « ligne 1 ». → localisation au **caractère**.
4. **Refus = échec** : les 3 refus attendus faisaient sortir la passe en code 1,
   donc un rouge permanent qui ne signale plus rien. → `refusAttendu` +
   `conforme`, code 0 ; seul un refus **imprévu** alerte.

**Trouvaille produit.** `/customers/<uuid>` : le dashboard rend un lien dur, le
GET direct répond un **404 Next nu** (38 158 o, 4 liens) — distinct du 404 du
site (38 259 o, 7 liens, « Ce lien n'existe pas ou plus ») — et le build ne
contient **aucun** `customers/[id]/page-*.js` alors que
`customers/page-*.js` existe. **Lien mort (probable)** ; l'hypothèse « route
interceptée côté client » ne sera tranchée qu'en cliquant le lien en Playwright.

**Inventaire des routes, tel que mesuré** (chunks de build, 35 chunks de route) :
`(dashboard)/{dashboard,program,rewards,scan,reviews,qrcode,automations,branding,caisses,billing,customers,equipe,notifications,settings,campaigns}`,
`caisse/{page,layout,error}`, `(admin)/layout` (rôle insuffisant),
`(auth)/layout`, `recompenses/[slug]`. Le route group `(dashboard)` partage
`layout-aa8914c1…` ; `billing`, `program` et `settings` partagent un layout
propre (`layout-f827b980…`).

---


# Contexte actif — 2026-10-26 00:15

## 2026-10-26 (00:15) — Phase 1 débloquée : c'était l'outil, pas la session

La session a été ouverte par l'utilisateur dans une fenêtre dédiée. **Mais le
préflight, rejoué juste après, a encore répondu `ABSENTE`** — alors que deux
cookies `sb-rozagopjfkkblyxtjdgw-auth-token.*` (expiration 2027) étaient sur
disque et qu'un clone du profil ouvert en headless atteignait `/dashboard` en
200 avec le dashboard réel affiché. Deux défauts d'outillage, mesurés :

1. **La sonde ne pouvait pas répondre.** `/api/me` → 401 anonyme, **404
   authentifié** : jamais 200. Or le préflight, le garde n°3 et
   `ouvrir-session.mjs --attendre` exigeaient tous `200 sur /api/me`. Une
   session valide était donc déclarée absente, et la fenêtre interactive
   attendait un 200 impossible (elle ne s'est jamais fermée seule).
   → `SONDE_SESSION = '/dashboard'` dans `session.mjs`, partagée par les trois
   outils.
2. **Le cookie du profil n'était jamais envoyé.** `entetes(env, cookie)`
   ignorait son 2ᵉ argument et ne lisait que `env.FIDELIX_COOKIE`. Le pont
   profil → HTTP annoncé en §10 n'existait qu'à moitié : « auth présente »
   s'affichait, puis toutes les requêtes partaient en anonyme.
   → `const valeur = cookie || env.FIDELIX_COOKIE`.

Après correction : `VERDICT : session ACTIVE` (exit 0), **22/22 tests**.

## Ce qui a été capturé (S2, `_captures/2026-10-26-auth/`)

- **11 pages en 200** : `/dashboard` (123 ko), `/program`, `/rewards`,
  `/scan`, `/reviews`, `/qrcode`, `/automations`, `/branding`, `/caisses`,
  `/caisse`. **53/53 assets**. **0 erreur.**
- **Réfuté par la mesure** : `/account` → 404, `/abonnement` → 404,
  `/loyalty` → 404. Trois hypothèses tombées, sans discussion possible.
- **2 rejets nommés** : `/admin` et `/onboarding` → 307 `/dashboard`.
  Le garde de dérive (nouveau) a empêché d'archiver le dashboard sous ces noms ;
  la première passe rendue l'avait fait (6 fichiers supprimés, passe rejouée).
- **Sondes** : 12 endpoints en **405** (donc POST-only, donc existants),
  5 en 404 (`/api/me`, `/api/auth/session`, `/api/health`, `/api/scan/card`,
  `/api/broadcast`), 3 en 200 (`/api/scan/cards`, `/api/fidelia`,
  `/api/fidelia?resume=1`).
- **Modèle de données, par les XHR réels** : `GET /rest/v1/{automations,
  loyalty_programs, restaurants, reward_tiers, till_sessions}` ;
  RPC `classement_caisses`, `mon_role_point_de_vente`,
  `parrainages_du_commerce` ; `auth/v1/user` ; `GET /api/commerce/actif`.

## Décision suivante

**S3 — découverte de sous-routes** depuis les `href` et XHR déjà capturés, puis
**A1** (colonnes/relations/RLS, lecture seule). Deux choses restent hors de
portée sans action humaine, et ne seront pas inventées :

- **B-2** : `/admin` exige un **rôle admin** (ce compte ne l'a pas) ;
- **B-3** : `/caisse` doit être **appairée par code** pour livrer son état réel
  (dont A4, la file hors ligne).

**A2** (corps des POST) est un choix explicite à faire : les 12 endpoints sont
prouvés POST-only, mais observer un corps exige d'émettre une écriture — ce que
le périmètre « lecture seule » interdit aujourd'hui.

## Précautions tenues

- Aucun POST émis, aucun compte créé, aucun cookie passé en argument de ligne de
  commande (le profil est lu par l'outil).
- Seuls des **noms** de cookies et des **statuts** ont été affichés.
- `.profil-rea/` et `_captures/*/rendu/` restent gitignorés (données client).

---

## Historique — état au 2026-10-26 23:45

## Où j'en suis

**Phase 0 terminée.** Le périmètre public de Fidelix est capturé, empreinté et
documenté. La Phase 1 (intérieur du dashboard) est **bloquée par une seule chose :
l'absence de session** — re-mesurée ce soir : le profil `.profil-rea/` contient
**0 cookie** (compté en SQLite), `.env` est absent, `9222` n'écoute pas,
`/api/me` → `401`. Le brief annonçait une session active ; la mesure a dit non,
et c'est la mesure qui fait foi.

## Ce qui est solide (et sur quoi je peux construire sans risque)

- 21 pages publiques en 200, 50 assets, **0 erreur**, 40/40 cibles stables.
- 12 routes privées connues **par leur nom** (pas par leur contenu).
- 20 endpoints `/api/*` connus **par leur libellé** (pas par leur corps).
- Design system chiffré : couleurs, polices, tokens verre, deux skins.
- Modèle produit complet **tel que Fidelix le raconte** (`/guide`, 10 sections).

## Ce que je ne sais pas (et que je refuse d'inventer)

1. Le contenu des 12 modules gardés.
2. Le modèle de données (tables, colonnes, RLS).
3. Les corps de requête des 12 endpoints d'écriture.
4. La génération des pass wallet.
5. La mécanique hors ligne exacte (clé de stockage, idempotence).
6. Le rôle de `/loyalty`.

## Décision suivante

Une seule action humaine, **aucun identifiant transmis** :

- **Voie 1 (recommandée)** — `node tools/rea/ouvrir-session.mjs --attendre 300` :
  une fenêtre dédiée s'ouvre sur `/login`, **l'utilisateur tape lui-même** ses
  identifiants, la session est vérifiée par `/api/me` puis persistée dans
  `FIDELIX/.profil-rea/` (gitignoré). **Rien à recopier ensuite** : depuis le
  2026-10-26 (23:40), `capturer-fidelix.mjs` lit ce profil tout seul.
- **Voie 2** — `FIDELIX_COOKIE=…` dans `FIDELIX/.env` : utile si la connexion
  interactive est impossible. C'est un jeton de session (révocable par
  déconnexion), pas un mot de passe.
- **Voie 3** — Chrome déjà connecté, lancé avec
  `--remote-debugging-port=9222`, puis `capturer-rendu.mjs --cdp …`.

Les voies 1 et 3 peuvent se combiner : 1 pour la session, la capture rendue
donne l'état **pixel** et les XHR ; la capture HTTP donne les empreintes.

## Ajouté le 2026-10-26 (23:14) — le déblocage est outillé

- `capturer-fidelix.mjs` : `--preflight`, `--manifeste`, `--sans-sondes`,
  `--ecraser`, et **garde `modeAttendu`** — une passe anonyme étiquetée
  « authentifiée » est refusée *avant* toute écriture.
- `_captures/cibles-auth.json` : 15 pages + 20 sondes GET ; `/account` et
  `/abonnement` étiquetés `hypothese` (le premier statut avec session tranchera).
- `capturer-rendu.mjs` : DOM hydraté + PNG + console + **requêtes XHR
  observées** ; toute cible atterrissant sur `/login` est **rejetée**.
- `ouvrir-session.mjs` : connexion par l'utilisateur, session persistée.
- `.gitignore` : `.profil-rea/` et `_captures/*/rendu/` exclus (données clients) ;
  le ledger `rendu.json` d'empreintes reste versionné.

## Fait mesuré qui change la méthode

Le garde de `/dashboard` est **catch-all** : 16 chemins sondés anonymement, dont
des noms inventés (`/menu`, `/staff`, `/integrations`), renvoient tous
`307 → /login`. Un 307 anonyme ne prouve donc **pas** l'existence d'une route ;
seuls 200/404 **avec session** sont discriminants.

## Précautions en cours

- Aucun POST n'a été émis ; aucun compte n'a été créé.
- La clé Supabase `anon` (publique) n'a pas été recopiée ni utilisée pour lire
  des données.

## Ajouté le 2026-10-26 (23:45) — le pont profil → HTTP, et trois gardes

Le préflight a dit **`session ABSENTE`** et la passe authentifiée n'a pas été
lancée : le brief se trompait, la mesure a tranché. Rien n'a été écrit (aucun
`_captures/2026-10-26-auth/`).

Trois défauts trouvés **en lisant le code**, tous corrigés et testés :

1. **Le mode venait de la présence du cookie, pas de sa validité** → un cookie
   expiré aurait écrit un ledger « AUTHENTIFIÉ » rempli de pages `/login`.
   Ajout d'un garde : `GET /api/me` doit répondre **200 avant la première
   écriture** ; et rejet par cible (`refuses[]`) si elle atterrit sur `/login`.
2. **Le pont profil → HTTP manquait** : `ouvrir-session.mjs` écrit dans
   `.profil-rea/`, `capturer-fidelix.mjs` ne lisait que `.env`. Une connexion
   humaine réussie aurait donc encore échoué. D'où `tools/rea/session.mjs`
   (priorité : `--profil` > `.env` > `.profil-rea` si jeton d'auth > anonyme).
3. **`addCookies()` sans `domain`** dans `capturer-rendu.mjs` : la voie
   `FIDELIX_COOKIE` du rendu n'injectait probablement rien. Parseur partagé,
   vérifié par aller-retour réel.

État vérifié : `--preflight` → `ABSENTE` (profil lu, 0 cookie) · capture
authentifiée sans session → **exit 2, aucun dossier créé** · faux cookie →
`session morte ou expirée`, exit 2 · `--verifier` → **1 divergence / 90**
(`/card/test`, connue) · **11/11 tests** hors ligne.

**Prochaine action, une seule** : `node tools/rea/ouvrir-session.mjs --attendre 300`.

## Ajouté le 2026-10-26 (23:48) — reprise mesurée : `ABSENTE`, S2 non lancée

Le brief de reprise affirmait la session peut-être ouverte. Le préflight, rejoué
en premier, a dit non :

```
Session     : profil par défaut …/.profil-rea — aucun cookie d'auth
Mode local  : ANONYME
Mode exigé  : AUTHENTIFIÉ — 01_REA_Fidelix/_captures/cibles-auth.json
GET /api/me    : HTTP 401
GET /dashboard : HTTP 307 -> /login
VERDICT : session ABSENTE        (exit 1)
```

**S2 n'a donc pas été lancée** — ni la passe HTTP, ni la capture rendue. Le garde
`modeAttendu` l'aurait de toute façon refusée avant écriture ; le préflight évite
même d'y arriver.

Contrôles de non-écriture et de non-régression, faits dans cette passe :

| Contrôle | Résultat |
|---|---|
| `_captures/2026-10-26-auth/` | **absent** (aucune preuve fabriquée) |
| `_captures/` | contient **2026-10-26/** seulement (passe anonyme) |
| `FIDELIX/.env` | **absent** |
| Cookies du profil (SQLite) | **0** |
| Écouteur `9222` | **aucun** |
| Processus sur `.profil-rea` | **aucun** (profil libre pour la connexion) |
| `node --test tools/rea/tests/session.test.mjs` | **11/11** |
| `git status FIDELIX` | `?? FIDELIX/` — isolation intacte |

Ce qui reste à faire, et qui n'appartient qu'à l'humain : **une** commande,
lancée dans un terminal interactif (elle ouvre une fenêtre et attend une saisie).

```
node tools/rea/ouvrir-session.mjs --attendre 300
```

Puis, sans rien recopier :

```
node tools/rea/capturer-fidelix.mjs --preflight --manifeste 01_REA_Fidelix/_captures/cibles-auth.json
```

Attendu au succès : `auth présente` + `session ACTIVE` (exit 0). C'est seulement
là que S2 devient licite. Aucun identifiant ne transite par le chat ni par un
fichier ; la session reste dans `.profil-rea/` (gitignoré).

