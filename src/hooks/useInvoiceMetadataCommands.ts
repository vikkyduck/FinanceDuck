import { apiPatch } from '@/lib/api';
import { useEffect, useState } from 'react';
import type { InvoiceEditorContext } from './invoiceEditorContext';
import { useToast } from './use-toast';

/** Invoice identity, labels, ownership and visibility. */
export function useInvoiceMetadataCommands({ invoiceId, invoice, refresh: fetchInvoiceDetails }: InvoiceEditorContext) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [updatingInvoiceNumber, setUpdatingInvoiceNumber] = useState(false);
  const [hideFromAssistant, setHideFromAssistant] = useState(false);
  const [updatingHideFromAssistant, setUpdatingHideFromAssistant] =
    useState(false);
  const [clientTitleEdit, setClientTitleEdit] = useState<string>("");
  const [updatingClientTitle, setUpdatingClientTitle] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClientId, setMoveClientId] = useState<string>("");
  const [movingInvoice, setMovingInvoice] = useState(false);
  const handleUpdateNotes = async () => {
    if (!invoiceId) return;

    setUpdatingNotes(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, { notes: notes.trim() || null });
      toast({
        title: "Успешно",
        description: "Комментарий обновлён",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setUpdatingNotes(false);
  };
  const handleUpdateInvoiceNumber = async () => {
    if (!invoiceId) return;

    const trimmedNumber = invoiceNumber.trim();
    if (!trimmedNumber) {
      toast({
        title: "Ошибка",
        description: "Номер счета не может быть пустым",
        variant: "destructive",
      });
      return;
    }

    setUpdatingInvoiceNumber(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        invoiceNumber: trimmedNumber,
      });
      toast({
        title: "Успешно",
        description: "Номер счета обновлён",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setUpdatingInvoiceNumber(false);
  };
  const handleToggleHideFromAssistant = async (newValue: boolean) => {
    if (!invoiceId) return;

    setUpdatingHideFromAssistant(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, { hideFromAssistant: newValue });
      setHideFromAssistant(newValue);

      await fetchInvoiceDetails();

      toast({
        title: "Успешно",
        description: newValue
          ? "Счёт скрыт от ассистента"
          : "Счёт виден ассистенту",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ??
          "Не удалось обновить настройку",
        variant: "destructive",
      });
    } finally {
      setUpdatingHideFromAssistant(false);
    }
  };
  const handleMoveInvoice = async () => {
    if (!invoiceId || !moveClientId) return;
    if (moveClientId === invoice?.client_id) {
      toast({
        title: "Это тот же клиент",
        description: "Выберите другого клиента.",
      });
      return;
    }
    if (
      !confirm(
        "Перенести счёт другому клиенту? Все списания, расчёты и история останутся привязаны к счёту.",
      )
    )
      return;
    setMovingInvoice(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, { clientId: moveClientId });
      await fetchInvoiceDetails();
      setMoveOpen(false);
      setMoveClientId("");
      toast({
        title: "Перенесено",
        description: "Счёт теперь у другого клиента.",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось перенести счёт",
        variant: "destructive",
      });
    } finally {
      setMovingInvoice(false);
    }
  };
  const handleSaveClientTitle = async () => {
    if (!invoiceId) return;
    const trimmed = clientTitleEdit.trim();
    setUpdatingClientTitle(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        clientTitle: trimmed || null,
      });
      await fetchInvoiceDetails();
      toast({
        title: "Сохранено",
        description: trimmed
          ? "Название клиенту обновлено."
          : "Название убрано.",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось сохранить",
        variant: "destructive",
      });
    } finally {
      setUpdatingClientTitle(false);
    }
  };
  useEffect(() => {
    setNotes(invoice?.notes || '');
    setInvoiceNumber(invoice?.invoice_number || '');
    setHideFromAssistant(invoice?.hidden_from_assistant || false);
    setClientTitleEdit(invoice?.client_title ?? '');
  }, [invoice]);
  return {
    notes, setNotes, updatingNotes, setUpdatingNotes,
    invoiceNumber, setInvoiceNumber, updatingInvoiceNumber, setUpdatingInvoiceNumber,
    hideFromAssistant, setHideFromAssistant, updatingHideFromAssistant, setUpdatingHideFromAssistant,
    clientTitleEdit, setClientTitleEdit, updatingClientTitle, setUpdatingClientTitle,
    moveOpen, setMoveOpen, moveClientId, setMoveClientId,
    movingInvoice, setMovingInvoice, handleUpdateNotes, handleUpdateInvoiceNumber,
    handleToggleHideFromAssistant, handleMoveInvoice, handleSaveClientTitle,
  };
}
