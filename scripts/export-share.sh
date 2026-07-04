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
# Самопроверка: маркеры (имена, домены, IP) читаются из ЛОКАЛЬНОГО
# неотслеживаемого файла scripts/.export-audit.list (по строке на маркер) —
# сами маркеры в репозиторий не попадают.
#
# Использование:  bash scripts/export-share.sh [выходной.zip]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

OUT="${1:-$HOME/Desktop/finance-duck-share-$(date +%Y%m%d).zip}"
NEEDLES="scripts/.export-audit.list"

if [[ ! -f "$NEEDLES" ]]; then
  echo "❌ Нет $NEEDLES — создайте файл со списком маркеров (по строке: имена,"
  echo "   домен, IP). Он в .gitignore и в архив не попадает."
  exit 1
fi

git archive --format=zip -o "$OUT" HEAD
echo "Архив: $OUT ($(du -h "$OUT" | cut -f1))"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -qq "$OUT" -d "$TMP"
FOUND=0
while IFS= read -r needle; do
  [[ -z "$needle" || "$needle" == \#* ]] && continue
  if grep -riIl --exclude-dir=node_modules -- "$needle" "$TMP" >/dev/null 2>&1; then
    echo "⚠️  найден маркер «$needle»:"
    grep -riIl --exclude-dir=node_modules -- "$needle" "$TMP" | sed "s|$TMP/|    |"
    FOUND=1
  fi
done < "$NEEDLES"

if [[ "$FOUND" -eq 0 ]]; then
  echo "✅ Самопроверка пройдена: маркеров личных данных в архиве нет."
else
  echo "❌ Архив НЕ чист — удалён. Разберитесь с маркерами выше."
  rm -f "$OUT"
  exit 1
fi
