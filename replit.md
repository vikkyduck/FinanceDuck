# Overview

This project is an invoice management system migrating from Supabase to Replit with Neon PostgreSQL backend. It offers role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key features include secure cookie-based authentication with CSRF protection and comprehensive financial calculations for various commission schemes. The system aims to provide a clear overview of financial flows, including a waterfall visualization of fund distribution and a "Do Not Spend" dashboard for tracking project budgets.

## Migration Status

**Data import completed (2025-11-27):**
- 4 partners with full contact info (telegram handles, phones)
- 5 clients with full contact info (telegram handles)
- 23 invoices with complete calculation data
- 47 expenses imported

**Schema updates:**
- Added telegram field to partners and clients tables
- Made email optional (nullable) for partners and clients
- Partners can now be added via UI without email
- **NEW (2025-11-27):** Added client_partners junction table for many-to-many client-partner relationships
  - Clients can now have multiple partners assigned
  - Legacy partnerId field kept for backward compatibility with invoices
  - Migration: existing partnerId relationships moved to junction table

**Completed migrations (Supabase → invoiceService API):**
- InvoiceDetailsDialog - full invoice view with expenses and documents
- CreateInvoiceDialog - invoice creation with local calculations pre-submit
- AddExpenseDialog / EditExpenseDialog - expense CRUD operations
- ClientCombobox / PartnerCombobox - entity selection with server data
- ManagePartnersDialog - full CRUD with contact fields (name, telegram, phone, email), view partner's clients (admin only), delete with confirmation (admin only)
- ManageClientsDialog - full CRUD with contact fields (name, telegram, phone), **multi-partner selection** (admin only), delete with confirmation (admin only)
- RecordPaymentDialog - partner payment recording with server-side filtering
- **Dashboard Statistics (2025-11-27):**
  - AdminStats, AdminHeroMetrics - admin dashboard metrics
  - PartnerStats - partner commission and debt tracking
  - ClientStats - client invoice summaries
  - useDashboardStats hook with TanStack Query polling (30s) for near real-time updates

**API Endpoints for Partners/Clients:**
- GET/POST/PATCH /api/partners - full contact info
- DELETE /api/partners/:id - admin only, checks for linked invoices/clients (via junction table)
- GET /api/partners/:id/clients - get partner's clients (uses junction table)
- GET/POST/PATCH /api/clients - full contact info
- DELETE /api/clients/:id - admin only, checks for linked invoices
- GET /api/clients/:id/with-partner - get client with legacy partner info
- GET /api/clients/:id/partners - get all partners for a client
- PUT /api/clients/:id/partners - set partners for a client (admin only)
- GET /api/clients-with-partners - get all clients with their partners array

**Admin Analytics API Endpoints (2025-11-28):**
- GET /api/admin/monthly-data?year=YYYY - monthly sales, profit, expenses breakdown (admin only)
- GET /api/admin/forecast?months=N - N-month revenue forecast with expected vs received (admin only)
- GET /api/invoices/overdue - overdue invoices list (admin only)
- GET /api/admin/plan-fact?year=YYYY - plan vs fact data for comparison charts (admin only)
- GET /api/admin/monthly-plans?year=YYYY - get all monthly financial plans for year (admin only)
- POST /api/admin/monthly-plans - upsert monthly financial plan targets (admin only)

**Database Schema Updates (2025-11-28):**
- Added monthly_financial_plans table for storing monthly target goals (sales, profit, receipts)
- Index on (year, month) for efficient lookup

**Migrated Analytics Components (2025-11-28):**
- CurrentPeriodMetrics - YTD revenue/profit comparison with last year
- SalesStatistics - monthly and yearly sales metrics
- YearlyKeyIndicators - annual totals and best month
- MonthlyFinancialTable - month-by-month breakdown with growth indicators
- RevenueForecastChart - stacked bar chart for forecast visualization
- RevenueForecastTable - detailed forecast table
- OverduePaymentsAlert - overdue invoices with action buttons
- CurrentMonthPlanFact - displays plan vs fact progress bars using REST API
- FinancialPlanningChart - bar chart comparing planned sales vs actual receipts
- AdminDashboardMetrics - key dashboard metrics with proper TanStack Query v5 queryFn

**Dashboard Refresh System (2025-11-28):**
- useAdminDashboardRefresh hook: Centralized polling (30s) and visibility-based cache invalidation
- useInvalidateAllDashboards hook: Post-mutation cache invalidation for all admin queries
- Uses predicate-based matching with ADMIN_PREFIXES list for robust query key coverage
- Automatically refreshes all admin-related queries when tab becomes visible

