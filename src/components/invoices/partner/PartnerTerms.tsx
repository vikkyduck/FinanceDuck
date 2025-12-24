import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { getSchemeLabel } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";

interface PartnerTerm {
  scheme: string;
  partnerCommissionRate: number | null;
}

export const PartnerTerms = () => {
  const { partnerId, isLoading: authLoading } = useAuth();

  const { data: terms = [], isLoading } = useQuery<PartnerTerm[]>({
    queryKey: ["/api/partner/terms"],
    queryFn: () => apiGet<PartnerTerm[]>("/partner/terms"),
    enabled: !authLoading && !!partnerId,
  });

  const { setRef } = useStaggerAnimation(terms.length, 50);

  if (isLoading || authLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        У вас пока нет активных условий работы
      </div>
    );
  }

  const getSchemeDescription = (scheme: string, rate: number | null) => {
    if (scheme === 'agency_30') {
      return '15% от счета клиента (половина комиссии агентства 30%)';
    }
    if (scheme === 'agency_40') {
      return '16% от счета клиента (из комиссии агентства 40%)';
    }
    if (scheme === 'commission_based' && rate) {
      return `${rate}% от счета клиента`;
    }
    return 'Не установлено';
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Тип схемы</TableHead>
          <TableHead>Ваш процент</TableHead>
          <TableHead>Описание</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {terms.map((term, index) => (
          <TableRow 
            key={index} 
            ref={setRef(index)}
            className="table-row-hover"
          >
            <TableCell className="font-medium table-cell-highlight">
              {getSchemeLabel(term.scheme as any, 'partner', term.partnerCommissionRate ?? undefined)}
            </TableCell>
            <TableCell className="text-primary font-semibold table-cell-highlight">
              {term.scheme === 'agency_30' 
                ? '15% от счета' 
                : term.scheme === 'agency_40'
                  ? '16% от счета'
                  : term.partnerCommissionRate 
                    ? `${term.partnerCommissionRate}%` 
                    : 'Не установлен'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground table-cell-highlight">
              {getSchemeDescription(term.scheme, term.partnerCommissionRate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
