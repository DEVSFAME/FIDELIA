#!/bin/sh
# ============================================================================
#  Garde-fou **côté VPS** — remet les tampons d'en-têtes sur le vhost de
#  fideliatest.site. Ne recharge OpenResty **que** s'il a modifié le fichier.
#
#  Pourquoi il existe : le vhost est régénéré par OpenShip à chaque
#  déploiement, et la régénération **efface** les tampons. Mesuré le
#  2026-11-09 : après un `git push`, `grep -c proxy_buffer_size` retombait à
#  **0**, et `POST /login` repassait en `502 upstream sent too big header`.
#  Un réglage qui disparaît au déploiement suivant n'est pas un correctif —
#  d'où ce garde-fou, idempotent et silencieux quand tout est déjà en place.
#
#  Installé par `tools/rea/edge-tampons.sh --garde` sous
#  `/usr/local/bin/fidelia-edge-tampons`, appelé par cron toutes les 2 minutes
#  et au démarrage. Retrait : `sudo rm /usr/local/bin/fidelia-edge-tampons` et
#  la ligne correspondante dans `crontab -l`.
# ============================================================================
set -eu

F=/var/lib/openship/edge/sites-enabled/fideliatest-site.conf
[ -f "$F" ] || exit 0

modifie=0
if ! grep -q 'proxy_buffer_size 32k;' "$F"; then
  sed -i 's|^\( *\)proxy_pass http://127.0.0.1:20000;|\1proxy_pass http://127.0.0.1:20000;\n\1proxy_buffer_size 32k;\n\1proxy_buffers 8 32k;\n\1proxy_busy_buffers_size 64k;|' "$F"
  modifie=1
fi
if ! grep -q 'large_client_header_buffers 4 32k;' "$F"; then
  sed -i 's|^\( *\)server_name fideliatest.site;|\1server_name fideliatest.site;\n\1client_header_buffer_size 16k;\n\1large_client_header_buffers 4 32k;|' "$F"
  modifie=1
fi

[ "$modifie" = 1 ] || exit 0

if docker exec openship-edge /usr/local/openresty/bin/openresty -t >/dev/null 2>&1; then
  docker exec openship-edge /usr/local/openresty/bin/openresty -s reload >/dev/null 2>&1 || true
  echo "$(date -Is) fidelia: tampons d'en-têtes réappliqués puis OpenResty rechargé"
else
  echo "$(date -Is) fidelia: tampons réappliqués mais configuration refusée par openresty -t" >&2
fi
