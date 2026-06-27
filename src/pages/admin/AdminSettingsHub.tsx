import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, Bell, Shield, Activity, Settings as SettingsIcon, ExternalLink, KanbanSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { UserManagement } from "@/components/dashboard/UserManagement";
import { SystemMetrics } from "@/components/dashboard/admin/SystemMetrics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FlagKey =
  | "broker_auto_approve"
  | "require_email_confirmation"
  | "allow_public_signups"
  | "show_affiliate_program";

const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  broker_auto_approve: false,
  require_email_confirmation: true,
  allow_public_signups: true,
  show_affiliate_program: true,
};

const FLAG_META: Record<FlagKey, { label: string; description: string }> = {
  broker_auto_approve: {
    label: "Auto-approve broker applications",
    description:
      "New broker applicants are activated immediately without manual review.",
  },
  require_email_confirmation: {
    label: "Require email confirmation on signup",
    description:
      "Users must click the verification link before they can sign in.",
  },
  allow_public_signups: {
    label: "Allow public signups",
    description:
      "Turn off to lock down signups to invitation-only while you make changes.",
  },
  show_affiliate_program: {
    label: "Show affiliate program in client app",
    description:
      "Reveals affiliate links and earning widgets in the client dashboard.",
  },
};

export function AdminSettingsHub() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage team access, platform behavior, and system health from one place.
        </p>
      </div>

      <Tabs defaultValue="team" className="space-y-4">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="team" className="gap-2">
            <Shield className="w-4 h-4" /> Team & Roles
          </TabsTrigger>
          <TabsTrigger value="pipelines" className="gap-2">
            <KanbanSquare className="w-4 h-4" /> Pipelines
          </TabsTrigger>
          <TabsTrigger value="platform" className="gap-2">
            <SettingsIcon className="w-4 h-4" /> Platform
          </TabsTrigger>
          <TabsTrigger value="comms" className="gap-2">
            <Bell className="w-4 h-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Activity className="w-4 h-4" /> System Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-4">
          <UserManagement />
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KanbanSquare className="w-4 h-4" /> Sales Pipelines
              </CardTitle>
              <CardDescription>
                Build multiple pipelines with custom stages, win probabilities, and won/lost rules. Power your weighted forecast and Paige's CRM automations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/admin/settings/pipelines">
                  Configure pipelines
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platform" className="space-y-4">
          <PlatformSettingsPanel />
        </TabsContent>

        <TabsContent value="comms" className="space-y-4">
          <NotificationsCommsPanel />
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <SystemMetrics />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlatformSettingsPanel() {
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>({ ...FLAG_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<FlagKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const keys = Object.keys(FLAG_DEFAULTS) as FlagKey[];
      const { data, error } = await supabase
        .from("admin_app_settings")
        .select("key, value")
        .in("key", keys);
      if (cancelled) return;
      if (!error && data) {
        const next = { ...FLAG_DEFAULTS };
        for (const row of data) {
          const k = row.key as FlagKey;
          const v = row.value as { enabled?: boolean } | null;
          if (k in next && typeof v?.enabled === "boolean") {
            next[k] = v.enabled;
          }
        }
        setFlags(next);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFlag = async (key: FlagKey, enabled: boolean) => {
    setSaving(key);
    const previous = flags[key];
    setFlags((f) => ({ ...f, [key]: enabled }));
    const { error } = await supabase
      .from("admin_app_settings")
      .upsert(
        {
          key,
          value: { enabled },
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "key" },
      );
    setSaving(null);
    if (error) {
      setFlags((f) => ({ ...f, [key]: previous }));
      toast.error("Could not save setting", { description: error.message });
    } else {
      toast.success("Setting updated");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Settings</CardTitle>
        <CardDescription>
          Feature flags that change how the app behaves for every user. Changes apply immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(Object.keys(FLAG_DEFAULTS) as FlagKey[]).map((key, idx) => (
          <div key={key}>
            {idx > 0 && <Separator className="my-2" />}
            <div className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <Label htmlFor={`flag-${key}`} className="text-sm font-medium">
                  {FLAG_META[key].label}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {FLAG_META[key].description}
                </p>
              </div>
              <Switch
                id={`flag-${key}`}
                checked={flags[key]}
                onCheckedChange={(v) => toggleFlag(key, v)}
                disabled={loading || saving === key}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NotificationsCommsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4" /> Email Infrastructure
          </CardTitle>
          <CardDescription>
            Branded emails sent from notify.paigeagent.ai via the queue dispatcher.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">notify.paigeagent.ai</Badge>
            <Badge variant="outline" className="text-xs">Queue: pgmq</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Auth emails and transactional sends share a retry-safe queue with
            automatic dead-lettering after 5 failed attempts.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/communications">
              Open communications log
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> Push & SMS
          </CardTitle>
          <CardDescription>
            Web push uses VAPID; SMS routes through Twilio with opt-out tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>• Dispute status updates &rarr; push to client</li>
            <li>• New funding match &rarr; push (deduped 24h)</li>
            <li>• Credit alerts &rarr; SMS + email</li>
            <li>• Onboarding &rarr; transactional email</li>
          </ul>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/support">
              Open support center
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSettingsHub;
