#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/shoplenden
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine + Compose plugin first."
  exit 1
fi

cat > "$APP_DIR/.env" <<'ENV'
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://YOUR_DOMAIN
JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
LOG_LEVEL=info
ENV

cat > "$APP_DIR/docker-compose.yml" <<'YAML'
services:
  shoplenden:
    image: dineshyy/shoplenden:latest
    container_name: shoplenden
    restart: unless-stopped
    init: true
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - shoplenden_data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
volumes:
  shoplenden_data:
    name: shoplenden_data
YAML

echo "Bootstrap files created in $APP_DIR"
echo "Edit $APP_DIR/.env, then run: docker compose pull && docker compose up -d"
