import { useState, useEffect, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useRateLimit } from "@/hooks/useRateLimit";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { handleSupabaseError, handleValidationError, showSuccess } from "@/lib/errorHandler";
import { querySupabaseWithFilter, insertSupabaseNoReturn, deleteSupabase } from "@/lib/supabaseHelpers";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validate?: (value: string) => string | null;
  sanitize?: (value: string) => string | null;
}

export interface CrudDialogColumn<T = any> {
  header: string;
  render: (item: T) => ReactNode;
}

interface CrudDialogConfig<T = any> {
  title: string;
  table: string;
  itemName: {
    singular: string;
    plural: string;
  };
  fields: FormField[];
  columns: CrudDialogColumn<T>[];
  selectQuery?: string;
  additionalTables?: { table: string; query: string }[];
  getItemDisplayName: (item: T) => string;
  onSuccess?: () => void;
  LoadingSkeleton: React.ComponentType;
}

interface CrudDialogProps<T = any> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CrudDialogConfig<T>;
}

export function CrudDialog<T extends { id: string; name: string }>({ 
  open, 
  onOpenChange, 
  config 
}: CrudDialogProps<T>) {
  const { checkLimit } = useRateLimit('form');
  const [items, setItems] = useState<T[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [additionalData, setAdditionalData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef: setStaggerRef } = useStaggerAnimation(items.length, 40);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setFetchingData(true);
    
    // Fetch main items
    const query = config.selectQuery || "*";
    const itemsData = await querySupabaseWithFilter(
      config.table,
      query,
      (q) => q.order("name")
    );

    // Fetch additional tables if needed
    const additionalDataObj: Record<string, any[]> = {};
    if (config.additionalTables) {
      for (const { table, query } of config.additionalTables) {
        const data = await querySupabaseWithFilter(
          table,
          query,
          (q) => q.order("name")
        );
        additionalDataObj[table] = data || [];
      }
    }

    setItems((itemsData || []) as unknown as T[]);
    setAdditionalData(additionalDataObj);
    setFetchingData(false);
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    // Validate and sanitize all fields
    const sanitizedData: Record<string, any> = {};
    for (const field of config.fields) {
      const value = formData[field.name] || "";
      
      // Validate
      if (field.required && !value.trim()) {
        handleValidationError(field.label, `Заполните ${field.label.toLowerCase()}`);
        return;
      }

      // Custom validation
      if (field.validate && value) {
        const error = field.validate(value);
        if (error) {
          handleValidationError(field.label, error);
          return;
        }
      }

      // Sanitize
      let sanitizedValue = value;
      if (field.sanitize && value) {
        sanitizedValue = field.sanitize(value);
        if (sanitizedValue === null) {
          handleValidationError(field.label, `Некорректное значение для ${field.label.toLowerCase()}`);
          return;
        }
      }

      sanitizedData[field.name] = sanitizedValue || null;
    }

    setLoading(true);
    const success = await insertSupabaseNoReturn(
      config.table,
      sanitizedData,
      { operation: `add_${config.itemName.singular}`, details: sanitizedData }
    );

    if (success) {
      showSuccess("Успешно", `${config.itemName.singular} добавлен`);
      setFormData({});
      fetchData();
      config.onSuccess?.();
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeletingItemId(deleteItem.id);

    const success = await deleteSupabase(
      config.table,
      (q) => q.eq("id", deleteItem.id),
      { operation: `delete_${config.itemName.singular}`, details: { id: deleteItem.id } }
    );

    if (success) {
      showSuccess("Успешно", `${config.itemName.singular} удалён`);
      fetchData();
    }

    setDeleteItem(null);
    setDeletingItemId(null);
  };

  const renderField = (field: FormField) => {
    if (field.type === "select" && field.options) {
      return (
        <Select
          value={formData[field.name] || ""}
          onValueChange={(value) => setFormData(prev => ({ ...prev, [field.name]: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || `Выберите ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        type={field.type}
        value={formData[field.name] || ""}
        onChange={(e) => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
        placeholder={field.placeholder}
        required={field.required}
      />
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {config.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label} {field.required && "*"}
                  </Label>
                  {renderField(field)}
                </div>
              ))}
            </div>

            <Button 
              onClick={handleAdd} 
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Добавить
            </Button>

            <div className="border rounded-lg">
              {fetchingData ? (
                <config.LoadingSkeleton />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {config.columns.map((column, index) => (
                        <TableHead key={index}>{column.header}</TableHead>
                      ))}
                      <TableHead className="w-[100px]">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell 
                          colSpan={config.columns.length + 1} 
                          className="text-center text-muted-foreground"
                        >
                          {config.itemName.plural} не найдены
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, index) => (
                        <TableRow key={item.id} ref={setStaggerRef(index)}>
                          {config.columns.map((column, colIndex) => (
                            <TableCell key={colIndex}>{column.render(item)}</TableCell>
                          ))}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteItem({ 
                                id: item.id, 
                                name: config.getItemDisplayName(item) 
                              })}
                              disabled={deletingItemId === item.id}
                            >
                              {deletingItemId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить {config.itemName.singular.toLowerCase()} "{deleteItem?.name}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
