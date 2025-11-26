import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, X, FileText, CreditCard, Users, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface FABAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface FloatingActionButtonProps {
  onCreateInvoice?: () => void;
  onRecordPayment?: () => void;
  onManagePartners?: () => void;
  onManageClients?: () => void;
}

export function FloatingActionButton({
  onCreateInvoice,
  onRecordPayment,
  onManagePartners,
  onManageClients,
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { role } = useAuth();

  const actions: FABAction[] = [];

  if (role === "admin" || role === "assistant") {
    if (onCreateInvoice) {
      actions.push({
        id: "create-invoice",
        label: "Создать счёт",
        icon: <FileText className="h-4 w-4" />,
        onClick: () => {
          onCreateInvoice();
          setIsOpen(false);
        },
      });
    }
  }

  if (role === "admin") {
    if (onRecordPayment) {
      actions.push({
        id: "record-payment",
        label: "Записать приход",
        icon: <CreditCard className="h-4 w-4" />,
        onClick: () => {
          onRecordPayment();
          setIsOpen(false);
        },
      });
    }

    if (onManagePartners) {
      actions.push({
        id: "manage-partners",
        label: "Партнёры",
        icon: <Building2 className="h-4 w-4" />,
        onClick: () => {
          onManagePartners();
          setIsOpen(false);
        },
      });
    }

    if (onManageClients) {
      actions.push({
        id: "manage-clients",
        label: "Клиенты",
        icon: <Users className="h-4 w-4" />,
        onClick: () => {
          onManageClients();
          setIsOpen(false);
        },
      });
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <>
            {actions.map((action, index) => (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                transition={{ delay: index * 0.05 }}
              >
                <Button
                  variant="secondary"
                  className="shadow-lg gap-2 pr-4"
                  onClick={action.onClick}
                  data-testid={`fab-action-${action.id}`}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </Button>
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>

      <Button
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-transform",
          isOpen && "rotate-45"
        )}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="fab-main-button"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </Button>
    </div>
  );
}
