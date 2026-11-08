# P0-4 — `/notifications` · `/campaigns` · `/automations` : ce que la cible fait vraiment

> Passe du 2026-11-02 (P0-4). Question posée : « que faut-il construire derrière ces
> trois routes ? ». Réponse **mesurée** : ce ne sont **pas trois écrans**, c'est
> **un seul écran à trois onglets** (« Messages »), et **deux de ses onglets
> exigent un canal d'envoi que le socle n'a pas**. Le troisième est un paywall.

Chaque affirmation cite son fichier et son **offset d'octets** dans
`01_REA_Fidelix/_captures/`. Une capture annoncée « inexistante » dans le backlog
a été retrouvée : voir §0.

---

## 0. Le relais était faux : la capture de `/notifications` existe

L'entrée de backlog « `/notifications` — rien à mesurer » (PROGRESS, ancienne
ligne 2302) s'appuyait sur `2026-10-27-auth-s3/raw/pages/a20-notifications.html`,
**payload RSC** — et sur lui seul. Une passe postérieure l'a capturée pour de bon :

| Preuve | Fichier | Taille |
|---|---|---|
| DOM rendu, 200, session réelle | `2026-11-02-a7b/rendu/d01-notifications.html` | 79 946 o |
| Écran (image) | `2026-11-02-a7b/rendu/d01-notifications.png` | 494 265 o |
| Réseau (requêtes observées) | `2026-11-02-a7b/rendu/d01-notifications.reseau.json` | 10 207 o |

Et elle porte bien des chaînes **propres** à la page — ce que le payload RSC ne
faisait pas : « Nouvelle notification », « Historique des notifications »
(`d01-notifications.html:37319`), « Jusqu'à 3 notifications par jour »
(`:33430`). La distinction RSC/DOM avait déjà coûté une conclusion fausse sur
`/caisses` ; elle est levée ici par la mesure, pas par l'argument.

---

## 1. Un écran, trois onglets — les trois routes mesurées

Les trois captures rendent **la même** barre d'onglets sous le `h1` « Messages » :

| Onglet | Route mesurée | Contenu de l'onglet |
|---|---|---|
| Notifications | `/notifications` | formulaire d'envoi + historique |
| Automatiques | `/automations` | quatre automatisations, chacune avec « Enregistrer » |
| Emails | `/campaigns` | **paywall** : « Les campagnes demandent un pack » |

