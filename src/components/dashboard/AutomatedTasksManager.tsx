import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Calendar, RefreshCw, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface NotificationPreference {
  id: string;
  alert_type: string;
  channel: string;
  enabled: boolean;
}

export function AutomatedTasksManager() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('id, alert_type, channel, enabled')
        .eq('user_id', user.id);

      if (error) throw error;
      setPreferences(data || []);
    } catch (error: any) {
      toast.error("Failed to load preferences", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const togglePreference = async (id: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .update({ enabled: !currentEnabled })
        .eq('id', id);

      if (error) throw error;

      setPreferences(prev =>
        prev.map(p => p.id === id ? { ...p, enabled: !currentEnabled } : p)
      );

      toast.success(
        !currentEnabled ? "Automation enabled" : "Automation disabled"
      );
    } catch (error: any) {
      toast.error("Failed to update preference", {
        description: error.message
      });
    }
  };

  const triggerBusinessCreditSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.rpc('trigger_business_credit_sync', {
        _user_id: (await supabase.auth.getUser()).data.user?.id
      });

      if (error) throw error;

      toast.success("Business credit sync initiated", {
        description: "Your business credit reports will be updated shortly"
      });
    } catch (error: any) {
      toast.error("Failed to sync business credit", {
        description: error.message
      });
    } finally {
      setSyncing(false);
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      task_due_soon: "Task Reminders",
      credit_score_change: "Credit Score Alerts",
      funding_opportunity: "Funding Opportunities",
      balance_threshold: "Balance Alerts",
      nsf_detection: "NSF Alerts"
    };
    return labels[type] || type;
  };

  const getAlertTypeIcon = (type: string) => {
    if (type.includes('credit')) return CheckCircle2;
    if (type.includes('task')) return Calendar;
    return Bell;
  };

  if (loading) {
    return <div className="text-center p-8">Loading automated tasks...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Automated Reminders
          </CardTitle>
          <CardDescription>
            Configure automatic notifications and reminders. These run every hour checking your preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {preferences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notification preferences found. Set them up in Settings.
              </p>
            ) : (
              preferences.map((pref) => {
                const Icon = getAlertTypeIcon(pref.alert_type);
                return (
                  <div
                    key={pref.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Label className="font-medium">
                          {getAlertTypeLabel(pref.alert_type)}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          via {pref.channel.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={pref.enabled ? "default" : "secondary"}>
                        {pref.enabled ? "Active" : "Paused"}
                      </Badge>
                      <Switch
                        checked={pref.enabled}
                        onCheckedChange={() => togglePreference(pref.id, pref.enabled)}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Credit Monitoring
          </CardTitle>
          <CardDescription>
            Automatically sync business credit reports daily at 2 AM. You can also trigger a manual sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label className="font-medium">Daily Credit Sync</Label>
                <p className="text-sm text-muted-foreground">
                  Runs automatically every day at 2:00 AM
                </p>
              </div>
            </div>
            <Button
              onClick={triggerBusinessCreditSync}
              disabled={syncing}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}