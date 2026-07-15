// Growth OS — unified admin hub for Pages, Forms, Funnels, Submissions, External Sources.
// Phase 1 keeps creation flows lightweight (template-driven + JSON-editable) so we ship
// the engine fast; a visual editor lands in v2.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import type { GrowthBlock, GrowthFormSchema } from "@/lib/growth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell, PageHeader, SectionCard, StatRow, StatTile, EmptyState, StatePill } from "@/components/ui/page";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, LayoutGrid, GitBranch, Inbox, Plug, Copy, ExternalLink, Plus, UserPlus, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Page = { id: string; slug: string; title: string; status: string; updated_at: string };
type Form = { id: string; slug: string; name: string; status: string; updated_at: string };
type Funnel = { id: string; slug: string; name: string; status: string; updated_at: string };
type Submission = { id: string; form_id: string; created_at: string; payload_json: any; source: string; contact_id: string | null };
type ExternalSource = { id: string; provider: string; label: string; webhook_token: string; active: boolean; last_seen_at: string | null };


// Platform-default template sets (§2/§9): these ship to EVERY tenant, so they stay
// generic to client-based service businesses — coaches, consultants, agencies, advisors,
// thought leaders. No vertical's content lives here. A tenant with a specific offer
// authors their own pages/forms in the Studio (or has Paige generate them); those are
// tenant-scoped rows, never platform defaults.
const PAGE_TEMPLATES = [
  { key: "offer-sales", label: "Offer Sales Page", description: "The full pitch: how the work runs, what's included, pricing, and the questions people always ask." },
  { key: "lead-magnet", label: "Lead Magnet Opt-in", description: "One promise, what's inside, and the opt-in. Built to trade a resource for an email." },
  { key: "discovery-call", label: "Discovery Call Page", description: "What the call is, what happens on it, and the request form." },
  { key: "workshop", label: "Workshop Registration", description: "Live workshop or webinar — countdown, the agenda, and registration." },
  { key: "client-proof", label: "Results & Proof", description: "Client outcomes, quotes, and the names you work with — the page that closes doubters." },
];
const FORM_TEMPLATES = [
  { key: "discovery-call", label: "Discovery Call Request", description: "Who they are, what they run, what's in the way, and when they want to move." },
  { key: "client-application", label: "Engagement Application", description: "Three steps: about them, their business, and whether the work is a fit." },
  { key: "client-intake", label: "New Client Intake", description: "Everything you need on day one — goals, context, how they like to work." },
  { key: "lead-magnet", label: "Lead Magnet Opt-in", description: "First name and email. Nothing else in the way." },
  { key: "client-story", label: "Client Story Request", description: "Ask a client for the outcome, the quote, and permission to use it." },
];
const PROVIDERS = ["webflow","framer","clickfunnels","gohighlevel","typeform","jotform","custom"];

interface GrowthHubProps {
  /**
   * When true, GrowthHub is rendered inside another page (CampaignsHub) that
   * already provides the outer heading and tab list. We hide our own chrome
   * and just render the active tab's content.
   */
  embedded?: boolean;
}