Même famille que `/rewards` + `/program` (deux onglets d'une section) : la cible
sépare par **route**, pas par état client. Conséquence de plan : P0-4 n'est pas
trois chantiers, c'est **une barre d'onglets et un contenu par onglet**.

---

## 2. `/notifications` — le contrat, mesuré

### 2.1 Le formulaire

| Élément | Borne mesurée | Preuve |
|---|---|---|
| Compteur du jour | « 0 / 3 aujourd'hui » | badge, `d01-notifications.html` |
| Aide | « Jusqu'à 3 notifications par jour. Au-delà, les clients se lassent et suppriment leur carte. » | `:33430` |
| Titre | `name="title"`, 3 → 50 car. | `:34306` ; chunk : `max(50,"Titre trop long (50 caractères max)")` |
| Message | `name="body"`, `<textarea rows=3>`, 10 → 150 car. | placeholder « Profitez de -20 % sur votre prochaine visite… » |
| Lien | `name="cta_url"`, URL **optionnelle**, « Lien optionnel (bouton dans la notif) » | `:35046`, `:35578` |
| Modération | « Les notifications sont modérées automatiquement. Tout contenu inapproprié (injures, contenu sexuel, texte non professionnel) sera bloqué et non publié. » | bloc `bg-slate-50` |
| Action | « Envoyer la notification » → « Vérification et envoi… » | `type="submit"` |
| Aperçu | carte noire : `Titre` / `Message de la notification...` | rendue dès qu'un champ est rempli |
| Quota atteint | le bouton **disparaît** au profit de « Prochaine notification demain » | `chunk:U?` |

Messages de validation littéraux, à recopier tels quels : « Titre trop court »,
« Titre trop long (50 caractères max) », « Message trop court », « Message trop
long (150 caractères max) », « URL invalide ».

### 2.2 L'envoi — `POST /api/notifications`

Corps : `{ restaurant_id, title, body, cta_url | null }` (`chunk:8003`).

Quatre issues, toutes **nommées** :

| Réponse | Toast de la cible |
|---|---|
| `{ blocked: true, reason }` | « Notification bloquée » / `<reason>` |
| `{ quota_atteint: true, error }` | « Limite du jour atteinte » / `<error>` |
| succès, ≥ 1 joignable | « Notification envoyée ✓ » / « Délivrée à X et Y. » |
| succès, 0 joignable | « **Notification validée ✓** » / « **Aucun client joignable pour l'instant — ils le deviennent en ajoutant leur carte au Wallet ou en activant les notifications.** » (`chunk:8822`) |

**La cible stocke donc une notification que personne ne reçoit, et le dit.** Ce
n'est pas un cas dégradé : c'est un état produit prévu.

### 2.3 L'historique et les lectures

- `select * from push_notifications where restaurant_id = … order by created_at desc limit 20` (`chunk:9085`, `:9568`) ;
- `rpc notifications_envoyees_aujourdhui(p_restaurant_id)` → entier du jour (`chunk:9814`) ;
- `rpc taux_desinscription_wallet(p_restaurant_id, p_jours = 7)` → `{ base, taux }`, affiché seulement si `base >= 10`, couleur selon 5 % / 10 %.

Colonnes de `push_notifications` **observées à l'usage** (aucun schéma lu) :
`title`, `body`, `status` ∈ `sent | draft | blocked`, `moderation_reason`,
`recipients_count`, `iphones_touches`, `android_touches`, `navigateurs_touches`,
`created_at`, `restaurant_id`.

Ligne d'historique : statut + pastille, `body` tronqué à 2 lignes, « Raison : … »
si `blocked`, date relative, puis « N destinataires · 2 iPhone · 1 Android ».
Vide : « Aucune notification envoyée ».

---

## 3. `/automations` — quatre automatisations, bornées

Phrase d'entrée : « Partent tout seuls pour faire revenir vos clients. »
(`a07-automations.html:34932`). Pied de page : « Les envois sont vérifiés chaque
jour. Un même client n'est jamais contacté deux fois pour le même déclencheur. »
(`:42648`).

| Automatisation | Description mesurée | Réglages | Défauts du code |
|---|---|---|---|
| Relance client inactif | « Recontacte automatiquement les clients qui ne sont pas revenus. » (`:35675`) | message ≤ 300 car., `days` **3 → 365**, « Après … jours sans visite » | `days: 30`, « Cela fait un moment ! Revenez profiter de vos avantages fidélité. 😊 » |
| Bientôt une récompense | « Une notification quand le client approche de sa récompense (push). » | `remaining` **1 → 20** (tampons) / **1 → 100** (points), « Notifier quand il reste … » | `remaining: 20`, message vide |
| Anniversaire | « Un souhait le jour de son anniversaire, pour ceux qui ont donné leur date (push). » | `days` **0 → 30**, « Envoyer … le jour même / N jour(s) avant l'anniversaire » | `days: 0`, « Joyeux anniversaire ! Une attention vous attend chez nous. 🎂 » |
| Mon message à moi | « Votre propre message, envoyé à tous vos clients les jours que vous choisissez. » | titre ≤ 50, message ≤ 300, « Jours d'envoi » = 7 pastilles `L M M J V S D` (`aria-pressed`), `aria-label` = jour long | `jours: [5]` (samedi), titre et message vides |

Aide mesurée de l'anniversaire : « Seuls les clients qui ont donné leur date
reçoivent ce message — elle est facultative à l'inscription. Envoi par
notification, pas par email. »

Chaque carte a un interrupteur `role="switch"` + `aria-checked` ; les champs
n'apparaissent **que** si l'automatisation est active. Un bouton « Enregistrer »
par carte, avec retour « Enregistré » temporaire.

Écriture : `POST /api/automations/save` (`chunk:2487`), corps variable :
- `winback` / `birthday` → `{ type, is_active, message, days }` ;
- `personnalisee` → `{ type, is_active, titre, message, jours }` ;
- `near_reward` → `{ type, is_active, remaining, … }`.

Lecture : `automations(type, is_active, config)` filtrée par `restaurant_id`
(`chunk:3531`) ; `config` porte `message`, `days`, `remaining`, `titre`, `jours`.
Le **type de programme** est lu à part : `loyalty_programs.type` =
`'stamps' | 'points'` (`chunk:3365`) — il change la borne et le libellé de
« Bientôt une récompense » (1 tampon au lieu de N points).

---

## 4. `/campaigns` — paywall, rien d'autre

`c05-campaigns.html` ne contient **aucun** contrôle : ni titre, ni liste, ni
bouton de composition. Uniquement :

- « **Les campagnes demandent un pack** » (`:35409`) ;
- « Écrire à vos clients n'est pas compris dans l'abonnement : chaque email
  envoyé a un coût, et il se paie par pack. Vos emails du produit — bienvenue,
  confirmations, relances automatiques — continuent de partir normalement. » ;
- un bouton « **Ajouter des emails** » (`:35864`).

Même famille que P0-3c : **rien à construire sans paiement**. Le seul écran
possible aujourd'hui est l'état bloqué — et ses textes sont déjà mesurés.

---

## 5. Ce que le socle a, et ce qui manque — mesuré en base

`information_schema` sur `sevqegfhmdezsqwvwsam`, le 2026-11-02 : **six** tables —
`clients`, `loyalty_cards`, `loyalty_programs`, `loyalty_transactions`,
`reward_tiers`, `staff`.

| Ce que la cible lit | Existe ici ? |
|---|---|
| `push_notifications` | **Non** — aucune table |
| `automations` | **Non** — aucune table |
| `restaurant_id` (multi-PDV) | **Non** — le socle est mono-commerce |
| `clients` : date d'anniversaire | **Non** — 6 colonnes : `id`, `first_name`, `last_name`, `email`, `created_at`, `designated_staff_id` |
| `clients` : jeton push / identifiant Wallet | **Non** |
| `loyalty_programs.type` | **Partiel** — la colonne s'appelle `kind` (`points` par défaut) |
| RPC `notifications_envoyees_aujourdhui` | **Non** |
| RPC `taux_desinscription_wallet` | **Non** — et pas calculable : aucun Wallet |
| Canal d'envoi (push, Wallet, email) | **Non** — `web/package.json` : Next, React, Supabase **uniquement** |

Aucune dépendance d'envoi n'est installée, et aucun code ne mentionne Wallet, push
ou email : `grep -rniE 'wallet|web-push|resend|sendgrid|nodemailer' web/src` ne
rend **que** des `Array.push`.

---

## 6. Verdict

**P0-4 n'est pas un chantier d'écran : c'est un canal.** Les trois onglets sont
dessinables dès maintenant — et deux mentiraient :

1. `/notifications` — envoyer suppose un **client joignable**. Ici, aucun client
   n'a de jeton push, de carte Wallet ni d'adresse exploitée : le nombre de
   destinataires serait **toujours 0**. La cible elle-même prévoit cet état
   (« Aucun client joignable »), donc écrire en base sans envoyer *est* conforme
   — mais ce n'est pas la fonction que la route promet, et le quota « 3 / jour »
   deviendrait un frein sur du vide.
2. `/automations` — active quatre envois automatiques ; sans **exécuteur
   quotidien** ni canal, l'interrupteur promet un envoi qu'aucun code n'honore.
   « Anniversaire » ajoute une exigence de modèle : la date de naissance, que le
   socle **ne collecte pas** (promesse « aucune donnée personnelle » tenue à
   l'inscription).
3. `/campaigns` — paywall pur : dépend de P0-3c (paiement), pas d'un écran.

**C'est le même blocage que P0-3b, et c'est le vrai résultat de cette passe :**
le plafond de 30 (P0-3b) et les messages (P0-4) butent sur la **même** pièce
manquante — une couche sortante (canal d'envoi) et un **état payant**. Les
traiter comme deux chantiers séparés ferait écrire deux fois la même dette.

### Options, avec leur coût réel

| # | Option | Livré | Non livré |
|---|---|---|---|
| **A** | **Ne rien livrer sur P0-4** ; ouvrir la tâche « canal sortant » | une décision écrite, un plan honnête | aucune route nouvelle |
| **B** | Livrer l'onglet `/notifications` : stockage + quota 3/j + historique, état « 0 joignable » assumé | formulaire conforme, quota en base, historique réel, textes mesurés | aucun envoi ; une table sans émetteur |
| **C** | Construire d'abord le canal (web push + abonnement navigateur, ou export email), **puis** les trois onglets | P0-4 complet, P0-3b débloqué | le plus long ; `0012` toujours non exécutée |

**Recommandation : A, puis C.** B est faisable sans mentir — la cible a prévu
l'état vide — mais il pose un compteur de quota sur un envoi inexistant. L'ordre
coût/valeur est meilleur en construisant d'abord le seul élément que ni P0-3b ni
P0-4 ne peuvent contourner.

---

## 7. Ce que cette passe n'a pas mesuré

- Le **schéma** de `push_notifications` et `automations` : les colonnes ci-dessus
  sont **déduites de l'usage** (lectures et écritures observées), pas lues. Un
  `select *` ne montre ni les types ni les contraintes.
- La **fonction de modération** (côté serveur) : on connaît ses entrées
  (`title`, `body`), son refus (`blocked` + `reason`) et une formulation rendue
  (« contenu non conforme »), pas sa règle.
- La **définition du jour** du quota `notifications_envoyees_aujourdhui` (fuseau,
  remise à zéro) : la RPC n'a jamais été appelée avec un `p_jours`.
- L'**exécuteur** des automatisations : la cible dit « vérifiés chaque jour »,
  aucune trace de planificateur n'a été capturée.

---

## 8. Décision prise (2026-11-02, même nuit)

**Consigne reçue :** « ne code rien qui concerne abonnement, le but est d'avoir
tous les modules fonctionnels ». L'option **A** est donc écartée — on ne laisse
pas le module en plan — et **C** (construire un canal push/email) est reporté :
il demande des clés et une surface client qui n'existent pas.

**Option retenue : B, élargie au strict nécessaire.** L'onglet
`/notifications` est livré **fonctionnel de bout en bout**, avec une frontière
explicite :

| Livré | Où |
|---|---|
| Formulaire aux bornes mesurées (3–50, 10–150, lien optionnel http(s)) | `web/src/app/(dashboard)/notifications/page.jsx` |
| Validation pure, quota, lecture de la file | `web/src/lib/messages.mjs` |
| Action serveur sans JavaScript, un état d'URL par refus | `.../notifications/actions.js` |
| File `messages_envoyes`, quota **tenu en base**, jour à Casablanca | `migrations/0013_messages.sql` |
| Historique (20 derniers) avec statut **`en_attente`** | écran |
| Audience réelle : clients qui ont une adresse email | RPC `messages_du_commerce()` |

**Ce qui reste ouvert, et c'est assumé** : aucun message ne part. L'écran le dit
en toutes lettres (`page.messages.fileAide`) et chaque ligne porte « En attente »
— jamais « Envoyé ». `0013` n'est **pas exécutée** : sans elle, la page affiche
`PGRST202` et nomme le fichier.

**Reste à faire pour que P0-4 soit complet** : `/automations` (table + quatre
cartes, dont « Anniversaire » qui exige une date de naissance que le socle ne
collecte pas) et `/campaigns` (paywall → paiement). Les deux dépendent de la
même pièce que P0-3b : **une couche sortante et un état payant**.
