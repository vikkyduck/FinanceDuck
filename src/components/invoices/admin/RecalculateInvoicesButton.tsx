import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";

export const RecalculateInvoicesButton = () => {
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const result = await apiPost<{ success: boolean; message: string; updated: number; errors: number }>(
        '/admin/recalculate-invoices'
      );
      
      toast({
        title: "Пересчёт завершён",
        description: result.message || `Пересчитано счетов: ${result.updated || 0}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/financial-summary'] });
      
    } catch (error: any) {
      console.error('[RecalculateButton] Error:', error);
      toast({
        title: "Ошибка пересчёта",
        description: error.message || "Не удалось пересчитать счета",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleRecalculate}
      disabled={isRecalculating}
      className="border-primary/20"
      data-testid="button-recalculate"
    >
      {isRecalculating ? (
        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 animate-spin" />
      ) : (
        <Calculator className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
      )}
      <span className="text-xs sm:text-sm">{isRecalculating ? "Пересчитываю..." : "Пересчитать все счета"}</span>
    </Button>
  );
};
