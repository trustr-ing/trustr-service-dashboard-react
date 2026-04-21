#!/usr/bin/env bash

set -euo pipefail

TARGET_HOST="${1:-root@137.184.162.114}"
TARGET_PATH="/opt/trustr-service-dashboard"

rsync -az --delete -e "ssh -o StrictHostKeyChecking=no" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'data/' \
  --exclude '.env.local' \
  --exclude '.env.production' \
  ./ "${TARGET_HOST}:${TARGET_PATH}/"

ssh -o StrictHostKeyChecking=no "${TARGET_HOST}" "set -e; \
  cd ${TARGET_PATH}; \
  npm ci; \
  npm run build; \
  systemctl daemon-reload; \
  systemctl restart trustr-dashboard.service; \
  systemctl status trustr-dashboard.service --no-pager | head -n 20"

echo "Deployment complete: ${TARGET_HOST}"