export default function GrowthHub({ embedded = false }: GrowthHubProps) {
  const { activeTenantId, activeTenant } = useTenantContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pages";

  const [pages, setPages] = useState<Page[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  // Submissions are a per-form metric (lead capture), not a top-level surface —
  // the count lives on each form, the raw responses drill from that form, and the
  // lead itself flows into Contacts. This is the count keyed by form_id.
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
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
        supabase.from("growth_form_submissions").select("form_id").eq("tenant_id", activeTenantId),
        supabase.from("growth_external_sources").select("id,provider,label,active,last_seen_at").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      ]);
      setPages((p.data ?? []) as Page[]);
      setForms((f.data ?? []) as Form[]);
      setFunnels((fn.data ?? []) as Funnel[]);
      const counts: Record<string, number> = {};
      ((s.data ?? []) as { form_id: string }[]).forEach((r) => { if (r.form_id) counts[r.form_id] = (counts[r.form_id] ?? 0) + 1; });
      setSubCounts(counts);
      setSources((src.data ?? []) as ExternalSource[]);
      setLoading(false);
    })();
  }, [activeTenantId, tab]);

  const totalSubs = useMemo(() => Object.values(subCounts).reduce((a, b) => a + b, 0), [subCounts]);

  const tenantSlug = activeTenant?.slug ?? "tenant";
  const inboundBase = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/growth-inbound`;

  const tabs = (
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        {!embedded && (
          <TabsList>
            <TabsTrigger value="pages"><LayoutGrid className="w-4 h-4 mr-1.5" />Pages</TabsTrigger>
            <TabsTrigger value="funnels"><GitBranch className="w-4 h-4 mr-1.5" />Funnels</TabsTrigger>
            <TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1.5" />Forms</TabsTrigger>
            <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-1.5" />External Builders</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="pages" className="space-y-4 mt-4">
          <SectionHeader title="Landing Pages" cta={
            <CreatePageDialog tenantId={activeTenantId} pages={pages} forms={forms} onCreated={() => setParams({ tab: "pages" })} />
          } />
          {loading ? <div className="text-muted-foreground text-sm">Loading…</div> : pages.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="No pages yet" description="Spin one up from a template, then publish it when it's ready to go live." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((p) => (
                <SectionCard
                  key={p.id}
                  interactive
                  title={<span className="truncate">{p.title}</span>}
                  actions={<StatePill state={p.status === "published" ? "success" : "off"}>{p.status}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div>/{p.slug}</div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/p/${tenantSlug}/${p.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />View
                        </a>
                      </Button>
                      <TogglePublishButton row={p} onChanged={() => setParams({ tab: "pages" })} />
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="funnels" className="space-y-4 mt-4">
          <SectionHeader title="Funnels" cta={
            <CreateFunnelDialog tenantId={activeTenantId} pages={pages} forms={forms} onCreated={() => setParams({ tab: "funnels" })} />
          } />
          {funnels.length === 0 ? (
            <EmptyState icon={GitBranch} title="No funnels yet" description="A funnel chains pages → forms → success in one flow. Build one once you have a page and a form." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {funnels.map((f) => (
                <SectionCard
                  key={f.id}
                  interactive
                  title={<span>{f.name}</span>}
                  actions={<StatePill state={f.status === "active" ? "success" : "off"}>{f.status}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground">
                    <div className="mb-2">/f/{tenantSlug}/{f.slug}</div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/f/${tenantSlug}/${f.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                      </a>
                    </Button>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forms" className="space-y-4 mt-4">
          <SectionHeader title="Forms & Questionnaires" cta={
            <CreateFormDialog tenantId={activeTenantId} onCreated={() => setParams({ tab: "forms" })} />
          } />
          {forms.length === 0 ? (
            <EmptyState icon={FileText} title="No forms yet" description="Use a template or have Paige generate one for you." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((f) => (
                <SectionCard
                  key={f.id}
                  interactive
                  title={<span className="truncate">{f.name}</span>}
                  actions={<StatePill state={f.status === "active" ? "success" : "off"}>{f.status}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">/{f.slug}</span>
                      <span className="tabular-nums shrink-0">{subCounts[f.id] ?? 0} submission{(subCounts[f.id] ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/form/${f.id}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                        </a>
                      </Button>
                      <CopyButton text={`${window.location.origin}/form/${f.id}`} label="Copy link" />
                      <FormSubmissionsDialog form={f} tenantId={activeTenantId} />
                    </div>
                  </div>
                </SectionCard>
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
            <EmptyState icon={Plug} title="No external sources yet" description="Add a bridge for each external form or builder you want to pipe into Paige." />
          ) : (
            <div className="space-y-2">
              {sources.map((s) => {
                const webhookUrl = s.webhook_token ? `${inboundBase}/${s.webhook_token}` : `${inboundBase}/[token hidden — regenerate to view]`;
                return (
                  <SectionCard key={s.id}>
                    <div className="text-xs space-y-2">
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
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
  );

  if (embedded) return <div className="space-y-6">{tabs}</div>;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Pages · Funnels · Forms"
        title="Growth OS"
        description="Landing pages, funnels, and forms — all wired into your contacts, pipeline, and Paige workflows."
      />
      <StatRow>
        <StatTile label="Pages" value={pages.length} icon={LayoutGrid} loading={loading} />
        <StatTile label="Funnels" value={funnels.length} icon={GitBranch} loading={loading} />
        <StatTile label="Forms" value={forms.length} icon={FileText} loading={loading} />
        <StatTile label="Submissions" value={totalSubs} icon={Inbox} loading={loading} />
      </StatRow>
      {tabs}
    </PageShell>
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

// Submissions are scoped to their form (lead capture), not a global bucket. Each
// form drills into its own responses on demand; the lead itself flows to Contacts.
function FormSubmissionsDialog({ form, tenantId }: { form: Form; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    supabase
      .from("growth_form_submissions")
      .select("id,form_id,created_at,payload_json,source,contact_id")
      .eq("tenant_id", tenantId)
      .eq("form_id", form.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { if (active) { setRows((data ?? []) as Submission[]); setLoading(false); } });
    return () => { active = false; };
  }, [open, form.id, tenantId]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Inbox className="w-3.5 h-3.5 mr-1" />Submissions</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="truncate">{form.name} — submissions</DialogTitle></DialogHeader>
        {loading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No submissions yet" description="When someone fills out this form, their responses land here and the lead flows into Contacts." />
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <SubmissionRow
                key={s.id}
                sub={s}
                tenantId={tenantId}
                onConverted={(contactId) => setRows((prev) => prev.map((x) => x.id === s.id ? { ...x, contact_id: contactId } : x))}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>
      <Copy className="w-3.5 h-3.5 mr-1" />{label}
    </Button>
  );
}

// ---------- the publish rail ----------
//
// growth_pages carries a draft/live split: the Studio writes `draft_blocks_json`, the
// public renderer reads `blocks_json`. Only growth_page_publish copies draft -> live, and
// only it runs the go-live guards (unresolved fill-in prompts, a signup section with no
// live form behind it, a workspace with no public link). A raw
// `update growth_pages set status='published'` skips every one of them and ships a live,
// blank, public page. So publish goes through the RPC — the same rail the Studio and Paige
// use (§10: one seam, many callers).

/**
 * Postgres RAISE messages arrive as "GROWTH_CODE: human half". Operators never see the
 * code, the table, or the function (§11) — they see the move that fixes it (§3 voice).
 */
function growthSeamMessage(err: unknown, fallback: string): string {
  const raw = String((err as { message?: string } | null)?.message ?? "");
  const code = /^(GROWTH_[A-Z_]+)\b/.exec(raw)?.[1];
  switch (code) {
    case "GROWTH_NO_DRAFT":
      return "Nothing to publish yet. Open this page in the Studio, make your edits, and save — then publish.";
    case "GROWTH_UNRESOLVED_PLACEHOLDER":
      return "This page still has fill-in-the-blank prompts on it. Replace them with your real dates, links, and words, then publish.";
    case "GROWTH_FORM_MISSING":
      return "The signup section on this page has no live form behind it. Re-save the page in the Studio and the form gets built for you.";
    case "GROWTH_NO_TENANT_SLUG":
      return "Your workspace has no public link yet. Set one in Settings, then publish.";
    case "GROWTH_INVALID_BLOCKS":
      return "One of the sections on this page isn't finished. Open it in the Studio, fix the section, and save.";
    case "GROWTH_INVALID_SLUG":
      return "This page needs a link before it can go live.";
    case "GROWTH_NOT_FOUND":
      return "That page isn't here anymore. Refresh and try again.";
    case "GROWTH_NO_TENANT":
      return "Pick a workspace first.";
    case "GROWTH_FORBIDDEN":
      return "You don't have access to do that.";
    default:
      return fallback;
  }
}

type PublishResult = { url?: string | null };

function TogglePublishButton({ row, onChanged }: { row: Page; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const isLive = row.status === "published";

  const run = async () => {
    setBusy(true);
    try {
      if (isLive) {
        // Taking a page down is just a status flip — nothing is copied, no guard applies.
        const { error } = await supabase
          .from("growth_pages")
          .update({ status: "draft" })
          .eq("id", row.id);
        if (error) throw error;
        toast.success("Page taken down");
      } else {
        // Pages authored before the draft/live split (and any page whose live blocks were
        // written without a draft) have live blocks but an empty draft, and publish only
        // ships the draft. Seed the draft from what's already live — through the same
        // upsert seam, so the blocks still get validated and the backing form still gets
        // authored — rather than leaving those pages permanently unpublishable.
        const { data: existing, error: readErr } = await supabase
          .from("growth_pages")
          .select("draft_blocks_json,blocks_json")
          .eq("id", row.id)
          .single();
        if (readErr) throw readErr;
        const draft = (existing as { draft_blocks_json?: unknown } | null)?.draft_blocks_json;
        const live = (existing as { blocks_json?: unknown } | null)?.blocks_json;
        if (!Array.isArray(draft) && Array.isArray(live) && live.length > 0) {
          const { error: seedErr } = await supabase.rpc("growth_page_upsert" as any, {
            p_tenant_id: null,
            p_slug: row.slug,
            p_title: row.title,
            p_blocks_json: live as any,
            p_theme_json: null,
            p_seo_json: null,
            p_id: row.id,
          });
          if (seedErr) throw seedErr;
        }

        const { data, error } = await supabase.rpc("growth_page_publish" as any, {
          p_tenant_id: null,
          p_id: row.id,
        });
        if (error) throw error;
        const url = (data as PublishResult | null)?.url ?? null;
        toast.success(url ? `Published — live at ${url}` : "Published");
      }
      onChanged();
    } catch (e) {
      toast.error(growthSeamMessage(e, isLive ? "Couldn't take that page down. Try again." : "Couldn't publish this page. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={run}>
      {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
      {isLive ? "Unpublish" : "Publish"}
    </Button>
  );
}

function CreatePageDialog({ tenantId, pages, forms, onCreated }: { tenantId: string | null; pages: Page[]; forms: Form[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState("lead-magnet");
  const [busy, setBusy] = useState(false);
  // The page's capture section. A template only emits its form section and its
  // "#apply" CTAs when a real form backs them — an invented slug would publish a
  // blank section and dead anchors.
  const [formId, setFormId] = useState<string>("");
  const connectedForm = forms.find((f) => f.id === formId) ?? null;

  // Creation goes through growth_page_upsert — the same rail the Studio and Paige write on
  // (§10). It validates every block server-side, writes the DRAFT columns (so a page made
  // here opens in the Studio with its content intact), and authors the backing form row for
  // any signup section. A raw insert of blocks_json did none of that.
  const create = async () => {
    if (!tenantId || !title || !slug) return toast.error("Title and slug required");
    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    // The seam upserts on (tenant, slug), so a collision would silently overwrite the other
    // page's draft. Say so instead.
    if (pages.some((p) => p.slug === normalizedSlug)) {
      return toast.error(`A page already lives at /${normalizedSlug}. Pick a different link.`);
    }
    setBusy(true);
    try {
      const blocks = templateBlocks(template, title, connectedForm?.slug ?? null);
      const { data, error } = await supabase.rpc("growth_page_upsert" as any, {
        p_tenant_id: null,
        p_slug: normalizedSlug,
        p_title: title,
        p_blocks_json: blocks as any,
        p_theme_json: null,
        p_seo_json: null,
        p_id: null,
      });
      if (error) throw error;
      // Provenance only (§12) — which template this started from. Never touches the
      // draft/live columns or the status, so it bypasses no guard.
      const newId = (data as { id?: string } | null)?.id;
      if (newId) await supabase.from("growth_pages").update({ template_key: template }).eq("id", newId);
      toast.success("Page created");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(growthSeamMessage(e, "Couldn't create that page. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="gold"><Plus className="w-4 h-4 mr-1" />New Page</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create landing page</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Work With Us" /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="work-with-us" /></div>
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
          <div>
            <label className="text-xs">Capture form (optional)</label>
            <Select value={formId} onValueChange={setFormId} disabled={forms.length === 0}>
              <SelectTrigger><SelectValue placeholder={forms.length === 0 ? "No forms yet — create one first" : "Pick a form"} /></SelectTrigger>
              <SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Connect a form and the page ships with its capture section and buttons wired. Skip it and you'll add them in the editor.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="gold" onClick={create} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create
          </Button>
        </DialogFooter>
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
      <DialogTrigger asChild><Button size="sm" variant="gold"><Plus className="w-4 h-4 mr-1" />New Form</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create form</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Discovery Call Request" /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="discovery-call" /></div>
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
        <DialogFooter><Button variant="gold" onClick={create}>Create</Button></DialogFooter>
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
      <DialogTrigger asChild><Button size="sm" variant="gold"><Plus className="w-4 h-4 mr-1" />New Funnel</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create funnel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="new-client" /></div>
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
        <DialogFooter><Button variant="gold" onClick={create}>Create</Button></DialogFooter>
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
      <DialogTrigger asChild><Button size="sm" variant="gold"><Plus className="w-4 h-4 mr-1" />Add Bridge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New external builder bridge</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs">Label</label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Webflow contact form" /></div>
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
        <DialogFooter><Button variant="gold" onClick={create}>Create bridge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- templates ----------
//
// House rules for everything in this section:
//  • §2/§9 — platform defaults are generic to client-based service businesses. No
//    vertical's offer, and nothing that reads as consumer finance, lives here.
//  • Proof is never fabricated. Testimonials, client logos, stat numbers, and prices
//    ship as *editing prompts*, not invented quotes/figures — a template must never hand
//    a tenant a fake review or a claim they didn't make. They fill them in the Studio.
//  • No dead links. `#apply` is the anchor the embedded_form block renders, so CTAs
//    pointing at it are only emitted when a real form is connected to the page.

