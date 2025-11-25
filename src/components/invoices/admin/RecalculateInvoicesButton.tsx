import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showSuccess, handleSupabaseError } from "@/lib/errorHandler";
import { ensureSessionContext } from "@/lib/supabaseHelpers";

export const RecalculateInvoicesButton = () => {
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await ensureSessionContext();
      
      const { data, error } = await supabase.rpc('recalculate_all_invoices');
      
      if (error) {
        handleSupabaseError(error, {
          operation: "Пересчёт счетов",
          details: { function: 'recalculate_all_invoices' }
        });
        return;
      }
      
      if (data) {
        const result = data as { success: boolean; message: string; recalculated_count: number };
        if (result.success) {
          showSuccess("Пересчёт завершён", result.message);
          // Refresh the page to show updated data
          setTimeout(() => window.location.reload(), 1000);
        } else {
          handleSupabaseError(new Error(result.message || "Неизвестная ошибка"), {
            operation: "Пересчёт счетов"
          });
        }
      }
    } catch (error: any) {
      handleSupabaseError(error, {
        operation: "Пересчёт счетов",
        details: { error: error.message }
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={handleRecalculate}
      disabled={isRecalculating}
      className="border-primary/20 hover:bg-primary/5"
    >
      {isRecalculating ? (
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
      ) : (
        <Calculator className="h-5 w-5 mr-2" />
      )}
      {isRecalculating ? "Пересчитываю..." : "Пересчитать все счета"}
    </Button>
  );
};
