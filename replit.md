# Overview

This project is an invoice management system built with React, TypeScript, and Supabase. It offers role-based dashboards for admins, assistants, partners, and clients to manage invoices, partners, clients, and financial reporting. Key features include secure cookie-based authentication with CSRF protection, real-time updates via Supabase subscriptions, and comprehensive financial calculations for various commission schemes. The system aims to provide a clear overview of financial flows, including a waterfall visualization of fund distribution and a "Do Not Spend" dashboard for tracking project budgets.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with React 18, TypeScript, and Vite, utilizing React Router for navigation and TanStack Query for server state management. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS, and enhanced with Framer Motion for animations. The design adheres to Apple HIG principles, featuring a minimal aesthetic, iOS Blue as the primary color, and an Inter font family with Cyrillic support, all implemented with a mobile-first responsive approach. State management primarily uses React hooks for local state and TanStack Query for remote data.

## Authentication & Authorization

The system employs cookie-based session management with HttpOnly cookies and CSRF protection for secure authentication. It features a robust Role-Based Access Control (RBAC) system with four roles (admin, assistant, partner, client), enforced by Supabase Row-Level Security (RLS) and protected frontend routes. Access codes manage role assignment, and security events are logged for suspicious activities.

## Backend Architecture

Supabase serves as the Backend-as-a-Service, providing a PostgreSQL database with RLS, Edge Functions for authentication, and real-time subscriptions. A custom access code system replaces Supabase's built-in auth. The database schema includes tables for invoices, partners, clients, access tokens, user sessions, expenses, documents, security events, login attempts, partner payments, and assistant bonuses. Database functions (RPCs) handle session management, access code verification, and financial calculations.

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