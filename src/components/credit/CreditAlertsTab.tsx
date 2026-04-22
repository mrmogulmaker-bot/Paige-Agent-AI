import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreditAlerts, CreditAlert } from "@/hooks/useCreditAlerts";
import { formatDistanceToNow, format } from "date-fns";
import { Check, X, Bell, AlertTriangle, Info, Shield, CheckCircle } from "lucide-react";
import { trackEvent } from "@/hooks/useAnalytics";

interface CreditAlertsTabProps {
  clientId?: string | null;
}

export function CreditAlertsTab({ clientId }: CreditAlertsTabProps) {
  const { alerts, loading, unreadCount, markAsRead, markAllAsRead, dismissAlert, dismissAllInformational } = useCreditAlerts({ clientId, limit: 100 });
  const [filter, setFilter] = useState<"all" | "unread" | "critical" | "warning" | "informational">("all");

  const filtered = alerts.filter(a => {
    if (filter === "unread") return !a.is_read;
    if (filter === "critical") return a.alert_severity === "critical";
    if (filter === "warning") return a.alert_severity === "warning";
    if (filter === "informational") return a.alert_severity === "informational";
    return true;
  });

  const severityConfig = {
    critical: { color: "bg-destructive text-destructive-foreground", icon: Shield, dot: "bg-destructive" },
    warning: { color: "bg-amber-500/20 text-amber-700 dark:text-amber-400", icon: AlertTriangle, dot: "bg-amber-500" },
    informational: { color: "bg-blue-500/20 text-blue-700 dark:text-blue-400", icon: Info, dot: "bg-blue-500" },
  };

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading alerts...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <h2 className="text-xl font-bold">Credit Alerts</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} unread</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <Check className="w-3.5 h-3.5 mr-1" /> Mark All Read
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={dismissAllInformational}>
            Dismiss Informational
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({alerts.length})</TabsTrigger>
          <TabsTrigger value="unread">Unread ({alerts.filter(a => !a.is_read).length})</TabsTrigger>
          <TabsTrigger value="critical">Critical ({alerts.filter(a => a.alert_severity === "critical").length})</TabsTrigger>
          <TabsTrigger value="warning">Warnings ({alerts.filter(a => a.alert_severity === "warning").length})</TabsTrigger>
          <TabsTrigger value="informational">Info ({alerts.filter(a => a.alert_severity === "informational").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No alerts to display</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => {
            const config = severityConfig[alert.alert_severity];
            const Icon = config.icon;

            return (
              <Card
                key={alert.id}
                className={`transition-colors cursor-pointer ${!alert.is_read ? "border-accent/30 bg-accent/5" : ""}`}
                onClick={() =>
                  void trackEvent("credit_alert_viewed", "engagement", {
                    alert_type: alert.alert_type,
                    severity: alert.alert_severity,
                    bureau: alert.bureau ?? null,
                  })
                }
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className={`w-2 rounded-full flex-shrink-0 ${config.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{alert.alert_title}</span>
                          <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                            {alert.alert_severity}
                          </Badge>
                          {alert.bureau && (
                            <Badge variant="outline" className="text-[10px] capitalize">{alert.bureau}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!alert.is_read && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markAsRead(alert.id)} title="Mark as read">
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dismissAlert(alert.id)} title="Dismiss">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.alert_description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                        {alert.previous_value && alert.new_value && (
                          <span className="font-mono">{alert.previous_value} → {alert.new_value}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
