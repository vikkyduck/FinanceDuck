import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showSuccess } from "@/lib/errorHandler";
import { toast } from "sonner";
import { format } from "date-fns";

interface ExportFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExportFilters {
  date_from?: Date;
  date_to?: Date;
  actual_date_from?: Date;
  actual_date_to?: Date;
  statuses: string[];
  partner_ids: string[];
}

export const ExportFiltersDialog = ({ open, onOpenChange }: ExportFiltersDialogProps) => {
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>({
    statuses: [],
    partner_ids: [],
  });

  // Fetch partners list
  const { data: partners } = useQuery({
    queryKey: ['partners-for-export'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const statusOptions = [
    { value: 'draft', label: 'Черновик' },
    { value: 'sent', label: 'Отправлен' },
    { value: 'paid', label: 'Оплачен' },
    { value: 'cancelled', label: 'Отменен' },
  ];

  const handleStatusToggle = (status: string) => {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
    }));
  };

  const handlePartnerToggle = (partnerId: string) => {
    setFilters(prev => ({
      ...prev,
      partner_ids: prev.partner_ids.includes(partnerId)
        ? prev.partner_ids.filter(id => id !== partnerId)
        : [...prev.partner_ids, partnerId]
    }));
  };

  const handleSelectAllStatuses = () => {
    if (filters.statuses.length === statusOptions.length) {
      setFilters(prev => ({ ...prev, statuses: [] }));
    } else {
      setFilters(prev => ({ ...prev, statuses: statusOptions.map(s => s.value) }));
    }
  };

  const handleSelectAllPartners = () => {
    if (filters.partner_ids.length === (partners?.length || 0)) {
      setFilters(prev => ({ ...prev, partner_ids: [] }));
    } else {
      setFilters(prev => ({ ...prev, partner_ids: partners?.map(p => p.id) || [] }));
    }
  };

  const handleClearFilters = () => {
    setFilters({
      date_from: undefined,
      date_to: undefined,
      actual_date_from: undefined,
      actual_date_to: undefined,
      statuses: [],
      partner_ids: [],
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const session = JSON.parse(sessionStorage.getItem('access_session') || '{}');
      const accessTokenId = session.accessTokenId;

      if (!accessTokenId) {
        toast.error("Ошибка", { description: "Сессия не найдена" });
        return;
      }

      // Prepare filter params, removing empty values
      const filterParams: any = {
        token_id: accessTokenId,
      };

      if (filters.date_from) filterParams.date_from = format(filters.date_from, 'yyyy-MM-dd');
      if (filters.date_to) filterParams.date_to = format(filters.date_to, 'yyyy-MM-dd');
      if (filters.actual_date_from) filterParams.actual_date_from = format(filters.actual_date_from, 'yyyy-MM-dd');
      if (filters.actual_date_to) filterParams.actual_date_to = format(filters.actual_date_to, 'yyyy-MM-dd');
      if (filters.statuses.length > 0) filterParams.statuses = filters.statuses;
      if (filters.partner_ids.length > 0) filterParams.partner_ids = filters.partner_ids;

      console.log('Export with filters:', filterParams);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/export-admin-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify(filterParams),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Получен пустой файл');
      }

      const blob = new Blob([arrayBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate filename with filter info
      const dateStr = new Date().toISOString().split('T')[0];
      const filterStr = filters.statuses.length > 0 || filters.partner_ids.length > 0 
        ? '_filtered' 
        : '';
      a.download = `admin_export${filterStr}_${dateStr}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      showSuccess("Экспорт завершен", "Файл успешно загружен");
      onOpenChange(false);
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error("Ошибка экспорта", {
        description: error?.message || "Не удалось экспортировать данные",
      });
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = 
    filters.date_from || filters.date_to || 
    filters.actual_date_from || filters.actual_date_to ||
    filters.statuses.length > 0 || filters.partner_ids.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Экспорт данных в Excel</DialogTitle>
          <DialogDescription>
            Выберите фильтры для выборочной выгрузки данных. Без фильтров будут выгружены все данные.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Date Filters */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-3 text-foreground/90">
                  Фильтр по запланированной дате оплаты
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">От</Label>
                    <DatePicker
                      date={filters.date_from}
                      onDateChange={(date) => setFilters(prev => ({ ...prev, date_from: date }))}
                      placeholder="Выберите дату"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">До</Label>
                    <DatePicker
                      date={filters.date_to}
                      onDateChange={(date) => setFilters(prev => ({ ...prev, date_to: date }))}
                      placeholder="Выберите дату"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 text-foreground/90">
                  Фильтр по фактической дате оплаты
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">От</Label>
                    <DatePicker
                      date={filters.actual_date_from}
                      onDateChange={(date) => setFilters(prev => ({ ...prev, actual_date_from: date }))}
                      placeholder="Выберите дату"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">До</Label>
                    <DatePicker
                      date={filters.actual_date_to}
                      onDateChange={(date) => setFilters(prev => ({ ...prev, actual_date_to: date }))}
                      placeholder="Выберите дату"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Filters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground/90">Фильтр по статусам</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllStatuses}
                  className="h-8 text-xs"
                >
                  {filters.statuses.length === statusOptions.length ? 'Снять все' : 'Выбрать все'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {statusOptions.map((status) => (
                  <div key={status.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${status.value}`}
                      checked={filters.statuses.includes(status.value)}
                      onCheckedChange={() => handleStatusToggle(status.value)}
                    />
                    <Label
                      htmlFor={`status-${status.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {status.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Partner Filters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground/90">Фильтр по партнерам</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllPartners}
                  className="h-8 text-xs"
                  disabled={!partners || partners.length === 0}
                >
                  {filters.partner_ids.length === (partners?.length || 0) ? 'Снять все' : 'Выбрать все'}
                </Button>
              </div>
              <ScrollArea className="h-48 border rounded-lg p-3">
                <div className="space-y-3">
                  {partners?.map((partner) => (
                    <div key={partner.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`partner-${partner.id}`}
                        checked={filters.partner_ids.includes(partner.id)}
                        onCheckedChange={() => handlePartnerToggle(partner.id)}
                      />
                      <Label
                        htmlFor={`partner-${partner.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {partner.name}
                      </Label>
                    </div>
                  ))}
                  {(!partners || partners.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Нет партнеров
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters || exporting}
            size="sm"
          >
            <X className="h-4 w-4 mr-2" />
            Сбросить фильтры
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={exporting}
            >
              Отмена
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="min-w-[140px]"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Экспорт...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Экспортировать
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};