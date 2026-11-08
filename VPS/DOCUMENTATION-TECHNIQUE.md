# 📚 DOCUMENTATION & TECHNICAL REFERENCES

Ce document regroupe l'ensemble des sources officielles, dépôts GitHub et documentations d'architecture nécessaires pour la configuration du VPS Oracle Cloud, l'orchestration Docker ARM64 et le déploiement d'OpenShip.

---

## 🚀 1. OpenShip & Solutions PaaS Auto-Hébergées

### OpenShip (Cible principale)
* **Dépôt GitHub :** [https://github.com/openship-org/openship](https://github.com/openship-org/openship)
* **Documentation & Guide de démarrage :** [https://docs.openship.io](https://docs.openship.io)
* **Code source Frontend / Dashboard :** [https://github.com/openship-org/openship/tree/main/apps](https://github.com/openship-org/openship/tree/main/apps)

### Alternatives PaaS de Référence (Secours / Comparatif)
* **Coolify (Documentation officielle) :** [https://coolify.io/docs](https://coolify.io/docs)
* **Coolify (Dépôt GitHub) :** [https://github.com/coollabsio/coolify](https://github.com/coollabsio/coolify)
* **Dokku (Documentation officielle) :** [https://dokku.com/docs/getting-started/installation/](https://dokku.com/docs/getting-started/installation/)
* **Dokku (Dépôt GitHub) :** [https://github.com/dokku/dokku](https://github.com/dokku/dokku)

---

## ☁️ 2. Oracle Cloud Infrastructure (OCI)

### Quotas & Compute Ampere A1 (ARM64)
* **Ressources Always Free (Plafonds et conditions) :** [OCI Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
* **Spécifications des instances Ampere A1 Compute :** [OCI Compute Shapes Documentation](https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm#flexible-shapes)

### Stockage & Manipulation Disque
* **Extension de partition de démarrage (Commandes Linux) :** [Extending the Partition for a Boot Volume on Linux](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/extendingbootpartition.htm)
* **Gestion des Volumes de Blocs (Block Volumes) :** [Overview of Block Volume](https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/overview.htm)

### Réseau & Sécurité Cloud
* **Listes de sécurité & Règles d'entrée (Security Lists) :** [Security Rules Documentation](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)
* **Gestion des Adresses IP publiques réservées (IP statiques) :** [Public IP Addresses](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm)
* **CLI Oracle Cloud (Automatisation d'instance) :** [OCI CLI GitHub Repository](https://github.com/oracle/oci-cli)

---

## 🐳 3. Docker & Architecture Multi-Plateforme (ARM64 / aarch64)

### Moteur & Compose
* **Installation officielle Docker Engine sur Ubuntu :** [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
* **Étapes post-installation Linux (Droits sans sudo) :** [Linux Post-installation Steps for Docker](https://docs.docker.com/engine/install/linux-postinstall/)
* **Référence du fichier Compose (Docker Compose Specification) :** [Compose Specification](https://docs.docker.com/compose/compose-file/)

### Multi-Arch & Bonnes Pratiques
* **Compilation Multi-Plateforme avec Docker Buildx :** [Docker Buildx Multi-Platform Images](https://docs.docker.com/build/building/multi-platform/)
* **Bonnes pratiques Dockerfiles Node.js de production :** [Node.js Docker Best Practices Guide](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

---

## 🛡️ 4. Système d'Exploitation (Ubuntu 24.04), Réseau & SSL

### Sécurité & Pare-Feu Linux
* **Guide officiel Ubuntu Server Iptables & Netfilter :** [Ubuntu Server Packet Filtering](https://ubuntu.com/server/docs/security-firewall)
* **Paquet Netfilter-Persistent :** [Debian / Ubuntu Package netfilter-persistent](https://manpages.ubuntu.com/manpages/noble/en/man8/netfilter-persistent.8.html)

### Certificats SSL & Domaines
* **Documentation officielle Let's Encrypt :** [Let's Encrypt Getting Started](https://letsencrypt.org/docs/)
* **Spécification du Challenge ACME HTTP-01 :** [Challenge Types - Let's Encrypt](https://letsencrypt.org/docs/challenge-types/)

---

## 🤖 5. Bloc de Contexte Technique Injectable (Pour Agent IA)

```yaml
oci_configuration:
  shape: "VM.Standard.A1.Flex"
  architecture: "aarch64 (ARM64)"
  os: "Canonical Ubuntu 24.04 LTS"
  limits:
    max_ocpu: 4
    max_ram_gb: 24
    max_boot_volume_gb: 200
  disk_resize_sequence:
    - "sudo dd iflag=direct if=/dev/oracleoci/oraclevda of=/dev/null count=1"
    - "echo '1' | sudo tee /sys/class/block/`readlink /dev/oracleoci/oraclevda | cut -d'/' -f 2`/device/rescan"
    - "sudo growpart /dev/oracleoci/oraclevda 1"
    - "sudo resize2fs /dev/oracleoci/oraclevda1"
  network:
    cloud_ingress_ports: [22, 80, 443, 3000, 8080]
    iptables_command: "sudo iptables -I INPUT 6 -m state --state NEW -p tcp -m multiport --dports 80,443,3000,8080 -j ACCEPT"
    non_interactive_env: "DEBIAN_FRONTEND=noninteractive"