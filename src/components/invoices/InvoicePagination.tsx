import { Button } from '@/components/ui/button';
import { MAX_BROWSE_ROWS } from '@shared/pagination';

export function InvoicePagination({ page, pages, total, onPage, disabled = false }: {
  page: number; pages: number; total: number; onPage: (page: number) => void; disabled?: boolean;
}) {
  return <div className="flex flex-wrap items-center gap-2 pt-3 text-sm">
    <Button type="button" variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Назад</Button>
    <span>{disabled && pages === 0 ? 'Загрузка страницы…' : <>Страница {page} из {Math.max(1, pages)} · Найдено: {total}</>}</span>
    <Button type="button" variant="outline" size="sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>Далее</Button>
    {total > MAX_BROWSE_ROWS && <p className="w-full text-muted-foreground">Для просмотра следующих счетов уточните поиск или период. Экспорт содержит все найденные записи.</p>}
  </div>;
}
