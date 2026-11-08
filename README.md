# FIDELIX — Reverse Engineering & reconstruction isofonctionnelle

> Projet **séparé** du projet `UNICITY/` (clone d'Onify). Aucun fichier de suivi n'est
> partagé : ce dossier possède son propre `PROGRESS.md`, ses propres leçons et son
> propre vault de preuves.

## En 5 secondes

| Question | Réponse | Preuve |
|---|---|---|
| Que reconstruit-on ? | `https://fidelix.ma` — SaaS de fidélité (Maroc) : carte wallet, scan en caisse, récompenses, automatisations | `01_REA_Fidelix/_captures/2026-10-26/manifeste.json` |
| Sur quoi tourne la cible ? | **Next.js (App Router) sur Vercel**, région `fra1`, backend **Supabase** | en-têtes HTTP + bundles capturés |
| Où en est l'analyse ? | **Phase 0 (surface publique) terminée et prouvée.** L'intérieur du dashboard est **non capturé** faute de session | `PROGRESS.md` |
| Quelle est la prochaine action ? | `node tools/rea/ouvrir-session.mjs --attendre 300` — tu te connectes dans la fenêtre, rien ne m'est transmis | `tasks/active_context.md` |

## Arborescence

```
FIDELIX/
├── PROGRESS.md              suivi (axe directeur, statut, backlog)
├── lesson-learned.md        règles actionnables + pièges mesurés
├── README.md                ce fichier
├── docs/                    PRD, architecture, stack
├── tasks/                   plan de tâches + contexte actif
├── tools/rea/               capturer-fidelix.mjs · capturer-rendu.mjs · ouvrir-session.mjs
│                            session.mjs (résolution de session, 1 seule règle)
│                            tests/ (node --test, 11 tests)
└── 01_REA_Fidelix/          vault de preuves (Obsidian-compatible)
    ├── _Index_REA.md
    ├── Global/              serveur, auth, API, design system, méthode
    ├── Modules/             marketing, caisse, récompenses, shell, IA
    ├── UI/                  parcours publics
    └── _captures/2026-10-26/  raw/ (octet à octet) + manifeste + contrats
```

## Rejouer les preuves

```bash
cd FIDELIX
node tools/rea/capturer-fidelix.mjs            # rejoue la passe (anonyme)
node tools/rea/capturer-fidelix.mjs --verifier # compare les empreintes
node tools/rea/analyser-fidelix.mjs            # régénère contrats.json
```

Une session se fournit par **l'une des trois voies**, sans jamais la passer en
argument de ligne de commande :

```bash
node tools/rea/ouvrir-session.mjs --attendre 300   # voie 1 — tu te connectes, la session va dans .profil-rea/
# voie 2 — FIDELIX_COOKIE=… dans FIDELIX/.env
# voie 3 — Chrome connecté + --remote-debugging-port=9222 (capturer-rendu.mjs --cdp)

node tools/rea/capturer-fidelix.mjs --preflight --manifeste 01_REA_Fidelix/_captures/cibles-auth.json
node --test tools/rea/tests/session.test.mjs       # 11 tests, hors ligne
```

Le profil `.profil-rea/` est lu **automatiquement** par `capturer-fidelix.mjs`
dès qu'il contient un cookie d'authentification : la voie 1 suffit donc, sans
recopier de cookie. Une session présente mais expirée est **refusée** (`/api/me`
doit répondre 200 avant toute écriture).
