import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export const RecalculateInvoicesButton = () => {
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch('/api/admin/recalculate-invoices', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to recalculate');
      }
      
      const result = await response.json();
      
      toast({
        title: "Пересчёт завершён",
        description: result.message || `Пересчитано счетов: ${result.updated || 0}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/financial-summary'] });
      
    } catch (error: any) {
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
      size="lg"
      onClick={handleRecalculate}
      disabled={isRecalculating}
      className="border-primary/20"
      data-testid="button-recalculate"
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
