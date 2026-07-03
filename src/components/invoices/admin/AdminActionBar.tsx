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
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b py-3 sm:py-4 mb-4 sm:mb-6">
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {/* Primary Actions */}
        <Button onClick={onCreateInvoice} className="shadow-sm">
          <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
          <span className="text-sm sm:text-base">Создать счёт</span>
        </Button>
        
        {/* Secondary Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="default" 
            onClick={onExport}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-sm"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
            <span className="text-sm sm:text-base">Экспорт</span>
          </Button>
          <Button
            variant="outline"
            onClick={onExportMyInvoices}
            disabled={isExportingMyInvoices}
            data-testid="button-export-excel"
          >
            {isExportingMyInvoices ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 animate-spin" /> : <Download className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />}
            <span className="text-sm sm:text-base hidden sm:inline">Выгрузить в Excel</span>
            <span className="text-sm sm:hidden">Excel</span>
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
