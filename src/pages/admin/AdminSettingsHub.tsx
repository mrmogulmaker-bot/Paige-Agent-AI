import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Mail, Bell, Shield, Activity, Settings as SettingsIcon, ExternalLink, KanbanSquare, Radio, Plug2 } from "lucide-react";
import { Link } from "react-router-dom";
import { UserManagement } from "@/components/dashboard/UserManagement";
import { SystemMetrics } from "@/components/dashboard/admin/SystemMetrics";
import { McpSessionsPanel } from "@/components/dashboard/admin/McpSessionsPanel";
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
          <TabsTrigger value="pipes" className="gap-2">
            <Radio className="w-4 h-4" /> Platform Pipes
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

        <TabsContent value="pipes" className="space-y-4">
          <PlatformPipesPanel />
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

interface PaigeConfig {
  twilio_a2p_status?: "pending" | "approved" | "rejected" | "not_started";
  resend_domain_verified?: boolean;
  ghl_fallback_enabled?: boolean;
  default_from_email?: string;
  default_from_sms_number?: string;
}

function PlatformPipesPanel() {
  const [config, setConfig] = useState<PaigeConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("paige_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) setConfig(data);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("paige_config")
      .upsert({ id: 1, ...config, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Platform pipes saved");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="w-4 h-4" /> Send Pipes & Inbound Channels
        </CardTitle>
        <CardDescription>
          Controls how Paige routes outbound email/SMS and which inbound channels are live. GHL is a temporary fallback until Twilio A2P + Resend domain are fully verified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Twilio A2P status</Label>
          <select
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={config.twilio_a2p_status ?? "not_started"}
            onChange={(e) => setConfig({ ...config, twilio_a2p_status: e.target.value as PaigeConfig["twilio_a2p_status"] })}
          >
            <option value="not_started">Not started</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved (send via Twilio)</option>
            <option value="rejected">Rejected</option>
          </select>
          <p className="text-[11px] text-muted-foreground">When approved, SMS sends go through Twilio. Otherwise they fall back to GHL.</p>
        </div>

        <div className="flex items-start justify-between gap-4 py-1">
          <div>
            <Label className="text-sm font-medium">Resend domain verified</Label>
            <p className="text-xs text-muted-foreground mt-1">notify.paigeagent.ai DKIM/SPF passing.</p>
          </div>
          <Switch
            checked={!!config.resend_domain_verified}
            onCheckedChange={(c) => setConfig({ ...config, resend_domain_verified: c })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 py-1">
          <div>
            <Label className="text-sm font-medium">GHL fallback enabled</Label>
            <p className="text-xs text-muted-foreground mt-1">Allow Paige to route through GHL when primary pipes are unavailable.</p>
          </div>
          <Switch
            checked={!!config.ghl_fallback_enabled}
            onCheckedChange={(c) => setConfig({ ...config, ghl_fallback_enabled: c })}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Default from email</Label>
            <Input
              value={config.default_from_email ?? ""}
              onChange={(e) => setConfig({ ...config, default_from_email: e.target.value })}
              placeholder="paige@notify.paigeagent.ai"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Default from SMS number</Label>
            <Input
              value={config.default_from_sms_number ?? ""}
              onChange={(e) => setConfig({ ...config, default_from_sms_number: e.target.value })}
              placeholder="+15555550123"
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save pipes"}</Button>
      </CardContent>
    </Card>
  );
}


export default AdminSettingsHub;
