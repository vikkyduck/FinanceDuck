import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useCookieSession } from "@/hooks/useCookieSession";
import { useApiHealthCheck } from "@/hooks/useApiHealthCheck";
import { ApiStatusBanner } from "@/components/ApiStatusBanner";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import InvoicesDashboard from "./pages/InvoicesDashboard";
import AccessCodeLogin from "./pages/AccessCodeLogin";
import NotFound from "./pages/NotFound";
import ClientsPage from "./pages/ClientsPage";
import PartnersPage from "./pages/PartnersPage";
import AccessCodesPage from "./pages/AccessCodesPage";
import StatsPage from "./pages/StatsPage";
import { useAuth } from "@/hooks/useAuth";

// Component that routes "/" based on role
const RoleBasedHome = () => {
  const { role, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  // Partners and Admins go directly to their dashboard
  if (role === 'partner' || role === 'admin' || role === 'assistant') {
    return <InvoicesDashboard />;
  }
  
  // Clients see the general Index page
  return <Index />;
};

const queryClient = new QueryClient();

const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <PageTransition key={location.pathname}>
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
              <InvoicesDashboard />
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
        <Route path="/auth" element={<AccessCodeLogin />} />
        <Route path="/admin" element={<Navigate to="/invoices" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
      <GlobalCommandPalette />
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <header className="h-12 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-6 sticky top-0 z-40">
              <SidebarTrigger />
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
