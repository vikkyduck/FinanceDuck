# Overview

This project is an invoice management system migrating to Replit with a Neon PostgreSQL backend. It provides role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key capabilities include secure cookie-based authentication with CSRF protection, comprehensive financial calculations for various commission schemes, and a clear overview of financial flows, including a waterfall visualization of fund distribution and a "Do Not Spend" dashboard for tracking project budgets. The system aims to streamline invoice management, improve financial transparency, and enhance collaboration among stakeholders.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with React 18, TypeScript, and Vite. It uses React Router for navigation and TanStack Query for server state management. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS, and enhanced with Framer Motion for animations. The design adheres to Apple HIG principles, featuring a minimal aesthetic, iOS Blue as the primary color, and an Inter font family with Cyrillic support, implemented with a mobile-first responsive approach. State management primarily uses React hooks for local state and TanStack Query for remote data.

## Backend Architecture

The backend utilizes an Express.js server with a Neon PostgreSQL database accessed via Drizzle ORM. It employs cookie-based session management with HttpOnly cookies and CSRF protection. A robust Role-Based Access Control (RBAC) system, enforced by server-side allowlist filtering, manages four roles: admin, assistant, partner, and client. The database schema includes tables for invoices, partners, clients, access tokens, user sessions, expenses, documents, partner payments, client-partner relationships, and assistant bonus payments. Server-side privacy rules strictly control data visibility, particularly for assistants, who cannot access partner-client relationships, certain financial details, or perform deletion operations.

## Financial Calculation Engine

The system supports four primary commission schemes: `partner_10`, `partner_15`, `agency_30`, and `commission_based`. A core `calculateInvoice()` function computes all financial metrics, accurately distinguishing between expenses paid by partners and those paid by admins for net profit calculations. The `agency_30` scheme features a fixed admin share, with expenses deducted from the client's budget. The system also supports assistant bonus payouts based on signed acts (executor/company acts).

### Net Profit Calculation (Critical Fix 2025-11-29)

**Partner schemes (partner_10, partner_15, commission_based):**
- Partner receives client payment → pays expenses from client money (expensesPaidByPartner)
- Partner transfers to admin: amountToAdmin - expensesPaidByPartner
- Admin may also pay expenses from own funds (expensesPaidByAdmin)
- **Formula: netProfitAdmin = amountToAdmin - expensesPaidByPartner - expensesPaidByAdmin**

**Agency_30 scheme:**
- 70% stays with partner for project expenses (not transferred to admin)
- 30% is agency margin (15% partner + 15% admin)
- **Formula: netProfitAdmin = 15% of clientBill (FIXED, expenses come from 70%)**

### Unified Partner Debt Tracking (2025-11-29)

The `invoice_calculations` table stores `partnerTransferDue` as the single source of truth for partner debt:
- **partnerTransferDue** = amountToAdmin - expensesPaidByPartner (what partner must transfer to admin)
- **For agency_30**: partnerTransferDue = 15% of clientBill (fixed)
- This stored value is used by `getPartnerDebtSummaries()` to ensure consistent debt display across admin and partner dashboards
- Frontend `calculatePartnerDebt()` accepts optional stored value and falls back to calculation when unavailable
- All debt values are clamped to zero (negative debts not displayed)

### Role-Based Data Access (2025-11-29)

All roles receive data from the SAME stored values in `invoice_calculations` table. Filtering is controlled by centralized permission constants in `server/routes.ts`:

**Admin sees:**
- All invoice fields including `partnerId`, `hideFromAssistant`
- All calculation fields including `netProfitAdmin`, `adminShare50`, `catShare50`, `partnerTransferDue`
- All stats including `totalNetProfit`, `totalAdminShare`
- Partner debt summaries for all partners

**Partner sees:**
- Invoice fields (excluding `partnerId`, `hideFromAssistant`)
- Calculation fields: commission, expenses, `clientRemaining`, `partnerTransferDue`
- Stats: commission totals, debt, client remaining
- Only their own debt summary

**Client sees:**
- Basic invoice fields
- Calculation fields: `clientBill`, `clientBaseAfterMargin`, `clientSpent`, `clientRemaining`, expenses
- Stats: invoice counts, `totalClientBill`, `clientRemaining`

**Assistant sees (RESTRICTED):**
- Basic invoice fields: id, number, client, status, description, dates, scheme
- Calculation fields: `clientBill`, `executorExpensesTotal` ONLY
- Stats: invoice counts, totals (NO commission, profit, debt, remaining)
- NO partner-client relationships
- NO financial analytics

**Unified API endpoint:** `/api/financial-summary` returns all data filtered by role from single source of truth.

## Security Architecture

Security is implemented through XSS protection via input sanitization and React's auto-escaping, coupled with file upload validation. Rate limiting employs a token bucket algorithm. Input validation is handled by Zod schemas on both frontend and backend. Centralized error handling provides user feedback and logs critical errors. Authentication uses secure cookie-based sessions with CSRF protection and role-based access control.

## Performance Optimizations

Optimizations include code splitting, TanStack Query for data caching and efficient fetching, and rendering optimizations like skeleton components and debounced inputs. Real-time data synchronization uses visibility-aware polling with 120-second intervals (reduced from 30s to prevent UI "jitter"). Polling pauses when browser tab is hidden and auto-refreshes on tab focus. Key optimizations:
- **Visibility-aware polling**: All polling hooks check `document.visibilityState` before making requests
- **Reduced frequency**: 120-second intervals instead of 30s to reduce server load
- **Smart refresh**: Data auto-refreshes when tab becomes visible via `visibilitychange` event
- **Centralized hooks**: `useAdminDashboardRefresh`, `useDashboardStats`, `useRealtimeSubscription` handle polling consistently

