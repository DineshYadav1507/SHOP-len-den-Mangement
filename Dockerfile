FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
# Repair the generated migration before parsing server.js.
RUN sed -i "25c\\  \"ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT ''\"," server.js
# Apply media integration first, then the WhatsApp patch last.
RUN node scripts/apply-media-patch.mjs
RUN node docker/patch-whatsapp.mjs
# Validate the exact source that will be shipped in the image.
RUN node --check server.js \
    && node -e "const fs=require('fs'); const s=fs.readFileSync('server.js','utf8'); if(!s.includes('async function connectWA(')) process.exit(1); console.log('server.js validation passed: connectWA present')"
RUN chmod +x /app/docker/start.sh \
    && mkdir -p /app/data /app/data/whatsapp /app/data/backups \
    && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/docker/start.sh"]
