import { FileText, Send, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";

interface InvoiceProgressBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

const statusConfig = {
  draft: {
    progress: 0,
    color: "bg-destructive",
    icon: FileText,
    label: "Черновик",
    steps: [
      { label: "Создан", active: true },
      { label: "Отправлен", active: false },
      { label: "Оплачен", active: false },
    ],
  },
  sent: {
    progress: 50,
    color: "bg-warning",
    icon: Send,
    label: "Отправлен",
    steps: [
      { label: "Создан", active: true },
      { label: "Отправлен", active: true },
      { label: "Оплачен", active: false },
    ],
  },
  paid: {
    progress: 100,
    color: "bg-success",
    icon: CheckCircle2,
    label: "Оплачен",
    steps: [
      { label: "Создан", active: true },
      { label: "Отправлен", active: true },
      { label: "Оплачен", active: true },
    ],
  },
  cancelled: {
    progress: 0,
    color: "bg-muted",
    icon: XCircle,
    label: "Отменен",
    steps: [],
  },
};

export const InvoiceProgressBadge = ({
  status,
  className,
}: InvoiceProgressBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  if (status === "cancelled") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-4 h-4 ${config.color.replace("bg-", "text-")}`} />
        <span className="text-sm font-medium">{config.label}</span>
      </div>
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ originX: 0 }}
      >
        <Progress
          value={config.progress}
          className="h-1.5"
          indicatorClassName={config.color}
        />
      </motion.div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {config.steps.map((step, index) => (
          <div
            key={index}
            className={`flex items-center gap-1 ${
              step.active ? "text-foreground font-medium" : ""
            }`}
          >
            {step.active && <span className="text-primary">✓</span>}
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
