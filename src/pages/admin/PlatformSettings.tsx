// Platform Settings — OPERATOR-ONLY shell (IA slice 1c-xi, Lane-PLATFORM).
//
// §9 seam: these surfaces mutate PLATFORM-GLOBAL singleton config —
// admin_app_settings global feature flags, and paige_config id=1 (the shared
// from-email / SMS / Twilio identity). They belong to the platform operator, NOT
// to a tenant admin, so they were relocated here out of the retiring
// AdminSettingsHub. This file is their ONLY home; they must NEVER appear on a
// tenant Setup tab. The route is gated by <PlatformStaffOnly> in the router —
// this file assumes that gate and does not re-implement it.
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Settings as SettingsIcon, Radio, Activity, Plug2, LayoutTemplate, ArrowRight } from "lucide-react";
import { SystemMetrics } from "@/components/dashboard/admin/SystemMetrics";
import { McpSessionsPanel } from "@/components/dashboard/admin/McpSessionsPanel";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PLATFORM } from "@/lib/platform/identity";
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

export function PlatformSettings() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={SettingsIcon}
        title="Platform Settings"
        description="Operator-level platform configuration."
      />

      <Tabs defaultValue="platform" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="platform" className="gap-2">
            <SettingsIcon className="w-4 h-4" /> Platform
          </TabsTrigger>
          <TabsTrigger value="pipes" className="gap-2">
            <Radio className="w-4 h-4" /> Pipes
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Activity className="w-4 h-4" /> System Metrics
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-2">
            <Plug2 className="w-4 h-4" /> MCP Sessions
          </TabsTrigger>
          <TabsTrigger value="defaults" className="gap-2">
            <LayoutTemplate className="w-4 h-4" /> Platform Defaults
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="space-y-4">
          <PlatformSettingsPanel />
        </TabsContent>

        <TabsContent value="pipes" className="space-y-4">
          <PlatformPipesPanel />
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <SystemMetrics />
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4">
          <McpSessionsPanel />
        </TabsContent>

        <TabsContent value="defaults" className="space-y-4">
          <PlatformDefaultsPanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/**
 * Platform Defaults — the operator home for the coaching-generic default sets
 * seeded to every tenant (the `paige-platform-defaults` system tenant). Part 2c
 * moved this OUT of the tenant switcher (where it read as a switch-into target and
 * cluttered the operator's real customer list) and gave it a deliberate Settings
 * home. Editing the default sets themselves happens inside that workspace's normal
 * tenant surfaces, so this panel is the controlled entry point (§10 — the capability
 * stays Paige/operator-drivable, never a dead end), not a fork of those editors (§18).
 * §9: this content is operator-global and coaching-generic — never a tenant's, never
 * seeded with a vertical's copy.
 */
function PlatformDefaultsPanel() {
  const { tenants, switchTenant } = useTenantContext();
  const defaultsTenant = tenants.find((t) => t.slug === PLATFORM.defaultsTenantSlug) ?? null;

  return (
    <SectionCard
      title="Platform Defaults"
      description="The coaching-generic default sets that ship to every new workspace."
      icon={LayoutTemplate}
    >
      {defaultsTenant ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These are the platform-wide starting templates — persona, journeys, email
            sets, and Playbook scaffolding — that every new workspace inherits. They stay
            coaching-generic (no vertical's copy, no finance defaults) so each business can
            author its own on top. Open the defaults workspace to review or update them; the
            changes apply to what future workspaces receive, never to an existing tenant's
            own authored content.
          </p>
          <Button variant="outline" onClick={() => switchTenant(defaultsTenant.id)}>
            Open Platform Defaults workspace
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={LayoutTemplate}
          title="Platform Defaults workspace not found"
          description="The platform-defaults system workspace isn't visible on this account. It resolves for the platform owner; if you're a scoped admin, ask the owner to review the default sets."
        />
      )}
    </SectionCard>
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
    <SectionCard
      icon={SettingsIcon}
      title="Platform Settings"
      description="Feature flags that change how the app behaves for every user. Changes apply immediately."
    >
      <div className="space-y-2">
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
      </div>
    </SectionCard>
  );
}

interface PaigeConfig {
  twilio_a2p_status?: "pending" | "approved" | "rejected" | "not_started";
  resend_domain_verified?: boolean;
  default_from_email?: string;
  default_from_sms_number?: string;
}

function PlatformPipesPanel() {
  const [config, setConfig] = useState<PaigeConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_config")
        .select("twilio_a2p_status, resend_domain_verified, default_from_email, default_from_sms_number")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setConfig({
          twilio_a2p_status:
            (data.twilio_a2p_status as PaigeConfig["twilio_a2p_status"]) ?? "not_started",
          resend_domain_verified: data.resend_domain_verified ?? false,
          default_from_email: data.default_from_email ?? undefined,
          default_from_sms_number: data.default_from_sms_number ?? undefined,
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("paige_config")
      .upsert({ id: 1, ...config, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Platform pipes saved");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <SectionCard
      icon={Radio}
      title="Send Pipes & Inbound Channels"
      description="Controls how Paige routes outbound email/SMS and which inbound channels are live. GHL is a temporary fallback until Twilio A2P + Resend domain are fully verified."
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Twilio A2P status</Label>
          <Select
            value={config.twilio_a2p_status ?? "not_started"}
            onValueChange={(v) => setConfig({ ...config, twilio_a2p_status: v as PaigeConfig["twilio_a2p_status"] })}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved (send via Twilio)</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">When approved, SMS sends go through Twilio. Otherwise they fall back to GHL.</p>
        </div>

        <div className="flex items-start justify-between gap-4 py-1">
          <div>
            <Label className="text-sm font-medium">Resend domain verified</Label>
            <p className="text-xs text-muted-foreground mt-1">paigeagent.ai DKIM/SPF passing.</p>
          </div>
          <Switch
            checked={!!config.resend_domain_verified}
            onCheckedChange={(c) => setConfig({ ...config, resend_domain_verified: c })}
          />
        </div>


        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Default from email</Label>
            <Input
              value={config.default_from_email ?? ""}
              onChange={(e) => setConfig({ ...config, default_from_email: e.target.value })}
              placeholder="paige@paigeagent.ai"
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
      </div>
    </SectionCard>
  );
}

export default PlatformSettings;
