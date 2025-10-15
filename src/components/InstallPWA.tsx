import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useState } from "react";

export const InstallPWA = () => {
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || dismissed) return null;

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (installed) {
      setDismissed(true);
    }
  };

  return (
    <Card className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 p-4 shadow-glow z-50 bg-card border-accent/20">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">Install Paige AI</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Install our app for quick access and offline features
          </p>
          <div className="flex gap-2">
            <Button onClick={handleInstall} size="sm" className="bg-accent hover:bg-accent/90">
              Install
            </Button>
            <Button 
              onClick={() => setDismissed(true)} 
              size="sm" 
              variant="ghost"
            >
              Not now
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};
