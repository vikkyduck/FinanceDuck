import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ApiStatusBannerProps {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
}

export const ApiStatusBanner = ({ isHealthy, isChecking, error }: ApiStatusBannerProps) => {
  if (isChecking) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-muted/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <Wifi className="h-4 w-4 animate-pulse text-muted-foreground" />
            <span className="text-muted-foreground">Проверка подключения к серверу...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isHealthy && error) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-destructive/10 backdrop-blur-sm border-b border-destructive/20">
        <div className="container mx-auto px-4 py-4">
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="text-base font-semibold">Сервер недоступен</AlertTitle>
            <AlertDescription className="text-sm mt-2">
              <div className="flex items-start gap-2">
                <WifiOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{error}</p>
                  <p className="mt-1 text-muted-foreground">
                    Пожалуйста, проверьте подключение к интернету или попробуйте позже.
                  </p>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return null;
};
