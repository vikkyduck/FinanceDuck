import { 
  FileText, 
  Users, 
  Building, 
  Key, 
  BarChart3, 
  LogOut, 
  Shield, 
  Home,
  AlertCircle,
  TrendingDown
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useAlertCounts } from "@/hooks/useAlertCounts";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { Badge } from "./ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useUserRole();
  const { toast } = useToast();
  const alertCounts = useAlertCounts();
  const [isNavigating, setIsNavigating] = useState(false);

  const isCollapsed = state === "collapsed";

  const handleNavigation = useCallback((url: string) => {
    if (isNavigating || location.pathname === url) return;
    
    setIsNavigating(true);
    navigate(url);
    setTimeout(() => setIsNavigating(false), 300);
  }, [isNavigating, location.pathname, navigate]);

  const handleSignOut = useCallback(() => {
    if (isNavigating) return;
    
    sessionStorage.removeItem('access_session');
    toast({
      title: "Выход выполнен",
      description: "Вы успешно вышли из системы",
    });
    navigate("/auth");
  }, [isNavigating, navigate, toast]);

  const getMenuGroups = () => {
    const groups: Array<{
      label: string;
      items: Array<{
        title: string;
        url: string;
        icon: any;
        badge?: number;
        badgeVariant?: "default" | "destructive" | "secondary";
      }>;
    }> = [];

    // Main section - for everyone
    groups.push({
      label: "Главное",
      items: [
        { 
          title: "Главная", 
          url: role === "admin" ? "/invoices" : "/", 
          icon: Home,
          badge: alertCounts.overdueInvoices > 0 ? alertCounts.overdueInvoices : undefined,
          badgeVariant: "destructive" as const
        },
        ...(role !== "admin" ? [{ 
          title: "Счета", 
          url: "/invoices", 
          icon: FileText,
          badge: alertCounts.pendingInvoices > 0 ? alertCounts.pendingInvoices : undefined,
          badgeVariant: "secondary" as const
        }] : []),
        ...(role === "admin" ? [{
          title: "Статистика",
          url: "/stats",
          icon: BarChart3,
        }] : []),
        ...(role === "partner" ? [{
          title: "Задолженность",
          url: "/partner-debt",
          icon: TrendingDown,
        }] : [])
      ]
    });

    // Management section - only for admin/assistant
    if (role === "admin" || role === "assistant") {
      groups.push({
        label: "Управление",
        items: [
          { title: "Клиенты", url: "/clients", icon: Users },
          { title: "Партнёры", url: "/partners", icon: Building },
        ]
      });
    }

    // System section - only for admin
    if (role === "admin") {
      groups.push({
        label: "Система",
        items: [
          { 
            title: "Безопасность", 
            url: "/security", 
            icon: Shield,
            badge: alertCounts.unresolvedSecurityEvents > 0 ? alertCounts.unresolvedSecurityEvents : undefined,
            badgeVariant: "destructive" as const
          },
          { title: "Коды доступа", url: "/access-codes", icon: Key },
        ]
      });
    }

    return groups;
  };

  const menuGroups = getMenuGroups();
  const isActive = (path: string) => location.pathname === path;
  
  const totalAlerts = alertCounts.overdueInvoices + alertCounts.unresolvedSecurityEvents;

  const getRoleLabel = () => {
    const labels = {
      admin: "Администратор",
      assistant: "Ассистент",
      partner: "Партнёр",
      client: "Клиент",
    };
    return labels[role as keyof typeof labels] || "";
  };

  return (
    <Sidebar className={isCollapsed ? "w-16" : "w-60"} collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3">
        {!isCollapsed && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary rounded-lg">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-sm">Invoices</h2>
                <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
              </div>
              {totalAlerts > 0 && (
                <Badge 
                  variant="destructive"
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => handleNavigation('/invoices?alerts=true')}
                >
                  {totalAlerts}
                </Badge>
              )}
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex flex-col items-center">
            <div 
              className="p-1.5 bg-primary rounded-lg relative cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => totalAlerts > 0 && handleNavigation('/invoices?alerts=true')}
            >
              <FileText className="h-4 w-4 text-primary-foreground" />
              {totalAlerts > 0 && (
                <div className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-destructive rounded-full flex items-center justify-center">
                  <span className="text-[9px] text-destructive-foreground font-semibold">
                    {totalAlerts > 9 ? '9+' : totalAlerts}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label} className="mb-1">
            {!isCollapsed && (
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-3 mb-1">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => handleNavigation(item.url)}
                      isActive={isActive(item.url)}
                      disabled={isNavigating}
                      className={`
                        transition-colors duration-fast
                        hover:bg-muted
                        ${isActive(item.url) ? 'bg-primary/10 text-primary' : ''}
                        ${isCollapsed ? 'justify-center' : 'justify-start'}
                      `}
                    >
                      <div className={`flex items-center gap-2 ${isCollapsed ? '' : 'flex-1'}`}>
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span className="flex-1 text-sm">{item.title}</span>}
                        {!isCollapsed && item.badge && item.badge > 0 && (
                          <Badge 
                            variant={item.badgeVariant || "secondary"} 
                            className="text-xs h-5 min-w-[18px] px-1.5"
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </Badge>
                        )}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        <Button
          variant="ghost"
          size={isCollapsed ? "icon" : "default"}
          onClick={handleSignOut}
          className="w-full justify-start"
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span className="ml-2 text-sm">Выход</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
