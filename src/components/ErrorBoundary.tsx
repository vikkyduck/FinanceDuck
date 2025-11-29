import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isAuthError = this.state.error?.message?.includes('401') || 
                          this.state.error?.message?.includes('Unauthorized') ||
                          this.state.error?.message?.includes('session');

      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {isAuthError ? "Сессия истекла" : "Произошла ошибка"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isAuthError 
                  ? "Ваша сессия истекла. Пожалуйста, войдите снова."
                  : "Что-то пошло не так. Попробуйте обновить страницу."}
              </p>
              <div className="flex gap-2">
                {isAuthError ? (
                  <Button onClick={() => window.location.href = '/auth'} className="flex-1">
                    Войти снова
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={this.handleRetry} className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Повторить
                    </Button>
                    <Button onClick={this.handleReload} className="flex-1">
                      Обновить страницу
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
