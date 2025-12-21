import { Button } from "@/components/ui/button";
import { Plus, Download, Building, Users, Key } from "lucide-react";
import { RecalculateInvoicesButton } from "./RecalculateInvoicesButton";

interface AdminActionBarProps {
  onCreateInvoice: () => void;
  onExport: () => void;
  onManagePartners: () => void;
  onManageClients: () => void;
  onManageAccessCodes: () => void;
}

export const AdminActionBar = ({
  onCreateInvoice,
  onExport,
  onManagePartners,
  onManageClients,
  onManageAccessCodes,
}: AdminActionBarProps) => {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b py-3 sm:py-4 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-4 sm:mb-6 overflow-x-hidden">
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
          <RecalculateInvoicesButton />
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
