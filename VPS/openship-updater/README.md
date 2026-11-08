# OpenShip Updater (backup)

Copie de sauvegarde des fichiers de `~/openship-updater/` sur le VPS Oracle
(`141.253.120.188`, user `ubuntu`).

## Rôle

`openship_updater.py` est exécuté par le timer systemd `openship-updater.timer`
(toutes les 6 h, politique `advisory`). Il détecte les avis de mise à jour
OpenShip (`release-advisories.json`) et applique `openship update` si nécessaire.

## 🛡️ Réconciliation anti-`Created` (fix 2026-10-07)

`openship update` peut **avorter à mi-chemin** et laisser les conteneurs
`api` + `edge` en état `Created` (jamais démarrés) → **edge DOWN → sites en
HTTP 000** (cf. `lesson-learned.md` §5).

Le script **réconcilie désormais toujours** la stack après une mise à jour :

1. `list_stuck_containers()` — contrôle `docker ps -a` (`Created`/`Exited`).
2. `core_stack_status()` / `_stuck_core_names()` — statut **scopé** au projet
   Compose `openship` (via `docker compose ps -a`), pour ne pas confondre les
   conteneurs d'apps (`openship-<projet>-*`) avec la stack core.
3. `_compose_up()` — `docker compose up -d` dans `~/.openship/compose`
   (commande fiable §5).
4. `reconcile_stack(force=False)` — **phase 1** `up -d` ; **phase 2** (fallback)
   `docker rm -f` des conteneurs core bloqués + `up -d`. **No-op** si la stack
   est saine (zéro impact prod), **data-safe** (volumes nommés intacts).

Câblage : `main()` appelle `reconcile_stack()` **après chaque** `run_update()`
(quel que soit le code retour), un **pre-flight self-heal** répare un état
`Created` résiduel en début de `--apply`.

## Usage

```bash
python3 openship_updater.py --check      # détection seule (dry-run)
python3 openship_updater.py --apply      # détection + update (systemd)
python3 openship_updater.py --force      # update forcé
python3 openship_updater.py --reconcile  # self-heal de la stack seul (ops)
```

## Tests

```bash
cd ~/openship-updater && python3 -m unittest test_openship_updater
# 24 tests — OK
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `openship_updater.py` | Script principal (I/O : HTTP, docker, CLI, lock, state) |
| `updater_core.py` | Logique pure/déterministe (semver, advisories) — sans I/O |
| `test_openship_updater.py` | Tests unitaires (`unittest` + `mock`) |
| `openship-updater.service` | Unité systemd (`ExecStart=... --apply`) |
| `openship-updater.timer` | Timer systemd (`OnUnitActiveSec=6h`, `Persistent=true`) |
