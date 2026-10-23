import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { formatDate, formatMoney, pluralizeRu } from "@/lib/format";
import {
  packageBonus, packageStatusLabel, packageStatusVariant, packageTitle, refreshDocumentQueries, type PackageView,
} from "@/lib/documentPackages";

type Review = "accept" | "return" | "reopen";
const reviewToast: Record<Review, string> = { accept: "Пакет принят", return: "Пакет возвращен", reopen: "Принятие отменено" };

interface DocumentPackagesPanelProps {
  invoiceId: string;
  packages: PackageView[];
  isOwner: boolean;
}

/** Пакеты документов ассистента в карточке счета: статус, комментарий, решения владельца. */
export const DocumentPackagesPanel = ({ invoiceId, packages, isOwner }: DocumentPackagesPanelProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState<PackageView | null>(null);
  const [comment, setComment] = useState("");

  const review = useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: Review; comment?: string }) =>
      apiPost(`/document-packages/${id}/review`, { action, comment: comment ?? null }),
    onSuccess: (_, { action }) => {
      toast({ title: reviewToast[action] });
      refreshDocumentQueries(queryClient, invoiceId);
      setReturning(null);
      setComment("");
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      refreshDocumentQueries(queryClient, invoiceId);
    },
  });
  const busy = (id: string, action: Review) => review.isPending && review.variables?.id === id && review.variables.action === action;

  return (
    <div className="space-y-2" data-testid="panel-document-packages">
      <div>
        <p className="text-sm font-medium">Пакеты документов ассистента</p>
        <p className="text-xs text-muted-foreground">
          {isOwner
            ? "Примите пакет, если все документы в порядке: ассистенту начислится бонус. Если нужно исправить, верните пакет с комментарием."
            : `Бонус начисляется, когда владелец принимает пакет: ${formatMoney(packageBonus({ side: "client" }))} за документы клиента, ${formatMoney(packageBonus({ side: "executor" }))} за пакет каждого исполнителя.`}
        </p>
      </div>
      {packages.map(pkg => (
        <div key={pkg.id} className="p-3 rounded-md border space-y-2" data-testid={`package-${pkg.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{packageTitle(pkg)}</p>
            <Badge variant={packageStatusVariant[pkg.status]} data-testid={`badge-package-status-${pkg.id}`}>
              {packageStatusLabel[pkg.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {pkg.documents} {pluralizeRu(pkg.documents, ["документ", "документа", "документов"])}, бонус {formatMoney(packageBonus(pkg))}
            {pkg.status === "accepted" && pkg.acceptedAt ? `, принят ${formatDate(pkg.acceptedAt)}` : ""}
          </p>
          {pkg.reviewComment && pkg.status !== "accepted" && (
            <p className="text-sm [overflow-wrap:anywhere]" data-testid={`text-package-comment-${pkg.id}`}>
              <span className="text-muted-foreground">{pkg.status === "returned" ? "Что исправить: " : "Было при возврате: "}</span>
              {pkg.reviewComment}
            </p>
          )}
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              {pkg.status !== "accepted" && (
                <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: pkg.id, action: "accept" })} data-testid={`button-accept-package-${pkg.id}`}>
                  {busy(pkg.id, "accept") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                  Принять
                </Button>
              )}
              {pkg.status === "pending" && (
                <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => { setReturning(pkg); setComment(""); }} data-testid={`button-return-package-${pkg.id}`}>
                  <Undo2 className="h-4 w-4 mr-1" />
                  Вернуть
                </Button>
              )}
              {pkg.status === "accepted" && (
                <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => review.mutate({ id: pkg.id, action: "reopen" })} data-testid={`button-reopen-package-${pkg.id}`}>
                  {busy(pkg.id, "reopen") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                  Отменить принятие
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      <Dialog open={!!returning} onOpenChange={open => { if (!open) setReturning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вернуть пакет ассистенту</DialogTitle>
            <DialogDescription>
              {returning ? packageTitle(returning) : ""}. Ассистент увидит комментарий в карточке счета и на главной.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="package-return-comment">Что исправить</Label>
            <Textarea
              id="package-return-comment"
              value={comment}
              maxLength={2000}
              onChange={event => setComment(event.target.value)}
              placeholder="Например: нет подписи исполнителя на акте"
              data-testid="input-package-return-comment"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturning(null)}>Отмена</Button>
            <Button
              disabled={review.isPending || !comment.trim()}
              onClick={() => returning && review.mutate({ id: returning.id, action: "return", comment: comment.trim() })}
              data-testid="button-confirm-return-package"
            >
              {review.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1" />}
              Вернуть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
