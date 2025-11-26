import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { getSchemeLabel } from "@/lib/invoiceCalculations";

interface PartnerTerm {
  scheme: string;
  partner_commission_rate: number | null;
}

export const PartnerTerms = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [terms, setTerms] = useState<PartnerTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const { setRef } = useStaggerAnimation(terms.length, 50);

  const fetchTerms = async () => {
    try {
      setLoading(true);

      // Ensure session context so RLS works for partner
      await ensureSessionContext();

      const { data, error } = await supabase
        .from("invoices")
        .select("scheme, partner_commission_rate")
        .eq("partner_id", partnerId);

      if (error) {
        console.error("Error fetching partner terms:", error);
        setTerms([]);
        return;
      }

      if (data) {
        // Get unique combinations of scheme and commission rate
        const uniqueTerms = data.reduce((acc: PartnerTerm[], curr) => {
          const exists = acc.find(
            (t) => t.scheme === curr.scheme && t.partner_commission_rate === curr.partner_commission_rate
          );
          if (!exists) {
            acc.push({
              scheme: curr.scheme,
              partner_commission_rate: curr.partner_commission_rate,
            });
          }
          return acc;
        }, []);

        setTerms(uniqueTerms.sort((a, b) => a.scheme.localeCompare(b.scheme)));
      }
    } catch (error) {
      console.error("Unexpected error fetching partner terms:", error);
      setTerms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!partnerId) {
      setLoading(false);
      return;
    }

    fetchTerms();
  }, [authLoading, partnerId]);

  // Realtime subscription for automatic updates when invoices change
  useRealtimeSubscription({
    channelName: 'partner_terms_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchTerms,
    enabled: !!partnerId,
  });

  if (loading) {
    return <div className="text-center py-4">Загрузка условий...</div>;
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
            <TableCell className="font-medium table-cell-highlight">{getSchemeLabel(term.scheme as any, 'partner', term.partner_commission_rate ?? undefined)}</TableCell>
            <TableCell className="text-primary font-semibold table-cell-highlight">
              {term.scheme === 'agency_30' 
                ? '15% от счета' 
                : term.partner_commission_rate 
                  ? `${term.partner_commission_rate}%` 
                  : 'Не установлен'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground table-cell-highlight">
              {getSchemeDescription(term.scheme, term.partner_commission_rate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
