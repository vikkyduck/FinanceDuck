# Overview

This project is an invoice management system migrating to Replit with a Neon PostgreSQL backend. It provides role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key capabilities include secure cookie-based authentication with CSRF protection, comprehensive financial calculations for various commission schemes, a waterfall visualization of fund distribution, a "Do Not Spend" dashboard for tracking project budgets, recurring invoice management, Excel export, and automatic database backups. The system aims to streamline invoice management, improve financial transparency, and enhance collaboration among stakeholders.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with React 18, TypeScript, and Vite, utilizing React Router for navigation and TanStack Query for server state management. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS, and enhanced with Framer Motion for animations. The design adheres to Apple HIG principles, featuring a minimal aesthetic, iOS Blue as the primary color, and an Inter font family with Cyrillic support, implemented with a mobile-first responsive approach.

## Backend Architecture

The backend utilizes an Express.js server with a Neon PostgreSQL database accessed via Drizzle ORM. It employs cookie-based session management with HttpOnly cookies and CSRF protection. A robust Role-Based Access Control (RBAC) system manages five roles: admin, assistant, partner, client, and accountant (бухгалтерия), with server-side allowlist filtering. The database schema supports invoices, partners, clients, expenses, documents, and various payment and relationship entities. Server-side privacy rules strictly control data visibility, especially for assistants and accountants.

## Financial Calculation Engine

The system supports five primary commission schemes: `partner_10`, `partner_15`, `agency_30`, `agency_40`, and `commission_based`. All financial formula logic is centralized in **`shared/financialEngine.ts`** — a pure, side-effect-free module used by both the backend and the frontend. `calculateFinancials()` returns numbers; each consumer converts to its own format (strings for Drizzle DB, numbers for React UI). The frontend adapter is `src/lib/invoiceCalculations.ts` which maps camelCase → snake_case. The backend adapter is the thin `calculateInvoiceServer()` wrapper in `server/storage.ts`. The `agency_30` scheme features a fixed admin share (15% admin + 15% partner, 70% client budget), and `agency_40` scheme (24% admin + 16% partner, 60% client budget). Assistant bonus payouts are based on signed acts. Net profit calculation formulas are specifically defined for partner and agency schemes. Unified partner debt tracking is managed via `partnerTransferDue` stored in `invoice_calculations` table. All roles receive data from the same stored values, filtered by centralized permission constants.

## Dashboard Data Rules

**CRITICAL: Each dashboard has strict invoice status filtering:**

| Dashboard | Status Filter | Description |
|-----------|---------------|-------------|
| **Ожидаемая прибыль** | `sent`, `draft` | Прибыль по неоплаченным счетам (клиенты ещё не заплатили) |
| **Долг партнёра** | `paid` | Суммы, которые партнёр должен перевести по оплаченным счетам |
| **Не тратить** | `paid` ONLY | Бюджет клиента по уже оплаченным счетам agency_30/agency_40 |
| **Средства партнёров Agency** | `paid` | Доля партнёра по оплаченным agency счетам |

**Rule: Неоплаченные счета НИКОГДА не должны попадать в дашборды "Не тратить" и "Долг партнёра", т.к. деньги по ним ещё не получены.**

**CRITICAL: Синхронизация логики дашбордов:**
- Функции `getAdminDashboardStats()` и `getDashboardInvoices()` ДОЛЖНЫ использовать одинаковую логику фильтрации по датам
- Для определения месяца используется `paymentDate` (планируемая дата оплаты), с fallback на `createdAt`
- Логика: `paymentDate ? paymentDate : createdAt`
- Любые изменения в одной функции ТРЕБУЮТ аналогичных изменений в другой

## Security Architecture

Security is implemented through XSS protection via input sanitization and React's auto-escaping, coupled with file upload validation. **Rate limiting** is backed by the PostgreSQL `login_rate_limits` table (5 attempts → 15-min lockout, 1-hr reset window) via `server/rateLimiter.ts` — survives server restarts. Input validation is handled by Zod schemas on both frontend and backend. Centralized error handling provides user feedback and logs critical errors. Authentication uses secure cookie-based sessions with CSRF protection and role-based access control.

## Backend Repository Architecture

`server/storage.ts` has been decomposed into domain repositories under `server/repositories/`:
- **`userRepo.ts`**: auth/session/access-token methods
- **`partnerRepo.ts`**: partners, partner-payments
- **`clientRepo.ts`**: clients, client-partner relations
- **`invoiceRepo.ts`**: invoice/expense/document CRUD, `calculateInvoiceServer`, `generateInvoiceNumber`, IDOR-safe `getInvoice(db, id, role?, partnerId?, clientId?)`
- **`recurringRepo.ts`**: recurring invoice templates, draft generation, backdating
- **`actsRepo.ts`**: signed acts, assistant bonus payments and statistics
- **`actionLogRepo.ts`**: assistant audit log writes + enriched reads

`DatabaseStorage` in `server/storage.ts` delegates all methods to these repos as thin one-liner delegates. Cross-repo calls pass the same `db` instance directly.

**Middleware & Permissions** are fully extracted:
- **`server/middleware.ts`**: `AuthenticatedRequest`, `SESSION_COOKIE`, `authMiddleware`, `requireRole`
- **`server/permissions.ts`**: all `ROLE_*_PERMISSIONS` constants and projection helpers

**IDOR Protection**: `getInvoice(db, id, role, partnerId, clientId)` adds ownership WHERE clauses for partner/client roles so no cross-tenant data leaks via direct ID lookup. `IStorage.getInvoiceForRole()` is the typed interface used by routes.

