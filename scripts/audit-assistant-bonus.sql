-- ─────────────────────────────────────────────────────────────────────────────
-- БОНУС АССИСТЕНТА: ЗА ФАЙЛ ИЛИ ЗА ПАКЕТ (только чтение, ничего не меняет).
--
-- Сейчас код начисляет 2000 ₽ за каждый файл "акт компании" и 1000 ₽ за каждый
-- файл "акт исполнителя" по оплаченным счетам, видимым ассистенту. Правило
-- владельца: один пакет документов на счет и сторону. Скрипт показывает обе
-- суммы по месяцам первой загрузки пакета, выплаченное ассистенту и счета,
-- где одна сторона загружена несколькими файлами.
--
-- Запуск:  sudo -u postgres psql -d finance_duck -f scripts/audit-assistant-bonus.sql
-- ─────────────────────────────────────────────────────────────────────────────
\pset pager off

WITH packages AS (
  SELECT sa.invoice_id,
         sa.act_type,
         COUNT(*) AS files,
         to_char(date_trunc('month', MIN(sa.created_at)), 'YYYY-MM') AS month,
         CASE sa.act_type WHEN 'company' THEN 2000 ELSE 1000 END AS rate
  FROM signed_acts sa
  JOIN invoices i ON i.id = sa.invoice_id
  WHERE i.status = 'paid' AND COALESCE(i.hide_from_assistant, false) = false
  GROUP BY sa.invoice_id, sa.act_type
)
SELECT CASE WHEN GROUPING(month) = 1 THEN 'total' ELSE month END AS month,
       SUM(files * rate) AS bonus_per_file_now,
       SUM(rate) AS bonus_per_package,
       COUNT(*) FILTER (WHERE files > 1) AS packages_with_several_files
FROM packages
GROUP BY ROLLUP (month)
ORDER BY GROUPING(month), month;

SELECT COALESCE(SUM(amount), 0) AS paid_to_assistant FROM assistant_bonus_payments;

SELECT i.invoice_number,
       sa.act_type,
       COUNT(*) AS files
FROM signed_acts sa
JOIN invoices i ON i.id = sa.invoice_id
WHERE i.status = 'paid' AND COALESCE(i.hide_from_assistant, false) = false
GROUP BY i.invoice_number, sa.act_type
HAVING COUNT(*) > 1
ORDER BY i.invoice_number, sa.act_type;
