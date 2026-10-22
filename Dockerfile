# syntax=docker/dockerfile:1

FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

# Le serveur est bundlé par esbuild : l'image finale n'a pas besoin de node_modules.
FROM node:25-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIST=/app/public
WORKDIR /app
COPY --from=build /app/apps/server/dist/index.cjs ./index.cjs
COPY --from=build /app/apps/client/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "index.cjs"]