/** The DOM id the embedded_form block renders — the only in-page anchor target. */
const APPLY_ANCHOR = "#apply";

/** CTA props for a hero/tier — omitted entirely when no form backs the page. */
const applyCta = (label: string, formSlug: string | null) =>
  formSlug ? { cta_label: label, cta_href: APPLY_ANCHOR } : {};

/** The form section — only when a real, existing form is connected. */
const formSection = (formSlug: string | null, title: string): GrowthBlock[] =>
  formSlug ? [{ type: "embedded_form", form_slug: formSlug, title }] : [];

/** The closing CTA — needs a live anchor to point at, so it follows the form. */
const closingCta = (formSlug: string | null, title: string, body: string, label: string): GrowthBlock[] =>
  formSlug ? [{ type: "cta", title, body, cta_label: label, cta_href: APPLY_ANCHOR }] : [];

/** Testimonials ship as prompts — the tenant replaces them with real client words. */
const TESTIMONIAL_PROMPTS: GrowthBlock = {
  type: "testimonial",
  items: [
    { quote: "Paste a client's own words here — what changed for them, and how fast.", author: "Client name", role: "Their role, their company" },
    { quote: "The strongest quote names the problem they walked in with and the result they walked out with.", author: "Client name", role: "Their role, their company" },
  ],
};

