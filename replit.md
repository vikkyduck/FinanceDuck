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

Optimizations include code splitting, TanStack Query for data caching and efficient fetching, and rendering optimizations like skeleton components and debounced inputs. Real-time data synchronization for critical components like signed acts, bonus stats, and payment history is achieved through 30-second polling and visibility-based cache invalidation, automatically refreshing data when the tab regains focus.

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