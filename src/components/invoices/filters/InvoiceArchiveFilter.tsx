import { Button } from '@/components/ui/button';
export type ArchiveFilter = 'active' | 'archived' | 'all';
export function InvoiceArchiveFilter({ value, onChange }: { value: ArchiveFilter; onChange: (value: ArchiveFilter) => void }) {
  return <div className="flex flex-wrap gap-2 my-3" role="group" aria-label="Архив счетов">
    {([['active', 'Рабочие счета'], ['archived', 'Архив'], ['all', 'Все, включая архив']] as const).map(([key, label]) =>
      <Button key={key} variant={value === key ? 'default' : 'outline'} size="sm" aria-pressed={value === key} onClick={() => onChange(key)}>{label}</Button>)}
  </div>;
}
