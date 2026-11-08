#!/usr/bin/env sh
# ============================================================================
#  Tampons d'en-têtes de l'edge — fideliatest.site. **Idempotent.**
#
#  Mesure du 2026-11-09 : `POST /login` rendait **502** avec, dans le journal de
#  l'edge, `upstream sent too big header while reading response header from
#  upstream`. La connexion **réussissait** côté application ; c'est le bloc
#  `Set-Cookie` de la session Supabase qui dépassait le défaut d'OpenResty (4 k).
#  Preuve contrôlée, même code, seule la taille du jeton change :
#      métadonnée   296 o -> POST /login 200
#      métadonnée 2 680 o -> POST /login 502   (puis 200 après ce script)
#
#  Le vhost est **auto-généré** par OpenShip (`openship-vhost-gen: 4`) et ne
#  déclare aucun tampon. Après toute régénération (déploiement qui réécrit les
#  routes, `routing/retry`), rejouer ce script — puis revérifier avec :
#      ssh -i VPS/SSH/... ubuntu@… "sudo grep -c proxy_buffer_size \
#        /var/lib/openship/edge/sites-enabled/fideliatest-site.conf"   # => 2
#
#  Usage : depuis la racine du dépôt FIDELIX, `sh tools/rea/edge-tampons.sh`
# ============================================================================
set -eu

HOTE="${HOTE:-ubuntu@141.253.120.188}"
CLE="${CLE:-VPS/SSH/ssh-key-2026-08-16.key}"

[ -f "$CLE" ] || { echo "clé absente : $CLE" >&2; exit 1; }

ssh -o StrictHostKeyChecking=no -i "$CLE" "$HOTE" 'sudo sh -s' <<'DISTANT'
set -eu
F=/var/lib/openship/edge/sites-enabled/fideliatest-site.conf
[ -f "$F" ] || { echo "vhost absent : $F" >&2; exit 1; }

# En-têtes de réponse (le Set-Cookie de session) — un par bloc `location /`.
if ! grep -q 'proxy_buffer_size 32k;' "$F"; then
  sed -i 's|^\( *\)proxy_pass http://127.0.0.1:20000;|\1proxy_pass http://127.0.0.1:20000;\n\1proxy_buffer_size 32k;\n\1proxy_buffers 8 32k;\n\1proxy_busy_buffers_size 64k;|' "$F"
  echo "tampons de réponse ajoutés"
else
  echo "tampons de réponse déjà présents"
fi

# En-têtes d'entrée (le cookie revient dans la requête) — un par bloc `server`.
if ! grep -q 'large_client_header_buffers 4 32k;' "$F"; then
  sed -i 's|^\( *\)server_name fideliatest.site;|\1server_name fideliatest.site;\n\1client_header_buffer_size 16k;\n\1large_client_header_buffers 4 32k;|' "$F"
  echo "tampons d’entrée ajoutés"
else
  echo "tampons d’entrée déjà présents"
fi

docker exec openship-edge /usr/local/openresty/bin/openresty -t 2>&1 | tail -1
docker exec openship-edge /usr/local/openresty/bin/openresty -s reload 2>&1 | grep -i 'signal process started' || true

# Relecture : deux `location /` (80 et 443) => deux tampons de réponse.
echo -n 'proxy_buffer_size déclarés : '
grep -c 'proxy_buffer_size 32k;' "$F"
echo -n 'large_client_header_buffers déclarés : '
grep -c 'large_client_header_buffers 4 32k;' "$F"
DISTANT
