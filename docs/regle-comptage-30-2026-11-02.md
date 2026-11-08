# Le plafond de 30 clients : ce que la cible compte vraiment

> Passe du 2026-11-02 (P0-3). Question posée : « 1 / 30 clients » — 30 de quoi ?
> Réponse **mesurée**, pas déduite : **des clients inscrits**, c'est-à-dire des
> cartes remises, cumulés depuis l'ouverture du programme. Ni les visites, ni le
> chiffre d'affaires, ni les inscriptions du mois.

Chaque affirmation ci-dessous cite son fichier et son offset d'octets dans
`01_REA_Fidelix/_captures/`.

---

## 1. Ce qui est compté

| Preuve | Fichier:offset | Chaîne |
|---|---|---|
| Règle de paiement, en toutes lettres | `2026-10-26/raw/pages/p01-home.html:72421` | « Vous ne payez que le jour où **votre 30e client s'inscrit** » |
| Le même texte, avec le paramètre visible | `2026-10-26/raw/pages/p01-home.html:122241` | `"gratuit_sous":"… le jour où votre {limite}e client s'inscrit."` |
| Nom du compteur (page `/billing`) | `2026-11-02-a7/rendu/c02-billing.html:43501` | `aria-label="Clients inscrits sur l'offre gratuite"` |
| Nature du chiffre (bandeau) | `2026-11-02-a7/rendu/c01-settings.html:29882` | `aria-label="1 clients sur 30 dans l'offre gratuite"` |
| Message de plafond atteint | `…chunks_9990-950efab9e0d04bcf.js:1494` | « **N clients ont déjà leur carte.** Activez l'abonnement pour continuer à scanner et inscrire de nouveaux clients. » |
| Message d'accès suspendu | `…_9990-…js:16196` | « **N clients ont déjà votre carte** : votre programme fonctionne. » |

**« L'inscription » est l'événement, pas la visite.** Le message d'accès
suspendu le dit explicitement : `…_9990-…js:16561` — « N clients de plus ont
pris votre carte depuis, et **attendent leur premier scan** ». Une carte prise
et jamais scannée **compte donc déjà** dans le chiffre.

**Le compteur est cumulé, pas mensuel.** `…_9990-…js:1645` : « N client(s) sur
30 **offerts** », et le conseiller de la cible rend le même chiffre au mot près :
`2026-11-02-a6/raw/sondes/b12-api-fidelia.html:3084` — « Vous en êtes à **1
inscrit au total** ». Deux endpoints différents, un seul chiffre : 1. Le
compteur « +N ce mois » du tableau de bord est un **autre** nombre, lu ailleurs.

**Le compteur est global au commerce.** Aucune des chaînes mesurées ne
qualifie le chiffre par point de vente ; le prix, lui, est par point de vente
(« 397 MAD par point de vente », `c02-billing.html`). Le plafond porte sur les
clients, le prix sur les caisses — deux axes distincts.

## 2. Le seuil

**30**, écrit une seule fois comme paramètre (`{limite}`), puis rendu partout :
`aria-valuemax="30"` (`c01-settings.html:29849`), « / 30 clients », « 1 client
sur 30 offerts » (`c02-billing.html:43501`), et le message WhatsApp prérempli
« j'ai atteint la limite gratuite de **30 clients** »
(`…dashboard__layout-c7e219….js:52027`).

## 3. Ce qui est bloqué

Les chaînes mesurées disent **le scan** :

- `…_9990-…js:1494` : « pour continuer à **scanner** et inscrire de nouveaux
  clients » ;
- `…layout-c7e219….js:39089` : « au {limite}e, **le scan s'arrête** » ;
- `…_9990-…js:16196` : « Abonnez-vous pour continuer à **scanner** et à les
  faire revenir ».

Et **les clients déjà inscrits ne perdent rien** : « Votre programme fonctionne
déjà ; l'abonnement **lève la limite** » (`c02-billing.html:43501`). Le plafond
bloque la **croissance**, pas l'usage.

## 4. Ce qui n'est PAS mesuré — à ne pas inventer

1. **L'état « plafond atteint » n'a jamais été rendu.** Le seul compte capturé
   est celui d'un commerce à **1** client (calme) : `aria-valuenow="1"` partout.
   Les quatre textes existent au dictionnaire, leur écran n'existe pas.
2. **La frontière exacte : 30e ou 31e ?** Trois chaînes tirent dans deux sens :
   « gratuit **jusqu'à** 30 clients », « vous ne payez que le jour où votre
   **30e** client s'inscrit », « **au** 30e, le scan s'arrête ». Les deux
   lectures restent ouvertes : dernier inscrit accepté, ou premier refusé.
3. **La source SQL du chiffre.** Les appels observés lisent
   `rest/v1/restaurants?select=*` et `rest/v1/subscriptions` (journal réseau de
   `c01-settings`) ; le compteur, lui, est calculé côté serveur. Aucune colonne
   de compteur, aucune RPC de comptage n'a été observée. Impossible de dire si
   un client supprimé libère une place.
4. **Les seuils intermédiaires.** Les messages « Plus que N clients avant la
   limite » et « Plus que N clients : au Ne… » existent, leurs déclencheurs
   (`…layout-c7e219….js:38932` / `39014` / `39089`) ne sont pas observables.
5. **Le point de blocage côté serveur.** Que le refus soit appliqué par le scan
   ou par l'inscription publique n'est pas prouvé : la cible laisse entrer des
   cartes même quand le scan est fermé (`…_9990-…js:16561`), mais on ne sait
   pas si c'est vrai au plafond ou seulement en accès suspendu.

## 5. Conséquence pour Fidelia — et pourquoi le verrou n'est pas posé ici

Dans la cible, les deux chemins sont **séparés** : le client s'inscrit seul
(`/join`), le commerçant scanne en caisse. Le plafond ferme le second, pas le
premier — la carte continue d'arriver, le commerçant ne peut plus la faire vivre.

Dans notre socle, **il n'existe qu'un seul chemin d'inscription** :
`join_loyalty_program()` (`0003`), appelée par la page **publique**
`/join/<slug>`. Il n'y a ni scan créateur de carte, ni abonnement, ni moyen de
payer — donc **aucun état payant qui lèverait la limite**.

Conséquence, et c'est une décision, pas un oubli : **poser le verrou
aujourd'hui bloquerait le client au comptoir sans qu'aucune issue existe.** Un
commerce à 30 clients verrait sa page d'adhésion refuser, sans bouton, sans
paiement, sans recours. Ce serait de l'invention sur le chemin de l'argent —
exactement ce que la consigne interdit.

Ce qui est donc livré (mesuré, sans risque) :

- le **compteur réel** (`migrations/0012`, `plafond_clients()`), sur la même
  définition que la cible : `count(*)` des clients, un par inscription (`0003`
  crée un client **et** une carte) ;
- le **bandeau d'offre** sur **chaque** écran (mesuré : présent sur
  `c01-settings`, `c02-billing`, `d01-notifications`, `d02-clients`), avec la
  jauge, le seuil et les quatre messages de la cible ;
- la page **`/billing`** dans son état réel : offre gratuite, prix et plaque NFC
  mesurés, **sans** bouton d'activation (aucun paiement branché — un bouton qui
  ne fait rien serait le mensonge suivant).

Ce qui reste ouvert, nommé : **P0-3b — le verrou**. Il demande un état
d'abonnement (table + statut + moyen de paiement) et une décision produit : que
faire d'un commerce à 30 clients qui ne peut pas payer ? Tant que ces deux
choses n'existent pas, le compteur dit la vérité et ne ferme rien.

