import { Badge } from "@/components/ui/badge";
import { Cat } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CatShareBadgeProps {
  catShare: number;
  adminShare: number;
  className?: string;
}

export function CatShareBadge({ catShare, adminShare, className }: CatShareBadgeProps) {
  if (catShare <= 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`gap-1 bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300 ${className}`}
          data-testid="badge-cat-share"
        >
          <Cat className="h-3 w-3" />
          <span>{formatCurrency(catShare)}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm space-y-1">
          <p className="font-medium">Распределение прибыли (50/50)</p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Админ:</span>
            <span>{formatCurrency(adminShare)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Кот:</span>
            <span>{formatCurrency(catShare)}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
