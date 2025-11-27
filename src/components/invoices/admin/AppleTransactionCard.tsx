import { formatCurrency, getSchemeLabel, calculateInvoice } from "@/lib/invoiceCalculations";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AppleTransactionCardProps {
  invoice: any;
  onViewDetails?: (id: string) => void;
}

const statusConfig = {
  paid: { 
    bg: "rgba(52, 199, 89, 0.1)", 
    text: "#34C759", 
    label: "Оплачено" 
  },
  sent: { 
    bg: "rgba(255, 149, 0, 0.1)", 
    text: "#FF9500", 
    label: "В работе" 
  },
  draft: { 
    bg: "rgba(142, 142, 147, 0.1)", 
    text: "#8E8E93", 
    label: "Черновик" 
  },
  overdue: { 
    bg: "rgba(255, 59, 48, 0.1)", 
    text: "#FF3B30", 
    label: "Просрочен" 
  },
};

export const AppleTransactionCard = ({ invoice, onViewDetails }: AppleTransactionCardProps) => {
  const scheme = invoice.scheme as 'agency_30' | 'commission_based';
  const clientBill = invoice.client_bill ?? 0;
  const executorExpensesTotal = invoice.executor_expenses_total ?? 0;
  const commissionRate = invoice.partner_commission_rate ?? invoice.commission_rate ?? undefined;
  const calc = calculateInvoice(scheme, clientBill, commissionRate, executorExpensesTotal);
  
  const netProfit = invoice.net_profit ?? calc.net_profit_admin ?? 0;
  const status = statusConfig[invoice.status as keyof typeof statusConfig] || statusConfig.draft;
  const clientName = invoice.clients?.name || invoice.client_name || "—";
  const invoiceDate = invoice.created_at || invoice.invoice_date;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onViewDetails?.(invoice.id);
    }
  };

  return (
    <div 
      className={cn(
        "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
        "rounded-xl p-5 shadow-standard",
        "hover:shadow-elevated transition-all duration-200",
        "cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
      onClick={() => onViewDetails?.(invoice.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Просмотр транзакции ${clientName}`}
      data-testid={`transaction-card-${invoice.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div 
            className="text-[17px] font-semibold text-foreground mb-1 truncate"
            style={{ letterSpacing: "-0.2px" }}
          >
            {clientName}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {invoiceDate 
              ? format(new Date(invoiceDate), "d MMMM yyyy", { locale: ru })
              : "—"
            }
          </div>
        </div>
        
        <div 
          className="shrink-0 px-3 py-1 rounded-full text-[13px] font-semibold whitespace-nowrap"
          style={{ 
            backgroundColor: status.bg, 
            color: status.text 
          }}
        >
          {status.label}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center text-[15px]">
          <span className="text-muted-foreground">Сумма клиента</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(clientBill)}
          </span>
        </div>
        
        {executorExpensesTotal > 0 && (
          <div className="flex justify-between items-center text-[15px]">
            <span className="text-muted-foreground">Расход на исполнителя</span>
            <span className="font-semibold" style={{ color: "#FF3B30" }}>
              {formatCurrency(executorExpensesTotal)}
            </span>
          </div>
        )}
        
        <div className="flex justify-between items-center text-[15px]">
          <span className="text-muted-foreground">Чистая прибыль</span>
          <span className="font-semibold" style={{ color: "#34C759" }}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>
      
      <div 
        className="mt-4 pt-4 border-t border-black/[0.06] dark:border-white/[0.06] text-[13px] text-muted-foreground"
      >
        {getSchemeLabel(scheme, 'admin', commissionRate)}
      </div>
    </div>
  );
};
