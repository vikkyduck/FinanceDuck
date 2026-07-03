import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";

interface ManageAccessCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UserRole = 'admin' | 'assistant' | 'partner' | 'client';

interface AccessToken {
  id: string;
  code: string;
  role: UserRole;
  partnerId?: string | null;
  clientId?: string | null;
  partnerName?: string;
  clientName?: string;
  lastUsedAt?: string | null;
  createdAt?: string;
}

interface Partner {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
}

export const ManageAccessCodesDialog = ({ open, onOpenChange }: ManageAccessCodesDialogProps) => {
  const { toast } = useToast();
  const { csrfToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  
  const [newCode, setNewCode] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("assistant");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  useEffect(() => {
    if (open) {
      fetchTokens();
      fetchPartners();
      fetchClients();
    }
  }, [open]);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/access-tokens', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTokens(data);
      } else {
        throw new Error('Не удалось загрузить коды');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPartners = async () => {
    try {
      const response = await fetch('/api/partners', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPartners(data);
      }
    } catch (error) {
      console.error('Failed to fetch partners:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const generateCode = (role: UserRole) => {
    const prefix = {
      admin: 'ADM',
      assistant: 'AST',
      partner: 'PTR',
      client: 'CLT'
    }[role];
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    
    const randomStr = Array.from(array)
      .map(x => chars[x % chars.length])
      .join('');
    
    return `${prefix}-${randomStr}`;
  };

  const handleCreateToken = async () => {
    setCreating(true);

    try {
      const code = newCode || generateCode(selectedRole);
      
      const response = await fetch('/api/access-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          code: code.toUpperCase(),
          role: selectedRole,
          partnerId: selectedRole === 'partner' && selectedPartnerId ? selectedPartnerId : null,
          clientId: selectedRole === 'client' && selectedClientId ? selectedClientId : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка создания кода');
      }

      toast({
        title: "Код создан",
        description: `Код доступа ${code.toUpperCase()} успешно создан`,
      });

      setNewCode("");
      setSelectedRole("assistant");
      setSelectedPartnerId("");
      setSelectedClientId("");
      fetchTokens();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    }

    setCreating(false);
  };

  const handleDeleteToken = async (id: string) => {
    try {
      const response = await fetch(`/api/access-tokens/${id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken || '',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка удаления');
      }

      toast({
        title: "Код удален",
        description: "Код доступа успешно удален",
      });
      fetchTokens();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const labels: Record<string, string> = {
      admin: "Админ",
      assistant: "Ассистент",
      partner: "Партнер",
      client: "Клиент",
    };
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      admin: "destructive",
      assistant: "default",
      partner: "secondary",
      client: "outline",
    };
    return <Badge variant={variants[role]}>{labels[role] || role}</Badge>;
  };

  const isCreateDisabled = creating || 
    (selectedRole === 'partner' && !selectedPartnerId) || 
    (selectedRole === 'client' && !selectedClientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Управление кодами доступа</DialogTitle>
          <DialogDescription>
            Создавайте и управляйте кодами доступа для пользователей
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Создать новый код
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Администратор</SelectItem>
                    <SelectItem value="assistant">Ассистент</SelectItem>
                    <SelectItem value="partner">Партнер</SelectItem>
                    <SelectItem value="client">Клиент</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Код (оставьте пустым для автогенерации)</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder={generateCode(selectedRole)}
                  className="uppercase font-mono"
                  maxLength={20}
                  data-testid="input-code"
                />
              </div>
            </div>

            {selectedRole === 'partner' && (
              <div className="space-y-2">
                <Label>Выберите партнера</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger data-testid="select-partner">
                    <SelectValue placeholder="Выберите партнера" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedRole === 'client' && (
              <div className="space-y-2">
                <Label>Выберите клиента</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-client">
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button 
              onClick={handleCreateToken} 
              disabled={isCreateDisabled}
              className="w-full"
              data-testid="button-create-code"
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать код
            </Button>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Список кодов</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Код</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Привязка</TableHead>
                      <TableHead>Последнее использование</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Нет созданных кодов
                        </TableCell>
                      </TableRow>
                    ) : (
                      tokens.map((token) => (
                        <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                          <TableCell className="font-mono font-semibold">{token.code}</TableCell>
                          <TableCell>{getRoleBadge(token.role)}</TableCell>
                          <TableCell>
                            {token.partnerName || token.clientName || '—'}
                          </TableCell>
                          <TableCell>
                            {token.lastUsedAt 
                              ? formatDate(token.lastUsedAt)
                              : 'Не использовался'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteToken(token.id)}
                              data-testid={`button-delete-token-${token.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
