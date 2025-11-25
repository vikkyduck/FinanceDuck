import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Shield, Activity, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_identifier: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: any;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface LoginAttempt {
  id: string;
  access_code: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface RateLimitViolation {
  id: string;
  user_identifier: string;
  limit_type: string;
  violation_count: number;
  last_violation_at: string;
  blocked_until: string | null;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const getEventTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'login_success': 'Успешный вход',
    'login_failure': 'Неудачная попытка входа',
    'rate_limit_exceeded': 'Превышение лимита запросов',
    'bulk_operation': 'Массовая операция',
    'data_export': 'Экспорт данных',
    'admin_action': 'Действие администратора',
    'suspicious_pattern': 'Подозрительная активность',
    'account_locked': 'Блокировка аккаунта',
    'account_unlocked': 'Разблокировка аккаунта'
  };
  return labels[type] || type;
};

import { SecurityTestRunner } from "@/components/security/SecurityTestRunner";

export default function SecurityMonitoring() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [violations, setViolations] = useState<RateLimitViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEvents24h: 0,
    criticalEvents: 0,
    failedLogins24h: 0,
    activeViolations: 0
  });

  const fetchSecurityData = async () => {
    try {
      setLoading(true);

      // Fetch unresolved high/critical events
      const { data: eventsData, error: eventsError } = await supabase
        .from('security_events')
        .select('*')
        .in('severity', ['high', 'critical'])
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;
      setEvents(eventsData || []);

      // Fetch recent login attempts (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('login_attempts')
        .select('*')
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(100);

      if (attemptsError) throw attemptsError;
      setLoginAttempts(attemptsData || []);

      // Fetch active rate limit violations
      const { data: violationsData, error: violationsError } = await supabase
        .from('rate_limit_violations')
        .select('*')
        .not('blocked_until', 'is', null)
        .gte('blocked_until', new Date().toISOString())
        .order('last_violation_at', { ascending: false });

      if (violationsError) throw violationsError;
      setViolations(violationsData || []);

      // Calculate stats
      const { count: totalCount } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday);

      const { count: criticalCount } = await supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .in('severity', ['high', 'critical'])
        .eq('resolved', false);

      setStats({
        totalEvents24h: totalCount || 0,
        criticalEvents: criticalCount || 0,
        failedLogins24h: attemptsData?.filter(a => !a.success).length || 0,
        activeViolations: violationsData?.length || 0
      });

    } catch (error) {
      console.error('Error fetching security data:', error);
      toast.error('Ошибка загрузки данных безопасности');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  // Real-time updates for security events
  useRealtimeSubscription({
    channelName: 'security_events_monitor',
    table: 'security_events',
    onUpdate: () => {
      fetchSecurityData();
    },
    enabled: true
  });

  // Real-time updates for login attempts
  useRealtimeSubscription({
    channelName: 'login_attempts_monitor',
    table: 'login_attempts',
    onUpdate: () => {
      fetchSecurityData();
    },
    enabled: true
  });

  const handleResolveEvent = async (eventId: string) => {
    try {
      const { error } = await supabase.rpc('resolve_security_event', {
        _event_id: eventId
      });

      if (error) throw error;

      toast.success('Событие отмечено как решённое');
      fetchSecurityData();
    } catch (error) {
      console.error('Error resolving event:', error);
      toast.error('Ошибка при разрешении события');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Мониторинг безопасности</h1>
            <p className="text-muted-foreground">
              Отслеживание попыток входа, событий безопасности и подозрительной активности
            </p>
          </div>
          <Shield className="h-10 w-10 text-primary" />
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">События за 24ч</h3>
            </div>
            <p className="text-3xl font-bold mt-2">{stats.totalEvents24h}</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h3 className="text-sm font-medium text-muted-foreground">Критические события</h3>
            </div>
            <p className="text-3xl font-bold mt-2 text-destructive">{stats.criticalEvents}</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <h3 className="text-sm font-medium text-muted-foreground">Неудачные входы</h3>
            </div>
            <p className="text-3xl font-bold mt-2">{stats.failedLogins24h}</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary" />
              <h3 className="text-sm font-medium text-muted-foreground">Активные блокировки</h3>
            </div>
            <p className="text-3xl font-bold mt-2">{stats.activeViolations}</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="alerts" className="w-full">
          <TabsList>
            <TabsTrigger value="alerts">Критические события</TabsTrigger>
            <TabsTrigger value="logins">Попытки входа</TabsTrigger>
            <TabsTrigger value="violations">Нарушения лимитов</TabsTrigger>
            <TabsTrigger value="tests">Тесты безопасности</TabsTrigger>
          </TabsList>

          {/* Critical Events */}
          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Нерешённые события высокой важности</h2>
                {loading ? (
                  <p className="text-muted-foreground">Загрузка...</p>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mb-4" />
                    <p>Критических событий не обнаружено</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Тип события</TableHead>
                        <TableHead>Важность</TableHead>
                        <TableHead>Пользователь</TableHead>
                        <TableHead>Детали</TableHead>
                        <TableHead>Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(event.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                          </TableCell>
                          <TableCell>{getEventTypeLabel(event.event_type)}</TableCell>
                          <TableCell>
                            <Badge variant={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {event.user_identifier || '-'}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {JSON.stringify(event.details)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveEvent(event.id)}
                            >
                              Решено
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Login Attempts */}
          <TabsContent value="logins" className="space-y-4">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Попытки входа за последние 24 часа</h2>
                {loading ? (
                  <p className="text-muted-foreground">Загрузка...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Код доступа</TableHead>
                        <TableHead>Результат</TableHead>
                        <TableHead>IP адрес</TableHead>
                        <TableHead>Причина отказа</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginAttempts.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(attempt.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}
                          </TableCell>
                          <TableCell className="font-mono">{attempt.access_code}</TableCell>
                          <TableCell>
                            {attempt.success ? (
                              <Badge variant="outline" className="bg-green-50">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Успешно
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                Неудача
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {attempt.ip_address || '-'}
                          </TableCell>
                          <TableCell>{attempt.failure_reason || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Rate Limit Violations */}
          <TabsContent value="violations" className="space-y-4">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Активные блокировки по лимитам</h2>
                {loading ? (
                  <p className="text-muted-foreground">Загрузка...</p>
                ) : violations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mb-4" />
                    <p>Активных блокировок нет</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Идентификатор</TableHead>
                        <TableHead>Тип лимита</TableHead>
                        <TableHead>Количество нарушений</TableHead>
                        <TableHead>Последнее нарушение</TableHead>
                        <TableHead>Заблокирован до</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {violations.map((violation) => (
                        <TableRow key={violation.id}>
                          <TableCell className="font-mono text-sm">
                            {violation.user_identifier}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{violation.limit_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">{violation.violation_count}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(violation.last_violation_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {violation.blocked_until 
                              ? format(new Date(violation.blocked_until), 'dd.MM.yyyy HH:mm', { locale: ru })
                              : '-'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>
          
          {/* Security Tests */}
          <TabsContent value="tests" className="space-y-4">
            <SecurityTestRunner />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
