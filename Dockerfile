# The API server, also serving the website: one container for both.
#   docker build -t recallr .
#   docker run -p 4000:4000 --env-file server/.env recallr
# Database migrations run when the container starts.

# ---------- Website ----------
FROM node:20-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN NODE_ENV=production npm run build

# ---------- Server ----------
FROM node:20-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---------- Runtime ----------
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000 WEB_DIST=/app/web-dist
WORKDIR /app/server
COPY --from=server --chown=node:node /app/server/dist ./dist
COPY --from=server --chown=node:node /app/server/node_modules ./node_modules
COPY --from=server --chown=node:node /app/server/prisma ./prisma
COPY --from=server --chown=node:node /app/server/package.json ./
COPY --from=web --chown=node:node /app/web/dist /app/web-dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["npm", "run", "start:prod"]
