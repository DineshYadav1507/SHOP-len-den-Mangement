#!/bin/sh
set -eu

# Final runtime guard: the image can only start after the WhatsApp/source
# transformation has been applied to the exact server.js that Node will load.
node /app/docker/patch-whatsapp.mjs
node --check /app/server.js
node -e "const fs=require('fs'); const s=fs.readFileSync('/app/server.js','utf8'); if(!s.includes('async function connectWA(')) { console.error('FATAL: connectWA missing from /app/server.js'); process.exit(1); }"

exec node /app/server.js
