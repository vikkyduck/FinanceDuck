# FinanceDuck

Кабинет счетов, расходов и взаиморасчётов: React + TypeScript, Express, PostgreSQL и Drizzle. Требуются Node.js 26 и PostgreSQL 16.

## Локальная работа

1. Установите зависимости командой `npm ci`.
2. Создайте `.env` по `.env.example`, задайте подключение к **локальной** БД и отдельный секрет шифрования.
3. Соберите сервер и примените версионированные миграции:

```sh
npm run build:server
node --env-file=.env dist-server/migrate.js
NODE_ENV=development node --env-file=.env --import tsx server/vite.ts
```

Сервер слушает порт 5000; `PORT` и `HOST` задаются окружением. База с существующими таблицами без migration journal требует предварительного baseline, см. инструкцию ниже.

## Проверки

```sh
npm run check
TEST_POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:postgres
npm audit --audit-level=moderate
```

`check` запускает строгую типизацию клиента и сервера, ESLint без предупреждений, тесты Vitest/PGlite и production-сборки. `test:postgres` проверяет конкурентные записи на отдельных соединениях в своей временной БД. В GitHub Actions оба набора обязательны.

## Архитектура и выпуск

- [Границы команд, резервирование, изменения ревью и миграция существующей базы](docs/architecture-review-remediation.md).
- [Развёртывание на VDS](deploy/README.md).
- Финансовые правила: `shared/financialEngine.ts`; серверные команды: `server/services/invoiceCommands.ts`; первичные данные и проекции: `server/repositories/invoiceRepo.ts`.
- Контракты и роли: `shared/contracts.ts`, `shared/invoiceContract.ts`, `shared/domainTypes.ts`.

Production запускает `node dist-server/index.js` с `NODE_ENV=production`. Публикация требует проверки миграций на восстановленной копии и полного бэкапа; `db:push` предназначен для разработки, deployment использует `db:migrate`.

Документы хранятся в частном постоянном каталоге `DOCUMENT_OBJECT_DIR`, отдельно от SQL и файлов приложения. Для локальной разработки задайте доступный текущему пользователю абсолютный путь. Для существующей базы перенос встроенных файлов описан в инструкции миграции. Браузеры: Chrome/Edge 111+, Safari 16.4+, Firefox 128+.