function templateBlocks(template: string, title: string, formSlug: string | null): GrowthBlock[] {
  switch (template) {
    case "offer-sales":
      return [
        { type: "hero", eyebrow: "Work with us", title,
          subtitle: "The problem you're carrying, the work we do about it, and what it looks like when it's handled.",
          ...applyCta("Apply to work together", formSlug) },
        { type: "stats", title: "The short version", items: [
          { value: "—", label: "Clients served to date" },
          { value: "—", label: "Years doing this work" },
          { value: "—", label: "Typical engagement length" },
        ]},
        { type: "steps", title: "How the work runs", items: [
          { number: "01", title: "We get the full picture", body: "One deep session where we map what you're running, who your clients are, and where it's leaking. No guessing — we look at the real thing." },
          { number: "02", title: "We build the plan", body: "You get a written plan with the moves, the order, and who owns each one. It's yours whether or not we go further." },
          { number: "03", title: "We run it with you", body: "Standing sessions, work between them, and a team that answers. You're never sitting on a decision alone." },
        ]},
        { type: "feature_grid", title: "What's included", items: [
          { title: "Standing sessions", body: "A recurring hour with a real person who knows your business and remembers last time." },
          { title: "The plan, in writing", body: "Priorities, owners, and dates. Everyone can see what happens next." },
          { title: "Between-session access", body: "You don't wait a week to ask the question that's blocking you today." },
          { title: "Your team, not just you", body: "We bring in whoever else needs to be in the room so the work actually lands." },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "pricing", title: "Ways to work together", tiers: [
          { name: "Intensive", price: "—", period: "one-time", features: ["A single deep working session", "The written plan", "Two weeks of follow-up"], ...applyCta("Start here", formSlug) },
          { name: "Ongoing", price: "—", period: "per month", features: ["Standing sessions", "Between-session access", "Plan owned and driven end to end"], featured: true, ...applyCta("Apply", formSlug) },
          { name: "Team", price: "—", period: "per month", features: ["Everything in Ongoing", "Sessions with your team", "Quarterly review with leadership"], ...applyCta("Talk to us", formSlug) },
        ]},
        { type: "faq", title: "Before you ask", items: [
          { question: "Who is this actually for?", answer: "People running client work who are past the beginner questions and are being held back by something specific. If you can name the problem, we can work on it." },
          { question: "How fast do we start?", answer: "Send the application. If it's a fit, we'll get you on the calendar and tell you exactly what to bring." },
          { question: "What if it isn't a fit?", answer: "We'll tell you, and we'll point you at what would serve you better. Nobody's time is worth wasting." },
          { question: "What do you need from me?", answer: "Honesty about where things really are, and the time you committed to. That's it." },
        ]},
        ...formSection(formSlug, "Apply"),
        ...closingCta(formSlug, "Ready when you are.", "Tell us what you're working on. We'll tell you straight whether we can help.", "Apply to work together"),
      ];

    case "lead-magnet":
      return [
        { type: "hero", eyebrow: "Free resource", title,
          subtitle: "One thing you can use today. Drop your details and it's yours.",
          ...applyCta("Send it to me", formSlug) },
        { type: "feature_grid", title: "What's inside", items: [
          { title: "The thing itself", body: "Say plainly what they get — the checklist, the template, the walkthrough." },
          { title: "Why it matters", body: "Name the problem it solves. One sentence, no throat-clearing." },
          { title: "What to do with it", body: "Tell them the first move to make once they have it." },
        ]},
        ...formSection(formSlug, "Where should we send it?"),
      ];

    case "discovery-call":
      return [
        { type: "hero", eyebrow: "Book a call", title,
          subtitle: "Thirty minutes. You leave knowing your next move, whether or not you work with us.",
          ...applyCta("Request a call", formSlug) },
        { type: "steps", title: "What happens on the call", items: [
          { number: "01", title: "You talk, we listen", body: "Where the business is, what you've already tried, what's actually in the way." },
          { number: "02", title: "We tell you what we see", body: "The honest read — including when the answer is that you don't need us." },
          { number: "03", title: "You get the next move", body: "One clear recommendation you can act on this week." },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "faq", title: "Questions people ask first", items: [
          { question: "Is this a sales call?", answer: "It's a working call. If it makes sense to keep going, we'll say so at the end — you won't have to sit through a pitch to get value." },
          { question: "How should I prepare?", answer: "Bring the real numbers and the real problem. The more honest the input, the more useful the half hour." },
          { question: "How long until we speak?", answer: "Send the request and we'll come back with times that work." },
        ]},
        ...formSection(formSlug, "Request your call"),
        ...closingCta(formSlug, "Grab a time.", "Tell us where things stand. We'll take it from there.", "Request a call"),
      ];

    case "workshop":
      return [
        { type: "hero", eyebrow: "Live workshop", title,
          subtitle: "Live, working, and recorded. Come with a real problem and leave with it half-solved.",
          ...applyCta("Save my seat", formSlug) },
        { type: "countdown", title: "Doors close in", subtitle: "Set the real date and time in the Studio.",
          ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          expired_text: "Registration is closed — join the list for the next one." },
        { type: "steps", title: "What we'll cover", items: [
          { number: "01", title: "The first thing", body: "Name the segment and what they walk away able to do." },
          { number: "02", title: "The second thing", body: "Keep it concrete — a move they can run the same week." },
          { number: "03", title: "Live Q&A", body: "Bring the question you can't get a straight answer to anywhere else." },
        ]},
        { type: "faq", title: "Details", items: [
          { question: "Is it recorded?", answer: "Yes. Register and you'll get the recording either way." },
          { question: "What does it cost?", answer: "Say it plainly here — free, or the price." },
          { question: "Who should come?", answer: "Describe the person this is built for, and who it isn't." },
        ]},
        ...formSection(formSlug, "Register"),
        ...closingCta(formSlug, "Save your seat.", "Seats are live now. Register and we'll send the link.", "Save my seat"),
      ];

    case "client-proof":
      return [
        { type: "hero", eyebrow: "Results", title,
          subtitle: "The work, in the words of the people it was done for.",
          ...applyCta("Work with us", formSlug) },
        { type: "stats", title: "By the numbers", items: [
          { value: "—", label: "Clients served" },
          { value: "—", label: "Average result" },
          { value: "—", label: "Years in the work" },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "social_proof", title: "The people we work with", logos: [
          { name: "Client or partner name" },
          { name: "Client or partner name" },
          { name: "Client or partner name" },
          { name: "Client or partner name" },
        ]},
        ...formSection(formSlug, "Start the conversation"),
        ...closingCta(formSlug, "Want results like these?", "Tell us where you are. We'll tell you what it would take.", "Work with us"),
      ];

    default:
      return [
        { type: "hero", title, subtitle: "Tell them what this page is for, in one line.",
          ...applyCta("Get started", formSlug) },
        ...formSection(formSlug, "Get in touch"),
      ];
  }
}

function formTemplateSchema(template: string): GrowthFormSchema {
  switch (template) {
    case "client-application":
      return {
        submit_label: "Submit application",
        sections: [
          { title: "About you", description: "The basics, so we know who we're talking to.", fields: [
            { key: "first_name", label: "First name", type: "text", required: true, maps_to: "contacts.first_name" },
            { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "contacts.last_name" },
            { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
            { key: "phone", label: "Phone", type: "tel", maps_to: "contacts.phone" },
            { key: "role", label: "Your role", type: "text", placeholder: "Founder, principal, partner…" },
            { key: "location", label: "Where are you based?", type: "text", help: "So we can find hours that work for both of us." },
          ]},
          { title: "Your business", description: "Where things actually stand today.", fields: [
            { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
            { key: "website", label: "Website", type: "text", maps_to: "businesses.website" },
            { key: "what_you_do", label: "What does your business do?", type: "textarea", required: true, placeholder: "Who you serve and what you sell them." },
            { key: "team_size", label: "How many people on the team?", type: "number" },
            { key: "years_operating", label: "Years operating", type: "number" },
            { key: "clients_active", label: "How many active clients right now?", type: "number" },
          ]},
          { title: "The work", description: "What you want moved, and whether now is the time.", fields: [
            { key: "primary_goal", label: "What outcome are you after?", type: "textarea", required: true, placeholder: "Be specific. What's different in six months if this works?" },
            { key: "biggest_obstacle", label: "What's in the way?", type: "textarea", required: true },
            { key: "tried_already", label: "What have you already tried?", type: "textarea", help: "Saves us both from re-running something that didn't work." },
            { key: "timeline", label: "When do you want to start?", type: "select", required: true,
              options: ["Right away", "In the next 30 days", "This quarter", "Just exploring for now"] },
            { key: "budget_range", label: "What have you set aside for this?", type: "select",
              options: ["Not sure yet", "Under $2,500", "$2,500 – $10,000", "$10,000 – $25,000", "$25,000+"] },
            { key: "commitment", label: "I'm ready to do the work between sessions, not just show up to them.", type: "checkbox" },
          ]},
        ],
      };

    case "client-intake":
      return {
        submit_label: "Send it over",
        sections: [
          { title: "Your details", fields: [
            { key: "first_name", label: "First name", type: "text", required: true, maps_to: "contacts.first_name" },
            { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "contacts.last_name" },
            { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
            { key: "phone", label: "Phone", type: "tel", maps_to: "contacts.phone" },
            { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
            { key: "start_date", label: "When do you want to start?", type: "date" },
          ]},
          { title: "How we'll work", description: "So the first session starts at full speed instead of warming up.", fields: [
            { key: "primary_goal", label: "What are we working toward?", type: "textarea", required: true },
            { key: "success_looks_like", label: "What does 'this worked' look like to you?", type: "textarea" },
            { key: "biggest_obstacle", label: "What's the biggest thing in the way?", type: "textarea" },
            { key: "weekly_hours", label: "Hours a week you can genuinely put in", type: "number" },
            { key: "meeting_preference", label: "How do you like to meet?", type: "radio",
              options: ["Video call", "Phone", "In person", "Whatever's easiest"] },
            { key: "comms_preference", label: "Best way to reach you between sessions", type: "radio",
              options: ["Email", "Text", "Client portal"] },
            { key: "anything_else", label: "Anything we should know before we start?", type: "textarea" },
          ]},
        ],
      };

    case "lead-magnet":
      return {
        submit_label: "Send it to me",
        sections: [{ title: "Where should we send it?", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "contacts.first_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
        ]}],
      };

    case "client-story":
      return {
        submit_label: "Send my story",
        sections: [{ title: "Tell us what changed", description: "A few minutes from you, and we can show other people what this work actually does.", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "contacts.first_name" },
          { key: "last_name", label: "Last name", type: "text", maps_to: "contacts.last_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
          { key: "role", label: "Your role and company", type: "text", help: "How you'd like to be named when we quote you." },
          { key: "before", label: "Where were you before we started?", type: "textarea", required: true },
          { key: "after", label: "Where are you now?", type: "textarea", required: true },
          { key: "quote", label: "If you had one line to say about the work, what would it be?", type: "textarea" },
          { key: "rating", label: "How likely are you to recommend us?", type: "select",
            options: ["5 — Without hesitation", "4 — Very likely", "3 — Maybe", "2 — Unlikely", "1 — No"] },
          { key: "permission", label: "You can use my words and name publicly.", type: "checkbox" },
        ]}],
      };

    default: // discovery-call
      return {
        submit_label: "Request a call",
        sections: [{ title: "Tell us about your business", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "contacts.first_name" },
          { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "contacts.last_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "contacts.email" },
          { key: "phone", label: "Phone", type: "tel", maps_to: "contacts.phone" },
          { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
          { key: "what_you_do", label: "What do you do, and who for?", type: "textarea", required: true },
          { key: "biggest_obstacle", label: "What's the one thing in the way right now?", type: "textarea", required: true },
          { key: "timeline", label: "When do you want to move on this?", type: "select",
            options: ["Right away", "In the next 30 days", "This quarter", "Just exploring for now"] },
        ]}],
      };
  }
}

/**
 * Submission card with one-click "Send to Contact" — upserts a `clients`
 * row from the submission payload (by email) and links it back so the
 * submission becomes visible on that contact's record.
 */
function SubmissionRow({
  sub,
  tenantId,
  onConverted,
}: {
  sub: Submission;
  tenantId: string | null;
  onConverted: (contactId: string) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const payload = (sub.payload_json ?? {}) as Record<string, any>;
  const email = String(payload.email ?? "").trim().toLowerCase() || null;
  const firstName = String(payload.first_name ?? payload.firstName ?? "").trim() || null;
  const lastName = String(payload.last_name ?? payload.lastName ?? "").trim() || null;
  const phone = String(payload.phone ?? "").trim() || null;
  const entity = String(payload.business_name ?? payload.entity_name ?? "").trim() || null;

  const sendToContact = async () => {
    if (!tenantId) return toast.error("No active tenant");
    if (!email) return toast.error("Submission has no email — can't create contact");
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("email", email)
        .maybeSingle();

      let contactId = existing?.id as string | undefined;
      if (!contactId) {
        const { data: inserted, error: insErr } = await supabase
          .from("clients")
          .insert({
            tenant_id: tenantId,
            first_name: firstName ?? "Unknown",
            last_name: lastName ?? "",
            email,
            phone,
            entity_name: entity,
            source: "growth_form",
            status: "lead",
          } as any)
          .select("id")
          .single();
        if (insErr) throw insErr;
        contactId = inserted.id;
      }

      const { error: linkErr } = await supabase
        .from("growth_form_submissions")
        .update({ contact_id: contactId, processed: true, processed_at: new Date().toISOString() })
        .eq("id", sub.id);
      if (linkErr) throw linkErr;

      toast.success(existing ? "Linked to existing contact" : "Contact created");
      onConverted(contactId!);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send to contact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard>
      <div className="text-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{sub.source}</Badge>
            {sub.contact_id && (
              <StatePill state="success" icon={<Check className="w-3 h-3" />}>Linked</StatePill>
            )}
            <span className="text-muted-foreground">{new Date(sub.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            {sub.contact_id ? (
              <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/contacts/${sub.contact_id}`)}>
                <ExternalLink className="w-3 h-3 mr-1" /> Open contact
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={sendToContact} disabled={busy || !email}>
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <UserPlus className="w-3 h-3 mr-1" />}
                Send to Contact
              </Button>
            )}
          </div>
        </div>
        <pre className="whitespace-pre-wrap break-words text-muted-foreground bg-muted/40 p-2 rounded">
          {JSON.stringify(sub.payload_json, null, 2)}
        </pre>
      </div>
    </SectionCard>
  );
}

