import { formatCurrency } from "@/lib/invoiceCalculations";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Check, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

interface PartnerDebtSummary {
  partner_id: string;
  partner_name: string;
  total_to_transfer: number;
  total_paid: number;
  remaining: number;
  invoice_count: number;
}

interface PartnerDebtCardProps {
  summary: PartnerDebtSummary;
  onExpand?: () => void;
  isExpanded?: boolean;
  children?: React.ReactNode;
}

export const PartnerDebtCard = ({ 
  summary, 
  onExpand,
  isExpanded = false,
  children
}: PartnerDebtCardProps) => {
  const isPaid = summary.remaining <= 0;
  const hasOverpayment = summary.remaining < 0;
  const paidPercentage = summary.total_to_transfer > 0 
    ? Math.round((summary.total_paid / summary.total_to_transfer) * 100) 
    : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onExpand?.();
    }
  };

  return (
    <div 
      className={cn(
        "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
        "rounded-xl shadow-standard transition-all duration-200",
        isExpanded && "shadow-elevated"
      )}
      data-testid={`partner-debt-card-${summary.partner_id}`}
    >
      <div 
        className={cn(
          "p-4 sm:p-5 cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
        )}
        onClick={onExpand}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`Просмотр долга партнёра ${summary.partner_name}`}
      >
        <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div 
                className="text-sm sm:text-[17px] font-semibold text-foreground truncate"
                style={{ letterSpacing: "-0.2px" }}
              >
                {summary.partner_name}
              </div>
              <div className="text-xs sm:text-[13px] text-muted-foreground">
                {summary.invoice_count} {summary.invoice_count === 1 ? 'счёт' : 
                  summary.invoice_count < 5 ? 'счёта' : 'счетов'}
              </div>
            </div>
          </div>
          
          {isPaid ? (
            <Badge 
              className={cn(
                "shrink-0 gap-1 border-0",
                hasOverpayment 
                  ? "bg-blue-500/10 text-blue-600" 
                  : "bg-green-500/10 text-green-600"
              )}
            >
              <Check className="h-3 w-3" />
              {hasOverpayment ? "Переплата" : "Оплачено"}
            </Badge>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}
        </div>
        
        <div className="space-y-2 sm:space-y-3">
          <div className="flex justify-between items-center text-xs sm:text-[15px] gap-2">
            <span className="text-muted-foreground">Общий долг</span>
            <span className="font-semibold text-foreground break-words text-right">
              {formatCurrency(summary.total_to_transfer)}
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs sm:text-[15px] gap-2">
            <span className="text-muted-foreground">Оплачено</span>
            <span className="font-semibold break-words text-right" style={{ color: "#34C759" }}>
              {formatCurrency(summary.total_paid)}
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs sm:text-[15px] gap-2">
            <span className="text-muted-foreground">
              {hasOverpayment ? "Переплата" : "Остаток"}
            </span>
            <span 
              className="font-semibold break-words text-right" 
              style={{ color: summary.remaining > 0 ? "#FF3B30" : hasOverpayment ? "#007AFF" : "#34C759" }}
            >
              {hasOverpayment 
                ? formatCurrency(Math.abs(summary.remaining))
                : formatCurrency(summary.remaining)}
            </span>
          </div>

          {summary.total_to_transfer > 0 && (
            <div className="pt-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${paidPercentage}%`,
                    backgroundColor: paidPercentage === 100 ? "#34C759" : "#007AFF"
                  }}
                />
              </div>
              <div className="text-[12px] text-muted-foreground mt-1 text-right">
                {paidPercentage}% оплачено
              </div>
            </div>
          )}
        </div>

      </div>

      <AnimatePresence>
        {isExpanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-black/[0.06] dark:border-white/[0.06]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
