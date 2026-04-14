import { AlertTriangle, X, ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreditAlerts } from "@/hooks/useCreditAlerts";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export function CreditAlertBanner() {
  const { alerts, markAsRead, dismissAlert } = useCreditAlerts({ onlyUnread: true });
  const [dismissed, setDismissed] = useState(false);

  const importantAlerts = alerts.filter(
    a => (a.alert_severity === "critical" || a.alert_severity === "warning") && !a.is_read
  );

  if (dismissed || importantAlerts.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-destructive" />
          <span className="font-semibold text-sm text-destructive">
            {importantAlerts.length} Credit Alert{importantAlerts.length > 1 ? "s" : ""} Requiring Attention
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissed(true)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="space-y-1.5">
        {importantAlerts.slice(0, 3).map(alert => (
          <div
            key={alert.id}
            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/10 rounded px-2 py-1 transition-colors"
            onClick={() => markAsRead(alert.id)}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              alert.alert_severity === "critical" ? "bg-destructive" : "bg-amber-500"
            }`} />
            <span className="font-medium text-foreground flex-1 truncate">{alert.alert_title}</span>
            {alert.bureau && (
              <span className="text-xs text-muted-foreground capitalize">{alert.bureau}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
