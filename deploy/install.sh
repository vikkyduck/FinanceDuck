#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FinanceDuck — установка на чистый Ubuntu 22.04/24.04 VDS (Timeweb).
# Запускать ОДИН РАЗ под root после первого подключения по SSH:
#   DOMAIN=<ваш-домен> sudo -E bash deploy/install.sh
#
# Что делает:
#   1. Обновляет систему, ставит Node.js 26, Postgres 16, nginx, certbot
#   2. Создаёт пользователя financeduck без shell-доступа
#   3. Создаёт БД finance_duck и пользователя БД
#   4. Кладёт код в /opt/finance-duck
#   5. Ставит systemd-юнит, nginx-конфиг
#   6. НЕ запускает приложение — это сделает deploy.sh после первой выкладки кода
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Запустите под root: sudo bash deploy/install.sh"
  exit 1
fi

# Домен НЕ зашит в код — передаётся окружением: DOMAIN=<ваш-домен>
DOMAIN="${DOMAIN:?Задайте DOMAIN (домен приложения)}"
APP_USER="financeduck"
APP_DIR="/opt/finance-duck"
DATA_DIR="/var/finance-duck"
LOG_DIR="/var/log/finance-duck"
DB_NAME="finance_duck"
DB_USER="finance_duck"

echo "==> Обновление системы"
apt-get update -y
apt-get upgrade -y

echo "==> Установка пакетов"
apt-get install -y curl ca-certificates gnupg lsb-release ufw nginx postgresql postgresql-contrib certbot python3-certbot-nginx rsync git

echo "==> Установка Node.js 26"
if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 26 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
  apt-get install -y nodejs
fi

echo "==> Создание пользователя $APP_USER"
if ! id -u "$APP_USER" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Создание директорий"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$LOG_DIR"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR" "$DATA_DIR/backups" "$DATA_DIR/objects"

echo "==> Настройка Postgres"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD 'CHANGE_ME_AT_FIRST_INSTALL';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

echo ""
echo "⚠️  ВАЖНО: задайте пароль для пользователя БД '${DB_USER}'."
echo "    Сейчас стоит заглушка 'CHANGE_ME_AT_FIRST_INSTALL'."
echo ""
echo "    sudo -u postgres psql -c \"ALTER ROLE ${DB_USER} PASSWORD 'НОВЫЙ_ПАРОЛЬ';\""
echo ""

echo "==> Установка systemd-юнита"
if [[ -f "$APP_DIR/deploy/finance-duck.service" ]]; then
  install -m 644 "$APP_DIR/deploy/finance-duck.service" /etc/systemd/system/finance-duck.service
  systemctl daemon-reload
fi

echo "==> Установка nginx-конфига"
if [[ -f "$APP_DIR/deploy/nginx.conf" ]]; then
  # nginx.conf — шаблон: домен подставляется из $DOMAIN при установке
  sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/finance-duck
  chmod 644 /etc/nginx/sites-available/finance-duck
  ln -sf /etc/nginx/sites-available/finance-duck /etc/nginx/sites-enabled/finance-duck
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
fi

echo "==> Firewall (ufw)"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
echo "y" | ufw enable || true

echo ""
echo "✅ Базовая установка завершена."
echo ""
echo "Дальше:"
echo "  1) Скопируйте код на сервер: с локальной машины запустите ./deploy/deploy.sh"
echo "  2) Создайте /opt/finance-duck/.env (см. /opt/finance-duck/.env.example)"
echo "     и заполните DATABASE_URL с реальным паролем БД"
echo "  3) Запустите миграцию: cd /opt/finance-duck && sudo -u $APP_USER npm run db:migrate"
echo "  4) Получите SSL: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "  5) Запустите приложение: systemctl enable --now finance-duck"
echo ""
