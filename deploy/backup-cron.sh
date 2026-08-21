#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
/usr/bin/node scripts/backup.js
# Keep the latest 14 daily backups; older backups can be moved to external storage.
find data/backups -type f -name 'khata-*.db' -mtime +14 -delete
