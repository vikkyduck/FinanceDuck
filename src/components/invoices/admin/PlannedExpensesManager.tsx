import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Plus, Pencil, Trash2, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiPost, apiPut, apiDelete } from "@/lib/api";
import { showSuccess } from "@/lib/errorHandler";
import { useToast } from "@/hooks/use-toast";

interface PlannedExpense {
  id: string;
  invoiceId: string;
  description: string;
  expectedAmount: string;
  expectedDate: string;
  status: 'pending' | 'realized' | 'cancelled';
  notes: string | null;
  createdAt: string;
}

interface PlannedExpensesManagerProps {
  invoiceId: string;
  className?: string;
  onExpenseChanged?: () => void;
}

const statusConfig = {
  pending: { label: "Ожидается", icon: Clock, variant: "outline" as const, color: "text-amber-600" },
  realized: { label: "Реализовано", icon: CheckCircle2, variant: "default" as const, color: "text-green-600" },
  cancelled: { label: "Отменено", icon: XCircle, variant: "secondary" as const, color: "text-muted-foreground" },
};

export function PlannedExpensesManager({ invoiceId, className, onExpenseChanged }: PlannedExpensesManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<PlannedExpense | null>(null);
  
  const [formData, setFormData] = useState({
    description: "",
    expectedAmount: "",
    expectedDate: "",
    notes: "",
    status: "pending" as 'pending' | 'realized' | 'cancelled',
  });

  const { data: expenses, isLoading, refetch } = useQuery<PlannedExpense[]>({
    queryKey: ['/api/invoices', invoiceId, 'planned-expenses'],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/planned-expenses`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch planned expenses');
      return res.json();
    },
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiPost(`/invoices/${invoiceId}/planned-expenses`, {
        description: data.description,
        expectedAmount: data.expectedAmount,
        expectedDate: data.expectedDate,
        notes: data.notes || null,
      });
    },
    onSuccess: () => {
      showSuccess("Готово", "Плановый расход добавлен");
      setCreateDialogOpen(false);
      resetForm();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      onExpenseChanged?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось создать плановый расход", variant: "destructive" });
      console.error("Create planned expense error:", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      return apiPut(`/planned-expenses/${data.id}`, {
        description: data.description,
        expectedAmount: data.expectedAmount,
        expectedDate: data.expectedDate,
        status: data.status,
        notes: data.notes || null,
      });
    },
    onSuccess: () => {
      showSuccess("Готово", "Плановый расход обновлён");
      setEditDialogOpen(false);
      setSelectedExpense(null);
      resetForm();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      onExpenseChanged?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось обновить плановый расход", variant: "destructive" });
      console.error("Update planned expense error:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiDelete(`/planned-expenses/${id}`);
    },
    onSuccess: () => {
      showSuccess("Готово", "Плановый расход удалён");
      setDeleteDialogOpen(false);
      setSelectedExpense(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      onExpenseChanged?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось удалить плановый расход", variant: "destructive" });
      console.error("Delete planned expense error:", error);
    },
  });

  const resetForm = () => {
    setFormData({
      description: "",
      expectedAmount: "",
      expectedDate: "",
      notes: "",
      status: "pending",
    });
  };

  const handleCreate = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const handleEdit = (expense: PlannedExpense) => {
    setSelectedExpense(expense);
    setFormData({
      description: expense.description,
      expectedAmount: expense.expectedAmount,
      expectedDate: expense.expectedDate,
      notes: expense.notes || "",
      status: expense.status,
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (expense: PlannedExpense) => {
    setSelectedExpense(expense);
    setDeleteDialogOpen(true);
  };

  const handleSubmitCreate = () => {
    if (!formData.description || !formData.expectedAmount || !formData.expectedDate) {
      toast({ title: "Ошибка", description: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleSubmitEdit = () => {
    if (!selectedExpense) return;
    if (!formData.description || !formData.expectedAmount || !formData.expectedDate) {
      toast({ title: "Ошибка", description: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: selectedExpense.id, ...formData });
  };

  const handleConfirmDelete = () => {
    if (selectedExpense) {
      deleteMutation.mutate(selectedExpense.id);
    }
  };

  const pendingTotal = expenses?.filter(e => e.status === 'pending').reduce((sum, e) => sum + (parseFloat(e.expectedAmount) || 0), 0) || 0;

  if (isLoading) {
    return (
      <Card className={cn("shadow-standard", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Плановые расходы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn("shadow-standard", className)}>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Плановые расходы
            </CardTitle>
            {pendingTotal > 0 && (
              <Badge variant="outline" className="text-amber-600">
                Ожидается: {pendingTotal.toLocaleString('ru-RU')} ₽
              </Badge>
            )}
          </div>
          <Button size="sm" onClick={handleCreate} data-testid="button-add-planned-expense">
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {!expenses || expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Плановых расходов пока нет
            </p>
          ) : (
            <div className="space-y-2">
              {expenses.map((expense) => {
                const config = statusConfig[expense.status];
                const StatusIcon = config.icon;
                const amount = parseFloat(expense.expectedAmount) || 0;
                
                return (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50 gap-3"
                    data-testid={`planned-expense-${expense.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{expense.description}</span>
                        <Badge variant={config.variant} className={cn("text-xs", config.color)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{format(new Date(expense.expectedDate), "d MMMM yyyy", { locale: ru })}</span>
                        {expense.notes && (
                          <span className="text-xs truncate max-w-[200px]">• {expense.notes}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold whitespace-nowrap", expense.status === 'cancelled' && "line-through text-muted-foreground")}>
                        {amount.toLocaleString('ru-RU')} ₽
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(expense)}
                        data-testid={`button-edit-planned-expense-${expense.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(expense)}
                        data-testid={`button-delete-planned-expense-${expense.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить плановый расход</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Описание *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Например: Оплата подрядчику за дизайн"
                data-testid="input-planned-expense-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expectedAmount">Сумма *</Label>
                <Input
                  id="expectedAmount"
                  type="number"
                  value={formData.expectedAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedAmount: e.target.value }))}
                  placeholder="50000"
                  data-testid="input-planned-expense-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedDate">Дата *</Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedDate: e.target.value }))}
                  data-testid="input-planned-expense-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Примечание</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Дополнительная информация"
                data-testid="input-planned-expense-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSubmitCreate} disabled={createMutation.isPending} data-testid="button-save-planned-expense">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Добавить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать плановый расход</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Описание *</Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-edit-planned-expense-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-expectedAmount">Сумма *</Label>
                <Input
                  id="edit-expectedAmount"
                  type="number"
                  value={formData.expectedAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedAmount: e.target.value }))}
                  data-testid="input-edit-planned-expense-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-expectedDate">Дата *</Label>
                <Input
                  id="edit-expectedDate"
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedDate: e.target.value }))}
                  data-testid="input-edit-planned-expense-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Статус</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as typeof formData.status }))}
              >
                <SelectTrigger data-testid="select-planned-expense-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ожидается</SelectItem>
                  <SelectItem value="realized">Реализовано</SelectItem>
                  <SelectItem value="cancelled">Отменено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Примечание</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                data-testid="input-edit-planned-expense-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending} data-testid="button-update-planned-expense">
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить плановый расход?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить этот плановый расход?
              {selectedExpense && (
                <span className="block mt-2 font-medium">
                  "{selectedExpense.description}" на сумму {parseFloat(selectedExpense.expectedAmount).toLocaleString('ru-RU')} ₽
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-planned-expense"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
