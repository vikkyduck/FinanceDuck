import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  HardDrive,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { apiPost, apiDelete } from "@/lib/api";
import { showSuccess } from "@/lib/errorHandler";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BackupInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  type: "auto" | "manual";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null);

  const { data: backups, isLoading, error } = useQuery<BackupInfo[]>({
    queryKey: ["/api/backups"],
    staleTime: 30000,
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      return apiPost<BackupInfo>("/backups");
    },
    onSuccess: (backup) => {
      showSuccess("Готово", `Бэкап создан: ${backup.filename}`);
      queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось создать бэкап", variant: "destructive" });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      return apiPost(`/backups/${encodeURIComponent(backupId)}/restore`);
    },
    onSuccess: () => {
      showSuccess("Готово", "Данные успешно восстановлены из бэкапа");
      setRestoreBackupId(null);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось восстановить данные", variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      return apiDelete(`/backups/${encodeURIComponent(backupId)}`);
    },
    onSuccess: () => {
      showSuccess("Готово", "Бэкап удалён");
      setDeleteBackupId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/backups"] });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось удалить бэкап", variant: "destructive" });
    },
  });

  const handleDownload = (backup: BackupInfo) => {
    const downloadUrl = `/api/backups/${encodeURIComponent(backup.id)}/download`;
    window.open(downloadUrl, "_blank");
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p>Не удалось загрузить список бэкапов.</p>
            <p className="text-sm mt-1">
              Убедитесь, что настроено хранилище (BACKUP_BUCKET_NAME).
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4" />
          Резервные копии
        </CardTitle>
        <Button
          onClick={() => createBackupMutation.mutate()}
          disabled={createBackupMutation.isPending}
          data-testid="button-create-backup"
        >
          {createBackupMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Создать бэкап
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-4">
          Автоматические бэкапы создаются ежедневно в 3:00. Хранятся последние 7
          автоматических копий.
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !backups || backups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Нет резервных копий</p>
            <p className="text-sm mt-1">
              Создайте первый бэкап вручную или дождитесь автоматического.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card"
                data-testid={`backup-item-${backup.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {backup.filename}
                    </span>
                    <Badge
                      variant={backup.type === "auto" ? "secondary" : "default"}
                      className="text-xs"
                    >
                      {backup.type === "auto" ? "Авто" : "Ручной"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {backup.createdAt
                        ? format(new Date(backup.createdAt), "d MMM yyyy, HH:mm", {
                            locale: ru,
                          })
                        : "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDownload(backup)}
                    title="Скачать"
                    data-testid={`button-download-backup-${backup.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRestoreBackupId(backup.id)}
                    title="Восстановить"
                    data-testid={`button-restore-backup-${backup.id}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteBackupId(backup.id)}
                    title="Удалить"
                    data-testid={`button-delete-backup-${backup.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!restoreBackupId}
        onOpenChange={() => setRestoreBackupId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Восстановление из бэкапа
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Внимание!</strong> Все текущие данные будут заменены данными
              из выбранной резервной копии. Это действие нельзя отменить.
              <br />
              <br />
              Рекомендуется сначала создать бэкап текущего состояния.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                restoreBackupId && restoreBackupMutation.mutate(restoreBackupId)
              }
              disabled={restoreBackupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoreBackupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Восстановление...
                </>
              ) : (
                "Восстановить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteBackupId}
        onOpenChange={() => setDeleteBackupId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить резервную копию?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить эту резервную копию? Это действие
              нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteBackupId && deleteBackupMutation.mutate(deleteBackupId)
              }
              disabled={deleteBackupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBackupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
