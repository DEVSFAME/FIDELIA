# Déploiement — `fideliatest.site` sur OpenShip

> **État (2026-11-08) :** le dépôt est **prêt**, le déploiement n'est **pas
> fait**. Ce document sépare ce qui est livré dans le code de ce qui exige un
> accès que l'agent n'a pas (console OpenShip, zone DNS OVH, tableau Supabase).

## 1. Ce que le QR encode, exactement

La plaque du comptoir encode `urlAdhesion(origine, slug)` → `<origine>/join/<slug>`
(`web/src/lib/qr.mjs`, page `/(dashboard)/qrcode`). L'origine est décidée dans
cet ordre (`web/src/lib/confirmation.mjs`) :

| Rang | Source | Conséquence |
|---|---|---|
| 1 | `NEXT_PUBLIC_SITE_URL` | origine **figée** : `https://fideliatest.site` |
| 2 | `x-forwarded-host` / `host` | hôte de la requête — **interne** derrière l'edge |
| 3 | aucune des deux | pas de QR affiché (« Adresse publique indéterminée ») |

D'où la règle : **en production la variable n'est pas optionnelle**. Sans elle,
un hôte interne en `https` serait encodé tel quel dans l'affiche ; un hôte
interne en `http` est refusé (`validerUrl`), donc pas de QR du tout.

## 2. Livré dans le code (rien à faire)

| Fichier | Contenu |
|---|---|
| `openship.json` | `rootDirectory: web`, `runtime: docker`, `port: 3000`, `domains: [fideliatest.site]`, `env.NEXT_PUBLIC_SITE_URL` |
| `docker-compose.yml` | le service `web` reçoit `NEXT_PUBLIC_SITE_URL` **à l'exécution** |
| `web/.env.example` | le nom est documenté, la valeur reste vide (modèle versionné) |
| `web/.env.local`, `.env` | `NEXT_PUBLIC_SITE_URL=https://fideliatest.site` (gitignorés) |
| `web/src/i18n/dictionnaires.mjs` | `marque.domaine` = `fideliatest.site` |
| `tools/rea/tests/domaine-public.test.mjs` | 7 gardes (origine, compose, manifeste, dérive de domaine) |

La variable est lue **à la requête** (`env?.[NOM_ORIGINE]`, accès dynamique non
inliné par Next) : la changer ne demande pas de rebuild, seulement un
redémarrage du conteneur.

## 3. DNS — la zone est chez OVH

Les serveurs de noms annoncés (`dns103.ovh.net`, `ns103.ovh.net`) confirment que
la zone `fideliatest.site` est **éditable dans l'espace client OVH**, onglet
*Noms de domaine → fideliatest.site → Zone DNS*. Ne pas la déléguer ailleurs :
c'est la zone où OpenShip attend ses enregistrements.

Les enregistrements exacts sont **affichés par OpenShip** quand le domaine est
ajouté (bouton *Domains → Add domain*) — il ne faut pas les deviner. Deux formes
selon la cible de déploiement :

| Cible | Enregistrement apex `fideliatest.site` | `www` |
|---|---|---|
| **Votre serveur** (OpenShip self-hosted, runtime `server`) | `A` → IPv4 publique du serveur | `A` → même IPv4, ou `CNAME` → `fideliatest.site` |
| **OpenShip Cloud** | `A` ou `CNAME` vers la cible fournie | `CNAME` → cible fournie |

Champs OVH : *Type* = `A`, *Sous-domaine* = vide (apex) ou `www`, *Cible* = la
valeur donnée par OpenShip, *TTL* par défaut. Supprimer tout `A`/`CNAME`
préexistant sur le même nom (OVH en pose un par défaut à l'achat) : un doublon
fait échouer la vérification sans message clair.

Puis *Verify* dans OpenShip : il vérifie le DNS, demande le certificat Let's
Encrypt et bascule en `Active`. La propagation peut prendre de quelques minutes
à 48 h ; c'est la cause n°1 des échecs.

## 4. Déploiement OpenShip — la séquence

1. **Source.** OpenShip construit depuis un dépôt Git ou un dossier local.
   `FIDELIX/` n'est **pas** versionné aujourd'hui (`git ls-files FIDELIX` → 0
   fichier) : il faut d'abord pousser `FIDELIX` comme dépôt à lui seul (le
   dépôt de l'espace de travail est `DEVSFAME/UNICITY`, il ne doit pas servir de
   source : il embarque d'autres projets).
2. **Projet.** *New project* → source = ce dépôt → OpenShip détecte `nextjs`,
   puis `openship.json` impose `rootDirectory: web` et le Dockerfile.
3. **Variables** (onglet *Configuration*), avant le premier déploiement :

   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://fideliatest.site` |
   | `NEXT_PUBLIC_SUPABASE_URL` | celle de `web/.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem (clé **anon**, jamais `service_role`) |

   Aucune n'est un secret. Ne **jamais** poser `SUPABASE_SERVICE_ROLE_KEY` sans
   besoin : elle contourne RLS et les `REVOKE` de `0001`.
4. **Domaine.** *Domains → Add domain* → `fideliatest.site` → copier les
   enregistrements dans la zone OVH → *Verify*. `www` s'ajoute via *Include www*
   si l'on veut la redirection 301.
5. **Déployer**, puis vérifier (section 6).

## 5. Réglages hors dépôt — indispensables au QR

**Supabase → Authentication → URL Configuration :**

- *Site URL* : `https://fideliatest.site`
- *Redirect URLs* : ajouter `https://fideliatest.site/**`

Sans ces deux lignes, `emailRedirectTo` n'est pas honoré : GoTrue retombe
silencieusement sur l'URL de site du projet et les liens de courriel n'arrivent
pas sur `/auth/confirm`. C'est un réglage de console, pas de code.

**Migrations.** `0009`→`0016` ne sont **pas** exécutées en base (mesuré le
2026-11-03, `PGRST202`). Le site démarre sans elles, mais `/join/<slug>` dépend
de `0003` (passée) et le champ « Qui vous a servi ? » de `0009` (absente). Le QR
fonctionne ; c'est l'attribution des cartes aux caisses qui reste à 0.

## 6. Vérification après déploiement

```bash
# 1. Le domaine répond et redirige en HTTPS
curl -sI https://fideliatest.site/login | head -5

# 2. La page d'adhésion existe (cible du QR) — 200, pas 404
curl -s -o /dev/null -w '%{http_code}\n' https://fideliatest.site/join/cafe-test-cei3

# 3. Le QR encode le domaine : dans le tableau de bord, /qrcode affiche
#    https://fideliatest.site/join/<slug> sous le code. Scanner l'affiche avec
#    un téléphone (pas depuis le navigateur qui l'a produite) est la seule
#    preuve qui compte.
```

Si `/qrcode` affiche « Adresse publique indéterminée », c'est que
`NEXT_PUBLIC_SITE_URL` n'a pas atteint le conteneur : vérifier l'onglet
*Configuration*, puis redémarrer le déploiement (la variable est lue à la
requête, aucun rebuild n'est nécessaire).
