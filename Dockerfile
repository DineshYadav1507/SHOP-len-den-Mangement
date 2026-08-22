FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
# The generated migration has an invalid JS quote at line 25.
# Replace that whole line deterministically before Node parses server.js.
RUN sed -i "25c\\  \"ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT ''\"," server.js
RUN node docker/patch-whatsapp.mjs
RUN node scripts/apply-media-patch.mjs
RUN mkdir -p /app/data /app/data/whatsapp /app/data/backups \
    && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
