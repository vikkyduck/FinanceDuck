#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Прогон аудита целостности денег (audit-money.sql). Только чтение.
# Exit 0 = все счета целостны; Exit 1 = найдены расхождения (или ошибка).
# Запуск на сервере:  bash scripts/audit-money.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${DB_NAME:-finance_duck}"

OUT="$(sudo -u postgres psql -d "$DB" -f "$DIR/audit-money.sql" 2>&1)"
echo "$OUT"
echo

if echo "$OUT" | grep -q "OK: все счета целостны"; then
  echo "✅ АУДИТ ПРОЙДЕН — расчёты целостны."
  exit 0
else
  echo "⚠️  АУДИТ НАШЁЛ РАСХОЖДЕНИЯ — см. блок «РАСХОЖДЕНИЯ» выше."
  exit 1
fi
