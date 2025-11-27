# Overview

This is an invoice management system built with React, TypeScript, and Supabase. The application provides role-based dashboards for managing invoices, partners, clients, and financial reporting. It features secure cookie-based authentication with CSRF protection, real-time updates via Supabase subscriptions, and comprehensive financial calculations for different commission schemes.

The system supports four user roles (admin, assistant, partner, client) with distinct permissions and dashboards tailored to each role's needs. It includes features like invoice tracking, payment monitoring, financial analytics, and security event logging.

# Recent Changes (November 2025)

## New Features Implemented

1. **Waterfall Visualization** (`InvoiceWaterfallChart.tsx`)
   - Cascading money distribution chart showing how funds flow through transactions
   - Shows: Client Bill → Partner Share → Admin Share → Expenses → Net Profit → Cat/Admin 50/50 split
   - Running total correctly terminates at zero when cat-share is enabled

2. **Cat Share Badge** (`CatShareBadge.tsx`)
   - Displays 50% "Доля Кота" badge with amount
   - Only visible to admin role
   - Integrated into InvoiceDetailsDialog

3. **Partner Virtual Statement** (`PartnerVirtualStatement.tsx`)
   - Simplified ledger view for partners
   - Period filters (week, month, quarter, all)
   - Shows running balance of transactions

4. **Global Command Palette** (`GlobalCommandPalette.tsx`)
   - Smart search with ⌘K / Ctrl+K keyboard shortcut
   - Searches invoices, partners, clients based on role
   - Uses Wouter for navigation

5. **Floating Action Button** (`FloatingActionButton.tsx`)
   - Quick actions based on user role
   - Admin: Create invoice, record payment
   - Integrated into admin dashboard

6. **Partner Debt Drill-Down** (`PartnerInvoicesDetail.tsx`)
   - Expandable partner rows in PartnerPaymentsManager
   - Shows individual invoices with remaining debt
   - Allows attaching payments to specific invoices
   - Filters by `remaining > 0` to show only outstanding debts

## Removed Features (November 2025)

1. **Payment Timeline (PaymentTimeline.tsx)** - Removed from admin dashboard
2. **Reconciliation Dashboard (ReconciliationDashboard.tsx)** - Removed from admin dashboard

7. **Do Not Spend Dashboard** (`DoNotSpendDashboard.tsx`)
   - Tracks client remaining funds (70% - expenses) for Agency 30% projects
   - Real-time updates via invoice_expenses subscription
   - Shows per-invoice breakdown with expenses and remaining amounts
   - Visible to admin (all invoices) and partners (only their invoices)

## Database Fixes (November 2025)

1. **Fixed Missing invoice_calculations Data** (`20251127151831_fix_missing_invoice_calculations.sql`)
   - Added `client_bill` column to `invoices` table as backup source of truth
   - Updated `recalculate_all_invoices` to create missing rows via INSERT/UPDATE
   - Updated `get_invoices_for_user` to fallback to `invoices.client_bill`
   - Updated `create_invoice_with_context` to always save to both tables
   - Added admin UI to manually edit `client_bill` for existing invoices

## Key Technical Decisions

