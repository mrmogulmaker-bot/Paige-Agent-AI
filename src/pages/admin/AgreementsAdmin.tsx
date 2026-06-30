// src/pages/admin/AgreementsAdmin.tsx
// Two-layer agreement management:
//   - Platform layer: Paige Agent AI ↔ Tenant (read-only for tenant admins, editable for platform owner)
//   - Tenant layer:   Tenant ↔ their Clients (each tenant chooses Paige Template / Fork & Edit / Upload PDF)
//
// Tenant Legal Profile feeds merge fields into auto-filled agreements.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  FileText,
  Building2,
  Sparkles,
  Edit3,
  Upload,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

type AgreementTemplate = {
  id: string;
  slug: string;
  layer: "platform" | "tenant";
  title: string;
  description: string | null;
  body_markdown: string;
  merge_fields: string[];
  version: number;
  is_forkable: boolean;
  required_at_signup: boolean;
  category: string | null;
};

type TenantAgreementVersion = {
  id: string;
  tenant_id: string;
  template_slug: string;
  source_mode: "paige_template" | "tenant_fork" | "tenant_upload";
  base_template_id: string | null;
  title: string;
  body_markdown: string | null;
  uploaded_file_path: string | null;
  uploaded_file_mime: string | null;
  version: number;
  is_active: boolean;
};

type TenantLegalProfile = {
  id?: string;
  tenant_id: string;
  legal_business_name: string;
  dba_name: string | null;
  entity_type: string | null;
  state_of_formation: string | null;
  ein_last_4: string | null;
  registered_address: string | null;
  support_email: string | null;
  support_phone: string | null;
  governing_law_state: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
};

const EMPTY_PROFILE = (tenant_id: string): TenantLegalProfile => ({
  tenant_id,
  legal_business_name: "",
  dba_name: "",
  entity_type: "",
  state_of_formation: "",
  ein_last_4: "",
  registered_address: "",
  support_email: "",
  support_phone: "",
  governing_law_state: "",
  signatory_name: "",
  signatory_title: "",
});

