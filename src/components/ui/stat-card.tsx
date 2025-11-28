import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LucideIcon, HelpCircle } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  valueClassName?: string;
  progress?: number;
  className?: string;
  tooltip?: string;
}

export const StatCard = ({
  title,
  value,
  description,
  icon: Icon,
  valueClassName,
  progress,
  className,
  tooltip,
}: StatCardProps) => {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn("text-3xl font-semibold tracking-tight", valueClassName)}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
        {progress !== undefined && (
          <Progress value={progress} className="h-1.5 mt-2" />
        )}
      </CardContent>
    </Card>
  );
};
