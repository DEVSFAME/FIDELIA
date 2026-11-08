# ============================================================================
#  Fidelia — image d'exécution construite depuis la RACINE du dépôt.
#
#  Pourquoi un second Dockerfile : `web/Dockerfile` attend un contexte `web/`
#  (c'est ce que `docker-compose.yml` envoie). OpenShip, lui, streamé le dépôt
#  entier comme contexte — mesuré le 2026-11-08 : « load remote build context »
#  puis `COPY package.json` → `"/package.json": not found`. Ce fichier-ci est
#  l'équivalent exact, avec des chemins préfixés `web/`. Les deux doivent rester
#  alignés ; le commentaire long des `ARG` vit dans `web/Dockerfile`.
# ============================================================================
# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
#  1. Compilation
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Le lockfile d'abord : une couche qui ne s'invalide que si les dépendances
# changent, pas à chaque modification de composant.
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build \
 && npm prune --omit=dev

# ---------------------------------------------------------------------------
#  2. Exécution
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS run

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Un utilisateur non privilégié : l'image ne sert que des requêtes HTTP.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next          ./.next
COPY --from=build --chown=nextjs:nodejs /app/public         ./public
COPY --from=build --chown=nextjs:nodejs /app/node_modules   ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package.json   ./package.json
COPY --from=build --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

USER nextjs
EXPOSE 3000

# « Le conteneur tourne » n'est pas « le site répond ». La sonde lit une vraie
# page : 5xx = rouge, 2xx/3xx/4xx = le serveur répond.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
