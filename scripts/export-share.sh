#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Чистый экспорт кода для передачи третьим лицам.
#
# Почему НЕ «скопировать папку» и НЕ «поделиться репозиторием»:
#   • рабочая папка содержит .env, attached_assets/, .local/ и пр. личное;
#   • полный репозиторий несёт ИСТОРИЮ git (старые версии файлов, имена и
#     e-mail авторов коммитов) — там личные данные остаются навсегда.
# git archive берёт ТОЛЬКО отслеживаемые файлы текущего коммита, без истории.
#
# Использование:  bash scripts/export-share.sh [выходной.zip]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

OUT="${1:-$HOME/Desktop/finance-duck-share-$(date +%Y%m%d).zip}"

git archive --format=zip -o "$OUT" HEAD
echo "Архив: $OUT ($(du -h "$OUT" | cut -f1))"

# Самопроверка: маркеры личных/инфраструктурных данных внутри архива.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -qq "$OUT" -d "$TMP"
FOUND=0
for needle in "уткина" "utkina" "марушкин" "потапов" "пирогов" "беляев" "шкодин" "громск" "раточк" "бв_" "fin-dohod" "5.129.198.180"; do
  if grep -riIl --exclude-dir=node_modules -- "$needle" "$TMP" >/dev/null 2>&1; then
    echo "⚠️  найден маркер «$needle»:"
    grep -riIl --exclude-dir=node_modules -- "$needle" "$TMP" | sed "s|$TMP/|    |"
    FOUND=1
  fi
done
if [[ "$FOUND" -eq 0 ]]; then
  echo "✅ Самопроверка пройдена: личных данных и адресов сервера в архиве нет."
else
  echo "❌ Архив НЕ чист — удалите его и разберитесь с маркерами выше."
  rm -f "$OUT"
  exit 1
fi
