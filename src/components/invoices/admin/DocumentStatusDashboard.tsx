import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { documentGroupsSchema, documentRowsSchema } from '@shared/documentStatusContract';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { InvoicePagination } from '../InvoicePagination';
import { InvoiceDetailsDialog } from '../InvoiceDetailsDialog';

/** Counts cover the full role scope; invoice details are loaded only for expanded client groups. */
export function DocumentStatusDashboard({ closing = false }: { closing?: boolean }) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null);
  const endpoint = closing ? '/closing-docs-status' : '/clients/acts-status';
  const refetchInterval = useVisibilityAwareInterval();
  const query = useQuery({ queryKey: ['/api/invoices', endpoint, search, page],
    queryFn: () => apiGet(`${endpoint}?page=${page}&limit=25&search=${encodeURIComponent(search)}`, documentGroupsSchema), refetchInterval, staleTime: 10000 });
  const totals = query.data?.summary;
  return <Card>
    <CardHeader><CardTitle>{closing ? 'Закрывающие документы бухгалтерии' : 'Акты по клиентам'}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <Input aria-label="Поиск клиентов по документам" placeholder="Клиент" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      {query.error && <p role="alert">Не удалось загрузить документы. <Button onClick={() => query.refetch()}>Повторить</Button></p>}
      {query.isLoading && <p>Загрузка…</p>}
      {totals && <div className="space-y-2 rounded bg-muted/30 p-3 text-sm">
        <p>Счетов: {totals.totalInvoices} · {closing ? `Без документов: ${totals.withoutDoc}` : `Без актов: ${totals.withoutActs}`}</p>
        {closing ? <p>Закрывающие документы: {totals.withDoc} / {totals.totalInvoices}</p> : <>
          <p>Акты компаний: {totals.withCompanyAct} / {totals.totalInvoices}</p>
          <p>Акты исполнителей: {totals.withExecutorAct} / {totals.totalInvoices}</p>
        </>}
        <Progress value={totals.totalInvoices ? (closing ? totals.withDoc : totals.withBothActs) / totals.totalInvoices * 100 : 0} />
      </div>}
      {query.data?.groups.map(client => <div key={client.clientId} className="rounded border">
        <button type="button" className="w-full p-3 text-left flex flex-wrap gap-2 items-center justify-between"
          aria-expanded={expanded === client.clientId} onClick={() => setExpanded(expanded === client.clientId ? null : client.clientId)}>
          <span className="font-medium">{client.clientName}</span><span className="text-sm">{client.totalInvoices} счетов</span>
          {closing ? <Badge variant={client.withoutDoc ? 'destructive' : 'secondary'}>{client.withoutDoc ? `${client.withoutDoc} без документов` : 'Все документы'}</Badge>
            : <span className="text-sm">Компания: {client.withCompanyAct} · Исполнитель: {client.withExecutorAct}</span>}
        </button>
        {expanded === client.clientId && <DocumentInvoices endpoint={endpoint} clientId={client.clientId} closing={closing} onOpen={setSelected} />}
      </div>)}
      {query.data?.total === 0 && <p>Нет счетов по выбранным условиям</p>}
      <InvoicePagination page={page} pages={query.data?.pages ?? 0} total={query.data?.total ?? 0} onPage={setPage} disabled={query.isFetching} />
      <InvoiceDetailsDialog invoiceId={selected} open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); void queryClient.invalidateQueries({ queryKey: ['/api/invoices'] }); } }}
        userRole={role ?? 'client'} canEdit={role === 'admin' || role === 'assistant' || role === 'accountant'} />
    </CardContent>
  </Card>;
}
function DocumentInvoices({ endpoint, clientId, closing, onOpen }: { endpoint: string; clientId: string; closing: boolean; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['/api/invoices', endpoint, clientId, page],
    queryFn: () => apiGet(`${endpoint}?clientId=${clientId}&page=${page}&limit=25`, documentRowsSchema) });
  return <div className="p-3 border-t space-y-2">
    {query.isLoading && <p>Загрузка…</p>}
    {query.error && <p role="alert">Не удалось загрузить счета. <Button onClick={() => query.refetch()}>Повторить</Button></p>}
    {query.data?.invoices.map(invoice => <button type="button" key={invoice.id} onClick={() => onOpen(invoice.id)} className="w-full text-left flex flex-wrap justify-between gap-2 p-2 rounded bg-muted/30">
      <span>{invoice.invoiceNumber}</span><span className="text-sm text-muted-foreground">{invoice.paymentDate ?? 'Дата оплаты не указана'}</span>
      <span className="text-xs">{closing ? invoice.closingDocumentUrl ? 'Документ прикреплён' : 'Нет документа' :
        `Компания: ${invoice.hasCompanyAct ? 'есть' : 'нет'} · Исполнитель: ${invoice.hasExecutorAct ? 'есть' : 'нет'}`}</span>
    </button>)}
    <InvoicePagination page={page} pages={query.data?.pages ?? 0} total={query.data?.total ?? 0} onPage={setPage} disabled={query.isFetching} />
  </div>;
}
