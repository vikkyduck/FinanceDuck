import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const statusConfig = {
  draft: {
    label: "Черновик",
    className: "bg-gradient-to-r from-muted to-muted/80 text-muted-foreground border-muted-foreground/20 shadow-sm",
    dotColor: "bg-muted-foreground",
  },
  sent: {
    label: "Отправлен",
    className: "bg-gradient-to-r from-info/15 to-info/10 text-info border-info/30 shadow-sm hover:shadow-md",
    dotColor: "bg-info shadow-[0_0_8px_currentColor]",
  },
  paid: {
    label: "Оплачен",
    className: "bg-gradient-to-r from-success/15 to-success/10 text-success border-success/30 shadow-sm hover:shadow-md",
    dotColor: "bg-success shadow-[0_0_8px_currentColor]",
  },
  cancelled: {
    label: "Отменён",
    className: "bg-gradient-to-r from-destructive/15 to-destructive/10 text-destructive border-destructive/30 shadow-sm hover:shadow-md",
    dotColor: "bg-destructive shadow-[0_0_8px_currentColor]",
  },
} as const;

export const StatusBadge = ({ status }: { status: keyof typeof statusConfig }) => {
  const config = statusConfig[status];
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "px-3.5 py-1.5 font-bold transition-all hover:scale-105",
        config.className
      )}
    >
      <span className={cn("w-2 h-2 rounded-full mr-2 animate-pulse", config.dotColor)} />
      {config.label}
    </Badge>
  );
};
