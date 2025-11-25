import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Wallet, LogIn, Loader2 } from "lucide-react";

const AccessCodeLogin = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Check if already logged in
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await login(code.toUpperCase());

      if (!result.success) {
        if (result.error === 'account_locked') {
          const lockedUntil = new Date(result.locked_until!);
          const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
          toast({
            variant: "destructive",
            title: "Аккаунт заблокирован",
            description: result.message || `Попробуйте снова через ${minutesRemaining} мин.`,
          });
        } else if (result.error === 'invalid_code') {
          const attemptsRemaining = result.attempts_remaining || 0;
          toast({
            variant: "destructive",
            title: "Неверный код",
            description: attemptsRemaining <= 2 && attemptsRemaining > 0
              ? `Осталось попыток: ${attemptsRemaining}. После исчерпания попыток аккаунт будет временно заблокирован.`
              : result.message || "Код доступа не найден или деактивирован",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Ошибка входа",
            description: result.message || "Не удалось войти в систему",
          });
        }
        setLoading(false);
        return;
      }

      console.log('[AccessCodeLogin] Login successful, navigating to /');
      toast({
        title: "Вход выполнен",
        description: "Добро пожаловать!",
      });

      // Small delay to ensure state is updated
      setTimeout(() => {
        console.log('[AccessCodeLogin] Executing navigate("/")');
        navigate("/");
      }, 100);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка входа",
        description: "Произошла ошибка при входе",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-lg px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/5 mb-6">
            <Wallet className="h-10 w-10 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="text-5xl font-semibold mb-4 tracking-tight">
            Добро пожаловать
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Система управления счетами и документами
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="pt-8 pb-8 px-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="code" className="text-base font-medium">
                  Код доступа
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Введите ваш код"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={loading}
                  className="h-14 text-lg"
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-14 text-base font-medium"
                disabled={loading || !code}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Вход...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-5 w-5" />
                    Войти
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AccessCodeLogin;
