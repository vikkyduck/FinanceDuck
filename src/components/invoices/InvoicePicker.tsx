import { useState } from 'react';
import type { InvoiceDto } from '@shared/contracts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInvoicePage } from '@/hooks/useInvoicePage';
import { InvoicePagination } from './InvoicePagination';
import { formatCurrency } from '@/lib/invoiceCalculations';

/** Search and page on the server, retaining the selected invoice when its page changes. */
export function InvoicePicker({ selected, onSelect, clientId, partnerId, paidOnly, positiveBalance, excludeId, disabled, label }: {
  selected: InvoiceDto | null; onSelect: (invoice: InvoiceDto) => void; clientId?: string; partnerId?: string;
  paidOnly?: boolean; positiveBalance?: boolean; excludeId?: string; disabled?: boolean; label: string;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useInvoicePage({ clientId, partnerId, status: paidOnly ? 'paid' : undefined,
    positiveBalance, search, page, limit: 25 }, !disabled);
  const rows = query.data?.invoices ?? [];
  const options = selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows;
  return <div className="space-y-2 min-w-0">
    <Input aria-label={`Поиск: ${label}`} placeholder="Номер счёта или название" value={search} disabled={disabled}
      onChange={event => { setSearch(event.target.value); setPage(1); }} />
    <Select value={selected?.id ?? ''} disabled={disabled || query.isLoading}
      onValueChange={id => { const row = options.find(item => item.id === id); if (row) onSelect(row); }}>
      <SelectTrigger aria-label={label}><SelectValue placeholder={query.isLoading ? 'Загрузка…' : label} /></SelectTrigger>
      <SelectContent>{options.map(row => <SelectItem key={row.id} value={row.id} disabled={row.id === excludeId}>
        {row.clientTitle || row.invoiceNumber} · {formatCurrency(Number(paidOnly ? row.calculations?.partnerTransferDue ?? 0 : row.calculations?.clientRemaining ?? 0))}
      </SelectItem>)}</SelectContent>
    </Select>
    {query.error ? <p role="alert">Не удалось загрузить счета. <button type="button" onClick={() => query.refetch()}>Повторить</button></p> :
      !disabled && <InvoicePagination page={page} pages={query.data?.pages ?? 0} total={query.data?.total ?? 0} onPage={setPage} disabled={query.isFetching} />}
  </div>;
}
