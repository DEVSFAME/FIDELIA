# `tools/rea` — outillage REA puis reconstruction

Outils du projet Fidelix. Deux familles, une même règle : **une mesure ne dit
jamais plus que ce qu'elle a mesuré**. Ce qui n'est pas mesuré est écrit
`non_mesure`, jamais comblé par une supposition.

## Conventions

- **Node 22**, modules ES (`.mjs`), zéro dépendance npm.
- **Logique pure** dans un module (`base.mjs`, `durcissement.mjs`…), **entrée/sortie**
  dans un CLI (`sonder-base.mjs`, `verifier-durcissement.mjs`…). C'est ce qui rend
  les tests hors ligne possibles.
- **Tests** : `tools/rea/tests/*.test.mjs`, exécutés par
  `node --test tools/rea/tests/*.test.mjs`. Aucun réseau, aucun secret.
- **Secrets** : lus depuis `env.supabase.md` (gitignoré), jamais écrits dans une
  sortie. Les artefacts sont vérifiés par `aucunSecret()` avant écriture.
- **Artefacts** : `01_REA_Fidelix/_captures/<date>-<passe>/`, empreintés (SHA-256).

## Capture et mesure de la cible

| Outil | Rôle |
|---|---|
| `capturer-fidelix.mjs` | Capture HTTP rejouable (SHA-256, `--verifier`) |
| `capturer-rendu.mjs` | Capture du rendu (DOM) d'une page |
| `ouvrir-session.mjs` | Obtient une session par action humaine (`--attendre`) |
| `session.mjs` | Préflight : la session est-elle réellement active ? |
| `decouvrir-cibles.mjs` | Découverte de sous-routes (href, RSC, XHR) |
| `empreinte.mjs` | Empreinte de contenu (pas d'octets), `variantes: N` |
| `analyser-fidelix.mjs` | Analyse du corpus capturé |
| `relever-contrats.mjs` / `contrats.mjs` | Contrats d'API lus dans les bundles |
| `relever-caisse.mjs` / `caisse.mjs` | Mécanique hors ligne de la caisse |
| `relever-wallet.mjs` / `wallet.mjs` | Contrat des pass Apple/Google |
| `relever-fidelia.mjs` / `fidelia.mjs` | Conseiller Fidelia : entrées, garde-fous |
| `modele.mjs` / `mesurer-modele.mjs` | Modèle de données de la cible |
| `verifier-lien-client.mjs` | Vérifie qu'un lien profond rend bien une page |

## Base de reconstruction

| Outil | Rôle |
|---|---|
| `base.mjs` | Modèles de référence + comparaison (`comparerModele`, `estConforme`) |
| `sonder-base.mjs` | **R0** — sonde `GET` seule : OpenAPI, tables, colonnes, `anon` vs `service_role` |
| `durcissement.mjs` | **R1.2** — analyse statique de la migration de durcissement |
| `verifier-durcissement.mjs` | **R1.2** — CLI : verdict sur le DDL |

### R1.2 — ce que `verifier-durcissement.mjs` prouve, et ce qu'il ne prouve pas

```bash
node tools/rea/verifier-durcissement.mjs
# -> VERDICT : CONFORME | NON CONFORME   (exit 0 | 1)
```

Il lit `migrations/0001_acl_rls_durcissement.sql` et vérifie **neuf
invariants**, dont trois qui correspondent à des erreurs réelles :

1. **`REVOKE … FROM anon` sans `FROM PUBLIC`** → signalé. Le droit vient de
   `PUBLIC`, pas de `anon` : révoquer `anon` seul ne retire rien.
2. **`REVOKE … FROM PUBLIC` sans `GRANT … TO service_role`** → signalé. Si
   `service_role` tenait son droit de `PUBLIC`, le révoquer casserait le backend.
3. **`FORCE ROW LEVEL SECURITY`** → signalé. `FORCE` soumet aussi le
   propriétaire ; une fonction `SECURITY DEFINER` passerait sous RLS et
   casserait les RPC.

Plus : périmètre exact (2 RPC, 3 tables — ni moins ni plus), aucune politique
permissive inventée, aucun `GRANT` de table à un rôle fermé, et
`join_loyalty_program` présent **en commentaire seulement** (elle n'existe pas
en base : un `REVOKE` sur un objet absent ferait échouer la transaction).

**Fichier unique depuis le 2026-10-31.** `0002_r2_execute_rpc.sql` est absorbée
dans `0001` : la sonde a mesuré qu'`anon` exerce déjà les deux RPC d'écriture,
donc `0001` révoque PUBLIC **puis** accorde à `anon`, `authenticated` et
`service_role`. Les deux fichiers se contredisaient sur les `EXECUTE`, et
l'ordre d'exécution décidait si l'application écrivait — un piège d'ordre, que
`durcissement.test.mjs` garde désormais fermé (aucun rôle fermé ne perd son
droit sans le retrouver dans le même fichier).

> ⚠️ **Ce qu'il ne prouve pas.** Le DDL porte les invariants ; il ne dit rien de
> l'effet en base. Vérifier l'effet demanderait d'**exécuter** la migration, ou
> d'interroger `pg_policies` — hors périmètre. Le CLI l'écrit dans son verdict,
> pour que personne ne confonde « conforme » et « appliqué ».
