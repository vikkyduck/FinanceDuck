# Deploy FinanceDuck на Timeweb Cloud VDS

Этот гайд — для первого деплоя на чистый Ubuntu-сервер Timeweb (тариф 2 CPU / 2 GB RAM / 40 GB NVMe).

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│              Timeweb Cloud VDS (5.129.198.180)              │
│                                                             │
│  ┌────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  Internet  │ ─► │   nginx 443  │ ─► │  Node.js :5000 │  │
│  └────────────┘    │ (SSL + proxy)│    │  (Express)     │  │
│                    └──────────────┘    └────────┬───────┘  │
│                                                  │           │
│                                          ┌───────▼────────┐  │
│                                          │ Postgres :5432 │  │
│                                          └────────────────┘  │
│                                                              │
│                          /var/finance-duck/backups/ (JSON)   │
└──────────────────────────────────────────────────────────────┘
```

Зависимости: Node.js 20, Postgres 16, nginx, certbot — всё ставится скриптом `install.sh`.

## Шаги первой установки

### 1. На сервере (один раз)

```bash
# С локальной машины, подключиться по SSH:
ssh root@5.129.198.180

# Скачать репозиторий
git clone <repo-url> /tmp/finance-duck
cp -r /tmp/finance-duck/deploy /opt/finance-duck/

# Запустить установку
bash /opt/finance-duck/deploy/install.sh
```

После выполнения скрипт скажет, что нужно:
- задать пароль БД,
- скопировать код,
- создать `.env`,
- получить SSL.

### 2. На локальной машине

```bash
# Задать пароль БД на сервере вручную (через psql):
ssh root@5.129.198.180 'sudo -u postgres psql -c "ALTER ROLE finance_duck PASSWORD '\''ваш_пароль'\'';"'

# Положить .env на сервер с этим паролем:
ssh root@5.129.198.180 'cat > /opt/finance-duck/.env <<EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://finance_duck:ваш_пароль@127.0.0.1:5432/finance_duck
BACKUP_DIR=/var/finance-duck/backups
EOF'

# Запустить деплой
SERVER_HOST=5.129.198.180 SERVER_USER=root ./deploy/deploy.sh
```

### 3. SSL и DNS

DNS: в панели регистратора домена `fin-dohod.ru` направить A-запись на `5.129.198.180`. На Timeweb это делается в «Домены и SSL → Настройки DNS».

После того как DNS обновится (5-30 минут):

```bash
ssh root@5.129.198.180 'certbot --nginx -d fin-dohod.ru -d www.fin-dohod.ru'
```

### 4. Миграция данных с Replit

Когда сервер работает и пуст, можно перенести данные:

```bash
# Импорт бэкапа через UI:
# https://fin-dohod.ru → войти как admin → Бэкапы → Загрузить файл
# (бэкап с Replit сохраняется в том же JSON-формате)
```

## Дальнейшие деплои

```bash
./deploy/deploy.sh
```

Скрипт делает `npm run build` локально, синхронизирует код на сервер, ставит prod-зависимости, мигрирует БД, перезапускает сервис.

## Полезные команды на сервере

```bash
# Логи приложения
journalctl -u finance-duck -f

# Статус
systemctl status finance-duck

# Перезапуск
systemctl restart finance-duck

# Размер БД
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('finance_duck'));"

# Ручной бэкап БД (pg_dump)
sudo -u postgres pg_dump finance_duck | gzip > /var/finance-duck/backups/pgdump-$(date +%F).sql.gz
```
