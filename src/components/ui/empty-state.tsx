import { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Кот-талисман «Без Воды» (брендбук, раздел 9): одна непрерывная линия —
 * как процесс без воды, нигде не прерывается. Только контур, без глаз и
 * заливок. Канонное место — пустые состояния; один кот на экран.
 * Icon-проп сохранён для совместимости вызовов, но визуально теперь кот.
 */
const BrandCat = () => (
  <svg
    width="112"
    height="134"
    viewBox="0 0 140 170"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-foreground/80 mb-4"
    aria-hidden="true"
  >
    <path d="M46 58
             C42 44 46 30 54 24
             L60 10 L68 24
             C72 22 76 22 80 24
             L88 12 L92 28
             C98 36 98 46 94 56
             C106 76 110 106 98 126
             C88 142 60 148 46 138
             C32 128 28 102 36 84
             C40 74 44 66 46 58
             M98 126
             C106 136 120 138 128 130
             C136 122 130 112 120 116" />
  </svg>
);

export const EmptyState = ({
  icon: _icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 px-4", className)}>
      <BrandCat />
      <h3 className="text-lg font-semibold mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-5 text-center max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} size="default">
          {action.label}
        </Button>
      )}
    </div>
  );
};
