# Архитектурное ревью FinanceDuck: каталог находок

Приложение к [architecture-review-2026-10-21.md](architecture-review-2026-10-21.md). Состояние кода: HEAD `642c834` (= `origin/timeweb-migration`), 21.10.2026. База сравнения: `ece9adf`, 17.10.2026.

Как получены данные. 17.10 десять агентов-ревьюеров разобрали код `ece9adf` по подсистемам. Из 131 находки после дедупликации 127 подтвердили независимые верификаторы, открывавшие код, 4 опровергнуты. 21.10 каждая из 127 перепроверена на HEAD: по каждой из 11 областей один агент определял статус и искал новые проблемы, второй пытался опровергнуть оба вывода. Таблицы ниже сгенерированы из этих данных без ручной правки.

## Содержание

1. Статус 127 находок 17.10 на HEAD
2. Новые находки на HEAD (N1–N87)
3. Незакрытые находки 17.10 подробно
4. Опровергнутое при проверке

## 1. Статус 127 находок 17.10 на HEAD

Исправлено 24, частично 58, открыто 45.

| Серьезность | исправлено | частично | открыто |
|---|---|---|---|
| критично | 1 | 1 | 0 |
| высокая | 8 | 10 | 3 |
| средняя | 13 | 44 | 38 |
| низкая | 2 | 3 | 4 |

| № | Серьезность | Категория | Находка | Статус | Где сейчас | Комментарий проверки |
|---|---|---|---|---|---|---|
| F1 | критично | атомарность | Restore стирает таблицы, которых нет в бэкапе: акты, переводы, сообщения, сессии теряются через каскады | **исправлено** | `server/services/backupTables.ts:3-19; server/backupService.ts:238-266; server/reviewRegressions.test …` | Реестр совпадает со всеми 22 pgTable схемы, и это проверено тестом. Восстановление в одной транзакции под LOCK TABLE ... ACCESS EXCLUSIVE удаляет таблицы в обратном FK-порядке и вставляет все обратно, включая signed_acts с объектами, transfers, messages и client_partners. Перед этим validateArchive … |
| F2 | критично | безопасность | IP-лимитер верит X-Forwarded-For на открытом сокете, а лимитер по коду при переборе не срабатывает | **частично** | `server/app.ts:14; server/vite.ts:64; server/routes/auth.ts:75` | Исправлено: в логине убран fallback на сырой X-Forwarded-For, лимитер атомарен. Осталось: процесс по умолчанию слушает 0.0.0.0, а HOST не задан ни в deploy/finance-duck.service, ни в .env.example. trust proxy задан числом 1, а не адресом nginx, поэтому при прямом доступе к :5000 подделанный XFF по-п … |
| F3 | высокая | поддерживаемость | Деплой уносит рабочую копию, а не коммит: rsync ./ с локальным dist без фиксации версии | **исправлено** | `deploy/deploy.sh:7; deploy/deploy.sh:14; deploy/activate-release.sh:53` | Грязное дерево теперь останавливает деплой, код уходит через git archive HEAD в /opt/finance-duck-releases/<время>-<sha12>, рядом пишется release.json с SHA, переключение идет симлинком (activate-release.sh:55-56), прошлый релиз остается для отката. Хвосты небольшие. dist/ и dist-server/ все еще соб … |
| F4 | высокая | безопасность | Крипта кодов fail-open: нет секрета — все молча в открытом тексте, dual-lookup живет вечно | **открыто** | `server/lib/accessCode.ts:20-25; server/repositories/userRepo.ts:62; server/index.ts:8` | accessCode.ts с ece9adf не менялся (git diff пустой). Без секрета коды молча пишутся открытым текстом (userRepo.ts:187-188). Dual-lookup остался безусловным, KDF и версии ключа нет. Миграция по-прежнему запускается fire-and-forget при каждом старте веб-процесса (index.ts:8-10), хотя появился отдельн … |
| F5 | высокая | безопасность | CSRF-проверка опциональна: без заголовка она пропускается, а кука нарочно sameSite=none | **исправлено** | `server/middleware.ts:47; server/routes/auth.ts:27; server/originPolicy.ts:8-9` | Для POST/PUT/PATCH/DELETE заголовок обязателен: если его нет, он пустой или неверный, ответ 403. Кука теперь SameSite=Lax, чужой Origin и Sec-Fetch-Site=cross-site отклоняются до разбора тела. Именно этот дефект проверяет тест: server/middleware.security.test.ts:35-42 перебирает undefined, '' и 'wro … |
| F6 | высокая | атомарность | Rate limiter: read-then-write, счетчик считается в JS — параллельные попытки схлопываются | **исправлено** | `server/rateLimiter.ts:34-45` | Чтение-плюс-запись заменено одним атомарным UPSERT: инкремент идет в SQL, а попытка резервируется до проверки кода. statusForKey с DELETE внутри чтения удален, очистка вынесена в worker (worker.ts:19, pruneExpiredLoginAttempts с FOR UPDATE SKIP LOCKED). Тест server/reviewRegressions.test.ts:108-112 … |
| F7 | высокая | SOLID | dashboardRepo склеивает четыре независимых потребителя, партнерская аналитика размазана по трем репозиториям | **частично** | `server/repositories/dashboardRepo.ts:1-6; server/repositories/adminDashboardRepo.ts:5,44; server/rep …` | Файл разрезан по потребителю: admin, partnerDashboard, partnerDebt, clientBudget, clientOverview. Обе половины «Не тратить» теперь в одном financialReportsRepo (getDoNotSpendData + getPartnerSchemeDoNotSpendData). Осталось: партнерская аналитика по-прежнему размазана по partnerDashboardRepo, partner … |
| F8 | высокая | DRY | Денежная математика переписана вручную внутри отчетов с другими дефолтами, чем в движке | **частично** | `server/repositories/financialReportsRepo.ts:197-200; server/repositories/clientOverviewRepo.ts:132-1 …` | Устранено: getPartnerSchemeDoNotSpendData берет сохраненную комиссию (financialReportsRepo.ts:359 `const commission = parseNum(row.calculations.commissionAmount);`) и больше не пересчитывает clientBill*rate с дефолтом 10%. Появился реестр SCHEME_POLICIES/isAgencyScheme. Осталось: запасные формулы 0. … |
| F9 | высокая | DRY | «Дата денег» определена семью разными способами в одной подсистеме | **частично** | `server/repositories/adminDashboardRepo.ts:25,97; server/repositories/reportsRepo.ts:180,208; server/ …` | Живой 500 устранен: getInvoicesByMonth больше не ссылается на plannedPaymentDate (reportsRepo.ts:277 `COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.issueDate}::date)`). Модуля moneyDate нет, и вариантов стало больше: в новом коде добавились invoiceSummaryRep … |
| F10 | высокая | атомарность | PATCH счета стирает учтенные переносы: второй путь пересчета не применяет applyTransferOverrides | **исправлено** | `server/repositories/invoiceRepo.ts:424-430, :217` | Второго пути пересчета больше нет. updateInvoiceCalculations стал оберткой над updateInvoice, а тот всегда вызывает единственный _recalculateInvoiceExpenses: движок, затем periodic, затем transfers. Регрессионный тест server/reviewRegressions.test.ts:49-61 проверяет именно этот дефект: после перенос … |
| F11 | высокая | атомарность | generateInvoiceNumber = count(*)+1 — гонка, повторное использование номеров после удаления, падение периодики на unique | **исправлено** | `server/repositories/invoiceRepo.ts:587-595; drizzle/0002_financial_integrity.sql:43-46; server/servi …` | count(*)+1 заменен атомарным счетчиком по году. Миграция засевает счетчик из MAX существующих INV-номеров, номер выдается внутри транзакции генерации. Тест reviewRegressions.test.ts:71-76 проверяет, что номер не переиспользуется после удаления. Остаток: ручной номер в формате INV-YYYY-NNNN может сов … |
| F12 | высокая | атомарность | createDraftFromRecurring — четыре записи без транзакции, без идемпотентности и без защиты от параллельного запуска | **исправлено** | `server/services/recurringCommands.ts:14-64; drizzle/0002_financial_integrity.sql:40; server/worker.t …` | Номер, счет, расход, сдвиг nextInvoiceDate, аудит и outbox выполняются в одной транзакции с FOR UPDATE на шаблоне. Уникальный индекс uq_invoices_recurring_occurrence работает как последняя линия обороны. Планировщик вынесен в отдельный worker с арендой задания в scheduled_jobs (jobRunner.ts:22-27), … |
| F13 | высокая | SOLID | Роутер на 914 строк: HTTP, авторизация, выборка, агрегация, HTML-шаблон с CSS и резолв шрифтов в одном файле | **частично** | `server/routes/export.ts:19-29, 186-196, 258-269, 396-460, 488-499, 762-780` | Чтение данных вынесено: readClientReportInvoices (services/clientReportQuery.ts, 19 строк) и invoiceExportPages со скоупом в SQL. Остальное на месте: файл 946 строк, резолв шрифтов, HTML/CSS-шаблон, табличный движок pdfkit и агрегация живут внутри обработчиков. Ролевой фильтр по-прежнему скопирован … |
| F14 | высокая | DRY | Четыре копии классификатора схем в export.ts разошлись: гибкая 'agency' выпадает из бюджетного блока HTML/PDF/XLSX | **открыто** | `server/routes/export.ts:287-288, 294, 514-515, 553, 811-812, 834` | Дефект не изменился. Preview (213) учитывает 'agency', а HTML, PDF и XLSX нет: счет по гибкой схеме попадает в closed, и клиент не видит расходов и остатка. Ставка маржи зашита как 30/40 вместо calc.commissionRate. isAgencyScheme в export.ts не используется. Тестов на распределение схем в отчетах не … |
| F15 | высокая | атомарность | updateInvoice и пересчет кэша — два разных стейтмента вне транзакции, причем пересчет условный | **исправлено** | `server/repositories/invoiceRepo.ts:384-422` | Обновление условий и пересчет кэша теперь идут в одной транзакции под блокировкой, пересчет безусловный, clientBill берется из invoices (строка 212). Тест reviewRegressions.test.ts:45-48 проверяет создание без calculations. Остаток контракта: сервер по-прежнему принимает calculations.clientBill как … |
| F16 | высокая | тесты и DX | Авторизация 129 эндпоинтов не покрыта: единственный тест роутов мокает и storage, и middleware | **частично** | `server/accessPreservation.http.test.ts:33-60; server/reviewCompletion.test.ts:38-39; server/routes/t …` | Появились HTTP-тесты на полном createApp с настоящими сессиями и CSRF: accessPreservation (5 ролей × 6 схем на /api/invoices и дочерних ресурсах), architectureRemediation R1–R8, middleware.security.test.ts на CSRF. На фронте прибавились тесты AuthContext, financialMutations и reviewCompletion.tsx. П … |
| F17 | высокая | безопасность | Порт 5000 захардкожен на 0.0.0.0 при trust proxy — прямой доступ в обход nginx и подделка IP в журнале | **частично** | `server/vite.ts:62-64; server/app.ts:14; server/routes/auth.ts:75; .env.example:7; deploy/activate-re …` | Порт и хост теперь читаются из env, это единственное изменение. Умолчание осталось небезопасным: 0.0.0.0, а HOST нет ни в .env.example, ни в unit-файле, так что на проде процесс по-прежнему слушает все интерфейсы. trust proxy = 1 безусловный, ключ IP-лимита входа и ipAddress аудита (commandActor.ts: … |
| F18 | высокая | модель данных | Файлы актов как base64 в text-колонке: 20MB JSON-боди, список актов тянет все блобы, скачивание через JSON | **частично** | `server/services/objectStore.ts:15-57; server/repositories/actsRepo.ts:25-45, 183-187; server/routes/ …` | Исправлено: FileObjectStore с sha256-ключом вне SQL, decodeDocument с лимитом 10 MiB и проверкой base64, список актов без блобов (select(metadata)), потоковый /content с octet-stream и no-store, миграция migrateDocumentObjects. Осталось: загрузка по-прежнему идет base64 внутри JSON через 20 МБ body- … |
| F19 | высокая | DRY | Четыре независимых маппера API -> модель счета с разными именами полей | **частично** | `src/lib/invoiceView.ts:17; src/lib/invoiceDetailsView.ts:68; server/permissions.ts:50-57; src/compon …` | Исправлено: normalizeInvoiceFromApi/normalizeInvoiceListFromApi убраны, TransferFundsDialog и InvoicePage работают с типизированным InvoiceDto (Zod), угадывания `r.client_id ?? r.clientId` больше нет. Осталось: два независимых snake_case-маппера (invoiceListView и invoiceDetailsView) поверх camelCas … |
| F20 | высокая | DRY | Для живой схемы 'agency' отображаются захардкоженные 30%/70%/15% схемы agency_30 | **открыто** | `src/components/invoices/UnifiedInvoicesList.tsx:917-952; src/components/invoices/details/InvoiceCalc …` | Ветка по-прежнему выбирается через isAgency30 = isAgencyScheme(scheme), то есть и для гибкой 'agency'. Суммы в desktop-карточках считаются умножением client_bill на 0.30/0.70/0.15 при том, что в той же view-модели лежат agency_margin, partner_share_from_margin и admin_share_from_margin. Табличный ре … |
| F21 | высокая | DRY | Деньги партнера и остатки клиентов пересчитываются на фронте из списка счетов, дублируя financialEngine | **частично** | `src/components/invoices/PartnerDashboard.tsx:167-176; src/components/invoices/assistant/ClientBalanc …` | Устранено: ClientBalancesView больше не пересчитывает остатки (getRemaining теперь просто n(inv.calculations?.clientRemaining), фолбэк 'rem !== 0' удален), группы и итоги считает SQL в server/repositories/invoiceSummaryRepo.ts:22 (/api/invoices/client-balances); yearlyCommission партнера перенесен н … |
| F22 | высокая | спагетти | Три API-слоя плюс 25 сырых fetch; три вызова бьют в /api/api/... | **частично** | `src/lib/api.ts:69-76; src/components/invoices/admin/AdminCashFlowForecast.tsx:41; server/vite.ts:43; …` | Исправлено: AccountantDashboard.tsx:54 вызывает apiGet('/accountant-logs?limit=50', accountantLogsSchema) без двойного префикса, src/lib/apiHelpers.ts удален, apiGet бросает ошибку, если путь начинается с /api/. Осталось: защита стоит только в apiGet, а api/apiPost/apiPatch/apiPut/apiDelete (api.ts: … |
| F23 | высокая | тесты и DX | server/ не проверяется компилятором: 48 ошибок, в том числе обращения к несуществующим колонкам | **исправлено** | `tsconfig.server.json:12-15; package.json:22-24` | Сервер проверяется strict tsc, и это входит в check/CI. plannedPaymentDate, priorityLevel и paymentDueDate в серверном коде больше не встречаются, только в устаревших комментариях planningRepo.ts:181 и reportsRepo.ts:263. Поле overpayment объявлено в контракте getPartnerDebtDetails (partnerDebtRepo. … |
| F24 | средняя | поддерживаемость | Документация описывает несуществующую систему: README — шаблон Lovable, SECURITY.md — Supabase RLS/RPC | **частично** | `README.md:1-40 (исправлено); SECURITY.md:111-132; SECURITY_TESTING.md:20-41` | Корневой README переписан под реальную систему: Express, Postgres, migrate, check, ссылки на docs. SECURITY.md и SECURITY_TESTING.md остались прежними и по-прежнему описывают Supabase RLS, RPC и edge functions вместо httpOnly-cookie, CSRF и requireRole. Стража против слова supabase нет. Локальных ве … |
| F25 | средняя | поддерживаемость | drizzle-kit push на проде вместо версионированных миграций: тесты и прод накатывают схему разными путями | **исправлено** | `deploy/activate-release.sh:52; server/migrate.ts:9-14; package.json:20` | Прод и тесты теперь получают схему одним путем: migrate() по закоммиченным drizzle/0000–0007. Миграции идут после остановки сервиса и pg_dump, но до переключения симлинка, при ошибке срабатывает trap rollback. db:push остался только в package.json как инструмент разработки, на БД без журнала миграци … |
| F26 | средняя | поддерживаемость | vite — рантайм-зависимость прода: статический импорт в точке входа, build-инструменты в dependencies | **исправлено** | `server/vite.ts:4, server/vite.ts:54; package.json:121 (devDependencies); server/worker.ts:1-40` | Статический импорт vite заменен на type-only плюс динамический import в dev-ветке. Локальный dist-server/index.js не содержит from "vite" (grep дал 0). vite, esbuild, tsx, drizzle-kit и @types перенесены в devDependencies, на сервере стоит npm ci --omit=dev. Планировщики ушли из точки входа в отдель … |
| F27 | средняя | тесты и DX | Ноль тестов на самые разрушительные и самые клиентские операции: restore, экспорт, акты | **частично** | `server/reviewRegressions.test.ts:114-150, 215; server/backupArchive.test.ts:23-57; server/documents. …` | Restore (round-trip, откат на битом FK, неполные легаси-копии, неверный ключ и усечение), документы (хранение, миграция, авторизация) и стриминг экспорта теперь покрыты. Не покрыто то, ради чего находка писалась: распределение схем в клиентских отчетах (agency в print/pdf/xlsx) не проверено ни одним … |
| F28 | средняя | поддерживаемость | Конфиг — восемь process.env в семи файлах, валидируется только DATABASE_URL, секрет шифрования по умолчанию пустой | **частично** | `server/lib/accessCode.ts:20-21; server/lib/backupCrypto.ts:17-18; server/services/backupArchive.ts:4 …` | Исправлено: .env.example теперь описывает ACCESS_CODE_SECRET, CORS_ORIGINS и DOCUMENT_OBJECT_DIR, а бэкап в production падает без секрета. Осталось: модуля config нет, process.env читается в 13 файлах, ACCESS_CODE_SECRET теперь читается уже трижды и независимо. Шифрование кодов доступа без секрета п … |
| F29 | средняя | безопасность | CSP выключен, CSRF-токен в localStorage, в проекте уже была XSS — одна инъекция равна полному захвату учетки | **открыто** | `server/app.ts:19; src/contexts/AuthContext.tsx:60,114; src/lib/api.ts:17` | CSP по-прежнему выключен, и комментарий app.ts:16-18 все так же ссылается на инлайновые скрипты. CSRF-токен лежит в localStorage и оттуда читается на каждый запрос. GET /api/access-tokens отдает админу расшифрованные коды всех пользователей (userRepo.ts:174). Исправилась только сопутствующая деталь: … |
| F30 | средняя | поддерживаемость | Нет graceful shutdown, а стартовые правки данных запускаются fire-and-forget при каждом запуске | **частично** | `server/index.ts:8-10; server/vite.ts:64-66; server/worker.ts:33-37; deploy/activate-release.sh:52` | Исправлено: у worker есть обработчик SIGTERM/SIGINT с ожиданием активных задач и pool.end. healPeriodicUsage убран со старта. Схема применяется версионными миграциями (migrate.js в activate-release.sh, проверка журнала в migrate.ts:11) вместо drizzle-kit push. Осталось: у веб-процесса обработчиков с … |
| F31 | средняя | безопасность | Ключ бэкапов выведен из ACCESS_CODE_SECRET, без kid в конверте; без секрета дампы с кодами доступа и TG-токенами пишутся открытым текстом | **частично** | `server/services/backupArchive.ts:39-43, 103-105; server/lib/backupCrypto.ts:17-19` | Тихой записи открытого дампа в production больше нет: без секрета создание копии падает. Осталось: ключ по-прежнему выводится из ACCESS_CODE_SECRET (теперь двумя разными метками в двух модулях), kid в заголовке нет, ротация секрета делает все прошлые архивы нечитаемыми. Сервер стартует без проверки … |
| F32 | средняя | DRY | server/lib/format.ts — ручное зеркало src/lib/format.ts с ложным обоснованием: shared уже импортируется обоими бандлерами | **открыто** | `server/lib/format.ts:2-8` | Файл не изменился (git diff ece9adf..HEAD пуст по обоим файлам). shared/format.ts не появился, export.ts импортирует серверное зеркало, теста на совпадение двух копий нет. |
| F33 | средняя | поддерживаемость | Telegram-нотификации: шесть скопированных IIFE с inline-шаблонами, fetch без таймаута, без очереди и ретраев | **частично** | `server/services/outbox.ts:6-29; server/lib/telegram.ts:46-54; server/routes/messages.ts:257-288; ser …` | Создание и оплата счета и периодика теперь пишут notification_outbox в той же транзакции (invoiceCommands.ts:66, recurringCommands.ts:62). Worker доставляет с FOR UPDATE SKIP LOCKED, AbortSignal.timeout(10000) и backoff, шаблон вынесен в invoiceNotice. Осталось: уведомления о сообщениях идут fire-an … |
| F34 | средняя | атомарность | Валидатор принимает десятичную запятую, которую ни движок, ни Postgres не понимают | **исправлено** | `server/services/invoiceCommandInput.ts:17-19` | Командный слой нормализует запятую и округляет до двух знаков half-up, а дальше идет уже распарсенное значение (parseCommand возвращает result.data). Значение "450100,50" больше не доходит до numeric-колонки и parseFloat. Старый validate.ts с NUMERIC_RE `-?...[.,]\d{1,4}` при этом остался в роутах к … |
| F35 | средняя | спагетти | Четыре слоя авторизации, три одинаковых интерфейса актора и 157 сравнений роли в роутах | **открыто** | `server/middleware.ts:12-19; server/tenantAccess.ts:8; server/invoiceAccess.ts:4; server/services/com …` | Единого Principal и единой policy-функции нет. В req.user по-прежнему лежит полный AccessToken с code/codeEnc. Формы актора размножились: TenantActor, InvoiceActor, инлайновый `{ role; partnerId?; clientId? }` в invoiceRepo.ts:254, CommandActor (commandActor.ts:4) и actor в personalDataExport. В ser … |
| F36 | средняя | поддерживаемость | Нет error-middleware: падение в authMiddleware отдает HTML от Express, 127 ручных res.status(500) | **открыто** | `server/middleware.ts:40; server/app.ts:43-47; server/routes/invoices.ts:35; server/routes/backup.ts: …` | 4-аргументного error-handler по-прежнему нет: createApp заканчивается на registerRoutes, а authMiddleware остается async без try/catch, так что сбой БД отдаст text/html от finalhandler. Ручных status(500) в routes теперь 132 (было 127). Появившийся CommandError ничего не централизовал: его маппинг в … |
| F37 | средняя | SOLID | permissions.ts: пять ролей × три таблицы нетипизированных строк — опечатка прячет поле молча, новая роль требует правок в девяти местах | **частично** | `server/permissions.ts:50,88,120,252,287` | Исправлено: UserRole теперь один, выведен из USER_ROLES (shared/domainTypes.ts:1-4). Клиентские копии без accountant удалены, VALID_ROLES = USER_ROLES (acts.ts:51), дрейф partnerCommissionRate ушел. Осталось: три таблицы полей — нетипизированные строки без keyof/satisfies, опечатка по-прежнему молча … |
| F38 | средняя | безопасность | Таблица лимитера хранит введенные коды открытым текстом — рядом с «сейфом» | **открыто** | `server/rateLimiter.ts:39; server/routes/auth.ts:90,100; server/services/backupTables.ts:13` | Ключ лимитера по-прежнему сырой введенный код, а getLockedCodes (rateLimiter.ts:76-79) и unlock-user (auth.ts:40) отдают его как есть. Исправления сделали хуже. Попытка теперь резервируется до проверки, так что в таблицу открытым текстом попадает и ВЕРНЫЙ код при каждом входе: на успехе строку удаля … |
| F39 | средняя | безопасность | login_rate_limits хранит введенные коды открытым текстом без TTL; bigint-миллисекунды вместо timestamptz | **частично** | `server/rateLimiter.ts:39; shared/schema.ts:394-399; server/worker.ts:19; server/services/backupTable …` | Появилась очистка: ежечасная задача login-limit-cleanup (pruneExpiredLoginAttempts, батчами с SKIP LOCKED) и индекс по last_attempt. Суть находки при этом осталась. PK по-прежнему введенный код в верхнем регистре открытым текстом, без хеша, рядом лежит IPLOCK:<ip>. Время все еще хранится как bigint … |
| F40 | средняя | модель данных | Журнал действий мутируется при чтении и при записи, details — JSON в text | **частично** | `server/repositories/actionLogRepo.ts:23-54, 39, 43, 104, 159, 185-186; shared/schema.ts:383` | На практике перезапись аудита больше не срабатывает: update_invoice теперь пишется прямым tx.insert в InvoiceCommands (server/services/invoiceCommands.ts:62), а через logAssistantAction идут только create/update client/partner и upload/delete act. Но сам код схлопывания (select→update без транзакции … |
| F41 | средняя | DRY | «Просрочен» определен пятью способами, одно из определений опирается на несуществующее поле | **частично** | `server/repositories/alertsRepo.ts:198,203-208,254-256; server/storage.ts:155-158; server/invoiceQuer …` | Несуществующего paymentDueDate больше нет. Но замена внесла регрессию: в storage.getDashboardStats просроченным теперь считается любой не-paid счет с прошедшей датой, то есть черновики и отмененные тоже. Был всегда 0, стал завышенным. getOverdueInvoices по-прежнему тянет все sent и фильтрует в JS бе … |
| F42 | средняя | модель данных | Связь клиент-партнер хранится в двух таблицах, провенанс без FK | **открыто** | `server/repositories/clientRepo.ts:65-77, 117-119; server/routes/clients.ts:147; shared/schema.ts:143 …` | clients.partner_id по-прежнему пишется как первый элемент массива с фронта и читается в getClientWithPartner через /api/clients/:id/with-partner, хотя фронт этот путь не вызывает (обертка fetchClientWithPartner в src/lib/services/invoices.ts:159 без потребителей). В миграциях 0002–0007 нет FK для cr … |
| F43 | средняя | атомарность | Удаление партнера и клиента: без транзакции, со смесью явных delete и молчаливых каскадов | **открыто** | `server/repositories/clientRepo.ts:132-134; server/repositories/partnerRepo.ts:66-67; shared/schema.t …` | Удаление клиента и партнера идет тремя или двумя отдельными delete без транзакции и дублирует FK-каскад. partner_payments.partner_id все еще без onDelete, а deletePartner не проверяет платежи: платеж без invoiceId дает FK-ошибку и 500. Создание клиента (createClient, затем setClientPartners, затем л … |
| F44 | средняя | производительность | Полная выгрузка таблиц и агрегация в JS там, где в том же файле уже есть SQL-агрегация | **частично** | `server/repositories/reportsRepo.ts:165-174; server/repositories/planningRepo.ts:101-110,167-173; ser …` | Устранено: getAdminMonthlyData считается одним SQL с GROUP BY и фильтром по году (adminDashboardRepo.ts:24-32), а getPartnerDebtDetails агрегирует расходы через SUM FILTER только по своему партнеру (partnerDebtRepo.ts:269-274). Осталось: getClientLTV, getAdminPlanFact, getAdminForecast и storage.get … |
| F45 | средняя | поддерживаемость | Эндпоинт отдает поля, которые всегда 0, тест это закрепляет, фронт считает сам | **частично** | `server/repositories/partnerDashboardRepo.ts:45-46,57-59,62-65; server/routes/partners.ts:291; src/co …` | Чтение несуществующих колонок убрано, тест теперь проверяет ожидаемые 200/200, а не «документирует баг». Но эндпоинт /api/partner/hero-metrics по-прежнему не вызывается из src. Фронт так и считает резерв сам и по другой формуле (агентские остатки + partner-schemes против plannedExpenses−расходы парт … |
| F46 | средняя | производительность | Сводка долгов считается по всем партнерам ради одного, с мертвым циклом внутри | **открыто** | `server/repositories/partnerDebtRepo.ts:8,21-31,36,118,137-143; server/routes/partners.ts:188-190; se …` | Функция перенесена в partnerDebtRepo дословно. partnerId она не принимает, делает три полные выборки (invoices⋈calculations⋈partners, все partnerPayments, все partners), мертвый цикл на месте. Роли partner в /api/partner-debt и /api/financial-summary по-прежнему фильтруют полный результат в памяти. … |
| F47 | средняя | производительность | N+1 по платежам партнера и двойная полная выгрузка в одном запросе | **частично** | `server/repositories/partnerDebtRepo.ts:276-280; server/routes/dashboard.ts:176-179,204` | N+1 по номерам счетов платежей заменен одним leftJoin. Осталось: /api/financial-plans/history дважды грузит полную выборку getInvoicesWithCalculations и режет год в JS. Расчет так и не вынесен в planningRepo. |
| F48 | средняя | модель данных | Клиент присылает производные поля расчета, сервер им доверяет; сумма счета имеет два якоря | **частично** | `server/repositories/invoiceRepo.ts:214, :373-376, :415-417` | Устранено: executorExpensesTotal от клиента игнорируется (calculationInput пропускает только clientBill и commissionRate), clientBill пишется в invoices как единственный якорь. Осталось: ставка маржи 'agency' хранится только в кэше invoice_calculations.commission_rate, колонки invoices.agency_margin … |
| F49 | средняя | атомарность | deleteInvoice — три DELETE без транзакции, встречный счет после каскада переносов не пересчитывается | **частично** | `server/repositories/invoiceRepo.ts:574-585` | Атомарность и симметрия переносов устранены: удаление идет в одной транзакции под блокировкой и запрещено при наличии переносов или платежей, поэтому счет-контрагент не остается с поправкой на исчезнувший перенос. Осталось жесткое удаление, которое противоречит правилу «ничего не стирать»: DELETE ка … |
| F50 | средняя | SOLID | Репозитории зависят от типов фасада storage, а фасад содержит бизнес-логику | **частично** | `server/storage.ts:6, 193-207; server/repositories/partnerRepo.ts:12; server/repositories/actionLogRe …` | DTO вынесены в server/storageTypes.ts, но восемь репозиториев (partnerRepo, actionLogRepo, adminDashboardRepo, planningRepo, reportsRepo, partnerDashboardRepo, recurringRepo, alertsRepo) по-прежнему импортируют их из ../storage через ре-экспорт, так что цикл repo↔facade на уровне модулей остался. Фа … |
| F51 | средняя | DRY | Долг партнера суммируется в четырех местах, агентские коэффициенты захардкожены мимо движка | **открыто** | `server/storage.ts:203-207; server/repositories/partnerRepo.ts:96, 248, 365; server/repositories/part …` | Дашборд-репозиторий разрезали, но формулы просто переехали: долг партнера считается как минимум в шести местах, причем по-разному. getPartnerDebtSummaries суммирует отрицательные partnerTransferDue без Math.max, а details и history их отсекают, поэтому итоги расходятся. Коэффициенты 0.6/0.7 остались … |
| F52 | средняя | производительность | Агрегаты считаются в JS по полным выборкам, фильтр по году без верхней границы | **открыто** | `server/repositories/partnerRepo.ts:208, 232, 129-167; server/repositories/partnerDebtRepo.ts:21-36, …` | yearEnd по-прежнему не используется, и год обрезается в JS. getPartnerDebtSummaries (теперь в partnerDebtRepo) грузит все счета, все платежи и всех партнеров, а для партнера результат фильтруется после полной выборки. В getPartnerPayments убрали OR-ветку, но там все еще два запроса и бессмысленный M … |
| F53 | средняя | модель данных | Планы месяца: год и месяц как строки, upsert без уникального ключа | **открыто** | `shared/schema.ts:290-291,298; server/repositories/planningRepo.ts:41-55; server/routes/dashboard.ts: …` | Ничего не изменилось. year и month хранятся как numeric-строки, индекс не уникален (в миграциях 0002–0007 таблица не затронута). Upsert сделан как select-then-insert без ON CONFLICT и транзакции, getMonthlyPlan использует limit 1 без orderBy. Обнулить цель через роут по-прежнему нельзя. |
| F54 | средняя | DRY | Три независимых алгоритма прогноза по периодическим счетам | **открыто** | `server/repositories/planningRepo.ts:262-264,287-296; server/repositories/recurringRepo.ts:216,324,41 …` | Появился shared/recurringSchedule.ts с nextOccurrence/calendarDate, и шаги в recurringRepo через него унифицированы. Но сам дефект на месте: getAdminForecast (свой цикл в локальном времени с лимитом 100, без вычитания созданных счетов), getRecurringExpectedForMonth (генератор с лимитом 500 и created … |
| F55 | средняя | DRY | Расписание периодики реализовано пять раз с ошибками переполнения месяца и часового пояса | **частично** | `shared/recurringSchedule.ts:9-16; server/repositories/recurringRepo.ts:190-197, 292-299, 204-226, 30 …` | Переполнение месяца устранено: шаг по частоте сведен к nextOccurrence с якорем дня и clamp (тест reviewRegressions.test.ts:80-84), все вызовы advanceByFrequency идут через него. Дублирование осталось: набор createdKeys собирается дважды, hasOccurrenceInMonth и generateOccurrences почти побуквенно од … |
| F56 | средняя | производительность | Глобальный поиск: пять последовательных seq-scan запросов, pg_trgm без индекса и без миграции | **частично** | `server/repositories/searchRepo.ts:59-60,74,128,180,223,239; drizzle/0002–0007` | Tenant-граница теперь общая (invoiceScope через подзапрос) и покрыта HTTP-тестом для ассистента (accessPreservation.http.test.ts:119-126), так что пункт про изоляцию закрыт. Производительность и воспроизводимость окружения не тронуты: пять запросов идут последовательно, CREATE EXTENSION pg_trgm и GI … |
| F57 | средняя | производительность | Каждый аутентифицированный запрос — 3 round-trip к БД и UPDATE; сессии никогда не удаляются | **открыто** | `server/repositories/userRepo.ts:111-133; server/worker.ts:10-20` | validateSession без изменений: на каждый аутентифицированный запрос три последовательных обращения к БД и UPDATE, без JOIN и без троттлинга lastActivity. В коде нет ни одного delete(userSessions) или DELETE FROM user_sessions. В worker.ts появился JobRunner с почасовой очисткой login_rate_limits, но … |
| F58 | средняя | производительность | Три запроса к БД на каждый аутентифицированный запрос, включая UPDATE last_activity | **открыто** | `server/repositories/userRepo.ts:111-133; server/middleware.ts:40` | validateSession не изменился: SELECT сессии, затем безусловный UPDATE lastActivity, затем отдельный SELECT токена, три последовательных round-trip на каждый защищенный запрос, включая GET. Нет ни JOIN, ни троттлинга записи, ни кэша. UPDATE к тому же выполняется до проверки, активен ли токен. |
| F59 | средняя | безопасность | Коды доступа — это пароли, но хранятся обратимо и отдаются списком; маска светит 4 символа коллегам | **открыто** | `server/repositories/userRepo.ts:172-174; server/routes/me.ts:72; server/routes/acts.ts:46-47` | Коды хранятся обратимо (codeEnc), GET /api/access-tokens отдает все коды всех ролей расшифрованными. Через spread `...r.token` наружу дополнительно уходит и сам шифртекст codeEnc. Маска в /api/me/access-info по-прежнему показывает коллегам последние два реальных символа кода. Перевыпуска вместо прос … |
| F60 | средняя | поддерживаемость | Мертвые эндпоинты и no-op контракт, который фронт продолжает вызывать | **открыто** | `server/repositories/actsRepo.ts:173; server/routes/acts.ts:14-17, 29, 34-37; src/components/invoices …` | No-op контракт жив с обеих сторон, и более того, его закрепили в новых портах: storagePorts.ts:328 и routeStores.ts:103 (ActsStore). Два бонусных GET отдают один и тот же список. /api/partners/:id/payment-history и /api/my-payment-history по-прежнему без вызовов из src. К ним добавился мертвый /api/ … |
| F61 | средняя | DRY | Политика силы кода живет на фронте в двух копиях, сервер принимает любую непустую строку | **открыто** | `server/routes/acts.ts:57-59; src/components/admin/AccessCodesManager.tsx:111; src/components/invoice …` | Сервер по-прежнему принимает любой непустой код. Генератор продублирован в двух компонентах, роуты /api/access-tokens все так же лежат в acts.ts. Кроме того, нормализация регистра живет только на фронте (AccessCodesManager.tsx:145 `code.toUpperCase()`). userRepo.createAccessToken хэширует код как ес … |
| F62 | средняя | поддерживаемость | Валидация тела запроса: zod в одном роуте, ручной regex в соседнем, ничего в актах | **частично** | `server/routes/acts.ts:104, 137; server/services/paymentCommands.ts:15-20; server/routes/acts.ts:26-2 …` | Конкретные дефекты закрыты. actType проверяется по enum, fileName обязателен, размер ограничен 10 MiB в decodeDocument, а PUT платежа идет через ту же zod-схему fields, что и POST. Осталось: mimeType без whitelist, причем мертвый /download отдает data URL с сохраненным mimeType (actsRepo.ts:186). Сх … |
| F63 | средняя | производительность | N+1 по актам в сводке клиентов и по партнерам в списке клиентов | **частично** | `server/routes/documentStatus.ts:23-25; server/repositories/clientRepo.ts:94-99; server/routes/messag …` | acts-status переписан на один агрегирующий SQL с пагинацией и тестом (reviewCompletion.test.ts:115-124), тут исправлено. getClientsWithPartners все еще делает по запросу на клиента, а треды сообщений по-прежнему считают последнее сообщение двумя одинаковыми коррелированными подзапросами. Комментарий … |
| F64 | средняя | спагетти | Бизнес-логика и сырой SQL в роутах: план-факт считается в обработчике с двойной полной выборкой | **частично** | `server/routes/dashboard.ts:176-204; server/routes/messages.ts:43; server/routes/documentStatus.ts:29 …` | Исправлена только часть про me.ts: полная выборка расходов ушла в сервис personalDataExport с батчами, прямых db-вызовов в me.ts стало 7 вместо 14. Головной дефект на месте: план-факт считается в обработчике, getInvoicesWithCalculations без фильтра по году вызывается дважды через Promise.all, а разб … |
| F65 | средняя | спагетти | Перекрывающиеся эндпоинты статистики и просрочки, бизнес-логика в обработчиках роутов | **открыто** | `server/routes/dashboard.ts:12,62,93,102,166-217,246-268,270,281` | Все три эндпоинта статистики и четыре эндпоинта просрочки на месте. /api/financial-summary по-прежнему нигде не запрашивается (в src только invalidateQueries в RecalculateInvoicesButton.tsx:27), у /api/invoices/overdue тоже нет потребителя на фронте. 50 строк бизнес-логики /financial-plans/history ( … |
| F66 | средняя | DRY | Словари подписей статусов/схем размножены по серверу и фронту с расходящимися текстами | **открыто** | `server/routes/export.ts:89-90, 280, 509, 807; server/routes/myInvoices.ts:11-12; src/components/invo …` | statusMap по-прежнему объявлен 4 раза в export.ts и еще раз в myInvoices.ts. schemeMap в export.ts и myInvoices.ts расходятся по-прежнему. На фронте остались локальные SCHEME_LABELS. shared/labels.ts не появился. |
| F67 | средняя | производительность | Каждый отчет грузит ВСЕ счета всех клиентов с тремя join и фильтрует в JS; клиентский запрос = полный скан тенантов | **исправлено** | `server/repositories/exportRepo.ts:14-52; server/invoiceQuery.ts:27-36; server/services/clientReportQ …` | Все пять эндпоинтов читают через invoiceExportPages: скоуп роли (invoiceScope) и фильтры invoiceId/clientId/даты применяются в SQL, чтение идет keyset-страницами по 200. Расходы берутся пакетно через inArray, с Map вместо .find. Тест проверяет, что getInvoices не вызывается (exportsAndDocuments.http … |
| F68 | средняя | SOLID | Контроллер POST /api/invoices — 70 строк оркестрации бизнес-логики без сервисного слоя | **исправлено** | `server/services/invoiceCommands.ts:27-81; server/routes/invoices.ts:69-90` | Появился прикладной слой: создание, изменение, расходы, переносы и удаление выполняют мутацию, аудит и outbox в одной транзакции. Тест reviewRegressions.test.ts:153 проверяет откат при сбое аудита. Контроллер больше не собирает имена для журнала и не шлет Telegram. Побочный остаток, двойная граница … |
| F69 | средняя | DRY | Журнал действий: 15 копий одного объекта с ip/userAgent и 10 мертвых проверок роли после requireRole | **частично** | `server/routes/clients.ts:80-81,100-101; server/routes/partners.ts:77-78,95-96; server/routes/acts.ts …` | В invoices.ts исправлено: актор собирается один раз в commandActor.ts:4-7, аудит пишется внутри транзакции в invoiceCommands.ts:62-65. Осталось 6 копий ipAddress/userAgent (clients x2, partners x2, acts x2) и 4 мертвые проверки роли после requireRole (clients.ts:80,100; partners.ts:77,95). partners. … |
| F70 | средняя | спагетти | Четыре fire-and-forget Telegram-блока по 30-40 строк внутри контроллеров | **исправлено** | `server/services/invoiceNotice.ts:5-10; server/services/invoiceCommands.ts:66` | Fire-and-forget IIFE из контроллеров убраны. Правило «какую сумму видит клиент» живет в одном invoiceNotice, события пишутся в notification_outbox в транзакции команды, а доставка с повторами идет отдельным worker. Мелкий остаток: две копии Intl.NumberFormat (invoiceNotice.ts:7, invoiceCommands.ts:2 … |
| F71 | средняя | DRY | Блок Telegram-уведомления скопирован четыре раза внутри одного роутера | **частично** | `server/services/invoiceNotice.ts:7; server/services/invoiceCommands.ts:21; server/routes/messages.ts …` | Четыре IIFE в invoices.ts удалены: уведомления о счетах, оплатах, списаниях и переносах пишутся в notification_outbox в той же транзакции, рассылает их worker. Осталось: два независимых Intl.NumberFormat (invoiceNotice.ts:7, invoiceCommands.ts:21), хотя formatMoney уже есть в lib/format.ts. HTML-тел … |
| F72 | средняя | атомарность | Создание счета, пересчет, журнал и уведомление — четыре несвязанных записи без транзакции | **исправлено** | `server/services/invoiceCommands.ts:29-69; server/routes/invoices.ts:80,109,250` | Создание, изменение (с пересчетом проекции в invoiceRepo.updateInvoice в той же tx), перенос, расходы и периоды идут через InvoiceCommands.run: блокировка, авторизация, мутация, аудит, outbox и квитанция идемпотентности лежат в одной транзакции. Роуты вызывают только invoiceCommands.*. Это проверяют … |
| F73 | средняя | производительность | routes/me.ts обходит фасад и читает таблицы расходов и сообщений целиком ради одного клиента | **частично** | `server/routes/me.ts:27,61,180; server/services/personalDataExport.ts:23-27` | Исправлено: экспорт данных вынесен в services/personalDataExport.ts. Он делает JOIN invoices + invoiceScope(actor) + keyset-пагинацию по PAGE_SIZE и больше не читает чужие расходы и сообщения целиком. Осталось: me.ts по-прежнему получает db и ходит в таблицы напрямую в обход фасада (строки 61, 63, 8 … |
| F74 | средняя | спагетти | Политика hide_from_assistant размазана по пяти местам, в сообщениях — сырой SQL из роута | **частично** | `server/invoiceQuery.ts:27-36; server/routes/messages.ts:38, 173; server/repositories/actsRepo.ts:61; …` | Появился единый invoiceScope(actor), его используют новые assistant.ts и documentStatus.ts. Но старые предикаты остались: два raw COALESCE в messages.ts, or(isNull…) в actsRepo и invoiceRepo, а для периодики объявлены две одинаковые константы visibility (recurringRepo.ts:28 и recurringCommands.ts:11 … |
| F75 | средняя | DRY | «Остаток клиента» вычисляется в пяти местах по четырем разным формулам | **частично** | `server/storage.ts:166-170; server/routes/export.ts:223, 298, 556, 654, 838; server/repositories/clie …` | Пересчет остатка в myInvoices.ts заменен чтением calc.clientRemaining (строки 106, 117), а порядок слоев engine, periodic, transfers теперь зашит в одном месте. Осталось: storage.ts:170 для дашборда заново считает остаток агентских счетов без переносов и периодики. export.ts держит пять fallback-фор … |
| F76 | средняя | спагетти | Блок аудита скопирован 15 раз с избыточной проверкой роли | **частично** | `server/routes/partners.ts:77-78, 95-96; server/routes/clients.ts:80-81, 100-101; server/routes/acts. …` | Девять копий из invoices.ts ушли в InvoiceCommands (единый insert, invoiceCommands.ts:62). В области осталось шесть ручных копий с одинаковым ip/userAgent, тавтологическая проверка роли после requireRole в четырех местах и два разных контракта «лог упал» в одном файле: в upload лог обернут в try/cat … |
| F77 | средняя | безопасность | Денежные операции и удаления не попадают в журнал действий | **частично** | `server/services/paymentCommands.ts:46-50; server/routes/partners.ts:105-115; server/routes/clients.t …` | Создание, исправление и отмена партнерских платежей теперь аудируются в той же транзакции со снимками before/after, хотя и под типом 'other'. Без следа в журнале остались удаление партнера и клиента, пересборка связей клиент-партнер, выплата бонуса, выпуск и отзыв кодов доступа, удаление сообщений. … |
| F78 | средняя | безопасность | Mass assignment в периодических счетах: req.body целиком уходит в UPDATE | **исправлено** | `server/lib/recurringInput.ts:11-19; server/routes/recurring.ts:21-25, 70-75` | Create и PATCH шаблона проходят строгий zod-whitelist (.strict(), .partial() для PATCH, на zod 3.25.76 дефолты при partial не подставляются, это проверено), hideFromAssistant ограничен через constrainInvoiceWrite. id, createdBy и createdAt через тело больше не перезаписать. Отсутствие аудита и коман … |
| F79 | средняя | SOLID | IStorage не является контрактом: 78 методов в интерфейсе, 106 в классе, роуты зависят от конкретного объекта | **частично** | `server/storagePorts.ts:400-408; server/routeStores.ts:1-141; server/routes.ts:38-57; server/storage. …` | DIP исправлен: роутеры создаются фабриками, storage внедряется из registerRoutes, каждый роутер получает узкий Pick (routeStores.ts), тесты собирают createApp с локальной БД. ISP по сути нет: DatabaseStorage остается одним классом на все домены и реализует пересечение всех семи интерфейсов. Pick'и б … |
| F80 | средняя | спагетти | 150 строк бизнес-логики в «тонком» фасаде, тест-страж обходится конструкцией await query | **открыто** | `server/storage.ts:97-113; server/storageFacade.test.ts:22` | getDashboardStats с сырым select/leftJoin, циклом по счетам и ветвлением по схемам (scheme === 'agency_30' \|\| ...) так и живет в фасаде. Страж стал еще слепее: фасад теперь обращается к БД через this.database, а регулярка ищет только 'await db'/'await tx'. Любой сырой запрос в storage.ts проходит те … |
| F81 | средняя | модель данных | Эндпоинт working-capital отдает заглушку и принимает PATCH, ничего не сохраняя | **открыто** | `server/storage.ts:414-433; server/routes/dashboard.ts:120-134` | Обе заглушки и оба роута GET/PATCH /api/admin/working-capital на месте. Их даже протащили в новый слой портов: storagePorts.ts:250-251 и routeStores.ts:53,56. Таблицы нет, PATCH отвечает 200, ничего не сохраняя. |
| F82 | средняя | безопасность | Авторизация: шесть почти одинаковых предикатов, ручные 403 в роутах и три копии интерфейса актора | **открыто** | `server/tenantAccess.ts:8, 79-103; server/invoiceAccess.ts:4; server/services/invoiceCommands.ts:17; …` | tenantAccess.ts в диапазоне ece9adf..HEAD не менялся: пары предикатов по-прежнему отличаются одной строкой, ручной 403 стоит перед canReadPartnerClients, а загрузка linkedPartnerIds повторена в пяти роутах. Типов актора стало больше: TenantActor, InvoiceActor, AuthenticatedRequest.user и CommandActo … |
| F83 | средняя | SOLID | Точка входа vite.ts: dev-сервер Vite, статика, два планировщика и listen в одном файле, Vite попадает в прод-бандл | **исправлено** | `server/vite.ts:4,54; server/worker.ts:8-31; server/services/jobRunner.ts:22-26; package.json devDepe …` | Vite импортируется динамически только в dev, сам vite, esbuild и drizzle-kit перенесены в devDependencies, прод ставит npm ci --omit=dev. Оба планировщика ушли из веб-процесса в отдельный worker (finance-duck-worker.service), состояние «последний запуск» хранится в таблице scheduled_jobs с арендой п … |
| F84 | средняя | поддерживаемость | Планировщики в точке входа: setInterval без локов и защиты от двойного запуска, «3:00» без таймзоны, состояние в памяти | **исправлено** | `server/worker.ts:8-37; server/services/jobRunner.ts:18-58; shared/schema.ts:134` | Планировщики вынесены в отдельный worker (systemd finance-duck-worker). Состояние хранится в таблице scheduled_jobs с арендой и токеном владельца, время задано явно в UTC. Есть обработка SIGTERM с ожиданием активных задач. Двойной черновик периодики исключен уникальным индексом uq_invoices_recurring … |
| F85 | средняя | производительность | Деньги в double без точки округления: каждое поле кэша округляется Postgres независимо | **исправлено** | `shared/financialEngine.ts:59-96; shared/money.ts:9-16` | Движок считает на Decimal, каждая учетная сумма округляется half-up до копеек одной функцией moneyDecimal. Вторая доля 50/50 берется как остаток, admin = margin − partner, а сервер сохраняет строки без двоичного round-trip. Тест reviewRegressions.test.ts:210-214 проверяет сохранение суммы при полови … |
| F86 | средняя | модель данных | Ноль CHECK-ограничений: отрицательные суммы и periods_used > total_periods допустимы, код лечит мусор при каждом чтении | **частично** | `drizzle/0000–0007 (0 CHECK); shared/schema.ts (0 check()); server/routes/dashboard.ts:224; server/re …` | Одну дыру закрыли на уровне приложения: recurring POST/PATCH теперь проходят через zod recurringInput (recurring.ts:21, :70) вместо спреда req.body. В БД по-прежнему ни одного CHECK: grep -ci check по 0002–0007 и check() в schema.ts дают 0. Знак сумм и periods_used <= total_periods ничем не ограниче … |
| F87 | средняя | модель данных | Нет UNIQUE на 1:1-кэше invoice_calculations и на (year, month): upsert через select-then-insert | **частично** | `shared/schema.ts:173 (исправлено); shared/schema.ts:298; server/repositories/planningRepo.ts:42-53; …` | На invoice_calculations.invoice_id стоит UNIQUE (миграция 0002:41), запись calculations идет в транзакции через updateInvoice. Это главная угроза удвоения сумм, и она закрыта. Остальное не тронуто: monthly_financial_plans(year, month) держится на обычном индексе с select-then-insert вне транзакции, … |
| F88 | средняя | SOLID | ProtectedRoute знает только «вошел/не вошел»; роль проверяется страницами ad hoc или не проверяется | **открыто** | `src/components/auth/ProtectedRoute.tsx:11; src/App.tsx:47-51; src/pages/AssistantLogsPage.tsx` | Guard по-прежнему без ролей, все 12 маршрутов в App.tsx:62-157 обернуты одинаково. RoleBasedHome все так же перечисляет все пять ролей, и ветка <Index /> недостижима, хотя Index лениво импортируется (App.tsx:15). Страницы проверяют роль сами: AccessCodesPage.tsx:33, AccountingPage.tsx:53, StatsPage. … |
| F89 | средняя | DRY | Шесть пресетов периода и их сохранение в localStorage реализованы трижды | **открыто** | `src/components/invoices/ClientDashboard.tsx:90; src/components/invoices/assistant/ClientBalancesView …` | Три реализации шести пресетов остались на месте, общего src/lib/datePresets.ts нет (ls src/lib), parseDateFromStorage по-прежнему скопирована в ClientDashboard.tsx:54 и ExportFiltersDialog.tsx:44, ключи localStorage прежние. |
| F90 | средняя | поддерживаемость | Пять ручных fetch с CSRF из двух разных источников в обход src/lib/api.ts и существующего useDownloadReport | **открыто** | `src/components/invoices/ClientDashboard.tsx:158-163, 188-193, 230-235; src/components/invoices/admin …` | Все пять ручных fetch на месте; изменились только catch-блоки (any -> unknown). AccountantDashboard по-прежнему берет CSRF из useAuth() под заголовком 'x-csrf-token' и при этом обходит apiRequest с Idempotency-Key; правила eslint против fetch в компонентах нет. |
| F91 | средняя | SOLID | InvoiceDetailsDialog: 37 useState, 15 обработчиков, 12 ответственностей в одном компоненте | **частично** | `src/hooks/useInvoiceCommands.ts:15-38; src/components/invoices/details/*.tsx` | Файл диалога сократили с 1889 до 293 строк, логику разнесли по 5 хукам и 7 секциям. Но useInvoiceCommands склеивает все обратно в один объект (около 40 useState: StatusCommands 6, MetadataCommands 12, FinancialTerms 7, ExpenseActions 6, PeriodCommands 6, Commands 3), и каждая секция получает срез эт … |
| F92 | средняя | DRY | Расчет резерва (planned_expenses минус расходы партнера) продублирован трижды внутри одного компонента и повторяет серверную формулу | **открыто** | `src/hooks/useInvoiceStatusCommands.ts:39-46; src/components/invoices/details/InvoiceCalculationsSect …` | Формулу просто переместили: сумма «расходы партнера» считается в трех местах, остаток резерва в двух, причем в двух разных файлах (хук статуса и секция расчетов). Общего хелпера splitExpenses нет, сервер эти агрегаты не отдает. |
| F93 | средняя | поддерживаемость | Ручной fetch в useState вместо React Query: 15 refetch после каждой мутации и рассинхрон со списком | **исправлено** | `src/hooks/useInvoiceData.ts:8-18; src/hooks/useInvoice.ts:11-24; src/hooks/useInvoiceCommands.ts:19` | useState<invoice> и ручной fetchInvoiceDetails убраны. Диалог и InvoicePage читают один кэш через useInvoiceData, а все мутации диалога, включая статус, даты, сумму и процент, инвалидируют '/api/invoices' и дашборды через общий предикат. Исходный дефект (две копии кэша, статус не обновлял список) бо … |
| F94 | средняя | поддерживаемость | Знание о зависимых дашбордах рассыпано по мутациям: 7 разных наборов ключей инвалидации в одном файле | **частично** | `src/lib/financialQueries.ts:11-23; src/pages/InvoicePage.tsx:61-62; src/components/invoices/SignedAc …` | Хуки диалога, список, Add/EditExpense, TransferFunds и архив используют одну функцию invalidateFinancialQueries, так что семь разных наборов внутри диалога исчезли. Осталось: InvoicePage меняет статус и инвалидирует только '/api/invoices', поэтому дашборды остаются устаревшими. SignedActsSection дер … |
| F95 | средняя | SOLID | Две параллельные системы прав: getVisibleFields и россыпь userRole/canEdit в разметке | **частично** | `src/hooks/useInvoiceCommands.ts:31; src/components/invoices/details/InvoiceCalculationsSection.tsx:6 …` | Исправлено: локальные типы ролей заменены на UserRole из shared/schema (UnifiedInvoicesList.tsx:42, InvoiceCard.tsx:1, invoicePermissions.ts:3), а WaterfallChartProps.scheme стал InvoiceScheme. Осталось главное, две параллельные системы прав: permissions из getVisibleFields живут рядом с прямыми use … |
| F96 | средняя | тесты и DX | Нет ни одного теста на компоненты подсистемы при 17 data-testid в одном диалоге | **частично** | `src/components/invoices/reviewCompletion.test.tsx:65-77; src/hooks/financialMutations.test.tsx:18-58` | Появились компонентные тесты на react-test-renderer: рендер InvoicePage для 5 ролей и проверка инвалидации после команд хука. InvoiceDetailsDialog, UnifiedInvoicesList, CreateInvoiceDialog и Add/EditExpense по-прежнему ничем не монтируются, а data-testid диалога не используются. Тест хука берет фикс … |
| F97 | средняя | спагетти | Два разных редактора одного и того же процента партнера в одном диалоге, второй — через document.getElementById | **открыто** | `src/components/invoices/details/InvoiceCalculationsSection.tsx:242-268; src/components/invoices/deta …` | Оба редактора просто перенесли в разные файлы секций: контролируемый со step 0.01 и неконтролируемый со step 0.1, который читает DOM через getElementById и держит собственную проверку 0..100. Для админа на commission_based оба по-прежнему рендерятся одновременно и вызывают один handleUpdateCommissio … |
| F98 | средняя | DRY | Словарь подписей схем скопирован 4 раза, три копии не знают живую схему 'agency' | **открыто** | `src/components/invoices/PartnerDashboard.tsx:34-42; src/components/invoices/admin/ExpectedCommission …` | Все пять локальных словарей живы и ни один не знает 'agency'; живая гибкая схема по-прежнему показывается сырой строкой 'agency'. Полный getSchemeLabel из src/lib/invoiceCalculations.ts:119 используют только UnifiedInvoicesList, InvoiceCard, InvoiceCalculator, details/* и PartnerTerms. |
| F99 | средняя | модель данных | Один ключ ['/api/invoices'] делит кэш между четырьмя разными формами данных | **исправлено** | `src/components/invoices/PartnerDashboard.tsx:162; src/components/invoices/assistant/ClientBalancesVi …` | Исходный дефект устранен: точный ключ ['/api/invoices'] больше не используется как queryKey ни одним useQuery (18 вхождений остались только в invalidateQueries), у каждой формы данных свой подключ; двойной /api/api у бухгалтера убран и проверен тестом src/components/invoices/reviewCompletion.test.ts … |
| F100 | средняя | модель данных | Контракты серверных агрегатов набраны вручную в каждом компоненте, расхождения латаются через any | **частично** | `src/components/invoices/PartnerDashboard.tsx:82, 98; src/components/invoices/admin/DoNotSpendDashboa …` | Устранено: '(debtDetails?.summary as any)?.overpayment' заменено типизированным полем (PartnerDashboard.tsx:69, 188); для счетов, балансов, partner-summary, assistant-summary и accountant-logs появились zod-схемы в shared/invoiceContract.ts и shared/assistantContract.ts. Осталось: все дашбордные энд … |
| F101 | средняя | производительность | Акты гоняются base64-строкой в JSON через FileReader с клиентским лимитом 10 МБ | **частично** | `src/components/invoices/SignedActsSection.tsx:71-86, 161; server/app.ts:33` | Скачивание исправлено: GET /api/acts/:id/content отдает поток, а клиент собирает blob через createObjectURL (SignedActsSection.tsx:185-187). Файлы лежат в FileObjectStore, списки актов без base64. Загрузка осталась прежней: файл до 10 МБ превращается в data-URL и уходит в JSON-теле, ради этого серве … |
| F102 | средняя | спагетти | Дублирующееся состояние открытия диалога: URL ?open=, selectedInvoiceId, detailsOpen и setTimeout-защита от двойного клика | **открыто** | `src/components/invoices/UnifiedInvoicesList.tsx:75-77, 140-145, 148-205, 207-224` | Без изменений по существу: открытый счет по-прежнему хранится в searchParams.open, selectedInvoiceId и detailsOpen. Синхронизацию URL в обе стороны делают useEffect и handleCloseDetails, prevParamsRef управляет фильтрами, таймер-заглушка на 500 мс на месте. InvoiceDetailsDialog так и рендерится в тр … |
| F103 | средняя | поддерживаемость | 1824 строки мертвых дашборд-компонентов и неиспользуемые хуки/переменные во всех пяти ролевых экранах | **частично** | `src/components/invoices/admin/AdminStats.tsx:1 (и еще 10 файлов admin/); src/components/invoices/Adm …` | Удален только src/hooks/useInvoicesQuery.ts (и apiHelpers.ts). 11 неимпортируемых файлов admin/ (AdminCashFlowForecast, AdminHeroMetrics, AdminStats, CurrentMonthPlanFact, CurrentPeriodMetrics, FinancialPlanningChart, KeyMetricsCards, PlanHistoryComparison, ProfitTrendChart, WorkingCapitalManager, Y … |
| F104 | средняя | DRY | Три виджета «сводка по партнеру/клиенту → раскрытие → счета» написаны вручную, в DoNotSpendDashboard рендер строки повторен 4 раза | **открыто** | `src/components/invoices/admin/DoNotSpendDashboard.tsx:139, 151; src/components/invoices/admin/Expect …` | Три виджета не тронуты по структуре (DoNotSpendDashboard 701 строка, четыре копии верстки строки сводки на месте), изменились только ключи кэша. Похожий шаблон консолидирован лишь для актов и закрывающих документов в новом admin/DocumentStatusDashboard.tsx, но к трем названным дашбордам это не приме … |
| F105 | средняя | SOLID | Ветвления по роли размазаны внутри общих виджетов с разными дефолтами | **открыто** | `src/components/invoices/admin/DoNotSpendDashboard.tsx:185, 258, 695-696; src/components/invoices/adm …` | Ветвления по роли внутри общих виджетов на месте (isAdmin: 14 в ClientBalancesView, 8 в ManageClientsDialog, 10 в ManagePartnersDialog), src/lib/permissions.ts для дашбордов нет (invoicePermissions.ts касается только полей карточки счета). Новый DocumentStatusDashboard добавил третий вариант дефолта … |
| F106 | средняя | DRY | AddExpenseDialog и EditExpenseDialog — один диалог, скопированный дважды, с третьей копией списка инвалидаций в родителе | **частично** | `src/components/invoices/assistant/AddExpenseDialog.tsx:23-220; src/components/invoices/assistant/Edi …` | Тройной блок из 5 invalidateQueries заменили общей функцией. Сами диалоги остались двумя копиями одной формы, и EditExpenseDialog по-прежнему без checkLimit и isValidUuid. Добавилась двойная инвалидация: диалог инвалидирует сам, а затем родитель через onSuccess={fetchInvoiceDetails} делает это еще р … |
| F107 | средняя | DRY | ManageClientsDialog и ManagePartnersDialog — почти копии с ручным state-фетчем мимо TanStack Query | **открыто** | `src/components/invoices/assistant/ManageClientsDialog.tsx:126-151; src/components/invoices/assistant …` | Оба диалога по-прежнему грузят данные через useState+useEffect мимо TanStack Query, без useQuery/useMutation/invalidateQueries; общий EntityManagerDialog не выделен. Изменения ограничились useCallback вокруг fetchData и снятием 'as any'. |
| F108 | средняя | DRY | Три несовместимые реализации «просроченных платежей», две из них мертвые | **открыто** | `src/components/invoices/shared/OverduePaymentsAlert.tsx:8, 31-35; src/components/invoices/ClientDash …` | Все три реализации живы без изменений: shared-версия смонтирована только с role="client" и никогда не делает запрос, wouter остался в package.json:90, admin-версия импортирована в StatsPage и не рендерится, кнопка 'Напомнить' по-прежнему лишь показывает toast. |
| F109 | средняя | DRY | UserRole объявлен 8 раз, половина без accountant — отсюда три ошибки tsc | **частично** | `shared/domainTypes.ts:4; src/components/invoices/SignedActsSection.tsx:32` | Локальных объявлений type UserRole в src нет: все пять мест без accountant (SignedActsSection, UnifiedInvoicesList, ManageAccessCodesDialog, invoiceCalculations, useInvoicesQuery) импортируют общий тип или удалены. Strict typecheck проходит. Остаток косметический: пять реэкспортов-прослоек (AuthCont … |
| F110 | средняя | производительность | Зоопарк поллинга: до 8 независимых таймеров на один экран и двойной рефетч dashboard-stats | **открыто** | `src/hooks/useAdminDashboardRefresh.ts:5, 39-44; src/components/invoices/AdminDashboard.tsx:25; src/l …` | 10 литералов refetchInterval: 120000 на месте (PartnerDashboard x5, DoNotSpend x2, ExpectedCommission, ExpectedAdminProfit, PartnerDebtDashboard), useVisibilityAwareInterval и ручные visibilitychange (PartnerDebtDashboard, KeyMetricsCards, AssistantBonusCard и др.) тоже. Строковый список префиксов з … |
| F111 | средняя | поддерживаемость | useCookieSession дублирует серверную политику сессии таймером на клиенте и шлет refresh на каждое движение мыши | **открыто** | `src/hooks/useCookieSession.ts:6,69-75; src/contexts/AuthContext.tsx:155; server/repositories/userRep …` | Ничего не изменилось. Клиент держит свой 30-минутный таймер и сам решает, что сессия истекла. На mousedown/keydown/scroll/touchstart с паузой 1 с уходит POST /api/auth/refresh. Серверный expiresAt (auth.ts:151) игнорируется, про 12-часовой потолок клиент не знает. Константа 30 минут повторяется в че … |
| F112 | средняя | поддерживаемость | GET /api/invoices типизирован тремя несовместимыми способами, shared DTO нет | **частично** | `shared/invoiceContract.ts:6-39; server/reviewCompletion.test.ts:50; src/hooks/usePagedInvoices.ts:10 …` | Исправлено главное: в shared появился zod-DTO для GET /api/invoices, сервер в HTTP-тестах проверяется по нему, useInvoicesQuery удален, ClientBalancesView и диалоги используют InvoiceDto. Осталось: серверные роуты в compile-time не типизированы этим DTO (server не импортирует invoiceContract вне тес … |
| F113 | средняя | поддерживаемость | Ключи react-query — ad hoc строки, 133 ручных invalidateQueries, три конкурирующих «инвалидатора» | **частично** | `src/lib/financialQueries.ts:4-23; src/hooks/useDashboardStats.ts:46,55; src/components/invoices/admi …` | Появились financialKeys (5 ключей, 11 использований) и общий invalidateFinancialQueries по предикату (22 вызова). Но настоящей фабрики ключей нет: в 22 файлах остались 86 ручных invalidateQueries. Три конвенции не убраны, а закреплены списком legacyKeys. Один и тот же /dashboard/stats по-прежнему ке … |
| F114 | средняя | производительность | Поллинг реализован 12 раз; useRealtimeSubscription — Supabase-реликт, тройно дергающий один refetch | **открыто** | `src/hooks/useRealtimeSubscription.ts:3-46; src/components/invoices/assistant/AssistantYearlyOverview …` | Хук с сигнатурой Supabase Realtime на месте, filter/event/schema по-прежнему игнорируются. AssistantYearlyOverview все так же ставит три таймера и три visibility-слушателя на один refetch, AssistantMonthlyChart и AssistantInsights ставят по два. Файлов с visibilitychange стало 9 вместо 12, но опрос … |
| F115 | средняя | безопасность | CSRF-токен в localStorage и два источника правды о нем | **частично** | `src/lib/api.ts:17; src/contexts/AuthContext.tsx:60,114,139,153; src/components/invoices/ClientDashbo …` | Сервер исправлен: пустой или отсутствующий заголовок дает 403, /api/auth/validate возвращает csrfToken. Без токена клиент теперь не считается вошедшим (AuthContext.tsx:54 `if (!data?.valid \|\| !data.csrfToken)`), так что состояния «залогинен, но без токена» больше нет. Осталась сама суть находки. Ток … |
| F116 | средняя | DRY | Мертвый дубль формул движка во фронте: calculatePartnerDebt без единого вызова | **открыто** | `src/lib/invoiceCalculations.ts:63-111` | Мертвая функция на месте: grep calculatePartnerDebt по src, server и shared дает только объявление. Внутри по-прежнему копия коэффициентов 0.15/0.70 и 0.24/0.60 и формула долга без plannedExpenses, а шапка файла (строка 5) все так же утверждает, что все формулы живут в shared/financialEngine.ts. Изм … |
| F117 | средняя | поддерживаемость | InvoicePage читает поля, которых нет в ответе API: вознаграждение партнера всегда 0, расходы всегда «Админ» | **частично** | `src/pages/InvoicePage.tsx:100-103, 237, 57-67` | Исходный дефект исправлен и покрыт тестом reviewCompletion.test.tsx:65-77: ручные интерфейсы удалены, данные идут через useInvoiceData и DTO, partnerReward и паттерн paidByAdmin соответствуют контракту. Осталась третья реализация смены статуса (InvoicePage.tsx:57-67). Она переводит счет в paid или c … |
| F118 | средняя | тесты и DX | Барьер деплоя 153 секунды: новый PGlite с полной миграцией на каждый тест | **открыто** | `vitest.config.ts:29; server/test/testDb.ts:17-19; server/repositories/invoiceRepo.integration.test.t …` | Механика барьера не изменилась. Файлы идут строго последовательно, hookTimeout 60 с, createTestDb каждый раз поднимает новую PGlite и накатывает уже 8 миграций вместо 2. Новые файлы (review*, accessPreservation, documents) используют beforeAll, но 10 старых файлов в server/repositories все так же по … |
| F119 | низкая | производительность | Бэкап целиком в памяти в трех копиях; список бэкапов читает все 30 дампов с диска при каждом GET | **исправлено** | `server/services/backupArchive.ts:46-89; server/backupService.ts:110-140` | Дамп пишется потоком через курсор, gzip и потоковый AES-GCM, без копий всего дампа в heap. listBackups строит список только по stat, тела файлов не читает. Мелочь: createdAt берется из mtime, хотя timestamp есть в имени файла. |
| F120 | низкая | атомарность | Запись бэкапа не атомарна, нет graceful shutdown: при рестарте systemd остается обрезанный файл, который выглядит валидным | **исправлено** | `server/services/backupArchive.ts:51-88; server/worker.ts:33-37` | Запись идет во временный файл с fsync и атомарным rename. Файлы .fdb.tmp не попадают в список (regex (\.json\|\.fdb)$). Worker обрабатывает SIGTERM и ждет текущую задачу. Битый архив отсекается validateArchive до каких-либо изменений. |
| F121 | низкая | SOLID | Правила видимости по ролям зашиты внутрь репозиториев параллельно слою permissions | **открыто** | `server/repositories/financialReportsRepo.ts:390,404,416; server/repositories/alertsRepo.ts:154; serv …` | Вместо role: string теперь передается типизированный InvoiceActor, но маскирование комиссии по-прежнему зашито в репозиторий трижды. getAlertCounts выбирает, что считать, по роли, storage.getDashboardStats ветвится по ролям (219-236) и сверху еще прогоняется через projectStatsForRole. Проекций proje … |
| F122 | низкая | поддерживаемость | Корректность маршрутов зависит от порядка app.use в routes.ts: статический путь /api/invoices/overdue живет в чужом роутере | **открыто** | `server/routes/dashboard.ts:62; server/routes/invoices.ts:55; server/routes.ts:47-48` | Все роутеры по-прежнему монтируются в корень без префиксов. /api/invoices/overdue живет в dashboardRouter и работает только потому, что тот зарегистрирован строкой раньше invoicesRouter с параметрическим GET /api/invoices/:id. POST /api/invoices/transfer (invoices.ts:245) все так же объявлен после / … |
| F123 | низкая | SOLID | routes/acts.ts смешивает акты, бонусы ассистента, токены доступа и статистику | **открыто** | `server/routes/acts.ts:14-37, 46-78, 80-83; server/routes/assistant.ts:12, 32` | routes/acts.ts по-прежнему держит бонусы, коды доступа, статистику ассистента и акты. Файл превратили в фабрику createActsRouter, но ресурсы не разнесли. Статистика ассистента так и разрезана: /api/assistant/stats живет в acts.ts, а invoice-summary и invoice-groups в assistant.ts. |
| F124 | низкая | спагетти | Два роутера в бандле: wouter Link вне wouter Router делает полную перезагрузку | **открыто** | `src/components/invoices/shared/OverduePaymentsAlert.tsx:8,79; package.json:90` | Без изменений. Компонент по-прежнему рендерится в ClientDashboard.tsx:24, ссылка внутри BrowserRouter не работает, wouter остается в зависимостях, eslint-запрета нет. |
| F125 | низкая | поддерживаемость | Мертвые реликты Supabase/Replit в слое авторизации: sessionStorage-сессия, apiHelpers, клиентский rate limiter | **частично** | `src/hooks/useUserRole.ts:30-47; src/contexts/AuthContext.tsx:144-146; src/hooks/useRateLimit.ts:11; …` | Удален только src/lib/apiHelpers.ts со вторым кешем сессии. Shim useUserRole с мертвыми getSession/accessCode/accessTokenId остался, и его импортируют 9 файлов. Удаление трех несуществующих ключей в logout осталось. Клиентский лимитер (rateLimiter.ts, 177 строк) с ключом по Date.now() по-прежнему по … |
| F126 | низкая | поддерживаемость | Фронтовый auth-клиент: статус теряется, 401 ловится по подстроке, четыре сырых fetch и ключи-призраки от прошлых схем | **частично** | `src/lib/api.ts:51-53; src/contexts/AuthContext.tsx:46,85,139,144-146; src/components/invoices/Unifie …` | Исправлено: в apiRequest появился единый перехват 401 через событие auth-expired, на которое подписан AuthContext. Осталось: ошибка по-прежнему голый Error без status. UnifiedInvoicesList.tsx:120 и ErrorBoundary.tsx:44 распознают протухшую сессию по подстрокам. В AuthContext 4 сырых fetch, ключи-при … |
| F127 | низкая | SOLID | Защита ролевых экранов — набор инлайн-проверок, /client-balances вообще без гарда | **частично** | `src/components/auth/ProtectedRoute.tsx:5-7; src/App.tsx:135-138; src/pages/InvoicesDashboard.tsx:17- …` | Последствие из находки устранено косвенно: ClientBalancesView теперь читает /api/invoices/client-balances с requireRole, партнер и клиент получают 403 (проверено в server/reviewCompletion.test.ts) и видят ошибку, а не свои счета под видом бюджетов клиентов. Сам дефект UI-слоя остался: ProtectedRoute … |

## 2. Новые находки на HEAD (N1–N87)

Подтверждено верификатором 87: высокая 7, средняя 43, низкая 37. Опровергнута 1.

| № | Серьезность | Категория | Файл:строка | Находка |
|---|---|---|---|---|
| N1 | высокая | тесты и DX | `deploy/activate-release.sh:70` | Проверка активации релиза неверна: пропускает старое состояние и откатывает код после миграций из-за бизнес-ошибки одного шаблона |
| N2 | высокая | модель данных | `server/repositories/invoiceRepo.ts:213` | Регрессия: у 'agency' без ставки партнера вся маржа уходит партнеру, админу 0 |
| N3 | высокая | модель данных | `server/services/backupArchive.ts:13` | Собственный формат архива привязан к текущей схеме: каждая миграция требует ручной legacy-прокладки, иначе restore откажет |
| N4 | высокая | модель данных | `server/services/recurringCommands.ts:42` | Периодика выпускает счета по живой схеме 'agency' с маржой 0 |
| N5 | высокая | безопасность | `server/storage.ts:106` | /api/dashboard/stats и /api/financial-summary агрегируют счета вне invoiceScope: fail-open для assistant/accountant и для сессий без tenant-id |
| N6 | высокая | безопасность | `server/vite.ts:64` | Сервер слушает 0.0.0.0 при trust proxy 1: в обход nginx X-Forwarded-For подделывает IP для лимитера входа |
| N7 | высокая | производительность | `src/hooks/useInvoice.ts:19` | Бесконечный цикл рендеров и сброс всех полей ввода карточки счета: useEffect([invoice]) на немемоизированной view-модели |
| N8 | средняя | поддерживаемость | `deploy/activate-release.sh:48` | Каждый выпуск копит полный pg_dump, архив объектов и релиз с node_modules без учета места |
| N9 | средняя | поддерживаемость | `deploy/install.sh:50` | Восстановление с нуля по install.sh и deploy/README несовместимо с новой релизной моделью |
| N10 | средняя | безопасность | `index.html:21` | Кабинет под ФЗ-152 грузит Google Fonts и разрешает индексацию |
| N11 | средняя | избыточность | `server/backupService.ts:38` | Зоопарк форматов бэкапа: 6 поддерживаемых версий за сутки, формат 2.0 не существовал ни в одном коммите, но поддерживается и тестируется |
| N12 | средняя | тесты и DX | `server/backupService.ts:225` | Причина сбоя восстановления проглатывается: в логе только error.name, оператор видит общий текст |
| N13 | средняя | DRY | `server/lib/validate.ts:17` | Три парсера денег с разными правилами на соседних маршрутах |
| N14 | средняя | тесты и DX | `server/middleware.security.test.ts:14` | Сам логин по HTTP не проверяет ни один тест, а тесты лимитера разбросаны по трем файлам, названным по ревью |
| N15 | средняя | модель данных | `server/repositories/actsRepo.ts:103` | Бонус ассистента не леджер: «заработано» пересчитывается из текущих актов задним числом, переплата скрыта |
| N16 | средняя | SOLID | `server/repositories/searchRepo.ts:42` | Роль accountant определена в шести местах по-разному: раздел только на счетах, остальное решает каждый модуль сам |
| N17 | средняя | тесты и DX | `server/reviewFollowup.test.ts:42` | Тесты организованы по раундам ревью и дублируют друг друга; конкурентные проверки живут вне vitest и не входят в gate деплоя |
| N18 | средняя | тесты и DX | `server/reviewRegressions.test.ts:31` | Тесты денежного ядра организованы по ревью и обходят живую схему 'agency' |
| N19 | средняя | тесты и DX | `server/reviewRegressions.test.ts:122` | Нет поведенческих тестов на бонусы, удаление клиента/партнера и полноту аудита; тесты названы по процессу ревью |
| N20 | средняя | поддерживаемость | `server/routes.ts:33` | /api/health — заглушка без БД и версии, нет request-id и журнала запросов |
| N21 | средняя | спагетти | `server/routes.ts:39` | Три параллельных серверных архитектуры записи и чтения, переезд на командный слой не завершен |
| N22 | средняя | спагетти | `server/routes.ts:44` | Третий слой: роуты с сырым SQL и прямым db мимо портов, плюс зависимость от порядка монтирования |
| N23 | средняя | атомарность | `server/routes/acts.ts:24` | Выплата бонусов ассистенту (деньги) осталась вне командного слоя: нет идемпотентности, аудита и валидации суммы, в новый порт вшит no-op |
| N24 | средняя | атомарность | `server/routes/acts.ts:26` | POST /api/admin/bonus-payout: сумма из тела без схемы, без сверки, без транзакции, идемпотентности и аудита |
| N25 | средняя | спагетти | `server/routes/assistant.ts:15` | Незавершенный переезд слоя данных: новые отчеты идут из роутов прямо в db, старые проходят четыре слоя пересылки |
| N26 | средняя | атомарность | `server/routes/backup.ts:34` | Три пути восстановления с разной защитой: HTTP in-place в живом процессе не сбрасывает аренды и воскрешает outbox |
| N27 | средняя | поддерживаемость | `server/routes/backup.ts:34` | Три пути восстановления с разными гарантиями; in-place restore в web-процессе остался в UI без maintenance lock |
| N28 | средняя | поддерживаемость | `server/routes/clients.ts:127` | Тест Telegram всегда отвечает «ok»: эндпоинт проверки использует версию отправки, которая глотает ошибки |
| N29 | средняя | спагетти | `server/routes/documentStatus.ts:1` | Чтение для дашбордов размазано по трем слоям: SQL в роутерах, репозиторий в обход storage и фасад storage |
| N30 | средняя | спагетти | `server/routes/invoices.ts:97` | Двойная граница route+service: авторизация, фильтр полей и валидация выполняются дважды |
| N31 | средняя | атомарность | `server/routes/recurring.ts:75` | Шаблоны периодики меняются в обход командного слоя: без аудита, транзакции и с жестким удалением |
| N32 | средняя | безопасность | `server/services/backupArchive.ts:40` | ACCESS_CODE_SECRET разводится на ключи в трех модулях с противоположной политикой при отсутствии секрета |
| N33 | средняя | модель данных | `server/services/backupTables.ts:15` | В архив входят служебные таблицы состояния, и каждый путь восстановления по-своему их «чинит» |
| N34 | средняя | избыточность | `server/services/invoiceCommands.ts:43` | Идемпотентность переусложнена и продублирована, квитанции растут бесконечно |
| N35 | средняя | DRY | `server/services/invoiceCommands.ts:50` | Механизм идемпотентности и аудита скопирован в двух классах, плюс еще два пути аудита; совместимость с квитанциями, прожившими 22 минуты |
| N36 | средняя | поддерживаемость | `server/services/jobRunner.ts:43` | Для одного оператора все молчит и ничего не чистится: ошибки заданий не видны, OnFailure не существует, релизы, дампы и retained-БД копятся |
| N37 | средняя | DRY | `server/services/paymentCommands.ts:33` | Граница команды написана трижды по-разному, у аудита две семантики, репозиторий импортирует сервис |
| N38 | средняя | атомарность | `server/services/paymentCommands.ts:46` | Два механизма аудита: команды пишут журнал в транзакции, роуты партнеров/клиентов/актов — после мутации вне ее |
| N39 | средняя | спагетти | `server/storage.ts:77` | Фасад сохранил полный неохраняемый API мутаций параллельно InvoiceCommands, а массовый пересчет уже идет мимо командного слоя |
| N40 | средняя | избыточность | `server/storage.ts:77` | Тройное объявление каждой операции (repo + storagePorts + DatabaseStorage + Pick), в фасаде остались неаудируемые финансовые записи |
| N41 | средняя | поддерживаемость | `server/worker.ts:26` | Сбои фоновых задач и outbox не видны: ошибка проглатывается, бесконечные повторы, нет мертвой очереди |
| N42 | средняя | атомарность | `src/components/invoices/UnifiedInvoicesList.tsx:276` | Массовое безвозвратное удаление: N параллельных DELETE по выборке, которая переживает смену страницы, фильтра и архива |
| N43 | средняя | тесты и DX | `src/hooks/financialMutations.test.tsx:18` | Тесты области подогнаны под чек-лист ревью: фикстуры обходят реальные сценарии карточки |
| N44 | средняя | поддерживаемость | `src/hooks/useInvoiceCommands.ts:31` | Клиентская денежная математика и легаси-схемы как значения по умолчанию в новом коде |
| N45 | средняя | SOLID | `src/hooks/useInvoiceCommands.ts:33` | Фронт: «координатор из 293 строк» достигнут переносом сложности в god-hook на ~100 полей; мутации счетов идут тремя каналами, маршруты продублированы регэкспами |
| N46 | средняя | поддерживаемость | `src/hooks/useInvoiceExpenseActions.ts:22` | Новые командные хуки написаны в обход useMutation: в коде две идиомы мутаций |
| N47 | средняя | спагетти | `src/lib/invoiceDetailsView.ts:67` | Тот же финансовый смысл в двух адаптерах берется из разных полей и по разным правилам |
| N48 | средняя | DRY | `src/lib/invoicePermissions.ts:38` | Две независимые матрицы видимости, на клиенте и на сервере, синхронизируются вручную |
| N49 | средняя | модель данных | `src/lib/invoiceView.ts:11` | Адаптеры счета превращают поле, скрытое по роли, в 0: «нет данных» и «ноль рублей» неразличимы |
| N50 | средняя | тесты и DX | `tsconfig.server.json:16` | Quality gate дырявый: серверные тесты не проходят tsc, no-unused-vars выключен, мертвые импорты и устаревшие комментарии в отчетных репозиториях |
| N51 | низкая | поддерживаемость | `deploy/activate-app-domain.sh:48` | activate-app-domain.sh под root правит копию .env текущего релиза, чужой сайт и рестартует только web |
| N52 | низкая | поддерживаемость | `deploy/activate-release.sh:58` | Порт сделан настраиваемым, но nginx и проверка релиза жестко ждут 5000 |
| N53 | низкая | тесты и DX | `deploy/deploy.sh:11` | Гейт деплоя и гейт CI не совпадают: деплой не требует зеленого CI и блокируется npm audit |
| N54 | низкая | тесты и DX | `scripts/audit-money.sql:31` | audit-money.sql сверяет кэш с самим собой и хардкодит коэффициенты схем |
| N55 | низкая | тесты и DX | `server/architectureRemediation.http.test.ts:62` | Тесты организованы по эпизодам ревью, а не по поведению доменов; архитектурные стражи сделаны регулярками |
| N56 | низкая | DRY | `server/backupService.ts:209` | restoreBackup и restoreArchive дублируют транзакцию замены данных, а проверка инварианта есть только в одной из них |
| N57 | низкая | DRY | `server/repositories/financialReportsRepo.ts:12` | Денежные суммы в отчетах складываются тремя разными способами, включая Decimal для счетчиков |
| N58 | низкая | модель данных | `server/repositories/partnerDashboardRepo.ts:62` | Годовая комиссия партнера теперь определена на сервере дважды с разными правилами |
| N59 | низкая | модель данных | `server/repositories/reportsRepo.ts:314` | Клиентский отчет «агентские 30/40» суммирует как «оплачено» черновики и отмененные счета |
| N60 | низкая | безопасность | `server/repositories/userRepo.ts:96` | Идентификаторы сессий хранятся в БД как есть и целиком уходят в каждый бэкап |
| N61 | низкая | DRY | `server/repositories/userRepo.ts:123` | Старый необязательный CSRF-механизм оставлен в validateSession рядом с новым обязательным |
| N62 | низкая | тесты и DX | `server/reviewCompletion.test.ts:38` | Тесты разложены по раундам ревью, а не по поведению; в одном из них фальшивая аутентификация |
| N63 | низкая | тесты и DX | `server/reviewRegressions.test.ts:114` | Тесты бэкапа и restore разложены по файлам раундов ревью, а не по модулям |
| N64 | низкая | поддерживаемость | `server/routes.ts:38` | Composition root недоделан: в роуты пробрасывается сырой database, сервисы по умолчанию привязаны к боевому синглтону db |
| N65 | низкая | безопасность | `server/routes/acts.ts:34` | /api/my-bonus-payments отдает ассистенту все выплаты: фильтра по получателю нет, и его не на чем строить |
| N66 | низкая | поддерживаемость | `server/routes/acts.ts:137` | Два эндпоинта скачивания акта: мертвый /download грузит весь файл в память и отдает data URL с сохраненным mimeType |
| N67 | низкая | избыточность | `server/routes/assistant.ts:12` | Исправления переписали мертвые виджеты ассистента и построили под них SQL-эндпоинты, контракты и нагрузочные замеры |
| N68 | низкая | безопасность | `server/routes/auth.ts:79` | Бюджет попыток по IP расходуют и успешные входы, а фронт сам повторяет логин до трех раз |
| N69 | низкая | DRY | `server/routes/clients.ts:81` | Метаданные аудита (IP, user-agent) собираются вручную в шести роутах, мимо commandActor и с сырым X-Forwarded-For |
| N70 | низкая | поддерживаемость | `server/routes/dashboard.ts:52` | Контракты месяца в аналитических эндпоинтах: часть 1-based, часть 0-based |
| N71 | низкая | атомарность | `server/routes/export.ts:62` | XLSX-экспорт читает счета до трех раз отдельными запросами без снимка: листы одного файла могут не сходиться |
| N72 | низкая | поддерживаемость | `server/services/outbox.ts:22` | Outbox без конечного состояния и диагностики: недоставляемые уведомления крутятся вечно, тела с ПДн не чистятся и попадают в бэкапы |
| N73 | низкая | избыточность | `server/storagePorts.ts:151` | Слой портов требует правки в четырех файлах на каждый запрос, а семь доменных интерфейсов декоративны |
| N74 | низкая | избыточность | `server/worker.ts:16` | Непропорциональная инфраструктура фоновых задач для одного процесса: аренда с heartbeat, SKIP LOCKED, ручной бэкап как расписание с датой 9999 |
| N75 | низкая | безопасность | `src/components/invoices/AccountantDashboard.tsx:206` | Ссылка закрывающего документа принимается как произвольный текст и рендерится в href при выключенном CSP |
| N76 | низкая | поддерживаемость | `src/components/invoices/InvoiceCard.tsx:37` | InvoiceCard: ложный тип схемы, мертвый клиентский пересчет денег и фантомные поля в типе пропсов |
| N77 | низкая | DRY | `src/components/invoices/admin/AssistantBonusManager.tsx:116` | Тариф 1000/2000 продублирован на фронте, мертвые колонки бонуса в invoice_calculations, invoiceCount считается по другому фильтру |
| N78 | низкая | тесты и DX | `src/components/invoices/reviewCompletion.test.tsx:82` | Поведение дашбордов проверяется в файлах, названных по волне ревью, а не по функции |
| N79 | низкая | производительность | `src/hooks/useInvoiceCommands.ts:19` | Обновление одного счета инвалидирует все финансовые запросы приложения |
| N80 | низкая | DRY | `src/hooks/useInvoiceCommands.ts:32` | Словарь статусов счета дублируется и уже расходится в соседних хуках |
| N81 | низкая | DRY | `src/hooks/useInvoicePage.ts:9` | Два хука для одной постраничной выдачи /api/invoices и третья ручная сборка параметров |
| N82 | низкая | DRY | `src/hooks/usePagedInvoices.ts:32` | Два хука одной страницы счетов с разными ключами и контрактами; справочник клиентов добывается запросом счетов |
| N83 | низкая | спагетти | `src/lib/api.ts:25` | Транспорт фронта держит собственный реестр идемпотентных команд в виде регулярки по URL |
| N84 | низкая | спагетти | `src/lib/api.ts:26` | Контракт идемпотентности продублирован регуляркой путей во фронте |
| N85 | низкая | избыточность | `src/lib/api.ts:26` | API-клиент выбирает поведение по регулярным выражениям URL, которые повторяют серверную маршрутизацию |
| N86 | низкая | производительность | `src/lib/financialQueries.ts:11` | invalidateFinancialQueries: широкая инвалидация на каждое сохранение мелкого поля и ручной реестр строковых префиксов |
| N87 | низкая | DRY | `src/pages/AccountingPage.tsx:22` | Страница 'Бухгалтерия' только для админа дублирует журнал бухгалтера, а у бухгалтера два пункта меню ведут на один экран |


### Серьезность: высокая

#### N1. Проверка активации релиза неверна: пропускает старое состояние и откатывает код после миграций из-за бизнес-ошибки одного шаблона

- Файл: `deploy/activate-release.sh:70`
- Категория: тесты и DX. Принцип: Health-check проверяет живость процесса, а не бизнес-результат; откат кода только при совместимой схеме
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
deploy/activate-release.sh:70-71:
  jobs=$(sudo -u postgres psql -At -d finance_duck -c "SELECT count(*) FROM scheduled_jobs WHERE key IN ('recurring-invoices','login-limit-cleanup') AND last_finished_at IS NOT NULL AND state='idle'")
  if [[ "$jobs" == 2 ]]; then break; fi
deploy/activate-release.sh:52: sudo -u financeduck node --env-file=.env dist-server/migrate.js  (миграции уже применены до проверки)
server/worker.ts:11-13:
    const result = await processAllDueRecurringInvoices(db);
    if (result.errors.length) throw new Error(result.errors.join('; '));
```

**Проблема.** Задания идут раз в час, поэтому при повторном деплое новый worker их не запускает (nextRunAt в будущем), а проверка проходит по строкам, оставшимся от прошлого worker. Новый процесс она не проверяет. И наоборот: если хотя бы один повторяющийся шаблон падает с ошибкой, задание висит в state='failed' с ретраями. Тогда любой деплой через 20 секунд уходит в rollback и возвращает старый код поверх уже мигрированной схемы (документация сама признает, что symlink SQL не откатывает).

**Чем грозит.** Одна битая запись блокирует все выпуски, включая срочные исправления, и каждый раз гоняет откат кода при новой схеме. Ложно-зеленая проверка дает уверенность, что worker нового релиза работает, когда это не проверено.

**Что сделать.** Worker при старте пишет в таблицу worker_heartbeat строку (commit из release.json, started_at), а затем обновляет ее каждые 30 секунд. activate-release.sh ждет heartbeat с нужным commit. Ошибки бизнес-заданий сюда не входят: они отправляют алерт (см. находку про молчаливые сбои). processAllDueRecurringInvoices помечает проблемный шаблон и не делает все задание failed.

*Верификатор:* activate-release.sh:69-74 проверяет только state='idle' AND last_finished_at IS NOT NULL. При повторном деплое строки остаются от прошлого worker, а nextRunAt hourly в будущем (jobRunner.ts:25), так что проверка проходит, хотя новый процесс ничего не сделал. Если же хоть один шаблон дает ошибку (worker.ts:13 → state='failed', jobRunner.ts:43), проверка никогда не пройдет, и rollback (строки 20-43) вернет старый код поверх примененных на строке 52 миграций.

#### N2. Регрессия: у 'agency' без ставки партнера вся маржа уходит партнеру, админу 0

- Файл: `server/repositories/invoiceRepo.ts:213`
- Категория: модель данных. Принцип: Single Source of Truth; явное разрешение входов по политике схемы
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
server/repositories/invoiceRepo.ts:213-214:
  const partnerRate = parseNum(invoice.partnerCommissionRate ?? existing?.commissionRate);
  const marginRate = invoice.scheme === 'agency' ? parseNum(existing?.commissionRate) : 0;
На ece9adf было: `const partnerRate = isAgencyFlex ? parseNum(invoice.partnerCommissionRate) : commissionRate;`. Путь к NULL: server/services/invoiceCommandInput.ts:25 `partnerCommissionRate: rate.nullish()` (PATCH с null), а колонка nullable (shared/schema.ts:99). Воспроизведено через tsx на PGlite: createInvoice(agency, partnerCommissionRate: null, {clientBill: '1000000', commissionRate: '40'}) дает agencyMargin 400000.00, partnerShareFromMargin 400000.00, netProfitAdmin 0.00.
```

**Проблема.** Общий fallback «ставка партнера, иначе commissionRate из кэша» склеил два разных смысла поля. Для commission_based в кэше лежит процент партнера, а для 'agency' там маржа. Если у агентского счета нет partner_commission_rate (PATCH с null, исторические строки, будущий импорт), движок берет маржу как ставку партнера: min(margin, margin) = margin. Тогда partnerShareFromMargin = вся маржа, а adminShareFromMargin, partnerTransferDue и netProfitAdmin = 0. Ошибка тихая: audit-money.sql ее не видит, потому что админ = маржа − партнер сходится, а тесты invoiceRepo.agency.test.ts покрывают только ненулевые ставки.

**Чем грозит.** При ближайшем пересчете (любой расход, перенос, закрытие периода, recalculateAllInvoices) прибыль владелицы по такому счету обнуляется, а долг партнера админу исчезает из отчетов и дашбордов. Деньги перераспределяются без единого сообщения об ошибке.

**Что сделать.** Ввести в shared/schemePolicies.ts функцию resolveRates(policy, {partnerCommissionRate, agencyMarginRate}) → {partnerRate, marginRate}, где для kind='agency' partnerRate = invoice.partnerCommissionRate ?? 0 и никогда не берется из кэша, а для kind='commission' rate = invoice.partnerCommissionRate. Вызывать ее в _recalculateInvoiceExpenses вместо строк 213-214. Для 'agency' сделать partner_commission_rate NOT NULL DEFAULT 0 (миграция с backfill 0). Добавить тест «agency с partnerCommissionRate=null сохраняет netProfitAdmin = маржа».

*Верификатор:* Подтверждено по коду: invoiceRepo.ts:213 при partnerCommissionRate=null для agency берет existing.commissionRate, то есть маржу. Движок (financialEngine.ts:76) дает partner = min(margin, margin), и админу достается 0. На ece9adf (строка 264) для agency бралась только колонка. Через UI сейчас не воспроизводится (CreateInvoiceDialog всегда шлет ставку), но доступно через PATCH с null, через смену legacy-схемы на agency с calculations.commissionRate и через импортированные строки.

#### N3. Собственный формат архива привязан к текущей схеме: каждая миграция требует ручной legacy-прокладки, иначе restore откажет

- Файл: `server/services/backupArchive.ts:13`
- Категория: модель данных. Принцип: Open-Closed / единый источник версии схемы; бэкап должен восстанавливаться на свою схему, а мигрировать вперед должен штатный мигратор
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
backupArchive.ts:13 `const validators = Object.fromEntries(Object.entries(backupTables).map(([key, table]) => [key, createSelectSchema(table).strict()]));`
backupArchive.ts:17-18 `export function upgradeLegacyRow(key: TableKey, row: Record<string, unknown>) {
  return key === 'invoices' && !Object.hasOwn(row, 'archivedAt') ? { ...row, archivedAt: null } : row;`
backupArchive.ts:48 `JSON.stringify({ format: 'fdb1', schema: 6, ...meta, ...`
backupService.ts:45-50 ручные ветки для версий 2.0/3.0/4.0/5.0 (objectKey, recurringOccurrenceKey, serviceUsage, scheduledJobs); docs/backup-and-capacity.md:17 описывает `fdb1/schema=5`.
```

**Проблема.** Строки архива валидируются строгим zod-валидатором текущей схемы, а не схемы, при которой архив был создан. Любая миграция, которая добавляет колонку, делает все существующие архивы невосстановимыми, пока кто-то не допишет очередную прокладку в upgradeLegacyRow или validateBackup. Номер схемы 6 захардкожен и никак не связан с drizzle-миграциями 0000–0007, а документация уже отстала (пишет schema=5). Таких веток уже шесть (JSON 2.0–5.0 и fdb 5/6), и каждая новая миграция добавит еще одну.

**Чем грозит.** Ошибка проявится ровно в момент аварии: после очередного релиза ночные копии, снятые до миграции, отклоняются с ZodError, а оператор (см. отдельную находку о проглоченной ошибке) видит только «Проверьте формат». Каждая миграция обходится дороже, потому что прокладку легко забыть, и ни один тест не заставляет ее написать.

**Что сделать.** Записывать в заголовок архива id последней примененной drizzle-миграции (из __drizzle_migrations) вместо ручного `schema: 6`. В shadowRestore применять миграции до уровня архива, загружать строки и затем прогонять migrate() до HEAD, тогда прокладки upgradeLegacyRow и ветки validateBackup станут не нужны. Минимальный вариант: CI-тест, который восстанавливает зафиксированный fixture-архив предыдущего релиза, плюс правило «новая миграция → новый fixture».

*Верификатор:* backupArchive.ts:13 валидирует строки strict-схемой текущего drizzle. Прокладка upgradeLegacyRow (17-18) закрывает только archivedAt, schema: 6 захардкожен (48), а docs/backup-and-capacity.md:17 все еще пишет schema=5. Если миграция добавит NOT NULL или nullable колонку без новой прокладки, все прошлые архивы станут невосстановимыми, и ни один тест этого не поймает.

#### N4. Периодика выпускает счета по живой схеме 'agency' с маржой 0

- Файл: `server/services/recurringCommands.ts:42`
- Категория: модель данных. Принцип: Make illegal states unrepresentable; полнота модели данных
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
server/services/recurringCommands.ts:42-46:
    const invoice = await invoiceRepo.createInvoice(tx, {
      invoiceNumber, clientId: recurring.clientId, partnerId: recurring.partnerId,
      scheme: recurring.scheme, partnerCommissionRate: recurring.partnerCommissionRate,
      clientBill: recurring.amount, description: recurring.description,
Третий аргумент calculations не передается, а в recurring_invoices нет колонки маржи. server/lib/recurringInput.ts:12 `scheme: z.enum(invoiceSchemeEnum.enumValues)` принимает 'agency'. Прогноз recurringRepo.ts:238 тоже считает без agencyMarginRate. Воспроизведено: шаблон agency, amount 100000, partner 15, generateOccurrence дает commissionRate 0.00, agencyMargin 0.00, netProfitAdmin 0.00, clientBaseAfterMargin 100000.00.
```

**Проблема.** Гибкая 'agency' — одна из двух живых схем, но модель шаблона не умеет хранить ее главный параметр, ставку маржи. API принимает такой шаблон без ошибки, генератор создает счет, где весь бюджет показан клиенту, а партнер (15%) обрезается до нулевой маржи. В прогнозах такой шаблон молча выпадает (expectedProfit <= 0 → continue). Сейчас это закрыто только тем, что UI предлагает легаси-схемы (CreateRecurringInvoiceDialog.tsx:232-236, по умолчанию agency_30).

**Чем грозит.** Как только в диалог периодики добавят живую схему (это естественный следующий шаг, легаси-схемы выводятся), каждый ежемесячный счет будет выпускаться с нулевой прибылью агентства. Клиент при этом увидит в кабинете завышенный бюджет.

**Что сделать.** Добавить recurring_invoices.agency_margin_rate numeric(5,2), а в recurringInput сделать superRefine: для политики kind='agency' с marginRate=null ставка обязательна. generateOccurrence должен передавать ставку в createInvoice (после исправления F48 сразу в invoices.agency_margin_rate). Пока колонки нет, отвергать scheme='agency' в recurringInput с 400. Прогнозы считать через тот же resolveRates.

*Верификатор:* Подтверждено: в recurring_invoices нет колонки маржи (shared/schema.ts:302-321), recurringCommands.ts:42-48 вызывает createInvoice без calculations, и маржа выходит 0, а доля партнера обрезается до 0. API принимает схему agency (recurringInput.ts:12). Это не регрессия (на ece9adf было так же), а латентный дефект: защищает только список схем в CreateRecurringInvoiceDialog.tsx:232-236.

#### N5. /api/dashboard/stats и /api/financial-summary агрегируют счета вне invoiceScope: fail-open для assistant/accountant и для сессий без tenant-id

- Файл: `server/storage.ts:106`
- Категория: безопасность. Принцип: Единая точка авторизации данных (fail-closed), полное покрытие tenant-тестами
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
storage.ts:106-113:
    let results;
    if (role === 'partner' && partnerId) {
      results = await query.where(eq(invoices.partnerId, partnerId));
    } else if (role === 'client' && clientId) {
      results = await query.where(eq(invoices.clientId, clientId));
    } else {
      results = await query;
    }
Вызовы: routes/dashboard.ts:15 и :251 `storage.getDashboardStats(role, ...)` -> projectStatsForRole оставляет assistant/accountant поля totalClientBill/paidClientBill/totalExpenses (permissions.ts:136-143).
```

**Проблема.** Ремедиация внедрила invoiceScope (fail-closed: `sql`false`` при отсутствии clientId/partnerId) в alerts, search, priority-actions, financialReports, export. Самый посещаемый агрегат обошла. Ассистент получает суммы и счетчики по скрытым от него счетам (hideFromAssistant=true), бухгалтер видит суммы вне своего scope. Сессия роли client или partner без привязки к клиенту или партнеру получает итоги по всему агентству. accessPreservation.http.test.ts проверяет unscoped-сессии на /api/invoices и /api/alert-counts, а /api/dashboard/stats не проверяет. Документация (docs/architecture-review-remediation.md, пункт 12: «SQL scope/агрегации») заявляет обратное.

**Чем грозит.** Агрегатная утечка скрытых счетов ассистенту прямо сейчас, при каждом открытии Index.tsx и KeyMetricsCards. Ошибочно выданный код доступа без clientId показывает клиенту оборот всего агентства.

**Что сделать.** Переписать getDashboardStats как функцию репозитория getDashboardStats(db, actor: InvoiceActor) с WHERE invoiceScope(actor) и SQL-агрегатами COUNT/SUM FILTER вместо полной выгрузки, убрать ветвление по role/partnerId/clientId из storage.ts. Добавить /api/dashboard/stats и /api/financial-summary в цикл ролей accessPreservation.http.test.ts, включая partner-unscoped и client-unscoped, с проверкой, что суммы равны сумме по видимым фикстурам.

*Верификатор:* Подтверждаю: storage.ts:106-113 для assistant и accountant, а также для client/partner без id делает выборку без WHERE. Тем временем invoiceScope (invoiceQuery.ts:30-33) для этих случаев фильтрует по hideFromAssistant или возвращает false. projectStatsForRole оставляет ассистенту и бухгалтеру суммы totalClientBill/paidClientBill/totalExpenses (permissions.ts:136-143), то есть они видят агрегаты по скрытым от них счетам.

#### N6. Сервер слушает 0.0.0.0 при trust proxy 1: в обход nginx X-Forwarded-For подделывает IP для лимитера входа

- Файл: `server/vite.ts:64`
- Категория: безопасность. Принцип: Defense in depth: доверие к заголовкам прокси допустимо только когда до приложения нельзя достучаться в обход прокси
- Серьезность у автора находки: высокая; итоговая, после верификатора: высокая

```
server/vite.ts:64  server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
server/app.ts:14  app.set("trust proxy", 1);
server/routes/auth.ts:75  const ip = req.ip || "unknown";
server/routes/auth.ts:79  const ipStatus = await reserveIpAttempt(ip);
deploy/finance-duck.service:11  EnvironmentFile=/opt/finance-duck/.env  (HOST нигде не задан, .env.example:7 только PORT=5000)
```

**Проблема.** По умолчанию Node слушает все интерфейсы. trust proxy 1 доверяет первому хопу, но при прямом обращении на :5000 этим хопом становится сам клиент: req.ip берется из его X-Forwarded-For, req.protocol из X-Forwarded-Proto. Лимит 30 попыток с IP (rateLimiter.ts:13) — единственная защита от перебора многих кодов, и обходится он подстановкой нового XFF на каждый запрос. В памяти проекта записано, что порт 5000 FinanceDuck открыт наружу мимо nginx, а ufw в install.sh включается через || true. Тот же путь обходит HSTS, client_max_body_size и TLS из nginx.

**Чем грозит.** Перебор кодов доступа без IP-лимита. Сессии и коды по открытому HTTP, если клиент зайдет на :5000. Поддельный IP в user_sessions и журналах.

**Что сделать.** В прод-окружении по умолчанию слушать 127.0.0.1: HOST=127.0.0.1 в юните и в .env.example, а в vite.ts падать, если NODE_ENV=production и HOST не loopback, без явного флага. trust proxy задать списком 'loopback' вместо числа. В activate-release добавить проверку ss -ltn: :5000 не должен быть на 0.0.0.0.

*Верификатор:* Подтверждено кодом и проверкой снаружи: GET http://5.129.198.180:5000/api/health вернул 200, то есть порт открыт мимо nginx. server/vite.ts:64 слушает 0.0.0.0, app.ts:14 выставляет trust proxy 1, поэтому при прямом обращении req.ip берется из клиентского X-Forwarded-For. IP-лимит auth.ts:79 обходится, и коды можно перебирать по одной попытке на код.

#### N7. Бесконечный цикл рендеров и сброс всех полей ввода карточки счета: useEffect([invoice]) на немемоизированной view-модели

- Файл: `src/hooks/useInvoice.ts:19`
- Категория: производительность. Принцип: Single Source of Truth: форма владеет черновиком, сервер владеет данными; производные данные мемоизируются
- Серьезность у автора находки: критично; итоговая, после верификатора: высокая

```
useInvoice.ts:19 `invoice: query.data ? invoiceDetailsView(query.data.invoice) : null, expenses: query.data?.expenses.map(row => ({ ...row, invoice_id: row.invoiceId })) ?? [],` → useInvoiceStatusCommands.ts:169-172 `useEffect(() => { setPlannedPaymentDate(invoice?.payment_date ? new Date(invoice.payment_date) : undefined); ... }, [invoice]);`; useInvoiceFinancialTerms.ts:156-160 `useEffect(() => { ... setClientBillEdit(calc?.client_bill ?? invoice.client_bill ?? 0); setPlannedExpensesEdit(...) }, [invoice]);`; useInvoiceMetadataCommands.ts:170-175 `useEffect(() => { setNotes(invoice?.notes || ''); setInvoiceNumber(...); ... }, [invoice]);`
```

**Проблема.** invoiceDetailsView создает новый объект на каждом рендере, поэтому эффекты с зависимостью [invoice] срабатывают после каждого коммита. Если у счета задан payment_date или actual_payment_date, setPlannedPaymentDate(new Date(...)) каждый раз кладет новый объект, и получается бесконечный цикл. Проверено пробным тестом в scratchpad на HEAD: около 3636 рендеров за 300 мс и около 7468 за 600 мс, 143 предупреждения «Maximum update depth exceeded»; под act тест падает по OOM. Без дат цикла нет, но любой ввод сбрасывается: после setNotes('typed by user') и setClientBillEdit(1500) хук возвращает notes='old' и clientBillEdit=1000. Заметки, номер, название для клиента, сумма счета, процент партнера и резерв в карточке фактически не редактируются.

**Чем грозит.** Главный экран работы с деньгами на проде грузит CPU и не дает менять суммы и условия. Регрессию принесло исправление F93, и тесты ее не ловят.

**Что сделать.** В useInvoice обернуть производные значения в useMemo по query.data: `const invoice = useMemo(() => query.data ? invoiceDetailsView(query.data.invoice) : null, [query.data])`, так же для expenses. Синхронизацию формы из сервера убрать из useEffect: инициализировать черновик по ключу `key={invoice.id + updatedAt}` на секции-редакторе (или через useState(() => initial) с ремоунтом), а не перезаписывать state после каждого коммита. Добавить регрессионный тест: смонтировать InvoiceDetailsDialog с фикстурой, у которой есть paymentDate, вызвать onChange у input-client-bill и проверить, что значение сохраняется и число рендеров ограничено.

*Верификатор:* Подтверждаю по коду: useInvoice.ts:19 на каждом рендере создает новый объект через invoiceDetailsView без useMemo, и эффекты с зависимостью [invoice] (useInvoiceStatusCommands.ts:169-172, useInvoiceFinancialTerms.ts:156-160, useInvoiceMetadataCommands.ts:170-175) срабатывают после каждого коммита. При заданной дате оплаты setState(new Date(...)) зацикливается, а введенные notes и clientBillEdit сбрасываются к серверным значениям. Основной редактор счета сломан, но данные и деньги не портятся (сохраняется старое значение), поэтому ставлю high, а не critical.


### Серьезность: средняя

#### N8. Каждый выпуск копит полный pg_dump, архив объектов и релиз с node_modules без учета места

- Файл: `deploy/activate-release.sh:48`
- Категория: поддерживаемость. Принцип: Ограниченные ресурсы управляются явно: у каждого артефакта эксплуатации есть владелец и судьба
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
deploy/activate-release.sh:12-13  archive="/var/finance-duck/releases/$(basename "$release")"; mkdir -m 700 "$archive"
:48  sudo -u postgres pg_dump -Fc finance_duck > "$archive/before-switch.dump"
:49  tar -czf "$archive/objects-before-switch.tar.gz" -C /var/finance-duck objects
deploy/deploy.sh:17  cd '$release' && npm ci --omit=dev
deploy/restore-backup.sh:12-13  previous="finance_retained_$stamp"; failed="finance_failed_$stamp"
```

**Проблема.** Каждый деплой оставляет на 40 ГБ VDS полный дамп БД, tar всех документов и отдельный каталог релиза с node_modules и копией .env. Каждый restore оставляет целую базу finance_retained_* или finance_failed_* внутри того же Postgres. Нет ни проверки свободного места перед выпуском, ни инвентаря, ни описанной процедуры: что из этого архив, а что можно перенести. На этом же сервере живут еще несколько проектов Виктории. Обычно такие проблемы проявляются тем, что pg_dump посреди выпуска падает с ENOSPC, а Postgres переходит в read-only.

**Чем грозит.** Через десятки выпусков (сейчас их по несколько в день) диск заполнится, и выпуск или ночной бэкап упадет в самый неудобный момент. Копии ПДн множатся бессрочно.

**Что сделать.** Ничего не удалять автоматически (так требует владелица). Добавить в deploy.sh и restore-backup.sh preflight: df на /var/finance-duck и /opt, отказ при свободном месте меньше 3×размер последнего дампа. Добавить команду deploy/archive-releases.sh, которая под контролем оператора переносит релизные дампы старше N выпусков в оффсайт (тот же pull на Mac) и показывает список retained-БД. Выводить размер /var/finance-duck/releases в /api/ready или в алерт.

*Верификатор:* activate-release.sh:48-49 на каждый выпуск складывает полный дамп и tar объектов, deploy.sh:17 ставит отдельные node_modules в каждый релиз, restore-backup.sh:12-13 оставляет базы finance_retained_* и finance_failed_*. Проверки свободного места и очистки старых релизов нет нигде в deploy/.

#### N9. Восстановление с нуля по install.sh и deploy/README несовместимо с новой релизной моделью

- Файл: `deploy/install.sh:50`
- Категория: поддерживаемость. Принцип: Воспроизводимость инфраструктуры: процедура первой установки и восстановления должна исполняться так же, как обычный выпуск
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
deploy/install.sh:50  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$LOG_DIR"
deploy/deploy.sh:15  ssh "$remote" "... test -L /opt/finance-duck; mkdir '$release'"
deploy/deploy.sh:17  cp -p /opt/finance-duck/.env .env
deploy/activate-release.sh:13  mkdir -m 700 "$archive"
deploy/README.md:36,55  cp -r /tmp/finance-duck/deploy /opt/finance-duck/ ... cat > /opt/finance-duck/.env
```

**Проблема.** install.sh создает /opt/finance-duck обычным каталогом, deploy.sh первым шагом требует, чтобы это был симлинк (test -L), и падает. Каталоги /opt/finance-duck-releases и /var/finance-duck/releases install.sh не создает, а activate-release делает mkdir без -p. README ведет на старую схему: «.env в /opt/finance-duck», «скрипт синхронизирует код rsync», journalctl, хотя юниты пишут в файлы. Там же обещан systemd OnFailure → Telegram, но в deploy/finance-duck.service OnFailure нет. Основной юнит activate-release не переустанавливает, ставит только worker, поэтому прод-юнит может отличаться от репозитория. В итоге обычные выпуски работают на уже переделанном вручную сервере, а сценарий «VDS умер, поднимаем новый» по документам не проходит.

**Чем грозит.** При потере VDS или переезде (ФЗ-152, один сервер) восстановление пойдет вручную и под давлением. Расхождение юнитов и .env репозитория с продом невидимо.

**Что сделать.** Довести install.sh до релизной модели: создать /opt/finance-duck-releases, /var/finance-duck/{releases,objects,backups} (0700), /etc/finance-duck/env (0600) и пустой bootstrap-релиз с симлинком /opt/finance-duck, поставить оба юнита. activate-release должен каждый выпуск ставить и finance-duck.service, и worker из релиза, вместе с OnFailure-юнитом алерта. Переписать deploy/README как runbook «чистый сервер → бэкап → restore-backup.sh» и проверить его прогоном на пустой VM или в контейнере в CI.

*Верификатор:* Подтверждено. install.sh:50 создает /opt/finance-duck обычным каталогом, поэтому проверка test -L в deploy.sh:14 падает. activate-release.sh:13 делает mkdir без -p, а /var/finance-duck/releases install.sh не создает. deploy/README.md:92 описывает «синхронизацию кода», :98 — journalctl, :28 — OnFailure, которого нет в finance-duck.service. Деплой падает громко и до остановки сервиса, поэтому оцениваю как medium, а не high.

#### N10. Кабинет под ФЗ-152 грузит Google Fonts и разрешает индексацию

- Файл: `index.html:21`
- Категория: безопасность. Принцип: Минимизация передачи ПДн третьим лицам; закрытый сервис не публикуется в поисковиках
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
index.html:19  <link rel="preconnect" href="https://fonts.googleapis.com" />
index.html:21  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap..." rel="stylesheet" />
index.html:23  <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600&family=Unbounded:wght@500..." rel="stylesheet" />
public/robots.txt:13-14  User-agent: *
Allow: /
(noindex в index.html, public, src — нет)
```

**Проблема.** Каждая загрузка закрытого кабинета отдает Google IP, User-Agent и Referer клиентов агентства, то есть идет трансграничная передача, ради которой проект и уезжал с Replit на Timeweb. Помимо этого внешний CSS-хост является точкой отказа (в РФ бывают сбои доступа к Google) и мешает когда-либо включить CSP, которая и так отключена (app.ts:19). robots.txt явно разрешает индексацию всего закрытого кабинета на двух доменах, X-Robots-Tag и noindex нет.

**Чем грозит.** Регуляторный риск ФЗ-152, деградация интерфейса при блокировках. Страница входа и URL-структура кабинета индексируются под брендом «Без Воды».

**Что сделать.** Положить woff2 Inter, Golos Text и Unbounded в public/fonts с @font-face и self-host, убрать preconnect. robots.txt заменить на Disallow: /. Добавить в nginx и в express X-Robots-Tag: noindex, nofollow для всех ответов кабинета. В CI сделать grep-страж на fonts.googleapis в dist/.

*Верификатор:* index.html:19-23 подключает fonts.googleapis.com и gstatic, robots.txt:13-14 содержит Allow: /, а noindex и X-Robots-Tag не найдены ни в src, ни в server, ни в nginx.conf.

#### N11. Зоопарк форматов бэкапа: 6 поддерживаемых версий за сутки, формат 2.0 не существовал ни в одном коммите, но поддерживается и тестируется

- Файл: `server/backupService.ts:38`
- Категория: избыточность. Принцип: YAGNI; версии формата только по реальным выпускам
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/backupService.ts:38:
  if (!["2.0", "3.0", "4.0", "5.0"].includes(value.version)) throw new Error("Неполный или устаревший формат бэкапа. Автоматическое восстановление версии 1 запрещено");
server/services/backupArchive.ts:123:
        if (meta.schema === 5 && item.kind === 'row') item.row = upgradeLegacyRow(item.table, item.row);
История: ece9adf писал 1.0; 404a90e писал 3.0; f9b2dc4 (через 22 минуты) 4.0; d1d38bb 5.0 и fdb schema 5; 334e5a1 fdb schema 6. git log -S 'version: "2.0"' пуст. server/reviewFollowup.test.ts:75-82 фабрикует 2.0 из свежего снимка (legacy.version = '2.0'; delete legacy.objects) и проверяет restore.
```

**Проблема.** Каждый промежуточный коммит одного агента порождал новую версию формата и ветку апгрейда в коде восстановления: JSON 2.0, 3.0, 4.0, 5.0 и .fdb 5, 6. Тест подтверждает совместимость с форматом, который никто никогда не записывал. В backupService.ts 296 строк, существенная часть из них ветки legacy. Это код самого чувствительного пути, восстановления данных.

**Чем грозит.** Каждое изменение схемы теперь требует правок в нескольких ветках апгрейда и тестов на выдуманные форматы. Ошибка в редкой ветке всплывет в момент аварийного восстановления, когда ее труднее всего диагностировать.

**Что сделать.** Проверить, какие форматы реально лежат в /var/finance-duck/backups и у владелицы в оффсайт-копиях. Один раз конвертировать их офлайн командой backupCli convert в текущий .fdb и удалить ветки 2.0, 3.0, 4.0 и schema 5 вместе с фабрикующими тестами. Правило: номер формата меняется только вместе с миграцией drizzle, читатель поддерживает текущую и одну предыдущую версию.

*Верификатор:* Подтверждено по истории: ece9adf писал 1.0, 404a90e 3.0, f9b2dc4 4.0, d1d38bb+ 5.0. Ни один коммит (git log --all -G 'version: "2.0"') не писал 2.0, но backupService.ts:38/44 его принимает, а reviewFollowup.test.ts:75-86 фабрикует такой файл. Ветки апгрейда .fdb schema 5 есть в backupArchive.ts:123.

#### N12. Причина сбоя восстановления проглатывается: в логе только error.name, оператор видит общий текст

- Файл: `server/backupService.ts:225`
- Категория: тесты и DX. Принцип: Fail loudly with actionable diagnostics; разделение сообщения пользователю и сведений оператору
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
backupService.ts:225-228 `} catch (error) {
      console.error("[Backup] Restore failed:", error instanceof Error ? error.name : 'UnknownError');
      return { success: false, message: "Не удалось восстановить копию. Проверьте формат, ключ шифрования и доступность базы" };`
shadowRestore.ts:30 `if (!restored.success) throw new Error(restored.message);`
backupCli.ts:20 `console.error(error instanceof Error ? error.message : 'Backup operation failed')`
```

**Проблема.** Все ошибки restore (неверный ключ GCM, ZodError по конкретной колонке, нарушение FK, рассогласование service_usage, нехватка объекта) сводятся к одному тексту, а в журнал попадает только имя класса вроде «ZodError» или «Error». shadow-restore и CLI пробрасывают этот же общий текст. Даже оператор с root-доступом в момент аварии не узнает, какая таблица или колонка не прошла.

**Чем грозит.** Время восстановления в инциденте растет с минут до часов отладки. Особенно это опасно вместе с находкой о привязке архива к схеме: отказ после миграции будет выглядеть как «проверьте ключ».

**Что сделать.** Ввести `RestoreError { code: 'AUTH' | 'SCHEMA' | 'FK' | 'INVARIANT' | 'OBJECT', table?, column? }`. В validateRow оборачивать ZodError с именем таблицы и путем поля, но без значений строк (ПДн). В CLI и shadow-restore печатать code/table/column. UI показывает code, а полное сообщение без данных строк пишется в journald.

*Верификатор:* Catch в backupService.ts:225-228 покрывает и restoreArchive. В лог пишется только error.name, а пользователю, shadowRestore.ts:30 и backupCli.ts:20 уходит общий текст. Причину сбоя restore (таблица, колонка, FK, ключ) оператор не видит нигде.

#### N13. Три парсера денег с разными правилами на соседних маршрутах

- Файл: `server/lib/validate.ts:17`
- Категория: DRY. Принцип: DRY; Parse, don't validate; единая граница
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/lib/validate.ts:17 `const NUMERIC_RE = /^-?\d{1,13}([.,]\d{1,4})?$/;` (используется в routes/invoices.ts:72,100,194,216 и services/paymentCommands.ts:8,16);
server/services/invoiceCommandInput.ts:17-18 `z.string().trim().regex(/^\d{1,13}(?:[.,]\d{1,4})?$/)]).transform(value => new Decimal(String(value).replace(',', '.')).toFixed(2, Decimal.ROUND_HALF_UP))`;
server/lib/recurringInput.ts:8-9 `z.string().regex(/^\d{1,13}(\.\d{1,2})?$/) ... .transform(value => Number(value).toFixed(2))`;
server/routes/invoices.ts:249 `const amt = Number(amount);` (перенос без схемы, notes не проверяется).
```

**Проблема.** Принцип «parse, don't validate» выполнен трижды по-разному. Строка "1000,50" валидна для счета и расхода, для шаблона периодики дает 400 «Invalid», для переноса дает NaN и сообщение «Сумма должна быть положительной». Шаблон парсится через double (Number().toFixed), счет через Decimal. Старый validate.ts стоит перед новым parseCommand как лишняя предпроверка с другой регуляркой, где допустим минус. PaymentCommands склеивает оба механизма (positiveMoney из старого плюс moneyString из нового).

**Чем грозит.** Каждое новое денежное поле придется решать, какой из трех парсеров взять, а расхождения в правилах всплывут как непонятные 400 для пользователя и как дрейф округления в шаблонах.

**Что сделать.** Оставить один zod-тип moneyInput в shared/money.ts (Decimal, запятая, half-up до 2 знаков, MAX_MONEY) и rateInput рядом. Удалить денежные схемы из server/lib/validate.ts и вызовы validateBody из routes/invoices.ts. recurringInput и paymentCommands перевести на moneyInput, а перенос — на parseCommand(transferInput) внутри InvoiceCommands.transfer.

*Верификатор:* Подтверждено: NUMERIC_RE с минусом (validate.ts:17) стоит перед parseCommand с другой регуляркой (invoiceCommandInput.ts:17), у шаблона третья регулярка без запятой и Number().toFixed (recurringInput.ts:8-9). У переноса парсер свой: Number(amount) (routes/invoices.ts:249) дает на «1000,50» сообщение «Сумма должна быть положительной» (invoiceRepo.ts:502), notes не проверяется.

#### N14. Сам логин по HTTP не проверяет ни один тест, а тесты лимитера разбросаны по трем файлам, названным по ревью

- Файл: `server/middleware.security.test.ts:14`
- Категория: тесты и DX. Принцип: Тест описывает поведение модуля, а не историю его исправления
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
// server/middleware.security.test.ts:14-17
const authRouter = createAuthRouter(sessions, authMiddleware, {
  reserveLoginAttempt: vi.fn(), reserveIpAttempt: vi.fn(), clearLoginAttempts: vi.fn(),
  clearAllLoginAttempts: vi.fn(), getLockedCodes: vi.fn(),
});
// :49 — единственный вызов /api/auth/login в тестах: проверка враждебного Origin
// server/reviewRegressions.test.ts:108, server/reviewCompletion.test.ts:106, server/reviewFollowup.test.ts:119 — три теста одного 83-строчного rateLimiter.ts
```

**Проблема.** Тесты называются по шагам ревью (reviewRegressions/reviewCompletion/reviewFollowup), а не по модулям: rateLimiter.test.ts и auth.http.test.ts нет. В HTTP-тесте лимитер заменен заглушками vi.fn(), которые возвращают undefined. Поэтому ни один тест не проверяет порядок «IP, потом код», ответ 429, сброс счетчика на успехе, вычисление req.ip при trust proxy и то, что в таблице не остается кода. Регрессия из F38 (верный код пишется в login_rate_limits) прошла именно через эту дыру.

**Чем грозит.** Следующий агент поменяет auth.ts, все тесты останутся зелеными, а лимитер окажется отключен или начнет блокировать всех. Через полгода никто не вспомнит, что лежит в reviewFollowup.test.ts.

**Что сделать.** Создать server/routes/auth.http.test.ts на настоящем Postgres (как accessPreservation.http.test.ts): 6 неверных кодов дают 429; 31 запрос с одного IP дает 429; после успеха счетчик кода сброшен; X-Forwarded-For при trust proxy подменить IP не может; после любого входа в login_rate_limits нет строки с введенным кодом. Перенести три теста лимитера в server/rateLimiter.test.ts, а файлы review*.test.ts расформировать по модулям.

*Верификатор:* Подтверждено: единственный HTTP-вызов /api/auth/login во всех тестах — проверка враждебного Origin (middleware.security.test.ts:50, а не :49), а лимитер в этом тесте заменен vi.fn(). Порядок IP→код, ответ 429, clear на успехе и req.ip при trust proxy не проверяет ни один тест. Тесты лимитера разбросаны по reviewRegressions:108, reviewCompletion:106 и reviewFollowup:119.

#### N15. Бонус ассистента не леджер: «заработано» пересчитывается из текущих актов задним числом, переплата скрыта

- Файл: `server/repositories/actsRepo.ts:103`
- Категория: модель данных. Принцип: Денежные факты append-only: начисление фиксируется в момент события, баланс = Σначислений − Σвыплат со знаком
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
const stats      = await getActsStatistics(db, true);
  const totalEarned = (stats.executorActs * 1000) + (stats.companyActs * 2000);
...
  const assistantBonus = Math.max(0, totalEarned - totalPaid);
// actsRepo.ts:60-62: visibleCondition = status 'paid' AND not hidden, без фильтра по uploadedBy
// actsRepo.ts:52-54: deleteSignedAct — физический delete
// shared/schema.ts:138-145: assistant_bonus_payments без колонки получателя
```

**Проблема.** Начисления нигде не фиксируются: «заработано» каждый раз заново равно количеству актов, существующих сейчас на счетах, которые сейчас paid и не скрыты от ассистента. Удаление акта, перевод счета из paid или установка hideFromAssistant уменьшают уже заработанное задним числом. Если сумма была выплачена, Math.max(0, earned − paid) превращает возникшую переплату в ноль, и она пропадает из всех экранов. В начисление попадают акты, загруженные кем угодно, включая админа, а у выплат нет получателя.

**Чем грозит.** Сумма к выплате, которую видит админ (unpaid-bonus), зависит от того, что потом сделали с актами и счетами. Переплаты и задвоения не видны. С двумя ассистентами модель ломается совсем: делить нечего и некому.

**Что сделать.** Ввести таблицу assistant_bonus_accruals (id, act_id UNIQUE, assistant_token_id FK set null, amount, tariff_version, accrued_at, reversed_at, reversal_reason). Запись создается в той же транзакции, что и createSignedAct, а удаление акта пишет сторно, а не удаляет начисление. В assistant_bonus_payments добавить recipient_token_id. Баланс = SUM(accruals) − SUM(payments) без Math.max, отрицательный баланс показывать как переплату. Тарифы вынести в shared/assistantBonus.ts (ASSISTANT_BONUS_TARIFF) с версией.

*Верификатор:* Подтверждаю: заработанное каждый раз пересчитывается из текущих актов на видимых оплаченных счетах (actsRepo.ts:60-62, 102-103), без фильтра по uploadedBy, а у выплат нет получателя (schema.ts:138-146). Но «пропадает из всех экранов» — преувеличение: при totalPaid>0 UI показывает «Всего заработано X (выплачено Y)» (AssistantBonusCard.tsx:134), а переплата молча зачитывается в будущие начисления, потому что totalPaid кумулятивный.

#### N16. Роль accountant определена в шести местах по-разному: раздел только на счетах, остальное решает каждый модуль сам

- Файл: `server/repositories/searchRepo.ts:42`
- Категория: SOLID. Принцип: Single Responsibility / одна политика доступа на роль
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/invoiceQuery.ts:31: case 'accountant': return eq(invoices.hideFromAssistant, true);
server/repositories/searchRepo.ts:42-44: const isStaff = role === 'admin' || role === 'assistant'; const isClient = role === 'client'; if (!isStaff && !isClient) return results;
server/repositories/alertsRepo.ts:154: if (actor.role === 'admin' || actor.role === 'assistant') {
server/invoiceAccess.ts:58-66 resolveMessageInvoiceScope: для accountant возвращает null
server/tenantAccess.ts:23-27: const CLIENT_CATALOG_ROLES = new Set(["admin", "assistant", "accountant"]);
server/routes/partners.ts:39, 70, 87 и server/routes/clients.ts:71, 90: requireRole("admin", "assistant", "accountant")
```

**Проблема.** Бухгалтер видит только счета с hideFromAssistant=true (это проверено, и создаваемый им счет принудительно получает true в invoiceAccess.ts:44), но глобальный поиск для него всегда пустой, хотя TopSearchBar ему показан; просрочки в alert-counts для него не считаются; сообщения недоступны; при этом каталог всех клиентов и партнеров (в том числе только 'ассистентских') открыт целиком и бухгалтер может создавать и править клиентов и партнеров, которых затем видит ассистент. Политика роли не записана нигде, ее реконструируют из шести файлов.

**Чем грозит.** Любое изменение раздела (например, 'бухгалтер видит еще и оплаченные счета ассистента') потребует правки в шести местах без теста, который сверяет их между собой; уже сейчас поведение бухгалтера в поиске и уведомлениях выглядит как баг, а каталог клиентов протекает через границу раздела.

**Что сделать.** Завести server/rolePolicy.ts с явной таблицей Record<UserRole, {invoiceScope, canSearch, canSeeMessages, catalogScope, canWriteCatalog}> и заменить ей invoiceScope, isStaff в searchRepo, проверку в alertsRepo, resolveMessageInvoiceScope и CLIENT_CATALOG_ROLES; на фронте прятать поиск по тому же флагу; добавить параметризованный HTTP-тест 'матрица роли accountant' по всем этим маршрутам.

*Верификатор:* Политика роли accountant действительно разбросана и противоречива. invoiceScope ограничивает счета hideFromAssistant=true (invoiceQuery.ts:31), но searchRepo.ts:42-44 молча возвращает пустой поиск, хотя TopSearchBar показан всем (App.tsx:194). alertsRepo.ts:154 не считает для бухгалтера просрочки, resolveMessageInvoiceScope возвращает null (invoiceAccess.ts:58-66), а создание и правка клиентов и партнеров ему открыты (clients.ts:71,90; partners.ts:70,87). Довод про «ассистентских» клиентов слабый: у клиентов нет флага скрытия.

#### N17. Тесты организованы по раундам ревью и дублируют друг друга; конкурентные проверки живут вне vitest и не входят в gate деплоя

- Файл: `server/reviewFollowup.test.ts:42`
- Категория: тесты и DX. Принцип: Тесты описывают поведение предметной области; одна точка истины на сценарий; gate совпадает с документацией
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
Идемпотентный повтор проверяется в 6 местах: reviewRegressions.test.ts:161, reviewFollowup.test.ts:42, 107, 176, architectureRemediation.http.test.ts:228, 258. Legacy-бэкапы: reviewFollowup.test.ts:75, reviewRegressions.test.ts:143, backupArchive.test.ts. Скрытые recurring-шаблоны: reviewRegressions.test.ts:85, reviewFollowup.test.ts:59, 176. Тесты с метками пунктов ревью: it('R1: ...') ... it('R8: ...') в architectureRemediation.http.test.ts.
server/reviewFollowup.test.ts:30: const database = () => db as unknown as typeof productionDb;
19 тестовых файлов создают PGlite и прогоняют все миграции. Замер на HEAD: 36 файлов, 255 тестов, 104 с (tests 88.5 с).
deploy/deploy.sh:12: npm run check (без test:postgres), хотя docs/architecture-review-remediation.md:120 требует «Перед активацией обязательны PostgreSQL-регрессии».
```

**Проблема.** Имена файлов и тестов отражают историю процесса ревью (Followup, Regressions, Completion, R1-R8), а не предметную область. Чтобы понять, покрыто ли поведение команды, приходится читать 5 файлов. Одни сценарии проверяются многократно, другие (bonus payout, HTTP restore) нигде. Гарантии конкурентности (SKIP LOCKED, аренды, 30 параллельных номеров) проверяет отдельный скрипт на node:assert, который deploy.sh не запускает, и деплой не ждет CI. Каст TestDb через unknown прячет несовпадение типов PGlite и node-postgres.

**Чем грозит.** Около 1,7 минуты на сюиту при каждом деплое, и время растет с каждым новым PGlite-файлом. Дубли надо править синхронно при каждом изменении команд. Регрессии конкурентности могут уйти в прод в обход заявленного gate.

**Что сделать.** Перегруппировать по доменам: invoiceCommands.test.ts, paymentCommands.test.ts, recurring.test.ts, backupRestore.test.ts, access.http.test.ts. Убрать дубли и метки R*. Создавать PGlite один раз на воркер vitest из заранее мигрированного dataDir-снимка и откатывать каждый тест транзакцией. Перенести scripts/test-postgres.ts в vitest-проект postgres. В deploy.sh требовать зеленый CI точного коммита (gh run list --commit $commit) или запускать test:postgres локально. Привести тип testDb к общему интерфейсу без каста через unknown.

*Верификатор:* Подтверждено: deploy.sh:12 запускает только npm run check (package.json:24, без test:postgres), хотя docs:120 требует PostgreSQL-регрессий; test:postgres есть только в CI (check.yml), и деплой его не ждет. Есть тесты с метками R1-R8 и каст через unknown в reviewFollowup.test.ts:30. Тезис «HTTP restore нигде не проверен» верен только для маршрута: restoreBackup на уровне сервиса тестируется (backupArchive.test.ts:70,86). Bonus payout действительно не покрыт.

#### N18. Тесты денежного ядра организованы по ревью и обходят живую схему 'agency'

- Файл: `server/reviewRegressions.test.ts:31`
- Категория: тесты и DX. Принцип: Тесты описывают поведение, а не историю изменений; покрытие по таблице политик
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/reviewRegressions.test.ts:31-32:
const invoice = (extra: Partial<s.InsertInvoice> = {}) => invoices.createInvoice(database(), {
  invoiceNumber: `REG-${++sequence}`, clientId, partnerId, createdBy: actorId, scheme: 'agency_30', clientBill: '1000', ...extra,
Файлы server/reviewRegressions.test.ts, server/reviewFollowup.test.ts, server/reviewCompletion.test.ts названы по этапам ревью; server/repositories/invoiceRepo.agency.test.ts:23-29 тестирует 'agency' только с ненулевыми ставками.
```

**Проблема.** Регрессионные тесты переносов, PATCH и периодики гоняются на легаси-схеме agency_30 с фиксированными ставками в SCHEME_POLICIES, поэтому ветки разрешения ставок (fallback из кэша, маржа в кэше) для живой 'agency' не проверяются ни одним сценарием редактирования. Из-за этого регрессия в invoiceRepo.ts:213 прошла зеленый CI. Названия файлов отражают историю процесса, а не поведение, и через полгода никто не поймет, где искать тест на переносы.

**Чем грозит.** Следующее изменение пересчета снова будет проверено на схеме, которую уже не создают, а реальные счета пойдут без защиты.

**Что сделать.** Разложить тесты по поведению (invoiceTerms.test.ts, invoiceTransfers.test.ts, recurringGeneration.test.ts, invoiceNumbering.test.ts). Ключевые сценарии (PATCH, перенос, расход, смена схемы) параметризовать через Object.keys(SCHEME_POLICIES) плюс крайние ставки null, 0, partner > margin, а инварианты сравнивать с calculateBookedFinancials на входах из invoices.

*Верификатор:* Подтверждено: хелпер reviewRegressions.test.ts:31-32 и сценарии :157, :164 используют agency_30. invoiceRepo.agency.test.ts (:23-29) проверяет только создание с ненулевыми ставками, так что ни один тест не проверяет agency при null-ставке партнера или при смене схемы. Поэтому [0] не ловится. Названия файлов по этапам ревью — косметика.

#### N19. Нет поведенческих тестов на бонусы, удаление клиента/партнера и полноту аудита; тесты названы по процессу ревью

- Файл: `server/reviewRegressions.test.ts:122`
- Категория: тесты и DX. Принцип: Тест фиксирует поведение предметной области, а не историю процесса
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
await db.insert(s.assistantBonusPayments).values({ amount: '12', paymentDate: '2026-10-17', paidBy: actorId });
// grep bonus-payout|getUnpaidBonusTotal|markBonusesAsPaid|my-bonus по *.test.ts — 0 совпадений
// grep deleteClient|deletePartner по *.test.ts — 0 совпадений
// server/routes/tenantIsolation.security.test.ts:29: logAssistantAction: vi.fn(),
```

**Проблема.** Единственное упоминание бонусов в тестах — фикстура для проверки бэкапа. Ни один тест не проверяет начисление, выплату, переплату, удаление акта после выплаты или видимость /api/my-bonus-payments. Удаление клиента и партнера (неатомарное, с FK-ловушкой на partner_payments) не покрыто. Аудит в роутах партнеров, клиентов и актов проверяется на моках vi.fn(), а не по факту записи. Файлы reviewCompletion, reviewRegressions и reviewFollowup названы по этапам ревью, а не по поведению, поэтому по имени не найти, где тестируются акты или документы.

**Чем грозит.** Любой рефакторинг бонусов или удаления пройдет зеленым CI. Через полгода никто не вспомнит, что лежит в reviewFollowup.test.ts.

**Что сделать.** Добавить server/assistantBonus.integration.test.ts на PGlite: начисление по акту, сторно при удалении, переплата видна как отрицательный баланс, выплата идемпотентна, ассистент видит только свои выплаты. Добавить clientPartnerLifecycle.integration.test.ts: удаление с платежом без счета дает 409, а не 500; создание клиента с несуществующим партнером ничего не оставляет. Ввести табличный тест «каждый мутирующий роут оставляет запись в assistant_action_logs». review*-файлы разложить по доменным именам (invoiceArchive, documentStatus, backupRoundTrip).

*Верификатор:* Подтверждаю: по *.test.ts нет ни одного теста на bonus-payout, unpaid-bonus, assistant/stats, my-bonus и на deleteClient/deletePartner. Бонусы упоминаются только в фикстуре бэкапа (reviewRegressions.test.ts:122), аудит роутов проверяется на vi.fn (tenantIsolation.security.test.ts:29). Неверно, что тесты актов не найти по имени: есть documents.integration.test.ts и exportsAndDocuments.http.test.ts.

#### N20. /api/health — заглушка без БД и версии, нет request-id и журнала запросов

- Файл: `server/routes.ts:33`
- Категория: поддерживаемость. Принцип: Наблюдаемость: проверка готовности отражает зависимости, ошибки коррелируются с запросом
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/routes.ts:33-35  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
deploy/activate-release.sh:53  printf '{"commit":"%s","deployedAt":"%s"}\n' ... > release.json
deploy/activate-release.sh:62  curl -fsS http://127.0.0.1:5000/api/health
grep -rln 'morgan|pino|requestId|x-request-id' server src → пусто; console.* в server: 161
```

**Проблема.** Health отвечает ok, даже когда Postgres недоступен, и не сообщает, какой релиз запущен, хотя release.json для этого уже пишется. Поэтому health-гейт в activate-release.sh:62 и restore-backup.sh:55 проверяет только живость Node, и restore отдельно лезет в БД через psql. Журнала запросов нет совсем: ни request-id, ни метода, пути, статуса и длительности. 131 console.error в роутах пишет текст ошибки без привязки к запросу и пользователю. Для финансовой системы с ролевым доступом разбор «кто и когда получил 500 на /api/invoices/:id» невозможен.

**Чем грозит.** Выпуск с несовместимой схемой или упавшей БД проходит health-гейт. Инциденты расследуются по догадкам.

**Что сделать.** Разделить /health (liveness, как сейчас) и /api/ready: SELECT 1 с таймаутом 1 с плюс {commit, deployedAt} из release.json. Гейты выпуска и restore переключить на ready и сверять commit с ожидаемым. Добавить middleware, которое ставит req.id (из X-Request-Id nginx или randomUUID), пишет одну JSON-строку на запрос (method, route, status, ms, role, без тела) и возвращает id в ответе; console.error в роутах заменить на logger.error({ reqId }).

*Верификатор:* routes.ts:33-35 отвечает ok без БД и без версии, логгера запросов и request-id в server нет. Отчасти это смягчает activate-release.sh:69-74: он отдельно проверяет через psql, что worker отработал задачи, то есть доступность БД при выпуске все же проверяется. Для разбора 500-х ответов журнала запросов нет.

#### N21. Три параллельных серверных архитектуры записи и чтения, переезд на командный слой не завершен

- Файл: `server/routes.ts:39`
- Категория: спагетти. Принцип: Единая архитектурная граница и ацикличность зависимостей (ADP); один способ делать одно и то же
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
server/routes.ts:39-57:
  const storage = new DatabaseStorage(database);
  app.use(createDocumentStatusRouter(authMiddleware, database));
  app.use(createMeRouter(storage, authMiddleware, database));
server/routeStores.ts:82: export type MeStore = Pick<StorageOperations, never>;
server/routes/me.ts:180: void storage; // явный ref на storage чтобы avoid unused import warning
server/repositories/recurringRepo.ts:16: import { generateOccurrence } from "../services/recurringCommands"; (а services/recurringCommands.ts импортирует RecurringScope из repositories/recurringRepo и invoiceRepo, получается цикл repo -> service -> repo)
Подсчет на HEAD: около 136 эндпоинтов. Через InvoiceCommands/PaymentCommands идут 14 (11 в invoices.ts, 3 partner-payments). 15 эндпоинтов в assistant.ts, documentStatus.ts (новый файл), me.ts и messages.ts пишут drizzle прямо в роутере (db.select/insert/execute). Остальные около 107 идут через фасад DatabaseStorage. invoices.ts вдобавок импортирует функции репозиториев напрямую (getClientBalances, getInvoiceListMetadata).
```

**Проблема.** Поверх старой схемы «роут -> storage -> repo» выросла вторая (роут -> *Commands -> repo с собственной транзакцией) и третья (роут -> сырой drizzle). Выбор пути определяется не правилом, а тем, чего касалось ревью. Новый роутер documentStatus написан в третьем стиле одновременно с вводом портов. Порт MeStore пустой, и его использование подавлено хаком void storage. Слои закольцованы: репозиторий вызывает сервис, сервис вызывает репозиторий. Утверждение документации «Каждый роут получает используемые операции через отдельный Pick» (docs/architecture-review-remediation.md:73) ложно для 5 из 15 роутеров.

**Чем грозит.** Следующий ИИ-агент, добавляя эндпоинт, выберет любой из трех путей. Рядом с аудируемым путем появятся неаудируемые записи и SQL в роутерах, ревью и тесты придется вести по трем моделям. Цикл repo<->service ломает возможность изолированно тестировать и переиспользовать recurringRepo.

**Что сделать.** Зафиксировать одну схему: роутер -> модуль приложения (commands для записи, queries для чтения) -> репозиторий, принимающий tx. Перенести generateOccurrence-оркестрацию (processAllDueRecurringInvoices, generateBackdatedInvoices, createDraftFromRecurring) из recurringRepo в services/recurringCommands, чтобы репозиторий ничего не импортировал из services. Вынести SQL из assistant.ts, documentStatus.ts, messages.ts и me.ts в queries-модули. Убрать параметр db из сигнатур роутеров и запретить импорт drizzle-orm и ../db в server/routes/** правилом eslint no-restricted-imports. Удалить MeStore и void storage.

*Верификатор:* Подтверждено: routes.ts:39-57 передает documentStatus/assistant/backup только database, me.ts:180 «void storage» при пустом MeStore (routeStores.ts:82), messages/me пишут drizzle напрямую, поэтому утверждение docs:73 про Pick для каждого роута ложно. Цикл слабее заявленного: recurringCommands.ts:5 берет RecurringScope через import type, и в рантайме цикла нет. Но инверсия слоев реальна: repo вызывает сервис, recurringRepo.ts:16/125/135.

#### N22. Третий слой: роуты с сырым SQL и прямым db мимо портов, плюс зависимость от порядка монтирования

- Файл: `server/routes.ts:44`
- Категория: спагетти. Принцип: Разделение слоев (controller не знает SQL), явная маршрутизация без скрытых зависимостей порядка
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
app.use(createDocumentStatusRouter(authMiddleware, database));
  app.use(createClientsRouter(storage, authMiddleware));
// server/routes/documentStatus.ts:11: for (const [route, closing] of [['/api/clients/acts-status', false], ['/api/closing-docs-status', true]] as const) {
// server/routes/clients.ts:48: clientsRouter.get("/api/clients/:id", ...
// server/routes/assistant.ts:10, messages.ts:21: createXRouter(..., db: typeof Database)
```

**Проблема.** Ремедиация ввела storagePorts и routeStores, но assistant.ts, documentStatus.ts и messages.ts получают db напрямую и собирают многоэтажные json_build_object-запросы прямо в контроллере. Получилось три стиля доступа к данным (фасад storage, сервисы-команды, сырой SQL в роуте). /api/clients/acts-status работает только потому, что documentStatus смонтирован раньше clients: стоит переставить строки в routes.ts, и запрос уйдет в /api/clients/:id с id 'acts-status', после чего упадет 500 на uuid. documentStatus.ts крутит цикл по двум маршрутам с тернарниками по ролям, сортировке и фильтру — это два разных ресурса, склеенные в один обработчик.

**Чем грозит.** Логику доступа (invoiceScope) и формулы придется искать в трех местах. Безобидный рефакторинг порядка роутеров ломает дашборд актов.

**Что сделать.** Вынести запросы в server/repositories/documentStatusRepo.ts, assistantStatsRepo.ts и messagesRepo.ts с явными функциями (actsStatus(actor, query), closingDocsStatus(actor, query), threads(actor)), а роуты оставить тонкими. Переименовать путь в /api/acts-status (или поставить ограничение /api/clients/:id(uuid-regex)), чтобы маршрутизация не зависела от порядка. Два обработчика documentStatus разнести.

*Верификатор:* Подтверждаю: documentStatus, assistant и messages получают db напрямую и собирают SQL в роуте (documentStatus.ts:9-56). /api/clients/acts-status перехватывается только потому, что router смонтирован раньше clients (routes.ts:44-45). Защиты uuid-параметра нигде нет, поэтому при перестановке getClient('acts-status') упадет в 500.

#### N23. Выплата бонусов ассистенту (деньги) осталась вне командного слоя: нет идемпотентности, аудита и валидации суммы, в новый порт вшит no-op

- Файл: `server/routes/acts.ts:24`
- Категория: атомарность. Принцип: Все денежные команды проходят одну транзакционную границу с аудитом
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
server/routes/acts.ts:26-29:
    const { amount, notes, invoiceIds } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const payment = await storage.createAssistantBonusPayment({ amount: amount.toString(), paymentDate: new Date().toISOString().split("T")[0], notes: notes || null, paidBy: req.user!.token.id });
    if (invoiceIds && invoiceIds.length > 0) await storage.markBonusesAsPaid(invoiceIds);
server/repositories/actsRepo.ts:173: export async function markBonusesAsPaid(_db: DB, _invoiceIds: string[]): Promise<void> {}
server/storagePorts.ts:328: markBonusesAsPaid(invoiceIds: string[]): Promise<void>;  server/routeStores.ts:103: | "markBonusesAsPaid"
```

**Проблема.** Платежи партнерам получили PaymentCommands с квитанцией, блокировкой и аудитом before/after. Выплата бонусов ассистенту, тоже движение денег, идет напрямую INSERT-ом через фасад: без Idempotency-Key (клиентский retrySafe-регэксп в src/lib/api.ts:26 ее не включает, сервер ключ игнорирует), без записи в assistant_action_logs, без проверки денежного формата (amount.toString() от произвольного JSON). Пустая функция markBonusesAsPaid при этом заново оформлена как часть «предметного интерфейса» DocumentsRepository.

**Чем грозит.** Двойной клик или повтор после обрыва создает две выплаты, и getUnpaidBonusTotal уменьшается вдвое. Восстановить, кто и когда выплатил, нельзя: в журнале нет записи. Новый слой создает ложное ощущение, что «финансовые команды закрыты».

**Что сделать.** Ввести BonusCommands.payout(actor, body) по образцу PaymentCommands: Zod-схема с positiveMoney и moneyString, квитанция в command_receipts, аудит в той же транзакции. Добавить /api/admin/bonus-payout в список повторяемых команд клиента. Удалить markBonusesAsPaid из actsRepo, storagePorts, storage.ts, routeStores и из тела запроса.

*Верификатор:* acts.ts:24-31: INSERT выплаты через storage.createAssistantBonusPayment без receipt, без assistant_action_logs и без денежной схемы (строка 'abc' проходит проверку amount<=0 и падает уже 500 на numeric). markBonusesAsPaid в actsRepo.ts:173 пустой. Риск снижают две вещи: эндпоинт только для admin, и клиент его автоматически не повторяет (api.ts:26), поэтому high завышено.

#### N24. POST /api/admin/bonus-payout: сумма из тела без схемы, без сверки, без транзакции, идемпотентности и аудита

- Файл: `server/routes/acts.ts:26`
- Категория: атомарность. Принцип: Единая граница денежной команды: валидация → блокировка → инвариант → запись + аудит в одной транзакции (как уже сделано в PaymentCommands)
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
const { amount, notes, invoiceIds } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const payment = await storage.createAssistantBonusPayment({ amount: amount.toString(), paymentDate: new Date().toISOString().split("T")[0], notes: notes || null, paidBy: req.user!.token.id });
    if (invoiceIds && invoiceIds.length > 0) await storage.markBonusesAsPaid(invoiceIds);
```

**Проблема.** amount не проходит zod: строка "abc" проходит проверку ("abc" <= 0 дает false) и падает 500 на numeric, а 1e20 переполняет numeric(15,2). Сумма не сверяется с unpaid, так что можно записать выплату больше долга. Повторный клик создаст вторую выплату: в отличие от PaymentCommands, здесь нет requestKey и command_receipts. Insert и markBonusesAsPaid идут без транзакции, причем второй вызов пустой. В журнал выплата не пишется, paid_by без FK, а paymentDate берется как UTC-дата, поэтому с 00:00 до 03:00 по Москве ставится вчерашнее число.

**Чем грозит.** Ошибка оператора или двойной клик дают незаметную переплату, а Math.max в расчете (см. предыдущую находку) ее сразу прячет. Восстановить, кто и когда выплатил, по журналу нельзя.

**Что сделать.** Создать server/services/bonusCommands.ts по образцу PaymentCommands: zod-схема {amount: positiveMoney, paymentDate: isoDate, notes} с датой в Europe/Moscow, транзакция, идемпотентность через commandReceipts, проверка amount ≤ баланса (или явный флаг allowOverpayment), tx.insert(assistantActionLogs) с типом 'bonus_payout'. Удалить markBonusesAsPaid из actsRepo, storage.ts:382, storagePorts.ts:328 и routeStores.ts:103, а invoiceIds убрать с фронта (AssistantBonusManager.tsx:87, 316). Добавить FK paid_by → access_tokens on delete set null.

*Верификатор:* Подтверждаю (acts.ts:26-29): amount без схемы, "abc" проходит проверку и падает 500 на numeric, нет сверки с unpaid, нет requestKey/command_receipts, транзакции и аудита, а дата берется по UTC через toISOString. Эндпоинт только для админа, на фронте кнопка блокируется на время запроса (isPending), так что для одного оператора это medium.

#### N25. Незавершенный переезд слоя данных: новые отчеты идут из роутов прямо в db, старые проходят четыре слоя пересылки

- Файл: `server/routes/assistant.ts:15`
- Категория: спагетти. Принцип: Одна архитектурная граница на слой (route = транспорт), отсутствие циклов зависимостей, KISS
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
routes/assistant.ts:15-18:
    const filter = and(invoiceScope(req.user!), eq(invoices.status, 'paid'),
      sql`${invoices.actualPaymentDate} >= ${`${year}-01-01`}::date AND ...`);
    try {
      const result = await db.execute<{ payload: unknown }>(sql`
routes/invoices.ts:2 `import { getClientBalances, getPartnerInvoiceSummary } from '../repositories/invoiceSummaryRepo';` + :18 `createInvoicesRouter(storage: InvoicesStore, authMiddleware, db: typeof Database, ...)`
Против: storage.ts:251-252 `async getPartnerDebtSummaries() { return dashboardRepo.getPartnerDebtSummaries(this.database); }` + storagePorts.ts:264-265 `getPartnerDebtSummaries(): ReturnType<typeof dashboardRepo.getPartnerDebtSummaries` + routeStores.ts:49 `| "getPartnerDebtSummaries"` + dashboardRepo.ts:4 реэкспорт
```

**Проблема.** У аналитики два несовместимых пути доступа. Старые отчеты идут роут -> StorageOperations-порт (ReturnType<typeof repo>) -> метод storage.ts -> фасад dashboardRepo -> репозиторий: пять мест правки на одну функцию. Новые агрегаты, написанные в ремедиации (assistant invoice-summary/invoice-groups на 40 строк json_build_object, partner-summary, client-balances), получают сырой db в роутер и обходят и storage, и порты, а SQL ассистента живет прямо в обработчике. Новые репозитории adminDashboardRepo.ts:5 и partnerDashboardRepo.ts:5 импортируют типы из '../storage', который сам импортирует эти репозитории, хотя storageTypes.ts уже есть.

**Чем грозит.** При следующем отчете разработчик выберет любой из двух путей, и тестовые подмены storage в HTTP-тестах перестанут покрывать часть эндпоинтов. Для системы на десяток пользователей четыре слоя пересылки — чистые накладные расходы.

**Что сделать.** Выбрать один путь: роутер получает узкий AnalyticsQueries = { adminDashboard, partnerDebt, clientBudget, ... } (объект функций, замкнутых на db), без методов-прокладок в storage.ts и без ReturnType-портов. Перенести SQL из routes/assistant.ts в repositories/assistantSummaryRepo.ts. Удалить фасад dashboardRepo.ts. Типы read-model'ей импортировать из storageTypes.ts (позже shared/analytics/*.ts), запретить импорт '../storage' из repositories правилом no-restricted-imports.

*Верификатор:* Подтверждаю. В assistant.ts:15-30 SQL лежит прямо в обработчике и обращается к сырому db. invoices.ts:2,18 импортирует репозиторий напрямую и получает db. При этом getPartnerDebtSummaries проходит через storage.ts:251-252, storagePorts.ts:264-265, routeStores.ts:49 и фасад dashboardRepo.ts:4. Импорт типов из '../storage' работает через `export type * from './storageTypes'` (storage.ts:6): цикл только типовой, на рантайм не влияет.

#### N26. Три пути восстановления с разной защитой: HTTP in-place в живом процессе не сбрасывает аренды и воскрешает outbox

- Файл: `server/routes/backup.ts:34`
- Категория: атомарность. Принцип: Один путь для опасной операции; служебное состояние процессов не является данными предметной области
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
routes/backup.ts:34-37 `backupRouter.post("/api/backups/:id/restore", ... const result = await backupService.restoreBackup(backupId);`
backupCli.ts:14 `command === 'restore' && process.env.FINANCE_RESTORE_MAINTENANCE === '1'` (второй in-place путь)
deploy/restore-backup.sh:50 `UPDATE scheduled_jobs SET lease_token=NULL, lease_until=NULL, state='idle' WHERE state='running'` (только в shell-пути)
backupTables.ts:13-18 `loginRateLimits`, `userSessions`, `notificationOutbox`, `commandReceipts`, `scheduledJobs` входят в архив как данные
```

**Проблема.** Документация называет безопасным путем restore-backup.sh: shadow-БД, сверка, остановка web и worker, сброс аренд. При этом HTTP-эндпоинт и CLI `restore` по-прежнему стирают и перезаливают живую БД, пока worker работает. Сброс аренд scheduled_jobs есть только в shell. Архив, созданный задачей manual-backup, содержит строку этой же задачи в state='running', поэтому после HTTP-restore статус копии показывает «выполняется», и задача запускается заново. Недоставленные строки notification_outbox из старого снимка снова уходят клиентам в Telegram. Служебные таблицы восстанавливаются как бизнес-данные.

**Чем грозит.** Админ нажимает «Восстановить» в UI и получает путь без тех гарантий, которые описаны в docs. Клиенты получают повторные уведомления. Любую новую защиту приходится добавлять в два-три места, и она легко расходится (уже разошлась).

**Что сделать.** Убрать in-place restore из HTTP: эндпоинт ставит задачу restore в scheduled_jobs или возвращает инструкцию для restore-backup.sh. В BackupService.restoreArchive в одном месте задать политику для служебных таблиц: scheduled_jobs сбрасывать в idle без аренды, outbox помечать delivered или не восстанавливать, login_rate_limits и user_sessions не восстанавливать. После этого удалить ручной UPDATE из shell.

*Верификатор:* routes/backup.ts:34-37 вызывается из BackupManager.tsx и делает in-place restore в живой БД при работающем worker. Сброс аренд scheduled_jobs есть только в restore-backup.sh:50, поэтому после HTTP-restore manual- или daily-backup из снимка снова в state='running' с прошедшим nextRunAt. Строки notification_outbox с deliveredAt=null воскресают во всех путях, включая shell.

#### N27. Три пути восстановления с разными гарантиями; in-place restore в web-процессе остался в UI без maintenance lock

- Файл: `server/routes/backup.ts:34`
- Категория: поддерживаемость. Принцип: Одна процедура для критичной операции; согласованность документации и кода
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
server/routes/backup.ts:34-37:
backupRouter.post("/api/backups/:id/restore", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const result = await backupService.restoreBackup(backupId);
server/backupService.ts:239-242: await this.createBackup('manual'); затем LOCK TABLE ... IN ACCESS EXCLUSIVE MODE на все 22 таблицы внутри HTTP-запроса.
server/backupCli.ts: ветка command === 'restore' && process.env.FINANCE_RESTORE_MAINTENANCE === '1' (in-place).
deploy/restore-backup.sh: shadow DB + verify + swap-databases.sql + flock /var/lock/finance-duck-maintenance.lock.
src/components/admin/BackupManager.tsx:81: return apiPost(`/backups/${encodeURIComponent(backupId)}/restore`);
```

**Проблема.** Восстановление выполняется тремя способами: из UI прямо в живую БД внутри web-процесса (защитный полный бэкап и restore синхронно в HTTP-запросе, под эксклюзивной блокировкой всех таблиц при живом трафике и работающем worker), CLI in-place и shell-скриптом через shadow-БД со сверкой. Документация утверждает «Restore и deploy используют общий maintenance lock» (architecture-review-remediation.md:137), но это верно только для shell-пути. Она же говорит, что тяжелые операции вынесены из web, однако restore в web остался.

**Чем грозит.** Владелица в UI выберет кнопку, а не скрипт. При росте архива запрос упрется в таймаут nginx, пока restore продолжается. Его нельзя сериализовать с деплоем, и он не сверяет результат, в отличие от shadow-пути. Поддерживать нужно три кода восстановления.

**Что сделать.** Удалить POST /api/backups/:id/restore и CLI in-place restore. Оставить один путь: restore-backup.sh (shadow, сверка, rename) под общим lock. В UI вместо кнопки показывать готовую команду для выбранного файла или ставить запрос restore_requests, который исполняет root-скрипт по systemd-path. Исправить документацию.

*Верификатор:* UI-путь BackupManager.tsx:81 → backup.ts:34-37 → backupService.ts:208/239 в web-процессе делает защитный бэкап и LOCK ACCESS EXCLUSIVE на все таблицы, без flock и без shadow-сверки. CLI-путь в backupCli.ts:14 есть, общий lock только у restore-backup.sh и activate-release.sh:5, поэтому docs:137 вводит в заблуждение. Восстановление транзакционное и с предварительной валидацией, так что данные не бьются: проблема в доступности и расхождении гарантий, отсюда medium.

#### N28. Тест Telegram всегда отвечает «ok»: эндпоинт проверки использует версию отправки, которая глотает ошибки

- Файл: `server/routes/clients.ts:127`
- Категория: поддерживаемость. Принцип: Проверочный инструмент обязан отражать реальный результат; один канал отправки
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
clients.ts:114 `const { resolveTelegramTarget, sendTelegramMessage, escapeHtml } = await import("../lib/telegram");`
clients.ts:127-128 `await sendTelegramMessage(target, html);
    res.json({ ok: true });`
telegram.ts:41-42 `try { await sendTelegramMessageStrict(target, text, options); }
  catch { console.error("[telegram] sendMessage failed"); }`
```

**Проблема.** POST /api/clients/:id/telegram-test нужен для того, чтобы админ проверил токен бота и chat_id клиента. Он вызывает sendTelegramMessage, а эта функция никогда не бросает исключение, поэтому при неверном токене, бане бота, недоступном CF-прокси или таймауте эндпоинт возвращает `{ ok: true }`. Строгая версия sendTelegramMessageStrict появилась в этих же исправлениях, но в тест ее не подключили. Две функции отправки сосуществуют, потому что messages.ts тоже не переведен на outbox.

**Чем грозит.** При многоботовой модели «свой бот у каждого клиента» админ считает интеграцию рабочей, а уведомления в outbox бесконечно откладываются. Ошибку никто не видит (см. находку про outbox без terminal-состояния).

**Что сделать.** В telegram-test вызывать sendTelegramMessageStrict и возвращать 502 с безопасным описанием ошибки Telegram (status, description без токена). Перевести messages.ts:257-288 на insert в notification_outbox в транзакции создания сообщения и удалить нестрогую sendTelegramMessage.

*Верификатор:* clients.ts:127-128 вызывает sendTelegramMessage, которая глотает любые ошибки (telegram.ts:41-42), и всегда отвечает {ok:true}. Эндпоинт проверки настроек TG врет при неверном токене, бане бота или недоступном прокси.

#### N29. Чтение для дашбордов размазано по трем слоям: SQL в роутерах, репозиторий в обход storage и фасад storage

- Файл: `server/routes/documentStatus.ts:1`
- Категория: спагетти. Принцип: Layered architecture / незавершенный переезд
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
1) server/routes/documentStatus.ts:19-33: const matched = sql`SELECT ${invoices.id} AS id, ... ` и db.execute прямо в обработчике маршрута;
2) server/routes/assistant.ts:18: const result = await db.execute<{ payload: unknown }>(sql` WITH matched AS (...
3) server/routes/invoices.ts:2, 44: import { getClientBalances, getPartnerInvoiceSummary } from '../repositories/invoiceSummaryRepo'; ... res.json(await getClientBalances(db, req.user!, parsed.data));
4) server/routes/partners.ts:295 и server/routes/dashboard.ts:73: res.json(await storage.getPartnerHeroMetrics(partnerId)); / res.json(await storage.getAlertCounts(req.user!));
```

**Проблема.** Одновременно с введением storagePorts/routeStores новые read-модели дашбордов написаны мимо них: часть как сырой SQL с json_build_object прямо в роутере (документы, ассистент), часть через репозиторий с явной передачей db (балансы, partner-summary), а старые метрики идут через God-фасад storage. Правила, где живет запрос и как он тестируется, нет; роутеры documentStatus и assistant получают db напрямую и не мокируются портами.

**Чем грозит.** Следующая метрика будет добавлена в четвертое место; изменение скоупа роли или схемы таблицы требует обхода роутеров, репозиториев и storage вручную, а unit-тесты роутеров без Postgres для новых маршрутов невозможны.

**Что сделать.** Ввести один модуль server/readModels/dashboards.ts (или репозиторий dashboardReadRepo) с функциями getDocumentStatus, getAssistantSummary, getClientBalances, getPartnerSummary(actor, params), принимающими DBorTx; роутеры только парсят вход и вызывают их через порт DashboardReadPort в routeStores; сырой SQL из server/routes/*.ts вынести туда же.

*Верификатор:* Подтверждено: SQL с json_build_object написан прямо в роутере (documentStatus.ts:19-33, assistant.ts:18). Репозиторий вызывается в обход портов с явной передачей db (invoices.ts:2,44), а старые метрики идут через storage (dashboard.ts:73, partners.ts:295). Три стиля чтения при только что введенных storagePorts.

#### N30. Двойная граница route+service: авторизация, фильтр полей и валидация выполняются дважды

- Файл: `server/routes/invoices.ts:97`
- Категория: спагетти. Принцип: Single Responsibility; одна граница доверия
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/routes/invoices.ts:97-109:
    const existing = await findAuthorizedInvoice(storage, actor, id);
    ...
    const vErr = validateBody(invoiceMoneySchema, req.body);
    ...
    const invoiceData = constrainInvoiceWrite(role, pick(req.body, INVOICE_WRITABLE_FIELDS), "update");
    const invoice = await invoiceCommands.update(commandActor(req), id, invoiceData, calculations || {});
и затем server/services/invoiceCommands.ts:28 `if (!['admin', 'assistant', 'accountant'].includes(actor.role))`, :36 `await repo.getInvoice(tx, id, actor.role, ...)`, :84-89 `parseCommand(invoiceTerms.partial(), input)` + повторный `constrainInvoiceWrite(actor.role, terms, 'update')`; после команды route снова читает счет (invoices.ts:111). Идентичный блок `if ((error instanceof CommandError || error instanceof MoneyRangeError))` повторен в 15 обработчиках.
```

**Проблема.** Переезд в командный слой остановился на полпути: маршрут сохранил всю старую обвязку (requireRole, findAuthorizedInvoice, validateBody, pick, constrainInvoiceWrite), а сервис добавил свою такую же. Один PATCH читает счет с четырьмя JOIN четыре раза (route, authorize, before, full, плюс повтор в route), фильтр hideFromAssistant применяется дважды. Непонятно, какой слой — настоящая граница безопасности.

**Чем грозит.** При следующем изменении правил доступа или полей их придется менять в двух местах. Рано или поздно слои разойдутся, и маршрут без команды (как closing-document или recurring) окажется с другими правилами.

**Что сделать.** Маршрут сводится к схеме: commandActor(req) → invoiceCommands.X(actor, req.params, req.body) → projection(result, role). Сервис единолично делает parseCommand, авторизацию, constrainInvoiceWrite и возвращает уже готовый DTO с calculations, чтобы маршрут не перечитывал счет. Ошибки CommandError и MoneyRangeError маппить одним express error-middleware, а requireRole оставить только как дешевый ранний отсев.

*Верификатор:* Подтверждено: PATCH (routes/invoices.ts:97-111) делает findAuthorizedInvoice, validateBody, pick и constrainInvoiceWrite, затем сервис повторяет проверку роли (invoiceCommands.ts:28), getInvoice в authorize (:36), parseCommand и constrainInvoiceWrite (:84-89), а после команды роут снова читает счет. Одинаковый catch с CommandError || MoneyRangeError повторен 14 раз в invoices.ts и 3 раза в partners.ts.

#### N31. Шаблоны периодики меняются в обход командного слоя: без аудита, транзакции и с жестким удалением

- Файл: `server/routes/recurring.ts:75`
- Категория: атомарность. Принцип: Единая прикладная граница для денежных мутаций; «ничего не стирать»
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/routes/recurring.ts:75 `const updated = await storage.updateRecurringInvoice(id, data, scopeFor(req));`
server/routes/recurring.ts:25 `const created = await storage.createRecurringInvoice({ ...data, ... createdBy: req.user!.token.id });`
server/repositories/recurringRepo.ts:119-121:
  export async function deleteRecurringInvoice(db: DB, id: string): Promise<void> {
    await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
  }
При этом генерация из шаблона (recurringCommands.ts:56-60) аудит пишет.
```

**Проблема.** Шаблон автоматически выпускает денежные документы, но ассистент может поменять amount, scheme, partnerCommissionRate и nextInvoiceDate без записи в assistant_action_logs и без идемпотентности. Админ удаляет шаблон физически и без следа. Проверка endDate < startDate идет в маршруте по прочитанному ранее existing, вне транзакции с UPDATE. Catch-блоки create, PATCH и delete не маппят CommandError, поэтому ожидаемые отказы превращаются в 500.

**Чем грозит.** Изменение условий, по которым через месяц будет выставлен счет, нельзя восстановить по журналу, а удаленный шаблон теряет историю, откуда взялись его счета (recurring_invoice_id).

**Что сделать.** Создать RecurringCommands с тем же run(actor, ...) (транзакция, FOR UPDATE шаблона, аудит с before/after, квитанция), перевести на него create, update и delete. Удаление заменить на isActive=false + archivedAt, а проверку дат делать внутри транзакции по заблокированной строке.

*Верификатор:* Подтверждено: create, PATCH и delete шаблона (recurring.ts:25,75,85; recurringRepo.ts:119-121) идут без транзакции и без записи в assistant_action_logs, удаление физическое. Проверка endDate по existing выполняется вне транзакции UPDATE. Тезис про CommandError слабее заявленного, потому что эти функции его и не бросают: отказы БД, например FK, все равно уходят в 500.

#### N32. ACCESS_CODE_SECRET разводится на ключи в трех модулях с противоположной политикой при отсутствии секрета

- Файл: `server/services/backupArchive.ts:40`
- Категория: безопасность. Принцип: Единая точка загрузки секретов; fail-closed; DRY
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
// server/services/backupArchive.ts:40-42
const secret = process.env.ACCESS_CODE_SECRET ?? '';
if (secret.length < 16 && process.env.NODE_ENV === 'production') throw new Error('Encrypted backups require ACCESS_CODE_SECRET');
return secret.length >= 16 ? createHash('sha256').update(secret + ':backup-stream-v1').digest() : null;
// server/lib/accessCode.ts:20-21 — fail-open
const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const accessCodeCryptoEnabled = SECRET.length >= 16;
// server/lib/backupCrypto.ts:17-19 — fail-open ("Graceful degradation: нет секрета → шифрование выключено")
// .env.example:19 «минимум 32 символа»; docs/architecture-review-remediation.md:43 «В production обязателен ACCESS_CODE_SECRET»
```

**Проблема.** Один секрет читается из process.env и превращается в ключ через sha256(secret+метка) в трех местах: accessCode.ts:24-25, backupCrypto.ts:19 и backupArchive.ts:42. Политика у них разная. Без секрета веб-сервер в проде стартует и пишет коды открытым текстом, а ежедневный бэкап падает исключением. Порог длины 16 в коде расходится с 32 в .env.example, а документация обещает обязательность секрета, которой для кодов нет. Ротация секрета одновременно ломает codeEnc, HMAC-поиск и чтение всех архивов, версии ключа нет нигде.

**Чем грозит.** Оператор без секрета получает работающий вход с открытыми кодами и молча падающие бэкапы. Следующая криптографическая фича добавит четвертую копию с собственной политикой.

**Что сделать.** Завести server/lib/secrets.ts с функцией `loadSecrets(): { accessHmac, accessAes, backup }`, которая вызывается один раз в composition root (app.ts/worker.ts). При NODE_ENV=production и длине секрета меньше 32 она бросает ошибку. Ключи выводить через crypto.hkdfSync(secret, salt, 'fd/access-hmac/v1' | 'fd/access-aes/v1' | 'fd/backup/v1', 32). accessCode.ts, backupCrypto.ts и backupArchive.ts получают ключи параметром и сами не читают process.env.

*Верификатор:* Расхождение подтверждено: accessCode.ts:20-21 работает fail-open, а backupArchive.ts:40-42 в проде fail-closed. Оба модуля выводят ключ через sha256(secret+метка), версии ключа нет, а в .env.example:19 стоит «32» против 16 в коде. Оговорка: backupCrypto.ts теперь используется только для чтения старых архивов (импортируется лишь decryptBackup в backupService.ts:6), так что живых политик на запись две, а не три. Во многом это повтор F4.

#### N33. В архив входят служебные таблицы состояния, и каждый путь восстановления по-своему их «чинит»

- Файл: `server/services/backupTables.ts:15`
- Категория: модель данных. Принцип: Разделение бизнес-данных и операционного состояния; одна процедура postRestore
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/services/backupTables.ts:15-20:
  assistantActionLogs: schema.assistantActionLogs, loginRateLimits: schema.loginRateLimits,
  userSessions: schema.userSessions,
  notificationOutbox: schema.notificationOutbox,
  commandReceipts: schema.commandReceipts,
  scheduledJobs: schema.scheduledJobs,
server/backupService.ts:216 (сессии revoked в JSON-пути), :254 (то же в .fdb-пути); deploy/restore-backup.sh:50: UPDATE scheduled_jobs SET lease_token=NULL, lease_until=NULL, state='idle' WHERE state='running' (только в shell-пути, в HTTP-restore этого нет); backupService.ts:45: legacy && key === "scheduledJobs" ? [] ...; docs/backup-and-capacity.md:36 признает повторные уведомления из восстановленного outbox.
```

**Проблема.** В бизнес-снимок попадают сессии, лимиты логина, квитанции, outbox и аренды заданий. Состояние процессов на момент снимка не имеет смысла после восстановления. Бэкап, созданный самим заданием manual-backup или daily-backup, всегда содержит строку этого задания в state='running' с чужой арендой. Поправки размазаны по трем местам, и пути восстановления расходятся. Недоставленные события outbox после restore повторно уходят клиентам в Telegram.

**Чем грозит.** Клиенты получают устаревшие уведомления «Новый счет»/«Оплата получена» после восстановления. Каждую новую служебную таблицу придется помнить специально обработать во всех путях restore.

**Что сделать.** Разделить backupTables на businessTables и operationalTables. Операционные не писать в архив (или писать только для диагностики) и после восстановления инициализировать заново: сессии пусты, outbox пометить delivered_at=now() или очистить, scheduled_jobs пересоздать из реестра worker. Все это сделать одной функцией resetOperationalState(tx), которую вызывают все пути restore.

*Верификатор:* backupTables.ts:13-19 включает сессии, лимиты, outbox, receipts и scheduledJobs. HTTP/CLI-restore (backupService.ts:208-221, 237-257) только отзывает сессии и не сбрасывает running-аренды, это делает лишь restore-backup.sh:50. Неотправленный outbox после restore снова уйдет в Telegram, docs/backup-and-capacity.md:36 это признает. Зависшая аренда сама истечет через LEASE_MS (jobRunner.ts:26), так что задания не заклинит навсегда.

#### N34. Идемпотентность переусложнена и продублирована, квитанции растут бесконечно

- Файл: `server/services/invoiceCommands.ts:43`
- Категория: избыточность. Принцип: KISS/YAGNI; минимизация хранимых персональных данных
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/services/invoiceCommands.ts:47-51:
          const cached = receipt.result ? JSON.parse(receipt.result) : null;
          const envelope = cached?.receiptVersion === 1;
          const ids: string[] = envelope ? cached.invoiceIds : typeof targets === 'function' ? await targets(tx) : targets;
          const legacyFingerprint = createHash('sha256').update(JSON.stringify({ action, ids, input })).digest('hex');
server/services/paymentCommands.ts:33-41 — вторая реализация с другим ключом `${actor.tokenId}:payment:${...}` и без envelope;
drizzle/0002_financial_integrity.sql:1-6 — command_receipts без TTL; удаления квитанций в коде нет (grep), при этом они входят в бэкап (server/services/backupTables.ts:17).
```

**Проблема.** Для системы на десяток пользователей механизм повтора команд уже обзавелся версиями формата (receiptVersion), совместимостью с legacy-отпечатком для квитанций, проживших несколько дней, и особым случаем повтора для delete_invoice. Логика скопирована в PaymentCommands с другим форматом. В result хранится полный JSON сущности (счет с clientTitle, notes) без срока жизни, то есть персональные данные копятся в служебной таблице и в бэкапах.

**Чем грозит.** Каждая новая команда должна понимать три формата квитанций. Таблица растет линейно с числом операций, а данные клиента остаются в квитанциях и после правки или удаления самих сущностей, что неудобно для ФЗ-152.

**Что сделать.** Вынести один хелпер withReceipt(tx, scope, key, fingerprint, run) в server/services/commandReceipt.ts и использовать его в InvoiceCommands и PaymentCommands. В result хранить только {entityIds, status}, при повторе перечитывать сущность с текущей авторизацией. Убрать legacyFingerprint и receiptVersion, добавить created_at TTL 24 часа и очистку в существующем hourly-задании worker.ts.

*Верификатор:* Подтверждено: receiptVersion и legacyFingerprint есть в invoiceCommands.ts:47-51, вторая реализация с другим форматом в paymentCommands.ts:33-41. command_receipts без TTL и без кода очистки (grep), таблица входит в бэкап (backupTables.ts:17). В result лежит полный счет с clientTitle и notes.

#### N35. Механизм идемпотентности и аудита скопирован в двух классах, плюс еще два пути аудита; совместимость с квитанциями, прожившими 22 минуты

- Файл: `server/services/invoiceCommands.ts:50`
- Категория: DRY. Принцип: DRY; минимальная совместимость (YAGNI); управляемый срок хранения служебных данных
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/services/invoiceCommands.ts:50-51:
          const legacyFingerprint = createHash('sha256').update(JSON.stringify({ action, ids, input })).digest('hex');
          if (receipt.fingerprint !== fingerprint && receipt.fingerprint !== legacyFingerprint) throw new CommandError('Idempotency key already used for another command');
server/services/paymentCommands.ts:37-39 повторяет ту же схему: insert(commandReceipts).onConflictDoNothing(), затем select ... for('update') и сравнение fingerprint.
Аудит пишется 4 способами: tx.insert(assistantActionLogs) в invoiceCommands.ts:61, paymentCommands.ts:46 и recurringCommands.ts:55; storage.logAssistantAction после коммита в clients.ts:81, partners.ts:78 и acts.ts:118. command_receipts нигде не очищается (grep: только insert/select/update), при этом входит в backupTables.
git log: квитанции появились в 404a90e (17.10 20:23), envelope receiptVersion и legacyFingerprint добавлены в f9b2dc4 (20:45).
```

**Проблема.** Ядро «квитанция, отпечаток, повтор, аудит» существует в двух почти одинаковых копиях с уже расходящимися правилами: replay в InvoiceCommands перепроверяет доступ, в PaymentCommands нет; формат результата у них разный. Слой совместимости legacyFingerprint/receiptVersion поддерживает формат, который жил 22 минуты. Таблица квитанций с полными JSON-результатами финансовых команд растет бессрочно и попадает в каждый бэкап.

**Чем грозит.** Исправление в одной копии (например, перепроверка доступа или длина ключа) не попадет в другую. Третий командный класс скопирует одну из двух версий. Таблица и бэкапы растут за счет данных, которые нужны только минуты.

**Что сделать.** Вынести общий helper withCommandReceipt(tx, { namespace, key, fingerprint, onReplay }) и AuditWriter.write(tx, entry) в services/commandKernel.ts. InvoiceCommands, PaymentCommands и recurringCommands используют только их, а роуты clients, partners и acts переводятся на тот же AuditWriter внутри транзакции записи. Удалить legacyFingerprint и разбор без envelope. Добавить задачу worker, удаляющую квитанции старше 7 дней, и исключить command_receipts из архива.

*Верификатор:* Две копии механизма квитанций подтверждены: invoiceCommands.ts:43-56 с legacyFingerprint/receiptVersion (появились в f9b2dc4 через 22 минуты после 404a90e) и paymentCommands.ts:36-40. Таблицу commandReceipts вне этих классов упоминает только backupTables.ts:17, очистки нет. Аудит после коммита идет через storage.logAssistantAction (clients.ts:81, partners.ts:78, acts.ts:118). Отсутствие перепроверки доступа при replay в PaymentCommands не дефект: run() до replay требует role admin (строка 31).

#### N36. Для одного оператора все молчит и ничего не чистится: ошибки заданий не видны, OnFailure не существует, релизы, дампы и retained-БД копятся

- Файл: `server/services/jobRunner.ts:43`
- Категория: поддерживаемость. Принцип: Операционная простота для одного владельца: сбой должен быть громким, рост ресурсов ограниченным, конфигурация вне версии кода
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/services/jobRunner.ts:43-47:
      await this.database.update(scheduledJobs).set({ state: 'failed', leaseToken: null, leaseUntil: null,
        lastError: (error instanceof Error ? error.message : 'Job failed').slice(0, 1000),
      ...
      console.error('[jobs] Retry scheduled', job.key);
server/backupService.ts:99: читается только key 'manual-backup'; daily-backup и recurring-invoices в UI не видны.
deploy/README.md:117: «Алерт о падении: systemd OnFailure -> Telegram», но в deploy/finance-duck.service и deploy/finance-duck-worker.service нет OnFailure=, а activate-release.sh:58 перезаписывает unit worker из репозитория.
activate-release.sh и restore-backup.sh создают /opt/finance-duck-releases/*, полный pg_dump и tar объектов на каждый релиз и restore, а также БД finance_retained_* и finance_failed_*; удаления нет нигде (grep rm/prune пуст). .env копируется внутрь каждого релиза (deploy.sh:17), activate-app-domain.sh:11 правит /opt/finance-duck/.env текущего релиза.
```

**Проблема.** Надежная очередь заданий записывает ошибку в БД, которую никто не читает. Упавший ежедневный бэкап заметен только по отсутствию файла. Заявленный в README алерт в unit-файлах отсутствует. Каждый выпуск и каждое восстановление оставляют на 40-гигабайтном VDS node_modules, полный дамп и архив объектов. Конфигурация живет внутри каталога релиза: откат symlink возвращает устаревший .env.

**Чем грозит.** Тихая остановка бэкапов или генерации периодических счетов обнаружится через недели. Диск заполнится артефактами деплоя, и упадет сама БД. Откат релиза может вернуть старые CORS, домен или секреты.

**Что сделать.** В catch JobRunner ставить событие в outbox на админ-чат (TG_ALERT_CHAT_ID) при первом и каждом N-м сбое. Добавить в UI админа панель scheduled_jobs (state, lastError, lastFinishedAt). Добавить OnFailure=finance-duck-alert@%n.service в оба unit-файла репозитория. Перенести .env в /etc/finance-duck/env и указывать EnvironmentFile на него. В activate-release.sh хранить последние 3 релиза и дампы, retained-БД старше 14 дней перечислять в отчете для ручного удаления (данные не удаляются автоматически).

*Верификатор:* OnFailure нет ни в одном файле репозитория, кроме README.md:117. activate-release.sh:57 перезаписывает unit worker из репо. lastError из jobRunner.ts:44 читает только backupService.ts:99 для manual-backup. В deploy/*.sh нет удаления релизов, дампов и finance_retained_*. deploy.sh:17 копирует .env в каталог релиза, поэтому откат symlink возвращает старый .env. Оговорка: drop-in на самом сервере по репозиторию не проверить.

#### N37. Граница команды написана трижды по-разному, у аудита две семантики, репозиторий импортирует сервис

- Файл: `server/services/paymentCommands.ts:33`
- Категория: DRY. Принцип: DRY, однонаправленные зависимости слоев (routes → services → repositories)
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
return this.database.transaction(async tx => {
      const key = actor.requestKey ? `${actor.tokenId}:payment:${actor.requestKey}` : undefined;
      if (key && key.length > 256) throw new CommandError('Invalid idempotency key', 400);
      const fingerprint = createHash('sha256').update(JSON.stringify({ command, input })).digest('hex');
// копия: invoiceCommands.ts:29-67; третий вариант без квитанций: recurringCommands.ts:56 await tx.insert(assistantActionLogs).values({
// recurringRepo.ts:16 import { generateOccurrence } from "../services/recurringCommands";
```

**Проблема.** Квитанции идемпотентности, fingerprint, запись аудита и outbox вручную реализованы в InvoiceCommands.run и PaymentCommands.run (почти построчная копия, но с разными префиксами ключей и форматами результата: receiptVersion-конверт против голого JSON). В recurringCommands.generateOccurrence есть третий вариант, без квитанций. Все три вставляют в assistantActionLogs напрямую через tx.insert, а легаси-роуты (clients/partners/acts) идут через actionLogRepo.logAssistantAction, где склеиваются update_invoice за 10 секунд. Получается, что одно событие журналируется по-разному в зависимости от пути. Плюс слои перевернуты: recurringRepo (репозиторий) импортирует services/recurringCommands, а тот, в свою очередь, invoiceRepo.

**Чем грозит.** Правку протокола идемпотентности или формата аудита (например, санитизацию details) придется делать в трех местах, и рассинхрон уже заложен. Цикл repo→service→repo делает порядок инициализации и тестовые моки хрупкими.

**Что сделать.** Вынести services/commandBoundary.ts: runCommand(db, actor, { action, namespace, input, targets }, execute) → квитанция + authorize-hook + audit(tx, entry) + outbox(tx, event). InvoiceCommands, PaymentCommands и generateOccurrence сделать тонкими обертками над ней. Запись аудита оставить единственной функцией actionLogRepo.append(tx, entry) без 10-секундного склеивания (склейку при необходимости делать при чтении). Вызовы generateOccurrence перенести из recurringRepo в RecurringCommands, оставив в репозитории только SQL.

*Верификатор:* Подтверждаю: квитанции и fingerprint вручную продублированы в invoiceCommands.ts:29-67 и paymentCommands.ts:29-54, у них разные префиксы ключей и формат результата (receiptVersion против голого JSON). recurringCommands.ts:56 пишет аудит без квитанции, а recurringRepo.ts:16 импортирует services/recurringCommands. Уточнение: склейку update_invoice в actionLogRepo.ts:23 теперь никто не вызывает, потому что update_invoice логируется только из InvoiceCommands, так что это мертвый код, а не двойная семантика на живом пути.

#### N38. Два механизма аудита: команды пишут журнал в транзакции, роуты партнеров/клиентов/актов — после мутации вне ее

- Файл: `server/services/paymentCommands.ts:46`
- Категория: атомарность. Принцип: Один механизм для одной ответственности; аудит в той же транзакции, что и изменение
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
await tx.insert(assistantActionLogs).values({ accessTokenId: actor.tokenId, actionType: 'other',
        entityType: 'partner_payment', entityId: payment.id,
// server/services/invoiceCommands.ts:62: await tx.insert(assistantActionLogs).values({
// server/routes/clients.ts:79-81: setClientPartners(...) затем storage.logAssistantAction(...) — вне транзакции
// server/repositories/actionLogRepo.ts:23: if (log.actionType === 'update_invoice' ...) — ветка больше не достижима
```

**Проблема.** После ремедиации журнал пишут два разных писателя с разными гарантиями. InvoiceCommands, PaymentCommands и recurringCommands вставляют запись прямо в транзакции, а clients, partners и acts вызывают storage.logAssistantAction после коммита мутации. В POST /api/clients сбой лога дает 500 уже после создания клиента, и повтор создает дубль. Логика схлопывания в logAssistantAction стала недостижимой, но осталась. Платежи пишутся с типом 'other', поэтому фильтр журнала по типу их не находит, а enum типов действий объявлен дважды: pgEnum в schema.ts:352 и ручной union AssistantActionType в schema.ts:435.

**Чем грозит.** Журнал неполон и непредсказуем: набор гарантий зависит от того, через какой слой прошла операция. Каждое новое изменение будут копировать с произвольного из двух образцов.

**Что сделать.** Ввести server/services/audit.ts с функцией recordAudit(tx, actor, {type, entity, description, details}), которую вызывают все команды. Перевести create/update client и partner и upload/delete act в маленькие команды с транзакцией, а logAssistantAction вместе с ветками схлопывания удалить. Добавить в enum значения partner_payment_record/correct/cancel, bonus_payout и access_token_issue/revoke, а TS-тип выводить из enumValues, а не держать вручную.

*Верификатор:* Ядро подтверждаю: команды пишут журнал через tx.insert (paymentCommands.ts:46, invoiceCommands.ts:62, recurringCommands.ts:56), а роуты — после мутации (clients.ts:79-81), enum объявлен дважды (schema.ts:352 и 435). Неверно утверждение про фильтр по типу: в журнале его нет вовсе (storageTypes.ts:14-20 — только role и даты), так что 'other' ничего не прячет. Находка частично повторяет F40, F76 и F77.

#### N39. Фасад сохранил полный неохраняемый API мутаций параллельно InvoiceCommands, а массовый пересчет уже идет мимо командного слоя

- Файл: `server/storage.ts:77`
- Категория: спагетти. Принцип: Single point of mutation / Tell-don't-ask: у агрегата одна точка входа для изменений
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.createInvoice(this.database, invoice, calculations); }
  async updateInvoice(id: string, invoice: Partial<InsertInvoice>, calculations?: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoice(this.database, id, invoice, calculations); }
  async updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoiceCalculations(this.database, invoiceId, calculations); }
// также storage.ts:83-89 (expense/transfer/deleteInvoice), storagePorts.ts:127-156 (порт InvoiceRepository), dashboard.ts:236-238: const result = await storage.recalculateAllInvoices();
```

**Проблема.** Переезд на командный слой не доведен. Все мутации счета (create/update/updateInvoiceCalculations/deleteInvoice/createInvoiceExpense/createInvoiceTransfer/...) остались публичными методами DatabaseStorage и объявлены в порте InvoiceRepository. В проде их сейчас никто не зовет, но любому роутеру достаточно добавить имя в свой Pick в routeStores.ts, и мутация пройдет без авторизации по actor, без блокировки, аудита, outbox и квитанции идемпотентности. Один такой путь уже есть: POST /api/admin/recalculate-invoices вызывает recalculateAllInvoices, который в цикле переписывает проекции всех счетов отдельными транзакциями, не оставляя записи в журнале действий.

**Чем грозит.** Следующий ИИ-агент пойдет по пути наименьшего сопротивления (storage.updateInvoice уже типизирован и доступен) и тихо вернет неатомарность и неаудируемость, которые исправлял F72. Массовый пересчет денег сейчас вообще не оставляет следа в журнале.

**Что сделать.** Удалить из DatabaseStorage и из InvoiceRepository все мутирующие методы счета, оставить только чтения. recalculateAllInvoices перенести в InvoiceCommands.recalculateAll(actor), который пишет одну запись аудита и итог. Добавить eslint no-restricted-imports: server/routes/** не может импортировать repositories/invoiceRepo, а server/storage.ts не может реэкспортировать функции invoiceRepo с префиксами create/update/delete.

*Верификатор:* Подтверждаю: в storage.ts:77-89 остались публичные createInvoice, updateInvoice, deleteInvoice, createInvoiceExpense и createInvoiceTransfer, и они объявлены в порте (storagePorts.ts:127-153), хотя роуты их не вызывают. POST /api/admin/recalculate-invoices (dashboard.ts:238) переписывает проекции через recalcInvoice: у каждого счета своя tx с блокировкой (invoiceRepo.ts:228-232), но записи в журнале нет. Это пока скрытый риск, поэтому medium, а не high.

#### N40. Тройное объявление каждой операции (repo + storagePorts + DatabaseStorage + Pick), в фасаде остались неаудируемые финансовые записи

- Файл: `server/storage.ts:77`
- Категория: избыточность. Принцип: DRY; ISP без дублирования; один защищенный путь мутации денег
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
server/storage.ts:77-89:
  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.createInvoice(this.database, invoice, calculations); }
  async updateInvoice(id: string, invoice: Partial<InsertInvoice>, calculations?: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoice(this.database, id, invoice, calculations); }
  async createInvoiceTransfer(args: ...) { return invoiceRepo.createInvoiceTransfer(this.database, args); }
  async deleteInvoice(id: string) { return invoiceRepo.deleteInvoice(this.database, id); }
server/storagePorts.ts (408 строк) объявляет 107 методов, server/routeStores.ts (141 строка) выбирает 94. 13 методов не взят ни один роут: createInvoice, updateInvoice, deleteInvoice, createInvoiceExpense, updateInvoiceExpense, deleteInvoiceExpense, createInvoiceTransfer, deleteInvoiceTransfer, updateInvoiceCalculations, generateInvoiceNumber, getMonthlyPlan, getRecurringExpected*.
```

**Проблема.** Около 1000 строк чистого плумбинга (порты, однострочные делегаты, списки Pick) повторяют сигнатуры функций репозиториев для 107 операций. При этом фасад по-прежнему публикует запись денег мимо InvoiceCommands: без блокировки родителя, без command_receipts, без транзакционного аудита и outbox. Роутер получает весь объект DatabaseStorage (routes.ts:39), Pick ограничивает только тип, а в рантайме обходной путь открыт.

**Чем грозит.** Каждая новая операция требует правок в 4 местах. Любой будущий вызов storage.createInvoice или updateInvoice, например из скрипта, роута или задачи worker, молча обойдет аудит и идемпотентность, и типы этого не остановят.

**Что сделать.** Удалить из DatabaseStorage и InvoiceRepository все мутации счетов, расходов и переносов: единственный вход для них InvoiceCommands. Мутирующие функции invoiceRepo сделать принимающими только Tx (брендированный тип из db.transaction), чтобы их нельзя было вызвать с пулом. В перспективе убрать фасад: роутеры получают объект зависимостей { invoiceCommands, invoiceQueries, ... } с узкими модулями, без Pick-списков из 107 имен.

*Верификатор:* storage.ts:77-89 действительно держит createInvoice/updateInvoice/deleteInvoice/createInvoiceExpense/createInvoiceTransfer без аудита и receipts. Ни routeStores.ts, ни другой серверный код вне тестов их не вызывает, так что сейчас это мертвый плумбинг, а не живой обход. Это ловушка для следующего изменения: роутер получает целый DatabaseStorage (routes.ts:39).

#### N41. Сбои фоновых задач и outbox не видны: ошибка проглатывается, бесконечные повторы, нет мертвой очереди

- Файл: `server/worker.ts:26`
- Категория: поддерживаемость. Принцип: Observability, fail loudly: оператор должен узнать о сбое, не читая таблицы руками
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
active = Promise.all(jobs.map(job => runner.run(job).catch(() => console.error('[jobs] Database unavailable', job.key))))
// jobRunner.ts:47      console.error('[jobs] Retry scheduled', job.key);
// outbox.ts:23-25      const delay = Math.min(3600000, 10000 * 2 ** Math.min(event.attempts, 9));
      console.error('[outbox] Delivery deferred', event.id);
```

**Проблема.** worker.ts:26 любую ошибку runner.run (не только недоступность БД) логирует как «Database unavailable» и выбрасывает сам объект ошибки. jobRunner пишет причину только в scheduled_jobs.lastError, в лог уходит одно имя задачи. Outbox повторяет доставку бесконечно, раз в час: максимума попыток, терминального статуса и записи причины нет. Неверный токен бота даст вечную очередь без единой строки с текстом ошибки. Ручной бэкап реализован через сентинел nextRunAt = 9999-01-01 (worker.ts:16), а при сбое общий catch ставит ему автоповтор с backoff, то есть ручная операция сама перезапускается неограниченно.

**Чем грозит.** Единственный оператор узнает о том, что не формируются периодические счета, не делаются бэкапы или не уходят уведомления клиентам, только по жалобе. Проверка в deploy (activate-release.sh:66-71) смотрит лишь первый прогон.

**Что сделать.** В worker логировать error.message и stack. В notification_outbox добавить lastError и failedAt, после N (например, 10) попыток переводить событие в failed. Сделать один админский эндпоинт или Telegram-сигнал владельцу «задачи в failed / outbox failed > 0». Для manual-backup завести флаг oneShot в Job: при ошибке state=failed без автоповтора, nextRunAt=null.

*Верификатор:* Подтверждаю для outbox: outbox.ts:21-24 глотает ошибку, не сохраняет и не логирует ее, у повторов нет ни максимума, ни терминального статуса. Ручной бэкап при сбое уходит в автоповтор с backoff до часа (jobRunner.ts:42-45). Неверно про worker.ts:26: runner.run сам ловит ошибки job.run (jobRunner.ts:34-47), наружу выходят только ошибки БД, так что метка «Database unavailable» по сути точна, а причина сохраняется в scheduled_jobs.lastError.

#### N42. Массовое безвозвратное удаление: N параллельных DELETE по выборке, которая переживает смену страницы, фильтра и архива

- Файл: `src/components/invoices/UnifiedInvoicesList.tsx:276`
- Категория: атомарность. Принцип: Atomicity / явная операция над видимым набором; «система сама не удаляет данные»
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
UnifiedInvoicesList.tsx:266-268 `setSelectedInvoices(previous => allPageSelected ? previous.filter(id => !pageIds.has(id)) : [...new Set([...previous, ...pageIds])]);`; :276 `await Promise.all(selectedInvoices.map(id => apiDelete(`/invoices/${id}`)));`; :283-284 `setSelectedInvoices([]); refreshInvoices();` (только в ветке успеха); server/repositories/invoiceRepo.ts:582-583 `if (payment) throw new CommandError('Нельзя удалить счёт с платежами...', 409); await tx.delete(invoices).where(eq(invoices.id, id));`
```

**Проблема.** С новой пагинацией и архивом выборка накапливается между страницами и фильтрами и нигде не сбрасывается при смене filterKey, page или archive, так что подтверждение «удалить N счетов» относится и к невидимым строкам. Удаление идет N независимыми запросами. Если сервер отказал хотя бы по одному (409 при наличии платежей или 400 при наличии переносов), часть счетов уже удалена навсегда, refreshInvoices не вызывается, выборка остается, и показывается тост с одной ошибкой. При этом рядом появился обратимый архив, а основное действие в списке так и осталось hard delete.

**Чем грозит.** Безвозвратная потеря счетов, которых пользователь не видел в момент подтверждения, и рассинхрон списка после частичной ошибки.

**Что сделать.** Заменить массовое удаление на массовую архивацию одним запросом `POST /api/invoices/bulk-archive {ids}`: внутри invoiceCommands одна транзакция, ответ `{archived: string[], rejected: {id, reason}[]}`. Выборку сбрасывать в useEffect при смене filterKey, page и archive, либо ограничить текущей страницей. Hard delete оставить только для одиночного черновика без платежей и переносов. После любого исхода вызывать invalidateFinancialQueries.

*Верификатор:* Подтверждаю: выборка не сбрасывается при смене страницы, фильтра или архива (setSelectedInvoices([]) только на :283 и :494). Удаление идет через Promise.all из N независимых DELETE (:276), а при частичном отказе refreshInvoices не вызывается. Смягчает то, что сервер в транзакции запрещает удалять счета с платежами и переносами (invoiceRepo.ts:574-583), а UI показывает «Выбрано: N».

#### N43. Тесты области подогнаны под чек-лист ревью: фикстуры обходят реальные сценарии карточки

- Файл: `src/hooks/financialMutations.test.tsx:18`
- Категория: тесты и DX. Принцип: Тест описывает поведение пользователя, а не факт выполнения пункта
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
financialMutations.test.tsx:11-12 `const invoice = { id, invoiceNumber: 'CACHE-REGRESSION', scheme: 'agency_30', status: 'paid', clientBill: '1000', createdAt: '2026-10-18', serviceType: 'periodic', ... };` (без paymentDate); :18 `function Probe() { ... useInvoiceCommands({ open: false, ...}); return null; }`; :43-44 `await act(async () => commands.setClientBillEdit(1200)); await act(async () => commands.handleUpdateClientBill(1200));`; файл src/components/invoices/reviewCompletion.test.tsx
```

**Проблема.** Тест проверяет только флаг isInvalidated у списка ключей после вызова хендлера, в который передан готовый аргумент. Он не проверяет, что введенное значение доживает до сохранения, и запускается с open:false и счетом без дат. Поэтому критический цикл рендеров и сброс черновика проходят зеленым. Имя reviewCompletion.test.tsx и комментарии в релиз-нотах («регрессия воспроизводит...») привязывают тесты к закрытию пунктов ревью, а не к пользовательскому поведению. Диалог, список и мастер создания счета так и не смонтированы ни в одном тесте.

**Чем грозит.** Зеленый CI дает ложную уверенность при рефакторинге фронта. Следующий перенос логики сломает экран так же незаметно.

**Что сделать.** Переименовать в поведенческие файлы (invoiceDetails.editing.test.tsx, invoiceList.money.test.tsx). Добавить рендер-тест InvoiceDetailsDialog с фикстурами из 3 схем (agency, commission_based, legacy agency_30) с датами оплаты: ввод в input-client-bill, клик button-save-client-bill, проверка тела PATCH и ограниченного числа рендеров. Добавить снапшот-таблицу «роль × схема × режим (table/cards/mobile) → суммы», которая сразу поймает расхождение долей между режимами.

*Верификатор:* Подтверждаю: financialMutations.test.tsx:11-12,18 монтирует хук с open:false на счете без paymentDate и проверяет только isInvalidated, поэтому цикл рендеров и сброс черновика (находка 0) проходят зелеными. Диалог, список и CreateInvoiceDialog не монтируются ни одним тестом. Это во многом пересекается с F96.

#### N44. Клиентская денежная математика и легаси-схемы как значения по умолчанию в новом коде

- Файл: `src/hooks/useInvoiceCommands.ts:31`
- Категория: поддерживаемость. Принцип: YAGNI / один источник финансовой правды (сервер)
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
src/hooks/useInvoiceCommands.ts:30-31
  const isAgency30 = isAgencyScheme(invoice?.scheme);
  const permissions = getVisibleFields(userRole, invoice?.scheme ?? 'agency_30');
src/components/invoices/assistant/CreateInvoiceDialog.tsx:159  const calculations = calculateInvoice({ scheme: dbScheme, clientBill: validated.clientBill, partnerCommRate: partnerRate, agencyMarginRate: marginRate });
server/services/invoiceCommandInput.ts:32  export const calculationInput = z.object({ clientBill: ..., commissionRate: rate.nullish() });
src/lib/invoiceCalculations.ts:73-74  if (scheme === 'agency_30') { const adminShare = clientBill * 0.15; const clientBase = clientBill * 0.70;
```

**Проблема.** Новый хук useInvoiceCommands при отсутствии счета берет права для легаси-схемы agency_30 и называет флаг isAgency30, хотя isAgencyScheme включает живую 'agency'. CreateInvoiceDialog считает в браузере на float 15 полей расчета и отправляет их, а сервер принимает только clientBill и commissionRate (zod по умолчанию отбрасывает остальные). calculatePartnerDebt с захардкоженными 0.15/0.70/0.24/0.60 нигде не вызывается, но экспортируется рядом с актуальным движком. InvoiceCard.tsx:36 приводит scheme к `'agency_30' | 'agency_40' | 'commission_based'` и теряет живую 'agency'.

**Чем грозит.** Следующий разработчик решит, что клиентский расчет влияет на сохраняемые суммы, или поправит коэффициенты в мертвом calculatePartnerDebt. Дефолт 'agency_30' закрепляет схему, от которой отказались 03.07.2026.

**Что сделать.** Удалить calculatePartnerDebt. В CreateInvoiceDialog отправлять только условия счета (clientBill, commissionRate, marginRate), а превью брать из shared/financialEngine напрямую, без snake_case-обертки. В useInvoiceCommands убрать дефолт схемы: пока invoice не загружен, permissions = null. Переименовать isAgency30 в isAgency. Каст в InvoiceCard заменить на тип InvoiceScheme.

*Верификатор:* Подтверждаю: в useInvoiceCommands.ts:30-31 стоят isAgency30 и дефолт 'agency_30'. CreateInvoiceDialog.tsx:159-161 считает calculations на float, а сервер парсит их через calculationInput (invoiceCommands.ts:74), то есть берет только clientBill/commissionRate. calculatePartnerDebt (invoiceCalculations.ts:63) с зашитыми 0.15/0.70 нигде не вызывается.

#### N45. Фронт: «координатор из 293 строк» достигнут переносом сложности в god-hook на ~100 полей; мутации счетов идут тремя каналами, маршруты продублированы регэкспами

- Файл: `src/hooks/useInvoiceCommands.ts:33`
- Категория: SOLID. Принцип: SRP и ISP на уровне компонентов; одна точка доступа к командам; единый реестр маршрутов
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
src/hooks/useInvoiceCommands.ts:33-36:
  return {
    ...status, ...metadata, ...financial, ...expense, ...period,
    toast, queryClient, invoice, setStatus, expenses, loading, error, fetchInvoiceDetails,
    messageInvoiceOpen, setMessageInvoiceOpen, messageExpense, setMessageExpense,
export type InvoiceDetailsModel = ReturnType<typeof useInvoiceCommands>; весь model передается в InvoiceTermsSection, InvoiceCalculationsSection, InvoiceExpensesSection и InvoicePeriodicTerms (InvoiceDetailsDialog.tsx:126-133).
Прямые мутации мимо хуков: UnifiedInvoicesList.tsx:235 и :276 (Promise.all(selectedInvoices.map(id => apiDelete(...)))), PriorityActionsCard.tsx:49, TransferFundsDialog.tsx:80, InvoicePage.tsx:60; третий канал src/lib/services/invoices.ts:46-93.
src/lib/api.ts:26: /^\/api\/(?:invoices(?:\/transfer|\/[^/]+(?:\/(?:expenses|periods|archive))?)?|expenses\/[^/]+|transfers\/[^/]+|partner-payments(?:\/[^/]+)?)$/ и shared/apiContract.ts:8-27 повторяют таблицу маршрутов сервера регэкспами.
```

**Проблема.** Заявление SRP (architecture-review-remediation.md:70) формально верно: в диалоге 293 строки. Но модель стала плоским мешком примерно из 100 полей, собранным из 5 под-хуков, и каждая секция получает весь мешок. Связанность та же, только невидима. Изменять счет можно через хуки, через invoiceService и прямыми apiPatch/apiDelete в компонентах, каждый со своей инвалидацией кэша. Какие эндпоинты повторяемы и какой ответ валидировать, определяется регэкспами по URL, то есть третьей копией таблицы маршрутов.

**Чем грозит.** Переименование или добавление маршрута на сервере молча выключит повтор или валидацию ответа на клиенте. Изменение любого под-хука перерисовывает и типово затрагивает все секции. Массовое удаление идет параллельными командами без общего результата.

**Что сделать.** Ввести src/lib/invoiceCommandsClient.ts с типизированными методами (updateTerms, setStatus, archive, deleteMany, transfer...). Пути взять из общего shared/routes.ts, который использует и серверный роутер, а флаги retrySafe и схема ответа объявляются рядом с маршрутом, не регэкспом. Все компоненты, invoiceService и хуки вызывают только его. Секции получают узкие пропсы (terms, onSave, permissions), а не InvoiceDetailsModel целиком.

*Верификатор:* useInvoiceCommands.ts:33-37 сливает 5 под-хуков в плоский объект, и весь model уходит в каждую секцию (InvoiceDetailsDialog.tsx:126-133). Прямые apiDelete есть в UnifiedInvoicesList.tsx:235 и :276. Параллельный канал src/lib/services/invoices.ts (apiPatch/apiDelete /invoices, /expenses) используют Add/EditExpenseDialog. Повторяемость определяется регэкспом по URL в api.ts:26.

#### N46. Новые командные хуки написаны в обход useMutation: в коде две идиомы мутаций

- Файл: `src/hooks/useInvoiceExpenseActions.ts:22`
- Категория: поддерживаемость. Принцип: Consistency / не изобретать то, что дает библиотека
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
src/hooks/useInvoiceExpenseActions.ts:22-29
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null,
  );
  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    setDeletingExpenseId(deleteExpense.id);
src/hooks/useInvoiceStatusCommands.ts:17  const [updatingStatus, setUpdatingStatus] = useState(false);
src/hooks/useInvoiceArchive.ts:8  const [pending, setPending] = useState(false);
```

**Проблема.** В шести новых хуках useInvoice*Commands нет ни одного useMutation. Флаги pending (18 штук useState(false)), toast при ошибке и инвалидация после успеха везде написаны вручную. В остальном коде (12 файлов, 23 вызова) используется useMutation. Защита от двойного клика есть только в useInvoiceArchive (`if (pending) return`), в useInvoiceExpenseActions и useInvoiceStatusCommands ее нет. useInvoiceCommands склеивает пять хуков через spread (`...status, ...metadata, ...financial, ...expense, ...period`), поэтому одноименные поля будут молча перетираться.

**Чем грозит.** Каждый новый командный хук копирует 15–20 строк обвязки. Ошибки в обработке pending и finally расходятся между хуками. Двойной клик по «Удалить расход» отправляет две команды; повтор спасет только серверная идемпотентность, и то если ключ совпадет.

**Что сделать.** Сделать общий `useInvoiceCommand(fn, { successToast, invalidate })` поверх useMutation (isPending, onError→toast, onSuccess→invalidate) и перевести на него useInvoice*Commands. В useInvoiceCommands вместо spread возвращать вложенные объекты `{ status, metadata, financial, expense, period }`, а секции берут свой срез через Pick.

*Верификатор:* useMutation в useInvoice*.ts нет, флаги ведутся вручную. Хуже, чем заявлено: updatingStatus (useInvoiceStatusCommands.ts:17) нигде не ставится в true, setUpdatingStatus не вызывается, поэтому `disabled={updatingStatus}` (InvoiceDetailsDialog.tsx:246, InvoicePaymentMetadata.tsx:66) не срабатывает никогда. Для удаления расхода утверждение неточно: кнопку блокирует `disabled={!!deletingExpenseId}` (InvoiceDetailsDialog.tsx:184).

#### N47. Тот же финансовый смысл в двух адаптерах берется из разных полей и по разным правилам

- Файл: `src/lib/invoiceDetailsView.ts:67`
- Категория: спагетти. Принцип: DRY / один адаптер на один контракт
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
src/lib/invoiceDetailsView.ts:67-68
        client_bill: parseNum(invoiceData.calculations?.clientBill || invoiceData.clientBill),
        partner_commission_rate: parseNum(parseNum(invoiceData.calculations?.commissionRate)),
src/lib/invoiceView.ts:11  client_bill: parseNum(c?.clientBill ?? inv.clientBill), commission_rate: parseNum(c?.commissionRate),
src/lib/invoiceView.ts:17  partner_commission_rate: parseNum(inv.partnerCommissionRate), service_type: inv.serviceType,
src/hooks/useInvoice.ts:19  expenses: query.data?.expenses.map(row => ({ ...row, invoice_id: row.invoiceId }))
```

**Проблема.** Переезд на camelCase DTO остановился на полпути: DTO снова превращается в snake_case, причем в двух местах с разными правилами. В списке partner_commission_rate берется из invoice.partnerCommissionRate, в карточке из calculations.commissionRate (и дважды проходит через parseNum). client_bill в одном месте берется через `??`, в другом через `||`. Третья конверсия camel→snake живет в invoiceCalculations.calculateInvoice, четвертая в useInvoice для расходов.

**Чем грозит.** Если ставка в счете и в расчете различаются (например, после ручной правки или для легаси partner_10/15), список и карточка одного и того же счета покажут разный процент партнера. Любое новое поле придется добавлять в 2–4 маппинга.

**Что сделать.** Оставить один `toInvoiceView(dto)` в src/lib/invoiceView.ts с одной таблицей источников полей, а invoiceDetailsView сделать надстройкой над ним (`{...toInvoiceView(dto), extra}`). Целевое состояние: компоненты читают camelCase DTO напрямую, snake_case-слой удаляется секция за секцией. Тест на эквивалентность общих полей двух представлений.

*Верификатор:* Подтверждаю: invoiceView.ts:17 берет partner_commission_rate из inv.partnerCommissionRate, а invoiceDetailsView.ts:68 из calculations.commissionRate с двойным parseNum. client_bill в одном адаптере собирается через `??` (invoiceView.ts:11), в другом через `||` (invoiceDetailsView.ts:67). При этом UnifiedInvoicesList.tsx:959-980 пересчитывает комиссию в браузере от этого поля.

#### N48. Две независимые матрицы видимости, на клиенте и на сервере, синхронизируются вручную

- Файл: `src/lib/invoicePermissions.ts:38`
- Категория: DRY. Принцип: Single Source of Truth для политики доступа
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
src/lib/invoicePermissions.ts:38  const VISIBILITY_POLICIES = {
src/lib/invoicePermissions.ts:189  } satisfies Record<UserRole, (scheme: InvoiceScheme) => VisibleFields>;
server/permissions.ts:88  export const ROLE_CALCULATION_PERMISSIONS: Record<UserRole, readonly string[]> = {
server/permissions.ts:96-100 partner: [... 'amountToAdmin', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin', ...]  vs  invoicePermissions.ts partner `showAdminShare: false, // НЕ видит долю админа`
invoicePermissions.ts assistant `showAssistantBonus: true` vs server/permissions.ts assistant без 'assistantBonusActs'/'assistantBonusPaid'
```

**Проблема.** На клиенте около 200 строк булевых флагов VisibleFields по ролям и схемам, на сервере свои списки полей. Связи между ними нет, есть только общий ключ Record<UserRole>. Расхождения уже есть: партнеру сервер отдает adminShareFromMargin, а UI считает, что тот его не видит; ассистенту UI показывает бонус, которого нет в его серверной проекции. Документ docs/architecture-review-remediation.md называет это OCP, хотя по факту это два реестра.

**Чем грозит.** Каждое изменение прав (новая схема, новое поле) нужно делать в двух местах. Если забыть одно, получится либо утечка в DevTools, либо пустые и нулевые поля в UI (см. находку про parseNum). Для одного владельца-оператора это постоянный источник регрессий.

**Что сделать.** Перенести матрицу в shared/fieldPolicy.ts как `Record<UserRole, (scheme) => ReadonlySet<CalcField>>`. Сервер строит проекцию из нее, клиент выводит show* как `policy.has(field)`. Флаги can* (действия) оставить клиентскими. Тест: для каждой роли и схемы множество ключей ответа сервера совпадает с policy.

*Верификатор:* Расхождение реальное и видимое. Для партнера в invoicePermissions.ts:175 стоит `showAdminShare: false`, а server/permissions.ts:96-100 отдает ему adminShareFromMargin, и InvoiceCard.tsx:221-223 показывает партнеру «Доля админа» мимо матрицы. Расхождение по бонусу ассистента пока ни на что не влияет: флаг showAssistantBonus нигде вне invoicePermissions.ts не читается.

#### N49. Адаптеры счета превращают поле, скрытое по роли, в 0: «нет данных» и «ноль рублей» неразличимы

- Файл: `src/lib/invoiceView.ts:11`
- Категория: модель данных. Принцип: Make illegal states unrepresentable / явное отсутствие значения
- Серьезность у автора находки: высокая; итоговая, после верификатора: средняя

```
src/lib/invoiceView.ts:11-12
    client_bill: parseNum(c?.clientBill ?? inv.clientBill), commission_rate: parseNum(c?.commissionRate),
    commission_amount: parseNum(c?.commissionAmount), agency_margin: parseNum(c?.agencyMargin),
shared/financialEngine.ts:108  if (value === null || value === undefined || value === '') return 0;
src/components/invoices/InvoiceCard.tsx:42  const clientRemaining = invoice.client_remaining ?? calc.client_remaining ?? 0;
```

**Проблема.** Сервер обрезает поля расчетов по роли (server/permissions.ts:88 ROLE_CALCULATION_PERMISSIONS), а оба новых адаптера (invoiceView.ts, invoiceDetailsView.ts:76-90) пропускают каждое поле через parseNum, и отсутствующее поле становится 0. Fallback `?? calc.client_remaining` в InvoiceCard.tsx:42-45 из-за этого мертв: результат parseNum никогда не бывает undefined. Компонент не может отличить «роль не видит поле» и «расчет еще не сделан» от настоящего нуля.

**Чем грозит.** Если серверная проекция и клиентская матрица видимости разойдутся при следующей правке, интерфейс не скроет поле и не упадет, а покажет «0 ₽» в деньгах. Для финансовой системы это хуже ошибки.

**Что сделать.** В invoiceView/invoiceDetailsView возвращать `number | null` через `parseNumOrNull` (undefined/null → null), а форматирование 0 делать только в компоненте. Удалить мертвые fallback'и на calculateInvoice в InvoiceCard. Добавить тест: проекция partner/client из stripSensitiveFieldsForRole → адаптер → поля без доступа равны null, а не 0.

*Верификатор:* Подтверждаю: parseNum (shared/financialEngine.ts:108) превращает отсутствующее поле в 0, поэтому fallback `?? calc.*` в InvoiceCard.tsx:43-46 мертв, и «нет данных» неотличимо от нуля. Но high завышен: UI прячет поля по роли сам (InvoiceCard.tsx:177/202/254), а нужные этим блокам поля сервер этим ролям отдает. Реальный эффект ограничен счетами без calculations, поэтому medium.

#### N50. Quality gate дырявый: серверные тесты не проходят tsc, no-unused-vars выключен, мертвые импорты и устаревшие комментарии в отчетных репозиториях

- Файл: `tsconfig.server.json:16`
- Категория: тесты и DX. Принцип: Гейт должен проверять то, что заявлено; тесты — такой же код
- Серьезность у автора находки: средняя; итоговая, после верификатора: средняя

```
tsconfig.server.json:16-19:
  "exclude": [
    "server/**/*.test.ts",
    "server/test/**"
  ]
eslint.config.js:23 `"@typescript-eslint/no-unused-vars": "off",`
planningRepo.ts:5 `import { eq, and, or, gte, lte, desc, asc, sql, inArray, isNull, isNotNull } from "drizzle-orm";` (используются 3 из 11; то же в reportsRepo.ts:5-11, alertsRepo.ts:5-11)
planningRepo.ts:181 `// For expected invoices: use plannedPaymentDate or issueDate`
```

**Проблема.** «strict server tsc + lint --max-warnings=0» подается в docs как гейт (пункт 13), но 36 тестовых файлов из проверки типов исключены. Ровно там ремедиация меняла `as any` на `as unknown as typeof import("../db").db` (dashboardRepo.partnerHero.test.ts). Правило неиспользуемых переменных выключено, поэтому в отчетных репозиториях висят по 10–15 мертвых импортов таблиц, а комментарии описывают удаленную колонку plannedPaymentDate. Нулевое число предупреждений lint обеспечено конфигом, а не кодом.

**Чем грозит.** Тесты, на которые опирается доказательство исправлений, могут обращаться к несуществующим полям так же, как прод до ревью. Мертвые импорты маскируют реальные зависимости модулей при следующем разрезании.

**Что сделать.** Добавить tsconfig.server.test.json (include server/**/*.test.ts, server/test/**) в npm run typecheck и CI. Включить @typescript-eslint/no-unused-vars: error с argsIgnorePattern '^_' и одним проходом eslint --fix убрать мертвые импорты. Устаревшие комментарии про plannedPaymentDate удалить.

*Верификатор:* Подтверждаю: тесты исключены в tsconfig.server.json:16-19, правило отключено в eslint.config.js:23 для всех **/*.{ts,tsx}, мертвые импорты есть в planningRepo.ts:5, комментарий про удаленную колонку — в planningRepo.ts:181. Еще пример — StatsPage.tsx:7 импортирует OverduePaymentsAlert и не использует его. Уточнение: из tsc исключены только серверные тесты, а не все 36.


### Серьезность: низкая

#### N51. activate-app-domain.sh под root правит копию .env текущего релиза, чужой сайт и рестартует только web

- Файл: `deploy/activate-app-domain.sh:48`
- Категория: поддерживаемость. Принцип: Конфигурация вне артефакта релиза; один владелец изменений прод-конфига; автоматика не трогает чужие системы
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
deploy/activate-app-domain.sh:11  ENV=/opt/finance-duck/.env
:48  sed -i "s|^CORS_ORIGINS=.*|&,https://$DOMAIN|" "$ENV"
:54  sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://$DOMAIN|" "$ENV"
:62-63  grep -rl "https://fin-dohod.ru" /opt/withoutwater/site ... sed -i "s|https://fin-dohod.ru|https://app.withoutwater.ru|g" "$f"
:67  systemctl restart finance-duck
deploy/deploy.sh:17  cp -p /opt/finance-duck/.env .env
```

**Проблема.** После перехода на релизы /opt/finance-duck стал симлинком, а .env копируется в каждый релиз. Таймер root правит .env только текущего релиза, и откат activate-release молча вернет старые PUBLIC_BASE_URL и CORS_ORIGINS. Рестартует он только finance-duck, а recurring-счета с ссылками строит worker (recurringCommands.ts:62 → invoiceNotice → publicUrl читает process.env.PUBLIC_BASE_URL), так что периодические уведомления продолжат вести на старый домен до следующего выпуска. Скрипт делает certbot --nginx и глобальный sed по файлам другого проекта (/opt/withoutwater/site) без человека и без бэкапа. TG-токен уходит в URL curl в командной строке. Правка CORS_ORIGINS при этом ничего не дает: originPolicy (originPolicy.ts:7-8) и так пропускает same-origin запросы.

**Чем грозит.** Дрейф конфигурации между релизами, неверные ссылки в Telegram после отката или от worker. Неаудируемые root-изменения соседнего сайта.

**Что сделать.** Вынести env в /etc/finance-duck/env (0600), сослаться на него из обоих юнитов через EnvironmentFile и перестать копировать в релизы. Два домена описать явно: PUBLIC_BASE_URL плюс список хостов в одном файле, nginx server_name для обоих. Активацию домена сделать ручным одноразовым шагом runbook, который перезапускает web и worker. Таймер и правку /opt/withoutwater удалить из репозитория. Токен передавать через curl --config - со stdin.

*Верификатор:* Код делает то, что описано: правит .env текущего релиза (:11, :48, :54), рестартует только finance-duck (:67), хотя worker строит ссылки через publicUrl (telegram.ts:79), и делает sed по /opt/withoutwater/site (:62-63). app.withoutwater.ru сейчас не резолвится, значит таймер еще не сработал. Но старый домен fin-dohod.ru продолжает работать, поэтому вред ограничен устаревшими ссылками и откатом URL.

#### N52. Порт сделан настраиваемым, но nginx и проверка релиза жестко ждут 5000

- Файл: `deploy/activate-release.sh:58`
- Категория: поддерживаемость. Принцип: Single source of configuration
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
if curl -fsS http://127.0.0.1:5000/api/health > "$archive/health.json"; then break; fi
// deploy/nginx.conf:49        proxy_pass http://127.0.0.1:5000;
// server/vite.ts:62  const port = Number(process.env.PORT ?? 5000);
```

**Проблема.** В рамках исправления F17 сервер начал читать PORT и HOST, но остальная конфигурация (nginx, health-check активации и его повтор на :62) по-прежнему знает только 5000. HOST=127.0.0.1 нигде не выставлен. Конфиг размазан между .env, nginx.conf и bash-скриптом без единого источника.

**Чем грозит.** Смена PORT в .env (например, при переезде соседнего сервиса на тот же VDS) уронит активацию релиза. Скрипт сочтет релиз сломанным и откатит его, хотя приложение живо.

**Что сделать.** В activate-release.sh читать порт из .env релиза (source .env или grep ^PORT=) с умолчанием 5000. В .env.example и install.sh добавить HOST=127.0.0.1. nginx.conf генерировать из шаблона с тем же PORT при install.

*Верификатор:* Подтверждаю: vite.ts:62 читает PORT, но nginx.conf:49 и activate-release.sh:58,62 жестко ждут 127.0.0.1:5000, а HOST нигде не выставлен. Это дубль остатка F17.

#### N53. Гейт деплоя и гейт CI не совпадают: деплой не требует зеленого CI и блокируется npm audit

- Файл: `deploy/deploy.sh:11`
- Категория: тесты и DX. Принцип: Один источник правды для готовности к выпуску; гейт проверяет риски рантайма, а не всего дерева
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
deploy/deploy.sh:11-13  npm ci
npm run check
npm audit --audit-level=moderate
.github/workflows/check.yml:25  - run: npm run test:postgres
README.md:27  «В GitHub Actions оба набора обязательны.»
```

**Проблема.** Деплой идет с машины владелицы и не проверяет, прошел ли CI для этого SHA. test:postgres (гонки на настоящем Postgres 16, swap-databases) в деплой не входит. Обязательность в Actions поэтому формальна: выпустить можно коммит, на котором CI красный или вовсе не запускался. При этом npm audit --audit-level=moderate по всему дереву, включая devDependencies, остановит срочный денежный хотфикс из-за свежего moderate-advisory в инструменте сборки.

**Чем грозит.** Выпуск без проверки гонок и restore на настоящем Postgres. Заблокированный хотфикс в момент, когда он нужнее всего.

**Что сделать.** В deploy.sh перед ssh проверять gh run list --commit $commit --workflow check.yml --json conclusion и требовать success, а без сети явно ставить флаг --skip-ci с записью в release.json. Аудит в гейте сузить до npm audit --omit=dev --audit-level=high, полный аудит оставить в CI как информационный шаг.

*Верификатор:* deploy.sh:11-13 гоняет check и audit, но не test:postgres и не проверяет статус CI для SHA. В .github/workflows/check.yml:25 test:postgres есть. npm audit --audit-level=moderate по всему дереву стоит и в деплое, и в CI (check.yml:28).

#### N54. audit-money.sql сверяет кэш с самим собой и хардкодит коэффициенты схем

- Файл: `scripts/audit-money.sql:31`
- Категория: тесты и DX. Принцип: Независимый инвариант должен опираться на первичные данные
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
scripts/audit-money.sql:31 `ic.client_bill AS b, ic.commission_rate AS crate,`
scripts/audit-money.sql:46-47 `CASE WHEN scheme='agency_30' AND abs(agency_margin - b*0.30) > 0.02 THEN 'маржа≠30%' END, CASE WHEN scheme='agency_30' AND abs(partner_share_from_margin - b*0.15) > 0.02 ...`
scripts/audit-money.sql:55 `abs(admin_share_from_margin - (agency_margin - partner_share_from_margin)) > 0.02`
Файл не менялся в ece9adf..HEAD, хотя источником суммы теперь назначен invoices.client_bill (docs/architecture-review-remediation.md).
```

**Проблема.** Аудит берет якорь и ставку из того же кэша, который проверяет, и не сравнивает его с invoices.client_bill и invoices.partner_commission_rate. Поэтому неверная доля партнера в 'agency' (invoiceRepo.ts:213) проходит проверку «админ = маржа − партнер». Коэффициенты 0.30/0.15/0.40/0.16/0.24/0.10/0.90 продублированы из SCHEME_POLICIES, допуск 0.02 оставлен, хотя движок теперь копеечно точен.

**Чем грозит.** Единственная проверка целостности на проде дает ложное «OK» ровно на тех классах ошибок, которые реально возможны после переделки.

**Что сделать.** Заменить SQL-аудит на npm-скрипт server/auditMoney.ts, который для каждого счета вызывает calculateBookedFinancials по входам из invoices, invoice_expenses, service_usage и invoice_transfers и сравнивает результат с invoice_calculations строго (допуск 0). Отдельно проверить invoices.client_bill = invoice_calculations.client_bill.

*Верификатор:* Подтверждено: якорь и ставка берутся из того же кэша ic (audit-money.sql:31), с invoices.client_bill и partner_commission_rate сверки нет, коэффициенты схем захардкожены (:46-58), допуск 0.02 оставлен. Файл не менялся в ece9adf..HEAD (git log пуст). Ошибку [0] проверка «админ = маржа − партнер» (:55) действительно пропускает.

#### N55. Тесты организованы по эпизодам ревью, а не по поведению доменов; архитектурные стражи сделаны регулярками

- Файл: `server/architectureRemediation.http.test.ts:62`
- Категория: тесты и DX. Принцип: Тесты как документация модуля: структура тестов повторяет структуру кода
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
it('R1: personal export uses the same client field projection for every scheme and periodic usage', async () => {
// reviewFollowup.test.ts:130 it('persists job failure/backoff across runners, prevents overlap, and recovers a crashed lease', async () => {
// storageFacade.test.ts:22       .filter(({ line }) => /await (db|tx)\b/.test(line))
```

**Проблема.** Около 850 строк серверных тестов лежат в reviewFollowup/reviewRegressions/reviewCompletion/architectureRemediation с префиксами R1..R8: jobRunner, outbox, идемпотентность, экспорт и бэкапы перемешаны в файлах по дате ревью. Сами проверки поведенческие, но найти тест, например, для jobRunner или outbox можно только грепом. Архитектурные инварианты (тонкий фасад, отсутствие сырого SQL) охраняются регулярками по тексту файла, которые уже обходятся через this.database (см. F80).

**Чем грозит.** При следующем изменении jobRunner или outbox агент не найдет их тесты рядом с модулем и напишет новые в очередной review*.test.ts. Стражи-регулярки дают ложную уверенность.

**Что сделать.** Разнести кейсы по соседним файлам модулей: services/jobRunner.test.ts, services/outbox.test.ts, services/invoiceCommands.test.ts, services/paymentCommands.test.ts, backupService.test.ts. Убрать префиксы R*. Текстовые стражи заменить на eslint no-restricted-imports (запрет drizzle-orm и ../db в server/storage.ts и server/routes/**).

*Верификатор:* Подтверждаю: 849 строк в review*/architectureRemediation с префиксами R1.. (architectureRemediation.http.test.ts:62), тесты jobRunner и outbox лежат в reviewFollowup.test.ts:130 и reviewRegressions.test.ts:161. Страж фасада построен на регулярке (storageFacade.test.ts:22).

#### N56. restoreBackup и restoreArchive дублируют транзакцию замены данных, а проверка инварианта есть только в одной из них

- Файл: `server/backupService.ts:209`
- Категория: DRY. Принцип: DRY; инварианты восстановления в одном месте
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
backupService.ts:209-212 `await this.database.transaction(async tx => { const tables = Object.values(backupTables); await tx.execute(sql`LOCK TABLE ...`); for (const table of [...tables].reverse()) await tx.delete(table);`
backupService.ts:240-243 тот же блок повторен в restoreArchive
backupService.ts:264-265 `const mismatch = await tx.execute(sql`SELECT i.id FROM invoices i WHERE i.service_type = 'periodic' AND i.periods_used <> (SELECT count(*) FROM service_usage ...`); if (mismatch.rows.length) throw ...` — только в .fdb-пути
```

**Проблема.** Два почти одинаковых алгоритма замены всей БД: для легаси-JSON и для .fdb. Отличаются пакетированием, отзывом сессий (map и мутация) и, главное, проверкой согласованности журнала service_usage с periods_used, которая выполняется только для .fdb. JSON-копия версии 5.0 с рассогласованным журналом закоммитится без ошибки.

**Чем грозит.** Следующая правка restore (новая служебная таблица, новый инвариант) попадет только в одну ветку. Сейчас легаси-путь уже слабее основного.

**Что сделать.** Ввести один `replaceAll(tx, rows: AsyncIterable<{table,row}>)` с пакетированием, политикой служебных таблиц и списком post-restore инвариантов (`assertRestoreInvariants(tx)`). Легаси-JSON превращать в тот же поток ArchiveItem адаптером. Либо снять поддержку JSON совсем: CLI конвертирует JSON в .fdb, а restore принимает только .fdb.

*Верификатор:* Транзакция замены продублирована в backupService.ts:209-221 и 240-260. Проверка service_usage против periods_used стоит только в .fdb-пути, на строках 258-259, а не 264-265. Расхождение касается только легаси-JSON 5.0: новые копии всегда пишутся в .fdb, поэтому реальная стоимость невелика.

#### N57. Денежные суммы в отчетах складываются тремя разными способами, включая Decimal для счетчиков

- Файл: `server/repositories/financialReportsRepo.ts:12`
- Категория: DRY. Принцип: DRY / единая денежная арифметика (движок уже переведен на Decimal-строки)
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
financialReportsRepo.ts:12 `const addMoney = (a: number, b: number) => new Decimal(a).plus(b).toNumber();`
financialReportsRepo.ts:98 `summary.invoiceCount = addMoney(summary.invoiceCount, 1);`
partnerDebtRepo.ts:105 `summary.totalToTransfer += debt;` / :113 `summary.totalPaid += parseNum(payment.amount) || 0;`
adminDashboardRepo.ts:110 `revenue: sql<string>`COALESCE(SUM(${invoiceCalculations.clientBill}::numeric), 0)``
```

**Проблема.** В одной подсистеме одновременно живут три способа: SQL numeric SUM -> parseNum (админ-дашборд, invoiceSummaryRepo), локальный addMoney через Decimal с возвратом в number на каждом шаге (financialReportsRepo, причем даже для invoiceCount) и голый float += (partnerDebtRepo, partnerDashboardRepo, clientOverviewRepo, storage.getDashboardStats). В shared/money.ts есть moneyDecimal/moneyString, но отчеты их не используют. Долг партнера в getPartnerDebtSummaries и в «Не тратить» считается разной арифметикой.

**Чем грозит.** Копеечные расхождения между экранами на больших суммах и непонятно, какой хелпер брать при следующей правке. Decimal для счетчика показывает, что паттерн копируют механически.

**Что сделать.** Вынести в shared/money.ts sumMoney(values: Decimal.Value[]): string, а отчеты должны возвращать денежные поля как decimal-строки (как уже делают partner-summary и client-balances). Агрегаты по возможности считать в SQL SUM(numeric)::text. Удалить локальный addMoney и счетчики вести обычным ++.

*Верификатор:* Три способа сложения на месте: addMoney через Decimal с возвратом number (financialReportsRepo.ts:12, в том числе для invoiceCount на :98, :227, :394), голый += (partnerDebtRepo.ts:105, :113) и SQL SUM (adminDashboardRepo.ts:110). moneyDecimal/moneyString из shared/money.ts отчеты не используют. Реальная цена — копеечные расхождения и непоследовательность, а не потеря денег.

#### N58. Годовая комиссия партнера теперь определена на сервере дважды с разными правилами

- Файл: `server/repositories/partnerDashboardRepo.ts:62`
- Категория: модель данных. Принцип: Single Source of Truth
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
server/repositories/partnerDashboardRepo.ts:20-21, 62-64:
  sql`${invoices.createdAt} >= ${yearStart.toISOString()}`,
  ...
for (const row of partnerInvoices) {
  yearlyCommission += parseNum(row.calculations.partnerShareFromMargin ?? row.calculations.commissionAmount);
server/repositories/invoiceSummaryRepo.ts:11-14:
  yearlyCommission: sql<string>`coalesce(sum(case when ${invoices.scheme} in ${AGENCY_SCHEMES}
    then ${invoiceCalculations.partnerShareFromMargin} else ${invoiceCalculations.commissionAmount} end)
    filter (where coalesce(${invoices.paymentDate}, ${invoices.createdAt}::date) >= ...
```

**Проблема.** Вместо исправления сломанного /api/partner/hero-metrics (server/routes/partners.ts:291, порт storagePorts.ts:249, тест dashboardRepo.partnerHero.test.ts) рядом добавлен /api/invoices/partner-summary. Первый определяет год по createdAt и берет partnerShareFromMargin ?? commissionAmount (для commission_based поле маржи не null, поэтому комиссия теряется), второй берет схему и coalesce(paymentDate, createdAt). Оба маршрута открыты партнеру, UI ходит только во второй, старый продолжает поддерживаться тестами и storage-фасадом. signedActsCount и reservedForExpenses при этом остались на фронте (PartnerDashboard.tsx:167-173), хотя hero-metrics их тоже считает, третьим способом.

**Чем грозит.** Следующий агент, которому скажут 'выведи комиссию партнера в отчете', с вероятностью 50% возьмет hero-metrics и получит другую цифру, чем на дашборде партнера; расхождение не поймает ни один тест, потому что каждый тестирует свою формулу.

**Что сделать.** Удалить getPartnerHeroMetrics, маршрут /api/partner/hero-metrics, метод порта и его тест; расширить getPartnerInvoiceSummary до {year, totalPaidInvoices, yearlyCommission, signedActsCount, reservedForExpenses}, считая акты одним JOIN с signed_acts в том же скоупе, а резерв через ту же функцию, что /api/do-not-spend; PartnerDashboard читать только этот эндпоинт без арифметики.

*Верификатор:* Два серверных определения годовой комиссии действительно есть: год по createdAt в partnerDashboardRepo.ts:21 против coalesce(paymentDate, createdAt) в invoiceSummaryRepo.ts:14; UI ходит только во второй. Утверждение про потерю комиссии commission_based неверно: при записи для не-агентских схем partnerShareFromMargin обнуляется в null (invoiceRepo.ts:150-151), так что `??` переходит к commissionAmount. Это дубль мертвого маршрута, а не ошибка в цифрах.

#### N59. Клиентский отчет «агентские 30/40» суммирует как «оплачено» черновики и отмененные счета

- Файл: `server/repositories/reportsRepo.ts:314`
- Категория: модель данных. Принцип: Single Source of Truth для денежной семантики; имя поля должно соответствовать фильтру
- Серьезность у автора находки: высокая; итоговая, после верификатора: низкая

```
reportsRepo.ts:314-319:
    .where(
      and(
        eq(invoices.clientId, clientId),
        inArray(invoices.scheme, [...AGENCY_SCHEMES])
      )
    );
reportsRepo.ts:329 `totalPaid += parseNum(row.calculations.clientBill);`
Маршрут: routes/clients.ts:265 `clientsRouter.get("/api/client/agency30", ... requireRole("client")` -> src/components/invoices/client/ClientAgency30Report.tsx
```

**Проблема.** В функции нет фильтра по статусу. В total_paid, client_budget_70 и remaining_budget попадают draft, sent и cancelled счета, хотя поле называется «оплачено». Соседний getDoNotSpendData берет только paid (financialReportsRepo.ts:142), getClientBudget берет sent+paid (clientBudgetRepo.ts:38), getClientOverviewBuckets исключает только cancelled. Это три разных правила для бюджета одного и того же клиента. Файл переписывали в ремедиации (249 строк диффа), а функцию не тронули.

**Чем грозит.** Клиент видит завышенную сумму «оплачено» и остаток бюджета, в том числе по отмененным счетам. Это прямое расхождение с кабинетом админа и с «Бюджетами проектов».

**Что сделать.** Ввести в server/analytics/sqlPredicates.ts предикаты isPaid и isActiveBudget (status IN ('paid') для оплаты, status <> 'cancelled' для бюджета) и использовать их в getClientAgency30Report, getClientBudget, getClientOverviewBuckets и getDoNotSpendData. Для total_paid добавить eq(invoices.status,'paid'). Покрыть тестом: cancelled и draft агентские счета не меняют total_paid.

*Верификатор:* Фильтра по статусу в reportsRepo.ts:314-319 действительно нет, total_paid суммирует clientBill любых счетов, включая cancelled. Но компонент ClientAgency30Report нигде не рендерится (в src нет ни одного импорта), так что дефект доступен только при прямом вызове API /api/client/agency30.

#### N60. Идентификаторы сессий хранятся в БД как есть и целиком уходят в каждый бэкап

- Файл: `server/repositories/userRepo.ts:96`
- Категория: безопасность. Принцип: Единая модель угроз для всех мест хранения секрета
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
// server/repositories/userRepo.ts:96-101
const sessionId  = randomBytes(32).toString("base64");
const csrfToken  = randomBytes(32).toString("base64");
...
await db.insert(userSessions).values({
  sessionId, accessTokenId: tokenId, csrfToken, ipAddress, userAgent, expiresAt,
// shared/schema.ts:76  sessionId: text("session_id").notNull().unique(),
// server/services/backupTables.ts:14  userSessions: schema.userSessions,
```

**Проблема.** Коды доступа защищены HMAC и AES под лозунгом «утечка БД бесполезна», а значение куки и CSRF-токен живых сессий (до 12 часов) лежат в user_sessions открытым текстом. Новый бэкап включает эту таблицу. При восстановлении сессии помечаются revoked (backupService.ts:216), но любой, кто прочитал БД или расшифрованный архив, получает действующую сессию администратора без кода.

**Чем грозит.** Read-only доступ к базе (дамп, реплика, ошибочный SELECT в отладке) превращается в запись через приложение от имени админа.

**Что сделать.** В БД хранить sha256(sessionId) в колонке session_hash, искать по хэшу, а куку отдавать сырой. csrfToken выводить как HMAC(sessionId) и не хранить вовсе. Исключить userSessions из backupTables: после восстановления сессии все равно отзываются, хранить их бессмысленно.

*Верификатор:* Подтверждено: sessionId и csrfToken хранятся открытым текстом (userRepo.ts:96-101), таблица входит в бэкап (backupTables.ts:14), абсолютный потолок сессии 12 часов (userRepo.ts:26). Смягчают это два факта: в проде архив бэкапа шифруется обязательно (backupArchive.ts:41), а при восстановлении сессии отзываются (backupService.ts:216,253).

#### N61. Старый необязательный CSRF-механизм оставлен в validateSession рядом с новым обязательным

- Файл: `server/repositories/userRepo.ts:123`
- Категория: DRY. Принцип: Один механизм на одну задачу; удалять замещенный код
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
// server/repositories/userRepo.ts:106-110,123
export async function validateSession(
  db: Db,
  sessionId: string,
  csrfToken?: string,
...
  if (csrfToken !== undefined && session.csrfToken !== csrfToken) return { isValid: false };
// server/storage.ts:42-43, server/storagePorts.ts:73-75 — тот же необязательный параметр в порте
// server/middleware.ts:47 — новая обязательная проверка
```

**Проблема.** CSRF теперь проверяется в middleware, но параметр csrfToken со старой семантикой «нет значения — проверку пропускаем» остался в репозитории, фасаде и порте AuthStore. Сейчас его никто не передает. Если кто-то передаст, неверный токен вернет isValid:false, middleware воспримет это как протухшую сессию и сотрет куку (middleware.ts:42-44), то есть получится 401 вместо 403.

**Чем грозит.** Следующий агент увидит два CSRF-пути и подключит не тот. Тест middleware.security.test.ts:39 (кука не стирается) при этом не поймает разницу, потому что validateSession в нем заглушен.

**Что сделать.** Убрать параметр csrfToken из userRepo.validateSession, DatabaseStorage.validateSession и SessionStore в storagePorts.ts. Сравнение токена оставить только в createAuthMiddleware и сравнивать через crypto.timingSafeEqual.

*Верификатор:* Подтверждено: необязательный csrfToken остался в userRepo.ts:109,123, storage.ts:42-43 и storagePorts.ts:73. Его никто не передает (middleware.ts:40, auth.ts:133). Если передать неверный токен, ответ будет isValid:false, то есть 401 со сбросом куки (middleware.ts:42-44) вместо 403.

#### N62. Тесты разложены по раундам ревью, а не по поведению; в одном из них фальшивая аутентификация

- Файл: `server/reviewCompletion.test.ts:38`
- Категория: тесты и DX. Принцип: Тест документирует поведение модуля и живет рядом с ним; граница доступа тестируется настоящей
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
server/reviewCompletion.test.ts:38-39  const auth: AuthMiddleware = (req, _res, next) => {
    req.user = { role: req.get('x-test-role') as s.UserRole || 'admin', partnerId, clientId, token };
server/reviewFollowup.test.ts: it('prunes expired login records in bounded batches...'), it('schedules the next daily backup independently of host timezone')
server/architectureRemediation.http.test.ts:69  it('R1: personal export uses the same client field projection...')
src/components/invoices/reviewCompletion.test.tsx (94 строки)
```

**Проблема.** Около 940 строк тестов лежат в файлах reviewFollowup, reviewRegressions, reviewCompletion, architectureRemediation и reviewCompletion.tsx, названных по этапам процесса ревью. Внутри перемешаны rate limiter, jobRunner, бэкап, recurring, экспорт и проекции клиента. Тест лимитера нельзя найти рядом с rateLimiter.ts, а метки R1–R8 ничего не значат без docs/architecture-review-remediation.md. reviewCompletion.test.ts повторяет ровно тот анти-паттерн из F16, который исправляли: собранный вручную express с подменой роли через x-test-role вместо createApp и настоящей сессии. Следующий раунд неизбежно даст reviewFollowup2.

**Чем грозит.** Регрессии в лимитере, расписании или экспорте ищут по всему репозиторию. Удаление «отработанного» review-файла молча снимет покрытие. Проверки ролей в reviewCompletion создают ложную уверенность.

**Что сделать.** Разнести кейсы по модулям: rateLimiter.test.ts, services/jobRunner.test.ts, services/backupArchive.test.ts, routes/export.http.test.ts, routes/recurring.http.test.ts. Метки R1–R8 заменить именами поведения. Общий харнес createHttpHarness(db) → {request(role,...)} вынести в server/test/, и чтобы его использовали все HTTP-тесты. В ESLint или в тест-страже запретить x-test-role вне tenantIsolation, а tenantIsolation перевести на харнес.

*Верификатор:* Подтверждено: около 943 строк тестов лежат в файлах review*/architectureRemediation и перемешивают темы (reviewFollowup.test.ts:119 — лимитер, :130 — jobRunner, :157 — бэкап). В reviewCompletion.test.ts:38-39 роль подменяется через x-test-role. Метка R1 стоит на строке 62, а не 69, но это мелочь.

#### N63. Тесты бэкапа и restore разложены по файлам раундов ревью, а не по модулям

- Файл: `server/reviewRegressions.test.ts:114`
- Категория: тесты и DX. Принцип: Тесты как документация модуля; colocated tests
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
reviewRegressions.test.ts:114 `describe('Complete backup and safe restore', () => {`
reviewRegressions.test.ts:215 `it('rolls back the entire restore when a snapshot contains a broken foreign key'`
reviewFollowup.test.ts:75 `it('accepts complete version 2 backups from before occurrence keys and object storage'`
reviewFollowup.test.ts:157 `it('schedules the next daily backup independently of host timezone'`
```

**Проблема.** Поведение restore, легаси-форматов и расписания бэкапов проверяется в reviewRegressions/reviewFollowup/reviewCompletion вперемешку с финансовыми командами, периодикой и rate-limit, а backupArchive.test.ts и documents.integration.test.ts лежат отдельно. Имена файлов отражают историю ревью, а не модуль: следующий разработчик, меняющий backupService, не найдет свои тесты по имени.

**Чем грозит.** При рефакторинге бэкапа легко пропустить половину проверок, а после следующего ревью появится reviewFollowup2.test.ts. Стоимость поддержки растет с каждым раундом.

**Что сделать.** Разнести по `server/services/backupArchive.test.ts`, `server/backupService.restore.test.ts`, `server/services/jobRunner.test.ts`, `server/services/outbox.test.ts`. Файлы review*.test.ts расформировать, имена тестов оставить как описание поведения.

*Верификатор:* Тесты restore и расписания бэкапов действительно лежат в reviewRegressions.test.ts:114 и reviewFollowup.test.ts:75, 157 вперемешку с финансовыми, хотя рядом есть backupArchive.test.ts. Это неудобство навигации, а не дефект.

#### N64. Composition root недоделан: в роуты пробрасывается сырой database, сервисы по умолчанию привязаны к боевому синглтону db

- Файл: `server/routes.ts:38`
- Категория: поддерживаемость. Принцип: Dependency Inversion: зависимости собираются в одном месте и явно, без неявных умолчаний
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
export function registerRoutes(app: Express, database: typeof db = db, backups = new BackupService(database)): void {
  const storage = new DatabaseStorage(database);
  ...
  app.use(createInvoicesRouter(storage, authMiddleware, database, invoiceCommands));
  app.use(createMessagesRouter(storage, authMiddleware, database));
  app.use(createMeRouter(storage, authMiddleware, database));
```

**Проблема.** В роутах параллельно живут два пути доступа к данным: фасад storage и сырой database (invoices.ts:32 getInvoiceListMetadata(db, ...), messages.ts: 10 db-вызовов, me.ts: 7, documentStatus.ts, assistant.ts). При этом InvoiceCommands(database = db), PaymentCommands(database = db), JobRunner(database = db) и deliverNotifications(database = db) по умолчанию берут боевой пул, а модули экспортируют синглтоны storage (storage.ts:448) и invoiceCommands (invoiceCommands.ts:192), которые никто не импортирует. Комментарий routeStores.ts:1 «No runtime singleton imports» и тезис DIP в docs/architecture-review-remediation.md:74 этому коду не соответствуют.

**Чем грозит.** Забытый аргумент в тесте или новом скрипте молча подключает его к DATABASE_URL из окружения. Читателю роутера неясно, где граница доступа к данным, и новые эндпоинты будут смешивать оба пути, как это уже сделали documentStatus и assistant.

**Что сделать.** Убрать умолчания `= db` из конструкторов сервисов и JobRunner, сделав параметр обязательным. Удалить экспорты синглтонов storage и invoiceCommands. В registerRoutes собирать объект deps = { storage, commands, queries } и не передавать роутерам database. Read-only SQL из messages/me/documentStatus/assistant вынести в queries-модули с узкими интерфейсами.

*Верификатор:* Частично подтверждаю: сырой database действительно пробрасывается в invoices/messages/me/documentStatus/assistant (routes.ts:46-57) рядом с фасадом, а неиспользуемые синглтоны есть в storage.ts:448 и invoiceCommands.ts:192. Но database внедряется параметром (invoices.ts:18, messages.ts:21), то есть это не импорт синглтона, и умолчание = db в конструкторах ничего не ломает, потому что composition root передает БД явно. Поэтому low.

#### N65. /api/my-bonus-payments отдает ассистенту все выплаты: фильтра по получателю нет, и его не на чем строить

- Файл: `server/routes/acts.ts:34`
- Категория: безопасность. Принцип: Least privilege, ролевая проекция ответа
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
actsRouter.get("/api/my-bonus-payments", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getAssistantBonusPayments()); }
// actsRepo.ts:126-127: return db.select().from(assistantBonusPayments).orderBy(desc(assistantBonusPayments.paymentDate));
```

**Проблема.** Эндпоинт с «my» в имени возвращает всю таблицу: все суммы, заметки админа (notes) и paidBy, то есть внутренний id токена админа. Он идентичен /api/admin/bonus-payments и отличается только ролями. Фильтровать нечем: в assistant_bonus_payments нет колонки получателя. В системе, где ролевая изоляция была главным предметом ревью, эту дыру никто не тронул.

**Чем грозит.** Второй ассистент увидит выплаты первого и служебные пометки админа. id токена админа уходит наружу.

**Что сделать.** Добавить assistant_bonus_payments.recipient_token_id (FK set null) и миграцию существующих строк на текущего ассистента. В роуте фильтровать WHERE recipient_token_id = req.user.token.id и отдавать DTO {id, amount, paymentDate} без paidBy и notes. Оба GET свести к одному ресурсу с projectForRole.

*Верификатор:* Подтверждаю: /api/my-bonus-payments (acts.ts:34-36) отдает всю таблицу с notes и paidBy, фильтровать не по чему. Но при модели «один ассистент» это фактически его же выплаты, а paidBy — id токена, а не сам код, так что утечка небольшая.

#### N66. Два эндпоинта скачивания акта: мертвый /download грузит весь файл в память и отдает data URL с сохраненным mimeType

- Файл: `server/routes/acts.ts:137`
- Категория: поддерживаемость. Принцип: YAGNI; один путь выдачи файла с одной политикой заголовков
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
res.json({ fileName: act.fileName, fileData: await storage.readSignedActData(id), mimeType: act.mimeType });
// actsRepo.ts:186: return act.objectKey ? `data:${act.mimeType || 'application/octet-stream'};base64,${(await objects.get(act.objectKey)).toString('base64')}` : act.fileData;
// src/components/invoices/SignedActsSection.tsx:185: fetch(`/api/acts/${act.id}/content`, ...) — единственный потребитель
```

**Проблема.** После переезда документов в objectStore фронт качает акты потоком через /content (octet-stream, no-store), а старый /api/acts/:id/download оставлен. Вызовов из src у него нет, но он целиком читает объект до 10 MiB в память, раздувает его в base64 JSON и отдает с mimeType из тела загрузки, который при загрузке никак не проверялся. readSignedActData протащен в ActsStore и storagePorts.

**Чем грозит.** Лишняя поверхность атаки и памяти, а при каждом изменении авторизации актов надо помнить про второй путь.

**Что сделать.** Удалить GET /api/acts/:id/download и readSignedActData (actsRepo.ts:183-187, порты), оставить только /content. Если нужен inline-просмотр, отдавать Content-Type из whitelist (application/pdf, image/png, image/jpeg), проверенного на загрузке в zod-схеме acts.ts:104.

*Верификатор:* Подтверждаю: /api/acts/:id/download (acts.ts:125-139) без вызовов из src. Он читает объект целиком и отдает data URL с непроверенным mimeType (actsRepo.ts:186), авторизация при этом корректна.

#### N67. Исправления переписали мертвые виджеты ассистента и построили под них SQL-эндпоинты, контракты и нагрузочные замеры

- Файл: `server/routes/assistant.ts:12`
- Категория: избыточность. Принцип: YAGNI / проверка достижимости кода перед исправлением
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
server/routes/assistant.ts:12: router.get('/api/assistant/invoice-summary', authMiddleware, requireRole('admin', 'assistant'), ...
server/routes/assistant.ts:32: router.get('/api/assistant/invoice-groups', ...
src/components/invoices/assistant/AssistantInsights.tsx:18: const summary = await apiGet(`/assistant/invoice-summary?year=${selectedYear}`, assistantSummarySchema);
grep -rlw 'AssistantInsights|AssistantYearlyOverview|AssistantMonthlyChart|PartnerPerformanceTable' src server: совпадений вне самих файлов нет (и на ece9adf их тоже никто не импортировал).
docs/releases/2026-10-17-review-load.json:37: "/api/assistant/invoice-summary?year=2026": {
```

**Проблема.** Четыре компонента (509 строк) не смонтированы ни в одном экране, но в ходе исправлений их перевели на новые агрегирующие эндпоинты с сырым SQL, zod-схемами (shared/assistantContract.ts), HTTP-тестом (server/reviewCompletion.test.ts:84-91) и прогоном в нагрузочном стенде. Документ docs/architecture-review-remediation.md:131 заявляет 'годовые итоги ... ассистента агрегируются в SQL' как пользовательское улучшение, которого пользователь не видит. Аналогично правились мертвые admin-файлы (PlanHistoryComparison.tsx +18 строк).

**Чем грозит.** Поверхность API и тестов растет за счет кода, у которого нет потребителя; каждый рефакторинг invoiceScope или схемы будет тянуть за собой эти маршруты, а отчет об исправлениях вводит владелицу в заблуждение о том, что изменилось в интерфейсе.

**Что сделать.** Либо смонтировать виджеты в AssistantDashboard осознанно (решение владелицы), либо удалить четыре компонента, server/routes/assistant.ts, shared/assistantContract.ts, их ветки в shared/apiContract.ts, тест и записи нагрузочного стенда; в CI добавить knip/ts-prune с запретом неимпортируемых модулей в src/components.

*Верификатор:* Подтверждено: AssistantInsights, AssistantYearlyOverview, AssistantMonthlyChart и PartnerPerformanceTable (509 строк) нигде не импортируются ни на HEAD, ни на ece9adf. Под них при этом есть эндпоинты с сырым SQL (server/routes/assistant.ts:12,32), тест (server/reviewCompletion.test.ts:86-89) и строки в нагрузочном json. Это мертвый код, бизнес-риска нет.

#### N68. Бюджет попыток по IP расходуют и успешные входы, а фронт сам повторяет логин до трех раз

- Файл: `server/routes/auth.ts:79`
- Категория: безопасность. Принцип: Лимитер наказывает перебор, а не легитимный трафик
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
// server/routes/auth.ts:79, 111-113
const ipStatus = await reserveIpAttempt(ip);
...
// На успехе чистим счётчик кода; IP-счётчик не трогаем
await clearLoginAttempts(code);
// src/contexts/AuthContext.tsx:81-85
const maxRetries = 3;
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const response = await fetch('/api/auth/login', {
```

**Проблема.** После перехода на «резерв до проверки» каждый вход, включая успешный, списывает одну из 30 попыток в час с IP, и вернуть ее нельзя. Офис за одним NAT при сессии 30 минут и повторных входах делит эти 30 попыток на всех. AuthContext при сетевой ошибке или неразборчивом ответе повторяет POST /api/auth/login до трех раз, и каждый повтор, дошедший до Node, тратит и попытку по коду (из 5), и попытку по IP. Когда код заблокирован, клиенту отдается выдуманный locked_until (rateLimiter.ts:47).

**Чем грозит.** При нестабильной сети пользователь блокирует собственный код за одну-две попытки ввода. Объяснять такое оператору приходится вручную через API unlock-user, а UI для него во фронте нет.

**Что сделать.** На успехе списывать IP-попытку обратно (`UPDATE ... SET attempt_count = attempt_count - 1`) или резервировать IP только для неудач. В consumeAttempt возвращать реальный locked_until через `SELECT` в ветке без строки. Повторы логина из AuthContext убрать: сетевую ошибку показывать сразу.

*Верификатор:* Подтверждено: reserveIpAttempt вызывается до проверки и на успехе не чистится (auth.ts:79,111-113). Окно сбрасывается только после часа без попыток (rateLimiter.ts:35), так что при частых входах из-за одного NAT счетчик дорастет до 30. AuthContext.tsx:81-127 повторяет POST при сетевой ошибке или неразборчивом ответе, хотя такие повторы реже доходят до Node. Выдуманный lockedUntil подтвержден (rateLimiter.ts:47).

#### N69. Метаданные аудита (IP, user-agent) собираются вручную в шести роутах, мимо commandActor и с сырым X-Forwarded-For

- Файл: `server/routes/clients.ts:81`
- Категория: DRY. Принцип: DRY; единый источник контекста запроса
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
// server/routes/clients.ts:81
await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_client", ..., ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
// то же в clients.ts:101, acts.ts:118, acts.ts:166, partners.ts:78, partners.ts:96
// server/services/commandActor.ts:6 — новый путь
  tokenId: req.user!.token.id, requestKey: req.get('Idempotency-Key'), ip: req.ip, userAgent: req.get('user-agent'),
```

**Проблема.** Переезд не завершен. Денежные команды берут актора и IP из commandActor(req), а справочники и акты пишут аудит руками, с копипастой выражения для IP и fallback на клиентский заголовок, который из логина убрали как небезопасный. В partners.ts:78,96 в details пишется JSON.stringify(req.body) целиком, тогда как в clients.ts уже есть auditSafeClientBody.

**Чем грозит.** IP в журнале действий подделывается при прямом доступе к порту. Каждый новый роут копирует строку длиной 300 символов, а политику маскирования тел придется править в нескольких местах.

**Что сделать.** Расширить commandActor до `requestContext(req): { tokenId, role, partnerId, clientId, ip: req.ip, userAgent }` и сделать logAssistantAction(ctx, action) единственной сигнатурой аудита. Fallback на x-forwarded-for удалить. Для partners добавить auditSafePartnerBody по образцу клиентов.

*Верификатор:* Ручной сбор IP/UA с `req.ip || req.headers["x-forwarded-for"]` подтвержден в шести местах, а partners.ts:78,96 пишет в аудит `JSON.stringify(req.body)` целиком. Fallback на практике почти недостижим: при живом сокете req.ip всегда определен, так что это DRY-проблема, а не уязвимость.

#### N70. Контракты месяца в аналитических эндпоинтах: часть 1-based, часть 0-based

- Файл: `server/routes/dashboard.ts:52`
- Категория: поддерживаемость. Принцип: Явные типизированные контракты API (shared/apiContract.ts уже есть)
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
dashboard.ts:52-54:
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);
    if (!month || !year) return res.status(400).json(...)   // 1..12, январь=0 отвергается
dashboard.ts:284 `const month = req.query.month !== undefined ? parseInt(req.query.month as string) : new Date().getMonth();` // 0..11
assistant.ts:24 `extract(month from paid)::int - 1 AS month` // 0..11
```

**Проблема.** /api/admin/invoices-by-month и plan-fact (monthNumber 1..12) работают с месяцами 1–12. /api/admin/dashboard-stats, dashboard-invoices, dashboard-recurring и assistant monthly — с 0–11. Ни один zod-контракт этого не фиксирует: роуты делают parseInt без схемы, в отличие от invoiceQueryInput.

**Чем грозит.** Ошибка на единицу при любой новой связке дашборд -> детализация. Сейчас ее ловят только глазами.

**Что сделать.** Ввести в shared/apiContract.ts yearMonthQuery = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }) и перевести все аналитические роуты на 1-based на границе API. Конвертацию в 0-based для JS Date держать внутри репозитория.

*Верификатор:* Подтверждаю: invoices-by-month (dashboard.ts:52-54) ожидает месяц 1–12, и `!month` отвергает 0. dashboard-invoices и dashboard-recurring (dashboard.ts:284) по умолчанию используют getMonth(), то есть 0–11, а getAdminDashboardStats прибавляет к месяцу +1 (adminDashboardRepo.ts:87). Monthly у ассистента — `-1` (assistant.ts:24). zod-схемы для month нет.

#### N71. XLSX-экспорт читает счета до трех раз отдельными запросами без снимка: листы одного файла могут не сходиться

- Файл: `server/routes/export.ts:62`
- Категория: атомарность. Принцип: Согласованность одного отчета; один снимок на документ
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
export.ts:54-55 `const pages = async function* (filtered: boolean) {
      for await (const page of storage.invoiceExportPages(req.user!, query)) {`
export.ts:62 `if (exportTypes.includes('clients')) for await (const page of pages(false)) for (const inv of page) {`
export.ts:91 `for await (const inv of filteredInvoices()) {`
export.ts:154 `for await (const batch of pages(true)) {`
```

**Проблема.** Для листов «Клиенты», «Счета» и «Расходы» генератор invoiceExportPages запускается заново: три независимых прохода keyset-страницами, каждая страница отдельным запросом вне транзакции. Если во время выгрузки создают, оплачивают или правят счет, итоги «Общая сумма» на листе клиентов, строки «Счета» и «Расходы» отражают разные моменты времени. Бэкап при этом использует REPEATABLE READ, а экспорт нет.

**Чем грозит.** Сверка в Excel у бухгалтера изредка не сходится, и найти причину невозможно. Нагрузка на БД втрое выше необходимой при полном экспорте.

**Что сделать.** Выполнять весь экспорт внутри `db.transaction(..., { isolationLevel: 'repeatable read', accessMode: 'read only' })` и передавать tx в invoiceExportPages и expenseExportPages. Итоги по клиентам считать одним агрегирующим SQL (`GROUP BY client_id`) в том же снимке вместо отдельного прохода по всем счетам.

*Верификатор:* export.ts:62, 91 и 154 трижды запускают invoiceExportPages отдельными keyset-запросами вне транзакции, поэтому листы одного XLSX могут отражать разные моменты времени. Для admin-выгрузки на десяток пользователей это редкое и некритичное расхождение.

#### N72. Outbox без конечного состояния и диагностики: недоставляемые уведомления крутятся вечно, тела с ПДн не чистятся и попадают в бэкапы

- Файл: `server/services/outbox.ts:22`
- Категория: поддерживаемость. Принцип: Наблюдаемость фоновой доставки; минимизация хранения ПДн (ФЗ-152)
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
outbox.ts:22-25 `} catch {
      const delay = Math.min(3600000, 10000 * 2 ** Math.min(event.attempts, 9));
      await database.update(notificationOutbox).set({ nextAttemptAt: new Date(Date.now() + delay) })...;
      console.error('[outbox] Delivery deferred', event.id);`
shared/schema.ts:225-232 у notification_outbox нет lastError/failedAt
backupTables.ts:16 `notificationOutbox: schema.notificationOutbox,`
```

**Проблема.** Нет максимума попыток, нет dead-letter, причина ошибки не сохраняется, в лог пишется только id. Событие с неверным токеном бота ретраится раз в час бесконечно. Доставленные строки никогда не удаляются, а body хранит готовый HTML с названием клиента и суммой. Все это попадает в каждый из 30 архивов и восстанавливается при restore.

**Чем грозит.** Сломанная интеграция клиента незаметна. Таблица растет без ограничений, ПДн хранятся дольше, чем нужно, и множатся по копиям.

**Что сделать.** Добавить в notification_outbox `last_error text`, `failed_at timestamptz` и константу MAX_ATTEMPTS (например, 12). После лимита ставить failed_at и показывать счетчик в админке. Добавить job `outbox-retention`, который удаляет delivered старше 30 дней. Служебную таблицу не восстанавливать при restore (см. находку о путях восстановления).

*Верификатор:* В outbox.ts:22-25 нет ни предела попыток, ни dead-letter, ни сохранения причины ошибки: недоставляемое событие повторяется раз в час бесконечно. Доставленные строки никогда не удаляются, а их body с суммой и именем клиента (invoiceNotice.ts:9) попадает во все архивы.

#### N73. Слой портов требует правки в четырех файлах на каждый запрос, а семь доменных интерфейсов декоративны

- Файл: `server/storagePorts.ts:151`
- Категория: избыточность. Принцип: KISS/YAGNI: абстракция должна окупаться заменяемостью, а не множить синхронные правки
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
createInvoiceTransfer(
    args: Parameters<typeof invoiceRepo.createInvoiceTransfer>[1],
  ): ReturnType<typeof invoiceRepo.createInvoiceTransfer>;
// storage.ts:86   async createInvoiceTransfer(args: Parameters<typeof invoiceRepo.createInvoiceTransfer>[1]) { return invoiceRepo.createInvoiceTransfer(this.database, args); }
// routeStores.ts:3-11 export type InvoicesStore = Pick<StorageOperations, | "getInvoice" ...
```

**Проблема.** Чтобы добавить одно чтение, нужно написать функцию в репозитории, продублировать сигнатуру в storagePorts.ts (33 сигнатуры из 408 строк выведены через typeof xRepo.fn, то есть порт зависит от реализации), добавить делегат в storage.ts и имя в Pick в routeStores.ts. Получается около 1180 строк (storage 448 + storagePorts 408 + storageTypes 180 + routeStores 141) чистой делегации. Семь интерфейсов SessionStore/InvoiceRepository/... тут же схлопываются в StorageOperations, и отдельно используется только один (invoiceAccess.ts:2). Репозитории при этом импортируют типы из ../storage (actionLogRepo.ts:14, planningRepo.ts:16, recurringRepo.ts:13), то есть зависят от фасада, который зависит от них.

**Чем грозит.** Для системы на десяток пользователей с одним адаптером (Postgres) это чистая стоимость: каждая фича трогает четыре файла, и порт никогда не станет контрактом, потому что выводится из реализации. Ошибки рассинхрона ловит только tsc.

**Что сделать.** Выбрать одно из двух. Либо удалить DatabaseStorage и storagePorts, а роутерам передавать сами модули репозиториев, частично примененные к db (bindRepo(db, invoiceRepo)), и описывать узкие типы прямо в роутере через Pick<typeof invoiceQueries, ...>. Либо оставить порты, но тогда писать их вручную как источник истины, а репозитории делать implements. Типы DTO из storageTypes импортировать в репозиториях напрямую, а не через ../storage.

*Верификатор:* Подтверждаю: на одно чтение нужна правка в repo, storagePorts (33 сигнатуры через typeof xRepo), storage.ts и routeStores. Отдельно используется только InvoiceRepository (invoiceAccess.ts:2). Это затраты на церемонию без риска для данных и частично пересекается с F79.

#### N74. Непропорциональная инфраструктура фоновых задач для одного процесса: аренда с heartbeat, SKIP LOCKED, ручной бэкап как расписание с датой 9999

- Файл: `server/worker.ts:16`
- Категория: избыточность. Принцип: Пропорциональность решения масштабу (десяток пользователей, один оператор); KISS
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
server/worker.ts:16:
  { key: 'manual-backup', initialRunAt: new Date('9999-01-01'), nextRunAt: () => new Date('9999-01-01'), run: () => backupService.createBackup('manual') },
server/worker.ts:29: const timer = setInterval(tick, 10_000);  (4 задания: INSERT ... ON CONFLICT + UPDATE на каждое, около 70 тыс. запросов в сутки вхолостую)
server/services/jobRunner.ts:29-33: heartbeat setInterval с продлением leaseUntil и токеном владения.
server/services/outbox.ts:10: .orderBy(notificationOutbox.createdAt).limit(20).for('update', { skipLocked: true });
server/routes/recurring.ts:35: POST /api/recurring-invoices/process выполняет ту же генерацию в web-процессе мимо аренды.
docs/releases/2026-10-17-periods-and-backups.md:31: нагрузочный стенд на 100 000 счетов и 300 000 расходов.
```

**Проблема.** Systemd гарантирует один экземпляр worker, но написан распределенный планировщик с арендами, токенами, продлением и восстановлением после краха чужой аренды. Outbox блокирует строки SKIP LOCKED и снимает блокировку при коммите, поэтому реально работает псевдо-аренда через nextAttemptAt+60s. Очередь ручного бэкапа выражена расписанием с датой-сентинелом. При этом HTTP-эндпоинт process обходит всю эту защиту. Стенд на 100 тысяч счетов примерно в 100 раз превышает реальный масштаб.

**Чем грозит.** Каждую новую задачу придется вписывать в модель аренды и сентинелов. Редкие ветки (истекшая аренда, потеря владения) трудно отлаживать одному человеку. Защита от параллельного запуска дырявая из-за HTTP-пути, так что сложность не дает обещанной гарантии.

**Что сделать.** Оставить scheduled_jobs как журнал состояния (nextRunAt, lastError, result), а взаимоисключение сделать через pg_try_advisory_xact_lock(hashtext(key)) вокруг run, без heartbeat и токенов. Тот же lock взять в POST /recurring-invoices/process. Ручной бэкап сделать флагом requested_at в той же строке. Тик раз в 60 секунд. Outbox оставить с простым UPDATE ... SET claimed_until RETURNING без FOR UPDATE.

*Верификатор:* Сентинел 9999 (worker.ts:16), тик раз в 10 с по 4 заданиям, heartbeat-аренда (jobRunner.ts:29-33) и SKIP LOCKED с псевдо-арендой nextAttemptAt+60s (outbox.ts:10-12) подтверждены. Тезис «HTTP process обходит защиту» преувеличен: recurring.ts:35 проходит через generateOccurrence с уникальным ключом периода (recurringRepo.ts:134-135), дублей не будет. Остается избыточность, а не дефект.

#### N75. Ссылка закрывающего документа принимается как произвольный текст и рендерится в href при выключенном CSP

- Файл: `src/components/invoices/AccountantDashboard.tsx:206`
- Категория: безопасность. Принцип: Validate at the boundary / defense in depth
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
src/components/invoices/AccountantDashboard.tsx:206-208:
) : invoice.closingDocumentUrl ? (
  <a
    href={invoice.closingDocumentUrl}
server/services/invoiceCommandInput.ts:26: description: text, clientTitle: text, notes: text, closingDocumentUrl: text,  (text = z.string().max(10000).nullish())
server/app.ts:19: app.use(helmet({ contentSecurityPolicy: false }));
deploy/nginx.conf:33-36 задает HSTS/X-Frame-Options/nosniff/Referrer-Policy, Content-Security-Policy нет.
```

**Проблема.** PATCH /api/invoices/:id/closing-document (server/routes/invoices.ts:287, admin и accountant) и общий PATCH /api/invoices/:id (closingDocumentUrl есть в writable-полях accountant, permissions.ts:83) сохраняют любую строку до 10000 символов: javascript:, data:, относительные пути. React 18.3 такой href не блокирует, CSP нет ни в helmet, ни в nginx. Единственный тест (server/accessPreservation.http.test.ts:180) проверяет только https-путь. Строка также уходит в Excel-выгрузку (server/routes/myInvoices.ts:97).

**Чем грозит.** Любой, у кого есть доступ бухгалтера или админа (а коды доступа раздаются нескольким людям), может положить в скрытый счет ссылку-ловушку, которая выполнится в origin приложения у другого бухгалтера с httpOnly-сессией и CSRF-токеном из localStorage. Это уже не самоатака: localStorage.csrf_token доступен скрипту.

**Что сделать.** В invoiceTerms заменить closingDocumentUrl: text на z.string().trim().url().max(2048).refine(u => /^https:\/\//i.test(u)).nullish(); миграцией обнулить или пометить существующие значения не с https; на фронте рендерить href только через safeExternalUrl(url) с той же проверкой; включить CSP в helmet (default-src 'self'; script-src 'self') и добавить HTTP-тест на отказ 400 для javascript: и data:.

*Верификатор:* Подтверждено: closingDocumentUrl — это просто z.string().max(10000) (invoiceCommandInput.ts:21,26), и он рендерится в href (AccountantDashboard.tsx:206-208); CSP нет ни в helmet (app.ts:19), ни в nginx. Писать в поле могут только admin и accountant, а ссылка в href выводится только на экране бухгалтера (DocumentStatusDashboard.tsx:65 показывает лишь текст), поэтому риск ниже medium.

#### N76. InvoiceCard: ложный тип схемы, мертвый клиентский пересчет денег и фантомные поля в типе пропсов

- Файл: `src/components/invoices/InvoiceCard.tsx:37`
- Категория: поддерживаемость. Принцип: Contract-first / Make illegal states unrepresentable
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
InvoiceCard.tsx:17 `invoice: import("@/lib/invoiceView").InvoiceListView & { clients?: { name?: string; contactPerson?: string }; partners?: { name?: string }; description?: string };`; :37 `const scheme = invoice.scheme as 'agency_30' | 'agency_40' | 'commission_based';`; :40-43 `const commissionRate = invoice.partner_commission_rate ?? invoice.commission_rate ?? undefined; const calc = calculateInvoice({ scheme, ... }); const clientRemaining = invoice.client_remaining ?? calc.client_remaining ?? 0;`; src/lib/invoiceView.ts:16 `client_remaining: parseNum(c?.clientRemaining)`
```

**Проблема.** invoiceListView прогоняет все деньги через parseNum, который никогда не возвращает undefined, поэтому все фолбэки `?? calc.*` и `?? invoice.commission_rate` мертвые. При этом calculateInvoice выполняется на каждом рендере с partnerCommRate=0 и с каст-типом схемы, в котором нет живой 'agency'. Чтобы убрать any, тип пропсов расширили полями clients.contactPerson, partners и description, которых маппер не создает, поэтому строка «Контакт» никогда не отображается. В списке три раскладки одного счета с разной арифметикой: мобильная InvoiceCard, таблица (UnifiedInvoicesList.tsx:582-608) и inline-карточка (UnifiedInvoicesList.tsx:917-980).

**Чем грозит.** Ложное ощущение, что карточка сверяется с движком. При изменении маппера (вернуть null вместо 0) клиентский пересчет внезапно оживет с неверным процентом.

**Что сделать.** Удалить calculateInvoice и фолбэки из InvoiceCard и читать только серверные поля InvoiceListView. В маппере денег отличать отсутствие значения от нуля (number | null). Убрать фантомные поля из типа пропсов, contactPerson добавить в invoiceListView, если он нужен. Сделать InvoiceCard единственной карточкой: удалить inline-карточку из UnifiedInvoicesList и рендерить InvoiceCard и в desktop-режиме cards.

*Верификатор:* Подтверждаю: parseNum никогда не возвращает undefined, поэтому фолбэки ?? calc.* в InvoiceCard.tsx:40-46 мертвые, а calculateInvoice вызывается впустую с кастом схемы без 'agency' (:37). Поля clients.contactPerson, partners и description invoiceListView не создает, поэтому строка «Контакт» (:122-124) не показывается никогда. Ее не было и на ece9adf, так что это не регрессия.

#### N77. Тариф 1000/2000 продублирован на фронте, мертвые колонки бонуса в invoice_calculations, invoiceCount считается по другому фильтру

- Файл: `src/components/invoices/admin/AssistantBonusManager.tsx:116`
- Категория: DRY. Принцип: Single Source of Truth для денежных констант; схема без мертвых полей
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
const executorActsAmount = executorActsCount * 1000;
  const companyActsAmount = companyActsCount * 2000;
// src/components/invoices/assistant/AssistantBonusCard.tsx:90-91: stats.companyActsCount * 2000 / stats.executorActsCount * 1000
// shared/schema.ts:167-168: assistantBonusActs / assistantBonusPaid — ни одной записи/чтения, кроме whitelist в server/permissions.ts:94
// actsRepo.ts:156-159: invoicesWithActs без фильтра hideFromAssistant, тогда как earned считается с excludeHidden=true (actsRepo.ts:147)
```

**Проблема.** Тариф живет в четырех местах: два в actsRepo (это уже F51) и два независимых пересчета на фронте, которые показывают разбивку по типам актов. Колонки invoice_calculations.assistant_bonus_acts и assistant_bonus_paid мертвые, но перечислены в permissions-проекции, то есть выглядят частью контракта. getUnpaidBonusTotal возвращает invoiceCount и invoiceIds по всем оплаченным счетам, включая скрытые, а сумму считает только по видимым, так что цифры одного ответа несогласованы между собой.

**Чем грозит.** Если поменять тариф на сервере, UI продолжит показывать старую разбивку. Мертвые колонки кто-нибудь «оживит» как второй источник истины. Админ видит в диалоге выплаты счетчик, не совпадающий с суммой.

**Что сделать.** Тариф отдавать с сервера в /api/assistant/stats (executorAmount, companyAmount), а на фронте перестать умножать. Миграцией удалить assistant_bonus_acts и assistant_bonus_paid и убрать их из permissions.ts:94. Если invoiceIds останутся нужны после удаления markBonusesAsPaid, считать их по тому же visibleCondition, иначе убрать из ответа.

*Верификатор:* Подтверждаю: тариф продублирован на фронте (AssistantBonusManager.tsx:116-117, AssistantBonusCard.tsx:90-91). Колонки assistant_bonus_acts/paid встречаются только в схеме и в permissions.ts:94. invoicesWithActs (actsRepo.ts:156-159) не учитывает hideFromAssistant, тогда как earned считается с excludeHidden=true (147). Последствия ограничиваются отображением: подписью «за N счетов» и мертвым invoiceIds.

#### N78. Поведение дашбордов проверяется в файлах, названных по волне ревью, а не по функции

- Файл: `src/components/invoices/reviewCompletion.test.tsx:82`
- Категория: тесты и DX. Принцип: Тесты как документация поведения
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
src/components/invoices/reviewCompletion.test.tsx:81: it('loads accountant documents/history at canonical URLs and displays transport failures', async () => {
server/reviewCompletion.test.ts:67: it('calculates balances over every matching record, respects role/date filters and preserves zero balances', async () => {
server/reviewCompletion.test.ts:83: it('returns scoped annual aggregates without transporting individual invoices', async () => {
```

**Проблема.** Тесты балансов клиентов, годовых итогов партнера и вкладок бухгалтера лежат в reviewCompletion.test.ts(x) рядом с тестами переносов и денежного округления; по имени файла нельзя найти тест для ClientBalancesView или PartnerDashboard. При этом композиция метрик партнера на фронте (signedActsCount, reservedForExpenses) не проверена ни одним тестом.

**Чем грозит.** Следующий агент, меняющий дашборд, не найдет его тесты и не узнает, что они есть; файлы review* будут расти с каждой волной ревью и станут свалкой.

**Что сделать.** Разнести по функциям: server/repositories/invoiceSummaryRepo.test.ts, server/routes/documentStatus.test.ts, src/components/invoices/AccountantDashboard.test.tsx, src/components/invoices/PartnerDashboard.test.tsx (с проверкой итоговых карточек); имена review*/remediation* в новых тестах запретить.

*Верификатор:* Тест бухгалтера в reviewCompletion.test.tsx на строке 82, а не 81; балансы и годовые итоги проверяются в server/reviewCompletion.test.ts:67,83. Фронтовую сборку signedActsCount и reservedForExpenses в PartnerDashboard не проверяет ни один тест в src: эти имена встречаются только в серверном dashboardRepo.partnerHero.test.ts.

#### N79. Обновление одного счета инвалидирует все финансовые запросы приложения

- Файл: `src/hooks/useInvoiceCommands.ts:19`
- Категория: производительность. Принцип: Least astonishment / точная инвалидация
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
src/hooks/useInvoiceCommands.ts:19  const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);
src/hooks/useInvoiceExpenseActions.ts:11  const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);
src/lib/financialQueries.ts:11-13  const prefixes = ['/api/invoices', '/api/admin/', '/api/client/', '/api/partner', '/api/clients', '/api/do-not-spend', '/api/expected-', '/api/dashboard/', '/api/assistant', ...
src/hooks/useAdminDashboardRefresh.ts:41-43  const intervalId = setInterval(() => { invalidateAll(); }, DEFAULT_REFETCH_INTERVAL);
```

**Проблема.** Вместо доменной инвалидации (счет X → его деталь, список, зависимые сводки) любое действие в карточке зовет предикат по 16 префиксам и 11 легаси-ключам: правка заметки, даты, видимости, периода. В хуках useInvoice* 27 таких вызовов. Тот же предикат админ-дашборд прогоняет каждые 120 с и при каждом возврате на вкладку. Функция называется fetchInvoiceDetails, хотя перечитывает все.

**Чем грозит.** Карточка открыта поверх админ-дашборда, поэтому каждое сохранение перезапрашивает все смонтированные виджеты (десятки агрегирующих SQL). Имя функции вводит в заблуждение, и следующий автор будет добавлять туда же новые префиксы.

**Что сделать.** В financialQueries.ts завести `invalidate.afterInvoiceEdit(qc, id, kind)`: для метаданных (notes, dates, visibility) обновлять только detail и list, для денежных правок (terms, expenses, periods, status) обновлять detail, list и сводки. fetchInvoiceDetails переименовать в refreshInvoice и вызывать для метаданных узкий вариант.

*Верификатор:* Подтверждаю: useInvoiceCommands.ts:19 и useInvoiceExpenseActions.ts:11 зовут invalidateFinancialQueries, а useAdminDashboardRefresh.ts:41-43 прогоняет его каждые 120 с. Но invalidateQueries перезапрашивает только активные запросы, а пользователей около десятка, так что реальная цена мала: low.

#### N80. Словарь статусов счета дублируется и уже расходится в соседних хуках

- Файл: `src/hooks/useInvoiceCommands.ts:32`
- Категория: DRY. Принцип: DRY / единый словарь домена
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
src/hooks/useInvoiceCommands.ts:32  const getStatusLabel = (value: string) => ({ draft: 'Черновик', sent: 'Отправлен', paid: 'Оплачен', cancelled: 'Отменен' }[value] ?? value);
src/hooks/useInvoiceStatusCommands.ts:28-32  const labels = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён", };
src/hooks/useInvoiceStatusCommands.ts:12  status: "draft" | "sent" | "paid" | "cancelled";
shared/domainTypes.ts:6  export type InvoiceStatus = typeof INVOICE_STATUSES[number];
```

**Проблема.** В двух новых хуках одной карточки два разных словаря подписей (Отменен/Отменен). Union статусов вручную повторен 6 раз, хотя в shared/domainTypes.ts есть INVOICE_STATUSES/InvoiceStatus. Подпись «Черновик» встречается в 15 файлах src.

**Чем грозит.** Одна и та же карточка показывает статус по-разному в заголовке и в диалоге подтверждения. Новый статус (например, partially_paid) придется добавлять в 6+ union'ов и 15 словарей, и tsc пропустит забытые места.

**Что сделать.** Добавить `INVOICE_STATUS_LABELS: Record<InvoiceStatus, string>` в shared/domainTypes.ts (или src/lib/format.ts) и использовать его везде. Union'ы заменить на InvoiceStatus. Через eslint no-restricted-syntax запретить литерал 'Черновик' вне словаря.

*Верификатор:* Подтверждаю: в useInvoiceCommands.ts:32 'Отменен', в useInvoiceStatusCommands.ts:28-32 'Отменен'. Union статусов вручную повторен в useInvoiceStatusCommands.ts:12/26/64 и InvoiceCard.tsx:14, хотя есть shared/domainTypes.ts InvoiceStatus. Это косметика.

#### N81. Два хука для одной постраничной выдачи /api/invoices и третья ручная сборка параметров

- Файл: `src/hooks/useInvoicePage.ts:9`
- Категория: DRY. Принцип: DRY / один источник для одного ресурса
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
src/hooks/useInvoicePage.ts:9-10: return useQuery({ queryKey: ['/api/invoices', 'page', params.toString()], enabled, queryFn: () => apiGet(`/invoices?${params}`, invoicePageSchema), staleTime: 30000 });
src/hooks/usePagedInvoices.ts:31: const query = useQuery({ queryKey: ['/api/invoices', 'paged', role, filterKey, page], placeholderData: keepPreviousData, queryFn: async () => invoicePageSchema.parse(await apiGet<unknown>(`/invoices?${params}`)) as InvoicePage,
src/components/invoices/assistant/ClientBalancesView.tsx:465-469: const params = new URLSearchParams({ page: String(page), limit: '25', search, ... }); useEffect(() => setPage(1), [search, filterFrom, filterTo, includeUndated]);
```

**Проблема.** Новые хуки появились параллельно: useInvoicePage (AccountantDashboard, ClientCard) и usePagedInvoices (списки) ходят в один эндпоинт с разными ключами ('page' и 'paged'), разной политикой placeholderData и разной валидацией (схема аргументом против parse с приведением 'as InvoicePage'). Сброс страницы через useEffect после смены фильтра повторен трижды (ClientBalancesView:469, ClientCard:189, usePagedInvoices:30) и порождает лишний запрос со старой страницей. DocumentStatusDashboard.tsx:23 кладет ответы /closing-docs-status под префикс '/api/invoices' только ради общей инвалидации.

**Чем грозит.** Одна и та же страница счетов кэшируется дважды, а исправление (например, сброс страницы при выходе за pages, который есть только в usePagedInvoices:37-41) придется переносить вручную; неявная привязка read-моделей к префиксу '/api/invoices' сломается при первой попытке навести порядок в ключах.

**Что сделать.** Оставить один usePagedQuery<T>(resource, filters, schema) с ключом financialKeys.page(resource, filters), keepPreviousData и встроенным сбросом страницы при смене filters (страница как часть состояния хука, а не useEffect у потребителя); useInvoicePage и usePagedInvoices выразить через него; инвалидацию документов делать через invalidateFinancialQueries, а не через чужой префикс.

*Верификатор:* Два хука к одному /api/invoices с разными ключами ('page' и 'paged') и разной валидацией подтверждены (useInvoicePage.ts:9-10, usePagedInvoices.ts:32-33). Сброс страницы через useEffect есть в ClientBalancesView.tsx:469, ClientCard (ClientBalancesView.tsx:190, не 189) и usePagedInvoices.ts:30, поэтому сначала уходит лишний запрос со старой страницей.

#### N82. Два хука одной страницы счетов с разными ключами и контрактами; справочник клиентов добывается запросом счетов

- Файл: `src/hooks/usePagedInvoices.ts:32`
- Категория: DRY. Принцип: DRY / Interface Segregation
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
usePagedInvoices.ts:10-15 `interface InvoicePage { invoices: InvoiceDto[]; total: number; pages: number; ... }` и :32-33 `useQuery({ queryKey: ['/api/invoices', 'paged', role, filterKey, page], ... queryFn: async () => invoicePageSchema.parse(await apiGet<unknown>(`/invoices?${params}`)) as InvoicePage`; useInvoicePage.ts:9-10 `useQuery({ queryKey: ['/api/invoices', 'page', params.toString()], enabled, queryFn: () => apiGet(`/invoices?${params}`, invoicePageSchema), staleTime: 30000 });`; TransferFundsDialog.tsx:40-41 `const directory = useInvoicePage({ page: 1, limit: 1 }, open); const clientOptions = directory.data?.clients ?? [];`
```

**Проблема.** Для одного эндпоинта GET /invoices есть два хука с разными пространствами ключей ('paged' и 'page'), разной сборкой параметров и разной типизацией: в одном локально переобъявлен интерфейс и сделан каст `as InvoicePage` поверх Zod, другой выводит тип из схемы. TransferFundsDialog запрашивает страницу счетов размером 1 ради побочного поля clients, так что справочник клиентов прибит к контракту списка счетов.

**Чем грозит.** Любое изменение контракта страницы (фильтр, поле, сортировка) придется вносить в два хука. Удаление clients из ответа списка молча сломает перенос средств.

**Что сделать.** Оставить один `useInvoicePage(filters: InvoicePageFilters)` с ключом `financialKeys.invoicePage(filters)` и типом из `z.infer<typeof invoicePageSchema>`. usePagedInvoices сделать тонкой оберткой над ним, которая только хранит фильтры и страницу. Справочник клиентов вынести в `useClientDirectory()` → `GET /api/clients?fields=id,name`.

*Верификатор:* Подтверждаю: usePagedInvoices.ts:10-15,32-33 (локальный interface и каст as InvoicePage поверх Zod, ключ 'paged') и useInvoicePage.ts:9-10 (ключ 'page') обращаются к одному GET /invoices. TransferFundsDialog.tsx:40-41 получает справочник клиентов запросом страницы счетов с limit:1. Это дублирование, на корректность оно не влияет.

#### N83. Транспорт фронта держит собственный реестр идемпотентных команд в виде регулярки по URL

- Файл: `src/lib/api.ts:25`
- Категория: спагетти. Принцип: Единственный источник правды; транспорт не знает бизнес-реестра
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
const retrySafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    && /^\/api\/(?:invoices(?:\/transfer|\/[^/]+(?:\/(?:expenses|periods|archive))?)?|expenses\/[^/]+|transfers\/[^/]+|partner-payments(?:\/[^/]+)?)$/.test(url)
    && (options.body === undefined || typeof options.body === 'string');
  if (pendingSession !== csrfToken) { uncertainCommands.clear(); pendingSession = csrfToken; }
```

**Проблема.** Список того, какие команды сервер дедуплицирует по Idempotency-Key, задан дважды: на сервере вызовами commandActor(req) (invoices.ts:80…293, partners.ts:165-179) и на клиенте этой регуляркой. Они уже разошлись: PATCH /api/invoices/:id/closing-document на сервере идет через квитанции (invoices.ts:293), а в регулярку не попал. Если новый роут совпадет с регуляркой, а квитанций у него не будет, команда при сетевом сбое выполнится дважды. Смена сессии определяется сравнением csrf из localStorage в трех местах (api.ts:28,44,51).

**Чем грозит.** Каждая новая денежная команда требует синхронной правки в двух местах на разных языках слоя. Ошибка в одну сторону дает двойную запись денег, в другую тихо отключает повтор.

**Что сделать.** Пусть сервер сам объявляет контракт: роуты с квитанциями возвращают заголовок `Idempotency: supported` или помечены в shared/apiContract.ts флагом `idempotent: true` рядом со схемой ответа. apiRequest повторяет запрос только по этому флагу. Регулярку удалить, сессию отслеживать по поколению из AuthContext, а не по localStorage.

*Верификатор:* Дублирование реестра регуляркой подтверждено (api.ts:25-27). Пример с расхождением слабый: closing-document фронт вызывает сырым fetch из AccountantDashboard.tsx:62 мимо apiRequest, поэтому регулярка на него не влияет. Все роуты, которые сейчас попадают под регулярку, проходят через commandActor (invoices.ts, partners.ts), а повтор запроса бывает только при TypeError сети, так что риск пока гипотетический.

#### N84. Контракт идемпотентности продублирован регуляркой путей во фронте

- Файл: `src/lib/api.ts:26`
- Категория: спагетти. Принцип: Single source of truth для контракта API; сервер объявляет свои гарантии
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
const retrySafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    && /^\/api\/(?:invoices(?:\/transfer|\/[^/]+(?:\/(?:expenses|periods|archive))?)?|expenses\/[^/]+|transfers\/[^/]+|partner-payments(?:\/[^/]+)?)$/.test(url)
```

**Проблема.** Какие серверные мутации защищены квитанциями (InvoiceCommands/PaymentCommands), клиент решает регуляркой по URL, вручную синхронизированной с таблицей маршрутов сервера. Шаблон invoices/[^/]+ совпадает с любым будущим POST/PATCH /api/invoices/<что-угодно>. Новый эндпоинт без квитанции (импорт, дублирование счета) будет автоматически повторен при сетевой ошибке и создаст дубль. При этом PATCH /api/invoices/:id/closing-document идет через invoiceCommands.update, но в регулярку не попал. Совпадение держится только на дисциплине.

**Чем грозит.** Любое добавление или перенос роута (см. F122) молча меняет семантику повторов на клиенте. Ошибку в одну сторону не видно (нет повтора), в другую она дает дубли денежных записей.

**Что сделать.** Пусть сервер объявляет гарантию явно. Либо в shared/apiContract.ts завести перечень idempotentCommands: { method, path }[], который импортируют и роутеры (регистрация через него), и api.ts. Либо сервер отвечает заголовком Idempotency-Supported: 1 на ответах command-роутов, а клиент повторяет только эндпоинты, однажды подтвердившие поддержку. Регулярку удалить.

*Верификатор:* Подтверждаю: в api.ts:26 клиент решает об автоповторе регуляркой по URL, и шаблон invoices/[^/]+ совпадет с любым будущим POST /api/invoices/<x>. Повтор происходит только один раз и только при сетевом TypeError (api.ts:42-46). Упоминание closing-document не по делу: фронт вызывает его сырым fetch (AccountantDashboard.tsx:62) мимо api.ts, так что регулярка там вообще не участвует.

#### N85. API-клиент выбирает поведение по регулярным выражениям URL, которые повторяют серверную маршрутизацию

- Файл: `src/lib/api.ts:26`
- Категория: избыточность. Принцип: Explicit over implicit / KISS
- Серьезность у автора находки: средняя; итоговая, после верификатора: низкая

```
src/lib/api.ts:25-27
  const retrySafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    && /^\/api\/(?:invoices(?:\/transfer|\/[^/]+(?:\/(?:expenses|periods|archive))?)?|expenses\/[^/]+|transfers\/[^/]+|partner-payments(?:\/[^/]+)?)$/.test(url)
src/lib/api.ts:29-30  const signature = retrySafe ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', ...
src/lib/api.ts:63  const validator = schema ?? apiResponseContract(url, method);
shared/apiContract.ts:24  if (['GET', 'PATCH'].includes(method) && /^\/api\/invoices\/[a-f0-9-]{36}$/.test(path)) return invoiceDtoSchema;
src/hooks/usePagedInvoices.ts:33  queryFn: async () => invoicePageSchema.parse(await apiGet<unknown>(`/invoices?${params}`)) as InvoicePage
```

**Проблема.** apiRequest неявно решает две вещи по строке URL: можно ли повторить команду с тем же Idempotency-Key (регэксп в api.ts:26) и какой zod-схемой проверить ответ (реестр regex в shared/apiContract.ts). Оба списка вручную повторяют маршруты сервера, при этом шаблоны id расходятся: `[^/]+` против `[a-f0-9-]{36}`. Вызывающий код об этом поведении не знает: usePagedInvoices проверяет ответ дважды (неявно и явно). Для повторного запроса считается SHA-256 по телу и хранится модульная Map неподтвержденных команд, и все это для около десятка пользователей и одного повтора при TypeError.

**Чем грозит.** Новый или переименованный серверный маршрут молча меняет семантику повторов и валидации на клиенте, и ни typecheck, ни lint этого не поймают. Логику повтора невозможно понять без чтения регулярного выражения на 150 символов.

**Что сделать.** Сделать поведение явным параметром вызова: `apiCommand(path, body, { idempotent: true })` для команд с квитанциями и `apiGet(path, schema)` с обязательной схемой для критичных ресурсов. apiResponseContract и регэксп retrySafe удалить. Ключ идемпотентности генерировать в хуке команды (один на попытку пользователя), вместо хеша тела в модульной Map.

*Верификатор:* Код такой, как описано: регэксп retrySafe в api.ts:26, реестр в shared/apiContract.ts с `[^/]+` на строках 19/23/25 против `[a-f0-9-]{36}` на строке 24, и двойной parse в usePagedInvoices.ts:33, потому что apiGet без схемы уже валидирует /api/invoices. Но расхождение ведет к безопасному исходу (нет повтора или нет проверки), а идемпотентный повтор денежных команд оправдан, так что это low.

#### N86. invalidateFinancialQueries: широкая инвалидация на каждое сохранение мелкого поля и ручной реестр строковых префиксов

- Файл: `src/lib/financialQueries.ts:11`
- Категория: производительность. Принцип: KISS / иерархические query keys вместо реестра строк
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
financialQueries.ts:11-15 `const prefixes = ['/api/invoices', '/api/admin/', '/api/client/', '/api/partner', '/api/clients', '/api/do-not-spend', '/api/expected-', '/api/dashboard/', '/api/assistant', '/api/accountant', ...]; const legacyKeys = new Set(['dashboard-stats', 'invoices', ...]);`; useInvoiceCommands.ts:19 `const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);`; InvoiceDetailsDialog.tsx:154 `onSuccess={fetchInvoiceDetails}` при том, что AddExpenseDialog.tsx:95 уже вызвал invalidateFinancialQueries
```

**Проблема.** Сохранение заметки, номера счета или названия для клиента рефетчит все активные дашборды по 16 префиксам и 11 legacy-ключам, а добавление расхода делает это дважды. Имя fetchInvoiceDetails врет о семантике. Реестр строк держится на памяти разработчика: ключ, который не начинается ни с одного префикса, молча перестанет обновляться.

**Чем грозит.** Лишняя нагрузка на единственный VDS и хрупкость при добавлении новых экранов. Для десятка пользователей не критично, но стоит дорого при сопровождении.

**Что сделать.** Перевести ключи на иерархию `['finance', 'invoices', ...]` и `['finance', 'dashboards', ...]` и инвалидировать по префиксу ['finance']. Для метаданных без влияния на деньги (notes, clientTitle, invoiceNumber) инвалидировать только `financialKeys.invoice(id)` и список. Переименовать fetchInvoiceDetails в invalidateFinance и убрать повторный вызов через onSuccess.

*Верификатор:* Подтверждаю: любое сохранение мелкого поля инвалидирует все запросы по 16 префиксам и 11 legacy-ключам (financialQueries.ts:11-24), а добавление или редактирование расхода делает это дважды (AddExpenseDialog.tsx:95 плюс onSuccess={fetchInvoiceDetails}, InvoiceDetailsDialog.tsx:154). Имя fetchInvoiceDetails вводит в заблуждение. Для десятка пользователей это косметика.

#### N87. Страница 'Бухгалтерия' только для админа дублирует журнал бухгалтера, а у бухгалтера два пункта меню ведут на один экран

- Файл: `src/pages/AccountingPage.tsx:22`
- Категория: DRY. Принцип: DRY
- Серьезность у автора находки: низкая; итоговая, после верификатора: низкая

```
src/pages/AccountingPage.tsx:12, 22, 53: interface ActionLog { ... / const ACTION_TYPE_LABELS: Record<string, string> = { / if (role !== 'admin') {
src/components/invoices/AccountantDashboard.tsx:26: const ACTION_TYPE_LABELS: Record<string, string> = {
src/pages/InvoicesDashboard.tsx:21: {role === 'accountant' && <AccountantDashboard />}
src/pages/InvoicesListPage.tsx:38-39: if (role === 'accountant') { return <AccountantDashboard />; }
```

**Проблема.** AccountingPage называется 'Бухгалтерия', но бухгалтеру недоступна; она повторяет словарь действий и вручную типизирует журнал, тогда как AccountantDashboard уже переведен на accountantLogsSchema. В сайдбаре бухгалтера (AppSidebar.tsx:89-104) 'Главная' и 'Счета' рендерят один и тот же AccountantDashboard; у клиента такой же дубль убрали с комментарием, у бухгалтера нет.

**Чем грозит.** Новый тип действия придется добавлять в два словаря; журнал админа и журнал бухгалтера будут расходиться по формату без контракта.

**Что сделать.** Вынести ACTION_TYPE_LABELS и компонент ActionLogList({logs}) в src/components/shared, AccountingPage читать через схему из shared/invoiceContract.ts; переименовать страницу в 'Журнал бухгалтерии'; у бухгалтера оставить один пункт меню.

*Верификатор:* Подтверждено: AccountingPage доступна только админу (AccountingPage.tsx:53), держит свой ACTION_TYPE_LABELS и ручной ActionLog и читает другой эндпоинт /assistant-logs?role=accountant (AccountingPage.tsx:39). У бухгалтера в AppSidebar.tsx:89-104 «Главная» и «Счета» ведут на один AccountantDashboard, хотя у клиента такой же дубль убран с комментарием (AppSidebar.tsx:118-119).


## 3. Незакрытые находки 17.10 подробно


### Серьезность: критично

#### F2. IP-лимитер верит X-Forwarded-For на открытом сокете, а лимитер по коду при переборе не срабатывает — частично

- Было: `server/routes/auth.ts:80` (ece9adf). Сейчас: `server/app.ts:14; server/vite.ts:64; server/routes/auth.ts:75`
- Категория: безопасность. Принцип: Defense in depth не должна зависеть от сетевой топологии, о которой код не знает

```
app.set("trust proxy", 1);
server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
const ip = req.ip || "unknown";
```

**Что осталось.** Исправлено: в логине убран fallback на сырой X-Forwarded-For, лимитер атомарен. Осталось: процесс по умолчанию слушает 0.0.0.0, а HOST не задан ни в deploy/finance-duck.service, ни в .env.example. trust proxy задан числом 1, а не адресом nginx, поэтому при прямом доступе к :5000 подделанный XFF по-прежнему дает новый ключ IPLOCK:* на каждый запрос. Глобального лимитера на /api/auth/login без ключа нет (rateLimiter.ts:65-66 только по коду и по IP), а перебор разных кодов per-code счетчик не копит. Fallback `req.ip || req.headers["x-forwarded-for"]` жив в аудит-логе в 6 местах (clients.ts:81,101; acts.ts:118,166; partners.ts:78,96).

**Исходная проблема.** Сервер слушает 0.0.0.0:5000 и с trust proxy=1 берет req.ip из X-Forwarded-For первого хопа. Если соединение идет мимо nginx напрямую на :5000 (в бэклоге проекта порт открыт наружу), атакующий сам выставляет заголовок и получает новый ключ IPLOCK на каждый запрос. При этом лимит по коду, как честно написано в комментарии, при spraying вообще не накапливается. В итоге оба лимитера защищают только от одного неудачливого пользователя с опечаткой.

**Что сделать.** Слушать 127.0.0.1 (или unix-socket), nginx — единственная точка входа; trust proxy настраивать адресом nginx, а не числом. Добавить глобальный лимитер на /api/auth/login без ключа (N попыток в минуту на весь инстанс) плюс экспоненциальную задержку ответа при неудаче; убрать fallback на сырой заголовок.

*Верификатор:* Подтверждаю: в логине теперь `const ip = req.ip || "unknown"` (auth.ts:75), но server/vite.ts:64 слушает `process.env.HOST ?? "0.0.0.0"`, HOST не задан ни в deploy/finance-duck.service, ни в .env.example. trust proxy по-прежнему числом 1 (app.ts:14), глобального лимитера нет (rateLimiter.ts:65-66), а fallback на сырой XFF остался в шести вызовах аудита (clients.ts:81,101; acts.ts:118,166; partners.ts:78,96).


### Серьезность: высокая

#### F4. Крипта кодов fail-open: нет секрета — все молча в открытом тексте, dual-lookup живет вечно — открыто

- Было: `server/lib/accessCode.ts:20` (ece9adf). Сейчас: `server/lib/accessCode.ts:20-25; server/repositories/userRepo.ts:62; server/index.ts:8`
- Категория: безопасность. Принцип: Fail-closed; явная версия схемы данных вместо вечной обратной совместимости

```
const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const accessCodeCryptoEnabled = SECRET.length >= 16;
const aesKey  = accessCodeCryptoEnabled ? createHash("sha256").update(SECRET + ":aes").digest()  : Buffer.alloc(32);
...
or(eq(accessTokens.code, lh), eq(accessTokens.code, code)),
```

**Что осталось.** accessCode.ts с ece9adf не менялся (git diff пустой). Без секрета коды молча пишутся открытым текстом (userRepo.ts:187-188). Dual-lookup остался безусловным, KDF и версии ключа нет. Миграция по-прежнему запускается fire-and-forget при каждом старте веб-процесса (index.ts:8-10), хотя появился отдельный migrate.ts. Есть и расхождение: .env.example:19 требует «минимум 32 символа», код принимает 16. Fail-closed в проде появился только для архивов бэкапа (backupArchive.ts:41), коды он не защищает.

**Исходная проблема.** Забытая переменная в .env при переезде/рестарте — и новые коды пишутся plaintext, старые расшифровать нечем («—» в UI), ошибки нет, лог молчит. Поиск по открытому тексту остается в запросе навсегда «для нулевого риска локаута», то есть невозможно доказать, что в таблице не осталось plaintext-строк, и невозможно удалить ветку. Ключи выводятся конкатенацией SECRET+":aes" через один sha256 без KDF и без версии ключа — ротация секрета ломает все codeEnc разом.

**Что сделать.** При NODE_ENV=production и отсутствии секрета — throw на старте (сервер не поднимается). Миграцию делать явной одноразовой командой (`npm run migrate:codes`) с записью флага в таблицу settings; после нее убрать OR-ветку. Ключи через crypto.hkdfSync(secret, salt, info) с префиксом версии `hmac2:`/`enc2:`, чтобы ротация была добавлением ключа, а не катастрофой.

*Верификатор:* accessCode.ts:20-25 по-прежнему fail-open (`SECRET.length >= 16`), userRepo.ts:187-188 пишет открытый код, если секрета нет, безусловный dual-lookup `or(eq(code, lh), eq(code, code))` стоит в userRepo.ts:62. Миграция запускается fire-and-forget при старте (index.ts:8-10). В .env.example:19 написано «минимум 32 символа», код принимает 16; fail-closed в проде есть только в backupArchive.ts:41.

#### F7. dashboardRepo склеивает четыре независимых потребителя, партнерская аналитика размазана по трем репозиториям — частично

- Было: `server/repositories/dashboardRepo.ts:1` (ece9adf). Сейчас: `server/repositories/dashboardRepo.ts:1-6; server/repositories/adminDashboardRepo.ts:5,44; server/repositories/financialReportsRepo.ts:122,255; server/storage.ts:193-206`
- Категория: SOLID. Принцип: SRP (один модуль — одна причина меняться), ISP

```
dashboardRepo.ts: `export { getAdminMonthlyData, getAdminDashboardStats, getDashboardInvoices } from './adminDashboardRepo'; ... export { getClientOverviewBuckets } from './clientOverviewRepo';` / adminDashboardRepo.ts:44 `export async function getAdminDashboardStats(db: DB, getRecurringExpectedForMonth: (y: number, m: number) => Promise<...>` / adminDashboardRepo.ts:5 `import type { DashboardInvoiceDetail, MonthlyData } from "../storage";`
```

**Что осталось.** Файл разрезан по потребителю: admin, partnerDashboard, partnerDebt, clientBudget, clientOverview. Обе половины «Не тратить» теперь в одном financialReportsRepo (getDoNotSpendData + getPartnerSchemeDoNotSpendData). Осталось: партнерская аналитика по-прежнему размазана по partnerDashboardRepo, partnerDebtRepo, financialReportsRepo, invoiceSummaryRepo, partnerRepo и storage.getDashboardStats (storage.ts:193-206 считает долг партнера в God-объекте). Колбэк в getAdminDashboardStats на месте. Read-model'ей в shared нет: типы инлайн в сигнатурах или импортируются из '../storage', хотя storageTypes.ts существует. dashboardRepo.ts сохранен как фасад-реэкспорт.

**Исходная проблема.** Файл на 1471 строку объединяет функции с разными потребителями (админ, партнер, клиент), разными правилами видимости и разными источниками дат; при этом «Не тратить» разрезано пополам между dashboardRepo и reportsRepo по признаку схемы, а партнерские отчеты лежат в dashboardRepo, partnerRepo и reportsRepo без принципа. getAdminDashboardStats получает чужую функцию колбэком через фасад, чтобы обойти циклический импорт — признак того, что границы модулей проведены не по домену, а по истории выноса из storage.ts.

**Что сделать.** Разложить по потребителю: server/analytics/admin/ (monthly, dashboardStats, dashboardInvoices, planFact, forecast), server/analytics/partner/ (debt, hero, expectedCommission, doNotSpend — обе половины), server/analytics/client/ (budget, overviewBuckets, agencyReport). Каждый пакет экспортирует типизированные read-model'и (shared/analytics/*.ts) вместо инлайн-типов в сигнатурах. Общие SQL-фрагменты (moneyDate, isOverdue, схемы, expensesByInvoice) — в server/analytics/sqlPredicates.ts; колбэк в getAdminDashboardStats заменить прямым импортом recurring-прогноза из того же пакета.

*Верификатор:* Подтверждаю: dashboardRepo.ts:1-6 — фасад-реэкспорт, колбэк getRecurringExpectedForMonth в adminDashboardRepo.ts:44 на месте, типы импортируются из '../storage' (adminDashboardRepo.ts:5, partnerDashboardRepo.ts:5, planningRepo.ts:16, reportsRepo.ts:13), долг партнера по-прежнему считается в storage.ts:193-206.

#### F8. Денежная математика переписана вручную внутри отчетов с другими дефолтами, чем в движке — частично

- Было: `server/repositories/dashboardRepo.ts:411` (ece9adf). Сейчас: `server/repositories/financialReportsRepo.ts:197-200; server/repositories/clientOverviewRepo.ts:132-136; server/storage.ts:166; server/repositories/searchRepo.ts:175`
- Категория: DRY. Принцип: DRY (единая формула) / OCP (новая схема = правка в 4 файлах)

```
financialReportsRepo.ts:199 `: clientBill * (scheme === 'agency_40' ? 0.6 : 0.7); // agency_40: 60%, agency_30: 70%` / clientOverviewRepo.ts:134 `: inv.scheme === 'agency_30' ? 30 : 40;` / storage.ts:166 `if (scheme === 'agency_30' || scheme === 'agency_40' || scheme === 'agency') {` / searchRepo.ts:175 `AND i.scheme IN ('agency_30', 'agency_40', 'agency')`
```

**Что осталось.** Устранено: getPartnerSchemeDoNotSpendData берет сохраненную комиссию (financialReportsRepo.ts:359 `const commission = parseNum(row.calculations.commissionAmount);`) и больше не пересчитывает clientBill*rate с дефолтом 10%. Появился реестр SCHEME_POLICIES/isAgencyScheme. Осталось: запасные формулы 0.6/0.7 и 30/40 в двух отчетах, причем для гибкой 'agency' в них по-прежнему разная база (clientBill−agencyMargin против commissionRate). Литеральные списки схем остались в storage.ts:166 и searchRepo.ts:175 вопреки предупреждению в financialEngine.ts. Одноразовой миграции «старых строк без расчета» нет.

**Исходная проблема.** В invoice_calculations уже хранится commissionAmount, посчитанный движком, но getPartnerSchemeDoNotSpendData считает комиссию заново по clientBill * rate с дефолтом 10%, тогда как движок для commission_based берет 0%. getClientOverviewBuckets и getDoNotSpendData держат собственные коэффициенты 30/40 и 0.6/0.7 как «запасной путь», причем для гибкой схемы 'agency' в reportsRepo база считается через agencyMargin, а в dashboardRepo — через commissionRate; storage.ts:468 фильтрует схемы литералами вопреки предупреждению в financialEngine.ts:21-26.

**Что сделать.** Запретить арифметику с clientBill вне shared/financialEngine.ts: отчеты читают только сохраненные поля invoice_calculations; для «старых строк без расчета» завести одноразовую миграцию через recalculateAllInvoices вместо fallback-формул в каждом отчете. Константы ставок (30/40, дефолт комиссии) экспортировать из движка одной таблицей SCHEME_DEFAULTS, а литералы схем заменить на isAgencyScheme / PARTNER_SCHEMES из того же модуля (включая searchRepo.ts:172 и dashboardRepo.ts:340).

*Верификатор:* Запасные формулы на месте: financialReportsRepo.ts:197-199 (`clientBill * (scheme === 'agency_40' ? 0.6 : 0.7)`), clientOverviewRepo.ts:134 (`'agency_30' ? 30 : 40`). Литеральные списки схем тоже остались: storage.ts:166 и searchRepo.ts:175. Комиссия партнерских схем теперь берется из сохраненного значения (financialReportsRepo.ts:359).

#### F9. «Дата денег» определена семью разными способами в одной подсистеме — частично

- Было: `server/repositories/dashboardRepo.ts:540` (ece9adf). Сейчас: `server/repositories/adminDashboardRepo.ts:25,97; server/repositories/reportsRepo.ts:180,208; server/repositories/planningRepo.ts:128,184-186; server/repositories/invoiceSummaryRepo.ts:14; server/repositories/partnerDashboardRepo.ts:21; server/routes/assistant.ts:16`
- Категория: DRY. Принцип: DRY / Single Source of Truth

```
adminDashboardRepo.ts:25 `extract(month FROM coalesce(i.actual_payment_date, i.payment_date))` vs :97 `COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))` / reportsRepo.ts:208 `const paymentDateStr = row.invoice.paymentDate || row.invoice.createdAt;` / planningRepo.ts:128 `if (row.invoice.status === 'paid' && row.invoice.paymentDate) {` / invoiceSummaryRepo.ts:14 `coalesce(${invoices.paymentDate}, ${invoices.createdAt}::date) >= ...` / assistant.ts:16 `${invoices.actualPaymentDate} >= ${`${year}-01-01`}::date`
```

**Что осталось.** Живой 500 устранен: getInvoicesByMonth больше не ссылается на plannedPaymentDate (reportsRepo.ts:277 `COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.issueDate}::date)`). Модуля moneyDate нет, и вариантов стало больше: в новом коде добавились invoiceSummaryRepo (план→создание, факт игнорируется), partnerDashboardRepo (только createdAt) и assistant.ts (только факт; оплаченные счета без actualPaymentDate выпадают). getAdminMonthlyData и getAdminDashboardStats в одном файле по-прежнему расходятся на ветке DATE(createdAt).

**Исходная проблема.** Один и тот же вопрос — «в какой месяц попали деньги по счету» — отвечается по-разному: getAdminDashboardStats/getDashboardInvoices (SQL: факт → план → создание), getAdminMonthlyData (факт → план, без создания), getClientLTV (план → создание, факт игнорируется), getInvoicesByMonth (факт → план → несуществующая колонка → issueDate), getAdminPlanFact (только план), getAdminForecast (факт → план для оплаченных, иной набор для остальных), route /financial-plans/history (только план). Комментарий на строках 535-539 признает, что из-за этого карточка месяца уже расходилась с годовой сводкой.

**Что сделать.** Ввести модуль server/analytics/sqlPredicates.ts с единственным SQL-фрагментом moneyDate(invoices) и JS-двойником moneyDateOf(inv) (один набор правил, покрытый тестом эквивалентности). Все отчетные функции обязаны фильтровать и группировать только через него; eslint-правило запрещает прямое обращение к invoices.paymentDate/actualPaymentDate вне этого модуля и invoiceRepo.

*Верификатор:* Вариантов даты денег по-прежнему много: adminDashboardRepo.ts:25 против :97 (там добавлен DATE(createdAt)), reportsRepo.ts:208 `paymentDate || createdAt`, planningRepo.ts:128 берет только paymentDate, invoiceSummaryRepo.ts:14 — paymentDate→createdAt, partnerDashboardRepo.ts:21 — только createdAt, assistant.ts:16 — только actualPaymentDate. Ошибку SQL в getInvoicesByMonth исправили (reportsRepo.ts:277).

#### F13. Роутер на 914 строк: HTTP, авторизация, выборка, агрегация, HTML-шаблон с CSS и резолв шрифтов в одном файле — частично

- Было: `server/routes/export.ts:1` (ece9adf). Сейчас: `server/routes/export.ts:19-29, 186-196, 258-269, 396-460, 488-499, 762-780`
- Категория: SOLID. Принцип: SRP (Single Responsibility), Separation of Concerns; DRY

```
const FONT_CANDIDATES = [ ... ]; ... if (req.user?.role === "partner") { const partnerOwnId = req.user.partnerId; ... invoices = invoices.filter(inv => inv.partnerId === partnerOwnId); ... const html = `<!DOCTYPE html> ... <style>
```

**Что осталось.** Чтение данных вынесено: readClientReportInvoices (services/clientReportQuery.ts, 19 строк) и invoiceExportPages со скоупом в SQL. Остальное на месте: файл 946 строк, резолв шрифтов, HTML/CSS-шаблон, табличный движок pdfkit и агрегация живут внутри обработчиков. Ролевой фильтр по-прежнему скопирован 4 раза и теперь просто дублирует SQL-скоуп. Фильтр дат продублирован (270-271, 500-501 и далее), clientName-IIFE повторена трижды, RFC 5987 Content-Disposition собирается двумя разными кодами (528-534 и 915-935).

**Исходная проблема.** Пять обработчиков по 60-250 строк каждый: тенант-скоупинг partner/client скопирован 4 раза с мелкими отличиями (preview не возвращает 403 при пустой выборке, остальные три — возвращают), фильтр по датам скопирован 5 раз, clientName-IIFE — 3 раза, формирование Content-Disposition с RFC 5987 — 2 раза разным кодом (504-510 и 892-908). Внутри одного обработчика — и запрос к storage, и денежная агрегация, и 65 строк HTML/CSS-шаблона, и табличный движок для pdfkit. Это контроллер, который одновременно является view-слоем и сервисом отчетов.

**Что сделать.** Разнести по слоям: `server/reports/clientReportQuery.ts` (один `loadReportInvoices(db, scope)`), `clientReportModel.ts` (агрегация), `renderers/{html,pdf,xlsx}.ts`, `server/lib/contentDisposition.ts` (одна функция `attachmentHeader(name)`), `server/lib/fonts.ts`. Тенант-скоупинг — общий `scopeFor(actor): InvoiceScope` в `server/invoiceAccess.ts` (там уже живет findAuthorizedInvoice), используемый export/myInvoices/me. Роут — 10-15 строк: разобрать body (zod), вызвать сервис, отдать поток.

*Верификатор:* Ролевой фильтр по-прежнему скопирован в export.ts:186-196, 258-269, 488-499 и 762-780. Фильтр дат, clientName-IIFE (274-278, 504-508, 798-803), FONT_CANDIDATES (19) и HTML-шаблон (396) тоже остались в обработчиках. Content-Disposition собирается двумя разными кодами (528-534 и 915-935), файл занимает 946 строк. Вынесено только чтение через clientReportQuery.ts.

#### F14. Четыре копии классификатора схем в export.ts разошлись: гибкая 'agency' выпадает из бюджетного блока HTML/PDF/XLSX — открыто

- Было: `server/routes/export.ts:266` (ece9adf). Сейчас: `server/routes/export.ts:287-288, 294, 514-515, 553, 811-812, 834`
- Категория: DRY. Принцип: DRY; Single Source of Truth для доменной классификации

```
const agency  = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40"); ... const rate = inv.scheme === "agency_30" ? 30 : 40; ... const agencyInvoices = invoices.filter(inv => inv.scheme === "agency_30" || inv.scheme === "agency_40");
```

**Что осталось.** Дефект не изменился. Preview (213) учитывает 'agency', а HTML, PDF и XLSX нет: счет по гибкой схеме попадает в closed, и клиент не видит расходов и остатка. Ставка маржи зашита как 30/40 вместо calc.commissionRate. isAgencyScheme в export.ts не используется. Тестов на распределение схем в отчетах нет: exportsAndDocuments.http.test.ts проверяет только стриминг и лимит 2000.

**Исходная проблема.** Коммит 5c2ed6c («Фикс: счет по гибкой схеме 'agency' не попадал в бюджетный блок») заявляет правку «routes/export.ts (фильтр отчета + подписи схем)», но diff по export.ts тронул только preview (195) и schemeMap (73). Три рендерера — HTML (266), PDF (490), XLSX (784) — по-прежнему знают только agency_30/40. Итог: по одной из двух ЖИВЫХ схем отчет-preview показывает клиенту «Доступно/Потрачено/Осталось», а скачанный PDF/XLSX кладет тот же счет в «Счета (партнерские и комиссионные)» без бюджета. Вдобавок ставка маржи захардкожена `? 30 : 40` в четырех местах — для гибкой схемы процент лежит в calc.commissionRate, поэтому простое добавление 'agency' в фильтр даст 40% для любого счета. `isAgencyScheme` из shared/financialEngine в export.ts не импортирован.

**Что сделать.** Ввести `server/reports/clientReportModel.ts`: `buildClientReport({ invoices, viewer }) → { summary, agencyRows, closedRows, period, clientName }` — единственное место, где используются `isAgencyScheme()` и `calc.commissionRate` (ставка — из расчета, не из имени схемы). Рендереры `renderHtml(model)`, `renderPdf(model, stream)`, `renderXlsx(model)` — чистые функции без доступа к storage и req. Snapshot-тест модели на все 6 схем, включая 'agency' с нестандартной маржой.

*Верификатор:* export.ts:287-288, 514-515 и 811-812 по-прежнему фильтруют только agency_30/agency_40, а ставка захардкожена как `? 30 : 40` (294, 553, 650, 834). При этом preview (213) учитывает 'agency', а shared/schemePolicies.ts в export.ts не используется. Тестов на распределение схем в HTML/PDF/XLSX нет: accessPreservation.http.test.ts:150 проверяет только preview по agency_30.

#### F16. Авторизация 129 эндпоинтов не покрыта: единственный тест роутов мокает и storage, и middleware — частично

- Было: `server/routes/tenantIsolation.security.test.ts:31` (ece9adf). Сейчас: `server/accessPreservation.http.test.ts:33-60; server/reviewCompletion.test.ts:38-39; server/routes/tenantIsolation.security.test.ts:34`
- Категория: тесты и DX. Принцип: Тестируй контракт границы, а не ее имитацию

```
accessPreservation: const app = createApp({ database: database() }); sessions[role] = { Cookie: `session_id=...`, 'X-CSRF-Token': session.csrfToken }; reviewCompletion: req.user = { role: req.get('x-test-role') as s.UserRole || 'admin', partnerId, clientId, token };
```

**Что осталось.** Появились HTTP-тесты на полном createApp с настоящими сессиями и CSRF: accessPreservation (5 ролей × 6 схем на /api/invoices и дочерних ресурсах), architectureRemediation R1–R8, middleware.security.test.ts на CSRF. На фронте прибавились тесты AuthContext, financialMutations и reviewCompletion.tsx. Предложенной матрицы «роль × эндпоинт», которая строится из реестра роутеров, нет. Эндпоинтов 134, HTTP-тесты затрагивают около 11 префиксов /api, новый роут без строки в матрице ничего не уронит. reviewCompletion.test.ts:38 и tenantIsolation.security.test.ts:34 по-прежнему подменяют аутентификацию заголовком x-test-role или vi.mock.

**Исходная проблема.** Из 14 файлов роутов тестируются два, и те с подменой authMiddleware/requireRole на заглушки, читающие роль из заголовка x-test-role: реальная проверка сессии, CSRF и роли не исполняется ни в одном тесте. routes/assistant.ts, me.ts, messages.ts (прямой db, мимо фасада) без тестов вообще; export.ts (914 строк денежных отчетов) — без тестов; фронт — два теста хелперов, ни одного компонента при 31 700 строках.

**Что сделать.** Интеграционный харнес: реальный express app + реальные middleware + PGlite с seed-токенами всех 5 ролей; табличный тест матрицы «роль × эндпоинт → ожидаемый статус», список эндпоинтов извлекать из роутеров автоматически (app._router.stack), чтобы новый роут без строки в матрице ронял тест. Для фронта — Testing Library на InvoiceDetailsDialog и UnifiedInvoicesList (две крупнейшие точки ролевой логики).

*Верификатор:* accessPreservation.http.test.ts:58 поднимает настоящий createApp с сессиями и CSRF (:45-46), но покрывает только /api/invoices и его дочерние ресурсы. Матрицы «роль × эндпоинт» из реестра роутов нет. reviewCompletion.test.ts:38-39 (x-test-role) и tenantIsolation.security.test.ts:34 (vi.mock middleware) по-прежнему подменяют аутентификацию.

#### F17. Порт 5000 захардкожен на 0.0.0.0 при trust proxy — прямой доступ в обход nginx и подделка IP в журнале — частично

- Было: `server/vite.ts:111` (ece9adf). Сейчас: `server/vite.ts:62-64; server/app.ts:14; server/routes/auth.ts:75; .env.example:7; deploy/activate-release.sh:58`
- Категория: безопасность. Принцип: Secure by default, конфигурация вне кода

```
const port = Number(process.env.PORT ?? 5000);
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
// app.ts:14
  app.set("trust proxy", 1);
// auth.ts:75
    const ip = req.ip || "unknown";
```

**Что осталось.** Порт и хост теперь читаются из env, это единственное изменение. Умолчание осталось небезопасным: 0.0.0.0, а HOST нет ни в .env.example, ни в unit-файле, так что на проде процесс по-прежнему слушает все интерфейсы. trust proxy = 1 безусловный, ключ IP-лимита входа и ipAddress аудита (commandActor.ts:6, clients.ts:81, partners.ts:78, acts.ts:118) по-прежнему берутся из req.ip, который подделывается через X-Forwarded-For при прямом заходе на :5000. Новый дрейф: PORT сделали настраиваемым, но nginx.conf:49 и health-check в activate-release.sh:58 жестко ждут 127.0.0.1:5000.

**Исходная проблема.** Сервер слушает все интерфейсы, порт не конфигурируется, а в index.ts:11 стоит `app.set("trust proxy", 1)`. Если 5000 доступен снаружи (в бэклоге проекта это зафиксировано как открытый мимо nginx), клиент бьет напрямую по HTTP без TLS и сам выставляет X-Forwarded-For — Express считает его доверенным. Этот `req.ip` идет в ключ рейт-лимита входа (routes/auth.ts:80 `const ip = req.ip || ...`) и во все 15 записей журнала действий (`ipAddress: req.ip || req.headers["x-forwarded-for"]`). Куки с флагом Secure при этом не поставятся (auth.ts:28 `isProxied = x-forwarded-proto === "https"`), но сессионный доступ по cookie через HTTP остается.

**Что сделать.** HOST и PORT — из валидированного конфига (см. находку про config.ts), умолчание HOST=127.0.0.1 в production; закрыть 5000 на уровне ufw/iptables. Рейт-лимит входа ключевать по req.socket.remoteAddress, когда запрос пришел не от доверенного прокси. В nginx проксировать только через unix-socket или 127.0.0.1.

*Верификатор:* Подтверждаю: vite.ts:64 слушает process.env.HOST ?? "0.0.0.0", а HOST нет ни в .env.example, ни в deploy/finance-duck.service. app.ts:14 безусловно ставит trust proxy 1, auth.ts:75 берет req.ip, commandActor.ts:6 тоже, так что при прямом заходе на :5000 IP подделывается через X-Forwarded-For. nginx.conf:49 и activate-release.sh:58/62 по-прежнему жестко ждут 5000.

#### F18. Файлы актов как base64 в text-колонке: 20MB JSON-боди, список актов тянет все блобы, скачивание через JSON — частично

- Было: `shared/schema.ts:219` (ece9adf). Сейчас: `server/services/objectStore.ts:15-57; server/repositories/actsRepo.ts:25-45, 183-187; server/routes/acts.ts:104, 125-139; server/app.ts:33-37; shared/schema.ts:275`
- Категория: модель данных. Принцип: Разделение данных и метаданных (SRP на уровне схемы); валидация на границе

```
fileData: z.string().optional(), mimeType: z.string().max(120).optional() ... res.json({ fileName: act.fileName, fileData: await storage.readSignedActData(id), mimeType: act.mimeType }); ... const bigJson = express.json({ limit: "20mb" });
```

**Что осталось.** Исправлено: FileObjectStore с sha256-ключом вне SQL, decodeDocument с лимитом 10 MiB и проверкой base64, список актов без блобов (select(metadata)), потоковый /content с octet-stream и no-store, миграция migrateDocumentObjects. Осталось: загрузка по-прежнему идет base64 внутри JSON через 20 МБ body-parser. mimeType принимается любой строкой, без whitelist и без проверки магических байт. Колонка file_data и чтение через select() в getSignedAct сохранились. Легаси-эндпоинт /api/acts/:id/download все еще отдает data-URL внутри JSON (readSignedActData держит весь файл в памяти), хотя фронт использует только /content.

**Исходная проблема.** Файл хранится как data-URL (+33% к размеру) в text-колонке. getSignedActsByInvoice делает `select()` без списка колонок — для отображения СПИСКА актов из БД вычитываются все base64-тела, которые роут тут же выбрасывает. Скачивание отдает файл внутри JSON (двойная сериализация, фронт делает `link.href = data.fileData`). Загрузка: ни проверки mime-типа, ни префикса `data:`, ни размера после декодирования, ни санитизации fileName — сохраняется любая строка, которую пришлет assistant/accountant, и отдается обратно как есть. Блобы в таблице раздувают каждый seq scan, VACUUM, реплику и (когда их наконец добавят) бэкап.

**Что сделать.** Ввести `FileStore` (интерфейс put/get/delete/stream) с реализацией на диске `/var/finance-duck/files/<uuid>` (путь уже разрешен в systemd ReadWritePaths); в `signed_acts` хранить `storage_key, size_bytes, sha256, mime_type, original_name`, колонку `file_data` мигрировать и удалить. Загрузка — multipart (multer, лимит 10 МБ, whitelist pdf/png/jpg, проверка магических байт), скачивание — `res.sendFile`/stream с `Content-Disposition: attachment` и `X-Content-Type-Options: nosniff`. В репозитории всегда явный `select({...})` без тела файла.

*Верификатор:* Метаданные отделены (actsRepo.ts:31-41 select(metadata)), объекты хранятся вне SQL, есть потоковый /content. Осталось: загрузка base64 в JSON через 20mb (app.ts:33-37), mimeType принимается любой строкой до 120 символов (acts.ts:104), getSignedAct делает select() вместе с file_data (actsRepo.ts:44-46). Легаси /api/acts/:id/download (acts.ts:125-139) отдает data-URL целиком из памяти.

#### F19. Четыре независимых маппера API -> модель счета с разными именами полей — частично

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:245` (ece9adf). Сейчас: `src/lib/invoiceView.ts:17; src/lib/invoiceDetailsView.ts:68; server/permissions.ts:50-57; src/components/invoices/UnifiedInvoicesList.tsx:959-969`
- Категория: DRY. Принцип: DRY / Anti-Corruption Layer

```
invoiceView.ts:17 `partner_commission_rate: parseNum(inv.partnerCommissionRate)` против invoiceDetailsView.ts:68 `partner_commission_rate: parseNum(parseNum(invoiceData.calculations?.commissionRate))`; в ROLE_INVOICE_PERMISSIONS.admin (permissions.ts:51-57) поля 'partnerCommissionRate' нет
```

**Что осталось.** Исправлено: normalizeInvoiceFromApi/normalizeInvoiceListFromApi убраны, TransferFundsDialog и InvoicePage работают с типизированным InvoiceDto (Zod), угадывания `r.client_id ?? r.clientId` больше нет. Осталось: два независимых snake_case-маппера (invoiceListView и invoiceDetailsView) поверх camelCase DTO, то есть три представления одного счета, и partner_commission_rate они по-прежнему берут из разных источников. Сервер не отдает partnerCommissionRate ни одной роли, а parseNum(undefined) возвращает 0, поэтому в карточках списка всегда «Комиссия (0%)», а «К переводу от партнера» считается как bill минус расходы (UnifiedInvoicesList.tsx:969). Для того же счета диалог показывает реальный процент.

**Исходная проблема.** Тот же camelCase->snake_case маппинг написан еще раз в UnifiedInvoicesList.tsx:83-116 (queryFn), в services/invoices.ts normalizeInvoiceFromApi/normalizeInvoiceListFromApi, а TransferFundsDialog.tsx:51-62 угадывает формат: `clientId: r.client_id ?? r.clientId ?? r.client?.id ?? null`, `clientBill: Number(r.client_bill ?? r.clientBill ?? r.calculations?.clientBill ?? 0)`. InvoicePage работает с сырым camelCase. Поле partner_commission_rate в диалоге берется из calculations.commissionRate, а в списке — из inv.partnerCommissionRate (UnifiedInvoicesList:107) — для схемы 'agency' это разные числа (маржа vs процент партнера, см. CreateInvoiceDialog.tsx:128-130).

**Что сделать.** Единственный маппер normalizeInvoice в src/lib/services/invoices.ts (или вовсе отказ от snake_case на фронте: сервер уже отдает camelCase, клиент использует его напрямую через общий тип из shared/contracts). UnifiedInvoicesList, InvoiceDetailsDialog, TransferFundsDialog, RecordPaymentDialog получают данные только через invoiceService/useInvoice*. TransferFundsDialog вместо GET /invoices целиком вызывает GET /clients/:id/invoices?withRemaining=1.

*Верификатор:* Ручные мапперы и угадывание формата в TransferFundsDialog убраны: там теперь InvoiceDto и calculations.clientRemaining (TransferFundsDialog.tsx:53). Но src/lib/invoiceView.ts:17 берет partner_commission_rate из inv.partnerCommissionRate, которого нет в белом списке ROLE_INVOICE_PERMISSIONS (server/permissions.ts:51-57; projectInvoiceForRole копирует только поля из списка, :246-252), поэтому в списке получается 0. invoiceDetailsView.ts:68 берет тот же процент из calculations.commissionRate, так что источники по-прежнему разные.

#### F20. Для живой схемы 'agency' отображаются захардкоженные 30%/70%/15% схемы agency_30 — открыто

- Было: `src/components/invoices/UnifiedInvoicesList.tsx:976` (ece9adf). Сейчас: `src/components/invoices/UnifiedInvoicesList.tsx:917-952; src/components/invoices/details/InvoiceCalculationsSection.tsx:163,191; src/components/invoices/InvoiceWaterfallChart.tsx:72-73; src/components/invoices/InvoiceCard.tsx:268,281; UnifiedInvoicesList.tsx:798`
- Категория: DRY. Принцип: DRY / Single Source of Truth

```
UnifiedInvoicesList.tsx:920-921 `<span>Маржа агентства (30%):</span>` / `<span>{formatCurrency((invoice.client_bill || 0) * 0.30)}</span>`; InvoiceCalculationsSection.tsx:163 `{invoice.scheme === "agency_40" ? "40%" : "30%"}):`; InvoiceWaterfallChart.tsx:72 `const partnerPercent = scheme === "agency_40" ? "16%" : "15%";`
```

**Что осталось.** Ветка по-прежнему выбирается через isAgency30 = isAgencyScheme(scheme), то есть и для гибкой 'agency'. Суммы в desktop-карточках считаются умножением client_bill на 0.30/0.70/0.15 при том, что в той же view-модели лежат agency_margin, partner_share_from_margin и admin_share_from_margin. Табличный режим того же компонента (UnifiedInvoicesList.tsx:590-597) берет серверные поля, так что один и тот же счет показывает разные доли в зависимости от режима просмотра. Подписи процентов захардкожены во всех четырех местах, describeScheme не введен.

**Исходная проблема.** Ветка выбирается по isAgency30 = isAgencyScheme(invoice.scheme), а isAgencyScheme возвращает true и для гибкой 'agency' (invoiceHelpers.ts:13). Для счета 'agency' с маржой 20% и партнером 5% карточка покажет админу и партнеру 30%/70%/15% и суммы client_bill*0.30/0.15. Та же ошибка: InvoiceDetailsDialog.tsx:1427 `invoice.scheme === 'agency_40' ? '40%' : '30%'`, :1448 `'60%' : '70%'`; InvoiceWaterfallChart.tsx:72-73 `partnerPercent = scheme === "agency_40" ? "16%" : "15%"`; InvoiceCard.tsx:267,280; UnifiedInvoicesList.tsx:856 `marginRate = invoice.scheme === 'agency_40' ? 40 : 30`. При этом сервер уже возвращает agency_margin, partner_share_from_margin, admin_share_from_margin — они игнорируются в пользу умножения на константу.

**Что сделать.** Запретить литералы коэффициентов и строк с процентами в src/components: все проценты и суммы берутся из invoice_calculations (calc.commission_rate для маржи, partner_share_from_margin и т.д.). Ввести в shared/financialEngine.ts describeScheme(scheme, calc) -> { marginLabel, partnerLabel, adminLabel } и использовать ее в карточках, диалоге и водопаде. Удалить isAgency30 как имя, оставить isAgencyScheme только для выбора раскладки, не для чисел.

*Верификатор:* Подтверждаю: в UnifiedInvoicesList.tsx:917-952 при isAgency30=isAgencyScheme(...) (:730) суммы считаются как client_bill*0.30/0.70/0.15. Подписи процентов захардкожены в InvoiceCalculationsSection.tsx:162,190, InvoiceWaterfallChart.tsx:72-73 и InvoiceCard.tsx:268,281, а таблица (:589-597) берет серверные поля. describeScheme в src и shared не найден.

#### F21. Деньги партнера и остатки клиентов пересчитываются на фронте из списка счетов, дублируя financialEngine — частично

- Было: `src/components/invoices/assistant/ClientBalancesView.tsx:96` (ece9adf). Сейчас: `src/components/invoices/PartnerDashboard.tsx:167-176; src/components/invoices/assistant/ClientBalancesView.tsx:49-63`
- Категория: DRY. Принцип: DRY / Single Responsibility (расчет денег принадлежит движку)

```
const signedActsCount = documentRisk ? totalPaidInvoices - documentRisk.missingActsCount : 0; ... const reservedForExpenses = agency30Remaining + partnerSchemeDoNotSpend;
```

**Что осталось.** Устранено: ClientBalancesView больше не пересчитывает остатки (getRemaining теперь просто n(inv.calculations?.clientRemaining), фолбэк 'rem !== 0' удален), группы и итоги считает SQL в server/repositories/invoiceSummaryRepo.ts:22 (/api/invoices/client-balances); yearlyCommission партнера перенесен на сервер (invoiceSummaryRepo.ts:9, /api/invoices/partner-summary). Осталось: signedActsCount по-прежнему вычитается на фронте из двух разных запросов (partner-summary считает все оплаченные без года, document-risk свой скоуп), reservedForExpenses складывается на фронте из двух эндпоинтов do-not-spend (PartnerDashboard.tsx:171-173); getWorkingBudget/getSpent в ClientBalancesView.tsx:49-59 дублируют SQL-формулу budget из invoiceSummaryRepo.ts:27-28 для построчного показа; сломанный /api/partner/hero-metrics не удален (server/routes/partners.ts:291), то есть серверных определений комиссии теперь два.

**Исходная проблема.** ClientBalancesView.tsx:64-100 (getWorkingBudget/getSpent/getRemaining) повторяет формулу shared/financialEngine.ts:180-181 `clientRemaining = plannedExpenses > 0 ? Math.max(0, clientBill * (1 - executorExpenses / plannedExpenses))` с собственной логикой фолбэков (`if (rem !== 0) return rem;` строка 81 считает ноль «нет данных»), затем buildClientGroups (112-143) суммирует бюджеты по клиентам, хотя сервер уже отдает ровно это в /api/do-not-spend (partners.ts:316). PartnerDashboard.tsx:200-238 считает yearlyCommission по правилу `isAgencyScheme(inv.scheme) ? partnerShareFromMargin : commissionAmount` и год по `paymentDate || createdAt`, reservedForExpenses как сумму двух других эндпоинтов, signedActsCount как `totalPaidInvoices - documentRisk.missingActsCount` (строки 224-226), где два числа приходят из разных запросов в разные моменты. Параллельно существуют серверные /api/my-debt, /api/expected-commission, /api/partner/document-risk.

**Что сделать.** Все агрегаты, показываемые на дашбордах, переносить в dashboardRepo/partnerRepo как именованные эндпоинты (/api/partner/summary → {yearlyCommission, reserved, acts}) с вычислением через calculateFinancials; на фронте оставить только форматирование. ClientBalancesView переключить на /api/do-not-spend + /api/do-not-spend/partner-schemes, удалить getRemaining/getWorkingBudget.

*Верификатор:* Подтверждаю: балансы и yearlyCommission ушли в SQL (invoiceSummaryRepo.ts:9-19, 22-55), но signedActsCount и reservedForExpenses по-прежнему собираются на фронте (PartnerDashboard.tsx:170-176). Причем totalPaidInvoices в partner-summary считается без фильтра по году, фильтр стоит только у суммы. Старый /api/partner/hero-metrics жив (partners.ts:291) и считает год по createdAt (partnerDashboardRepo.ts:21).

#### F22. Три API-слоя плюс 25 сырых fetch; три вызова бьют в /api/api/... — частично

- Было: `src/lib/api.ts:59` (ece9adf). Сейчас: `src/lib/api.ts:69-76; src/components/invoices/admin/AdminCashFlowForecast.tsx:41; server/vite.ts:43; src/contexts/AuthContext.tsx:46`
- Категория: спагетти. Принцип: KISS / DRY / единая точка входа (Facade)

```
api.ts:74 `if (!endpoint.startsWith('/') || endpoint.startsWith('/api/')) throw new Error(...)` только в apiGet; api.ts:69 `export async function api<T>(endpoint...) { return apiRequest<T>(`/api${endpoint}`, options); }` без проверки; AdminCashFlowForecast.tsx:41 `const apiGet = async (path: string) => { const response = await fetch(`/api${path}`...`; vite.ts:43 `server.use("/{*path}", (_req, res) => { res.sendFile(...index.html) })`
```

**Что осталось.** Исправлено: AccountantDashboard.tsx:54 вызывает apiGet('/accountant-logs?limit=50', accountantLogsSchema) без двойного префикса, src/lib/apiHelpers.ts удален, apiGet бросает ошибку, если путь начинается с /api/. Осталось: защита стоит только в apiGet, а api/apiPost/apiPatch/apiPut/apiDelete (api.ts:69-101) продублированный префикс не ловят. Сырых fetch('/api/...') вне api.ts 27, из них мутации в ManageAccessCodesDialog.tsx:62-187, AccessCodesManager.tsx:57-180, ClientDashboard.tsx:159-231, ExportFiltersDialog.tsx:238, SecurityPage.tsx:86, и каждая сама подставляет CSRF. Мертвые CurrentMonthPlanFact.tsx и AdminCashFlowForecast.tsx нигде не импортируются, второй держит свой apiGet. Правила eslint против fetch нет. JSON-404 для неизвестных /api/* на сервере тоже нет: в server/routes.ts:38-58 нет обработчика после роутеров, catch-all в vite.ts:43 по-прежнему отдает index.html со статусом 200.

**Исходная проблема.** api.ts добавляет префикс `/api`, поэтому `apiGet('/api/invoices')` уходит на `/api/api/invoices` — у сервера нет 404-обработчика для неизвестных /api-путей, запрос получает index.html со статусом 200 и `response.json()` падает SyntaxError: три таких вызова (AccountantDashboard ×2, CurrentMonthPlanFact). AdminCashFlowForecast объявляет собственный apiGet с тем же именем. apiHelpers.ts (126 строк, all-any, своя ensureSessionContext с собственным кешем сессии) не импортируется нигде. Еще 25 мест вызывают fetch('/api/...') напрямую, 13 из них — мутации, каждая со своим способом передать CSRF.

**Что сделать.** Оставить один модуль src/lib/api.ts с классом ApiError {status, code, body} и единственной функцией request(); запретить `fetch(` вне него правилом eslint no-restricted-globals. Префикс /api делать невозможно продублировать: принимать путь без ведущего `/api` и в dev бросать, если endpoint.startsWith('/api'). Удалить apiHelpers.ts и локальный apiGet в AdminCashFlowForecast. Файловые загрузки (export, closing-document) выразить через тот же клиент с опцией responseType: 'blob'. На сервере добавить `app.all('/api/*', 404 JSON)` после роутеров.

*Верификатор:* Подтверждаю: проверка /api/ стоит только в apiGet (src/lib/api.ts:74), а api/apiPost/apiPatch/apiPut/apiDelete (api.ts:69-101) ее не делают. В server/app.ts:29-50 и routes.ts:38-58 нет JSON-404 для /api/*, а vite.ts:43 `server.use("/{*path}", ...)` отдает index.html; AdminCashFlowForecast.tsx и CurrentMonthPlanFact.tsx нигде не импортируются. Мелкая поправка: литеральных fetch('/api…') вне api.ts я насчитал 25, а не 27.


### Серьезность: средняя

#### F24. Документация описывает несуществующую систему: README — шаблон Lovable, SECURITY.md — Supabase RLS/RPC — частично

- Было: `README.md:1` (ece9adf). Сейчас: `README.md:1-40 (исправлено); SECURITY.md:111-132; SECURITY_TESTING.md:20-41`
- Категория: поддерживаемость. Принцип: Документация как часть кода; принцип наименьшего удивления

```
SECURITY.md:111 ## Row Level Security (RLS) ... :125 import { supabase } from '@/integrations/supabase/client'; :129 await supabase.rpc('set_session_context', ...); SECURITY_TESTING.md:20 curl -X POST https://kybbfizcpuyxkxqqfpzr.supabase.co/functions/v1/security-tests
```

**Что осталось.** Корневой README переписан под реальную систему: Express, Postgres, migrate, check, ссылки на docs. SECURITY.md и SECURITY_TESTING.md остались прежними и по-прежнему описывают Supabase RLS, RPC и edge functions вместо httpOnly-cookie, CSRF и requireRole. Стража против слова supabase нет. Локальных веток subrepl-* так и осталось 35, четыре брошенных worktree в .claude/worktrees на c170a94 тоже на месте.

**Исходная проблема.** Единственные два документа в корне описывают платформу, которой нет: Lovable как способ деплоя и Supabase RLS/SECURITY DEFINER-функции как модель безопасности, тогда как реальная модель — httpOnly-cookie + CSRF + requireRole в Express. В репозитории 35 веток subrepl-* и 4 брошенных worktree пятимесячной давности.

**Что сделать.** README переписать как runbook: архитектура (роли, границы storage/репозитории), локальный запуск, деплой из тега, восстановление; SECURITY.md — модель угроз и фактические механизмы (cookie, CSRF, rate limit, шифрование кодов, бэкап). Удалить subrepl-* ветки и worktrees одним скриптом; добавить тест-страж, падающий, если в SECURITY.md встречается «supabase».

*Верификатор:* Между ece9adf и HEAD менялся только README.md. В SECURITY.md:111-130 остались RLS и supabase.rpc, в SECURITY_TESTING.md:20 — curl на supabase edge function. Веток subrepl-* по-прежнему 35, в .claude/worktrees лежат 4 брошенных worktree.

#### F27. Ноль тестов на самые разрушительные и самые клиентские операции: restore, экспорт, акты — частично

- Было: `server/backupService.ts:213` (ece9adf). Сейчас: `server/reviewRegressions.test.ts:114-150, 215; server/backupArchive.test.ts:23-57; server/documents.integration.test.ts:22-50; server/exportsAndDocuments.http.test.ts:17-70`
- Категория: тесты и DX. Принцип: Тестируемость как критерий архитектуры; покрытие пропорционально риску

```
describe('Complete backup and safe restore', () => { it('registers every table, preserves all rows and text dates, revokes restored sessions' ... it('authorizes the parent before reading or streaming any document bytes'
```

**Что осталось.** Restore (round-trip, откат на битом FK, неполные легаси-копии, неверный ключ и усечение), документы (хранение, миграция, авторизация) и стриминг экспорта теперь покрыты. Не покрыто то, ради чего находка писалась: распределение схем в клиентских отчетах (agency в print/pdf/xlsx) не проверено ни одним тестом, поэтому F14 дожил до HEAD. Тексты Telegram-уведомлений и путь messages.ts тоже не тестируются.

**Исходная проблема.** В проекте есть PGlite-инфраструктура для интеграционных тестов репозиториев, но ни restoreBackup (единственная операция, которая стирает всю БД), ни пять отчетных эндпоинтов, ни загрузка/скачивание актов не покрыты ничем. Регрессия с 'agency' в трех рендерерах export.ts — прямое следствие: правка, заявленная в коммите как «поправлен export.ts», не была проверена даже на уровне «какие схемы попадают в бюджетный блок».

**Что сделать.** 1) PGlite-тест round-trip: заполнить все 17 таблиц → createBackup → изменить/очистить → restoreBackup → сравнить количество строк по каждой таблице (сразу выявит потерю актов). 2) Snapshot-тесты `buildClientReport` на фикстурах по всем схемам для ролей admin/partner/client (после выделения модели). 3) HTTP-тест actsRouter в стиле tenantIsolation: отказ на не-whitelist mime, лимит размера, скрытие executor-актов от partner/client.

*Верификатор:* Restore, документы и стриминг экспорта покрыты (reviewRegressions.test.ts:114-150, 215; exportsAndDocuments.http.test.ts:62). Нет ни одного теста на долю схем в print/pdf/xlsx-отчетах, поэтому F14 дожил до HEAD. Нет тестов и на тексты Telegram-уведомлений, на messages.ts и на invoiceNotice.

#### F28. Конфиг — восемь process.env в семи файлах, валидируется только DATABASE_URL, секрет шифрования по умолчанию пустой — частично

- Было: `server/db.ts:5` (ece9adf). Сейчас: `server/lib/accessCode.ts:20-21; server/lib/backupCrypto.ts:17-18; server/services/backupArchive.ts:40-41; server/app.ts:26`
- Категория: поддерживаемость. Принцип: Fail-fast, единая точка конфигурации, Explicit over implicit

```
const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const accessCodeCryptoEnabled = SECRET.length >= 16;
// backupArchive.ts:40-41
  const secret = process.env.ACCESS_CODE_SECRET ?? '';
  if (secret.length < 16 && process.env.NODE_ENV === 'production') throw new Error('Encrypted backups require ACCESS_CODE_SECRET');
```

**Что осталось.** Исправлено: .env.example теперь описывает ACCESS_CODE_SECRET, CORS_ORIGINS и DOCUMENT_OBJECT_DIR, а бэкап в production падает без секрета. Осталось: модуля config нет, process.env читается в 13 файлах, ACCESS_CODE_SECRET теперь читается уже трижды и независимо. Шифрование кодов доступа без секрета по-прежнему молча выключается (accessCode.ts:21), при старте об этом ничего не пишется. CORS_ORIGINS по умолчанию localhost (app.ts:26). TELEGRAM_API_BASE, FALLBACK_TG_BOT_TOKEN, PUBLIC_BASE_URL и HOST в .env.example так и не появились.

**Исходная проблема.** Переменные читаются россыпью: DATABASE_URL (db.ts:5,10), CORS_ORIGINS (index.ts:23), ACCESS_CODE_SECRET (lib/accessCode.ts:20 и lib/backupCrypto.ts:17 — читается дважды независимо), TELEGRAM_API_BASE, FALLBACK_TG_BOT_TOKEN, PUBLIC_BASE_URL (lib/telegram.ts:16,30,71), BACKUP_DIR (backupService.ts:16), NODE_ENV (vite.ts:9, routes/auth.ts:27). Проверяется одна. Если ACCESS_CODE_SECRET не задан или короче 16 символов, шифрование кодов доступа и бэкапов молча выключается (`accessCodeCryptoEnabled = false`), сервер стартует и работает с plaintext-кодами. CORS_ORIGINS в проде без переменной — localhost. Ни один из этих фактов не виден при старте.

**Что сделать.** server/config.ts: zod-схема `z.object({ NODE_ENV, DATABASE_URL: z.string().url(), PORT: z.coerce.number().default(5000), HOST, ACCESS_CODE_SECRET: z.string().min(16), CORS_ORIGINS, BACKUP_DIR, TELEGRAM_API_BASE, FALLBACK_TG_BOT_TOKEN, PUBLIC_BASE_URL })` с `.superRefine` — в production ACCESS_CODE_SECRET и CORS_ORIGINS обязательны. `export const config = loadConfig(process.env)` вызывается один раз в main.ts; модули получают config параметром (accessCode(config.secret)), а не читают env сами. Падение при старте с перечислением всех ошибок разом.

*Верификатор:* Подтверждаю: accessCode.ts:20-21 молча выключает шифрование, если секрет короче 16 символов, и при старте ничего не пишет. ACCESS_CODE_SECRET читается независимо в accessCode.ts:20, backupCrypto.ts:17 и backupArchive.ts:40. TELEGRAM_API_BASE, FALLBACK_TG_BOT_TOKEN и PUBLIC_BASE_URL (telegram.ts:16,30,79) в .env.example отсутствуют. Уточнение: process.env читается в 14 непроверочных файлах, а не в 13.

#### F29. CSP выключен, CSRF-токен в localStorage, в проекте уже была XSS — одна инъекция равна полному захвату учетки — открыто

- Было: `server/index.ts:16` (ece9adf). Сейчас: `server/app.ts:19; src/contexts/AuthContext.tsx:60,114; src/lib/api.ts:17`
- Категория: безопасность. Принцип: Defense in depth: второй фактор защиты не должен лежать в зоне досягаемости первого

```
app.use(helmet({ contentSecurityPolicy: false }));
localStorage.setItem('csrf_token', data.csrfToken);
const csrfToken = localStorage.getItem("csrf_token");
```

**Что осталось.** CSP по-прежнему выключен, и комментарий app.ts:16-18 все так же ссылается на инлайновые скрипты. CSRF-токен лежит в localStorage и оттуда читается на каждый запрос. GET /api/access-tokens отдает админу расшифрованные коды всех пользователей (userRepo.ts:174). Исправилась только сопутствующая деталь: пропуск CSRF без заголовка (см. F5). Суть находки, то есть одна XSS равна полному захвату учетки и всех кодов, не изменилась.

**Исходная проблема.** httpOnly-кука защищает session_id от скрипта, но CSRF-токен лежит в localStorage (12 обращений в src) и читается любым скриптом на странице, а CSP отключен «потому что SPA грузит инлайн». Проект уже ловил XSS через имя клиента в dangerouslySetInnerHTML. Следующая такая ошибка дает атакующему и аутентификацию (кука уходит сама), и CSRF-токен — то есть все мутации, включая GET /api/access-tokens с расшифрованными кодами.

**Что сделать.** Включить CSP с nonce (Vite поддерживает `html.cspNonce`; инлайн-стили shadcn убрать в класс или разрешить style-src 'self' + nonce). CSRF-токен держать только в памяти AuthContext и прокидывать через один api-клиент; при F5 получать заново из /api/auth/validate. Либо отказаться от токена вовсе в пользу sameSite=strict + проверки Sec-Fetch-Site.

*Верификатор:* helmet({ contentSecurityPolicy: false }) на месте (app.ts:19), и в deploy/nginx.conf:33-36 CSP тоже не ставится. CSRF-токен пишется в localStorage (AuthContext.tsx:60,114) и читается оттуда (api.ts:17). GET /api/access-tokens по-прежнему отдает расшифрованные коды (userRepo.ts:172-174).

#### F30. Нет graceful shutdown, а стартовые правки данных запускаются fire-and-forget при каждом запуске — частично

- Было: `server/index.ts:56` (ece9adf). Сейчас: `server/index.ts:8-10; server/vite.ts:64-66; server/worker.ts:33-37; deploy/activate-release.sh:52`
- Категория: поддерживаемость. Принцип: Явный жизненный цикл процесса, миграции как версионируемые артефакты

```
migrateAccessCodesAtRest(db)
  .then(n => { if (n) console.log(`[accessCode] зашифровано кодов при старте: ${n}`); })
  .catch(e => console.error("[accessCode] миграция при старте не удалась (вход работает):", (e as Error)?.message));
```

**Что осталось.** Исправлено: у worker есть обработчик SIGTERM/SIGINT с ожиданием активных задач и pool.end. healPeriodicUsage убран со старта. Схема применяется версионными миграциями (migrate.js в activate-release.sh, проверка журнала в migrate.ts:11) вместо drizzle-kit push. Осталось: у веб-процесса обработчиков сигналов нет, server.listen ничего не закрывает, pool.end не вызывается, в finance-duck.service нет TimeoutStopSec/KillSignal. Миграция кодов доступа по-прежнему запускается fire-and-forget как побочный эффект импорта index.ts.

**Исходная проблема.** Две миграции данных (шифрование кодов, пересчет periodsUsed) запускаются при каждом старте без await, параллельно с приемом трафика, и их результат не влияет на готовность сервера. Обработчиков SIGTERM/SIGINT нет нигде (grep по server/ пустой), pool.end не вызывается. Деплой = rsync + `systemctl restart`: systemd шлет SIGTERM, Node падает мгновенно — обрываются активные транзакции invoiceRepo, незавершенный healPeriodicUsage и текущий бэкап. При этом в репозитории уже есть drizzle/ с миграциями 0000/0001, но на проде применяется `drizzle-kit push` (без истории), а правки данных живут в коде.

**Что сделать.** main.ts: `const server = app.listen(...)`; на SIGTERM — `server.close()` + ожидание активных запросов до 10 с + `pool.end()` + выход; health-эндпоинт отдает 503 во время остановки, чтобы nginx перестал слать трафик. Разовые правки данных — отдельные SQL/TS-миграции в drizzle/ (drizzle-kit generate + migrate перед listen, `await`), а не код в index.ts. Для ежедневных «самолечений» — явная job с журналом запусков.

*Верификатор:* Подтверждаю: в worker.ts:33-37 есть SIGTERM/SIGINT и pool.end, а в unit-файле воркера TimeoutStopSec=120. Веб-процесс сигналы не обрабатывает (SIGTERM есть только в worker.ts), в deploy/finance-duck.service нет TimeoutStopSec. Миграция кодов в index.ts:8-10 по-прежнему запускается fire-and-forget при импорте.

#### F31. Ключ бэкапов выведен из ACCESS_CODE_SECRET, без kid в конверте; без секрета дампы с кодами доступа и TG-токенами пишутся открытым текстом — частично

- Было: `server/lib/backupCrypto.ts:17` (ece9adf). Сейчас: `server/services/backupArchive.ts:39-43, 103-105; server/lib/backupCrypto.ts:17-19`
- Категория: безопасность. Принцип: Разделение ключей по назначению; fail-fast в production вместо тихого понижения защиты

```
const secret = process.env.ACCESS_CODE_SECRET ?? ''; if (secret.length < 16 && process.env.NODE_ENV === 'production') throw new Error('Encrypted backups require ACCESS_CODE_SECRET'); return secret.length >= 16 ? createHash('sha256').update(secret + ':backup-stream-v1').digest() : null;
```

**Что осталось.** Тихой записи открытого дампа в production больше нет: без секрета создание копии падает. Осталось: ключ по-прежнему выводится из ACCESS_CODE_SECRET (теперь двумя разными метками в двух модулях), kid в заголовке нет, ротация секрета делает все прошлые архивы нечитаемыми. Сервер стартует без проверки секрета, ошибка всплывает только в ночном job. readArchive и в production принимает архив с encrypted:false без аутентификации. Вне production копии пишутся открытым текстом. Off-site копии нет, документация это признает.

**Исходная проблема.** Один секрет обслуживает две независимые системы (коды входа и бэкапы): ротация ACCESS_CODE_SECRET делает все прошлые дампы нерасшифровываемыми, а конверт не содержит идентификатора ключа — невозможно держать два ключа в переходный период. «Graceful degradation» в проде означает тихий downgrade: при отсутствии/коротком секрете на диск уходит открытый JSON со всеми plaintext-кодами доступа (`access_tokens.code`), токенами клиентских ботов и телефонами (ФЗ-152). Сервер при этом стартует без предупреждения. Копии лежат только на том же VDS, что и Postgres (BACKUP_DIR=/var/finance-duck/backups), off-site копии нет.

**Что сделать.** Отдельный `BACKUP_KEY` (32 байта base64), обязательный при NODE_ENV=production — старт падает без него; в конверт добавить `kid` и поддержать `BACKUP_KEYS={kid:key}` для ротации. Убрать plaintext-ветку из прода. Добавить шаг job-а «отправить зашифрованный дамп в S3-совместимое хранилище в РФ (Timeweb S3)» с retention, проверять восстановимость еженедельным автоматическим restore в PGlite/временную БД.

*Верификатор:* backupArchive.ts:39-43 бросает ошибку в production без секрета, но ключ все так же выводится из ACCESS_CODE_SECRET (backupArchive.ts:42 и backupCrypto.ts:19 с разными метками), kid нет. readArchive (103-113) в production принимает encrypted:false без аутентификации, а при старте web или worker секрет не проверяется.

#### F32. server/lib/format.ts — ручное зеркало src/lib/format.ts с ложным обоснованием: shared уже импортируется обоими бандлерами — открыто

- Было: `server/lib/format.ts:2` (ece9adf). Сейчас: `server/lib/format.ts:2-8`
- Категория: DRY. Принцип: DRY; одна реализация форматирования денег на все каналы

```
// Серверный Format-сервис. Зеркало src/lib/format.ts для PDF/HTML/XLSX-отчётов ... // Зачем дублировать вместо общего пакета: фронт и сервер собираются разными // бандлерами (Vite vs esbuild --bundle)
```

**Что осталось.** Файл не изменился (git diff ece9adf..HEAD пуст по обоим файлам). shared/format.ts не появился, export.ts импортирует серверное зеркало, теста на совпадение двух копий нет.

**Исходная проблема.** 91 строка кода скопирована из src/lib/format.ts (130 строк; diff показывает различия только в комментариях). Аргумент о «конфликте модульных систем» опровергается самим репозиторием: сервер импортирует `shared/financialEngine.ts` и `shared/schema.ts`, фронт — тоже shared. Два файла с обещанием «API и поведение совпадают» без теста на совпадение — это два независимых источника правды, которые разойдутся при первой правке плейсхолдера или округления (деньги!).

**Что сделать.** Переместить в `shared/format.ts`, удалить обе копии, оставить re-export `src/lib/format.ts → export * from '@shared/format'` на переходный период. Добавить unit-тест форматов (0, null, 12345.678, отрицательные) в shared, он же — контракт для отчетов.

*Верификатор:* git diff ece9adf..HEAD по server/lib/format.ts и src/lib/format.ts пуст, shared/format.ts нет, export.ts по-прежнему импортирует серверное зеркало. Теста на совпадение двух копий нет.

#### F33. Telegram-нотификации: шесть скопированных IIFE с inline-шаблонами, fetch без таймаута, без очереди и ретраев — частично

- Было: `server/lib/telegram.ts:43` (ece9adf). Сейчас: `server/services/outbox.ts:6-29; server/lib/telegram.ts:46-54; server/routes/messages.ts:257-288; server/routes/clients.ts:114-127`
- Категория: поддерживаемость. Принцип: SRP; надежная доставка через outbox вместо fire-and-forget

```
(async () => { try { const [client] = await db.select().from(clients)... await sendTelegramMessage(target, html); } catch (e) { console.error("[messages] telegram notify error:", ...
```

**Что осталось.** Создание и оплата счета и периодика теперь пишут notification_outbox в той же транзакции (invoiceCommands.ts:66, recurringCommands.ts:62). Worker доставляет с FOR UPDATE SKIP LOCKED, AbortSignal.timeout(10000) и backoff, шаблон вынесен в invoiceNotice. Осталось: уведомления о сообщениях идут fire-and-forget IIFE с inline-шаблоном и теряются при рестарте. В clients.ts остался dynamic import. Тестов на тексты уведомлений нет.

**Исходная проблема.** Шесть точек отправки — каждая со своим dynamic import, своей сборкой HTML-текста и своим catch. `fetch` без `AbortSignal` — при зависании CF-Worker-прокси (а это единственный путь из РФ к api.telegram.org) промис висит бесконечно, накапливая открытые соединения. Отправка — fire-and-forget в памяти процесса: рестарт сервера (deploy.sh делает его при каждом деплое) теряет все неотправленные уведомления, ошибки 429/5xx от Telegram не ретраятся. Нет ни одного теста на тексты уведомлений, которые читают клиенты.

**Что сделать.** `server/notifications/`: `templates.ts` (чистые функции `invoiceCreated(model) → html`), `NotificationService.enqueue(kind, payload)` пишет в таблицу `notification_outbox (id, target, payload, attempts, next_attempt_at, sent_at)`; JobRunner раз в 30 с забирает `FOR UPDATE SKIP LOCKED`, шлет с `AbortSignal.timeout(10_000)` и экспоненциальным backoff. Роуты вызывают одну строку `notifications.enqueue(...)` внутри той же транзакции, что и доменное изменение.

*Верификатор:* Уведомления о счетах и периодике идут через outbox (invoiceCommands.ts:66, recurringCommands.ts:62) со строгой отправкой и таймаутом (telegram.ts:47-54). Уведомление о сообщении осталось fire-and-forget IIFE с inline-шаблоном (messages.ts:257-288). В clients.ts:114 сохранился dynamic import, и там вызывается глотающая ошибки sendTelegramMessage.

#### F35. Четыре слоя авторизации, три одинаковых интерфейса актора и 157 сравнений роли в роутах — открыто

- Было: `server/middleware.ts:12` (ece9adf). Сейчас: `server/middleware.ts:12-19; server/tenantAccess.ts:8; server/invoiceAccess.ts:4; server/services/commandActor.ts:4`
- Категория: спагетти. Принцип: SRP; единая точка принятия решений (Policy Enforcement Point)

```
export interface AuthenticatedRequest extends Request<Record<string, string>> {
  user?: {
    token: AccessToken;
    role: UserRole;
...
export interface TenantActor {
  role: UserRole;
...
export interface InvoiceActor {
  role: UserRole;
```

**Что осталось.** Единого Principal и единой policy-функции нет. В req.user по-прежнему лежит полный AccessToken с code/codeEnc. Формы актора размножились: TenantActor, InvoiceActor, инлайновый `{ role; partnerId?; clientId? }` в invoiceRepo.ts:254, CommandActor (commandActor.ts:4) и actor в personalDataExport. В server/routes 48 литеральных сравнений `role ===/!==` и 105 вызовов requireRole. Решения о доступе по-прежнему принимаются в requireRole, tenantAccess, invoiceAccess, permissions.ts и в роутах.

**Исходная проблема.** Решение «можно ли» принимается в requireRole (middleware), в tenantAccess.ts (клиенты/партнеры), в invoiceAccess.ts (счета), в permissions.ts (поля) и в самих роутах (157 литеральных проверок). Одна и та же форма актора объявлена трижды. В req.user при этом лежит полный AccessToken с полями code/codeEnc — любой `res.json(req.user)` в новом роуте утечет хэш и шифр кода. Нет ни одной функции, по которой можно ответить на вопрос «что может accountant».

**Что сделать.** Ввести `server/auth/principal.ts`: `type Principal = { tokenId; role; scope: {kind:'all'} | {kind:'partner', partnerId} | {kind:'client', clientId} }` (без объекта токена). `server/auth/policy.ts` с одной функцией `can(principal, action: 'invoice.read'|'client.update'|..., resource)` и декларативной таблицей; роуты вызывают только `authorize(req, 'invoice.read', invoice)`. tenantAccess/invoiceAccess становятся приватными хелперами policy.ts. Один security-тест на матрицу роль×действие вместо текущего единственного tenantIsolation.

*Верификатор:* Единого Principal нет. В req.user лежит полный AccessToken (middleware.ts:12-19), рядом живут TenantActor (tenantAccess.ts:8), InvoiceActor (invoiceAccess.ts:4) и PersonalExportActor (personalDataExport.ts:11). CommandActor объявлен в invoiceCommands.ts:17 как `extends InvoiceActor`, а commandActor.ts:4 его только собирает. Счетчик неточен: по grep `role (===|!==)` в server/routes 62 совпадения, а не 48; requireRole( встречается 105 раз.

#### F36. Нет error-middleware: падение в authMiddleware отдает HTML от Express, 127 ручных res.status(500) — открыто

- Было: `server/middleware.ts:39` (ece9adf). Сейчас: `server/middleware.ts:40; server/app.ts:43-47; server/routes/invoices.ts:35; server/routes/backup.ts:11`
- Категория: поддерживаемость. Принцип: DRY (127 копий), SRP (роут занимается транспортом ошибок), отсутствие типизированных исключений

```
const result = await storage.validateSession(sessionId);
// invoices.ts:35 (повторено ~25 раз)
    if ((error instanceof CommandError || error instanceof MoneyRangeError)) return res.status(error.status).json({ error: error.message });
```

**Что осталось.** 4-аргументного error-handler по-прежнему нет: createApp заканчивается на registerRoutes, а authMiddleware остается async без try/catch, так что сбой БД отдаст text/html от finalhandler. Ручных status(500) в routes теперь 132 (было 127). Появившийся CommandError ничего не централизовал: его маппинг в статус вручную скопирован примерно в 25 catch-блоков (invoices.ts, export.ts, recurring.ts, partners.ts). В 23 ответах 500 наружу уходит сырой error.message (backup.ts:11-49, export.ts:168, recurring.ts:53), то есть внутренние ошибки SQL и ФС видит клиент.

**Исходная проблема.** authMiddleware — async без try/catch и стоит перед каждым из 129 роутов. При недоступности БД Express 5 перехватит rejected promise, но обработчика `app.use((err, req, res, next) => ...)` в проекте нет (grep пустой), поэтому ответит стандартный finalhandler: text/html «Internal Server Error», в dev — со стеком. Фронт ждет JSON `{ error }`. Остальные 127 мест `res.status(500).json({ error: "Failed to ..." })` с `console.error(...)` — ручная копия одного и того же в каждом роуте, без request-id, без разделения доменных ошибок (400/404/409) от инфраструктурных; например partnerRepo.deletePartner возвращает `{ success, error }` (storage.ts:38), а роуты транслируют это в 400 вручную.

**Что сделать.** Ввести server/lib/errors.ts: класс AppError(status, code, message, details) и наследники NotFound, Forbidden, Validation, Conflict. Один app.use(errorHandler) в конце цепочки: AppError → JSON с его статусом, ZodError → 400, остальное → 500 + logger.error с requestId. Добавить middleware requestId (crypto.randomUUID → res.setHeader('X-Request-Id')) и pino-логгер вместо console.*. Из роутов убрать try/catch полностью (Express 5 пробрасывает отклоненные промисы сам), репозитории бросают NotFound вместо `null`/`{success:false}`.

*Верификатор:* Подтверждаю: 4-аргументного обработчика ошибок в server нет, createApp в app.ts заканчивается на registerRoutes. Express 5 передаст отклонение async authMiddleware (middleware.ts:40) в finalhandler, и тот ответит HTML. В routes 132 ручных status(500), а в backup.ts:11-49, export.ts:168 и recurring.ts:53 наружу уходит сырой error.message.

#### F37. permissions.ts: пять ролей × три таблицы нетипизированных строк — опечатка прячет поле молча, новая роль требует правок в девяти местах — частично

- Было: `server/permissions.ts:56` (ece9adf). Сейчас: `server/permissions.ts:50,88,120,252,287`
- Категория: SOLID. Принцип: OCP (расширение без правки пяти таблиц); DRY; типобезопасность вместо строк

```
export const ROLE_INVOICE_PERMISSIONS: Record<UserRole, readonly string[]> = {
...
    if (field in invoice) result[field] = invoice[field];
...
    result.client = (role === 'assistant' || role === 'accountant')
```

**Что осталось.** Исправлено: UserRole теперь один, выведен из USER_ROLES (shared/domainTypes.ts:1-4). Клиентские копии без accountant удалены, VALID_ROLES = USER_ROLES (acts.ts:51), дрейф partnerCommissionRate ушел. Осталось: три таблицы полей — нетипизированные строки без keyof/satisfies, опечатка по-прежнему молча прячет поле (:252). Инлайн-исключение (:287), CLIENT_SETTINGS_ROLES (:167) и CLIENT_CATALOG_ROLES (tenantAccess.ts:23) на месте. Параллельно живет вторая таблица видимости на фронте: VISIBILITY_POLICIES в src/lib/invoicePermissions.ts:38.

**Исходная проблема.** Поля перечислены как `readonly string[]`, а не `keyof Invoice`: опечатка 'closingDocumentUrl' → 'closingDocumentURL' компилируется и просто прячет поле; новая колонка в schema.ts невидима всем ролям, пока ее не допишут в 5 списков. Списки assistant и accountant отличаются одним полем и целиком скопированы. Добавление роли: три таблицы здесь, CLIENT_SETTINGS_ROLES (permissions.ts:173), CLIENT_CATALOG_ROLES (tenantAccess.ts:23), VALID_ROLES (acts.ts:46), UserRole в четырех файлах, плюс инлайн-ветки `role === ...` — компилятор подскажет только Record<UserRole,...>, остальное найдется в проде.

**Что сделать.** `satisfies Record<UserRole, readonly (keyof Invoice)[]>` как минимум. Как цель — capability-модель: `Role → Set<Capability>` (например 'see_margin', 'see_partner_contacts', 'see_closing_docs') и `Field → Capability`, проекция = пересечение. Тогда новая роль — одна строка capabilities, а новое поле — одна аннотация. Единый `shared/roles.ts` с UserRole, ROLES-массивом и RoleCapabilities, импортируемый сервером и фронтом.

*Верификатор:* UserRole теперь один и выведен из USER_ROLES (shared/domainTypes.ts:1-4). Но таблицы полей по-прежнему `Record<UserRole, readonly string[]>` без keyof/satisfies (permissions.ts:50,88,120), опечатку молча глотает `if (field in invoice)` (:252), и теста на соответствие полей схеме нет. Инлайн-исключение (:287), CLIENT_SETTINGS_ROLES (:167), CLIENT_CATALOG_ROLES (tenantAccess.ts:23) и фронтовая VISIBILITY_POLICIES (src/lib/invoicePermissions.ts:38) на месте.

#### F38. Таблица лимитера хранит введенные коды открытым текстом — рядом с «сейфом» — открыто

- Было: `server/rateLimiter.ts:83` (ece9adf). Сейчас: `server/rateLimiter.ts:39; server/routes/auth.ts:90,100; server/services/backupTables.ts:13`
- Категория: безопасность. Принцип: Единая модель угроз для всех мест хранения секрета

```
VALUES (${key.toUpperCase()}, 1, ${now}, NULL)
...
const attemptStatus = await reserveLoginAttempt(code);
...
const token = await storage.verifyAccessCode(code);
...
assistantActionLogs: schema.assistantActionLogs, loginRateLimits: schema.loginRateLimits,
```

**Что осталось.** Ключ лимитера по-прежнему сырой введенный код, а getLockedCodes (rateLimiter.ts:76-79) и unlock-user (auth.ts:40) отдают его как есть. Исправления сделали хуже. Попытка теперь резервируется до проверки, так что в таблицу открытым текстом попадает и ВЕРНЫЙ код при каждом входе: на успехе строку удаляют (auth.ts:113), но если код заблокирован, верный код лежит там до конца блокировки. Кроме того, login_rate_limits включили в штатный бэкап (backupTables.ts:13). Значит, смягчение верификатора («бэкап таблицу не выгружает») больше не действует.

**Исходная проблема.** accessCode.ts обосновывает HMAC+AES угрозой «утечка БД/бэкапа». Но каждая неудачная попытка входа — а это чаще всего настоящий код с одной опечаткой — пишется в login_rate_limits.code открытым текстом и попадает в тот же дамп и в тот же бэкап. getLockedCodes отдает их в UI, /api/admin/unlock-user эхом возвращает code.toUpperCase(). Модель угроз одного модуля опровергается соседним.

**Что сделать.** Ключом лимитера сделать lookupHash(code) из accessCode.ts (та же HMAC), а в getLockedCodes отдавать токен-id/роль через JOIN с access_tokens по хэшу — админу все равно нужен «кто заблокирован», а не «что ввели». Ввести общий модуль secrets/ с одной функцией fingerprint().

*Верификатор:* Ключ лимитера по-прежнему сырой код (`VALUES (${key.toUpperCase()}...)`, rateLimiter.ts:39), getLockedCodes отдает его как есть (:76-79), таблица попала в бэкап (backupTables.ts:13). Тезис «стало хуже» преувеличен: активный верный код не может накопить блокировку, потому что каждый успешный вход чистит строку (auth.ts:113), так что лежит он там лишь миллисекунды. Надолго остаются только опечатки, коды истекших или отключенных токенов и строки после исключения между reserve и clear.

#### F39. login_rate_limits хранит введенные коды открытым текстом без TTL; bigint-миллисекунды вместо timestamptz — частично

- Было: `server/rateLimiter.ts:83` (ece9adf). Сейчас: `server/rateLimiter.ts:39; shared/schema.ts:394-399; server/worker.ts:19; server/services/backupTables.ts:13`
- Категория: безопасность. Принцип: Минимизация хранимых чувствительных данных (ФЗ-152, принцип необходимости)

```
VALUES (${key.toUpperCase()}, 1, ${now}, NULL) ... code: text("code").primaryKey(), lastAttempt: bigint("last_attempt", { mode: "number" }) ... }, table => [index("idx_login_rate_limits_expiry").on(table.lastAttempt)]); | loginRateLimits: schema.loginRateLimits
```

**Что осталось.** Появилась очистка: ежечасная задача login-limit-cleanup (pruneExpiredLoginAttempts, батчами с SKIP LOCKED) и индекс по last_attempt. Суть находки при этом осталась. PK по-прежнему введенный код в верхнем регистре открытым текстом, без хеша, рядом лежит IPLOCK:<ip>. Время все еще хранится как bigint миллисекунд. Резервирование теперь идет до проверки кода (auth.ts:90), так что открытым текстом пишется любой ввод, включая верный код, и живет до часа-двух. Таблица входит в BACKUP_TABLES (backupTables.ts:13), то есть коды с опечатками уезжают в ежедневные бэкапы и оффсайт на Mac администратора. getLockedCodes (rateLimiter.ts:75-79) отдает админу коды целиком.

**Исходная проблема.** PK таблицы — сам введенный код в верхнем регистре: каждая неудачная попытка входа навсегда записывает в БД строку с кодом (включая коды с опечаткой в одном символе от настоящего) и IP в формате `IPLOCK:<ip>`. Очистки по времени нет — строка удаляется только при успешном входе тем же кодом. Время — bigint миллисекунд, поэтому SQL-очистка `WHERE last_attempt < now() - interval '1 day'` невозможна без конвертации, и индексов по времени нет.

**Что сделать.** Хранить `key_hash = sha256(scope || ':' || upper(code))`, `last_attempt timestamptz`, `locked_until timestamptz`; индекс по last_attempt; очистка строк старше окна в существующем планировщике (`DELETE ... WHERE last_attempt < now() - interval '2 hours'`). Миграция: создать новую таблицу, старую дропнуть — данные в ней не ценны.

*Верификатор:* Ключом в rateLimiter.ts:39 по-прежнему служит открытый код в верхнем регистре, при этом в access_tokens коды уже защищены через lib/accessCode.ts. Таблица попадает в BACKUP_TABLES (backupTables.ts:13), getLockedCodes (:75-79) отдает коды целиком. Одна поправка к выводу: верный код удаляется сразу после успешного входа (auth.ts:113 clearLoginAttempts), так что час-два живут только ошибочные вводы.

#### F40. Журнал действий мутируется при чтении и при записи, details — JSON в text — частично

- Было: `server/repositories/actionLogRepo.ts:47` (ece9adf). Сейчас: `server/repositories/actionLogRepo.ts:23-54, 39, 43, 104, 159, 185-186; shared/schema.ts:383`
- Категория: модель данных. Принцип: Append-only аудит; данные со схемой — в jsonb

```
if (log.actionType === 'update_invoice' && log.entityId && log.accessTokenId) { ... const [updated] = await db.update(assistantActionLogs) ... enrichedDescription = enrichedDescription.replace(row.log.entityId, displayName); | details: text("details"),
```

**Что осталось.** На практике перезапись аудита больше не срабатывает: update_invoice теперь пишется прямым tx.insert в InvoiceCommands (server/services/invoiceCommands.ts:62), а через logAssistantAction идут только create/update client/partner и upload/delete act. Но сам код схлопывания (select→update без транзакции) остался мертвым грузом. Остальное не тронуто: details по-прежнему text, JSON.parse с проглатыванием ошибок в четырех местах (поменялись только комментарии в catch), имена при чтении дорисовываются по текущему состоянию БД, а UUID в description подменяется регекспом. Read-model и jsonb нет.

**Исходная проблема.** Аудит-лог перезаписывает существующие записи (coalescing update_invoice за 10 секунд) — последовательность изменений теряется, а read-then-update без транзакции при двух параллельных запросах теряет одно из обновлений. details хранится как text с JSON, парсится в четырех местах с проглатыванием ошибок; имена клиентов/счетов «дорисовываются» при чтении регекспом по UUID в description, то есть отображение журнала зависит от текущего состояния БД, а не от момента события.

**Что сделать.** details -> jsonb с явным типом по actionType (zod-дискриминируемое объединение); снапшот отображаемых имен (clientName, invoiceNumber) писать в момент события; записи никогда не обновлять — группировку «быстрых правок» делать на чтении по окну времени. Вынести aggregation/enrichment в отдельный read-model (actionLogQuery.ts), writer оставить тривиальным insert.

*Верификатор:* Подтверждаю. Схлопывание update_invoice в actionLogRepo.ts:23-55 больше не вызывается: logAssistantAction зовут только clients.ts:81/101, partners.ts:78/96 и acts.ts:118/166, а update_invoice пишется через tx.insert в invoiceCommands.ts:62. Остальное на месте: details: text (schema.ts:382), четыре JSON.parse с пустым catch (39, 43, 104, 159) и подмена UUID при чтении (185-186).

#### F41. «Просрочен» определен пятью способами, одно из определений опирается на несуществующее поле — частично

- Было: `server/repositories/alertsRepo.ts:192` (ece9adf). Сейчас: `server/repositories/alertsRepo.ts:198,203-208,254-256; server/storage.ts:155-158; server/invoiceQuery.ts:46; server/repositories/invoiceRepo.ts:262`
- Категория: DRY. Принцип: DRY / Single Source of Truth

```
alertsRepo.ts:198 `.where(eq(invoices.status, 'sent'));` + JS-фильтр 203-208 без actualPaymentDate / alertsRepo.ts:254-256 `eq(invoices.status, 'sent'), invoiceScope(actor), sql`${invoices.paymentDate} < ...`` без isNull(actualPaymentDate) / storage.ts:155-158 `} else { pendingInvoices++; ... if (inv.paymentDate && new Date(inv.paymentDate) < today) { overdueInvoices++;`
```

**Что осталось.** Несуществующего paymentDueDate больше нет. Но замена внесла регрессию: в storage.getDashboardStats просроченным теперь считается любой не-paid счет с прошедшей датой, то есть черновики и отмененные тоже. Был всегда 0, стал завышенным. getOverdueInvoices по-прежнему тянет все sent и фильтрует в JS без проверки actualPaymentDate, getOverdueInvoicesDetailed тоже ее не проверяет. Добавились новые определения: invoiceQuery.ts:46 (status=overdue) и invoiceRepo.ts:262 (COUNT FILTER). Единого предиката isOverdue нет, вариантов теперь около семи.

**Исходная проблема.** getOverdueInvoices и getOverdueInvoicesDetailed не проверяют actualPaymentDate (счет с проставленной фактической оплатой, но статусом sent, считается просроченным); getPriorityActions, getAlertCounts и getDashboardInvoices('overdue') проверяют; storage.getDashboardStats использует поле paymentDueDate, которого в схеме нет (есть paymentDate), поэтому overdueInvoices там всегда 0. getOverdueInvoices к тому же тянет все sent-счета с тремя JOIN и фильтрует дату в JS, хотя индекс idx_invoices_status_payment_date есть.

**Что сделать.** Один SQL-предикат isOverdue(invoices) = status='sent' AND actual_payment_date IS NULL AND payment_date < CURRENT_DATE в sqlPredicates.ts; alertsRepo оставить единственную функцию listOverdue(db, {withNames, limit}) и выразить через нее getOverdueInvoices/getOverdueInvoicesDetailed/getPriorityActions/getAlertCounts. Удалить paymentDueDate из storage.ts, подключив тот же предикат; счетчики считать через COUNT(*) FILTER (WHERE isOverdue).

*Верификатор:* Подтверждаю. Регрессия в storage.ts:155-158: ветка else охватывает draft и cancelled, поэтому черновик с прошедшей paymentDate считается просроченным. getOverdueInvoices (alertsRepo.ts:198-208) и getOverdueInvoicesDetailed (alertsRepo.ts:254-256) не проверяют actualPaymentDate, а getAlertCounts (alertsRepo.ts:154-164) и invoiceQuery.ts:46 проверяют. Общего предиката нет.

#### F42. Связь клиент-партнер хранится в двух таблицах, провенанс без FK — открыто

- Было: `server/repositories/clientRepo.ts:112` (ece9adf). Сейчас: `server/repositories/clientRepo.ts:65-77, 117-119; server/routes/clients.ts:147; shared/schema.ts:143, 263, 281`
- Категория: модель данных. Принцип: Single Source of Truth, целостность ссылок

```
await tx.update(clients)
      .set({ partnerId: ids[0] ?? null, updatedAt: new Date() }) | .leftJoin(partners, eq(clients.partnerId, partners.id)) | createdBy: uuid("created_by").notNull(), | uploadedBy: uuid("uploaded_by").notNull(),
```

**Что осталось.** clients.partner_id по-прежнему пишется как первый элемент массива с фронта и читается в getClientWithPartner через /api/clients/:id/with-partner, хотя фронт этот путь не вызывает (обертка fetchClientWithPartner в src/lib/services/invoices.ts:159 без потребителей). В миграциях 0002–0007 нет FK для created_by (partner_payments), uploaded_by (signed_acts) и paid_by (assistant_bonus_payments). Из всей находки исправлен только каст (db as any): транзакция теперь типизирована (clientRepo.ts:112), но это был второстепенный пункт.

**Исходная проблема.** client_partners объявлен источником истины, но clients.partner_id продолжает писаться («основной партнер» = первый в массиве, порядок которого определяет фронт) и читаться в getClientWithPartner, причем эндпоинт with-partner до сих пор используется фронтом. Транзакция выполняется через (db as any) — тип Db не описывает transaction. created_by у партнерских платежей и uploaded_by у актов — голые uuid без внешнего ключа на access_tokens, в отличие от action_logs (set null) и messages (set null).

**Что сделать.** Удалить clients.partner_id (миграция: убедиться, что все данные есть в client_partners), перевести getClientWithPartner/with-partner на client_partners с явным флагом is_primary в связке, если бизнесу нужен «основной». Добавить FK created_by/uploaded_by -> access_tokens(id) on delete set null (или отдельную таблицу actors, переживающую ротацию кодов). Тип Db расширить до DBorTx как в invoiceRepo, убрать as any.

*Верификатор:* Подтверждаю. setClientPartners по-прежнему пишет clients.partner_id = ids[0] (clientRepo.ts:117-119), а читает его только getClientWithPartner (clientRepo.ts:71) через /with-partner (clients.ts:147); у fetchClientWithPartner (src/lib/services/invoices.ts:159) нет вызовов. В 0002-0007 FK не появилось ни для created_by, ни для uploaded_by, ни для paid_by (schema.ts:143, 263, 281).

#### F43. Удаление партнера и клиента: без транзакции, со смесью явных delete и молчаливых каскадов — открыто

- Было: `server/repositories/clientRepo.ts:132` (ece9adf). Сейчас: `server/repositories/clientRepo.ts:132-134; server/repositories/partnerRepo.ts:66-67; shared/schema.ts:258; server/routes/clients.ts:74-79`
- Категория: атомарность. Принцип: ACID / единая ответственность за жизненный цикл агрегата

```
await db.delete(clientPartners).where(eq(clientPartners.clientId, id));
  await db.delete(accessTokens).where(eq(accessTokens.clientId, id));
  await db.delete(clients).where(eq(clients.id, id)); | partnerId: uuid("partner_id").references(() => partners.id).notNull(),
```

**Что осталось.** Удаление клиента и партнера идет тремя или двумя отдельными delete без транзакции и дублирует FK-каскад. partner_payments.partner_id все еще без onDelete, а deletePartner не проверяет платежи: платеж без invoiceId дает FK-ошибку и 500. Создание клиента (createClient, затем setClientPartners, затем лог) из роута не атомарно. Изменение 0006 (invoice_id → restrict) этих путей не касается.

**Исходная проблема.** Три последовательных delete вне транзакции: падение на втором оставляет клиента без связей и токенов, но живого. Явное удаление access_tokens и client_partners дублирует уже объявленный в схеме FK-каскад, а реально опасные зависимости не проверены: partner_payments.partner_id без каскада — платеж с invoiceId=null (допустим по PARTNER_PAYMENT_WRITABLE_FIELDS) даст FK-ошибку и ответ 500 «Failed to delete partner»; recurring_invoices каскадом удалятся молча, без проверки и без аудита. В clients.ts:136-141 createClient и setClientPartners тоже не атомарны: несуществующий partnerId дает FK-ошибку и 500, но клиент уже создан сиротой.

**Что сделать.** Ввести доменную операцию `removePartner(id)` / `removeClient(id)` в одной транзакции с явной проверкой всех зависимостей (invoices, partner_payments, recurring_invoices, client_partners) и возвратом структурированного списка блокеров; каскады в схеме оставить только для чисто технических таблиц (sessions, tokens). Создание клиента с партнерами — одна транзакция в clientRepo (createClientWithPartners), а не два вызова из роута. По политике «ничего не стирать» рассмотреть soft-delete (archived_at) вместо физического удаления.

*Верификатор:* Подтверждаю. В clientRepo.ts:132-134 и partnerRepo.ts:66-67 delete идут подряд без транзакции. deletePartner не проверяет partner_payments, а partner_id там без onDelete (schema.ts:258), поэтому платеж без счета дает FK-ошибку и 500. POST /api/clients выполняет createClient и setClientPartners двумя отдельными вызовами (clients.ts:74-79).

#### F44. Полная выгрузка таблиц и агрегация в JS там, где в том же файле уже есть SQL-агрегация — частично

- Было: `server/repositories/dashboardRepo.ts:34` (ece9adf). Сейчас: `server/repositories/reportsRepo.ts:165-174; server/repositories/planningRepo.ts:101-110,167-173; server/storage.ts:99-113`
- Категория: производительность. Принцип: KISS / «считай там, где данные»

```
planningRepo.ts:167-173 `const allInvoices = await db.select({ invoice: invoices, calculations: invoiceCalculations }).from(invoices).leftJoin(invoiceCalculations, ...);` (без WHERE) / reportsRepo.ts:174 `.where(isNotNull(invoices.clientId));` / storage.ts:112 `results = await query;`
```

**Что осталось.** Устранено: getAdminMonthlyData считается одним SQL с GROUP BY и фильтром по году (adminDashboardRepo.ts:24-32), а getPartnerDebtDetails агрегирует расходы через SUM FILTER только по своему партнеру (partnerDebtRepo.ts:269-274). Осталось: getClientLTV, getAdminPlanFact, getAdminForecast и storage.getDashboardStats по-прежнему грузят таблицы целиком и фильтруют год в JS. Теста на число запросов или строк нет.

**Исходная проблема.** getAdminMonthlyData(year) грузит оплаченные счета всех лет и ВСЮ invoice_expenses, чтобы затем отбросить чужие годы в JS (строка 60). getPartnerDebtDetails(partnerId) грузит все расходы всех партнеров ради одного. getClientLTV, getAdminForecast, getAdminPlanFact и storage.getDashboardStats (storage.ts:404) грузят всю таблицу счетов без фильтра по году. При этом getAdminDashboardStats (543-629) и getDashboardInvoices (1428-1444) в том же файле считают SUM/COUNT в SQL с индексами — паттерн есть, применен к трети функций.

**Что сделать.** Перевести каждую из перечисленных функций на один SQL с GROUP BY (EXTRACT(MONTH FROM moneyDate), SUM(...)::numeric) и WHERE по году/партнеру/клиенту; расходы агрегировать подзапросом SUM(amount) FILTER (WHERE paid_by_admin) по invoice_id. Ввести правило ревью: db.select().from(invoices|invoiceExpenses) без .where и без агрегата в analytics-коде не проходит; закрепить тестом на PGlite, который считает число выполненных запросов и строк.

*Верификатор:* Полные выборки на месте: getClientLTV (reportsRepo.ts:165-174, только isNotNull(clientId)), getAdminPlanFact (planningRepo.ts:101-110: sent/paid за все годы), getAdminForecast (planningRepo.ts:167-173, без WHERE), storage.getDashboardStats для admin (storage.ts:112). getAdminMonthlyData считается одним SQL с GROUP BY (adminDashboardRepo.ts:24-32).

#### F45. Эндпоинт отдает поля, которые всегда 0, тест это закрепляет, фронт считает сам — частично

- Было: `server/repositories/dashboardRepo.ts:113` (ece9adf). Сейчас: `server/repositories/partnerDashboardRepo.ts:45-46,57-59,62-65; server/routes/partners.ts:291; src/components/invoices/PartnerDashboard.tsx:162-174`
- Категория: поддерживаемость. Принцип: — (мертвый код + бизнес-логика на клиенте)

```
partnerDashboardRepo.ts:64 `yearlyCommission += parseNum(row.calculations.partnerShareFromMargin ?? row.calculations.commissionAmount);` / PartnerDashboard.tsx:172-174 `const agency30Remaining = ...; const partnerSchemeDoNotSpend = ...; const reservedForExpenses = agency30Remaining + partnerSchemeDoNotSpend;`
```

**Что осталось.** Чтение несуществующих колонок убрано, тест теперь проверяет ожидаемые 200/200, а не «документирует баг». Но эндпоинт /api/partner/hero-metrics по-прежнему не вызывается из src. Фронт так и считает резерв сам и по другой формуле (агентские остатки + partner-schemes против plannedExpenses−расходы партнера по всем схемам). Годовую комиссию берет из нового /api/invoices/partner-summary, где год определяется по paymentDate→createdAt, а в hero по createdAt. Мертвый серверный расчет оживили вместо удаления, и у одной метрики стало три реализации.

**Исходная проблема.** getPartnerHeroMetrics читает через (… as any) несуществующие колонки и возвращает reservedForExpenses и yearlyCommission = 0 всегда; тест фиксирует это как ожидаемое поведение; PartnerDashboard.tsx получает те же метрики из других эндпоинтов (/api/do-not-spend, /api/do-not-spend/partner-schemes, /api/my-debt) и пересчитывает их на клиенте. Серверный расчет мертв, а бизнес-правило «резерв под расходы» живет в React-компоненте.

**Что сделать.** Либо реализовать hero-метрики на сервере поверх единого partnerDebt-модуля и data из invoice_expenses (planned_expenses лежит на invoices, не на calculations) и перевести PartnerDashboard на один запрос /api/partner/hero-metrics, либо удалить эндпоинт и поля из контракта. Тест «документирует баг» заменить на тест ожидаемого значения или удалить вместе с кодом.

*Верификатор:* В src нет вызовов /api/partner/hero-metrics. Фронт считает резерв сам (PartnerDashboard.tsx:174-176), а годовую комиссию берет из /invoices/partner-summary (PartnerDashboard.tsx:162-163). Там год определяется по paymentDate→createdAt (invoiceSummaryRepo.ts:14), а в hero — по createdAt (partnerDashboardRepo.ts:21).

#### F46. Сводка долгов считается по всем партнерам ради одного, с мертвым циклом внутри — открыто

- Было: `server/repositories/dashboardRepo.ts:176` (ece9adf). Сейчас: `server/repositories/partnerDebtRepo.ts:8,21-31,36,118,137-143; server/routes/partners.ts:188-190; server/routes/dashboard.ts:259-261`
- Категория: производительность. Принцип: DRY / YAGNI

```
partnerDebtRepo.ts:8 `export async function getPartnerDebtSummaries(db: DB): Promise<{` / :137-143 `for (const payment of allPayments) { if (partnerMap.has(payment.partnerId)) { const summary = partnerMap.get(payment.partnerId)!; // Already added above, but ensure we capture all payments } }` / partners.ts:190 `return res.json(summaries.filter(s => s.partnerId === req.user?.partnerId));`
```

**Что осталось.** Функция перенесена в partnerDebtRepo дословно. partnerId она не принимает, делает три полные выборки (invoices⋈calculations⋈partners, все partnerPayments, все partners), мертвый цикл на месте. Роли partner в /api/partner-debt и /api/financial-summary по-прежнему фильтруют полный результат в памяти. Расхождение агрегации (Math.max по счету в getPartnerDebtDetails против суммы без клампа здесь) осталось.

**Исходная проблема.** getPartnerDebtSummaries без параметров грузит все счета, все платежи и всех партнеров; для роли partner роут и /api/financial-summary (dashboard.ts:255-256) вызывают ее целиком и фильтруют результат в памяти. Внутри — цикл без тела (292-298), оставшийся от предыдущей правки. Фактически это та же агрегация, что getPartnerHeroMetrics и getPartnerDebtDetails, но третьей реализацией.

**Что сделать.** Одна функция partnerDebt.summaries(db, {partnerId?}) с SQL: SUM(partner_transfer_due) по оплаченным счетам LEFT JOIN SUM(amount) по partner_payments, GROUP BY partner_id, WHERE по partnerId при наличии. getPartnerHeroMetrics.debtToAdmin и getPartnerDebtDetails.summary обязаны вызывать ее же. Мертвый цикл удалить.

*Верификатор:* partnerDebtRepo.ts:8 по-прежнему не принимает partnerId и делает три полные выборки (:21-31, :36, :118). Мертвый цикл на месте (:137-143). Роли partner фильтруют результат в памяти: partners.ts:190 и dashboard.ts:259-261.

#### F47. N+1 по платежам партнера и двойная полная выгрузка в одном запросе — частично

- Было: `server/repositories/dashboardRepo.ts:1359` (ece9adf). Сейчас: `server/repositories/partnerDebtRepo.ts:276-280; server/routes/dashboard.ts:176-179,204`
- Категория: производительность. Принцип: KISS / «один запрос — один набор данных»

```
partnerDebtRepo.ts:276-280 `const partnerPaymentsList = await db.select({ ..., invoiceNumber: invoices.invoiceNumber }).from(partnerPayments).leftJoin(invoices, eq(invoices.id, partnerPayments.invoiceId))` / dashboard.ts:179 `const paidInvoices = await storage.getInvoicesWithCalculations();` внутри getActualsForYear, вызываемой дважды на :204
```

**Что осталось.** N+1 по номерам счетов платежей заменен одним leftJoin. Осталось: /api/financial-plans/history дважды грузит полную выборку getInvoicesWithCalculations и режет год в JS. Расчет так и не вынесен в planningRepo.

**Исходная проблема.** getPartnerDebtDetails делает отдельный SELECT на каждый платеж партнера ради номера счета, причем Promise.all выстреливает их одновременно — при 200 платежах это 200 параллельных соединений из пула pg. В /api/financial-plans/history функция getActualsForYear вызывается для двух лет и каждый раз грузит всю выборку getInvoicesWithCalculations() целиком, фильтруя год в JS.

**Что сделать.** В getPartnerDebtDetails заменить цикл одним leftJoin(invoices, eq(partnerPayments.invoiceId, invoices.id)) в запросе платежей. В /financial-plans/history вынести расчет в planningRepo.getPlanHistory(db, years: number[]) с одним SQL GROUP BY year, month и переиспользовать moneyDate; из роута убрать бизнес-логику (см. также 50/50-деление на строках 184-196).

*Верификатор:* N+1 действительно заменен одним leftJoin (partnerDebtRepo.ts:276-280). Но getActualsForYear (dashboard.ts:176-202) вызывается дважды (:204), и каждый раз грузит getInvoicesWithCalculations без фильтра по году и режет год в JS. Логика осталась в роуте.

#### F48. Клиент присылает производные поля расчета, сервер им доверяет; сумма счета имеет два якоря — частично

- Было: `server/repositories/invoiceRepo.ts:454` (ece9adf). Сейчас: `server/repositories/invoiceRepo.ts:214, :373-376, :415-417`
- Категория: модель данных. Принцип: Single Source of Truth; разделение входов и производных

```
const marginRate = invoice.scheme === 'agency' ? parseNum(existing?.commissionRate) : 0; ... if (scheme === "agency" && calculations.commissionRate != null) { await tx.update(invoiceCalculations).set({ commissionRate: calculations.commissionRate })
```

**Что осталось.** Устранено: executorExpensesTotal от клиента игнорируется (calculationInput пропускает только clientBill и commissionRate), clientBill пишется в invoices как единственный якорь. Осталось: ставка маржи 'agency' хранится только в кэше invoice_calculations.commission_rate, колонки invoices.agency_margin_rate нет. Кэш по-прежнему хранит вход расчета, и смена схемы туда и обратно затирает маржу: движок пишет commissionRate=null для agency_30/40 и ставку комиссии для partner_*. Это расходится с docs/architecture-review-remediation.md, где сказано: «invoice_calculations — производная проекция».

**Исходная проблема.** invoices.client_bill берется из invoiceData (req.body.clientBill), а в движок идет calculations.clientBill из того же тела — два разных поля для одной величины, валидатор проверяет оба порознь (validate.ts:44 и :52), но не их равенство. executorExpensesTotal — производное от строк invoice_expenses — принимается от клиента при создании, когда расходов еще нет. Ставка маржи для 'agency' вообще хранится только в кэше invoice_calculations.commission_rate (строка 460: «маржа приходит в calculations.commissionRate») — то есть кэш хранит ВХОД расчета, и `if (!existing) return;` (строка 250) молча пропускает пересчет, если строки кэша нет.

**Что сделать.** Контракт создания счета — только входы: `CreateInvoiceCommand { clientId, partnerId, scheme, clientBill, partnerRate?, agencyMarginRate?, plannedExpenses?, periodic? }`. invoice_calculations объявляется derived-only: ни один роут не пишет в него напрямую, заполняется исключительно recalculateInvoice. agency_margin_rate — колонка invoices (миграция: скопировать из invoice_calculations.commission_rate для scheme='agency').

*Верификатор:* Подтверждаю: ставка маржи agency живет только в кэше. updateInvoice пишет ее туда (invoiceRepo.ts:415-417), движок ее читает (:214), а calculateInvoiceServer (:148-153) обнуляет commissionRate при смене на agency_30/40. После commission_based в кэше лежит ставка партнера, и возврат в agency без явной ставки берет ее как маржу. Вдобавок fallback на :213 смешивает смыслы поля (см. новую находку [0]).

#### F49. deleteInvoice — три DELETE без транзакции, встречный счет после каскада переносов не пересчитывается — частично

- Было: `server/repositories/invoiceRepo.ts:692` (ece9adf). Сейчас: `server/repositories/invoiceRepo.ts:574-585`
- Категория: атомарность. Принцип: Атомарность; симметрия операций (create/delete должны трогать одни и те же инварианты)

```
await db.transaction(async tx => { await lockInvoices(tx, [id]); const [transfer] = ...; if (transfer) throw new CommandError(...); ... await tx.delete(invoices).where(eq(invoices.id, id));
```

**Что осталось.** Атомарность и симметрия переносов устранены: удаление идет в одной транзакции под блокировкой и запрещено при наличии переносов или платежей, поэтому счет-контрагент не остается с поправкой на исчезнувший перенос. Осталось жесткое удаление, которое противоречит правилу «ничего не стирать»: DELETE каскадом уносит расходы, кэш, service_usage и прочие дочерние строки (shared/schema.ts:151,179,190,273,334 onDelete: 'cascade'), хотя мягкий архив (archivedAt, 0007) уже есть.

**Исходная проблема.** Удаление идет тремя стейтментами на `db`, не на `tx` — сбой на третьем оставляет счет без расходов и без кэша (и неперерасчитываемый из-за `if (!existing) return;`). invoice_transfers удаляются каскадом FK, но clientRemaining счета-контрагента, который получил или отдал эти деньги, не пересчитывается — в отличие от deleteInvoiceTransfer (строки 674-682), где пересчет обеих сторон есть. Жесткое удаление также противоречит правилу проекта «ничего не стирать».

**Что сделать.** `deleteInvoice(tx, id)` в транзакции: сначала SELECT counterparties из invoice_transfers, затем удаление (или перевод в status='archived' с архивной таблицей, как требует правило проекта), затем `recalculateInvoice(tx, counterpartyId)` для каждого. Тест: «удаление источника переноса возвращает получателю исходный остаток».

*Верификатор:* Удаление атомарно и запрещено при наличии переносов или платежей (invoiceRepo.ts:574-585). Но это по-прежнему физический DELETE с каскадом на дочерние таблицы (shared/schema.ts:151,179,190,273,334), хотя invoices.archivedAt и команда setArchived (invoiceCommands.ts:96-105) уже есть.

#### F50. Репозитории зависят от типов фасада storage, а фасад содержит бизнес-логику — частично

- Было: `server/repositories/partnerRepo.ts:12` (ece9adf). Сейчас: `server/storage.ts:6, 193-207; server/repositories/partnerRepo.ts:12; server/repositories/actionLogRepo.ts:14`
- Категория: SOLID. Принцип: DIP (абстракции не должны жить в верхнем уровне), SRP фасада

```
export type * from "./storageTypes"; | import type { PartnerClientStatsData, PartnerDocumentRiskData, PartnerAgency30FundsData } from "../storage"; | partnerDto = Math.max(0, totalDebtToAdmin - totalPaid); (storage.ts:207: partnerDebt = Math.max(0, totalDebtToAdmin - totalPaid);)
```

**Что осталось.** DTO вынесены в server/storageTypes.ts, но восемь репозиториев (partnerRepo, actionLogRepo, adminDashboardRepo, planningRepo, reportsRepo, partnerDashboardRepo, recurringRepo, alertsRepo) по-прежнему импортируют их из ../storage через ре-экспорт, так что цикл repo↔facade на уровне модулей остался. Фасад все еще считает долг партнера сам (storage.ts:193-207).

**Исходная проблема.** Семь из двенадцати репозиториев импортируют DTO из ../storage, который сам импортирует эти репозитории — циклическая зависимость repo <-> facade, спасаемая только `import type`. Доменные типы живут в God-объекте, а фасад, задуманный как делегатор, содержит вычисления (долг партнера в storage.ts:487-499).

**Что сделать.** Вынести DTO в server/domain/types/*.ts (или shared/contracts), репозитории импортируют только оттуда. Фасад storage оставить тонким делегатором либо заменить на явные сервисы (PartnerService, ClientService, ActsService), которые принимают репозитории в конструктор; роуты получают сервисы через DI-контейнер. Запретить eslint-правилом import из ../storage внутри repositories/.

*Верификатор:* Подтверждаю. DTO вынесены в storageTypes.ts (storage.ts:6 их реэкспортирует), но восемь репозиториев по-прежнему делают import type из ../storage (например partnerRepo.ts:12, actionLogRepo.ts:14). Долг партнера фасад все так же считает сам (storage.ts:193-207). Цикл держится только на типах, как и на ece9adf.

#### F51. Долг партнера суммируется в четырех местах, агентские коэффициенты захардкожены мимо движка — открыто

- Было: `server/repositories/partnerRepo.ts:120` (ece9adf). Сейчас: `server/storage.ts:203-207; server/repositories/partnerRepo.ts:96, 248, 365; server/repositories/partnerDebtRepo.ts:86, 207, 303; server/repositories/partnerDashboardRepo.ts:48-49; server/repositories/financialReportsRepo.ts:199; server/repositories/actsRepo.ts:103, 148`
- Категория: DRY. Принцип: DRY, Single Source of Truth для денежной математики

```
const debt = parseNum(row.calculations.partnerTransferDue) || 0; (partnerDebtRepo.ts:86, без clamp) vs totalDebt += Math.max(0, parseNum(r.calculations.partnerTransferDue ?? "0")); (partnerRepo.ts:96) | clientBill * (scheme === 'agency_40' ? 0.60 : 0.70) | (stats.executorActs * 1000) + (stats.companyActs * 2000)
```

**Что осталось.** Дашборд-репозиторий разрезали, но формулы просто переехали: долг партнера считается как минимум в шести местах, причем по-разному. getPartnerDebtSummaries суммирует отрицательные partnerTransferDue без Math.max, а details и history их отсекают, поэтому итоги расходятся. Коэффициенты 0.6/0.7 остались в трех местах, тарифы 1000/2000 — в двух в actsRepo и еще в двух на фронте. Общей функции в shared/financialEngine нет.

**Исходная проблема.** Формула «долг партнера = сумма положительных partnerTransferDue по оплаченным счетам минус платежи» реализована четыре раза в трех файлах (включая фасад storage.ts, который должен только делегировать). Коэффициенты 0.60/0.70 для agency_30/40 продублированы дважды в partnerRepo вместо вызова financialEngine; тарифы бонуса ассистента 1000/2000 — дважды в actsRepo. Это те самые «дубли формул движка», но уже на сервере.

**Что сделать.** Ввести server/domain/partnerDebt.ts с чистой функцией `partnerDebt(invoices, payments)` и единым репозиторным запросом; остальные три места переписать на нее. Коэффициенты и тарифы — константы/функции в shared/financialEngine (agencyClientBaseRatio(scheme), ASSISTANT_BONUS_TARIFF), а не литералы. Добавить property-тест, что все четыре вызова дают одинаковую сумму на одном наборе данных.

*Верификатор:* Подтверждаю. partnerDebtRepo.ts:86 суммирует partnerTransferDue без Math.max, а partnerRepo.ts:96, partnerDebtRepo.ts:207 и 303, storage.ts:203 обрезают ноль. Коэффициенты 0.6/0.7 стоят в partnerRepo.ts:248, partnerRepo.ts:365 и financialReportsRepo.ts:199, тарифы 1000/2000 — в actsRepo.ts:103/148. В shared/financialEngine.ts общей функции нет: экспортируются только AGENCY_SCHEMES, isAgencyScheme, calculate* и parseNum.

#### F52. Агрегаты считаются в JS по полным выборкам, фильтр по году без верхней границы — открыто

- Было: `server/repositories/partnerRepo.ts:256` (ece9adf). Сейчас: `server/repositories/partnerRepo.ts:208, 232, 129-167; server/repositories/partnerDebtRepo.ts:21-36, 118; server/routes/partners.ts:188-190`
- Категория: производительность. Принцип: —

```
const yearEnd = new Date(year, 11, 31, 23, 59, 59); | if (!paymentDate || paymentDate.getFullYear() !== year) continue; | const allPayments = await db.select().from(partnerPayments); | return res.json(summaries.filter(s => s.partnerId === req.user?.partnerId));
```

**Что осталось.** yearEnd по-прежнему не используется, и год обрезается в JS. getPartnerDebtSummaries (теперь в partnerDebtRepo) грузит все счета, все платежи и всех партнеров, а для партнера результат фильтруется после полной выборки. В getPartnerPayments убрали OR-ветку, но там все еще два запроса и бессмысленный Map-дедуп по p.id.

**Исходная проблема.** getPartnerClientStats берет из БД все оплаченные счета начиная с 1 января выбранного года без верхней границы и отбрасывает лишние в JS; getPartnerPayments делает два запроса и дедуплицирует в Map то, что решается одним LEFT JOIN; getPartnerDebtSummaries (роут /api/partner-debt в partners.ts:200) грузит все счета и все платежи системы, чтобы просуммировать по партнерам. Для партнера результат еще и фильтруется уже после полной выборки (partners.ts:204).

**Что сделать.** Перевести агрегаты в SQL: GROUP BY partner_id с SUM(partner_transfer_due) и SUM(amount) по partner_payments; для партнера — WHERE по его id до агрегации, а не filter() после. В getPartnerClientStats добавить lt(actualPaymentDate, nextYearStart) и группировать date_trunc('month') в запросе. Вынести в отдельный partnerMetricsRepo с тестами на PGlite.

*Верификатор:* Подтверждаю. yearEnd объявлен и не используется (partnerRepo.ts:208), год дорезается в JS (232). getPartnerDebtSummaries без WHERE грузит все счета, все платежи и всех партнеров (partnerDebtRepo.ts:21-36, 118), а партнеру ответ фильтруется уже после выборки (partners.ts:188-190). В getPartnerPayments по-прежнему два запроса и бесполезный Map-дедуп (partnerRepo.ts:129-167).

#### F53. Планы месяца: год и месяц как строки, upsert без уникального ключа — открыто

- Было: `server/repositories/planningRepo.ts:41` (ece9adf). Сейчас: `shared/schema.ts:290-291,298; server/repositories/planningRepo.ts:41-55; server/routes/dashboard.ts:225-227`
- Категория: модель данных. Принцип: — (целостность данных)

```
schema.ts:290 `year: numeric("year", { precision: 4, scale: 0 }).notNull(),` / :298 `index("idx_monthly_plans_year_month").on(table.year, table.month),` / planningRepo.ts:42 `const existing = await getMonthlyPlan(db, input.year, input.month);` / dashboard.ts:225 `salesTarget: salesTarget ? parseNum(salesTarget) : undefined,`
```

**Что осталось.** Ничего не изменилось. year и month хранятся как numeric-строки, индекс не уникален (в миграциях 0002–0007 таблица не затронута). Upsert сделан как select-then-insert без ON CONFLICT и транзакции, getMonthlyPlan использует limit 1 без orderBy. Обнулить цель через роут по-прежнему нельзя.

**Исходная проблема.** year/month хранятся как numeric и ходят по коду как строки (toString() при записи, parseInt() при чтении в роуте 169-170, 203-204 и в репозитории 93). Индекс по (year, month) не уникальный, а upsertMonthlyPlan — это select-then-insert без транзакции: два параллельных сохранения формы создают две записи плана на один месяц, и getMonthlyPlan потом возвращает случайную (limit 1 без orderBy). Семантика `salesTarget?.toString() || existing.salesTarget` (48-50) не позволяет обнулить цель: 0 → falsy → остается старое значение.

**Что сделать.** Миграция: year integer, month smallint, UNIQUE(year, month); upsert через db.insert(...).onConflictDoUpdate({ target: [year, month], set: {...} }) одним запросом; в set использовать `input.salesTarget !== undefined ? ... : sql`excluded.sales_target`` вместо ||. Типы MonthlyPlanInput/MonthlyFinancialPlan — числовые, parseInt из роутов убрать.

*Верификатор:* Ничего не изменилось. schema.ts:290-298: year и month хранятся как numeric, индекс не уникален. В миграциях таблица есть только в drizzle/0000. upsert в planningRepo.ts:41-55 — select-then-insert, а `input.salesTarget?.toString() || existing.salesTarget` не дает обнулить цель.

#### F54. Три независимых алгоритма прогноза по периодическим счетам — открыто

- Было: `server/repositories/planningRepo.ts:213` (ece9adf). Сейчас: `server/repositories/planningRepo.ts:262-264,287-296; server/repositories/recurringRepo.ts:216,324,413-419,434-437; server/repositories/clientOverviewRepo.ts:254-262`
- Категория: DRY. Принцип: DRY

```
planningRepo.ts:262 `const maxIterations = 100; // Safety limit` + :289 `checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);` / recurringRepo.ts:415 `monthlyTotal += expectedProfit / 3;` :418 `monthlyTotal += expectedProfit / 12;` / recurringRepo.ts:324 `while (cursor <= rangeEnd && iterations < 500) {`
```

**Что осталось.** Появился shared/recurringSchedule.ts с nextOccurrence/calendarDate, и шаги в recurringRepo через него унифицированы. Но сам дефект на месте: getAdminForecast (свой цикл в локальном времени с лимитом 100, без вычитания созданных счетов), getRecurringExpectedForMonth (генератор с лимитом 500 и createdKeys) и getRecurringExpectedAmounts (квартал/3, год/12) по-прежнему дают разные суммы за один месяц. Добавился еще periodsBetween в clientOverviewRepo. Функции occurrences(template, range) нет, getRecurringExpectedAmounts не удален.

**Исходная проблема.** Ожидаемая прибыль по шаблонам recurring_invoices считается тремя способами: getAdminForecast (цикл while с лимитом 100, старт от nextInvoiceDate или startDate), recurringRepo.getRecurringExpectedForMonth (генератор с лимитом 500, вычитание уже созданных счетов через createdKeys) и recurringRepo.getRecurringExpectedAmounts (деление квартального на 3 и годового на 12 — вообще не календарь). Все три вызывают один и тот же calculateInvoiceServer, но дают разные суммы за один и тот же месяц.

**Что сделать.** Один чистый модуль shared/recurringSchedule.ts: occurrences(template, rangeStart, rangeEnd): Date[] (без БД, тестируется таблично) и expectedProfit(template) через движок. Все три потребителя получают данные через него; getRecurringExpectedAmounts удалить, подставив getRecurringExpectedForMonth(now).

*Верификатор:* Три реализации на месте: planningRepo.ts:262-296 (лимит 100, локальное время), recurringRepo.ts:324 (генератор, лимит 500) и recurringRepo.ts:413-419 (квартал/3, год/12). Дополнительно: результат getRecurringExpectedAmounts (storage.ts:231-233) режется в projectStatsForRole, потому что в permissions.ts:121-125 нет recurringExpected*. Расчет фактически мертвый, но не удален.

#### F55. Расписание периодики реализовано пять раз с ошибками переполнения месяца и часового пояса — частично

- Было: `server/repositories/recurringRepo.ts:26` (ece9adf). Сейчас: `shared/recurringSchedule.ts:9-16; server/repositories/recurringRepo.ts:190-197, 292-299, 204-226, 309-334, 410-420`
- Категория: DRY. Принцип: DRY; доменная модель вместо процедур

```
const createdKeys = new Set<string>(); for (const inv of existingFromRecurring) { ... createdKeys.add(key); }  (дважды) ... case 'quarterly': monthlyTotal += expectedProfit / 3;
```

**Что осталось.** Переполнение месяца устранено: шаг по частоте сведен к nextOccurrence с якорем дня и clamp (тест reviewRegressions.test.ts:80-84), все вызовы advanceByFrequency идут через него. Дублирование осталось: набор createdKeys собирается дважды, hasOccurrenceInMonth и generateOccurrences почти побуквенно одинаковы, ветка `if (cursor < scheduleStart) { cursor = <то же выражение> }` осталась no-op (211-213, 319-321). Три функции прогноза по-прежнему дают три разные оценки, getRecurringExpectedAmounts делит квартал на 3, и считается все в double через parseNum и +=.

**Исходная проблема.** Шаг по частоте написан пять раз, генератор вхождений — дважды (hasOccurrenceInMonth 294-316 и generateOccurrences 410-435, почти побуквенно), набор createdKeys — дважды (270-277 и 383-390). `setMonth(getMonth()+1)` от 31 января дает 3 марта; `toISOString().split('T')[0]` на сервере в UTC+3 сдвигает дату на день назад после полуночи. Три функции прогноза (getRecurringInvoicesForMonth, getRecurringExpectedForMonth, getRecurringExpectedAmounts) дают три разные оценки одного и того же: третья делит квартал на 3, первые две считают вхождения.

**Что сделать.** Чистый value object `Schedule { start, end?, frequency, dayOfMonth }` в shared/schedule.ts с методами `next(after)`, `occurrencesBetween(from, to)` на календарной арифметике без Date-мутаций (год/месяц/день как числа, clamp дня к длине месяца). Все пять мест вызывают его; unit-тесты на 31-е число, февраль, конец года. Прогноз прибыли — одна функция `expectedProfit(schedule, range)`.

*Верификатор:* Статус partial верен, но вывод «переполнение месяца устранено» неполон. В planningRepo.ts:256 (setMonth) и :288-296 (new Date(y, m+1, dayOfMonth) по локальному времени) прогноз админа по-прежнему переполняет месяц: при dayOfMonth=31 после 31 января идет 3 марта. CreateRecurringInvoiceDialog.tsx:64-89 считает nextInvoiceDate через setMonth и toISOString, отправляет его на сервер, и в UTC+3 дата сдвигается на день назад. Дубли createdKeys, генераторов и no-op ветки (recurringRepo.ts:190-197/292-299, 211-213/319-321) на месте, есть и четвертый прогноз в planningRepo.ts:229.

#### F56. Глобальный поиск: пять последовательных seq-scan запросов, pg_trgm без индекса и без миграции — частично

- Было: `server/repositories/searchRepo.ts:71` (ece9adf). Сейчас: `server/repositories/searchRepo.ts:59-60,74,128,180,223,239; drizzle/0002–0007`
- Категория: производительность. Принцип: — (производительность и воспроизводимость окружения)

```
searchRepo.ts:59 `const scope = invoiceScope({ role: role as 'admin' | 'assistant' | 'client', clientId: options.clientId });` / :74 `const invRows = await db.execute(sql`` ... :128 `const threadRows = await db.execute(sql`` ... :180 `const expenseRows = await db.execute(sql`` — последовательные await; `pg_trgm` встречается только в комментарии searchRepo.ts
```

**Что осталось.** Tenant-граница теперь общая (invoiceScope через подзапрос) и покрыта HTTP-тестом для ассистента (accessPreservation.http.test.ts:119-126), так что пункт про изоляцию закрыт. Производительность и воспроизводимость окружения не тронуты: пять запросов идут последовательно, CREATE EXTENSION pg_trgm и GIN-индексов нет ни в одной миграции. LOWER(col) LIKE '%q%' и similarity() по-прежнему идут seq-scan, а литерал схем в :175 остался.

**Исходная проблема.** Инъекций нет — все значения идут параметрами через sql``, это стоит зафиксировать. Но: пять запросов выполняются последовательно, а не Promise.all; LOWER(col) LIKE '%q%' и similarity() по пяти колонкам не используют ни один индекс (в shared/schema.ts нет GIN gin_trgm_ops, а CREATE EXTENSION pg_trgm не встречается ни в схеме, ни в скриптах — расширение поставлено на проде вручную и тестами на PGlite не воспроизводится). Результаты приводятся через (rows ?? rows) as Array<...> без валидации. Тестов на searchRepo нет ни одного.

**Что сделать.** Зафиксировать расширение и индексы в миграции drizzle: CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX ... USING gin (lower(invoice_number) gin_trgm_ops), аналогично client_title, clients.name, invoice_messages.body, invoice_expenses.description. Пять запросов — в Promise.all с общим лимитом. Вынести построение role-зависимых фрагментов в searchScope(role, clientId) и покрыть тестом tenant-изоляции (клиент не находит чужие треды/расходы) в routes/tenantIsolation.security.test.ts.

*Верификатор:* Граница доступа общая (searchRepo.ts:59-60 через invoiceScope). Запросы идут последовательными await (:74, :128, :180, :223, :239). CREATE EXTENSION pg_trgm нет ни в drizzle/, ни в deploy/, поэтому similarity() на чистой базе упадет. Литерал схем в :175 остался.

#### F57. Каждый аутентифицированный запрос — 3 round-trip к БД и UPDATE; сессии никогда не удаляются — открыто

- Было: `server/repositories/userRepo.ts:111` (ece9adf). Сейчас: `server/repositories/userRepo.ts:111-133; server/worker.ts:10-20`
- Категория: производительность. Принцип: —

```
const [session] = await db
    .select()
    .from(userSessions)
...
  await db.update(userSessions)
    .set({ lastActivity: new Date() })
...
  const [token] = await db
    .select()
    .from(accessTokens)
```

**Что осталось.** validateSession без изменений: на каждый аутентифицированный запрос три последовательных обращения к БД и UPDATE, без JOIN и без троттлинга lastActivity. В коде нет ни одного delete(userSessions) или DELETE FROM user_sessions. В worker.ts появился JobRunner с почасовой очисткой login_rate_limits, но задачи очистки сессий в нем нет. Таблица растет вечно и теперь еще целиком уходит в каждый бэкап (backupTables.ts:14).

**Исходная проблема.** validateSession на каждом из 129 эндпоинтов делает SELECT сессии, UPDATE lastActivity и SELECT токена — три сетевых хода и одна запись на любой GET. В репозитории нет ни одного `delete(userSessions)`: протухшие и отозванные строки копятся вечно (каждый вход = новая строка, срок 30 минут). Дашборды фронта делают десятки useQuery на экран — это десятки UPDATE на одно открытие страницы.

**Что сделать.** Один запрос с JOIN access_tokens и фильтрами в WHERE; lastActivity обновлять не чаще раза в 60 секунд (сравнение в приложении или `WHERE last_activity < now() - interval '1 minute'`). Планировщик `DELETE FROM user_sessions WHERE expires_at < now() - interval '1 day' OR revoked` раз в сутки (вынести из server/vite.ts в server/jobs/). Опционально LRU-кэш валидных сессий на 30 секунд в процессе.

*Верификатор:* validateSession (userRepo.ts:106-138) по-прежнему делает SELECT сессии, UPDATE lastActivity и SELECT токена без JOIN и троттлинга. Явной очистки user_sessions нет ни в коде, ни в worker.ts:10-20. Сессии удаляются только каскадом при удалении access_token (drizzle/0000:263). Таблица целиком уходит в бэкап (backupTables.ts:14).

#### F58. Три запроса к БД на каждый аутентифицированный запрос, включая UPDATE last_activity — открыто

- Было: `server/repositories/userRepo.ts:121` (ece9adf). Сейчас: `server/repositories/userRepo.ts:111-133; server/middleware.ts:40`
- Категория: производительность. Принцип: KISS/YAGNI (точность lastActivity до секунды не нужна), минимизация I/O на горячем пути

```
await db.update(userSessions)
    .set({ lastActivity: new Date() })
    .where(eq(userSessions.id, session.id));

  const [token] = await db
    .select()
```

**Что осталось.** validateSession не изменился: SELECT сессии, затем безусловный UPDATE lastActivity, затем отдельный SELECT токена, три последовательных round-trip на каждый защищенный запрос, включая GET. Нет ни JOIN, ни троттлинга записи, ни кэша. UPDATE к тому же выполняется до проверки, активен ли токен.

**Исходная проблема.** authMiddleware (middleware.ts:39) зовет validateSession на каждом из 129 роутов. validateSession делает SELECT сессии, затем UPDATE lastActivity (запись при каждом GET), затем SELECT токена — три round-trip до начала обработки. Фронт на TanStack Query при открытии дашборда админа шлет десятки параллельных запросов (/dashboard/stats, /financial-summary, /partner-debt, /alert-counts, /priority-actions ...) — это 30+ запросов к Postgres только на проверку сессии, из них треть — записи в одну строку с блокировкой.

**Что сделать.** Один SELECT с join userSessions × accessTokens. UPDATE lastActivity — только если прошло более 5 минут с предыдущего значения (условие прямо в WHERE) или через in-memory LRU-кэш sessionId → { token, expiresAt } с TTL 30 с и инвалидацией в revokeSession. Проверка CSRF остается, кэшируется только результат чтения.

*Верификатор:* Подтверждаю: userRepo.ts:111-133 по-прежнему делает SELECT сессии, безусловный UPDATE lastActivity и отдельный SELECT токена, причем UPDATE идет до проверки isActive. Его вызывает каждый защищенный запрос (middleware.ts:40).

#### F59. Коды доступа — это пароли, но хранятся обратимо и отдаются списком; маска светит 4 символа коллегам — открыто

- Было: `server/repositories/userRepo.ts:174` (ece9adf). Сейчас: `server/repositories/userRepo.ts:172-174; server/routes/me.ts:72; server/routes/acts.ts:46-47`
- Категория: безопасность. Принцип: Пароли не хранятся обратимо; минимально необходимое раскрытие

```
return results.map(r => ({
    ...r.token,
    code: codeForDisplay(r.token), // расшифрованный код для показа админу
...
codeMask: (() => { const c = codeForDisplay(p); return c && c !== "—" ? `${c.slice(0, 2)}••••${c.slice(-2)}` : "—"; })(),
```

**Что осталось.** Коды хранятся обратимо (codeEnc), GET /api/access-tokens отдает все коды всех ролей расшифрованными. Через spread `...r.token` наружу дополнительно уходит и сам шифртекст codeEnc. Маска в /api/me/access-info по-прежнему показывает коллегам последние два реальных символа кода. Перевыпуска вместо просмотра нет, второго фактора для admin тоже нет.

**Исходная проблема.** Код — единственный фактор входа, то есть пароль. GET /api/access-tokens возвращает все коды всех ролей расшифрованными: компрометация одной админ-сессии (см. CSRF/XSS выше) = все учетки компании, включая другие админ-коды. В /api/me/access-info любой клиент видит маску кодов коллег: при формате `CLT-XXXXXXXX` первые два символа — константа «CL», а последние два — реальные символы кода, то есть пространство перебора коллеги сокращается в 1296 раз.

**Что сделать.** Хранить только HMAC (без codeEnc). Код показывать один раз в ответе createAccessToken; вместо «посмотреть» дать «перевыпустить» (новый код, старый деактивирован). В access-info отдавать id/роль/lastUsedAt без маски. Для admin-кодов рассмотреть второй фактор (TOTP) — это дешево при текущей архитектуре сессий.

*Верификатор:* userRepo.ts:172-174 возвращает `...r.token` (вместе с codeEnc) и `code: codeForDisplay(...)`, роут acts.ts:46-47 доступен только admin. Маска в me.ts:72 показывает 2+2 символа кодов коллег. Перевыпуска вместо просмотра и второго фактора нет.

#### F60. Мертвые эндпоинты и no-op контракт, который фронт продолжает вызывать — открыто

- Было: `server/routes/acts.ts:23` (ece9adf). Сейчас: `server/repositories/actsRepo.ts:173; server/routes/acts.ts:14-17, 29, 34-37; src/components/invoices/admin/AssistantBonusManager.tsx:316; server/routes/partners.ts:210, 221; server/routes/clients.ts:147`
- Категория: поддерживаемость. Принцип: YAGNI, KISS

```
export async function markBonusesAsPaid(_db: DB, _invoiceIds: string[]): Promise<void> {} | if (invoiceIds && invoiceIds.length > 0) await storage.markBonusesAsPaid(invoiceIds); | invoiceIds: unpaidBonus?.invoiceIds || [],
```

**Что осталось.** No-op контракт жив с обеих сторон, и более того, его закрепили в новых портах: storagePorts.ts:328 и routeStores.ts:103 (ActsStore). Два бонусных GET отдают один и тот же список. /api/partners/:id/payment-history и /api/my-payment-history по-прежнему без вызовов из src. К ним добавился мертвый /api/acts/:id/download (фронт перешел на /content).

**Исходная проблема.** Роут выплаты бонуса принимает invoiceIds и вызывает функцию, которая намеренно ничего не делает, при этом фронт (AssistantBonusManager) собирает и передает эти id — мертвый контракт, поддерживаемый с обеих сторон. Два бонусных эндпоинта возвращают одно и то же. Четыре эндпоинта партнеров/клиентов с собственной авторизационной логикой не имеют ни одного вызова из src, но несут поверхность атаки и требуют поддержки при каждом изменении tenantAccess.

**Что сделать.** Удалить неиспользуемые роуты и markBonusesAsPaid вместе с invoiceIds в клиенте; бонусы свести к одному ресурсу /api/assistant-bonus/{payments,summary} с ролевой проекцией. Ввести типизированный реестр API (zod-контракты в shared/api, генерируемый клиент в src/lib/api) — тогда неиспользуемый эндпоинт виден как неиспользуемый экспорт, а расхождение сигнатур ловит tsc, а не прод.

*Верификатор:* Подтверждаю. markBonusesAsPaid пустой (actsRepo.ts:173), а сохраняют его acts.ts:29, storagePorts.ts:328, routeStores.ts:103 и фронт AssistantBonusManager.tsx:316. Оба GET (acts.ts:14 и 34) отдают один и тот же список. У payment-history, my-payment-history (partners.ts:210, 221) и /api/acts/:id/download нет вызовов из src: SignedActsSection ходит на /content.

#### F61. Политика силы кода живет на фронте в двух копиях, сервер принимает любую непустую строку — открыто

- Было: `server/routes/acts.ts:51` (ece9adf). Сейчас: `server/routes/acts.ts:57-59; src/components/admin/AccessCodesManager.tsx:111; src/components/invoices/admin/ManageAccessCodesDialog.tsx:118`
- Категория: DRY. Принцип: DRY; SRP (acts.ts отвечает за акты, а не за выпуск учеток)

```
if (typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({ error: "code обязателен" });
    }
...
  const generateCode = (role: UserRole) => {
```

**Что осталось.** Сервер по-прежнему принимает любой непустой код. Генератор продублирован в двух компонентах, роуты /api/access-tokens все так же лежат в acts.ts. Кроме того, нормализация регистра живет только на фронте (AccessCodesManager.tsx:145 `code.toUpperCase()`). userRepo.createAccessToken хэширует код как есть, а логин приводит ввод к верхнему регистру (auth.ts:74), поэтому код в нижнем регистре, созданный через API, войти не даст.

**Исходная проблема.** Генерация кода (алфавит, длина 8, префикс роли) продублирована в двух React-компонентах, а сервер проверяет только непустоту: админ может создать код «1». Роут создания токенов при этом лежит в routes/acts.ts (акты), а не в auth — бизнес-правило безопасности разбросано по UI и по чужому модулю.

**Что сделать.** Перенести выпуск кодов в server/auth/accessCodes.ts: сервер сам генерирует код (randomBytes → base32, не менее 10 символов, без ручного ввода), фронт получает его один раз. Удалить обе фронтовые generateCode. Роуты /api/access-tokens переехать в routes/auth.ts или отдельный routes/accessTokens.ts.

*Верификатор:* acts.ts:57-59 проверяет только непустоту. generateCode продублирован (AccessCodesManager.tsx:111, ManageAccessCodesDialog.tsx:118), верхний регистр приводят только эти два компонента (:145, :152). userRepo.createAccessToken (userRepo.ts:187) хэширует код без toUpperCase, а логин приводит ввод к верхнему регистру (auth.ts:74), поэтому код в нижнем регистре, созданный через API, войти не даст.

#### F62. Валидация тела запроса: zod в одном роуте, ручной regex в соседнем, ничего в актах — частично

- Было: `server/routes/acts.ts:97` (ece9adf). Сейчас: `server/routes/acts.ts:104, 137; server/services/paymentCommands.ts:15-20; server/routes/acts.ts:26-27; server/routes/clients.ts:76-78`
- Категория: поддерживаемость. Принцип: DRY, fail-fast на границе

```
z.object({ actType: z.enum(['company', 'executor']), fileName: z.string().min(1).max(255), fileData: z.string().optional(), mimeType: z.string().max(120).optional(), ... }).strict() | const { amount, notes, invoiceIds } = req.body;
```

**Что осталось.** Конкретные дефекты закрыты. actType проверяется по enum, fileName обязателен, размер ограничен 10 MiB в decodeDocument, а PUT платежа идет через ту же zod-схему fields, что и POST. Осталось: mimeType без whitelist, причем мертвый /download отдает data URL с сохраненным mimeType (actsRepo.ts:186). Схема объявлена inline в роуте, а не в shared-контракте. Соседние тела (bonus-payout, partnerIds клиента, партнеры через pick) по-прежнему без типовой валидации.

**Исходная проблема.** actType не проверяется против enum (invalid -> ошибка Postgres -> 500), fileName может быть undefined при notNull-колонке (500), mimeType и размер base64 (до 20mb по index.ts:41) не ограничены по типу. В partners.ts POST платежа идет через zod-схему, а PUT того же ресурса — через ручной regex, то есть одна и та же сущность валидируется двумя разными способами.

**Что сделать.** Единый контракт на границе: zod-схемы для каждого ресурса в shared/contracts (actUploadSchema с enum actType, whitelist mimeType, лимит длины fileData; partnerPaymentSchema переиспользовать и в PUT через .partial()). Подключать через общий middleware validate(schema), который кладет типизированный результат в req.validated — тогда деструктуризация req.body исчезает из хендлеров.

*Верификатор:* Подтверждаю. Тело загрузки акта теперь проверяет zod (acts.ts:104), действует лимит 10 MiB (objectStore.ts:19-24), а PUT платежа идет через fields (paymentCommands.ts:83). Осталось: mimeType без whitelist, и /download отдает его в data URL (actsRepo.ts:186). Тела bonus-payout (acts.ts:26) и partnerIds (clients.ts:76-78, 204) по-прежнему без схемы.

#### F63. N+1 по актам в сводке клиентов и по партнерам в списке клиентов — частично

- Было: `server/routes/clients.ts:90` (ece9adf). Сейчас: `server/routes/documentStatus.ts:23-25; server/repositories/clientRepo.ts:94-99; server/routes/messages.ts:42, 54-69`
- Категория: производительность. Принцип: —

```
bool_or(${signedActs.actType} = 'company') AS company, bool_or(${signedActs.actType} = 'executor') AS executor | scopedClients.map(async client => ({ ...client, partners: await getClientPartners(db, client.id), })) | // Берем для каждого треда последнее сообщение через distinct on.
```

**Что осталось.** acts-status переписан на один агрегирующий SQL с пагинацией и тестом (reviewCompletion.test.ts:115-124), тут исправлено. getClientsWithPartners все еще делает по запросу на клиента, а треды сообщений по-прежнему считают последнее сообщение двумя одинаковыми коррелированными подзапросами. Комментарий про distinct on так и врет.

**Исходная проблема.** /api/clients/acts-status грузит ВСЕ счета со всеми join (getInvoices), затем делает отдельный SELECT актов на каждый оплаченный счет — при 500 оплаченных счетов это 500 запросов за один клик по дашборду. getClientsWithPartners — запрос на каждого клиента. Треды сообщений считают last_message_body и last_message_role двумя коррелированными подзапросами вместо одного DISTINCT ON / оконной функции.

**Что сделать.** acts-status: один запрос `SELECT invoice_id, bool_or(act_type='company'), bool_or(act_type='executor') FROM signed_acts GROUP BY invoice_id` + агрегат по клиентам в SQL; вынести в actsRepo.getClientActsStatus(scope). getClientsWithPartners: один join client_partners -> partners с группировкой в коде. Треды: оконная функция row_number() over (partition by invoice_id, expense_id order by created_at desc). Агрегатные эндпоинты не должны собираться в контроллере из «списков всего».

*Верификатор:* Подтверждаю. acts-status теперь считается одним агрегирующим SQL (documentStatus.ts:19-26). Остался N+1 в getClientsWithPartners (clientRepo.ts:94-99) и два одинаковых коррелированных подзапроса в тредах (messages.ts:54-69), а комментарий про distinct on (messages.ts:42) не соответствует коду.

#### F64. Бизнес-логика и сырой SQL в роутах: план-факт считается в обработчике с двойной полной выборкой — частично

- Было: `server/routes/dashboard.ts:173` (ece9adf). Сейчас: `server/routes/dashboard.ts:176-204; server/routes/messages.ts:43; server/routes/documentStatus.ts:29; server/routes/assistant.ts:18`
- Категория: спагетти. Принцип: Слоистость (контроллер → сервис → репозиторий), SRP

```
const getActualsForYear = async (year: number) => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      const paidInvoices = await storage.getInvoicesWithCalculations();
```

**Что осталось.** Исправлена только часть про me.ts: полная выборка расходов ушла в сервис personalDataExport с батчами, прямых db-вызовов в me.ts стало 7 вместо 14. Головной дефект на месте: план-факт считается в обработчике, getInvoicesWithCalculations без фильтра по году вызывается дважды через Promise.all, а разбор долей и fallback netProfit/2 лежат в роуте. В messages.ts остались 10 прямых db-вызовов и 40-строчный сырой SQL. Хуже того, новый код повторяет антипаттерн: documentStatus.ts и assistant.ts собирают в обработчиках многоэтажный SQL с json_build_object.

**Исходная проблема.** GET /api/financial-plans/history (163-214) содержит 50 строк доменной логики: разбор долей adminShare50/catShare50, fallback «netProfit / 2», сортировка планов, сборка ответа. Вложенная функция грузит ВСЕ счета с расчетами (`getInvoicesWithCalculations()` без фильтра по году) и вызывается дважды — два полных скана таблицы на один запрос, фильтрация по дате в JS. Та же болезнь в других роутерах: routes/messages.ts:40 `await db.execute(sql\`SELECT ... distinct on ...\`)` — 40-строчный SQL прямо в обработчике; routes/me.ts — 14 прямых обращений к db (строки 56-257), включая выборку всех расходов `db.select().from(invoiceExpenses)` без where (223) и всех сообщений (239).

**Что сделать.** planningRepo.getPlanFactHistory(db, years[]) с одним SQL: `SELECT extract(year), extract(month), sum(admin_share50), sum(cat_share50) ... WHERE payment_date BETWEEN ... GROUP BY 1,2`. Вынести messages и me в messagesRepo/profileRepo с теми же сигнатурами (db, ...). Закрепить правило eslint `no-restricted-imports: ["../db"]` для server/routes/** и тестом tenantIsolation покрыть messages/me.

*Верификатор:* Подтверждаю: в dashboard.ts:176-204 getActualsForYear вызывает storage.getInvoicesWithCalculations() без фильтра, дважды через Promise.all, а parseShare и fallback netProfit/2 лежат прямо в обработчике. В documentStatus.ts:29-52 и assistant.ts:18 обработчики собирают сырой SQL с json_build_object, в messages.ts 10 обращений к db.

#### F65. Перекрывающиеся эндпоинты статистики и просрочки, бизнес-логика в обработчиках роутов — открыто

- Было: `server/routes/dashboard.ts:243` (ece9adf). Сейчас: `server/routes/dashboard.ts:12,62,93,102,166-217,246-268,270,281`
- Категория: спагетти. Принцип: SRP (роут = транспорт), KISS

```
dashboard.ts:194-196 `if (adminShare === 0 && catShare === 0 && invoice.netProfitAdmin) { const netProfit = parseShare(invoice.netProfitAdmin); if (netProfit > 0) { adminShare = netProfit / 2; catShare = netProfit / 2; } }` / :246 `dashboardRouter.get("/api/financial-summary", ...` / :62 `dashboardRouter.get("/api/invoices/overdue", ...`
```

**Что осталось.** Все три эндпоинта статистики и четыре эндпоинта просрочки на месте. /api/financial-summary по-прежнему нигде не запрашивается (в src только invalidateQueries в RecalculateInvoicesButton.tsx:27), у /api/invoices/overdue тоже нет потребителя на фронте. 50 строк бизнес-логики /financial-plans/history (деление 50/50, parseShare с порогом 0.01) остались в обработчике. Повторяющиеся try/catch не заменены общим error-middleware.

**Исходная проблема.** Три эндпоинта статистики (/api/dashboard/stats, /api/financial-summary, /api/admin/dashboard-stats) и четыре эндпоинта просрочки отдают пересекающиеся данные с разной семантикой. /api/financial-summary собирает stats + весь список счетов + долги всех партнеров в один ответ, при этом единственный вызов на фронте — RecalculateInvoicesButton.tsx для инвалидации. Обработчик /api/financial-plans/history (163-214) содержит 40 строк бизнес-логики (деление прибыли 50/50, parseShare с порогом 0.01), которой нет ни в движке, ни в репозитории.

**Что сделать.** Оставить по одному read-model на экран: GET /api/admin/dashboard (stats+recurring+invoices по категории) и GET /api/alerts (overdue, drafts_no_date, long_sent единым списком с полем kind). /api/financial-summary и /api/invoices/overdue пометить deprecated и удалить после переключения фронта. Всю логику из обработчиков перенести в analytics/*; роут — только parse query → вызов → projectForRole → json. Общий asyncHandler + централизованный error-middleware вместо 20 одинаковых try/catch.

*Верификатор:* Эндпоинты и бизнес-логика 50/50 в обработчике dashboard.ts:183-200 на месте. /api/financial-summary нигде не запрашивается. admin/OverduePaymentsAlert.tsx:28 вызывает /invoices/overdue, но StatsPage.tsx:7 его только импортирует и не рендерит, так что потребителя у эндпоинта действительно нет.

#### F66. Словари подписей статусов/схем размножены по серверу и фронту с расходящимися текстами — открыто

- Было: `server/routes/export.ts:72` (ece9adf). Сейчас: `server/routes/export.ts:89-90, 280, 509, 807; server/routes/myInvoices.ts:11-12; src/components/invoices/assistant/ClientBalancesView.tsx:31-32; src/components/invoices/PartnerDashboard.tsx:38`
- Категория: DRY. Принцип: DRY; Single Source of Truth для доменных справочников

```
export.ts:90 agency_30: "Агентский 30%" ... commission_based: "Комиссионный"  vs  myInvoices.ts:12 agency_30: "Агентство 30%" ... commission_based: "Партнерское соглашение"
```

**Что осталось.** statusMap по-прежнему объявлен 4 раза в export.ts и еще раз в myInvoices.ts. schemeMap в export.ts и myInvoices.ts расходятся по-прежнему. На фронте остались локальные SCHEME_LABELS. shared/labels.ts не появился.

**Исходная проблема.** statusMap объявлен 4 раза внутри одного файла export.ts и еще минимум в 6 местах проекта; schemeMap в export.ts и myInvoices.ts дает разные подписи одной схеме («Агентский 30%» против «Агентство 30%», «Партнер 10%» против «Партнерское 10%»). Клиент получает в Excel одно название схемы, в кабинете — другое. При добавлении статуса или схемы нужно найти и поправить ~10 словарей.

**Что сделать.** `shared/labels.ts` рядом с enum-ами в shared/schema.ts: `STATUS_LABELS: Record<InvoiceStatus,string>`, `SCHEME_LABELS: Record<InvoiceScheme,string>`, с `satisfies` для исчерпывающей проверки типом. Сервер уже импортирует shared (financialEngine, schema), фронт — тоже; удалить все локальные словари, eslint-правило `no-restricted-syntax` на литерал "Черновик" вне shared.

*Верификатор:* statusMap объявлен в export.ts:89, 280, 509, 807 и в myInvoices.ts:11. schemeMap расходится: export.ts:90 «Агентский 30%»/«Комиссионный», myInvoices.ts:12 «Агентство 30%»/«Партнерское соглашение». Локальные словари остались в ClientBalancesView.tsx:31 и PartnerDashboard.tsx:34-41 («По договору», без 'agency'). Общего shared/labels нет.

#### F69. Журнал действий: 15 копий одного объекта с ip/userAgent и 10 мертвых проверок роли после requireRole — частично

- Было: `server/routes/invoices.ts:52` (ece9adf). Сейчас: `server/routes/clients.ts:80-81,100-101; server/routes/partners.ts:77-78,95-96; server/routes/acts.ts:118,166`
- Категория: DRY. Принцип: DRY, KISS (дублирование уже примененной проверки)

```
if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_partner", entityType: "partner", entityId: partner.id, description: `Создан партнер: ${partner.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null,
```

**Что осталось.** В invoices.ts исправлено: актор собирается один раз в commandActor.ts:4-7, аудит пишется внутри транзакции в invoiceCommands.ts:62-65. Осталось 6 копий ipAddress/userAgent (clients x2, partners x2, acts x2) и 4 мертвые проверки роли после requireRole (clients.ts:80,100; partners.ts:77,95). partners.ts:78/96 по-прежнему пишет в details сырое JSON.stringify(req.body), а не санитизированные данные. Аудит в этих роутерах идет отдельным запросом вне транзакции записи. (В цитате буква заменена по правилам вывода, в коде стоит «партнер».)

**Исходная проблема.** Фрагмент `ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null` встречается 15 раз (invoices.ts:58, 148, 219, 272, 338, 357, 379-389, 443-452, 481; partners.ts:73, 91; далее clients.ts, acts.ts). Условие `role === "assistant" || role === "admin" || role === "accountant"` встречается 10 раз и всегда стоит после `requireRole("admin", "assistant", "accountant")` на том же роуте (например строки 38 → 52, 112 → 150), то есть всегда истинно — мертвый код, который читатель обязан проверить. В partners.ts:73 в `details` пишется `JSON.stringify(req.body)` — сырое тело до санитизации, а не то, что реально сохранено.

**Что сделать.** В authMiddleware один раз собирать `req.actor = { tokenId, role, partnerId, clientId, ip, userAgent }`. Хелпер `audit(actor, { action, entity, id, description, details })` в actionLogRepo, принимающий tx и вызываемый из сервиса внутри транзакции с уже санитизированными данными. Удалить все 10 условий по роли — требование уже выражено в requireRole.

*Верификатор:* Подтверждаю 6 копий ipAddress в clients.ts:81,101, partners.ts:78,96 и acts.ts:118,166, а также мертвые проверки роли после requireRole в clients.ts:80,100 и partners.ts:77,95. Есть еще одна: partners.ts:152 проверяет assistant/accountant после requireRole("admin","partner"). partners.ts:78,96 пишет сырой JSON.stringify(req.body), а clients использует auditSafeClientBody.

#### F71. Блок Telegram-уведомления скопирован четыре раза внутри одного роутера — частично

- Было: `server/routes/invoices.ts:62` (ece9adf). Сейчас: `server/services/invoiceNotice.ts:7; server/services/invoiceCommands.ts:21; server/routes/messages.ts:256-290`
- Категория: DRY. Принцип: DRY, SRP (роут знает про HTML-разметку Telegram)

```
const formatted = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(amount ?? 0));
// invoiceCommands.ts:21
const money = (value: string | number | null | undefined) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value ?? 0));
```

**Что осталось.** Четыре IIFE в invoices.ts удалены: уведомления о счетах, оплатах, списаниях и переносах пишутся в notification_outbox в той же транзакции, рассылает их worker. Осталось: два независимых Intl.NumberFormat (invoiceNotice.ts:7, invoiceCommands.ts:21), хотя formatMoney уже есть в lib/format.ts. HTML-тела трех уведомлений собираются прямо в InvoiceCommands (строки 123, 134, 170). messages.ts:256-290 по-прежнему отправляет Telegram напрямую fire-and-forget мимо outbox, с собственной копией contactSuffix.

**Исходная проблема.** Один и тот же IIFE с динамическим импортом telegram, выбором суммы по isClientFinancialVisible, `new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", ... })`, `contactSuffix` через `(client as any)?.contactPerson` и `.catch(() => {})` повторен в POST /api/invoices (61-108), PATCH /api/invoices/:id (162-194), POST /:id/expenses (283-316), POST /transfer (400-427); пятая копия — в routes/acts.ts. Четыре `Intl.NumberFormat`, пять `await import("../lib/telegram")`, четыре каста `as any` на Client. Правка формата суммы или добавление WhatsApp-канала — четыре-пять синхронных правок в роутах.

**Что сделать.** server/services/notificationService.ts с методами invoiceCreated(invoice, client), invoicePaid(...), expenseAdded(...), fundsTransferred(...) и общими formatRub(), clientLabel(), contactSuffix(). Вызов — из доменного события после коммита (outbox из находки про атомарность) или минимум `notifications.invoiceCreated(...)` одной строкой в сервисе. Типизировать Client вместо `as any`.

*Верификатор:* Подтверждаю два независимых Intl.NumberFormat (invoiceNotice.ts:7, invoiceCommands.ts:21), хотя formatMoney есть в lib/format.ts:65. messages.ts:256-291 шлет Telegram напрямую в IIFE с .catch(() => {}) мимо outbox и держит свою копию contactSuffix.

#### F73. routes/me.ts обходит фасад и читает таблицы расходов и сообщений целиком ради одного клиента — частично

- Было: `server/routes/me.ts:223` (ece9adf). Сейчас: `server/routes/me.ts:27,61,180; server/services/personalDataExport.ts:23-27`
- Категория: производительность. Принцип: SRP/Фасад: роуты не должны знать о таблицах; изоляция арендаторов на уровне запроса, а не фильтра

```
export function createMeRouter(storage: MeStore, authMiddleware: AuthMiddleware, db: typeof Database) {
...
      peers = await db.select().from(accessTokens).where(eq(accessTokens.clientId, me.clientId));
...
void storage; // явный ref на storage чтобы avoid unused import warning
```

**Что осталось.** Исправлено: экспорт данных вынесен в services/personalDataExport.ts. Он делает JOIN invoices + invoiceScope(actor) + keyset-пагинацию по PAGE_SIZE и больше не читает чужие расходы и сообщения целиком. Осталось: me.ts по-прежнему получает db и ходит в таблицы напрямую в обход фасада (строки 61, 63, 81, 107, 134, 153), заглушка `void storage` на месте. Скоуп «коллег» теперь продублирован между me.ts:60-66 и personalDataExport.ts:48-50.

**Исходная проблема.** Экспорт данных клиента читает ВСЕ расходы и ВСЕ сообщения всех клиентов в память процесса и фильтрует в JS, причем первый запрос (exp) вообще выполняется и выбрасывается, а импорт storage заглушен `void`. Это тенант-данные чужих клиентов, оказавшиеся в памяти обработчика клиентского запроса — одна правка `.filter` и они уходят в ответ. Peers-запрос продублирован дважды в том же файле (строки 55-61 и 254-258).

**Что сделать.** Перенести в userRepo/clientRepo методы `exportClientData(db, clientId)` с `inArray(invoiceExpenses.invoiceId, ids)` и `inArray(invoiceMessages.invoiceId, ids)`; удалить прямые импорты db из routes/me.ts (и assistant.ts, messages.ts). Выделить `getPeerTokens(actor)` в одну функцию.

*Верификатор:* Экспорт переехал в personalDataExport.ts и использует JOIN + invoiceScope + keyset (:20-44). При этом me.ts по-прежнему ходит в db напрямую (строки 61, 63, 81, 107, 134, 153), `void storage` на месте (me.ts:180), а скоуп коллег продублирован (me.ts:60-66 и personalDataExport.ts:48-50).

#### F74. Политика hide_from_assistant размазана по пяти местам, в сообщениях — сырой SQL из роута — частично

- Было: `server/routes/messages.ts:32` (ece9adf). Сейчас: `server/invoiceQuery.ts:27-36; server/routes/messages.ts:38, 173; server/repositories/actsRepo.ts:61; server/repositories/invoiceRepo.ts:303; server/repositories/recurringRepo.ts:28; server/services/recurringCommands.ts:11`
- Категория: спагетти. Принцип: DRY, разделение слоев (controller не знает SQL)

```
case 'assistant': return eq(invoices.hideFromAssistant, false); | ? sql`WHERE COALESCE(i.hide_from_assistant, FALSE) = FALSE` | or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false))
```

**Что осталось.** Появился единый invoiceScope(actor), его используют новые assistant.ts и documentStatus.ts. Но старые предикаты остались: два raw COALESCE в messages.ts, or(isNull…) в actsRepo и invoiceRepo, а для периодики объявлены две одинаковые константы visibility (recurringRepo.ts:28 и recurringCommands.ts:11). Сообщения по-прежнему строят SQL прямо в роуте.

**Исходная проблема.** Правило видимости счетов для assistant/accountant реализовано пятью независимыми выражениями в трех стилях (raw SQL с COALESCE, drizzle or(isNull,...), drizzle eq(false)); колонка при этом notNull (schema.ts:110), так что часть вариантов — карго-культ. messages.ts и assistant.ts обходят фасад и строят запросы прямо в контроллере, причем resolveMessageInvoiceScope молча исключает accountant и partner из сообщений вообще (возвращает null).

**Что сделать.** Единственный источник правила: `invoiceVisibilityFilter(actor): SQL` в invoiceAccess.ts (drizzle-фрагмент, подставляемый и в select, и в raw SQL через sql`...`). messages.ts и assistant.ts перевести на messagesRepo/assistantRepo за фасадом, использующие этот фильтр. Снять мертвые COALESCE/isNull после подтверждения notNull.

*Верификатор:* Подтверждаю. invoiceScope (invoiceQuery.ts:27-36) используют новые роуты, но рядом живут сырые COALESCE в messages.ts:38 и 173, or(isNull…) в actsRepo.ts:61 и invoiceRepo.ts:303. Константа visibility продублирована (recurringRepo.ts:28, recurringCommands.ts:11).

#### F75. «Остаток клиента» вычисляется в пяти местах по четырем разным формулам — частично

- Было: `server/routes/myInvoices.ts:99` (ece9adf). Сейчас: `server/storage.ts:166-170; server/routes/export.ts:223, 298, 556, 654, 838; server/repositories/clientOverviewRepo.ts:138; server/routes/myInvoices.ts:13`
- Категория: DRY. Принцип: DRY / Single Responsibility

```
if (scheme === 'agency_30' || scheme === 'agency_40' || scheme === 'agency') { ... const agencyRemaining = parseNum(calc.clientBaseAfterMargin) - expenses;
```

**Что осталось.** Пересчет остатка в myInvoices.ts заменен чтением calc.clientRemaining (строки 106, 117), а порядок слоев engine, periodic, transfers теперь зашит в одном месте. Осталось: storage.ts:170 для дашборда заново считает остаток агентских счетов без переносов и периодики. export.ts держит пять fallback-формул вида `calc?.clientRemaining ?? (budgetAfter - expenses)`, еще одна живет в clientOverviewRepo.ts:138. Локальный isAgency в myInvoices.ts:13 и литеральная тройка схем в storage.ts:166 дублируют isAgencyScheme.

**Исходная проблема.** Одна и та же величина получается слоистым наложением: calculateFinancials дает clientRemaining, applyPeriodicOverrides его заменяет, applyTransferOverrides прибавляет нетто. Порядок слоев зашит в вызывающем коде (в updateInvoiceCalculations он уже другой — см. первую находку). Экспорт для админа (myInvoices.ts) пересчитывает остаток заново, игнорируя оба оверрайда, и isAgency там — локальный дубль isAgencyScheme из движка (строка 11), о чем движок прямо предупреждает в комментарии (financialEngine.ts:21-25). export.ts держит еще четыре fallback-формулы.

**Что сделать.** Ввести доменный объект `ClientBudgetProjection` (server/domain/clientBudget.ts) с единственной функцией `projectClientBudget(invoice, engineResult, expenses, transferBalance) → { spent, remaining, base }`, которая инкапсулирует порядок слоев. Все читатели (экспорт, дашборды, Telegram) читают только invoice_calculations.client_remaining; fallback-формулы в export.ts удалить, пустой кэш считать ошибкой данных, а не поводом посчитать иначе.

*Верификатор:* Подтверждаю: storage.ts:166-170 считает остаток как clientBaseAfterMargin − expenses без переносов, а fallback-формулы живут в export.ts:223, 298, 556, 654, 838 и clientOverviewRepo.ts:138. Fallback в export.ts:223 даже считает от clientBill, а не от базы после маржи, то есть формула отдельная. В clientOverviewRepo.ts:134 захардкожены 30/40, isAgency продублирован в myInvoices.ts:13.

#### F76. Блок аудита скопирован 15 раз с избыточной проверкой роли — частично

- Было: `server/routes/partners.ts:73` (ece9adf). Сейчас: `server/routes/partners.ts:77-78, 95-96; server/routes/clients.ts:80-81, 100-101; server/routes/acts.ts:117-119, 166-167`
- Категория: спагетти. Принцип: DRY, KISS

```
if (role === "assistant" || role === "admin" || role === "accountant") { | await storage.deleteSignedAct(id); (сразу после logAssistantAction без try/catch на строке 166)
```

**Что осталось.** Девять копий из invoices.ts ушли в InvoiceCommands (единый insert, invoiceCommands.ts:62). В области осталось шесть ручных копий с одинаковым ip/userAgent, тавтологическая проверка роли после requireRole в четырех местах и два разных контракта «лог упал» в одном файле: в upload лог обернут в try/catch, а в delete пишется до удаления и без try/catch.

**Исходная проблема.** Однострочный вызов logAssistantAction с ipAddress/userAgent повторен 15 раз в роутах; условие `role === assistant || admin || accountant` дублирует requireRole с теми же ролями строкой выше и всегда истинно. В acts.ts:144 запись «Удален акт» делается ДО storage.deleteSignedAct(id) (acts.ts:145) и без try/catch, а в acts.ts:108-110 аналогичный лог обернут в try/catch — в одном файле два разных контракта «что если лог упал».

**Что сделать.** Ввести `audit(req, { action, entity, description, details })` как единственную точку входа (или middleware на res.on('finish') для мутирующих маршрутов), который сам достает tokenId/ip/ua и сам решает, глотать ли ошибку. Убрать проверки роли внутри хендлеров — они принадлежат requireRole. Порядок зафиксировать: операция в транзакции, аудит в той же транзакции.

*Верификатор:* Подтверждаю. Ручной вызов лога с ip/userAgent встречается шесть раз (clients.ts:81/101, partners.ts:78/96, acts.ts:118/166). Тавтологическая проверка роли после requireRole стоит в clients.ts:80/100 и partners.ts:77/95. В acts.ts upload лог обернут в try/catch (117-119), а delete пишет лог до удаления и без try/catch (166-167).

#### F77. Денежные операции и удаления не попадают в журнал действий — частично

- Было: `server/routes/partners.ts:158` (ece9adf). Сейчас: `server/services/paymentCommands.ts:46-50; server/routes/partners.ts:105-115; server/routes/clients.ts:135-145, 201-213; server/routes/acts.ts:24-32, 53-78; server/routes/messages.ts:205-216; shared/schema.ts:361, 364`
- Категория: безопасность. Принцип: SRP (контроллер отвечает за аудит), DRY

```
await tx.insert(assistantActionLogs).values({ accessTokenId: actor.tokenId, actionType: 'other', | const result = await storage.deletePartner(id); | await db.delete(invoiceMessages).where(eq(invoiceMessages.id, id));
```

**Что осталось.** Создание, исправление и отмена партнерских платежей теперь аудируются в той же транзакции со снимками before/after, хотя и под типом 'other'. Без следа в журнале остались удаление партнера и клиента, пересборка связей клиент-партнер, выплата бонуса, выпуск и отзыв кодов доступа, удаление сообщений. Значения enum delete_client и delete_partner по-прежнему не используются ни одним роутом.

**Исходная проблема.** Аудит пишется вручную и выборочно: создание, правка и удаление партнерских платежей (прямое движение денег), удаление клиента и партнера, пересборка связей клиент-партнер, выплата бонуса, выпуск и отзыв кодов доступа и удаление сообщений не оставляют следа. При этом в enum assistant_action_type значения delete_client и delete_partner объявлены (shared/schema.ts), но ни один роут их не использует. Журнал дает ложное ощущение полноты.

**Что сделать.** Вынести аудит из контроллеров в доменный сервис: сервисные методы (PartnerPaymentService.create/update/delete, ClientService.delete, AccessTokenService.issue/revoke) сами эмитят событие аудита через единый AuditLogger, которому контекст актора (tokenId, ip, ua) передается через AsyncLocalStorage из authMiddleware. Добавить тест-инвариант: каждый мутирующий роут (POST/PUT/PATCH/DELETE) в реестре маршрутов обязан иметь соответствующую запись аудита в интеграционном тесте.

*Верификатор:* Подтверждаю. Платежи партнеров аудируются в транзакции со снимками (paymentCommands.ts:46-50). Без записи в журнал остались удаление партнера и клиента (partners.ts:105-115, clients.ts:135-145), PUT связей клиент-партнер (clients.ts:200-212), bonus-payout (acts.ts:24-32), выпуск и отзыв кодов (acts.ts:53-78) и удаление сообщений (messages.ts:205-216). delete_client и delete_partner встречаются только в словарях подписей на фронте.

#### F79. IStorage не является контрактом: 78 методов в интерфейсе, 106 в классе, роуты зависят от конкретного объекта — частично

- Было: `server/storage.ts:28` (ece9adf). Сейчас: `server/storagePorts.ts:400-408; server/routeStores.ts:1-141; server/routes.ts:38-57; server/storage.ts:32,448`
- Категория: SOLID. Принцип: ISP (один интерфейс на все домены), DIP (зависимость от конкретного экземпляра), LSP (класс шире интерфейса)

```
export type StorageOperations = SessionStore &
  InvoiceRepository &
  DirectoryStore &
  ReportingQueries &
  DocumentsRepository &
  RecurringRepository &
  AuditWriter;
```

**Что осталось.** DIP исправлен: роутеры создаются фабриками, storage внедряется из registerRoutes, каждый роутер получает узкий Pick (routeStores.ts), тесты собирают createApp с локальной БД. ISP по сути нет: DatabaseStorage остается одним классом на все домены и реализует пересечение всех семи интерфейсов. Pick'и берутся из общего StorageOperations, а отдельно семь интерфейсов использует только invoiceAccess.ts:2. 33 сигнатуры портов выведены через ReturnType<typeof xRepo.fn>, то есть контракт производен от реализации, а не наоборот. Экспорт синглтона storage.ts:448 остался, хотя его никто не импортирует.

**Исходная проблема.** Интерфейс объявляет 78 методов, класс реализует 106; 28 методов (createInvoiceTransfer, getPartnerDebtSummaries, getAdminDashboardStats, globalSearch, getAlertCounts, processAllDueRecurringInvoices и др.) существуют только в классе, а все роуты импортируют `storage` — экземпляр класса, а не IStorage. Единственное место, где интерфейс что-то значит — invoiceAccess.ts:10 `Pick<IStorage, "getInvoiceForRole">`. Типы интерфейса расходятся с использованием: `getPartnerPayments(partnerId: string)` (строка 70), а routes/partners.ts:151 вызывает `storage.getPartnerPayments(partnerId)` с `partnerId: string | undefined` — проходит только из-за strictNullChecks:false. Фасад — один объект на 12 несвязанных областей (сессии, партнеры, планы, бэкапы, поиск), значит каждый роут транзитивно зависит от всего.

**Что сделать.** Удалить IStorage и DatabaseStorage. Ввести сервисы по агрегатам с явными узкими интерфейсами: SessionService, PartnerService, InvoiceService, DashboardService, PlanningService, RecurringService (6-8 методов каждый). Собрать их в createApp(deps: AppDeps) → Express, где deps = { db, services, config, logger }. Роуты получают сервисы из фабрики (closure или req.app.locals), а не из глобального импорта. Для тестов — createApp({ db: pglite, ... }) без моков фасада.

*Верификатор:* Подтверждаю: DatabaseStorage (storage.ts:32) реализует пересчение всех 7 интерфейсов StorageOperations (storagePorts.ts:402-408), а отдельно используется только InvoiceRepository в invoiceAccess.ts:2,10. 33 сигнатуры выведены через typeof xRepo. Синглтон storage.ts:448 никто не импортирует, а 8 репозиториев импортируют типы из ../storage, то есть зависимость обратная.

#### F80. 150 строк бизнес-логики в «тонком» фасаде, тест-страж обходится конструкцией await query — открыто

- Было: `server/storage.ts:389` (ece9adf). Сейчас: `server/storage.ts:97-113; server/storageFacade.test.ts:22`
- Категория: спагетти. Принцип: SRP (фасад считает деньги), KISS (страж по regex вместо запрета импорта)

```
const query = this.database
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
// storageFacade.test.ts:22
      .filter(({ line }) => /await (db|tx)\b/.test(line))
```

**Что осталось.** getDashboardStats с сырым select/leftJoin, циклом по счетам и ветвлением по схемам (scheme === 'agency_30' || ...) так и живет в фасаде. Страж стал еще слепее: фасад теперь обращается к БД через this.database, а регулярка ищет только 'await db'/'await tx'. Любой сырой запрос в storage.ts проходит тест зеленым.

**Исходная проблема.** Метод getDashboardStats (строки 389-537) содержит выборку всех счетов, цикл по ним с ветвлением по схемам (`scheme === 'agency_30' || scheme === 'agency_40' || scheme === 'agency'`), расчет partnerDebt через повторный проход по results и ролевую проекцию полей — это дашборд-сервис, а не делегат. Тест storageFacade.test.ts проверяет регуляркой `/await (db|tx)\b/`, которую `let query = db.select()` + `results = await query` (строки 390, 400-404) не задевает, поэтому страж зеленый при заведомо сыром запросе. Логика ролевой фильтрации тут дублирует permissions.projectStatsForRole, которая применяется к результату в routes/dashboard.ts:13.

**Что сделать.** Перенести getDashboardStats в dashboardRepo (или в новый DashboardService) с единственным источником ролевой проекции — permissions.ts. Заменить regex-страж на архитектурный тест: `storage.ts не содержит import { db }` (или eslint no-restricted-imports для ../db вне repositories/), а лучше удалить фасад целиком и тест вместе с ним.

*Верификатор:* Подтверждаю: getDashboardStats с сырым this.database.select().leftJoin() по-прежнему лежит в фасаде (storage.ts:97-113). Регулярка storageFacade.test.ts:22 /await (db|tx)\b/ не видит ни this.database, ни await query, поэтому страж зеленый.

#### F81. Эндпоинт working-capital отдает заглушку и принимает PATCH, ничего не сохраняя — открыто

- Было: `server/storage.ts:704` (ece9adf). Сейчас: `server/storage.ts:414-433; server/routes/dashboard.ts:120-134`
- Категория: модель данных. Принцип: Честность контракта API (нет fake-success), YAGNI

```
async getWorkingCapital(): Promise<WorkingCapitalData | null> {
    // Return mock data since working_capital_balance table doesn't exist in Neon yet
    // TODO: Create working_capital_balance table in schema.ts and migrate
    return {
      id: 'wc-1',
      amount: 0,
```

**Что осталось.** Обе заглушки и оба роута GET/PATCH /api/admin/working-capital на месте. Их даже протащили в новый слой портов: storagePorts.ts:250-251 и routeStores.ts:53,56. Таблицы нет, PATCH отвечает 200, ничего не сохраняя.

**Исходная проблема.** GET /api/admin/working-capital (routes/dashboard.ts:117) возвращает захардкованный объект, PATCH (dashboard.ts:126-134) берет `amount, notes` из тела без валидации и отвечает 200 с эхом входа — ничего не персистится. Фронт src/components/invoices/admin/WorkingCapitalManager.tsx:27-29 показывает это как реальные данные и дает редактировать. Комментарий ссылается на Neon, который проект покинул при переезде на Timeweb — код пережил две платформы как мертвый.

**Что сделать.** Решить за один коммит: либо таблица working_capital_balance через drizzle-миграцию + planningRepo.getWorkingCapital/updateWorkingCapital с zod-валидацией amount, либо удалить оба роута, два метода фасада и компонент WorkingCapitalManager. Запретить эндпоинты-заглушки правилом ревью: нет таблицы — нет роута.

*Верификатор:* Подтверждаю: обе заглушки на месте (storage.ts:414-433, комментарий про Neon), GET/PATCH /api/admin/working-capital живы (dashboard.ts:120-136). PATCH отвечает 200 эхом amount/notes без валидации и ничего не сохраняет.

#### F82. Авторизация: шесть почти одинаковых предикатов, ручные 403 в роутах и три копии интерфейса актора — открыто

- Было: `server/tenantAccess.ts:79` (ece9adf). Сейчас: `server/tenantAccess.ts:8, 79-103; server/invoiceAccess.ts:4; server/services/invoiceCommands.ts:17; server/routes/partners.ts:121-123`
- Категория: безопасность. Принцип: DRY, Open/Closed (новая роль = правка всех предикатов)

```
if (CLIENT_CATALOG_ROLES.has(actor.role)) return true; vs if (actor.role === "admin") return true; | if (actor.role === "assistant" || actor.role === "accountant") {
      return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
```

**Что осталось.** tenantAccess.ts в диапазоне ece9adf..HEAD не менялся: пары предикатов по-прежнему отличаются одной строкой, ручной 403 стоит перед canReadPartnerClients, а загрузка linkedPartnerIds повторена в пяти роутах. Типов актора стало больше: TenantActor, InvoiceActor, AuthenticatedRequest.user и CommandActor.

**Исходная проблема.** Политика доступа закодирована как набор if-цепочек, попарно идентичных кроме одной роли; роуты дополнительно вшивают собственные проверки с другим кодом ответа (403 в partners.ts:117 против 404 в partners.ts:128 за по сути одно и то же). Загрузка linkedPartnerIds перед проверкой повторена в пяти роутах (partners.ts:52, 123; clients.ts:119, 220, 249). Интерфейс актора объявлен трижды.

**Что сделать.** Один модуль policy: матрица `can(actor, action, resource)` где resource = {type:'partner'|'client'|..., id, linkedPartnerIds} и загрузчик `loadResourceForActor(actor, type, id)` (возвращает сущность или null) — роуты вызывают только его и всегда отвечают 404. Один тип Actor в shared/auth.ts, переиспользуемый middleware, tenantAccess и invoiceAccess. Покрыть матрицу табличным тестом role x endpoint.

*Верификатор:* Подтверждаю: git log ece9adf..HEAD по tenantAccess.ts пуст. Пары canReadClient/canReadClientRelationships и canReadPartner/canReadPartnerClients отличаются одной строкой (47 и 64, 84 и 97), ручной 403 стоит перед canReadPartnerClients (partners.ts:121-123), а загрузка linkedPartnerIds повторена в пяти роутах.

#### F86. Ноль CHECK-ограничений: отрицательные суммы и periods_used > total_periods допустимы, код лечит мусор при каждом чтении — частично

- Было: `shared/schema.ts:121` (ece9adf). Сейчас: `drizzle/0000–0007 (0 CHECK); shared/schema.ts (0 check()); server/routes/dashboard.ts:224; server/repositories/clientOverviewRepo.ts:215; server/repositories/clientBudgetRepo.ts:95`
- Категория: модель данных. Принцип: Fail-fast: невалидное состояние должно быть невозможно записать, а не исправляться при чтении

```
month: parseInt(month), | const used = Math.min(total, Math.max(0, Number(inv.periodsUsed ?? 0))); | const used = Math.max(0, Math.min(Number(inv.periodsUsed ?? 0), total));
```

**Что осталось.** Одну дыру закрыли на уровне приложения: recurring POST/PATCH теперь проходят через zod recurringInput (recurring.ts:21, :70) вместо спреда req.body. В БД по-прежнему ни одного CHECK: grep -ci check по 0002–0007 и check() в schema.ts дают 0. Знак сумм и periods_used <= total_periods ничем не ограничены. monthly-plans все так же принимает month через parseInt без диапазона 1..12, а клампы periodsUsed при чтении переехали в новые clientOverviewRepo и clientBudgetRepo.

**Исходная проблема.** В схеме нет ни одного CHECK. amount в invoice_expenses, partner_payments, invoice_transfers, client_bill — numeric без ограничения знака; periods_used не ограничен total_periods; month numeric(2,0) принимает 0 и 99. Валидация positiveMoney есть лишь для трех zod-схем (validate.ts:61-72), а routes/assistant.ts, me.ts, messages.ts пишут в db напрямую мимо фасада. В результате dashboardRepo дважды клампит periodsUsed при чтении — то есть разработчик уже знает, что в БД может лежать невалидное значение, и чинит симптом.

**Что сделать.** Миграция с CHECK: `amount >= 0` (expenses, payments, transfers, bonus), `client_bill >= 0`, `periods_used BETWEEN 0 AND COALESCE(total_periods, periods_used)`, `price_per_period >= 0`; month/year перевести в smallint с `CHECK (month BETWEEN 1 AND 12)`. После этого удалить клампы в dashboardRepo и опереться на инвариант. Единая zod-схема денежных полей в shared/ для всех роутов, включая assistant/me/messages.

*Верификатор:* В drizzle/0000-0007 и в schema.ts нет ни одного CHECK. Клампы periodsUsed остались в clientOverviewRepo.ts:215 и clientBudgetRepo.ts:95. parseInt(month) без диапазона стоит в dashboard.ts:225, а не :224: строка 224 — это year.

#### F87. Нет UNIQUE на 1:1-кэше invoice_calculations и на (year, month): upsert через select-then-insert — частично

- Было: `shared/schema.ts:167` (ece9adf). Сейчас: `shared/schema.ts:173 (исправлено); shared/schema.ts:298; server/repositories/planningRepo.ts:42-53; shared/schema.ts:55; shared/schema.ts:105`
- Категория: модель данных. Принцип: Инварианты данных принадлежат БД, а не каждому вызывающему (Single Source of Truth)

```
uniqueIndex("idx_invoice_calculations_invoice").on(table.invoiceId) | index("idx_monthly_plans_year_month").on(table.year, table.month), | const existing = await getMonthlyPlan(db, input.year, input.month); if (existing) { ... | createdBy: uuid("created_by").notNull(),
```

**Что осталось.** На invoice_calculations.invoice_id стоит UNIQUE (миграция 0002:41), запись calculations идет в транзакции через updateInvoice. Это главная угроза удвоения сумм, и она закрыта. Остальное не тронуто: monthly_financial_plans(year, month) держится на обычном индексе с select-then-insert вне транзакции, client_partners без UNIQUE(client_id, partner_id), created_by/paid_by/uploaded_by все еще uuid без FK на access_tokens. Кроме того, 0002 создает UNIQUE без шага дедупликации, и если на копии прода найдутся дубли, миграция упадет посреди выпуска.

**Исходная проблема.** invoice_calculations по смыслу 1:1 к invoices, но ограничения уникальности нет — только обычный индекс. Запись идет по схеме «select existing → update или insert» вне транзакции (updateInvoiceCalculations принимает DB, не tx). Два параллельных PATCH (админ + ассистент, или двойной клик) создадут две строки, и каждый join дашборда начнет удваивать суммы. Та же схема у monthly_financial_plans (year, month) и у client_partners (нет UNIQUE(client_id, partner_id)). created_by / paid_by / uploaded_by — uuid без FK, хотя в них всегда пишется access_tokens.id (routes/invoices.ts:49).

**Что сделать.** Версионированная миграция: `UNIQUE (invoice_id)` на invoice_calculations, `UNIQUE (year, month)` на monthly_financial_plans, `UNIQUE (client_id, partner_id)` на client_partners, FK `created_by/paid_by/uploaded_by → access_tokens(id) ON DELETE RESTRICT`. Все upsert переписать на `insert().onConflictDoUpdate()` одной командой. Перед миграцией — скрипт поиска существующих дублей.

*Верификатор:* Создание UNIQUE idx_invoice_calculations_invoice в 0002:41 закрывает главное и идет без шага дедупликации. upsertMonthlyPlan (planningRepo.ts:41-53) работает как select-then-insert на обычном индексе (schema.ts:298). client_partners держится только на обычных индексах (schema.ts:55-56). created_by/paid_by/uploaded_by — uuid без FK (schema.ts:105, 143, 281).

#### F88. ProtectedRoute знает только «вошел/не вошел»; роль проверяется страницами ad hoc или не проверяется — открыто

- Было: `src/components/auth/ProtectedRoute.tsx:11` (ece9adf). Сейчас: `src/components/auth/ProtectedRoute.tsx:11; src/App.tsx:47-51; src/pages/AssistantLogsPage.tsx`
- Категория: SOLID. Принцип: SRP / Open-Closed (роутинг открыт для правок при каждой новой роли)

```
ProtectedRoute.tsx:11 `const { isAuthenticated, isLoading } = useAuth();`; App.tsx:47 `if (role === 'partner' || role === 'admin' || role === 'assistant' || role === 'accountant' || role === 'client') { return <InvoicesDashboard />; } return <Index />;`
```

**Что осталось.** Guard по-прежнему без ролей, все 12 маршрутов в App.tsx:62-157 обернуты одинаково. RoleBasedHome все так же перечисляет все пять ролей, и ветка <Index /> недостижима, хотя Index лениво импортируется (App.tsx:15). Страницы проверяют роль сами: AccessCodesPage.tsx:33, AccountingPage.tsx:53, StatsPage.tsx:58, PartnersPage.tsx:27. AssistantLogsPage роль не проверяет. Таблицы маршрутов с полем roles нет, сравнений role ===/!== в src 87.

**Исходная проблема.** Маршруты /access-codes, /accounting, /assistant-logs, /security, /stats, /partners объявлены одинаково для всех ролей; две страницы делают `if (role !== 'admin')` сами, две — не делают (рендерят UI и получают 403 от сервера в каждом запросе). RoleBasedHome перечисляет все пять ролей в условии, которое истинно для любого аутентифицированного пользователя — ветка `<Index />` недостижима, при этом Index.tsx продолжает импортироваться и поддерживаться. 54 сравнения `role === '...'` в components/pages — политика размазана по JSX.

**Что сделать.** Ввести декларативную таблицу маршрутов `routes: Array<{path, element, roles: UserRole[]}>` в src/routes.ts; `<ProtectedRoute roles>` сравнивает роль с таблицей и редиректит на home роли. Сайдбар строится из той же таблицы (убирает дублирующие role === в AppSidebar). RoleBasedHome заменить на `HOME_BY_ROLE: Record<UserRole, string>`. Удалить недостижимый Index или сделать его целью для конкретной роли.

*Верификатор:* ProtectedRoute.tsx:11 по-прежнему берет только isAuthenticated/isLoading, ролей не принимает. RoleBasedHome (App.tsx:47) перечисляет все 5 ролей, поэтому `<Index />` на App.tsx:51 недостижим. AssistantLogsPage роль не проверяет и полагается на серверный requireRole("admin") (server/routes/actionLog.ts:9).

#### F89. Шесть пресетов периода и их сохранение в localStorage реализованы трижды — открыто

- Было: `src/components/invoices/ClientDashboard.tsx:90` (ece9adf). Сейчас: `src/components/invoices/ClientDashboard.tsx:90; src/components/invoices/assistant/ClientBalancesView.tsx:136-145; src/components/invoices/admin/ExportFiltersDialog.tsx:138-147`
- Категория: DRY. Принцип: DRY

```
const getPresetRange = (preset: string): { from: Date; to: Date } | null => { ... case "this-month": / function computePresetRange(preset: string) / const applyPreset = (group: 'scheduled' | 'actual', preset: string) => {
```

**Что осталось.** Три реализации шести пресетов остались на месте, общего src/lib/datePresets.ts нет (ls src/lib), parseDateFromStorage по-прежнему скопирована в ClientDashboard.tsx:54 и ExportFiltersDialog.tsx:44, ключи localStorage прежние.

**Исходная проблема.** Один и тот же switch на шесть ключей (this-month ... last-year) с одинаковыми подписями: ClientDashboard.tsx:90-114 getPresetRange + 297-304 список кнопок, ClientBalancesView.tsx:205-253 DATE_PRESETS + computePresetRange, ExportFiltersDialog.tsx:138-198 presets + applyPreset. Персистентность тоже ручная в каждом: ClientDashboard:54-88 (clientReport_dateFrom/To), ExportFiltersDialog:35-71 (6 ключей exportFilters_*), ClientBalancesView:500-552 (adminBalancesSearch/FilterFrom/FilterTo/IncludeUndated + balancesIncludeUndated) — 12 ключей localStorage для одной концепции «период отчета».

**Что сделать.** Вынести src/lib/datePresets.ts (PRESETS, rangeFor(key, now)) и хук usePersistedDateRange(storageKey) с одной схемой ключей; компоненты получают {range, setPreset, setFrom, setTo}. Пресеты рендерить одним `<DatePresetBar>`.

*Верификатор:* Три реализации пресетов на месте: ClientDashboard.tsx:90 getPresetRange, ClientBalancesView.tsx:145 computePresetRange, ExportFiltersDialog.tsx:147 applyPreset. parseDateFromStorage продублирована (ClientDashboard.tsx:54, ExportFiltersDialog.tsx:44), общего модуля в src/lib нет.

#### F90. Пять ручных fetch с CSRF из двух разных источников в обход src/lib/api.ts и существующего useDownloadReport — открыто

- Было: `src/components/invoices/ClientDashboard.tsx:158` (ece9adf). Сейчас: `src/components/invoices/ClientDashboard.tsx:158-163, 188-193, 230-235; src/components/invoices/admin/ExportFiltersDialog.tsx:236-242; src/components/invoices/AccountantDashboard.tsx:62-66`
- Категория: поддерживаемость. Принцип: DRY / KISS

```
const csrfToken = localStorage.getItem("csrf_token"); const response = await fetch("/api/admin/export/client-report/preview", { ... / 'x-csrf-token': csrfToken || '',
```

**Что осталось.** Все пять ручных fetch на месте; изменились только catch-блоки (any -> unknown). AccountantDashboard по-прежнему берет CSRF из useAuth() под заголовком 'x-csrf-token' и при этом обходит apiRequest с Idempotency-Key; правила eslint против fetch в компонентах нет.

**Исходная проблема.** ClientDashboard.tsx содержит три копии одного fetch-блока (158-170, 188-201, 230-243) с разбором Content-Disposition и созданием blob-ссылки, ExportFiltersDialog.tsx:236-280 четвертую, AccountantDashboard.tsx:70-80 пятую, причем там CSRF берется из `useAuth().csrfToken` под заголовком 'x-csrf-token', а в остальных из localStorage под 'X-CSRF-Token'. При этом хуки useDownloadReport и useReportPreview уже существуют и используются в ClientBalancesView.tsx:259-261 и DoNotSpendDashboard.tsx:85-86 для того же /api/admin/export/client-report.

**Что сделать.** В src/lib/api.ts добавить apiPostBlob(endpoint, body) → {blob, filename} и apiPostText; ClientDashboard и ExportFiltersDialog перевести на useDownloadReport/useReportPreview; AccountantDashboard на apiPatch. Запретить `fetch(` в src/components правилом eslint no-restricted-globals.

*Верификатор:* Ручные fetch с CSRF из localStorage остались: ClientDashboard.tsx:158-163, 188-193, 230-235 и ExportFiltersDialog.tsx:236-242. AccountantDashboard.tsx:62-66 тоже ходит в обход apiRequest, без Idempotency-Key. Правила no-restricted для fetch в eslint.config нет.

#### F91. InvoiceDetailsDialog: 37 useState, 15 обработчиков, 12 ответственностей в одном компоненте — частично

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:115` (ece9adf). Сейчас: `src/hooks/useInvoiceCommands.ts:15-38; src/components/invoices/details/*.tsx`
- Категория: SOLID. Принцип: SRP

```
useInvoiceCommands.ts:34 `...status, ...metadata, ...financial, ...expense, ...period,`; секции принимают `{ model }: { model: Props }` где `type Props = Pick<InvoiceDetailsModel, ...>`
```

**Что осталось.** Файл диалога сократили с 1889 до 293 строк, логику разнесли по 5 хукам и 7 секциям. Но useInvoiceCommands склеивает все обратно в один объект (около 40 useState: StatusCommands 6, MetadataCommands 12, FinancialTerms 7, ExpenseActions 6, PeriodCommands 6, Commands 3), и каждая секция получает срез этого god-model. Любое изменение состояния перерисовывает весь диалог, при коллизии имен spread молча перетирает поле, а секции не владеют своими данными и мутациями. Это перенос по файлам, а не разделение ответственностей.

**Исходная проблема.** В одном компоненте склеены: загрузка (fetchInvoiceDetails 231), статусы (342-420), даты оплаты (422-477), примечания (479), номер (502), процент партнера (535), сумма счета (586), резерв расходов (625), скрытие от ассистента (663), перенос клиента (693), название для клиента (719), конвертация в подписку (737-796), расходы (311), сообщения (157-158), акты (1751). Каждое поле тянет пару состояний value+updatingX, итого 37 useState при 2 useEffect и 0 useQuery.

**Что сделать.** Разбить на контейнер InvoiceDetailsDialog (только Dialog + useInvoice(id)) и секции-компоненты с собственными хуками: InvoiceHeaderSection, InvoiceStatusControl, InvoiceMoneyEditors (clientBill/partnerRate/plannedExpenses), SubscriptionControls (convert/revert), MoveInvoiceControl, ExpensesSection, уже существующие SignedActsSection и InvoiceWaterfallChart. Каждая секция получает invoice: InvoiceViewModel и вызывает мутацию из src/features/invoices/mutations.ts, а не setInvoice родителя.

*Верификатор:* useInvoiceCommands.ts:34 действительно собирает все пять хуков в один объект через spread (около 40 useState в useInvoice*-хуках), а секции получают Pick<InvoiceDetailsModel,...>. Диалог уменьшился до 293 строк, но владение состоянием осталось общим.

#### F92. Расчет резерва (planned_expenses минус расходы партнера) продублирован трижды внутри одного компонента и повторяет серверную формулу — открыто

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:354` (ece9adf). Сейчас: `src/hooks/useInvoiceStatusCommands.ts:39-46; src/components/invoices/details/InvoiceCalculationsSection.tsx:79-84, 319-336`
- Категория: DRY. Принцип: DRY

```
useInvoiceStatusCommands.ts:43-46 `const spentFromReserve = expenses .filter((e) => e.paidByAdmin !== true) .reduce((sum: number, e) => sum + parseNum(e.amount || "0"), 0); const remainingReserve = reservedAmount - spentFromReserve;` и та же цепочка в InvoiceCalculationsSection.tsx:323-336
```

**Что осталось.** Формулу просто переместили: сумма «расходы партнера» считается в трех местах, остаток резерва в двух, причем в двух разных файлах (хук статуса и секция расчетов). Общего хелпера splitExpenses нет, сервер эти агрегаты не отдает.

**Исходная проблема.** Тот же блок повторен в 1362-1367 (для водопада) и 1545-1552 (в IIFE прямо в JSX), а сервер считает то же самое в invoiceRepo.ts:236 и :515 (`expenses.filter(e => e.paidByAdmin !== true).reduce(...)`). Деньги суммируются в double через parseFloat в разметке.

**Что сделать.** Вынести в shared/financialEngine.ts функцию splitExpenses(expenses) -> { paidByPartner, paidByAdmin, reserveRemaining(planned) } и отдать ее на сервер в invoice_calculations (expensesPaidByPartner/expensesPaidByAdmin как поля ответа). Фронт только читает calc.*; локальная агрегация по expenses в компонентах запрещается линтером (no-restricted-syntax на reduce в *.tsx).

*Верификатор:* Фильтр paidByAdmin !== true с reduce повторен трижды: InvoiceCalculationsSection.tsx:80 и :324, useInvoiceStatusCommands.ts:44. Остаток резерва считается дважды (:335 и хук :46). Общего хелпера нет.

#### F94. Знание о зависимых дашбордах рассыпано по мутациям: 7 разных наборов ключей инвалидации в одном файле — частично

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:703` (ece9adf). Сейчас: `src/lib/financialQueries.ts:11-23; src/pages/InvoicePage.tsx:61-62; src/components/invoices/SignedActsSection.tsx:89-93`
- Категория: поддерживаемость. Принцип: KISS / Single Source of Truth

```
financialQueries.ts:11 `const prefixes = ['/api/invoices', '/api/admin/', '/api/client/', '/api/partner', '/api/clients',` ...; InvoicePage.tsx:61-62 `queryClient.invalidateQueries({ queryKey: ['/api/invoices', 'detail', id] }); queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });`
```

**Что осталось.** Хуки диалога, список, Add/EditExpense, TransferFunds и архив используют одну функцию invalidateFinancialQueries, так что семь разных наборов внутри диалога исчезли. Осталось: InvoicePage меняет статус и инвалидирует только '/api/invoices', поэтому дашборды остаются устаревшими. SignedActsSection держит собственный список из 4 строковых ключей, и '/api/acts-statistics' в реестр не входит. Вызывающие диалог дашборды (DoNotSpendDashboard.tsx:690, ExpectedCommissionDashboard.tsx:261, PriorityActionsCard.tsx:199) инвалидируют свои ключи при закрытии. Иерархических ключей нет: вместо них ручной реестр строковых префиксов плюс legacyKeys, и новый эндпоинт вне реестра молча останется устаревшим.

**Исходная проблема.** В файле семь различных наборов: 323-327 (расход), 650 (резерв: только partner-schemes), 673-674 (скрытие: invoices+assistant/stats), 703-707 (перенос), 725-727 (название), 758-761 и 785-788 (подписка). handleStatusChange (377), handleUpdateClientBill (586), handleUpdateCommission (535), даты (422, 448) не инвалидируют ничего, хотя меняют деньги и влияют на /api/admin/stats и do-not-spend. Ключи — строковые литералы без фабрики.

**Что сделать.** Фабрика ключей invoiceKeys/dashboardKeys и одна функция invalidateInvoiceGraph(queryClient, invoiceId), вызываемая из общего хука useInvoiceMutation; либо иерархические ключи (['invoices', id, ...], ['dashboards', ...]) так, чтобы одна инвалидация префикса покрывала все.

*Верификатор:* Внутри диалога теперь одна функция invalidateFinancialQueries. Остались собственные строковые наборы в InvoicePage.tsx:61-62, SignedActsSection.tsx:90-93, DoNotSpendDashboard.tsx:690-692, ExpectedCommissionDashboard.tsx:261-262 и PriorityActionsCard.tsx:199-200, плюс ручной реестр префиксов в financialQueries.ts:11-15. Устаревание смягчают staleTime=0 и refetch при монтировании (AuthContext.tsx:40), но архитектурно все по-прежнему рассыпано.

#### F95. Две параллельные системы прав: getVisibleFields и россыпь userRole/canEdit в разметке — частично

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:821` (ece9adf). Сейчас: `src/hooks/useInvoiceCommands.ts:31; src/components/invoices/details/InvoiceCalculationsSection.tsx:68,77,122,238,317; src/components/invoices/UnifiedInvoicesList.tsx:397,644,1017; src/components/invoices/admin/ExpectedAdminProfitDashboard.tsx:335; src/components/invoices/admin/DocumentStatusDashboard.tsx:52`
- Категория: SOLID. Принцип: OCP / SRP

```
useInvoiceCommands.ts:31 `const permissions = getVisibleFields(userRole, invoice?.scheme ?? 'agency_30');`; InvoiceCalculationsSection.tsx:122 `{userRole === "admin" && canEdit ? (`; ExpectedAdminProfitDashboard.tsx:335 `canEdit={true}`; DocumentStatusDashboard.tsx:52 `canEdit={role === 'admin' || role === 'assistant' || role === 'accountant'}`
```

**Что осталось.** Исправлено: локальные типы ролей заменены на UserRole из shared/schema (UnifiedInvoicesList.tsx:42, InvoiceCard.tsx:1, invoicePermissions.ts:3), а WaterfallChartProps.scheme стал InvoiceScheme. Осталось главное, две параллельные системы прав: permissions из getVisibleFields живут рядом с прямыми userRole === в каждой секции и с внешним флагом canEdit. canEdit по-прежнему считается по-разному в зависимости от точки входа (admin||assistant, только admin, true, admin||assistant||accountant, isAdmin в InvoicePage:253). Фолбэк схемы 'agency_30' и userRole={role || 'admin'} (DoNotSpendDashboard.tsx:696) по умолчанию ведут к легаси-схеме и привилегированной роли.

**Исходная проблема.** В диалоге 27 проверок userRole===/canEdit рядом с объектом permissions; в UnifiedInvoicesList 24 сравнения role (578, 582, 590, 598, 634, 645, 663, 824, 925, 951, 993, 1007, 1024, 1030, 1048), в InvoiceCard 4, в InvoicePage 8 через isAdmin/isPartner/isClient. canEdit вычисляется снаружи как `role === 'admin' || role === 'assistant'` (UnifiedInvoicesList:457, 703, 1075) и дублирует permissions.canEdit*. Тип роли объявлен локально без accountant в UnifiedInvoicesList.tsx:38, InvoiceCard.tsx:21, getSchemeLabel (invoiceCalculations.ts:138); WaterfallChartProps.scheme (InvoiceWaterfallChart.tsx:8) не содержит 'agency'.

**Что сделать.** Одна политика: src/lib/invoicePolicy.ts с типом UserRole из shared/schema.ts и функцией invoicePolicy(role, invoice) -> { canEdit, canDeleteExpenses, canMove, canConvert, visible: {...} }; компоненты получают policy пропом и не сравнивают role. Удалить проп canEdit, локальные типы UserRole и аргумент role из getSchemeLabel. ESLint-правило no-restricted-syntax на `role === '` в src/components.

*Верификатор:* Подтверждаю. canEdit считается шестью способами: UnifiedInvoicesList.tsx:397 (admin||assistant), DoNotSpendDashboard.tsx:695 (только admin), ExpectedAdminProfitDashboard.tsx:335 (true), DocumentStatusDashboard.tsx:52 (+accountant). В секциях details/* около 16 прямых сравнений userRole рядом с permissions. Фолбэки userRole={role || 'admin'} (DoNotSpendDashboard.tsx:696) и scheme ?? 'agency_30' (useInvoiceCommands.ts:31) на месте.

#### F96. Нет ни одного теста на компоненты подсистемы при 17 data-testid в одном диалоге — частично

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:1398` (ece9adf). Сейчас: `src/components/invoices/reviewCompletion.test.tsx:65-77; src/hooks/financialMutations.test.tsx:18-58`
- Категория: тесты и DX. Принцип: —

```
reviewCompletion.test.tsx:65 `it.each(['admin', 'partner', 'assistant', 'accountant', 'client'])('renders the full invoice page using the actual %s projection'`; financialMutations.test.tsx:18 `function Probe() { ... commands = useInvoiceCommands({ open: false, invoiceId: id, userRole: 'admin', canEdit: true }); return null; }`
```

**Что осталось.** Появились компонентные тесты на react-test-renderer: рендер InvoicePage для 5 ролей и проверка инвалидации после команд хука. InvoiceDetailsDialog, UnifiedInvoicesList, CreateInvoiceDialog и Add/EditExpense по-прежнему ничем не монтируются, а data-testid диалога не используются. Тест хука берет фикстуру без paymentDate и вызывает хендлеры с готовыми аргументами, поэтому пропустил бесконечный цикл и сброс полей ввода.

**Исходная проблема.** find src -name '*.test.*' дает только src/lib/invoiceHelpers.test.ts и src/lib/highlight.test.ts. Для InvoiceDetailsDialog (1889 строк, 17 data-testid), UnifiedInvoicesList (1112), CreateInvoiceDialog (592, двухшаговый мастер с валидацией) тестов нет; data-testid расставлены, но ничем не используются. Из-за ручного fetch внутри компонента (находка 2) и обращения к document (находка 11) компоненты нельзя смонтировать в тесте без мока сети и DOM-id.

**Что сделать.** После разделения на секции (находка 1) и перевода данных на useInvoice (находка 2): vitest + @testing-library/react + msw с фикстурами счетов трех схем и пяти ролей; снапшот-таблица «роль x схема -> видимые строки» для invoicePolicy; тесты на ExpenseFormDialog и PartnerRateEditor по data-testid. Начать с одного характеризационного теста на диалог admin/agency до рефакторинга.

*Верификатор:* reviewCompletion.test.tsx монтирует только InvoicePage и AccountantDashboard. financialMutations.test.tsx:18 запускает хук с open:false на счете без paymentDate и проверяет только флаги isInvalidated. Ни один тест в src не монтирует InvoiceDetailsDialog, UnifiedInvoicesList, CreateInvoiceDialog или Add/EditExpenseDialog.

#### F97. Два разных редактора одного и того же процента партнера в одном диалоге, второй — через document.getElementById — открыто

- Было: `src/components/invoices/InvoiceDetailsDialog.tsx:1490` (ece9adf). Сейчас: `src/components/invoices/details/InvoiceCalculationsSection.tsx:242-268; src/components/invoices/details/InvoiceCommissionTerms.tsx:65-90`
- Категория: спагетти. Принцип: DRY / KISS

```
InvoiceCalculationsSection.tsx:246-249 `step="0.1" defaultValue={calc?.commission_rate || 0} className="w-24" id="commission-rate-input"` и :255 `const input = document.getElementById(`; InvoiceCommissionTerms.tsx:69-70 `step="0.01" value={partnerRate}`
```

**Что осталось.** Оба редактора просто перенесли в разные файлы секций: контролируемый со step 0.01 и неконтролируемый со step 0.1, который читает DOM через getElementById и держит собственную проверку 0..100. Для админа на commission_based оба по-прежнему рендерятся одновременно и вызывают один handleUpdateCommission.

**Исходная проблема.** Блок «Условия сотрудничества» (1131-1160) редактирует ту же ставку через контролируемый useState partnerRate с step 0.01; блок «Финансовые расчеты» (1480-1500) — через неконтролируемый input с step 0.1 и прямым чтением DOM. Оба зовут handleUpdateCommission, но валидация и шаг разные; после сохранения одним второй показывает старое defaultValue до refetch.

**Что сделать.** Один компонент PartnerRateEditor (controlled, zod-валидация 0..100, шаг один) и одно место его рендера; обращения к document.* в компонентах запретить линтером.

*Верификатор:* Неконтролируемый Input (step 0.1, defaultValue, document.getElementById) стоит в InvoiceCalculationsSection.tsx:242-268, контролируемый (step 0.01) — в InvoiceCommissionTerms.tsx:65-90. Оба рендерятся для админа на commission_based (InvoiceTermsSection.tsx:264 и InvoiceDetailsDialog.tsx:129) и вызывают один handleUpdateCommission.

#### F98. Словарь подписей схем скопирован 4 раза, три копии не знают живую схему 'agency' — открыто

- Было: `src/components/invoices/PartnerDashboard.tsx:33` (ece9adf). Сейчас: `src/components/invoices/PartnerDashboard.tsx:34-42; src/components/invoices/admin/ExpectedCommissionDashboard.tsx:38; src/components/invoices/admin/ExpectedAdminProfitDashboard.tsx:39; src/components/invoices/assistant/ClientBalancesView.tsx:31-37; src/components/invoices/admin/RecurringInvoicesManager.tsx:149`
- Категория: DRY. Принцип: DRY

```
const schemeNames: Record<string, string> = { 'partner_10': '10%', 'partner_15': '15%', 'agency_30': 'Агентский 30%', 'agency_40': 'Агентский 40%', 'commission_based': 'По договору', }; return schemeNames[scheme] || scheme;
```

**Что осталось.** Все пять локальных словарей живы и ни один не знает 'agency'; живая гибкая схема по-прежнему показывается сырой строкой 'agency'. Полный getSchemeLabel из src/lib/invoiceCalculations.ts:119 используют только UnifiedInvoicesList, InvoiceCard, InvoiceCalculator, details/* и PartnerTerms.

**Исходная проблема.** Одинаковые локальные словари: PartnerDashboard.tsx:33-42 getSchemeDisplayName, ExpectedAdminProfitDashboard.tsx:39-48 getSchemeLabel, ExpectedCommissionDashboard.tsx:38-47 getSchemeLabel (дословная копия), ClientBalancesView.tsx:45-51 SCHEME_LABELS с другими словами («Агентство 30%», «Соглашение» вместо «Агентский 30%», «По договору»). При этом в src/lib/invoiceCalculations.ts:136-153 есть getSchemeLabel(scheme, role, commissionRate), единственный, кто обрабатывает `case 'agency'` и `commission_based` с процентом. Все три локальные копии при живой схеме 'agency' (одна из двух актуальных по памяти проекта) падают в `|| scheme` и показывают сырое «agency». AccountantDashboard.tsx:183 аналогично инлайнит тернарник статусов вместо INVOICE_STATUS_LABELS из invoiceHelpers.

**Что сделать.** Удалить четыре локальных словаря, импортировать getSchemeLabel из @/lib/invoiceCalculations (или перенести его в shared/ рядом с InvoiceScheme) и запретить литералы 'agency_30' в src/components через eslint no-restricted-syntax.

*Верификатор:* Пять локальных словарей без ключа 'agency' на месте: PartnerDashboard.tsx:34-42, ExpectedCommissionDashboard.tsx:38-47, ExpectedAdminProfitDashboard.tsx:39, ClientBalancesView.tsx:31-37, RecurringInvoicesManager.tsx:149-157. Полный getSchemeLabel лежит в src/lib/invoiceCalculations.ts:119, но эти файлы его не используют.

#### F100. Контракты серверных агрегатов набраны вручную в каждом компоненте, расхождения латаются через any — частично

- Было: `src/components/invoices/PartnerDashboard.tsx:244` (ece9adf). Сейчас: `src/components/invoices/PartnerDashboard.tsx:82, 98; src/components/invoices/admin/DoNotSpendDashboard.tsx:37, 62; src/components/invoices/admin/AdminDashboardMetrics.tsx:27`
- Категория: модель данных. Принцип: Single Source of Truth / Interface Segregation

```
interface DoNotSpendSummary { (PartnerDashboard.tsx:82 и DoNotSpendDashboard.tsx:37) / interface DashboardStats { (AdminDashboardMetrics.tsx:27, KeyMetricsCards.tsx:9, pages/Index.tsx:40, hooks/useDashboardStats.ts:5)
```

**Что осталось.** Устранено: '(debtDetails?.summary as any)?.overpayment' заменено типизированным полем (PartnerDashboard.tsx:69, 188); для счетов, балансов, partner-summary, assistant-summary и accountant-logs появились zod-схемы в shared/invoiceContract.ts и shared/assistantContract.ts. Осталось: все дашбордные эндпоинты (dashboard-stats, my-debt, do-not-spend, partner-schemes, overdue, expected-commission) типизируются вручную в компонентах; DoNotSpendSummary и PartnerSchemeSummary по-прежнему объявлены дважды с разными полями, DashboardStats теперь в четырех местах, два OverdueInvoice (snake_case и camelCase) на месте.

**Исходная проблема.** Сервер не экспортирует типы ответов (в server/repositories/dashboardRepo.ts нет ни одного `export interface`), поэтому каждый виджет описывает контракт сам: AdminDashboardMetrics.tsx:26-61 `interface DashboardStats` (yearlySummary, ownerShares, leverage...), PartnerDashboard.tsx:63-72 DebtDetails без поля overpayment, которое сервер реально отдает и которое читают через `as any` (строка 244). DoNotSpendSummary объявлен дважды с разными полями: PartnerDashboard.tsx:80-94 (invoices[].number, budget) и DoNotSpendDashboard.tsx:36-44 (InvoiceDetail с description, notes, createdAt). Два OverdueInvoice (shared vs admin алерты) описывают один объект в snake_case и camelCase.

**Что сделать.** Завести shared/api/dashboard.ts с zod-схемами (DashboardStatsSchema, PartnerDebtDetailsSchema, DoNotSpendSummarySchema...), сервер валидирует ответ через schema.parse перед res.json, фронт импортирует `z.infer` тех же схем. Один тип на один эндпоинт, никакого объявления интерфейсов ответов в src/components.

*Верификатор:* Подтверждаю: as any в PartnerDashboard убран, а DoNotSpendSummary и PartnerSchemeSummary объявлены дважды (PartnerDashboard.tsx:82,98 и DoNotSpendDashboard.tsx:37,62). DashboardStats объявлен в четырех местах (AdminDashboardMetrics.tsx:27, KeyMetricsCards.tsx:9, useDashboardStats.ts:5, Index.tsx:40), OverdueInvoice — в двух (admin/ и shared/OverduePaymentsAlert.tsx:12).

#### F101. Акты гоняются base64-строкой в JSON через FileReader с клиентским лимитом 10 МБ — частично

- Было: `src/components/invoices/SignedActsSection.tsx:73` (ece9adf). Сейчас: `src/components/invoices/SignedActsSection.tsx:71-86, 161; server/app.ts:33`
- Категория: производительность. Принцип: —

```
SignedActsSection.tsx:73-77 `const reader = new FileReader(); const fileData = await new Promise<string>((resolve, reject) => { ... reader.readAsDataURL(file);`; app.ts:33 `const bigJson = express.json({ limit: "20mb" });`
```

**Что осталось.** Скачивание исправлено: GET /api/acts/:id/content отдает поток, а клиент собирает blob через createObjectURL (SignedActsSection.tsx:185-187). Файлы лежат в FileObjectStore, списки актов без base64. Загрузка осталась прежней: файл до 10 МБ превращается в data-URL и уходит в JSON-теле, ради этого сервер держит отдельный парсер на 20mb.

**Исходная проблема.** Файл до 10 МБ (проверка на 161) превращается в data-URL (+33%) и уходит в JSON-теле; скачивание (185-193) получает тот же base64 JSON и собирает `<a href={data.fileData}>`. Это клиентская половина проблемы signed_acts.file_data text-колонки: вся цепочка держит файл в памяти трижды (File, строка, JSON).

**Что сделать.** multipart/form-data upload (useMutation с FormData) в отдельный маршрут, хранение файла на диске VDS/объектном хранилище с путем в БД (или bytea при обязательном хранении в Postgres), скачивание через GET /acts/:id/file с Content-Disposition и стримом; SignedActsSection получает только метаданные.

*Верификатор:* Скачивание переведено на поток /api/acts/:id/content с blob (SignedActsSection.tsx:184-186). Загрузка по-прежнему идет через FileReader.readAsDataURL в JSON (:73-85) с клиентским лимитом 10 МБ (:161) и отдельным парсером на 20mb для POST /api/invoices/:id/acts (server/app.ts:33-37).

#### F102. Дублирующееся состояние открытия диалога: URL ?open=, selectedInvoiceId, detailsOpen и setTimeout-защита от двойного клика — открыто

- Было: `src/components/invoices/UnifiedInvoicesList.tsx:272` (ece9adf). Сейчас: `src/components/invoices/UnifiedInvoicesList.tsx:75-77, 140-145, 148-205, 207-224`
- Категория: спагетти. Принцип: KISS / Single Source of Truth

```
UnifiedInvoicesList.tsx:207-212 `const handleViewDetails = (invoiceId: string) => { if (isOpeningDetails) return; setIsOpeningDetails(true); setSelectedInvoiceId(invoiceId); setDetailsOpen(true); setTimeout(() => setIsOpeningDetails(false), 500);`
```

**Что осталось.** Без изменений по существу: открытый счет по-прежнему хранится в searchParams.open, selectedInvoiceId и detailsOpen. Синхронизацию URL в обе стороны делают useEffect и handleCloseDetails, prevParamsRef управляет фильтрами, таймер-заглушка на 500 мс на месте. InvoiceDetailsDialog так и рендерится в трех местах файла (393, 640, 1013).

**Исходная проблема.** Одно и то же «какой счет открыт» хранится в searchParams.open (62), selectedInvoiceId (125), detailsOpen (126) и синхронизируется useEffect-ом (205-210) и handleCloseDetails (280-289). isOpeningDetails с таймером 500 мс — заглушка против повторного монтирования диалога, который при каждом открытии делает собственный fetch (находка 2). Пять useEffect (182, 198, 205, 222, 234) с prevParamsRef (213-220) образуют ручную машину состояний URL<->фильтры.

**Что сделать.** Сделать URL единственным источником: openInvoiceId = searchParams.get('open'); открыть = setSearchParams({open: id}); закрыть = удалить параметр; диалог рендерится по наличию параметра. Фильтры — тоже из URL через хук useInvoiceFiltersFromUrl (nuqs или собственный), без useEffect-синхронизаций и prevParamsRef. isOpeningDetails удалить.

*Верификатор:* selectedInvoiceId и detailsOpen инициализируются из ?open (UnifiedInvoicesList.tsx:75-76) и синхронизируются эффектом (:140-145) и handleCloseDetails (:214-223). Защита таймером на 500 мс (:207-212) и prevParamsRef (:148-205) на месте, InvoiceDetailsDialog рендерится трижды (:393, :640, :1013).

#### F103. 1824 строки мертвых дашборд-компонентов и неиспользуемые хуки/переменные во всех пяти ролевых экранах — частично

- Было: `src/components/invoices/admin/AdminStats.tsx:1` (ece9adf). Сейчас: `src/components/invoices/admin/AdminStats.tsx:1 (и еще 10 файлов admin/); src/components/invoices/AdminDashboard.tsx:23; src/components/invoices/AccountantDashboard.tsx:39-40; src/pages/StatsPage.tsx:7, 30; eslint.config:23`
- Категория: поддерживаемость. Принцип: YAGNI

```
const { logout } = useAuth(); / const navigate = useNavigate(); const { logout, csrfToken } = useAuth(); / import { OverduePaymentsAlert } from "@/components/invoices/admin/OverduePaymentsAlert"; / "@typescript-eslint/no-unused-vars": "off"
```

**Что осталось.** Удален только src/hooks/useInvoicesQuery.ts (и apiHelpers.ts). 11 неимпортируемых файлов admin/ (AdminCashFlowForecast, AdminHeroMetrics, AdminStats, CurrentMonthPlanFact, CurrentPeriodMetrics, FinancialPlanningChart, KeyMetricsCards, PlanHistoryComparison, ProfitTrendChart, WorkingCapitalManager, YearlyKeyIndicators) дают те же 1826 строк, причем часть из них исправления еще и редактировали; useDashboardStats живет только ради мертвых AdminStats/AdminHeroMetrics; handleSignOut мертв в AssistantDashboard.tsx:33 и ClientDashboard.tsx:138; setSelectedYear в StatsPage.tsx:30 не вызывается; noUnusedLocals: false во всех tsconfig, no-unused-vars выключен.

**Исходная проблема.** 11 из 38 файлов в src/components/invoices/admin/ не импортируются нигде (суммарно 1824 строки); хуки useInvoicesQuery.ts и useDashboardStats.ts используются только мертвыми AdminStats/AdminHeroMetrics, при этом в useInvoicesQuery.ts:7 объявлен еще один `type UserRole` без accountant. В живых ролевых экранах висят неиспользуемые `const navigate = useNavigate(); const { logout } = useAuth();` (AdminDashboard.tsx:22-23, AccountantDashboard.tsx:46-47) и мертвые handleSignOut (AssistantDashboard.tsx:33-37, ClientDashboard.tsx:138-142). StatsPage.tsx:7 импортирует OverduePaymentsAlert и не рендерит; StatsPage.tsx:30 `selectedYear` имеет setter, который нигде не вызывается.

**Что сделать.** Удалить 11 файлов и два хука одним коммитом, включить eslint no-unused-vars как error и ts-prune/knip в CI; UserRole оставить только в shared/schema.ts.

*Верификатор:* Ни один из 11 файлов admin/ не импортируется снаружи (grep -w пуст), вместе это ровно 1826 строк. useDashboardStats нужен только мертвым AdminStats и AdminHeroMetrics. handleSignOut не используется (AssistantDashboard.tsx:33, ClientDashboard.tsx:138), noUnusedLocals: false во всех tsconfig, а в eslint.config:23 правило no-unused-vars выключено.

#### F104. Три виджета «сводка по партнеру/клиенту → раскрытие → счета» написаны вручную, в DoNotSpendDashboard рендер строки повторен 4 раза — открыто

- Было: `src/components/invoices/admin/DoNotSpendDashboard.tsx:150` (ece9adf). Сейчас: `src/components/invoices/admin/DoNotSpendDashboard.tsx:139, 151; src/components/invoices/admin/ExpectedAdminProfitDashboard.tsx:81`
- Категория: DRY. Принцип: DRY / Open-Closed

```
const toggleClient = (clientId: string) => { setExpandedClients(prev => { ... / const togglePartner = (partnerId: string) => { setExpandedPartners(prev => {
```

**Что осталось.** Три виджета не тронуты по структуре (DoNotSpendDashboard 701 строка, четыре копии верстки строки сводки на месте), изменились только ключи кэша. Похожий шаблон консолидирован лишь для актов и закрывающих документов в новом admin/DocumentStatusDashboard.tsx, но к трем названным дашбордам это не применено.

**Исходная проблема.** ExpectedAdminProfitDashboard.tsx (341 строка), ExpectedCommissionDashboard.tsx (271) и DoNotSpendDashboard.tsx (700) реализуют один шаблон: useQuery сводок → expandedX: Set<string> + toggle (ExpectedAdminProfit:81-91, ExpectedCommission:80-90, DoNotSpend:138-160 дважды) → таблица с chevron → клик по номеру открывает InvoiceDetailsDialog → при закрытии инвалидация своего ключа и ['/api/invoices'] (ExpectedAdminProfit:327-333, ExpectedCommission:257-263, DoNotSpend:685-692). Внутри DoNotSpendDashboard одна и та же строка сводки сверстана четырежды: мобильные карточки 224-306 и десктопная таблица 309-429 для агентской секции, затем 477-542 и 545-646 для партнерской, отличаясь только цветом (amber/blue) и именами полей.

**Что сделать.** Выделить generic `<GroupedInvoiceSummary<TGroup, TRow>>` с пропсами {groups, columns: ColumnDef[], accent, onOpenInvoice} и хук useInvoiceDrilldown(invalidateKeys) для диалога; мобильная/десктопная раскладка внутри одного компонента по columns. Три дашборда превращаются в 30-50-строчные конфигурации.

*Верификатор:* DoNotSpendDashboard по-прежнему 701 строка с toggleClient и togglePartner (139, 151), в ExpectedAdminProfitDashboard.tsx:81 тот же togglePartner. Общий паттерн применен только в DocumentStatusDashboard.

#### F105. Ветвления по роли размазаны внутри общих виджетов с разными дефолтами — открыто

- Было: `src/components/invoices/admin/DoNotSpendDashboard.tsx:694` (ece9adf). Сейчас: `src/components/invoices/admin/DoNotSpendDashboard.tsx:185, 258, 695-696; src/components/invoices/admin/ExpectedCommissionDashboard.tsx:265-266; src/components/invoices/admin/DocumentStatusDashboard.tsx:52`
- Категория: SOLID. Принцип: Open-Closed / Single Responsibility

```
canEdit={role === 'admin'} userRole={role || 'admin'} / canEdit={role === 'admin'} userRole={role || 'partner'} / userRole={role ?? 'client'} canEdit={role === 'admin' || role === 'assistant' || role === 'accountant'}
```

**Что осталось.** Ветвления по роли внутри общих виджетов на месте (isAdmin: 14 в ClientBalancesView, 8 в ManageClientsDialog, 10 в ManagePartnersDialog), src/lib/permissions.ts для дашбордов нет (invoicePermissions.ts касается только полей карточки счета). Новый DocumentStatusDashboard добавил третий вариант дефолта при отсутствии роли: 'client'.

**Исходная проблема.** Общие виджеты решают ролевые вопросы внутри себя: DoNotSpendDashboard.tsx:184 `titleText = role === 'partner' ? 'Клиентские деньги' : 'Не тратить'`, :257/:319/:359/:421 `(role === 'partner' || role === 'admin')` для кнопки отчета, :694-695 дефолт `role || 'admin'`; ExpectedCommissionDashboard.tsx:70 `enabled: ... (role === 'admin' || role === 'partner')`, :111 заголовок по роли, :155 имя колонки по роли, :265-266 дефолт `role || 'partner'`; ExpectedAdminProfitDashboard.tsx:71 и :93 `if (role !== 'admin') return null`; ClientBalancesView.tsx:492 isAdmin в 14 местах; ManageClientsDialog 7 и ManagePartnersDialog 10 веток isAdmin (разный набор полей, разные вызовы invoiceService.fetchClientsWithPartners vs fetchClients). Один и тот же виджет при одном `role === undefined` считает пользователя админом, другой партнером.

**Что сделать.** Ввести src/lib/permissions.ts с чистыми предикатами (canDownloadClientReport(role), canEditInvoice(role), dashboardTitle(role, widget)) поверх единого UserRole из shared/schema.ts; виджеты получают готовые флаги пропсами из ролевого дашборда, а не читают useAuth(). Дефолт при отсутствии роли — всегда минимальные права.

*Верификатор:* Дефолт роли расходится: role || 'admin' (DoNotSpendDashboard.tsx:696), role || 'partner' (ExpectedCommissionDashboard.tsx:266), role ?? 'client' (DocumentStatusDashboard.tsx:52), а в ExpectedAdminProfitDashboard.tsx:335-336 жестко canEdit={true} и userRole="admin". Ролевые ветвления внутри виджетов остались (DoNotSpendDashboard.tsx:185, 258), модуля прав для дашбордов нет.

#### F106. AddExpenseDialog и EditExpenseDialog — один диалог, скопированный дважды, с третьей копией списка инвалидаций в родителе — частично

- Было: `src/components/invoices/assistant/AddExpenseDialog.tsx:97` (ece9adf). Сейчас: `src/components/invoices/assistant/AddExpenseDialog.tsx:23-220; src/components/invoices/assistant/EditExpenseDialog.tsx:28-208; src/components/invoices/InvoiceDetailsDialog.tsx:154,163`
- Категория: DRY. Принцип: DRY

```
AddExpenseDialog.tsx:95 и EditExpenseDialog.tsx:96 `await invalidateFinancialQueries(queryClient);`; diff двух файлов: те же sanitizeText/sanitizeNumber/sanitizeDate с теми же тостами и та же RadioGroup, отличаются только id/data-testid
```

**Что осталось.** Тройной блок из 5 invalidateQueries заменили общей функцией. Сами диалоги остались двумя копиями одной формы, и EditExpenseDialog по-прежнему без checkLimit и isValidUuid. Добавилась двойная инвалидация: диалог инвалидирует сам, а затем родитель через onSuccess={fetchInvoiceDetails} делает это еще раз.

**Исходная проблема.** EditExpenseDialog.tsx:97-101 содержит те же 5 строк; InvoiceDetailsDialog.tsx:323-327 (удаление расхода) — те же 5 строк. Валидация sanitizeText/sanitizeNumber/sanitizeDate с одинаковыми тостами (AddExpense 40-67, EditExpense 50-77) и разметка RadioGroup «Кто оплатил» (AddExpense 171-200, EditExpense 161-190) совпадают дословно; различие — только invoiceService.createExpense vs updateExpense и начальные значения. AddExpenseDialog при этом проверяет rate limit и isValidUuid, EditExpenseDialog — нет.

**Что сделать.** Один ExpenseFormDialog с пропом mode: 'create' | 'edit' и zod-схемой expenseFormSchema (react-hook-form), использующий useExpenseMutation(invoiceId) из features/invoices/mutations.ts, где onSuccess инвалидирует invoiceKeys.all и dashboardKeys.all — один раз для create/update/delete.

*Верификатор:* По diff две копии одной формы. В EditExpenseDialog нет useRateLimit/checkLimit и isValidUuid (они есть в AddExpenseDialog.tsx:25,36,71). Оба диалога сами вызывают invalidateFinancialQueries (:95/:96), а затем onSuccess={fetchInvoiceDetails} (InvoiceDetailsDialog.tsx:154,163) инвалидирует то же самое еще раз.

#### F107. ManageClientsDialog и ManagePartnersDialog — почти копии с ручным state-фетчем мимо TanStack Query — открыто

- Было: `src/components/invoices/assistant/ManageClientsDialog.tsx:124` (ece9adf). Сейчас: `src/components/invoices/assistant/ManageClientsDialog.tsx:126-151; src/components/invoices/assistant/ManagePartnersDialog.tsx:69-80`
- Категория: DRY. Принцип: DRY

```
const fetchData = useCallback(async () => { setFetchingData(true); try { const partnersData = await invoiceService.fetchPartners(); ... useEffect(() => { if (open) { fetchData(); } }, [open, fetchData]);
```

**Что осталось.** Оба диалога по-прежнему грузят данные через useState+useEffect мимо TanStack Query, без useQuery/useMutation/invalidateQueries; общий EntityManagerDialog не выделен. Изменения ограничились useCallback вокруг fetchData и снятием 'as any'.

**Исходная проблема.** Оба диалога (699 и 580 строк) повторяют одну машину состояний: form/editForm/editingId/deleteConfirmOpen/deleting/fetchingData, useStaggerAnimation, useRateLimit, handleAdd/startEdit/cancelEdit/saveEdit/confirmDelete/handleDelete (ManageClientsDialog.tsx:106-308, ManagePartnersDialog.tsx:51-223), одинаковые AlertDialog подтверждения (674-696 и 555-577), одинаковая таблица с инлайн-редактированием. Данные грузятся через useState+useEffect (ManageClientsDialog:124-149, ManagePartnersDialog:69-88) в обход кэша, поэтому после создания партнера ключ ['/api/partners'], который читает ExportFiltersDialog.tsx:73-78, не инвалидируется.

**Что сделать.** Один generic `<EntityManagerDialog<T>>` с конфигом полей (FieldDef[]) и адаптером {list, create, update, remove, queryKey}; данные через useQuery/useMutation с invalidateQueries по ключам из фабрики. Клиентская специфика (мультиселект партнеров, TG-токен) — через слот renderExtraFields.

*Верификатор:* ManageClientsDialog.tsx:126-151 и ManagePartnersDialog.tsx:69-80 по-прежнему грузят данные через useState+useEffect и invoiceService. useQuery и useMutation в обоих файлах не встречаются.

#### F108. Три несовместимые реализации «просроченных платежей», две из них мертвые — открыто

- Было: `src/components/invoices/shared/OverduePaymentsAlert.tsx:24` (ece9adf). Сейчас: `src/components/invoices/shared/OverduePaymentsAlert.tsx:8, 31-35; src/components/invoices/ClientDashboard.tsx:419; src/components/invoices/admin/OverduePaymentsAlert.tsx:55; src/pages/StatsPage.tsx:7`
- Категория: DRY. Принцип: DRY / YAGNI

```
import { Link } from "wouter"; ... enabled: role === "admin" || role === "assistant", / <OverduePaymentsAlert role="client" /> / const handleRemind = (invoiceNumber: string) => { toast({ title: "Напоминание отправлено",
```

**Что осталось.** Все три реализации живы без изменений: shared-версия смонтирована только с role="client" и никогда не делает запрос, wouter остался в package.json:90, admin-версия импортирована в StatsPage и не рендерится, кнопка 'Напомнить' по-прежнему лишь показывает toast.

**Исходная проблема.** shared/OverduePaymentsAlert.tsx: snake_case-поля (invoice_number, overdue_days), эндпоинт /api/overdue-invoices, пороги >30/>14 дней, `import { Link } from "wouter"` (строка 8) в приложении на react-router-dom (wouter в package.json:90 держится ради этого файла). Рендерится единственный раз в ClientDashboard.tsx:419 как `<OverduePaymentsAlert role="client" />`, то есть `enabled` всегда false и компонент никогда ничего не показывает. admin/OverduePaymentsAlert.tsx: camelCase (invoiceNumber, daysOverdue), эндпоинт /api/invoices/overdue, пороги >7/>3, кнопка «Напомнить» (строки 55-60) только показывает toast «Напоминание отправлено», ничего не отправляя; импортируется в StatsPage.tsx:7 и нигде не рендерится. Третья реализация: AdminDashboardMetrics.tsx:231-289 DrillDownCard category="overdue" через /api/admin/dashboard-invoices. На сервере два эндпоинта: dashboard.ts:59 и dashboard.ts:99.

**Что сделать.** Удалить оба OverduePaymentsAlert и wouter из зависимостей; оставить один серверный источник (/api/admin/dashboard-invoices?category=overdue или /api/overdue-invoices с порогами в ответе) и один виджет OverdueCard, пороги вынести в shared/constants (OVERDUE_CRITICAL_DAYS). Реальное «Напомнить» либо реализовать через существующий Telegram-сервис, либо убрать кнопку.

*Верификатор:* Shared-версия смонтирована только с role="client" (ClientDashboard.tsx:419) при enabled только для admin и assistant (shared/OverduePaymentsAlert.tsx:34), поэтому запрос никогда не уходит. Admin-версия в StatsPage.tsx:7 только импортирована, handleRemind показывает лишь toast (admin/OverduePaymentsAlert.tsx:55), wouter остался в package.json:90.

#### F109. UserRole объявлен 8 раз, половина без accountant — отсюда три ошибки tsc — частично

- Было: `src/contexts/AuthContext.tsx:5` (ece9adf). Сейчас: `shared/domainTypes.ts:4; src/components/invoices/SignedActsSection.tsx:32`
- Категория: DRY. Принцип: DRY / Single Source of Truth

```
domainTypes.ts:4 `export type UserRole = typeof USER_ROLES[number];`; SignedActsSection.tsx:32 `import type { UserRole } from "@shared/schema";` (schema.ts:428 `export type UserRole = import("./domainTypes").UserRole;`)
```

**Что осталось.** Локальных объявлений type UserRole в src нет: все пять мест без accountant (SignedActsSection, UnifiedInvoicesList, ManageAccessCodesDialog, invoiceCalculations, useInvoicesQuery) импортируют общий тип или удалены. Strict typecheck проходит. Остаток косметический: пять реэкспортов-прослоек (AuthContext.tsx:11, useAuth.ts:6, useUserRole.ts:15, invoicePermissions.ts:4, schema.ts:428), и eslint-правила против локального UserRole нет.

**Исходная проблема.** Канонический тип есть в shared/schema.ts:370 (совпадает с pgEnum user_role), но ни один из 7 фронтовых объявлений его не импортирует. Четыре локальных типа не знают роль accountant, поэтому InvoiceDetailsDialog.tsx:1753 и InvoicePage.tsx:291, передающие 5-ролевой userRole в SignedActsSection с 4-ролевым пропсом, не компилируются. При strict:false это не ломает сборку, и ошибки живут в репозитории.

**Что сделать.** Удалить все локальные `type UserRole` и `role?: 'admin'|...`, везде `import type { UserRole } from '@shared/schema'`. Добавить eslint-правило no-restricted-syntax на `TSTypeAliasDeclaration[id.name='UserRole']` вне shared/. Добавить `npm run typecheck` (tsc --noEmit) в pre-commit/CI, чтобы счетчик ошибок был 0, а не 3.

*Верификатор:* Локальных `type UserRole` в src больше нет, и tsc чист. Но тот же дефект, ручной union ролей без accountant, остался в src/components/invoices/shared/OverduePaymentsAlert.tsx:24 `role: "admin" | "assistant" | "partner" | "client";` (был и на ece9adf). Ревьюер прямо предлагал убрать такие union-ы, а правила eslint против них нет.

#### F110. Зоопарк поллинга: до 8 независимых таймеров на один экран и двойной рефетч dashboard-stats — открыто

- Было: `src/hooks/useAdminDashboardRefresh.ts:6` (ece9adf). Сейчас: `src/hooks/useAdminDashboardRefresh.ts:5, 39-44; src/components/invoices/AdminDashboard.tsx:25; src/lib/financialQueries.ts:11-15`
- Категория: производительность. Принцип: KISS / DRY

```
const intervalId = setInterval(() => { invalidateAll(); }, DEFAULT_REFETCH_INTERVAL); / const legacyKeys = new Set(['dashboard-stats', 'invoices', 'admin-stats', ...
```

**Что осталось.** 10 литералов refetchInterval: 120000 на месте (PartnerDashboard x5, DoNotSpend x2, ExpectedCommission, ExpectedAdminProfit, PartnerDebtDashboard), useVisibilityAwareInterval и ручные visibilitychange (PartnerDebtDashboard, KeyMetricsCards, AssistantBonusCard и др.) тоже. Строковый список префиксов заменен предикатом isFinancialQuery, но охват стал шире: каждые 120 с инвалидируются все запросы с 16 префиксами плюс 11 легаси-ключей, включая те, у которых есть свой refetchInterval, так что двойной рефетч dashboard-stats сохранился.

**Исходная проблема.** Четыре разных механизма периодического обновления сосуществуют: литерал `refetchInterval: 120000` в 10 местах (PartnerDashboard ×5, DoNotSpendDashboard ×2, ExpectedCommissionDashboard, ExpectedAdminProfitDashboard, PartnerDebtDashboard), хук useVisibilityAwareInterval (AdminDashboardMetrics:298, shared/OverduePaymentsAlert:29), useAdminDashboardRefresh с собственным setInterval и строковым списком префиксов (включая голое "invoices"), и ручной `document.addEventListener('visibilitychange', ...)` в PartnerDebtDashboard.tsx:44-56 (и еще в 6 файлах admin/). На экране админа «/» dashboard-stats имеет собственный refetchInterval (AdminDashboardMetrics:303) и одновременно инвалидируется каждые 120 с из useAdminDashboardRefresh (AdminDashboard.tsx:25) — два несинхронизированных таймера на один запрос; DrillDownCard-ы со staleTime 30 с перезапрашиваются при каждом invalidateAll. Подсчет по коду: админ при открытии «/» делает 6 запросов (auth/validate, alert-counts, messages/unread-summary, admin/dashboard-stats, admin/dashboard-invoices ×2) при 3 таймерах; партнер — 11 запросов (validate, alert-counts, unread-summary, partners/:id, my-debt, partner/document-risk, do-not-spend, do-not-spend/partner-schemes, invoices ×2, expected-commission) при 8 отдельных таймерах, причем do-not-spend и partner-schemes запрашивают и PartnerDashboard, и вложенный DoNotSpendDashboard.

**Что сделать.** Один QueryClient с defaultOptions {staleTime: 30s, refetchInterval: visibilityAware(120s)} и одна точка инвалидации по доменам (invalidateDomain('invoices')), строящаяся на фабрике ключей из первой находки. Удалить useAdminDashboardRefresh, ручные visibilitychange и все литералы 120000. Для экрана партнера сделать один /api/partner/dashboard, отдающий все блоки.

*Верификатор:* useAdminDashboardRefresh.ts:39-44 каждые 120 с инвалидирует все, что проходит isFinancialQuery (financialQueries.ts:11-19). При этом dashboard-stats ('/api/admin/') имеет свой refetchInterval через useVisibilityAwareInterval (AdminDashboardMetrics.tsx:299-304), так что двойной рефетч остался. Литералов refetchInterval: 120000 по-прежнему 10.

#### F111. useCookieSession дублирует серверную политику сессии таймером на клиенте и шлет refresh на каждое движение мыши — открыто

- Было: `src/hooks/useCookieSession.ts:6` (ece9adf). Сейчас: `src/hooks/useCookieSession.ts:6,69-75; src/contexts/AuthContext.tsx:155; server/repositories/userRepo.ts:98,124-126,141`
- Категория: поддерживаемость. Принцип: Single Source of Truth / KISS

```
useCookieSession.ts:6 `const SESSION_DURATION = 30 * 60 * 1000;`; :69-74 `activityTimeoutRef.current = setTimeout(async () => { ... await refreshSession(); }, 1000);`; AuthContext.tsx:155 `return response.ok && !!data?.success;`
```

**Что осталось.** Ничего не изменилось. Клиент держит свой 30-минутный таймер и сам решает, что сессия истекла. На mousedown/keydown/scroll/touchstart с паузой 1 с уходит POST /api/auth/refresh. Серверный expiresAt (auth.ts:151) игнорируется, про 12-часовой потолок клиент не знает. Константа 30 минут повторяется в четырех местах: useCookieSession.ts:6, userRepo.ts:98, userRepo.ts:141, auth.ts:28. validateSession по-прежнему пишет lastActivity на каждом запросе (userRepo.ts:124-126).

**Исходная проблема.** Клиент сам решает, что сессия истекла, по локальному таймеру 30 минут, не зная ни реального expiresAt (сервер его возвращает в /api/auth/refresh, но ответ игнорируется — AuthContext.tsx:163 читает только success), ни абсолютного потолка 12 ч. При любой активности (mousedown/scroll/keydown, debounce 1 с) уходит POST /api/auth/refresh с UPDATE user_sessions — активно работающий админ генерирует до 60 записей в минуту; плюс validateSession на каждом запросе тоже пишет lastActivity. Константа 30 минут продублирована в трех местах (клиент, userRepo:98, userRepo:141, auth.ts:34).

**Что сделать.** Сервер — единственный владелец TTL: /api/auth/validate и /refresh возвращают expiresAt и absoluteExpiresAt; AuthContext хранит их в state. useCookieSession: refresh не чаще раза в 5 минут и только если до expiresAt осталось < 10 минут; предупреждение и логаут считать от серверного expiresAt. Серверная константа TTL — одна в shared/constants.ts. validateSession обновлять lastActivity не чаще раза в минуту (сравнивать с текущим значением).

*Верификатор:* Код не менялся. useCookieSession.ts:6 `SESSION_DURATION = 30 * 60 * 1000`, на строках 69-75 refresh уходит на каждое событие активности с debounce 1 с. AuthContext.tsx:155 читает только `success`, а 30 минут продублированы в userRepo.ts:98,141 и auth.ts:28. validateSession пишет lastActivity на каждом запросе (userRepo.ts:124-126).

#### F112. GET /api/invoices типизирован тремя несовместимыми способами, shared DTO нет — частично

- Было: `src/hooks/useInvoicesQuery.ts:43` (ece9adf). Сейчас: `shared/invoiceContract.ts:6-39; server/reviewCompletion.test.ts:50; src/hooks/usePagedInvoices.ts:10-15; src/lib/invoiceView.ts:5; src/lib/invoiceDetailsView.ts:50`
- Категория: поддерживаемость. Принцип: DRY / Single Source of Truth для контракта

```
invoiceContract.ts:33 `export const invoicePageSchema = z.object({ invoices: z.array(invoiceDtoSchema), total: ..., statusCounts: ...` ; reviewCompletion.test.ts:50 `const first = invoicePageSchema.parse(await fetch(`${url}/api/invoices`...` ; usePagedInvoices.ts:10 `interface InvoicePage { invoices: InvoiceDto[]; total: number; pages: number; ...`
```

**Что осталось.** Исправлено главное: в shared появился zod-DTO для GET /api/invoices, сервер в HTTP-тестах проверяется по нему, useInvoicesQuery удален, ClientBalancesView и диалоги используют InvoiceDto. Осталось: серверные роуты в compile-time не типизированы этим DTO (server не импортирует invoiceContract вне тестов). usePagedInvoices заново объявляет свой InvoicePage вместо InvoicePageDto. Ручной маппинг camelCase→snake_case никуда не делся, он переехал в два адаптера: invoiceView.ts (около 20 полей) и invoiceDetailsView.ts (около 35 полей).

**Исходная проблема.** Сервер отдает массив (stripSensitiveFieldsFromList). useInvoicesQuery ждет объект `{invoices, stats}` (и не имеет ни одного потребителя — хук мертв с неверным контрактом), invoiceService ждет any[] и переводит camelCase в snake_case руками, AccountantDashboard берет any[] напрямую. Ни один из типов не выведен из серверного кода; `normalizeInvoiceListFromApi(data: any)` на строках 158-184 — ручной маппинг 20 полей, где `calculations?.commissionRate || null` превращает легитимный 0 в null.

**Что сделать.** Ввести shared/api-types.ts (или shared/dto/*.ts): типы ответов выводить из Drizzle-схемы (`typeof invoices.$inferSelect` + Pick по ROLE_INVOICE_PERMISSIONS) и экспортировать как InvoiceListItemDTO, InvoiceDetailsDTO. Сервер типизирует `res.json<InvoiceListItemDTO[]>`, фронт импортирует тот же тип в useQuery<InvoiceListItemDTO[]>. Удалить snake_case-маппинг в services/invoices.ts (компоненты переходят на camelCase DTO) и удалить useInvoicesQuery целиком. Заменить `||` на `??` для числовых полей.

*Верификатор:* invoiceContract импортируют только тесты сервера (reviewCompletion/reviewRegressions.test.ts), роуты им не типизированы. usePagedInvoices.ts:10-15 заново объявляет InvoicePage и приводит к нему через `as InvoicePage` (строка 33). Маппинг camel→snake переехал в invoiceView.ts и invoiceDetailsView.ts:50-90.

#### F113. Ключи react-query — ad hoc строки, 133 ручных invalidateQueries, три конкурирующих «инвалидатора» — частично

- Было: `src/hooks/useInvoicesQuery.ts:98` (ece9adf). Сейчас: `src/lib/financialQueries.ts:4-23; src/hooks/useDashboardStats.ts:46,55; src/components/invoices/admin/AdminCashFlowForecast.tsx:64; src/pages/Index.tsx:51`
- Категория: поддерживаемость. Принцип: DRY / KISS

```
financialQueries.ts:14 `const legacyKeys = new Set(['dashboard-stats', 'invoices', 'admin-stats', 'admin-monthly-data', 'invoices-by-month', 'invoices-overdue', ...` ; useDashboardStats.ts:46 `queryKey: ["dashboard-stats"],` vs Index.tsx:51 `queryKey: ['/api/dashboard/stats'],`
```

**Что осталось.** Появились financialKeys (5 ключей, 11 использований) и общий invalidateFinancialQueries по предикату (22 вызова). Но настоящей фабрики ключей нет: в 22 файлах остались 86 ручных invalidateQueries. Три конвенции не убраны, а закреплены списком legacyKeys. Один и тот же /dashboard/stats по-прежнему кешируется под 'dashboard-stats' и '/api/dashboard/stats'. useInvalidateDashboardStats (useDashboardStats.ts:55) нигде не используется. Утверждение в docs про «централизованное обновление связанных React-запросов» верно только для новых хуков счета.

**Исходная проблема.** Ключи смешивают три конвенции: путь с /api ('/api/invoices', 33 раза), путь без /api ("/messages/threads"), произвольные слова ('dashboard-stats', 'admin-monthly-data', 'invoices-overdue'). Один и тот же дашборд-стат кешируется под 'dashboard-stats' и '/api/dashboard/stats'. Инвалидация после мутации — список строк, который каждый автор пишет по памяти: в одном файле три разных набора (5, 2 и 4 ключа). useAdminDashboardRefresh матчит startsWith("invoices"), случайно задевая 'invoices-overdue'/'invoices-by-month'.

**Что сделать.** Создать src/lib/queryKeys.ts — фабрику: `qk.invoices.list(filters)`, `qk.invoices.detail(id)`, `qk.dashboard.stats(role)`, `qk.messages.threads()` с общими префиксами ['invoices'], ['dashboard']. Инвалидацию выразить доменно: `invalidate.afterInvoiceChange(qc, invoiceId)` в одном модуле, который знает все зависимые ключи; мутации вызывают только его. Удалить useInvalidateInvoices, useInvalidateDashboardStats, useInvalidateAllDashboards. Включить @tanstack/eslint-plugin-query для контроля ключей.

*Верификатор:* Подтверждаю: financialQueries.ts:11-15 закрепляет 16 префиксов и 11 легаси-ключей. useDashboardStats.ts:46 кеширует под ["dashboard-stats"], Index.tsx:51 под ['/api/dashboard/stats'], а useInvalidateDashboardStats (useDashboardStats.ts:55) никем не вызывается. Двойной кеш на практике почти мертв, потому что Index недостижим из RoleBasedHome.

#### F114. Поллинг реализован 12 раз; useRealtimeSubscription — Supabase-реликт, тройно дергающий один refetch — открыто

- Было: `src/hooks/useRealtimeSubscription.ts:39` (ece9adf). Сейчас: `src/hooks/useRealtimeSubscription.ts:3-46; src/components/invoices/assistant/AssistantYearlyOverview.tsx:39-60`
- Категория: производительность. Принцип: DRY / KISS

```
useRealtimeSubscription.ts:13-18 `export const useRealtimeSubscription = ({ channelName, table, onUpdate, enabled = true }: UseRealtimeSubscriptionOptions)`; :39 `const pollInterval = setInterval(() => { updateRef.current(); }, 120000);` ; AssistantYearlyOverview.tsx:39 `useRealtimeSubscription({ channelName: 'assistant_yearly_invoices', table: 'invoices', event: '*', onUpdate: () => refetch(),`
```

**Что осталось.** Хук с сигнатурой Supabase Realtime на месте, filter/event/schema по-прежнему игнорируются. AssistantYearlyOverview все так же ставит три таймера и три visibility-слушателя на один refetch, AssistantMonthlyChart и AssistantInsights ставят по два. Файлов с visibilitychange стало 9 вместо 12, но опрос по-прежнему реализован несколько раз: useAdminDashboardRefresh, useDashboardStats(120000), usePagedInvoices `refetchInterval: realtime ? 120000 : false`, useVisibilityAwareInterval, и все это поверх дефолтного refetchOnWindowFocus.

**Исходная проблема.** Хук принимает channelName/table/event/schema от Supabase Realtime, которых больше нет, и игнорирует их — внутри обычный setInterval 120 с. AssistantYearlyOverview монтирует три «подписки» на один и тот же refetch: три таймера, три запроса каждые 2 минуты поверх собственного refetchInterval useQuery. Логика «поллим только когда вкладка видна» скопирована в 12 файлов с мелкими различиями (кто-то инвалидирует при возврате, кто-то нет).

**Что сделать.** Удалить useRealtimeSubscription; все useQuery получают `refetetchInterval: useVisibilityAwareInterval()` (уже существует) — одно место для политики поллинга. Удалить 11 локальных visibilitychange-обработчиков. Для реальной «живости» завести один SSE-эндпоинт /api/events (сервер шлет {entity:'invoice', id}) и один хук useServerEvents, который вызывает доменную инвалидацию из фабрики ключей.

*Верификатор:* useRealtimeSubscription.ts:13-18 деструктурирует только channelName/table/onUpdate/enabled, а filter/event/schema игнорирует. AssistantYearlyOverview.tsx:39-61 вызывает его трижды на один refetch, то есть 3 интервала по 120 с и 3 visibility-слушателя. Файлов с visibilitychange 9.

#### F115. CSRF-токен в localStorage и два источника правды о нем — частично

- Было: `src/lib/api.ts:10` (ece9adf). Сейчас: `src/lib/api.ts:17; src/contexts/AuthContext.tsx:60,114,139,153; src/components/invoices/ClientDashboard.tsx:158; server/middleware.ts:47`
- Категория: безопасность. Принцип: Инкапсуляция состояния / Least privilege

```
api.ts:17 `const csrfToken = localStorage.getItem("csrf_token");`; AuthContext.tsx:60 `localStorage.setItem('csrf_token', data.csrfToken);` + :67 `csrfToken: data.csrfToken,` в state; middleware.ts:47 `if (isModifying && (typeof csrfToken !== "string" || !csrfToken || csrfToken !== result.csrfToken))`
```

**Что осталось.** Сервер исправлен: пустой или отсутствующий заголовок дает 403, /api/auth/validate возвращает csrfToken. Без токена клиент теперь не считается вошедшим (AuthContext.tsx:54 `if (!data?.valid || !data.csrfToken)`), так что состояния «залогинен, но без токена» больше нет. Осталась сама суть находки. Токен по-прежнему хранится и в state, и в localStorage. api.ts state игнорирует и читает localStorage. Литерал 'csrf_token' встречается 17 раз в 6 файлах (api.ts, AuthContext, ClientDashboard ×3, ExportFiltersDialog, useReportPreview, SecurityPage). Модульного tokenStore нет.

**Исходная проблема.** Токен, единственное назначение которого — быть недоступным для скрипта с другого origin, положен в хранилище, доступное любому скрипту на этом origin. AuthContext хранит его и в state (csrfToken), и в localStorage, а api.ts игнорирует state и читает localStorage; 12 мест читают ключ по строковому литералу. При очистке localStorage (другая вкладка, политика браузера) состояние isAuthenticated=true, а csrfToken=null — UI «залогинен», мутации уходят без токена (и из-за находки №1 проходят).

**Что сделать.** Хранить CSRF только в памяти: module-level `tokenStore` в src/lib/api.ts с setCsrfToken()/getCsrfToken(); AuthContext.login/validate вызывают setCsrfToken, logout — сброс. /api/auth/validate должен возвращать csrfToken (сейчас фронт берет его из localStorage при валидации), чтобы перезагрузка страницы восстанавливала токен без хранилища. Альтернатива — double-submit cookie (отдельная не-httpOnly cookie csrf, которую клиент копирует в заголовок) и тогда хранилище не нужно вовсе. Удалить все 12 прямых обращений к 'csrf_token'.

*Верификатор:* Серверная проверка исправлена (middleware.ts:47), состояние «вошел без токена» убрано (AuthContext.tsx:54). Но api.ts:17 читает токен из localStorage, а не из state. Литерал 'csrf_token' встречается 17 раз в 6 файлах (AuthContext 8, api.ts 3, ClientDashboard 3, ExportFiltersDialog, useReportPreview, SecurityPage), tokenStore нет.

#### F116. Мертвый дубль формул движка во фронте: calculatePartnerDebt без единого вызова — открыто

- Было: `src/lib/invoiceCalculations.ts:80` (ece9adf). Сейчас: `src/lib/invoiceCalculations.ts:63-111`
- Категория: DRY. Принцип: DRY; YAGNI

```
export function calculatePartnerDebt( ... if (scheme === 'agency_30') { const adminShare = clientBill * 0.15; const clientBase = clientBill * 0.70; ... calculatedDebt = clientBill - commissionAmount - expensesPaidByPartner;
```

**Что осталось.** Мертвая функция на месте: grep calculatePartnerDebt по src, server и shared дает только объявление. Внутри по-прежнему копия коэффициентов 0.15/0.70 и 0.24/0.60 и формула долга без plannedExpenses, а шапка файла (строка 5) все так же утверждает, что все формулы живут в shared/financialEngine.ts. Изменилось только то, что getSchemeLabel теперь типизирован UserRole.

**Исходная проблема.** grep по src дает ноль вызовов calculatePartnerDebt — функция экспортируется и не используется, но содержит полный набор коэффициентов движка плюс собственную формулу долга `clientBill - commissionAmount - expensesPaidByPartner`, не учитывающую plannedExpenses (в движке — учитывает, financialEngine.ts:172-174). Заголовок файла при этом утверждает: «All financial formula logic lives in shared/financialEngine.ts». Там же getSchemeLabel (строка 138) объявляет роль без 'accountant' — одна из трех ошибок tsc.

**Что сделать.** Удалить calculatePartnerDebt. Фронт не должен содержать ни одной денежной константы: оставить только адаптер camelCase→snake_case и форматирование. UserRole импортировать из shared/schema.

*Верификатор:* Grep calculatePartnerDebt по src, server и shared дает только объявление (src/lib/invoiceCalculations.ts:63). Коэффициенты 0.15/0.70 и 0.24/0.60 и формула долга без plannedExpenses (:76-104) на месте, шапка файла (:5) все так же утверждает, что все формулы живут в shared/financialEngine.ts.

#### F117. InvoicePage читает поля, которых нет в ответе API: вознаграждение партнера всегда 0, расходы всегда «Админ» — частично

- Было: `src/pages/InvoicePage.tsx:138` (ece9adf). Сейчас: `src/pages/InvoicePage.tsx:100-103, 237, 57-67`
- Категория: поддерживаемость. Принцип: DRY / Contract-first

```
InvoicePage.tsx:102 `const partnerReward = isAgencyScheme(invoice.scheme) ? calc?.partnerShareFromMargin : calc?.commissionAmount;`; :237 `{expense.paidByAdmin == null ? '' : expense.paidByAdmin ? '(Админ)' : '(Партнер)'}`
```

**Что осталось.** Исходный дефект исправлен и покрыт тестом reviewCompletion.test.tsx:65-77: ручные интерфейсы удалены, данные идут через useInvoiceData и DTO, partnerReward и паттерн paidByAdmin соответствуют контракту. Осталась третья реализация смены статуса (InvoicePage.tsx:57-67). Она переводит счет в paid или cancelled без подтверждения и без предупреждения о неизрасходованном резерве, которое есть в useInvoiceStatusCommands.ts:36-58, и инвалидирует только '/api/invoices'. Общих секций с диалогом у страницы нет.

**Исходная проблема.** partnerReward не существует нигде в server/ и shared/ (grep дает только InvoicePage.tsx); expensesPaidByPartner/Admin отсутствуют в invoice_calculations (dashboardRepo.ts:111 прямо пишет «НЕТ на invoice_calculations → всегда undefined → 0»); у расхода есть paidByAdmin: boolean (schema.ts:175), а не paidBy: 'partner'. InvoicePage — третья независимая реализация экрана счета (свои типы Invoice/Expense 20-49, свой handleStatusChange 96-107) рядом с InvoiceDetailsDialog и invoiceService.fetchInvoiceById.

**Что сделать.** Удалить ручные интерфейсы Invoice/Expense из InvoicePage; ввести shared/contracts/invoice.ts (zod-схема ответа GET /invoices/:id, экспортируемая и сервером, и клиентом) и один InvoiceViewModel в src/lib/services/invoices.ts. InvoicePage становится тонкой оберткой над теми же секциями, что и диалог (см. находку 1), получая данные из useInvoice(id).

*Верификатор:* Исходный дефект исправлен: partnerReward выбирается по схеме (InvoicePage.tsx:102), paidByAdmin читается по контракту (:237), тест reviewCompletion.test.tsx:65-77 проверяет 10 ₽ и «(Партнер)». Осталась собственная смена статуса (:57-67): кнопки (:266-277) переводят счет в paid или cancelled без подтверждения и без проверки остатка резерва.

#### F118. Барьер деплоя 153 секунды: новый PGlite с полной миграцией на каждый тест — открыто

- Было: `vitest.config.ts:29` (ece9adf). Сейчас: `vitest.config.ts:29; server/test/testDb.ts:17-19; server/repositories/invoiceRepo.integration.test.ts:25-26`
- Категория: тесты и DX. Принцип: Быстрая обратная связь; тесты должны быть дешевле, чем их обход

```
fileParallelism: false, | const client = new PGlite(); // in-memory ... await migrate(db, { migrationsFolder: ... "drizzle" }); | beforeEach(async () => { ({ db, close } = await createTestDb());
```

**Что осталось.** Механика барьера не изменилась. Файлы идут строго последовательно, hookTimeout 60 с, createTestDb каждый раз поднимает новую PGlite и накатывает уже 8 миграций вместо 2. Новые файлы (review*, accessPreservation, documents) используют beforeAll, но 10 старых файлов в server/repositories все так же поднимают БД в beforeEach на каждый тест. Дампа схемы и изоляции через rollback или TRUNCATE нет. При этом сюита стала тяжелее: 36 файлов и HTTP-сценарии на полном приложении.

**Исходная проблема.** Каждый тест (не файл) поднимает отдельный WASM-Postgres и накатывает все миграции, файлы идут строго последовательно. 130 тестов — 2,5 минуты, и это обязательный шаг каждого деплоя (deploy.sh:21). hookTimeout поднят до 60 с, потому что на загруженной машине хук не успевает — то есть барьер уже флапает по инфраструктуре, а не по логике.

**Что сделать.** Один PGlite на файл (beforeAll) + изоляция тестов через транзакцию с rollback или `TRUNCATE ... CASCADE` в beforeEach; схему накатывать из заранее сериализованного дампа PGlite (`pglite.dumpDataDir`) вместо migrate; вернуть fileParallelism с `poolOptions.maxThreads: 3`. Цель — вся суита до 30 с.

*Верификатор:* vitest.config.ts:29 задает fileParallelism: false. testDb.ts:17-19 на каждый вызов создает новую PGlite и накатывает все 8 миграций. Во всех 10 файлах server/repositories/*.test.ts createTestDb вызывается в beforeEach, дампа схемы и изоляции через rollback нет.


### Серьезность: низкая

#### F121. Правила видимости по ролям зашиты внутрь репозиториев параллельно слою permissions — открыто

- Было: `server/repositories/dashboardRepo.ts:450` (ece9adf). Сейчас: `server/repositories/financialReportsRepo.ts:390,404,416; server/repositories/alertsRepo.ts:154; server/storage.ts:219-236`
- Категория: SOLID. Принцип: SRP / OCP: появление роли accountant потребовало правки в репозиториях, а не в одном месте

```
financialReportsRepo.ts:390 `summary.totalCommission = addMoney(summary.totalCommission, (actor.role === 'assistant' || actor.role === 'accountant') ? 0 : commission);` / :404 `commission: (actor.role === 'assistant' || actor.role === 'accountant') ? 0 : commission,` / alertsRepo.ts:154 `if (actor.role === 'admin' || actor.role === 'assistant') {`
```

**Что осталось.** Вместо role: string теперь передается типизированный InvoiceActor, но маскирование комиссии по-прежнему зашито в репозиторий трижды. getAlertCounts выбирает, что считать, по роли, storage.getDashboardStats ветвится по ролям (219-236) и сверху еще прогоняется через projectStatsForRole. Проекций projectDoNotSpendForRole и projectAlertCountsForRole в permissions.ts нет.

**Исходная проблема.** Репозиторий получает role строкой и трижды обнуляет комиссию для assistant/accountant; getAlertCounts выбирает, что считать, по роли; storage.getDashboardStats (storage.ts:502-531) ветвится по трем ролям. При этом в проекте уже есть слой server/permissions.ts с projectStatsForRole/projectInvoiceForRole, через который роуты и так прогоняют ответ.

**Что сделать.** Репозитории возвращают полный read-model без знания о ролях; маскирование — исключительно в permissions.ts через проекции на тип ответа (projectDoNotSpendForRole, projectAlertCountsForRole), вызываемые в роуте. Тип роли — один UserRole из shared/schema.ts, параметр role: string в сигнатурах репозиториев запретить.

*Верификатор:* Маскирование комиссии зашито в репозиторий трижды: financialReportsRepo.ts:390, :404, :416. Выбор, что считать, по роли — alertsRepo.ts:154. Ветвление по ролям — storage.ts:219-236. Других проекций, кроме projectStatsForRole, в permissions.ts нет (там экспортируются только функции project*ForRole для invoice, client, partner и stats).

#### F122. Корректность маршрутов зависит от порядка app.use в routes.ts: статический путь /api/invoices/overdue живет в чужом роутере — открыто

- Было: `server/routes.ts:34` (ece9adf). Сейчас: `server/routes/dashboard.ts:62; server/routes/invoices.ts:55; server/routes.ts:47-48`
- Категория: поддерживаемость. Принцип: Явные границы модулей, Principle of least astonishment

```
dashboardRouter.get("/api/invoices/overdue", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
// routes.ts:47-48
  app.use(createDashboardRouter(storage, authMiddleware));
  app.use(createInvoicesRouter(storage, authMiddleware, database, invoiceCommands));
```

**Что осталось.** Все роутеры по-прежнему монтируются в корень без префиксов. /api/invoices/overdue живет в dashboardRouter и работает только потому, что тот зарегистрирован строкой раньше invoicesRouter с параметрическим GET /api/invoices/:id. POST /api/invoices/transfer (invoices.ts:245) все так же объявлен после /:id-маршрутов. Теста, который сверяет таблицу маршрутов, нет.

**Исходная проблема.** Все 14 роутеров монтируются в корень без префиксов, и каждый объявляет полные пути. GET /api/invoices/overdue объявлен в dashboardRouter, а параметрический GET /api/invoices/:id — в invoicesRouter; работает только потому, что dashboardRouter зарегистрирован строкой раньше. Перестановка двух строк в routes.ts или перенос overdue в «правильный» файл ниже :id — и запрос станет поиском счета с id="overdue" (404 с подменой смысла). Аналогично POST /api/invoices/transfer (invoices.ts:372) объявлен после PATCH/DELETE /:id и жив лишь потому, что POST /:id не существует.

**Что сделать.** Монтировать по префиксу: `app.use("/api/invoices", invoicesRouter)`, внутри — относительные пути со статическими сегментами перед параметрическими (`/overdue`, `/transfer` выше `/:id`). Перенести overdue в invoicesRouter. Добавить тест-страж, который собирает таблицу маршрутов из app._router и падает при пересечении статического и параметрического пути одного метода.

*Верификатор:* Подтверждаю: роутеры монтируются через app.use без префиксов (routes.ts:43-57). /api/invoices/overdue объявлен в dashboard.ts:62 и работает только потому, что dashboardRouter зарегистрирован раньше invoicesRouter с GET /:id (invoices.ts:55). POST /transfer (invoices.ts:245) по-прежнему объявлен после /:id. Теста, который сверяет таблицу маршрутов или вызывает /api/invoices/overdue, нет.

#### F123. routes/acts.ts смешивает акты, бонусы ассистента, токены доступа и статистику — открыто

- Было: `server/routes/acts.ts:1` (ece9adf). Сейчас: `server/routes/acts.ts:14-37, 46-78, 80-83; server/routes/assistant.ts:12, 32`
- Категория: SOLID. Принцип: SRP, принцип наименьшего удивления

```
actsRouter.post("/api/access-tokens", authMiddleware, requireRole("admin"), | actsRouter.get("/api/assistant/stats", ... | router.get('/api/assistant/invoice-summary', ...
```

**Что осталось.** routes/acts.ts по-прежнему держит бонусы, коды доступа, статистику ассистента и акты. Файл превратили в фабрику createActsRouter, но ресурсы не разнесли. Статистика ассистента так и разрезана: /api/assistant/stats живет в acts.ts, а invoice-summary и invoice-groups в assistant.ts.

**Исходная проблема.** Файл с именем acts содержит четыре несвязанных ресурса; выпуск кодов доступа (критичная для безопасности операция) спрятан между бонусами и актами, а статистика ассистента разрезана между acts.ts и assistant.ts. Имя файла врет о содержимом.

**Что сделать.** Разнести по ресурсам: routes/accessTokens.ts (с отдельным аудитом и rate-limit), routes/assistantBonus.ts (+ перенести туда /api/assistant/stats и stats-invoices из assistant.ts), routes/signedActs.ts. Собрать реестр маршрутов в одном месте (server/routes/index.ts) с явной таблицей ресурс -> роли, чтобы структура файлов совпадала с ресурсной моделью API.

*Верификатор:* Подтверждаю. В acts.ts по-прежнему лежат бонусы (14-37), коды доступа (46-78), /api/assistant/stats (80) и акты (86-170), а invoice-summary и invoice-groups живут в assistant.ts:12 и 32.

#### F124. Два роутера в бандле: wouter Link вне wouter Router делает полную перезагрузку — открыто

- Было: `src/components/invoices/shared/OverduePaymentsAlert.tsx:79` (ece9adf). Сейчас: `src/components/invoices/shared/OverduePaymentsAlert.tsx:8,79; package.json:90`
- Категория: спагетти. Принцип: KISS / единая зависимость на одну ответственность

```
OverduePaymentsAlert.tsx:8 `import { Link } from "wouter";` ; :79 `<Link href={`/invoices?id=${invoice.id}`}` ; package.json:90 `"wouter": "^3.8.0",`
```

**Что осталось.** Без изменений. Компонент по-прежнему рендерится в ClientDashboard.tsx:24, ссылка внутри BrowserRouter не работает, wouter остается в зависимостях, eslint-запрета нет.

**Исходная проблема.** Приложение целиком на react-router-dom (BrowserRouter в App.tsx), но один компонент импортирует Link из wouter — единственный импорт во всем src. wouter Link вне wouter-Router ведет себя как обычный <a href>: клик по «просроченным платежам» делает полную перезагрузку SPA, сбрасывает QueryClient-кеш, AuthContext заново валидирует сессию, PageTransition не срабатывает. Вторая библиотека роутинга при этом попадает в бандл.

**Что сделать.** Заменить на `import { Link } from 'react-router-dom'`, удалить wouter из package.json, добавить eslint no-restricted-imports для 'wouter'. Заодно перенести drizzle-kit/esbuild/vite/@types в devDependencies (из блока «УЖЕ ИЗМЕРЕНО»), чтобы граница «что идет в прод-бандл» стала видимой.

*Верификатор:* OverduePaymentsAlert.tsx:8 `import { Link } from "wouter"` и :79 на месте, wouter остался в package.json:90. Уточнение: компонент рендерится только с role="client" (ClientDashboard.tsx:419), а запрос включен лишь для admin/assistant (строка 34), поэтому список всегда пуст и `return null` на строке 38. Ссылка фактически мертвый код, но находка не исправлена.

#### F125. Мертвые реликты Supabase/Replit в слое авторизации: sessionStorage-сессия, apiHelpers, клиентский rate limiter — частично

- Было: `src/hooks/useUserRole.ts:29` (ece9adf). Сейчас: `src/hooks/useUserRole.ts:30-47; src/contexts/AuthContext.tsx:144-146; src/hooks/useRateLimit.ts:11; src/lib/rateLimiter.ts`
- Категория: поддерживаемость. Принцип: YAGNI / KISS

```
useUserRole.ts:32 `const sessionStr = sessionStorage.getItem('access_session');` ; :45-47 `accessCode: null, accessTokenId: null, getSession,` ; AuthContext.tsx:145 `sessionStorage.removeItem('access_session');` ; useRateLimit.ts:11 `const userKey = useRef(key || `user-${Date.now()}`);`
```

**Что осталось.** Удален только src/lib/apiHelpers.ts со вторым кешем сессии. Shim useUserRole с мертвыми getSession/accessCode/accessTokenId остался, и его импортируют 9 файлов. Удаление трех несуществующих ключей в logout осталось. Клиентский лимитер (rateLimiter.ts, 177 строк) с ключом по Date.now() по-прежнему подключен в 6 диалогах: UploadDocument, ManageClients, ManagePartners, CreateInvoice, RecordPayment, AddExpense.

**Исходная проблема.** useUserRole возвращает accessCode:null, accessTokenId:null и getSession из sessionStorage, который никто не наполняет — 9 потребителей тащат shim ради переименования isLoading→loading. apiHelpers.ts держит собственный кеш сессии, не инвалидируемый при logout. Клиентский «rate limiter» (177 строк) ключуется `user-${Date.now()}` — новый ключ на каждый mount, то есть лимит действует на один экземпляр диалога и обнуляется его закрытием; реальная защита — server/rateLimiter.ts. Это security-theatre, которое при этом блокирует честного пользователя на 3 минуты после 5 отправок формы.

**Что сделать.** Удалить src/lib/apiHelpers.ts, src/lib/rateLimiter.ts, src/hooks/useRateLimit.ts (6 диалогов — убрать checkLimit), getSession и поля accessCode/accessTokenId из useUserRole, три removeItem несуществующих ключей в logout. useUserRole свести к `export const useUserRole = useAuth` с переименованием loading у 9 потребителей (одноразовый codemod). Если нужен анти-даблклик на формах — `isPending` мутации, не лимитер.

*Верификатор:* Подтверждаю: useUserRole.ts:30-47 сохраняет getSession из sessionStorage и accessCode/accessTokenId: null. Logout чистит несуществующие ключи (AuthContext.tsx:144-146), а useRateLimit.ts:11 строит ключ через `user-${Date.now()}` и подключен в 6 диалогах. Поправка: useUserRole импортируют 8 файлов, а не 9 (девятый, это сам useUserRole.ts).

#### F126. Фронтовый auth-клиент: статус теряется, 401 ловится по подстроке, четыре сырых fetch и ключи-призраки от прошлых схем — частично

- Было: `src/lib/api.ts:24` (ece9adf). Сейчас: `src/lib/api.ts:51-53; src/contexts/AuthContext.tsx:46,85,139,144-146; src/components/invoices/UnifiedInvoicesList.tsx:120`
- Категория: поддерживаемость. Принцип: DRY; единая точка обработки ошибок транспорта

```
if (response.status === 401 && csrfToken === localStorage.getItem('csrf_token')) window.dispatchEvent(new Event('auth-expired'));
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
...
      localStorage.removeItem('session_id');
      sessionStorage.removeItem('access_session');
```

**Что осталось.** Исправлено: в apiRequest появился единый перехват 401 через событие auth-expired, на которое подписан AuthContext. Осталось: ошибка по-прежнему голый Error без status. UnifiedInvoicesList.tsx:120 и ErrorBoundary.tsx:44 распознают протухшую сессию по подстрокам. В AuthContext 4 сырых fetch, ключи-призраки session_id/access_session/session_data на месте. Вне api.ts 52 сырых fetch, и событие auth-expired они обходят. Правила eslint против fetch нет.

**Исходная проблема.** apiRequest выбрасывает голый Error со строкой — компоненты распознают протухшую сессию, сравнивая текст сообщения с русскими/английскими фразами сервера (UnifiedInvoicesList, ErrorBoundary). AuthContext сам не использует api.ts (4 сырых fetch), еще 21 файл делает fetch напрямую — у них 401 не обрабатывается вообще. logout чистит 'session_id', 'access_session', 'session_data' — ключи, которые нигде не пишутся (остатки Supabase/Replit-эпох). useCookieSession считает срок сессии по локальной активности, дублируя серверное окно 30 минут константой.

**Что сделать.** `class ApiError extends Error { status; code }`; в apiRequest — единый перехват 401 → событие `auth:expired`, на которое подписан AuthContext (logout + navigate). Запретить `fetch(` вне src/lib/api.ts eslint-правилом no-restricted-globals. Сервер отдает expiresAt в /validate и /refresh, useCookieSession работает от него, а не от своей константы. Удалить ключи-призраки.

*Верификатор:* Событие auth-expired появилось (api.ts:51), но ошибка остается голым Error без status (api.ts:53). Подстроки проверяют UnifiedInvoicesList.tsx:119 и ErrorBoundary.tsx:44-46. Ключи-призраки session_id/access_session/session_data на месте (AuthContext.tsx:144-146), в AuthContext 4 сырых fetch, eslint-правила против fetch нет.

#### F127. Защита ролевых экранов — набор инлайн-проверок, /client-balances вообще без гарда — частично

- Было: `src/pages/StatsPage.tsx:58` (ece9adf). Сейчас: `src/components/auth/ProtectedRoute.tsx:5-7; src/App.tsx:135-138; src/pages/InvoicesDashboard.tsx:17-21; server/routes/invoices.ts:41`
- Категория: SOLID. Принцип: Single Responsibility / Open-Closed

```
interface ProtectedRouteProps { children: React.ReactNode; } / <ProtectedRoute><ClientBalancesPage /> / invoicesRouter.get('/api/invoices/client-balances', authMiddleware, requireRole('admin', 'assistant', 'accountant'),
```

**Что осталось.** Последствие из находки устранено косвенно: ClientBalancesView теперь читает /api/invoices/client-balances с requireRole, партнер и клиент получают 403 (проверено в server/reviewCompletion.test.ts) и видят ошибку, а не свои счета под видом бюджетов клиентов. Сам дефект UI-слоя остался: ProtectedRoute проверяет только isAuthenticated, ролевых гардов маршрутов нет, ролевой switch в InvoicesDashboard и инлайн-отказы (AccountingPage.tsx:53, StatsPage) на месте.

**Исходная проблема.** ProtectedRoute.tsx проверяет только isAuthenticated (пропсов roles нет). Ролевая маршрутизация размазана: InvoicesDashboard.tsx:17-21 пять `{role === '...' && <XDashboard />}`, StatsPage.tsx:58-66 инлайн-отказ, ExpectedAdminProfitDashboard.tsx:93 `if (role !== 'admin') return null`, а /client-balances (App.tsx:134-140) не имеет никакой проверки и скрыт только пунктом сайдбара (AppSidebar.tsx:138-142, только для assistant). Партнер, перейдя по URL, увидит ClientBalancesView с заголовком «Остатки по клиентам», где его собственные счета сгруппированы и просуммированы фронтовыми формулами как «бюджеты клиентов». Сервер скоупит /api/invoices по роли, утечки данных нет, но UI-слой доверяет сайдбару.

**Что сделать.** Расширить ProtectedRoute пропсом roles: UserRole[] и собрать таблицу маршрутов RouteDef[] (path, element, roles) в одном файле; ролевой switch из InvoicesDashboard заменить картой Record<UserRole, ComponentType>. Инлайн-проверки role внутри страниц удалить.

*Верификатор:* Серверная часть закрыта: requireRole на client-balances (server/routes/invoices.ts:41), тест на 403 в server/reviewCompletion.test.ts:75. UI-гардов по-прежнему нет: ProtectedRoute проверяет только isAuthenticated (ProtectedRoute.tsx:5-17), а ролевой switch остался в InvoicesDashboard.tsx:17-21 и AccountingPage.tsx:53.


## 4. Опровергнутое при проверке

Находки 17.10, которые верификатор опроверг на коде ece9adf:

- **Четыре из шести веток движка мертвы по бизнесу, но живы в коде, SQL-аудите и восьми файлах фронта** (`shared/financialEngine.ts:83`). Факты про код верны: четыре ветки в shared/financialEngine.ts (83–135, 176–220 — ~95 строк, не 50), 12 CASE в audit-money.sql (46–53, 57–60), schemeMap в myInvoices.ts:10, enum в shared/schema.ts:4, литералы даже в 18 файлах src, а не в 8. Но центральный тезис «мертвы по бизнесу» опровергается: до двух схем сведен только мастер разовых счетов (assistant/CreateInvoiceDialog.tsx), а админский диалог периодических счетов по умолчанию ставит agency_30, предлагает только agency_30/40, partner_10/15 и commission_based, и recurringRepo по этим шаблонам создает настоящие счета — это живой путь создани …
- **Excel и PDF рендерятся синхронно в event-loop единственного процесса, Excel — целиком в буфер** (`server/routes/export.ts:887`). Фактически код таков, как описано: writeBuffer + Buffer.from, heightOfString на каждую ячейку, один процесс без cluster. Но заявленная проблема не подтверждается масштабом: в прод-дампе backups/prod_20260603_184752.sql.gz всего 126 счетов на 8 клиентов, отчет строится по одному клиенту (десятки строк), так что блокировка event-loop — единицы миллисекунд; оба обработчика и так грузят в память все счета и расходы через storage.getInvoices("admin")/getAllExpenses, на фоне чего xlsx-буфер ничтожен. Предложенный `workbook.xlsx.write(res)` память не сэкономит (модель Workbook уже целиком в памяти, п …
- **Матрица прав фронта и allowlist сервера — два независимых источника, уже разошлись** (`src/lib/invoicePermissions.ts:36`). Два словаря действительно независимы (getVisibleFields на фронте, ROLE_*_PERMISSIONS + isClientUsageVisible на сервере, общего теста нет; по оси scheme они при этом совпадают: isAgencyScheme и CLIENT_FINANCIAL_VISIBLE_SCHEMES — одно и то же множество agency_30/agency_40/agency), но заявленное «уже разошлись» опровергается кодом: клиенту по периодическому commission_based счету UI показывает «Использовано/Осталось» в трех местах — InvoiceDetailsDialog.tsx:1066 (блок по service_type «для всех ролей»), UnifiedInvoicesList.tsx:831-855 (клиентская ветка isPeriodic) и ClientBudgetDashboard.tsx:139. …
- **В CreateInvoiceDialog расчет делается на клиенте и отправляется на сервер как payload calculations** (`src/components/invoices/assistant/CreateInvoiceDialog.tsx:158`). Цитата точная, но вывод опровергается сервером: server/repositories/invoiceRepo.ts createInvoice (стр. 452–479) и updateInvoiceCalculations (стр. 495–553) берут из присланного calculations только входные параметры (clientBill, commissionRate, executorExpensesTotal), пересчитывают все через calculateInvoiceServer → shared/financialEngine и пишут в invoice_calculations только computed — клиентские agencyMargin/partnerShareFromMargin/netProfitAdmin отбрасываются, а вставка счета и расчета идет в db.transaction. Конвенция «commissionRate = маржа для 'agency', процент партнера для commission_based» …

Новая находка, опровергнутая 21.10:

- **Документация ремедиации расходится с кодом области** (`docs/architecture-review-remediation.md:129`). Фраза в docs/architecture-review-remediation.md:129 стоит в пункте именно про InvoicePage, и для нее она верна (displayMoney → '—', InvoicePage.tsx:104), на список она не распространяется. Строка :71 — общее утверждение, а его частичность уже учтена в F94. Самостоятельного расхождения нет.

Пересмотр статуса верификатором 21.10 (не согласился с проверяющим):

- F109: проверяющий «исправлено», итог «частично». Локальных `type UserRole` в src больше нет, и tsc чист. Но тот же дефект, ручной union ролей без accountant, остался в src/components/invoices/shared/OverduePaymentsAlert.tsx:24 `role: "admin" | "assistant" | "partner" | "client";` (был и на ece9adf). Ревьюер прямо предлагал убрать такие union-ы, а правила eslint против них нет.
