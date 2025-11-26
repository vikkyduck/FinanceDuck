import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  FileText, 
  Users, 
  Building2, 
  BarChart3, 
  Shield, 
  CreditCard,
  Plus,
  Search,
  Home,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  id: string;
  type: "invoice" | "partner" | "client" | "page";
  title: string;
  subtitle?: string;
  url?: string;
}

export function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { role } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const searchData = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const searchResults: SearchResult[] = [];

      if (role === "admin" || role === "assistant") {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, clients(name), partners(name)")
          .ilike("invoice_number", `%${query}%`)
          .limit(5);

        if (invoices) {
          invoices.forEach((inv: any) => {
            searchResults.push({
              id: inv.id,
              type: "invoice",
              title: inv.invoice_number || `Счёт ${inv.id.slice(0, 8)}`,
              subtitle: `${inv.clients?.name || "Клиент"} • ${inv.partners?.name || "Партнёр"}`,
              url: `/invoices?invoice=${inv.id}`,
            });
          });
        }

        const { data: partners } = await supabase
          .from("partners")
          .select("id, name")
          .ilike("name", `%${query}%`)
          .limit(5);

        if (partners) {
          partners.forEach((p: any) => {
            searchResults.push({
              id: p.id,
              type: "partner",
              title: p.name,
              url: "/partners",
            });
          });
        }

        const { data: clients } = await supabase
          .from("clients")
          .select("id, name")
          .ilike("name", `%${query}%`)
          .limit(5);

        if (clients) {
          clients.forEach((c: any) => {
            searchResults.push({
              id: c.id,
              type: "client",
              title: c.name,
              url: "/clients",
            });
          });
        }
      }

      setResults(searchResults);
    } catch (error) {
      console.error("[GlobalCommandPalette] Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchData(search);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, searchData]);

  const pages: SearchResult[] = [
    { id: "home", type: "page", title: "Главная", url: "/" },
    { id: "invoices", type: "page", title: "Счета", url: "/invoices" },
  ];

  if (role === "admin") {
    pages.push(
      { id: "partners", type: "page", title: "Партнёры", url: "/partners" },
      { id: "clients", type: "page", title: "Клиенты", url: "/clients" },
      { id: "stats", type: "page", title: "Аналитика", url: "/stats" },
      { id: "security", type: "page", title: "Безопасность", url: "/security" },
      { id: "partner-debt", type: "page", title: "Долги партнёров", url: "/partner-debt" },
    );
  }

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setSearch("");
    
    if (result.url) {
      setLocation(result.url);
    }
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "invoice":
        return <FileText className="h-4 w-4" />;
      case "partner":
        return <Building2 className="h-4 w-4" />;
      case "client":
        return <Users className="h-4 w-4" />;
      case "page":
        return <Home className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "invoice":
        return "Счёт";
      case "partner":
        return "Партнёр";
      case "client":
        return "Клиент";
      case "page":
        return "Страница";
      default:
        return "";
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput 
        placeholder="Поиск по счетам, партнёрам, клиентам..." 
        value={search}
        onValueChange={setSearch}
        data-testid="input-command-search"
      />
      <CommandList>
        <CommandEmpty>
          {loading ? "Поиск..." : "Ничего не найдено"}
        </CommandEmpty>

        {!search && (
          <CommandGroup heading="Страницы">
            {pages.map((page) => (
              <CommandItem
                key={page.id}
                onSelect={() => handleSelect(page)}
                data-testid={`command-item-${page.id}`}
              >
                {getIcon(page.type)}
                <span className="ml-2">{page.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Результаты поиска">
              {results.map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => handleSelect(result)}
                  data-testid={`command-result-${result.type}-${result.id}`}
                >
                  {getIcon(result.type)}
                  <div className="ml-2 flex-1">
                    <span>{result.title}</span>
                    {result.subtitle && (
                      <span className="text-muted-foreground text-xs ml-2">
                        {result.subtitle}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(result.type)}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {(role === "admin" || role === "assistant") && !search && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Быстрые действия">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("open-create-invoice"));
                }}
                data-testid="command-action-create-invoice"
              >
                <Plus className="h-4 w-4" />
                <span className="ml-2">Создать счёт</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
