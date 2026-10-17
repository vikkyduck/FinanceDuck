#!/usr/bin/env bash
# Build a committed release, then activate it atomically on the existing VDS.
set -Eeuo pipefail
SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:?Set SERVER_HOST (SSH alias or host)}"
[[ "$SERVER_USER@$SERVER_HOST" =~ ^[a-zA-Z0-9_.@:-]+$ ]] || exit 2
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit all intended changes before deployment.'; exit 1; }
commit=$(git rev-parse HEAD)
release="/opt/finance-duck-releases/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
remote="$SERVER_USER@$SERVER_HOST"
npm ci
npm run check
npm audit --audit-level=moderate
ssh "$remote" "node -e 'if(Number(process.versions.node.split(\".\")[0])<22)process.exit(1)'; test -L /opt/finance-duck; mkdir '$release'"
git archive HEAD | ssh "$remote" "tar -xf - -C '$release'"
rsync -az dist dist-server "$remote:$release/"
ssh "$remote" "cd '$release' && npm ci --omit=dev && cp -p /opt/finance-duck/.env .env && chown -R financeduck:financeduck '$release'"
ssh "$remote" "bash '$release/deploy/activate-release.sh' '$release' '$commit'"
echo "Deployed commit $commit. Verify the public domain and role-specific scenarios."
