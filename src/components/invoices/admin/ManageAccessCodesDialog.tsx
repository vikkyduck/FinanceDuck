import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";

interface ManageAccessCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UserRole = 'admin' | 'assistant' | 'partner' | 'client';

export const ManageAccessCodesDialog = ({ open, onOpenChange }: ManageAccessCodesDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  
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
    const { data, error } = await supabase
      .from('access_tokens')
      .select(`
        *,
        partners(name),
        clients(name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTokens(data);
    }
  };

  const fetchPartners = async () => {
    const { data } = await supabase
      .from('partners')
      .select('id, name')
      .order('name');
    
    if (data) setPartners(data);
  };

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .order('name');
    
    if (data) setClients(data);
  };

  const generateCode = (role: UserRole) => {
    const prefix = {
      admin: 'ADM',
      assistant: 'AST',
      partner: 'PTR',
      client: 'CLT'
    }[role];
    
    // Generate cryptographically secure random code with 8 alphanumeric characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    
    const randomStr = Array.from(array)
      .map(x => chars[x % chars.length])
      .join('');
    
    return `${prefix}-${randomStr}`;
  };

  const handleCreateToken = async () => {
    setLoading(true);

    try {
      const code = newCode || generateCode(selectedRole);
      
      // Create access token (all role info is already in this table)
      const { error: tokenError } = await supabase
        .from('access_tokens')
        .insert({
          code: code.toUpperCase(),
          role: selectedRole,
          partner_id: selectedRole === 'partner' && selectedPartnerId ? selectedPartnerId : null,
          client_id: selectedRole === 'client' && selectedClientId ? selectedClientId : null,
          is_active: true,
        })
        .select()
        .single();

      if (tokenError) throw tokenError;

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

    setLoading(false);
  };

  const handleDeleteToken = async (id: string) => {
    // При деактивации токен автоматически удаляется триггером
    const { error } = await supabase
      .from('access_tokens')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    } else {
      toast({
        title: "Код удален",
        description: "Код доступа успешно удален",
      });
      fetchTokens();
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      admin: "destructive",
      assistant: "default",
      partner: "secondary",
      client: "outline",
    };
    return <Badge variant={variants[role]}>{role}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Управление кодами доступа</DialogTitle>
          <DialogDescription>
            Создавайте и управляйте кодами доступа для пользователей
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create new token */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Создать новый код
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                  <SelectTrigger>
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
                />
              </div>
            </div>

            {selectedRole === 'partner' && (
              <div className="space-y-2">
                <Label>Выберите партнера</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
              disabled={loading || (selectedRole === 'partner' && !selectedPartnerId) || (selectedRole === 'client' && !selectedClientId)}
              className="w-full"
            >
              Создать код
            </Button>
          </div>

          {/* Tokens list */}
          <div>
            <h3 className="font-semibold mb-4">Список кодов</h3>
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
                  {tokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell className="font-mono font-semibold">{token.code}</TableCell>
                      <TableCell>{getRoleBadge(token.role)}</TableCell>
                      <TableCell>
                        {token.partners?.name || token.clients?.name || '—'}
                      </TableCell>
                      <TableCell>
                        {token.last_used_at 
                          ? new Date(token.last_used_at).toLocaleDateString('ru-RU')
                          : 'Не использовался'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteToken(token.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
