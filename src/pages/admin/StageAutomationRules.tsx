/**
 * Stage Automation Rules — platform-native admin surface (Ship #1).
 *
 * Every tenant sees the same UI. Rules are inactive by default until an
 * admin flips them on. Rule seeds are UNIVERSAL templates only — tenant-
 * specific pipelines (e.g. BTF, 3M) are created as tenant config via (Sprint 211.b: BTF cited as historical example only)
 * PipelineSettings first, then mapped through this same wizard.
 *
 * Webhook URL is stored pgcrypto-encrypted on tenants.automation_webhook_url_encrypted
 * and only ever read via the admin_get_automation_webhook_url RPC (audit-logged).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Wand2, Webhook, Info } from "lucide-react";
import type { Pipeline, PipelineStage } from "@/lib/pipelines";

type ComposeIntent = "transactional" | "marketing" | "nurture" | "notification";
type SendMode = "draft_for_review" | "auto_send";

interface Rule {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  compose_intent: ComposeIntent;
  tone: string;
  template_hint: string | null;
  send_mode: SendMode;
  is_active: boolean;
}

const UNIVERSAL_TEMPLATES = {
  sales: {
    label: "Generic Sales Pipeline",
    description: "Lead → Qualified → Opportunity → Proposal → Won → Onboarding → Active → At-Risk → Churned",
    stages: ["Lead", "Qualified", "Opportunity", "Proposal", "Won", "Onboarding", "Active", "At-Risk", "Churned"],
    rules: [
      { from: "Lead", to: "Qualified", intent: "nurture" as ComposeIntent, tone: "warm", mode: "draft_for_review" as SendMode },
      { from: "Qualified", to: "Opportunity", intent: "nurture" as ComposeIntent, tone: "consultative", mode: "draft_for_review" as SendMode },
      { from: "Opportunity", to: "Proposal", intent: "transactional" as ComposeIntent, tone: "professional", mode: "draft_for_review" as SendMode },
      { from: "Proposal", to: "Won", intent: "transactional" as ComposeIntent, tone: "celebratory", mode: "auto_send" as SendMode },
      { from: "Won", to: "Onboarding", intent: "transactional" as ComposeIntent, tone: "welcoming", mode: "auto_send" as SendMode },
      { from: "Onboarding", to: "Active", intent: "notification" as ComposeIntent, tone: "encouraging", mode: "auto_send" as SendMode },
      { from: "Active", to: "At-Risk", intent: "nurture" as ComposeIntent, tone: "concerned", mode: "draft_for_review" as SendMode },
      { from: "At-Risk", to: "Churned", intent: "marketing" as ComposeIntent, tone: "regretful", mode: "draft_for_review" as SendMode },
    ],
  },
  lifecycle: {
    label: "Generic Lifecycle",
    description: "Trial → Onboarding → Active → Expansion → Renewal → Churned",
    stages: ["Trial", "Onboarding", "Active", "Expansion", "Renewal", "Churned"],
    rules: [
      { from: "Trial", to: "Onboarding", intent: "transactional" as ComposeIntent, tone: "welcoming", mode: "auto_send" as SendMode },
      { from: "Onboarding", to: "Active", intent: "notification" as ComposeIntent, tone: "encouraging", mode: "auto_send" as SendMode },
      { from: "Active", to: "Expansion", intent: "marketing" as ComposeIntent, tone: "consultative", mode: "draft_for_review" as SendMode },
      { from: "Expansion", to: "Renewal", intent: "transactional" as ComposeIntent, tone: "professional", mode: "draft_for_review" as SendMode },
      { from: "Renewal", to: "Churned", intent: "marketing" as ComposeIntent, tone: "regretful", mode: "draft_for_review" as SendMode },
    ],
  },
  blank: {
    label: "Blank Start",
    description: "Define your own stages in Pipeline Settings, then add rules manually here.",
    stages: [],
    rules: [],
  },
} as const;

const INTENT_LABELS: Record<ComposeIntent, string> = {
  transactional: "Transactional (account/service)",
  notification: "Notification (status/status)",
  marketing: "Marketing (promotional)",
  nurture: "Nurture (educational)",
};

export default function StageAutomationRules() {
  const navigate = useNavigate();
  const { activeTenantId } = useTenantContext();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookInput, setWebhookInput] = useState("");
  const [webhookConfigured, setWebhookConfigured] = useState<boolean | null>(null);

  useEffect(() => { if (activeTenantId) load(); }, [activeTenantId]);
  useEffect(() => { if (activePipelineId) loadPipelineData(activePipelineId); }, [activePipelineId]);

  const load = async () => {
    setLoading(true);
    const [{ data: pl }, { data: web }] = await Promise.all([
      supabase.from("pipelines").select("*").order("is_default", { ascending: false }).order("name"),
      supabase.rpc("admin_get_automation_webhook_url", { _tenant_id: activeTenantId }),
    ]);
    setPipelines(pl || []);
    setWebhookConfigured(Boolean(web));
    if (pl?.length && !activePipelineId) setActivePipelineId(pl[0].id);
    setLoading(false);
  };

  const loadPipelineData = async (pid: string) => {
    const [{ data: st }, { data: rl }] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("order_index"),
      supabase.from("stage_automation_rules").select("*").eq("pipeline_id", pid),
    ]);
    setStages((st as PipelineStage[]) || []);
    setRules((rl as Rule[]) || []);
  };

  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const stagesByLabel = useMemo(() => {
    const m = new Map<string, PipelineStage>();
    stages.forEach((s) => m.set(s.label.toLowerCase(), s));
    return m;
  }, [stages]);

  const cellRule = (fromId: string | null, toId: string): Rule | undefined =>
    rules.find((r) => r.pipeline_id === activePipelineId && r.to_stage_id === toId && r.from_stage_id === fromId);

  const upsertRule = async (patch: Partial<Rule> & { pipeline_id: string; to_stage_id: string; compose_intent: ComposeIntent }) => {
    if (!activeTenantId) return;
    const row = {
      tenant_id: activeTenantId,
      pipeline_id: patch.pipeline_id,
      from_stage_id: patch.from_stage_id ?? null,
      to_stage_id: patch.to_stage_id,
      compose_intent: patch.compose_intent,
      tone: patch.tone ?? "professional",
      template_hint: patch.template_hint ?? null,
      send_mode: patch.send_mode ?? "draft_for_review",
      is_active: patch.is_active ?? false,
    };
    const existing = cellRule(row.from_stage_id, row.to_stage_id);
    const { error } = existing
      ? await supabase.from("stage_automation_rules").update(row).eq("id", existing.id)
      : await supabase.from("stage_automation_rules").insert(row);
    if (error) return toast.error(error.message);
    loadPipelineData(activePipelineId);
  };

  const toggleActive = async (r: Rule) => {
    const { error } = await supabase
      .from("stage_automation_rules")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(r.is_active ? "Rule paused" : "Rule activated");
    loadPipelineData(activePipelineId);
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from("stage_automation_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    loadPipelineData(activePipelineId);
  };

  const seedFromTemplate = async (tplKey: keyof typeof UNIVERSAL_TEMPLATES) => {
    if (!activeTenantId || !activePipelineId) return;
    const tpl = UNIVERSAL_TEMPLATES[tplKey];
    if (tpl.rules.length === 0) return toast.info("Blank start — add rules manually.");
    let seeded = 0;
    for (const r of tpl.rules) {
      const from = stagesByLabel.get(r.from.toLowerCase());
      const to = stagesByLabel.get(r.to.toLowerCase());
      if (!to) continue;
      await upsertRule({
        pipeline_id: activePipelineId,
        from_stage_id: from?.id ?? null,
        to_stage_id: to.id,
        compose_intent: r.intent,
        tone: r.tone,
        send_mode: r.mode,
        is_active: false, // ALWAYS inactive per spec confirmation
      });
      seeded++;
    }
    toast.success(`Seeded ${seeded} rules (all inactive). Flip switches to activate.`);
  };

  const saveWebhook = async () => {
    if (!activeTenantId) return;
    const { error } = await supabase.rpc("admin_set_automation_webhook_url", {
      _tenant_id: activeTenantId,
      _url: webhookInput.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success(webhookInput.trim() ? "Webhook URL saved (encrypted)." : "Webhook URL cleared.");
    setWebhookInput("");
    setWebhookDialogOpen(false);
    load();
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/settings")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to settings
        </Button>
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Stage Automation Rules</h1>
        <p className="text-sm text-muted-foreground">
          When a deal moves from one stage to another, fire an automation. Rules are inactive by default — flip a switch to activate.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Webhook destination
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Where should stage-change events be POSTed? Any HTTPS endpoint works — n8n, Zapier, Make, or your own.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={webhookConfigured ? "default" : "outline"}>
              {webhookConfigured ? "Configured" : "Using platform default"}
            </Badge>
            <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">{webhookConfigured ? "Replace" : "Set URL"}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tenant automation webhook URL</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Label>HTTPS URL</Label>
                  <Input
                    placeholder="https://..."
                    value={webhookInput}
                    onChange={(e) => setWebhookInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    Stored encrypted at rest. Only tenant admins can read it, and every read is audit-logged. Leave blank to fall back to the platform default.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setWebhookDialogOpen(false)}>Cancel</Button>
                  <Button onClick={saveWebhook}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={activePipelineId} onValueChange={setActivePipelineId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Choose a pipeline" /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline"><Wand2 className="w-4 h-4 mr-1" /> Seed from template</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Choose a starting template</AlertDialogTitle>
                  <AlertDialogDescription>
                    Templates match stage names by label. Any stage that doesn't exist in this pipeline is skipped. All seeded rules are inactive by default.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  {(Object.keys(UNIVERSAL_TEMPLATES) as (keyof typeof UNIVERSAL_TEMPLATES)[]).map((k) => (
                    <div key={k} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{UNIVERSAL_TEMPLATES[k].label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{UNIVERSAL_TEMPLATES[k].description}</div>
                        </div>
                        <AlertDialogAction onClick={() => seedFromTemplate(k)}>Seed</AlertDialogAction>
                      </div>
                    </div>
                  ))}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Close</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : stages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              This pipeline has no stages yet. Add stages in <a className="underline" href="/admin/settings/pipelines">Pipeline Settings</a> first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border p-2 text-left text-muted-foreground">From ↓ / To →</th>
                    {stages.map((s) => (
                      <th key={s.id} className="border p-2 text-left" style={{ background: s.color + "20" }}>{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[{ id: null as string | null, label: "(any stage)" }, ...stages.map((s) => ({ id: s.id as string | null, label: s.label }))].map((from) => (
                    <tr key={from.id ?? "any"}>
                      <td className="border p-2 font-medium text-muted-foreground">{from.label}</td>
                      {stages.map((to) => {
                        const r = cellRule(from.id, to.id);
                        if (from.id === to.id) return <td key={to.id} className="border p-2 bg-muted/30" />;
                        return (
                          <td key={to.id} className="border p-1 align-top">
                            {r ? (
                              <button
                                className={`w-full text-left p-1 rounded ${r.is_active ? "bg-primary/10 border border-primary/30" : "bg-muted/40"}`}
                                onClick={() => setEditing(r)}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <Badge variant={r.is_active ? "default" : "outline"} className="text-[9px]">
                                    {r.is_active ? "ACTIVE" : "off"}
                                  </Badge>
                                  <Switch
                                    checked={r.is_active}
                                    onClick={(e) => { e.stopPropagation(); toggleActive(r); }}
                                  />
                                </div>
                                <div className="text-[10px] mt-1 text-muted-foreground truncate">
                                  {r.compose_intent} · {r.tone}
                                </div>
                              </button>
                            ) : (
                              <button
                                className="w-full h-full min-h-[44px] text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 rounded"
                                onClick={() => setEditing({
                                  id: "",
                                  tenant_id: activeTenantId!,
                                  pipeline_id: activePipelineId,
                                  from_stage_id: from.id,
                                  to_stage_id: to.id,
                                  compose_intent: "transactional",
                                  tone: "professional",
                                  template_hint: null,
                                  send_mode: "draft_for_review",
                                  is_active: false,
                                })}
                              >
                                <Plus className="w-3 h-3 mx-auto" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RuleEditor
        rule={editing}
        onClose={() => setEditing(null)}
        stageById={stageById}
        onSave={async (r) => {
          await upsertRule(r);
          setEditing(null);
        }}
        onDelete={async (id) => {
          await deleteRule(id);
          setEditing(null);
        }}
      />
    </div>
  );
}

function RuleEditor({
  rule, onClose, stageById, onSave, onDelete,
}: {
  rule: Rule | null;
  onClose: () => void;
  stageById: Record<string, PipelineStage>;
  onSave: (r: Rule) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Rule | null>(rule);
  useEffect(() => setDraft(rule), [rule]);
  if (!rule || !draft) return null;
  const fromLabel = draft.from_stage_id ? stageById[draft.from_stage_id]?.label ?? "(unknown)" : "(any stage)";
  const toLabel = stageById[draft.to_stage_id]?.label ?? "(unknown)";

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rule: {fromLabel} → {toLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Compose intent</Label>
            <Select value={draft.compose_intent} onValueChange={(v) => setDraft({ ...draft, compose_intent: v as ComposeIntent })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INTENT_LABELS) as ComposeIntent[]).map((k) => (
                  <SelectItem key={k} value={k}>{INTENT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Consent mapping: transactional/notification → transactional consent (no gate for account messages). marketing/nurture → §177 marketing consent required.
            </p>
          </div>
          <div>
            <Label>Tone</Label>
            <Input value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value })} />
          </div>
          <div>
            <Label>Template hint (optional)</Label>
            <Input
              placeholder="e.g. Confirm onboarding kickoff call"
              value={draft.template_hint ?? ""}
              onChange={(e) => setDraft({ ...draft, template_hint: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Send mode</Label>
            <Select value={draft.send_mode} onValueChange={(v) => setDraft({ ...draft, send_mode: v as SendMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft_for_review">Draft for rep review</SelectItem>
                <SelectItem value="auto_send">Auto-send</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={draft.is_active} onCheckedChange={(c) => setDraft({ ...draft, is_active: c })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter className="justify-between">
          {rule.id ? (
            <Button variant="ghost" className="text-destructive" onClick={() => onDelete(rule.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(draft)}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
