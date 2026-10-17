import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { Plus, Trash2, FileText, Loader2, MessageSquare } from "lucide-react";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "permissions"
  | "setAddExpenseOpen"
  | "expenses"
  | "userRole"
  | "invoice"
  | "canEdit"
  | "setMessageExpense"
  | "setEditingExpense"
  | "setEditExpenseOpen"
  | "deletingExpenseId"
  | "setDeleteExpense"
>;
export function InvoiceExpensesSection({ model }: { model: Props }) {
  const {
    permissions,
    setAddExpenseOpen,
    expenses,
    userRole,
    invoice,
    canEdit,
    setMessageExpense,
    setEditingExpense,
    setEditExpenseOpen,
    deletingExpenseId,
    setDeleteExpense,
  } = model;
  if (!invoice) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Расходы исполнителей</CardTitle>
        {permissions.canAddExpenses && (
          <Button size="sm" onClick={() => setAddExpenseOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить расход
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Нет расходов по данному счету
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Описание</TableHead>
                {/* Клиенту по неагентским счетам суммы списаний не показываем. */}
                {!(
                  userRole === "client" &&
                  invoice?.scheme !== "agency_30" &&
                  invoice?.scheme !== "agency_40" &&
                  invoice?.scheme !== "agency"
                ) && <TableHead className="text-right">Сумма</TableHead>}
                <TableHead className="w-24">Сообщения</TableHead>
                {(permissions.canDeleteExpenses || canEdit) && (
                  <TableHead className="w-20">Действия</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{formatDate(expense.date)}</TableCell>
                  <TableCell className="[overflow-wrap:anywhere]">
                    {expense.description}
                  </TableCell>
                  {!(
                    userRole === "client" &&
                    invoice?.scheme !== "agency_30" &&
                    invoice?.scheme !== "agency_40" &&
                    invoice?.scheme !== "agency"
                  ) && (
                    <TableCell className="text-right whitespace-nowrap">
                      {expense.amount === undefined ? "—" : formatCurrency(expense.amount)}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setMessageExpense({
                          id: expense.id,
                          description: expense.description,
                          amount: expense.amount === undefined ? null : Number(expense.amount),
                        })
                      }
                      data-testid={`button-message-expense-${expense.id}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  {(permissions.canDeleteExpenses || canEdit) && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canEdit && expense.amount !== undefined && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (expense.amount === undefined) return;
                              setEditingExpense({ ...expense, amount: expense.amount });
                              setEditExpenseOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {permissions.canDeleteExpenses && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingExpenseId === expense.id}
                            onClick={() =>
                              setDeleteExpense({
                                id: expense.id,
                                description: expense.description,
                              })
                            }
                          >
                            {deletingExpenseId === expense.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
