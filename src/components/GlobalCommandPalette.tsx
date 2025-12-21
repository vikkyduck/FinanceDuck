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
import { apiGet } from "@/lib/api";
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
      const searchResults = await apiGet<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
      setResults(searchResults);
    } catch (error) {
      console.error("[GlobalCommandPalette] Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchData(search);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, searchData]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    if (result.url) {
      setLocation(result.url);
    }
  };

  const pages = [
    { title: "Главная", url: "/", icon: Home },
    { title: "Счета", url: "/invoices", icon: FileText },
    { title: "Аналитика", url: "/stats", icon: BarChart3 },
    ...(role === "admin"
      ? [
          { title: "Клиенты", url: "/clients", icon: Users },
          { title: "Партнёры", url: "/partners", icon: Building2 },
          { title: "Коды доступа", url: "/access-codes", icon: Shield },
          { title: "Долг партнёров", url: "/partner-debt", icon: CreditCard },
        ]
      : []),
  ];

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "invoice":
        return FileText;
      case "partner":
        return Building2;
      case "client":
        return Users;
      default:
        return Search;
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
      default:
        return "";
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Поиск счетов, партнёров, клиентов..."
        value={search}
        onValueChange={setSearch}
        data-testid="input-command-search"
      />
      <CommandList>
        <CommandEmpty>
          {loading ? "Поиск..." : "Ничего не найдено."}
        </CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="Результаты поиска">
            {results.map((result) => {
              const Icon = getIcon(result.type);
              return (
                <CommandItem
                  key={result.id}
                  onSelect={() => handleSelect(result)}
                  className="flex items-center gap-3"
                  data-testid={`search-result-${result.id}`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{result.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(result.type)}
                      </Badge>
                    </div>
                    {result.subtitle && (
                      <span className="text-xs text-muted-foreground truncate block">
                        {result.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Страницы">
          {pages.map((page) => (
            <CommandItem
              key={page.url}
              onSelect={() => {
                setOpen(false);
                setLocation(page.url);
              }}
              data-testid={`nav-${page.url.replace("/", "") || "home"}`}
            >
              <page.icon className="mr-2 h-4 w-4" />
              <span>{page.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {(role === "admin" || role === "assistant") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Быстрые действия">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setLocation("/invoices?action=new");
                }}
                data-testid="action-new-invoice"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Создать счёт</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
