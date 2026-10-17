import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useCookieSession } from "@/hooks/useCookieSession";
import { useApiHealthCheck } from "@/hooks/useApiHealthCheck";
import { ApiStatusBanner } from "@/components/ApiStatusBanner";
import { TopSearchBar } from "@/components/TopSearchBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
const Index = lazy(() => import("./pages/Index"));
const InvoicesDashboard = lazy(() => import("./pages/InvoicesDashboard"));
const InvoicesListPage = lazy(() => import("./pages/InvoicesListPage"));
const InvoicePage = lazy(() => import("./pages/InvoicePage"));
const AccessCodeLogin = lazy(() => import("./pages/AccessCodeLogin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const PartnersPage = lazy(() => import("./pages/PartnersPage"));
const AccessCodesPage = lazy(() => import("./pages/AccessCodesPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const AssistantLogsPage = lazy(() => import("./pages/AssistantLogsPage"));
const AccountingPage = lazy(() => import("./pages/AccountingPage"));
const ClientBalancesPage = lazy(() => import("./pages/ClientBalancesPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthContext } from "@/contexts/auth-context";

// Component that routes "/" based on role
const RoleBasedHome = () => {
  const { role, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Клиенту маркетинговая «Финансовая панель» из Index не подходит —
  // показываем его реальный дашборд (Обзор + Бюджеты + Мои счета).
  if (role === 'partner' || role === 'admin' || role === 'assistant' || role === 'accountant' || role === 'client') {
    return <InvoicesDashboard />;
  }

  return <Index />;
};


const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <PageTransition key={location.pathname}>
      <Suspense fallback={<div role="status" className="p-6 text-muted-foreground">Загрузка…</div>}>
      <Routes location={location}>
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <RoleBasedHome />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/invoices" 
          element={
            <ProtectedRoute>
              <InvoicesListPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/invoices/:id" 
          element={
            <ProtectedRoute>
              <InvoicePage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/clients"
          element={
            <ProtectedRoute>
              <ClientsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/partners" 
          element={
            <ProtectedRoute>
              <PartnersPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/access-codes" 
          element={
            <ProtectedRoute>
              <AccessCodesPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/stats" 
          element={
            <ProtectedRoute>
              <StatsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/assistant-logs" 
          element={
            <ProtectedRoute>
              <AssistantLogsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/accounting" 
          element={
            <ProtectedRoute>
              <AccountingPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/client-balances" 
          element={
            <ProtectedRoute>
              <ClientBalancesPage />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/security"
          element={
            <ProtectedRoute>
              <SecurityPage />
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<AccessCodeLogin />} />
        <Route path="/admin" element={<Navigate to="/invoices" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </PageTransition>
  );
};

const AppContent = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === "/auth";
  const apiHealth = useApiHealthCheck();

  // Enable cookie-based session management for all non-auth pages
  useCookieSession();

  if (isAuthPage) {
    return (
      <>
        <ApiStatusBanner {...apiHealth} />
        <AnimatedRoutes />
      </>
    );
  }

  return (
    <>
      <ApiStatusBanner {...apiHealth} />
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <header className="h-12 border-b border-border bg-background/80 backdrop-blur-xl flex items-center gap-2 sm:gap-3 px-2 sm:px-4 md:px-6 sticky top-0 z-40">
              <SidebarTrigger />
              <div className="flex-1 sm:flex sm:justify-center min-w-0">
                <TopSearchBar />
              </div>
            </header>
            <main className="flex-1">
              <ErrorBoundary>
                <AnimatedRoutes />
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

const App = () => (
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
);

export default App;
