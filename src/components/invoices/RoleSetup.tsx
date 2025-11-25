import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, UserCog, Shield, User } from "lucide-react";
import { useEffect } from "react";

type UserRole = 'assistant' | 'partner' | 'admin' | 'client';

export const RoleSetup = ({ onRoleAssigned }: { onRoleAssigned: () => void }) => {
  const { toast } = useToast();
  const [role, setRole] = useState<UserRole>('assistant');
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    const { data } = await supabase
      .from("partners")
      .select("*")
      .order("name");
    
    setPartners(data || []);
  };

  const handleSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);

    try {
      const roleData: any = {
        user_id: user.id,
        role: role,
      };

      if (role === 'partner' && selectedPartner) {
        roleData.partner_id = selectedPartner;
      }

      const { error } = await supabase
        .from("user_roles")
        .insert(roleData);

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Роль назначена",
      });

      // Reload the page to fetch the new role
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Выберите роль</CardTitle>
          <CardDescription>
            Выберите вашу роль в системе для начала работы
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <div className="space-y-3">
              <Label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="assistant" id="assistant" />
                <UserCog className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium">Ассистент</div>
                  <div className="text-sm text-muted-foreground">
                    Создание счетов и управление расходами
                  </div>
                </div>
              </Label>

              <Label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="partner" id="partner" />
                <Users className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium">Партнер</div>
                  <div className="text-sm text-muted-foreground">
                    Просмотр своих счетов и расчетов
                  </div>
                </div>
              </Label>

              <Label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="admin" id="admin" />
                <Shield className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium">Администратор</div>
                  <div className="text-sm text-muted-foreground">
                    Полный доступ ко всем функциям
                  </div>
                </div>
              </Label>

              <Label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="client" id="client" />
                <User className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium">Клиент</div>
                  <div className="text-sm text-muted-foreground">
                    Просмотр своих счетов и остатков
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {role === 'partner' && (
            <div className="space-y-2">
              <Label>Выберите партнера</Label>
              <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите из списка" />
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

          <Button 
            className="w-full" 
            onClick={handleSubmit} 
            disabled={loading || (role === 'partner' && !selectedPartner)}
          >
            {loading ? "Сохранение..." : "Продолжить"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
