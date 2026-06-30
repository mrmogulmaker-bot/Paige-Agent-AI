// Growth OS — unified admin hub for Pages, Forms, Funnels, Submissions, External Sources.
// Phase 1 keeps creation flows lightweight (template-driven + JSON-editable) so we ship
// the engine fast; a visual editor lands in v2.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, LayoutGrid, GitBranch, Inbox, Plug, Copy, ExternalLink, Plus } from "lucide-react";

type Page = { id: string; slug: string; title: string; status: string; updated_at: string };
type Form = { id: string; slug: string; name: string; status: string; updated_at: string };
type Funnel = { id: string; slug: string; name: string; status: string; updated_at: string };
type Submission = { id: string; form_id: string; created_at: string; payload_json: any; source: string };
type ExternalSource = { id: string; provider: string; label: string; webhook_token: string; active: boolean; last_seen_at: string | null };

const PAGE_TEMPLATES = [
  { key: "btf-sales", label: "BUILD-to-FUND Sales Page", description: "Premium dark sales page with 3 phase cards + apply CTA." },
  { key: "lead-magnet", label: "Lead Magnet Landing", description: "Single CTA + form for opt-ins." },
  { key: "vsl", label: "VSL Page", description: "Video, headline, single CTA." },
];
const FORM_TEMPLATES = [
  { key: "btf-application", label: "BTF 3-Step Application", description: "Personal / Business / Funding — mirrors build-to-fund-onboar.vibepreview.com." },
  { key: "discovery-call", label: "Discovery Call Intake", description: "Name, business, revenue, timeline." },
  { key: "lead-magnet", label: "Lead Magnet Opt-in", description: "Email + first name only." },
  { key: "coach-application", label: "Coach Application", description: "Background + clients managed + experience." },
];
const PROVIDERS = ["webflow","framer","clickfunnels","gohighlevel","typeform","jotform","custom"];