**Type Safety**: All numeric conversions use `parseNum()` from `shared/financialEngine.ts` — no raw `parseFloat` calls anywhere in the server (confirmed across all repos and route files).

**Route Architecture**: `server/routes.ts` is a thin 43-line orchestrator that mounts 10 domain routers from `server/routes/`:
- `auth.ts` — login/logout/validate/refresh + admin lockout management
- `clients.ts` — clients CRUD + acts-status + closing-docs-status + client budget/agency30
- `partners.ts` — partners CRUD + payments + debt + history + partner dashboard endpoints
- `dashboard.ts` — admin analytics, financial plans, dashboard stats, financial summary
- `invoices.ts` — invoices/expenses/documents CRUD + closing-document
- `acts.ts` — signed acts + bonus payments + access-tokens + assistant stats
- `recurring.ts` — recurring invoice templates + my-invoices/export
- `export.ts` — admin Excel export
- `backup.ts` — database backup management
- `actionLog.ts` — assistant/accountant action logs

**DB Indexes** (applied to production DB): `idx_invoices_status`, `idx_invoices_payment_date`, `idx_invoices_created_at`, `idx_invoices_partner_id`, `idx_invoices_client_id`, `idx_invoices_recurring_id`, `idx_invoices_status_payment` (composite), `idx_invoice_calc_invoice_id`.

**SQL Aggregation**: `getAdminDashboardStats()` uses 6 parallel SQL aggregate queries (no JS loop over all invoices), with `effectiveDate = COALESCE(payment_date, DATE(created_at))`.

## State Management Architecture

**Three-tier approach — no prop drilling:**

1. **Server state** — TanStack Query is the primary global store. Components subscribe directly to query keys (`['/api/invoices']`, `['/api/dashboard/stats']`, etc.) without passing data through parent components. Mutations call `invalidateQueries` and all subscribers re-render automatically.

2. **Auth state** — `src/contexts/AuthContext.tsx` is the single source of truth. A single `AuthProvider` in `App.tsx` makes **one** `/api/auth/validate` request on mount. All components read from context via hooks:
   - `useAuth()` — re-export of `useAuthContext()`, keeps all existing imports unchanged
   - `useUserRole()` — backward-compat shim over the same context (`isLoading → loading` alias)

3. **UI state** — Local hooks: `useInvoiceFilters`, `useViewMode`, `useCookieSession`. Sidebar state in `SidebarContext` (Radix).

**Key files:** `src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `src/hooks/useUserRole.ts`

## Performance Optimizations

Optimizations include code splitting, TanStack Query for data caching and efficient fetching, and rendering optimizations like skeleton components and debounced inputs. Real-time data synchronization uses visibility-aware polling with 120-second intervals and smart refresh on tab focus. An ErrorBoundary provides user-friendly error messages. Unified cache invalidation is managed via `useInvalidateInvoices()`.

## Core Features

- **Unified Assistant Bonus System**: Single API endpoint for bonus calculations based on signed acts, with admin-only payout features.
- **Express API Migration**: Key components migrated from Supabase RPC to Express API for improved performance and control.
- **Production Deployment Fixes**: Includes cookie security, cookie path, health checks, and optimized deployment configurations.
- **Waterfall Chart Fix**: Correctly displays expenses based on payer and uses stored `netProfitAdmin` for net profit.
- **Centralized Expense Recalculation**: `recalculateInvoiceExpenses()` helper ensures consistent expense splitting by payer for all CRUD operations.
- **Recurring Invoices System**: Manages recurring invoice templates with automatic draft generation, backdating, and inheritance of `hideFromAssistant` settings. Integrated into Cash Flow Forecasts. Deduplication: recurring forecast excludes months where a real invoice (linked via `recurringInvoiceId`) already exists, preventing double-counting in dashboard totals.
- **Client Balances View (Assistant)**: A new «По клиентам» tab in `AssistantDashboard` lets the assistant see all clients grouped by name with aggregated budget/spent/remaining stats and expandable invoice detail rows. Implemented in `src/components/invoices/assistant/ClientBalancesView.tsx`. Uses existing `/api/invoices` data (no new endpoint needed). Budget shown is `clientBaseAfterMargin` for agency schemes (net of agency fee) and `clientBill` for partner schemes — i.e. the working budget the client actually controls.
- **Excel Export System**: Comprehensive data export functionality for invoices, clients, partners, and expenses with configurable filters. Assistant and accountant roles have their own export (`/api/my-invoices/export`) limited to their permitted invoices, including per-invoice expenses, remaining budget, and closing document links (accountant only).
- **Automatic Backup System**: Hourly database backups to Replit Object Storage, daily at 3 AM, with 7-day retention. Supports manual creation, download, restore, and deletion via UI.

# External Dependencies

## Primary Services

- **Neon**: Primary PostgreSQL database backend.

## UI Libraries

- **Radix UI**: Headless, accessible UI components.
- **shadcn/ui**: Component library built on Radix UI.
- **Framer Motion**: Animation library.
- **Recharts**: Charting library for financial visualizations.

## Utility Libraries

- **date-fns**: Date manipulation.
- **clsx & tailwind-merge**: CSS class utilities.
- **react-hook-form + zod**: Form handling and validation.
- **sonner**: Toast notifications.
- **exceljs**: For Excel file generation.

## Development Tools

- **TypeScript**: For type safety.
- **ESLint**: Code linting.
- **Vite**: Fast build tool.