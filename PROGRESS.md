# Suivi du Projet : Fidelix — REA puis reconstruction isofonctionnelle

> **Projet autonome.** N'écrit jamais dans `UNICITY/`. Le protocole (capture
> empreintée, preuve > mémoire) est hérité d'Onify, les fichiers ne le sont pas.

## 📍 Statut Actuel
- **2026-11-09 (session 9) — le compte réel ne se connectait pas : c'est l'edge,
  pas l'application. `502 upstream sent too big header`.**
  *Symptôme discriminant* : `hidayacine01@gmail.com` + bon mot de passe ⇒ page
  d'erreur, quand un compte d'épreuve passe. Le journal de l'edge donnait la
  réponse, **trois fois**, à chaque tentative (23:48:08, 23:50:25, 23:51:23) :
  `[error] upstream sent too big header while reading response header from
  upstream` puis `POST /login 502`. Le conteneur, lui, **n'avait aucune erreur** :
  la connexion réussissait côté application, c'est OpenResty qui refusait la
  **réponse**.
  *Pourquoi* : le vhost (auto-généré, `openship-vhost-gen: 4`) ne déclare aucun
  `proxy_buffer_size` ⇒ défaut **4 k**. Le bloc `Set-Cookie` d'une session
  Supabase (`@supabase/ssr` découpe le jeton en morceaux de 3 180 o, et le
  cookie porte la session **entière**, `user` compris) dépasse ce tampon dès que
  le jeton est un peu gros. Le compte réel a **281 o** de `user_metadata`
  (`phone`, `full_name`, deux consentements) ; mon premier compte d'épreuve en
  avait 26.
  *Preuve contrôlée — même code, même route, seule la taille du jeton change* :
  compte à **296 o** de métadonnée ⇒ `POST /login` **200** (23:52:59) ; compte à
  **2 680 o** ⇒ `POST /login` **502** (23:53:29), page vide et
  « An unexpected response was received from the server » en console. Ce n'est
  donc ni le compte, ni le mot de passe, ni le code applicatif.
  *Correctif, à l'edge* : `client_header_buffer_size 16k`,
  `large_client_header_buffers 4 32k` (le cookie revient dans la requête) et
  `proxy_buffer_size 32k`, `proxy_buffers 8 32k`,
  `proxy_busy_buffers_size 64k` (la réponse), dans les **deux** blocs `server`
  (80 et 443) de `fideliatest-site.conf`, puis `openresty -t` +
  `-s reload` (aucune coupure). **Re-mesure** : le compte à 2 680 o qui venait
  d'échouer ⇒ `POST /login` **200** (23:54:08) puis `/dashboard` rendu.
  *Durabilité, mesurée et corrigée* : le vhost est régénéré à **chaque
  déploiement** — vérifié : après le `git push` de `a261267`, le nouveau
  conteneur `dep_kzAx-frmwijcjxOx` était sain et
  `grep -c proxy_buffer_size` retombait à **0** (les tampons disparaissent). Un
  réglage qui meurt au déploiement suivant n'est pas un correctif, d'où un
  **garde-fou côté VPS** : `/usr/local/bin/fidelia-edge-tampons` (copie de
  `tools/rea/edge-tampons-garde.sh`, idempotent, ne recharge OpenResty **que**
  s'il a modifié le fichier), appelé par cron `*/2 * * * *` et `@reboot`.
  *Preuve du garde-fou* : tampons effacés à la main (`0`), restaurés par cron à
  **00:00:01** — journal `/var/log/fidelia-edge-tampons.log` :
  « tampons d'en-têtes réappliqués puis OpenResty rechargé » — relecture
  **2 + 2**. Une régénération ne peut donc plus casser la connexion en silence
  (fenêtre maximale : deux minutes).
  *Opérations* : `sh tools/rea/edge-tampons.sh` applique tout de suite depuis le
  poste ; `tools/rea/edge-tampons-garde.sh` est le fichier installé sur le VPS.
  *Ce que la session 8 fermait, et ce qu'elle ne fermait pas* : le `400` muet de
  `POST /` (identifiant `y`) est bien réel et corrigé, mais ce n'était **pas**
  la cause du blocage du compte réel — c'était celle de l'essai de 21:06. Deux
  pannes distinctes, deux corrections distinctes.
  *Comptes d'épreuve* : trois créés (26 o, 296 o, 2 680 o), **supprimés** après
  mesure ; aucun trigger sur `auth.users`, aucune ligne métier touchée.


- **2026-11-09 (session 8) — « la connexion affiche une page noire » : la
  soumission partait sur `/`, et c'est mesuré, pas supposé.**
  *Symptôme rapporté* : identifiants saisis ⇒ Chrome affiche « This page
  couldn't load » (page d'erreur **réseau**, pas une 500 Next).
  *Trace conteneur* (`docker logs`, **1** occurrence) : `The Server Reference ID
  did not match the expected format. Received "y"` — un identifiant d'action
  d'**un caractère**, là où le manifeste du build porte 42 hexadécimaux
  (`6058212f…b583fbbb`).
  *Trace edge, à la seconde près* : `GET / 307` → `GET /login 200` →
  **`POST / 400`, 30 octets**, `Referer` **absent** — là où un parcours propre
  donne `POST /login 200` avec `Referer: …/login`.
  *Reproduction exacte, sans identifiants* : `POST /` avec `Next-Action: y`
  rend **400**, `content-length: 30`, corps **vide**,
  `x-nextjs-action-not-found: 1` — byte pour byte ce que le navigateur a reçu.
  *Deux causes, une seule règle* : (1) `/` est **prérendue**
  (`307 → /login`, `cache-control: s-maxage=31536000`) et ne déclare aucune
  action — tout POST y est perdu par construction ; (2) l'identifiant valait
  `y`.
  *Correctif livré* (`38b57c8`, poussé sur `main`, déployé par webhook) :
  `web/src/lib/action-perdue.mjs` (règle **pure** — méthode, chemin, longueur
  d'identifiant : `POST /` ⇒ `/login?etat=reprise` ; id tronqué ⇒ la page
  demandée), branchée dans `proxy.js` en **303** (un 307 rejouerait le POST
  refusé, la boucle serait invisible), `app/page.jsx` en `force-dynamic` (fin du
  cache d'un an), et `?etat=reprise` → `auth.connexion.champsVides` (copie
  **existante** : après ce détour les champs sont réellement vides, donc la
  phrase est vraie — aucune phrase inventée).
  *Preuves après déploiement* : `POST /` + `Next-Action: y` ⇒ **303**
  `location: /login?etat=reprise` (avant : 400/30) ; `POST /dashboard` + id
  tronqué ⇒ **303** `location: /dashboard` ; `GET /` ⇒
  `cache-control: private, no-cache, no-store…` (**plus de `s-maxage`**) ;
  `/login?etat=reprise` ⇒ **200**, message rendu ; `/card/<uuid>` ⇒ **200**.
  **Connexion réelle au navigateur, session neuve** : `/` → `/login` →
  identifiants ⇒ **`/dashboard`** rendu (navigation, bandeau,
  « Votre commerce, en un regard. », « 5 clients sur 30 dans l'offre
  gratuite »), **0 erreur console** ; puis « Déconnexion » ⇒ `/login`, donc une
  action **légitime** d'une route du groupe traverse la garde. Suite
  **868 / 867 ✔ / 0 échec / 1 ignoré** (+7 : `action-perdue.test.mjs`).
  *Instrument d'épreuve, créé puis supprimé* : compte `auth` jetable
  (`epreuve-connexion@fideliatest.invalid` ; **aucun** trigger sur `auth.users`,
  vérifié avant écriture), **supprimé** en fin de mesure — contrôlé : 0
  utilisateur, 0 identité, 0 session restants, et données métier **inchangées**
  (1 programme, 5 cartes, 5 clients, 0 abonnement push, 1 opération de caisse,
  identiques aux baselines du début de session).
  *Ce que la mesure a appris au passage* : un utilisateur inséré en SQL dans
  `auth.users` n'est **pas** authentifiable tant que `confirmation_token`,
  `recovery_token`, `email_change*` et `phone_change*` sont `NULL` — GoTrue
  n'arrive pas à lire la ligne et répond « identifiants refusés ».
  *`0017` n'a **pas** été appliquée* : son pré-vol a été fait (14 paramètres
  vivants, `lien_localisation` = `NULL` sur l'unique programme, baselines
  relevées) et elle reste en attente de la demande explicite.


- **2026-11-09 (session 7) — point 5 CLOS : la configuration URL est reçue, jugée
  conforme, et sa cible prouvée vivante.** Les deux valeurs sont arrivées de la
  console (page « URL Configuration »), recopiées telles quelles :
  `site_url` = **`https://fideliatest.site`** (sans barre finale),
  `uri_allow_list` = **`https://fideliatest.site/**`** (« Total URLs: 1 »).
  *Verdict mesuré*, `node tools/rea/verifier-url-auth.mjs`, code de sortie **0** :
  les **deux** URL que le code envoie sont acceptées **certainement** —
  `…/auth/confirm` **et** `…/auth/confirm?flux=recuperation` — par le motif
  `https://fideliatest.site/**`, sous les deux lectures du joker (`*` traversant
  `/` comme GoTrue, et `**` seul). `site_url` = origine déclarée
  (`NEXT_PUBLIC_SITE_URL`, identique dans `.env` et `web/.env.local`), donc le
  repli ne part pas ailleurs ; aucune barre finale, donc `{{ .SiteURL }}` +
  `/auth/confirm` ne donne pas `//auth/confirm` ; aucun motif n'accepte une
  origine tierce, le « second verrou » de `confirmation.mjs:282` tient.
  *Cible prouvée vivante, sans consommer de jeton* : `/auth/confirm` → **307**
  `/forgot-password?echec=invalide`, et `/auth/confirm?flux=recuperation` →
  **307** identique — la route existe, la requête ne la détourne pas ;
  `/forgot-password?echec=invalide` → **200**, message rendu. `ssl=0` sur tout.
  *Ce qui reste non prouvé, et le restera sans un envoi réel* : que GoTrue
  accepte ce `redirect_to` **à l'exécution** d'un envoi de courriel. Un envoi est
  une écriture (courriel parti) : il n'a pas été fait. La conformité porte donc
  sur la configuration **enregistrée** confrontée aux URL du code, pas sur un
  message reçu. Un seul envoi réel, le jour voulu, la transformera en preuve
  d'exécution.
  *Un avertissement, nommé et bénin* : aucun motif `http://localhost:3000`.
  Conséquence réelle **nulle** aujourd'hui, parce que `NEXT_PUBLIC_SITE_URL`
  vaut `https://fideliatest.site` dans `web/.env.local` : en développement,
  `origineDepuisEntetes` rend l'origine déclarée, pas `localhost`. Le manque ne
  mord que si cette variable est retirée.
  *Outillage livré et vert* : `tools/rea/url-auth.mjs` (juge pur, hors ligne, ne
  recopie aucun domaine : ses URL sortent de `urlConfirmation()` /
  `urlReinitialisation()`) + `tools/rea/verifier-url-auth.mjs` (CLI : lit un JSON,
  n'affiche que les deux clés, n'ouvre ni `.env` ni le réseau — vérifié avec un
  `jwt_secret` parasite dans l'entrée : non affiché) + **20 tests**. Suite
  complète : **861 tests / 860 ✔ / 0 échec / 1 ignoré** (841/840 avant).
  *Re-mesures du même jour, inchangées* : `/login` et `/card/f8cd3881…` → **200**,
  `/` et `/settings` → **307** `/login`, `ssl=0` ; `/auth/v1/settings` → **200**,
  huit clés, toujours **sans** `site_url` ni `uri_allow_list` (c'est pourquoi la
  valeur ne pouvait venir que de la console).


- **2026-11-09 (session 6) — re-mesure de reprise : rien n'a bougé, et la seule
  porte reste humaine.** Mesuré sans écrire : `enregistrer_fiche_etablissement`
  expose toujours **14** paramètres (`p_lien_localisation` compris),
  `loyalty_programs` n'a **ni** `latitude` **ni** `longitude`, et la sonde de
  **résolution** rend **404 `PGRST202`** — *« Searched for the function
  public.enregistrer_fiche_etablissement with parameters p_latitude, p_longitude
  … no matches were found in the schema cache »* — donc **aucun corps de fonction
  n'a été exécuté**. `/login` et `/card/f8cd3881…` → **200**, `/` et `/settings`
  → **307**, `ssl=0` sur les quatre.
  **Le jeton Management n'existe toujours pas** : **0** occurrence de `sbp_` dans
  `.env`, `.env.example`, `web/.env.local`, `web/.env.example`,
  `env.supabase.md`, et **0** variable `SUPABASE_*` dans le shell. Et
  `/auth/v1/settings` → **200** mais **ne publie pas** `site_url` (rendu mesuré :
  `external`, `disable_signup`, `mailer_autoconfirm`, `phone_autoconfirm`,
  `sms_provider`, `saml_enabled`, `passkeys_enabled`) : la configuration URL
  **n'est pas observable** sans jeton. Action humaine, et rien d'autre.
  *Préparé, non appliqué* : `0017` (431 lignes, `sha256 a0ca9d75…0b8ec0e3`) et sa
  garde **10/10 verte** (`node --test tools/rea/tests/migration-0017.test.mjs`) ;
  `loyalty_programs` = **1** ligne (`test1`) avec `lien_localisation` **vide** ⇒
  la reprise de `0017` n'a **rien à convertir**, aucune perte possible.
  *Risque nommé pour le jour où elle sera appliquée* : `0017` réécrit aussi
  `carte_pour_wallet()`, qui porte la page publique `/card/…` (200 aujourd'hui) —
  re-mesurer cette URL fait donc partie de la preuve, pas du confort.
  *Décision du 2026-11-09* : l'action humaine est prise en charge par le
  propriétaire (console Supabase), qui rendra la sortie de
  `GET /v1/projects/sevqegfhmdezsqwvwsam/config/auth` — `site_url` et
  `uri_allow_list`, deux valeurs **non secrètes**. Tant que cette preuve n'est pas
  arrivée, **aucune** affirmation sur la configuration URL ne sera écrite ici.


- **2026-11-08 (nuit, 5) — audit des écrans authentifiés : la bannière de migration
  est morte partout, sauf sur l'enregistrement de `/settings` (`0017` absente).
  Et l'abonnement push de `/card` était cassé pour *tout* corps valide.**
  *Méthode* : pas de session de production (en créer une serait une écriture), donc
  la preuve passe par **trois mesures indépendantes** — les signatures réelles en
  base (`pg_proc`), l'énumération exhaustive des bannières dans le code, et les
  codes rendus par l'API publique.
  1. **Une seule migration manque, et ce n'est pas `0018`/`0019` : c'est `0017`.**
     Mesuré sur `sevqegfhmdezsqwvwsam` : `loyalty_programs` **n'a pas**
     `latitude`/`longitude` et porte toujours `lien_localisation` ;
     `enregistrer_fiche_etablissement` expose **14** paramètres (version `0011`,
     `p_lien_localisation`) au lieu des **15** de `0017`. Tous les autres objets
     attendus sont présents (`operations_caisse`→`0016`, `messages_envoyes`→`0013`,
     `staff`→`0006`, `push_abonnements`→`0019`, les 4 colonnes d'apparence→`0015`,
     `credits_par_euro`→`0008`, `devise`→`0010`). La ligne « les 18 fichiers de
     migration sont à jour » était donc **fausse d'un fichier**.
     **Conséquence unique et précise** : `web/src/lib/donnees.mjs:443` envoie
     `p_latitude`/`p_longitude` ⇒ PostgREST ne peut pas résoudre la fonction ⇒
     `PGRST202` ⇒ état `nonMigre` ⇒ `enregistrer()` redirige sur
     `/settings?etat=migration` et l'écran réclame
     « migrations/0011_fiche_etablissement.sql puis
     migrations/0017_proximite_coordonnees.sql » (l'écran nommait déjà les deux —
     il savait). Le refus est **cité mot pour mot** par PostgREST : l'indice de
     `PGRST202` nomme la signature cherchée (`…p_latitude, p_longitude…`) et propose
     l'ancienne (`…p_lien_localisation…`) — la divergence est donc **lue dans la
     réponse**, pas déduite. La **lecture** reste saine : `fiche_du_commerce()` existe (version
     `0011`), rend `ok`, donc aucune bannière à l'affichage. **Aucune migration
     appliquée** : `0017` ajoute deux colonnes et **supprime** une fonction, c'est
     un changement de schéma en production, hors du mandat « aucune écriture ».
  2. **La bannière de migration est énumérable, et elle est éteinte.** Douze écrans
     portent `<EtatBloque commande="migrations/…">` (`billing`→`0012`,
     `branding`→`0015`, `caisse`→`0003`, `caisses`→`0007`, `customers`→`0004`,
     `notifications`→`0013`, `program`→`0010`, `qrcode`→`0003`, `rewards`→`0003`,
     `scan`→`0003`, `settings`→`0011`+`0017`, `ContenuTableau`→`0005`). Comme
     `donnees.mjs:130` ne rend `nonMigre` **que** sur `PGRST202`, et que les 22 RPC
     utilisées par le code existent toutes, **onze de ces bannières sont
     inatteignables** ; la douzième (`settings`) ne l'est que par l'enregistrement,
     pour la raison du point 1. Vérifié aussi que les arguments omis sont couverts
     par un `DEFAULT` côté base (`equipe_du_commerce` 3/3, `join_loyalty_program`
     2/2, `enregistrer_reglages_programme` et `enfiler_message` 1/1) : sans ces
     défauts, un appel amputé produirait le même `PGRST202` qu'une fonction absente.
     Au passage : **zéro accès direct aux tables** dans `web/src` (`from('…')` :
     aucune occurrence hors de `conversation.md`) — tout passe par RPC, ce qui
     explique pourquoi ce défaut est binaire et dénombrable.
  3. **`/apparence` n'existe pas — la route est `/branding`.** Mesuré :
     `/apparence` → **404**, `/branding` → **307** vers `/login`. Aucun lien interne
     ne pointe vers `/apparence` (seuls `PROGRESS.md` et un import
     `@/components/apparence/` portent le mot) : c'est un **nom d'écran**, pas une
     URL. Les écrans de la mission répondent bien : `/dashboard`, `/caisse`,
     `/rewards`, `/settings`, `/branding` → **307** `/login` (les routes existent et
     le garde d'authentification s'applique) ; `/card/<uuid>` → **200**.
  4. **`/card` — l'abonnement push rendait 503 sur tout corps valide. Trouvé,
     corrigé, prouvé.** Les refus *locaux* sont corrects : corps non-JSON, `{}`,
     `endpoint` en `http://`, `card_id` non-UUID ⇒ **400 `abonnementInvalide`**
     (quatre cas mesurés, aucune écriture — la route refuse **avant** la base).
     Mais un corps **valide** (UUID conforme, `endpoint https`, `p256dh`/`auth`
     base64url aux bonnes bornes) rendait **503 `indisponible`** au lieu du `404
     carteInconnue` attendu. **Cause mesurée, pas devinée** :
     `analyserAbonnement()` rend déjà `{carte,…}`, mais la route le repassait par
     `corpsAbonnement()` — qui décrit l'entrée du **navigateur** (`card_id`) — avant
     de le donner à `enregistrerAbonnementPush()`, qui lit `carte`. Donc
     `carte: undefined` ⇒ `p_card_id: ''` ⇒ la base répond
     **`22P02 invalid input syntax for type uuid: ""`** (vérifié par appel direct de
     la RPC en `anon`), code absent de `CODES_CONNUS` ⇒ `indisponible` ⇒ 503.
     Aggravant : le composant appelle `unsubscribe()` dès que la réponse n'est pas
     `ok` — **chaque tentative valide détruisait l'abonnement du navigateur**.
     Aucune ligne n'a jamais été écrite (`push_abonnements` = **0** avant et après),
     ce qui explique enfin ce zéro permanent.
     *Correctif* : `abonnementDepuisAnalyse(lu)` dans `lib/push.mjs` (le mapping
     manquant, nommé et documenté), utilisé par la route ; deux tests ajoutés
     (mapping + garde de source interdisant
     `enregistrerAbonnementPush(corpsAbonnement…)`). Suite : **841 tests / 840 ✔ /
     0 échec / 1 ignoré** (839/838 avant).
     *Déployé et re-mesuré* (commit **`77a3be5`**, webhook) : au 1ᵉʳ essai encore
     **503** (ancienne image), au 2ᵉ **502** `openship-edge-upstream-down` (le
     redémarrage), au 3ᵉ **404 `{"etat":"carteInconnue"}`** — la route dit enfin ce
     que la base a dit. Les quatre corps invalides rendent toujours **400
     `abonnementInvalide`**, `/login` et `/card/<uuid>` restent **200**, et
     `push_abonnements` reste à **0** avant comme après : **aucune écriture**.
  5. **Supabase → URL Configuration : NON FAITE, et pas faisable d'ici.** Aucun jeton
     d'API Management (`sbp_…`) n'existe sur la machine — ni `.env`, ni
     `env.supabase.md`, ni le dépôt. L'API Management
     (`PATCH /v1/projects/sevqegfhmdezsqwvwsam/config/auth`) est le seul chemin : la
     configuration GoTrue n'est pas en base et `/auth/v1/settings` (mesuré, **200**)
     ne publie pas `site_url`. **Ce que la mesure dit du risque** : l'application
     passe **toujours** un `redirectTo` explicite (`urlConfirmation(origine)` à
     l'inscription, `urlReinitialisation(origineDepuisEntetes(…))` au mot de passe
     oublié) ; le Site URL n'est que le **repli** (`confirmation.mjs:306`) — mais
     GoTrue substitue **aussi** ce repli quand le `redirect_to` demandé n'est pas
     dans l'allowlist. Un Site URL resté sur `localhost` casserait donc les liens de
     confirmation et de réinitialisation. **Action humaine** (une minute, console) :
     *Site URL* = `https://fideliatest.site`, *Redirect URLs* +
     `https://fideliatest.site/**`.

- **2026-11-08 (soir, 4) — `www.fideliatest.site` est sous certificat et redirige
  vers l'apex.** L'`A` parking a été supprimé côté OVH (humain) ; mesuré **à la
  source** : `www` → `141.253.120.188` **seul** sur `ns103.ovh.net` **et** sur
  `8.8.8.8` (aucune trace de `213.186.33.5`, `CNAME` vide). Côté OpenShip, `www`
  n'était **pas déclaré** : l'edge servait `CN=openship-edge-default` et
  **réinitialisait** la connexion (`code=000`, `ssl=1`). Déclaration :
  `POST /api/domains` → `201`, `dom_E5BBkbZGYbFT5jZV`, `redirectTo:
  fideliatest.site`, `redirectStatus: 301` ; l'enregistrement réclamé
  (`A www`) était **déjà** celui en place.
  `POST /api/domains/:id/verify` → `{"verified":true,…,"sslStatus":"active"}`,
  certificat `subject=CN=www.fideliatest.site`, `issuer=YE2`, du **2026-11-08
  19:05** au **2027-02-06**.
  **Le piège, et il valait d'être trouvé** : `add` + `verify` **n'écrivent pas**
  le vhost. `fideliatest-site.conf` restait `server_name fideliatest.site` avec
  un `mtime` (19:55) **antérieur** à la création du domaine (20:04) ⇒ certificat
  par défaut et reset, alors que l'API affichait déjà `sslStatus: active`. Le
  correctif est **sans rebuild** : `POST /api/projects/proj_rB7iSlX1cvWqhDVl
  /routing/retry` (`{"ok":true}`) a écrit un vhost **dédié**
  `www-fideliatest-site.conf` (généré par `openship-vhost-gen: 4`) : blocs
  `listen 80` **et** `listen 443 ssl`, `server_name www.fideliatest.site`,
  `ssl_certificate /etc/letsencrypt/live/www.fideliatest.site/fullchain.pem`, et
  `location / { return 301 https://fideliatest.site$request_uri; }` — aucun
  proxy vers l'application, ce qui est bien le contrat d'une redirection.
  **Mesures** : `www/`, `www/login`, `www/join/test1`,
  `www/card/<uuid>` → **301**, `ssl_verify_result=0` ; en suivant, **200** sur
  l'apex (1 redirection pour `/login`, `/join/test1` et `/card/<uuid>` ; 2 pour
  `/` qui finit sur `/login`). Apex **inchangé** : `/login`, `/card/<uuid>`,
  `/favicon.ico`, `/icon.svg` = **200**, `ssl=0`. Le
  `Connection reset by peer` observé sur `/` juste après le retry était le
  **rechargement nginx** (mesuré 301 sur les quatre chemins quinze secondes plus
  tard) : sur l'edge, re-mesurer avant de conclure. Même chose pendant le
  redéploiement déclenché par le push de suivi : un `302` vers
  `http://www.fideliatest.site` sur `http://www/login` a été vu une fois, puis le
  `301` correct est revenu. **Vérifié aussi en port 80** : `http://www/login` →
  `301 https://fideliatest.site/login`, chaîne suivie → **200** en 1 redirection
  (le vhost `www` porte bien le `return 301` sur `listen 80` **et**
  `listen 443`). Aucun code applicatif touché, aucun déploiement nécessaire.
- **2026-11-08 (soir, 3) — `/card/<uuid>` est VIVANTE en production, et le retard
  de migrations est soldé.** `0018_carte_publique.sql` puis
  `0019_push_abonnements.sql` appliquées à `sevqegfhmdezsqwvwsam` via l'API
  Supabase (MCP `apply_migration`, contenu **verbatim** des fichiers, `begin`/
  `commit` du fichier conservés — une seule transaction chacune, `success: true`
  deux fois). État mesuré **après** : `pg_proc` publique 23 → **25**,
  `carte_publique` = 1, `enregistrer_abonnement_push` = 1,
  `has_function_privilege('anon', …)` = **true** sur les deux,
  `to_regclass('public.push_abonnements')` non nul, `relrowsecurity` = **true**
  avec **0** politique (donc `has_table_privilege('anon', …, 'select')` =
  **false** : la table n'est atteignable que par la RPC `security definer`).
  **Preuve en production** (`curl` sans `--resolve`, DNS enfin propre) :
  `/card/f8cd3881-e125-4b2e-974d-10cff9aba04f` → **200**, `ssl_verify_result=0`,
  15 041 o, `<title>Carte de fidélité — TEST · Fidelia</title>`, `robots
  noindex, nofollow`. Contenu rendu, comparé un à un à la base :
  **`0` points**, « Encore **15** points avant « DESSERT » », « Code client
  **C-FC8273** », « Membre depuis **novembre 2026** », QR 180 px. La charge
  exacte que consomme l'écran (`carte_publique`) est reproduite au SQL :
  `points 0`, `prenom ""`, `programme {TEST, seuil 50}`, paliers
  `15 DESSERT / 30 MENU BEST OF / 50 MENU MAXI BEST OF`. Plus **aucune**
  occurrence de « fonction absente ».
  **Pourquoi ce 200 prouve le `grant` de `0018`** : `clientServeur()` construit
  le client serveur avec `NEXT_PUBLIC_SUPABASE_ANON_KEY`, et `config.mjs`
  **refuse** un JWT de rôle `service_role` dans une variable publique → la RPC
  a voyagé en **`anon`** par PostgREST, sans cookie. Le `grant execute … to anon`
  est donc exercé de bout en bout, pas seulement constaté en base. Corollaire
  mesuré : **aucun `notify pgrst, 'reload schema'` n'a été nécessaire** — la
  fonction créée est apparue immédiatement côté REST.
  **Contrôles négatifs** (tous `404`, `ssl=0`) :
  `/card/00000000-0000-4000-8000-000000000000`, `/card/C-FC8273`,
  `/card/test`, `/card/f8cd3881`. Les refus nommés sont prouvés **au SQL** :
  UUID inconnu → `P0001: CARD_NOT_FOUND` (`carte_publique` l. 20) ; endpoint
  `http://` → `P0001: ABONNEMENT_INVALIDE` (`enregistrer_abonnement_push`
  l. 26) — refus **avant** toute écriture, et les compteurs le confirment :
  `push_abonnements` **0**, `loyalty_cards` **5**, `clients` **5** (inchangés).
  **Rien d'autre n'a été écrit** : ces deux migrations sont les seules
  instructions exécutées, et les deux sont additives (`create or replace
  function` + droits ; `create table if not exists`) — aucune ligne touchée.
  **Aucun code n'a changé**, donc **aucune image rebâtie** : le correctif est
  côté base, il survit à tout redéploiement ; le déploiement actif reste
  `dep_f07khjzI6W79294n` (commit `7656f08`). Suite **839 tests / 838 ✔ / 0
  échec / 1 ignoré**, inchangée. Les gardes `migration-0018.test.mjs` (9 tests)
  et `migration-0019.test.mjs` (12 tests) couvraient déjà les invariants
  **statiques** des deux fichiers ; ce qu'ils ne peuvent pas couvrir — que la
  production soit réellement migrée — c'est la mesure ci-dessus qui le donne.
- **2026-11-08 (soir, 2) — la chaîne publique est prouvée de bout en bout, et le**
  `404 /favicon.ico` est mort.** Le **slug** n'a pas eu besoin d'humain : il a
  été lu par l'API Supabase (projet `sevqegfhmdezsqwvwsam`),
  `select slug, name, active from public.loyalty_programs` → **une seule ligne,
  `test1` / « TEST » / `active = true`**. Le résolveur local rend désormais la
  bonne adresse (local **et** `8.8.8.8` → `141.253.120.188`), donc `curl` sans
  `--resolve` mesure vraiment le site ; les chiffres ci-dessous sont pris ainsi.
  **Production** : `/login` **200**, `/join/test1` **200**
  (`<title>TEST · Fidelia`), `/recompenses/test1` **200** (paliers 15 / 30 / 50),
  `/favicon.ico` **200 `image/x-icon`**, `/icon.svg` **200 `image/svg+xml`**,
  `ssl_verify_result = 0` sur chaque.
  **Pourquoi le favicon manquait** : Next 16 ne crée la route `/favicon.ico` que
  si `app/favicon.ico` existe ; `app/icon.svg` seul n'injecte qu'un `<link>`.
  Ajout de `web/src/app/icon.svg` — jumeau **vectoriel** du raster déjà versionné,
  coordonnées relevées au pixel sur `web/public/icon-192.png` (fond `#1a1a1a`
  plein carré, monogramme `#faf9f8`, barre haute y46→68 jusqu'à x133, médiane
  y84→105 jusqu'à x118, fût x58→72 jusqu'à y145) — et de
  `web/src/app/favicon.ico` (16 / 32 / 48). **Piège mesuré** : le décodeur ICO de
  Turbopack refuse un PNG **RGB** (« Format error decoding Ico: The PNG is not in
  RGBA format! ») et casse `next build` ; les trois entrées sont donc en **RGBA**.
  Garde `tools/rea/tests/icone-onglet.test.mjs` : fidélité raster ↔ vectoriel
  (bbox mesuré), conteneur ICO relu entrée par entrée (signature PNG, IHDR,
  type couleur), et refus d'une seconde déclaration dans `metadata.icons`.
  **Preuve locale avant production** : `next build` puis `next start` (port 3137)
  → `/favicon.ico` 200, `/icon.svg` 200, et les **deux** `<link rel="icon">`
  émis ; puis **production** rend les deux mêmes liens, hachés par Next.
  **Carte créée depuis un contexte mobile vierge** (390×844, Playwright) :
  « Obtenir ma carte » → `/join/test1?carte=**C-FC8273**`, écran « Votre carte est
  créée. » avec QR. En base : `loyalty_cards` 4 → **5**, `clients` 4 → **5**
  (client **anonyme**, `current_points = 0`), carte
  `f8cd3881-e125-4b2e-974d-10cff9aba04f`. **Déploiement** : le push de `df8a1a6`
  a suffi — le webhook OpenShip a créé `dep_AG2ivnSPxggbl_I7` (`trigger:
  webhook`), `ready`, image `openship/fidelia:bld_T2kv2-6Dfd0Bfijs`, conteneur
  `8e98c931ff0a…` ; un `POST /api/deployments` manuel a été refusé en **409
  `DEPLOYMENT_IN_PROGRESS`**, ce qui confirme la file unique. Suite **839 tests,
  838 ✔, 0 échec, 1 ignoré** (le fichier neuf en ajoute 4).
  **Défaut réel trouvé en chemin, NON corrigé** : la base de production est en
  retard de **deux** migrations — `0018_carte_publique.sql` (fonction
  `carte_publique`) et `0019_push_abonnements.sql` (table `push_abonnements`).
  Conséquence mesurée sur `/card/<uuid>` : la page **ne rend pas la carte** mais
  « Cette action appelle une fonction absente de la base. Exécutez le fichier de
  migration indiqué […] `migrations/0018_carte_publique.sql` ». Le retard est
  **ciblé, pas global** : `loyalty_programs` porte déjà les colonnes de
  `0010`/`0011`/`0015`/`0017` (`credits_par_euro`, `lien_localisation`,
  `geofence_*`, `logo_url`, `wallet_bg_url`…), `messages_envoyes` et
  `operations_caisse` existent, et `pg_proc` liste 23 fonctions — il ne manque
  que `carte_publique`, et `to_regclass('public.push_abonnements')` est **nul**.
  `0018` est **purement additif** (`create or replace function` + `revoke`/`grant`
  sous `begin`/`commit`, aucune ligne touchée) et l'application invite elle-même à
  l'exécuter — mais c'est une **écriture de schéma en production**, hors du mandat
  de cette passe (qui n'autorisait qu'une carte de test) → **demandé, pas fait**.
  Note utile : `/card/**C-FC8273**` → **404** est le comportement **voulu** — la
  clé de cette route est l'**UUID**, jamais le code (décision de `0018`, pour ne
  pas offrir un oracle énumérable de soldes).
- **2026-11-08 (soir) — `https://fideliatest.site` est EN LIGNE.** Le DNS OVH
  est corrigé (il fallait supprimer la *redirection* OVH qui réécrivait l'`A`
  vers le parking), la re-vérification rend `sslStatus: active`, et le
  certificat mesuré est `CN=fideliatest.site`, `Let's Encrypt YE1`, valide
  jusqu'au **2027-02-06**. `/login` → **200** avec TLS vérifié,
  `/join/<slug inconnu>` → **404** (voulu). Restent : `www` (non couvert par le
  certificat + `A` résiduel vers `213.186.33.5`), le **slug réel** du programme
  (la base en contient un actif, mais il n'est pas découvrable sans la console
  Supabase), et **Supabase → URL Configuration**. Détail mesuré : section
  « Mise en ligne ».
- **2026-11-08 (nuit) — le dépôt est sur GitHub, OpenShip construit depuis git,
  et le seul reste est le DNS OVH.** `git@github.com:DEVSFAME/FIDELIA.git`
  reçoit `2982a3c` puis `e0797e5` (`main` ; dépôt **public**, donc clonable sans
  credentials). Le projet `proj_rB7iSlX1cvWqhDVl` est branché sur cette source
  (`gitOwner: DEVSFAME`, `gitRepo: FIDELIA`, `gitBranch: main`) et **déployé** :
  `dep_ZwYL8YrkDpPSTat8`, statut `ready`, image
  `openship/fidelia:bld_ohZFjoz4SinE5Kfp`, conteneur
  `openship-fidelia-dep_ZwYL8YrkDpPSTat8` **healthy** sur
  `127.0.0.1:20000->3000`, `activeVersion: 1`.
  **`productionMode: "host"` est honoré** — il se mappe sur
  `workloadType: "web"` (`deployment-class.ts`), donc route vers un port et non
  site de fichiers ; la fiche porte `productionMode: host`, `workloadType: web`,
  `port: 3000`, et le domaine cible `targetPort: 3000` (ce que l'ancien
  classement `static` refusait : « Static deployments cannot expose
  port-targeted routes »).
  **Mesures dans le conteneur** : `/login` **200**, `/join/slug-inexistant`
  **404** (slug inconnu → `notFound`, donc Supabase interroge bien la base côté
  serveur), `/qrcode` **307**. Les 404 de `/card` et `/recompenses` sont
  **corrects** : les routes sont `/card/[cardId]` et `/recompenses/[slug]`.
  **Deux pièges mesurés, corrigés dans `e0797e5` :**
  1. le pré-vol n'accorde install/start au Dockerfile que si
     **`framework === "docker"`** (`preflight.ts`) ; `buildKind: "dockerfile"`
     ne suffit pas et `nextjs` fait exiger `installCommand`/`startCommand` ;
  2. OpenShip affiche « Using Docker build root: web » mais **streamé le dépôt
     entier** comme contexte (42,6 Mo) → `COPY package.json` échouait
     (`"/package.json": not found`). D'où un **`Dockerfile` à la racine**
     (chemins `web/`), un **`.dockerignore`** racine et `rootDirectory: "."` ;
     le garde `domaine-public` interdit désormais que les deux Dockerfiles
     divergent (ARG publiques, CMD).
  **Reste bloqué — une seule action, humaine** : `fideliatest.site` répond
  **`A 213.186.33.5`** (parking OVH) au lieu de `141.253.120.188`. OpenShip le
  dit lui-même : *« Port 80 answered but not with our ACME challenge […] Detail:
  213.186.33.5 »* → `http-01` échoué, `status: failed`, `sslStatus: error`,
  et l'edge n'écrit pas encore de vhost pour ce nom. **Après le changement DNS :
  re-vérifier** (`POST /api/domains/dom_4EPqj1mjGXl2o-s3/verify`) puis contrôler
  `https://fideliatest.site/login`.
  **Re-mesure du 2026-11-08 — le DNS n'a pas bougé, et ce n'est pas de la
  propagation.** Interrogation directe de l'autoritaire (`ns103.ovh.net`,
  `dns103.ovh.net`) : `fideliatest.site A 213.186.33.5`, `www A 213.186.33.5`,
  **aucun `AAAA`**, **aucun wildcard**, TTL 3600. Le TXT de l'apex porte
  `"1|www.fideliatest.site"` — signature d'une **redirection OVH**, qui
  (re)crée l'`A` vers `213.186.33.5` : **la supprimer d'abord**, sinon elle
  écrase les `A`. **Aucun TXT ni CNAME n'est nécessaire** — `http-01` ne lit
  que les `A`. Zone cible : `A @` et `A www` → `141.253.120.188` (le `CNAME www
  → fideliatest.site.` est équivalent au second). **Le VPS est déjà prêt** :
  `http://141.253.120.188/login` avec `Host: fideliatest.site` rend **200** ;
  seul le DNS manque avant `POST /api/domains/dom_4EPqj1mjGXl2o-s3/verify`.
  **Accès** : la CLI `openship` n'existe ni en local ni sur le VPS
  (`packages/openship` non compilé) ; l'API s'authentifie par
  `POST /api/system/cli-session` + `X-Internal-Token` (bootstrap officiel de la
  CLI, `local-cli.controller.ts`).

- **2026-11-08 (soir) — le code passe sur GitHub, et OpenShip bloque sur un
  `workloadType` figé.** `FIDELIX/` devient un dépôt **autonome** (`git init`,
  remote `git@github.com:DEVSFAME/Fidelia.git`, branche `main`) : commit
  `0423979`, **941 fichiers / 44,6 Mo**, **zéro gitlink**, **zéro secret**
  (`.env`, `web/.env.local`, `VPS/SSH/`, `*.key`, `env.supabase.md`,
  `conversation.md`, `VPS/responsiv-knowledge/` — ce dernier portait des `.git`
  imbriqués — sont ignorés). Le dépôt distant **n'existe pas encore** : sa
  création par API est impossible ici (GitHub absent de Composio, pas de
  `gh`, pas de token) alors que la **clé SSH est déjà autorisée** pour
  `DEVSFAME` — la seule action humaine restante est de créer un dépôt **vide**
  `Fidelia`, puis `git push -u origin main` aboutit.
  **Côté OpenShip** : `deploy --folder` échoue en pré-vol avec
  *« Static deployments cannot expose port-targeted routes »*. Cause mesurée en
  lisant la fiche projet via l'API (`/api/projects/<id>`) : `workloadType:
  "static"`, `hasServer: false` — `productionMode: "host"` passé à
  `project create --config` **est ignoré**, et `deploy --folder` ne relit pas
  `openship.json`. Contournement validé : `PATCH /api/projects/<id>` avec
  `{"workloadType":"web","hasServer":true,"hasBuild":true,"productionMode":
  "host"}` passe en **200**. Projet courant `proj_rB7iSlX1cvWqhDVl`, domaine
  `fideliatest.site` attaché (`dom_4EPqj1mjGXl2o-s3`), 3 variables d'env posées.
  **Le déploiement par git devrait rendre ce contournement inutile** : c'est le
  manifeste qui est alors lu. À vérifier au premier `deploy` depuis le dépôt.

- **2026-11-08 — le domaine est fixé : `fideliatest.site` (OVH).** L'origine
  publique cesse d'être une dette. `NEXT_PUBLIC_SITE_URL` est déclarée dans
  `openship.json` (racine de `FIDELIX`), **transmise à l'exécution** par
  `docker-compose.yml`, documentée dans `web/.env.example` (nom seulement) et
  posée dans les `.env` locaux. `marque.domaine` passe de `fidelia.ma`
  (provisoire) au domaine réellement détenu. **7 gardes neuves**
  (`tools/rea/tests/domaine-public.test.mjs`) dont une qui casse si le domaine
  **affiché** et le domaine **déployé** divergent. Suite **835 / 0 échec**,
  `next build` exit 0 (`.next-build`, artefact supprimé), `docker compose
  config` rend `NEXT_PUBLIC_SITE_URL: https://fideliatest.site`.
  **Le déploiement n'est PAS fait** : il demande trois accès qui ne sont pas
  côté agent — console OpenShip, zone DNS OVH, tableau Supabase. Mode opératoire
  complet : **`docs/deploiement-openship-2026-11-08.md`**.
- **Date de dernière mise à jour :** 2026-11-03 (soir — sonde relancée :
  **`PGRST202`, exit `2`**, verdict inchangé ; les huit migrations sont
  **assemblées en un collage** et **répétées dans un Postgres jetable**, sans
  erreur et rejouables). Nuit — **R3 : la caisse hors
  ligne livrée**, puis **`0016` vérifiée en base : absente**, et recensement
  des migrations réellement passées.
  Passes précédentes : P0-6b (`/rewards` sans option « Tampons ») ; P0-6
  (`/branding` livré) ; P0-4 (les trois routes « Messages » mesurées) ; avant,
  P0-3 (règle de comptage du plafond), P0-2 (fiche établissement), P0-1
  (`/program`), parité fonctionnelle A6/A7.
- **Collage des huit migrations préparé, et répété hors production (2026-11-03,
  soir).** Sonde relancée telle quelle : **`PGRST202`, code de sortie `2`** —
  verdict inchangé, **le blocage reste le DDL, pas le code**. Ce qui a été ajouté
  n'est pas du code : les huit fichiers — chacun **transactionnel**
  (`begin; … commit;`, aucune méta-commande `psql`, **aucune référence à un objet
  défini plus tard**, ordre `0009`→`0016` vérifié) — assemblés en **un seul
  collage** de 69 085 octets (68 220 caractères), plus **la requête qui prouve
  le DDL**. Les deux sont
  dans `.profil-rea/ddl-0009-0016/` (dossier **ignoré par git**, donc aucune copie
  du SQL n'est versionnée) : `fidelix-migrations-0009-0016.sql`
  (sha256 `e3a411d9…`) et `fidelix-verif-migrations.sql`.
  **Répété dans un Postgres 16 jetable** (Docker) sur une base stub — rôles
  `anon`/`authenticated`/`service_role`, `clients`/`loyalty_cards`/
  `loyalty_transactions` réduites au strict nécessaire, puis `0003` et `0006` :
  **exécution sans erreur**, **second passage sans erreur** (les huit sont
  rejouables), vérification **13 fonctions `OK`**, **2 tables avec RLS**, **25/25
  colonnes**, **4/4 contraintes** — et `anon` ne peut appeler **que
  `caisses_publiques`**, la seule ouverture que `0009` revendique.
  **Ce que la répétition ne prouve pas, et qui reste à mesurer en production :**
  les corps `plpgsql` ne sont pas résolus à la création ; les colonnes réelles de
  `clients`/`loyalty_cards` et `award_loyalty_points` ne sont vérifiés qu'en base.
  Une répétition verte est une preuve de **collage**, pas de sémantique.
- **`0016` n'est PAS en base — mesuré, pas supposé (2026-11-03).** Le rejeu ne
  peut donc rien prouver : `POST` sur `enregistrer_operation_caisse` rend
  **404 `PGRST202`**, et l'OpenAPI lu en `service_role` ne montre ni la
  fonction ni la table `operations_caisse`. **Le recensement corrige le
  backlog** : ce ne sont pas « quatre » migrations qui attendent, mais **huit**
  (`0009`→`0016`) ; `0001`, `0003`, `0004`, `0005`, `0007`, `0008` sont
  **passées** (leurs fonctions sont dans l'OpenAPI, et `anon` reçoit `42501`
  sur `clients`/`loyalty_cards`, ce que seul `0001` provoque).
  **Aucun levier d'exécution côté agent, et c'est mesuré** : pas de `psql`,
  pas de CLI Supabase, pas de jeton de management, `mailer_autoconfirm=false`
  (l'inscription ne rend pas de session). Il reste l'**éditeur SQL du projet**.
  Ce qui est prêt pour la seconde d'après :
  `node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718 --confirmer`
  (sonde, deux `POST`, verdict, artefact sans secret).
- **R3 — le POS `/caisse` est une PWA qui survit à une coupure (2026-11-03).**
  Les quatre modules avaient leur chaîne (programme → QR → adhésion → carte →
  points → récompense) ; il leur manquait **le hors-ligne**, seule partie de R3
  encore nommée (`tasks_plan.md` 2.6, `design-system.md` §3). Livré : manifeste
  **mesuré** (seul `name` change — la marque), route
  `app/caisse/manifest.webmanifest`, `public/sw.js` (portée racine, règles
  limitées à la caisse, **aucun HTML authentifié en cache**), icônes PNG
  **engendrées** (`tools/rea/generer-icones.mjs`, décompressées par un test),
  `lib/file-caisse.mjs` (trois issues mesurées, 65 000 ms, ordre total,
  identifiant créé à l'enfilage), `lib/file-caisse-navigateur.mjs` (IndexedDB
  seul), `components/caisse/{CrediterCaisse,FileAttente}.jsx`, écran public
  `/caisse-hors-ligne` (repli du service worker, aucune donnée serveur),
  `POST /api/caisse/operation` et `migrations/0016_operations_caisse.sql`
  (**non exécutée** : clé primaire d'idempotence, verrou consultatif,
  `SECURITY DEFINER`, `authenticated` seul). Décisions et écarts :
  `docs/design-system.md` §3, « caisse hors ligne ». Preuves : **20 tests neufs**
  (`file-caisse.test.mjs`, `migration-0016.test.mjs`), suite **747 / 0 échec /
  1 ignoré**, `next build` exit 0, `verifier-design` **CONFORME**, et sur
  `next start` : manifeste **200**, repli **200**, `/sw.js` **200**, `POST`
  invalide **400**, `POST` valide sans `0016` **503 `PGRST202`**.
  **Refusé, et écrit** : l'échange hors ligne — le solde n'est pas connu.

- **`/branding` est livré : mesure + `0015` + module pur + écran + aperçu vivant.**
  Les dix types d'établissement, les huit couleurs, `min(2)` sur le nom et
  l'expression `^#[0-9A-Fa-f]{6}$` sont **lus dans la cible** (DOM **et** chunk),
  pas recopiés de mémoire. Une chose manque, et reste déclarée : l'**envoi de
  fichier** (aucun espace de stockage, aucune clé de service : les champs
  attendent une adresse). La section « **4 · Tampons par carte** » n'est plus une
  dette **mais un refus**, décidé le 2026-11-02 : le socle ne compte que des
  points, donc aucun écran ne lit ces trois réglages — et l'option « Tampons »
  que `/rewards` proposait encore, sans lecteur, a été retirée. Rapport :
  **`docs/mesure-p0-6-apparence-2026-11-02.md`**.
- **Décision humaine du 2026-11-02 : Wallet est mis de côté**, Google compris —
  la route et la lib restent en place (`0014` non exécutée, `WALLET_ENABLED`
  éteint ⇒ `503` mesuré), mais la `loyaltyClass` et l'écriture d'objet ne sont
  plus la tâche courante. Rien n'est supprimé, rien n'est promis.

- **P0-4 est mesuré, et le résultat change le plan : `/notifications`,
  `/campaigns` et `/automations` sont UN écran à trois onglets** (« Messages »),
  et **deux d'entre eux exigent un canal d'envoi qui n'existe pas ici** — ni
  table `push_notifications`, ni table `automations`, ni jeton push, ni Wallet,
  ni dépendance d'email (`web/package.json` : Next, React, Supabase, rien
  d'autre). Le troisième, `/campaigns`, est un **paywall pur** (« Les campagnes
  demandent un pack », `c05-campaigns.html:35409`) : c'est P0-3c, pas un écran.
  Rapport : **`docs/mesure-p0-4-messages-2026-11-02.md`**.
- **`/notifications` est livré FONCTIONNEL (consigne : « pas d'abonnement, tous
  les modules fonctionnels »).** Compose, valide, met en file, compte le quota,
  affiche l'historique et l'audience réelle (clients avec adresse email). La
  frontière est explicite : **aucun message ne part** — chaque ligne porte
  « En attente », jamais « Envoyé », et l'écran écrit pourquoi
  (`page.messages.fileAide`). Preuves : `migrations/0013_messages.sql`
  (**non exécutée**), `web/src/lib/messages.mjs`, `.../notifications/actions.js`,
  écran reconstruit, **17 tests neufs**, suite **668 / 0 échec**, `next build`
  exit 0 (route listée), `verifier-design` + `verifier-durcissement`
  **CONFORME**. Restent `/automations` et `/campaigns` : tous deux dépendent de
  la couche sortante et de l'état payant (P0-4b).
- **P0-5 (Wallet) : Google livré, Apple en attente** — le code-barres Google est
  **le nôtre** (`barcode.value` = `card_token`), donc `/scan` est intact et U1
  disparaît ; coût **0 €**. Livré : `0014` (non exécutée), `lib/google-wallet.mjs`,
  route `api/wallet/google/[token]` (503 si drapeau éteint, vérifié). Restent
  l'écriture de l'objet chez Google (solde à jour), la `loyaltyClass` à créer, et
  le bouton sur adhésion + `/customers`. **PassKit/Apple** : sonde prête, compte
  en essai 45 j — à reprendre quand Apple devient nécessaire.


- **La question posée n'était plus « que fait la cible ? » mais « a-t-on les
  mêmes fonctions ? » — et la réponse est non, sur 16 points, tous mesurés.**
  Rapport : **`docs/parite-fonctionnelle-2026-11-02.md`**. Session marchande
  déjà ouverte dans `.profil-rea/` (préflight `/dashboard` **200**, sonde unique
  validée) : **aucune fenêtre de connexion n'a été nécessaire**, et la passe a
  tourné sans qu'un identifiant quitte le clavier de l'utilisateur.
- **Ce qui a été exécuté :** A6 (15 cibles HTTP → **13 × 200**, 2 rejets, 3 × 404,
  **61/61 assets**, 0 erreur) + rendu (**13/15**) ; `decouvrir-cibles` (**22
  cibles distinctes, 11 nouvelles**) ; A7 (6 cibles : `/settings`, `/billing`,
  `/api-cles`, `/equipe`, `/campaigns`, fiche client → **5 × 200 + 1 × 404**) ;
  A7b (`/notifications`, `/customers` → **2/2 en 200**). **0 POST, 0 écriture.**
- **Le manifeste du 2026-10-26 avait deux angles morts, pas le produit :**
  `/notifications` et `/customers` — deux entrées du rail privé présentes dans
  **13 DOM sur 13** — n'étaient dans aucun manifeste. Trois modules jamais
  inventoriés sortent des liens : **`/api-cles` (API)**, **`/settings` (Mon
  compte)**, **`/billing` (Voir l'abonnement)**, plus `/equipe` et `/campaigns`.
- **Écart le plus coûteux, et il est sur *chaque* écran :** le **bandeau d'offre**
  de la cible (« Offre gratuite · **1 / 30 clients** », « Voir l'abonnement »,
  plaque NFC 150 MAD) n'existe pas dans Fidelia. Conséquence mesurée : **le
  plafond de 30 clients n'est appliqué nulle part**. Même famille : le
  **sélecteur d'établissement** (`GET /api/commerce/actif`, XHR ×7) et les
  **3 entrées de rail manquantes** (API, Mon compte, Voir l'abonnement).
- **Bilan de parité : 7 modules partiels, 8 absents** (dont 3 stubs honnêtes :
  `notifications`, `reviews`, `branding`), **3 sans écart de fond**. Les **7 P0
  retenus au plan** : `/program` (cashback, expiration, parrainage, bonus avis),
  `/settings`, `/billing` + plafond 30, `notifications`/`campaigns`/`automations`,
  `/branding`, `/reviews`, **parrainage** (`parrainages_du_commerce`).
  **Hors plan, mais toujours mesurés** : multi-PDV + rôles
  (`mon_role_point_de_vente`), `/api-cles`, darija — le plan se resserre, le
  relevé ne se réécrit pas. **L'IA reste hors périmètre, à la demande.**

- **P0-1 — l'écart le plus coûteux du plan est fermé : la page `/program` existe
  (2026-11-02).** Le rapport de parité la listait « page absente » alors que la
  cible y tient **sept** réglages ; le socle n'en stockait que deux (`devise` et
  `credits_par_euro`, `0008`). Ce n'était donc pas cinq champs à dessiner, mais
  cinq réglages qui n'existaient **nulle part** — ni colonne, ni fonction.
  - **Mesure** : `_captures/2026-11-02-a6/rendu/a02-program.html` — sept
    contrôles, leurs `name`, deux `placeholder`, deux phrases d'aide, l'exemple
    « Un ticket de 250 € créditera 50 points », deux onglets (`Récompenses` →
    `/rewards`, `Règles` actif).
  - **`migrations/0010_reglages_programme.sql`** — sept colonnes (`min_purchase`,
    `deduction_libre`, `points_expiry_days`, `referral_reward`,
    `review_reward_enabled`, `review_reward`, `google_review_url`), chacune avec
    son défaut, son `check` et son commentaire ; `reglages_du_programme()`
    (`SECURITY DEFINER`, `PROGRAM_NOT_FOUND`) et
    `enregistrer_reglages_programme(9 args)` **atomique**, qui relit l'état
    plutôt que de le supposer. `programme_public` et `enregistrer_programme` ne
    sont **pas** touchées : publier le bonus de parrainage sur la page publique
    (`anon`) livrerait la configuration commerciale à qui connaît le slug.
  - **Le barème ne change pas de colonne.** L'écran demande « points par 10 », la
    caisse lit « crédits par euro » : la conversion se fait **une fois**, côté
    module. Un « 2,25 par 10 » donnerait 0,225 que `numeric(10,2)` arrondirait
    en silence — il est **refusé**, et le message dit le pas.
  - **`web/src/lib/programme.mjs`** — 11 fonctions pures (validation, conversion
    dans les deux sens, `reglagesDepuisFormulaire`, `refusReglages` à 9 codes
    dans un ordre fixe, `lireReglages` qui absorbe les trois formes de PostgREST).
    **`lib/donnees.mjs`** — `reglagesDuCommerce()`, `enregistrerReglages()`
    (argument de lien omis s'il est vide, cache invalidé **après** succès),
    `PROGRAM_NOT_FOUND` traduit en `absent`, 8 codes ajoutés à `CODES_CONNUS`.
  - **Deux bugs trouvés par les tests, pas par les yeux.** (1) La phrase mesurée
    « 1 point = 1 € de remise » était devenue « 1 point = € de remise » — le
    second « 1 » manquait dans le dictionnaire ; (2) `OngletsProgramme.jsx`
    employait `pour`, `Link` et `ONGLETS_PROGRAMME` **sans les importer** :
    `next build` vert, mais `ReferenceError` au premier rendu (lu dans les
    journaux du conteneur). Les deux sont corrigés, et les deux ont désormais un
    test qui les aurait attrapés.
  - **Preuves** : `reglages-programme.test.mjs` (18 tests, témoins de la capture
    comparés au dictionnaire rendu en euros) + `migration-0010.test.mjs`
    (11 tests) ; suite hors ligne **602 tests / 0 échec** ; `next build` exit
    **0** ; image reconstruite et servie sur **7089**, journaux propres.
  - **Non observé, et déclaré** : le rendu **authentifié** de `/program` en
    local. La session du profil REA appartient au projet Supabase
    `rozagopjfkkblyxtjdgw` (fidelix.ma), le conteneur lit
    `sevqegfhmdezsqwvwsam` : `/program` répond `307 → /login` (la route existe,
    la garde fait son travail), mais son corps n'a pas été vu à l'écran.
  - **`0010` n'est pas exécutée.** La page le dit sans casser : `PGRST202` →
    `EtatBloque` avec le nom du fichier. Le jour où elle est passée, les sept

- **P0-2 — la fiche établissement (`/settings`) existe (2026-11-02, même nuit).**
  Mesuré : `_captures/2026-11-02-a7/rendu/c01-settings.html` (200), **14 contrôles
  nommés** en deux sections (« Établissement », « Notification à proximité ») et
  **un seul** bouton « Enregistrer ». Les bornes sont lues, pas choisies :
  `min=50 max=2000 step=50`, `maxlength=120`, trois valeurs de menu
  (`physique`, `en_ligne`, `mixte`).
- **`migrations/0011_fiche_etablissement.sql`** — 13 colonnes sur
  `loyalty_programs` (le nom y était depuis `0003`), chacune décrite ;
  `fiche_du_commerce()` (json, `PROGRAM_NOT_FOUND`, même départage que `0003`) ;
  `enregistrer_fiche_etablissement(14 params)` en **un seul `update`** après
  quatre refus codés (`INVALID_NAME`, `INVALID_TYPE_ACTIVITE`, `INVALID_RADIUS`,
  `INVALID_GEOFENCE_TEXTE`). `nullif(btrim(…))` pour qu'un champ vidé **efface**,
  et `% 50` vérifié **en base** — un `step` HTML ne protège de rien. Droits :
  `REVOKE … FROM public, anon, authenticated` puis `GRANT` à `authenticated,
  service_role` ; **`anon` ne lit pas** la fiche (téléphone, adresse, géofence),
  `programme_public` reste la seule lecture publique.
- **`web/src/lib/etablissement.mjs`** (pur) — `ficheDepuisFormulaire`,
  `refusFiche`, `lireFiche`, quatre validateurs. Un rayon vide vaut **1000** (le
  `placeholder` de la cible), un `null` de base devient `''`, un type inconnu
  retombe sur le défaut de la colonne. **Aucune** validation d'URL : les exemples
  mesurés sont des domaines sans schéma (`moncafe.ma`), exiger `https://` les
  refuserait.
- **Écran** — 14 contrôles aux `name` mesurés, un `Enregistrer` pour les deux
  sections, `?etat=` littéral par refus (lu par `etat-action`), `EtatBloque`
  nommant `0011` quand le schéma manque. **Non rendu, et déclaré** :
  « Mot de passe », « Résiliation », « Couverture réelle » (un seul échantillon,
  aucune formule), « Langue » (darija hors périmètre), masquage Caisse.
- **`/settings` entre dans le rail** (11 entrées) : il en était absent tant que
  la route n'existait pas, et `navigation.test` l'interdisait — à juste titre.
- **Résultat mesuré :** 16 tests (`fiche-etablissement.test.mjs`) + 13
  (`migration-0011.test.mjs`), suite **632 / 0 échec** (1 skip préexistant),
  `next build` **exit 0** (`/settings` en dynamique), `verifier-design.mjs`
  **CONFORME**.
- **`0011` n'est pas exécutée**, comme `0009`/`0010` : l'écran nomme le fichier
  au lieu de casser, et le reste du produit n'en dépend pas.


    réglages s'affichent et s'enregistrent.

- **La dette nommée par `0007` est fermée — et la mesure a dit « écrire », pas « capturer ».** La question posée était : la page publique de la cible propose-t-elle ce choix, ou l'inventerait-on ? Elle le propose, deux artefacts le disent : `p17-join.html` (`<label id="qui-vous-a-servi">Qui vous a servi ? (facultatif)</label>` dans un `role="group"`) et son chunk `app_join_[slug]_page-…js` (`A.length>0 && …`, `aria-pressed={O===e.id}`, `onClick: () => set(O===e.id ? void 0 : e.id)` — sélection **unique et défaisable**, dont le DOM rendu porte six prénoms sans session.
- **`migrations/0009_caisses_publiques.sql`** — `caisses_publiques(p_slug)` : `SECURITY DEFINER`, rend **`id` + `prenom`** des seules caisses **actives**, ordre total (prénom, id), `PROGRAM_NOT_FOUND` si le slug ne mène à rien. `anon` reçoit `EXECUTE` — c'est le seul écart avec `0007`, et il est justifié : `equipe_du_commerce` donne le prénom **avec** le CA, celle-ci seulement de quoi dessiner six boutons. Aucune table rouverte (`staff` reste sous RLS sans politique).
- **`web/src/lib/adhesion.mjs`** (module pur, 6 fonctions) — `lireCaissesPubliques` (`[]` = aucune caisse, `null` = réponse illisible : deux choses qu'on refuse de confondre), `caisseDemandee`, `caisseChoisie` (« une caisse proposée est une caisse acceptée »), `basculerCaisse` (la bascule mesurée), `designationPerdue`, `repriseSansCaisse`.
- **`ChoixCaisse.jsx`** — le groupe **au DOM mesuré** : `role="group"`, `aria-labelledby="qui-vous-a-servi"`, boutons `aria-pressed`, classes de la capture à la lettre (`min-h-11` = 44 px, vérifié compilé dans le CSS produit), champ caché `name="caisse"`.
- **`donnees.mjs`** — `caissesPubliques(slug)`, `rejoindre(slug, caisse)` qui n'envoie `p_staff_id` **que s'il y a une caisse**, et `'STAFF_NOT_FOUND'` entré dans `CODES_CONNUS` : ce refus de `0007` tombait en `indisponible`, donc une panne affichée pour un refus.
- **`actions.js`** — la liste est **relue au moment du geste**, la caisse validée contre elle, l'inscription rejouée **une fois** sans désignation si `STAFF_NOT_FOUND` survient (une carte ne se perd pas pour un prénom), et la perte **se dit** (`?sansDesignation=1`). La phrase ne promet aucun rattrapage : aucune fonction ne redésigne une carte.
- **Résultat mesuré :** 21 tests (`adhesion-caisse.test.mjs`) + 9 (`migration-0009.test.mjs`), suite **574 tests / 0 échec**, campagne de mutations **103/103** (M91→M103), `next build` **exit 0**, `verifier-design.mjs` **CONFORME**, image reconstruite et servie sur **7089**.
- **`0009` N'EST PAS ENCORE EXÉCUTÉE — et c'est mesuré, pas supposé.** Appel direct à la RPC avec la clé `anon` du `.env` après redéploiement : `PGRST202` (« Could not find the function public.caisses_publiques … in the schema cache »). Conséquence **voulue** : la page d'adhésion n'affiche **pas** le champ (elle ne casse pas, elle ne demande rien), et l'inscription aboutit toujours. Le jour où le fichier est passé à l'éditeur SQL, le champ apparaît et « Cartes » cesse de valoir 0. **Rien à redéployer** : le repli est déjà dans l'image.


- **La latence au clic venait du réseau, pas du serveur — et rien ne le montrait.**
  Mesures : rendu serveur Next **9 / 21 / 78 ms**, RTT Supabase **0,55–0,81 s**
  (5 tirages REST, 3 Auth), et **aucun `loading.jsx`** dans `(dashboard)`.
  Chaque clic payait donc 0,7 s (parfois 1,4 s) **sans changer un pixel** : le
  clic semblait perdu. Corrigé par trois ajouts, chacun mesurable séparément.
- **`app/(dashboard)/loading.jsx`** — dans le **groupe**, pas dans un segment
  (§35.1) : squelette calqué sur l'en-tête et une carte, `role="status"`,
  `aria-busy`, blocs décoratifs en `aria-hidden`, texte du dictionnaire. Il sert
  aussi de **frontière de préchargement** : sans elle, `prefetch` d'une route
  dynamique ne préchargeait rien d'utile.
- **`/scan` faisait deux RPC séquentielles indépendantes** (`carteParToken` puis
  `programmeDuCommerce`, 1,4 s) → `Promise.all`, 0,7 s. Le contrat de forme
  compte : `allSettled` aurait rendu `{status, value}` et la carte ne se serait
  jamais affichée, sans erreur (mutation M78).
- **`lib/cache.mjs`** — mémoire courte (TTL 10 s, horloge injectable) sur
  `programmeDuCommerce()`, lu par 4 écrans à chaque navigation. Trois contrats
  écrits : états **stables seulement** (`ok`/`absent`/`nonMigre`, jamais
  `indisponible`), **l'écriture invalide** (`enregistrerProgramme` vide l'entrée),
  et le **chemin d'écriture ne lit jamais la mémoire** (`crediterPoints` demande
  `{ frais: true }`). Limite déclarée : par processus (multi-instance = TTL max).
- **Mobile** : `env(safe-area-inset-bottom)` ajouté au bas de `.uc-content` (le
  dernier bouton passait sous la barre système d'un iPhone à encoche),
  `touch-action: manipulation` (fin du délai de 300 ms du double-tap),
  `-webkit-tap-highlight-color: transparent`, et `:active` sur liens/boutons
  (`scale(.985)`) — un appui se voit **avant** la navigation, sans quoi 0,7 s de
  réponse serveur fait croire que le doigt a manqué la cible.
- **`/caisse` refondu** : l'ordre suit le geste (identifier → solde → choisir),
  une colonne sur mobile, deux à partir de 1240 px (`.uc-grille`, posée
  **seulement** s'il y a une carte — sinon colonne fantôme de 320 px), titre
  « Identifier le client », « ou saisir le code à la main », solde avec son
  propre libellé, bouton de recherche en cible tactile (`h-11` = 44 px).
  `JaugePoints` quitte la palette morte (`bg-coral`, `bg-white/10`,
  `font-impact`) pour `uc-solde` / `uc-jauge` : la piste était **invisible** sur
  une carte claire.
- **`/qrcode` refondu** : une **affiche** blanche (marque, QR 232 px, URL
  encodée, note) prête à découper, un bouton « Imprimer l'affiche »
  (`window.print()`, seul composant client de l'espace), et une colonne de
  droite (adresse encodée, règle de contraste, retour à Programme). À
  l'impression, la coque disparaît et le cadre pointillé aussi.
- **20 tests ajoutés la même nuit** (latence) : `latence.test.mjs` (9 — horloge
  pilotée, frontière du groupe, sans `loading` de segment, mémoire filtrée et
  invalidée), `design-ecrans.test.mjs` (6 — palette morte, colonne fantôme,
  affiche imprimable, zone sûre, retour tactile), et la garde `/scan` renforcée
  (`{ frais: true }` exigé sur le chemin d'écriture). Suite au terme de ce lot :
  **529 tests — 528 pass, 0 fail, 1 skip** (skip antérieur) ; **84/84**
  mutations (M75→M84).

- **`/caisses` (Équipe) — l'écran est livré, il lit `0007`.** Projection de
  `a09-caisses.html` : `h1` « Équipe », les deux portées (« Caisses employé » /
  « Responsables ») qui filtrent la liste des caisses, les quatre périodes (des
  **liens**, donc partageables et sans JavaScript), les sept `th`, le trophée du
  premier rang, puis « Caisses actives ». Le vocabulaire n'est pas un choix
  d'écran : `caisses-lecture.test.mjs` relit les quatre clés dans `0007`
  (`v_periode not in (…)`) et les deux portées dans `0006`
  (`check (role in (…))`). **Une seule lecture par affichage** : la période part
  telle quelle, `p_jour` n'est envoyé que pour `jour` (le défaut de la fonction
  joue sinon).
- **Cinq états, cinq textes, aucun zéro inventé.** « Un jour précis » sans date
  ne déclenche **aucune** requête (l'écran en sait plus que la base, qui
  refuserait `JOUR_MANQUANT`) ; les trois refus de `0007`
  (`PERIODE_INCONNUE`, `JOUR_MANQUANT`, `FUSEAU_INCONNU`) sont désormais dans
  `CODES_CONNUS` — **un refus n'est pas une panne**, et sans eux une faute
  d'URL s'affichait « la base ne répond pas » ; une forme inattendue rend
  `null` → « Réponse inattendue », jamais une équipe vide.
- **« Avis » reste une absence déclarée.** La capture affiche `0` (elle a une
  table d'avis). Ici `0007` rend `null` **et** déclare `absences: ["avis"]` :
  l'écran affiche un tiret **et** la phrase qui l'explique, et refuse une
  réponse qui afficherait le tiret sans la déclaration. L'écran ne retrie rien :
  `0007` impose un ordre total, `lireEquipe` numérote ce qu'il reçoit.
- **Deux éléments de la capture ne sont pas rendus, et c'est écrit** : le
  drill-down (« Touchez une ligne pour voir le détail de ses opérations »,
  `role="button"` sur chaque ligne) demande une RPC par caisse qui n'existe pas ;
  « Nouvelle caisse » demande une écriture de `staff` qui n'existe pas non plus.
  Une promesse sans geste est pire qu'une absence expliquée — déclaré dans
  `docs/design-system.md` §3.
- **15 tests ajoutés** (`caisses-lecture.test.mjs`) : témoin de copie dans la
  capture avant comparaison au dictionnaire, vocabulaire relu dans le SQL,
  nom de migration résolu sur le disque, cinq états, `lireEquipe` (formes
  inattendues, avis absent, ordre non retrié), `caissesActivesDe`,
  `jourValide` (`2026-02-31` refusé), classes servies, trophée + rang annoncé.
  Suite : **544 tests — 543 pass, 0 fail, 1 skip** (skip antérieur).
- **Campagne de mutations : 90/90 détectées et restaurées** (M75→M90). La
  première passe a rendu **89/90** : M85 survivait à un test vert, parce que
  l'assertion cherchait `className="uc-sr"` — que le `caption` de la table porte
  aussi. Le motif est resserré sur le **rang lui-même** (span + contenu), pas
  sur un jeton qui existe ailleurs (§38.3).
- **Image reconstruite et servie** (`--pull --no-cache`, exit 0) : conteneur
  `healthy` sur **7089**, `/login` **200**, `/caisses` et `/caisses?periode=7j`
  **307 → /login** (garde d'auth, comme les autres écrans), 0 erreur dans les
  logs. **Ce qui est dans l'artefact servi**, pas seulement dans le dépôt :
  chunk `src_app_(dashboard)_caisses_page_jsx_*.js` (porte `page.equipe.*` et
  `uc-periode`), et la feuille servie contient
  `.uc-periode{…min-height:44px…}` et `.uc-rang svg{color:#f59e0b…}`.
- **Ce qui n'est pas mesuré, et qui est dit** : le **rendu authentifié** de
  `/caisses` n'a pas été observé (pas de session pour `localhost:7089`). La
  preuve s'arrête à l'artefact : la page compile, la route répond, les
  fragments sont servis. « L'artefact contient le texte » et « l'écran
  l'affiche » restent deux choses distinctes (§37.8).
- **Image reconstruite et servie** : `next build` compile, conteneur
  `healthy` sur `7089`, `/login` **200**, `/caisse` `/qrcode` `/rewards` `/scan`
  `/customers` **307 → /login**, 0 erreur dans les logs, et les fragments sont
  **dans l'artefact** (`.uc-squelette` dans le CSS, chunk
  `src_app_(dashboard)_loading_jsx_*.js`, `uc-affiche-lien`, `uc-solde-val`,
  `window.print`).
- **Ce qui n'est pas mesuré, et qui est dit** : le rendu authentifié des quatre
  écrans (profil `.profil-rea` = session `fidelix.ma`, pas `localhost` ;
  `/apercu` fermé). Preuve d'artefact, pas preuve d'écran.
- **Le taux de conversion existe, et il est branché des deux côtés.**
  `loyalty_programs.credits_par_euro` (numeric(10,2), > 0, défaut 1) est
  enregistré par l'écran Programme, lu par la caisse, et **appliqué** quand les
  points sont laissés vides. Avant, montant et points étaient deux saisies sans
  lien : 40 € pouvaient donner 1 point.
- **`create or replace` ne remplace pas une signature différente.** La fonction
  à 5 paramètres a dû être `drop`ée : sinon `enregistrer_programme` aurait
  existé en deux exemplaires, et un appelant à 5 arguments aurait continué
  d'écrire des programmes en ignorant le taux — sans qu'aucun écran ne le
  montre. Mesuré après coup : une seule fonction, `to_regprocedure` à 6
  arguments.
- **Le harnais a refusé de démarrer, encore une fois, et il avait raison.**
  `M1` ne s'appliquait plus **une** fois mais **zéro** : le code de
  `confirmation.mjs` avait changé sous la campagne (`recovery` passé en
  littéral). Aucune mesure n'a été prise tant que l'entrée n'a pas été
  réalignée — c'est la règle §27.4, et elle a coûté deux minutes au lieu d'un
  faux vert.
- **74/74 mutations détectées et restaurées. 514 tests : 513 pass, 0 fail,
  1 skip** (pré-existant : `sonde-base.json` absent).
- **Image reconstruite** (`build --pull --no-cache`), conteneur `Up (healthy)`
  sur `7089`, `/login` **200**, `/caisse` `/rewards` `/scan` **307 → /login**
  (aucun 500), et les nouveaux libellés sont **dans le chunk servi**.
- **Prochaine mesure honnête qui manque** : le rendu authentifié de `/caisse`
  et `/rewards` (le profil `.profil-rea` porte une session `fidelix.ma`, pas
  `localhost`) — vérifié ici au niveau HTTP + artefact, pas au pixel.
- **`0007` est livrée, exécutée, et la base est restée à 0 ligne.**
  `migrations/0007_equipe_lecture.sql` fait deux choses, dans cet ordre :
  `join_loyalty_program(p_slug, p_staff_id)` accepte une caisse **facultative**
  et l'écrit dans le **même `insert`** que le client (colonne
  `designated_staff_id`), puis `equipe_du_commerce(p_periode, p_jour, p_fuseau)`
  rend le classement de l'équipe — titulaire compris.
- **Le fichier et la base sont le même octet.** Ce n'est pas une affirmation :
  `md5(prosrc)` en base = `md5` du corps dans le fichier
  (`a0a1f1f5…` pour `join_loyalty_program`, `b497dbb5…` pour
  `equipe_du_commerce`). Le premier passage avait collé les corps **sans leurs
  commentaires** (prosrc 1644/4053 caractères au lieu de 1822/4070) : mesuré,
  refusé, réappliqué. L'écart de longueur qui reste est caractères vs octets.
- **« Cartes » compte des clients, et la mesure le prouve par un écart.** Jeu de
  sonde : **3 clients**, **2 désignés**, **4 cartes** (une seconde carte a été
  ajoutée à un client désigné **exprès**). `equipe_du_commerce()` rend
  `cartes = 1 + 1 = 2` : compter `loyalty_cards` aurait rendu 4. La colonne de
  `0006` est donc la bonne, et la phrase de la capture est tenue.
- **Les quatre périodes sont des définitions, et elles se distinguent à
  l'exécution.** Une opération à J-10, une à J-2, une à J-1, une il y a 2 h :
  `7j` → 1 scan pour Amina (7 €), `30j` → 2 (12 €), `depuis_le_debut` → 2,
  `jour` sur J-2 → 1 (7 €). Le vocabulaire est **fermé** :
  `PERIODE_INCONNUE`, `JOUR_MANQUANT`, `FUSEAU_INCONNU` — les trois refus ont
  été **provoqués** (`P0001`, lignes 15/24/19 de la fonction).
- **Le titulaire est toujours une ligne.** Base vide → `equipe_du_commerce()`
  rend **une** ligne (`staff_id: null`, `actif: true`, tout à 0, `avis: null`,
  `absences: ["avis"]`). Une caisse **désactivée** reste au classement avec
  `actif: false` et **son histoire intacte** — désactiver n'efface pas.
- **« Avis » reste une absence déclarée** : `null` + `absences: ["avis"]`,
  jamais `0`. Aucune table d'avis n'a été inventée.
- **La surcharge à un argument a été retirée, pas laissée.** Deux candidates
  pour un corps `{ p_slug }` feraient une ambiguïté PostgREST à l'adhésion ;
  `drop function if exists public.join_loyalty_program(varchar)` — mesuré
  après coup :
  `1` seule fonction `join_loyalty_program`, `to_regprocedure('…(character
  varying)')` → **NULL**. L'appelant `web/src/lib/donnees.mjs` continue de
  fonctionner (`p_staff_id` a une valeur par défaut).
- **Droits mesurés, pas relus** : `has_function_privilege` →
  `anon` sur `equipe_du_commerce` = **false**, `authenticated` = **true**,
  `service_role` = **true** ; `anon` sur `join_loyalty_program` = **true**
  (page publique, contrat de `0003` conservé). `equipe_du_commerce` ne trie
  jamais `loyalty_cards`, et n'ouvre aucune table.
- **Rejouée sans effet, et vérifié.** Second passage exécuté : les deux
  `create or replace` rejoués depuis `pg_get_functiondef` (donc les définitions
  exactes), le `drop … if exists` rejoué alors que la surcharge est **déjà
  absente** (c'est son second passage qui compte), `revoke`/`grant` rejoués.
  Aucune levée, mêmes md5, données intactes.
- **Nettoyage vérifié** : les quatre lignes de sonde supprimées, les **six**
  tables à **0 ligne** (relevé final, pas une intention).
- **64/64 mutations détectées et restaurées** (49 + **15** : M50→M64), témoin
  lu avant le résultat. **495 tests** : **494 pass, 0 fail, 1 skip**
  (pré-existant : `sonde-base.json` absent). Le skip n'est pas une régression.
- **Deux fois le harnais a parlé avant moi, et il avait raison.** (1) Il a
  **refusé de démarrer** parce que trois mutants recopiaient un texte déjà
  présent ailleurs dans le fichier — indiscernables d'un arbre sale ; les trois
  ont été réécrits vers un texte **globalement absent** (M53, M58, M64).
  (2) M63 (`is not distinct from` → `=`) n'a **pas** été détectée au premier
  tour : ma garde ne vérifiait qu'**une** des deux jointures. Corrigée en
  comptant **deux** appariements → 64/64. Détail en `lesson-learned` §33.

- *(Session précédente — `0006`, conservée pour la mesure)*
- **Le modèle que `/caisses` exige existe maintenant — et rien de plus.**
  `migrations/0006_equipe_et_designation.sql` est **exécutée** sur le projet
  (`apply_migration`). Elle ajoute `public.staff` (`id`, `first_name`, `role`
  `caisse|responsable`, `active`, `created_at`), la colonne
  `public.clients.designated_staff_id` (FK nommée, **`on delete set null`**) et
  le rattachement de `public.loyalty_transactions.staff_id` (FK nommée,
  **`on delete restrict`**). Aucune fonction, aucune politique, aucun droit de
  table rendu : ce fichier ne livre **que** le modèle, parce que la leçon §31.3
  dit qu'une RPC ne comble pas une absence de modèle.
- **Mesuré après exécution (pas après relecture)** : `staff` existe, RLS
  **activée**, **0 politique** ; `has_table_privilege` → `anon` **false**,
  `authenticated` **false** (SELECT *et* INSERT), `service_role` **true** ;
  `pg_get_constraintdef` rend exactement
  `… REFERENCES staff(id) ON DELETE SET NULL` pour la désignation et
  `… ON DELETE RESTRICT` pour l'audit. Les cinq tables d'origine sont
  **inchangées** (mêmes colonnes, mêmes 0 ligne) ; l'index
  `clients_designated_staff_id_idx` est créé.
- **Rejouée une seconde fois — sans effet.** L'idempotence n'est pas affirmée,
  elle a été exécutée deux fois de suite : le second passage ne lève rien
  (`create table if not exists`, `add column if not exists`,
  `create index if not exists`, deux blocs `do` qui interrogent
  `pg_constraint`).
- **Sondée jusqu'au refus, puis nettoyée.** Quatre chemins mesurés, chacun
  laissant la base à **0 ligne** à la fin :
  - caisse créée avec ses défauts → `role = caisse`, `active = true` ;
  - `role = 'owner'` → **`23514` `staff_role_check`** (l'écran n'a que deux
    portées : « Caisses employé » et « Responsables ») ;
  - `first_name = '   '` → **`23514` `staff_first_name_check`** (pas de cellule
    « Caissier » vide) ;
  - désignation vers un `uuid` absent → **`23503`
    `clients_designated_staff_id_fkey`** ; suppression d'une caisse désignée →
    `clients.designated_staff_id` devient **NULL** et le **client survit**
    (preuve du `SET NULL`) ; suppression d'une caisse qui porte une transaction
    → **`23503` `loyalty_transactions_staff_id_fkey`** (preuve du `RESTRICT` :
    le CA ne peut pas baisser en silence).
- **« Cartes » n'est pas « nombre de cartes distinctes ».** La capture définit
  la colonne mot pour mot : « Les cartes comptent les **clients** qui ont
  **désigné ce caissier** sur la page d'inscription. » La colonne est donc sur
  `clients`, et `loyalty_cards` n'est **pas** touchée ; un test et deux
  mutations (M41, M47) gardent cet emplacement. Le futur classement comptera
  des clients — comme la phrase le dit, pas comme le mot le suggère.
- **`staff_id IS NULL` = le titulaire, et c'est mesuré.** La seule ligne de la
  cible est « Titulaire | Vous | 0 | 1 | 8 | 40 € | 0 » ; toutes les opérations
  du socle ont `staff_id` nul. Le futur classement groupe donc par `staff_id`,
  la ligne nulle étant celle du titulaire. `staff_id` reste NULLable — le rendre
  obligatoire obligerait à inventer une caisse.
- **Le harnais de mutations a été durci, et ses refus prouvés par exécution.**
  Instantané de **tous** les fichiers visés avant la première écriture,
  restauration sur `exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, exception et rejet non
  rattrapés, vérification octet à octet en fin de campagne, et refus de démarrer
  si un marqueur `tools/rea/.campagne-mutations.etat` traîne (campagne morte en
  cours) ou si un fichier porte déjà son texte muté. Les trois refus ont été
  déclenchés à la main : marqueur → **exit 1** sans mesure ; arbre muté à la
  main → **exit 1** en nommant M37/M38 ; `SIGINT` en pleine campagne →
  **exit 130** avec les trois fichiers restaurés au **même md5** qu'avant.
- **49/49 mutations détectées et restaurées** (36 + **13** : M37→M49), chacune
  sur l'assertion visée, témoin lu avant le résultat (§27.4). **478/478 tests**
  (+12), `verifier-design.mjs` **CONFORME** (3 déviations inchangées, aucune
  valeur CSS ajoutée), `verifier-durcissement.mjs` **CONFORME**, `next build`
  **exit 0** (`/caisses` et `/dashboard` dans la table des routes).
- **Deuxième lecture livrée : `tableau_du_commerce()`** (`migrations/0005_lecture_tableau.sql`),
  et **exécutée** sur le projet. `SECURITY DEFINER` + `search_path = public`,
  `REVOKE … FROM public, anon, authenticated` **puis** `GRANT` à `authenticated`
  et `service_role`. Mesuré par `has_function_privilege` : `anon` **false**,
  `authenticated` **true**, `service_role` **true** ; `authenticated` n'a
  **aucun** `SELECT` sur `loyalty_transactions`, `loyalty_cards` ni `clients`,
  et **0 politique** RLS — les tables ne sont pas rouvertes.
- **Le missionnement « `/caisses` ou `/notifications` » a été mesuré avant
  d'être écrit, et les deux écrans ne pouvaient pas porter de projection
  mesurée.** Reçus :
  - `a20-notifications.html` ne contient **aucune** chaîne propre à la page
    (ses 10 chaînes sont celles du gabarit, présentes à l'identique sur les
    captures 404) ; aucun rendu DOM n'existe ;
  - `a09-caisses.html` (payload RSC) est dans le même cas, mais le **DOM rendu**
    `2026-10-26-auth/rendu/a09-caisses.html` porte le vrai écran Équipe (`h1`
    « Équipe », `h3` « Classement de l'équipe », `th` « # | Caissier | Cartes |
    Scans | points | CA | Avis »). Deux de ses colonnes viennent d'un modèle
    **absent** du socle : « Cartes » compte les clients qui ont **désigné** le
    caissier, « Avis » les avis rattachés. Tables mesurées : `clients`,
    `loyalty_cards`, `loyalty_transactions`, `loyalty_programs`, `reward_tiers`
    — **aucune** table d'équipe, aucune colonne de désignation. Une RPC de
    lecture ne comble pas une absence de modèle.
  L'écran d'accueil, lui, est **entièrement** calculable sur les colonnes
  mesurées (`amount_spent`, `points_awarded`, `reward_label`, `devise`).
- **Projection de l'accueil, mesurée sur `a01-dashboard.html`** : « Clients |
  +1 ce mois », « Visites | 30 derniers jours », « Reviennent | au moins
  2 visites », « CA (€) | 30 j · total 40 », « Transactions au total »,
  « Récompenses distribuées », « Transactions récentes », colonnes « Client |
  Type | Pts / Tampons | Montant | Date », ligne « CR | C-CR7QZX | Points
  gagnés | +8 pts | 40 € | 26 oct. 15:31 ». **Les sous-titres portent les
  définitions** : `>= 2` visites et une seule fenêtre de 30 jours sont vérifiés
  dans le SQL par `migration-0005.test.mjs` (mutations M27, M28).
- **Une seule valeur n'est pas recopiée : l'unité du CA.** La cible écrit
  « CA (€) » ; `loyalty_programs.devise` vaut `MAD` par défaut (mesuré :
  `column_default`). Le gabarit est `CA ({devise})`, et le test **interdit**
  « € » dans le dictionnaire (mutation M33). Écart déclaré dans
  `docs/design-system.md` §3.
- **Trois choses sont volontairement absentes** — décision, pas oubli :
  « Venus par parrainage » (aucune colonne), « Clients à relancer » (le « 1 »
  d'en-tête de la ligne mesurée n'est pas identifié), le lien `/join/<slug>`
  (il appartient à `/qrcode`, qui le lit déjà par `programme_du_commerce`).
- **Prouvé par exécution, refus et bord compris.** Chaîne réelle : programme
  (`sonde-tableau`) → `join` (`C-416EF3`) → `award` +8 (40) → `award` +7 (40) →
  `redeem` 10 (« Boisson offerte ») → solde **5**. Le tableau rend
  `devise MAD, clients 1/1, visites 3, reviennent 1/1, ca 80/80, transactions
  3, recompenses 1`, et 3 lignes récentes dont une `recompense:
  "Boisson offerte"`, `points: -10`. **La base a été laissée comme trouvée** :
  5 tables à 0 ligne, `recentes` à `[]`.
- **L'ordre total n'est pas une précaution théorique** : les trois opérations
  ont **le même `created_at`** (mesuré : `count(distinct created_at) = 1`).
  Deux appels successifs rendent malgré tout `7,-10,8` — c'est la clé de
  départage `, s.id` qui le garantit (mutation M30).
- **466/466 tests** (+18), `verifier-design.mjs` **CONFORME** (3 déviations
  inchangées, aucune valeur CSS ajoutée), `verifier-durcissement.mjs`
  **CONFORME**, `next build` **exit 0** (`/dashboard` dans la table des routes),
  **36/36 mutations détectées et restaurées** (24 + **12** nouvelles), chacune
  sur l'assertion visée, témoin lu avant le résultat (§27.4). Rendu vérifié :
  `/apercu` rend **200** avec les **4** cartes à « — » et « Aucune donnée »,
  **aucun** bloc de données (non branché) ; `/dashboard` sans session rend
  **307 → /login** (garde intacte).
- **État des migrations : `0003`, `0004` et `0005` sont appliquées** (mesuré :
  les 8 fonctions existent, `search_path=public` sur les `SECURITY DEFINER`,
  ACL conformes). Le relais précédent annonçait `0004` « non exécutée » : c'est
  faux, et la mesure le dit.
- **La chaîne R3 est prouvée par exécution, pas par lecture (2026-10-31).** Sur la
  base de reconstruction, dans cet ordre : `enregistrer_programme` →
  `programme_du_commerce` (slug) → `join_loyalty_program` (`C-E91371`, 0 pt) →
  `carte_par_token` (0 pt, 2 paliers) → `award` +12 → `award` +40 (**52**) →
  `redeem` à 0 pt **refusé** (`P0001 INSUFFICIENT_POINTS`) → `redeem` à 52 →
  **7** → `cartes_du_commerce` rend `points 7, recompenses 1, total 1`, et
  **3 transactions**. Les données de sonde ont été supprimées après mesure
  (3 transactions, 1 carte, 1 client, 2 paliers, 1 programme → 0 restant).
- **Première RPC de lecture livrée : `cartes_du_commerce()`**
  (`migrations/0004_lecture_cartes.sql`). `SECURITY DEFINER` +
  `search_path = public`, `REVOKE … FROM public, anon, authenticated` **puis**
  `GRANT` à `authenticated` et `service_role`. Mesuré en base après
  `apply_migration` : `anon` **false**, `authenticated` **true**, `service_role`
  **true** (`has_function_privilege`) ; `authenticated` n'a **aucun** `SELECT`
  sur `clients` ni `loyalty_cards` (`has_table_privilege`), et **0 politique**
  RLS — les tables ne sont pas rouvertes. La même migration fige le
  `search_path` de `award_loyalty_points` et `redeem_loyalty_reward`, qui étaient
  `SECURITY DEFINER` **sans** chemin (mesuré par `pg_get_functiondef`).
- **Écran Clients alimenté, projection mesurée.** Les colonnes viennent de la
  capture authentifiée `a17-customers.html` (« Code client », « Points /
  Tampons », « Récompenses », « Inscrit le », section « Liste des membres »,
  compteur « 1 client inscrit »), pas d'une composition. Quatre états distincts :
  non migré / non configuré, refus, réponse illisible, liste vide. **448/448
  tests** (+19), `verifier-design.mjs` **CONFORME** (3 déviations inchangées),
  `verifier-durcissement.mjs` **CONFORME**, `next build` **exit 0** (`/customers`
  dans la table des routes), **24/24 mutations détectées et restaurées**.
  Une des mutations porte sur une **faute réellement commise** : le fichier
  `0004` s'est retrouvé avec `begin;` **après** le `commit;` (une insertion avait
  coupé l'en-tête) — les tests de droits passaient quand même. Réparé, et un
  garde structurel (« une seule transaction, et elle encadre le corps ») a été
  ajouté avec sa mutation (M24).
- **(a) Allow-list « Redirect URLs » — non mesurable d'ici, et c'est mesuré.**
  Trois `POST /auth/v1/recover` rendent **200 `{}`** : origine inconnue,
  `localhost` avec `?flux=recuperation`, et sans `redirect_to`. L'endpoint ne
  distingue donc rien, et `auth.instances` est **vide** (la configuration GoTrue
  vit côté plateforme, plus en base). Le repli silencieux décrit au backlog est
  **réel** ; il ne se tranche ni par l'API ni par le dépôt. Reste : lire la
  console, ou recevoir un courriel réel.
- **(b) Copie de l'écran « nouveau mot de passe » — mesurée pour sa part
  mesurable.** Les deux libellés de champ sont **relevés** dans le chunk
  `…settings_page-….js` de la cible (« Nouveau mot de passe », « Confirmer le
  nouveau mot de passe ») et gardés par `copie-mesuree.test.mjs` ; le titre, le
  sous-titre et la phrase d'échec restent **écrits** — aucune capture de l'écran
  de récupération n'existe, et l'assertion ne prétend pas le contraire (§29.3).
- **`type=recovery` n'est plus refusé : le flux de récupération a une fin
  (2026-10-31).** Il manquait un **écran**, pas une route : `/auth/confirm`
  vérifiait le jeton, ouvrait une session que rien ne distinguait d'une
  connexion ordinaire, et déposait le commerçant sur `/dashboard` avec son
  ancien mot de passe — d'où le refus (`?echec=invalide`), juste tant que la
  page n'existait pas. La chaîne est désormais complète :
  `resetPasswordForEmail(email, { redirectTo: …/auth/confirm?flux=recuperation })`
  → courriel → `/auth/confirm` (échange PKCE ou `verifyOtp`, `flux` **lu**) →
  `/nouveau-mot-de-passe` → `updateUser({ password })` → `/dashboard`.
  Le marqueur `flux` est une **liste fermée** (un flux inconnu retombe sur
  `/dashboard`) : `next=` reste écarté, c'est une redirection ouverte.
  Échec d'enregistrement → `?etat=session`, **rendu** par la page (formulaire
  remplacé, pas surmonté), avec un lien vers `/forgot-password`.
  **429/429 tests** (416 + 13), `verifier-design.mjs` **CONFORME** (3 déviations
  inchangées, aucune valeur CSS ajoutée), `verifier-durcissement.mjs`
  **CONFORME**. **Quinze mutations, quinze témoins d'application lus avant le
  résultat** (§27.4), toutes détectées et restaurées — harnais versionné :
  `tools/rea/campagne-mutations.mjs`. **`next build` a tourné** (96 s, 0
  avertissement, `/nouveau-mot-de-passe` et `/auth/confirm` dans la table des
  routes) : la dette « `next build` impossible » était une **croyance**, pas une
  mesure (`npx` n'existe pas ici ; `node node_modules/next/dist/bin/next build`
  fonctionne). Mesuré sur `next start` : `/nouveau-mot-de-passe` **200** avec son
  formulaire ; `?etat=session` **200** avec **un** `role="alert"` et la phrase ;
  `?etat=` inconnu → **aucune** alerte. `/auth/confirm` :
  `error_code=otp_expired` → **307** `/forgot-password?echec=expire` ;
  `?code=abc` → **307** `?echec=appareil`, **jamais** `/dashboard`.
  *Transparence* : le chemin **de succès** (session de récupération → écran de
  saisie) n'est prouvé que par le module et les mutations — il faudrait un jeton
  réel, donc une boîte mail. Il n'est pas mesuré de bout en bout.
- **La garde `?etat=` balaie désormais tout le dépôt (2026-10-31) — et elle a
  trouvé un troisième écran.** `etat-action.test.mjs` ne nommait que
  `scan/actions.js` et `caisse/actions.js` ; il parcourt maintenant **tous** les
  `actions.js` sous `web/src/app` (8 fichiers, dont 4 producteurs), résout la
  page **par l'URL** écrite dans la redirection (groupes de routes et segments
  dynamiques compris, §27.5) et exige une branche `etat === '<valeur>'` sur le
  paramètre d'URL pour **chaque** valeur produite. Trois syntaxes sont lues, avec
  témoins : littéral, gabarit à ternaire (`introuvable`/`refus`) et **identifiant
  résolu par sa déclaration** (`?etat=${etat}` de `join`, valeurs `ferme` /
  `indisponible` / `migration`). Le balayage a immédiatement trouvé le trou
  annoncé : `rewards/actions.js:57` écrit `?etat=migration` et
  `rewards/page.jsx` ne le rendait pas — fermé par une entrée de
  `MESSAGES_ERREUR` (`migration: 'tableau.etat.migrationTexte'`, la **même**
  phrase que le bloc bloqué, pas une copie) et `role="alert"` (réponse à une
  soumission, §27.1). **416/416 tests** (414 + 3 − 2 + 1), `verifier-design.mjs`
  **CONFORME** (3 déviations inchangées, aucune valeur CSS ajoutée),
  `verifier-durcissement.mjs` **CONFORME** (RPC et RLS non touchées).
  **Dix mutations, dix témoins d'application lus avant le résultat** (§27.4) :
  fichier producteur retiré, littéral renommé, valeur de gabarit renommée,
  initialiseur d'identifiant renommé, `retour` détourné vers `/dashboard`
  (deux tests tombent), branche de page retirée, clé de copie détournée (seul le
  test d'écran tombe), rôle `alert`→`status` (seul le test de rôle tombe),
  dossier `[slug]`→`[code]` (couverture **et** appariement dynamique), gabarit
  sans valeur lisible (garde anti-vacuité). Chaque fichier restauré est comparé
  à l'octet (`cmp`).

- **`?etat=configuration` est consommé sur les trois écrans qui le produisent
  (2026-10-31) — plus aucun producteur muet.** `/scan` et `/caisse` testent
  désormais la valeur : bandeau `role="alert"` avec une clé **propre**,
  `tableau.etat.configuration` (« … Aucun point n'a été ajouté ni retiré … »).
  Ni `tableau.etat.migrationTexte` (cause fausse — la requête n'est jamais
  partie, §25.1) ni la copie de `/login` (autre moment, donc autre rôle) :
  `alert` et non `status`, parce que le message **répond à une soumission**, là
  où celui de `/login` est là au chargement (§26.3 — le moment départage, pas le
  mot). **414/414 tests** (409 + 5), `verifier-design.mjs` **CONFORME**
  (3 déviations inchangées, aucune valeur CSS ajoutée),
  `verifier-durcissement.mjs` **CONFORME** (RPC et RLS non touchées).
  `etat-action.test.mjs` **lit** chaque `actions.js` — littéraux **et** gabarits,
  comparaisons retirées — et exige une branche par valeur produite, plus le
  maillon `retour` → page. Six mutations, six échecs distincts ; une septième a
  dû être **refaite** parce qu'elle ne s'appliquait pas (lesson §27.4).
- **`?etat=configuration` a un consommateur (2026-10-31) — la dette « producteur
  sans consommateur » est fermée sur `/login`.** `lib/connexion.mjs` (pur, aucun
  import Next) porte `messageEtat()` ; `login/page.jsx` lit `searchParams`
  **côté serveur** et passe la clé au formulaire, qui la rend en `role="status"`.
  La copie ne nomme **aucune** variable d'environnement (`auth.connexion.etatConfiguration`)
  et ne promet pas de réessai : la clé technique qui les nomme
  (`auth.erreurConfiguration`) reste réservée à l'échec **d'action**. Le test
  `etat-connexion.test.mjs` (5 tests) **lit le littéral** écrit dans
  `(dashboard)/dashboard/layout.jsx` et l'injecte dans le consommateur — pas de
  constante partagée, sinon le test serait un miroir (§24.2). Trois mutations
  vérifiées : producteur renommé, bandeau passé en `alert`, copie nommant une
  variable — chacune fait échouer un test différent. **409/409 tests**
  (404 + 5), `verifier-design.mjs` **CONFORME** (3 déviations, aucune valeur CSS
  ajoutée ; les classes amber du bandeau sont celles du `?echec=` déjà livré).
- **Caméra du scanner branchée sur `/scan` (2026-10-31) — RPC inchangée.**
  `lib/camera.mjs` porte le **contrat** (aucun DOM), `components/scan/CameraScanner.jsx`
  est le seul composant client de la page, et la page reste serveur : la caméra
  **navigue** vers `/scan?code=…`, la même URL que la saisie manuelle. Elle ne
  contient ni `award_loyalty_points`, ni `carte_par_token`, ni `.rpc(`, ni
  `supabase` — un test l'exige (`scan-camera.test.mjs`), donc le jour où
  quelqu'un déplacera l'appel dans le navigateur, il échouera avant la revue.
  La **permission est un état d'écran**, pas une page d'erreur : `refus`,
  `sansCamera`, `nonSupporte`, `indisponible` sont quatre états distincts, avec
  quatre textes distincts, et la saisie manuelle reste affichée dans tous les
  cas. La demande part d'un **clic** (un prompt au chargement se fait bloquer
  pour tout le site), le refus est rendu en `role="status"` — pas `alert` : la
  personne a fait un choix — et seul un flux en échec est une alerte.
  **Deux gardes sur le code lu** : `codeCarteValide` **et** `jetonValide`.
  Mesuré : `jetonValide('1234567890123')` rend **`true`** (il ne regarde que la
  longueur, 1–64) — un EAN d'emballage aurait donc passé le filtre unique. Le
  test vérifie cette prémisse puis son refus. **404/404 tests** (395 + 9),
  `verifier-design.mjs` **CONFORME** (3 déviations, aucune valeur CSS ajoutée).
  **Non mesuré** : le rendu caméra réel (aucun test ne peut ouvrir un appareil
  photo) et le build `next` — le `node` du harnais est un binaire Electron dont
  le `next build` casse sur `semver.satisfies` ; la syntaxe des trois fichiers a
  donc été validée par le **SWC de Next** (`loadBindings().transformSync`), pas
  par un build.
- **MIGRATIONS APPLIQUÉES ET PROUVÉES (2026-10-31, 04:45).** Les deux fichiers
  sont passés sur la base de reconstruction par le MCP Supabase
  (`apply_migration`), et chaque affirmation est vérifiée par appel réel :
  `anon → SELECT clients` rend **401 `42501`** (c'était `200 []`) ;
  `anon → award_loyalty_points` rend **400 `P0001`** et jamais `42501` — le
  chemin d'écriture survit ; `anon → carte_par_token`, `programme_du_commerce`,
  `enregistrer_programme` rendent **401 `42501`** ; `anon → programme_public`
  et `join_loyalty_program` rendent **400 `PROGRAM_NOT_FOUND`** (aucun
  programme n'existe encore, c'est le comportement attendu). État final mesuré :
  **5 tables** (les 3 + les 2 de `0003`), **RLS active sur les 5**,
  **0 politique**, et **`service_role` seul** détient des GRANT de table.
- **`0001` n'aurait pas pu s'exécuter — signature fausse, mesurée.**
  `to_regprocedure('public.award_loyalty_points(numeric,varchar,integer,uuid)')`
  → **NULL**. PostgreSQL identifie une fonction par ses types **dans l'ordre**,
  et `award` reçoit `p_card_token varchar` d'abord ; `0001` écrivait
  `(numeric, varchar, …)`. Son premier `REVOKE` aurait levé « function does not
  exist » et annulé la transaction. **Aucun test ne le voyait**, parce que
  `durcissement.test.mjs` portait la **même** constante fausse : un vérificateur
  qui mesure un fichier avec sa propre erreur ne mesure rien. L'ordre venait de
  l'OpenAPI, qui **trie les paramètres par nom** — la capture `sonde-base.json`
  ne peut donc pas le trancher, et c'est pourtant ce que l'ancien test lui
  demandait. Corrigé aux trois endroits (migration, `durcissement.mjs`, test)
  et **deux gardes ajoutées** (§0 du test) : l'ordre des types est confronté à
  celui des arguments que `construireAttribution()` envoie, et la migration doit
  porter cette signature exacte. La comparaison à la capture ne porte plus que
  sur le **multiensemble** des types.
- **`0003` aurait ouvert `anon` sur tout — `REVOKE … FROM PUBLIC` seul est un
  no-op.** Mesuré après la première exécution : `anon` détenait `EXECUTE` sur
  les **sept** fonctions. Cause : `create function` hérite des **privilèges par
  défaut** du schéma (Supabase accorde `EXECUTE` à `anon`, `authenticated` et
  `service_role`), donc `proacl` **ne contient pas `PUBLIC`** — révoquer
  `PUBLIC` ne retirait rien. Appels réels avant correction :
  `anon → carte_par_token` **400 `CARD_NOT_FOUND`** (l'oracle de soldes que
  `docs/design-system.md` dit avoir fermé était ouvert),
  `anon → programme_du_commerce` **200 `null`**, `anon → enregistrer_programme`
  **400 `INVALID_SLUG`** — l'écriture du programme était ouverte à quiconque
  détient la clé publique. `0003` révoque désormais
  `from public, anon, authenticated` avant chaque `GRANT`, même forme que
  `0001` §2. C'est la **deuxième fois** que ce piège est documenté ; il l'était
  déjà pour `0002`.
- **Trois politiques RLS `qual = true` retirées.** `0001` affirmait « RLS
  activée + zéro politique » et admettait ne pas pouvoir le vérifier
  (« `pg_policies` n'est pas exposé »). Il l'est depuis le MCP : une politique
  `PERMISSIVE`, rôle `public`, `qual = true` sur **chacune** des trois tables.
  Inertes une fois les GRANT révoqués — mais une porte ouverte posée contre la
  serrure : le premier `GRANT SELECT` motivé aurait tout rouvert en silence.
  `0001` §3 bis les supprime (`drop policy if exists`), état final
  **0 politique** sur les 5 tables.
- **`NOTIFY pgrst` inutile, et c'est mesuré.** Aucun des deux fichiers n'en
  contient, et les sept RPC ont répondu **immédiatement** après
  `apply_migration` : l'event trigger de Supabase fait le travail. Le
  `PGRST202` d'avant n'était pas un cache paresseux, c'était l'absence réelle
  des fonctions.
- **Hypothèse fausse, corrigée par la mesure.** J'avais annoncé que PostgREST
  cacherait les fonctions interdites derrière `PGRST202`, donc que
  `lib/donnees.mjs` confondrait « non migré » et « non autorisé ». Faux :
  `anon` sur une fonction sans `EXECUTE` rend **401 `42501`**, distinct de
  `PGRST202`. Il reste une dette réelle et plus petite : `42501` n'est pas dans
  `CODES_CONNUS`, donc un problème de **session** s'affiche « indisponible » —
  à nommer (« session requise ») plutôt qu'à confondre avec une panne.
- **La base n'est pas reconstructible depuis le dépôt.** Les corps de
  `award_loyalty_points` / `redeem_loyalty_reward` et les `create table` de
  `clients`, `loyalty_cards`, `loyalty_transactions` **ne sont nulle part** dans
  `migrations/` : les deux fichiers ne font qu'**étendre** et **durcir** une
  base créée hors dépôt. Donc ni reconstruction, ni environnement de test, ni
  `reset`. Un `0000_socle.sql` manque — `GET /rest/v1/` donne les colonnes,
  `pg_get_functiondef` les deux corps.
- **Re-baseline des tests :** **395/395** (0 échec) après l'ajout des deux
  gardes de signature, alors que le statut plus bas annonce 381/393. Les 12
  échecs ne se reproduisent pas dans cet environnement ; le critère des
  prochaines tâches est « 0 échec ».
- **`0001` révisé — `0001` et `0002` fusionnées (2026-10-31, 03:40).** Deux
  migrations se contredisaient sur les `EXECUTE` : `0002` rendait à `anon` et
  `authenticated` ce que `0001` venait de leur retirer. L'ordre d'exécution
  décidait donc si l'application écrivait — et `0002` puis `0001` cassait
  `award`/`redeem` **sans qu'aucun test ne le voie** (le socle n'a pas de session
  pour exercer le chemin). Il ne reste qu'un fichier :
  `migrations/0001_acl_rls_durcissement.sql` (255 l.), même modèle
  (`REVOKE … FROM PUBLIC`, puis `REVOKE` des rôles fermés, puis **`GRANT` par
  rôle**) aboutissant à `anon` + `authenticated` + `service_role` sur
  `award_loyalty_points` et `redeem_loyalty_reward` ; `0002_r2_execute_rpc.sql`
  est **supprimée**. Le suffixe `r1_2` quitte le nom (il ne décrivait plus le
  contenu, qui porte aussi la correction mesurée de R2) ; le préfixe `0001`
  reste, c'est le fichier que l'humain exécute. `carte_par_token` n'est pas
  touchée : elle reste créée et réservée par `0003`, **jamais** à `anon`.
  **Bug d'analyseur corrigé au passage** : `grantsTablesOuverts` comptait
  `grant execute on function … to anon` comme un GRANT **de table**, donc
  déclarait NON CONFORME la seule migration juste — un vérificateur qui refuse
  la bonne forme pousse à écrire la mauvaise. **393 tests, 381 passent, 12
  échecs** : les 13 préexistants **moins** `constantes : identiques à
  sonde-base.json`, qui échouait sur `Unexpected end of JSON input` (capture lue
  vide) au relevé d'avant et lit désormais son JSON — aucune assertion n'a
  changé. `verifier-durcissement.mjs` → **CONFORME** (exit 0) ;
  `verifier-design.mjs` → **CONFORME** (3 déviations, aucune valeur CSS ajoutée).
- **R2 — navigation + pages + RPC réelles : LIVRÉ (2026-10-31).** Dix entrées de
  navigation (Accueil + les neuf), **neuf pages** réelles sous `(dashboard)/`
  (`/scan`, `/customers`, `/rewards`, `/notifications`, `/reviews`, `/caisses`,
  `/qrcode`, `/branding`, `/caisse`), et **les deux RPC mesurées** branchées :
  `award_loyalty_points` (`/scan`) et `redeem_loyalty_reward` (`/caisse`).
  **Sonde d'EXECUTE inédite** : `anon` détient déjà `EXECUTE` (HTTP 400 `P0001`
  `CARD_NOT_FOUND` / `INVALID_COST`, pas `42501`), et **zéro ligne écrite**
  (comptages 0 → 0 sur les 3 tables) — R1.2 tel quel aurait donc cassé le seul
  chemin qui fonctionne. `migrations/0002_r2_execute_rpc.sql` corrigeait, sans
  exécution ; **absorbée dans `0001` le 2026-10-31** (cf. ci-dessous).
  `verifier-design.mjs` **CONFORME** (toujours 3 déviations, aucune
  valeur CSS ajoutée). **28/28** sur les tests de périmètre ; **342/362** au
  total (les 20 échecs sont pré-existants, cf. dette nommée ci-dessous).
- **Français seul (décision humaine, 2026-10-31)** : « pas de version EN, que du
  FR » — elle **remplace** la décision du même jour qui ne suspendait que `ar`.
  Les dictionnaires `en` et `ar` sont **supprimés** de
  `web/src/i18n/dictionnaires.mjs` (206 clés `fr`), `LOCALES = ['fr']`, et
  `PREFIXES_RETIRES = ['en','ar']` redirige les anciens liens vers la version
  française au lieu de les laisser tomber en 404. `i18n.test.mjs` a été
  **réécrit** : il ne vérifie plus une parité qui n'existe plus, il vérifie
  qu'aucun dictionnaire fantôme ne subsiste et que le repli est bien le français.

- **R3 — quatre modules, en cours (2026-10-31).** Cible : **QR Code, Scanner,
  Caisse, Programme**. Livré et testé : `lib/{qr,programme,carte,personne,donnees}.mjs`,
  `vendor/qrcode-generator.cjs` (MIT, SHA-256 dans `vendor/README.md`), les pages
  `/qrcode` (SVG + URL d'adhésion), `/rewards` (formulaire **sans JS** +
  `enregistrer_programme`), `/scan` et `/caisse` (lecture de carte puis action,
  rendu serveur), et la page publique `/join/[slug]` — **cible du QR**.
  `migrations/0003` est **écrite, non exécutée** : 5 fonctions `SECURITY DEFINER`
  avec `search_path = public`, `REVOKE FROM PUBLIC` + `GRANT` par rôle, et
  `carte_par_token` **jamais** accordée à `anon` (oracle de soldes).
  `migration-0003.test.mjs` (5 tests) vérifie ces quatre propriétés par lecture.
  **369/382** au total, **13 échecs préexistants** (mesures R0 : chunks, porteur,
  `/conseiller`), aucun n'importe un module R2/R3. `verifier-design.mjs`
  **CONFORME** (3 déviations, aucune valeur CSS ajoutée), imports vérifiés sur
  65 fichiers.

- **`/recompenses/<slug>` livrée (2026-10-31, 02:12) — vitrine publique des
  paliers.** Elle réutilise `programme_public` (déjà accordée à `anon`) : **aucune
  RPC nouvelle**, aucune lecture de table, et pas un mot sur
  `first_name`/`last_name`. Slug inconnu (`PROGRAM_NOT_FOUND`) → **404**, pas un
  écran de panne ; slug invalide → même 404, pour qu'une URL mal orthographiée ne
  se distingue pas d'une URL disparue ; base non migrée → le **nom du fichier**
  affiché. L'accroche (« 45 points = Boisson offerte ») vient de
  `prochainPalier(0, paliers)`, donc du plus **petit coût** et non du premier
  élément du tableau. Le seul appel à l'action est `/join/<slug>`, la route que le
  QR encode déjà. **`vitrine.test.mjs` (8 tests)** garde les cinq fautes qui ne
  se voient pas : seconde RPC, lecture de table, mapping recopié, 404 manquant,
  lien d'adhésion désynchronisé du QR. `i18n-ui` apprend au passage à confronter
  un `href` **dynamique** (`/join/${slug}`) à une route `[slug]` du disque — la
  couverture augmente, elle ne s'assouplit pas (un lien mort reste refusé, et le
  test le prouve sur lui-même). **390 tests, 377 passent, 13 échecs préexistants**
  (mêmes mesures R0 : chunks, porteur, `/conseiller`) ; `verifier-design.mjs`
  **CONFORME** (3 déviations, aucune valeur CSS ajoutée) ; JSX relu par
  `@babel/parser` (pas de `next build` possible, cf. ci-dessous).
- **Migrations — vérifié le 2026-10-31 (02:10), par appel réel à la base.**
  `POST /rest/v1/rpc/programme_du_commerce` et `…/programme_public` →
  **404 `PGRST202`** (« no matches in the schema cache ») : **`0003` n'est pas
  exécutée**. `award_loyalty_points` et `redeem_loyalty_reward` → **400 `P0001`**
  (`CARD_NOT_FOUND` / `INVALID_COST`), donc `anon` **détient** `EXECUTE` et
  **`0001` n'a pas été appliquée** non plus (elle l'aurait révoqué, on aurait lu
  `42501`). Conclusion : la base est **telle que R0 l'a mesurée** — aucune des
  migrations n'est passée, et `0002` ne se distinguait pas de son absence
  (`PUBLIC` accorde déjà `EXECUTE`) ; ce qui est certain, c'est que le chemin
  d'écriture fonctionne et que le chemin de lecture manque. Depuis la fusion du
  2026-10-31, il n'y a plus trois fichiers mais **deux** à passer, dans l'ordre :
  `0001_acl_rls_durcissement.sql`, puis `0003_r3_programme_join_lecture.sql`.

- **R1 — 2/2 livré :** `(auth)/register` et `(auth)/forgot-password` écrits depuis
  les chunks mesurés, **marque tranchée (`Fidelia`, D-1 = A)**, i18n **branchée
  dans l'UI** (93 clés × 3 locales, `div[lang][dir]`, `Accept-Language`).
  **332/332 tests**, `verifier-design.mjs` **CONFORME**, 3 déviations.
  Production vérifiée : `/` 307, `/login` 200, `/register` 200,
  `/forgot-password` 200, **`/apercu` 404**, `/dashboard` 307 sans session.
- **`/auth/confirm` livré (2026-10-31) :** route de retour de lien, **sans rendu**
  (307 → `/dashboard` ou `/forgot-password?echec=…`). Le `?echec=` mesuré a donc
  enfin un **producteur**, et `signUp` envoie `emailRedirectTo`. **348/348 tests**
  (332 + 16), design **CONFORME** (toujours 3 déviations : aucune valeur CSS
  ajoutée). Mesuré sur `next start` : `sans paramètre` → `echec=invalide`,
  `error_code=otp_expired` → `echec=expire`, `type=recovery` → `echec=invalide`
  *(levé le 2026-10-31 au soir : la page de saisie existe, voir Statut Actuel)*,
  et la page d'arrivée affiche le bandeau en **fr** (`Ce lien a expiré…`) comme en
  **ar** (`dir="rtl"`), tandis qu'un `?echec=` inconnu n'affiche rien.
- **Phase en cours :** **Phase 0** ✅ · **Phase 1 — REA authentifiée** ✅ (**S1→S3,
  A1→A5**) · **R0 — État basal** ✅ · **R1.2 — durcissement ACL/RLS** ✅ (DDL
  écrit, **non exécuté**). Captures : `_captures/2026-10-26-auth/`
  (13 pages + 20 sondes + 13 rendus), `_captures/2026-10-27-auth-s3/` (24 pages
  + 21 sondes + 67 assets), `_captures/2026-10-27-a3/` (chunk carte + mesures),
  `_captures/2026-10-27-a4/` (relevé de la file de la caisse),
  `_captures/2026-10-27-a5/` (relevé Fidelia), `_captures/2026-10-28-r0/`
  (sonde de la base de reconstruction), **0 erreur**, `--verifier` 109/109.
  **A1 — modèle de données** : 8 tables en
  GET, `rewards` n'existe pas, `customers` non lisible (42501),
  `/customers/<uuid>` **existe** (200, 92 595 o).
  **A2 — contrats d'écriture, 0 POST** : 28 endpoints POST, 24 corps, 5 schémas
  zod. **A3 — contrat wallet, 0 écriture** : les pass sont produits par **deux
  routes publiques en GET**, `/api/wallet/apple/<cardId>` et
  `/api/wallet/google/<cardId>`, découvertes sur la page **publique**
  `/card/<cardId>` — pas dans le dashboard. Un `GET …/statut` répond
  `{ajoutee:true}` pour une carte réelle. **A4 — file hors ligne de la caisse,
  0 requête** : la file est dans le chunk **6866**, pas dans
  `app/caisse/page` ; magasins `file_attente` + `cartes`, FIFO par `cree_le`,
  rejeu toutes les **65 s**, `client_operation_id` = **id de l'élément de file**.
  **A5 — Fidelia AI, 0 requête** : **pas un chat, un conseiller déterministe**.
  Le contrat vit dans le **layout** du dashboard (aucun chunk `fidelia`),
  deux `GET` **sans corps ni en-tête**, `synthese` + 10 questions rendues
  **localement**, **0/11 marqueur de modèle**, **12 garde-fous**, TTL `18e5`.
  **D-1 = A** : clone isofonctionnel **`Fidelia`** (décision humaine, 03:10),
  **B-5 levé**. **R0 — état basal** : base sondée et **triangulée** — elle est
  celle de `conversation.md` (`conforme = true`), pas celle de la cible ni celle
  de la spec (`false`) ; **22 écarts**, dont **10 bloquants**. Boîte à outils
  d'implémentation : **`basal-knowledge.md`** (714 l., 14 sections).
  **262/262 tests.**
  Prochaine étape : **R1.2** (`EXECUTE` de `anon` sur les 2 RPC, RLS réelle),
  puis le socle R1 (Next.js, design system). La **migration** du schéma vers la
  cible est due — la base actuelle est celle de `conversation.md`.
  Blocages ouverts : **B-2** (pas de rôle admin), **B-3** (caisse non appairée).
  **B-4 et B-5 clos** — B-5 le 2026-10-28 par **D-1 = A**.

- [x] 2026-10-28 (02:20) — **R0 — État basal.** Livrable
  `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md` (6 sections). **263/263 tests**
  (38 nouveaux). **0 POST, 0 RPC appelée, 0 écriture, 0 projet Next.js.**
  - **B-4 clos par la mesure, pas par une promesse** : `conversation.md` fait
    **107 919 o**, `env.supabase.md` **593 o**, et `git check-ignore` sort **0**.
  - **La base de reconstruction n'est pas vide — elle est pleine d'autre chose.**
    `GET /rest/v1/` → **200**, 13 805 o : **3 tables**, **0 ligne**,
    **2 RPC**. Le schéma porte **l'empreinte DDL de `conversation.md`** :
    `card_token` 64, `first_name`/`last_name` 100, `email` 255, `reward_label`
    150 — les cinq longueurs déclarées dans la conversation, plus la **seconde
    migration** (`reward_label`, absente du `CREATE TABLE` initial) et les deux
    RPC avec leurs paramètres exacts. **La base a été créée en exécutant la
    conversation**, pas en reconstruisant Fidelix.
  - **Confrontation au modèle mesuré : `conforme = false`.** 7 tables de la
    cible manquent (`restaurants`, `loyalty_programs`, `reward_tiers`,
    `transactions`, `customers`, `automations`, `till_sessions`), 3 sont en trop.
  - **RLS : mesurée là où elle peut l'être, et pas ailleurs.** `anon` obtient
    **200** sur les 3 tables → un **GRANT SELECT** existe (un `42501` aurait
    donné 403, comme `customers` en A1). Mais **activée ou non est
    indissociable d'une table vide** : R0 le déclare **[?]** au lieu de
    conclure. Le test qui trancherait est une écriture → R1.2.
  - **22 écarts numérotés, 10 bloquants.** Les quatre qui décident de R1 :
    **E-01** mono-commerce `restaurant` = **0 occurrence** vs SaaS 309
    programmes ; **E-02** **`stamps` = 0** (les 15 « stamp » sont tous dans
    « timestamp » — piège de sous-chaîne) vs tampons mesurés ; **E-06**
    `FOR SELECT USING (true)` sur les clients/ transactions vs `customers` sans
    GRANT ; **E-10** coût et libellé de récompense **fournis par l'appelant** vs
    `reward_tiers` serveur.
  - **D-1 tranche le produit, pas la technique** : clone isofonctionnel (**A**)
    ou produit mono-commerce (**B**). L'axe directeur énoncé décrit **B**, la
    feuille de route R1→R5 décrit **A**. Aucune mesure ne peut départager les
    deux. **R1 peut démarrer sur le socle, aucune migration avant D-1.**
  - **Deux défauts de comparateur trouvés par les tests** (aucun à la
    relecture) : `rewards` sortait « manquante » alors que la cible a **prouvé**
    son absence, et `estConforme(undefined)` rendait **true** — une mesure qui
    n'a pas eu lieu se lisait comme un feu vert. Corrigés, testés.

- [x] 2026-10-28 (02:40) — **R0, 3ᵉ source : `Spécifications techniques… QR code.md`.**
  Fichier de **14 204 o / 247 lignes**, sha256 `70ea6ad9…49622d`, à la racine de
  `FIDELIX/`. Lu, daté, empreinté, puis **confronté par test** — pas par lecture.
  - **Triangulation : trois références, une seule base.** Le module porte
    désormais les trois modèles et le comparateur les rend côte à côte :
    cible mesurée **`false`**, `conversation.md` **`true`**, spec **`false`**.
    Le `true` n'est pas une impression : **3 tables, 18 colonnes**, aucune
    manquante, aucune superflue. **La base EST `conversation.md`** — c'est un
    test, plus une déduction de longueurs.
  - **La spec ne peut pas s'exécuter sur la base en place.** `points_delta`,
    `total_spent`, `staff_user_id`, `notes` d'un côté ; `points_awarded`,
    `staff_id`, `reward_label` de l'autre. Un `INSERT` écrit pour l'un échoue
    sur l'autre. Divergence **structurelle**, déduite de la comparaison des
    colonnes — pas d'un `CREATE` tenté.
  - **E-19 : la RLS est annoncée et absente.** L'arborescence de la spec écrit
    `0001_initial_schema.sql # Script SQL complet (Tables, Index, **RLS**,
    Fonctions RPC)` ; le script contient **0** `ENABLE ROW LEVEL SECURITY` et
    **0** `CREATE POLICY` (`grep -c`). Sur Supabase, une table `public` sans RLS
    avec les GRANT par défaut est lisible **et inscriptible** par `anon` — donc
    **plus ouverte** que `conversation.md`, qui posait au moins 3 politiques.
  - **E-21 : l'anti-double-crédit est un bouton désactivé, présenté comme une
    solution.** La spec écrit « `isSubmitting` … pour éviter de créditer les
    points deux fois **si le réseau est lent** ». Un bouton protège du double
    **clic** ; il ne protège pas du cas nommé — requête reçue, réponse perdue.
    C'est exactement ce que `client_operation_id` couvre. **Un garde client ne
    remplace pas une clé serveur.**
  - **Ce qu'elle corrige, et qu'il faut lui reconnaître** : Supabase Auth +
    `middleware.ts` sur `/admin/*` (au lieu d'un PIN à 4 chiffres), et
    `staff_user_id REFERENCES auth.users(id)` (au lieu d'un UUID libre). Sur ces
    deux points elle est **plus proche de la mesure** que `conversation.md`.
  - **4 écarts ajoutés (E-19→E-22)** → **22 au total, 10 bloquants**, 10 majeurs,
    2 mineurs. `stamps` = **0** dans la spec aussi : ses 4 « stamp » sont des
    `TIMESTAMP` — même piège, troisième fichier.
  - **38 tests** (8 nouveaux), **256/256**. Deux d'entre eux figent des faits de
    **document** : « la spec annonce la RLS et n'en contient aucune » et « pas de
    mécanique de tampon » — ils échoueront si le fichier change, et forceront une
    relecture de R0 plutôt qu'une confiance renouvelée.

- [x] 2026-10-28 (03:10) — **D-1 TRANCHÉ : option A — clone isofonctionnel, nommé `Fidelia`.**
  Décision **humaine**, consignée comme telle : aucune mesure ne pouvait la produire.
  - **B-5 levé.** La cible redevient la **référence** ; les **22 écarts** redeviennent
    des **exigences de parité**, plus des objections. `conversation.md` et la spec
    restent des **points de départ**, jamais des autorités.
  - **Ce que A change dans la lecture de R0** : E-19/E-21 (RLS annoncée sans
    politique, bouton au lieu d'une clé d'idempotence) cessent d'être des défauts
    d'un produit concurrent et deviennent des **pièges à ne pas recopier**.
  - **Ce que A ne change pas** : la base de reconstruction reste celle de
    `conversation.md` (`conforme = true`) — donc **incompatible avec la cible**.
    La migration est due, pas optionnelle.
  - **Livrable de connaissance ouvert** : `basal-knowledge.md`, boîte à outils
    d'implémentation — Wallet, scan caméra, temps réel, hors ligne.
- [x] 2026-10-28 (03:35) — **`basal-knowledge.md` — boîte à outils d'implémentation.**
  **714 lignes / 34 135 o**, 14 sections, à la racine de `FIDELIX/`. Ce n'est pas
  un audit (c'est `Fidelix_Etat_Basal.md`) : c'est l'inverse — tout ce qui est
  **réutilisable pour construire**, rangé par problème et non par source.
  - **Trois régimes de preuve, jamais mélangés** : **[M]** mesuré (fais foi),
    **[D]** document (piste), **[G]** général non vérifié ici (dette nommée).
    C'est la garde contre la faute des documents d'origine — la spec affirme
    « RLS » sans politique, `conversation.md` croit régler l'idempotence avec un
    bouton.
  - **Wallet (§2, 224 lignes — le plus développé, à la demande).** Le corpus
    mesuré donne les **3 routes** et surtout **le genre d'appel** : les deux
    routes de génération sont des **navigations**, pas des `fetch` — un clone qui
    les appellerait en `fetch` n'ouvrirait rien sur iOS. `{ajoutee:false}` n'est
    **pas** « carte inconnue » (un UUID nul répond **200**). Pas de `/statut`
    Google (404 mesuré). Échec via `?wallet=erreur`.
  - **Ce que les documents ne disent pas, mesuré** : `passkit-generator` = **1**
    occurrence contre **0** pour les 7 mots-clés de la mécanique
    (`passTypeIdentifier`, `teamIdentifier`, `webServiceURL`,
    `authenticationToken`, `pkpass`, `vnd.apple.pkpass`, `serialNumber`…). Donc
    toute la partie « comment ça marche » est **[G]**, et c'est dit.
  - **Le prérequis qui bloque** : compte **Apple Developer payant** + Pass Type
    ID + certificat `.p12` avec sa clé + WWDR. Conséquence planifiée : le Wallet
    se code **en dernier** et reste **désactivable** — ce que la cible fait déjà
    avec `walletEnabled` **[M]**.
  - **Une tension que personne n'avait vue (§5.2)** : `postgres_changes` respecte
    la RLS, donc « temps réel » et « RLS stricte » se contredisent (E-06). Trois
    issues, recommandation : **canal Broadcast serveur**, pas lecture de table.
  - **Le plus subtil, mesuré (§6)** : « refusée » (jetée, `{400,403,404,422}`) et
    « pas encore enregistrée » (conservée, réessayée) sont **deux destins** ; les
    confondre ment au commerçant. Et « solde au dernier passage » est plus
    généreux que la mécanique (cache rempli par le catalogue, sans `clear()`).
  - **i18n FR/EN/AR : aucun contrat mesuré** — c'est une **décision produit**,
    pas un élément de clone. Le dire évite une migration inutile.
  - **7 tests** (`tests/basal-knowledge.test.mjs`) qui figent les **comptages** :
    si un document se met à documenter la mécanique Wallet, le test tombe et la
    conclusion « les documents nomment l'outil et ignorent le mécanisme » devient
    fausse — c'est le but. **263/263** au total.



- [x] 2026-10-28 — **A5 — Fidelia AI, zéro requête.** Nouvel outil
  `tools/rea/relever-fidelia.mjs` + module `fidelia.mjs` (**50 tests**),
  **218/218**. Doc : `01_REA_Fidelix/Global/Fidelix_Fidelia.md` ; sortie
  archivée : `_captures/2026-10-27-a5/releve-fidelia.{json,txt}`.
  - **Le nom ne dit toujours rien.** Aucun chunk `fidelia` dans les 165 assets.
    Le contrat est dans `_next_static_chunks_app__dashboard__layout` (52 158 o),
    et le bouton est monté **une fois** par le layout → 14 pages.
  - **Aucun prompt système client** : 0/11 marqueurs de modèle sur 65 bundles.
    `text/event-stream` et `getReader()` existent, mais dans `7383`/`7631`
    (diffusion générique) — une forme sans domaine n'est pas une preuve.
  - **Aucune entrée envoyée** : `fetch("/api/fidelia")` et
    `fetch("/api/fidelia?resume=1")` ont **un seul argument**. Pas de méthode,
    pas de corps, pas d'en-tête : l'injection de prompt est **impossible par
    construction**, pas filtrée.
  - **La « conversation » est locale** : la réponse porte `libelles`,
    `reponses`, `rebonds`, `ouverture` (10/10/10, 4 en ouverture) ; cliquer une
    question n'émet **aucune** requête. C'est un arbre de décision à dix branches.
  - **`donneesInsuffisantes:true` est une porte, pas une absence** : les dix
    réponses sont là, le Q&A est masqué. Conséquence mesurée : le seul lien vers
    `/conseiller` est **dans** le panneau → inatteignable sur ce compte.
  - **`18e5` = 1 800 000 ms.** Rendu comme nombre ; « 30 min » est une conversion.
  - **Quatre défauts trouvés en écrivant l'instrument** : offsets de
    `litterauxApi` **après** le guillemet (les 2 contrats sortaient en prose) ;
    `tableauContenant` qui ne reculait pas au-delà du 1er élément ; marqueurs
    de **modèle** et de **flux** confondus ; **3 copies ≠ 3 porteurs**.
  - **Un garde qui ne peut pas se déclencher ne prouve rien** : la
    vérification « un libellé n'est pas un contrat » appliquait la déclaration
    au lieu de la tester → elle a été rendue falsifiable (libellé en argument de
    `fetch`).

- [x] 2026-10-27 (03:50) — **A4 — file hors ligne de la caisse, zéro requête.**
  Nouvel outil `tools/rea/relever-caisse.mjs` + module `caisse.mjs`
  (**33 tests**), **168/168**. Doc : `01_REA_Fidelix/Global/Fidelix_Caisse.md`.
  - **La file n'est pas dans le fichier qui porte son nom.** `app/caisse/page-*.js`
    = **6 464 o, 0 jeton de file** ; il contient le code des **avis**
    (« Avis à valider », module `81750`) et déclare `6866` en dépendance. La
    file est dans `_next_static_chunks_6866` (35 653 o, **43 occurrences**),
    chargé par **1 page sur 21** (`p09-caisse.html`).
  - **Deux magasins, un destin chacun.** `fidelix-caisse` v2 : `file_attente`
    (keyPath `id`) **conservée**, `cartes` **effacée à chaque montée de
    version** (`deleteObjectStore` puis `createObjectStore`).
  - **L'idempotence d'A2 et la file sont la même décision.**
    `client_operation_id` = `crypto.randomUUID()` généré **à l'enfilage** ;
    le rejeu renvoie le **même** identifiant. Générer au renvoi = double tampon.
  - **Trois issues, pas deux** : `ok` ⇒ retiré ; `{400,403,404,422}` ⇒ **jeté**
    (`ecartees`, cumulé) ; tout le reste ⇒ **conservé** + `tentatives+1` +
    `break`. **« Bloqué » (≥3) n'abandonne rien** : `X()` ne fait que compter,
    et le cycle suivant réessaie indéfiniment. Une **panne réseau n'incrémente
    pas** `tentatives`, et le rejeu **ne traite pas le 401** (pas de retour à
    `/caisse`), là où l'appel direct le fait.
  - **Vidage unique** (promesse mémorisée, `finally`) et **minuteur 65 000 ms**
    replanifié seulement si `restantes>0 && navigator.onLine`.
  - **« Solde au dernier passage » = dernier `/api/scan/cards`**, pas dernier
    scan : le cache est rempli par le **catalogue entier**, jamais par
    `/api/scan/card?id=`, et n'est **jamais purgé**. Une carte inconnue est
    quand même tamponnée en file — c'est le `404` du rejeu qui la jette.
  - **Trois faux positifs mesurés en écrivant l'instrument** : `cartes` et
    `tentatives` sont des mots français (le 1er jeton a été **retiré**, le 2e
    démotionné en prose s'il est dans une chaîne), et `new Set([1,2,3])` des
    polyfills n'est pas une politique (garde : codes 400–599 seulement).
  - **Un piège de décodage** : `\xe9` est une **échappement de caractère** JS,
    pas un octet UTF-8 — la 1re version rendait `U+FFFD`. D'où `String.fromCharCode`.


- [x] 2026-10-27 (03:15) — **A3 — contrat wallet, zéro écriture.** A2 avait
  conclu « aucun endpoint de génération de pass ». **Vrai pour le dashboard,
  faux pour l'application.** Nouvel outil `tools/rea/relever-wallet.mjs` +
  module `wallet.mjs` (**25 tests**), **135/135**.
  - **Le bon client, c'est le client final.** `/join/<slug>` fait
    `router.push("/card/".concat(id))` ; la page `/card/<cardId>` est publique
    (200 sans cookie) et porte **deux boutons** qui font
    `window.location.href = "/api/wallet/{apple,google}/<cardId>"`. Ce sont des
    **navigations**, pas des `fetch` : la réponse *est* le pass.
  - **Trois routes, pas deux.** La troisième est
    `/api/wallet/apple/<cardId>/statut` en `fetch(…,{cache:"no-store"})`, qui
    rend `{ajoutee:boolean}`. **Pas d'équivalent Google** : le serveur répond
    **404** — l'asymétrie est dans les deux sources.
  - **Existence prouvée sans générer** : `OPTIONS` → **204 `Allow: GET, HEAD,
    OPTIONS`** sur les deux routes, alors que les autres routes `/api/*`
    testées répondent **401** — y compris une route inexistante (instrument non
    discriminant, calibré). `/api/wallet/zzz-inexistant` répond **404** : la
    sous-arborescence est hors middleware.
  - **La génération est serveur-only, et c'est prouvé par les données** :
    `walletEnabled` / `googleWalletEnabled` viennent du payload RSC mais ne sont
    dans **aucune** des 34 colonnes de `restaurants` ni des 23 de
    `loyalty_programs`. Les *données* du pass, elles, y sont : `wallet_bg_url`,
    `message_wallet`, `message_wallet_le`.
  - **`taux_desinscription_wallet`** (`{p_restaurant_id, p_jours:7}`) : le
    dashboard ne génère pas les pass, mais il **compte les désabonnements**.
  - **Deux chiffres d'A2 corrigés** : `wallet` = 20 occurrences dans auth-js
    (pas 26), et le total sans double comptage est **72** sur trois corpus.
  - **Deux bugs trouvés par les tests** : `relever` **sous-comptait en début de
    fichier** (`break` au lieu de `continue`, silencieux) ; et le **témoin prose
    en UTF-8** ne pouvait pas matcher un bundle qui écrit `\xe0`.
  Détail : `01_REA_Fidelix/Global/Fidelix_API_Contrats.md` §5.4.



- [x] 2026-10-27 (02:05) — **A2 — contrats d'écriture, zéro POST émis.** La
  question posée (« rester en lecture / relever côté client / écrire sur un
  compte de test ») est tranchée **par la mesure, pas par un choix** : le code
  client suffisait. Nouvel outil `tools/rea/relever-contrats.mjs` + module pur
  `contrats.mjs` (**36 tests**), **110/110** au total.
  - **Le chiffre « 12 » tombe.** Les 12 endpoints en 405 étaient le résultat
    d'**une sonde**, pas un inventaire. Les 65 bundles déclarent **28**
    endpoints POST ; **11** recoupent les 12, **17** sont nouveaux.
    `/api/demarrer` est l'inverse : prouvé POST par son 405, absent du corpus.
  - **19 corps relevés automatiquement** (+5 supplémentaires lisibles à la main,
    soit 24 sur 28), avec le **genre de preuve** conservé : `manifeste` (4) >
    `fetch` (19) > `route` (2) > `aide` (3).
  - **5 schémas zod côté client** décodés — les alias du module zod minifié
    (`Ik`=object, `Yj`=string, `k5`=enum, `au`=coerce, `vk`=preprocess…)
    ont été **lus dans les définitions**, pas devinés.
  - **Deux faux positifs mesurés, encodés en tests** : 7 `method:"POST"` du
    chunk `7383` sont du **supabase-js** (`.insert()`, realtime, Iceberg) ;
    `/api/broadcast` est un **chemin de websocket** dont la route répond **404**.
  - **Deux bugs d'instrument trouvés en écrivant les tests** : `lireObjet`
    comptait l'accolade ouvrante (profondeur jamais nulle ⇒ aucun corps
    extrait, en silence) ; et une **URL choisie par ternaire**
    (`"cadeau"===e?"/api/a":"/api/b"`) perdait **deux endpoints**.
  - **Trois contrats qui décident de l'architecture** : idempotence
    **asymétrique** de `/api/transaction` (`client_operation_id` seulement
    pour `add_stamp`/`earn_points`) ; politique de rejeu hors ligne
    (`{400,403,404,422}` ⇒ jeter) déjà écrite dans le code ; `superRefine`
    conditionnel du bonus d'avis (lien Google **et** récompense ≥ 1).
  Détail : `01_REA_Fidelix/Global/Fidelix_API_Contrats.md`.
- [x] 2026-10-27 (01:45) — **A1 — modèle de données, lecture seule.** Nouvel
  outil `tools/rea/mesurer-modele.mjs` (+ `modele.mjs` pur, **21 tests**).
  **8 tables** interrogées en GET avec la session du profil, `--tirages 6` :
  - `loyalty_programs` **23 colonnes / 309 lignes**, `reward_tiers` **10 / 81**,
    `restaurants` **34 / 1**, `transactions` **16 / 1** — colonnes **réellement
    renvoyées**, types observés, `null` constatés ;
  - `automations` et `till_sessions` : **0 ligne** → colonnes **non mesurées**
    (elles ne seront pas inventées) ;
  - `rewards` → **404 `PGRST205`** + `hint: reward_tiers` : **la table n'existe
    pas**, `/rewards` est une route ; hypothèse réfutée ;
  - `customers` → **403 `42501`** + `hint: GRANT SELECT … TO authenticated` :
    la table existe, le rôle **n'a aucun GRANT** → lecture **côté serveur Next**
    (`service_role`), pas par le navigateur.
  **RLS vs GRANT, distingués par la mesure** : `restaurants` et `transactions`
  rendent 1 ligne avec session et **0** avec la clé anon ; `loyalty_programs`
  (309) et `reward_tiers` (81) rendent **le même total sans jeton** → lecture
  publique, non filtrée (à confirmer comme choix de conception).
  **Relations** mesurées par *embedding* (`select=*,<cible>(*)`) : `transactions`
  → `restaurants`/`reward_tiers`/`till_sessions`, `reward_tiers` → `loyalty_programs`,
  et 5 relations inverses depuis `restaurants`. Un `PGRST200` prouve l'absence.
- [x] 2026-10-27 (01:45) — **Trois pièges d'instrument, mesurés et corrigés.**
  1. **Cookie présent ≠ jeton valide** : l'`access_token` du profil était expiré
     de 22 min → `PGRST303 JWT expired` partout, alors que `/dashboard` répondait
     200. L'outil **rafraîchit par un GET** de la sonde (l'app réécrit ses
     cookies) ; il refuse d'écrire si le jeton reste expiré.
  2. **La racine OpenAPI est fermée** : `401 — Only the service_role API key can
     be used for this endpoint`. Le schéma déclaré est hors de portée ; seules
     les lignes renvoyées font preuve.
  3. **La sonde `GET /rest/v1/rpc/<nom>` ne discrimine rien** : un nom inventé
     renvoie le **même** `PGRST202 … without parameters`. Écartée comme preuve —
     l'existence des RPC reste établie par les **POST réels observés** en S2/S3.
- [x] 2026-10-27 (01:45) — **`/customers/<uuid>` tranché, et S3 corrigé.**
  `tools/rea/verifier-lien-client.mjs` : clic réel sur le lien du dashboard
  (`<details>` replié → ouvert par son `<summary>`), puis GET direct de contrôle.
  **UUID réel → 200, 92 595 o, 21 liens** ; **UUID nul → 404 (38 069 o)** ;
  **route inconnue → 404 (38 186 o)**. Le 404 de S3 qualifiait donc
  **l'identifiant** (« client inconnu »), pas la route : le **lien n'est pas
  mort**. `reload` → même vue (empreinte 1f4d3a95…, 765 o). Le manifeste S3
  disait déjà le contraire du commentaire ; c'est le commentaire qui était faux.

- [x] 2026-10-27 (00:20) — **S3 — découverte de sous-routes, exécutée et
  bornée.** Nouvel outil `tools/rea/decouvrir-cibles.mjs` : il lit les 13 rendus
  S2, extrait les `href` (attribut HTML **et** charge RSC échappée) et les XHR,
  agrège par **motif** (UUID → `:id`, nombres longs → `:n`), sépare le domaine
  du site de Supabase, puis diffé le tout contre un manifeste. Relevé figé :
  `_captures/decouverte-2026-10-26-auth.json`.
  **Mesure : 13 rendus → 25 cibles distinctes, 10 nouvelles** (dont 4 XHR). Toutes
  portent leur provenance (`decouvert` : types, occurrences, pages sources,
  statut HTTP observé).
  **Manifeste S3** : `_captures/cibles-auth-s3.json` — 24 pages + 21 sondes. Les
  15 cibles S2 y sont reprises **à l'identique** (le manifeste S2 reste figé,
  sinon son propre ledger devient non rejouable), et **3 réfutations sont
  conservées** (`/loyalty`, `/account`, `/abonnement`) : un 404 ne devient pas
  vrai en vieillissant.
- [x] 2026-10-27 (00:20) — **Passe S3 capturée** :
  `_captures/2026-10-27-auth-s3/` — **21/42 en 200 · 67/67 assets · 0 erreur ·
  3 refus conformes**. Les 3 refus sont des **preuves** déclarées
  (`refusAttendu: /dashboard`) : `/admin`, `/onboarding` et `/` en mode
  authentifié. `--verifier` : **109/109 STABLE, 0 divergence**.
- [x] 2026-10-27 (00:20) — **Doctrine d'empreinte corrigée par la mesure**
  (détail en `lesson-learned` §14). `/equipe` a servi **3 formes d'octets en 6
  tirages** (divergence à l'octet 60291, table de références de composants
  clients RSC) et `/billing` une forme transitoire suivie de 10 tirages
  identiques — **contenu identique dans tous les cas** (titre, texte de 770 o,
  18 hrefs, 17 chunks). D'où : l'octet est archivé mais **ne fait plus foi** ;
  `sha256Contenu` (titre + texte visible + liens triés) est l'invariant vérifié.
  Une cible peut déclarer `variantes: N` pour archiver ses formes d'octets.
- [x] 2026-10-27 (00:20) — **Quatre défauts d'outillage trouvés en travaillant**
  (chacun mesuré, corrigé, testé) :
  1. la page capturée **se découvrait elle-même** (sa requête `document` pointe
     vers l'URL demandée) → `/abonnement` en 404 validait sa propre hypothèse ;
  2. `--diag` à 2 tirages **ne voit pas** une page bimodale ;
  3. le diff **ligne à ligne est aveugle** sur du HTML minifié (page = 1 ligne) →
     localisation au caractère ;
  4. **tout refus sortait en code 1**, donc un rouge permanent qui ne signale
     plus rien → `refusAttendu` + `conforme`.
  Helpers extraits dans `tools/rea/empreinte.mjs` pour être testables sans
  réseau. **53 tests hors ligne** (`node --test tools/rea/tests/*.test.mjs`).
- [x] 2026-10-27 (00:20) — **Découverte de contenu : un lien mort dans le
  produit.** Le dashboard rend `<a href="/customers/<uuid>">` ; le GET direct
  répond un **404 Next nu** (38 158 o, 4 liens), distinct du 404 du site
  (38 259 o, 7 liens, « Ce lien n'existe pas ou plus »). Les chunks de build
  tranchent : `(dashboard)/customers/page-*.js` existe, **aucun
  `customers/[id]/page-*.js`**. Deux mesures indépendantes, même verdict.

## ✅ Tâches Terminées

- [x] 2026-11-03 — **`0016` vérifiée en base : ABSENTE — et les migrations
  réellement passées recensées.** La mission « prouver le rejeu par deux
  appels » s'arrête sur un fait, pas sur une opinion.
  - **La sonde est falsifiable** : `POST /rest/v1/rpc/enregistrer_operation_caisse`
    avec les **quatre** arguments et `p_operation_id = null` rend **404
    `PGRST202`**. Les quatre arguments comptent : PostgREST rend le même
    `PGRST202` sur un corps partiel, donc une sonde à un seul champ aurait
    « prouvé » l'absence d'une fonction présente. `operation_id` nul n'écrit
    rien — `0016` lève `OPERATION_ID_MANQUANT` avant `award_loyalty_points`.
  - **Le recensement (OpenAPI en `service_role`, 200, 28 817 o) corrige le
    backlog** : `0003`, `0004`, `0005`, `0007`, `0008` sont **passées**
    (10 RPC exposées, 6 tables), `0009`→`0016` sont **absentes**. `0001` l'est
    aussi, prouvé autrement : `anon` reçoit **`42501`** sur `clients`,
    `loyalty_cards` et `loyalty_programs`, et seule `0001` révoque ces
    `GRANT`. **Huit** migrations attendent, pas quatre. `0006` n'est pas
    recensable ainsi (colonnes seules, aucune fonction).
  - **Pourquoi l'agent ne peut pas les exécuter, mesuré** : `psql` absent, CLI
    Supabase absente, aucun jeton de management dans l'environnement, et
    `auth/v1/settings` rend **`mailer_autoconfirm: false`** (une inscription ne
    rend pas de session). Le DDL reste une action humaine, éditeur SQL.
  - **Livré quand même, pour ne pas refaire ce cycle** :
    `tools/rea/idempotence.mjs` (pur : `corpsSonde`, `classerSonde` à quatre
    états, `normaliserResultat`, `verdictRejeu`),
    `tools/rea/verifier-idempotence-caisse.mjs` (sonde → jeton d'écriture →
    deux `POST` → verdict → artefact sans secret ; `--confirmer` exigé pour
    écrire) et **13 tests** (`tests/idempotence.test.mjs`).
    Suite **760 / 0 échec / 1 ignoré**.
  - **Un piège trouvé en écrivant les tests, et il valait le détour** :
    `Number(null)` vaut `0`. Deux réponses **sans** `new_balance` se
    comparaient donc **égales**, et un double crédit serait passé pour un rejeu
    absorbé. `entier()` rend `null`, et `verdictRejeu` **refuse** un solde
    manquant au lieu de le comparer.
  - **Effet de bord mesuré, puis annulé** : une sonde d'existence a été faite
    sur `join_loyalty_program()` — elle **crée** un client et une carte à
    chaque appel (mesuré 2 → 3, jeton `C-14D7CF`). Les deux lignes ont été
    supprimées (`DELETE` 204 / 204) et les compteurs revérifiés : **2 clients,
    2 cartes, 3 transactions** — l'état d'avant la sonde. La carte `C-2C4718`
    (0 point, créée le 2026-11-02) sert de témoin au rejeu.
  - **Non fait, et dit** : le rejeu lui-même. Il demande `0016` **et** un jeton
    `authenticated`/`service_role` ; le second est déjà là (clé de service dans
    `env.supabase.md`, gitignoré), il ne manque que le DDL.

- [x] 2026-11-03 — **R3 : la caisse hors ligne (PWA, file idempotente) — livrée,
  non installée faute d'appareil appairé.** Ce n'était pas une fonctionnalité
  neuve mais **la seule partie de R3 qui manquait** : la chaîne des quatre
  modules était prouvée depuis le 2026-10-31, le POS n'existait que comme page.
  - **Mesuré d'abord** : `_captures/2026-10-26/raw/pages/p21-caisse-manifest.html`
    (453 o, manifeste complet) et la balise de `p09-caisse.html`
    (`rel="manifest" href="/caisse/manifest.webmanifest"`). La mécanique de file
    vient d'A4 (magasin `file_attente`, FIFO par `cree_le`, rejeu **65 000 ms**,
    trois issues, `client_operation_id` créé à l'enfilage) — elle n'a pas été
    réinventée.
  - **`web/src/lib/file-caisse.mjs`** (pur) : `issueRejeu` (2xx retiré,
    `{400,403,404,422}` jeté, le reste conservé), `apresRejeu` (réseau muet ⇒
    **aucune** tentative comptée ; « bloqué » compte, n'abandonne pas),
    `prochainDelai` (jamais à vide), `ordonner` (ordre **total**, entrée non
    triée sur place), `nouvelleOperation` (uuid vérifié, code normalisé).
  - **`migrations/0016_operations_caisse.sql`** (**non exécutée**) : clé primaire
    `operation_id`, bornes `montant/points >= 0`, RLS **sans politique**, zéro
    droit de table, `enregistrer_operation_caisse` en `SECURITY DEFINER`,
    `search_path` figé, **verrou consultatif** avant lecture (deux rejeux
    simultanés se sérialisent), délégation **une** fois à
    `award_loyalty_points`, et `GRANT` à `authenticated` seulement.
  - **`POST /api/caisse/operation`** : route et pas Server Action — une action
    serveur ne se rejoue pas depuis `fetch` (jeton de build) et le rejeu peut
    traverser un déploiement. Corps revalidé, état traduit, statut HTTP qui
    pilote la file (`503 PGRST202` ⇒ conservé).
  - **`public/sw.js`** : script à la **racine** (un script sous `/caisse/` ne
    contrôle pas le repli public), règles limitées, aucun HTML de navigation en
    cache, morceaux du repli préchargés depuis son HTML.
  - **`lib/pwa.mjs` + `app/caisse/manifest.webmanifest/route.js`** : le manifeste
    est **engendré**, pas écrit à la main, pour que la marque garde une source.
  - **`components/caisse/{CrediterCaisse,FileAttente}.jsx`** : le crédit devient
    une opération rejouable ; la file s'affiche sur `/caisse` **et** sur
    `/caisse-hors-ligne`. L'échange reste une Server Action et **refuse** le
    hors-ligne, avec sa phrase.
  - **Icônes** : `tools/rea/generer-icones.mjs` écrit `icon-192.png` et
    `icon-512.png` (PNG RVB, CRC32, `deflate`) ; le test les **décompresse** et
    rejoue le générateur à l'octet près.
  - **Preuves** : 20 tests neufs, suite **747 / 0 échec / 1 ignoré**,
    `next build` **exit 0** (quatre routes neuves listées), `verifier-design`
    **CONFORME**, et mesures sur `next start` (7099) : manifeste 200
    `application/manifest+json`, repli 200, `sw.js` 200, icônes 200,
    `/caisse` 307 (garde), `POST` invalide 400, `POST` valide **503 PGRST202**.
  - **Non vérifié, et dit** : l'installation réelle de la PWA, le rendu
    authentifié de `/caisse` en local (session du profil REA = autre projet
    Supabase), et le rejeu effectif — `0016` n'est pas exécutée.

- [x] 2026-11-02 — **P0-6 : `/branding` (module Apparence) — écran complet, mesuré
  puis livré.** Décision humaine : Wallet mis de côté pour l'instant (Apple
  attend un compte, Google attend la `loyaltyClass`), on avance sur le reste du
  plan. L'écart était **P0-5** dans `tasks_plan.md` (la même étiquette y servait
  déjà à Wallet ici : le numéro de ce fichier est **P0-6**, et les deux sont
  nommés dans le backlog pour que personne ne les confonde).
  - **Mesuré, pas supposé** : `_captures/2026-11-02-a6/rendu/a08-branding.html`
    (200, 103 581 o) **et** son chunk applicatif
    (`..._dashboard__branding_page-badcb0936c16a5ca.js`, 39 680 o). Le DOM donne
    les trois sections, le chapeau, l'aperçu et un **seul** bouton ; le chunk
    donne ce que le DOM ne montre pas — les **dix** types (`value`/`label`/`emoji`),
    les **huit** couleurs, le schéma zod (`name: min(2)`,
    `primary_color: /^#[0-9A-Fa-f]{6}$/`), les défauts (`#1a1a1a`, `restaurant`),
    les colonnes écrites par `POST /api/branding/save`, et l'envoi de fichier
    (`POST /api/branding/upload`, `kind ∈ {logo, background}`). Rapport :
    **`docs/mesure-p0-6-apparence-2026-11-02.md`**.
  - **Le seul défaut de la cible corrigé sans le dire** : sa légende d'aperçu
    affirme « Aperçu réel du pass Apple Wallet ». Ici aucune classe PassKit
    n'existe — la légende nomme donc ce qui est réel (nom, logo, type, couleur)
    et ce qui est un exemple (code `C-4F2A91`, 120 points, mois). C'est un écart
    **déclaré**, pas une omission.
  - **`migrations/0015_apparence.sql`** (non exécutée) : quatre colonnes sur
    `loyalty_programs` (`primary_color varchar(7)` défaut `#1a1a1a`,
    `commerce_type varchar(16)` défaut `restaurant`, `logo_url`, `wallet_bg_url`),
    quatre contraintes **nommées** (motif `#rrggbb`, les dix valeurs, et deux
    fois « `https://` ou `/`, ≤ 500 caractères » — ces valeurs finissent dans un
    `src`), `apparence_du_commerce()` (`PROGRAM_NOT_FOUND`), et
    `enregistrer_apparence(5 params)` — un seul `update` **après** cinq refus
    codés (`INVALID_NAME`, `INVALID_COLOR`, `INVALID_COMMERCE_TYPE`,
    `INVALID_LOGO_URL`, `INVALID_IMAGE_URL`), `nullif(btrim(...))` pour qu'un
    champ vidé efface, et l'état **relu** en retour. Droits : `REVOKE … FROM
    public, anon, authenticated` puis `GRANT` à `authenticated, service_role`.
  - **`web/src/lib/apparence.mjs`** (pur, 246 lignes) : `TYPES_ETABLISSEMENT`
    (dix valeurs + clé de libellé **littérale** + emoji — l'emoji est une donnée
    de la carte, pas une décoration), `COULEURS` (huit), `couleurValide`,
    `normaliserCouleur`, `urlImageValide`, `nomValide`, `apparenceDepuisFormulaire`,
    `refusApparence` (six codes, ordre fixe), `lireApparence`, `recompenseDuMenu`,
    `moisAnnee`. **`lib/donnees.mjs`** : `apparenceDuCommerce()`,
    `enregistrerApparence()` (cache du programme invalidé **après** succès, parce
    que le nom est un des champs), quatre codes ajoutés à `CODES_CONNUS`.
  - **L'écran** : `EditeurApparence.jsx` (client, pour l'aperçu vivant) +
    `ApercuCarte.jsx` + `actions.js` (`useActionState`, rend des **clés**, pas
    des phrases). Le formulaire reste utilisable **sans JavaScript** : dix
    `radio` natifs, un `input[type=color]` qui s'envoie seul, des champs non
    contrôlés ; seules les huit pastilles sont des raccourcis, et l'aide de
    l'écran le dit. Trois blocs dans `unicity.css` (`.apercu-*`, `.teinte-*`,
    `.type-grille`), pas une seule valeur nouvelle : les jetons `--uc-*`.
  - **Deux choses non rendues, et pourquoi** : (a) l'**envoi de fichier**
    demande un espace de stockage et une clé de service — absents de
    `web/.env.local` ; les champs attendent donc une **adresse**, et l'écran
    l'écrit (`page.apparence.envoiAbsent`) ; (b) la section « 4 · Tampons par
    carte » (`stamps_total`, `stamp_icon`, `style_bandeau`) ne se rend que pour
    un programme à tampons, et **aucun écran d'ici ne dessine de grille de
    tampons** : ce serait l'interrupteur inerte refusé pour `/automations`.
    Dette nommée : **P0-6b** — **close le 2026-11-02 par un refus** : points
    seulement, et l'option « Tampons » de `/rewards`, sans lecteur, a été retirée.
  - **Preuves** : `apparence.test.mjs` (**18 tests**), `migration-0015.test.mjs`
    (**9 tests**), suite hors ligne **721 / 0 échec / 1 ignoré**, `next build`
    exit **0** (`/branding` listée en route dynamique). Image **reconstruite**
    (`--pull --no-cache`) et servie sur **7089**, conteneur `healthy` : `/branding`
    → **307** `Location: /login` (la route existe, la garde fait son travail),
    `/login` → **200**, `/api/wallet/google/AB12CD34` → **503**
    `{"etat":"walletIndisponible"}` (le drapeau est toujours éteint), journaux
    propres. `docker image prune -f` : 0 o récupéré (aucune image orpheline).
  - **Non observé, et déclaré** : le rendu **authentifié** en local. Le
    conteneur lit `sevqegfhmdezsqwvwsam`, la session du profil REA appartient à
    `rozagopjfkkblyxtjdgw` : `/branding` répond `307 → /login` — la route existe
    et la garde fait son travail, son corps n'a pas été vu à l'écran (même dette
    que `/program`, `/settings`, `/notifications`).


- [x] 2026-11-02 — **P0-5 étape 2 : Google Wallet livré (route + lib + migration),
  sans un euro et sans compte Apple.**
  Décision humaine : Google d'abord. Ce n'est pas un repli, c'est **la voie qui
  supprime U1** : le code-barres d'un objet Google est `barcode.value`, **écrit
  dans le JWT** — donc `card_token` tel quel, et `/scan` n'a pas une ligne à
  changer. Chez Apple/PassKit cette valeur n'était pas observable sans compte
  payant, et une sonde était nécessaire.
  - **Contrat vérifié dans la documentation Google** (`reference/rest/v1/loyaltyobject`,
    `loyalty-cards/use-cases/jwt`) : JWT **RS256**, `iss` = email du compte de
    service, `aud: "google"`, `typ: "savetowallet"`, `origins`, `payload.loyaltyObjects`
    avec **un seul** objet (`INVALID_NUM_OBJECTS`), objet nommé
    `{issuerId}.{suffixe}`, lien `https://pay.google.com/gp/v/save/<JWT>`,
    points = `points.label` + `points.balance.string`.
  - **`migrations/0014_wallet_google.sql`** (non exécutée) : colonne
    `loyalty_cards.wallet_object_id` **nullable + index unique partiel** (deux
    cartes sur le même objet Google s'écraseraient dans le Wallet du client),
    `carte_pour_wallet()` (jeton, points, prénom, programme — **ni nom de
    famille, ni email, ni paliers** : un pass se lit par-dessus une épaule),
    `lier_wallet()` avec `OBJECT_ID_INVALIDE` validé **avant** l'UPDATE.
    `anon` reste dehors, comme depuis `0003`.
  - **`web/src/lib/google-wallet.mjs`** (pur, zéro dépendance : RS256 par
    `node:crypto`) : configuration à 5 clés, `construireObjet`,
    `signerJwt`, `lienEnregistrement`. Trois choix visibles : `barcode.value` =
    jeton, `accountId` = **4 caractères** seulement, **aucune couleur inventée**
    (`hexBackgroundColor` non mesuré → défaut Google).
  - **`web/src/app/api/wallet/google/[token]/route.js`** : `307` vers Google
    avec `Cache-Control: no-store` (un JWT a une durée de vie), `404
    carteInconnue` si le jeton n'existe pas, `503 walletIndisponible` si le
    drapeau ou la config manque — **jamais** un pass fabriqué sans clé.
  - **16 tests neufs** : la signature est vérifiée avec la clé **publique**
    (une signature invalide donnerait `INVALID_SIGNATURE` chez Google, le pire
    des faux succès), un jeton altéré ne vérifie plus, la clé PEM en `\n`
    littéraux est réparée, le drapeau éteint gagne même complet.
  - **Épreuve par exécution** : `next build` compile la route (elle apparaît dans
    `routes-manifest.json`) ; `next start` sur port neuf → `GET
    /api/wallet/google/AB12CD34` = **503 `{"etat":"walletIndisponible"}`**. Un
    premier essai avait rendu **404** : un ancien serveur occupait le port
    (`EADDRINUSE`), donc c'était un faux négatif — noté pour ne pas le refaire.
  - **Suite : 693 tests / 0 échec.** `web/.env.example` documente les 4 clés
    Google + les 4 clés PassKit (voie Apple conservée pour la suite).
  - **Déploiement** : image `fidelix-web` reconstruite, conteneur recréé
    **healthy** sur :7089 → `GET /api/wallet/google/AB12CD34` = **503
    `{"etat":"walletIndisponible"}`**, `/login` = **200**, journaux propres.
- [x] 2026-11-02 — **P0-5 Wallet : exploration PassKit + la sonde qui lève les
  inconnues (zéro écriture chez nous, zéro appel réseau).**
  Le compte **PassKit Inc.** existe (essai **45 jours**), donc la voie SaaS est
  retenue : elle supprime le compte Apple Developer, le Pass Type ID et le
  certificat `.p12` qui bloquaient tout. Coût réel : **39,50 $US/mois** pour
  ≤ 250 pass, puis 0,045 $/pass — soit ~390 MAD, **le prix du produit** : la
  question n'est plus technique, elle est commerciale (P0-3c, hors consigne).
  - **Exploration** : `docs/exploration-wallet-passkit-2026-11-02.md` (159 lignes)
    — deux produits distincts (SaaS vs lib `passkit-generator` que la cible
    utilise, `[M]`), contrat documenté (JWT dynamique, `Program→Tier→Member`,
    `SetPoints`/`EarnBurn`, facturé **au pass** et pas à l'appel), **quatre
    inconnues nommées** et le refus explicite du NFC et du temps réel.
  - **Sonde** : `tools/rea/passkit.mjs` (pur) + `tools/rea/sonder-passkit.mjs`
    (CLI). **Lecture seule par défaut**, `--ecrire` pour créer un membre de test.
    Elle répond à U3 (préfixe d'API), U2 (URL d'installation), **U1 (valeur du
    code-barres)** — la seule bloquante, car si le code-barres n'est pas
    `card_token`, `/scan` ne reconnaît plus la carte.
  - **Garde-fous testés (10 tests)** : aucune base d'API inventée
    (`construireUrl` rend `null` sans base — deviner `api.passkit.com` enverrait
    un jeton à une adresse non désignée), `WALLET_ENABLED=false` gagne même avec
    des identifiants valides (un essai expiré ne casse pas le scan), un secret
    n'imprime que ses quatre derniers caractères, et `resumeMembre` rend des
    listes **vides** plutôt que des champs inventés.
  - **Exécution réelle** : sans identifiants, la sonde s'arrête et **nomme** les
    trois variables manquantes (`exit 0`, pas une erreur) ; avec une base factice,
    elle essaie les candidats, imprime les statuts (`fetch failed`) et conclut
    « aucun chemin n'a répondu 200 » sans deviner. `web/.env.example` documente
    les cinq clés, dont `WALLET_ENABLED=false`.
  - **Suite : 677 tests / 0 échec** (10 neufs). Aucun fichier de `web/src` touché
    → **pas de rebuild Docker** (l'image ne contient pas `tools/`).
- [x] 2026-11-02 — **P0-4 : les trois routes « Messages » mesurées avant d'écrire
  quoi que ce soit.** Le relais disait « `/notifications` n'a aucune capture
  exploitable » ; **c'est faux depuis la passe A7b** : le **DOM rendu** existe
  (`2026-11-02-a7b/rendu/d01-notifications.html`, 79 946 o, 200) et porte
  « Historique des notifications » (`:37319`) et « Jusqu'à 3 notifications par
  jour » (`:33430`) — chaînes que le payload RSC `a20-notifications.html`
  n'avait pas, et sur lequel la conclusion précédente reposait.
  - **Ce que la cible fait :** un seul écran « Messages » à **trois** onglets —
    Notifications (`/notifications`), Automatiques (`/automations`), Emails
    (`/campaigns`). Contrat complet dans
    `docs/mesure-p0-4-messages-2026-11-02.md` : bornes du formulaire
    (titre 3–50, message 10–150, `cta_url` optionnelle), quota **3 / jour**,
    `POST /api/notifications` à quatre issues nommées (`blocked`,
    `quota_atteint`, envoyé, **validé sans destinataire**), historique
    `push_notifications` (20 dernières, statuts `sent|draft|blocked`,
    `moderation_reason`, `recipients_count`, 3 compteurs d'appareils), et les
    **quatre** automatisations avec leurs bornes (`days` 3–365 pour la relance,
    `remaining` 1–20/100 pour la récompense, `days` 0–30 pour l'anniversaire,
    7 pastilles `L M M J V S D` pour le message libre).
  - **Ce qui bloque, mesuré et non déduit :** le socle n'a **pas** de canal
    d'envoi. `information_schema` : six tables (`clients`, `loyalty_cards`,
    `loyalty_programs`, `loyalty_transactions`, `reward_tiers`, `staff`) — donc
    ni `push_notifications`, ni `automations`, ni `restaurant_id`. `clients` a
    six colonnes : ni date de naissance (exigée par « Anniversaire »), ni jeton
    push, ni identifiant Wallet. `web/package.json` ne liste aucune dépendance
    d'envoi, et `grep` sur `web/src` ne rend que des `Array.push`.
  - **Conséquence de plan :** P0-4 et P0-3b sont **le même blocage**
    (couche sortante + état payant). Options chiffrées au §6 du rapport :
    **A** (rien livrer, ouvrir « canal sortant »), **B** (`/notifications` avec
    quota et historique, 0 destinataire assumé), **C** (canal d'abord).
  - **Décision de l'utilisateur : ni A ni C — « ne code rien qui concerne
    abonnement, le but est d'avoir tous les modules fonctionnels ».** L'onglet
    `/notifications` est donc **livré** (§8 du rapport), et la frontière est
    écrite dans l'écran plutôt que promise.
  - **Livré, et vérifié par exécution :**
    - `migrations/0013_messages.sql` — table `messages_envoyes` (trois `check`
      aux bornes mesurées, RLS **sans politique**, droits retirés à
      `public`/`anon`/`authenticated`), `messages_du_commerce()` (quota du jour,
      joignables, 20 derniers), `enfiler_message()` à six refus nommés et **quota
      vérifié avant l'insertion**. Jour compté à **Casablanca**
      (`at time zone`), pas au fuseau du serveur. **Non exécutée.**
    - `web/src/lib/messages.mjs` — `messageDepuisFormulaire`, `refusMessage`
      (ordre des champs), `lienValide` (http(s) seul), `lireMessages` (`null` sur
      forme inconnue), `etatQuota`, `cleStatut`. Bornes mesurées : 3–50, 10–150,
      quota 3, historique 20.
    - `.../notifications/actions.js` + écran — huit états d'URL littéraux (exigés
      par `etat-action.test`), formulaire **sans JavaScript**, bouton **remplacé**
      par « Prochain message demain » au quota atteint, historique avec statut.
    - **Le seul statut écrit est `en_attente`** : un test (`0013`) refuse tout
      `update` et toute insertion qui imposerait `envoye`. L'écran ne peut donc
      pas dire « Envoyé ».
  - **Non rendu, et déclaré** (`docs/design-system.md` §3) : barre d'onglets (les
    deux autres routes n'existent pas), aperçu à la frappe, compteurs `0/50` et
    `0/150`, phrase de modération (fonction non observable), totaux par appareil.
  - **Épreuves par exécution :** 668 tests hors ligne (**667 pass / 0 échec**,
    1 ignoré), `next build` exit **0** (`/notifications` dans la table des
    routes), `verifier-design` **CONFORME**, `verifier-durcissement`
    **CONFORME**, et `next start` sur **7199** : `/notifications` → **307**
    (la garde fait son travail), `/login` → **200**. Le corps authentifié de
    l'écran n'est pas observé — même raison que `/program` (deux projets
    Supabase différents), et `0013` n'est pas exécutée.


- [x] 2026-11-02 — **P0-3 : la règle de comptage du plafond, mesurée puis servie.**

  La question de la mission était « 30 de quoi ? ». La réponse **est** dans les
  captures, et elle est écrite : `docs/regle-comptage-30-2026-11-02.md`.
  - **Ce que la cible compte :** des clients **inscrits** (une carte remise),
    cumulés, à l'échelle du commerce — jamais les visites, jamais le mois.
    Preuves : `p01-home.html:72421` (« votre 30e client **s'inscrit** »),
    `c02-billing.html:43501` (`aria-label="Clients inscrits sur l'offre
    gratuite"`), `chunks_9990:1494` (« N clients ont déjà leur carte »), et le
    conseiller de la cible qui rend le **même** 1 que le bandeau
    (`b12-api-fidelia.html:3084`). Le seuil est **un** paramètre (`{limite}`,
    `p01-home.html:122241`).
  - **Base** : `migrations/0012_plafond_clients.sql` — `plafond_clients()` rend
    deux faits (`clients`, `limite`), `count(*)` sur `clients` (même définition
    que `0005`), `authenticated` + `service_role`, `anon` exclu. **Non exécutée.**
  - **Module** : `web/src/lib/plafond.mjs` — `lirePlafond`, `etatPlafond`
    (`large` / `attention` / `urgent` / `atteint`), `pourcentOffre`, les deux prix.
  - **Écran** : `BandeauOffre` monté **une fois** dans le layout (la cible le met
    sur chaque écran, mesuré 4 fois) ; `/billing` (onglet « Abonnement ») ;
    `OngletsCompte` ajouté aussi à `/settings` (la barre y est mesurée) ;
    `plafondDuCommerce()` en cache 10 s, états stables seulement.
  - **Le verrou n'est pas posé, et c'est une décision motivée** : le plafond de la
    cible ferme le **scan** du commerçant ; ici, l'inscription publique est le
    seul chemin qui crée un client, et aucun état payant ne peut lever la limite.
    Bloquer à 30 fermerait la porte sans clé. Cf. §5 du document de mesure, et
    P0-3b au backlog.
  - **Preuves** : 20 tests neufs (`plafond.test.mjs`, `migration-0012.test.mjs`),
    suite **650 / 0 échec**, `next build` exit 0 (route `/billing` listée),
    `verifier-design.mjs` **CONFORME**.

- [x] 2026-11-02 — **P0-1 : la page `/program`, de la mesure à la migration.**
  Détail complet et preuves dans le Statut Actuel ; les décisions d'écran et les
  trois écarts déclarés dans `docs/design-system.md` §3 (« Règles du programme »).
  - **Mesure** : `a02-program.html` — sept réglages, huit `name`, deux
    `placeholder`, l'exemple « Un ticket de 250 € créditera 50 points ».
  - **Base** : `migrations/0010` — sept colonnes bornées et commentées,
    `reglages_du_programme()`, `enregistrer_reglages_programme(9 args)`
    atomique, `authenticated` + `service_role` seulement. **Non exécutée.**
  - **Écran** : `program/page.jsx` + `program/actions.js` + `lib/programme.mjs`
    (11 fonctions pures) + `OngletsProgramme` + `lib/navigation.mjs`
    (`ONGLETS_PROGRAMME`, `routesPromises()` dédoublonné).
  - **Deux défauts attrapés** : la phrase « 1 point = **1** € de remise » avait
    perdu son second « 1 » ; le composant d'onglets appelait trois noms non
    importés (`ReferenceError` au rendu, invisible pour `next build`).
  - **Preuves** : 29 tests neufs (18 + 11), suite **602 / 0 échec**, `next build`
    exit 0, image reconstruite et servie sur **7089**.


- [x] 2026-11-01 — **Le choix de la caisse sur `/join/<slug>` (`0009`) — la dette
  qui rendait `/caisses` inutile en production.** Mesuré avant d'écrire : la
  cible le propose (`p17-join.html` + le chunk `app_join_[slug]_page-…js`), donc
  ce n'était pas à capturer, c'était à écrire. Détail et preuves dans le Statut
  Actuel et `lesson-learned` §39.
  - **Mesure** : `<label id="qui-vous-a-servi">`, `role="group"`, boutons
    `aria-pressed`, `onClick: () => set(O===e.id ? void 0 : e.id)` (unique et
    **défaisable**), `A.length>0 &&` (rien si la liste est vide), six prénoms
    rendus **sans session**.
  - **Chemin public** : `0009` — `caisses_publiques(p_slug)` rend `id` +
    `prenom` des caisses actives, ordre total, `PROGRAM_NOT_FOUND` sinon ;
    `anon` autorisé (seul écart avec `0007`, qui porte le CA).
  - **Écran** : `ChoixCaisse.jsx` au DOM mesuré (`min-h-11` = 44 px, compilé),
    module pur `lib/adhesion.mjs`, `rejoindre(slug, caisse)` qui n'envoie
    `p_staff_id` que s'il y a une caisse, `STAFF_NOT_FOUND` reconnu comme refus,
    reprise **une** fois sans désignation et perte **dite**.
  - **Preuves** : 30 tests neufs, suite **574 / 0 échec**, mutations **103/103**
    (M91→M103), `next build` exit 0, design **CONFORME**.


- [x] 2026-11-01 — **Latence de navigation supprimée à la source, mobile durci,
  `/caisse` et `/qrcode` refondus.** Détail et mesures dans le Statut Actuel et
  `lesson-learned` §37.
  - **Mesuré avant de changer** : rendu serveur **9–78 ms**, RTT Supabase
    **0,55–0,81 s**, **zéro** `loading.jsx` dans `(dashboard)`. La latence
    perçue était une **attente sans retour visuel**, pas un calcul lent.
  - **Corrections** : `loading.jsx` de groupe (+ frontière de préchargement),
    `Promise.all` sur les deux lectures indépendantes de `/scan`,
    `lib/cache.mjs` (TTL 10 s) sur `programmeDuCommerce()` avec trois contrats
    écrits (états stables seulement, écriture qui invalide, chemin d'écriture
    jamais servi par la mémoire).
  - **Mobile** : zone sûre iOS, `touch-action: manipulation`, `:active` visible
    avant navigation, bas de page qui ne passe plus sous la barre système.
  - **Écrans** : `/caisse` en deux colonnes conditionnelles (identifier → solde
    → choisir), `JaugePoints` sorti de la palette morte de la peau « verre »
    (piste invisible, orange sur accent bleu), `/qrcode` en **affiche
    imprimable** avec bouton d'impression.
  - **20 tests ajoutés** (`latence`, `design-ecrans`, garde `/scan` renforcée) →
    **529 tests, 528 pass, 0 fail, 1 skip** ; **84/84 mutations** détectées.
  - **Défaut trouvé en route, corrigé** : `JaugePoints` utilisait `bg-coral`,
    `bg-white/10` et `font-impact` — les utilitaires de la palette « verre »
    supprimée par la refonte Unicity. Aucun test rouge, aucun message : le
    composant rendait, les chiffres étaient justes, l'écran était faux.

- [x] 2026-11-01 — **`migrations/0008` — « crédits par euro », devise `EUR`,
  et le barème branché sur les écrans (caisse + programme).** Le taux de
  conversion était implicite : la caisse saisissait le montant **et** les
  points, sans aucun lien entre les deux. Il est maintenant une colonne.
  - **Base, exécutée et mesurée** : `loyalty_programs.credits_par_euro
    numeric(10,2) not null default 1 check (> 0)` ; `devise` par défaut `EUR`
    et les lignes `MAD` reprises (`update … where devise = 'MAD'`, pas un
    `update` nu : une base en USD ne doit pas être convertie par une migration
    qui n'en sait rien) ; `programme_public()` rend `credits_par_euro` ;
    `enregistrer_programme` passe à **6 paramètres** (`p_credits_par_euro
    numeric default 1`) après `drop` explicite de la signature à 5 —
    `create or replace` sur une signature différente **crée une seconde
    fonction**, et l'ancienne aurait continué d'écrire des programmes sans
    taux, en silence. Mesures : défaut `EUR`, `test1` converti en `EUR/1.00`,
    `2.5` accepté, absent → `1.00`, `0` → `P0001 INVALID_CREDITS`,
    `anon` = **false**, `authenticated` = **true**.
  - **Écrans** : `/rewards` gagne le champ « Crédits par euro »
    (`name="credits"`, `step="0.01"`, `min 0,01`, `max 1000`) et un refus
    `?etat=credits` ; l'exemple « 10 € rapportent N points » est **calculé**
    (`pointsDepuisMontant`), pas recopié, et le symbole vient de
    `symboleDevise(devise)`. `/scan` laisse les points **facultatifs** : vide =
    barème du programme, `0` = aucun point (distingués sur la chaîne, pas sur
    le nombre — `Number('')` vaut `0`). `/caisse` reçoit la **caméra** de
    `/scan` (même composant, destination `/caisse` en liste fermée) et remplace
    son `<select>` par des **cartes radio** : tous les paliers visibles, ceux
    hors de portée désactivés avec « encore N pts », le premier atteignable
    pré-coché.
  - **19 tests ajoutés** : `migration-0008.test.mjs` (7), `taux-conversion.test.mjs`
    (7, le raccordement écran↔action↔lib), 3 sur le barème (`modules`), 1 sur
    `symboleDevise` (`tableau-lecture`), et la garde caméra étendue à
    `/caisse`. Suite : **514 tests — 513 pass, 0 fail, 1 skip** (le skip est
    antérieur : `sonde-base.json` absent).
  - **Campagne de mutations : 74/74 détectées et restaurées** (M65→M74 pour ce
    lot). Elle a **d'abord refusé de démarrer** : `M1` ne s'appliquait plus
    (le code avait changé sous elle, `recovery` est passé en littéral) —
    exactement ce qu'un harnais doit faire. Entrée réalignée sur le code, pas
    désactivée.
  - **Image reconstruite et servie** : `next build` compile, conteneur
    `Up (healthy)` sur `7089`, `/login` **200**, `/caisse` `/rewards` `/scan`
    **307 → /login** (pas de 500), logs sans erreur, et les nouveaux textes
    sont **dans l'artefact servi** (« Crédits par euro », « Barème »,
    `uc-choix-cout`, `name:"credits"`, `.uc-aide`).

- [x] 2026-11-01 — **Refonte du design de l'espace authentifié sur la peau
  « Unicity ».** Nouvelle couche `web/src/styles/unicity.css` (jetons `--uc-*`
  recopiés à l'octet de `UNICITY/…/tokens.css`, composants `.uc-*`), coque
  `components/unicity/` (dock 76→232 px, barre haute, barre basse mobile), jeu
  d'icônes SVG inline, tableau de bord réécrit (héro CA + 4 coins, 4 KPI à
  filigrane, tableau des passages, colonne totaux/garanties/raccourcis).
  **Mobile d'abord** : 1 colonne, KPI 1→2→4 colonnes (480/1240 px), dock à
  partir de 900 px, barre basse avant.
  - **Mesuré dans l'image** : `/apercu` rend **10** entrées de dock, **4** KPI,
    **4** coins de héro, **5** onglets mobiles, **6** cartes ; la feuille est
    réellement servie (`uc-dock` × 16 dans le chunk CSS).
  - Les quatre feuilles mesurées (`tokens`, `verre`, `nuit`, `polices`) sont
    **intactes** : `verifier-design.mjs` reste à trois déviations déclarées.
    La refonte est déclarée en `docs/design-system.md` §3 bis.
  - **Deux défauts trouvés en route, corrigés** :
    1. la garde vivait dans `dashboard/layout.jsx` — un layout de **segment**,
       qui ne couvrait que `/dashboard`. Les **neuf** autres écrans du groupe
       répondaient **200 sans session** (mesuré). Elle est passée dans
       `(dashboard)/layout.jsx`, et `apercu.test.mjs` interdit désormais qu'une
       garde de segment réapparaisse ;
    2. `recovery` manquait dans `TYPES_CONFIRMATION` alors que le commentaire et
       le test l'exigeaient : le lien de réinitialisation était refusé comme
       « invalide ». Ajouté.
  - `/apercu` devient ouvrable par **drapeau d'exécution** `FIDELIX_APERCU=1`
    (fermé par défaut) : `NODE_ENV` étant figé à la compilation, l'écran de
    vérification était inatteignable dans le conteneur.
  - Suite : **495 pass, 0 fail, 1 skip** (un cas de plus qu'avant).

- [x] 2026-11-01 — **Conteneur Docker du site — http://localhost:7089, vérifié par
  exécution.** `web/Dockerfile` (multi-étapes : `npm ci` + `next build` +
  `npm prune --omit=dev`, exécution en `node:22-bookworm-slim`, utilisateur non
  privilégié, `HEALTHCHECK` qui lit `/login`), `web/.dockerignore`,
  `docker-compose.yml` (port hôte **7089**, `FIDELIX_PORT=7090` en secours ;
  le conteneur écoute toujours 3000 en interne).
  - **Mesuré, pas supposé** : `/` → **307** vers `/login`, `/login` et
    `/register` → **200** (`<title>Connexion · Fidelia</title>`), `/dashboard`
    → **307** (le middleware lit la session : la configuration Supabase
    *runtime* fonctionne), `/caisses` et `/customers` → **200**. Conteneur
    `Up (healthy)` sur `0.0.0.0:7089->3000`.
  - **`NEXT_PUBLIC_*` est figé au build *et* rendu au runtime.** `config.mjs`
    lit `env?.[NOM_URL]` — un accès dynamique, que Next n'inline pas. Mesure :
    **0** occurrence de `supabase.co` dans `.next/static`, ce qui est sans effet
    ici parce que `clientNavigateur()` n'est **appelé nulle part** (tout passe
    par le serveur). Les `ARG` restent en place pour le jour où un composant
    client lira la configuration.
  - **`.env` à la racine de `FIDELIX`** (copie de `web/.env.local`, gitignoré,
    `chmod 600`) : compose refuse de démarrer si les deux variables manquent,
    au lieu de construire une image sans configuration.
  - ⚠️ **Incident pendant la mise en place** : le moteur Docker était figé
    (tout nouveau conteneur restait en `Created`), le redémarrage de Docker
    Desktop a **recréé le disque de la VM** — images, conteneurs et volumes
    antérieurs perdus (dont `unicity-db-1`). Détail et règles en
    `lesson-learned` §34 ; sauvegarde disponible :
    `UNICITY/backups/avant-m-20261021T113407.sql`.

- [x] 2026-11-01 — **`0007` : la désignation à l'inscription *et*
  `equipe_du_commerce()` — exécutées, sondées, base laissée à 0 ligne.**
  **495 tests** (494 pass, 1 skip pré-existant), **64/64 mutations** détectées
  et restaurées (49 + 15), corps des deux fonctions **identiques octet pour
  octet** au fichier (`md5(prosrc)` = `a0a1f1f5…` / `b497dbb5…`).
  - **Livré** : `join_loyalty_program(p_slug, p_staff_id)` écrit
    `clients.designated_staff_id` **dans le même `insert`** que le client et
    refuse une caisse inconnue (`STAFF_NOT_FOUND`) **avant** d'écrire ;
    `equipe_du_commerce(p_periode, p_jour, p_fuseau)` rend `periode`, `devise`,
    `lignes` (`staff_id`, `prenom`, `role`, `actif`, `cartes`, `scans`,
    `points`, `ca`, `avis`) et `absences`.
  - **Ce qui n'est pas livré, et pourquoi** : aucun écran `/caisses` (le
    gabarit reste) ; aucun chemin d'écriture de l'équipe (« Nouvelle caisse »
    n'a pas de fonction : une écriture sans écran mesuré serait inventée) ;
    aucune table d'avis ; aucune portée par programme (socle mono-commerce).
  - **La preuve la plus utile n'est pas un test, c'est un écart** : 3 clients,
    2 désignés, **4 cartes** en base → la fonction rend **2** en « Cartes ».
    Compter `loyalty_cards` aurait rendu 4, sous le même libellé.
  - **Un refus se mesure aussi par ce qu'il ne laisse pas** : après
    `STAFF_NOT_FOUND`, `clients` reste à 3 et `loyalty_cards` à 4 — l'échec ne
    crée pas de client orphelin.
  - **La surcharge à un argument est retirée** (`drop … if exists`), sinon deux
    candidates accepteraient `{ p_slug }` : mesuré ensuite, une seule fonction,
    `to_regprocedure('…(character varying)')` = **NULL**.
  - **Le harnais a refusé de démarrer** (trois mutants recopiant un texte
    existant) puis **a rattrapé une garde incomplète** (M63 : une seule des deux
    jointures vérifiées). Les deux sont des leçons, pas des incidents — §33.

- [x] 2026-10-31 — **`0006` : le modèle d'équipe et la désignation — schéma
  seul, RLS fermée, 0 politique, exécuté et sondé.** **478/478 tests** (+12),
  `verifier-design.mjs` **CONFORME**, `verifier-durcissement.mjs` **CONFORME**,
  `next build` **exit 0**, **49/49 mutations** détectées et restaurées
  (36 + 13), harnais durci et ses trois refus prouvés par exécution.
  - **Ce qui est livré** : `public.staff` (5 colonnes, deux rôles mesurés),
    `clients.designated_staff_id` (`SET NULL`), rattachement de
    `loyalty_transactions.staff_id` (`RESTRICT`), index de comptage.
  - **Ce qui n'est pas livré, et pourquoi** : aucune RPC (`equipe_du_commerce()`
    vient après son modèle), aucun chemin d'écriture de la désignation
    (`join_loyalty_program` n'accepte pas encore de caissier), aucun modèle
    d'avis (« Avis » reste une absence déclarée), aucun `program_id` (socle
    mono-commerce, même limite que `0004`).
  - **Les deux suppressions ont été choisies, pas héritées** : `cascade` sur la
    désignation aurait effacé des **clients** ; `cascade` sur l'audit aurait
    retiré des scans du **CA** — deux pertes silencieuses. M37 et M38 les
    remettent, et le test tombe.
  - **Le harnais ne peut plus mentir sur l'arbre** : instantané avant la
    première écriture, restauration sur tous les chemins de sortie, marqueur
    sur disque, vérification octet à octet avant le verdict, arrêt immédiat si
    une restauration échoue. Les refus ont été déclenchés à la main (marqueur,
    arbre muté, `SIGINT`), pas seulement relus.

- [x] 2026-10-31 — **Deuxième RPC de lecture `tableau_du_commerce()` (0005) ;
  `/dashboard` alimenté ; le missionnement `/caisses`/`/notifications` réfuté
  par la mesure.** **466/466 tests** (+18), `verifier-design.mjs` **CONFORME**
  (3 déviations déclarées, inchangées, aucune valeur CSS ajoutée),
  `verifier-durcissement.mjs` **CONFORME**, `next build` **exit 0**,
  **36/36 mutations** détectées et restaurées (24 + 12).
  - **Le missionnement d'abord mesuré, ensuite jugé.** Les deux écrans nommés
    ne portent pas de projection mesurable : `/notifications` n'a **aucune**
    chaîne propre (ni en RSC, ni en DOM), `/caisses` n'existe qu'en DOM rendu et
    sa table demande une table d'équipe et une colonne de désignation qui
    n'existent pas (5 tables mesurées). Le socle est **mono-commerce** : une RPC
    de lecture ne peut pas inventer un modèle. L'accueil, lui, est calculable
    entièrement — il a été choisi pour cette raison, et l'en-tête de `0005`
    consigne les deux refus avec leurs reçus.
  - **Les définitions viennent des sous-titres.** « Reviennent » = `>= 2`
    visites, « Visites » = 30 derniers jours : deux constantes que le SQL porte
    et que `migration-0005.test.mjs` relit. Les faire dériver ne casse **aucun**
    écran — cela change le sens de ce que l'écran affirme (M27, M28).
  - **L'ordre total a été justifié par la mesure, pas par le principe.** Les
    trois opérations de sonde partagent le même `created_at`
    (`count(distinct created_at) = 1`) ; deux appels rendent pourtant le même
    ordre `7,-10,8` grâce à `, s.id` (M30).
  - **La chaîne a été parcourue, refus compris** : `redeem` à 10 points sur un
    solde de 15 rend `new_balance 5` et écrit `reward_label`, ce qui donne
    `recompenses: 1` au tableau ; la base a été remise à 0 ligne (5 tables,
    `recentes: []`).
  - **Un écart de copie, déclaré et testé** : `CA (€)` de la capture devient
    `CA ({devise})` parce que la devise du socle est `MAD`. Deux assertions et
    une mutation (M33) empêchent la réintroduction du symbole.

- [x] 2026-10-31 — **`?etat=configuration` consommé sur `/scan` et `/caisse` —
  les deux derniers producteurs muets sont fermés.** **414/414 tests**
  (409 + 5), `verifier-design.mjs` **CONFORME** (3 déviations déclarées,
  inchangées, aucune valeur CSS ajoutée).
  - **Le défaut, tel qu'il était.** `scan/actions.js:38` et
    `caisse/actions.js:46` redirigeaient vers `…&etat=configuration` quand
    `clientServeur()` lève ; ni `scan/page.jsx` ni `caisse/page.jsx` ne testaient
    cette valeur. Les deux pages couvraient `ok`, `introuvable`, `arguments`,
    `refus`/`indisponible` — un commerçant qui venait de soumettre le formulaire
    retombait sur un **écran vide normal**, comme si rien n'avait été tenté.
  - **Décision de copie, déclarée.** Nouvelle clé
    `tableau.etat.configuration` : « L'opération n'a pas été enregistrée : ce
    service n'est pas configuré. Aucun point n'a été ajouté ni retiré. Prévenez
    l'administrateur du site. » Trois exclusions, chacune motivée : la copie de
    `/login` décrit un **écran** indisponible ; `tableau.etat.migrationTexte`
    décrit une cause **fausse** (la requête n'est jamais partie, §25.1) ; et la
    clause utile ici — « aucun point n'a été ajouté ni retiré » — est celle qui
    manquait à l'écran vide. La clause de cause (« ce service n'est pas
    configuré ») est **volontairement** la même qu'à la connexion : c'est le même
    fait, le renommer serait §26.4 ; ce qui diffère est l'**issue**.
  - **`tableau.rpc.configuration` existait déjà et n'a pas été réutilisée —
    mesuré.** Elle dit la vraie cause, mais elle n'est rendue par **aucun** écran
    (seuls les `CLES_ETAT_*` de `lib/rpc.mjs` la nomment, et `rpc.test.mjs` la
    vérifie comme clé existante), elle nomme le fournisseur, et elle décrit « un
    appel qui n'aboutit pas » — pas un geste perdu. La réutiliser aurait été
    plausible et muet sur ce que le commerçant doit savoir.
  - **`alert`, pas `status` — et c'est l'inverse de `/login` pour le même mot.**
    §26.3 : sur ces deux pages le message **répond à une soumission** ; sur
    `/login` il est présent au chargement. Le discriminant est le moment. Le test
    l'exige des deux côtés, et exige comme témoin que la page sache encore rendre
    un état d'écran (`ok` en `status`) — sinon le choix de rôle ne serait pas
    mesuré dans ce fichier.
  - **Bandeau, pas `EtatBloque`.** Ces pages rendent **déjà** la cause
    `configuration` de la **RPC** via `EtatBloque`/`migrationTexte`
    (`carte?.etat === 'configuration'`) : deux causes sous un même mot dans un
    même écran, c'est exactement §26.4. Le bandeau reprend la classe des quatre
    états voisins, donc **aucune valeur CSS ajoutée**.
  - **Le couplage est lu, sur quatre axes** (`etat-action.test.mjs`, 5 tests).
    (1) Chaque valeur d'`?etat=` écrite par `actions.js` — littéraux **et**
    gabarits — doit avoir sa branche dans la page qui la reçoit ; (2) le bloc
    `configuration` est découpé et doit porter `alert` + la bonne clé, sans
    `migrationTexte` ni `EtatBloque` ; (3) la copie est contrôlée contre trois
    témoins qui portent chacun le mot interdit ; (4) `retour` doit viser la page
    qui lit le paramètre — le maillon qu'une lecture seule ne voit pas.
  - **Six mutations, six échecs distincts** : branche retirée → *producteur* +
    *rendu* ; `alert`→`status` → *rendu* ; producteur renommé
    (`&etat=config`) → *producteur* ; copie remplacée par celle de la migration
    → *copie* (« met une migration en cause ») ; phrase d'issue retirée →
    *copie* (« ne dit pas que le solde n'a pas bougé ») ; `retour` →
    `/dashboard` → *chaîne*. **Une septième a dû être refaite** : la première
    version de la mutation « copie » n'a **rien** modifié (Perl en mode octets,
    le `.` du motif ne traverse pas l'apostrophe typographique) et le test est
    resté vert — un mutant qui ne s'applique pas ne prouve rien (lesson §27.4).
  - **Ce qui n'a pas pu être mesuré.** Le rendu : `verifier-design.mjs` ne le
    mesure pas, `next build` reste impossible (le `node` du harnais est un
    binaire Electron). Syntaxe des deux pages validée par le **SWC embarqué de
    Next** (`loadBindings().transformSync`, jsx + React automatic) : **2/2**,
    syntaxe seulement.

- [x] 2026-10-31 — **`?etat=configuration` consommé sur `/login` — dette
  « producteur sans consommateur » fermée.** **409/409 tests** (404 + 5),
  `verifier-design.mjs` **CONFORME** (3 déviations déclarées, inchangées).
  - **Le défaut, tel qu'il était.** `(dashboard)/dashboard/layout.jsx:26`
    redirige vers `/login?etat=configuration` quand `clientServeur()` lève ;
    `/login` ne lisait pas `searchParams`. Le motif était donc écrit dans l'URL
    et affiché par personne — la **même famille** que le `?echec=` de
    `/forgot-password` avant `/auth/confirm`.
  - **Ce qui a été écrit, et où.** `web/src/lib/connexion.mjs` (pur :
    `messageEtat(valeur) → clé | null`, aucun import Next, `null` par défaut) ;
    `login/page.jsx` (`searchParams` **serveur** → `messageEtat` → propriété
    `etatEcran`) ; `FormulaireConnexion.jsx` (bandeau `role="status"`, propriété
    nommée `etatEcran` parce que `etat` est déjà l'état de `useActionState`) ;
    une clé `auth.connexion.etatConfiguration` au dictionnaire FR.
  - **Décision de copie, déclarée.** « La connexion n'est pas disponible : ce
    service n'est pas configuré. Contactez l'administrateur du site. » Aucun nom
    de variable (`auth.erreurConfiguration` les nomme, mais elle s'adresse à qui
    installe le projet ; ce bandeau s'adresse au commerçant), aucune promesse de
    réessai (une configuration absente ne se répare pas en rechargeant).
  - **`status`, pas `alert`, et c'est mesuré.** L'état est présent au chargement
    et ne répond à aucun geste ; l'alerte reste réservée à l'échec d'**action**
    (`auth.erreurConfiguration`, rendue juste en dessous). Le test découpe le
    bloc et vérifie les deux côtés — sans la découpe, il aurait trouvé le mot
    dans un commentaire (c'est arrivé : première version en échec, le commentaire
    citait le nom d'attribut ; les noms sont retirés du commentaire, qui part
    dans le bundle).
  - **Le couplage est lu, pas commenté.** `etat-connexion.test.mjs` extrait le
    **littéral** `redirect('/login?etat=…')` du fichier de la garde, le parse, et
    exige que `messageEtat` rende une clé existante au dictionnaire. Un balayage
    **large** (`[?&]etat=`) sert de témoin au balayage **étroit** (redirection
    littérale) : si le compte diffère, une valeur est produite sans être lue —
    c'est le cas d'un `redirect(\`…?etat=${x}\`)`, que le balayage étroit raterait.
  - **Trois mutations, trois échecs distincts** (un garde qui ne peut pas échouer
    ne prouve rien) : producteur renommé en `?etat=config` → test *producteur* ;
    `role="status"` → `role="alert"` → test *rendu* ; `NEXT_PUBLIC_SUPABASE_URL`
    ajouté à la copie → test *copie*. Chaque fichier restauré ensuite (vérifié
    par `grep`).
  - **Ce qui n'a pas pu être mesuré, et qui est écrit comme tel.** Le rendu :
    `verifier-design.mjs` ne mesure pas le rendu, et `next build` reste
    impossible (le `node` du harnais est un binaire Electron). Syntaxe validée
    par le **SWC embarqué de Next** (`next/dist/build/swc` → `transformSync`,
    jsx + React automatic) sur les deux fichiers touchés : 2/2, **syntaxe
    seulement**, ni frontière `'use client'`, ni rendu.
  - **Dette nouvelle, mesurée, non élargie en silence.** `scan/actions.js:38` et
    `caisse/actions.js:46` produisent `&etat=configuration` ; aucune des deux
    pages ne teste cette valeur (elles testent `ok`, `introuvable`, `arguments`,
    `refus|indisponible`). Même cause, **copie différente** : le texte existant
    pour l'état `configuration` de la RPC dit « La base n'est pas encore
    migrée » — faux ici (c'est une variable d'environnement absente), donc
    exactement le §25.1. Nommée au backlog.

- [x] 2026-10-31 — **Caméra du scanner sur `/scan`, RPC inchangée.** **404/404
  tests** (395 + 9), `verifier-design.mjs` **CONFORME** (3 déviations, aucune
  valeur CSS ajoutée).
  - **Ce qui a été écrit, et où.** `web/src/lib/camera.mjs` (pur : capacités,
    classement d'erreurs, lecture, URL) ; `web/src/components/scan/CameraScanner.jsx`
    (`'use client'`, le seul du dossier) ; trois lignes dans `scan/page.jsx`
    (import, `<CameraScanner locale={locale} />`, et une bordure de séparation) ;
    douze clés `page.scanner.camera.*` au dictionnaire FR.
  - **Le raccordement est une navigation, pas un appel.** Le composant lit un QR
    puis `window.location.assign('/scan?code=C-XXXXXX')` : la page (serveur)
    refait `carteParToken` → `JaugePoints` → `crediterPoints`, exactement comme
    au clavier. Conséquence vérifiable : le composant ne contient **aucun** nom
    de RPC, aucun client Supabase, aucun `fetch` — et le test l'exige sur la
    chaîne, commentaires compris.
  - **Quatre états, quatre textes.** `refus` (permission), `sansCamera`
    (`NotFoundError`), `nonSupporte` (`BarcodeDetector` absent ou liste de
    formats sans `qr_code`), `indisponible` (`NotReadableError`, pilote). Un
    message unique aurait envoyé l'utilisateur régler la permission alors que le
    navigateur n'a pas d'API. `classerErreurCamera` rend aussi `permission` :
    une erreur **inconnue n'est jamais** un refus.
  - **Deux gardes, pas une.** `jetonValide` seul rend `true` sur
    `'1234567890123'` (il ne contrôle que 1–64 caractères) : un EAN d'emballage
    serait devenu un jeton de carte. `codeDepuisScan` exige donc
    `codeCarteValide` **et** `jetonValide`, et le test mesure la prémisse
    (`jetonValide(ean) === true`) avant de constater le refus.
  - **Parité avec le champ manuel, testée.** La caméra n'est ni plus stricte ni
    plus laxiste que la saisie : `codeDepuisScan(x)` est confronté à
    `codeCarteValide(normaliserCode(x)) && jetonValide(…)` sur sept entrées —
    sans quoi un QR refusé au clavier fonctionnel serait un mystère de plus.
  - **Ce qui n'a pas pu être mesuré, et qui est écrit comme tel.** Aucun test
    n'ouvre de caméra (la permission est une décision humaine) ; le rendu de
    l'aperçu n'est pas mesuré par `verifier-design.mjs` ; et `next build` est
    **impossible dans ce harnais** — `node` y est un binaire Electron, dont le
    `semver.satisfies` casse le CLI Next. La syntaxe a donc été validée par le
    **SWC embarqué de Next** (`loadBindings().transformSync`, jsx + React
    automatic) sur les trois fichiers, ce qui prouve la syntaxe et rien de plus.

- [x] 2026-10-31 — **`/auth/confirm` — producteur du `?echec=` mesuré, et
  `emailRedirectTo` dans `signUp`.** **348/348 tests** (332 + 16),
  `verifier-design.mjs` **CONFORME**, **3 déviations** (inchangées : la route ne
  rend rien, donc aucune valeur CSS n'entre).
  - **Le raisonnement qui manquait** : les trois valeurs mesurées ne sont pas un
    décor, ce sont les trois échecs réels d'un retour de lien. `?code=` (PKCE)
    exige le *code verifier* posé en cookie : ouvert sur un autre appareil, il
    échoue → **`appareil`**. Le message mesuré le dit mot pour mot — « les liens
    actuels s'ouvrent où vous voulez » — et cette promesse-là est `?token_hash=`,
    que la route accepte aussi.
  - **Aucun rendu, donc rien à juger à l'œil** : `app/auth/confirm/route.js`
    redirige (`redirect()` **hors** du `try`, `dynamic = 'force-dynamic'`). Tout
    ce qui peut y mal tourner est dans `lib/confirmation.mjs` — **pur**, testé
    sans serveur. La cartographie est vérifiée sur les messages réels de
    Supabase, pas sur une intuition : « code verifier » gagne sur « invalid ».
  - **Le couplage est testé, pas commenté** : `destinationEchec()` ne peut pas
    produire une valeur que `messageEchec()` refuse de traduire, et les trois
    clés existent dans les trois langues.
  - **Mesuré** (`next start` sur le build de production) : `/auth/confirm` →
    **307** vers `/forgot-password?echec=invalide` ; `?error_code=otp_expired` →
    **`echec=expire`** ; `?type=recovery` → **`echec=invalide`** *(mesure du
    2026-10-31 matin ; levée le soir même — `type=recovery` vérifie désormais et
    mène à `/nouveau-mot-de-passe`)* ; la page affiche
    le bandeau mesuré en fr **et** en ar (`dir="rtl"`), et **rien** pour une
    valeur inconnue. *Transparence* : la mesure de la forme `token_hash` a émis
    **une** requête `verifyOtp` vers l'auth du projet avec un jeton inexistant
    (réponse « expiré ou invalide », donc `echec=expire`). Aucun état modifié —
    c'est la seule preuve de bout en bout disponible sans boîte mail.
  - **Origine du lien** : `NEXT_PUBLIC_SITE_URL` si définie, sinon
    `x-forwarded-host`/`host` (`http` seulement en local). Sans origine, l'option
    est **omise** : Supabase retombe sur l'URL de site — un lien valide, jamais
    mort.
- [x] 2026-10-30 — **R1 (2/2) — `register` + `forgot-password` mesurés, marque
  tranchée, i18n branchée dans l'UI.** **332/332 tests** (307 + 25),
  `verifier-design.mjs` **CONFORME**, **3 déviations** (inchangées).
  - **Marque : `Fidelia`.** Le blocage est levé par la **mesure**, pas par une
    préférence : le scrape écrit « Fidelix » parce qu'il a mesuré **la cible**
    (titre, JSON-LD, `contact@fidelix.ma` dans le texte CNDP du bundle
    d'inscription) ; `basal-knowledge.md` §14 dit l'inverse pour le clone —
    « Le nom “Fidelix” et ses marques ne doivent pas être réutilisés ».
    **Une seule source** : `marque.nom`. `meta.titre` **interpole**
    `{marque}` au lieu de la recopier (c'était la dernière double source), et
    le test `i18n-ui` refuse tout littéral `'Fidelia'`/`'Fidelix'` hors du
    dictionnaire. `marque.domaine = fidelia.ma` est **provisoire** — déclaré.
  - **Copie mesurée, comportement réimplémenté.** Quatre chunks d'authentification
    lus (`login_page`, `register_page`, `forgot-password_page`, `auth__layout`) :
    « BON / RETOUR », « CRÉEZ / VOTRE ESPACE », « MOT DE PASSE / OUBLIÉ ? »,
    champs et placeholders, schéma Zod (**donc les messages**), quatre clés de
    `user_metadata` (`full_name`, `phone`, `consentement_cndp_le`,
    `consentement_cndp_version`), texte CNDP, trois valeurs de `?echec=`,
    `POST /api/auth/reinitialiser`. **La page `/login` a été réalignée** :
    elle disait « Bon retour. » en script sur « Connexion » — joli, et faux.
  - **0 dépendance ajoutée.** La cible utilise `zod`, `react-hook-form`,
    `framer-motion` et un système de toasts ; on a `useActionState`,
    `useFormStatus` et un module pur (`lib/validation-compte.mjs`). Les sept
    icônes sont les **tracés mesurés** de lucide, recopiés dans
    `components/auth/Icones.jsx`. Un test interdit les trois paquets.
  - **Aucun nouvel oracle.** `signUp` échoue avec **un seul** message (celui de
    la cible), `resetPasswordForEmail` répond **succès neutre** sauf `429` — le
    contraire exact de ce que fait la cible à la connexion (elle énumère
    `email_not_confirmed`, `user_already_exists`…), écart déjà assumé en 1/2.
  - **Deux liens morts supprimés, et un test qui les interdit.** `/caisse`
    figurait dans la barre alors qu'aucune route n'existe — mesuré sur la cible
    ne veut pas dire existant chez nous. `i18n-ui.test.mjs` **calcule les routes
    du disque** et échoue sur tout `href` orphelin (`/caisse`,
    `/onboarding`, `/auth/confirm` sont prouvés absents, `/register` présent).
  - **i18n branchée** : `localeRequete()` (`Accept-Language` → `negocierLocale`),
    `div[lang][dir]` — la structure relevée sur `/ar` —, `pour(locale)` dans les
    six composants et les quatre pages. **92 clés × 3 locales**, parité
    stricte, **0 doublon** (le test lit le source : deux `'marque.nom'` dans un
    objet JS, le second gagne en silence et le test d'égalité n'y voit rien).
  - **Rendu vérifié par mesure** : `next start` sur le build de production →
    `/` 307, `/login` 200, `/register` 200, `/forgot-password` 200, `/apercu`
    **404**, `/dashboard` **307 sans session**. Mesures navigateur : `h1` en
    **Anton** 48 px, carte 448 px / `border-radius: 32px`, bouton 390×52,
    `scrollWidth === clientWidth`, et avec `Accept-Language: ar` un
    `div[lang=ar][dir=rtl]` propagé jusqu'au `form` (`rtl` calculé).
  - **Un défaut d'outillage corrigé** : `npm test` lançait **0 test** en
    annonçant « 0 échec » (`../../tools/…` sortait du dépôt). Corrigé ; le
    compte 307 → 332 vient de là, pas de 25 défauts trouvés.

- [x] 2026-10-30 — **Aperçu de développement du tableau de bord + défaut de
  contraste corrigé (mesuré à l'écran, pas supposé).**
  - **Pourquoi** : la base de reconstruction ne contient **aucun compte**
    (`GET /auth/v1/admin/users` → `{"users":[],"aud":"authenticated"}`), donc
    `login → dashboard` n'était **pas parcourable à l'œil**. Or `design-system.md`
    §4 dit explicitement que le **rendu** n'est pas vérifié par le CLI.
  - **`/apercu` (dev only)** : rend `CoqueTableau` + `ContenuTableau`, les
    **mêmes** composants que `/dashboard`. Il ne lit **aucune** session et
    **n'existe pas en production** — `notFound()`.
  - **Preuve du 404 de production, pas une regex** : `next build` +
    `next start` sur un `distDir` séparé (`.next-build`, supprimé depuis) →
    `/apercu` = **404**, `/login` = **200**, `/dashboard` = **307 → /login**.
    En dev : `/apercu` = 200. Le `distDir` est pilotable par
    `FIDELIX_DIST_DIR`, pour qu'une vérification de build ne casse pas le
    serveur de dev qui écrit dans `.next`.
  - **Extraction sans duplication** : `components/tableau/CoqueTableau.jsx`
    (matériau) et `components/tableau/ContenuTableau.jsx` (contenu). La
    **garde** reste dans `app/(dashboard)/dashboard/layout.jsx` — c'est la seule
    chose que ce fichier possède encore en propre.
  - **Défaut trouvé par le rendu** : le tableau de bord affichait **du texte
    presque noir sur le bleu nuit**. Cause mesurée : `globals.css` écrit
    `body { color: rgb(var(--ink-rgb)) }`, donc la couleur est calculée **une
    fois**, sur `<body>`, avec l'encre du thème clair (`22 21 20`). `.dark` est
    posé sur un **descendant** (il ne peut pas être sur `<html>` : les pages
    claires partagent la racine), et **plus personne ne relit `--ink-rgb`** :
    les enfants héritent de la couleur *calculée*, pas de la variable.
    Correctif : `color: rgb(var(--ink-rgb))` sur
    `[data-skin=premium].dark.nuit` — **aucune valeur inventée** (`243 239 236`
    est l'encre sombre **mesurée**), seul le placement est décidé. Non inscrit
    dans `HORS_LEDGER` : le vérificateur ne suit que les propriétés `--*`.
  - **6 nouveaux tests** (`tools/rea/tests/apercu.test.mjs`) : l'aperçu rend la
    coque partagée, `notFound()` précède le rendu, il ne lit aucune session, la
    garde de `/dashboard` est intacte, et les deux pages importent
    `ContenuTableau` **sans recopier** de balisage (`<Surface`, `font-impact`).
    **307/307 tests**, `verifier-design.mjs` **CONFORME**, 3 déviations.

- [x] 2026-10-30 — **R1 (1/2) — socle Next.js + design system « verre » +
  polices mesurées + peaux clair/sombre, `login → dashboard`.**
  - **Le socle tourne** : `next build` ✅, routes `/` (307 → `/login`),
    `/login` (200), `/dashboard` (**307 → `/login` sans session** — la garde est
    serveur, pas écran). Next 16.4.3 / React 19.3.1 / Tailwind **3.4.19** épinglé.
  - **Correction d'une affirmation fausse** : « aucun `.woff2` capturé » était
    faux. Les `@font-face` sont dans la **2ᵉ** feuille du build
    (`_next_static_css_d34d95ecc21099a8.css`), et les 23 binaires dans le scrape
    public (`SITE/_next/static/media/`). La cause : `extraireBlocs()` cherche une
    accolade *dans* un at-rule — sur `@font-face{…}` il n'en trouve pas et perdait
    le bloc **en silence**. `extrairePolices()` traite désormais les `@font-face`
    comme un ensemble de déclarations. **42 `@font-face`, 10 familles, 23
    binaires** transcrits (+ `size-adjust`/`ascent-override` des replis).
  - **`--font-*` ne sont pas dans `:root`** : la cible les déclare sur les classes
    `.__variable_*` de `next/font/local`, portées par `<body>`. `polices.mjs`
    exporte `CLASSES_POLICES` ; le `<body>` rendu porte **exactement** les cinq
    mêmes empreintes que la cible (`__variable_d8ebd1 … __variable_4dc837`).
  - **Vérificateur étendu deux fois** : deux feuilles au lieu d'une, polices
    incluses, et `HORS_LEDGER` — toute invention doit être **déclarée avec sa
    raison**, sinon le verdict échoue. État : `variables 0/0/0`, `classes 0/0/0`,
    `polices 0/0/0`, **CONFORME**, 3 déviations affichées en `DÉCLARÉ`.
  - **Peau bleu nuit** (demande produit) : `nuit.css`, **3 déclarations**
    seulement, sélecteur distinct de tout ce que le ledger mesure. Le reste de la
    couche sombre vient de `[data-skin=premium].dark` mesuré.
  - **Tests : 301/301** (286 + 15). Deux fichiers neufs, tous deux réclamés par
    des commentaires mais absents : `tests/i18n.test.mjs` (jeux de clés, RTL,
    routage, `q=` de `Accept-Language`, `traduire` qui lève) et
    `tests/design-system.test.mjs` — qui vérifie **que le vérificateur sait
    échouer** (`22px` → `20px` ⇒ divergent).
  - **Deux défauts corrigés avant livraison** : un `<link href="/register">` vers
    une route inexistante (404) et une double source pour le nom de marque.
  - **Détail structurel** : palettes `:root` / `.dark` / `[data-skin=premium]`,
    `.verre`, `.vitre`, `.grain-premium`, `.fond-premium` **et** `.shadow-*`
    (3 sur 4) transcrits ; `data-skin` sur `<html>` **comme la cible**.
  - **Documentation** : `docs/design-system.md` (sources + empreintes, ce qui est
    transcrit, ce qui est décidé, ce qui n'est **pas** vérifié).

- [x] 2026-10-26 (00:15) — **Phase 1 débloquée par la mesure, pas par la
  connexion.** Session humaine obtenue dans une fenêtre dédiée ; **2 cookies
  `sb-rozagopjfkkblyxtjdgw-auth-token.*`** écrits dans `.profil-rea/`
  (expiration 2027). Preuve indépendante de la fenêtre : un clone du profil
  ouvert en headless atteint `https://fidelix.ma/dashboard` (200) et rend le
  dashboard réel (« impetus · Scanner un client · Clients · Programme ·
  Messages · Avis Google · Équipe · QR Code · Apparence · Se déconnecter »).
- [x] 2026-10-26 (00:15) — **Deux bugs d'outillage identifiés et corrigés**,
  chacun avec sa mesure :
  1. **La sonde de session était fausse.** Table mesurée sur la production :
     `/api/me` → **401 anonyme, 404 authentifié** (jamais 200) ; `/dashboard`
     → 307 → /login anonyme, **200 authentifié**. Le préflight, le garde n°3 et
     `ouvrir-session.mjs` exigeaient tous `200 sur /api/me` : une session
     valide était donc déclarée `ABSENTE`, et `--attendre` ne pouvait jamais
     se déclencher. Sonde remplacée par `SONDE_SESSION = '/dashboard'`
     (`tools/rea/session.mjs`), partagée par les trois outils.
  2. **`entetes(env, cookie)` ignorait son second argument** — il ne lisait que
     `env.FIDELIX_COOKIE`. Le cookie du profil n'était donc **jamais envoyé** :
     le pont profil → HTTP annoncé en §10 n'existait qu'à moitié. Mesure : avec
     l'en-tête reconstruit à la main, `/dashboard` → **200**.
- [x] 2026-10-26 (00:15) — **Garde de dérive ajouté** : toute cible dont la
  réponse mène à une AUTRE route est rejetée. Cas réels : `/admin` → 307
  `/dashboard` (rôle insuffisant) et `/onboarding` → 307 `/dashboard` (déjà
  onboardé). Sans ce garde, la capture rendue avait **écrit le dashboard sous
  les noms `a11-admin` et `a12-onboarding`** ; les 6 fichiers ont été supprimés
  et la passe rejouée → **13/15 captures · 2 rejets · 0 erreur**.
- [x] 2026-10-26 (00:15) — **S2 exécutée** (`_captures/2026-10-26-auth/`) :
  **11 pages en 200** (dashboard, program, rewards, scan, reviews, qrcode,
  automations, branding, caisses, caisse) + **53/53 assets**, **0 erreur**.
  Hypothèses **tranchées** : `/account` → **404**, `/abonnement` → **404**,
  `/loyalty` → **404** (les trois sont réfutées comme pages).
- [x] 2026-10-26 (00:15) — **Sondes : 12 endpoints se déclarent POST-seulement.**
  `405` (Method Not Allowed) sur `/api/transaction`, `/api/transaction/annuler`,
  `/api/caisse/appairer`, `/api/caisse/cadeau-filleul`,
  `/api/caisse/parrainage-valide`, `/api/caisse/reviews`,
  `/api/payments/payzone/initiate`, `/api/commerce/select`,
  `/api/equipe/activer`, `/api/push/subscribe`, `/api/email/welcome`,
  `/api/demarrer` ; `404` sur `/api/me`, `/api/auth/session`, `/api/health`,
  `/api/scan/card`, `/api/broadcast` ; `200` sur `/api/scan/cards`,
  `/api/fidelia`, `/api/fidelia?resume=1`. Un 405 est une **preuve d'existence**.
- [x] 2026-10-26 (00:15) — **Modèle de données aperçu par les XHR réels** :
  PostgREST `GET /rest/v1/{automations, loyalty_programs, restaurants,
  reward_tiers, till_sessions}` et RPC `classement_caisses`,
  `mon_role_point_de_vente`, `parrainages_du_commerce`, plus `auth/v1/user`.
  Côté Next : `GET /api/commerce/actif`, `/api/fidelia`, `/api/scan/cards`.
- [x] 2026-10-26 (00:15) — **Non-régression** : **22/22** tests
  (`node --test tools/rea/tests/session.test.mjs`), dont 11 nouveaux qui figent
  la table de sondes, la règle de dérive et l'usage du cookie dans `entetes()`.

- [x] 2026-10-26 — **Identité serveur établie par mesure** : Next.js App Router sur
  Vercel (`server: Vercel`, `x-powered-by: Next.js`, `x-vercel-id: fra1`), HTTP/2,
  HSTS 2 ans. Preuve : `manifeste.json` + en-têtes des 21 pages capturées.
- [x] 2026-10-26 — **Périmètre dérivé de deux documents officiels** : `robots.txt`
  (7 zones hors index) et `sitemap.xml` (34 URLs, dont 27 `/recompenses/<slug>`).
- [x] 2026-10-26 — **Outillage rejouable écrit** : `tools/rea/capturer-fidelix.mjs`
  (pages + sondes + assets, SHA-256, `--verifier`, `--diag`) et
  `tools/rea/analyser-fidelix.mjs` (contrats JSON).
- [x] 2026-10-26 — **Passe 1 anonyme exécutée** : 21 pages en 200, 12 routes en
  `307 → /login`, 10 sondes API en `401`, 50 assets en 200, **0 erreur**,
  40/40 cibles stables. Deux passes successives (sitemap, puis routes découvertes
  dans le HTML) — chaque ajout porte son motif.
- [x] 2026-10-26 — **Oracle de routes établi** : 12 modules gardés identifiés
  (`/dashboard`, `/admin`, `/onboarding`, `/program`, `/rewards`, `/scan`,
  `/reviews`, `/qrcode`, `/automations`, `/branding`, `/caisses`, `/loyalty`).
- [x] 2026-10-26 — **Auth identifiée** : Supabase GoTrue (`signInWithPassword`,
  `signUp`, `resend`, `signOut`, `onAuthStateChange`, `getUser`) + Zod.
- [x] 2026-10-26 — **Modèle produit documenté depuis le produit lui-même** :
  `/guide` (10 sections) + tarification mesurée (397 MAD/PDV/mois, gratuit ≤ 30
  clients, packs email 200/400/700 MAD, carte NFC 150 MAD).
- [x] 2026-10-26 — **Corpus vault écrit** : `_Index_REA.md` + 5 notes Global +
  5 notes Modules + 1 note UI.
- [x] 2026-10-26 — **Suivi séparé créé** : `PROGRESS.md`, `lesson-learned.md`,
  `docs/` (PRD, architecture, technique), `tasks/`.
- [x] 2026-10-26 — **Rejouabilité vérifiée** : `--verifier` → **89/90 cibles
  stables**. L'unique divergence est **nommée** : `/card/test` (404 Vercel, contenu
  variable d'un tirage à l'autre). Aucune page métier ne dérive.
- [x] 2026-10-26 — **Isolation git prouvée** : `git status FIDELIX` ne montre
  qu'une entrée `?? FIDELIX/`. Aucun fichier `UNICITY/` n'a été modifié par cette
  session (les 393 suppressions visibles à la racine sont la réorganisation
  antérieure du dépôt, **non commitée avant** mon intervention).
- [x] 2026-10-26 (23:14) — **Blocage B-1 re-mesuré, pas supposé** : `FIDELIX/.env`
  est **absent** (seul `.env.example`), `FIDELIX_COOKIE` est vide dans le shell,
  `/dashboard` → `307`, `/api/me` → `401`, et le Chrome que je pilote atterrit
  sur `/login`. Trois voies fermées, une seule conclusion : pas de session.
- [x] 2026-10-26 (23:14) — **Découverte : le garde est CATCH-ALL.** Seize chemins
  sondés en anonyme — dont des noms inventés (`/menu`, `/staff`, `/integrations`)
  — renvoient **tous** `307 → /login` ; seul `/caisse/login` répond `404`.
  Conséquence méthodologique : **un 307 anonyme ne prouve pas qu'une route
  existe**. Les 200/404 ne deviennent discriminants qu'avec une session.
- [x] 2026-10-26 (23:14) — **Garde-fous de preuve dans l'outil** : `modeAttendu`
  par manifeste (un ledger anonyme étiqueté « authentifié » est désormais
  **refusé avant écriture**), refus d'écraser un ledger existant sans
  `--ecraser`, `--manifeste`, `--sans-sondes`, `--preflight`. Testés : exit 2,
  **aucun fichier créé**, et l'empreinte du ledger Phase 0 est inchangée
  (`5bbd685e…`).
- [x] 2026-10-26 (23:14) — **Manifeste Phase 1 écrit** :
  `_captures/cibles-auth.json` — 15 pages + 20 sondes GET. `/account` et
  `/abonnement` y sont marqués **`hypothese`** (aucune preuve dans le vault) :
  le premier statut avec session les confirmera ou les réfutera.
- [x] 2026-10-26 (23:14) — **Capture rendue outillée** :
  `tools/rea/capturer-rendu.mjs` (Playwright) enregistre DOM hydraté, capture
  pleine page, console et **requêtes XHR/fetch observées** (méthode + chemin +
  statut, query caviardée) — c'est la matière des contrats d'écriture. Une cible
  qui atterrit sur `/login` est **rejetée**, jamais enregistrée sous le nom d'un
  module. Testé pour de vrai : `/login` capturé, `/dashboard` rejeté.
- [x] 2026-10-26 (23:14) — **Session sans identifiants** :
  `tools/rea/ouvrir-session.mjs` ouvre une fenêtre dédiée ; **l'utilisateur
  saisit lui-même** ses identifiants, l'agent ne lit ni ne stocke rien. La
  session persiste dans `FIDELIX/.profil-rea/` (gitignoré). Mode `--verifier`
  testé : `/api/me` → 401, aucune fenêtre.
- [x] 2026-10-26 (23:14) — **Fuite de données personnelles prévenue** :
  `_captures/` n'était **pas** gitignoré. Ajout au `.gitignore` de
  `FIDELIX/.profil-rea/` et de `_captures/*/rendu/` ; le ledger `rendu.json`
  (empreintes seules) **reste versionné** — la preuve est conservée, les données
  clients ne le sont pas.
- [x] 2026-10-26 (23:35) — **Préflight exécuté, verdict `session ABSENTE`** — et
  c'est un résultat, pas un échec. Preuves : `FIDELIX/.env` **absent**,
  `FIDELIX_COOKIE` vide, `sqlite3` sur le profil → **0 cookie**, aucun écouteur
  TCP sur `9222`, `GET /api/me` → `401`, `GET /dashboard` → `307 → /login`.
  La passe authentifiée n'a donc **pas** été lancée, et rien n'a été écrit :
  aucun dossier `_captures/2026-10-26-auth/` n'existe.
- [x] 2026-10-26 (23:35) — **Défaut de garde trouvé en LISANT le code** : le mode
  était déduit de la *présence* de `FIDELIX_COOKIE`, jamais de sa validité. Un
  cookie expiré aurait donc produit un ledger étiqueté `AUTHENTIFIÉ` rempli de
  pages `/login`. **Corrigé deux fois** : contrôle `GET /api/me === 200` **avant
  toute écriture**, et rejet par cible (`refuses[]` dans le ledger) quand une
  page atterrit sur `/login`. Testé avec un faux cookie : exit 2, `session morte
  ou expirée`, aucun dossier créé.
- [x] 2026-10-26 (23:40) — **Pont manquant construit** : `tools/rea/session.mjs`.
  `ouvrir-session.mjs` persiste la session dans `.profil-rea/`, mais
  `capturer-fidelix.mjs` ne lisait que `.env` — une connexion humaine réussie
  aurait donc **encore** affiché « session ABSENTE ». Désormais une seule règle,
  documentée et journalisée : `--profil` > `FIDELIX_COOKIE` > `.profil-rea/`
  **si** un jeton `sb-*-auth-token` y est présent > anonyme. Les cookies de
  télémétrie (`lswt-*`) ne font pas une session : ils sont ignorés.
- [x] 2026-10-26 (23:40) — **Bug silencieux corrigé au passage** :
  `capturer-rendu.mjs` construisait ses cookies **sans `domain`** ;
  `context.addCookies()` exige `url` ou `domain`+`path`. La voie
  `FIDELIX_COOKIE` du rendu n'injectait donc probablement rien. Le parseur est
  maintenant partagé et vérifié par un aller-retour réel (`addCookies` →
  `context.cookies` → `sb-x-auth-token@fidelix.ma`).
- [x] 2026-10-26 (23:45) — **Preuves re-vérifiées, sans régression** :
  `--verifier` → **1 divergence sur 90**, identique à celle documentée
  (`/card/test`, 404 Vercel au corps variable). **Aucune page métier ne bouge.**
  `--verifier` s'aligne désormais sur `ledger.mode` : un ledger anonyme est
  re-vérifié sans cookie, sinon on comparerait deux régimes différents.
- [x] 2026-10-26 (23:45) — **Tests écrits** : `tools/rea/tests/session.test.mjs`
  — **11/11** (`node --test`), hors ligne. Couvre : reconnaissance du jeton
  Supabase (dont le refus de `code-verifier`), aller-retour en-tête ⇄ cookies,
  priorité de résolution, profil introuvable, et lecture réelle de
  `.profil-rea/` (mesurée : `0 cookie(s), auth=false`).
- [x] 2026-10-26 (23:48) — **Préflight rejoué à la reprise : `session ABSENTE`,
  exit 1 — et S2 n'a pas été lancée.** Mesures de cette passe : profil
  `.profil-rea/` = **0 cookie** (SQLite, base non verrouillée), `.env` **absent**,
  aucun écouteur sur `9222`, `GET /api/me` → **401**, `GET /dashboard` →
  **307 → /login**. La source est nommée sans ambiguïté par l'outil (« profil par
  défaut … — **aucun cookie d'auth** », et non « profil introuvable ») : la
  connexion humaine n'a pas eu lieu, le profil n'est pas illisible.
  **Rien n'a été écrit** : `_captures/` ne contient toujours que `2026-10-26/`
  (passe anonyme), aucun `2026-10-26-auth/`. Non-régression : **11/11** tests
  hors ligne, aucun processus résiduel sur le profil, `git status FIDELIX` →
  une seule entrée `?? FIDELIX/`.
- [x] 2026-10-29 — **R1.2 — DDL de durcissement écrit et vérifié** (non exécuté).
  `migrations/0001_acl_rls_durcissement.sql` *(alors nommé
  `0001_r1_2_acl_rls_durcissement.sql` ; fusionné avec `0002` le 2026-10-31)* :
  `REVOKE EXECUTE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` +
  `GRANT … TO service_role` sur les 2 RPC mesurées ; `REVOKE ALL` de table puis
  `ENABLE ROW LEVEL SECURITY` sur les 3 tables, **sans** `FORCE`, **sans**
  politique permissive. Vérificateur :
  `tools/rea/verifier-durcissement.mjs` → **CONFORME (exit 0)** ; **23 tests**
  dédiés, suite complète **286/286**. `join_loyalty_program` documentée en
  contrainte avant (commentaire seulement). **Aucune requête, aucune écriture.**
  **Révisé le 2026-10-31 :** les `GRANT` vont désormais aussi à `anon` et
  `authenticated` — la sonde a mesuré qu'`anon` exerce déjà les deux RPC, et
  révoquer ce droit sans le rendre cassait le seul chemin d'écriture.
- [x] 2026-10-29 — **Deux ambiguïtés du dénominateur levées** (elles faussaient
  la mesure) : (1) l'univers client est de **165 fichiers JS** sur 4 passes —
  `333` comptait toutes les extensions ; (2) les **1275 `.from(`** sont pour
  **1213 `Array.from(`** : le résiduel est de **62**, dont **30 internes de
  librairie** (`Buffer.from`, base64, et le `from(e){return this.rest.from(e)}`
  de supabase-js) et **32 lectures Supabase**, toutes littérales. **Zéro
  `.from(` calculé** côté applicatif ⇒ aucune surface de lecture cachée.
- [x] 2026-10-29 — **Périmètre R1.2 tranché par la mesure, pas par la prudence.**
  Les **7 tables** que le bundle lit (`restaurants`, `loyalty_programs`,
  `reward_tiers`, `automations`, `push_notifications`, `till_sessions`,
  `subscriptions`) **n'existent pas dans la base** ; les **3 tables** qui
  existent (`clients`, `loyalty_cards`, `loyalty_transactions`) n'ont **aucune
  lecture client** (`loyalty_cards`/`loyalty_transactions` : **0 occurrence**
  dans tout le bundle ; `clients` : 232 occurrences, toutes en libellés, routes
  `/clients-import` / `/donnees-clients`, section de nav, et `/admin/oauth/clients`
  de GoTrue — **jamais une lecture de table**). Durcir les 3 ne casse donc aucune
  lecture mesurée.
- [x] 2026-10-29 — **`anon` lit réellement les 3 tables** : `verdict: "lisible"`
  (200 + `[]`) sur chacune. Ce n'est pas une hypothèse : le `GRANT` existe. Les
  tables étant vides, l'exposition est **latente** (`clients.first_name`,
  `last_name`, `email`) — d'où le `REVOKE ALL` de table, pour que la fermeture
  ne dépende pas du seul interrupteur RLS.
- [x] 2026-10-29 — **Aucune politique RLS ne peut être écrite sans inventer** :
  `clients` n'a **aucune colonne d'authentification** (`id, first_name,
  last_name, email, created_at`) ; `loyalty_cards.client_id → clients.id`, pas
  `auth.users`. Un `USING (client_id = auth.uid())` supposerait une
  correspondance que rien ne mesure. Choix : RLS active + **zéro politique**
  (refus par défaut, réversible par un `GRANT` motivé).
- [x] 2026-11-02 — **P0-6b CLOSE, et close par un refus argumenté : le socle ne
  compte que des points.**
  - **Consommateur nommé avant d'écrire une ligne** : dans la cible, ces trois
    réglages ne sont pas lus par l'aperçu mais par **l'écran caisse/scan** —
    `_captures/2026-11-02-a6/raw/assets/_next_static_chunks_6866-59170e02f2636443.js`
    (+ sonde `b06-api-scan-cards.html`) : `programType === "stamps"` ⇒
    `currentStamps / stampsTotal`, `Array.from({length: stampsTotal})` sous
    « tampons collectés », échange ouvert à `currentStamps >= stampsTotal`.
  - **Le blocker réel, mesuré** : `loyalty_programs.kind ∈ {points, tampons}`
    existe depuis `0003`, `/rewards` **proposait déjà « Tampons »**, et **rien ne
    branchait dessus**. `award_loyalty_points` est une RPC **préexistante**
    (révoquée/regrantée par `0001`), sans paramètre de tampon ⇒ `stamps_delta`
    reste `0`. L'interrupteur inerte existait donc **avant** P0-6b.
  - **Décision humaine du 2026-11-02** (une seule question posée) : points
    seulement. Conséquence : `0015` reste le contrat **complet** de l'apparence
    (`stamps_total`/`stamp_icon`/`style_bandeau` n'arriveront pas), et
    l'option inerte est retirée au lieu d'être laissée en place.
  - **Fait** : `TYPE_PROGRAMME = 'points'` (`lib/programme.mjs`, avec la raison) ;
    le `select name="type"` de `/rewards` est supprimé ; `rewards/actions.js`
    n'écoute plus le `FormData` et envoie `type: TYPE_PROGRAMME` ; la phrase
    `page.programme.unitePoints` dit à l'écran **pourquoi** le mode tampons est
    absent ; les clés `page.programme.points`/`.tampons` sont supprimées (aucun
    choix fantôme) ; les documents qui annonçaient encore la dette
    (`0015`, en-tête de `/branding`, `design-system.md` §Apparence, rapport de
    mesure §4) disent désormais le refus.
  - **Preuves** : `unite-programme.test.mjs` — **6 tests** (constante, plus aucun
    `select`/`value="tampons"`, action qui applique la constante, phrase + clé,
    anciennes clés absentes, et un balayage de `web/src` qui refuse toute valeur
    `"tampons"` envoyable) ; suite hors ligne **727 / 0 échec / 1 ignoré** ;
    `next build` exit **0** (`/rewards` listée) ; `verifier-design` **CONFORME**
    et `verifier-durcissement` **CONFORME**.
  - **Exécution** : image reconstruite (`--pull --no-cache`) et servie sur
    **7089**, conteneur `healthy` ; `/rewards` → **307** `Location: /login`
    (la garde fait son travail, le corps n'est pas vu — même dette que P0-6),
    `/login` → **200**, `/api/wallet/google/AB12CD34` → **503**
    `{"etat":"walletIndisponible"}`, journaux propres, `docker image prune -f` :
    **0 o** (aucune image orpheline).
  - **Résiduel assumé, écrit ici pour ne pas le redécouvrir** : le `check
    (kind in ('points','tampons'))` de `0003` et le refus `INVALID_KIND` de
    `enregistrer_programme` restent en base. Aucun appel de ce socle ne peut plus
    les atteindre (l'action n'envoie plus que la constante), mais un appel RPC
    direct à la main pourrait encore écrire `tampons` — valeur qui, elle,
    n'aurait toujours aucun lecteur.



## 🚧 Tâche Active (Work in Progress)

- [x] **Mise en ligne — l'audit des écrans authentifiés est FAIT ; il ne reste que
      l'URL Configuration Supabase.** *(Mis à jour le 2026-11-08, nuit 5.)* Prouvés :
      la page carte (`0018`+`0019`, `/card/<uuid>` **200** avec solde), **`www`**
      (`A` unique, `dom_E5BBkbZGYbFT5jZV`, 301 vers l'apex, `CN=www.fideliatest.site`),
      et **l'audit** : les 22 RPC utilisées existent, donc **onze des douze
      bannières de migration sont inatteignables** ; la douzième (`/settings`) ne
      s'allume que sur l'**enregistrement**, parce que **`0017` n'est pas
      appliquée** (signature à 14 paramètres au lieu de 15, mesuré). La bannière
      n'est donc pas un symptôme diffus : c'est **un fichier nommé**, et l'écran le
      nomme déjà. `/apparence` → **404** (la route est `/branding`, aucun lien
      interne ne casse).
      **Terminé le 2026-11-09 (session 7)** : *Site URL* =
      `https://fideliatest.site`, *Redirect URLs* = `https://fideliatest.site/**`
      (« Total URLs: 1 »), jugés **conformes** par
      `tools/rea/verifier-url-auth.mjs` — les **deux** URL que le code envoie
      (`/auth/confirm` et `/auth/confirm?flux=recuperation`) acceptées
      **certainement**. Cible prouvée vivante : `/auth/confirm` → **307**
      `/forgot-password?echec=invalide` (détail au § Statut Actuel, session 7).
      **Reste de cet item** : `0017` préparée (garde 10/10), **non appliquée** —
      sur demande explicite seulement, et sa preuve inclura `/card/<uuid>`
      **200**, puisqu'elle réécrit `carte_pour_wallet()`.
- [ ] **R3 — l'étape 1 est désormais FAITE, l'étape 3 reste interdite.**
      *(Correction du 2026-11-08 : la consigne ci-dessous, « coller le DDL
      `0009`→`0016` », est périmée.)* La base porte **25** fonctions publiques,
      `operations_caisse` et `messages_envoyes` existent : le collage a eu lieu
      lors d'une passe antérieure. Ce qui restait — prouver le rejeu — exige une
      **opération de caisse réelle** sur une carte réelle, donc une écriture de
      données en production : **hors mandat** tant que ce n'est pas demandé
      explicitement. Le rejeu n'a donc **jamais été mesuré en production**, et
      `lib/file-caisse.mjs` ne couvre plus ce cas par un 503 (ce 503 ne
      s'appliquait qu'à la fonction absente) : le doute porte désormais sur la
      **sémantique**, pas sur la présence des objets.
- [ ] **R3 — historique de la tâche, conservé pour la marche à suivre.**
      *(Ouvert le 2026-11-03.)* L'outil est écrit et vert
      (`verifier-idempotence-caisse.mjs`, 13 tests) ; la sonde rendait
      `PGRST202`, **re-mesuré le soir** (exit `2`). Le blocage n'était pas du
      code mais du DDL — il est levé depuis. Reste l'étape 3 :
      `node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718 --confirmer`
      → attendu `REJEU ABSORBÉ`, exit `0`.

- [ ] **R3 — le rejeu de la caisse : mesurer, pas supposer.** *(Ouvert le
      2026-11-03.)* L'outil est écrit et vert (`verifier-idempotence-caisse.mjs`,
      13 tests) ; la sonde rend `PGRST202`, **re-mesuré le soir** (exit `2`).
      **Ce qui bloque n'est pas du code : c'est le DDL.** La suite est mécanique,
      et outillée de bout en bout :
      1. coller `.profil-rea/ddl-0009-0016/fidelix-migrations-0009-0016.sql`
         dans l'éditeur SQL du projet (**un** collage : les huit fichiers, dans
         l'ordre, chacun sa transaction — un échec en `0015` laisse `0009`→`0014`
         acquises, et ne demande que la reprise du fichier fautif) ;
      2. coller `fidelix-verif-migrations.sql` : tout doit rendre `OK` (13
         fonctions + leurs droits, 2 tables avec RLS, 25 colonnes, 4 contraintes) ;
      3. `node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718 --confirmer`
         → attendu `REJEU ABSORBÉ`, exit `0`.
      D'ici là, `POST /api/caisse/operation` répond 503 et la file **conserve** :
      rien n'est perdu, rien n'est crédité. Les deux scripts ont été exécutés
      dans un Postgres jetable avant d'être livrés (cf. Statut Actuel) : ce qui
      reste inconnu est la **sémantique** en base réelle, pas le collage.

- [ ] **P0-3b / P0-3c — ce que `/billing` attend pour être complet.** *(Ouvert le
      2026-11-02, après la livraison partielle de P0-3.)*
- **Contexte / Détails :** le compteur, le bandeau et la page sont en place. Ce qui
  manque n'est pas de la copie, c'est **de l'argent** : un état d'abonnement
  (table + statut + moyen de paiement) pour lever la limite, et le tunnel de
  paiement de la cible (rythme, packs d'emails, points de vente supplémentaires)
  mesuré mais non rendu. Tant que cela n'existe pas, `/billing` dit la vérité :
  offre gratuite, prix, plaque NFC, et « l'activation en ligne n'est pas encore
  disponible ».
- **Problèmes rencontrés (Blockers) :** aucune décision produit sur le commerce à
  30 clients qui ne peut pas payer. Poser le verrou sans issue fermerait la page
  d'adhésion publique — c'est le seul chemin d'inscription du socle.
- [ ] **R3 — rendre les quatre modules réellement fonctionnels** (QR, Scanner,
      Caisse, Programme). *(Ouvert le 2026-10-31.)*
- **Contexte / Détails :** les quatre écrans existaient en R2 comme **coquilles**
  (état vide honnête, aucun chemin de données). R3 leur donne une chaîne complète
  : programme → QR → adhésion → carte → points → récompense.
- **Fait :** `lib/qr.mjs` (+ encodeur **vendoré**, MIT, non installé faute de
  `npm`), `lib/programme.mjs`, `lib/carte.mjs`, `lib/personne.mjs`,
  `lib/donnees.mjs` ; composants `QrCode`, `JaugePoints`, `EtatBloque` ; pages
  `/qrcode`, `/rewards`, `/scan`, `/caisse` réécrites en **rendu serveur sans
  état client**, et `/join/[slug]` (publique, hors dashboard).
  `migrations/0003` écrite : tables `loyalty_programs`/`reward_tiers`, index
  unique sur `card_token`, `clients.first_name/last_name` rendus facultatifs
  (§1 bis — la contrainte `NOT NULL` bloquait la carte anonyme, mesuré `23502`),
  et 5 fonctions. **Non exécutée.**
- **Fait (lecture, 2026-10-31) :** `migrations/0004_lecture_cartes.sql` +
  `cartes_du_commerce()` + `/customers` alimenté, projection **mesurée** sur
  `a17-customers.html`. La chaîne des quatre modules est **prouvée par
  exécution** (cf. Statut Actuel), refus d'échange compris. Ce qui reste vide et
  l'assume : `/caisses`, `/notifications`, `/reviews`, `/branding` — chacune
  demande sa propre lecture, aucune ne s'ouvre par imitation de celle-ci.
- **Fait (modèle, 2026-10-31) :** `migrations/0006_equipe_et_designation.sql` —
  `public.staff`, `clients.designated_staff_id` (`SET NULL`), rattachement de
  `loyalty_transactions.staff_id` (`RESTRICT`), RLS activée, **0 politique**,
  **0** droit pour `anon`/`authenticated`. **Exécutée**, rejouée sans effet,
  sondée jusqu'aux quatre refus, base rendue à **0 ligne**. Aucune RPC : c'est
  la tâche suivante, et elle ne peut pas précéder son modèle.
- **Fait (taux, 2026-11-01) :** `migrations/0008_credits_par_euro.sql` —
  `loyalty_programs.credits_par_euro`, `devise` par défaut `EUR`, les lignes
  `MAD` reprises, `programme_public()` qui rend le taux, `enregistrer_programme`
  à **6 paramètres** (ancienne signature `drop`ée). Branché sur les trois
  écrans : champ « Crédits par euro » dans `/rewards`, points facultatifs dans
  `/scan`, caméra + cartes radio dans `/caisse`. **Exécutée et mesurée** (cf.
  Statut Actuel). Le module **Équipe** (`/caisses`) reste hors de ce lot, par
  décision explicite.
- **Fait (écran Équipe, 2026-11-01) :** `/caisses` lit `equipe_du_commerce()`
  (`lib/equipe.mjs`, `donnees.equipeDuCommerce`), projette la capture et couvre
  cinq états (cf. Statut Actuel). Les portées filtrent la liste des caisses ;
  la table, elle, montre tout le point de vente — c'est ce que la seconde
  définition de la capture dit mot pour mot.
- **Fait (caisse hors ligne, 2026-11-03) :** le POS est une **PWA** et ses
  écritures survivent à une coupure. Manifeste **engendré** depuis la capture
  (seul `name` porte notre marque), `public/sw.js` (portée racine, règles
  limitées à `/caisse` et au repli, **aucun HTML authentifié en cache**), écran
  public `/caisse-hors-ligne`, `lib/file-caisse.mjs` + `…-navigateur.mjs`,
  `components/caisse/{CrediterCaisse,FileAttente}.jsx`,
  `POST /api/caisse/operation`, `migrations/0016_operations_caisse.sql`
  (**non exécutée**) et icônes PNG engendrées. L'**échange** hors ligne est
  refusé et l'écran le dit : le solde n'est pas connu. Décisions :
  `docs/design-system.md` §3, « caisse hors ligne ». 20 tests neufs, suite
  **747 / 0 échec / 1 ignoré**, `next build` exit 0.
- **Reste à faire :** deux dettes nommées du module Équipe — (1) **le choix de
  la caisse sur `/join/<slug>`** : `0007` sait recevoir `p_staff_id`, aucune page
  ne l'envoie (`donnees.mjs` appelle `{ p_slug }`), donc « Cartes » vaudra 0 en
  production ; à mesurer sur la cible **avant** d'être écrit (la page publique y
  propose-t-elle ce choix ?) ; (2) **le formulaire « Nouvelle caisse »** et son
  écriture de `staff` — aucune fonction d'écriture n'existe ; (3) le
  **drill-down** des lignes, qui demande une RPC par caisse. Détail dans le
  backlog, dette « `/caisses` (Équipe) ».
- **Problèmes rencontrés (Blockers) :**
  - ~~pas de `psql`, pas de Supabase CLI, pas de chaîne de connexion : **aucune**
    migration exécutable ici~~ — **faux depuis le 2026-10-31** : le serveur MCP
    Supabase exécute le SQL (`apply_migration`, `execute_sql`). `0003`, `0004`,
    `0005` puis `0006` ont été appliquées **et mesurées** par ce chemin ; c'est
    la leçon §32.2 (une limite d'outillage se remesure, elle ne se récite pas) ;
  - `node` est **24.22.1** et `next build` **tourne** (`node
    node_modules/next/dist/bin/next build`, 96 s, exit 0) : la limite « build
    impossible » venait de `npx` absent, pas de `node` (§29.4) ; `npm` **n'est
    toujours pas** dans le `PATH` — le binaire est `web/node_modules/.bin/next` ;
  - `marque.domaine` toujours **provisoire** : le QR doit être imprimé avec
    `NEXT_PUBLIC_SITE_URL`, jamais avec la valeur du dictionnaire.

- [ ] **R1 — Socle Next.js + design system « verre » + `login → dashboard`.**
  *(Ouvert le 2026-10-29, **2/2 livré le 2026-10-30**. Ce qui reste de R1 est
  listé ci-dessous ; le bloc A2 est **clos** et conservé comme contexte
  historique.)*
- **Contexte / Détails :** R1 est une **création**, pas un durcissement. Le socle
  sert la zone **authentifiée** ; le site public (accueil, `/login`, `/register`,
  `/rendez-vous`, `/demarrer`) est **déjà scrapé** dans `SITE/` et n'est **pas**
  à reconstruire (cadrage humain du 2026-10-30). Le point d'entrée est la page de
  connexion, qui envoie au tableau de bord.
- **Fait (1/2)** : coque `<html data-skin="premium">` + `<body>` portant les cinq
  `__variable_*` mesurés ; `app/(auth)/login` (server action, message d'erreur
  unique — pas d'oracle d'énumération de comptes) ; `app/(dashboard)/dashboard`
  (garde `getUser()` **côté serveur**, peau **bleu nuit**) ; `/` → `/login`.
  **Aperçu `/apercu` (dev only, 404 en production)** : mêmes composants que
  `/dashboard` (`CoqueTableau` + `ContenuTableau`), sans session — il rend le
  socle vérifiable à l'œil tant qu'aucun compte n'existe dans la base.
- **Fait (2/2, 2026-10-30)** : `(auth)/register` et `(auth)/forgot-password`
  (copie mesurée, server actions, `?echec=` validé côté serveur) ; **marque
  tranchée** (`Fidelia`, une seule clé) ; **i18n branchée** de bout en bout ;
  `npm test` réparé (il ne lançait rien).
- **Fait (3/3, 2026-10-31)** : **`/auth/confirm`** — retour de lien, endpoint de
  redirection sans rendu (`app/auth/confirm/route.js`), logique pure dans
  `lib/confirmation.mjs` ; `signUp` envoie enfin `emailRedirectTo`. Le
  `?echec=expire|appareil|invalide`, mesuré depuis R1 2/2, a désormais un
  **producteur**, et le couplage producteur→affichage est un test.
  Décisions déclarées : `docs/design-system.md` §3, « retour de lien ».
- **Fait (4/4, 2026-10-31) — R2** : les **neuf entrées** de navigation mesurées
  ont leur page (`/scan`, `/customers`, `/rewards`, `/notifications`,
  `/reviews`, `/caisses`, `/qrcode`, `/branding`, `/caisse`), servies par la même
  coque et la même garde. Le modèle est **un seul** fichier
  (`lib/navigation.mjs`) ; `navigation.test.mjs` vérifie que chaque `href` a sa
  page sur le disque — les `href` étant produits par un tableau, le balayage
  d'`i18n-ui` ne pouvait pas les voir. Deux pages appellent les **RPC réelles**
  (`lib/rpc.mjs`, actions serveur, codes `CARD_NOT_FOUND` / `INVALID_COST`).
  Décisions déclarées : `docs/design-system.md` §3, « navigation du tableau de
  bord ».
- **Reste** : `/conditions`, `/confidentialite` (pages absentes du scrape) ; la
  **PWA caisse** (`manifest.json`, `scope: /caisse`, file hors ligne `file_attente`,
  rejeu 65 s, mesurée en A4) — c'est **R3** ; et les **RPC de lecture**, sans
  lesquelles sept pages restent en état vide explicite.
- **Routes app mesurées disponibles comme preuve** (noms de chunks de
  `_captures/2026-10-26/raw/assets/`) : `(auth)/login`, `(auth)/register`,
  `(auth)/forgot-password`, `(dashboard)/layout`, `(admin)/layout`, `caisse` (+
  `error`), `join/[slug]`, `recompenses/[slug]`, `guide`, `demarrer`,
  `rendez-vous`, `conditions`, `confidentialite`, `mentions-legales`.
- **Contraintes héritées de R1.2, à ne pas régresser :**
  - toute nouvelle fonction RPC devra naître avec `REVOKE … FROM PUBLIC` +
    `GRANT` au rôle mesuré (piège documenté dans `migrations/0001_…sql`) ;
  - toute nouvelle politique RLS devra citer **sa preuve** (colonne
    d'appartenance mesurée) — pas de `USING (true)` ;
  - `join_loyalty_program` reste **target-only** : à créer, puis à durcir.
- **Problèmes rencontrés (Blockers) :**
  - **Marque — clos le 2026-10-30 : `Fidelia`.** Le scrape écrit « Fidelix »
    (titre, JSON-LD, `contact@fidelix.ma` dans le texte CNDP du bundle
    d'inscription) parce qu'il a mesuré **la cible**. `basal-knowledge.md` §14
    « Note de nommage » tranche : « Le nom “Fidelix” et ses marques ne doivent
    pas être réutilisés dans le clone (interface, métadonnées,
    `organizationName` du pass, PWA) ». Le nom ne vit plus que dans `marque.nom` ;
    **reste à arbitrer avant production** : `marque.domaine` (`fidelia.ma`,
    provisoire) et la référence CNDP (`REFERENCE_CNDP = cndp-2026-10`, celle de
    la cible) — une déclaration qu'on n'a pas déposée ne s'affiche pas.
  - La migration R1.2 n'est **pas exécutée** : décision humaine en attente, elle
    ne bloque pas R1.
  - **Réclamé le 2026-10-31, toujours ouvert — deux arbitrages humains :**
    1. **`marque.domaine` et `REFERENCE_CNDP`.** `fidelia.ma` et
       `cndp-2026-10` sont **repris de la cible** ; le second est *sa*
       déclaration, pas la nôtre. Tant qu'ils ne sont pas tranchés, le
       formulaire d'inscription affirme une conformité non déposée. Aucun test
       ne peut trancher cela : c'est une décision, pas une mesure.
    2. **Allow-list Supabase « Redirect URLs »** (console, pas code).
       `emailRedirectTo` n'est honoré que si l'origine envoyée y figure
       (local + production). Sinon GoTrue retombe **silencieusement** sur l'URL
       de site : le formulaire marche, le lien n'arrive jamais sur
       `/auth/confirm`, et les trois messages d'échec ne sont jamais vus.
       À régler en même temps que le domaine, dont l'origine dépend.

### 🗂 Bloc A2 — clos le 2026-10-27 (contexte historique)

- [ ] **A2 — Contrats d'écriture : trancher le périmètre AVANT de coder.**
  Les 12 endpoints sont **prouvés POST-only** (405), mais **aucun corps n'a été
  observé**. Obtenir un corps exige d'émettre un `POST` — ce que le périmètre
  « lecture seule » interdit aujourd'hui. Trois voies, à choisir explicitement :
  1. **rester en lecture** : documenter les chemins et les effets attendus, sans
     jamais émettre d'écriture (le clone se fera sur **notre** backend, pas en
     rejouant les POST du client) ;
  2. **observer sans écrire** : rendre la UI jusqu'au dernier écran (formulaire
     rempli, bouton non cliqué) et relever les **schémas de validation côté
     client** (Zod) dans les bundles ;
  3. **écrire sur un compte de test** fourni par le client — décision humaine.
- **Contexte / Détails :** A1 a livré la matière du modèle ; A2 ne doit pas la
  contredire. Fichiers : `01_REA_Fidelix/Global/Fidelix_Serveur.md` §8 (mesures),
  `_captures/2026-10-27-a1/modele.json` (gitignoré, noms/types seulement).
- **Questions restantes, nées d'A1** (à trancher, pas à supposer) :
  - **`loyalty_programs` (309) et `reward_tiers` (81) sont lisibles avec la seule
    clé `anon`.** Public par conception (`/recompenses/<slug>`) ou RLS absente ?
    La mesure ne dit pas *pourquoi* ; à confirmer côté client.
  - **`automations` et `till_sessions` sont vides** pour ce compte : leurs
    colonnes resteront inconnues tant qu'une ligne n'existe pas (ou qu'un accès
    `service_role` n'est pas fourni). Ne pas les inventer.
  - **`customers` (42501)** : les fiches passent par le serveur Next. Le contrat
    exact de l'API interne (`/api/scan/cards`, RSC) reste à relever en A2.
  - **`/recompenses/[slug]`** est une route dynamique ; le slug `impetus-fqvw`
    est une **donnée**, pas un chemin.
- **Tranché le 2026-10-27 — ne pas rouvrir :**
  - **`/customers/<uuid>` n'est PAS un lien mort.** Clic réel → fiche rendue ;
    GET direct avec l'UUID réel → **200** (92 595 o, 21 liens) ; UUID nul et
    route inconnue → **404**. Le 404 de S3 qualifiait l'identifiant.
- **Corrigé et couvert par des tests — ne pas refaire :**
  - sonde de session = `SONDE_SESSION` (`/dashboard`), **pas** `/api/me` ;
  - `entetes(env, cookie)` transmet réellement le cookie du profil ;
  - garde n°3 : `/dashboard` doit répondre 200 **avant** la première écriture ;
  - rejet par cible (`refuses[]`) si la réponse mène à une **autre route** ;
  - refus **déclaré** (`refusAttendu`) ≠ échec ; seul l'imprévu alerte ;
  - empreinte = **contenu**, pas octets ; `variantes: N` pour archiver les formes ;
  - `--diag <chemin> --tirages 6` avant de figer une empreinte ;
  - découverte : auto-référence exclue, UUID → `:id`, assets/externe ignorés ;
  - **53 tests** hors ligne (`node --test tools/rea/tests/*.test.mjs`).

- **Problèmes rencontrés (Blockers) :**
  - **B-1 — CLOS (2026-10-26 00:15).** Le diagnostic « session absente » était
    **faux deux fois de suite**, non par négligence mais parce que l'outil ne
    pouvait pas dire autre chose : la sonde `/api/me` ne renvoie jamais 200, et
    le cookie du profil n'était jamais envoyé. Une session valide (2 cookies,
    expiration 2027) était donc rejetée avant écriture. Corrigé + testé.
    **Leçon de méthode** : un garde-fou qui se trompe toujours du même côté est
    indiscernable d'un blocage réel ; il faut mesurer l'outil autant que la
    cible. Même famille de défaut rencontrée trois fois en S3 (auto-référence de
    découverte, `--diag` à 2 tirages, refus = échec).
  - **B-2 — pas de compte admin.** `/admin` → `307 → /dashboard` avec ce
    compte : le module existe (il apparaît dans la sonde et dans la nav) mais le
    rôle ne suffit pas. La console admin reste **non capturée** — et ne sera pas
    inventée. Déblocage : un compte au rôle admin, par la même voie humaine.
  - **B-3 — caisse non appairée.** `/caisse` répond 200 mais c'est l'état
    **non appairé** (40 ko). L'état appairé exige une activation par code dans
    le dashboard → action humaine, et A4 (file hors ligne) en dépend.
  - **B-4 — CLOS (2026-10-28 02:20).** Ouvert sur deux fichiers à **0 octet**
    (`conversation.md`, `env.supabase.md`). Les deux sont désormais renseignés
    (**107 919 o** et **593 o**), et `git check-ignore FIDELIX/env.supabase.md`
    sort **0** (`.gitignore:73`). L'arbitrage d'architecture du volet 4 est donc
    **fait** (`Fidelix_Etat_Basal.md` §4), et l'état de la base **mesuré** (§3).
  - **B-5 — CLOS le 2026-10-28 (03:10).** La question était : clone
    **isofonctionnel** de Fidelix, ou **produit mono-commerce « QR + points »** ?
    La feuille de route R1→R5 décrivait le premier ; l'axe directeur énoncé, la
    base actuelle et les **deux** propositions écrites décrivaient le second.
    **Aucune mesure ne pouvait départager** — c'était une décision de produit.
    **Décision humaine : option A**, clone isofonctionnel nommé **`Fidelia`**.
    Conséquence : la cible redevient la référence, les **22 écarts** deviennent des
    exigences de parité, et la base actuelle (celle de `conversation.md`) est
    **incompatible** → la migration est due. Les garde-fous de R0 restent : rien
    de ce qui touche au schéma ne se fait **avant** les vérifications de R1.2.


## ⏭️ Prochaines Étapes (Backlog)

- [ ] **Exécuter `migrations/0011_fiche_etablissement.sql`** (humain, éditeur SQL
      du projet ; **inclus dans le collage unique ci-dessous** — cet item garde sa
      vérification propre) — sans elle, `/settings` affiche « migration à passer » avec le
      nom du fichier (`PGRST202`), et rien ne s'enregistre. **À vérifier après
      coup** : `select fiche_du_commerce();` doit rendre les quatorze clés, et un
      enregistrement depuis l'écran doit se relire à l'identique — y compris un
      champ **vidé** (il doit redevenir `null`, pas rester à l'ancienne valeur).
- [ ] **Exécuter `migrations/0012_plafond_clients.sql`** (humain, éditeur SQL du
      projet ; **inclus dans le collage unique ci-dessous**) — sans elle, le bandeau d'offre **ne s'affiche pas** (il ne ment pas
      en affichant « 0 / 30 ») et `/billing` nomme le fichier à passer. **À
      vérifier après coup** : `select plafond_clients();` doit rendre
      `{"clients": n, "limite": 30}` avec le `n` de `select count(*) from
      clients;`, et `/billing` doit afficher `n` sur la jauge.
- [ ] **P0-4b — le canal sortant : le vrai prérequis de P0-3b ET de P0-4.**
      *(Ouvert le 2026-11-02, après la mesure de P0-4.)* Les deux chantiers
      butent sur la même absence : **rien ne sort du système**. Pas de jeton
      push, pas de carte Wallet, pas de dépendance d'email, et `clients` ne
      porte que `id, first_name, last_name, email, created_at,
      designated_staff_id`. À trancher **une fois** : (a) web push navigateur
      (abonnement `PushSubscription` + clés VAPID + un émetteur), (b) export
      email payant par pack (P0-3c), ou (c) aucun canal — et alors `/notifications`
      et `/automations` restent des stubs honnêtes, ce qu'ils sont aujourd'hui.
      Détail, options et coûts : `docs/mesure-p0-4-messages-2026-11-02.md` §6.
- [ ] **P0-5 — Wallet : ⏸ MIS DE CÔTÉ le 2026-11-02 (décision humaine).** Rien
      n'est supprimé et rien n'est promis : `lib/google-wallet.mjs`,
      `api/wallet/google/[token]` et `0014` restent en place, `WALLET_ENABLED`
      éteint ⇒ la route répond `503 walletIndisponible` (mesuré). Reprise quand
      Apple devient nécessaire, ou quand la `loyaltyClass` Google sera créée dans
      le compte de service. Les deux entrées ci-dessous gardent leur contenu
      pour cette reprise — elles ne sont pas la tâche courante.

- [x] **P0-6 — `/branding` (Apparence) : LIVRÉ le 2026-11-02.** Mesure
      (`docs/mesure-p0-6-apparence-2026-11-02.md`), `0015` (non exécutée),
      `lib/apparence.mjs`, écran + aperçu vivant, `27` tests neufs. **Reste
      ouvert** : l'envoi de fichier (déclaré : aucune adresse d'image hébergée
      n'est fournie par le socle) et la section « 4 · Tampons par carte » →
      **P0-6b**, **close le 2026-11-02 par un refus** : ce socle ne compte que des
      points, aucune surface ne lit les trois réglages (détail en Tâches Terminées).

- [ ] **P0-5 — Wallet Apple/Google via PassKit Inc. (exploré le 2026-11-02, rien
      codé).** Compte créé, **essai 45 jours** — échéance à surveiller.
      Exploration complète : `docs/exploration-wallet-passkit-2026-11-02.md`.
      - **Coût réel [M]** : minimum **39,50 $US/mois** (~390 MAD) pour ≤ 250 pass,
        puis 0,045 $/pass. À 250 cartes, le Wallet consomme ~100 % du prix du
        produit (397 MAD) → **décision de positionnement avant l'échéance**, et
        cette décision est P0-3c (paiement), hors consigne actuelle.
      - **Voie retenue** : SaaS PassKit (supprime le compte Apple + le certificat
        `.p12`). La cible, elle, utilise la lib `passkit-generator` [M] — écart
        assumé, plan B documenté si l'abonnement est refusé.
      - **Quatre inconnues nommées, chacune levée par une sonde** (U1 code-barres,
        U2 URL de pass, U3 chemins REST, U4 délai de rafraîchissement). **U1 est
        la seule bloquante** : si le code-barres n'est pas `card_token`, `/scan`
        ne reconnaît plus la carte → parade déjà écrite : colonne
        `loyalty_cards.wallet_member_id` + `carte_par_code(p_code)` qui cherche
        token **puis** alias (même contrat que `carte_par_token`, `0003`).
      - **Ordre d'exécution** : (1) **sonde ÉCRITE** — `tools/rea/passkit.mjs` +
        `tools/rea/sonder-passkit.mjs` (10 tests) — **reste à l'exécuter** :
        `node --env-file=web/.env tools/rea/sonder-passkit.mjs` puis `--ecrire`,
        identifiants dans `.env`, jamais dans le chat ; (2) `0015_wallet.sql`
        (peut s'écrire sans la sonde) ; (3) `web/src/lib/wallet.mjs` (pur,
        réseau injecté) ; (4) `api/wallet/[token]/route.js` ; (5) branchement
        `join` + `/customers` ; (6) tests. **Drapeau `WALLET_ENABLED`** : sans
        identifiants, aucune route n'appelle le réseau, et le scan continue.
      - **Décision humaine restante** : où le client trouve son lien d'installation
        — recommandation : **adhésion + `/customers`** (les deux surfaces
        existent ; aucune route publique à rouvrir).
- [ ] **P0-5 — Google Wallet : la suite, dans cet ordre.**
      1. **Créer la `loyaltyClass`** une fois (`{issuerId}.fidelite`) : nom du
         programme, `issuerName`, `reviewStatus` — c'est elle que
         `construireObjet()` référence déjà (`identifiantClasse`). Sans elle,
         Google répond `CLASS_NOT_FOUND` au moment du clic.
      2. **Écrire l'objet et pousser le solde** : `insert` puis `patch` sur
         `walletobjects.googleapis.com` (OAuth par compte de service). C'est ce
         qui fait qu'un client voit ses points à jour après un scan ; aujourd'hui
         le JWT crée l'objet mais rien ne le met à jour ensuite.
      3. **Le bouton** « Ajouter à Google Wallet » sur les deux surfaces
         retenues (adhésion + `/customers`) — la route existe, aucun écran ne la
         lie encore.
      4. **`WALLET_ENABLED=true` + 4 clés** dans `web/.env.local` (jamais dans le
         chat), puis rejouer la vérification : le lien doit ouvrir Google Wallet.
      Détail et contrat vérifié : `docs/exploration-wallet-passkit-2026-11-02.md` §9.
- [ ] **Exécuter les huit migrations en attente — en un seul collage** (humain,
      éditeur SQL du projet ; mesurées absentes le 2026-11-03, sonde re-mesurée
      le soir : `PGRST202`, exit `2`).
      **Le collage est prêt et a déjà été exécuté** :
      `.profil-rea/ddl-0009-0016/fidelix-migrations-0009-0016.sql` (69 085
      octets, sha256 `e3a411d9…`, dossier ignoré par git). Les huit fichiers y
      sont dans l'ordre, **chacun sa transaction**, et **rejouables** : un échec
      en `0015` laisse `0009`→`0014` acquises.
      **Après le collage**, deux mesures, dans cet ordre :
      1. `fidelix-verif-migrations.sql` (même dossier) → attendu `OK` partout :
         13 fonctions avec les bons droits (`anon` **seulement** sur
         `caisses_publiques`), `messages_envoyes` et `operations_caisse` avec RLS,
         25 colonnes, 4 contraintes nommées. Si la sonde rend encore `PGRST202`
         alors que tout est `OK`, recharger le cache : `notify pgrst, 'reload schema';` ;
      2. `node tools/rea/verifier-idempotence-caisse.mjs --carte C-2C4718 --confirmer`
         → `REJEU ABSORBÉ` (même `transaction_id`, même `new_balance`,
         `idempotent: true` au second `POST`). Code de sortie 2 = `0016` toujours
         absente, 3 = aucun jeton d'écriture.
      **Ce que le collage ne prouve pas** : les corps `plpgsql` ne sont pas
      résolus à la création, donc les colonnes réelles et `award_loyalty_points`
      ne sont vérifiés qu'en base réelle (cf. Statut Actuel).
      **Conséquence actuelle, visible et honnête** : les écrans concernés
      affichent « migration à passer » (`PGRST202`) au lieu de mentir, et
      `POST /api/caisse/operation` répond `503` — la file **conserve**, rien
      n'est perdu, rien n'est crédité. `0006` (colonnes seules) n'est pas
      recensable par l'OpenAPI.
- [ ] **Exécuter `migrations/0013_messages.sql`** (humain, éditeur SQL du
      projet ; **inclus dans le collage unique ci-dessous**) — sans elle, `/notifications` affiche honnêtement « migration à
      passer » avec le nom du fichier (`PGRST202`), et le formulaire n'apparaît
      pas. **À vérifier après coup** : `select messages_du_commerce();` doit
      rendre `{"limite": 3, "aujourdhui": 0, "joignables": n, "messages": []}`,
      un message écrit doit apparaître dans `messages` avec `statut`
      `en_attente`, et un quatrième message le même jour doit être refusé
      (`QUOTA_ATTEINT`, jamais un quatrième insert).
- [ ] **P0-4 — `/notifications` LIVRÉ ; `/automations` et `/campaigns` restent.**
      - `/automations` : table `automations(type, is_active, config)` + les
        **quatre** cartes mesurées (`winback` 3–365 j, `near_reward` 1–20/100,
        `birthday` 0–30, `personnalisee` + 7 pastilles `L M M J V S D`), un
        interrupteur `role="switch"` par carte. **Mais** l'exécuteur quotidien et
        le canal n'existent pas, et « Anniversaire » exige une date de naissance
        que `clients` ne collecte pas : livrer les cartes sans l'exécuteur serait
        un interrupteur qui ne fait rien. À trancher avec P0-4b.
      - `/campaigns` : paywall mesuré (« Les campagnes demandent un pack »),
        dépend de P0-3c (paiement) — et le paiement est **hors consigne**.
      - Contrat complet : `docs/mesure-p0-4-messages-2026-11-02.md` §3–§4.

- [ ] **P0-3b — le verrou du plafond.** Il n'est **pas** posé (décision motivée :
      `docs/regle-comptage-30-2026-11-02.md` §5) : la cible ferme le **scan** du
      commerçant, alors qu'ici `join_loyalty_program` (`0003`) est le seul chemin
      d'inscription, et **aucun état payant** ne peut lever la limite. Poser le
      verrou aujourd'hui bloquerait le client au comptoir sans recours. Il faut
      d'abord : (a) un état d'abonnement (table + statut + moyen de paiement),
      (b) une décision produit sur le commerce à 30 clients qui ne peut pas payer.
      Les textes des états sont déjà mesurés et au dictionnaire (`offre.*`).
- [ ] **P0-3c — le reste de `/billing`.** Non rendu, faute de paiement :
      rythme (mensuel / 6 mois / 12 mois), « Activer — 397 MAD », prochain
      prélèvement, conditions du pack, packs d'emails (10 000 / 25 000 / 50 000 à
      200 / 400 / 700 MAD), points de vente supplémentaires, onglet « Données
      clients » (`/donnees-clients`, jamais capturé). Tout est mesuré dans
      `c02-billing.html` — rien à re-mesurer, tout à brancher sur un paiement.
- [ ] **P0-3 — `/billing` et le plafond de 30 clients — LIVRÉ PARTIELLEMENT
      (2026-11-02).** Le compteur, le bandeau, la page et les textes sont en
      place ; le verrou et le paiement restent ouverts (P0-3b / P0-3c). La règle
      de comptage était l'inconnue de départ, elle est levée et citée :
      `docs/regle-comptage-30-2026-11-02.md`.

- [ ] **Exécuter `migrations/0010_reglages_programme.sql`** (humain, éditeur SQL
      du projet ; **inclus dans le collage unique ci-dessous**) — sans elle, `/program` affiche honnêtement « migration à
      passer » avec le nom du fichier (`PGRST202`), et rien ne s'enregistre.
      **À vérifier après coup** : `select reglages_du_programme();` doit rendre
      les neuf clés, et un enregistrement depuis l'écran doit se relire à
      l'identique. Aucun redéploiement n'est nécessaire (le repli est déjà dans
      l'image) ; `0011` ou plus tard si les colonnes révèlent un manque.
- [ ] **Observer `/program` en authentifié, une fois** — la seule chose que la
      passe P0-1 n'a pas vue. Le conteneur local lit un autre projet Supabase que
      la session du profil REA (`sevqegfhmdezsqwvwsam` contre
      `rozagopjfkkblyxtjdgw`), donc `/program` répond `307 → /login`. Une fois
      `0010` passée et une session ouverte sur le bon projet, vérifier à l'écran
      : deux onglets, sept contrôles, l'exemple recalculé après enregistrement.

- [ ] **Exécuter `migrations/0009_caisses_publiques.sql`** (humain, éditeur SQL du
      projet ; **inclus dans le collage unique ci-dessous**) — **la seule chose qui manque** pour que le choix de la caisse
      apparaisse en production. Mesuré sur la base après redéploiement :
      `PGRST202` sur `caisses_publiques`, donc la page d'adhésion n'affiche pas
      le champ (elle n'échoue pas : le repli est dans l'image, et l'inscription
      aboutit sans désignation). Aucun redéploiement n'est nécessaire après
      l'exécution — seule la lecture publique change, pas le code.
      **À vérifier après coup** : `select * from caisses_publiques('<slug>')`
      doit rendre au moins une caisse (sinon c'est `staff` qui est vide, et le
      champ restera absent — ce qui est correct, mais se dit).


### 🔗 Dettes nommées par R3 — 2026-10-31

- [x] **Exécuter `0001`, `0003`, `0004` — FAIT, et la measure contredit le
      relais.** Mesuré le 2026-10-31 (soir) sur `sevqegfhmdezsqwvwsam` : les
      **huit** fonctions existent, `award_loyalty_points` et
      `redeem_loyalty_reward` portent `search_path=public`,
      `has_function_privilege('anon','cartes_du_commerce()')` = **false** et
      `authenticated` = **true** — signature exacte de `0004`. `0005` est
      appliquée dans la même foulée ; les cinq tables sont sous RLS avec **0**
      politique. La dette « le chemin est en place, la pièce manque » est
      **fermée**.
- [ ] **`/caisses` (Équipe) — le modèle (0006), la lecture (0007) et l'écran
      sont faits ; deux dettes nommées restent.** L'écran est mesuré
      (`2026-10-26-auth/rendu/a09-caisses.html`) : `h1` « Équipe », les deux
      portées, `h3` « Classement de l'équipe », colonnes « # | Caissier |
      Cartes | Scans | points | CA | Avis », « Caisses actives ».
      - [x] **Le modèle** (`0006`) : `public.staff` (RLS activée, 0 politique,
        0 droit pour `anon`/`authenticated`), `clients.designated_staff_id`
        (`FK ON DELETE SET NULL`), rattachement de
        `loyalty_transactions.staff_id` (`ON DELETE RESTRICT`).
      - [x] **Le chemin d'écriture de la désignation** (`0007`) :
        `join_loyalty_program(p_slug, p_staff_id)` écrit la colonne dans le
        même `insert` que le client, refuse une caisse inconnue
        (`STAFF_NOT_FOUND`) **avant** d'écrire, et la surcharge à un argument
        est **retirée** (`drop … if exists`) pour qu'un appel `{ p_slug }` ne
        devienne pas ambigu.
      - [x] **`equipe_du_commerce()`** (`0007`) : `periode` (`cle`, `debut`,
        `fin`, `jour`, `fuseau`), `devise`, `lignes` (titulaire **inclus**,
        `actif` rendu), `absences: ["avis"]`. « Cartes » = **clients ayant
        désigné** ; « Scans » = `loyalty_transactions` ; « CA » =
        `sum(amount_spent)` ; « points » = `sum(points_awarded)` ; « Avis » =
        `null` déclaré.
      - [x] **L'écran** `/caisses` *(fait le 2026-11-01)* : `web/src/app/(dashboard)/caisses/page.jsx`
        + `web/src/lib/equipe.mjs` (logique pure) + `donnees.equipeDuCommerce`.
        Deux portées qui filtrent la liste des caisses (« Caisses employé » /
        « Responsables », les deux seules valeurs de `staff.role`), le titulaire
        en ligne nulle (`staff_id IS NULL`, nom « Titulaire » + pastille
        « Vous »), « Caisses actives », les quatre périodes **en liens**
        (`?periode=…&portee=…`), la fenêtre **appliquée** rendue par la
        fonction, et cinq états distincts. 15 tests (`caisses-lecture.test.mjs`),
        mutations M85→M90, `docs/design-system.md` §3.
        **Non rendu, et déclaré** : le drill-down des lignes (aucune RPC par
        caisse) et le formulaire « Nouvelle caisse » (aucune écriture de
        `staff`) — la phrase qui explique remplace le geste absent.
      - [x] **Le choix de la caisse sur `/join/<slug>`** *(fermée le 2026-11-01)* —
        la dette **nommée** de `0007`. **Mesurée avant d'être écrite**, et la
        mesure a tranché : la cible le propose (`p17-join.html`,
        `id="qui-vous-a-servi"`, six prénoms rendus à une page **sans session** ;
        son chunk dit la sémantique — `aria-pressed`, sélection unique,
        **défaisable**, rendu conditionné à `A.length>0`).
        Livré : `migrations/0009_caisses_publiques.sql` (`id` + `prenom`, caisses
        actives, ordre total, `anon` autorisé — seule différence avec `0007`, qui
        porte le CA) ; `web/src/lib/adhesion.mjs` (module pur) ;
        `components/adhesion/ChoixCaisse.jsx` (groupe mesuré, champ caché) ;
        `donnees.caissesPubliques` + `rejoindre(slug, caisse)` (`p_staff_id`
        seulement s'il y a une caisse) ; `CODES_CONNUS` reçoit
        `STAFF_NOT_FOUND` (ce refus tombait en « la base ne répond pas ») ;
        `actions.js` relit la liste, valide la caisse, rejoue **une fois** sans
        désignation si la caisse a disparu, et **dit** la perte
        (`?sansDesignation=1`). 30 tests (21 + 9), mutations M91→M103,
        `docs/design-system.md` §3.
        **Non rendu, et déclaré** : sans JavaScript le groupe est **inerte** (la
        carte se fait sans désignation, comme avant) ; l'anniversaire et la case
        « conditions » de la capture ne sont **pas** repris — le socle promet
        « aucune donnée personnelle » et ne stocke rien pour les honorer.

      - [ ] **Le formulaire « Nouvelle caisse »** : aucune fonction d'écriture de
        `staff` n'existe. À écrire avec son écran, pas avant — l'écran dit
        aujourd'hui pourquoi (`page.equipe.formulaireAbsent`).
      - [ ] **Le drill-down d'une ligne** : la cible ouvre « les opérations »
        d'une caisse (`role="button"`, `aria-label="Voir les opérations de …"`).
        Il faut une RPC par caisse (`operations_du_staff()`), pas encore écrite ;
        en attendant, ni la ligne cliquable ni la phrase ne sont affichées.
      Ne pas afficher « Cartes » = nombre de cartes distinctes : ce serait un
      autre chiffre sous le même mot (mesuré : 2 désignés pour 4 cartes).
- [ ] **`/notifications` — CAPTURÉ, et mesuré (2026-11-02, P0-4).** L'ancienne
      entrée disait « rien à mesurer » : elle reposait sur le seul payload RSC
      `2026-10-27-auth-s3/raw/pages/a20-notifications.html`. Le **DOM rendu**
      existe depuis A7b — `2026-11-02-a7b/rendu/d01-notifications.html` (200,
      79 946 o) — et porte le formulaire, le quota 3/jour et l'historique. Le
      contrat complet (bornes, `POST /api/notifications`, statuts, colonnes lues
      à l'usage) est dans `docs/mesure-p0-4-messages-2026-11-02.md` §2. **Ce qui
      manque n'est pas la mesure, c'est le canal** : aucun client joignable, donc
      « 0 destinataire » serait le seul chiffre possible. Ne reprendre cet écran
      qu'après la décision d'architecture de P0-4b (canal sortant).

- [x] **Fusionner `0001` et `0002` — FAIT le 2026-10-31** : le fichier unique est
      `migrations/0001_acl_rls_durcissement.sql` (`0002_r2_execute_rpc.sql` est
      supprimée). Modèle conservé — `REVOKE … FROM PUBLIC`, puis `REVOKE` des
      rôles fermés, puis `GRANT` **par rôle** — et l'état final est explicite :
      `award_loyalty_points` et `redeem_loyalty_reward` sont accordées à `anon`,
      `authenticated` et `service_role`, `PUBLIC` n'a plus rien. `carte_par_token`
      reste hors de ce fichier et **jamais** accordée à `anon` (c'est `0003` qui
      la crée et la réserve). Le nom perd le suffixe `r1_2` : il ne décrivait plus
      le contenu, qui porte aussi la correction mesurée de R2. Le préfixe `0001`
      est conservé — c'est le fichier que l'humain exécute. Trois gardes neufs
      dans `durcissement.test.mjs` : `0002` ne doit pas réapparaître, le dernier
      verbe sur `anon`/`authenticated`/`service_role` doit être `GRANT`, sur
      `PUBLIC` `REVOKE`.
- [x] **Exécuter `0001`, `0003` puis `0004`** (humain, éditeur SQL du projet) —
      **fait depuis** : voir l'entrée « FAIT, et la mesure contredit le relais »
      ci-dessus. L'état décrit ici était celui du 2026-10-31 à 02:10 (`PGRST202`
      sur les deux lectures, `P0001` sur `award`/`redeem`) ; il ne l'est plus.
- [x] **`/recompenses/<slug>`** *(fait le 2026-10-31)* — vitrine publique des
      paliers, servie par `programme_public` (déjà accordée à `anon`), **sans
      nouvelle RPC** ; `vitrine.test.mjs` (8 tests) garde les cinq fautes
      silencieuses, et `i18n-ui` sait désormais confronter un `href` dynamique à
      une route `[slug]` du disque.
- [x] **Caméra du scanner** *(fait le 2026-10-31)* : `BarcodeDetector` branché
      dans `components/scan/CameraScanner.jsx`, contrat pur dans `lib/camera.mjs`,
      neuf tests dans `scan-camera.test.mjs`. La RPC n'a pas bougé : la caméra
      **navigue** vers `/scan?code=…`, donc la page relit la carte par le même
      chemin que la saisie manuelle. **Reste à mesurer sur un vrai appareil** :
      le rendu de l'aperçu (le design system ne mesure pas le rendu), et le
      comportement iOS Safari — `BarcodeDetector` n'y existe pas, l'écran tombe
      donc sur `nonSupporte` et la saisie manuelle, ce qui est le comportement
      voulu mais **non observé**.
- [x] **Liste des clients** *(fermée le 2026-10-31)* : `/customers` lit
      `cartes_du_commerce()` (`0004`), avec la projection **mesurée** sur
      `a17-customers.html`. `clients` reste sous RLS sans politique : la lecture
      passe par la fonction, jamais par un `GRANT`. Limite assumée, écrite dans
      l'en-tête de `0004` : le socle est **mono-commerce**, donc `authenticated`
      y vaut « un compte du commerce » ; la cible, elle, filtre par
      `restaurants.user_id` (RLS mesurée : session = 1 ligne, anon = 0).
- [x] **`marque.domaine`** *(fermée le 2026-11-08)* : `fideliatest.site`, le
      domaine réellement détenu (zone OVH, NS `dns103.ovh.net`). Le QR n'en
      dépend pas — il utilise `NEXT_PUBLIC_SITE_URL` ou l'hôte de la requête —
      et c'est précisément pour cela qu'un changement de domaine ne réimprime
      aucune affiche. Garde : `domaine-public.test.mjs` compare la valeur du
      dictionnaire au `domains[0]` d'`openship.json`.

### 🧱 Dettes nommées par R1 (2/2) — 2026-10-30

- [ ] **`REFERENCE_CNDP`** : `cndp-2026-10` est **repris de la cible** (c'est sa
      déclaration, pas la nôtre). À arbitrer avant la première mise en
      production — sinon le formulaire d'inscription affirme une conformité qu'on
      n'a pas déposée. **Décision humaine, pas technique.**
      *(`marque.domaine`, l'autre moitié de cette dette, est tranchée depuis le
      2026-11-08 : `fideliatest.site`.)*
- [x] **`/auth/confirm`** *(fait le 2026-10-31)* — les trois valeurs
      `?echec=` ont un producteur, `signUp` envoie `emailRedirectTo`, et le
      couplage est testé (`tools/rea/tests/confirmation.test.mjs`).
- [ ] **Allow-list Supabase « Redirect URLs »** (configuration, pas code) :
      `emailRedirectTo` n'est **honoré** que si l'origine envoyée y figure
      (local + domaine de production). Sinon GoTrue retombe silencieusement sur
      l'URL de site du projet : le formulaire fonctionne, mais le lien n'arrive
      pas sur `/auth/confirm` et les trois messages ne sont jamais vus.
      **Valeurs exactes, maintenant que le domaine est fixé :** *Site URL* =
      `https://fideliatest.site` ; *Redirect URLs* = `https://fideliatest.site/**`.
- [x] **`?etat=configuration` n'est lu par personne** *(fermé le 2026-10-31)*.
      `/dashboard` redirige vers `/login?etat=configuration` quand Supabase n'est
      pas configuré, et aucune page ne lisait ce paramètre — un redirect vers un
      message que personne n'affichait. Même famille que le `?echec=` d'avant.
      Fermé par `lib/connexion.mjs` (`messageEtat`), `login/page.jsx`
      (`searchParams` serveur) et un bandeau `role="status"` dans
      `FormulaireConnexion.jsx` ; le couplage est **lu** par
      `etat-connexion.test.mjs`, qui extrait le littéral de la garde au lieu de
      partager une constante avec elle.
- [x] **`?etat=configuration` sur `/scan` et `/caisse` — deux producteurs sans
      consommateur** *(fermé le 2026-10-31)*. `scan/actions.js:38` et
      `caisse/actions.js:46` redirigeaient vers `&etat=configuration` quand
      `clientServeur()` lève, et aucune des deux pages ne testait cette valeur :
      l'écran retombait sur un état vide normal, comme si rien n'avait été tenté.
      Fermé par une clé **propre** (`tableau.etat.configuration` — le geste n'a
      rien écrit ; ni `migrationTexte`, cause fausse, ni la copie de `/login`,
      autre moment) et un bandeau `role="alert"` sur les deux pages. Le couplage
      est **lu** par `etat-action.test.mjs` (5 tests, 6 mutations vérifiées) :
      chaque valeur d'`?etat=` écrite par un `actions.js` doit avoir sa branche
      dans la page qui la reçoit.
- [x] **Garde générique « tout `?etat=` produit a un rendu »** *(fermée le
      2026-10-31)*. `etat-action.test.mjs` balaie les 8 `actions.js` du dépôt
      (couverture **prouvée** : les 8 chemins, les 4 producteurs, les valeurs
      témoins), résout la page **par l'URL** de la redirection et non par le
      dossier (§27.5), et lit les trois syntaxes : littéral, gabarit à ternaire
      et identifiant `?etat=${etat}` résolu par sa déclaration. Les comparaisons
      sont retirées avant l'extraction (`=== 'carteInconnue'` est une entrée,
      §27.3) et un gabarit qui ne rend aucune valeur **échoue** au lieu de passer
      sur un ensemble vide. **Le balayage a trouvé un trou réel** :
      `rewards/actions.js:57` → `?etat=migration`, sans branche dans
      `rewards/page.jsx` ; fermé par `MESSAGES_ERREUR.migration` (la phrase du
      bloc bloqué, une cause = une phrase) et `role="alert"`. Dix mutations
      vérifiées (témoin d'application lu avant le résultat, §27.4). Le test de
      `/login` (`etat-connexion.test.mjs`) garde sa forme propre : son producteur
      est `dashboard/layout.jsx`, pas un `actions.js`, et il compare balayage
      large et balayage étroit sur ce seul fichier.
- [x] **Écran « nouveau mot de passe »** *(fermé le 2026-10-31)*. `type=recovery`
      était refusé (`?echec=invalide`) parce que le socle n'avait nulle part où
      poser le nouveau mot de passe. Fermé en **complétant le consommateur**
      (§28.5), pas en effaçant la valeur : la page existe
      (`(auth)/nouveau-mot-de-passe/page.jsx`, son action et son formulaire),
      `TYPES_CONFIRMATION` accepte `recovery`, et `resetPasswordForEmail` envoie
      enfin un `redirectTo` **marqué** (`?flux=recuperation`) — sans lui, le
      `?code=` atterrissait sur `/` et personne ne l'échangeait.
      Le couplage est **lu**, jamais partagé : `confirmation.test.mjs` fait
      l'aller-retour URL → lecture → destination → page **du disque**, et
      `nouveau-mot-de-passe.test.mjs` lit les valeurs d'`?etat=` chez le
      producteur pour les chercher chez le consommateur (ensemble vide =
      échec, §28.2) puis compare les noms de champs envoyés aux noms lus.
      Quinze mutations détectées (témoin lu avant le résultat, §27.4).
- [ ] **`/conditions`, `/confidentialite`** : absentes du scrape. Le
      consentement s'affiche donc **sans lien** — décision déclarée dans
      `docs/design-system.md` §3, à lever quand les pages existeront.
- [ ] **`.shadow-hard*`** (dont `shadow-hard-coral`, l'ombre du bouton de la
      cible) : toujours au backlog. Le bouton primaire est en `bg-ink` sans
      ombre (contraste AA ; cf. §3 du design system).
- [ ] **Non repris de l'inscription mesurée** : indicateur d'étapes
      « Tes infos / La vidéo / Ton compte », pixel Meta (`?depuis=pub`),
      `localStorage['fidelix_prospect']`, contrôle
      `api.pwnedpasswords.com`. Pistage et appel à un tiers : décisions de vie
      privée.
- [ ] **Géométrie RTL** : `dir="rtl"` se propage (vérifié au navigateur) mais le
      miroir des marges `pl-*`/`pr-*` n'est pas traité — les composants n'en
      utilisent pas encore. À vérifier à la première page qui en posera.

### 🧱 Dettes nommées par R2 (2026-10-31)

- [ ] **20 échecs de suite pré-existants (mesurés, hors périmètre R2).** Sur 362
      tests, **342 passent** et **20 échouent** ; aucun des huit fichiers
      concernés (`basal-knowledge`, `wallet`, `fidelia`, `caisse`, `session`,
      `contrats`, `base`, `durcissement`) n'importe un module touché par R2 —
      vérifié par `grep`. Causes observées : `basal-knowledge.md` ne contient
      **aucune** des marques `**[M]**` / `**[D]**` / `**[G]**` attendues (fichier
      inchangé depuis le 2026-10-28), et les constantes R0 ne correspondent plus
      à `sonde-base.json`. **Non corrigés ici** : les réparer demanderait de
      réécrire le document de référence ou les constantes, ce qui n'est pas R2.
      À traiter avant de se fier à « la suite est verte ».
- [x] **La première RPC de lecture existe (2026-10-31)** — `cartes_du_commerce()`
      (`migrations/0004_lecture_cartes.sql`), née avec `REVOKE … FROM public,
      anon, authenticated` puis `GRANT` à `authenticated` + `service_role`,
      **sans** ouvrir les tables (0 politique, 0 `GRANT` de table — mesuré par
      `has_table_privilege`). Ce qui restait de la dette : `Messages`,
      `Avis Google`, `Équipe` et `Apparence` gardent un état vide explicite, et
      **chacune** demandera sa propre lecture. `Programme` et `QR Code` lisent
      déjà par `programme_du_commerce` : ce qui leur manque n'est pas une lecture
      mais une donnée (aucun programme en base).
- [x] **Ordre d'application 0001 / 0002 — RÉSOLU le 2026-10-31 par fusion.** 0001
      retirait `EXECUTE` à `anon`/`authenticated` et ne rendait le droit qu'à
      `service_role` ; 0002 le rendait à `anon` (mesuré) et `authenticated`
      (déclaré). Appliquer **0002 puis 0001** cassait l'application. Les deux
      fichiers sont désormais un seul : `migrations/0001_acl_rls_durcissement.sql`,
      qui révoque PUBLIC puis accorde aux trois rôles qui servent. `0002` est
      supprimée ; aucun ordre ne peut plus casser l'écriture.
- [ ] **Arabe suspendu — `/ar` lève sur les pages R2.** Décision du 2026-10-31
      (« on ne travaille que sur la version FR »). La dette est **bornée** par
      `i18n.test.mjs` (67 clés déclarées manquantes, aucun orphelin, aucun écart
      hors périmètre). Tant qu'elle court, `traduire()` lève sur ces clés : ce
      n'est pas une dégradation d'affichage, c'est une erreur.
- [x] **`next build` « impossible » — c'était faux (corrigé le 2026-10-31).**
      La dette disait que la CLI Next « sort sans rien faire » sous Electron
      43.8.3 ; la cause réelle est que **`npx` n'existe pas** dans ce `PATH`
      (`zsh: command not found: npx`). En appelant le binaire directement —
      `node node_modules/next/dist/bin/next build` — le build **tourne** :
      `Compiled successfully in 96s`, 0 avertissement, 18 pages générées,
      `/nouveau-mot-de-passe` et `/auth/confirm` présents dans la table des
      routes. Le contrôle statique des imports reste utile (il est plus rapide),
      mais il ne doit plus être présenté comme un substitut obligé.
      *Leçon* : un outil « impossible à lancer » doit être rejoué avant d'être
      cité comme une limite — c'est le §19.3 appliqué à une contrainte.

### 🧱 Dettes nommées par l'écran « nouveau mot de passe » (2026-10-31)

- [x] **Les libellés de champ sont mesurés (2026-10-31).** Ils étaient écrits,
  puis empruntés à l'inscription (« Mot de passe »). Or la cible **a** un
  formulaire de mot de passe capturé — la page Réglages, chunk
  `…settings_page-….js` — qui porte « Nouveau mot de passe » et « Confirmer le
  nouveau mot de passe ». Les deux clés sont désormais `auth.nouveau.champMotDePasse`
  et `auth.nouveau.champConfirmation`, et `copie-mesuree.test.mjs` les confronte
  au chunk (témoin lu avant la comparaison). Restent **écrits** : le titre
  (`NOUVEAU` / `MOT DE PASSE`), le sous-titre et la phrase d'échec de session —
  la cible n'expose aucune route de récupération capturable. Déclaré dans
  `docs/design-system.md` §3.
- [ ] **L'allow-list « Redirect URLs » du projet doit accepter l'URL *avec* sa
  requête.** On envoie `…/auth/confirm?flux=recuperation` ; GoTrue y ajoute son
  `code` sans effacer la requête (c'est ce que fait déjà le gabarit mesuré de la
  cible, `?next=…`). Si la console du projet n'accepte que le chemin nu,
  Supabase retombe sur l'URL de site : lien valide, **marqueur perdu**, donc
  retour au tableau de bord au lieu de l'écran de saisie. Réglage de console,
  pas de code — à vérifier au premier envoi réel.
  **Mesuré le 2026-10-31 : cette vérification est impossible depuis le dépôt.**
  Trois `POST /auth/v1/recover` avec la clé publique rendent **`200 {}`** —
  origine inconnue (`https://exemple-inconnu.invalid/…`), `localhost` **avec**
  `?flux=recuperation`, et **sans** `redirect_to` : l'endpoint ne distingue ni
  une origine autorisée d'une autre, ni l'absence de `redirect_to`. Et
  `select … from auth.instances` rend **0 ligne** : la configuration GoTrue n'est
  plus en base, elle vit côté plateforme. Conclusion : la dette **reste
  ouverte**, et la seule preuve possible est un courriel réel ou la console.
- [ ] **Le chemin de succès du flux n'est pas mesuré de bout en bout.** La
  destination (`destinationSucces`) est prouvée par le module, l'aller-retour
  d'URL et quinze mutations — pas par un échange de jeton réel : il faudrait une
  boîte mail et un jeton vivant. Ce qui **est** mesuré sur `next start` : les
  deux chemins d'échec (307 vers `?echec=expire` / `?echec=appareil`) et le
  rendu des deux états de l'écran.

### Reste de R1


### 🔓 Déblocage (priorité 1) — ✅ fait
- [x] **S1 — Session** : obtenue par action humaine
  (`ouvrir-session.mjs --attendre 1800`, lancé par `launchctl` car le harnais
  tue les processus détachés d'un terminal à l'autre). Vérifiée par préflight :
  `auth présente` + **`VERDICT : session ACTIVE` (exit 0)**.
- [x] **S2 — Passe 2 authentifiée** : `_captures/2026-10-26-auth/` —
  13 pages HTTP (11 en 200, 2 en 404) + 20 sondes + 13 rendus, **0 erreur**.
  **Tranché** : `/account` 404, `/abonnement` 404, `/loyalty` 404 (réfutées).
- [x] **S3 — Découverte de sous-routes** : `tools/rea/decouvrir-cibles.mjs`
  (href HTML + RSC échappés + XHR, agrégés par motif, auto-référence exclue).
  Relevé : `_captures/decouverte-2026-10-26-auth.json` — 13 rendus → **25 cibles,
  10 nouvelles**. Manifeste `_captures/cibles-auth-s3.json` (24 pages + 21 sondes,
  3 réfutations conservées). Passe écrite : `_captures/2026-10-27-auth-s3/`
  (**21/42 en 200, 67/67 assets, 0 erreur, 3 refus conformes**), `--verifier`
  **109/109 STABLE**.
- [x] **A1 — Modèle de données** *(fait le 2026-10-27)* : 8 tables interrogées en
  **GET seul**, colonnes réellement renvoyées, relations par *embedding*,
  `GRANT` distingué de `RLS`, `rewards` réfutée, `customers` non lisible.
  Détail : `01_REA_Fidelix/Global/Fidelix_Serveur.md` §8.

### 🔬 Analyse (priorité 2)
- [x] **A1 — Modèle de données** : **mesuré** — `loyalty_programs` 23 col./309
  lignes, `restaurants` 34/1, `transactions` 16/1, `reward_tiers` 10/81 ;
  `automations` et `till_sessions` vides (colonnes inconnues, non inventées) ;
  `customers` **42501** ; `rewards` **PGRST205**. RPC : existence prouvée par
  les POST observés, **signature inconnue**.
- [x] **A2 — Contrats d'écriture** *(fait le 2026-10-27, **0 POST émis*)* :
  28 endpoints POST lus dans les bundles (11 recoupent les 12 × 405, **17
  nouveaux**) ; 19 corps lisibles ; 5 schémas zod client ; genre de preuve
  conservé par endpoint. Détail : `01_REA_Fidelix/Global/Fidelix_API_Contrats.md`.

- [x] **A3 — Wallet** *(fait le 2026-10-27, **0 écriture**)* : contrat des pass
  **trouvé**, et il n'était pas dans le dashboard. `walletEnabled` et
  `googleWalletEnabled` viennent du serveur ; les routes sont
  `/api/wallet/apple/<cardId>` et `/api/wallet/google/<cardId>` (**GET**, en
  navigation) plus `/api/wallet/apple/<cardId>/statut` (`{ajoutee}`). La **page
  publique** `/card/<cardId>` est le point d'entrée. Détail :
  `01_REA_Fidelix/Global/Fidelix_API_Contrats.md` §5.4.
- [x] **A4 — Hors ligne** *(fait le 2026-10-27, **0 requête**)* : file IndexedDB
  `fidelix-caisse` v2 → magasin `file_attente`, FIFO par `cree_le`, rejeu toutes
  les 65 s vers `POST /api/transaction`, `client_operation_id` = id de l'élément
  de file. Cache de cartes `cartes` (catalogue entier) pour « Solde au dernier
  passage ». Détail : `01_REA_Fidelix/Global/Fidelix_Caisse.md`.
- [x] **A5 — Fidelia AI** *(fait le 2026-10-28, **0 requête**)* :
  `/api/fidelia` et `/api/fidelia?resume=1` — **aucun prompt client** (0/11
  marqueurs), **aucune entrée** (GET nu), grille de **10 questions** rendue
  localement, **12 garde-fous**. Détail :
  `01_REA_Fidelix/Global/Fidelix_Fidelia.md`.

### 🏗️ Reconstruction (priorité 3 — après A1→A5)
- [x] **R0 — État basal** *(fait le 2026-10-28)*. Livrable :
  `01_REA_Fidelix/Global/Fidelix_Etat_Basal.md`. Corpus inventorié (A1→A5),
  tri fondation/contexte/inconnu, base de reconstruction **sondée**
  (`tools/rea/sonder-base.mjs`), axe « QR + points » arbitré →
  **22 écarts** (10 bloquants). **B-4 clos.**
- [x] **✅ D-1 — TRANCHÉE (2026-10-28, 03:10) : option A**, clone isofonctionnel
  nommé **`Fidelia`**. La cible redevient la référence ; les 22 écarts deviennent
  des exigences de parité. **B-5 clos.** Conséquence : la base actuelle est celle
  de `conversation.md` → **la migration est due**, mais **pas avant R1.2**
  (`EXECUTE` de `anon`, RLS réelle).
- [x] **`basal-knowledge.md`** — boîte à outils d'implémentation (714 l., 14
  sections) : Wallet, scan caméra, QR, temps réel, hors ligne, persistance,
  sécurité, PWA, design, i18n. Trois régimes de preuve **[M]/[D]/[G]**.
- [ ] **R1 — Socle** : Next.js + Supabase + design system « verre » (tokens
  `--vitre-*` / `--verre-*` capturés) + i18n FR/EN/AR. **Prochaine tâche.**
  D-1 est tranchée : R1 peut créer son propre schéma applicatif, mais **ne
  réutilise pas** la migration R1.2 comme socle (elle ne durcit que les 3 tables
  existantes, qui ne sont pas le modèle de la cible).
- [x] **R1.2 — durcissement ACL/RLS** *(fait le 2026-10-29, **DDL non exécuté**)* :
  `migrations/0001_acl_rls_durcissement.sql` *(ex-`0001_r1_2_…`, fusionné avec
  `0002` le 2026-10-31)* + `tools/rea/verifier-durcissement.mjs` (**CONFORME**,
  exit 0) + 26 tests gardant le fichier (23 à l'origine, 3 ajoutés par la fusion).
  Réponse aux deux questions bloquantes : (a) `anon` lit bel et bien les 3 tables
  (`verdict: "lisible"`) ; son `EXECUTE` sur les RPC, **non mesuré alors**, fut
  révoqué « par précaution » — la sonde du 2026-10-31 a prouvé que c'était une
  régression, d'où le re-grant à `anon` et `authenticated` ; (b) l'état RLS reste
  **`non_mesure`** (tables vides ⇒ indiscernable), mais l'activer est
  idempotent et sans effet mesurable sur les clients.
- [ ] **R2 — POS `/caisse`** : PWA séparée, scan, tampon/points, file hors ligne.
- [ ] **R3 — Dashboard** : 12 modules, parité fonctionnelle puis pixel.
- [ ] **R4 — Public** : marketing, `/recompenses/<slug>`, `/join/<slug>`,
  `/rendez-vous`, `/demarrer`, `/register`.
- [ ] **R5 — Recette** : rejouer les 22 routes, captures comparées à la référence.

### 🚀 Mise en ligne — `fideliatest.site` (ouverte le 2026-11-08)

- [x] **Origine publique fixée et testée** *(2026-11-08)*. `openship.json`
      (`rootDirectory: web`, `runtime: docker`, `port: 3000`,
      `domains: [fideliatest.site]`, `env.NEXT_PUBLIC_SITE_URL`),
      `docker-compose.yml` (transmission à l'exécution), `web/.env.example`,
      dictionnaire (`marque.domaine`), **7 gardes** dans
      `tools/rea/tests/domaine-public.test.mjs`. Suite **835 / 0 échec**.
      **Prouvé dans l'image aussi** : `docker compose build --pull --no-cache
      web` puis `up -d --force-recreate`, conteneur `healthy`,
      `printenv NEXT_PUBLIC_SITE_URL` → `https://fideliatest.site`,
      `/login` **200**, `/join/<slug>` **404** (slug inconnu → `notFound`,
      comportement voulu), `/qrcode` **307** vers `/login` (non authentifié).
- [x] **Dépôt source poussé** *(2026-11-08, nuit)* — `DEVSFAME/FIDELIA` est un
      dépôt **public** ; `main` = `e0797e5` (`2982a3c` puis la correction de
      build). Clonage vérifié sans credentials.
- [x] **Projet OpenShip branché sur git et déployé** *(2026-11-08, nuit)* —
      `dep_ZwYL8YrkDpPSTat8`, `ready`, conteneur healthy (`127.0.0.1:20000->3000`),
      `activeVersion: 1`, `productionMode: host` honoré (`workloadType: web`).
- [x] **Déploiement OpenShip — DNS et certificat faits** *(2026-11-08, soir)*.
      `A @` et `A www` → `141.253.120.188` (lu sur l'autoritaire
      `ns103.ovh.net`). Il fallait d'abord **supprimer la redirection OVH** —
      signature TXT `"1|www.fideliatest.site"` — qui réécrivait l'`A` vers le
      parking. `POST /api/domains/dom_4EPqj1mjGXl2o-s3/verify` → **200**
      `{"verified":true,"recordVerified":true,"cnameVerified":true,
      "txtVerified":true,"message":"Domain verified — certificate issued.",
      "sslStatus":"active"}`. Certificat mesuré au `openssl s_client` :
      `subject=CN=fideliatest.site`, `issuer=Let's Encrypt YE1`,
      `notBefore=Nov 8 17:48:07 2026 GMT` → `notAfter=Feb 6 17:48:06 2027 GMT`.
      **Preuves publiques** : `https://fideliatest.site/login` **200** avec
      `ssl_verify_result=0` ; `/join/<slug inconnu>` **404** (`notFound` voulu :
      la RPC `programme_public` répond bien côté serveur). *Note : le résolveur
      macOS gardait `213.186.33.5` en cache — les mesures passent par
      `curl --resolve`, pas par le cache local.*
      **`www` NON couvert** (`ssl_verify_result=18`, certificat auto-signé) :
      le certificat ne porte que `CN=fideliatest.site`, et `www` conserve un `A`
      résiduel vers `213.186.33.5`. À corriger : retirer ce `A`, puis déclarer
      `www` comme domaine OpenShip (ou `redirectTo`).
      **État de la base du projet déployé** (`sevqegfhmdezsqwvwsam`) : un
      programme **actif existe** — `caisses_publiques(null)` → `200
      {"caisses":[]}` alors que `caisses_publiques("zzz-bidon-zzz")` → `400
      PROGRAM_NOT_FOUND` (contrôle) — mais **aucune caisse active**, et **aucun**
      des 30 slugs plausibles testés ne correspond. `anon` n'a pas de `SELECT`
      sur `loyalty_programs` (401 `42501`) et `/rest/v1/` (OpenAPI) est fermé :
      **le slug ne peut pas être découvert sans la console Supabase** →
      demandé à l'humain. **Où le lire** : `/rewards` → champ
      `tableau.champ.slug` = « Adresse publique » (input `name="slug"`) ;
      `/qrcode` → l'URL est **imprimée sous le QR** (`urlAdhesion`, bloc
      monospace + affiche) ; ou en SQL `select slug, name, active from
      public.loyalty_programs;`. Restent : **Supabase → URL Configuration**
      (*Site URL* + `https://fideliatest.site/**`) et la **preuve de bout en
      bout**.
- [x] **Diagnostic du 502 à la connexion** *(2026-11-08, 19 h 30)* — le 502
      n'est **pas** côté serveur. Mesures : `GET /login` → 200, **30 requêtes
      sur 30 en 200** (aucune intermittence), un seul vhost
      (`/var/lib/openship/edge/sites-enabled/fideliatest-site.conf`) et un seul
      upstream (`route.json` → `http://127.0.0.1:20000`, le conteneur courant).
      Le conteneur journalisait `Server Reference ID did not match the expected
      format. Received "d46db670"` / `"541147ef"` : or le manifeste serveur
      porte **13 IDs de 42 caractères**, et ces deux IDs **n'existent dans
      aucune des deux images** (`bld_ohZFjoz4SinE5Kfp`, `bld_pHOhhTi5XTf9jPK2`).
      **Conclusion : l'onglet exécutait un document d'un autre build** ; l'action
      inconnue fait avorter la réponse, que l'edge traduit en 502.
      **Contre-épreuve navigateur neuf** (Playwright, contexte vierge) :
      `/login` se charge (seul un `favicon.ico` 404), le formulaire soumis avec
      des identifiants factices rend **`POST /login` → 200** et le message
      **« Identifiants refusés. »** — la chaîne action serveur → Supabase Auth
      fonctionne. Remède : rechargement forcé (`Cmd+Shift+R`) ou navigation
      privée. Les deux autres lignes de console (`inspector.*.js`,
      `content.js`) viennent d'extensions du navigateur, sans rapport.

- [x] **Le `404 /favicon.ico` est mort** *(2026-11-08, soir)* — `web/src/app/icon.svg`
      (vectoriel mesuré sur `web/public/icon-192.png`) + `web/src/app/favicon.ico`
      (16/32/48, PNG **RGBA** : Turbopack refuse un ICO à PNG RGB et casse le
      build). Garde `icone-onglet.test.mjs`. Mesuré en production :
      `/favicon.ico` **200 `image/x-icon`**, `/icon.svg` **200
      `image/svg+xml`**, les deux `<link rel="icon">` dans le HTML de `/join/test1`.
- [x] **Preuve de bout en bout, faite depuis un contexte mobile** *(2026-11-08,
      soir)* — le slug n'a pas eu besoin d'humain : lu en base par l'API Supabase,
      **`test1`** (« TEST », `active = true`, seul programme).
      `/join/test1` **200** et `/recompenses/test1` **200** en production ; puis,
      depuis un contexte **vierge** en 390×844 (pas le navigateur qui a produit
      l'affiche) : « Obtenir ma carte » → `/join/test1?carte=**C-FC8273**`,
      « Votre carte est créée. » + QR. En base : `loyalty_cards` 4 → **5**,
      `clients` 4 → **5** (anonyme, 0 point), carte
      `f8cd3881-e125-4b2e-974d-10cff9aba04f`. `/card/C-FC8273` → **404** est
      **voulu** (la clé de `/card` est l'UUID, pas le code).
- [x] **Les deux migrations manquantes sont appliquées — `/card/<uuid>` rend la
      carte** *(2026-11-08, soir)*. `0018_carte_publique.sql` puis
      `0019_push_abonnements.sql` sur `sevqegfhmdezsqwvwsam` (les deux additives,
      une transaction chacune). Prouvé : `/card/f8cd3881-e125-4b2e-974d-10cff9
      aba04f` → **200** (`ssl_verify_result=0`) affichant « 0 points », « Encore
      15 points avant « DESSERT » », « Code client C-FC8273 » ; plus aucune
      mention de migration manquante ; 404 sur UUID inconnu, sur le code
      `C-FC8273` et sur une troncature. Détail : § Statut Actuel (2026-11-08
      soir, 3). Le retard était bien **ciblé** : seules ces deux-là manquaient.
- [x] **`www` est sous certificat et redirige vers l'apex** *(2026-11-08, soir)* —
      l'`A` parking `213.186.33.5` a été **supprimé côté OVH** (humain), et c'est
      vérifié à la source : `www` → `141.253.120.188` **seul**, sur l'autoritaire
      `ns103.ovh.net` **et** sur `8.8.8.8`. Restait la déclaration côté OpenShip :
      domaine `dom_E5BBkbZGYbFT5jZV` (`redirectTo: fideliatest.site`, 301) →
      `verify` → certificat **`CN=www.fideliatest.site`** (`YE2`, jusqu'au
      **2027-02-06**). **Piège mesuré** : `add` + `verify` n'écrivent **pas** le
      vhost (`fideliatest-site.conf` restait `server_name fideliatest.site`,
      mtime antérieur à la création) ⇒ l'edge servait `CN=openship-edge-default`
      et **réinitialisait** la connexion ; c'est
      `POST /api/projects/:id/routing/retry` (« repair project routes …
      without rebuilding », `{"ok":true}`) qui a écrit
      `www-fideliatest-site.conf` (80 + 443 → `301 https://fideliatest.site
      $request_uri`). Mesures : `www/{,login,join/test1,card/<uuid>}` **301**
      `ssl=0`, suivis → **200** sur l'apex ; l'apex est inchangé
      (`/login`, `/card/<uuid>`, `/favicon.ico`, `/icon.svg` = **200**). Le
      `Connection reset by peer` vu juste après le retry était le **rechargement
      nginx** : re-mesurer avant de conclure.
- [x] **Audit des écrans authentifiés — la bannière de migration n'est pas un
      symptôme diffus** *(2026-11-08, nuit 5)*. Mesure sans session (en créer une
      serait une écriture) : signatures réelles en base + énumération exhaustive
      des bannières + codes rendus par l'API publique. Douze écrans portent un
      `<EtatBloque commande="migrations/…">` ; comme `donnees.mjs` ne rend
      `nonMigre` **que** sur `PGRST202` et que **les 22 RPC existent**, onze sont
      **inatteignables**. Les écrans de la mission répondent : `/dashboard`,
      `/caisse`, `/rewards`, `/settings`, `/branding` → **307** `/login` ;
      `/card/<uuid>` → **200**. **`/apparence` → 404 : la route est `/branding`**
      (nom d'écran, pas URL ; aucun lien interne ne casse).
- [ ] **`0017_proximite_coordonnees.sql` n'est PAS appliquée — c'est la seule
      bannière encore atteignable, et par un seul chemin.** Mesuré :
      `loyalty_programs` n'a pas `latitude`/`longitude` et porte toujours
      `lien_localisation` ; `enregistrer_fiche_etablissement` expose **14**
      paramètres (version `0011`) au lieu de **15**. Donc l'**enregistrement** de
      `/settings` envoie `p_latitude`/`p_longitude` ⇒ `PGRST202` ⇒ `nonMigre` ⇒
      `/settings?etat=migration` et la bannière réclame « `0011` puis `0017` ». La
      **lecture** est saine (`fiche_du_commerce()` existe). **Non appliquée
      volontairement** : elle ajoute deux colonnes et **supprime** une fonction —
      changement de schéma en production, hors du mandat « aucune écriture ».
      Pour la passer quand ce sera demandé : `apply_migration` avec le fichier
      **verbatim**, puis `POST /settings` par l'écran pour voir la bannière
      disparaître.
- [x] **`/card` — l'abonnement push rendait 503 sur *tout* corps valide : trouvé et
      corrigé** *(2026-11-08, nuit 5)*. Refus locaux corrects et mesurés en
      production : corps non-JSON, `{}`, `endpoint` en `http://`, `card_id`
      non-UUID ⇒ **400 `abonnementInvalide`**, refusés **avant** la base (aucune
      écriture). Mais un corps **valide** rendait **503 `indisponible`** : la route
      rebaptisait `{carte,…}` en `{card_id,…}` via `corpsAbonnement()` avant de le
      donner à `enregistrerAbonnementPush()`, qui lit `carte` ⇒ `p_card_id: ''` ⇒
      **`22P02 invalid input syntax for type uuid: ""`** (mesuré par appel direct
      de la RPC en `anon`) ⇒ code inconnu ⇒ 503. Et le composant appelle
      `unsubscribe()` sur toute réponse non `ok` : **chaque tentative valide
      détruisait l'abonnement**. **Correctif** : `abonnementDepuisAnalyse(lu)` dans
      `web/src/lib/push.mjs`, utilisée par la route ; **deux tests** ajoutés
      (mapping + garde de source). `push_abonnements` = **0** avant et après ;
      suite **841 / 840 ✔ / 0 échec / 1 ignoré**. **Déployé** (`77a3be5`) et
      re-mesuré en production : corps valide + carte inconnue ⇒ **404
      `carteInconnue`** (503 avant le correctif), quatre corps invalides ⇒ **400
      `abonnementInvalide`**, `/card/<uuid>` et `/login` ⇒ **200**, **0** ligne
      écrite.
- [x] **Supabase → URL Configuration — FAITE le 2026-11-09 (session 7).**
      Valeurs enregistrées en console : *Site URL* = `https://fideliatest.site`,
      *Redirect URLs* = `https://fideliatest.site/**` (« Total URLs: 1 »).
      Preuve : `node tools/rea/verifier-url-auth.mjs` → **CONFORME** (code 0),
      les deux URL du code acceptées **certainement** ; `/auth/confirm` → **307**
      `/forgot-password?echec=invalide`, `?flux=recuperation` compris, et
      `/forgot-password?echec=invalide` → **200**. Avertissement non bloquant :
      aucun motif `http://localhost:3000` (sans effet, `NEXT_PUBLIC_SITE_URL` est
      déclarée jusque dans `web/.env.local`).
      *Non prouvé, et non prouvable sans écriture* : qu'un envoi réel de courriel
      accepte ce `redirect_to` — un envoi est une écriture, il n'a pas été fait.


### ⛔ Périmètre & décisions
- [ ] **Aucune écriture sur la production Fidelix** (pas de POST, pas de création
  de compte, pas de scan réel). Le REA reste **lecture seule**.
- [ ] Clés Supabase : l'URL du projet et la clé anon sont **publiques par
  conception** ; elles ne sont pas recopiées dans les docs et ne servent pas à
  interroger la base.

---

## 🔄 Prompt de relais (écrit le 2026-11-08, nuit 5 ; réécrit le 2026-11-09, session 7 — état mesuré, pas déclaré)

### 🔄 PROMPT POUR LA PROCHAINE TÂCHE
*(Utilisateur, copie-colle ce bloc lors de notre prochaine interaction pour que je reprenne immédiatement le contexte)*

**Contexte actuel :**
- `https://fideliatest.site` est **en ligne et prouvé** : `CN=fideliatest.site`
  (Let's Encrypt YE1, jusqu'au **2027-02-06**), `ssl_verify_result=0`, et le DNS
  est enfin propre **y compris sur le résolveur local** (`fideliatest.site` →
  `141.253.120.188`) — `curl` sans `--resolve` mesure donc le vrai site.
- OpenShip : projet `proj_rB7iSlX1cvWqhDVl`, source git `DEVSFAME/FIDELIA`
  branche `main`, déploiement actif **`dep_f07khjzI6W79294n`** (commit
  **`7656f08`**, `trigger: webhook`). **Un `git push` sur `main` déclenche le
  déploiement** : inutile d'appeler l'API.
- Application : Next **16.4.3**, code dans `web/`, image bâtie depuis la
  **racine** du dépôt (`/Dockerfile`). L'icône d'onglet est servie par la
  convention `web/src/app/` (`icon.svg` **+** `favicon.ico`).
- Base Supabase : projet **`sevqegfhmdezsqwvwsam`** (« FIDELIXY »), programme
  **`test1`** / « TEST » / `active = true`, **5** cartes et **5** clients
  (dont la carte de test `C-FC8273`). **25 fonctions publiques.** Migrations :
  `0001`, puis `0003`→`0019` (pas de `0002`) — **mais `0017` N'EST PAS
  APPLIQUÉE**, mesuré le 2026-11-08 : `loyalty_programs` n'a pas
  `latitude`/`longitude`, porte encore `lien_localisation`, et
  `enregistrer_fiche_etablissement` a **14** paramètres au lieu de **15**. La
  phrase « les 18 fichiers sont à jour » qui figurait ici était fausse d'un
  fichier. Tous les autres objets attendus sont présents (mesuré).
- DNS OVH : `A @` → `141.253.120.188` ✅ et **`A www` unique** → `141.253.120.188`
  ✅ (le parking `213.186.33.5` est supprimé, mesuré sur l'autoritaire et sur
  `8.8.8.8`). `www` est déclaré côté OpenShip (`dom_E5BBkbZGYbFT5jZV`,
  `redirectTo` apex, 301) et **sous certificat** `CN=www.fideliatest.site`.
- Fichiers concernés : `PROGRESS.md` (§ Statut Actuel l. 7+ et « 🚀 Mise en
  ligne » l. ~3476+), `migrations/0018_carte_publique.sql`,
  `migrations/0019_push_abonnements.sql`, `web/src/app/card/[cardId]/page.jsx`,
  `web/src/lib/carte-publique.mjs`, `web/src/lib/donnees.mjs`
  (`rpc('carte_publique')`, `enregistrer_abonnement_push`).

**Ce qui vient d'être fait :**
- **Session 8 (2026-11-09) — incident « page noire à la connexion » fermé, et
  prouvé par une connexion réelle.** Le formulaire partait sur `/`
  (`POST / 400, 30 o`, `Next-Action: y`) : `/` est prérendue (`s-maxage` d'un
  an) et ne porte aucune action. Correctif `38b57c8` déployé :
  `lib/action-perdue.mjs` (règle pure) + `proxy.js` en **303** +
  `app/page.jsx` en `force-dynamic` + `?etat=reprise`. Mesures après
  déploiement : `POST /` ⇒ **303** `/login?etat=reprise`, `GET /` sans
  `s-maxage`, `/card/<uuid>` **200**, et **`/login` → `/dashboard` rendu** au
  navigateur, 0 erreur console, déconnexion OK. Suite **868/867/0/1**. Compte
  d'épreuve créé puis **supprimé** (0 utilisateur, 0 identité, 0 session ;
  données métier inchangées). `0017` **non appliquée** (pré-vol fait seulement).
- **Session 7 (2026-11-09) — point 5 clos par la preuve, pas par la déclaration.**
  Les deux valeurs de la console ont été reçues et jugées par un outil neuf :
  `tools/rea/url-auth.mjs` (juge pur, hors ligne, ne recopie aucun domaine — ses
  URL sortent de `urlConfirmation()` / `urlReinitialisation()`) et
  `tools/rea/verifier-url-auth.mjs` (CLI : lit un JSON, n'affiche que les deux
  clés, n'ouvre ni `.env` ni le réseau). **20 tests** ajoutés ; suite
  **861 / 860 ✔ / 0 échec / 1 ignoré**. Verdict **CONFORME** sur
  `site_url=https://fideliatest.site` + `uri_allow_list=https://fideliatest.site/**` :
  `/auth/confirm` **et** `/auth/confirm?flux=recuperation` acceptés
  **certainement**, aucune origine tierce acceptée, pas de barre finale.
  Cible vivante : `/auth/confirm` → **307** `/forgot-password?echec=invalide`
  (?flux compris), puis **200**. **Rien n'a été écrit** en base ni par courriel.
- **Session 5 (2026-11-08, nuit) — audit terminé, un vrai bug corrigé.**
  1. **`0017` manque** : c'est **la seule** bannière de migration encore
     atteignable, et par un seul chemin — l'**enregistrement** de `/settings`
     (`donnees.mjs:443` envoie `p_latitude`/`p_longitude` ⇒ `PGRST202` ⇒
     `nonMigre`). La lecture reste saine. **Non appliquée** : elle ajoute deux
     colonnes et supprime une fonction = changement de schéma, hors mandat.
  2. **Onze des douze bannières sont inatteignables** : `donnees.mjs` ne rend
     `nonMigre` que sur `PGRST202`, et **les 22 RPC existent** toutes (mesuré sur
     `pg_proc`, `DEFAULT` vérifiés là où le code omet un argument). `web/src` ne
     lit **aucune** table directement.
  3. **`/apparence` → 404** : la route est `/branding` (nom d'écran, pas URL ;
     aucun lien interne ne casse). `/dashboard`, `/caisse`, `/rewards`,
     `/settings`, `/branding` → **307** `/login` ; `/card/<uuid>` → **200**.
  4. **Bug réel corrigé — `/api/push/subscribe` rendait 503 sur tout corps
     valide.** La route rebaptisait `{carte,…}` en `{card_id,…}` via
     `corpsAbonnement()` avant `enregistrerAbonnementPush()` qui lit `carte` ⇒
     `p_card_id: ''` ⇒ **`22P02`** ⇒ `indisponible` ⇒ 503 ; et le client
     `unsubscribe()` sur tout non-`ok`, donc chaque tentative valide **détruisait**
     l'abonnement. Correctif : `abonnementDepuisAnalyse()` + 2 tests. Les refus
     **locaux** étaient déjà bons (4 corps invalides → **400
     `abonnementInvalide`**, aucune écriture). `push_abonnements` = 0 avant/après.
     Suite **841 / 840 ✔ / 0 échec / 1 ignoré**.
- **`0018` puis `0019` appliquées à la production, et `/card/<uuid>` est
  vivante.** Les deux fichiers ont été passés **verbatim** (MCP Supabase
  `apply_migration`, `begin`/`commit` conservés), `success: true` deux fois ;
  état mesuré : 23 → **25** fonctions publiques, `push_abonnements` créée avec
  RLS **sans** politique, `anon` peut exécuter les deux RPC et **ne peut pas**
  lire la table. En production, `/card/f8cd3881-e125-4b2e-974d-10cff9aba04f` →
  **200** (`ssl=0`) affichant « 0 points / Encore 15 points avant « DESSERT » /
  Code client C-FC8273 / Membre depuis novembre 2026 », sans le moindre écran de
  migration manquante. 404 sur UUID inconnu, sur `C-FC8273` et sur une
  troncature. Refus nommés prouvés au SQL (`CARD_NOT_FOUND`,
  `ABONNEMENT_INVALIDE`) et **aucune ligne écrite** (0 abonnement, 5 cartes,
  5 clients). **Aucun code modifié** → aucune image rebâtie, déploiement actif
  inchangé. Suite **839 tests / 838 ✔ / 0 échec / 1 ignoré**.
- **Ce 200 prouve le `grant` de `0018`, pas seulement le `create function`** :
  le client serveur parle en `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`config.mjs`
  refuse un JWT `service_role`), donc la requête est bien partie en `anon`.
  Et **aucun `notify pgrst`** n'a été nécessaire : la fonction a été vue par
  PostgREST immédiatement.

- **`www` est réglé de bout en bout** : `A www` unique (parking supprimé),
  déclaré sur le projet (`redirectTo` apex, 301), certificat
  `CN=www.fideliatest.site` (`YE2`, jusqu'au 2027-02-06), `301` mesuré sur
  `/`, `/login`, `/join/test1`, `/card/<uuid>`, `ssl_verify_result=0`.
  **Le geste qui manquait** : `add` + `verify` n'écrivent pas le vhost —
  c'est `POST /api/projects/:id/routing/retry` qui l'écrit, **sans rebuild**.

**La prochaine mission :**
1. **(FAIT le 2026-11-09, session 7)** Supabase → URL Configuration : *Site URL* =
   `https://fideliatest.site`, *Redirect URLs* = `https://fideliatest.site/**`
   (« Total URLs: 1 »). Jugée **conforme** hors ligne
   (`tools/rea/verifier-url-auth.mjs`, code 0) : les deux URL du code
   (`/auth/confirm`, `/auth/confirm?flux=recuperation`) sont acceptées
   **certainement** ; cible vivante mesurée (`/auth/confirm` → **307**
   `/forgot-password?echec=invalide`, puis **200**). Rien à refaire en console.
   *Seule réserve, non bloquante* : aucun motif `http://localhost:3000` — sans
   effet tant que `NEXT_PUBLIC_SITE_URL` est déclarée, y compris dans
   `web/.env.local`.
2. **(Agent)** `0017_proximite_coordonnees.sql` — **seulement sur demande
   explicite** (changement de schéma en production). Passer le fichier
   **verbatim** par `apply_migration`, puis prouver la bannière éteinte : les deux
   colonnes présentes, la fonction à **15** paramètres, et l'enregistrement de la
   fiche par l'écran ⇒ plus de `?etat=migration`.
3. **(Agent)** ~~Re-mesurer `/api/push/subscribe` après déploiement~~ — **FAIT**
   dans la même session : corps **valide** + carte inconnue ⇒ **404
   `carteInconnue`** (503 avant), corps invalides ⇒ **400**, `push_abonnements`
   à **0**. Le chemin d'écriture réelle (`200 {abonne:true}`) reste **non mesuré** :
   il demande un vrai navigateur et créerait une ligne en production.
4. **(Backlog, inchangé)** `P0-3b/P0-3c` (`/billing` attend un état d'abonnement),
   `R3` étape 3 (rejeu de caisse : exige une écriture réelle), `R5` recette.
- **Règles à appliquer** : `chef-de-projet` (lire/écrire `PROGRESS.md` avant et
  après), `clinerules-code` (test après implémentation), `Gestion du Contexte`
  (pagination, pas de fichier entier).

**Instructions de démarrage :**
> "Agis en tant que développeur principal. Lis `PROGRESS.md` (§ Statut Actuel
> « 2026-11-09 session 7 »). L'URL Configuration Supabase est **faite et jugée
> conforme** : `site_url=https://fideliatest.site`,
> `uri_allow_list=https://fideliatest.site/**`, verdict **CONFORME** de
> `tools/rea/verifier-url-auth.mjs`, cible `/auth/confirm` mesurée **307** puis
> **200**. Le seul reste du point « mise en ligne » est **`0017`**, préparée
> (garde 10/10) et **non appliquée** : tu ne l'appliques que sur demande
> explicite, **verbatim** (`apply_migration`, `begin`/`commit` inclus), et ta
> preuve inclut **`/card/<uuid>` toujours 200**, puisqu'elle réécrit
> `carte_pour_wallet()`. Contraintes : aucune écriture de données en production,
> toute mesure par `curl` sur `https://fideliatest.site`, secrets jamais dans le
> chat, et un `git push` sur `main` suffit à déployer."


**Outillage à reconstruire s'il a disparu :**
- **Deux contrats de nommage, à ne jamais confondre** (défaut mesuré le
  2026-11-08) : `corpsAbonnement()` décrit ce que le **navigateur envoie**
  (`card_id`), `abonnementDepuisAnalyse()` ce que la **couche données** attend
  (`carte`). Les croiser donne `p_card_id: ''` ⇒ `22P02` ⇒ 503, et le client se
  désabonne. Règle générale : quand une route relaie un corps validé, vérifier le
  **nom** des clés attendues par le `rpc()`, pas seulement leur valeur.
- **Prouver un `PGRST202` sans écrire** : appeler la RPC avec les noms
  d'arguments du code ; PostgREST échoue à la **résolution** de la fonction, donc
  aucun corps de fonction n'est exécuté, aucune ligne n'est touchée. C'est ainsi
  que la divergence de `0017` a été prouvée (`p_latitude` inconnu en base).
- Session CLI OpenShip : `POST /api/system/cli-session` avec l'en-tête
  `X-Internal-Token` lu par
  `docker exec openship-api-1 printenv INTERNAL_TOKEN`, puis
  `Authorization: Bearer <sess>`. Helper prêt sur le VPS : `/tmp/api.sh`
  (`METHOD=POST BODY='…' bash /tmp/api.sh <chemin>`).
- **Déclarer un domaine** : `POST /api/domains`
  (`{projectId, hostname, redirectTo?, redirectStatus?}`) → `201`, puis
  `POST /api/domains/<id>/verify` (émet le certificat). **Ça n'écrit PAS le
  vhost** : l'edge continue de servir `CN=openship-edge-default` et réinitialise
  la connexion. Le geste qui termine le travail est
  `POST /api/projects/<id>/routing/retry` (« repair project routes … without
  rebuilding »), qui écrit `/var/lib/openship/edge/sites-enabled/<domaine>.conf`
  et recharge nginx. Juste après, un reset peut durer quelques secondes :
  re-mesurer.
- **Lire l'edge** : `sites-enabled` est monté depuis
  `/var/lib/openship/edge/sites-enabled` (vhosts + `.route.json`), certificats
  dans `/etc/letsencrypt/live/<domaine>/` (conteneur `openship-edge`,
  openresty).
- **Accès VPS** : `ssh -i VPS/SSH/ssh-key-2026-08-16.key ubuntu@141.253.120.188`
  (copier la clé dans `/tmp` puis `chmod 600` si ssh refuse les permissions).
- **Déployer** : un `git push` sur `main` suffit (webhook → `trigger: webhook`).
  À la main : `POST /api/deployments` avec
  `{"projectId":"proj_rB7iSlX1cvWqhDVl","branch":"main"}` — et **409
  `DEPLOYMENT_IN_PROGRESS`** si un build tourne déjà, ce qui est normal.
  Suivi : `GET /api/deployments/<id>` → `status` (`deploying` → `ready`).
- Nom du conteneur : il **change à chaque déploiement** →
  `sudo docker ps --filter name=fidelia`.
- Parse JSON des réponses API : filtrer la ligne `[HTTP …]` du helper avant
  `python3 -m json.tool`.
- **Lire la base sans console** : l'API Supabase (MCP) sur
  `sevqegfhmdezsqwvwsam` rend `select …` — c'est ainsi que le slug `test1` a été
  trouvé, `anon` n'ayant pas `SELECT` sur `loyalty_programs`.
- **Écrire le schéma sans console** : `apply_migration` du MCP Supabase, avec le
  contenu **verbatim** du fichier (`begin`/`commit` inclus : une transaction par
  migration). Puis vérifier par `select` — `pg_proc`, `to_regclass`,
  `has_function_privilege`, `relrowsecurity` — **et** par la route publique, qui
  est la seule preuve que `anon` passe vraiment. Pas besoin de
  `notify pgrst, 'reload schema'` : mesuré inutile.
- **Ne pas se fier au seul 200** : `/card/<uuid>` doit être recoupé avec la ligne
  SQL (points, token, paliers) ; un écran « migration manquante » rend lui aussi
  200, et c'est le piège de cette page.
- **Générer un `favicon.ico`** : les trois entrées doivent être des PNG **RGBA**
  (PIL : `convert('RGBA')` avant `save`), sinon Turbopack refuse l'ICO au build.

