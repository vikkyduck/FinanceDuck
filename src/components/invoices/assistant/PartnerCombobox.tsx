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
import { invoiceService, PartnerListItem } from "@/lib/services/invoices";
import { useDebounce } from "use-debounce";
import { HighlightMatch } from "@/components/ui/highlight-match";

interface PartnerComboboxProps {
  value: string;
  onChange: (value: string) => void;
  clientId?: string;
  onCreateNew?: () => void;
}

export const PartnerCombobox = ({
  value,
  onChange,
  clientId,
  onCreateNew,
}: PartnerComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clientId) {
      fetchPartners();
    }
  }, [clientId]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const data = await invoiceService.fetchPartners();
      setPartners(data);
    } catch (error) {
      console.error("Error fetching partners:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPartners = debouncedSearch
    ? partners.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : partners;

  const selectedPartner = partners.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-11"
          disabled={!clientId}
          data-testid="combobox-partner"
        >
          {selectedPartner ? selectedPartner.name : "Выберите партнера..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Поиск партнера..."
            value={search}
            onValueChange={setSearch}
            data-testid="input-search-partner"
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Загрузка..." : "Партнеры не найдены"}
            </CommandEmpty>
            <CommandGroup>
              {filteredPartners.map((partner) => (
                <CommandItem
                  key={partner.id}
                  value={partner.id}
                  onSelect={() => {
                    onChange(partner.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                  data-testid={`item-partner-${partner.id}`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === partner.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        <HighlightMatch text={partner.name} query={search} />
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
                  data-testid="button-create-new-partner"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Создать нового партнера
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
