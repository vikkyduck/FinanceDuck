import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Upload, FileText, Download, Trash2, Loader2, Building2, User } from "lucide-react";
import { formatDate } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ActType = 'executor' | 'company';
type UserRole = 'admin' | 'assistant' | 'partner' | 'client';

interface SignedAct {
  id: string;
  invoiceId: string;
  actType: ActType;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

interface SignedActsSectionProps {
  invoiceId: string;
  userRole: UserRole;
  canEdit?: boolean;
}

export const SignedActsSection = ({ invoiceId, userRole, canEdit = false }: SignedActsSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadingType, setUploadingType] = useState<ActType | null>(null);
  const [deleteAct, setDeleteAct] = useState<{ id: string; fileName: string } | null>(null);

  const { data: acts = [], isLoading } = useQuery<SignedAct[]>({
    queryKey: ['/api/invoices', invoiceId, 'acts'],
    queryFn: () => apiGet(`/invoices/${invoiceId}/acts`),
    enabled: !!invoiceId,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ actType, file }: { actType: ActType; file: File }) => {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      return apiPost(`/invoices/${invoiceId}/acts`, {
        actType,
        fileName: file.name,
        fileData,
        mimeType: file.type,
      });
    },
    onSuccess: () => {
      toast({ title: "Акт загружен" });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'acts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
      setUploadingType(null);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
      setUploadingType(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (actId: string) => apiDelete(`/acts/${actId}`),
    onSuccess: () => {
      toast({ title: "Акт удален" });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'acts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (actType: ActType) => {
    setUploadingType(actType);
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "Файл слишком большой",
            description: "Максимальный размер файла: 10 МБ",
            variant: "destructive",
          });
          setUploadingType(null);
          return;
        }
        uploadMutation.mutate({ actType, file });
      } else {
        setUploadingType(null);
      }
    };
    input.click();
  };

  const handleDownload = async (act: SignedAct) => {
    try {
      const data = await apiGet<{ fileName: string; fileData: string; mimeType: string }>(`/acts/${act.id}/download`);
      
      const link = document.createElement('a');
      link.href = data.fileData;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      toast({
        title: "Ошибка скачивания",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const executorActs = acts.filter(a => a.actType === 'executor');
  const companyActs = acts.filter(a => a.actType === 'company');

  const canUpload = userRole === 'admin' || userRole === 'assistant';
  const canSeeExecutorActs = userRole === 'admin' || userRole === 'assistant';

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Подписанные акты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Подписанные акты</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Building2 className="h-3 w-3" />
              Компания: {companyActs.length}
            </Badge>
            {canSeeExecutorActs && (
              <Badge variant="outline" className="gap-1">
                <User className="h-3 w-3" />
                Исполнители: {executorActs.length}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {canUpload && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFileSelect('company')}
                disabled={uploadMutation.isPending}
                data-testid="button-upload-company-act"
              >
                {uploadingType === 'company' && uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Загрузить акт компании
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFileSelect('executor')}
                disabled={uploadMutation.isPending}
                data-testid="button-upload-executor-act"
              >
                {uploadingType === 'executor' && uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Загрузить акт исполнителя
              </Button>
            </div>
          )}

          {/* Company Acts - visible to all */}
          {companyActs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Акты компании-клиента
              </Label>
              <div className="space-y-2">
                {companyActs.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border bg-card"
                    data-testid={`act-company-${act.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{act.fileName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(act.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownload(act)}
                        data-testid={`button-download-act-${act.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canUpload && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteAct({ id: act.id, fileName: act.fileName })}
                          data-testid={`button-delete-act-${act.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executor Acts - only visible to admin/assistant */}
          {canSeeExecutorActs && executorActs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                Акты исполнителей
              </Label>
              <div className="space-y-2">
                {executorActs.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border bg-card"
                    data-testid={`act-executor-${act.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-green-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{act.fileName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(act.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownload(act)}
                        data-testid={`button-download-act-${act.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canUpload && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteAct({ id: act.id, fileName: act.fileName })}
                          data-testid={`button-delete-act-${act.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {acts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Акты еще не загружены
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteAct} onOpenChange={() => setDeleteAct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить акт?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить "{deleteAct?.fileName}"? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAct) {
                  deleteMutation.mutate(deleteAct.id);
                  setDeleteAct(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
