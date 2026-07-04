-- ─────────────────────────────────────────────────────────────────────────────
-- АУДИТ ЦЕЛОСТНОСТИ ДЕНЕЖНЫХ РАСЧЁТОВ (только чтение, ничего не меняет).
--
-- Проверяет, что сохранённые производные поля каждого счёта соответствуют
-- формуле движка (shared/financialEngine.ts): маржа, доли партнёра/админа,
-- база, комиссия, деление 50/50, «остаток бюджета клиента» (с учётом
-- внутренних переносов между счетами — invoice_transfers).
--
-- Якорь b = сохранённый client_bill. Точная numeric-арифметика, допуск 0.02 ₽
-- на округление долей. Пустой блок «РАСХОЖДЕНИЯ» = всё сходится.
--
-- Запуск:  sudo -u postgres psql -d finance_duck -f scripts/audit-money.sql
--    или:  bash scripts/audit-money.sh   (обёртка с PASS/FAIL)
-- ─────────────────────────────────────────────────────────────────────────────
\pset pager off

CREATE TEMP TABLE audit_chk AS
WITH exp AS (
  SELECT invoice_id, COALESCE(SUM(amount),0) AS exp_sum
  FROM invoice_expenses GROUP BY invoice_id
),
tr AS (
  -- Внутренние переносы двигают «доступно клиенту», не трогая маржу/деньги.
  SELECT i.id,
    COALESCE((SELECT SUM(amount) FROM invoice_transfers WHERE to_invoice_id  = i.id),0) AS in_amt,
    COALESCE((SELECT SUM(amount) FROM invoice_transfers WHERE from_invoice_id = i.id),0) AS out_amt
  FROM invoices i
),
j AS (
  SELECT i.invoice_number, i.scheme::text AS scheme, i.service_type,
         ic.client_bill AS b, ic.commission_rate AS crate,
         ic.commission_amount, ic.amount_to_admin,
         ic.agency_margin, ic.partner_share_from_margin, ic.admin_share_from_margin,
         ic.client_base_after_margin, ic.client_remaining, ic.executor_expenses_total AS eet,
         ic.net_profit_admin AS npa, ic.admin_share_50, ic.cat_share_50,
         COALESCE(e.exp_sum,0) AS exp_sum,
         tr.in_amt, tr.out_amt
  FROM invoices i
  JOIN invoice_calculations ic ON ic.invoice_id = i.id
  LEFT JOIN exp e ON e.invoice_id = i.id
  JOIN tr ON tr.id = i.id
)
SELECT invoice_number, scheme, b, eet, exp_sum,
  concat_ws(', ',
    CASE WHEN abs(eet - exp_sum) > 0.02 THEN 'расходы≠сумме_строк('||eet||'≠'||exp_sum||')' END,
    CASE WHEN scheme='agency_30' AND abs(agency_margin - b*0.30) > 0.02 THEN 'маржа≠30%' END,
    CASE WHEN scheme='agency_30' AND abs(partner_share_from_margin - b*0.15) > 0.02 THEN 'партнёр≠15%' END,
    CASE WHEN scheme='agency_30' AND abs(admin_share_from_margin - b*0.15) > 0.02 THEN 'админ≠15%' END,
    CASE WHEN scheme='agency_30' AND abs(client_base_after_margin - b*0.70) > 0.02 THEN 'база≠70%' END,
    CASE WHEN scheme='agency_40' AND abs(agency_margin - b*0.40) > 0.02 THEN 'маржа≠40%' END,
    CASE WHEN scheme='agency_40' AND abs(partner_share_from_margin - b*0.16) > 0.02 THEN 'партнёр≠16%' END,
    CASE WHEN scheme='agency_40' AND abs(admin_share_from_margin - b*0.24) > 0.02 THEN 'админ≠24%' END,
    CASE WHEN scheme='agency_40' AND abs(client_base_after_margin - b*0.60) > 0.02 THEN 'база≠60%' END,
    CASE WHEN scheme='agency' AND crate IS NOT NULL AND abs(agency_margin - b*crate/100) > 0.02 THEN 'маржа≠b×ставка' END,
    CASE WHEN scheme='agency' AND admin_share_from_margin IS NOT NULL AND abs(admin_share_from_margin - (agency_margin - partner_share_from_margin)) > 0.02 THEN 'админ≠маржа−партнёр' END,
    CASE WHEN scheme='agency' AND client_base_after_margin IS NOT NULL AND abs(client_base_after_margin - (b - agency_margin)) > 0.02 THEN 'база≠b−маржа' END,
    CASE WHEN scheme='partner_10' AND abs(commission_amount - b*0.10) > 0.02 THEN 'комиссия≠10%' END,
    CASE WHEN scheme='partner_10' AND abs(amount_to_admin - b*0.90) > 0.02 THEN 'админу≠90%' END,
    CASE WHEN scheme='partner_15' AND abs(commission_amount - b*0.15) > 0.02 THEN 'комиссия≠15%' END,
    CASE WHEN scheme='partner_15' AND abs(amount_to_admin - b*0.85) > 0.02 THEN 'админу≠85%' END,
    CASE WHEN scheme='commission_based' AND commission_amount IS NOT NULL AND crate IS NOT NULL AND abs(commission_amount - b*crate/100) > 0.02 THEN 'комиссия≠b×ставка' END,
    CASE WHEN scheme='commission_based' AND amount_to_admin IS NOT NULL AND abs(amount_to_admin - (b - commission_amount)) > 0.02 THEN 'админу≠b−комиссия' END,
    -- «остаток» для агентских (не periodic) с поправкой на переносы бюджета
    CASE WHEN scheme IN ('agency_30','agency_40','agency') AND service_type IS DISTINCT FROM 'periodic'
          AND client_remaining IS NOT NULL AND client_base_after_margin IS NOT NULL
          AND abs(client_remaining - (client_base_after_margin - eet + in_amt - out_amt)) > 0.02
         THEN 'остаток≠база−расходы+переносы' END,
    CASE WHEN admin_share_50 IS NOT NULL AND abs(admin_share_50 - npa/2) > 0.02 THEN 'админ50≠прибыль/2' END,
    CASE WHEN cat_share_50   IS NOT NULL AND abs(cat_share_50   - npa/2) > 0.02 THEN 'доля50≠прибыль/2' END
  ) AS fails
FROM j;

\echo '=== СВОДКА ==='
SELECT count(*) AS всего_счетов,
       count(*) FILTER (WHERE fails <> '') AS с_расхождениями
FROM audit_chk;

\echo '=== ПОКРЫТИЕ ПО СХЕМАМ ==='
SELECT scheme AS схема, count(*) AS счетов FROM audit_chk GROUP BY scheme ORDER BY scheme;

\echo '=== РАСХОЖДЕНИЯ (пусто = всё сходится) ==='
SELECT invoice_number AS счёт, scheme AS схема, b AS сумма, fails AS что_не_сходится
FROM audit_chk WHERE fails <> '' ORDER BY scheme, invoice_number;

\echo '=== ВЕРДИКТ ==='
SELECT CASE WHEN count(*) = 0 THEN 'OK: все счета целостны'
            ELSE 'ВНИМАНИЕ: расхождений — '||count(*) END AS вердикт
FROM audit_chk WHERE fails <> '';
