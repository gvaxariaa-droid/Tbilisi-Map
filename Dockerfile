# ---- Build the React client ----------------------------------------------
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
# After the first install, commit package-lock.json and switch to `npm ci`.
RUN npm install --no-audit --no-fund
COPY client/ ./
ARG VITE_STREETS_TILE_URL
ARG VITE_STREETS_ATTRIBUTION
ARG VITE_SATELLITE_TILE_URL
ARG VITE_SATELLITE_ATTRIBUTION
ARG VITE_LABELS_TILE_URL
RUN npm run build

# ---- Runtime: API + static client ----------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 UPLOAD_DIR=/data/uploads CLIENT_DIST=/app/client/dist
COPY server/package*.json server/
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server/ server/
COPY --from=client /app/client/dist client/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/src/index.js"]
