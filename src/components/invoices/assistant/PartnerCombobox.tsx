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
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useDebounce } from "use-debounce";

interface Partner {
  id: string;
  name: string;
  invoiceCount?: number;
  lastInvoiceDate?: string;
}

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
  const [partners, setPartners] = useState<Partner[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clientId) {
      fetchPartners();
    }
  }, [clientId, debouncedSearch]);

  const fetchPartners = async () => {
    if (!clientId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("client_partners")
        .select(
          `
          partner_id,
          partners(id, name),
          partner:partners(invoices(id, created_at))
        `
        )
        .eq("client_id", clientId);

      const { data } = await query;

      let partnersData =
        data?.map((cp: any) => ({
          id: cp.partners.id,
          name: cp.partners.name,
          invoiceCount: cp.partner?.invoices?.length || 0,
          lastInvoiceDate: cp.partner?.invoices?.[0]?.created_at,
        })) || [];

      if (debouncedSearch) {
        partnersData = partnersData.filter((p: Partner) =>
          p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
      }

      // Группировка по активности
      const active = partnersData.filter(
        (p: Partner) =>
          p.lastInvoiceDate &&
          new Date(p.lastInvoiceDate) >
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      );
      const inactive = partnersData.filter(
        (p: Partner) =>
          !p.lastInvoiceDate ||
          new Date(p.lastInvoiceDate) <
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      );

      setPartners([...active, ...inactive]);
    } catch (error) {
      console.error("Error fetching partners:", error);
    } finally {
      setLoading(false);
    }
  };

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
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Загрузка..." : "Партнеры не найдены"}
            </CommandEmpty>
            <CommandGroup>
              {partners.map((partner) => (
                <CommandItem
                  key={partner.id}
                  value={partner.id}
                  onSelect={() => {
                    onChange(partner.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
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
                        {search && (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: partner.name.replace(
                                new RegExp(search, "gi"),
                                (match) => `<mark class="bg-primary/20">${match}</mark>`
                              ),
                            }}
                          />
                        )}
                        {!search && partner.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {partner.invoiceCount} счетов
                        {partner.lastInvoiceDate &&
                          ` • ${format(
                            new Date(partner.lastInvoiceDate),
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
