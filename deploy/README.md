# Deploy FinanceDuck на Timeweb Cloud VDS

Этот гайд — для первого деплоя на чистый Ubuntu-сервер Timeweb (тариф 2 CPU / 2 GB RAM / 40 GB NVMe).

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│              Timeweb Cloud VDS (<SERVER_IP>)              │
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
ssh root@<SERVER_IP>

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
ssh root@<SERVER_IP> 'sudo -u postgres psql -c "ALTER ROLE finance_duck PASSWORD '\''ваш_пароль'\'';"'

# Положить .env на сервер с этим паролем:
ssh root@<SERVER_IP> 'cat > /opt/finance-duck/.env <<EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://finance_duck:ваш_пароль@127.0.0.1:5432/finance_duck
BACKUP_DIR=/var/finance-duck/backups
EOF'

# Запустить деплой
SERVER_HOST=<SERVER_IP> SERVER_USER=root ./deploy/deploy.sh
```

### 3. SSL и DNS

DNS: в панели регистратора домена `<ваш-домен>` направить A-запись на `<SERVER_IP>`. На Timeweb это делается в «Домены и SSL → Настройки DNS».

После того как DNS обновится (5-30 минут):

```bash
ssh root@<SERVER_IP> 'certbot --nginx -d <ваш-домен> -d www.<ваш-домен>'
```

### 4. Миграция данных с Replit

Когда сервер работает и пуст, можно перенести данные:

```bash
# Импорт бэкапа через UI:
# https://<ваш-домен> → войти как admin → Бэкапы → Загрузить файл
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

## Операционная защита (2026-07)

- **db:push без --force**: деструктивный дрифт схемы роняет деплой (stdin закрыт),
  а не применяется молча. Конвенция: schema-изменения — ручной ALTER + drizzle-kit generate.
- **Алерт о падении**: systemd `OnFailure` → Telegram (`/usr/local/bin/finance-duck-alert.sh`).
  Требует `TG_ALERT_CHAT_ID=<chat_id>` в `/opt/finance-duck/.env` (без него молчит).
- **Оффсайт-бэкапы**: машина администратора ежедневно (09:30) забирает
  `/var/finance-duck/backups` к себе (launchd `com.financeduck.backup-pull`,
  скрипт `~/FinanceDuckBackups/pull.sh`). Локальный ретеншн на сервере — 30 копий.

## Второй домен кабинета: app.withoutwater.ru (2026-08)

Кабинет доступен с двух доменов (один бэкенд :5000, одна база):
- fin-dohod.ru — исторический адрес, продолжает работать;
- app.withoutwater.ru — адрес «от компании» для клиентов.

Активация автоматическая: systemd-таймер `finance-duck-activate.timer`
(скрипт-копия: deploy/activate-app-domain.sh) каждые 5 минут проверяет
DNS; как только A-запись `app → <SERVER_IP>` появляется — выпускает
сертификат, дополняет CORS_ORIGINS, переключает PUBLIC_BASE_URL на домен
компании, рестартует сервис, шлёт TG-отчёт владельцу и отключает себя.
