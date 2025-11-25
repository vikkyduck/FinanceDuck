import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useDebounce } from "use-debounce";

interface Client {
  id: string;
  name: string;
  invoiceCount?: number;
  lastInvoiceDate?: string;
}

interface ClientComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onCreateNew?: () => void;
}

export const ClientCombobox = ({
  value,
  onChange,
  onCreateNew,
}: ClientComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, [debouncedSearch]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("clients")
        .select(
          `
          id,
          name,
          invoices(id, created_at)
        `
        )
        .order("name");

      if (debouncedSearch) {
        query = query.ilike("name", `%${debouncedSearch}%`);
      }

      const { data } = await query;

      const clientsWithStats =
        data?.map((client: any) => ({
          id: client.id,
          name: client.name,
          invoiceCount: client.invoices?.length || 0,
          lastInvoiceDate: client.invoices?.[0]?.created_at,
        })) || [];

      // Группировка по активности
      const active = clientsWithStats.filter(
        (c) =>
          c.lastInvoiceDate &&
          new Date(c.lastInvoiceDate) >
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      );
      const inactive = clientsWithStats.filter(
        (c) =>
          !c.lastInvoiceDate ||
          new Date(c.lastInvoiceDate) <
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      );

      setClients([...active, ...inactive]);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-11"
        >
          {selectedClient ? selectedClient.name : "Выберите клиента..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Поиск клиента..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Загрузка..." : "Клиенты не найдены"}
            </CommandEmpty>
            <CommandGroup>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => {
                    onChange(client.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === client.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {search && (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: client.name.replace(
                                new RegExp(search, "gi"),
                                (match) => `<mark class="bg-primary/20">${match}</mark>`
                              ),
                            }}
                          />
                        )}
                        {!search && client.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {client.invoiceCount} счетов
                        {client.lastInvoiceDate &&
                          ` • ${format(
                            new Date(client.lastInvoiceDate),
                            "d MMM",
                            { locale: ru }
                          )}`}
                      </p>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreateNew && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onCreateNew();
                    setOpen(false);
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Создать нового клиента
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
