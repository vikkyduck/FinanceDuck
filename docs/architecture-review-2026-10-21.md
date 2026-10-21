# Архитектурное ревью FinanceDuck

21.10.2026; HEAD 642c834 (= origin/timeweb-migration); база сравнения ece9adf (17.10); метод: 127 старых находок перепроверены на HEAD по 11 областям (проверяющий плюс адверсариальный верификатор на каждую), новый код отревьюирован отдельно; итог: исправлено 24, частично 58, открыто 45, новых подтвержденных находок 87 (high 7).

Полный каталог: [architecture-review-2026-10-21-findings.md](architecture-review-2026-10-21-findings.md). В нем статус каждой из 127 находок 17.10, все 87 новых находок с цитатами кода и все опровергнутое. Номера F и N в тексте ведут туда.

Что проверено лично, а не только агентами: typecheck, lint и vitest на HEAD; дефекты N7 и N2 по коду; открытый порт 5000 одним GET-запросом к /api/health (ответ 200; такой же запрос раньше сделал один агент-верификатор). Набор test:postgres и состояние прода не проверялись.

## 1. Вердикт

Код стал безопаснее на уровне инструментов и сложнее на уровне архитектуры. Strict tsc и eslint без единой ошибки, 255 зеленых тестов, денежные команды в одной транзакции с аудитом и outbox, атомарные релизы и restore, который больше не стирает акты. Это реальная работа, без нее оценка была бы ниже. Но исправления не заменили старую архитектуру, а наросли поверх нее. Из примерно 130 эндпоинтов через командный слой идет около 14, через фасад storage около сотни, еще около 15 ходят в drizzle прямо из роутов. 58 из 127 находок закрыты частично: в каждой второй области живут два пути, и новый код выбирает путь случайно. Так появился N2 (партнер получает всю маржу 'agency'), а N5 (агрегат дашборда мимо invoiceScope) пережил исправления, потому что новый фильтр арендатора внедрили не везде. Главный экран работы с деньгами, карточка счета, сейчас не редактируется (N7), и ни один из 255 тестов этого не видит: тесты проверяют чек-лист ревью, а не поведение. Поддерживаемость через год: 4 из 10 сейчас, 3 из 10 на ece9adf. Два балла добавили компилятор, линтер, транзакции и релизы; один балл забрали второй слой плумбинга (около 1000 строк портов и делегатов), шесть форматов бэкапа и тесты, названные по раундам ревью. Первыми сломаются три вещи: restore после следующей миграции (N3, N12), деньги по живой схеме 'agency' при ставке партнера null или при шаблоне периодики (N2, N4), деплой после первого упавшего шаблона периодики (N1).

## 2. Что изменилось после 17.10

| Серьезность | Исправлено | Частично | Открыто | Всего |
|---|---|---|---|---|
| critical | 1 (F1) | 1 (F2) | 0 | 2 |
| high | 8 | 10 | 3 (F4, F14, F20) | 21 |
| medium | 13 | 44 | 38 | 95 |
| low | 2 | 3 | 4 | 9 |
| **Итого** | **24** | **58** | **45** | **127** |

Новые находки в коде HEAD: 87 (high 7, medium 43, low 37), нумерация N1–N87.

Что реально стало лучше:

- **Restore больше не уничтожает данные (F1).** Реестр бэкапа совпадает со всеми 22 таблицами и проверяется тестом, восстановление идет одной транзакцией под ACCESS EXCLUSIVE, перед заменой есть защитная копия. Запись архива потоковая, через tmp, fsync и rename (F119, F120).
- **Денежные записи атомарны (F10, F12, F15, F68, F72).** Один путь пересчета _recalculateInvoiceExpenses под блокировкой счета, PATCH в транзакции, периодика в одной транзакции с уникальным occurrence_key, аудит и outbox в той же транзакции. db.transaction в server: 9 мест стало 21.
- **Деньги считаются на Decimal (F85).** Округление half-up до копеек одной функцией, вторая доля берется остатком.
- **Номера счетов выдает счетчик (F11).** count(*)+1 убран, номер после удаления не переиспользуется.
- **CSRF обязателен, лимитер атомарен (F5, F6).** Без заголовка ответ 403, кука SameSite=Lax, проверка Origin; лимитер стал одним UPSERT.
- **Компилятор и выпуск (F3, F23, F25, F26, F83, F84).** Server впервые проверяется strict tsc; деплой из чистого дерева через git archive, release.json с SHA, откат симлинком; версионные миграции вместо push; vite ушел из прода; планировщики вынесены в отдельный worker.
- **Отчеты читают данные в скоупе роли в SQL (F67), карточка и страница счета читают один кэш (F93, F99).**

Что исправления принесли нового:

- **Регрессии и пропуски в самом ценном.** N7 (цикл рендеров и сброс полей карточки) принесло исправление F93. N2 (вся маржа партнеру) принес общий fallback ставок. N5 (агрегат мимо invoiceScope) был и на ece9adf, но исправления его пропустили: scope внедряли по списку файлов, а не по правилу.
- **Три архитектуры записи и чтения одновременно (N21, N22, N25, N29, N39, N40).** Роут, потом storage, потом репозиторий; роут, потом *Commands, потом репозиторий; роут прямо в drizzle. Порты storagePorts.ts (408 строк) и routeStores.ts (141 строка) повторяют сигнатуры репозиториев для 107 операций (N40, N73).
- **Инфраструктура не по размеру (N11, N34, N74, N26, N27).** Шесть форматов бэкапа за сутки (формат 2.0 не существовал ни в одном коммите), версии квитанций, аренды заданий для одного процесса, три пути восстановления.
- **Дубли нового поколения (N35, N37, N47, N48, N83–N85).** Ядро идемпотентности скопировано в двух классах; два адаптера DTO обратно в snake_case с разными правилами; реестр идемпотентных URL регуляркой на фронте.
- **Тесты и документы описывают процесс, а не систему (N17, N55, N62).** Файлы reviewFollowup, reviewRegressions, reviewCompletion, architectureRemediation с метками R1–R8. В docs около 77 КБ протоколов, часть заявлений ложна: «SQL scope/агрегации» (N5), «схема 5» (N3). В deploy/README.md:117 обещан OnFailure-алерт, которого нет ни в одном юните (N36).

Почему 58 «частично» опаснее 45 «открыто». Открытая находка лежит на одном старом пути, его видно. Частичная означает, что новый путь введен, а старый оставлен, и правило выбора нигде не записано. Примеры из перепроверки. isAgencyScheme введен, но выбирает ветку с захардкоженными 30% (F20). DTO введен, но два адаптера переводят его обратно в snake_case и расходятся (F19, N47). Серверная сводка партнера введена, а сломанный hero-metrics оставлен, и годовых комиссий стало две (F21, N58). Вариантов «даты денег» было семь, стало около девяти (F9). Каждый следующий ИИ-агент пойдет по ближайшему пути, а он в половине случаев старый.

