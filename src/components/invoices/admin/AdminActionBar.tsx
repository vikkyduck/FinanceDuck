import { Button } from "@/components/ui/button";
import { Plus, Download, Building, Users, Key, Loader2, ArrowLeftRight } from "lucide-react";
import { RecalculateInvoicesButton } from "./RecalculateInvoicesButton";

interface AdminActionBarProps {
  onCreateInvoice: () => void;
  onExport: () => void;
  onExportMyInvoices: () => void;
  isExportingMyInvoices?: boolean;
  onManagePartners: () => void;
  onManageClients: () => void;
  onManageAccessCodes: () => void;
  onTransferFunds?: () => void;
}

export const AdminActionBar = ({
  onCreateInvoice,
  onExport,
  onExportMyInvoices,
  isExportingMyInvoices,
  onManagePartners,
  onManageClients,
  onManageAccessCodes,
  onTransferFunds,
}: AdminActionBarProps) => {
  return (
    // Плотное стекло (брендбук, раздел 7): липкая панель поверх
    // прокручиваемого контента — каноническое место для материала
    <div className="sticky top-0 z-10 bv-glass-panel border-b py-3 sm:py-4 mb-4 sm:mb-6 -mx-3 px-3 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {/* Primary Actions */}
        <Button onClick={onCreateInvoice} className="shadow-sm">
          <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
          <span className="text-sm sm:text-base">Создать счёт</span>
        </Button>
        
        {/* Secondary Actions */}
        <div className="flex flex-wrap gap-2">
          {/* Одна кнопка экспорта вместо двух: диалог покрывает и выбор данных,
              и фильтры. Зелёный градиент убран — в системе такого цвета нет. */}
          <Button
            variant="outline"
            onClick={onExport}
            data-testid="button-export-excel"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
            <span className="text-sm sm:text-base">Экспорт</span>
          </Button>
          <RecalculateInvoicesButton />
          {onTransferFunds && (
            <Button variant="outline" onClick={onTransferFunds} data-testid="button-transfer-funds">
              <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
              <span className="text-sm sm:text-base hidden sm:inline">Перенос средств</span>
              <span className="text-sm sm:hidden">Перенос</span>
            </Button>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
          <Button variant="outline" size="sm" onClick={onManagePartners}>
            <Building className="h-4 w-4 mr-1.5" />
            <span className="text-xs sm:text-sm">Партнёры</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onManageClients}>
            <Users className="h-4 w-4 mr-1.5" />
            <span className="text-xs sm:text-sm">Клиенты</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onManageAccessCodes}>
            <Key className="h-4 w-4 mr-1.5" />
            <span className="text-xs sm:text-sm">Коды</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
