# 🧠 LESSONS LEARNED — Fidelix (REA)

> Uniquement des leçons **mesurées dans ce projet**. Chaque règle porte sa preuve.

## 1. Ce que la cible laisse voir sans session (et pourquoi c'est beaucoup)

- **Next.js App Router nomme ses chunks par route** : `app/(dashboard)/layout-*.js`,
  `app/(admin)/layout-*.js`, `app/(auth)/login/page-*.js`. Le **graphe de routes
  privées se lit donc dans des fichiers publics**.
  → Preuve : `raw/assets/_next_static_chunks_app__dashboard__layout-aa8914c1bd963665.js`
  contient `Programme`, `Clients`, `Scanner un client`, `Avis Google`, `Messages`,
  `Points de vente`, `Apparence`, `Console Admin`, `Fidelia AI`, `Rythme de paiement`.
- Le layout privé est **servi publiquement dès qu'une page publique le référence**
  (cas mesuré : `/login` le charge). Ne pas conclure « page privée ⇒ asset privé ».
- **Toujours partir des deux documents officiels** : `robots.txt` donne les zones
  interdites d'index (donc les modules réels), `sitemap.xml` donne le public.
  Preuve : 7 `Disallow` → `/admin`, `/caisse`, `/dashboard`, `/onboarding`,
  `/api/`, `/card/`, `/r/`.

## 2. Oracle de routes (transposé d'Onify, vérifié ici)

`GET` anonyme : `200` = public · `307 → /login` = **existe sous garde** ·
`404` = inexistante · `401` = API gardée **aveugle au chemin** (toutes les routes
`/api/*` répondent 401, y compris inventées : on ne peut donc PAS énumérer l'API
par statut — seulement par les littéraux du bundle).

## 3. Mesures qui ont évité une erreur

- **`/dashboard` n'est pas un 200 anonyme** : 307. Un crawl naïf conclurait
  « page absente ». Le 307 **est** la preuve d'existence.
- **`/ar` rend 13 364 caractères arabes mais déclare `lang="fr"`** (12/12 pages
  capturées). Anomalie réelle à reproduire ou à corriger — **décision produit,
  pas bug de mesure**.
- **`/recompenses/<slug>` = 27 commerces publics**, chacun avec son menu de paliers.
  Ce n'est pas une page marketing : c'est la vue client du programme.
- **Deux PWA distinctes** : `/manifest.webmanifest` (scope `/`) et
  `/caisse/manifest.webmanifest` (scope `/caisse`). La caisse est une **application
  autonome**, pas un onglet du dashboard.
- **`fidelix_caisse_devise`** (devise) + « Solde au dernier passage — hors ligne »
  ⇒ le POS gère un **mode hors ligne** avec file d'envoi (« en attente d'envoi »).
  C'est un module à part entière, pas un détail.

## 4. Pièges d'outillage (rejoués, donc notés)

- **`insert_line: N` insère AVANT la ligne N.** J'ai inséré une section au milieu
  d'une fonction (`inventaire`) : `lireManifeste is not defined` au premier run.
  → Ancrer sur `old_text`/`new_text`, puis **`node --check`** avant d'exécuter.
- **Les commandes d'un même lot tournent en parallèle.** Un `mkdir && curl` suivi
  d'un `grep` sur le fichier produit a échoué (`No such file or directory`).
  → Chaîner avec `&&`/`;` **dans la même chaîne** dès qu'il y a dépendance.
- **BSD `grep` (macOS)** : pas de `-P`, et une classe `[a-z-]` en fin de motif
  déclenche `invalid character range`. → Utiliser Python pour les extractions
  structurées, `grep -E` pour les littéraux.