const AgreementsAdmin = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [profile, setProfile] = useState<TenantLegalProfile | null>(null);
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [overrides, setOverrides] = useState<TenantAgreementVersion[]>([]);
  const [forking, setForking] = useState<AgreementTemplate | null>(null);
  const [forkBody, setForkBody] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    // Find this user's primary tenant (owner/admin role first, else any membership)
    const { data: memberships } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, tenants:tenant_id(name)")
      .eq("user_id", uid)
      .order("role", { ascending: true });

    const primary =
      memberships?.find((m) => m.role === "owner" || m.role === "admin") ?? memberships?.[0];
    const tId = primary?.tenant_id ?? null;
    const tName = (primary as any)?.tenants?.name ?? "";
    setTenantId(tId);
    setTenantName(tName);

    const [tplRes, ovRes, profRes] = await Promise.all([
      supabase
        .from("agreement_templates")
        .select("*")
        .eq("is_active", true)
        .order("layer")
        .order("category", { nullsFirst: false })
        .order("title"),
      tId
        ? supabase
            .from("tenant_agreement_versions")
            .select("*")
            .eq("tenant_id", tId)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as TenantAgreementVersion[] }),
      tId
        ? supabase.from("tenant_legal_profile").select("*").eq("tenant_id", tId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setTemplates(
      ((tplRes.data ?? []) as any[]).map((t) => ({
        ...t,
        merge_fields: Array.isArray(t.merge_fields) ? t.merge_fields : [],
      })),
    );
    setOverrides((ovRes.data ?? []) as TenantAgreementVersion[]);
    setProfile(
      (profRes.data as TenantLegalProfile) ?? (tId ? EMPTY_PROFILE(tId) : null),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const platformTemplates = useMemo(
    () => templates.filter((t) => t.layer === "platform"),
    [templates],
  );
  const tenantTemplates = useMemo(
    () => templates.filter((t) => t.layer === "tenant"),
    [templates],
  );

  const overrideFor = (slug: string) =>
    overrides.find((o) => o.template_slug === slug) ?? null;

  const saveProfile = async () => {
    if (!profile || !tenantId) return;
    if (!profile.legal_business_name.trim()) {
      toast({
        title: "Legal business name required",
        description:
          "This name fills in your agreements (e.g. ‘[Your LLC] (\"Service Provider\")’).",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const payload = { ...profile, tenant_id: tenantId };
    const { error } = await supabase
      .from("tenant_legal_profile")
      .upsert(payload, { onConflict: "tenant_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Legal profile saved", description: "Merge fields now auto-fill in your agreements." });
    void load();
  };

  const setMode = async (
    tpl: AgreementTemplate,
    mode: "paige_template" | "tenant_fork" | "tenant_upload",
    extras?: Partial<TenantAgreementVersion>,
  ) => {
    if (!tenantId) return;
    // Deactivate existing
    await supabase
      .from("tenant_agreement_versions")
      .update({ is_active: false })
      .eq("tenant_id", tenantId)
      .eq("template_slug", tpl.slug)
      .eq("is_active", true);

    const next = (overrideFor(tpl.slug)?.version ?? 0) + 1;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("tenant_agreement_versions").insert({
      tenant_id: tenantId,
      template_slug: tpl.slug,
      source_mode: mode,
      base_template_id: tpl.id,
      title: tpl.title,
      version: next,
      is_active: true,
      created_by: userData.user?.id ?? null,
      ...extras,
    });
    if (error) {
      toast({ title: "Failed to update mode", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Switched to ${labelForMode(mode)}` });
    void load();
  };

  const submitFork = async () => {
    if (!forking || !forkBody.trim()) return;
    await setMode(forking, "tenant_fork", { body_markdown: forkBody });
    setForking(null);
    setForkBody("");
  };

  const handleUpload = async (tpl: AgreementTemplate, file: File) => {
    if (!tenantId) return;
    setUploading(tpl.slug);
    const path = `${tenantId}/${tpl.slug}-v${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("tenant-agreements")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) {
      setUploading(null);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    await setMode(tpl, "tenant_upload", {
      uploaded_file_path: path,
      uploaded_file_mime: file.type,
    });
    setUploading(null);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading agreements…
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="p-6 max-w-3xl">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You are not currently a member of any tenant workspace. Contact your platform owner.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agreements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Two layers: <strong>Paige Agent AI ↔ Your Workspace</strong> (platform terms, not editable)
          and <strong>Your Workspace ↔ Your Clients</strong> (use our template, fork & edit, or upload your own).
        </p>
      </div>

      {/* PLATFORM LAYER */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold">Platform Terms · Paige Agent AI ↔ {tenantName || "Your Workspace"}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          These are the terms between Paige Agent AI and your workspace. You accepted them at sign-up.
          They are not forkable.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {platformTemplates.map((tpl) => (
            <Card key={tpl.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="w-4 h-4 text-accent" />
                    {tpl.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    v{tpl.version} · {tpl.category}
                  </p>
                  {tpl.description && (
                    <p className="text-xs text-muted-foreground mt-2">{tpl.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  Platform
                </Badge>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* TENANT LEGAL PROFILE */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold">Your Business Details (merge fields)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          These fields auto-fill into every client-facing agreement you send.
        </p>
        {profile && (
          <Card>
            <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
              <Field
                label="Legal business name *"
                value={profile.legal_business_name}
                onChange={(v) => setProfile({ ...profile, legal_business_name: v })}
                placeholder="Acme Funding Group, LLC"
              />
              <Field
                label="DBA (optional)"
                value={profile.dba_name ?? ""}
                onChange={(v) => setProfile({ ...profile, dba_name: v })}
              />
              <Field
                label="Entity type"
                value={profile.entity_type ?? ""}
                onChange={(v) => setProfile({ ...profile, entity_type: v })}
                placeholder="LLC / Corp / Sole Prop"
              />
              <Field
                label="State of formation"
                value={profile.state_of_formation ?? ""}
                onChange={(v) => setProfile({ ...profile, state_of_formation: v })}
                placeholder="Georgia"
              />
              <Field
                label="Registered address"
                value={profile.registered_address ?? ""}
                onChange={(v) => setProfile({ ...profile, registered_address: v })}
                placeholder="123 Main St, Atlanta, GA 30303"
                className="md:col-span-2"
              />
              <Field
                label="Support email"
                value={profile.support_email ?? ""}
                onChange={(v) => setProfile({ ...profile, support_email: v })}
                placeholder="support@yourdomain.com"
              />
              <Field
                label="Support phone"
                value={profile.support_phone ?? ""}
                onChange={(v) => setProfile({ ...profile, support_phone: v })}
                placeholder="+1 555-555-5555"
              />
              <Field
                label="Governing law state"
                value={profile.governing_law_state ?? ""}
                onChange={(v) => setProfile({ ...profile, governing_law_state: v })}
                placeholder="Georgia"
              />
              <Field
                label="EIN (last 4)"
                value={profile.ein_last_4 ?? ""}
                onChange={(v) => setProfile({ ...profile, ein_last_4: v.replace(/\D/g, "").slice(0, 4) })}
              />
              <Field
                label="Signatory name"
                value={profile.signatory_name ?? ""}
                onChange={(v) => setProfile({ ...profile, signatory_name: v })}
              />
              <Field
                label="Signatory title"
                value={profile.signatory_title ?? ""}
                onChange={(v) => setProfile({ ...profile, signatory_title: v })}
                placeholder="Founder / CEO"
              />
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveProfile} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save business details
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* TENANT LAYER */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold">Client Agreements · {tenantName || "Your Workspace"} ↔ Your Clients</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          For each agreement, choose: use our Paige template (auto-filled with your business details),
          fork & edit, or upload your own PDF.
        </p>
        <div className="grid gap-4">
          {tenantTemplates.map((tpl) => {
            const ov = overrideFor(tpl.slug);
            const mode = ov?.source_mode ?? "paige_template";
            return (
              <Card key={tpl.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="w-4 h-4 text-accent" />
                      {tpl.title}
                    </CardTitle>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <ModeBadge mode={mode} />
                      <Badge variant="outline" className="text-[10px]">
                        slug: {tpl.slug}
                      </Badge>
                      {tpl.merge_fields.length > 0 && mode === "paige_template" && (
                        <Badge variant="outline" className="text-[10px]">
                          {tpl.merge_fields.length} merge fields
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={mode === "paige_template" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMode(tpl, "paige_template")}
                      className="gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Use Paige template
                      {mode === "paige_template" && <CheckCircle2 className="w-3.5 h-3.5 ml-1" />}
                    </Button>
                    <Button
                      variant={mode === "tenant_fork" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setForking(tpl);
                        setForkBody(ov?.body_markdown ?? tpl.body_markdown);
                      }}
                      className="gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Fork & edit
                      {mode === "tenant_fork" && <CheckCircle2 className="w-3.5 h-3.5 ml-1" />}
                    </Button>
                    <label>
                      <input
                        type="file"
                        accept="application/pdf,.pdf,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUpload(tpl, f);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        variant={mode === "tenant_upload" ? "default" : "outline"}
                        size="sm"
                        asChild
                        className="gap-1.5"
                      >
                        <span>
                          {uploading === tpl.slug ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          Upload your own
                          {mode === "tenant_upload" && <CheckCircle2 className="w-3.5 h-3.5 ml-1" />}
                        </span>
                      </Button>
                    </label>
                  </div>
                  {mode === "tenant_upload" && ov?.uploaded_file_path && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      File: {ov.uploaded_file_path.split("/").pop()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Fork dialog */}
      <Dialog open={!!forking} onOpenChange={(o) => !o && setForking(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fork &amp; edit · {forking?.title}</DialogTitle>
            <DialogDescription>
              Edit the markdown below. <code className="text-xs">{`{{merge_fields}}`}</code> will still
              auto-fill from your business details at send time. Delivered via Paige Agent AI.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={24}
            value={forkBody}
            onChange={(e) => setForkBody(e.target.value)}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForking(null)}>
              Cancel
            </Button>
            <Button onClick={submitFork} className="gap-2">
              Save fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: "paige_template" | "tenant_fork" | "tenant_upload" }) {
  if (mode === "tenant_fork") return <Badge className="text-[10px]">Forked &amp; edited</Badge>;
  if (mode === "tenant_upload") return <Badge className="text-[10px]">Uploaded PDF</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Paige template (auto-fill)</Badge>;
}

function labelForMode(m: string) {
  if (m === "tenant_fork") return "Fork & edit";
  if (m === "tenant_upload") return "Upload your own";
  return "Use Paige template";
}

export default AgreementsAdmin;
