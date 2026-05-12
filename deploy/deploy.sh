#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FinanceDuck — деплой кода с локальной машины на Timeweb VDS.
# Запускать с локальной машины:
#   ./deploy/deploy.sh
# Требует: ssh-доступ к VDS по ключу, переменные SERVER_HOST и SERVER_USER.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:-5.129.198.180}"
REMOTE_DIR="/opt/finance-duck"
APP_USER="financeduck"

echo "==> [1/5] Local build"
npm ci
npm run build

echo "==> [2/5] Sync code to $SERVER_USER@$SERVER_HOST:$REMOTE_DIR"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '_supabase_archive' \
  --exclude 'attached_assets' \
  --exclude '.claude' \
  --exclude '.agents' \
  --exclude '.local' \
  ./ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"

echo "==> [3/5] Install production deps on server"
ssh "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR
  npm ci --omit=dev
  chown -R $APP_USER:$APP_USER $REMOTE_DIR
"

echo "==> [4/5] Run database migrations"
ssh "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR
  if [[ -f .env ]]; then
    sudo -u $APP_USER bash -c 'set -a; source .env; set +a; npm run db:push -- --force || npm run db:push'
  else
    echo '⚠️  .env not found on server — пропускаю миграцию. Создайте .env и запустите вручную.'
  fi
"

echo "==> [5/5] Restart service"
ssh "$SERVER_USER@$SERVER_HOST" "systemctl restart finance-duck && systemctl status finance-duck --no-pager -l | head -20"

echo ""
echo "✅ Деплой завершён."
echo "   Открыть: https://fin-dohod.ru/"
echo "   Логи:    ssh $SERVER_USER@$SERVER_HOST 'journalctl -u finance-duck -f'"
