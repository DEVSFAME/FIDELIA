# 🚀 TUTO — Déployer des modifications sur OpenShip (Impact Pare-Brise)

> **Objectif** : Appliquer une modif de code sur le VPS Oracle pour qu'elle soit visible sur `https://api.impactparebrises.fr/`.

---

## 📋 Prérequis

| Élément | Valeur |
|---|---|
| **IP VPS** | `141.253.120.188` |
| **User SSH** | `ubuntu` |
| **Clé SSH** | `VPS/SSH/ssh-key-2026-08-16.key` |
| **Projet local** | `Impact-parebrise 3/` (sur le Mac) |
| **Projet VPS** | `/home/ubuntu/impact-parebrise/` |
| **Service** | `backend` (port 6001, conteneur `impact-parebrise-backend`) |
| **Domaine** | `https://api.impactparebrises.fr` (edge OpenShip → proxy → :6001) |

---

## 🔁 Les 3 étapes

### 1️⃣ Transférer les fichiers (`scp`)

```bash
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  ./fichier/modifié.html \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/chemin/cible/
```

**Exemples :**
```bash
# Fichiers admin :
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  "Impact-parebrise 3/backend/admin/login.html" \
  "Impact-parebrise 3/backend/admin/login.css" \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/admin/

# server.js :
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  "Impact-parebrise 3/backend/server.js" \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/

# package.json (si nouvelles dépendances) :
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  "Impact-parebrise 3/backend/package.json" \
  "Impact-parebrise 3/backend/package-lock.json" \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/
```

### 2️⃣ Rebuild l'image Docker

```bash
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "cd /home/ubuntu/impact-parebrise && docker compose -f docker-compose.yml build --no-cache backend"
```

> `--no-cache` obligatoire : HTML/CSS/JS ne déclenchent pas de cache-bust Docker.

### 3️⃣ Redéployer le conteneur

```bash
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "cd /home/ubuntu/impact-parebrise && docker compose -f docker-compose.yml up -d --no-deps --force-recreate backend"
```

- `--no-deps` : ne pas toucher au frontend
- `--force-recreate` : forcer la recréation
- Les **volumes** (`backend-data`, `backend-uploads`) sont préservés → données intactes

### 🧹 Optionnel : nettoyer les images

```bash
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 "docker image prune -f"
```
---

## 📦 Commande tout-en-un

```bash
scp -i "VPS/SSH/ssh-key-2026-08-16.key" <fichiers...> ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/admin/ && \
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "cd /home/ubuntu/impact-parebrise && \
   docker compose -f docker-compose.yml build --no-cache backend && \
   docker compose -f docker-compose.yml up -d --no-deps --force-recreate backend && \
   docker image prune -f && \
   docker ps --filter name=impact-parebrise-backend --format '{{.Status}}'"
```

---

## 🧪 Vérifier le déploiement

```bash
# Conteneur healthy ?
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "docker ps --filter name=impact-parebrise-backend --format '{{.Status}}'"

# API publique OK ?
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.impactparebrises.fr/api/services

# Login accessible ?
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.impactparebrises.fr/login.html
```

---

## 🏗️ Arborescence du projet sur le VPS

```
/home/ubuntu/impact-parebrise/
├── docker-compose.yml          ← orchestration Docker
├── backend/
│   ├── Dockerfile              ← build image backend
│   ├── server.js               ← Express (port 6001) + middleware JWT
│   ├── package.json            ← dépendances Node
│   ├── admin/
│   │   ├── index.html          ← dashboard
│   │   ├── login.html          ← page connexion
│   │   ├── login.css           ← styles connexion
│   │   ├── admin_config.js     ← config API
│   │   ├── admin_script.js     ← logique dashboard
│   │   ├── admin_styles.css    ← styles dashboard
│   │   └── logo.png            ← logo
│   ├── data/                   ← volume Docker (persistant)
│   │   ├── rendezvous.json
│   │   ├── clients.json
│   │   └── impact_parebrise.db
│   └── image-login.jpg         ← fond page login
└── frontend/                   ← (servi par Hostinger)
```

---

## ⚡ Cas le plus fréquent

Modifier login.html et/ou login.css → déployer :

```bash
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  "Impact-parebrise 3/backend/admin/login.html" \
  "Impact-parebrise 3/backend/admin/login.css" \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/admin/ && \
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "cd /home/ubuntu/impact-parebrise && \
   docker compose -f docker-compose.yml build --no-cache backend && \
   docker compose -f docker-compose.yml up -d --no-deps --force-recreate backend && \
   docker image prune -f"
```

---

## 🚨 Cas particuliers

### Nouvelle dépendance npm
```bash
cd "Impact-parebrise 3/backend" && npm install      # → met à jour package-lock.json
scp -i "VPS/SSH/ssh-key-2026-08-16.key" \
  "Impact-parebrise 3/backend/package.json" \
  "Impact-parebrise 3/backend/package-lock.json" \
  ubuntu@141.253.120.188:/home/ubuntu/impact-parebrise/backend/
# Puis rebuild (le Dockerfile exécute npm ci)
```

### Nouvel asset public (image, font...)
- Ajouter le fichier à la liste d'exclusion du middleware `requireAuth` dans `server.js` (ligne ~294) :
  ```js
  if (req.path === '/login.html' || req.path === '/login.css' || req.path === '/logo.png') return next();
  ```
- Transférer l'asset + `server.js` modifié

---

## 🔑 Commandes SSH utiles

```bash
# Connexion interactive
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188

# Logs backend (50 dernières lignes)
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "docker logs impact-parebrise-backend --tail 50"

# Conteneurs actifs
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 "docker ps"

# Redémarrer sans rebuild
ssh -i "VPS/SSH/ssh-key-2026-08-16.key" ubuntu@141.253.120.188 \
  "cd /home/ubuntu/impact-parebrise && docker compose -f docker-compose.yml restart backend"
```