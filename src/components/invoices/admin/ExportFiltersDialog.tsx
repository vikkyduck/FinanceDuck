import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, X, FileSpreadsheet, Users, Building2, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiGet } from "@/lib/api";

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
  export_types: string[];
}

const exportTypeOptions = [
  { value: 'invoices', label: 'Счета', icon: Receipt, description: 'Все счета с расчётами' },
  { value: 'clients', label: 'Клиенты', icon: Users, description: 'Список клиентов' },
  { value: 'partners', label: 'Партнёры', icon: Building2, description: 'Список партнёров' },
  { value: 'expenses', label: 'Расходы', icon: FileSpreadsheet, description: 'Все расходы по счетам' },
];

export const ExportFiltersDialog = ({ open, onOpenChange }: ExportFiltersDialogProps) => {
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>({
    statuses: [],
    partner_ids: [],
    export_types: ['invoices'],
  });

  const { data: partners, isLoading: loadingPartners, error: partnersError } = useQuery<Array<{id: string, name: string}>>({
    queryKey: ['/api/partners'],
    queryFn: () => apiGet("/partners"),
    enabled: open,
    retry: 2,
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

  const handleExportTypeToggle = (exportType: string) => {
    setFilters(prev => ({
      ...prev,
      export_types: prev.export_types.includes(exportType)
        ? prev.export_types.filter(t => t !== exportType)
        : [...prev.export_types, exportType]
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

  const handleSelectAllTypes = () => {
    if (filters.export_types.length === exportTypeOptions.length) {
      setFilters(prev => ({ ...prev, export_types: [] }));
    } else {
      setFilters(prev => ({ ...prev, export_types: exportTypeOptions.map(t => t.value) }));
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
      export_types: ['invoices'],
    });
  };

  const handleExport = async () => {
    if (filters.export_types.length === 0) {
      toast.error("Выберите данные для экспорта", {
        description: "Необходимо выбрать хотя бы один тип данных",
      });
      return;
    }

    setExporting(true);
    try {
      const requestBody: Record<string, unknown> = {
        exportTypes: filters.export_types,
      };

      if (filters.date_from) requestBody.dateFrom = format(filters.date_from, 'yyyy-MM-dd');
      if (filters.date_to) requestBody.dateTo = format(filters.date_to, 'yyyy-MM-dd');
      if (filters.actual_date_from) requestBody.actualDateFrom = format(filters.actual_date_from, 'yyyy-MM-dd');
      if (filters.actual_date_to) requestBody.actualDateTo = format(filters.actual_date_to, 'yyyy-MM-dd');
      if (filters.statuses.length > 0) requestBody.statuses = filters.statuses;
      if (filters.partner_ids.length > 0) requestBody.partnerIds = filters.partner_ids;

      const csrfToken = localStorage.getItem("csrf_token");
      
      const response = await fetch('/api/admin/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
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
      
      const dateStr = new Date().toISOString().split('T')[0];
      const typesStr = filters.export_types.length > 1 ? '_full' : `_${filters.export_types[0]}`;
      const filterStr = filters.statuses.length > 0 || filters.partner_ids.length > 0 
        ? '_filtered' 
        : '';
      a.download = `export${typesStr}${filterStr}_${dateStr}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      toast.success("Экспорт завершён", {
        description: "Файл успешно загружен",
      });
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Export error:', error);
      toast.error("Ошибка экспорта", {
        description: error instanceof Error ? error.message : "Не удалось экспортировать данные",
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
          <DialogTitle className="text-2xl flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Экспорт данных в Excel
          </DialogTitle>
          <DialogDescription>
            Выберите какие данные экспортировать и примените фильтры при необходимости.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Export Types */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground/90">Данные для экспорта</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllTypes}
                  className="h-8 text-xs"
                  data-testid="button-select-all-types"
                >
                  {filters.export_types.length === exportTypeOptions.length ? 'Снять все' : 'Выбрать все'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {exportTypeOptions.map((type) => {
                  const Icon = type.icon;
                  return (
                    <div 
                      key={type.value} 
                      className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        filters.export_types.includes(type.value) 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => handleExportTypeToggle(type.value)}
                      data-testid={`checkbox-export-${type.value}`}
                    >
                      <Checkbox
                        id={`export-${type.value}`}
                        checked={filters.export_types.includes(type.value)}
                        onCheckedChange={() => handleExportTypeToggle(type.value)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <Label
                            htmlFor={`export-${type.value}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {type.label}
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {type.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Date Filters - only show if invoices selected */}
            {filters.export_types.includes('invoices') && (
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
            )}

            {/* Status Filters - only show if invoices selected */}
            {filters.export_types.includes('invoices') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground/90">Фильтр по статусам</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllStatuses}
                    className="h-8 text-xs"
                    data-testid="button-select-all-statuses"
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
                        data-testid={`checkbox-status-${status.value}`}
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
            )}

            {/* Partner Filters - only show if invoices selected */}
            {filters.export_types.includes('invoices') && (
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
                    data-testid="button-select-all-partners"
                  >
                    {filters.partner_ids.length === (partners?.length || 0) ? 'Снять все' : 'Выбрать все'}
                  </Button>
                </div>
                <ScrollArea className="h-48 border rounded-lg p-3">
                  <div className="space-y-3">
                    {loadingPartners && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Загрузка партнёров...</span>
                      </div>
                    )}
                    {partnersError && (
                      <p className="text-sm text-destructive text-center py-4">
                        Ошибка загрузки партнёров
                      </p>
                    )}
                    {!loadingPartners && !partnersError && partners?.map((partner) => (
                      <div key={partner.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`partner-${partner.id}`}
                          checked={filters.partner_ids.includes(partner.id)}
                          onCheckedChange={() => handlePartnerToggle(partner.id)}
                          data-testid={`checkbox-partner-${partner.id}`}
                        />
                        <Label
                          htmlFor={`partner-${partner.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {partner.name}
                        </Label>
                      </div>
                    ))}
                    {!loadingPartners && !partnersError && (!partners || partners.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Нет партнёров
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters || exporting}
            size="sm"
            data-testid="button-clear-filters"
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
              data-testid="button-cancel-export"
            >
              Отмена
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || filters.export_types.length === 0}
              className="min-w-[140px]"
              data-testid="button-export"
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
