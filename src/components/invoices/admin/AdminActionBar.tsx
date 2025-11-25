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
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b py-4 -mx-6 px-6 mb-6">
      <div className="flex flex-wrap gap-3">
        {/* Primary Actions */}
        <Button size="lg" onClick={onCreateInvoice} className="shadow-sm">
          <Plus className="h-5 w-5 mr-2" />
          Создать счёт
        </Button>
        
        {/* Secondary Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="default" 
            size="lg"
            onClick={onExport}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-sm"
          >
            <Download className="h-5 w-5 mr-2" />
            Экспорт
          </Button>
          <RecalculateInvoicesButton />
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button variant="outline" onClick={onManagePartners}>
            <Building className="h-4 w-4 mr-2" />
            Партнёры
          </Button>
          <Button variant="outline" onClick={onManageClients}>
            <Users className="h-4 w-4 mr-2" />
            Клиенты
          </Button>
          <Button variant="outline" onClick={onManageAccessCodes}>
            <Key className="h-4 w-4 mr-2" />
            Коды
          </Button>
        </div>
      </div>
    </div>
  );
};