export default function GrowthHub() {
  const { activeTenantId, activeTenant } = useTenantContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pages";

  const [pages, setPages] = useState<Page[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTenantId) return;
    (async () => {
      setLoading(true);
      const [p, f, fn, s, src] = await Promise.all([
        supabase.from("growth_pages").select("id,slug,title,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
        supabase.from("growth_forms").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
        supabase.from("growth_funnels").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
        supabase.from("growth_form_submissions").select("id,form_id,created_at,payload_json,source").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(50),
        supabase.from("growth_external_sources").select("id,provider,label,webhook_token,active,last_seen_at").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      ]);
      setPages((p.data ?? []) as Page[]);
      setForms((f.data ?? []) as Form[]);
      setFunnels((fn.data ?? []) as Funnel[]);
      setSubs((s.data ?? []) as Submission[]);
      setSources((src.data ?? []) as ExternalSource[]);
      setLoading(false);
    })();
  }, [activeTenantId, tab]);

  const tenantSlug = activeTenant?.slug ?? "tenant";
  const inboundBase = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/growth-inbound`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Growth OS</h1>
        <p className="text-muted-foreground text-sm">Landing pages, funnels, and forms — all wired into your contacts, pipeline, and Paige workflows.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="pages"><LayoutGrid className="w-4 h-4 mr-1.5" />Pages</TabsTrigger>
          <TabsTrigger value="funnels"><GitBranch className="w-4 h-4 mr-1.5" />Funnels</TabsTrigger>
          <TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1.5" />Forms</TabsTrigger>
          <TabsTrigger value="submissions"><Inbox className="w-4 h-4 mr-1.5" />Submissions</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-1.5" />External Builders</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-4 mt-4">
          <SectionHeader title="Landing Pages" cta={
            <CreatePageDialog tenantId={activeTenantId} onCreated={() => setParams({ tab: "pages" })} />
          } />
          {loading ? <div className="text-muted-foreground text-sm">Loading…</div> : pages.length === 0 ? (
            <EmptyState icon={<LayoutGrid className="w-8 h-8" />} title="No pages yet" body="Spin one up from a template. We seeded the BUILD-to-FUND sales page for the Mogul Maker tenant." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{p.title}</span>
                      <Badge variant={p.status === "published" ? "default" : "outline"}>{p.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2">
                    <div>/{p.slug}</div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/p/${tenantSlug}/${p.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />View
                        </a>
                      </Button>
                      <TogglePublishButton kind="page" row={p} onChanged={() => setParams({ tab: "pages" })} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="funnels" className="space-y-4 mt-4">
          <SectionHeader title="Funnels" cta={
            <CreateFunnelDialog tenantId={activeTenantId} pages={pages} forms={forms} onCreated={() => setParams({ tab: "funnels" })} />
          } />
          {funnels.length === 0 ? (
            <EmptyState icon={<GitBranch className="w-8 h-8" />} title="No funnels yet" body="A funnel chains pages → forms → success in one flow. Build one once you have a sales page + form." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {funnels.map((f) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{f.name}</span>
                      <Badge variant={f.status === "active" ? "default" : "outline"}>{f.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    <div className="mb-2">/f/{tenantSlug}/{f.slug}</div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/f/${tenantSlug}/${f.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forms" className="space-y-4 mt-4">
          <SectionHeader title="Forms & Questionnaires" cta={
            <CreateFormDialog tenantId={activeTenantId} onCreated={() => setParams({ tab: "forms" })} />
          } />
          {forms.length === 0 ? (
            <EmptyState icon={<FileText className="w-8 h-8" />} title="No forms yet" body="Use a template or have Paige generate one for you." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((f) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="truncate">{f.name}</span>
                      <Badge variant={f.status === "active" ? "default" : "outline"}>{f.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2">
                    <div>/{f.slug}</div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/form/${f.id}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                        </a>
                      </Button>
                      <CopyButton text={`${window.location.origin}/form/${f.id}`} label="Copy link" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4 mt-4">
          <SectionHeader title="All Submissions (last 50)" />
          {subs.length === 0 ? (
            <EmptyState icon={<Inbox className="w-8 h-8" />} title="No submissions yet" body="Submissions from Paige forms and external builders both land here." />
          ) : (
            <div className="space-y-2">
              {subs.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[10px]">{s.source}</Badge>
                      <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-muted/40 p-2 rounded">{JSON.stringify(s.payload_json, null, 2)}</pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4 mt-4">
          <SectionHeader title="External Builders" cta={
            <CreateSourceDialog tenantId={activeTenantId} forms={forms} onCreated={() => setParams({ tab: "integrations" })} />
          } />
          <p className="text-xs text-muted-foreground">
            Already using Webflow, Framer, ClickFunnels, GoHighLevel, Vibe, or Typeform? Create a bridge — point your form's webhook at the URL below and Paige will ingest every submission into your contacts and pipeline.
          </p>
          {sources.length === 0 ? (
            <EmptyState icon={<Plug className="w-8 h-8" />} title="No external sources yet" body="Add a bridge for each external form or builder you want to pipe into Paige." />
          ) : (
            <div className="space-y-2">
              {sources.map((s) => {
                const webhookUrl = `${inboundBase}/${s.webhook_token}`;
                return (
                  <Card key={s.id}>
                    <CardContent className="p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{s.label}</div>
                        <Badge variant="outline" className="capitalize">{s.provider}</Badge>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input readOnly value={webhookUrl} className="text-xs font-mono" />
                        <CopyButton text={webhookUrl} label="Copy" />
                      </div>
                      <div className="text-muted-foreground">
                        Last seen: {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "never"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionHeader({ title, cta }: { title: string; cta?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      {cta}
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center space-y-2">
        <div className="mx-auto text-muted-foreground">{icon}</div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground max-w-md mx-auto">{body}</div>
      </CardContent>
    </Card>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>
      <Copy className="w-3.5 h-3.5 mr-1" />{label}
    </Button>
  );
}

function TogglePublishButton({ kind, row, onChanged }: { kind: "page" | "form" | "funnel"; row: any; onChanged: () => void }) {
  const table = kind === "page" ? "growth_pages" : kind === "form" ? "growth_forms" : "growth_funnels";
  const next = row.status === "published" || row.status === "active"
    ? "draft"
    : (kind === "page" ? "published" : "active");
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      const patch: any = { status: next };
      if (kind === "page" && next === "published") patch.published_at = new Date().toISOString();
      const { error } = await supabase.from(table).update(patch).eq("id", row.id);
      if (error) toast.error(error.message); else { toast.success(`Set to ${next}`); onChanged(); }
    }}>{next === "draft" ? "Unpublish" : "Publish"}</Button>
  );
}

function CreatePageDialog({ tenantId, onCreated }: { tenantId: string | null; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState("lead-magnet");

  const create = async () => {
    if (!tenantId || !title || !slug) return toast.error("Title and slug required");
    const blocks = templateBlocks(template, title);
    const { error } = await supabase.from("growth_pages").insert({
      tenant_id: tenantId, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      title, template_key: template, blocks_json: blocks as any, status: "draft",
    });
    if (error) toast.error(error.message); else { toast.success("Page created"); setOpen(false); onCreated(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Page</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create landing page</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="BUILD-to-FUND Sales Page" /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="btf-sales" /></div>
          <div>
            <label className="text-xs">Template</label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_TEMPLATES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">{PAGE_TEMPLATES.find((t) => t.key === template)?.description}</p>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFormDialog({ tenantId, onCreated }: { tenantId: string | null; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState("discovery-call");

  const create = async () => {
    if (!tenantId || !name || !slug) return toast.error("Name and slug required");
    const schema = formTemplateSchema(template);
    const { error } = await supabase.from("growth_forms").insert({
      tenant_id: tenantId, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name, template_key: template, schema_json: schema as any, status: "active",
    });
    if (error) toast.error(error.message); else { toast.success("Form created"); setOpen(false); onCreated(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Form</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create form</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="BTF Application" /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="btf-application" /></div>
          <div>
            <label className="text-xs">Template</label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORM_TEMPLATES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">{FORM_TEMPLATES.find((t) => t.key === template)?.description}</p>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFunnelDialog({ tenantId, pages, forms, onCreated }: { tenantId: string | null; pages: Page[]; forms: Form[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [entryPageId, setEntryPageId] = useState<string>("");
  const [stepFormId, setStepFormId] = useState<string>("");

  const create = async () => {
    if (!tenantId || !name || !slug) return toast.error("Name and slug required");
    const { data: f, error } = await supabase.from("growth_funnels").insert({
      tenant_id: tenantId, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name, status: "active", entry_page_id: entryPageId || null,
    }).select("id").single();
    if (error || !f) return toast.error(error?.message ?? "Failed");
    const steps: any[] = [];
    if (entryPageId) steps.push({ funnel_id: f.id, tenant_id: tenantId, order_index: 0, step_type: "page", page_id: entryPageId });
    if (stepFormId) steps.push({ funnel_id: f.id, tenant_id: tenantId, order_index: 1, step_type: "form", form_id: stepFormId });
    steps.push({ funnel_id: f.id, tenant_id: tenantId, order_index: steps.length, step_type: "thankyou" });
    if (steps.length > 0) await supabase.from("growth_funnel_steps").insert(steps);
    toast.success("Funnel created");
    setOpen(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Funnel</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create funnel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="btf-program" /></div>
          <div>
            <label className="text-xs">Entry page</label>
            <Select value={entryPageId} onValueChange={setEntryPageId}>
              <SelectTrigger><SelectValue placeholder="Pick a page" /></SelectTrigger>
              <SelectContent>{pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Form step</label>
            <Select value={stepFormId} onValueChange={setStepFormId}>
              <SelectTrigger><SelectValue placeholder="Pick a form" /></SelectTrigger>
              <SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSourceDialog({ tenantId, forms, onCreated }: { tenantId: string | null; forms: Form[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("webflow");
  const [label, setLabel] = useState("");
  const [targetFormId, setTargetFormId] = useState<string>("");

  const create = async () => {
    if (!tenantId || !label) return toast.error("Label required");
    const { error } = await supabase.from("growth_external_sources").insert({
      tenant_id: tenantId, provider, label,
      target_form_id: targetFormId || null,
      field_map_json: { email: "email", first_name: "first_name", last_name: "last_name", phone: "phone" } as any,
    });
    if (error) toast.error(error.message); else { toast.success("Bridge created"); setOpen(false); onCreated(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Bridge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New external builder bridge</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="BTF Webflow form" /></div>
          <div>
            <label className="text-xs">Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Route into form (optional)</label>
            <Select value={targetFormId} onValueChange={setTargetFormId}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create bridge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- templates ----------
function templateBlocks(template: string, title: string): any[] {
  if (template === "btf-sales") {
    return [
      { type: "hero", eyebrow: "MOGUL MAKER ACADEMY · DONE-FOR-YOU", title, subtitle: "We build your business into one that can actually borrow — formation, business credit, and funding. Done for you, start to finish.", quote: "We borrow to start. Then we build to own.", cta_label: "Apply & Get Started", cta_href: "#apply" },
      { type: "phase_cards", cards: [
        { phase: "PHASE 01", title: "BUILD — Formation & Fundable Foundation", body: "We form and structure your business the right way — entity, EIN, business address, phone, banking readiness, and every credibility marker a lender checks.", outcome: "A business structured and positioned to be funded." },
        { phase: "PHASE 02", title: "STACK — Business Credit, Built In Order", body: "We open and manage your tradelines in the right sequence — vendor, retail, and financial — so your business credit reports across the major bureaus and grows the way lenders want to see.", outcome: "An established, reporting business credit profile." },
        { phase: "PHASE 03", title: "FUND — Lender Matching & Funding", body: "We put your file in front of the lenders who actually fit it, support the application, and run the play.", outcome: "Funding secured — or a lender-ready package in market." },
      ]},
      { type: "feature_grid", title: "Everything inside the package", items: [
        { title: "Foundation & Monitoring", body: "Entity formation, EIN, registered agent, business address & phone, banking readiness, plus business + personal credit monitoring." },
        { title: "Credit Stacking", body: "Vendor, retail, and financial tradelines opened in the correct order so all 3 business bureaus light up." },
        { title: "Funding Strategy", body: "Bureau-aware lender matching, application support, and a full capital stack plan." },
        { title: "Dedicated Coach", body: "Direct access to a coach and Paige Agent AI 24/7 throughout the program." },
      ]},
      { type: "cta", title: "Ready to be fundable?", body: "Apply now and we'll review your file within 48 hours.", cta_label: "Apply & Get Started", cta_href: "#apply" },
    ];
  }
  if (template === "vsl") {
    return [
      { type: "hero", title, subtitle: "Watch the 7-minute breakdown.", cta_label: "Get started", cta_href: "#cta" },
      { type: "cta", title: "Ready when you are.", cta_label: "Start", cta_href: "#" },
    ];
  }
  return [
    { type: "hero", title, subtitle: "Drop your details and we'll get back to you.", cta_label: "Get the guide", cta_href: "#form" },
  ];
}

function formTemplateSchema(template: string): any {
  if (template === "btf-application") {
    return {
      submit_label: "Submit Application",
      sections: [
        { title: "Personal Information", description: "We need this to build your fundable foundation. Your information is secure.", fields: [
          { key: "first_name", label: "Legal First Name", type: "text", required: true, maps_to: "contacts.first_name" },
          { key: "last_name", label: "Legal Last Name", type: "text", required: true, maps_to: "contacts.last_name" },
          { key: "email", label: "Personal Email", type: "email", required: true, maps_to: "contacts.email" },
          { key: "phone", label: "Personal Phone", type: "tel", required: true, maps_to: "contacts.phone" },
          { key: "dob", label: "Date of Birth", type: "date" },
          { key: "ssn4", label: "SSN (Last 4)", type: "ssn4", help: "For identity verification purposes." },
          { key: "home_address", label: "Personal Home Address", type: "textarea" },
          { key: "personal_income", label: "Personal Annual Income", type: "currency", help: "W-2 or other documented income." },
          { key: "ownership_pct", label: "Business Ownership %", type: "number" },
        ]},
        { title: "Business Entity", description: "Tell us where your business currently stands.", fields: [
          { key: "has_entity", label: "Do you already have an existing business entity?", type: "radio", options: ["Yes, I have an LLC, S-Corp, or C-Corp", "No, I need one built for me"], required: true },
          { key: "formation_state", label: "Preferred State of Formation", type: "text", help: "We will help you determine the best state if you aren't sure." },
          { key: "business_email", label: "Business Email", type: "email", maps_to: "businesses.email" },
          { key: "business_website", label: "Business Website", type: "text", maps_to: "businesses.website" },
          { key: "business_address", label: "Business Address", type: "textarea", help: "Physical or virtual business address." },
          { key: "business_phone", label: "Business Phone", type: "tel", help: "If different from personal." },
          { key: "duns", label: "DUNS Number", type: "text" },
        ]},
        { title: "Funding Profile", description: "Lenders look at your personal credit to establish trust.", fields: [
          { key: "credit_band", label: "Personal Credit Score Band", type: "select", required: true,
            options: ["Excellent (720+)","Good (680-719)","Fair (620-679)","Building (Below 620)"] },
          { key: "biz_credit_monitoring", label: "Business Credit Monitoring (e.g. Nav.com)", type: "radio",
            options: ["Yes, I monitor my business credit","No, I do not have monitoring"] },
          { key: "annual_revenue", label: "Annual Business Revenue", type: "currency" },
          { key: "avg_monthly_sales", label: "Average Monthly Sales", type: "currency" },
          { key: "employees", label: "Number of Employees", type: "number" },
          { key: "funding_goal", label: "Funding Goal", type: "currency" },
          { key: "use_of_funds", label: "Intended Use of Funds", type: "textarea" },
        ]},
      ],
    };
  }
  if (template === "lead-magnet") {
    return { submit_label: "Get the guide", sections: [{ title: "Get instant access", fields: [
      { key: "first_name", label: "First Name", type: "text", required: true, maps_to: "contacts.first_name" },
      { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
    ]}]};
  }
  if (template === "coach-application") {
    return { submit_label: "Apply", sections: [{ title: "About you", fields: [
      { key: "first_name", label: "First Name", type: "text", required: true, maps_to: "contacts.first_name" },
      { key: "last_name", label: "Last Name", type: "text", required: true, maps_to: "contacts.last_name" },
      { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
      { key: "years_experience", label: "Years coaching", type: "number" },
      { key: "clients_managed", label: "How many clients do you currently manage?", type: "number" },
      { key: "background", label: "Background", type: "textarea" },
    ]}]};
  }
  // discovery-call
  return { submit_label: "Book a call", sections: [{ title: "Tell us about your business", fields: [
    { key: "first_name", label: "First Name", type: "text", required: true, maps_to: "contacts.first_name" },
    { key: "last_name", label: "Last Name", type: "text", required: true, maps_to: "contacts.last_name" },
    { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
    { key: "phone", label: "Phone", type: "tel", maps_to: "contacts.phone" },
    { key: "business_name", label: "Business Name", type: "text", maps_to: "businesses.legal_name" },
    { key: "annual_revenue", label: "Annual Revenue", type: "currency" },
    { key: "timeline", label: "Funding timeline", type: "select", options: ["Immediate","30 days","60-90 days","Just exploring"] },
  ]}]};
}
