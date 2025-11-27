import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { toast } from "sonner";
import { PartnersTableSkeleton } from "../InvoicesSkeleton";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService, PartnerListItem } from "@/lib/services/invoices";

interface ManagePartnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManagePartnersDialog = ({ open, onOpenChange }: ManagePartnersDialogProps) => {
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(partners.length, 40);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    if (open) {
      fetchPartners();
    }
  }, [open]);

  const fetchPartners = async () => {
    setFetchingData(true);
    try {
      const data = await invoiceService.fetchPartners();
      setPartners(data);
    } catch (error: any) {
      console.error("Error fetching partners:", error);
      toast.error("Не удалось загрузить партнёров");
    } finally {
      setFetchingData(false);
    }
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!name.trim()) {
      handleValidationError("Форма", "Введите название партнёра");
      return;
    }

    setLoading(true);
    try {
      const { partnerSchema } = await import('@/lib/validationSchemas');
      const validated = partnerSchema.parse({ name, telegram: "", phone: "" });

      await invoiceService.createPartner(validated.name);
      showSuccess("Успешно", "Партнер добавлен");
      setName("");
      fetchPartners();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        handleValidationError("Форма", error.errors[0]?.message || 'Ошибка валидации данных');
      } else {
        toast.error(error.message || "Не удалось добавить партнёра");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Управление партнерами</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Добавить партнера</h3>
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ООО Компания"
                  data-testid="input-partner-name"
                />
              </div>
              <Button onClick={handleAdd} disabled={loading} data-testid="button-add-partner">
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Добавить
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Существующие партнеры</h3>
            {fetchingData ? (
              <PartnersTableSkeleton />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground py-8">
                          Нет партнёров
                        </TableCell>
                      </TableRow>
                    ) : (
                      partners.map((partner, index) => (
                        <TableRow 
                          key={partner.id} 
                          ref={setRef(index)}
                          className="table-row-hover group"
                          data-testid={`row-partner-${partner.id}`}
                        >
                          <TableCell className="font-medium table-cell-highlight">
                            {partner.name}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
