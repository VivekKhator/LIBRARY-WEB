# BiblioBazaar runs as a single long-lived Node process with SQLite on a mounted volume.
# Works as-is on Render, Railway, Fly.io, Cloud Run (with a volume), or any Docker host.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/library.db \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

# No runtime dependencies: the manifest is only needed for "type": "module" and scripts.
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts

# Durable state lives on the volume, owned by the unprivileged runtime user.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
VOLUME ["/data"]
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
