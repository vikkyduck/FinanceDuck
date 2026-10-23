import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, FileCheck2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet } from "@/lib/api";
import { formatDate, formatMoney, pluralizeRu } from "@/lib/format";
import { packageBonus, packagesByStatusKey, packageTitle, type PackageListItem } from "@/lib/documentPackages";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

/** "Документы ждут проверки": пакеты ассистента на проверке, решение в карточке счета. */
export const PackagesReviewCard = () => {
  const refetchInterval = useVisibilityAwareInterval();
  const [open, setOpen] = useState(false);
  const { data: packages = [], isLoading, isError } = useQuery<PackageListItem[]>({
    queryKey: packagesByStatusKey("pending"),
    queryFn: () => apiGet<PackageListItem[]>("/document-packages?status=pending"),
    refetchInterval,
    staleTime: 10000,
  });
  const count = packages.length;
  const empty = !isLoading && !isError && count === 0;
  const bonus = packages.reduce((sum, pkg) => sum + packageBonus(pkg), 0);

  return (
    <Card data-testid="card-packages-review" className={empty ? "border-success/40" : "border-warning/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck2 className={`h-4 w-4 ${empty ? "text-success" : "text-amber-600 dark:text-amber-400"}`} />
          Документы ждут проверки
        </CardTitle>
        <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          Пакеты ассистента: принять или вернуть можно в карточке счета
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-center">
          <p className={`text-2xl sm:text-3xl font-bold ${empty ? "text-success" : "text-amber-600 dark:text-amber-400"}`} data-testid="text-packages-pending">
            {isLoading ? "…" : isError ? "-" : count}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isError ? "Не удалось загрузить" : empty ? "все проверено" : `${pluralizeRu(count, ["пакет", "пакета", "пакетов"])}, бонус ассистенту при принятии ${formatMoney(bonus)}`}
          </p>
        </div>
        {count > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="w-full" data-testid="trigger-packages-review">
              <div className="flex items-center justify-center gap-1 hover-elevate p-1 rounded cursor-pointer text-sm text-muted-foreground">
                <span>{open ? "Скрыть пакеты" : "Показать пакеты"}</span>
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-2 space-y-1">
                {packages.map(pkg => (
                  <Link
                    key={pkg.id}
                    to={`/invoices/${pkg.invoiceId}`}
                    className="block p-2 rounded-md hover-elevate text-sm"
                    data-testid={`link-package-${pkg.id}`}
                  >
                    <span className="font-medium">{pkg.invoiceNumber}</span>
                    {pkg.clientName ? `, ${pkg.clientName}` : ""}
                    <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {packageTitle(pkg)}, {pkg.documents} {pluralizeRu(pkg.documents, ["документ", "документа", "документов"])}, с {formatDate(pkg.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
