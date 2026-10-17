#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FinanceDuck — деплой кода с локальной машины на Timeweb VDS.
# Запускать с локальной машины:
#   ./deploy/deploy.sh
# Требует: ssh-доступ к VDS по ключу, переменные SERVER_HOST и SERVER_USER.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Адрес сервера НЕ зашит в код — задаётся окружением:
#   SERVER_HOST=<ip-или-домен> SERVER_USER=root ./deploy/deploy.sh
SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:?Задайте SERVER_HOST (IP или домен сервера)}"
REMOTE_DIR="/opt/finance-duck"
APP_USER="financeduck"

echo "==> [1/6] Тесты + локальная сборка"
npm ci
# Барьер: тесты-инварианты денег и пр. Падение = деплой НЕ идёт (set -e),
# плохой денежный код физически не уезжает на прод.
npm run check
npm audit --audit-level=moderate

ssh "$SERVER_USER@$SERVER_HOST" "node -e 'const [major,minor] = process.versions.node.split(\".\").map(Number); if(major < 22 || (major === 22 && minor < 12)) process.exit(1)'" || {
  echo 'Обновите Node.js на сервере до 22.12+ перед загрузкой файлов.'
  exit 1
}

echo "==> [2/6] Sync code to $SERVER_USER@$SERVER_HOST:$REMOTE_DIR"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '_supabase_archive' \
  --exclude 'attached_assets' \
  --exclude 'backups' \
  --exclude 'objects' \
  --exclude '.claude' \
  --exclude '.agents' \
  --exclude '.local' \
  ./ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"

echo "==> [3/6] Install production deps on server"
ssh "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR
  npm ci --omit=dev
  chown -R $APP_USER:$APP_USER $REMOTE_DIR
"

echo "==> [4/6] Run database migrations"
ssh "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR
  test -f .env || { echo 'Missing .env: migration aborted'; exit 1; }
  sudo -u $APP_USER bash -c 'set -a; source .env; set +a; npm run db:migrate'
"

echo "==> [5/6] Restart service"
ssh "$SERVER_USER@$SERVER_HOST" "systemctl restart finance-duck && systemctl status finance-duck --no-pager -l | head -20"

echo "==> [6/6] Проверка целостности денег (read-only, ничего не меняет)"
# Аудит запускается ПОСЛЕ рестарта; расхождение не откатывает деплой, а громко
# сигналит, что надо разобраться (напр. если правка кода тихо сдвинула расчёт).
AUDIT_RC=0
ssh "$SERVER_USER@$SERVER_HOST" "cd $REMOTE_DIR && bash scripts/audit-money.sh" || AUDIT_RC=$?
if [[ $AUDIT_RC -ne 0 ]]; then
  echo ""
  echo "   ⚠️⚠️⚠️  АУДИТ ДЕНЕГ НАШЁЛ РАСХОЖДЕНИЯ (код $AUDIT_RC) — разберись по выводу выше!"
  echo "   Повторить вручную: ssh $SERVER_USER@$SERVER_HOST 'cd $REMOTE_DIR && bash scripts/audit-money.sh'"
  exit "$AUDIT_RC"
fi

echo ""
echo "✅ Деплой завершён."
echo "   Открыть: https://$SERVER_HOST/ (или ваш домен)"
echo "   Логи:    ssh $SERVER_USER@$SERVER_HOST 'journalctl -u finance-duck -f'"
