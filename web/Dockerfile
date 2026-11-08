# ============================================================================
#  Fidelix — image d'exécution, pour vérifier le site sur http://localhost:3000
#
#  Deux étapes : `build` installe, compile et **élague** ; `run` ne contient que
#  ce qui sert à répondre — pas de devDependencies, pas de `.env.local`, pas de
#  code source d'origine.
#
#  POURQUOI LES VARIABLES PUBLIQUES SONT DES `ARG`
#  `web/src/lib/supabase/config.mjs` lit `env?.[NOM_URL]` : un accès
#  **dynamique**. Next n'inline que les accès littéraux (`process.env.X`), donc
#  la valeur doit être présente au moment de la compilation pour finir dans les
#  bundles navigateur. Les passer aussi à l'exécution (compose le fait) couvre
#  les composants serveur, qui lisent `process.env` à la requête.
#
#  Ce qui n'entre PAS dans l'image : `.env.local` (cf. `.dockerignore`) et la
#  clé `service_role`. Seules les deux valeurs **publiques** sont figées ici —
#  par construction, elles sont déjà envoyées au navigateur.
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
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Le lockfile d'abord : une couche qui ne s'invalide que si les dépendances
# changent, pas à chaque modification de composant.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
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