| Метрика | ece9adf | HEAD 642c834 |
|---|---|---|
| Ошибки tsc (server / client) | 48 / 3 | 0 / 0 |
| Проблемы eslint | 1671 | 0 |
| Явные any (server + src) | 91 + 130 | 0 |
| Тесты vitest (файлов / тестов / время) | 19 / 130 / 128 с | 36 / 255 / 106 с |
| db.transaction в server | 9 | 21 |
| console.* в server | 160 | 161 |
| Сырые fetch( в src вне api.ts | 43 | 52 |
| localStorage в src | 67 | 71 |
| Сравнения role ===/!== в src | 82 | 87 |
| Литералы 'agency_30' в src | 22 | 18 |
| storage.ts / storagePorts.ts, строк | 738 / нет | 448 / 408 |
| InvoiceDetailsDialog.tsx, строк | 1889 | 293 (плюс 5 хуков и 7 секций) |
| export.ts, строк | 914 | 946 |

## 3. Уязвимости и риски для денег — сейчас

### Сломано прямо сейчас

**N7. Бесконечный цикл рендеров и сброс полей карточки счета.** `src/hooks/useInvoice.ts:19`; `src/hooks/useInvoiceStatusCommands.ts:169-172`; `src/hooks/useInvoiceFinancialTerms.ts:156-160`; `src/hooks/useInvoiceMetadataCommands.ts:170-175`.

```ts
invoice: query.data ? invoiceDetailsView(query.data.invoice) : null,
// ...
useEffect(() => {
  setPlannedPaymentDate(invoice?.payment_date ? new Date(invoice.payment_date) : undefined);
}, [invoice]);
```

Проблема: view-модель создается заново на каждом рендере, три эффекта с зависимостью [invoice] срабатывают после каждого коммита. С датой оплаты setPlannedPaymentDate(new Date(...)) кладет новый объект, и рендер зацикливается (пробный тест проверяющего: около 3600 рендеров за 300 мс и предупреждения «Maximum update depth exceeded»). Без даты любой ввод сбрасывается к серверному значению. Чем грозит: в единственном редакторе счета InvoiceDetailsDialog нельзя поменять сумму, процент партнера, резерв, заметки, номер. Браузер грузит CPU. Данные и деньги при этом не портятся. Строка появилась в 404a90e/70448f2 (17.10), эти коммиты по протоколам выпуска уезжали на прод; какой коммит на проде сейчас, не проверялось. Что сделать: в useInvoice обернуть invoice и expenses в useMemo по query.data. Убрать синхронизацию формы через useEffect: черновик инициализировать через useState(() => initial), секцию-редактор ремоунтить по key={invoice.id + invoice.updated_at}. Проверка на проде: `cat /opt/finance-duck/release.json`, затем `git merge-base --is-ancestor 70448f2 <commit>`. Если это предок, прод сломан.

**N2. У 'agency' без ставки партнера вся маржа уходит партнеру.** `server/repositories/invoiceRepo.ts:213-214`.

```ts
const partnerRate = parseNum(invoice.partnerCommissionRate ?? existing?.commissionRate);
const marginRate = invoice.scheme === 'agency' ? parseNum(existing?.commissionRate) : 0;
```

Проблема: для 'agency' в commissionRate кэша лежит маржа. При partnerCommissionRate = null движок получает partner = min(margin, margin) = margin. На ece9adf для 'agency' бралась только колонка. Путь к null: PATCH с null (`invoiceCommandInput.ts:25 rate.nullish()`), смена легаси-схемы на 'agency', импорт. Воспроизведено: счет на 1 000 000 с маржой 40% дает партнеру 400 000.00, админу 0.00. Через UI сейчас не воспроизводится: CreateInvoiceDialog всегда шлет ставку. audit-money.sql этого не видит (N54). Чем грозит: любой пересчет (расход, перенос, период, recalculateAllInvoices) тихо обнуляет прибыль владелицы и долг партнера. Что сделать: функция `resolveRates(policy, invoice)` в `shared/schemePolicies.ts`; для kind='agency' ставка партнера = `invoice.partnerCommissionRate ?? 0`, из кэша никогда. Миграция: `partner_commission_rate` для 'agency' NOT NULL DEFAULT 0 с backfill 0. После выкладки прогнать пересчет найденных счетов. Проверка на проде:

```sql
SELECT i.invoice_number, i.status, i.partner_commission_rate,
       c.commission_rate, c.agency_margin, c.partner_share_from_margin,
       c.admin_share_from_margin, c.net_profit_admin
FROM invoices i JOIN invoice_calculations c ON c.invoice_id = i.id
WHERE i.scheme = 'agency'
  AND (i.partner_commission_rate IS NULL
       OR (c.agency_margin > 0 AND c.partner_share_from_margin = c.agency_margin));
```

**F14. Гибкая 'agency' выпадает из бюджетного блока HTML, PDF и XLSX.** `server/routes/export.ts:287-288, 294, 514-515, 553, 811-812, 834`.

```ts
const agency  = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40");
const rate = inv.scheme === "agency_30" ? 30 : 40;
```

Проблема: preview (строка 213) учитывает 'agency', три рендерера нет. Счет живой схемы уходит в «закрытые», клиент не видит расходов и остатка. Ставка маржи зашита 30/40 вместо calc.commissionRate. Чем грозит: каждый скачанный клиентом отчет по 'agency' расходится с экраном предпросмотра. Что сделать: `server/modules/reports/export/model.ts` с `buildClientReport(invoices, viewer)`, единственное место с isAgencyScheme и calc.commissionRate; рендереры получают только модель. Snapshot-тест модели на все 6 схем. Проверка на проде: `SELECT count(*) FROM invoices WHERE scheme='agency' AND archived_at IS NULL;` дает число счетов с неверным отчетом.

### Доступ и периметр

**N6, F2, F17. Порт 5000 открыт мимо nginx, IP-лимит входа обходится подделкой X-Forwarded-For.** `server/vite.ts:64`; `server/app.ts:14`; `server/routes/auth.ts:75,79`; `server/rateLimiter.ts:65-66`.

```ts
server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
app.set("trust proxy", 1);
const ip = req.ip || "unknown";
```

Проблема: HOST не задан ни в `deploy/finance-duck.service`, ни в `.env.example`. При прямом заходе на :5000 первым хопом становится сам клиент, req.ip берется из его заголовка, каждый запрос получает новый ключ IPLOCK. Лимит по коду при переборе разных кодов не копится, глобального лимитера нет. GET http://5.129.198.180:5000/api/health 21.10 вернул 200, то есть дыра на проде подтверждена. Fallback на сырой XFF жив в аудите: `clients.ts:81,101`, `acts.ts:118,166`, `partners.ts:78,96`. В `install.sh:91-93` ufw включается через `|| true`. Чем грозит: перебор кодов доступа без ограничения, коды и куки по открытому HTTP, поддельные IP в журнале. Что сделать: `HOST=127.0.0.1` в юните и в .env.example; в vite.ts при NODE_ENV=production и не-loopback HOST падать на старте; `app.set("trust proxy", "loopback")`; включить ufw (сначала allow OpenSSH, затем Nginx Full), 5000 снаружи закрыт, проверка `ss -ltn` в activate-release.sh; глобальный лимитер на /api/auth/login (60 попыток в минуту на инстанс); шесть копий IP в аудите заменить на commandActor(req). nginx.conf:49 и проверка здоровья в activate-release.sh:62,65 жестко ждут 127.0.0.1:5000 и не следуют за PORT (N52).

**N5. /api/dashboard/stats и /api/financial-summary агрегируют счета вне invoiceScope.** `server/storage.ts:106-113`; вызовы `server/routes/dashboard.ts:15, 251`.

```ts
if (role === 'partner' && partnerId) { results = await query.where(eq(invoices.partnerId, partnerId)); }
else if (role === 'client' && clientId) { results = await query.where(eq(invoices.clientId, clientId)); }
else { results = await query; }
```

Проблема: для assistant и accountant, а также для client и partner без привязки выборка идет без WHERE. projectStatsForRole оставляет им totalClientBill, paidClientBill, totalExpenses (`permissions.ts:136-143`). Чем грозит: ассистент при каждом открытии Index.tsx видит суммы по скрытым от него счетам; код клиента без clientId показывает оборот агентства. Что сделать: `getDashboardStats(db, actor)` в репозитории с WHERE invoiceScope(actor) и SUM ... FILTER вместо выгрузки. Добавить оба эндпоинта в цикл ролей accessPreservation.http.test.ts, включая unscoped-сессии. Проверка на проде:

```sql
SELECT role, count(*) FROM access_tokens
WHERE is_active AND ((role='client' AND client_id IS NULL) OR (role='partner' AND partner_id IS NULL))
GROUP BY role;
SELECT count(*) FROM invoices WHERE hide_from_assistant;
```

**F4. Шифрование кодов fail-open, dual-lookup вечный.** `server/lib/accessCode.ts:20-25`; `server/repositories/userRepo.ts:62, 187-188`; `server/index.ts:8-10`.

```ts
const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const accessCodeCryptoEnabled = SECRET.length >= 16;
or(eq(accessTokens.code, lh), eq(accessTokens.code, code)),
```

Проблема: без секрета коды молча пишутся открытым текстом, миграция запускается fire-and-forget при каждом старте, поиск по открытому тексту не удалить. .env.example:19 требует 32 символа, код принимает 16. Ключи выводятся sha256(secret+метка) в трех модулях с разной политикой (N32). Чем грозит: одна забытая переменная при переезде, и новые коды лежат в БД открыто без единой ошибки. Что сделать: модуль `server/config.ts` на zod, при production без секрета длиной от 32 сервер не стартует; ключи через `crypto.hkdfSync` с версией `hmac2:`/`enc2:`; миграция кодов отдельной командой `npm run migrate:codes`, затем удалить OR-ветку. Проверка на проде: `SELECT count(*) FILTER (WHERE code NOT LIKE 'hmac1:%') AS plaintext, count(*) FILTER (WHERE code_enc IS NULL) AS no_enc FROM access_tokens;`

**F16. Авторизация эндпоинтов не покрыта матрицей.** `server/accessPreservation.http.test.ts:33-60`; `server/reviewCompletion.test.ts:38-39`; `server/routes/tenantIsolation.security.test.ts:34`.

```ts
req.user = { role: req.get('x-test-role') as s.UserRole || 'admin', partnerId, clientId, token };
```

Проблема: единственный HTTP-тест с настоящими сессиями (accessPreservation) покрывает /api/invoices с дочерними ресурсами и /api/alert-counts; все HTTP-тесты вместе затрагивают около 11 префиксов /api из примерно 130 эндпоинтов. Два файла подменяют аутентификацию заголовком или vi.mock. Новый роут без строки в матрице ничего не уронит, N5 тому доказательство. Что сделать: тест строит список эндпоинтов из стека express-роутеров и падает, если для пары «роль × эндпоинт» нет ожидаемого статуса; фальшивую аутентификацию удалить.

**F22. Три API-слоя фронта и сырые fetch; /api/* без JSON-404.** `src/lib/api.ts:69-76`; `src/components/invoices/admin/AdminCashFlowForecast.tsx:41`; `server/vite.ts:43`.

```ts
export async function api<T>(endpoint: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(`/api${endpoint}`, options);
}
```

Проблема: проверка двойного префикса стоит только в apiGet. Сырых fetch( в src вне api.ts 52, мутации среди них (ManageAccessCodesDialog.tsx:62-187, AccessCodesManager.tsx:57-180, ClientDashboard.tsx:159-231) сами подставляют CSRF. Неизвестный /api/* получает index.html со статусом 200. Чем грозит: каждая новая мутация решает свою CSRF-обвязку сама; ошибка пути выглядит как SyntaxError в JSON. Что сделать: один `request()` в `src/api/client.ts`, eslint `no-restricted-globals: fetch` вне него; на сервере `app.use('/api', (_req, res) => res.status(404).json({error: 'not_found'}))` после роутеров.

### Целостность денег

**N4. Периодика выпускает счета 'agency' с маржой 0.** `server/services/recurringCommands.ts:42-46`; `server/lib/recurringInput.ts:12`.

```ts
const invoice = await invoiceRepo.createInvoice(tx, {
  scheme: recurring.scheme, partnerCommissionRate: recurring.partnerCommissionRate,
  clientBill: recurring.amount, ...
```

Проблема: в recurring_invoices нет колонки маржи, calculations не передается, zod принимает scheme='agency'. Воспроизведено: шаблон на 100 000 дает agencyMargin 0.00, netProfitAdmin 0.00. Сейчас спасает только список схем в CreateRecurringInvoiceDialog.tsx:232-236. Чем грозит: как только диалог предложит живую схему, каждый ежемесячный счет выйдет с нулевой прибылью, а клиент увидит завышенный бюджет. Что сделать: сразу отвергать scheme='agency' в recurringInput с 400; затем колонка `agency_margin_rate numeric(5,2)` и superRefine «для kind='agency' ставка обязательна»; generateOccurrence передает ставку. Проверка на проде: `SELECT id, scheme, is_active FROM recurring_invoices WHERE scheme='agency';`

**F8. Денежная математика внутри отчетов с другими дефолтами.** `server/repositories/financialReportsRepo.ts:197-199`; `server/repositories/clientOverviewRepo.ts:134`; `server/storage.ts:166`; `server/repositories/searchRepo.ts:175`.

```ts
: clientBill * (scheme === 'agency_40' ? 0.6 : 0.7); // agency_40: 60%, agency_30: 70%
: inv.scheme === 'agency_30' ? 30 : 40;
```

Проблема: запасные формулы и литеральные списки схем живут вне движка, для 'agency' база в двух отчетах считается по-разному. Чем грозит: новая схема или строка без расчета дает разные числа в двух кабинетах. Что сделать: одноразовая миграция recalculateAllInvoices для строк без расчета, затем удалить fallback-ветки; литералы заменить на isAgencyScheme из `shared/schemePolicies.ts`; eslint-правило запрещает литералы схем вне shared.

**F21. Деньги партнера собираются на фронте из двух запросов.** `src/components/invoices/PartnerDashboard.tsx:170-176`; `src/components/invoices/assistant/ClientBalancesView.tsx:49-59`; `server/routes/partners.ts:291`.

```ts
const signedActsCount = documentRisk ? totalPaidInvoices - documentRisk.missingActsCount : 0;
const reservedForExpenses = agency30Remaining + partnerSchemeDoNotSpend;
```

Проблема: вычитаются числа с разным скоупом (partner-summary без года, document-risk со своим). Старый hero-metrics жив и считает год по createdAt, поэтому серверных определений комиссии два (N58). Что сделать: один эндпоинт /api/partner/summary возвращает yearlyCommission, reserved, signedActs; фронт только форматирует; hero-metrics и его тест удалить.

### Корректность отчетов

**F9. «Дата денег» определена девятью способами.** `server/repositories/adminDashboardRepo.ts:25, 97`; `reportsRepo.ts:208`; `planningRepo.ts:128`; `invoiceSummaryRepo.ts:14`; `partnerDashboardRepo.ts:21`; `server/routes/assistant.ts:16`.

```ts
extract(month FROM coalesce(i.actual_payment_date, i.payment_date))          // :25
COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))  // :97
sql`${invoices.createdAt} >= ${yearStart.toISOString()}`                    // partnerDashboardRepo:21
```

Проблема: две функции одного файла относят один счет к разным месяцам, ассистенту оплаченные счета без actualPaymentDate не видны. Чем грозит: карточка месяца не сходится с годовой сводкой, кабинеты показывают разные суммы за один период. Что сделать: `server/modules/reports/predicates.ts` с `moneyDate(invoices)` (SQL) и `moneyDateOf(inv)` (JS), тест эквивалентности; eslint запрещает обращение к paymentDate/actualPaymentDate вне predicates и invoices/repo.

**F20. Для 'agency' показываются захардкоженные 30%/70%/15%.** `src/components/invoices/UnifiedInvoicesList.tsx:730, 917-952`; `details/InvoiceCalculationsSection.tsx:163, 191`; `InvoiceWaterfallChart.tsx:72-73`; `InvoiceCard.tsx:268, 281`.

```tsx
const isAgency30 = isAgencyScheme(invoice.scheme);
<span>Маржа агентства (30%):</span>
<span>{formatCurrency((invoice.client_bill || 0) * 0.30)}</span>
```

Проблема: карточки считают доли умножением client_bill на константы, хотя в той же модели лежат agency_margin и partner_share_from_margin. Табличный режим того же компонента (590-597) берет серверные поля. Чем грозит: один счет показывает разные доли в зависимости от режима просмотра. Что сделать: `describeScheme(scheme, calc)` в shared возвращает подписи и проценты из расчета; литералы процентов в src/components запрещены eslint; isAgency30 удалить.

**F19. Четыре представления счета, ставка партнера из разных источников.** `src/lib/invoiceView.ts:17`; `src/lib/invoiceDetailsView.ts:68`; `server/permissions.ts:50-57`.

```ts
partner_commission_rate: parseNum(inv.partnerCommissionRate),                    // список
partner_commission_rate: parseNum(parseNum(invoiceData.calculations?.commissionRate)), // карточка
```

Проблема: partnerCommissionRate нет в белом списке ROLE_INVOICE_PERMISSIONS ни для одной роли, parseNum(undefined) = 0. В списке всегда «Комиссия (0%)», «к переводу» = bill минус расходы (UnifiedInvoicesList.tsx:969). Что сделать: фронт работает прямо с camelCase InvoiceDto; оба адаптера удалить; отсутствующее поле = null, а не 0 (N49); поле добавить в белый список ролей, которым оно положено.

**F13. export.ts на 946 строк: HTTP, скоуп, агрегация, HTML/CSS, шрифты.** `server/routes/export.ts:19-29, 186-196, 258-269, 396-460, 488-499, 762-780`.

```ts
if (req.user?.role === "partner") { const partnerOwnId = req.user.partnerId; ...
  invoices = invoices.filter(inv => inv.partnerId === partnerOwnId); }
```

Проблема: ролевой фильтр скопирован четыре раза поверх SQL-скоупа, фильтр дат и clientName-IIFE по три раза, Content-Disposition двумя разными кодами (528-534 и 915-935). Что сделать: модуль `reports/export/` (query, model, render/html, render/pdf, render/xlsx, contentDisposition, fonts); роут в 15 строк.

**F7. Партнерская аналитика размазана по шести местам.** `server/repositories/dashboardRepo.ts:1-6`; `adminDashboardRepo.ts:5, 44`; `server/storage.ts:193-206`.

```ts
export async function getAdminDashboardStats(db: DB, getRecurringExpectedForMonth: (y: number, m: number) => ...
import type { DashboardInvoiceDetail, MonthlyData } from "../storage";
```

Проблема: dashboardRepo оставлен фасадом-реэкспортом, колбэк обходит цикл импортов, репозитории импортируют типы из фасада, долг партнера считается в God-объекте. Что сделать: `reports/admin`, `reports/partner`, `reports/client` с read-model в `shared/contracts/reports/`; фасад удалить.

### Бэкап, деплой, эксплуатация

**N1. Проверка активации релиза ничего не доказывает и откатывает код поверх миграций.** `deploy/activate-release.sh:52, 69-74`; `server/worker.ts:11-13`.

```bash
jobs=$(sudo -u postgres psql -At -d finance_duck -c "SELECT count(*) FROM scheduled_jobs WHERE key IN ('recurring-invoices','login-limit-cleanup') AND last_finished_at IS NOT NULL AND state='idle'")
```

Проблема: при повторном деплое строки остались от прошлого worker, проверка зеленая без нового процесса. Если один шаблон периодики падает, задание висит в failed, и каждый деплой через 20 секунд уходит в rollback поверх уже примененных миграций. Чем грозит: одна битая запись блокирует срочные исправления. Что сделать: worker при старте пишет в `worker_heartbeat` commit из release.json и обновляет строку каждые 30 секунд; скрипт ждет heartbeat с нужным commit; ошибка одного шаблона помечает шаблон, а не задание. Проверка на проде: `SELECT key, state, last_error, last_finished_at FROM scheduled_jobs;`

**N3. Формат архива привязан к текущей схеме.** `server/services/backupArchive.ts:13, 17-18, 48`; `server/backupService.ts:45-50`.

```ts
const validators = Object.fromEntries(Object.entries(backupTables).map(([key, table]) => [key, createSelectSchema(table).strict()]));
JSON.stringify({ format: 'fdb1', schema: 6, ...meta, ...
```

Проблема: строки архива валидируются strict-схемой текущего кода. Миграция, добавившая колонку, делает старые архивы невосстановимыми, пока кто-то не допишет прокладку. schema: 6 не связан с drizzle 0000–0007, docs/backup-and-capacity.md:17 пишет schema=5. Причину отказа лог сводит к имени класса (N12). Чем грозит: отказ проявится в день аварии. Что сделать: бэкап = `pg_dump -Fc` плюс tar объектов, оба зашифрованы; restore = pg_restore в shadow-БД, затем migrate() до HEAD, сверка, swap. Минимум до перехода: CI-тест восстанавливает fixture-архив прошлого релиза, правило «новая миграция = новый fixture».

**F18. Акты загружаются base64 в JSON, mimeType любой.** `server/app.ts:33-37`; `server/routes/acts.ts:104, 125-139`; `server/repositories/actsRepo.ts:44-46`.

```ts
const bigJson = express.json({ limit: "20mb" });
res.json({ fileName: act.fileName, fileData: await storage.readSignedActData(id), mimeType: act.mimeType });
```

Проблема: хранение вынесено в FileObjectStore, но загрузка идет через 20 МБ JSON, mimeType без whitelist и без проверки магических байт, мертвый /download держит файл в памяти и отдает data-URL. Чем грозит: произвольный тип отдается обратно браузеру при выключенном CSP. Что сделать: multipart с лимитом 10 МБ, whitelist pdf/png/jpg с проверкой сигнатуры; /download удалить; getSignedAct без file_data; колонку file_data удалить миграцией.

**Проверить на проде до начала работ.** (1) release.json: входит ли 70448f2 в историю выкаченного commit (N7). (2) SQL по 'agency' с пустой ставкой партнера (N2). (3) Внешний `curl` на :5000 и `ufw status` (N6, F2). (4) Токены client/partner без привязки и число скрытых счетов (N5). (5) Шаблоны периодики на 'agency' (N4). (6) scheduled_jobs: state и last_error (N1). (7) Коды без префикса hmac1: (F4). (8) Число активных счетов 'agency', по которым клиент получает PDF/XLSX без бюджета (F14).

## 4. Нарушения SOLID и DRY

**SRP.** `server/routes/export.ts` (946 строк, F13) одновременно контроллер, сервис отчетов и view-слой. `server/storage.ts:97-113` (F80, N5): фасад, который «только делегирует», держит getDashboardStats с выборкой, циклом и ветками по схемам. `server/routes/acts.ts:14-37, 46-78` (F123): акты, бонусы, коды доступа и статистика ассистента в одном роутере. `src/hooks/useInvoiceCommands.ts:33` (N45, F91): диалог похудел до 293 строк, но хук склеивает около 100 полей из пяти под-хуков, каждая секция получает Pick от общего мешка.

```ts
return { ...status, ...metadata, ...financial, ...expense, ...period, toast, queryClient, invoice, ... }
```

Цена: правка одного поля карточки требует понимать весь мешок; N7 живет именно в этих под-хуках.

**OCP.** Новая схема требует правок в литералах: `storage.ts:166`, `searchRepo.ts:175`, `export.ts:287-288, 514-515, 811-812` (F8, F14), пять словарей подписей на фронте (F98), коэффициенты в `scripts/audit-money.sql:31` (N54). Новая колонка требует прокладки в `backupArchive.ts:17-18` (N3). Новая идемпотентная команда требует правки регулярки `src/lib/api.ts:26` (N83). Цена: система закрыта для расширения и открыта для тихих ошибок.

**LSP.** Порты обещают поведение, которого реализация не дает. `storagePorts.ts:328` объявляет `markBonusesAsPaid`, реализация `actsRepo.ts:173` пустая (F60):

```ts
export async function markBonusesAsPaid(_db: DB, _invoiceIds: string[]): Promise<void> {}
```

`storagePorts.ts:250-251` объявляет `updateWorkingCapital`, PATCH отвечает 200 и ничего не сохраняет (F81). Цена: вызывающий код уверен, что выплата отмечена, а ее нет.

**ISP.** `server/middleware.ts:12-19`: req.user несет полный AccessToken с code и codeEnc во все роуты (F35). routeStores.ts дает роутерам Pick от фасада на 107 операций, а 33 сигнатуры портов выведены через `typeof xRepo.fn`, то есть интерфейс зависит от реализации (F79, N73). Цена: узкий интерфейс формально есть, реально он копия реализации.

**DIP.** `InvoiceCommands` и `PaymentCommands` по умолчанию привязаны к боевому синглтону: `constructor(private readonly database = db) {}` (`invoiceCommands.ts:25`, `paymentCommands.ts:27`, N64). Репозиторий импортирует сервис: `recurringRepo.ts:16` из `services/recurringCommands` (N37). Восемь репозиториев импортируют типы из `../storage` (F50, F7). Цена: слои связаны в обе стороны, тест без мока модуля не собрать.

**KISS.** `invoiceCommands.ts:43`: версии квитанций и legacy-отпечаток для квитанций, проживших 22 минуты (N34, N35). `worker.ts:16`: аренды с heartbeat и SKIP LOCKED для одного systemd-процесса (N74). `backupService.ts:38`: шесть форматов бэкапа (N11). `api.ts:26`: поведение клиента по регуляркам URL (N85). Цена: каждая конструкция требует теста и понимания, а ее риск при десятке пользователей закрывается проще (раздел 5).

| Логика | Мест | Где | Находки |
|---|---|---|---|
| Видимость полей по ролям | 4+ | `server/permissions.ts:50, 88, 120`; `src/lib/invoicePermissions.ts:38`; маскирование в `financialReportsRepo.ts:390, 404, 416`; `alertsRepo.ts:154` | N48, F121, F37 |
| Тенант-фильтр | 3 стиля | invoiceScope `invoiceQuery.ts:27-36`; шесть предикатов `tenantAccess.ts:79-103`; ручные фильтры `export.ts:186, 258, 488, 762`; ветки `storage.ts:106-113` | F82, F13, N5 |
| Форма актора | 5 | `middleware.ts:12-19`; TenantActor `tenantAccess.ts:8`; InvoiceActor `invoiceAccess.ts:4`; `services/commandActor.ts:4-7`; `invoiceCommands.ts:17` | F35, F82 |
| Реестр идемпотентных команд | 3 | commandActor(req) в `invoices.ts`, `partners.ts:165-179`; регулярка `src/lib/api.ts:26`; regex-реестр схем ответа `shared/apiContract.ts` | N83, N84, N85 |
| Маппер счета | 4 | `shared/invoiceContract.ts`; `src/lib/invoiceView.ts:11-17`; `src/lib/invoiceDetailsView.ts:67-90`; projectInvoiceForRole `permissions.ts:246-252` | F19, N47, N49 |
| Классификатор схем и ставки | 8+ | `shared/schemePolicies.ts`; `export.ts:287, 514, 811`; `storage.ts:166`; `searchRepo.ts:175`; `financialReportsRepo.ts:197-199`; `clientOverviewRepo.ts:134`; `UnifiedInvoicesList.tsx:730`; `useInvoiceCommands.ts:30-31`; `audit-money.sql:31` | F8, F14, F20, F98, N44, N54 |
| Дата денег | ~9 | `adminDashboardRepo.ts:25, 97`; `reportsRepo.ts:208, 277`; `planningRepo.ts:128`; `invoiceSummaryRepo.ts:14`; `partnerDashboardRepo.ts:21`; `assistant.ts:16` | F9 |
| «Просрочен» | 7 | `alertsRepo.ts:198, 203-208, 254-256`; `storage.ts:155-158`; `invoiceQuery.ts:46`; три реализации на фронте | F41, F108 |
| Долг партнера / остаток клиента | 6 / 5 | `storage.ts:166-170, 203-207`; `partnerRepo.ts:96, 248, 365`; `partnerDebtRepo.ts`; `export.ts:223, 298, 556, 654, 838` | F51, F75 |
| Парсер денег | 3 | `server/lib/validate.ts:17`; `invoiceCommandInput.ts:17-19`; recurringInput и переносы | N13 |
| Граница команды и аудит | 3 + 1 | `InvoiceCommands.run`, `PaymentCommands.run`, recurringCommands; logAssistantAction после коммита в clients, partners, acts | N35, N37, N38 |
| API-слой фронта | 3 | `src/lib/api.ts` (api/apiGet/apiPost...); 52 сырых fetch; локальный apiGet `AdminCashFlowForecast.tsx:41` | F22, F90 |
| Ключи и инвалидация | 3 | financialKeys (5 ключей); предикат на 16 префиксов и 11 legacy-ключей `financialQueries.ts:11-23`; 86 ручных invalidateQueries | F113, N79, N86 |
| Словари статусов и схем | 10+ | statusMap ×4 в `export.ts:89, 280, 509, 807`; `myInvoices.ts:11-12`; два словаря в хуках карточки; «Черновик» в 15 файлах src | F66, N80, F98 |
| Ключи из ACCESS_CODE_SECRET | 3 | `accessCode.ts:24-25`; `backupCrypto.ts:19`; `backupArchive.ts:42` | N32 |

## 5. Спагетти, избыточность и стоимость владения через год

**God-компоненты.** UnifiedInvoicesList.tsx 1054 строки, ClientStats.tsx 745, ManageClientsDialog.tsx 701, DoNotSpendDashboard.tsx 701, AdminDashboardMetrics.tsx 691, ClientBalancesView.tsx 628, ExportFiltersDialog.tsx 621, CreateInvoiceDialog.tsx 593, ManagePartnersDialog.tsx 580, PartnerDashboard.tsx 531, InvoiceCalculationsSection.tsx 480. ClientStats.tsx не изменился вовсе (745 строк), UnifiedInvoicesList похудел на 58 строк из 1112. UnifiedInvoicesList держит открытый счет в трех состояниях (searchParams.open, selectedInvoiceId, detailsOpen) с setTimeout от двойного клика (F102) и массовое удаление по выборке, переживающей смену страницы и фильтра (N42). ManageClientsDialog и ManagePartnersDialog грузят данные useState+useEffect мимо TanStack Query (F107). На сервере крупнейшие: export.ts 946, invoiceRepo.ts 626, recurringRepo.ts 449, storage.ts 448, storagePorts.ts 408.

**Логика в контроллерах и JSX.** План-факт считается в обработчике с двойной полной выборкой (`dashboard.ts:176-204`, F64, F47). assistant.ts, documentStatus.ts и messages.ts собирают json_build_object прямо в роуте (N22). Карточки считают деньги в JSX (F20), резерв посчитан трижды (F92), второй редактор процента читает DOM через getElementById (F97).

**Три архитектуры одновременно.** Около 130 эндпоинтов: около 14 через *Commands, около сотни через фасад storage, около 15 прямо в drizzle из роутов (N21, N22). Командный слой вызывают только invoices.ts и partners.ts, а db напрямую импортируют пять файлов маршрутов, включая invoices.ts. Один PATCH счета проходит двойную границу: роут делает requireRole, findAuthorizedInvoice, validateBody, pick, constrainInvoiceWrite, затем сервис повторяет авторизацию и валидацию и читает счет с четырьмя JOIN четыре раза (N30). Фасад сохранил публичные мутации счета параллельно командам, recalculateAllInvoices уже идет мимо командного слоя (N39, N40). Через год следующий агент добавит роут через storage.updateInvoice или сырой db и обойдет аудит и outbox.

**Сложность против размера системы.** Десяток пользователей, сотни или тысячи счетов, один оператор.

| Механизм | Оценка | Решение |
|---|---|---|
| Идемпотентность с квитанциями (N34, N35) | Оправдана для денег: двойной клик по оплате = двойные деньги. Версии receiptVersion и legacy-отпечатки не оправданы | Одна реализация в `platform/command.ts`, одна версия, TTL 7 дней с чисткой worker |
| Outbox (N72, N41) | Оправдан: уведомление об оплате не должно уйти при откате транзакции | Оставить; добавить max 10 попыток, статус dead, причину ошибки, удаление доставленных через 30 дней |
| Аренда заданий с heartbeat, SKIP LOCKED (N74) | Не оправдана: systemd держит один worker, дубль черновика уже исключен occurrence_key | `pg_try_advisory_lock` на задание, scheduled_jobs только как журнал последнего запуска; убрать задание с датой 9999 |
| Свой формат бэкапа с ветками версий (N3, N11, N56) | Цель оправдана данными, инструмент нет | pg_dump -Fc плюс tar объектов, шифрование, restore через pg_restore и migrate() |
| Shadow restore с переименованием БД (N26, N27) | Оправдан: самая разрушительная операция в системе | Оставить единственным путем; HTTP in-place и CLI in-place удалить; retained-БД старше 14 дней удалять скриптом после подтверждения оператора |
| Порты storagePorts и routeStores (N73) | Не оправданы: около 1000 строк плумбинга, четыре файла на одно чтение | Удалить вместе с storage.ts |
| Релизные каталоги с pg_dump на каждый деплой (N8) | Оправданы | Хранить 5 последних, проверять свободное место до дампа |

**Тесты, названные по процессу.** Около 940 строк в reviewFollowup, reviewRegressions, reviewCompletion, architectureRemediation (R1–R8), reviewCompletion.tsx (N17, N55, N62, N63, N78). Внутри вперемешку лимитер, jobRunner, бэкап, периодика, экспорт. Сам логин по HTTP не проверяет ни один тест, лимитер в HTTP-тесте заменен vi.fn() (N14). Денежные регрессии гоняются на agency_30 с фиксированными ставками, поэтому N2 прошел (N18). Тест хуков карточки запускается с open:false и счетом без дат, поэтому N7 прошел (N43). 36 тестовых файлов исключены из tsc (N50). Гейт деплоя не требует зеленого CI и не включает test:postgres (N53).

**Документация против кода.** docs/architecture-review-remediation.md и docs/releases/*.md, около 77 КБ. Ложны или устарели: «SQL scope/агрегации» (опровергнуто N5), «каждый роут получает Pick» (N22), «общий maintenance lock» (N27), «схема 5» (N3), OnFailure-алерт из deploy/README.md:117 (N36), «PostgreSQL-регрессии обязательны перед активацией» (N53). SECURITY.md и SECURITY_TESTING.md описывают Supabase RLS (F24). install.sh и deploy/README несовместимы с релизной моделью: восстановление сервера с нуля по документам не сработает (N9).

**Цена типовой фичи сейчас.**

- *Новая роль.* `shared/domainTypes.ts` USER_ROLES; три таблицы в `server/permissions.ts` (F37); invoiceScope и шесть предикатов tenantAccess (F82); маскирование в репозиториях (F121); searchRepo и alertsRepo, где accountant уже решается по-своему (N16); `src/lib/invoicePermissions.ts` (N48); ProtectedRoute без ролей и RoleBasedHome (F88, F127); 87 сравнений role в src (F105); четыре фильтра в export.ts (F13); тест-матрица, которой нет (F16). Около 15 файлов и ни одной проверки, которая напомнит о пропуске.
- *Новая схема.* INVOICE_SCHEMES и миграция enum; SCHEME_POLICIES; литералы в storage.ts и searchRepo.ts (F8); четыре классификатора в export.ts (F14); fallback-формулы в двух отчетах (F8); пять словарей подписей (F98) и statusMap/schemeMap (F66); проценты в четырех компонентах (F20); дефолт agency_30 в useInvoiceCommands (N44); список в диалоге периодики (N4); коэффициенты audit-money.sql (N54); мертвый calculatePartnerDebt (F116). Около 20 мест, половину компилятор не покажет.
- *Новое поле счета.* schema.ts и миграция; zod DTO в invoiceContract.ts; белый список ROLE_INVOICE_PERMISSIONS, иначе поле молча пропадет (F19); invoiceCommandInput.ts и старый validate.ts (N13, N30); constrainInvoiceWrite; invoiceRepo; порт и Pick, если нужна операция (N73); прокладка upgradeLegacyRow, иначе старые архивы перестанут восстанавливаться (N3); два адаптера с parseNum (N47, N49); хук карточки с useEffect-синхронизацией (N7). Около 12 файлов, и один забытый ломает restore.

## 6. Целевая архитектура

**Две стратегии.**

| | Инкрементальная («душитель») | «Домены сначала» |
|---|---|---|
| Суть | Модуль за модулем на целевую структуру, старый путь удаляется в той же серии, прод работает | Сначала весь код режется на контексты, затем наполняется |
| Размер изменения | 300–800 строк на шаг | Сотни файлов на первом шаге |
| Риск для денег | Локален, проверяется сверкой одного модуля | Распределен по всей системе сразу |
| Задача для ИИ | Узкая, с ясным критерием | Широкая, где проще оставить оба пути |
| Чем кончится при срыве | Один недоделанный модуль | Повтор 17–18.10: 277 файлов, 58 частичных |

Выбор: инкрементальная стратегия с зафиксированной целевой картой модульного монолита. Карта нужна, чтобы душитель не породил четвертый слой. Порядок нужен, чтобы каждый шаг закрывался удалением старого пути. Обоснование: владелица-оператор не может остановить прод и не может проверить изменение на 277 файлов. ИИ-ассистент надежно доводит задачу на 10–15 файлов с тестом-барьером и плохо доводит переезд, где старый путь продолжает работать. 58 частичных находок это и показывают.

**Структура server/.**

```
server/
  main.ts                 // бывш. index.ts + vite.ts: config -> db -> app -> listen(HOST)
  worker.ts               // задания + outbox + heartbeat
  config.ts               // zod: HOST, PORT, DATABASE_URL, ACCESS_CODE_SECRET, DOCUMENT_OBJECT_DIR, CORS_ORIGINS
  http/
    app.ts                // helmet + CSP, лимиты тела, CSRF, JSON-404 для /api, error-middleware
    principal.ts          // req -> Principal (единственная форма актора, без code/codeEnc)
  platform/
    command.ts            // runCommand: tx + блокировка + квитанция + аудит + outbox (из invoiceCommands.ts, paymentCommands.ts)
    audit.ts              // единственный писатель журнала, только внутри tx
    jobs.ts               // advisory lock + scheduled_jobs как журнал (из jobRunner.ts)
    outbox.ts, objectStore.ts, crypto.ts (hkdf, версии ключей; из accessCode.ts, backupCrypto.ts)
  modules/
    invoices/   routes.ts, commands.ts, repo.ts, recalc.ts (resolveRates, _recalculateInvoiceExpenses), expenses.ts, transfers.ts
    recurring/  routes.ts, commands.ts (recurringCommands.ts), repo.ts (recurringRepo.ts), schedule.ts
    partners/   routes.ts, payments.ts (paymentCommands.ts), debt.ts (partnerDebtRepo.ts + долг из partnerRepo.ts и storage.ts)
    clients/    routes.ts, repo.ts (clientRepo.ts; client_partners единственная связь)
    documents/  routes.ts (акты из acts.ts, multipart), repo.ts (actsRepo.ts)
    access/     routes.ts (auth.ts + access-tokens из acts.ts), sessions.ts, limiter.ts, codes.ts
    bonuses/    routes.ts (бонусы из acts.ts), ledger.ts (начисления и выплаты строками)
    messages/   routes.ts (messages.ts), telegram.ts
    reports/    predicates.ts (moneyDate, isOverdue), admin/, partner/, client/,
                export/ (query.ts, model.ts, render/html.ts, render/pdf.ts, render/xlsx.ts, contentDisposition.ts, fonts.ts)
    backup/     dump.ts (pg_dump), restore.ts (shadow + migrate + swap), cli.ts
```

Удаляются: `storage.ts`, `storagePorts.ts`, `routeStores.ts`, `dashboardRepo.ts`, `server/lib/validate.ts`, `server/lib/format.ts`, `services/backupArchive.ts` после перехода на pg_dump. Каждый `modules/*/routes.ts` импортирует только свой модуль и `platform/*`, правило eslint `no-restricted-imports` запрещает роутам импорт `db`.

**Структура shared/ и src/.**

```
shared/
  money.ts               // Money (строка с 2 знаками) + parseMoney (единственный парсер, из N13)
  financialEngine.ts
  schemePolicies.ts      // SCHEME_POLICIES + resolveRates + describeScheme + SCHEME_LABELS
  access/policy.ts       // роль x ресурс x поле -> видимость, роль x действие -> разрешено
  labels.ts              // INVOICE_STATUS_LABELS
  format.ts              // вместо двух зеркал
  contracts/             // invoiceContract.ts, reports/*.ts, defineEndpoint({method, path, input, output, idempotent})
src/
  app/                   // App.tsx, routes.tsx с RoleRoute по shared/access/policy
  api/
    client.ts            // request(): ApiError, CSRF из памяти, Idempotency-Key по contract.idempotent
    keys.ts              // invoiceKeys.all/list/detail, reportKeys.*, invalidates(command)
  features/
    invoices/ (list/, details/, create/, hooks/ на useMutation), partners/, clients/, documents/,
    recurring/, access-codes/, dashboards/{admin,partner,client,assistant,accountant}/
  ui/                    // текущий ui-кит
```

**Контракты.**

1. *Политика доступа из одного источника.* `shared/access/policy.ts` содержит таблицу видимости полей по роли и схеме и таблицу действий. Сервер строит projectInvoiceForRole и маскирование отчетов из нее, фронт строит VisibleFields из нее же. invoiceScope(principal) остается единственным SQL-предикатом арендатора, fail-closed. eslint запрещает `role ===` вне `access/`. Закрывает N48, F121, F82, F35, N16, F105.
2. *Денежный тип.* В DTO деньги приходят строкой с двумя знаками, на фронте форматируются из строки, арифметика только в financialEngine на Decimal. Отсутствующее поле = null и показывается прочерком (N49). parseNum для денег запрещен.
3. *Один слой команд для всех мутаций.* `runCommand(principal, {name, idempotencyKey?, audit, outbox}, fn)`. Через него идут счета, расходы, переносы, оплаты партнерам, выплаты бонусов (N23, N24), шаблоны периодики (N31), удаление клиента и партнера (F43, F77), коды доступа. Аудит пишется только внутри транзакции (N38).
4. *Один API-клиент.* Эндпоинт описан в `shared/contracts` через defineEndpoint; сервер регистрирует роут по нему, фронт вызывает по нему. Флаг idempotent берется из контракта, регулярки в api.ts и apiContract.ts удаляются (N83–N85).
5. *Фабрика ключей запросов.* `src/api/keys.ts`; каждая команда объявляет `invalidates(result)`: деталь счета, списки, зависимые сводки. Предикат на 16 префиксов удаляется (N79, N86).

**Удалить совсем.** На сервере: hero-metrics и его тест (F45, N58), working-capital GET/PATCH (F81), /api/financial-summary (F65), /api/acts/:id/download (N66), markBonusesAsPaid (F60), четыре эндпоинта ассистентских виджетов, которые нигде не смонтированы (N67), HTTP in-place и CLI in-place restore (N26, N27), ветки бэкапа 2.0–5.0 (N11), receiptVersion и legacy-отпечатки (N34), старый CSRF-параметр validateSession (N61), служебные таблицы из бэкапа: сессии, лимиты, квитанции, outbox, задания (N33). На фронте: invoiceView.ts и invoiceDetailsView.ts (F19, N47), calculatePartnerDebt (F116), 11 мертвых файлов admin/ включая AdminCashFlowForecast и CurrentMonthPlanFact (F103), useRealtimeSubscription (F114), useUserRole-shim и useRateLimit (F125), wouter и OverduePaymentsAlert (F124, F108), клиентский таймер useCookieSession (F111), второй хук страницы счетов (N81, N82), второй редактор процента партнера (F97).

## 7. Дорожная карта

**Этап 0 «Горящее» (1–2 дня).**

| Находка | Изменение | Критерий готовности | Тест-барьер |
|---|---|---|---|
| N7 | useMemo в useInvoice; черновик через useState(() => initial) и key на секции | Карточка со сроком оплаты открывается, ввод суммы и заметки доживает до сохранения | Компонентный тест InvoiceDetailsDialog с paymentDate: ввод в input-client-bill сохраняется, рендеров меньше 20 |
| N2 | resolveRates; для 'agency' ставка партнера = колонка ?? 0; миграция NOT NULL DEFAULT 0; пересчет найденных счетов | SQL из раздела 3 возвращает 0 строк | Тест: 'agency', partnerCommissionRate=null, маржа 40% -> netProfitAdmin = маржа, partnerShare = 0 |
| N6/F2 | HOST=127.0.0.1 в юните и .env.example; падение при не-loopback в production; trust proxy 'loopback'; ufw active (OpenSSH, Nginx Full) | Снаружи `curl -m5 http://5.129.198.180:5000/api/health` не соединяется; `ss -ltn` показывает 127.0.0.1:5000 | Unit-тест config: production + HOST=0.0.0.0 -> ошибка старта; проверка ss в activate-release.sh |
| N5 | getDashboardStats(db, actor) с invoiceScope и SQL-агрегатами | Ассистент не видит сумм скрытых счетов | /api/dashboard/stats и /api/financial-summary в цикле ролей accessPreservation, включая unscoped и скрытый счет |
| N4 | recurringInput отвергает scheme='agency' с 400 | Шаблон 'agency' не создается | HTTP-тест POST /api/recurring с 'agency' -> 400 |
| N1 | worker_heartbeat с commit; ошибка шаблона не валит задание | Повторный деплой ждет heartbeat нового commit; битый шаблон не откатывает релиз | Тест jobRunner: один шаблон бросает, задание завершается idle, шаблон помечен; деплой дважды на копии сервера |

**Этап 1. Периметр и секреты (3 дня).** F4, F28, N32, F29, F115, F38, F39, N60, N68, N10, F59, F17 (остаток), N14. Критерий: config.ts единственный читатель process.env; без секрета от 32 символов прод не стартует; CSP включен; шрифты локальные; robots запрещает индексацию; login_rate_limits хранит HMAC; глобальный лимитер на вход. Барьер: auth.http.test.ts на настоящем лимитере (порядок IP и кода, 429, сброс при успехе); тест config. Параллельно с этапом 2.

**Этап 2. Деньги: один источник ставок и формул (5 дней).** F48, F8, F14, F20, F21, F51, F75, F92, F116, N13, N54, N59, N44, N23, N24, N15, N65. Критерий: grep по `0\.30|0\.7|\? 30 : 40|'agency_30'` вне shared/schemePolicies.ts дает 0; ставка маржи хранится в invoices, а не в кэше; бонусы ведутся строками начислений и выплат через runCommand. Барьер: snapshot-тест модели отчета на 6 схем; audit-money.sql сверяет кэш с invoices; тест «выплата больше долга -> 400». Сверка итогов на копии прод-БД до и после: разница 0 или объяснена построчно.

**Этап 3. Единая политика доступа (4 дня).** F35, F37, F82, F121, F88, F127, F13 (скоуп), F16, N16, N48, F105. Критерий: одна форма Principal; `role ===` вне access/ запрещено eslint и равно 0 на сервере; фронт строит видимость из shared/access/policy.ts. Барьер: матрица «роль × эндпоинт», собранная из стека роутеров; новый роут без строки роняет тест. Начинается после этапа 0, нужен до этапа 4.

**Этап 4. Один слой записи, удаление фасада (6 дней).** N21, N22, N25, N29, N30, N35, N37, N38, N39, N40, N64, N73, F7, F43, F50, F77, F79, F80, N31, F36, F122. Модули переезжают по одному: invoices, recurring, partners, clients, documents, bonuses, access, messages. Критерий: storage.ts, storagePorts.ts, routeStores.ts удалены; все мутации через runCommand; есть error-middleware; роуты не импортируют db. Барьер: eslint no-restricted-imports; тест «каждая мутация пишет аудит в той же tx» по списку команд.

**Этап 5. Аналитика: одна дата денег, просрочка, прогноз (4 дня).** F9, F41, F44, F46, F47, F52, F53, F54, F64, F65, F45, F81, N57, N58, N70. Критерий: moneyDate и isOverdue только в reports/predicates.ts; месяцы во всех контрактах 1–12 через zod; monthly_financial_plans с UNIQUE(year, month) и ON CONFLICT. Барьер: тест эквивалентности SQL и JS для moneyDate на фикстуре всех статусов; eslint-запрет paymentDate вне predicates. Параллельно с этапом 6.

**Этап 6. Фронт: один клиент, ключи, DTO без адаптеров (6 дней).** F22, F19, F89, F90, F91, F97, F98, F102, F103, F106, F107, F108, F110, F111, F113, F114, F124, F125, N42, N45, N46, N47, N49, N79, N80, N81, N83–N87. Критерий: fetch вне src/api/client.ts = 0; localStorage только для пресетов UI; хуки команд на useMutation; адаптеров snake_case нет. Барьер: компонентные тесты InvoiceDetailsDialog и UnifiedInvoicesList для 5 ролей; eslint no-restricted-globals.

**Этап 7. Бэкап и эксплуатация (4 дня).** N3, N8, N9, N11, N12, N20, N26, N27, N33, N36, N41, N51, N52, N53, N56, N72, F18, F30. Критерий: бэкап через pg_dump, единственный restore через shadow-БД; /api/health проверяет БД и отдает commit; алерт в Telegram владелице при failed-задании и при dead в outbox; install.sh поднимает сервер с нуля; deploy.sh проверяет зеленый CI для SHA через gh. Барьер: CI восстанавливает архив прошлого релиза на текущую схему; полный прогон install.sh на чистой ВМ. Параллельно с этапами 2–3.

Тесты переезжают в папки модулей на каждом этапе: тест модуля лежит рядом с ним (N17, N55, N62, N63, N78). Итого около 34 рабочих дней последовательно. Параллельно идут 1 с 2, 5 с 6, 7 с 2–3; этап 4 ждет этап 3. С двумя сессиями ИИ на независимых этапах календарный срок около 6 недель.

**Правило процесса.**

- *Размер.* Одно изменение: до 400 строк добавленного кода и до 15 файлов, удаления не считаются. Переезд модуля = серия таких изменений, последняя в серии удаляет старый путь. Изменение, которое вводит новый путь без удаления старого, принимается только со ссылкой на уже открытую задачу удаления с датой.
- *Обязательные проверки.* typecheck, lint, vitest, test:postgres и сборка в CI; deploy.sh отказывается выпускать SHA без зеленого CI. Для денежных изменений сверка итогов audit-money.sql на копии прод-БД до и после, вывод прикладывается к изменению.
- *Кто принимает.* Виктория принимает по двум пунктам: «что изменится на экране» (ручная проверка на копии по чек-листу из описания) и «какие числа изменятся» (вывод сверки). Отдельная сессия ИИ, не автор, проверяет diff против критерия этапа и grep-ом ищет старый путь. Статус «исправлено» ставит только тест-барьер, его имя указано в описании; документы-протоколы в docs/releases больше не пишутся.
- *Границы задачи.* Одна ветка = одна задача этапа; в описании список файлов, которые агент имеет право менять; прод-ветка защищена, слияние только через PR.

## 7а. Чего не делать

- **Микросервисы.** Десяток пользователей, один VDS, один оператор. Сеть между сервисами добавит распределенные транзакции туда, где сейчас одна транзакция Postgres защищает деньги.
- **Event sourcing.** Журнал действий и денежный леджер решаются таблицами строк в той же транзакции. Проекции и пересборка событий утроят число мест, где может разойтись сумма.
- **CQRS с отдельной моделью чтения.** Отчеты на тысячах счетов считаются SQL-агрегатом за миллисекунды. Нужна одна дата денег, а не вторая база.
- **Kubernetes, отдельный BFF, GraphQL.** systemd, nginx и один Express-процесс покрывают нагрузку с запасом на порядки. BFF уже есть: это сам Express.
- **Свой ORM, generic repository, DI-контейнер.** Drizzle достаточен. Фабрики и порты уже показали цену: около 1000 строк плумбинга (N73).
- **Redis, брокер сообщений, очередь задач.** Postgres держит сессии, лимиты, outbox и задания. Еще один процесс = еще одна точка отказа для одного оператора.
- **Генерация OpenAPI, монорепо-инструменты.** defineEndpoint на zod в shared дает тот же результат без инструмента сборки; пакет один.

**Что из уже сделанного упростить, а не развивать.** Идемпотентность: одна реализация, одна версия, TTL, без новых версий квитанций (N34, N35). Задания: advisory lock вместо аренд с heartbeat, без задания с датой 9999 (N74). Бэкап: pg_dump и pg_restore вместо седьмого формата и новых прокладок (N3, N11). Restore: один путь через shadow-БД (N26, N27). Порты storagePorts и routeStores: ни одной новой сигнатуры, удалить вместе с фасадом (N73). api.ts: ни одной новой регулярки по URL (N85). Тесты review*: новых файлов с именем раунда не создавать, существующие разнести по модулям (N55). docs/releases: не дописывать, источник правды о закрытой находке только тест-барьер.