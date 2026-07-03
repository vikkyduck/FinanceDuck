import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, MessageSquare, Users, Building2, X, Loader2, AlertTriangle, Clock, Plus, Home, BarChart3, Wallet } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

interface SearchResult {
  id: string;
  type: "invoice" | "partner" | "client" | "thread" | "expense";
  title: string;
  subtitle?: string;
  url?: string;
  score?: number;
}

interface QuickAction {
  id: string;
  label: string;
  icon: typeof FileText;
  url: string;
  hint?: string;
}

const TYPE_ICON: Record<SearchResult["type"], typeof FileText> = {
  invoice: FileText,
  thread: MessageSquare,
  client: Users,
  partner: Building2,
  expense: Wallet,
};

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  invoice: "Счёт",
  thread: "Тред",
  client: "Клиент",
  partner: "Партнёр",
  expense: "Затрата",
};

/**
 * Постоянная строка поиска в шапке. Видна на всех страницах, кроме /auth.
 *
 * Поведение:
 * - Клик/Фокус → раскрывается popover с результатами.
 * - Печать → debounced search (250 ms), pg_trgm-fuzzy, опечатки прощаются.
 * - ↑/↓ навигация, Enter — переход.
 * - Esc — закрывает.
 * - Click outside — закрывает.
 * - ⌘K / Ctrl+K — фокусирует это поле (а не открывает отдельную палитру).
 */
export function TopSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { role } = useAuth();

  // Быстрые действия и навигация. Показываются, когда строка поиска
  // открыта и пуста — это «вход» в систему. Список зависит от роли.
  const quickActions: QuickAction[] = (() => {
    const a: QuickAction[] = [];
    if (role === "admin" || role === "assistant") {
      a.push({ id: "qa-overdue",  label: "Только просроченные", icon: AlertTriangle, url: "/invoices?statusFilter=overdue", hint: "Фильтр" });
      a.push({ id: "qa-pending",  label: "Ожидают оплаты",      icon: Clock,         url: "/invoices?statusFilter=sent",    hint: "Фильтр" });
      a.push({ id: "qa-new",      label: "Создать счёт",        icon: Plus,          url: "/invoices?action=new",           hint: "Действие" });
    }
    return a;
  })();

  const navItems: QuickAction[] = (() => {
    const n: QuickAction[] = [
      { id: "nav-home",     label: "Главная",   icon: Home,           url: "/" },
      { id: "nav-messages", label: "Сообщения", icon: MessageSquare,  url: "/messages" },
    ];
    if (role !== "client") n.splice(1, 0, { id: "nav-invoices", label: "Счета", icon: FileText, url: "/invoices" });
    if (role === "admin") {
      n.push({ id: "nav-stats",    label: "Аналитика", icon: BarChart3, url: "/stats" });
      n.push({ id: "nav-clients",  label: "Клиенты",   icon: Users,     url: "/clients" });
      n.push({ id: "nav-partners", label: "Партнёры",  icon: Building2, url: "/partners" });
    }
    return n;
  })();

  // Поиск
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data);
      setHighlight(0);
    } catch (e) {
      console.error("[TopSearchBar]", e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => search(query), 250);
    return () => clearTimeout(id);
  }, [query, search]);

  // Глобальные шорткаты — ⌘K / Ctrl+K фокусирует строку.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside — закрываем popover.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (r: SearchResult) => {
    if (r.url) navigate(r.url);
    setOpen(false);
  };

  // Клавиатура в инпуте.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight];
      if (r) go(r);
    }
  };

  // Группировка результатов: счета, треды, затраты, клиенты, партнёры.
  const groups: Array<{ type: SearchResult["type"]; label: string; items: SearchResult[] }> = [
    { type: "invoice", label: "Счета", items: results.filter((r) => r.type === "invoice") },
    { type: "thread", label: "Сообщения", items: results.filter((r) => r.type === "thread") },
    { type: "expense", label: "Затраты", items: results.filter((r) => r.type === "expense") },
    { type: "client", label: "Клиенты", items: results.filter((r) => r.type === "client") },
    { type: "partner", label: "Партнёры", items: results.filter((r) => r.type === "partner") },
  ].filter((g) => g.items.length > 0);

  const flatItems = groups.flatMap((g) => g.items);

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск"
          className="w-full h-10 sm:h-9 pl-9 pr-10 rounded-md border bg-background text-base sm:text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-shadow placeholder:text-muted-foreground"
          aria-label="Глобальный поиск"
          data-testid="top-search-input"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/40 rounded-full"
            aria-label="Очистить"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        ) : (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center justify-center h-5 px-1.5 rounded border bg-muted/40 text-[10px] text-muted-foreground font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <>
          {/* Backdrop: только на мобильном, мягко затемняет фон и снимает фокус по тапу. */}
          <div
            className="fixed inset-0 top-12 bg-black/20 z-40 sm:hidden"
            onClick={() => { setOpen(false); inputRef.current?.blur(); }}
            aria-hidden
          />
          <div
            className="fixed sm:absolute left-0 right-0 top-12 sm:top-auto sm:mt-1 max-h-[calc(100vh-3rem)] sm:max-h-[60vh] overflow-y-auto border-t sm:border bg-popover sm:rounded-md sm:shadow-lg z-50"
            role="listbox"
            data-testid="top-search-results"
          >
          {/* Пустой запрос — показываем «быстрые действия» и навигацию. */}
          {!query.trim() ? (
            <>
              {quickActions.length > 0 && (
                <div>
                  <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                    Быстрые действия
                  </div>
                  {quickActions.map((qa) => (
                    <button
                      key={qa.id}
                      type="button"
                      onClick={() => { navigate(qa.url); setOpen(false); }}
                      className="w-full text-left flex items-center gap-3 px-3 py-3 sm:py-2 active:bg-accent hover:bg-accent/50 min-h-[44px] sm:min-h-0"
                      data-testid={`top-${qa.id}`}
                    >
                      <qa.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{qa.label}</span>
                      {qa.hint && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{qa.hint}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                  Навигация
                </div>
                {navItems.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { navigate(n.url); setOpen(false); }}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-accent/50"
                    data-testid={`top-${n.id}`}
                  >
                    <n.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate">{n.label}</span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                Введи фразу, номер или часть имени — поиск стерпит опечатки.
              </div>
            </>
          ) : !loading && flatItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ничего не нашлось. Попробуй другую фразу — поиск понимает опечатки.
            </div>
          ) : (
            (() => {
              let i = -1;
              return groups.map((g) => (
                <div key={g.type}>
                  <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                    {g.label}
                  </div>
                  {g.items.map((r) => {
                    i++;
                    const idx = i;
                    const Icon = TYPE_ICON[r.type];
                    const isHi = idx === highlight;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={isHi}
                        onClick={() => go(r)}
                        onMouseEnter={() => setHighlight(idx)}
                        className={`w-full text-left flex items-start gap-3 px-3 py-3 sm:py-2 min-h-[48px] sm:min-h-0 ${
                          isHi ? "bg-accent" : "active:bg-accent hover:bg-accent/50"
                        }`}
                        data-testid={`top-search-result-${r.id}`}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{r.title}</div>
                          {r.subtitle && (
                            <div className="text-xs text-muted-foreground truncate">
                              {r.type === "thread" ? `«${r.subtitle}»` : r.subtitle}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{TYPE_LABEL[r.type]}</Badge>
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
          </div>
        </>
      )}
    </div>
  );
}
