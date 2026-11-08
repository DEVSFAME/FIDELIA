---
type: rea
status: partiel
module: ia
tags: [rea, fidelix, fidelia, ia]
updated: 2026-10-26
---

# Fidelia AI (conseiller)

## 1. Ce que le produit en dit (`/guide` §09 et FAQ)

> « Le **conseiller IA** lit ces données pour vous et vous dit quoi faire cette
> semaine : **qui relancer, quelle récompense ajuster, quel jour envoyer**.
> Il **ne voit jamais l'identité de vos clients — seulement des nombres**. »

Trois KPI sont nommés comme entrées : **cartes actives**, **taux de retour**,
**récompenses remises**. La sortie est un **plan d'action hebdomadaire**, pas un chat.

## 2. Contrat observé (libellés seulement)

| Élément | Preuve |
|---|---|
| `"/api/fidelia"` | 1 occurrence (chunk dashboard layout) |
| `"/api/fidelia?resume=1"` | 1 occurrence |
| `"Fidelia AI"`, `"Ouvrir Fidelia AI"`, `"Fermer Fidelia AI"` | libellés du shell |
| `"Ouvrir Fidelia AI — une action urgente vous attend"` | **badge d'urgence** |
| `"Fidelia est indisponible pour le moment."` | état d'erreur explicite |

Lecture :
- `?resume=1` = mode **résumé** (chargement initial ou rafraîchissement), distinct
  du mode conversation/action.
- Le badge « action urgente » implique un **état calculé côté serveur** et mis en
  cache côté client (probablement revalidé à l'ouverture du dashboard).
- L'indisponibilité est **gérée dans l'UI** (message dédié) ⇒ dépendance à un
  fournisseur externe, avec dégradation propre.

## 3. Ce qui n'est pas observé (et ne doit pas être inventé)

- Modèle utilisé, prompt système, format de réponse.
- Politique de confidentialité effective côté serveur (l'affirmation « ne voit que
  des nombres » est une **promesse produit**, pas une preuve technique).
- Fréquence de génération, coût, quota.
- Mémoire entre sessions.

## 4. Ce que la Phase 1 doit mesurer

- [ ] Corps de requête (`resume` vs conversation) et forme de réponse.
- [ ] Source des KPI (vue SQL ? RPC ? calcul serveur ?) — **sans lire de données
      réelles** : observer la requête, pas le résultat d'autrui.
- [ ] Déclencheur du badge « action urgente ».
- [ ] Rendu du panneau (position, taille, interaction) pour la fidélité pixel.

## 5. Lien avec la reconstruction

C'est le module le plus **coûteux à parité** : son intérêt dépend d'un modèle et
d'un historique de données. Recommandation : le traiter **après** le socle
(transactions, KPI) et le livrer avec un mode dégradé explicite, comme l'original.
