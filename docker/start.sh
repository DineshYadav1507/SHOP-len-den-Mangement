#!/bin/sh
set -eu

# server.js is fully patched and validated during the Docker build.
# Do NOT mutate it again at runtime: runtime patching can create a different
# source from the image that was validated during `docker build`.
node --check /app/server.js
node -e "const fs=require('fs'); const s=fs.readFileSync('/app/server.js','utf8'); if(!s.includes('async function connectWA(')) { console.error('FATAL: connectWA missing from /app/server.js'); process.exit(1); } console.log('Runtime source validation passed')"

exec node /app/server.js