**Privacy Rules Enforced (Server-Side):**
- Assistants cannot access partner-client relationships via ANY endpoint:
  - GET /api/partners/:id/clients - returns 403
  - GET /api/clients/:id/with-partner - returns 403
  - GET /api/partner-payments - returns 403
- partnerId field stripped from all client responses for assistants (GET, POST, PATCH)
- partnerId and partner object stripped from invoice responses for assistants
- Assistants cannot delete partners/clients (admin only)
- All financial calculations hidden from assistants (server-side allowlist filtering)

**Temporarily disabled:**
- UploadDocumentDialog - requires Replit file storage configuration

**Remaining components to migrate (45+ files):**
- Admin dashboards (InvoiceList, Analytics, Reports)
- Partner/Client dashboards
- Financial calculation components
- Real-time subscription hooks

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with React 18, TypeScript, and Vite, utilizing React Router for navigation and TanStack Query for server state management. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS, and enhanced with Framer Motion for animations. The design adheres to Apple HIG principles, featuring a minimal aesthetic, iOS Blue as the primary color, and an Inter font family with Cyrillic support, all implemented with a mobile-first responsive approach. State management primarily uses React hooks for local state and TanStack Query for remote data.

## Authentication & Authorization

The system employs cookie-based session management with HttpOnly cookies and CSRF protection for secure authentication. It features a robust Role-Based Access Control (RBAC) system with four roles (admin, assistant, partner, client), enforced by server-side allowlist filtering and protected frontend routes. Access codes manage role assignment. Security note: Assistants MUST NEVER see commission percentages, profit analytics, or agency margins - server strips these fields.

## Backend Architecture

Express.js server with Neon PostgreSQL database via Drizzle ORM. Cookie-based session management with HttpOnly cookies and CSRF protection. Server-side RBAC uses allowlist approach - assistants only receive explicitly permitted fields (id, invoiceNumber, clientId, partnerId, status, clientBill, executorExpensesTotal). The database schema includes tables for invoices, partners, clients, access tokens, user sessions, expenses, documents, and partner payments. API routes in server/routes.ts, storage layer in server/storage.ts.

## Data Flow

The invoice management flow involves assistants creating invoices, data sanitization, session validation, and real-time updates for all connected clients. Admins review and update invoice statuses, triggering automatic financial recalculations. The authentication flow securely verifies user access codes, creates sessions, and manages session cookies and CSRF tokens for subsequent requests. Real-time updates for critical data are managed via a `useRealtimeSubscription` hook.

## Financial Calculation Engine

The system supports four commission schemes with `calculateInvoice()` as a core pure function for computing all financial metrics:
- **partner_10**: Partner gets 10% commission, admin receives 90% of clientBill
- **partner_15**: Partner gets 15% commission, admin receives 85% of clientBill
- **agency_30**: 30% agency margin - partner gets 15%, admin gets 15%, client budget is 70%
- **commission_based**: Custom commission rate for partners with non-standard percentages

**Critical Business Rule (2025-11-28):** In 90% of cases, expenses are paid by the partner from client money. Admin's profit (netProfitAdmin) equals their percentage share FIXED - expenses are NOT deducted from admin's profit. Only agency_30 handles expenses differently (from client's 70% budget).

Removed scheme: vika_ie_7 (deprecated 2025-11-28) - Vika Utkina now treated as regular partner.

## Security Architecture

Security is paramount, with XSS protection through input sanitization, React's auto-escaping, and file upload validation. Rate limiting is implemented using a token bucket algorithm. Input validation is handled via Zod schemas on both frontend and backend. Centralized error handling logs critical errors and provides user feedback through toast notifications.

## Performance Optimizations

Optimizations include code splitting for lazy loading, TanStack Query for data caching and efficient fetching, and rendering optimizations such as skeleton components, staggered animations, and debounced inputs. Build optimizations leverage Vite for fast compilation, CSS minification, and tree-shaking.

# External Dependencies

## Primary Services

**Supabase**: PostgreSQL database, Row-Level Security (RLS), Edge Functions, Real-time subscriptions, File storage.

## UI Libraries

**Radix UI**: Headless, accessible UI components (Dialog, Dropdown Menu, Select, etc.).
**shadcn/ui**: Pre-styled component library built on Radix UI.
**Framer Motion**: Animation library for transitions and gestures.
**Recharts**: Charting library for financial visualizations.

## Utility Libraries

**date-fns**: Date manipulation and formatting.
**clsx & tailwind-merge**: Utilities for conditional CSS class management.
**react-hook-form + zod**: Type-safe form handling and validation.
**sonner**: Toast notifications for user feedback.

## Development Tools

**TypeScript**: For type safety.
**ESLint**: Code linting.
**Vite**: Fast build tool.