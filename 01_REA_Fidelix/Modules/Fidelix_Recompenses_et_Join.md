---
type: rea
status: done
module: recompenses
tags: [rea, fidelix, client-final, join, wallet]
updated: 2026-10-26
---

# Récompenses publiques & adhésion client

Sources : `raw/pages/p10-recompense-resto.html`, `p11-…-barbier.html`,
`p12-…-clinique.html`, `p17-join.html`, `p18-sitemap.html`,
`raw/assets/_next_static_chunks_app_recompenses_%5Bslug%5D_page-*.js`,
`…_app_join_%5Bslug%5D_page-*.js`.

## 1. `/recompenses/<slug>` — la vitrine du programme

**27 slugs publics** (sitemap capturé `p18-sitemap.html`) :

```
resto-j96n · darb-side-vc8v · evsd-xtjg · cafe-test-cei3 ·
la-table-du-burger-akc9 · dominos-pizza-o5gn · club-warda-9db4 · starhair-u4lu ·
orange-cuisine-1b98 · adn-restaurant-gluf · l-os-italiano-0nru · salon-pato-5vu7 ·
twin-a226 · bubbles-ew1p · rim-qfiz · 9hwa-jv2d · thami-village-kq41 ·
boucherie-taha-bckv · pryysm-gd19 · belati-luex · burger-chwaya-qfv8 ·
gentleman-barbershop-by-youri-nv71 · rawi-5l9c · le-bricolage-facile-nu2j ·
chami-bizm · eurosmile-clinic-egro · rapid-aut-04fo
```

Structure observée (exemple barbier) :

```
Carte de fidélité — <Nom du commerce>
<title> Récompenses — <Nom>
Programme de fidélité · <Nom>
"45 points = Boisson offerte"          ← accroche calculée (1er palier)
Vos récompenses / Ce que vous allez gagner
1  Boisson offerte   Soda, jus ou café au choix   45
2  Dessert offert    Tiramisu, panna cotta…       75
3  Plat offert       Pizza ou pasta au choix     120
4  Menu complet      Entrée, plat et dessert     200
[Obtenir ma carte gratuite]
"Gratuit, sans application à installer."
Propulsé par <Fidelix>
```

⇒ **Le menu de paliers est public** (numéro, intitulé, description, coût).
C'est une **donnée du commerçant exposée sans authentification** : à reproduire
tel quel, mais c'est aussi une surface de scraping (à noter côté produit).

Trois verticales différentes confirment que le modèle est générique :
restauration (`resto-j96n`), barbier (`gentleman-…`), clinique (`eurosmile-clinic-egro`).

## 2. `/join/<slug>` — adhésion sans identité

Champs mesurés (`p17-join.html`) :

| Champ | Obligatoire | Note du produit |
|---|---|---|
| **Qui vous a servi ?** | facultatif | liste d'employés (Youssef, Salma, Karim, anas, Reda, yassin) ⇒ **attribution d'employé à l'adhésion** |
| **Date de naissance** | facultatif | « Pour recevoir une attention le jour de votre anniversaire. Rien d'autre. » |
| CGU + confidentialité | **obligatoire** | deux cases |
| Email | **conditionnel** | « Si vous ne faites pas de campagnes, il n'a même rien à saisir » |

Phrase clé (contradiction apparente à trancher) :

> « **Rien ne vous est demandé : ni nom, ni email, ni téléphone.** Votre carte est
> identifiée par un code, et c'est tout ce que *<le commerce>* verra de vous. »
> puis « **Aucune donnée personnelle n'est collectée.** »

⇒ Le formulaire d'adhésion **n'exige pas d'email** (contrairement au guide §04 qui
décrit « laisse son email — et rien d'autre »). Les deux textes cohabitent : la
collecte d'email est **optionnelle et pilotée par un réglage du commerçant**
(guide §10 : « vous pouvez couper la collecte depuis *Données clients* »).

**Conséquence architecturale majeure** : l'identité du client final est un **code**
(`C-XXXXXX`), pas une personne. Le clone doit donc séparer :
`customer` (code, solde, historique) ↔ `contact` (email/téléphone, chez Fidelix).

## 3. Mécanique d'adhésion

- RPC Supabase capturée : **`rpc("join_loyalty_program")`** (1 occurrence,
  chunk `app_join_[slug]/page`). Arguments **non observés**.
- Récompense affichée dès l'adhésion : « 45 points = Boisson offerte » ⇒ le
  **premier palier sert d'accroche**.
- Promesse : « Votre carte en 30 secondes », « Gratuit, sans appli à installer ».

## 4. Ce qui manque

- [ ] Sortie réelle de `join_loyalty_program` (id de carte ? URL de pass ?).
- [ ] Génération des pass **Apple** et **Google** (endpoints non observés).
- [ ] Page `/card/<id>` (déclarée au `robots.txt`, 404 sur id factice) : c'est
      probablement la **carte publique** — contrat inconnu.
- [ ] `/r/<id>` : probablement un **lien court** de carte/parrainage — inconnu.
- [ ] Comportement quand le programme est en **tampons** (la page mesurée est en points).
