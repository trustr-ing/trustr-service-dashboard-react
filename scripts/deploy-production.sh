#!/usr/bin/env bash
#
# Deploy the dashboard to production from a pushed git ref.
#
#   scripts/deploy-production.sh [git-ref] [user@host]
#
# Defaults: ref = current branch name, host = root@137.184.162.114.
# The server directory is a git checkout (converted from the old rsync
# layout on 2026-10-27). Server-only files (.env.production, data/) are
# gitignored and untouched. The production env is exported into the build
# shell so NEXT_PUBLIC_* values are inlined into the client bundle.
#
# Rollback: re-run with the previous commit hash as the ref.

set -euo pipefail

REF="${1:-$(git rev-parse --abbrev-ref HEAD)}"
TARGET_HOST="${2:-root@137.184.162.114}"
TARGET_PATH="/opt/trustr-service-dashboard"
REMOTE_URL="https://github.com/trustr-ing/trustr-service-dashboard-react.git"

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to deploy: working tree has uncommitted changes." >&2
  exit 1
fi
if ! git ls-remote --exit-code --quiet origin "refs/heads/${REF}" >/dev/null 2>&1 \
   && ! git cat-file -e "${REF}^{commit}" 2>/dev/null; then
  echo "Refusing to deploy: '${REF}' is neither a pushed branch nor a commit." >&2
  exit 1
fi

echo "Deploying ${REF} to ${TARGET_HOST}:${TARGET_PATH}"

ssh "${TARGET_HOST}" "set -euo pipefail
  cd '${TARGET_PATH}'
  if [ ! -d .git ]; then
    git init -q
    git remote add origin '${REMOTE_URL}'
  fi
  PREVIOUS=\$(git rev-parse --short HEAD 2>/dev/null || echo none)
  git fetch -q origin '${REF}' || git fetch -q origin
  git checkout -q -f -B deploy FETCH_HEAD 2>/dev/null || git checkout -q -f '${REF}'
  echo \"previous: \${PREVIOUS}  now: \$(git log -1 --format='%h %s')\"
  npm ci --silent
  set -a; . ./.env.production; set +a
  npm run build 2>&1 | tail -n 5
  systemctl restart trustr-dashboard.service
  sleep 6
  systemctl is-active trustr-dashboard.service
  curl -s -m 20 -o /dev/null -w '/demo HTTP %{http_code}\n' http://127.0.0.1:3000/demo
  curl -s -m 40 -o /dev/null -w '/api/services HTTP %{http_code}\n' http://127.0.0.1:3000/api/services
  echo \"deployed: \$(git rev-parse --short HEAD)  rollback: scripts/deploy-production.sh \${PREVIOUS}\"
"
