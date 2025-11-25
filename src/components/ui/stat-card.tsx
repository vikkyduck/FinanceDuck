import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  valueClassName?: string;
  progress?: number;
  className?: string;
}

export const StatCard = ({
  title,
  value,
  description,
  icon: Icon,
  valueClassName,
  progress,
  className,
}: StatCardProps) => {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
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
