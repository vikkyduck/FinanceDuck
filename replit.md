# Overview

This project is an invoice management system migrating to Replit with a Neon PostgreSQL backend. It provides role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key capabilities include secure cookie-based authentication with CSRF protection, comprehensive financial calculations for various commission schemes, and a clear overview of financial flows, including a waterfall visualization of fund distribution and a "Do Not Spend" dashboard for tracking project budgets. The system aims to streamline invoice management, improve financial transparency, and enhance collaboration among stakeholders.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with React 18, TypeScript, and Vite, utilizing React Router for navigation and TanStack Query for server state management. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS, and enhanced with Framer Motion for animations. The design adheres to Apple HIG principles, featuring a minimal aesthetic, iOS Blue as the primary color, and an Inter font family with Cyrillic support, implemented with a mobile-first responsive approach.

## Backend Architecture

The backend uses an Express.js server with a Neon PostgreSQL database accessed via Drizzle ORM. It employs cookie-based session management with HttpOnly cookies and CSRF protection. A robust Role-Based Access Control (RBAC) system manages four roles: admin, assistant, partner, and client, with strict server-side privacy rules controlling data visibility. The database schema supports invoices, partners, clients, access tokens, user sessions, expenses, documents, partner payments, client-partner relationships, and assistant bonus payments.

## Financial Calculation Engine

The system supports `partner_10`, `partner_15`, `agency_30`, and `commission_based` commission schemes. A core `calculateInvoice()` function computes all financial metrics, distinguishing expenses paid by partners versus admins for net profit calculations. The `agency_30` scheme has a fixed admin share, with expenses deducted from the client's budget. Assistant bonus payouts are based on signed acts. Net profit and unified partner debt tracking (`partnerTransferDue`) are consistently calculated and stored in the `invoice_calculations` table. All roles receive data from this single source of truth, filtered by centralized permission constants.

## Security Architecture

Security is implemented through XSS protection, file upload validation, rate limiting (token bucket algorithm), and Zod schema-based input validation. Authentication uses secure cookie-based sessions with CSRF protection and role-based access control.

## Performance Optimizations

Optimizations include code splitting, TanStack Query for data caching, skeleton components, and debounced inputs. Real-time data synchronization uses visibility-aware polling with 120-second intervals that pause when the browser tab is hidden and auto-refresh on tab focus. Centralized error handling with an `ErrorBoundary` is also implemented.

## Key Features

### Unified Assistant Bonus System
Admin and Assistant dashboards share a single API endpoint for bonus calculations based on signed acts. Admin has payout functionality, while Assistant views only.

### Recurring Invoices System
Manages recurring invoice templates, allowing manual creation and backdating of draft invoices. Invoices inherit the `hideFromAssistant` setting from templates. Integrates with Cash Flow forecasting.

### Planned Expenses System
Provides a forecasting system for partner scheme invoices to track planned expenses with statuses (`pending`, `realized`, `cancelled`). Admin-only feature for managing and summarizing planned expenses by partner.

### Excel Export System
Comprehensive data export functionality for invoices, clients, partners, and expenses via an admin-only endpoint, with configurable date ranges, statuses, and partner filters.

# External Dependencies

## Primary Services

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
**exceljs**: For Excel file generation.

## Development Tools

**TypeScript**: For type safety.
**ESLint**: Code linting.
**Vite**: Fast build tool.