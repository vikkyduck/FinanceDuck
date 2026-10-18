import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInvoiceArchive } from '@/hooks/useInvoiceArchive';

export function InvoiceArchiveAction({ invoiceId, archived }: { invoiceId: string; archived: boolean }) {
  const { pending, setArchived } = useInvoiceArchive(invoiceId);
  const Icon = pending ? Loader2 : archived ? ArchiveRestore : Archive;
  return <div className="col-span-full rounded-lg border p-3 space-y-2" data-testid="invoice-archive-action">
    <p className="text-sm text-muted-foreground">{archived ? 'Счёт в архиве.' : 'Архив убирает счёт из рабочего списка администратора.'} Суммы, отчёты и доступ клиента и партнёра сохраняются.</p>
    <Button variant="outline" size="sm" disabled={pending} onClick={() => setArchived(!archived)}>
      <Icon className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
      {archived ? 'Вернуть из архива' : 'В архив'}
    </Button>
  </div>;
}
