import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { toast } from "sonner";
import { ClientsTableSkeleton } from "../InvoicesSkeleton";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService, ClientListItem } from "@/lib/services/invoices";

interface ManageClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManageClientsDialog = ({ open, onOpenChange }: ManageClientsDialogProps) => {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(clients.length, 40);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const data = await invoiceService.fetchClients();
      setClients(data);
    } catch (error: any) {
      console.error("Error fetching clients:", error);
      toast.error("Не удалось загрузить клиентов");
    } finally {
      setFetchingData(false);
    }
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!name.trim()) {
      handleValidationError("Форма", "Введите название клиента");
      return;
    }

    setLoading(true);
    try {
      const { clientSchema } = await import('@/lib/validationSchemas');
      const validated = clientSchema.parse({ 
        name, 
        telegram: "", 
        phone: "", 
        partnerIds: [] 
      });

      await invoiceService.createClient(validated.name);
      showSuccess("Успешно", "Клиент добавлен");
      setName("");
      fetchData();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        handleValidationError("Форма", error.errors[0]?.message || 'Ошибка валидации данных');
      } else {
        toast.error(error.message || "Не удалось добавить клиента");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Управление клиентами</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Добавить клиента</h3>
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ООО Клиент"
                  data-testid="input-client-name"
                />
              </div>
              <Button onClick={handleAdd} disabled={loading} data-testid="button-add-client">
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
            <h3 className="font-medium">Существующие клиенты</h3>
            {fetchingData ? (
              <ClientsTableSkeleton />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground py-8">
                          Нет клиентов
                        </TableCell>
                      </TableRow>
                    ) : (
                      clients.map((client, index) => (
                        <TableRow 
                          key={client.id} 
                          ref={setRef(index)}
                          className="table-row-hover group"
                          data-testid={`row-client-${client.id}`}
                        >
                          <TableCell className="font-medium table-cell-highlight">
                            {client.name}
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