- **Partner debt formulas** (scheme-specific):
  - Partner Agreement (commission_based): `debt = clientBill - partnerCommission - executorExpenses`
  - Agency 30%: `debt = clientBill * 0.15` (admin's 15% share from 30% margin)
    - Structure: 100% client money = 70% project budget + 30% agency margin
    - 30% margin split 50/50: 15% partner keeps + 15% partner owes to admin
    - "Do Not Spend" = 70% project budget - executor expenses
- **Centralized calculation**: `calculatePartnerDebt()` and `calculateInvoice()` functions in `invoiceCalculations.ts` prevent formula drift across components
- **Commission fallback**: Always derive commissionAmount from calculateInvoice result when invoice.commission_amount is null
- **Partner-facing components updated**: PartnerCommissionReport, PartnerAgency30Report, PartnerVirtualStatement all use centralized calculation
- **Real-time expense updates**: All debt components subscribe to invoice_expenses for instant recalculation
- **Terminology**: Use "приход" (not "платёж/выплату") for partner payments to admin
- **Design**: Apple HIG principles - simplicity, clarity, minimal text, intuitive icons
- **Assistant visibility**: Assistant role cannot see commission percentages, partner/admin shares, or profit analytics

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework & Tooling**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool with SWC for fast compilation
- React Router for client-side routing with protected routes
- TanStack Query for server state management and caching

**UI Framework**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui component library built on Radix UI
- Tailwind CSS for utility-first styling with custom design tokens
- Framer Motion for declarative animations and page transitions

**State Management**
- React hooks for local component state
- TanStack Query for remote data fetching and caching
- localStorage for persisting user preferences (view modes, collapsed sections)
- Custom hooks for shared logic (useAuth, useUserRole, useViewMode, etc.)

**Design System**
- Apple HIG-inspired minimal design with iOS Blue as primary color
- HSL color system defined in CSS variables for easy theming
- Inter font family with cyrillic support
- Responsive design with mobile-first approach

## Authentication & Authorization

**Cookie-Based Session Management**
- HttpOnly cookies for session IDs (prevents XSS attacks)
- CSRF tokens stored in localStorage for state-changing operations
- Session validation via Supabase Edge Functions
- Automatic session refresh on user activity (30-minute sliding window)
- Rate limiting on login attempts (5 attempts before temporary account lock)

**Role-Based Access Control (RBAC)**
- Four roles: admin, assistant, partner, client
- Access codes mapped to specific roles and entities (partners/clients)
- Row-Level Security (RLS) policies in Supabase enforce data access
- Protected routes on frontend redirect unauthorized users

**Session Security Features**
- Session context set in database before each query
- CSRF validation on all state-changing operations
- Security event logging for failed logins and suspicious activity
- Automatic session cleanup after 7 days of inactivity

## Backend Architecture

**Supabase as Backend-as-a-Service**
- PostgreSQL database with Row-Level Security (RLS)
- Edge Functions for authentication endpoints (auth-login, auth-logout, auth-validate, auth-refresh)
- Real-time subscriptions for live data updates
- Built-in auth system not used; custom access code system implemented instead

**Database Schema**
- `invoices`: Core invoice records with status tracking
- `partners`: Partner entities with contact information
- `clients`: Client entities with partner associations
- `access_tokens`: Access codes for authentication
- `user_sessions`: Server-side session storage with CSRF tokens
- `invoice_expenses`: Expense line items per invoice
- `invoice_documents`: File uploads associated with invoices
- `security_events`: Audit log for security-related events
- `login_attempts`: Tracking failed/successful login attempts
- `partner_payments`: Payment records from admin to partners
- `assistant_bonuses`: Bonus calculations for assistant role

**Database Functions (RPC)**
- Session management: `create_session`, `validate_session`, `refresh_session`, `revoke_session`
- Access code verification: `verify_access_code` (handles rate limiting and account locking)
- Financial calculations embedded in views and materialized aggregations

## Data Flow

**Invoice Management Flow**
1. Assistant creates invoice via `CreateInvoiceDialog`
2. Data sanitized on frontend (XSS protection)
3. Session context validated before database insert
4. Invoice stored with status='draft'
5. Real-time subscription notifies other connected clients
6. Admin reviews and marks as 'sent' or 'paid'
7. Financial calculations update automatically via database triggers

**Authentication Flow**
1. User enters access code on `/auth` page
2. Code sent to `auth-login` Edge Function
3. Function calls `verify_access_code` RPC (validates code, checks rate limits)
4. On success, creates session in `user_sessions` table
5. Returns session cookie (HttpOnly) + CSRF token to client
6. Client stores CSRF token in localStorage
7. All subsequent requests include session cookie + CSRF token for validation

**Real-time Updates**
- `useRealtimeSubscription` hook wraps Supabase realtime channels
- Subscriptions filter by table, schema, and optional row filters
- Callbacks trigger data refetch when changes detected
- Used for invoices, expenses, payments, security events

## Financial Calculation Engine

**Two Commission Schemes**
1. **Agency 30% Margin**: Fixed 30% agency fee split between partner (15%) and admin (15%)
2. **Commission-Based**: Variable commission rate negotiated per partner

**Calculation Functions**
- `calculateInvoice()`: Pure function computing all financial metrics
- Inputs: scheme, client bill, commission rate, executor expenses
- Outputs: partner share, admin share, client remaining budget, net profit
- Calculations cached and stored in `invoice_calculations` view

**Financial Reports**
- Monthly revenue forecasts with trend analysis
- Partner performance tracking with LTV calculations
- Cash flow projections based on payment timelines
- Client budget utilization dashboards

## Security Architecture

**XSS Protection**
- All user inputs sanitized via `lib/sanitize.ts` utilities
- React auto-escapes JSX content
- File uploads validated for type and size
- `dangerouslySetInnerHTML` never used

**Rate Limiting**
- Token bucket algorithm implemented in `lib/rateLimiter.ts`
- Different limits for API calls, form submissions, search queries
- Rate limit state stored in-memory (Map)
- Violations logged to `security_events` table

**Input Validation**
- Zod schemas defined in `lib/validationSchemas.ts`
- Frontend validation before API calls
- Backend validation in RLS policies and database constraints
- UUIDs validated before use in queries

**Error Handling**
- Centralized error handler in `lib/errorHandler.ts`
- Supabase errors mapped to user-friendly messages
- Security events logged for critical errors
- Toast notifications for user feedback

## Performance Optimizations

**Code Splitting**
- Lazy loading for heavy chart components (`StatsPageLazy.tsx`)
- Route-based code splitting via React Router
- Manual chunks for vendor libraries and UI components in Vite config

**Data Fetching**
- TanStack Query caches server data with configurable stale times
- Realtime subscriptions only enabled when needed
- Pagination and filtering on database level
- `ensureSessionContext()` helper prevents redundant session validations

**Rendering Optimizations**
- Skeleton components for loading states
- Staggered animations with `useStaggerAnimation` hook
- Debounced search inputs
- Memoized calculations in invoice list components

**Build Optimizations**
- Vite build targets modern browsers (es2020, edge88, firefox78, chrome87, safari14)
- CSS minification enabled
- Tree-shaking for unused code
- Vendor chunk separation

# External Dependencies

## Primary Services

**Supabase** (Backend-as-a-Service)
- PostgreSQL database hosting
- Row-Level Security (RLS) for data access control
- Edge Functions for serverless authentication endpoints
- Real-time subscriptions via WebSocket
- File storage for invoice document uploads
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## UI Libraries

**Radix UI** - Headless accessible components
- Dialog, Dropdown Menu, Select, Popover, Tooltip, Tabs, and more
- Provides accessible primitives without styling

**shadcn/ui** - Pre-styled component library built on Radix UI
- Configured via `components.json`
- Components copied to `src/components/ui/`

**Framer Motion** - Animation library
- Page transitions
- Stagger animations for lists
- Gesture animations (swipe to delete)

**Recharts** - Charting library
- Financial charts (bar, line, pie charts)
- Monthly sales visualizations
- Revenue forecasts

## Utility Libraries

**date-fns** - Date manipulation and formatting
- Used for invoice date calculations
- Locale support for Russian (ru)

**clsx & tailwind-merge** - Class name utilities
- Combined in `cn()` helper function
- Used throughout for conditional styling

**react-hook-form + zod** - Form validation
- Type-safe form handling
- Schema validation with Zod

**sonner** - Toast notifications
- Used alongside shadcn/ui toast component
- Provides success/error feedback to users

## Development Tools

**TypeScript** - Type safety
- Strict mode disabled for rapid development
- Type definitions from Supabase auto-generated

**ESLint** - Linting
- React hooks rules enforced
- TypeScript ESLint integration

**Vite** - Build tool
- Fast HMR during development
- Optimized production builds

**Lovable Tagger** - Development mode component tagging
- Only runs in development mode
- Helps with debugging