### Unified Assistant Bonus System (2025-11-29)

Admin and Assistant dashboards now share the same data source for bonus calculations:
- **Single API endpoint**: `/api/assistant/stats` provides unified bonus data for both roles
- **Bonus calculation**: Based on signed acts (executor acts × 1000 ₽ + company acts × 2000 ₽)
- **Admin-only features**: Payout button via `/api/admin/bonus-payout` and payment history
- **Components**:
  - `AssistantBonusCard` - for assistant dashboard (view only)
  - `AssistantBonusManager` - for admin dashboard (with payout button)
- Both components display identical bonus data with identical UI layout

### Express API Migration (2025-11-29)

Key components migrated from Supabase RPC to Express API:
- **AdminCashFlowForecast**: Uses `/api/admin/forecast` + `/api/dashboard/stats`
- **KeyMetricsCards**: Uses `/api/dashboard/stats` with 30s polling and visibility refresh
- **RecalculateInvoicesButton**: Uses `/api/admin/recalculate-invoices`
- **SecurityMonitoring**: Simplified to static security info (security_events table not in Neon)

### Production Deployment Fixes (2025-11-29)

Critical fixes for production deployment:
- **Cookie security**: Fixed `isSecure` detection using `x-forwarded-proto` header and `req.secure` for proper HTTPS proxy support
- **Cookie path**: Added explicit `path: "/"` to ensure cookies work across all routes
- **Health check**: Added `/health` and `/api/health` endpoints, plus root `/` handler for deployment health checks
- **Deployment config**: Uses `NODE_ENV=production` with frozen lockfile to prevent dependency re-optimization
- **Recurring scheduler**: Lazy initialization 60 seconds after server start to not block health checks

### Waterfall Chart Fix (2025-11-29)

Fixed the invoice waterfall visualization to correctly display expenses based on who paid them:
- **Partner-paid expenses**: Now shown as "Расходы (партнёр)" with correct visual representation
- **Net profit display**: Uses stored `netProfitAdmin` value from backend (single source of truth)
- **Expense tracking**: `InvoiceDetailsDialog` now passes `paidByAdmin` flag for each expense to the waterfall chart
- **Key insight**: When partner pays expenses, they reduce partner's transfer amount, not admin's received funds

### Centralized Expense Recalculation (2025-11-29)

Created `recalculateInvoiceExpenses()` private helper in `server/storage.ts` to ensure ALL expense operations correctly split expenses by payer:
- **Single source of truth**: One function handles expense split calculation for all CRUD operations
- **Used by**: `createInvoiceExpense()`, `updateInvoiceExpense()`, `deleteInvoiceExpense()`
- **Logic**: Splits expenses into `expensesPaidByPartner` (paidByAdmin=false) and `expensesPaidByAdmin` (paidByAdmin=true)
- **Recalculates**: Calls `calculateInvoiceServer()` with proper splits, then updates `invoice_calculations`
- **Consistency**: Matches logic in `recalculateAllInvoices()` for bulk operations
- **Action required**: After deployment, run "Recalculate all invoices" button in admin panel to fix historical data

### Recurring Invoices System (2025-11-29)

Fully functional recurring invoice management with automatic draft generation:
- **Database table**: `recurring_invoices` stores templates with frequency, amount, scheme, client, partner, hideFromAssistant info
- **UI components**: `RecurringInvoicesManager` lists all recurring templates with "Create Now" and "Backdate" actions, shows EyeOff badge for hidden templates
- **Create dialog**: `CreateRecurringInvoiceDialog` supports amount, description, startDate, endDate, frequency, and hideFromAssistant checkbox
- **Manual creation**: Admin clicks "Create Now" to generate draft invoice from template (inherits hideFromAssistant)
- **Backdating**: Creates all missing historical invoices from startDate to today (inherits hideFromAssistant)
- **hideFromAssistant inheritance**: Created invoices automatically inherit hideFromAssistant setting from recurring template
- **Cash Flow integration**: 
  - `AdminCashFlowForecast` shows recurring amounts as separate visualization per month
  - `AdminDashboardMetrics` includes recurring amounts in Cash Flow card (received + expected + recurring)
  - `getRecurringExpectedForMonth()` calculates expected profit from recurring schedules using generator-based iteration
- **Occurrence Generator Algorithm** (Critical fix):
  - Always iterates from scheduleStart anchor to preserve frequency alignment
  - Quarterly starting May → May, Aug, Nov, Feb, May... (NOT Jan, Apr, Jul, Oct)
  - Generator yields occurrences only within [rangeStart, rangeEnd] that are >= scheduleStart
  - Used twice: once for monthly window, once for yearly totals
- **Key fixes**: Date object cloning in `getAdminForecast` prevents mutation bugs; null guards for `nextInvoiceDate`

Remaining Supabase usage (historical, some components still reference supabaseHelpers for partner/client specific features):
- Partner reports (PartnerClientStats, PartnerCommissionReport, PartnerDebtTrafficLight)
- Assistant insights (AssistantInsights, AssistantYearlyOverview)
- Working capital management (WorkingCapitalManager)

# External Dependencies

## Primary Services

**Supabase**: Used for data migration (historical reference, no longer primary backend).
**Neon**: Primary PostgreSQL database backend.

## UI Libraries

**Radix UI**: Headless, accessible UI components.
**shadcn/ui**: Component library built on Radix UI.
**Framer Motion**: Animation library.
**Recharts**: Charting library for financial visualizations.

## Utility Libraries

**date-fns**: Date manipulation.
**clsx & tailwind-merge**: CSS class utilities.
**react-hook-form + zod**: Form handling and validation.
**sonner**: Toast notifications.

## Development Tools

**TypeScript**: For type safety.
**ESLint**: Code linting.
**Vite**: Fast build tool.