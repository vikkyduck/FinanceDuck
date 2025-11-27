# Overview

This project is an invoice management system migrating from Supabase to Replit with Neon PostgreSQL backend. It offers role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key features include secure cookie-based authentication with CSRF protection and comprehensive financial calculations for various commission schemes. The system aims to provide a clear overview of financial flows, including a waterfall visualization of fund distribution and a "Do Not Spend" dashboard for tracking project budgets.

## Migration Status

**Completed migrations (Supabase → invoiceService API):**
- InvoiceDetailsDialog - full invoice view with expenses and documents
- CreateInvoiceDialog - invoice creation with local calculations pre-submit
- AddExpenseDialog / EditExpenseDialog - expense CRUD operations
- ClientCombobox / PartnerCombobox - entity selection with server data
- ManagePartnersDialog / ManageClientsDialog - entity management
- RecordPaymentDialog - partner payment recording with server-side filtering

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

The system supports two primary commission schemes: Agency 30% Margin and Commission-Based, with `calculateInvoice()` as a core pure function for computing all financial metrics. This ensures consistent calculation of partner share, admin share, client remaining budget, and net profit, with results cached in an `invoice_calculations` view.

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