- **Corps des sondes à conserver.** Mesuré sur `/card/test` (404 Vercel) : un
  tirage donnait **23 975 o** puis **23 932 o** (43 octets d'écart) ; un autre
  donnait **23 975 o des deux côtés mais un SHA-256 différent**. Autrement dit le
  404 porte un identifiant de requête **tantôt de longueur variable, tantôt de
  longueur fixe**. Sans le corps sur disque, ces deux cas étaient indiscernables.
  → `raw/sondes/` existe pour ça, et `--verifier` doit toujours nommer la cible
  qui diverge (ici : une page d'erreur, jamais une page métier).

## 5. Stabilité des empreintes (différence majeure avec Onify)

- Onify : CSRF neuf à chaque requête ⇒ empreinte brute inutilisable, normalisation
  obligatoire.
- **Fidelix : 40/40 cibles byte-stables** sur la passe 2026-10-26 (aucune
  normalisation déclenchée, `normalisations = 0`). Le HTML Next.js est **déterministe** ;
  seul le 404 de Vercel dérive parfois.
  → Conséquence : `--verifier` est un contrôle **strict** ici, et c'est un atout
  pour la recette de fidélité (un octet qui change = un changement réel).

## 6. Sécurité & déontologie du REA

- **Aucune écriture** : pas de POST, pas de création de compte, pas de scan réel.
  Les 12 routes gardées sont **sondées en GET** uniquement.
- La clé `anon` Supabase est publique **par conception**, mais elle n'autorise pas
  à lire les données d'autrui (RLS). → Ne pas l'utiliser pour interroger la base ;
  documenter sa présence, pas sa valeur.
- Ce qui n'est pas capturé n'est **pas** décrit. Les 12 modules gardés sont listés
  avec leur statut « contenu non observé », jamais avec un contenu inventé.

## 7. Piège majeur : le `307 → /login` ne prouve RIEN (mesuré 2026-10-26)

Le middleware de Fidelix applique un **garde catch-all** : il ne filtre pas une
liste de routes, il intercepte *tout* ce qui n'est pas public.

Preuve par l'absurde — 16 chemins sondés en anonyme, dont trois noms **inventés** :

| Chemin | Statut |
|---|---|
| `/dashboard`, `/program`, `/rewards`, `/admin`, `/loyalty` | `307 → /login` |
| `/menu`, `/staff`, `/integrations` (inventés) | `307 → /login` |
| `/caisse/login` (sous `/caisse`, hors matcher) | `404` |

→ **Un 307 anonyme est compatible avec « route inexistante »**. Il ne faut donc
jamais l'écrire comme une preuve d'existence : tout au plus comme « protégé par
un garde global ». Seuls **200** et **404 obtenus AVEC session** discriminent.

Corollaire de méthode : `/account` et `/abonnement`, présents dans le backlog
sans source, sont marqués `hypothese` dans `cibles-auth.json`. Le premier statut
avec session les confirmera ou les réfutera — dans les deux cas, c'est une
mesure, pas une croyance.

## 8. Ne jamais accepter d'identifiants, même proposés

Un mot de passe collé dans un chat est **irrécupérable** : il reste dans
l'historique de conversation, les journaux, et les sauvegardes. Le changer après
coup est une mitigation, pas une annulation.

→ Protocole retenu : `tools/rea/ouvrir-session.mjs` ouvre une fenêtre dédiée ;
**l'utilisateur** y saisit ses identifiants. L'agent n'inspecte pas le
formulaire, ne journalise rien, et ne lit l'état de session qu'indirectement
(`/api/me`). La session vit dans un profil local gitignoré.

## 9. Un ledger « authentifié » doit être impossible à falsifier par accident

Ajouter `modeAttendu` au manifeste transforme une erreur de manipulation en
**refus explicite** : sans session, la capture sort en code 2 *avant* d'écrire.
Sans ce garde, une passe anonyme produirait 15 fichiers nommés `a01-dashboard.png`
contenant la page de connexion — exactement le genre de preuve qui pourrit un
dossier d'analyse des mois plus tard.

Même logique côté rendu : une cible qui atterrit sur `/login` est **rejetée**,
comptée dans `rejetees`, et aucun fichier n'est écrit pour elle.

## 10. Un cookie présent n'est pas une session vivante (mesuré 2026-10-26, 23:35)

Le brief annonçait « session active » ; la mesure a dit le contraire, trois fois :
`.env` absent, `sqlite3 Cookies` du profil = **0 cookie**, aucun écouteur sur
`9222`. `/api/me` → `401`, `/dashboard` → `307 → /login`. Rien n'a été capturé —
et c'est la bonne issue, parce que le garde `modeAttendu` l'a rendu impossible.

Trois défauts d'outillage sont apparus **en lisant le code, pas en le supposant** :

1. **Le mode était déduit de la *présence* de `FIDELIX_COOKIE`, jamais de sa
   validité.** Un cookie expiré aurait donc produit un ledger étiqueté
   `AUTHENTIFIÉ` rempli de pages `/login` — exactement la fausse preuve que le
   garde n°1 prétendait interdire. Corrigé par deux ajouts : contrôle
   `/api/me === 200` **avant la première écriture**, et rejet par cible
   (`refuses[]` dans le ledger) quand une page atterrit sur `/login`.
2. **Le pont profil → HTTP manquait.** `ouvrir-session.mjs` (voie 1) persiste la
   session dans `.profil-rea/`, mais `capturer-fidelix.mjs`, qui produit les
   empreintes, ne lisait que `.env`. Une connexion humaine réussie aurait donc
   encore affiché « session ABSENTE ». Corrigé par `tools/rea/session.mjs` :
   une seule règle de priorité (`--profil` > `.env` > `.profil-rea` si jeton
   d'auth > anonyme), journalisée à chaque exécution.
3. **`context.addCookies()` exige `url` OU `domain`+`path`.** La copie locale du
   parseur, dans `capturer-rendu.mjs`, ne posait **pas** `domain` : la voie
   `FIDELIX_COOKIE` du rendu n'injectait probablement rien, silencieusement.
   Vérifié depuis par un aller-retour réel (`addCookies` → `context.cookies` :
   `sb-x-auth-token@fidelix.ma`). Une seule implémentation désormais, partagée.

Détail qui compte : le profil contient des cookies **sans** jeton d'auth
(`lswt-*`, télémétrie). Les injecter « parce qu'ils existent » aurait fabriqué
un mode authentifié fantôme. La règle ne prend donc le profil que si
`sb-<ref>-auth-token` (ou son découpage `.0`) est présent.

Non-régression mesurée après ces changements : `--verifier` → **1 divergence
sur 90**, la même qu'avant et la seule documentée (`/card/test`, 404 Vercel au
corps variable). Aucune page métier ne bouge.

## 11. Une preuve se re-vérifie dans le mode où elle a été prise

`--verifier` résout maintenant la session en s'alignant sur `ledger.mode` :
un ledger `ANONYME` est re-vérifié **sans** cookie, même si une session traîne
sur la machine. Sinon on comparerait un HTML anonyme à un HTML authentifié et
tous les écarts seraient des artefacts de méthode, pas des changements du site.

## 12. Une session se re-mesure à chaque reprise — et le message doit dire *pourquoi* (2026-10-26, 23:48)

Deuxième reprise, même brief optimiste, même issue. Le préflight rejoué donne :

```
Session     : profil par défaut …/.profil-rea — aucun cookie d'auth
Mode local  : ANONYME
GET /api/me    : HTTP 401
GET /dashboard : HTTP 307 -> /login
VERDICT : session ABSENTE        (exit 1)
```

Ce qui compte ici n'est pas le verdict, c'est sa **formulation**. L'outil ne dit
pas « profil introuvable » (cas d'un chemin faux ou d'un profil verrouillé), il
dit « **aucun cookie d'auth** ». Les deux pannes se ressemblent à l'écran et
n'ont pas le même remède : la première est un bug d'orchestration, la seconde est
une absence d'action humaine. Un message qui les confond envoie chercher au
mauvais endroit.

Corollaire de séquence, lu dans le code et pas supposé : `ouvrir-session.mjs`
appelle `contexte.close()` **avant** de rendre la main (l. 82) ; le préflight
peut donc être lancé juste après, dans le même terminal, sans libérer de verrou à
la main.

État vérifié dans cette reprise, sans rien écrire : `01_REA_Fidelix/_captures/`
ne contient **que** `2026-10-26/` (passe anonyme) · `.env` absent · aucun
processus sur `.profil-rea` · **11/11** tests hors ligne · `git status FIDELIX`
→ une seule entrée `?? FIDELIX/`.


## 13. Un garde-fou qui se trompe toujours du même côté est un blocage déguisé (2026-10-26, 00:15)

La session a été ouverte par l'humain, et le préflight a **encore** répondu
`session ABSENTE`. À ce moment-là, deux faits mesurables coexistaient :

```
.profil-rea/Default/Cookies : 2 cookies sb-rozagopjfkkblyxtjdgw-auth-token.{0,1}
                              expiration 2027-11-30, 3 219 o + 435 o
clone du profil, headless   : GET /dashboard -> 200
                              page rendue = « impetus · Scanner un client · Clients
                              · Programme · Messages · Avis Google · Équipe ·
                              QR Code · Apparence · Se déconnecter »
préflight officiel          : GET /api/me -> 401 · GET /dashboard -> 307
                              VERDICT : session ABSENTE (exit 1)
```

La session existait. **C'est l'outil qui la refusait.** Deux défauts, tous deux
visibles à la seule lecture du code :

1. **`/api/me` ne peut pas répondre 200.** Table mesurée sur la production, mêmes
   en-têtes, deux états :

   | cible | anonyme | authentifié |
   |---|---|---|
   | `/api/me` | 401 | **404** |
   | `/dashboard` | 307 → /login | **200** |

   Or le préflight, le garde n°3 et `ouvrir-session.mjs --attendre` exigeaient
   tous `200` sur `/api/me`. Conséquences en chaîne : verdict `ABSENTE` même
   avec une session valide, passe authentifiée refusée avant écriture, et une
   fenêtre interactive qui **ne se fermait jamais** — elle attendait un 200
   impossible. Le `--attendre 1800` a tourné 30 min pour rien.

   Le piège était déjà écrit noir sur blanc dans ce fichier (§2) : « toutes les
   routes `/api/*` répondent 401, **y compris inventées** ». Une route inventée
   ne peut pas être la sonde de la session ; on avait bâti le garde sur
   l'exception qui prouve la règle.

2. **`entetes(env, cookie)` ignorait son 2ᵉ argument.**
   ```js
   if (env.FIDELIX_COOKIE) h.Cookie = env.FIDELIX_COOKIE   // ← cookie ignoré
   ```
   `resoudreSession()` renvoyait bien le cookie du profil, il était bien passé en
   argument… et jeté. Le pont profil → HTTP annoncé en §10 n'existait qu'à
   moitié : « auth présente » s'affichait, puis **toutes** les requêtes partaient
   en anonyme. Mesure qui tranche : avec l'en-tête reconstruit à la main,
   `/dashboard` → **200**.

### La méthode qui a débloqué (et qui se rejoue)

Ne pas discuter avec l'outil : **cloner le profil et mesurer depuis un vrai
navigateur**, puis comparer avec la mesure HTTP.

```
cp -R FIDELIX/.profil-rea /tmp/fx-probe   # jamais le profil ouvert
rm -f /tmp/fx-probe/Singleton*
# puis, dans Playwright : goto /dashboard, page.request.get, fetch depuis la page
```

Ce protocole a donné trois choses qu'aucune déduction ne pouvait donner :

- la **table de statuts** anonyme/authentifié (elle est devenue un test) ;
- la preuve que la **valeur du cookie est bonne** (`base64-…`, pas d'encodage à
  faire : en-tête brut et URL-encodé donnent tous deux 200) ;
- la preuve que le problème était **l'en-tête**, pas la session.

### Trois règles qui en sortent

- **Une sonde de session doit être prouvée dans les deux états.** Un `200`
  observé une fois ne suffit pas ; il faut le couple `(anonyme, authentifié)`.
  Si l'un des deux n'a jamais été observé, c'est une hypothèse, pas un garde.
- **Un garde doit pouvoir réussir.** Un garde-fou dont l'état favorable n'a
  jamais été atteint ne protège rien : il bloque. Le test le plus utile n'est pas
  « refuse-t-il ce qui est faux ? » mais « **accepte-t-il ce qui est vrai ?** ».
- **`405` est une preuve d'existence.** Douze endpoints sondés en GET ont répondu
  405 (Method Not Allowed) : ils existent et n'acceptent que POST. À l'inverse,
  `404` sur `/account`, `/abonnement`, `/loyalty` **réfute** trois hypothèses que
  le corpus traitait comme plausibles.

### Une redirection n'est pas la page demandée

Mesuré avec ce compte : `/admin` → `307 /dashboard` (rôle insuffisant) et
`/onboarding` → `307 /dashboard` (déjà onboardé). Le garde ne rejetait que
`/login` : la première passe **rendue** a donc écrit `a11-admin.html`,
`a11-admin.png`, et les mêmes pour `a12-onboarding` — contenant le dashboard.
Six fichiers, une preuve fausse, produite par un outil « prudent ».

Règle désormais appliquée aux deux captures : **si la route finale diffère de la
route demandée, rien n'est écrit**, et le refus est nommé dans `refuses[]` avec
la destination. `/login` n'est plus qu'un cas particulier.

### Note de harnais (rejouée deux fois)

Les processus lancés avec `nohup … &` (même `disown`) **meurent** entre deux
appels d'outil : le terminal est réinitialisé, le groupe est tué. Pour une
fenêtre qui doit survivre à l'appel, `launchctl submit` fonctionne — à condition
de donner le **chemin absolu** de `node` (PATH minimal, sinon `exit 127`) :

```
launchctl submit -l fidelix-session -- /usr/bin/env \
  PATH=$HOME/.nvm/versions/node/v22.23.3/bin:/usr/bin:/bin HOME=$HOME \
  node "$PWD/tools/rea/ouvrir-session.mjs" --attendre 1800
launchctl remove fidelix-session    # pour libérer le profil
```

## 14. Une empreinte d'octets n'est pas un test de stabilité (mesuré 2026-10-27, S3)

**Le fait.** `/equipe` a servi **3 formes d'octets** en 6 tirages : 73 865 o ×4,
73 865 o ×1 avec un autre graphe de composants, 73 908 o ×1. La divergence
commence toujours à l'octet **60291** — `21:I[14586,[…chunk 44530001…]]` vs
`21:I[34766,[…chunk 9779…]]` — et court sur ~13,4 Ko (la table de références de
composants clients de la charge RSC). `/billing` a servi une forme transitoire en
cours de mesure, puis **10 tirages consécutifs identiques**. Ce n'est donc pas
une propriété d'une page : c'est le déploiement ou l'instance edge.

**Ce qui ne diffère PAS.** Titre, texte visible (770 o), 18 hrefs, 17 chunks :
**un seul contenu** pour toutes les formes (mesuré sur 4 tirages indépendants).
Conclusion opérationnelle : l'octet dit *ce qui a été servi à l'instant T* ;
le contenu dit *ce que la page est*.

**La règle adoptée (deux étages).**
1. `raw/` archive les octets **tels quels** — c'est la preuve de ce qui a été servi.
2. `sha256Contenu` = sha256(titre + texte visible + liens triés) est **l'invariant
   que `--verifier` compare**. Un libellé, un prix (`150 MAD` → `99 MAD`) ou un
   lien qui change le fait échouer : c'est un test strict, pas un contournement.
3. Une cible qui altère ses octets de façon mesurée déclare `variantes: N` ;
   les formes distinctes sont archivées et `--verifier` les nomme
   (« forme 2/2 », « forme NOUVELLE »). Aucune n'est présentée comme « la » bonne.

**Preuve d'exécution** : `--verifier` sur la passe S3 → **109/109 STABLE,
0 divergence**, avec `/equipe` en « contenu identique, forme d'octets NOUVELLE ».

**Pièges d'outillage payés dans cette session** (tous mesurés, tous corrigés) :
- **Un regex peut ne jamais rendre la main.** `(\d+):I\[\d+,\[(?:[^\[\]]|\\.)*\]\]`
  sur 74 Ko : backtracking catastrophique, processus suspendu > 5 min. Remplacé
  par un parcours linéaire (`zonesDivergence`) et un test de garde (< 2 s).
- **Un diff ligne à ligne est aveugle sur du HTML minifié** : la page tient sur
  UNE ligne, donc il répond « ligne 1 » — exact et inutilisable. Deux mesures ont
  conclu « identique » à tort. Il faut localiser au **caractère**.
- **`--diag` à 2 tirages ne voit pas une page bimodale.** Deux tirages ont
  répondu « identique » juste après une mesure montrant 2 formes. D'où
  `--diag <chemin> --tirages 6`.
- **La page capturée se « découvre » elle-même** : la requête `document` pointe
  vers l'URL demandée, donc `/abonnement` (404) se comptait comme « vu » et
  validait sa propre hypothèse. Les auto-références sont exclues.
- **Un refus déclaré n'est pas un échec** : `/admin`, `/onboarding` et `/` (307 →
  `/dashboard`) faisaient sortir la passe en code 1, donc un code rouge
  permanent qui ne signale plus rien. `refusAttendu` + `conforme` : la passe sort
  en 0, et un refus *imprévu* reste une alarme.


## 15. Une capture authentifiée contient les données de clients réels (2026-10-27)

**Mesuré, pas supposé.** Dans la passe S3, deux fichiers archivés portent des
données d'exploitation d'un commerce réel :

- `raw/sondes/b06-api-scan-cards.html` →
  `{"cartes":[{"id":"b45ce175-…","codeClient":"C-CR7QZX","solde":8…}]}`
- `raw/pages/a01-dashboard.html` → la liste « Meilleurs clients » (noms,
  classement), et `a16-billing.html` → les montants de l'abonnement.

Or le remote est **GitHub** (`DEVSFAME/UNICITY`) et `_captures/` n'était pas
ignoré : un `git add` aurait publié les données d'un vrai commerce.

**Règle.** `FIDELIX/01_REA_Fidelix/_captures/**` est **hors versionnement**, y
compris le `manifeste.json` — son champ `apercu` recopie 160 octets de chaque
sonde, donc des identifiants réels. Seule exception, les **manifestes de
cibles** (`cibles-*.json`) : chemins, UUID synthétiques et motifs, aucune donnée.
Ce qui doit rester lisible sans les fichiers bruts vit dans `PROGRESS.md`,
`tasks/active_context.md`, `lesson-learned.md` et les manifestes.

**Conséquence de méthode.** Avant d'écrire un nouveau type de preuve, se
demander *qui la lira* : un ledger destiné à être commité ne doit pas embarquer
de corps de réponse. Ici la preuve reste locale, et c'est la **mesure** qui est
recopiée dans la documentation, pas la donnée.

**Découverte de contenu au passage.** Le dashboard rend un lien dur
`<a href="/customers/<uuid>">` ; le GET direct répond un **404 Next nu**
(« Page introuvable — Fidelix », 38 158 o, 4 liens) alors que les 404 de routes
inexistantes rendent la page du site (38 259 o, 7 liens, « Ce lien n'existe pas
ou plus »). Les chunks de build tranchent : `(dashboard)/customers/page-*.js`
existe, **aucun `customers/[id]/page-*.js`**. Le lien est **mort** — deux mesures
indépendantes. À signaler au client, et à ne pas confondre avec une route
protégée.


## 16. Un identifiant synthétique prouve le 404 de l'identifiant, pas l'absence de route (2026-10-27)

**Ce qui avait été conclu.** S3 a sondé `/customers/00000000-0000-4000-8000-000000000000`
— un UUID **nul, choisi exprès** pour ne pas archiver la fiche d'un client réel —
a reçu un **404 Next nu**, et a écrit « lien mort (probable) », en s'appuyant en
plus sur l'absence de chunk `customers/[id]/page-*.js`.

**Ce que la mesure d'A1 dit.** Avec l'UUID **réel** lu dans le lien :

| Cible | Statut | Taille | Liens |
|---|---|---|---|
| `/customers/<uuid réel>` | **200** | 92 595 o | 21 |
| `/customers/00000000-…` | 404 | 38 069 o | 0 |
| `/clients-inexistant-rea` | 404 | 38 186 o | 1 |

Et un clic réel ouvre la fiche ; un `reload` sert la même vue.

**L'erreur de raisonnement, nommée.** Un 404 sur une route **paramétrée** peut
signifier trois choses — route absente, identifiant inconnu, ressource refusée —
et un identifiant **fabriqué** ne peut produire que les deux dernières. Le
manifeste S3 le disait noir sur blanc (« un 404 avec cet identifiant signifie
“client inconnu”, PAS “route absente” ») ; c'est le **commentaire** qui a écrasé
le manifeste. Une preuve peut être juste et sa légende fausse.

**Règles qui en sortent.**
1. Sur une route paramétrée, **ne jamais** conclure « route absente » depuis un
   identifiant synthétique : il faut le **contraste** (id réel / id nul / route
   inconnue) — trois GET, pas un.
2. L'absence de chunk `page-*.js` ne prouve rien : une vue peut être rendue par
   un composant client partagé.
3. Le clic doit être un **geste** : si la cible a une boîte `0×0` (ici, un
   `<details>` replié), on ouvre le `<summary>`. `force: true` aurait cliqué dans
   le vide et « prouvé » l'absence.

## 17. Trois instruments qui mentent d'un seul côté — mesurés le 2026-10-27

Tous les trois auraient produit une conclusion fausse **sans jamais échouer**.

1. **« Session ACTIVE » ne dit pas « jeton valide ».** `/dashboard` répondait
   **200** (le middleware rafraîchit côté serveur) alors que l'`access_token` du
   cookie était **expiré de 22 min** : PostgREST répondait `PGRST303 JWT expired`
   sur **toutes** les tables. Sans vérifier `exp`, on aurait écrit « le modèle est
   inaccessible ». Remède : décoder le JWT, comparer `exp`, et **rafraîchir par un
   GET** de la sonde (l'application réécrit ses cookies). Refuser d'écrire si le
   jeton reste expiré.
2. **La racine OpenAPI est fermée** : `401 — Only the service_role API key can be
   used for this endpoint`. Ce n'est pas une panne, c'est une **politique**.
   Conséquence : les colonnes ne viennent que des **lignes renvoyées** ; une table
   vide n'a pas de colonnes observables, et on l'écrit ainsi.
3. **Une sonde peut ne rien discriminer.** `GET /rest/v1/rpc/<nom>` répond
   `PGRST202 … without parameters` — **identique pour un nom inventé**. Sans
   **témoin négatif**, on aurait listé six RPC « existantes » sur la foi d'une
   réponse qui ne distingue rien. Le témoin est devenu une ligne du protocole.

**Bonus, même famille.** Après le clic, un `fetch(location.href)` a répondu
**200** là où le document était un 404 : la page est sous **service worker**.
Un statut obtenu par `fetch` dans une page contrôlée par un SW n'est pas une
preuve de ce que le serveur sert. Ce qui a tranché : le **titre**, la **taille du
texte**, le **nombre de liens**, et un GET **hors navigateur** avec le même cookie.

**Formulation à garder** : un instrument qui se trompe toujours du même côté est
indiscernable d'un fait. On le calibre avec un cas dont on connaît la réponse —
un nom inventé, un UUID nul, une route qui n'existe pas.



## 18. Un chiffre obtenu par une sonde est un plancher, pas un inventaire (2026-10-27, A2)

**Ce qui avait été écrit.** « 12 endpoints prouvés POST-only (405). » C'était
exact — et c'était devenu, en trois reprises de brief, « **les** 12 endpoints
POST » de l'application.

**Ce que la mesure dit.** Les 65 bundles capturés déclarent **28** endpoints
POST. Onze seulement recoupent les douze. Dix-sept n'avaient **jamais été
sondés** : ils ne pouvaient donc pas apparaître. Symétriquement,
`/api/demarrer` est prouvé POST par son 405 mais n'existe dans aucun bundle de
ce corpus.

**L'erreur, nommée.** Un 405 dit « cette route existe et n'accepte pas GET ».
Il ne dit rien des routes qu'on n'a pas essayées. Un **résultat de sonde** est
borné par **la liste des cibles** ; il ne peut pas être un inventaire. Le
glissement s'est fait sans erreur de mesure — seulement en changeant un article
défini (« les ») à la place d'un partitif (« celles qu'on a sondées »).

**Règles qui en sortent.**
1. Un décompte issu d'une sonde se cite **avec son domaine** : « les 12
   endpoints *sondés* en 405 », jamais « les 12 endpoints POST ».
2. Quand deux sources de cardinalité coexistent (réponse serveur, code client),
   publier **les deux et leur intersection**. C'est le tableau §1, et il dit
   plus que n'importe lequel des deux chiffres seul.
3. Une source qui décrit **le code** est plus complète qu'une sonde, mais elle
   ne prouve pas l'existence côté serveur : `/api/broadcast` existe dans le
   code et répond 404. Les deux sources sont nécessaires.

### 18.1 Corollaire : un mot-clé n'est pas un sujet

Deux comptages ont failli produire une conclusion fausse **le même jour** :

- `method:"POST"` → **37 occurrences**, dont **7 dans supabase-js** (`.insert()`,
  realtime, Iceberg) et **4 dans un manifeste** de garde Next. Ce ne sont pas
  des contrats : c'est le **site d'appel** qui fait le contrat, pas le verbe.
- `wallet` → **30 occurrences**, dont **26 dans supabase `auth-js`**
  (`signInWithWeb3`, wallets Ethereum/Solana). J'ai d'abord écrit « aucun
  endpoint wallet » ; la mesure a dit **« aucun endpoint de *génération de
  pass* »**, plus un champ `wallet_bg_url` et une phrase d'interface. La
  première formulation était fausse par excès, la seconde par défaut.

**Formulation à garder** : avant de compter, décider **à quoi** appartient
l'occurrence. Un comptage sans classement d'origine n'est pas une mesure, c'est
une impression chiffrée.

### 18.2 Et un bug d'instrument qui se taisait

`lireObjet` commençait à balayer **sur** l'accolade ouvrante : elle était donc
comptée une fois de trop, la profondeur ne revenait jamais à zéro, et **aucun
corps n'était extrait** — sans erreur, sans message. Le symptôme n'était pas
« ça plante », c'était « `—` partout », ce qui ressemble à « il n'y a pas de
corps ». Ce qui l'a révélé : un témoin dont la réponse était connue
(`/api/notifications` **a** un corps, on l'a lu à la main). Sans ce témoin, le
rapport aurait conclu « 28 endpoints sans corps » et personne n'aurait vu
l'erreur.

Troisième occurrence du même motif (une URL choisie par ternaire perdait deux
endpoints) : **c'est le test écrit après coup qui a trouvé les trois**. Pas la
relecture.

## 19. Chercher où l'action se fait, pas où on la regarde (2026-10-27, A3)

**Ce qui avait été conclu, deux fois.** A2 : « aucun endpoint de génération de
pass », après avoir classé 30 occurrences de `wallet` dont 26 dans supabase
`auth-js`. La conclusion était **juste sur son domaine** — les 65 bundles du
dashboard — et **fausse sur l'application**.

**Ce que la mesure dit.** Le dashboard ne s'installe pas de carte dans un
téléphone ; le client final le fait. Le chemin, mesuré :

```
/join/<slug> → rpc("join_loyalty_program") → router.push("/card/<id>")
             → /card/<cardId> (public, 200 sans cookie)
             → window.location.href = "/api/wallet/{apple,google}/<cardId>"
```

Trois routes, deux genres, une asymétrie :

| Route | Genre | Réponse |
|---|---|---|
| `/api/wallet/apple/<id>` | navigation (`location.href=`) | le pass |
| `/api/wallet/google/<id>` | navigation | redirection d'ajout |
| `/api/wallet/apple/<id>/statut` | `fetch(…,{cache:"no-store"})` | `{ajoutee:bool}` |
| `/api/wallet/google/<id>/statut` | *n'existe pas* (404 mesuré) | — |

**L'erreur de méthode, nommée.** « Absent du corpus » et « absent de
l'application » ne sont pas la même phrase. Le corpus S3 était **le corpus du
commerçant** ; le wallet appartient au **client final**. Aucune quantité de
relecture des 65 mêmes bundles ne pouvait le faire apparaître — il fallait
**changer de client**, pas mieux chercher.

**Règle qui en sort.** Avant de conclure « l'application ne fait pas X »,
demander **qui fait X** : quel rôle, quel parcours, quelle page. Si la réponse
n'est pas dans le corpus, ce n'est pas une absence, c'est une **lacune de
corpus** — et elle se comble par une capture, pas par une déduction.

### 19.1 `OPTIONS` prouve une route sans en déclencher une — à condition de calibrer dans la bonne arborescence

Générer un pass n'est pas une lecture. `OPTIONS` n'exécute pas le handler
`GET` : c'est l'instrument idéal. Il mentait quand même :

| Cible | `OPTIONS` |
|---|---|
| `/api/commerce/actif` (existe) | **401** |
| `/api/zzz-temoin-rea-inexistant` (n'existe pas) | **401** |
| `/api/wallet/zzz-inexistant` | 404 |
| `/api/wallet/apple/<uuid>` | **204 + `Allow: GET, HEAD, OPTIONS`** |

Sous `/api/` — **hors `/api/wallet`** — le **middleware** répond avant le
routeur : le statut ne distingue plus rien. Le témoin négatif a évité la
conclusion « `/api/commerce/actif` n'existe pas ». Et le contraste utile n'est
pas le 204 seul, c'est le **204 là où les autres routes testées répondent
401** : ces routes sont **hors middleware**, donc publiques. Un troisième
indice confirme la frontière : `/api/wallet/zzz-inexistant` répond **404**, pas
401 — une route inexistante **dans** la sous-arborescence publique.

**Corollaire.** Le 204 ne dépend pas de l'identifiant : un UUID nul donne le
même 204. `OPTIONS` prouve la **route**, jamais la **ressource** — exactement
la distinction du §16, transposée à une autre méthode.

### 19.2 Une lecture peut ne rien valider

`GET /api/wallet/apple/<uuid>/statut` répond **200 `{ajoutee:false}` pour un
UUID qui n'existe pas**. Donc `false` ne signifie pas « carte inconnue » : c'est
un endpoint qui répond à la question posée sans vérifier l'identifiant. Utile à
savoir pour deux raisons : on ne peut pas s'en servir comme test d'existence, et
un clone qui validerait l'identifiant **changerait** le comportement.

### 19.3 Un chiffre hérité n'est pas un chiffre mesuré

A2 écrivait « 26 occurrences dans auth-js ». La mesure en donne **20**. Les deux
chiffres venaient de la même personne, à deux jours d'intervalle. Un total
recopié de mémoire dans trois briefs successifs devient un fait — sans qu'aucune
mesure ne l'ait jamais dit. **Re-mesurer avant de citer.**

Le total, lui, ne veut rien dire sans règle de comptage : `wallet` est contenu
dans `wallet_bg_url`, `walletEnabled`, `Apple Wallet` et `/api/wallet/`.
Compter chaque jeton séparément donnait un nombre plus gros et plus faux. La
règle retenue — **un relevé = le jeton le plus long qui couvre la position** —
donne **72** sur trois corpus, et les 3 routes n'apparaissent que dans le
troisième.

### 19.4 Deux bugs d'instrument, tous les deux silencieux

1. **`break` au lieu de `continue`.** Quand l'extension d'un jeton vers la
   gauche sortait du fichier (`debut < 0`), la boucle **abandonnait le jeton**
   au lieu d'essayer une extension plus courte. Conséquence : **toutes les
   occurrences situées dans les 13 premiers caractères d'un fichier étaient
   perdues**, sans erreur. C'est le test unitaire qui l'a trouvé, pas la
   relecture — et pas le rapport, qui affichait des totaux plausibles.
2. **Un témoin en UTF-8 ne matche pas un bundle minifié.** `Ajouter à Apple
   Wallet` dans le source, `Ajouter \xe0 Apple Wallet` dans le fichier. Le
   témoin échouait, donc la calibration criait « écart » alors que le corpus
   allait bien. Un témoin doit être écrit **exactement comme le corpus écrit**,
   pas comme le produit s'affiche.

**Formulation à garder** : un compteur silencieux et un compteur juste se
ressemblent. Ce qui les sépare est un **cas dont on connaît la réponse** —
encore et toujours le même remède, depuis le §17.

## 20. Un nom de fichier n'est pas un propriétaire de code (2026-10-27, A4)

**La demande.** « Mesure la file hors ligne de la caisse **dans le bundle
`app/caisse/page`** ». La demande était raisonnable, l'endroit était faux.

**Ce que la mesure dit.** `app/caisse/page-*.js` = **6 464 octets, 5 modules,
0 jeton de file**. Il contient le ré-export de `next/navigation`, une icône, les
aides du bonus d'avis, et un composant qui rend **« Avis à valider »** — c'est
`/api/reviews/claims`, pas la caisse. La file, elle, vit dans le chunk `6866`
(35 653 o, 43 occurrences) que ce bundle déclare en dépendance :

```js
e.O(0,[…,4008,6866,2128,…],()=>e(e.s=88173))
```

**L'erreur, nommée.** Next nomme un chunk d'après la route qui l'a fait
**extraire**, pas d'après le code qu'il contient. Un lecteur qui prend le nom
pour un propriétaire conclut « il n'y a pas de file » — et le chiffre est
plausible : le fichier existe, il est petit, il ne dit rien du sujet.

**Règle qui en sort.** Avant de conclure à une absence, chercher le jeton dans
**tout le corpus** et *puis* regarder quels fichiers le portent, et **quelles
pages chargent ces fichiers**. Ici : 1 page sur 21. La mesure « propriétaire »
n'est pas le nom, c'est le graphe de dépendances.

### 20.1 Une clé de stockage n'est pas un contrat réseau — et un mot n'est pas un jeton

La consigne était explicite ; la mesure a montré pourquoi elle devait l'être.
Trois faux positifs, tous apparus **en écrivant l'instrument**, aucun à la
relecture :

| Jeton | Occurrences | Dont le sujet | Décision |
|---|---:|---:|---|
| `cartes` | 8 | **2** | jeton **retiré** — c'est du français |
| `tentatives` | 5 | **4** | prose si dans une chaîne, champ sinon |
| `new Set([1,2,3])` | 1 | **0** | écarté — un rejeu ne jette que des codes HTTP |

Le troisième est le plus instructif : `polyfills-*.js` contient
`new Set([1,2,3])`, et le relevé y annonçait **une politique de rejeu**. Le
garde n'est pas « ça ressemble à un Set », c'est « toutes les valeurs sont dans
400–599 ». Même famille exactement que les 7 `method:"POST"` de supabase-js en
A2 : *une forme sans domaine n'est pas une preuve*.

**Formulation à garder** : un jeton qui ne discrimine pas n'est pas un jeton.
Le retirer n'appauvrit pas le relevé — il le rend vrai. Et un mot-clé présent
dans une chaîne est de la **prose** ; dans du code, un identifiant.

### 20.2 `\xe9` n'est pas un octet : c'est une échappement de caractère

Le §19.4 disait « un témoin en UTF-8 ne matche pas un bundle minifié ». La
raison exacte, mesurée ici : `\xNN` est une **échappement JavaScript**
(`U+00NN`), pas une séquence d'octets. Décoder les octets — la première version
de `decoderEchappements` — rend `U+FFFD` pour tout accent, parce que `0xE9` seul
n'est pas de l'UTF-8 valide.

Conséquences, contre-intuitives :

- `\xe9` → « é » (un caractère) ; `\xc3\xa9` → « Ã© » (deux caractères). Le
  recoller serait une interprétation d'octets, pas du JavaScript.
- le même fichier mélange les deux écritures : accents en `\xNN`, tiret cadratin
  **littéral** en UTF-8. D'où **35 653 octets pour 35 632 caractères** — 21
  octets de surplus, exactement les caractères non-ASCII écrits en clair.

**Règle qui en sort.** Avant d'écrire un témoin, décoder le corpus avec la
**sémantique du langage**, pas avec celle du fichier. `String.fromCharCode` pour
`\xNN`, et un test qui vérifie qu'un accent fait **un** caractère.

### 20.3 Trois issues, et le mot « bloqué » qui n'abandonne rien

La politique se lit en quatre lignes et se raconte mal :

```
ok                       → retiré
statut ∈ {400,403,404,422} → JETÉ  (ecartees, cumulé)
tout le reste            → conservé, tentatives+1, break
exception réseau         → conservé, tentatives INCHANGÉ
```

Ce que le vocabulaire de l'interface cache :

1. **« Bloqué » (≥3) n'est qu'un compteur.** `X()` compte, il ne filtre pas ; le
   cycle suivant relit `getAll()` et réessaie **indéfiniment**. « Bloqué » veut
   dire « signalé », pas « abandonné ».
2. **Une panne réseau n'incrémente rien** — seuls les statuts comptent. Donc
   « 3 tentatives » mesure des **réponses**, jamais des coupures.
3. **Le rejeu ne traite pas le 401**, alors que l'appel direct redirige vers
   `/caisse`. Une caisse révoquée accumule donc des opérations en silence.

**Formulation à garder** : trois issues (envoyer / jeter / conserver), deux
compteurs, et un mot d'interface qui ne distingue pas les deux. Un clone qui
fusionne « refusée » et « pas encore enregistrée » casse soit l'affichage, soit
les données.

### 20.4 Une clé d'idempotence générée au mauvais moment est décorative

A2 avait relevé le contrat : `client_operation_id` seulement pour
`add_stamp`/`earn_points`. A4 montre **quand** il est généré :

```js
let s = a ? crypto.randomUUID() : void 0;     // AVANT le fetch
try { fetch("/api/transaction", {…, client_operation_id: s}) }
catch { if (a) await A({ id: s, … }) }        // la file reprend LE MÊME id
```

La clé ne protège que parce qu'elle est créée **à l'enfilage** et rejouée
telle quelle. Un clone qui la génère au renvoi aurait l'air conforme au contrat
et reproduirait les doubles tampons que la clé existe pour empêcher. **Un champ
d'idempotence se juge à son cycle de vie, pas à sa présence dans un corps.**



## 21. Un garde qui ne peut pas échouer ne prouve rien (2026-10-28, A5)

**La demande.** « Mesure `/api/fidelia` dans les bundles du dashboard : prompt
système, entrées, sorties, garde-fous. »

**Ce que la mesure dit.** Il n'existe **aucun chunk `fidelia`** dans les 165
assets. Le contrat vit dans `_next_static_chunks_app__dashboard__layout`
(52 158 o), parce que l'assistant est monté **une fois dans la coquille** : le
bouton est sur 14 pages sans qu'aucune page ne le déclare. Troisième fois que le
nom du fichier ment sur son propriétaire (§20), et cette fois le nom ne contient
même pas le sujet.

**Ce qu'il n'y a pas.** Pas de prompt système client (0/11 marqueurs de modèle),
et **pas d'entrée** : `fetch("/api/fidelia")` a **un seul argument**. Pas de
`method`, pas de `body`, pas de `headers`. La « conversation » est une grille de
dix questions **déjà dans la réponse**, parcourue localement ; cliquer n'émet
aucune requête.

**Formulation à garder** : un contrat sans entrée n'a pas besoin d'être protégé
contre l'injection — il n'a pas de canal. « Fidelia AI » est une étiquette ; ce
qui est livré est un arbre de décision.

### 21.1 Un offset qui tombe après le guillemet

`litterauxApi` rend la position **du contenu** de la chaîne, pas celle du
guillemet. Comparer `source.slice(i - 48, i)` à `fetch(` échouait donc
**toujours** :

```js
fetch("/api/fidelia")
//    ^ i pointe ici — le caractère précédent est `"`, pas `(`
```

Résultat : les deux contrats, seuls `/api/*` du sujet, sortaient en « prose ».
Le relevé était complet et **faux**.

**Règle qui en sort.** Ne jamais raisonner sur `i` quand on veut un
**voisinage** : passer par `chaineContenant(source, i).debut`, et ancrer le
contexte sur la frontière de la chaîne. Et un test de régression qui vérifie
`s[i-1] === '"'` — pas `s[i-1] === '('`.

### 21.2 Modèle et flux : deux familles qu'on ne peut pas fusionner

La première liste de marqueurs mélangeait `systemPrompt`, `openai`,
`temperature` avec `getReader()` et `text/event-stream`. Le relevé annonçait
alors « **2 marqueurs présents** » sous un titre disant « aucun client LLM » —
et les deux venaient de `7383` (diffusion) et `7631` (lecture de flux), deux
chunks qui n'ont rien à voir avec le sujet.

**Formulation à garder** : une API de transport n'est pas un modèle. Même
famille que les 7 `method:"POST"` de supabase-js (A2) et le `new Set([1,2,3])`
des polyfills (A4) : **une forme sans domaine n'est pas une preuve.** Séparer
les listes, et rendre les fichiers au lieu d'un booléen : « 2 marqueurs » ne dit
pas *où*, et c'est *où* qui tranche.

### 21.3 Trois copies, un propriétaire

Le même chunk est servi dans trois captures (`2026-10-26`,
`2026-10-26-auth`, `2026-10-27-auth-s3`). Compter les **chemins** donnait
« 3 porteurs du contrat », et faisait échouer la calibration sur un artefact de
**rangement**, pas sur une ambiguïté réelle.

**Règle qui en sort.** Un propriétaire se compte par **nom de fichier** ; trois
chemins du même nom sont trois copies. Et quand une calibration échoue, se
demander d'abord si c'est la cible ou **notre classement** qui est en cause.

### 21.4 Une porte n'est pas une absence

`donneesInsuffisantes: true` accompagne une réponse qui contient **les dix
réponses et les dix rebonds**. Ce n'est donc pas « pas de données » : c'est une
**décision d'affichage**. Conséquence mesurable, et non triviale : le seul lien
vers `/conseiller` (« Voir l'analyse complète ») est **à l'intérieur** du
panneau que ce drapeau masque → la page est inatteignable par aucun chemin de
l'interface capturée, alors que le code la nomme trois fois.

**Formulation à garder** : un booléen de sortie qui porte le nom d'un manque de
données peut n'être qu'un rideau. Le distinguer demande de lire **les deux
côtés** : le drapeau *et* le contenu qu'il masque. Un clone qui traite
`donneesInsuffisantes` comme « rien à dire » jetterait dix réponses rédigées.

### 21.5 Le garde qu'on croyait avoir

La règle « un libellé d'interface n'est pas un contrat » était **appliquée**
par `classerOrigine` (un libellé déclaré reste un libellé, quoi qu'il arrive) —
donc **invérifiable** : aucun corpus ne pouvait la faire échouer. Le
contre-témoin a échoué au premier run, et il avait raison.

La vérification a été rendue **falsifiable** : on ne teste plus le classement,
on teste la seule chose qui puisse contredire la **déclaration** — qu'un libellé
apparaisse en **argument de `fetch`**. Si c'est le cas, c'est notre table de
rôles qui est fausse.

**Formulation à garder** : un garde qui ne peut pas se déclencher ne prouve
rien ; il décore. Un test dont le résultat attendu est « rien » doit avoir un
**contre-témoin qui échoue** — sinon il ne mesure que sa propre tautologie.


## 22. Une base « vide » n'est pas une base sans modèle (2026-10-28, R0)

**La demande.** « La base est-elle vide ? » Sous-entendu : a-t-on seulement
commencé ? La mesure a répondu autre chose : **0 ligne, mais 3 tables, 5 + 6 + 7
colonnes et 2 fonctions** — un modèle complet, et **pas celui qu'on croyait
reconstruire**.

**Ce qui a tranché, et ce n'est pas un jugement.** Les longueurs déclarées :
`card_token` **64**, `first_name`/`last_name` **100**, `email` **255**,
`reward_label` **150**. Ce sont, une à une, celles du `CREATE TABLE` de
`conversation.md`. Plus `reward_label`, **absent** du `CREATE TABLE` initial et
**présent** en base : la trace de sa **seconde** migration. Plus deux fonctions
dont les paramètres sont identiques à ceux du DDL. Une ressemblance se discute ;
une **empreinte** se vérifie.

**Règle qui en sort.** Avant de demander « est-ce vide ? », demander **« de quoi
ce schéma est-il l'empreinte ? »** — longueurs déclarées, colonnes ajoutées
après coup, signatures de fonctions. Un schéma porte l'**historique** de ce qui
l'a créé, et c'est cet historique qui dit s'il sert le projet ou un autre.

### 22.1 `200` + `0 ligne` ne dit rien de la RLS

Les trois tables répondent `200` à la clé `anon`, avec `Content-Range: */0`.
Deux hypothèses produisent **exactement** cette observation :

| Hypothèse | Observation attendue |
|---|---|
| RLS active, aucune ligne | `200`, `[]` |
| RLS inactive, table vide | `200`, `[]` |

Ce qui **est** mesurable, en revanche : `anon` n'obtient **ni 401 ni 403**. Sur
la cible, `customers` répond **403 `42501`** — la table existe, le GRANT manque.
Ici, **200** : le GRANT existe. C'est un fait, et il est **différent** de « la
RLS est permissive ».

**Formulation à garder** : *l'issue* est mesurable, *la règle* ne l'est pas.
Écrire « RLS absente » parce qu'une table vide rend `[]` serait la même faute
que lire un `307 → /login` comme une absence de route (§7).

### 22.2 Un comparateur peut réclamer de créer ce qui n'existe pas

`comparerModele` comparait `tablesCible` à `tablesBase` sans distinguer **« pas
encore mesurée »** de **« mesurée absente »**. Résultat : `rewards` — dont la
cible a **prouvé** l'absence par un `PGRST205` — sortait dans
`tablesManquantes`. Le comparateur demandait donc de créer une table dont on
avait mesuré qu'elle n'existe pas.

C'est le prolongement exact du §18 : un chiffre obtenu par une sonde est un
plancher. Ici, une **absence** obtenue par un `404` doit devenir une **entrée du
modèle** (`etat: 'inexistante'`), pas un trou à combler. Une table réfutée est
une **connaissance**, pas une dette.

**Même racine, autre face** : `automations` et `till_sessions` ont rendu **0
ligne**. Leurs colonnes sont **inconnues**. Le comparateur les aurait comptées
« toutes manquantes » — il aurait transformé une **mesure impossible** en **liste
de courses**. D'où `etat: 'vide'` et `nonMesuree: true`, qui interdisent la
comparaison au lieu de la fausser.

### 22.3 `estConforme(undefined)` rendait `true`

Le garde le plus court du module, et le plus faux :

```js
export function estConforme(comparaison) {
  const { tablesManquantes, tablesEnPlus, colonnes } = comparaison || {}
  if ((tablesManquantes || []).length || (tablesEnPlus || []).length) return false
  return Object.values(colonnes || {}).every(…)
}
```

Appelé sans argument, il rend **`true`** : `[].length === 0` et `{}.every()` est
vrai. Une comparaison **qui n'a pas eu lieu** se lisait comme un **feu vert**.

**Règle qui en sort.** Une fonction de verdict doit distinguer trois états, pas
deux : **conforme**, **non conforme**, et **non mesuré**. Le troisième ne se
replie jamais sur l'un des deux autres. Une valeur par défaut (`|| {}`) est un
repli silencieux : elle transforme une absence d'entrée en entrée valide.

Le test qui l'a attrapé était `assert.equal(estConforme(undefined), false)` —
écrit **avant** le correctif, et qui échouait. Sans lui, le module aurait rendu
un feu vert sur une sonde qui n'aurait jamais tourné.

### 22.4 `stamp` ⊂ `timestamp`, et le compte qui va avec

Le §20.1 avait posé la règle ; R0 en fournit le cas le plus net.

| Jeton | Occurrences | Dont le sujet |
|---|---:|---:|
| `stamp` | **15** | **0** — toutes dans `timestamp` |
| `stamps` | **0** | — |

Un relevé par sous-chaîne aurait annoncé une **mécanique de tampon** dans une
architecture qui n'en a aucune. Et le chiffre est crédible : 15, ce n'est ni 0
ni 10 000, ça ressemble à un vrai relevé. **C'est exactement ce qui le rend
dangereux.**

Le corollaire méthodologique est plus utile que la règle elle-même : quand un
jeton rend un compte **plausible**, ce n'est pas une confirmation — c'est le
moment de regarder **où** il tombe. Ici, `grep -o -i 'timestamp'` rend **15**,
et l'affaire est classée en une commande.

### 22.5 Une architecture écrite ne peut pas être contredite — seulement préférée

`conversation.md` est une réponse de Gemini. Elle ne peut pas être **fausse** :
elle n'a jamais prétendu décrire Fidelix. Elle peut seulement être **préférée**.

C'est pourquoi R0 n'a pas « corrigé » ses décisions : il les a **numérotées**
(E-01…E-18) et confrontées, une par une, à un contrat mesuré. La différence
n'est pas cosmétique :

- corriger en silence produit un document qui a l'air d'accord avec lui-même ;
- numéroter produit une **liste de choix** que l'humain peut accepter ou refuser
  en connaissant le prix.

Et les deux sources **convergent** sur sept points (`loyalty_cards`, `/card/`,
jeton non devinable, QR porté par la carte, écriture atomique, stack, historique

### 22.6 Le piège des octets, récidive — dans un instrument neuf

Le §20.2 avait établi la règle. R0 l'a **rejouée par accident** : la CLI
affichait `texte.length` en l'étiquetant `o`. Résultat, **8 355 « o »** annoncés
pour un fichier de **8 375 octets**. Les 20 manquants sont exactement les
caractères non-ASCII du JSON (accents, tirets cadratins).

Le fait qu'un instrument écrit **après** la leçon la reproduise dit quelque
chose d'utile : ces pièges ne se corrigent pas dans la mémoire de l'auteur, ils
se corrigent dans le **code**. Ici, `Buffer.byteLength(contenu)` — et le saut de
ligne final compris, sinon on se trompe encore d'un octet.

**Formulation à garder** : `String.length` est une longueur de **chaîne** ;
`Buffer.byteLength` est une taille de **fichier**. Les deux s'appellent « taille »
et ne mesurent pas la même chose. Quand un document cite un octet, il doit venir
d'un `ls -l`, pas d'un `.length`.

des mouvements). Le dire évite de jeter ce qui était juste.

**Formulation à garder** : une divergence entre une **proposition** et une
**mesure** n'est pas une erreur à réparer, c'est un **arbitrage à documenter** —
parce que la proposition peut être le produit qu'on veut, et la mesure le
produit qu'on a.


### 22.7 Un commentaire n'est pas une implémentation — et c'est la troisième fois

La spec annonce, dans son arborescence :

```
└── 0001_initial_schema.sql   # Script SQL complet (Tables, Index, RLS, Fonctions RPC)
```

Le script contient **0** `ENABLE ROW LEVEL SECURITY` et **0** `CREATE POLICY`.
Mesure : `grep -c`, sur les 14 204 octets du fichier. Le mot `RLS` n'apparaît
qu'une fois — dans ce commentaire.

Ce n'est pas une coquille isolée. C'est la **troisième** occurrence de la même
famille dans ce projet :

| Occurrence | Ce qui est **nommé** | Ce qui est **fourni** |
|---|---|---|
| A5 | « Fidelia AI », « Posez-moi une question » | un arbre de décision à 10 branches |
| A4 | `new Set([1,2,3])` dans les polyfills | 0 politique de rejeu |
| R0 | un commentaire `RLS` | 0 politique |

**Règle qui en sort.** Un document qui **nomme** une protection sans la
**définir** est plus dangereux qu'un document muet : il produit la confiance
sans le mécanisme. Sur Supabase, la conséquence est concrète — une table
`public` sans RLS et avec les GRANT par défaut est lisible **et inscriptible**
par la clé `anon`, qui est publique par conception. « RLS » écrit dans un
commentaire ne ferme rien.

**Corollaire pratique** : quand une spec annonce une propriété de sécurité,
chercher **la ligne qui l'implémente**, pas le mot qui la promet. Ici la
recherche prend une commande, et elle rend `0`.

### 22.8 Deux propositions, un seul schéma : la triangulation

R0 avait déduit que la base venait de `conversation.md` en comparant **cinq
longueurs de `VARCHAR`**. C'est une empreinte, et une empreinte s'interprète.
Avec une **seconde** proposition d'architecture sous la main, on peut faire
mieux : confronter la base aux **trois** modèles et regarder lequel elle
satisfait.

| Référence | `conforme` |
|---|---|
| Cible mesurée (A1) | `false` |
| `conversation.md` | **`true`** |
| Spécifications techniques | `false` |

Le résultat est plus fort que la somme des empreintes, parce qu'il est
**exclusif** : une base ne peut pas satisfaire deux schémas qui nomment
différemment la même colonne (`points_delta` contre `points_awarded`). La
question n'est plus « ça ressemble à quoi » mais **« auquel des trois
appartient-elle »**.

Et le corollaire est opérationnel, pas académique : **le SQL de la spec ne peut
pas s'exécuter sur la base en place.** Ce n'est pas un jugement sur sa qualité —
c'est un fait de schéma, déduit de la comparaison des colonnes, sans qu'aucun
`CREATE` n'ait été tenté.

**Formulation à garder** : quand plusieurs documents décrivent le même système,
ne pas chercher le « bon » — chercher **lequel le système réel implémente**. Les
autres ne sont pas faux ; ils sont **non appliqués**, ce qui est un état, pas une
erreur.

### 22.9 Ce qu'une proposition peut avoir de meilleur que l'autre

Il serait tentant de traiter la spec comme un doublon moins bon de la
conversation, puisqu'elle n'est pas celle qui a été exécutée. Ce serait une
faute de méthode : la spec est **meilleure** sur deux points mesurés.

| Point | `conversation.md` | Spec | Cible **[M]** |
|---|---|---|---|
| Auth commerçant | PIN 4 chiffres, `sessionStorage` | Supabase Auth + middleware | GoTrue + 307 |
| Audit de l'auteur | `staff_id` UUID libre | `→ auth.users(id)` | `auteur_id` |

Sur ces deux lignes, la spec est **plus proche de la cible** que le document qui
a effectivement été exécuté. Un écart n'est pas une hiérarchie : un document peut
perdre sur son schéma et gagner sur son authentification.

**Règle qui en sort** : dans un arbitrage, comparer **par décision**, jamais par
document. « La spec est fausse » et « la conversation est juste » sont deux
phrases qu'aucune mesure ne soutient ; « la spec est meilleure sur l'auth et
incompatible sur le schéma » en est une.


## 23. Deux migrations qui se contredisent n'en font pas deux (2026-10-31, R3)

`0001` révoquait `EXECUTE` de `PUBLIC`, `anon` et `authenticated`, puis
n'accordait qu'à `service_role`. `0002`, écrite après une sonde, rendait le droit
à `anon` (mesuré) et `authenticated` (déclaré). Les deux fichiers étaient
**justes séparément**. Ensemble, ils formaient un piège d'ordre :

    0001 puis 0002  -> l'application écrit
    0002 puis 0001  -> anon et authenticated perdent EXECUTE, plus d'écriture

### 23.1 Un ordre à respecter est une dette, pas une consigne

Documenter « exécuter 0002 puis 0003, jamais l'inverse » ne corrige rien : la
consigne survit dans une phrase, et la phrase ne s'exécute pas. **Deux fichiers
dont le second annule le premier sont un seul fichier mal découpé.** La fusion
n'est pas un rangement : c'est la suppression d'un état intermédiaire qui n'a
aucun sens (une base où l'écriture est cassée). Après fusion, il n'y a plus
d'ordre, donc plus d'erreur d'ordre possible.

**Formulation à garder** : si l'ordre de deux étapes change le résultat, ce ne
sont pas deux étapes — c'est une étape et son annulation.

### 23.2 Un vérificateur qui refuse la bonne forme pousse à écrire la mauvaise

En fusionnant, `verifier-durcissement.mjs` a déclaré le fichier **NON CONFORME** :
son filtre `grantsTablesOuverts` comptait `grant execute on function … to anon`
comme un **GRANT de table** à un rôle fermé. Autrement dit, il refusait
exactement la migration que la mesure imposait.

C'est plus grave qu'un faux positif : un garde-fou qui rejette la forme correcte
n'apprend pas « il y a un bug », il apprend **« écris l'autre forme »** — ici,
celle qui casse l'écriture. Le test de régression correspondant vérifie les deux
côtés : `grant execute on function` n'est pas signalé, `grant select on table`
l'est toujours.

**Règle qui en sort** : quand un outil de vérification bloque un changement
justifié, vérifier d'abord **l'outil**. Un instrument qui ment toujours du même
côté est indiscernable d'un vrai défaut (même famille que B-1 et le §17).

### 23.3 « Mesuré » ne veut pas dire « les autres sont révocables »

La consigne héritée était « GRANT au rôle mesuré ». Appliquée à la lettre, elle
révoquait `authenticated` au motif qu'il n'était pas mesurable (aucun compte en
base, donc aucune session). Or `authenticated` est le seul rôle que
l'application utilise, et il tenait son droit de `PUBLIC` : le révoquer sans le
rendre était une régression **silencieuse**, invisible tant qu'aucune session
n'existe. Le droit a donc été **déclaré**, daté, et justifié — un rôle non
mesurable n'est pas un rôle inutile.


---

## 24. Ce que l'exécution a appris (2026-10-31, migrations R1.2 + R3)

Les deux migrations ont été passées sur la base pour de vrai (`apply_migration`,
MCP Supabase). Quatre choses n'ont pu apparaître qu'en exécutant — et deux
d'entre elles étaient des **trous de sécurité**, pas des maladresses.

### 24.1 Un `REVOKE … FROM PUBLIC` seul ne révoque rien quand le droit vient des privilèges par défaut

`0003` faisait, pour chaque fonction :

```sql
revoke execute on function public.carte_par_token(varchar) from public;
grant  execute on function public.carte_par_token(varchar) to authenticated, service_role;
```

Résultat mesuré : `anon` **gardait** `EXECUTE`. Cause : `create function`
hérite des `ALTER DEFAULT PRIVILEGES` du schéma (Supabase accorde `EXECUTE` à
`anon`, `authenticated`, `service_role`). Donc `proacl` **ne contient pas
`PUBLIC`** : le `REVOKE` ne visait personne.

Trois appels réels, avant correction, avec la seule clé publique :

| appel `anon` | réponse | ce que ça voulait dire |
|---|---|---|
| `carte_par_token` | `400 P0001 CARD_NOT_FOUND` | l'oracle de soldes « fermé » par la doc était **ouvert** |
| `programme_du_commerce` | `200 null` | lecture du programme du commerce |
| `enregistrer_programme` | `400 INVALID_SLUG` | **écriture** du programme ouverte |

C'est la même leçon que `0002` (deuxième occurrence), avec un nom différent :
**révoquer un rôle qui ne détient pas le droit ne ferme rien.** La forme qui
tient est `revoke … from public, anon, authenticated` puis `grant` par rôle —
celle de `0001` §2. Corollaire : toute migration future doit révoquer les
trois, même si elle n'en accorde qu'un.

### 24.2 Un vérificateur qui partage la constante de l'objet vérifié ne mesure rien

`0001` écrivait `award_loyalty_points(numeric, varchar, integer, uuid)`.
`to_regprocedure(…)` → **NULL** : PostgreSQL identifie une fonction par ses
types **dans l'ordre**, et `award` reçoit `p_card_token varchar` d'abord. Le
premier `REVOKE` aurait levé « function does not exist » et annulé la
transaction — la migration était **inapplicable**.

Pourquoi aucun test ne l'a vu : `durcissement.test.mjs` portait la même
constante `A`, et la capture `sonde-base.json` donnait le même ordre. Les trois
sources disaient la même chose, donc elles se confirmaient mutuellement. Un
test qui compare un fichier à une copie de sa propre erreur est un miroir, pas
une mesure — c'est le §23.2 un cran plus loin : là, le vérificateur refusait la
bonne forme ; ici, il **approuvait la mauvaise**.

La garde ajoutée ne compare pas deux textes : elle confronte l'ordre des types
à l'ordre des arguments que `construireAttribution()` envoie réellement.

### 24.3 L'OpenAPI trie les paramètres par nom — l'ordre des types ne s'y lit pas

`p_amount_spent` (numeric) précède `p_card_token` (varchar) dans l'OpenAPI,
parce que c'est un tri alphabétique. La définition SQL, elle, reçoit le jeton en
premier. **L'ordre d'une signature ne se mesure que dans `pg_proc`** :
`pg_get_function_identity_arguments(oid)`. Chercher cet ordre dans l'OpenAPI,
c'est lire un index et croire que c'est le texte.

### 24.4 PostgREST rend `401 42501`, pas `PGRST202` — l'hypothèse était fausse

J'avais annoncé, avant de mesurer, que PostgREST cacherait les fonctions
interdites derrière `PGRST202`, et donc que `lib/donnees.mjs` confondrait « base
non migrée » et « pas autorisé ». Mesure : `anon` sur une fonction sans
`EXECUTE` rend **`401 42501 permission denied for function …`**. Les deux états
sont distincts, et le `nonMigre` de `donnees.mjs` n'était pas ambigu.

Ce qui reste vrai, plus petit : `42501` n'est pas dans `CODES_CONNUS`, donc un
problème de **session** s'affiche « indisponible » — le même mot qu'une panne
réseau. À nommer, mais rien n'était cassé.

**Règle** : une prédiction sur le comportement d'une dépendance se vérifie
avant d'être écrite dans un document de suivi. Dans ce fichier, une hypothèse
non mesurée se lit comme un fait.

### 24.5 Une politique `qual = true` survit au `REVOKE` et attend son `GRANT`

`0001` affirmait « RLS activée + zéro politique », et avouait juste avant ne pas
pouvoir le vérifier (« `pg_policies` n'est pas exposé »). Il l'est : les trois
tables portaient une politique `PERMISSIVE`, rôle `public`, **`qual = true`**.

Une fois les GRANT révoqués, elles ne laissaient rien passer (mesuré :
`401 42501`). Mais ce n'est pas la même chose que « fermé » : la politique est
un portail grand ouvert, et le premier `GRANT SELECT` motivé — un écran « mes
clients », exactement ce que `0001` annonçait — l'aurait rouverte **sans
qu'aucun test ne bouge**. Elles ont été supprimées (`drop policy if exists`).

**Règle** : fermer par les privilèges *et* par la politique. Un seul des deux
n'est pas une fermeture, c'est une fermeture **jusqu'au prochain geste
raisonnable**.

## 25. Une permission n'est pas une erreur — et un jeton valide n'est pas une carte (2026-10-31, R3 caméra)

La caméra du scanner est le premier morceau du projet qui dépend d'un **geste
humain** (autoriser l'accès) et d'un **appareil** (en avoir un). Rien de cela ne
se mesure en Node. Quatre choses en sont sorties quand même.

### 25.1 Quatre causes d'échec, quatre écrans

`getUserMedia` échoue pour des raisons qui n'ont pas le même remède :

| cause | erreur DOM | ce que l'écran doit dire |
|---|---|---|
| la personne refuse | `NotAllowedError`, `PermissionDeniedError`, `SecurityError` | « accès refusé, saisissez le code » |
| aucune caméra / contrainte impossible | `NotFoundError`, `OverconstrainedError` | « aucune caméra utilisable » |
| le navigateur ne sait pas lire un QR | `BarcodeDetector` absent | « ce navigateur ne sait pas » |
| la caméra existe mais le flux casse | `NotReadableError`, `AbortError` | « la caméra n'a pas pu démarrer » |

Un seul message (« la caméra n'a pas marché ») envoie l'utilisateur régler une
permission alors que la permission n'est pas en cause — exactement la faute du
« 0 client » et du « aucun résultat » : **une cause inconnue affichée comme un
fait connu**.

Corollaire d'accessibilité, qui n'est pas cosmétique : un **refus** se rend en
`role="status"`, pas en `role="alert"`. La personne a exercé un choix ; l'annoncer
comme une alerte est un mensonge pour un lecteur d'écran. Seule la panne
(`indisponible`) est une alerte.

**Règle** : classer l'erreur **avant** de rendre, et faire porter au classement
un booléen `permission` — une erreur inconnue n'est jamais un refus.

### 25.2 `jetonValide` seul laisse passer un EAN — mesuré

`jetonValide('1234567890123')` rend **`true`**. La fonction ne regarde que la
longueur (1 à 64), pas la forme : c'est un Garde de **transport**, pas de
**domaine**. Un code-barres d'emballage lu par la caméra aurait donc traversé le
seul filtre prévu, et la page aurait cherché une carte nommée `1234567890123`.

La lecture exige donc **deux** gardes : `codeCarteValide` (forme `C-XXXXXX`) puis
`jetonValide` (longueur acceptée par la base). Et le test commence par **prouver
la prémisse** — `assert.equal(jetonValide(ean), true)` — avant de constater le
refus. C'est le §24.2 retourné : là, le test partageait l'erreur du fichier
vérifié ; ici, il partage la **limite** du garde-fou, donc il ne peut pas la
confondre avec un succès.

**Règle** : un garde qui s'appelle « valide » ne mesure souvent qu'une dimension.
Vérifier laquelle, et en ajouter un second plutôt que de renommer le premier.

### 25.3 Un test de caméra teste le contrat — et surtout l'absence de couplage

Aucun test ne peut accorder une permission ; simuler `getUserMedia` ne prouve
que la simulation. Ce qui est vérifiable, en revanche, et qui est le **vrai
risque** : que le navigateur ne se mette pas à écrire en base. Le composant est
donc côté client pour **une** raison — lire un QR — et il **navigue** vers
`/scan?code=…`, l'URL que la saisie manuelle produit déjà. La page reste serveur
et refait `carteParToken` → action.

Le test lit la source et exige l'**absence** de `award_loyalty_points`,
`carte_par_token`, `.rpc(`, `supabase`, `fetch(` dans le composant. Première
version : elle a échoué — non sur le code, sur le **commentaire d'en-tête** qui
citait les noms des RPC pour expliquer qu'il ne les utilisait pas. Le garde a
raison : un commentaire part dans le bundle. Les noms sont retournés dans
`lib/rpc.mjs`, et la phrase dit maintenant « la RPC » sans la nommer.

**Règle** : quand le matériel ne se teste pas, tester ce qui **ne doit pas** être
là (noms de RPC, `fetch`, client Supabase) plus l'unique point de sortie
(`location.assign` compté une fois). C'est mesurable, et c'est le risque réel.

### 25.4 Un harnais peut interdire `next build` — et il faut le dire

`node` est ici un binaire **Electron**, pas Node nu : `next build` meurt avant
d'analyser une page, sur `_semver.default.satisfies is not a function`. Aucun
`npx`, pas d'autre `node` sur la machine.

Le substitut utilisé est le **SWC embarqué de Next**
(`next/dist/build/swc` → `loadBindings().transformSync`, jsx + React automatic)
sur les trois fichiers : il prouve la **syntaxe**, et rien de plus — ni les
frontières `'use client'`, ni le rendu. C'est écrit tel quel dans `PROGRESS.md`
et `docs/design-system.md` §4, pas glissé sous « build OK ».

**Règle** : un instrument indisponible se nomme. Un substitut s'annonce avec son
périmètre exact, sinon « la syntaxe passe » se lira comme « ça marche ».



## 26. Un producteur sans consommateur ne se voit pas — et le test qui le voit doit lire le littéral (2026-10-31, R3 `/login`)

Deux fois de suite, dans ce projet, un paramètre a été **écrit** dans une URL et
**lu par personne** : d'abord `?echec=expire|appareil|invalide` avant
`/auth/confirm`, puis `?etat=configuration` produit par la garde du tableau de
bord. Les deux fois, rien n'a échoué : la redirection fonctionne, la page rend,
le formulaire est là. Le défaut est un **silence** — et un silence ne se mesure
qu'en confrontant deux fichiers.

### 26.1 Le contrôle doit lire le producteur, pas partager sa constante

La tentation évidente : exporter `ETAT_CONFIGURATION` du module, l'importer dans
la garde et dans la page, et vérifier dans le test que le producteur et le
consommateur « utilisent la même valeur ». Ce test ne peut pas échouer. Juste ou
fausse, la constante est comparée à elle-même : c'est le §24.2 exactement — le
vérificateur qui partage la constante de l'objet vérifié ne mesure rien.

Ce qui a été écrit à la place, dans `etat-connexion.test.mjs` :

1. on **lit le fichier** de la garde et on extrait le littéral
   `redirect('/login?etat=configuration')` ;
2. on le parse comme une URL, on prend `searchParams.get('etat')` ;
3. on le donne à `messageEtat()` et on exige une clé **présente au dictionnaire**.

Le producteur reste donc un littéral (il n'a pas été touché), et le test le lit.
Si quelqu'un renomme la valeur, c'est le test qui casse — pas la page, en
production, un mois plus tard.

**Le garde-fou du garde-fou.** Extraire par expression régulière, c'est parier sur
une syntaxe. Un `redirect(\`/login?etat=${x}\`)` écrirait la même valeur et
échapperait à la lecture : le test serait alors vert **sans avoir rien vu**. D'où
deux balayages et une comparaison de comptes : un large (`[?&]etat=`, toutes
syntaxes) et un étroit (redirection littérale relisible). L'écart de compte est
l'alarme. Un seul balayage n'aurait pas cette propriété.

### 26.2 Trois mutations, trois échecs — et un garde qui a trouvé son propre auteur

Un garde qu'on n'a jamais vu échouer est une intuition. Trois mutations ont été
appliquées puis annulées, chacune devant faire tomber **un test différent** :

| mutation | test qui a échoué |
|---|---|
| `?etat=configuration` → `?etat=config` dans la garde | *producteur* |
| `role="status"` → `role="alert"` dans le bandeau | *rendu* |
| `NEXT_PUBLIC_SUPABASE_URL` ajouté à la phrase | *copie* |

La troisième version du test a échoué **avant** ces mutations, sur ma propre
faute : mon commentaire JSX expliquait « `role="alert"` serait un mensonge », et
le mot-clé cherché à l'échelle du fichier y répondait. C'est le §25.3, deuxième
occurrence — **un commentaire part dans le bundle**, donc une garde qui cherche
un jeton le trouve aussi dans la prose. Le remède retenu n'est pas de rendre la
garde plus laxiste mais de retirer les noms d'attributs du commentaire. Et la
leçon de méthode : ce qui a sauvé le test, c'est d'exiger que l'alerte soit
**après** la fin du bloc — une assertion de position, pas seulement de présence.

### 26.3 `status` ou `alert` : « au chargement » départage, pas « panne »

Le §25.1 disait : une erreur **inconnue** n'est jamais un refus, et seule la
panne est une alerte. Appliqué à la lettre, l'absence de configuration serait
une alerte : c'en est une, de panne. Le rendu retenu est pourtant `status`, et il
faut le justifier, sinon la règle devient une contradiction.

Le discriminant n'est pas seulement **cause** (`choix` vs `panne`), c'est aussi
**moment** : un état présent au chargement de l'écran n'interrompt rien, il
décrit. Une alerte assertive annoncée à chaque ouverture écrase ce qui précède et
n'apporte rien — le texte est déjà à l'écran. À l'inverse, l'échec qui **répond à
un geste** (« Se connecter » cliqué, configuration absente) reste une alerte, et
il existe déjà dans le même formulaire, juste en dessous, avec la même cause.

**Règle affinée** : `alert` pour ce qui répond à un geste ou rompt une action en
cours ; `status` pour ce qui décrit l'écran tel qu'il est. La panne n'est un
`alert` que si elle survient **pendant** que la personne agissait.

### 26.4 Un mot n'est pas une cause — et ma propre dette était imprécise

La dette disait : « `?etat=configuration` n'est lu par personne ». En la fermant,
la mesure a montré **trois** producteurs, pas un : la garde (`/login`),
`scan/actions.js:38` et `caisse/actions.js:46`. Les deux pages lisent bien
`?etat=` — mais aucune ne teste la valeur `configuration` : elles couvrent `ok`,
`introuvable`, `arguments`, `refus|indisponible`. La dette était donc *vraie pour
la mauvaise raison* : elle nommait un consommateur absent là où il fallait dire
un **cas** absent. C'est le §18.1 (« un mot-clé n'est pas un sujet ») appliqué à
ma propre prose.

Et le piège qui a empêché de les corriger d'un même geste : le mot
`configuration` y désigne **deux choses**. Sur `/scan` et `/caisse`, l'état
`configuration` rendu par la RPC est affiché par
`tableau.etat.migrationTitre` — « La base n'est pas encore migrée ». Réutiliser
ce texte pour un client Supabase non construisible aurait affiché une cause
fausse comme un fait connu : exactement la faute que le §25.1 décrit. Un même
mot, deux phrases, deux tâches. D'où : fermer `/login`, **nommer** les deux
autres au backlog, et écrire pourquoi la copie ne se partage pas.

Corollaire pour la copie, qui n'est pas de la cosmétique : une clé destinée à qui
installe le projet peut nommer `NEXT_PUBLIC_SUPABASE_URL`
(`auth.erreurConfiguration`) ; une clé lue par un commerçant ne le peut pas, et
le test l'exige (`doesNotMatch(/NEXT_PUBLIC_|SUPABASE_|service_role/)`) — avec,
comme témoin, la clé technique qui les nomme bien, sans quoi un `doesNotMatch`
qui ne peut jamais mordre passerait pour une mesure (§17).


## 27. Le même mot, deux moments — et une clé qui existe n'est pas une clé qui a été lue (2026-10-31, R3 `/scan` + `/caisse`)

Fermer `/login` avait révélé trois producteurs pour un seul mot. Fermer les deux
derniers a montré que le travail n'était pas le rendu : il tenait à trois
décisions (la copie, le rôle, la réutilisation d'une clé existante) et à un
maillon de chaîne que personne ne lit.

### 27.1 Le rôle ne dépend pas du mot, mais du moment

Le même état `configuration` est rendu `status` sur `/login` et `alert` sur
`/scan` et `/caisse`. Ce n'est pas une incohérence, et ce n'est pas une
préférence :

| écran | quand le message apparaît | ce qu'il fait | rôle |
|---|---|---|---|
| `/login` | au chargement, la garde a redirigé avant tout geste | il décrit l'écran | `status` |
| `/scan`, `/caisse` | après la soumission du formulaire | il répond à un geste | `alert` |

Le §26.3 contenait déjà la réponse (« `alert` pour ce qui répond à un geste ;
`status` pour ce qui décrit l'écran tel qu'il est »), mais la règle du §25.1
(« seule la panne est une alerte ») poussait dans l'autre sens : une
configuration absente **est** une panne. Les deux règles ne se contredisent que
si l'on oublie le second discriminant, le **moment**. Une règle par mot
(« `configuration` → `status` ») aurait donné un rôle faux sur deux écrans sur
trois.

**Règle** : classer par (cause, moment), jamais par mot-clé. Et exiger du test
qu'il mesure **les deux** rôles pour le même mot — sinon la règle par mot revient
en silence, et un seul des trois écrans est vérifié.

### 27.2 Une clé qui existe n'est pas une clé qui a été lue

`tableau.rpc.configuration` existait déjà : « Supabase n'est pas configuré sur ce
serveur : l'appel ne peut pas aboutir. » Vraie cause, même famille, aucune
variable d'environnement nommée. La réutiliser était l'option la moins chère, et
elle aurait passé une revue distraite.

Mesure : **aucun écran ne la rend**. Les seules occurrences sont les tables
`CLES_ETAT_ATTRIBUTION` / `CLES_ETAT_ECHANGE` de `lib/rpc.mjs`, et le seul test
qui la touche vérifie qu'elle **existe** au dictionnaire. Une clé jamais rendue
n'a jamais été relue dans son contexte : « elle dit la bonne chose » est un
jugement sur la **cause**, pas sur la **phrase**.

Et la phrase manquait du seul point qui compte ici. Le commerçant vient de
cliquer « Créditer » ; ce qu'il doit lire est *le geste n'a rien écrit*, pas *un
appel n'aboutit pas*. D'où une clé propre, dont le test exige la phrase d'issue
(« Aucun point ») — exigence qui, appliquée à la voisine, échoue : c'est ainsi
qu'on prouve que l'argument n'est pas décoratif.

**Règle** : avant de réutiliser une copie, vérifier qu'elle a déjà été **rendue**
quelque part. Une chaîne déclarée mais jamais affichée est un brouillon, pas une
décision.

### 27.3 Un gabarit d'URL contient des entrées déguisées en sorties

Le producteur écrit deux sortes de valeurs :

```js
redirect(`${retour}&etat=ok${…}`)                                   // littéral
redirect(`${retour}&etat=${cond ? 'introuvable' : 'refus'}`)          // gabarit
```

Un balayage naïf des littéraux d'un gabarit ramasse aussi `carteInconnue` — le
code qu'on **compare** (`resultat.etat === 'carteInconnue'`). Ce n'est pas une
valeur écrite dans l'URL : c'est une entrée du code. Le test aurait donc réclamé
une branche `etat === 'carteInconnue'` qui n'existe pas et ne doit pas exister —
un garde qui exige un défaut.

Le remède est d'une ligne, mais il faut la nommer : retirer les comparaisons
(`[!=]== '…'`) **avant** d'extraire les littéraux. On obtient alors les six
valeurs réellement produites, et six branches réellement rendues — dont deux
(`introuvable`, `refus`) qui ne viennent **que** du gabarit : leur présence est
le témoin que le balayage des gabarits fonctionne. Sans ce témoin, un balayage
cassé rendrait un ensemble plus petit, et « toutes les valeurs ont un
consommateur » serait vrai sur un ensemble vide.

**Règle** : dans une expression, distinguer ce qui est **produit** de ce qui est
**testé**. Et donner au balayage un témoin qui ne peut venir que du cas
difficile.

### 27.4 Une mutation qui ne s'applique pas ne prouve rien

Six mutations, six échecs distincts. Mais la première version de la mutation
« copie » a rendu un test **vert**, et j'ai failli l'enregistrer comme un garde
validé. Le fichier n'avait pas changé d'un octet : le motif Perl contenait des
`.`, et en mode octets un `.` ne traverse pas `’` (trois octets en UTF-8), donc
la substitution ne s'appliquait **zéro** fois.

C'est le §17 / §21.5 (« un garde qui ne peut pas échouer ne prouve rien »), mais
avec un déplacement : le garde était bon, c'est le **harnais de mutation** qui ne
mesurait rien. Et c'est la pire des situations, parce qu'un vert après une
non-mutation certifie un garde qui n'a jamais servi — il donne la confiance sans
la preuve.

**Règle** : toute mutation s'accompagne d'un **témoin d'application** (`diff`,
`grep -c`) lu **avant** le résultat du test. Pas de témoin, pas de conclusion.
Corollaire pratique : ancrer les motifs sur de l'ASCII (une clé, un identifiant),
jamais sur de la prose accentuée.

### 27.5 Un producteur écrit dans une URL, pas dans une page

Le producteur n'écrit pas « dans `/scan` » : il écrit dans `retour`, puis y
ajoute `&etat=`. Si `retour` devenait `/dashboard`, le producteur serait correct,
le consommateur serait correct, et **rien** ne s'afficherait — le message
atterrirait dans un écran qui ne le rend pas.

C'est le seul maillon qu'une lecture de valeurs ne voit pas : on lit les valeurs
d'un côté, les branches de l'autre, et les deux se répondent sans jamais se
rencontrer. Le test l'exige donc explicitement : le littéral de `retour` doit
être la route de la page qui lit le paramètre.

**Règle** : quand une valeur voyage par une URL, vérifier aussi l'**adresse**.
Un couplage de valeurs peut être vert alors que le colis n'arrive pas.


## 28. Une garde écrite pour deux fichiers mesure deux fichiers (2026-10-31, R4 `?etat=`)

Fermer le défaut de R3 avait laissé une garde **nommée** : deux `actions.js`
écrits à la main. La généraliser a pris vingt minutes et a trouvé, du premier
coup, un troisième écran qui avait le même défaut depuis le début. La leçon
n'est pas « généraliser plus tôt » — c'est que la **portée** d'une garde est une
affirmation, et qu'une affirmation sans témoin n'est pas une mesure.

### 28.1 La couverture d'une garde est une affirmation à prouver

`etat-action.test.mjs` disait « chaque valeur produite a sa branche ». C'était
vrai **des deux fichiers qu'il lisait**. Un troisième `actions.js` pouvait
produire une valeur sans branche : le test serait resté vert, et il aurait même
été cité comme preuve que « le problème est réglé partout ».

Le balayage générique a immédiatement rendu une liste d'un seul écart :
`rewards/actions.js:57` écrit `?etat=migration`, et `rewards/page.jsx` ne le
rendait pas. Vingt minutes après avoir fermé le même défaut sur `/scan`, dans le
même dépôt, avec le même test « vert ».

**Règle** : une garde qui balaie annonce sa portée **et la vérifie** (les 8
fichiers trouvés, les 4 qui produisent, les valeurs témoins). Une garde dont on
ne peut pas dire ce qu'elle ne lit pas n'est pas une garde, c'est un échantillon.

### 28.2 Un gabarit peut ne contenir aucune valeur — et un ensemble vide est vert

Le §27.3 avait appris à retirer les comparaisons d'un ternaire. Restait un cas
plus discret :

```js
const etat = resultat.etat === 'nonMigre' ? 'migration' : … : 'indisponible'
redirect(`/join/${slug}?etat=${etat}`)      // aucune valeur littérale ici
```

L'expression `${etat}` ne contient **rien** à extraire. Un balayage littéral
rend zéro valeur, la boucle « chaque valeur a-t-elle une branche ? » ne
s'exécute pas, et le fichier passe au vert sans avoir été lu. C'est exactement
le §27.3, un cran plus loin : là c'était une valeur **en trop** (une entrée du
code lue comme une sortie), ici c'est une valeur **en moins**.

Deux remèdes, tous deux nécessaires :
1. résoudre un identifiant simple vers sa déclaration (`const etat = …`) — mais
   seulement quand l'expression **est** un identifiant ;
2. faire de « zéro valeur lue pour un `?etat=` » un **échec**, pas un silence.

**Règle** : dans un balayage, l'ensemble vide doit être une erreur. Un prédicat
universel sur un ensemble vide est toujours vrai, et c'est le mensonge le moins
coûteux à produire.


### 28.3 Développer un identifiant partout abîme le chemin — sans faire échouer

Première version : remplacer *tous* les `${id}` par leur initialiseur, puis
lire. Sur `join`, `${slug}` a été remplacé par
`normaliserSlug(donnees.get('slug'))`, et la cible est devenue
`` `/join/${normaliserSlug(donnees.get(?etat=migre` `` — un chemin qui n'existe
pas. Le test est **resté vert** : la clé de route se réduisait encore à
`join/:`, donc la page était trouvée. Le message d'échec, lui, montrait la
bouillie.

C'est le pire des deux mondes : la lecture était fausse **et** le résultat
correct par accident. Seul le texte du message l'a dit.

**Règle** : développer un identifiant **là où il porte la valeur**, pas partout.
Le chemin se lit dans la redirection (`retour` ou littéral) ; la valeur se lit
dans l'expression ou dans sa déclaration. Et lire le message d'échec comme une
mesure : un chemin illisible dans un message est un défaut de lecture, même
quand le test passe.

### 28.4 Une liste de chemins est un témoin, pas une formalité

`ACTIONS_CONNUES` (les 8 chemins) semble être de la décoration : le balayage est
récursif, il trouverait tout seul. Mesuré : renommer `join/[slug]` en
`join/[code]` fait échouer **deux** assertions — la liste (un `actions.js` a
disparu de la couverture annoncée) et l'appariement de la route dynamique. Sans
la liste, seul le second aurait parlé, et il aurait parlé d'autre chose.

**Règle** : lister ce qu'on prétend couvrir. La liste ne sert pas à trouver, elle
sert à **constater une disparition** — et un fichier renommé est une disparition.

### 28.5 Fermer un trou : compléter le consommateur, pas effacer la valeur

`?etat=migration` sur `/rewards` était **presque** inoffensif : quand il est
présent, la page relit le programme et rend déjà le bloc de migration — le
commerçant voit la bonne phrase, sans que la branche d'URL existe. Trois
clôtures étaient possibles :

1. supprimer la production (la valeur ne sert à rien) ;
2. rendre la valeur (une branche de plus) ;
3. déclarer l'exception dans le test (la page rend l'état par un autre chemin).

(3) aurait affaibli la règle pour tous les écrans suivants. (1) aurait retiré
l'information du seul endroit qui la porte quand la **lecture** répond et que
l'**écriture** échoue. (2) garde les deux contrats : le producteur dit pourquoi
le geste a échoué, le consommateur le rend — et la phrase est **celle du bloc
bloqué** (`tableau.etat.migrationTexte`), une cause = une phrase.

**Règle** : un garde ne force pas la refonte du code qui marche ; il constate un
contrat incomplet. On complète le côté qui manque, en réutilisant la copie déjà
rendue (§27.2) — on n'efface pas la valeur pour faire passer le test.

### 28.6 Deux bugs de harnais, tous deux trouvés par le harnais

- **Récursion relativisée deux fois** : `marcher()` convertissait chaque chemin
  en relatif *dans* l'appel récursif, puis le parent le reconvertissait. Tous
  les chemins sont sortis en `../../../../../..` et la garde a annoncé les huit
  fichiers manquants. Le défaut était bruyant — c'est la seule raison pour
  laquelle il n'a pas coûté une fausse preuve.
- **`**/` ferme un commentaire** : l'en-tête citait `web/src/app/**/actions.js`
  dans un bloc `/* … */`. La séquence `*/` a terminé le commentaire à la ligne
  14, et Node a signalé une erreur de syntaxe **ligne 20** (« Unexpected
  identifier »), loin de la cause. Corollaire du §27.4 : ce qu'on écrit dans un
  commentaire est aussi du texte lu par le parseur.


## 29. Un harnais peut corrompre l'arbre qu'il mesure — et une exclusion motivée doit mourir avec sa raison (2026-10-31, `type=recovery`)

Fermer le flux de récupération n'a demandé qu'un écran. Les trois leçons de la
soirée ne viennent pas de là : elles viennent de **ce qui mesurait**, et d'un
commentaire que j'avais écrit pour expliquer la règle.

### 29.1 Un harnais de mutation peut corrompre l'arbre qu'il mesure

La campagne a rendu `15/15 mutations détectées`. Deux d'entre elles étaient
pourtant fausses, et le harnais ne le savait pas.

J'ai lancé la campagne en la pipant dans `head -80`. `head` ferme le tube après
quatre-vingts lignes, Node reçoit `SIGPIPE` et meurt **entre** l'écriture d'un
fichier muté et sa restauration. La campagne suivante (lancée pour lire la fin)
a donc mesuré un arbre à moitié muté et annoncé :

```
[M11 — l'action lit un autre nom de champ] TEMOIN ÉCHEC : 0 occurrence(s)
```

Un `0 occurrence` n'est **pas** un défaut de la mutation : c'est une mesure de
l'arbre. Le fichier contenait `get('confirm')` — la mutation précédente, restée
en place. Et trois mutations voisines ont « échoué » sur un test qui ne lisait
aucun de leurs fichiers : la signature d'un état partagé corrompu, pas d'un
garde qui mord.

**Règle** : un harnais qui écrit dans les sources qu'il mesure doit
1. restaurer sur **tous** les chemins de sortie (`process.on('exit')` — il tourne
   aussi sur `SIGINT` et sur exception) ;
2. **refuser de démarrer** si l'arbre ne correspond pas à ce qu'il annonce
   (pré-vol : chaque motif présent exactement une fois, le texte muté absent) ;
3. ne jamais écrire sa sortie dans un tube qu'un lecteur peut fermer.

Corollaire de mesure : un échec **inattendu** (0 occurrence, un test d'un autre
domaine qui tombe) se diagnostique avant d'être compté. J'ai failli enregistrer
ces trois échecs comme trois gardes validés.

### 29.2 Un commentaire qui cite la syntaxe est une production

Première version de `nouveau-mot-de-passe/actions.js` : la prose disait
`` `redirect()` hors du `try` `` et `` `?etat=session` et non une clé de plus ``.
Le balayage de `?etat=` lit le **texte brut**, découpe par `redirect(` et prend
tout ce qui contient `?etat=` pour une production. Résultat :

```
(auth)/nouveau-mot-de-passe/actions.js : `/dashboard` porte un `?etat=`
dont aucune valeur n'a été lue
```

Deux valeurs en trop, aucune dans le code. Le garde était **juste** : il
signale un `?etat=` dont il ne sait rien extraire, ce qui est exactement le cas
qu'il doit refuser (§28.2). Il ne faut donc pas l'assouplir — c'est la prose
qu'il faut réécrire (« la redirection », « l'état de session »).

Détail qui se moque de moi : la première phrase que j'ai écrite pour expliquer
la règle citait `redirect(` et `?etat=…`, et **rouvrait** le défaut. Il a fallu
deux corrections. Quand une règle interdit de citer une syntaxe, l'énoncé de la
règle est soumis à la règle.

**Règle** : dans un fichier lu par un balayage de texte, ne pas écrire la
syntaxe surveillée — même pour l'expliquer. Et quand un garde signale une valeur
qu'on n'a pas écrite, chercher d'abord **où** elle est, pas pourquoi le garde se
trompe.

### 29.3 Une exclusion motivée par une absence doit mourir avec sa raison

`TYPES_CONFIRMATION` excluait `recovery`, et le commentaire disait pourquoi :
« aucune page “nouveau mot de passe” n'existe ». Le test l'affirmait :

```js
assert.ok(!TYPES_CONFIRMATION.includes('recovery'))
```

C'est une assertion qui **certifie une décision par son motif**. Le jour où la
page existe, le motif tombe, mais l'assertion reste verte — et elle exige
désormais le contraire de ce qui est juste. Un `[x]` au backlog n'aurait rien
signalé : seul un lecteur du test l'aurait vue.

**Règle** : quand une décision est motivée par une absence, écrire le motif dans
le test **et** le remplacer le jour où l'absence cesse. Une exclusion n'est pas
une préférence : c'est une conséquence, et une conséquence sans cause devient un
mensonge. Ici l'assertion a été **retournée** — `type=recovery` vérifie et mène à
`/nouveau-mot-de-passe`, prouvé par mutation (M1).

### 29.4 « Impossible à lancer » est une mesure, pas une évidence

Le backlog portait : « `next build` n'a pas pu être exécuté ; le `node` du `PATH`
est Electron, la CLI sort sans rien faire ». J'ai rejoué la commande : elle
répond `zsh: command not found: npx`. En appelant le binaire directement
(`node node_modules/next/dist/bin/next build`), le build tourne — 96 s, zéro
avertissement, la nouvelle route dans la table.

Deux dettes en une : celle du build (fausse) et celle du **substitut** qu'elle
avait fait accepter (« contrôle statique des imports, ce n'est pas une
compilation »). Une limite héritée d'une session précédente est une affirmation
comme une autre ; elle se rejoue avant d'être citée. C'est le §19.3 — « un
chiffre hérité n'est pas un chiffre mesuré » — appliqué à une contrainte
technique.



## 30. Trois sondes identiques prouvent l'absence de signal, pas l'absence de risque (2026-10-31, R3 → première lecture)

Cette session devait « trancher » trois dettes. Deux ne se tranchaient pas par du
code, et c'est précisément ce qu'il fallait établir **avant** d'écrire quoi que
ce soit.

### 30.1 Une dette de console se mesure d'abord pour savoir si elle est mesurable

La dette disait : « vérifier l'allow-list *Redirect URLs* avec
`?flux=recuperation`, au premier envoi réel ». On ne peut pas recevoir le
courriel. Alors j'ai posé la seule question qui restait : **l'API distingue-t-elle
une origine autorisée d'une origine inconnue ?**

Trois `POST /auth/v1/recover`, même clé publique, même adresse inexistante :

    origine inconnue (https://exemple-inconnu.invalid/…)   -> 200 {}
    localhost avec ?flux=recuperation                      -> 200 {}
    sans redirect_to                                       -> 200 {}

Trois réponses **identiques**. L'endpoint protège l'énumération de comptes, donc
il ne dit rien de l'allow-list. Second recours : `auth.instances` — la table qui
portait la configuration GoTrue dans les anciennes versions — rend **0 ligne** :
la configuration vit désormais côté plateforme.

**Règle** : une dette « à vérifier en console » se tranche en deux temps. D'abord
« puis-je seulement le mesurer d'ici ? » — et la réponse négative est une
**mesure**, avec ses trois reçus. Ensuite seulement vient « est-ce réglé ? ».
Écrire « à vérifier plus tard » sans le premier temps laisse croire que le
prochain essai paiera ; ici, le prochain essai ne paiera pas non plus. La dette
reste ouverte, mais elle est **bornée** : console ou courriel réel, rien d'autre.

Corollaire de méthode : la clé publique suffit pour sonder l'API Auth, et une
adresse inexistante n'envoie aucun courriel. Une sonde qui n'a pas d'effet
d'écriture peut se poser sans demander la permission.

### 30.2 La copie mesurée n'est pas là où le texte rendu la montre

Deux pièges dans la même capture (`a17-customers.html`) :

1. **Le rôle départage, pas la position.** Le texte rendu commence par
   « Clients », puis « Mes clients ». J'ai d'abord pris le second pour le titre.
   Le HTML dit l'inverse : `<h1>` = « Clients », et « Mes clients » est
   l'**onglet** actif. Les deux chaînes sont mesurées ; c'est leur rôle qui
   décide laquelle on affiche.
2. **Les commentaires coupent les phrases.** Le compteur est écrit
   `1<!-- --> client<!-- --> inscrit` : un `includes('1 client inscrit')` sur le
   HTML brut échoue alors que la phrase est bien là. Le témoin du test doit lire
   la **même forme** que le consommateur — ici, après retrait des commentaires et
   des balises.

**Règle** : avant d'écrire « mesuré », extraire la chaîne **et son rôle**
(`<h1>`, `<caption>`, onglet, `aria-label`). Une chaîne mesurée au mauvais endroit
est une invention avec un alibi.

### 30.3 Une projection de RPC est une décision d'affichage — et une décision d'ACL

`cartes_du_commerce()` rend six clés, et pas une de plus : les quatre colonnes
mesurées sur la cible, plus les deux champs d'identité qu'elle affiche en
initiales. **Pas d'email** : la cible ne l'affiche pas dans cette liste, et une
colonne rendue est une colonne exposée. Le test ne vérifie donc pas « l'écran est
joli » : il vérifie que la projection ne contient pas `'email'`, et que la
migration ne contient **aucun** `GRANT … ON TABLE` ni `CREATE POLICY`.

Deux mesures ont valu mieux que la revue :

- `has_table_privilege('authenticated', 'public.clients', 'SELECT')` → **false**
  après la migration. La RPC n'a pas ouvert les tables en chemin.
- `pg_get_functiondef` → `SECURITY DEFINER` **sans** `SET search_path` pour les
  deux fonctions d'écriture existantes. `proacl` ne le dit pas : il ne décrit que
  les droits, pas le contexte d'exécution. C'est une escalade de privilèges
  possible, et elle n'apparaissait dans aucun test. `0004` la ferme, et le garde
  lit le texte de la migration.

**Règle** : un `GRANT EXECUTE` sur une fonction `SECURITY DEFINER` déplace le
problème de droits **dans** la fonction. Ce qui doit être testé n'est donc plus
« qui peut appeler » mais « ce que l'appel rend » et « ce que l'appel n'ouvre
pas ». Et quand on écrit une fonction `definer`, on vérifie le `search_path` de
**toutes** les autres dans la foulée : celle qu'on n'écrit pas est celle qu'on ne
relit jamais.

### 30.4 Une chaîne se prouve en l'exécutant, refus compris

La chaîne des quatre modules (programme → QR → adhésion → carte → points →
récompense) était « complète » sur le papier depuis `0003`, et personne ne l'avait
jamais parcourue. Exécutée sur la base de reconstruction : programme créé,
`join` rend `C-E91371` à 0 point, `+12` puis `+40` (**52**), échange à 45 →
**7**, et la liste rend `points 7, recompenses 1`.

Le maillon le plus utile n'est pas le succès : c'est le **refus**. À 0 point,
`redeem` lève `P0001 INSUFFICIENT_POINTS` — un code que `lib/rpc.mjs` ne connaît
pas, et qui n'apparaît nulle part dans nos tests parce qu'aucun test ne joue la
caisse sans solde. Un chemin heureux prouve que la colonne existe ; le refus
prouve que la règle existe. Les deux ont été mesurés, puis les données de sonde
supprimées (3 transactions, 1 carte, 1 client, 2 paliers, 1 programme).

**Règle** : « la chaîne est complète » est une affirmation sur du code ; « la
chaîne est complète » se dit après l'avoir parcourue, **avec un refus au milieu**,
et en laissant la base comme on l'a trouvée.


## 31. Une capture 404 et une capture vide se ressemblent — et un écran peut être mesuré sans être constructible (2026-10-31, deuxième lecture)

Cette session devait livrer « `/caisses` ou `/notifications` ». Les deux ont été
mesurés d'abord. Aucun des deux n'a été livré, et l'écran livré est un troisième :
c'est le seul résultat défendable, et il a fallu deux mesures pour y arriver.

### 31.1 « Page introuvable » est dans **toutes** les pages

Premier réflexe : chercher `Page introuvable` dans le payload et conclure « 404 ».
Faux. Next sérialise la **frontière `not-found`** dans chaque réponse : la chaîne
est présente même sur `/customers`, qui est un vrai écran. Trois captures ont été
déclarées 404 à tort avant que le témoin ne tombe.

Le bon discriminant est **relatif** : la liste des chaînes propres à une page est
l'ensemble **moins** le gabarit, et le gabarit se mesure sur la capture la plus
pauvre (`a09` : dix chaînes). `a17` en ajoute dix (colonnes, jeton, date) ;
`a20` n'en ajoute **aucune**. Un test d'absence a besoin d'un **corpus de
référence**, sinon il mesure le gabarit et l'appelle une page.

### 31.2 La même URL a deux captures, et l'une porte ce que l'autre a perdu

`a09-caisses.html` existe deux fois : un payload RSC (`raw/pages/`) et un **DOM
rendu** (`rendu/`). Le premier ne contient que le gabarit ; le second porte
l'écran complet — `h1` « Équipe », `h3` « Classement de l'équipe », les sept
`th`. Chercher dans une seule des deux formes aurait conclu « pas de capture »
sur un écran qui en a une.

**Règle** : avant de déclarer « rien à mesurer », énumérer **toutes** les formes
capturées pour cette URL (payload, DOM, réseau, PNG) et dire laquelle a été lue.
« Aucune capture » est une affirmation sur un corpus, pas sur un fichier.

### 31.3 Mesurable n'est pas constructible

`/caisses` est parfaitement mesuré — et reste bloqué. Sa table demande « Cartes »
(les clients qui ont **désigné** ce caissier) et « Avis ». Or les cinq tables
mesurées sont `clients`, `loyalty_cards`, `loyalty_transactions`,
`loyalty_programs`, `reward_tiers` : aucune table d'équipe, aucune colonne de
désignation, et `staff_id` flotte sans rattachement.

La tentation était immédiate : « Cartes » = nombre de cartes distinctes. C'est un
**autre chiffre sous le même mot** — exactement la faute que la doctrine interdit.
La conclusion honnête n'est pas « faisons moins », c'est **« ce n'est pas une
tâche de lecture »** : il manque une migration de schéma, et le backlog doit le
dire dans ces termes.

**Règle** : une projection mesurée se découpe en trois — les colonnes que le
socle calcule, celles qu'il ne calcule pas, et celles qu'il ne peut pas calculer
**sans changer de modèle**. Seul le premier lot se livre ; le troisième se
consigne comme dette de **schéma**, pas comme reste à faire d'écran.

### 31.4 Les sous-titres portent les définitions — et une définition qui dérive ne casse rien

« Reviennent | **au moins 2 visites** », « Visites | **30 derniers jours** »,
« CA (€) | **30 j · total 40** ». Les trois quarts du sens sont dans le
sous-titre. Une requête qui passe `>= 2` à `>= 3`, ou 30 jours à 7, **n'échoue
nulle part** : elle change ce que l'écran affirme, en silence.

C'est pourquoi les deux constantes sont **dans** le SQL et **relues** par un
test (`having count(*) >= 2`, une seule fenêtre `interval '30 days'`), avec la
borne des lignes récentes confrontée à la constante de l'écran. Une mutation les
fait dériver (M27, M28) : le test tombe.

**Règle** : quand un libellé contient un seuil ou une fenêtre, ce seuil est une
**donnée de contrat**. Il va dans le code qui l'applique, et il est vérifié là —
pas seulement dans la copie.

### 31.5 L'ordre total : le jour où ce n'est plus théorique

Trois opérations écrites dans le même appel partagent **le même `created_at`**
(mesuré : `count(distinct created_at) = 1`). `order by created_at desc` seul
laissait donc l'ordre au hasard du plan. Avec `, id`, deux appels successifs
rendent `7,-10,8` puis `7,-10,8`.

Cette mesure vaut mieux que l'argument : elle montre que la clé de départage
n'est pas un ornement de `0004`, c'est la condition pour qu'une liste ne bouge
pas sous les yeux de celui qui la lit.

### 31.6 Une unité recopiée est une unité fausse

La cible écrit « CA (€) ». Notre `devise` vaut `MAD` par défaut. Recopier « € »
aurait fait un écran **fidèle à la capture** et faux sur la donnée : le pire des
deux mondes, puisque la fidélité sert d'alibi.

La sortie n'est ni de recopier, ni de réécrire : on garde **la forme** mesurée
(« CA (…) », valeur sans unité, total dans le sous-titre) et on met **la donnée**
dans le gabarit — `CA ({devise})`. Le test cherche « CA (€) » dans la capture
(témoin), exige le gabarit dans le dictionnaire, et interdit « € » dans **toutes**
les valeurs. Une mutation réintroduit le symbole (M33) : deux assertions tombent.

**Règle** : une capture prouve une **forme**, pas une **valeur**. Les deux se
séparent dès qu'une colonne de la base dit autre chose, et c'est la forme qu'on
garde.

### 31.7 Ce que `next build` fait à un serveur de développement ouvert

Lancer `next build` pendant qu'un `next dev` tourne vide `.next` sous ses pieds.
Résultat : `/apercu` rend **500** avec `Module … was instantiated as a runtime
entry … but the module factory is not available`, un message qui accuse le cache
navigateur et le service worker — donc qui fait chercher au mauvais endroit.

Ce n'est pas un bug du code livré. Le test qui tranche : arrêter le serveur, en
relancer un, et **relire la page**. Si elle rend 200 après redémarrage, la 500
était l'outillage. Ne jamais conclure « la page est cassée » sur une erreur de
`Module factory` sans avoir redémarré le serveur.

Corollaire de mesure : `grep -c` compte des **lignes**, pas des occurrences. Sur
une page Next rendue en une seule ligne, `grep -c '—'` rend `1` quand il y a dix
tirets. Compter avec `grep -o … | wc -l`, sinon un rendu à moitié vide passe pour
complet.


## 32. Un modèle se pose avant la lecture — et deux colonnes qui se ressemblent ne mesurent pas la même chose (2026-10-31, `0006`)

Cette session devait débloquer `/caisses`. Elle n'a pas livré l'écran : elle a
livré **le modèle** que l'écran exige, l'a exécuté, et a sondé ses refus. C'est
le seul ordre défendable, et il a produit trois leçons qui se réutilisent.

### 32.1 « Désigné par » n'est pas « attribué à »

L'écran a deux colonnes qui parlent de caissier, et elles ne viennent pas de la
même donnée :

    clients.designated_staff_id     le caissier que le CLIENT a choisi à l'inscription
    loyalty_transactions.staff_id   la caisse qui a ENCAISSÉ l'opération

La capture définit la première mot pour mot : « Les cartes comptent les
**clients** qui ont **désigné** ce caissier sur la page d'inscription. » La
seconde compte les **scans**. Les fusionner donnerait un classement plausible et
faux : « Cartes » afficherait le nombre de passages, pas le nombre de clients
acquis — et personne ne le verrait, parce que le libellé ne change pas.

**Règle** : avant d'ajouter une colonne de rattachement, écrire les deux phrases
(« X a désigné Y » / « Z a été fait par Y ») et vérifier qu'elles ne se
substituent pas l'une à l'autre. Si elles se substituent, il n'y a qu'une
colonne. Si elles ne se substituent pas, il en faut deux — et la définition de
l'écran dit laquelle porte quel mot.

### 32.2 Un `NULL` peut être une valeur, pas un trou

`loyalty_transactions.staff_id` était nul partout, et la tentation était d'y
voir « donnée manquante ». La mesure dit autre chose : la seule ligne du
classement de la cible est « Titulaire | Vous | 0 | 1 | 8 | 40 € | 0 », et le
titulaire n'est pas une caisse employé. **Nul = le titulaire.**

Conséquence de contrat : la colonne reste NULLable (la rendre obligatoire
obligerait à inventer une caisse pour chaque opération du propriétaire), et le
futur classement groupe par `staff_id` **en gardant** la ligne nulle, au lieu de
la filtrer comme une anomalie.

**Règle** : avant de traiter un `NULL` comme une lacune, chercher la ligne de
l'écran qui n'a pas d'auteur. Si elle existe, le `NULL` est cette ligne, et le
`NOT NULL` est une régression déguisée en intégrité.

### 32.3 Le harnais doit survivre à sa propre mort — et ses refus se déclenchent

La campagne de mutations avait déjà payé l'accident : un processus tué entre
l'écriture et la restauration, et la campagne suivante mesurant un arbre
corrompu en l'annonçant comme sain. Le correctif de l'époque — un `enCours`
unique restauré sur `exit` — ne couvrait qu'un fichier et qu'un chemin.

Trois mécanismes, et ils sont complémentaires :

1. **instantané** de *tous* les fichiers visés, lu avant la première écriture :
   la restauration ne dépend plus de ce que le disque contient au moment du
   drame ;
2. **marqueur** sur disque, écrit avant la première mutation : s'il est encore là
   au démarrage, la campagne précédente n'a pas fini, et on refuse de démarrer
   au lieu de mesurer un arbre inconnu ;
3. **vérification octet à octet** avant le verdict : une restauration incomplète
   fait sortir en code 1, même si toutes les mutations ont été détectées.

Ce qui a changé la valeur de ces gardes n'est pas leur écriture, c'est leur
**déclenchement** : marqueur posé à la main → exit 1 sans mesure ; fichier muté
à la main → exit 1 en nommant les mutations concernées ; `SIGINT` en pleine
campagne → exit 130 avec les fichiers restaurés au **même md5** qu'avant. Un
garde non déclenché est une intention, pas une protection.

Corollaire sur les mutations elles-mêmes : une mutation qui pointe vers un
fichier **inexistant** ne teste que l'existence. M35 nommait
`0006_lecture_tableau.sql`, qui n'existait pas ; depuis qu'un `0006` existe, la
même mutation pointe sur `0006_equipe_et_designation.sql` — un fichier réel, qui
ne contient pas `tableau_du_commerce`. La seconde assertion (« le fichier porte
la fonction ») est maintenant exercée, alors qu'elle ne l'était pas.

**Règle** : un garde se juge au refus qu'on a provoqué. Et quand une mutation
peut viser soit le vide, soit une mauvaise réponse, faire viser la mauvaise
réponse — c'est elle qui ressemble au vrai.

### 32.4 Une limite d'outillage se remesure, elle ne se récite pas

`PROGRESS.md` portait, depuis plusieurs sessions : « pas de `psql`, pas de
Supabase CLI, pas de chaîne de connexion : **aucune** migration exécutable ici ».
C'était vrai un jour. Ce ne l'était plus : le serveur MCP Supabase exécute le
SQL, et `0003`, `0004`, `0005` puis `0006` ont été appliquées **et mesurées** par
ce chemin — `has_table_privilege`, `pg_get_constraintdef`, `pg_policy`,
`pg_constraint`, et des refus réels (`23514`, `23503`).

Une phrase de blocage recopiée finit par interdire des tâches possibles, et elle
a un coût particulier : elle **excuse** l'absence de preuve. « Je ne peux pas
exécuter » dispense de mesurer, donc de découvrir que la mesure contredit.

**Règle** : toute limite d'outillage consignée porte une **date de dernière
vérification**. Avant de la réciter, la retester — une commande suffit, et le
résultat vaut mieux que le souvenir.


## 33. Le fichier n'est pas ce qui tourne — et un mutant peut ressembler à un arbre sale (2026-11-01, `0007`)

`0007` devait brancher « Cartes » puis le lire. Les deux sont livrés, la base est
restée à 0 ligne, et les trois leçons qui restent ne parlent presque pas de SQL :
elles parlent de ce qu'on croit avoir exécuté, de ce qu'un mutant prouve, et de
ce qu'une garde mesure quand le défaut a deux endroits.

### 33.1 Le fichier et la base ne sont pas le même texte — et l'écart se mesure

Premier passage : `apply_migration` a réussi, les deux fonctions existaient, les
droits étaient bons. Puis `md5(prosrc)` a été comparé au corps du fichier :
`1644` et `4053` **caractères** en base, `1822` et `4070` **octets** dans le
fichier. J'avais collé les corps **sans leurs commentaires**.

Rien n'aurait échoué : le SQL était valide, les tests statiques lisaient le
fichier, et l'écran aurait fonctionné. La dérive était **documentaire** — la
base aurait porté une version sans les deux commentaires qui expliquent
`STAFF_NOT_FOUND` et « Cartes », et personne ne l'aurait su.

La correction est un second passage **exact**, puis la même mesure : md5
identiques au fichier. L'écart de longueur qui subsiste est `length()`
(caractères) contre md5 (octets) : deux unités, un seul contenu.

**Règle** : après avoir appliqué une migration, comparer ce qui tourne à ce qui
est écrit — `md5(prosrc)` contre le bloc du fichier. « La fonction existe » est
une mesure d'existence, pas d'identité.

### 33.2 Un mutant qui recopie une ligne voisine est indiscernable d'un arbre sale

Trois mutants ont été écrits ainsi : « 30 jours devient 7 » (mais
`interval '7 days'` existe déjà pour `7j`), « `anon` lit le classement » (mais
`to anon, authenticated, service_role` existe déjà pour l'inscription), « `anon`
perd l'inscription » (mais `to authenticated, service_role` existe déjà pour le
classement). Le harnais a **refusé de démarrer** :

    M53 : le texte muté est déjà présent dans migrations/0007_equipe_lecture.sql (arbre sale ?)
    Aucune mesure n'a été prise : une mutation qui ne s'applique pas ne prouve rien (§27.4).

Il avait raison, et la tentation était de désactiver la garde « puisque ce sont
de vrais mutants ». La bonne réponse est ailleurs : **un mutant doit être
globalement absent**. M53 est devenu « 30 → 90 jours », M58 révoque `anon` au
lieu de l'ajouter, M64 rend l'inscription à `service_role` seul. Trois fautes
tout aussi plausibles, trois textes qui n'existent nulle part.

**Règle** : quand la faute honnête recopie une ligne voisine, changer la
**valeur** du mutant, pas la garde. Un mutant présent dans l'arbre ne se
distingue pas d'une campagne morte au milieu.


### 33.3 Une garde écrite pour une jointure mesure une jointure

Première campagne contre `0007` : **63/64**. La non-détectée était
`is not distinct from` → `=` dans la jointure des scans. La garde existait :

    assert.match(corps, /is not distinct from/i, 'la jointure doit apparier le null')

Elle passait encore, parce que la **carte des clients** utilise la même clause.
Le défaut réel — le titulaire perd ses scans, ses points et son CA — n'était donc
couvert qu'à moitié, et la moitié restante ressemblait à une garde.

Correction : compter les **deux** appariements (`assert.equal(apparitions, 2)`).
La mutation tombe, et la garde dit maintenant combien elle en attend.

**Règle** : quand un défaut peut se produire à N endroits symétriques,
l'assertion compte N. Un `match` sur un motif répété mesure le premier endroit
qu'il trouve et certifie les autres.

### 33.4 Ajouter un paramètre facultatif à une RPC n'est pas un ajout

`join_loyalty_program` était `(varchar)`. La nouvelle est `(varchar, uuid)`. Un
`create or replace` avec une signature différente ne remplace pas : il **crée
une seconde fonction**. Deux candidates acceptant `{ p_slug }` (la seconde par
valeur par défaut), c'est une ambiguïté côté PostgREST — et elle se paie à
l'adhésion, c'est-à-dire au moment où le client découvre le produit.

D'où `drop function if exists public.join_loyalty_program(varchar);` juste après
la création. Mesuré ensuite : une seule fonction, et
`to_regprocedure('public.join_loyalty_program(character varying)')` → **NULL**.
L'appelant existant (`{ p_slug }`) continue de fonctionner grâce au `default
null`.

**Règle** : sur une fonction publiée, un paramètre facultatif est une
**surcharge**, pas une extension. On retire l'ancienne signature dans la même
transaction, et on prouve sa disparition par `to_regprocedure`, pas par
l'absence de symptôme.

### 33.5 Une définition qui a besoin d'un contexte absent se déclare, elle ne s'invente pas

« Un jour précis » est une fenêtre, donc deux bornes ; `created_at` est un
`timestamptz`, donc les bornes dépendent d'un fuseau. Or aucune table ne porte
le fuseau du commerce (mesuré : `loyalty_programs` n'a ni `timezone` ni
`region`).

Trois issues, et deux sont des pièges : supposer `UTC` en silence (l'écran
mentira d'une heure sur les ventes de fin de soirée), ou choisir un fuseau
« raisonnable » (`Africa/Casablanca`) — un modèle inventé dans une colonne qui
n'existe pas. La troisième : `p_fuseau` en argument, défaut `UTC`, et la valeur
**appliquée rendue** dans `periode.fuseau`.

La mesure a même contredit l'intuition : sur ce `tzdata`, `Africa/Casablanca`
résout `2026-10-30` à `+00`, alors que `Europe/Paris` donne `23:00Z` et
`Asia/Tokyo` `15:00Z`. Le mécanisme est juste ; c'est le calendrier qui n'est pas
celui qu'on croyait. Déléguer à `tzdata` vaut mieux que coder « +1 ».

**Règle** : une fenêtre dont la définition dépend d'un contexte que la base ne
porte pas s'expose en paramètre **et** se rend dans la réponse. Un défaut
silencieux est une définition que personne ne relit.

### 33.6 Pour un mot qui peut dire deux choses, la preuve est un écart

« Cartes » est un mot qui peut compter des cartes. Un test qui vérifie « la
fonction lit `clients` » prouve la forme, pas le nombre. Le jeu de sonde a donc
été construit pour que **les deux lectures diffèrent** : 3 clients, 2 désignés,
et une **seconde carte** ajoutée exprès à un client désigné — soit **4 cartes**
en base. La fonction rend `2`. Compter `loyalty_cards` aurait rendu `4`, sous le
même libellé.

Deux autres écarts du même jeu : la caisse **désactivée** garde son histoire
(`actif: false`, `scans: 1`) — désactiver n'efface pas ; et après le refus
`STAFF_NOT_FOUND`, `clients` reste à 3 — un refus ne laisse pas de client
derrière lui.

**Règle** : quand un libellé peut recevoir deux définitions, construire un jeu
où les deux nombres **diffèrent**, et publier les deux. Une assertion sur la
source ne dit rien sur le chiffre.


### 33.7 Une campagne qui mute pendant qu'une suite lit mesure un arbre qui bouge

Dernière vérification : la suite complète et la campagne de mutations lancées
dans le **même appel**. Résultat affiché : un échec
(`actual: false, expected: true`). Ce n'était pas une régression : la campagne
écrivait un mutant dans `migrations/0007…` à l'instant où `node --test` relisait
le même fichier. Relancée seule après la fin de la campagne (marqueur absent),
la suite rend **494 pass, 0 fail, 1 skip**.

Le harnais protège contre un arbre sale **au démarrage** et restaure **à la
sortie** ; il ne peut rien contre un lecteur concurrent, parce qu'il n'a pas été
écrit pour ça. Et deux commandes envoyées ensemble ne s'exécutent pas
nécessairement l'une après l'autre.

**Règle** : un outil qui réécrit des fichiers et un outil qui les lit ne
partagent pas le même instant. Les lancer en séquence, et lire le **marqueur**
(`tools/rea/.campagne-mutations.etat`) avant de conclure quoi que ce soit sur
l'arbre.


## 34. Un conteneur qui ne démarre pas n'est pas une image cassée — et le disque du moteur n'est pas un dépôt (2026-11-01)

Cette session devait livrer un conteneur pour vérifier le site sur `localhost`.
Elle l'a livré (port **7089**) — et elle a coûté, en route, **tous les conteneurs
et volumes Docker de la machine**. Ce qui suit n'est pas un récit : c'est la
séquence de mesures qui aurait dû arrêter la main avant le redémarrage, et celle
qui a permis de constater les dégâts.

### 34.1 Un démarrage qui n'aboutit pas accuse le moteur, pas votre image

Symptôme : `docker compose up -d` affiche `Created` puis `Starting`, et rien.
`docker ps` ne montre rien ; `docker inspect` dit `created`. Deux réflexes
coûteux étaient possibles : reconstruire l'image, ou changer de port. Les deux
auraient été faux.

La mesure qui tranche tient en une commande — **un conteneur trivial** :

    docker run --rm node:22-bookworm-slim node -v      # pend aussi

Si `node -v` ne rend pas la main, ce n'est pas Next.js, ce n'est pas le
`Dockerfile`, ce n'est pas le port : c'est le moteur. Le journal du backend le
confirme (`usage ContainerStartCliLinux + 1` répété, sans suite), et un
conteneur d'un **autre** projet (`festive_faraday`, `node:24-alpine`) est bloqué
dans le même état — la panne est antérieure et générale.

**Règle** : avant de toucher à sa propre construction, faire démarrer l'image la
plus bête possible. Un échec sur `node -v` déplace le problème du projet vers la
machine, et évite de « réparer » un code qui n'a rien.

### 34.2 Le remède a coûté plus cher que la panne

Le redémarrage de Docker Desktop a fonctionné : `docker run node -v` rend
`v22.23.4`. Mais la liste des conteneurs était **vide**, l'image `node` a dû
être **retéléchargée**, et `docker system df` annonçait `1` image, `0`
conteneur, `0` volume, `0` cache — contre `13` images, `8` conteneurs, `3`
volumes et `28 Go` de cache quelques minutes plus tôt.

Le journal ne laisse aucune place au doute :

    [2026-10-31T23:35:33.937Z][com.docker.backend.rawdisk] creating
        ".../Data/vms/0/data/Docker.raw"

Un disque **neuf** a été créé à cet instant (355 Mo réels, mtime identique), et
il n'existe sur la machine aucun autre disque de VM : `find … -size +1G` ne rend
que celui-là. Sans Time Machine (`tmutil destinationinfo` → *No destinations
configured*) ni instantané APFS utile (`diskutil apfs listSnapshots` → un seul
instantané de mise à jour d'OS), il n'y a **rien à restaurer**.

Ce qui a été perdu, et qu'il faut nommer : trois conteneurs qui tournaient
(`unicity-db-1` — un Postgres avec son volume —, `hammad-ia-web`,
`scraperflow-local`), cinq conteneurs à l'arrêt, treize images, et 28 Go de
cache de build. Les **dépôts** n'ont pas bougé : le code, les `Dockerfile` et
les `docker-compose.yml` sont intacts, donc les images se reconstruisent. Ce qui
ne se reconstruit pas, c'est ce qui n'existait que dans un volume.

**Règle** : avant de redémarrer le moteur Docker, énumérer ce qui ne vit **que**
dans un volume (`docker volume ls`, puis ce que chaque conteneur y a écrit) et
vérifier qu'une sauvegarde existe ailleurs. « `restart: unless-stopped` » protège
un **processus**, pas une **donnée** : au redémarrage, il relance un conteneur
sur un volume qui peut avoir disparu avec le disque.

### 34.3 Ce que `NEXT_PUBLIC_` veut dire quand le code le lit dynamiquement

`web/src/lib/supabase/config.mjs` lit `env?.[NOM_URL]`. Next n'inline que les
accès **littéraux** (`process.env.X`) : un accès par clé calculée n'entre pas
dans les bundles navigateur. Mesure dans l'image : **0** occurrence de
`supabase.co` sous `.next/static`.

Ce n'était pas un défaut, parce que `clientNavigateur()` n'est **appelé nulle
part** : le socle parle à Supabase depuis le serveur. Mais la conséquence reste
vraie pour la suite — si un composant client lit la configuration un jour, il
lira `undefined` dans une image construite sans les valeurs.

**Règle** : une variable `NEXT_PUBLIC_` n'est publique qu'à la **compilation**.
On la passe en `ARG` *et* à l'exécution, puis on **vérifie** sa présence dans les
chunks (`grep` dans `.next/static`) au lieu de supposer que Next s'en charge.

### 34.4 Un port d'hôte se change sans toucher au conteneur

`3000` était déjà pris sur la machine. Le conteneur n'a pas eu à le savoir : il
continue d'écouter `3000` **à l'intérieur** (`PORT`, `EXPOSE`, `HEALTHCHECK`
inchangés), et seul le **mappage** change — `${FIDELIX_PORT:-7089}:3000`.

**Règle** : le port interne appartient à l'image, le port publié appartient à la
machine. Les découpler par une variable (`7089`, `7090` en secours) évite de
reconstruire une image parce qu'un autre projet occupe le port.



## 35. Un layout ne protège que son segment — et une refonte de peau ne se fait pas dans les feuilles mesurées (2026-11-01)

La demande était visuelle : « reprends exactement le design d'Unicity pour le
tableau de bord, en mobile d'abord ». Elle a livré la peau — et deux défauts de
fond qu'aucun test ne voyait, parce que rien ne les regardait.

### 35.1 Un `layout.jsx` ne s'applique qu'à son segment

La garde d'authentification vivait dans
`app/(dashboard)/dashboard/layout.jsx`. Un layout s'applique au **segment** où il
se trouve : celui-là ne couvrait donc que `/dashboard`. Les neuf autres écrans du
groupe — `/customers`, `/rewards`, `/scan`, `/caisses`, `/qrcode`, `/branding`,
`/notifications`, `/reviews`, `/caisse` — n'avaient **ni garde ni coque**.

Mesure, avant correction :

    GET /dashboard   -> 307 /login      (le seul écran couvert)
    GET /customers   -> 200             (sans session, avec la liste à l'écran)
    GET /caisses     -> 200

Aucune donnée ne fuyait — la RLS refusait la lecture, et l'écran affichait son
bloc « refus ». Mais une page qui répond 200 sans session **est** publique : elle
expose sa structure, ses libellés et son état, et le jour où la lecture passe par
`service_role`, elle expose les données.

La correction tient en un déplacement : la garde va dans
`app/(dashboard)/layout.jsx`, le layout du **groupe**, qui couvre tous les
segments. Mesure, après correction : les quatre routes ci-dessus répondent 307.

**Règle** : une garde se pose au niveau du **groupe**, jamais du segment, dès
qu'il existe plus d'une page. Et le test qui la vérifie doit lire le layout du
groupe **et** refuser qu'une garde de segment réapparaisse — sinon la prochaine
page ajoutée hérite du trou sans que rien ne rougisse.

### 35.2 `NODE_ENV` est figé à la compilation : l'écran de vérification était invérifiable

`/apercu` s'ouvrait avec `if (process.env.NODE_ENV === 'production') notFound()`.
Next **remplace** `process.env.NODE_ENV` à la compilation : dans l'image de
production, la valeur est `"production"` quoi qu'on passe à `docker run -e`.
L'écran qui sert à *voir* le rendu était donc le seul qu'on ne pouvait pas voir
là où on en avait besoin — dans le conteneur. Mesuré : `docker run -e
NODE_ENV=development` → `404`.

**Règle** : pour rendre un écran de vérification accessible dans une image de
production, la fermeture doit tenir à une variable **lue à l'exécution**
(`FIDELIX_APERCU=1`), jamais à `NODE_ENV`. Fermé par défaut, ouvrable
explicitement, et le test vérifie que l'exception existe *et* qu'elle est
fermée sans le drapeau.

### 35.3 Une refonte de peau ne touche pas les feuilles mesurées

`tokens.css`, `verre.css`, `nuit.css` et `polices.css` sont confrontés à la
capture par `verifier-design.mjs`. Y glisser la palette d'Unicity aurait cassé la
CI — à juste titre : ces fichiers ne seraient plus la transcription de la cible.

La peau est donc une **couche ajoutée**, `styles/unicity.css`, avec deux
disciplines :

- **préfixe systématique** `--uc-` / `.uc-`. `tokens.css` définit déjà `--ink`,
  `--accent`, `--font-sans` ; les redéfinir aurait changé la couleur de
  composants voisins sans qu'on l'ait demandé ;
- **absent de `NOTRES`** : la feuille n'est pas comparée à la capture, puisqu'elle
  n'en vient pas. Une déviation non déclarée est une dette ; celle-ci est en
  `docs/design-system.md` §3 bis, avec ses quatre écarts (police, mobile, seuil
  du rail, abandon du verre).

**Règle** : une nouvelle peau est une couche, pas une réécriture. Le jour où
l'ancienne doit disparaître, on supprime une feuille et ses appelants — on ne
démêle pas deux palettes mélangées.

### 35.4 Le mobile d'abord se prouve par les seuils, pas par l'intention

Unicity est écrit en desktop d'abord (`max-width: 760px` → dock masqué). Repris
tel quel, le mobile **perd toute navigation**. La feuille a donc été inversée :
les règles de base décrivent le téléphone, les `@media (min-width: …)` ajoutent
le confort. Quatre seuils, chacun avec une raison :

| Seuil | Ce qui change | Pourquoi |
|---|---|---|
| 480 px | indicateurs 1 → 2 colonnes | deux cartes de 26 px de chiffre tiennent |
| 640 px | libellés de boutons, adresse, héro à 54 px | la place existe |
| 900 px | dock latéral, barre basse retirée | la largeur du rail est repayée par le contenu |
| 1240 px | rail ouvert à 232 px, grille à deux colonnes | en dessous, la colonne de droite écrase le contenu |

**Règle** : `min-width`, jamais `max-width`, quand on part du téléphone — et un
seuil par décision, pas un seuil par élément.

### 35.5 Deux détails qui se voient à l'écran et pas dans un test

- **`CA ()`** : `'CA ({devise})'` avec une devise absente produit une parenthèse
  vide. Trouvé en lisant le HTML rendu, pas en lisant le code. Une clé de repli
  (`'CA'`) a été ajoutée. *Un gabarit dont une variable peut être vide doit
  avoir une variante sans la variable.*
- **`TYPES_CONFIRMATION` sans `recovery`** : le commentaire du fichier affirmait
  que `recovery` y figurait, `confirmation.test.mjs` l'exigeait, et la liste ne
  l'avait pas — le lien de réinitialisation était donc refusé comme « invalide ».
  La date de modification du fichier était **antérieure** à cette session : la
  suite l'a révélé, pas une relecture.

**Règle** : un commentaire qui décrit une garantie n'est pas la garantie. Quand
un test qui passait échoue sans qu'on ait touché son sujet, regarder la date de
modification du **fichier** avant de soupçonner le test.

### 35.6 Ne jamais nettoyer en parallèle de la mesure

`grep -o 'uc-dock' | wc -l` sur le CSS servi a rendu `0`, alors que le même
fichier, lu dans le conteneur, en contenait 16. Cause : la mesure et le
`docker rm` de l'instance d'aperçu avaient été lancés **dans le même appel**, et
la suppression a gagné la course.

**Règle** : une mesure et l'action qui peut l'invalider ne partagent jamais un
appel. Même leçon que la campagne de mutations lancée avec la suite de tests : un

## 36. Un taux « facultatif » n'est pas un taux par défaut — et `''` n'est pas `0` (2026-11-01, `0008`)

La demande était un réglage : « ajouter un champ crédits par euro dans Programme,
en euros ». Trois pièges se sont ouverts en chemin, tous silencieux.

### 36.1 `create or replace` ne remplace pas une signature différente

Ajouter un sixième paramètre à `enregistrer_programme` avec `create or replace`
ne remplace **rien** : Postgres identifie une fonction par son nom **et** ses
types d'arguments. La migration aurait laissé **deux** fonctions, et un appelant
à cinq arguments (l'ancien `donnees.mjs`, un script, un client PostgREST) aurait
continué de choisir la plus ancienne — qui n'écrit pas le taux — sans erreur,
sans log, et sans qu'aucun écran ne montre l'écart. Le taux serait resté au
défaut pour toujours, pendant que l'interface afficherait ce qu'on croyait avoir
enregistré.

    drop function if exists public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb);
    create or replace function public.enregistrer_programme(…, p_credits_par_euro numeric default 1) …

**Règle** : changer une signature = `drop` explicite de l'ancienne, puis
création. Et le test de migration vérifie **l'ordre** des deux instructions, pas
seulement leur présence : un `drop` placé après le `create` supprimerait la
nouvelle fonction.

### 36.2 Un `default` en base n'est pas un défaut dans le formulaire

`credits_par_euro` a un `default 1`. C'est ce qui rend la migration non cassante
pour les lignes existantes. Mais un champ de formulaire qui affiche `1` pour
cette raison est un **mensonge d'affichage** : l'écran doit montrer la valeur
enregistrée, et `1` seulement quand il n'y a encore rien à montrer.

    const taux = Number(donnees?.credits_par_euro ?? 1)
    defaultValue={formaterTaux(taux) || '1'}

`Number(...)` n'est pas décoratif : PostgREST peut rendre un `numeric` en chaîne
(`"1.00"`), et un `<input type="number" value="1.00">` fonctionne, mais toute
comparaison numérique serait devenue une comparaison de texte.

**Règle** : le repli d'un formulaire se justifie par l'absence de **donnée**, et
il se lit dans le code (`?? 1`), pas dans une constante posée à côté.

### 36.3 `Number('')` vaut `0` — et `0` est une valeur légitime

Les points de la caisse devenaient facultatifs : vide = « calcule avec le
barème ». Écrit naïvement, `Number(donnees.get('points'))` transforme le champ
vide en `0`, c'est-à-dire « n'en donne aucun » — l'exact opposé de l'intention,
et rien ne l'aurait signalé (zéro point est un achat valide).

    const pointsSaisis = String(donnees.get('points') ?? '').trim()
    if (pointsSaisis === '') { /* barème */ } else { points = Number(pointsSaisis) }

La distinction se fait sur la **chaîne**, avant toute conversion. `Number('')`
et `Number(null)` valant tous deux `0`, le nombre ne peut pas porter
l'information « je n'ai rien reçu ».

**Règle** : quand `0` est une valeur métier, l'absence ne peut pas vivre dans le
même type. On garde la chaîne jusqu'à la décision.

### 36.4 Un test de raccordement pour ce qu'aucun test unitaire ne voit

Les règles pures (`pointsDepuisMontant`, `creditsParEuroValide`) et le SQL étaient
couverts. Ce qui ne l'était pas : le **raccordement**. Un champ nommé `credits`
dans le JSX et `get('taux')` dans l'action donnent deux fichiers verts et un
réglage sans effet. `taux-conversion.test.mjs` lit donc les trois fichiers
ensemble — page, action, lib — et vérifie que le nom du champ, la clé de refus
(`?etat=credits`) et le paramètre envoyé sont **le même mot**.

**Règle** : entre deux fichiers, le contrat est un **littéral partagé** (un
`name`, une clé d'état, un nom de paramètre). C'est lui qu'on teste, pas la
logique de chaque côté.

### 36.5 Le harnais a refusé de démarrer — pour une entrée morte depuis longtemps

`M1` remplaçait `"  'email_change',\n  TYPE_RECUPERATION,\n"`. Le code avait
changé ( `recovery` écrit en littéral, §35.2 ), donc le motif s'appliquait
**zéro** fois et la campagne s'est arrêtée **avant la première mesure** :

    ARRÊT — l'arbre n'est pas celui qu'annoncent les mutations :
      M1 — `recovery` retiré des types vérifiables : 0 occurrence(s)

C'est le comportement voulu (§27.4) : une mutation qui ne s'applique pas ne
prouve rien, et un test vert obtenu ainsi certifierait un garde qui n'a jamais
servi. La correction est de **réaligner l'entrée sur le code**, jamais de la
désactiver.

**Règle** : une campagne de mutations se relance après toute modification du
code qu'elle cible. Si elle refuse, c'est une **information**, pas une gêne : le
fichier de mutations est lui-même un document daté, et il vieillit.

### 36.6 Ce qui n'a pas pu être mesuré, et qui est dit

Le rendu authentifié de `/caisse` et `/rewards` sur `localhost:7089` n'a pas été
observé : le profil Playwright `.profil-rea` porte une session pour
`fidelix.ma`, et le `.env` ne contient pas de `FIDELIX_COOKIE`. La vérification
s'arrête donc à ce qui est mesurable sans identifiants — `next build` compile,
le conteneur est `healthy`, les trois routes répondent **307 → /login** (aucun
500), les logs sont propres, et les nouveaux libellés sont **présents dans le
chunk servi** (`Crédits par euro`, `Barème`, `uc-choix-cout`, `name:"credits"`,
`.uc-aide`).

**Règle** : une vérification partielle se déclare partielle. « L'artefact
contient le texte » est une preuve de **build** ; « l'écran l'affiche » en est une
autre, et celle-là demande une session.

## 37. Une attente invisible n'est pas une lenteur — et une mémoire courte sans invalidation est un mensonge daté (2026-11-01, latence + `loading.jsx`)

La demande était : « quand je clique dans la barre latérale, il y a un temps de
latence avant de naviguer — trouve d'où ça vient et supprime-le ». Chercher
d'abord, changer ensuite : trois mesures ont suffi à séparer les causes.

### 37.1 Le serveur n'est pas lent ; le réseau l'est

    rendu serveur Next, GET /login          9 ms · 21 ms · 78 ms   (3 tirages)
    RTT Supabase REST  (programme_public)   0,55 · 0,55 · 0,76 · 0,77 · 0,81 s
    RTT Supabase Auth  (auth/v1/health)     0,47 · 0,55 · 0,80 s
    second relevé, après déploiement        1,07 · 0,76 · 0,88 s

Toute page du groupe paie **au moins un** de ces allers-retours : c'est 90 % du
temps perçu, et ce n'est pas du calcul à optimiser.

**Règle** : avant de toucher au rendu, mesurer séparément le calcul local et les
dépendances distantes. Optimiser le serveur ici aurait été du travail invisible.

### 37.2 Rien ne s'affichait pendant l'attente

`find src/app -name 'loading.jsx'` rendait **zéro**. Sans frontière de
chargement, le routeur de Next ne peut rien peindre : l'URL ne change pas, la
page précédente reste figée, et le clic **semble perdu**. La latence ressentie
n'était pas « 0,7 s de trop », c'était « 0,7 s sans réponse ».

Correction : `app/(dashboard)/loading.jsx`, dans le **groupe** — pas dans un
segment, même leçon que la garde (§35.1). Squelette calqué sur la géométrie de
l'en-tête et d'une carte, `role="status"` + `aria-busy`, blocs décoratifs en
`aria-hidden`, texte du dictionnaire.

**Règle** : une attente non montrée est un défaut, même quand le temps est
incompressible. On ne supprime pas 0,7 s de réseau ; on supprime l'impression
que rien ne se passe.

### 37.3 Sans frontière, `prefetch` ne précharge rien d'utile

En Next 16, une route **dynamique** (celle qui lit `cookies()`) n'est préchargée
que jusqu'à la frontière la plus proche. Sans `loading.jsx`, le préchargement
n'avait aucun point d'arrêt à peindre : les dix liens du dock ne servaient à
rien avant le clic. La frontière ajoutée rend le préchargement utile **sans**
forcer `prefetch={true}` — qui aurait déclenché dix rendus serveur au chargement,
soit dix allers-retours à 0,7 s.

**Règle** : `prefetch={true}` sur une route lente est une aggravation, pas une
optimisation. La bonne frontière coûte moins cher que le préchargement forcé.


`0` obtenu pendant qu'on démonte la cible ne mesure rien.


### 37.4 Deux lectures indépendantes enchaînées coûtent deux fois le prix

`/scan` faisait :

    const carte = jeton ? await carteParToken(jeton) : null
    const programme = await programmeDuCommerce()

Deux RPC **sans dépendance** — la carte ne sert pas à trouver le barème — donc
deux fois 0,7 s pour un écran qui pouvait en payer une. Corrigé par
`Promise.all`. Le contrat de forme compte : `allSettled` aurait rendu
`{status, value}`, `carte.etat` serait devenu `undefined`, et la carte ne se
serait **jamais** affichée — sans erreur (mutation M78).

**Règle** : dans une page serveur, tout `await` qui ne consomme pas le précédent
est un `Promise.all` qui s'ignore.

### 37.5 Une mémoire courte doit refuser les pannes et obéir aux écritures

`programmeDuCommerce()` est lu par quatre écrans à chaque navigation pour une
donnée qui ne change que lorsqu'on l'enregistre. `lib/cache.mjs` (TTL 10 s,
horloge injectable) le mémorise, avec trois décisions **explicites** :

1. **États stables seulement** — `ok`, `absent`, `nonMigre`. Un `indisponible`
   mémorisé dix secondes devient un écran bloqué qui se croit à jour.
2. **L'écriture invalide** — `enregistrerProgramme` vide l'entrée. C'est le seul
   écrivain du programme dans ce socle ; sans cela, l'écran qui vient
   d'enregistrer relirait sa propre valeur périmée, au pire moment.
3. **Le chemin d'écriture ne lit jamais la mémoire** — `crediterPoints` demande
   `{ frais: true }`. Un barème périmé créditerait le mauvais nombre de points,
   et rien à l'écran ne le montrerait.

Limite déclarée : la mémoire vit **par processus**. Avec deux instances, l'une
peut servir une valeur périmée jusqu'à l'expiration du TTL — jamais au-delà.
Aujourd'hui un seul conteneur, donc la limite est théorique ; elle est écrite
pour ne pas le rester par accident.

**Règle** : un cache est un composant à trois contrats (quoi mémoriser, quand
invalider, qui n'a pas le droit de le lire). En écrire deux sur trois produit

### 37.6 Le test qui lit un commentaire : troisième fois, même piège

`assert.equal(source.includes('€'), false)` échouait parce que le commentaire
citait « 3 € ». Puis `/\bbg-coral\b/` échouait parce que le composant expliquait
avoir retiré `bg-coral`. Puis `/role="status"/` **passait** alors que le code ne
l'avait plus — le commentaire, lui, le citait encore.

Les deux premiers cas font un faux rouge, le troisième un **faux vert** — et
c'est le dangereux.

**Règle** : tout test qui juge une **forme de code** retire les commentaires
avant d'assener. Un `grep` sur un fichier source lit la prose autant que le code,
et la prose décrit ce qu'on a voulu faire, pas ce qui est écrit.

### 37.7 Un composant qui dépend d'une palette morte ne casse pas : il ment

`JaugePoints` peignait sa piste en `bg-white/10` et son remplissage en
`bg-coral`, deux utilitaires de la peau « verre » supprimée par la refonte
Unicity. Résultat sur une carte claire : piste **invisible**, remplissage orange
sur un accent bleu, et `font-impact` retombant sur une police système. Aucun
test rouge, aucune erreur : le composant rendait, les chiffres étaient justes,
l'écran était faux.

**Règle** : après un changement de peau, chercher les utilitaires de l'ancienne
(`grep -n 'bg-coral\|font-impact\|bg-white/'`) dans les composants, pas seulement
dans les feuilles. Un composant doit dépendre des classes de la peau servie.

### 37.8 Ce qui n'a pas été mesuré, et qui est dit

Le rendu **authentifié** de `/caisse`, `/qrcode`, `/rewards` et `/scan` n'a pas
été observé sur `localhost:7089` : le profil Playwright `.profil-rea` porte une
session `fidelix.ma`, `.env` n'a pas de `FIDELIX_COOKIE`, et `/apercu` est fermé
par `FIDELIX_APERCU=1`. La vérification s'arrête à : `next build` compile,
conteneur `healthy`, cinq routes répondent sans 500, et les nouveaux fragments
sont **dans l'artefact servi** (`.uc-squelette` dans le CSS, chunk
`src_app_(dashboard)_loading_jsx_*.js`, `uc-affiche-lien`, `uc-solde-val`,
`window.print`).

**Règle** : la preuve d'artefact et la preuve d'écran sont deux choses. La
première se fait sans identifiants, la seconde non — et le manque se déclare.

une donnée fausse, pas une lenteur.

## 38. Un refus n'est pas une panne, et une promesse d'écran sans geste est un mensonge (2026-11-01, `/caisses`)

L'écran Équipe était la dernière dette de R3 : le modèle (`0006`) et la lecture
(`0007`) existaient, l'écran n'existait pas. Trois mesures ont décidé du
contraire de ce que le code allait faire.

### 38.1 Le texte brut d'une capture ne suffit pas à décider d'une cellule

Le texte de `a09-caisses.html` donnait, dans l'ordre : `Titulaire`, `Vous`, `0`,
`1`, `8`, `40 €`, `0`. On pouvait en conclure « le titulaire s'appelle Vous »,
ou « la colonne `#` contient 1 ». **Les deux étaient faux.** Lire la ligne du
HTML a montré :

    <td …><svg class="lucide lucide-trophy … text-amber-500">…</svg></td>
    <td …>Titulaire<span class="rounded-full …">Vous</span></td>

`#` porte un **trophée** ; « Titulaire » est le **nom** et « Vous » la
**pastille**. Une projection faite sur le texte aurait produit une colonne de
rangs chiffrés et une ligne mal nommée — deux écarts que personne n'aurait
signalés, parce qu'aucun des deux ne casse.

**Règle** : quand une cellule peut se lire de deux façons, la capture brute
tranche avant l'écriture. Le texte aplati perd exactement l'information
nécessaire.

### 38.2 La même lecture a montré un geste qu'on ne pouvait pas tenir

La ligne portait `role="button"` et `aria-label="Voir les opérations de
Titulaire"`, et sous le tableau : « Touchez une ligne pour voir le détail de ses
opérations. » Il faut une RPC par caisse pour l'honorer. Deux options :

   1. rendre la ligne cliquable, et laisser le clic ne rien faire ;
   2. rendre la phrase, et laisser le doigt ne rien trouver.

Les deux sont pires que l'absence : elles **promettent**. L'écran n'affiche donc
ni `role="button"`, ni la phrase, ni le formulaire « Nouvelle caisse » (aucune
écriture de `staff` n'existe) — mais une phrase qui dit pourquoi le formulaire
manque.

**Règle** : une capture décrit ce qu'un écran **fait**, pas seulement ce qu'il
montre. Reproduire le texte d'un geste qu'on n'implémente pas, c'est mentir avec
la copie exacte de la vérité.

### 38.3 Un test qui cherche un jeton le trouve ailleurs — et la mutation survit

M85 remplaçait `<span className="uc-sr">` par `<span className="uc-muet">` dans
la colonne `#`. La campagne a rendu **89/90** : le test était vert. La cause :

```js
assert.match(code, /className="uc-sr"/)   // ← le `caption` de la table le porte aussi
```

L'assertion ne jugeait pas l'annonce du rang, elle jugeait la présence d'une
chaîne **quelque part** dans le fichier. C'est le faux vert du §37.6 sous une
troisième forme : après le commentaire qui cite la classe et le `grep` qui lit la
prose, voici **l'attribut porté par un autre élément**.

Le motif est devenu l'**association** :

```js
/<span className="uc-sr">\s*\{t\('page\.equipe\.rang', \{ rang: ligne\.rang \}\)\}/
```

**Règle** : une assertion de forme doit lier le conteneur et son contenu. Un
jeton isolé est presque toujours porté par autre chose — et c'est cet autre
chose que le test protège, pendant que le vrai sujet peut disparaître.

### 38.4 Un refus n'est pas une panne

`0007` lève `PERIODE_INCONNUE`, `JOUR_MANQUANT`, `FUSEAU_INCONNU` — trois refus
mesurés. `donnees.mjs` ne les connaissait pas : ils tombaient dans
`indisponible`, et une faute d'URL affichait « la base ne répond pas » alors
qu'elle avait répondu très clairement. Trois entrées dans `CODES_CONNUS` ont
suffi (M88 : les retirer fait rougir un test).

**Règle** : chaque code que la base lève **volontairement** doit avoir un état
d'écran distinct de la panne. Un refus mal classé envoie chercher au mauvais
endroit — et c'est un humain qui cherche.

### 38.5 Ce que l'écran sait mieux que la base : ne pas appeler

« Un jour précis » sans date ferait lever `JOUR_MANQUANT`. L'écran, lui, sait
qu'il manque un jour **avant** d'émettre la requête : il affiche le champ de
date et ne lit rien. Ce n'est pas une optimisation, c'est une distinction —
« il manque une information » n'est pas « la base a refusé ».

Deuxième face de la même règle : `p_jour` n'est **envoyé** que pour `jour`, et
l'argument absent laisse jouer le `default null` de la fonction (M87). Un
argument transmis « pour faire complet » est un argument qui peut mentir le jour
où le défaut change.

### 38.6 Une copie mesurée peut contenir une décision

Le paragraphe mesuré dit : « C'est le geste qui installe **Fidelix** dans votre
commerce ». La phrase est mesurée, le nom ne peut pas l'être — la décision de
nommage (`basal-knowledge.md` §14) interdit de le réutiliser. Le dictionnaire
porte donc la phrase **au mot près**, avec `{marque}` à la place du nom, et le
test compare les deux formes après substitution.

**Règle** : mesuré et recopiable ne sont pas synonymes. Ce qu'on recopie, c'est
la phrase ; ce qu'on remplace, c'est ce que le projet a décidé de ne pas être.


## 39. Une dette « à mesurer avant d'écrire » peut finir en « à écrire » — et un refus absent de la liste des refus est une panne (2026-11-01, choix de la caisse, `0009`)

La dette était écrite ainsi : « `0007` sait recevoir `p_staff_id`, aucune page ne
l'envoie ; **à mesurer** (la cible a-t-elle ce choix sur la page publique ?) avant
d'être écrite. » La mesure a répondu oui, et en trois minutes. Le risque, ici,
n'était pas de se tromper : c'était de **chercher une capture au lieu d'un
chunk**.

### 39.1 Un champ de formulaire n'est pas dans le texte de la page, il est dans le chunk

`p17-join.html` porte bien `<label id="qui-vous-a-servi">Qui vous a servi ?`,
mais ce que le HTML ne dit pas, c'est **le comportement** : sélection unique,
défaisable (`onClick: () => set(O === e.id ? void 0 : e.id)`), rendu conditionné
à `A.length>0`, classes de l'état choisi. Tout cela vit dans
`assets/_next_static_chunks_app_join_%5Bslug%5D_page-….js`.

Un `grep` sur la page rendait six boutons et aucune sémantique ; un `grep` sur le
chunk a rendu **l'interface entière**, y compris ce qu'il ne fallait *pas*
reproduire (un `<select>` n'aurait jamais défait un choix).

**Règle** : pour un contrôle interactif, la capture de page donne le **mot** et
la mise en page ; le chunk donne le **geste**. Mesurer les deux avant d'écrire,
sous peine de reproduire une ressemblance.

### 39.2 Le second artefact a corrigé le premier

Le HTML montre `aria-pressed="false"` sur les six puces, ce qui se lit aussi bien
« aucune n'est choisie » que « cette cible n'annonce jamais l'état ». Le chunk
tranche : `aria-pressed={O===e.id}`. Sans lui, on aurait pu livrer six boutons
qui ne disent rien à un lecteur d'écran — et le test de copie aurait été vert.

C'est la règle de §31.2, sous une autre forme : **la même URL a deux captures**,
et celle qui porte le comportement n'est pas celle qui porte le texte.

### 39.3 Le refus existait, la page ne le connaissait pas

`0007` lève `STAFF_NOT_FOUND`. `CODES_CONNUS`, dans `donnees.mjs`, ne le
contenait pas — donc le refus tombait dans **`indisponible`**, et le client
lisait « la base ne répond pas » alors qu'elle venait de répondre, très
clairement. La faute dormait depuis `0007`, invisible, parce qu'aucun chemin
n'envoyait de caisse : **un code de refus qu'aucun appelant ne peut déclencher
n'est pas un chemin mort, c'est un test manquant.**

**Règle** : quand on écrit enfin l'appelant d'un refus déjà livré, la première
ligne à changer est la **table des refus**, pas le formulaire. Sinon l'écran
ment sur la cause, ce qui est pire que de ne rien dire.

### 39.4 Une désignation ne doit pas coûter une carte

Trois chemins pouvaient perdre l'inscription à cause d'un prénom :

- une caisse supprimée entre l'affichage et l'envoi → `STAFF_NOT_FOUND`, aucune
  carte créée (la fonction refuse **avant** d'écrire) ;
- un champ falsifié → même refus ;
- une liste relue comme illisible → aucune caisse transmise, et c'est le bon
  comportement.

Les deux premiers sont traités par deux règles distinctes, et c'est volontaire :
la **validation contre la liste affichée** empêche d'envoyer ce qu'on n'a pas
montré ; la **reprise unique sans désignation** rattrape la course qui reste.
Une seule des deux laisserait un trou : valider sans reprise perd la carte sur
une suppression vieille de deux secondes ; reprendre sans valider envoie des
identifiants que l'écran n'a jamais montrés.

Et la perte **se dit** (`?sansDesignation=1`), parce qu'abandonner en silence un
choix explicite est exactement le défaut que §38 vient de nommer.

**Règle** : une donnée **facultative** qui échoue ne doit jamais faire échouer
l'opération **obligatoire** — et l'abandon se déclare, il ne s'excuse pas.

### 39.5 Un test d'ordre qui lit le premier `order by` mesure le mauvais ordre

Deux tests neufs sont passés au rouge pour de bonnes raisons, et les deux fautes
étaient dans les tests :

1. `CAISSES.match(/order\s+by\s+([^\n)]+)/)` prenait le premier `order by` de la
   fonction — celui du **programme**, pas celui de la liste. Il aurait pu rester
   vert après suppression de l'ordre des prénoms. Corrigé en ancrant sur
   `json_build_object(… ) order by` ;
2. le contrôle « aucun libellé dans le SQL » lisait le fichier **entier**, donc
   l'en-tête qui cite la capture mot pour mot. Faux rouge ici ; et surtout, la
   même erreur produit un **faux vert** partout où la prose contient le mot
   cherché. Corrigé en lisant le code hors commentaires.

**Règle** : un motif qui peut s'appliquer à un autre endroit du fichier ne
prouve rien à l'endroit visé (§37.6). On ancre sur le voisinage, jamais sur
« quelque part dans le fichier ».

### 39.6 `new URL` décode les crochets d'un nom de capture

`app_join_%5Bslug%5D_page-….js` : `new URL(chemin, import.meta.url)` transforme
`%5B` en `[`, et le fichier n'existe plus. Le test échoue alors sur un `ENOENT`
qui ne dit rien de ce qu'il mesurait — et la tentation est de conclure que la
capture a disparu.

**Règle** : pour un chemin de fichier, `resolve(dirname(fileURLToPath(...)), …)`,
jamais `new URL`. Le pourcent-encodage appartient aux URL, et ces noms de
capture en portent.



### 40. La densité de commentaire est un budget, pas une politesse

Mesuré sur `0011` : un en-tête de **78 lignes** et trois blocs de 10 à 20 lignes
pour 13 colonnes — plus de commentaire que de SQL. Le défaut n'est pas le volume,
c'est que ces lignes **recopiaient la mesure** (les 14 `name`, les bornes, l'ordre
des refus) au lieu de la **citer**. Une liste recopiée d'une capture est périmée
dès que la cible bouge, et elle est déjà dans la capture.

**Règle** : 1 à 4 lignes par bloc, jamais plus de 10 en tête de fichier. On garde
la **référence** (`_captures/…/c01-settings.html`, `0011`, un code d'erreur) et la
**raison** d'un choix non évident ; le récit de la passe va dans `PROGRESS.md`.
Une décision non implémentée tient en une phrase. En cas de doute : supprimer —
un commentaire absent ne ment jamais. Appliqué le 2026-11-02 : `0011` passé de
~330 à 256 lignes, dont 45 de commentaire (17 %).

### 41. Un DOM ne dit pas tout : le chunk de la page dit le reste (2026-11-02)

`/branding` illustre un partage qu'on avait déjà rencontré sur `/billing` mais
jamais aussi net. Le DOM rendu donne **trois** sections, un chapeau, un aperçu et
un bouton. Le chunk applicatif de la même page donne ce qu'aucune capture de
rendu ne peut donner : les **dix** valeurs de types avec leurs emojis, les
**huit** couleurs dans l'ordre, le schéma zod (`name: min(2)`,
`^#[0-9A-Fa-f]{6}$`), les **noms de colonnes** écrits par `POST /api/branding/save`,
les défauts (`#1a1a1a`, `restaurant`) et une section entière que le DOM ne montre
pas (« 4 · Tampons par carte »), parce qu'elle n'existe que pour un programme à
tampons — la capture, elle, est un programme à points.

**Règle** : pour un écran, lire **les deux** — le rendu pour l'ordre, les textes
et les attributs ; le chunk pour les bornes, les valeurs des listes et le contrat
d'écriture. Une valeur qu'on ne trouve que dans le rendu est une valeur qu'on ne
peut pas dater ; une valeur qu'on ne trouve que dans le chunk est une valeur dont
on ne sait pas si elle s'affiche.

**Corollaire — lire la condition, pas seulement la section.** La section 4 existe
dans le chunk et **pas** dans le rendu : conclure « la cible ne l'a pas » aurait
été faux, conclure « il faut la rendre » aussi. C'est la condition (`type ===
"stamps"`) qui tranche, et c'est elle qui a permis de nommer la dette (P0-6b)
au lieu de la rendre sans consommateur.

### 42. Un écran ne se juge pas branché parce qu'il écrit (2026-11-02)

Trois réglages de `/branding` (`stamps_total`, `stamp_icon`, `style_bandeau`)
étaient **prêts à écrire** en une heure. Ils ne sont pas rendus : aucun écran de
ce socle ne dessine de grille de tampons, la caisse crédite des points. Un
formulaire qui enregistre une valeur que personne ne lit passe tous les tests de
données — c'est exactement l'interrupteur inerte refusé pour `/automations`, et
il ne se voit qu'en posant la question « **qui consomme cette valeur ?** ».

**Règle** : avant d'ajouter un champ, nommer son consommateur. S'il n'y en a pas,
la bonne sortie n'est pas « on verra » mais une **dette nommée avec sa condition
de sortie** (ici : une surface qui dessine la grille). La page porte la dette dans
son en-tête, `PROGRESS.md` la porte dans la tâche active, et `apparence.test.mjs`
échoue si le champ réapparaît sans consommateur.

### 43. `PGRST202` ne dit pas « la fonction manque » (2026-11-03)

PostgREST rend **le même** code quand la fonction est absente du cache de schéma
**et** quand elle existe mais que le corps n'envoie pas tous les arguments
attendus. Une sonde qui n'envoie qu'un champ conclut « migration non passée » sur
une fonction parfaitement présente — et l'erreur inverse coûte aussi cher :
croire présente une fonction que le corps d'exemple a simplement mal nommée.

**Règle** : une sonde d'existence envoie **tous** les arguments de la signature,
avec des valeurs qui ne peuvent rien écrire (ici `p_operation_id = null`, que la
fonction refuse **avant** `award_loyalty_points`). Les trois réponses se
distinguent alors : `PGRST202` = absente, `42501` = présente et fermée,
`P0001 OPERATION_ID_MANQUANT` = présente et **atteinte par `anon`** — donc
`GRANT` plus large que la migration ne le déclare. Encodé dans
`tools/rea/idempotence.mjs`, gardé par trois tests.

**Corollaire — `Number(null)` vaut `0`.** Deux réponses *sans* `new_balance` se
comparaient égales, et un second crédit serait passé pour un rejeu absorbé. Un
champ absent n'est pas un champ nul : `entier()` rend `null`, et le verdict
**refuse** de comparer ce qu'il n'a pas lu.

**Corollaire — un recensement bat un décompte mémorisé.** Le backlog disait
« quatre migrations en attente » ; l'OpenAPI en `service_role` en montre **huit**
(`0009`→`0016`). Le nombre avait été recopié d'une session à l'autre, jamais
remesuré. Une liste de migrations en attente se relit dans l'OpenAPI ou ne
s'écrit pas.


### 44. Un collage de migrations se répète avant d'être collé (2026-11-03)

Huit fichiers `begin; … commit;` collés à la main dans un éditeur SQL, c'est huit
occasions de prendre le mauvais fichier, de les mettre dans le mauvais ordre, ou
de s'arrêter au premier `ERROR` sans savoir lequel a échoué. La répétition coûte
vingt minutes et rend la chose mécanique : assembler dans l'ordre, puis exécuter
le résultat dans un Postgres **jetable**, deux fois de suite.

Ce que la répétition a prouvé, et qu'aucune relecture n'aurait dit : les huit
fichiers sont **rejouables** (garde `add column if not exists`, `create table if
not exists`, `drop constraint if exists`), chacun est **sa propre transaction**
(un échec en `0015` laisse `0009`→`0014` acquises), et `anon` ne peut appeler
**que** `caisses_publiques` — la seule ouverture que `0009` revendique.

Ce qu'elle **ne** prouve pas, et qu'il ne faut pas lui faire dire : un stub ne
résout que ce que le DDL résout à la création. Les corps `plpgsql` sont différés,
donc les colonnes réelles de `clients`/`loyalty_cards` et `award_loyalty_points`
ne sont vérifiés qu'en production. Une répétition verte n'est pas une preuve de
sémantique ; c'est une preuve de **collage**.

**Corollaire — une sonde relancée qui rend le même code n'est pas du temps
perdu** : c'est ce qui autorise à ne rien recoder. `PGRST202` revu le soir (exit
`2`) a confirmé que le blocage était toujours le DDL, et que le travail sur le
bundle ne corrigeait pas un bug inexistant.

**Règle** : quand le DDL dépend d'un humain, lui livrer **un** script, **une**
requête de vérification, et les avoir exécutés tous les deux avant lui — en
disant ce que la répétition laisse hors de sa portée.


---

## P0-2b — deux pièges trouvés en exécutant le DDL, pas en le relisant

**2026-11-04, soir.** `migrations/0017_proximite_coordonnees.sql` a été passé
deux fois dans un Postgres 16 jetable (Docker). Les deux erreurs ci-dessous
auraient survécu à toute relecture.

**1. Un `CHECK` qui ne tient pas une paire.** Écrit naturellement :

```sql
check ((latitude is null and longitude is null)
       or (latitude between -90 and 90 and longitude between -180 and 180))
```

`latitude = 33, longitude = null` **passe**. La seconde branche vaut
`TRUE AND NULL = NULL`, et PostgreSQL **accepte** un `CHECK` qui rend `NULL` —
c'est la logique ternaire, pas un bug. La contrainte disait « les bornes » ; elle
ne disait pas « les deux ensemble ». Forme correcte :

```sql
or (latitude is not null and longitude is not null
    and latitude between -90 and 90 and longitude between -180 and 180)
```

**Règle** : une contrainte qui implique **plusieurs** colonnes se teste en
insérant la combinaison à moitié nulle — pas seulement les extrêmes.

**2. `analyse` est un mot-clé.** `with analyse as (…)` → `syntax error at or near
"analyse"` (`ANALYSE` est un synonyme de `ANALYZE`). Renommé `reprise`.

**3. Une reprise qui casse le rejeu.** La migration lit `lien_localisation` puis
la supprime : au second passage, `column p.lien_localisation does not exist`.
Une migration « idempotente » doit garder la **lecture** derrière un garde
(`information_schema.columns` + `execute $reprise$ … $reprise$`), pas seulement
l'écriture (`if not exists`, `if exists`).

**Ce que la répétition a encore prouvé** : les quatre motifs de lien Maps
(`paire`, `@lat,lng`, `?q=`, `!3d…!4d…`) sont réellement repris ; un lien court
reste `null` **et** est compté par un `NOTICE` ; le `REVOKE`/`GRANT` sur la
nouvelle signature laisse `anon` dehors et `authenticated` dedans ; il ne reste
**qu'une** variante de chaque fonction (la suppression de l'ancienne signature
évite la surcharge qui rend PostgREST ambigu).


## 40. Un service worker se teste en l'exécutant — et trois pièges de plomberie (2026-11-04, P0-2b seconde moitié)

**1. `new Date(null)` est une date valide.** `null` vaut l'époque Unix, donc
`new Date(null).getTime()` n'est pas `NaN` : un `formaterDepuis(null)` rendait
« janvier 1970 » sans qu'aucun test ne s'en plaigne. Sur une page de carte, cela
affiche « Membre depuis janvier 1970 » — faux, et crédible. **Le garde doit
porter sur le type** (`typeof iso === 'string'`), pas seulement sur `NaN`.

**2. Un contexte `vm` a ses propres prototypes.** Exécuter `public/sw.js` dans
`vm.createContext` est la seule façon de tester un service worker (ni build, ni
import) — mais les objets qu'il produit viennent d'un autre *realm*, donc
`assert.deepEqual(options.data, { url: '/' })` échoue sur le **prototype**, pas
sur le contenu. Comparer `{ ...obj }` / `[...arr]`. Corollaire : le test VM a
trouvé un vrai bug — `const cible = new URL(…).href` puis `cible.origin` lit
`undefined` sur une chaîne, donc la comparaison d'onglet ne matchait jamais.
Une relecture ne l'aurait pas vu ; l'exécution si.

**3. Insérer à `insert_line: N` coupe la ligne N.** Trois fichiers ont été
cassés ainsi dans cette passe (`push.mjs`, `page.jsx`, `push.test.mjs`) : un
`export` au milieu d'une fonction, un `}` orphelin en fin de fichier. Le raccord
se vérifie **immédiatement**, pas à la fin : `node --check` pour un `.mjs`,
`next build` pour un `.jsx`. Et pour ajouter du contenu, on ancre sur le texte
(`old_text`) plutôt que sur un numéro de ligne.

**4. Une page publique a besoin d'une clé qui ne s'énumère pas.** `/join` avait
refusé `/card/<code>` (« un second oracle de soldes ») — refus juste, et la
cible ne le fait pas : `/card/test` rend **404**, l'UUID rend **200**. L'UUID
(122 bits) rend la décision réversible sans rouvrir l'oracle ; le code reste
l'identifiant de **scan**, affiché sur la carte, jamais dans l'URL.

**5. Un plafond qui compte la ligne qu'il met à jour se refuse lui-même.**
`count(*) … where card_id = … and endpoint <> p_endpoint` : sans la seconde
condition, le cinquième appareil légitime est refusé et un réabonnement devient
impossible à la limite. Vérifié en base jetable, pas seulement en test statique.

**Ce que l'exécution a prouvé, sur un Postgres 16 jetable** : `0018` et `0019`
passent **deux fois** (exit `0`, la seconde avec `NOTICE … already exists`) ;
`carte_publique` rend la carte **sans** le nom de famille présent en base ;
`null` et UUID inconnu sortent par le **même** `CARD_NOT_FOUND` ; `anon` a
`EXECUTE`, `PUBLIC` non ; cinq abonnements passent, le sixième sort
`TROP_D_ABONNEMENTS`, le réabonnement passe encore ; supprimer la carte emporte
ses abonnements.


