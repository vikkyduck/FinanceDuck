import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { invoiceService, ClientListItem } from "@/lib/services/invoices";
import { useDebounce } from "use-debounce";
import { HighlightMatch } from "@/components/ui/highlight-match";

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
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const data = await invoiceService.fetchClients();
      setClients(data);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = debouncedSearch
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : clients;

  const selectedClient = clients.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-11"
          data-testid="combobox-client"
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
            data-testid="input-search-client"
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Загрузка..." : "Клиенты не найдены"}
            </CommandEmpty>
            <CommandGroup>
              {filteredClients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => {
                    onChange(client.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                  data-testid={`item-client-${client.id}`}
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
                        <HighlightMatch text={client.name} query={search} />
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
                  data-testid="button-create-new-client"
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
