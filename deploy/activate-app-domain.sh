#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Автоактивация app.withoutwater.ru для кабинета FinanceDuck.
# Запускается таймером каждые 5 мин, пока владелец не добавит A-запись.
# Когда DNS появился: certbot → CORS → PUBLIC_BASE_URL → restart → TG-отчёт →
# самоотключение таймера. Идемпотентен, чужие сайты не трогает.
# ─────────────────────────────────────────────────────────────────────────────
set -u
DOMAIN="app.withoutwater.ru"
EXPECT_IP="5.129.198.180"
ENV=/opt/finance-duck/.env
MARK=/var/run/fd-activate-fail.ts
log() { logger -t fd-activate "$1"; echo "$1"; }

tg() { # уведомление владельцу через алерт-бота
  local TOKEN CHAT BASE
  TOKEN=$(grep -E "^TG_ALERT_BOT_TOKEN=" "$ENV" | cut -d= -f2-)
  CHAT=$(grep -E "^TG_ALERT_CHAT_ID=" "$ENV" | cut -d= -f2-)
  BASE=$(grep -E "^TELEGRAM_API_BASE=" "$ENV" | cut -d= -f2-); BASE=${BASE:-https://api.telegram.org}
  [[ -z "$TOKEN" || -z "$CHAT" ]] && return 0
  curl -s --max-time 20 -X POST "$BASE/bot$TOKEN/sendMessage" \
    -d chat_id="$CHAT" --data-urlencode text="$1" >/dev/null 2>&1 || true
}

# 1. DNS уже указывает на нас?
IP=$(dig +short "$DOMAIN" A | tail -1)
if [[ "$IP" != "$EXPECT_IP" ]]; then
  log "DNS ещё не готов ($DOMAIN → '${IP:-нет записи}'), жду"
  exit 0
fi

# 2. Сертификат (бэкофф 30 мин после неудачи — защита от лимитов Let's Encrypt)
if ! certbot certificates 2>/dev/null | grep -q "Domains: $DOMAIN"; then
  if [[ -f "$MARK" ]] && [[ $(( $(date +%s) - $(cat "$MARK") )) -lt 1800 ]]; then
    log "недавняя неудача certbot, бэкофф"; exit 0
  fi
  log "DNS готов — выпускаю сертификат"
  if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos >/dev/null 2>&1; then
    date +%s > "$MARK"
    log "certbot не смог — повтор через 30 мин"
    exit 0
  fi
  log "сертификат выпущен"
fi

# 3. CORS: добавить домен (идемпотентно)
if ! grep -E "^CORS_ORIGINS=" "$ENV" | grep -q "$DOMAIN"; then
  sed -i "s|^CORS_ORIGINS=.*|&,https://$DOMAIN|" "$ENV"
  log "CORS_ORIGINS дополнен"
fi

# 4. Ссылки в TG → домен компании (решение владельца: всем клиентам)
if ! grep -q "^PUBLIC_BASE_URL=https://$DOMAIN" "$ENV"; then
  sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://$DOMAIN|" "$ENV"
  log "PUBLIC_BASE_URL переключён"
fi
chown financeduck:financeduck "$ENV"

# 5.5 Кнопка «Личный кабинет» на сайте компании: переключить с исторического
# адреса на домен компании (ссылка зашита литералом https://fin-dohod.ru
# только в этой кнопке — замена безопасна).
grep -rl "https://fin-dohod.ru" /opt/withoutwater/site --include="*.html" --include="*.js" 2>/dev/null | while read -r f; do
  sed -i "s|https://fin-dohod.ru|https://app.withoutwater.ru|g" "$f"
done
log "кнопка ЛК на сайте компании переключена на app-домен"

systemctl restart finance-duck
sleep 3

# 5. Проверка обоих доменов
NEW=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://$DOMAIN/")
OLD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://fin-dohod.ru/")
SITE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://withoutwater.ru/")
log "проверка: новый=$NEW старый=$OLD сайт-компании=$SITE"

if [[ "$NEW" == "200" && "$OLD" == "200" ]]; then
  tg "✅ Кабинет активирован на https://$DOMAIN — сертификат выпущен, ссылки в уведомлениях теперь ведут на домен компании. Старый адрес fin-dohod.ru работает как раньше. Сайт компании не затронут (HTTP $SITE)."
  systemctl disable --now finance-duck-activate.timer >/dev/null 2>&1
  log "активация завершена, таймер отключён"
else
  tg "⚠️ Активация $DOMAIN: что-то не так (новый=$NEW, старый=$OLD). Разберусь при следующей проверке."
fi
