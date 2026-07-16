// Growth OS — the LIBRARIES for Pages, Forms, Funnels, Submissions, External Sources.
// Creation happens in the Vibe Studio (/admin/studio?mode=…); once an asset is done it is SAVED
// here, where the operator can go back, edit, duplicate, recycle, and publish/unpublish.
// Every "New …" action deep-links INTO the Studio — no bare create dialogs.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell, PageHeader, SectionCard, StatRow, StatTile, EmptyState, StatePill, Toolbar, FilterChip } from "@/components/ui/page";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, LayoutGrid, GitBranch, Inbox, Plug, Copy, ExternalLink, Plus, UserPlus, Check, Loader2, Wand2, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { growthSeamMessage } from "@/lib/growth-templates";

type Page = { id: string; slug: string; title: string; status: string; updated_at: string };
type Form = { id: string; slug: string; name: string; status: string; updated_at: string };
type Funnel = { id: string; slug: string; name: string; status: string; updated_at: string };
type Submission = { id: string; form_id: string; created_at: string; payload_json: any; source: string; contact_id: string | null };
// webhook_token is stored ENCRYPTED (webhook_token_ct) and SELECT-revoked from every non-service
// role (§9), so it is never on the row the tenant admin reads. The ingest URL is resolved on demand
// through a tenant-scoped reveal RPC — see RevealWebhookButton.
type ExternalSource = { id: string; provider: string; label: string; active: boolean; last_seen_at: string | null };


// Template sets + growthSeamMessage moved to src/lib/growth-templates.ts (§12) — one
// copy, shared with the Studio's form/funnel modes.
const PROVIDERS = ["webflow","framer","clickfunnels","gohighlevel","typeform","jotform","custom"];

/** "-copy" slug for a duplicate, uniquified against the already-loaded library. */
function uniqueCopySlug(base: string, taken: string[]): string {
  const set = new Set(taken);
  const root = `${base}-copy`.slice(0, 60);
  if (!set.has(root)) return root;
  for (let n = 2; n < 200; n++) {
    const candidate = `${root}-${n}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** "Updated 3 days ago" — relative, honest, never a raw timestamp on a card. */
function updatedAgo(iso: string): string {
  try {
    return `Updated ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
  } catch {
    return "";
  }
}

interface GrowthHubProps {
  /**
   * When true, GrowthHub is rendered inside another page (CampaignsHub) that
   * already provides the outer heading and tab list. We hide our own chrome
   * and just render the active tab's content.
   */
  embedded?: boolean;
  /**
   * Bumped by the parent hub after a Vibe Studio publish or save. It's a dep of the load
   * effect, so the Pages/Forms/Funnels lists refetch and a freshly built page shows up
   * immediately — no manual reload — even when this component stays mounted.
   */
  refreshNonce?: number;
}

export default function GrowthHub({ embedded = false, refreshNonce = 0 }: GrowthHubProps) {
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
  // Refetch trigger for this component's own mutations (create / publish / take-down). Setting
  // the tab param to the value it already holds does NOT re-run the load effect, so a dedicated
  // counter is the honest way to pull fresh rows after a write — no full reload, no stale card.
  const [localRefresh, setLocalRefresh] = useState(0);
  const refresh = () => setLocalRefresh((n) => n + 1);

  // Library filters — client-side over the already-fetched, tenant-scoped arrays.
  const [pageFilter, setPageFilter] = useState<"all" | "live" | "draft">("all");
  const [funnelFilter, setFunnelFilter] = useState<"all" | "active" | "draft">("all");
  const [formFilter, setFormFilter] = useState<"all" | "active" | "draft">("all");

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
  }, [activeTenantId, tab, refreshNonce, localRefresh]);

  const totalSubs = useMemo(() => Object.values(subCounts).reduce((a, b) => a + b, 0), [subCounts]);

  const shownPages = useMemo(
    () => pages.filter((p) => pageFilter === "all" || (pageFilter === "live" ? p.status === "published" : p.status !== "published")),
    [pages, pageFilter],
  );
  const shownFunnels = useMemo(
    () => funnels.filter((f) => funnelFilter === "all" || (funnelFilter === "active" ? f.status === "active" : f.status !== "active")),
    [funnels, funnelFilter],
  );
  const shownForms = useMemo(
    () => forms.filter((f) => formFilter === "all" || (formFilter === "active" ? f.status === "active" : f.status !== "active")),
    [forms, formFilter],
  );

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
            /* Creation lives in the Studio — the library is where finished work is kept. */
            <Button size="sm" variant="default" onClick={() => setParams({ tab: "studio", mode: "page" })}>
              <Wand2 className="w-4 h-4 mr-1" />New page in Studio
            </Button>
          } />
          <Toolbar>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={pageFilter === "all"} onClick={() => setPageFilter("all")}>All</FilterChip>
              <FilterChip active={pageFilter === "live"} onClick={() => setPageFilter("live")}>Live</FilterChip>
              <FilterChip active={pageFilter === "draft"} onClick={() => setPageFilter("draft")}>Draft</FilterChip>
            </div>
            <span className="text-xs text-muted-foreground">{shownPages.length} page{shownPages.length === 1 ? "" : "s"}</span>
          </Toolbar>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
              ))}
            </div>
          ) : pages.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Nothing here yet"
              description="Build your first page in the Studio — describe it and Paige drafts it in front of you."
              action={
                <Button variant="outline" size="sm" onClick={() => setParams({ tab: "studio", mode: "page" })}>
                  Open the Studio
                </Button>
              }
            />
          ) : shownPages.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="Nothing matches that filter" description="Clear the filter to see every page you've saved." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownPages.map((p) => (
                <SectionCard
                  key={p.id}
                  interactive
                  title={<span className="truncate">{p.title}</span>}
                  actions={<StatePill state={p.status === "published" ? "success" : "off"}>{p.status === "published" ? "Live" : "Draft"}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">/{p.slug}</span>
                      <span className="shrink-0">{updatedAgo(p.updated_at)}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/p/${tenantSlug}/${p.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />View
                        </a>
                      </Button>
                      {/* Re-open this page's draft in the Studio. Switches the hub to the
                          Studio tab and hands it the page id; StudioShell loads the draft onto the
                          canvas. Not a go-live moment, so it stays outline — gold is publish only. */}
                      <Button size="sm" variant="outline" onClick={() => setParams({ tab: "studio", mode: "page", pageId: p.id })}>
                        <Wand2 className="w-3.5 h-3.5 mr-1" />Edit in Studio
                      </Button>
                      <DuplicatePageButton row={p} pages={pages} onDone={refresh} />
                      <TogglePublishButton row={p} onChanged={refresh} />
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="funnels" className="space-y-4 mt-4">
          <SectionHeader title="Funnels" cta={
            <Button size="sm" variant="default" onClick={() => setParams({ tab: "studio", mode: "funnel" })}>
              <Wand2 className="w-4 h-4 mr-1" />New funnel in Studio
            </Button>
          } />
          <Toolbar>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={funnelFilter === "all"} onClick={() => setFunnelFilter("all")}>All</FilterChip>
              <FilterChip active={funnelFilter === "active"} onClick={() => setFunnelFilter("active")}>Active</FilterChip>
              <FilterChip active={funnelFilter === "draft"} onClick={() => setFunnelFilter("draft")}>Draft</FilterChip>
            </div>
            <span className="text-xs text-muted-foreground">{shownFunnels.length} funnel{shownFunnels.length === 1 ? "" : "s"}</span>
          </Toolbar>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
              ))}
            </div>
          ) : funnels.length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="Nothing here yet"
              description="A funnel chains a page to a form to a thank-you in one flow. Build one in the Studio once you have a page and a form."
              action={
                <Button variant="outline" size="sm" onClick={() => setParams({ tab: "studio", mode: "funnel" })}>
                  Open the Studio
                </Button>
              }
            />
          ) : shownFunnels.length === 0 ? (
            <EmptyState icon={GitBranch} title="Nothing matches that filter" description="Clear the filter to see every funnel you've saved." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shownFunnels.map((f) => (
                <SectionCard
                  key={f.id}
                  interactive
                  title={<span>{f.name}</span>}
                  actions={<StatePill state={f.status === "active" ? "success" : "off"}>{f.status === "active" ? "Active" : "Draft"}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">/f/{tenantSlug}/{f.slug}</span>
                      <span className="shrink-0">{updatedAgo(f.updated_at)}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/f/${tenantSlug}/${f.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                        </a>
                      </Button>
                      <FunnelTogglePublishButton row={f} onChanged={refresh} />
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forms" className="space-y-4 mt-4">
          <SectionHeader title="Forms & Questionnaires" cta={
            <Button size="sm" variant="default" onClick={() => setParams({ tab: "studio", mode: "form" })}>
              <Wand2 className="w-4 h-4 mr-1" />New form in Studio
            </Button>
          } />
          <Toolbar>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={formFilter === "all"} onClick={() => setFormFilter("all")}>All</FilterChip>
              <FilterChip active={formFilter === "active"} onClick={() => setFormFilter("active")}>Active</FilterChip>
              <FilterChip active={formFilter === "draft"} onClick={() => setFormFilter("draft")}>Draft</FilterChip>
            </div>
            <span className="text-xs text-muted-foreground">{shownForms.length} form{shownForms.length === 1 ? "" : "s"}</span>
          </Toolbar>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nothing here yet"
              description="Build your first form in the Studio — pick the questions and it's live-ready in one move."
              action={
                <Button variant="outline" size="sm" onClick={() => setParams({ tab: "studio", mode: "form" })}>
                  Open the Studio
                </Button>
              }
            />
          ) : shownForms.length === 0 ? (
            <EmptyState icon={FileText} title="Nothing matches that filter" description="Clear the filter to see every form you've saved." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownForms.map((f) => (
                <SectionCard
                  key={f.id}
                  interactive
                  title={<span className="truncate">{f.name}</span>}
                  actions={<StatePill state={f.status === "active" ? "success" : "off"}>{f.status === "active" ? "Active" : "Draft"}</StatePill>}
                >
                  <div className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">/{f.slug}</span>
                      <span className="tabular-nums shrink-0">{subCounts[f.id] ?? 0} submission{(subCounts[f.id] ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                    <div>{updatedAgo(f.updated_at)}</div>
                    <div className="flex gap-2 flex-wrap">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/form/${f.id}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />Open
                        </a>
                      </Button>
                      <CopyButton text={`${window.location.origin}/form/${f.id}`} label="Copy link" />
                      <DuplicateFormButton row={f} forms={forms} onDone={refresh} />
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
            <CreateSourceDialog tenantId={activeTenantId} forms={forms} onCreated={refresh} />
          } />
          <p className="text-xs text-muted-foreground">
            Already using Webflow, Framer, ClickFunnels, GoHighLevel, Vibe, or Typeform? Create a bridge — point your form's webhook at the URL below and Paige will ingest every submission into your contacts and pipeline.
          </p>
          {sources.length === 0 ? (
            <EmptyState icon={Plug} title="No external sources yet" description="Add a bridge for each external form or builder you want to pipe into Paige." />
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <SectionCard key={s.id}>
                  <div className="text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{s.label}</div>
                      <Badge variant="outline" className="capitalize">{s.provider}</Badge>
                    </div>
                    <RevealWebhookButton sourceId={s.id} inboundBase={inboundBase} />
                    <div className="text-muted-foreground">
                      Last seen: {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "never"}
                    </div>
                  </div>
                </SectionCard>
              ))}
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
      {/* The header stays put; only the responses region scrolls, so a form with 100 responses
          never turns the dialog into one long scroll-wall (§11/§67). */}
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle className="truncate">{form.name} — submissions</DialogTitle></DialogHeader>
        {loading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No submissions yet" description="When someone fills out this form, their responses land here and the lead flows into Contacts." />
        ) : (
          <div className="space-y-2 overflow-y-auto -mr-2 pr-2 py-1">
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

/**
 * The bridge's ingest URL, revealed on demand.
 *
 * The webhook token is stored ENCRYPTED (webhook_token_ct) and SELECT-revoked from every
 * non-service role — a tenant admin can never read it off the row, and we must never widen that
 * (§9). So the full URL is resolved through a tenant-scoped SECURITY DEFINER RPC that decrypts
 * the token ONLY for a source inside the caller's own tenant and returns it just-in-time. This
 * is the §10 seam: the UI is one caller; Paige's headless tools are another. Nothing is shown
 * until the operator asks, and the raw token never lives in the page's data.
 */
function RevealWebhookButton({ sourceId, inboundBase }: { sourceId: string; inboundBase: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      // Tenant-pinned reveal (IDOR-safe): the RPC resolves the token from webhook_token_ct only
      // for a source in current_user_tenant_id(), and role-gates the caller server-side.
      const { data, error } = await supabase.rpc("growth_external_source_reveal_token" as any, {
        p_id: sourceId,
      });
      if (error) throw error;
      const token = typeof data === "string" && data.trim() ? data : null;
      if (!token) {
        toast.error("This bridge doesn't have an ingest link yet.");
        return;
      }
      setUrl(`${inboundBase}/${token}`);
    } catch (e) {
      toast.error(growthSeamMessage(e, "Couldn't fetch the ingest link. Refresh and try again."));
    } finally {
      setBusy(false);
    }
  };

  if (url) {
    return (
      <div className="flex gap-2 items-center">
        <Input readOnly value={url} className="text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={url} label="Copy" />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="outline" onClick={reveal} disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
        Reveal ingest URL
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Point your form's webhook at this URL. It carries a secret key, so it's shown only when you ask.
      </p>
    </div>
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
    <Button size="sm" variant={isLive ? "ghost" : "gold"} disabled={busy} onClick={run}>
      {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
      {isLive ? "Unpublish" : "Publish"}
    </Button>
  );
}

/**
 * The funnel go-live control. A funnel is created as a DRAFT (the public funnel route only
 * serves status='active'), and growth_funnel_publish is the only path to 'active' — it enforces
 * the lead-capture guards (every step's page published, every step's form active, entry/success
 * pages live) so a "live" funnel can never render a blank or dead step (§13). Taking one down is
 * a plain status flip, so it goes straight through the tenant-scoped table policy. Gold is spent
 * only on the go-live click (§11).
 */
function FunnelTogglePublishButton({ row, onChanged }: { row: Funnel; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const isLive = row.status === "active";

  const run = async () => {
    setBusy(true);
    try {
      if (isLive) {
        const { error } = await supabase
          .from("growth_funnels")
          .update({ status: "draft" })
          .eq("id", row.id);
        if (error) throw error;
        toast.success("Funnel taken down");
      } else {
        const { data, error } = await supabase.rpc("growth_funnel_publish" as any, {
          p_tenant_id: null,
          p_id: row.id,
        });
        if (error) throw error;
        const url = (data as { url?: string } | null)?.url ?? null;
        toast.success(url ? `Published — live at ${url}` : "Funnel published");
      }
      onChanged();
    } catch (e) {
      toast.error(growthSeamMessage(e, isLive ? "Couldn't take that funnel down. Try again." : "Couldn't publish this funnel. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant={isLive ? "ghost" : "gold"} disabled={busy} onClick={run}>
      {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
      {isLive ? "Unpublish" : "Publish"}
    </Button>
  );
}

/**
 * Duplicate a page — read the row's current content (draft first, live as the fallback,
 * the same precedence the Studio uses), then write a NEW row through the SAME
 * growth_page_upsert seam with p_id:null and a "-copy" slug uniquified against the loaded
 * library. No new backend, no guard skipped: the RPC re-validates every block and
 * re-authors the backing form for any signup section.
 */
function DuplicatePageButton({ row, pages, onDone }: { row: Page; pages: Page[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("growth_pages")
        .select("draft_blocks_json,blocks_json,title,theme_json,seo_json")
        .eq("id", row.id)
        .single();
      if (error) throw error;
      const d = data as {
        draft_blocks_json?: unknown; blocks_json?: unknown;
        title?: string; theme_json?: unknown; seo_json?: unknown;
      } | null;
      const blocks = Array.isArray(d?.draft_blocks_json)
        ? d?.draft_blocks_json
        : Array.isArray(d?.blocks_json)
          ? d?.blocks_json
          : null;
      if (!blocks || blocks.length === 0) {
        toast.error("This page has no content to copy yet. Open it in the Studio first.");
        return;
      }
      const slug = uniqueCopySlug(row.slug, pages.map((x) => x.slug));
      const { error: upErr } = await supabase.rpc("growth_page_upsert" as any, {
        p_tenant_id: null,
        p_slug: slug,
        p_title: `${d?.title ?? row.title} (copy)`,
        p_blocks_json: blocks as any,
        p_theme_json: (d?.theme_json as any) ?? null,
        p_seo_json: (d?.seo_json as any) ?? null,
        p_id: null,
      });
      if (upErr) throw upErr;
      toast.success(`Duplicated — the copy lives at /${slug} as a draft.`);
      onDone();
    } catch (e) {
      toast.error(growthSeamMessage(e, "Couldn't duplicate that page. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={run}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
      Duplicate
    </Button>
  );
}

/** Duplicate a form — same recipe: read schema_json, re-create through growth_form_upsert
 *  (schema re-validated server-side) with p_id:null and a uniquified "-copy" slug. Carries
 *  the ORIGINAL success_action_json forward too (message/redirect/download_url) — a copy that
 *  silently reverted to the generic "thanks" default would drop a real deliverable/redirect the
 *  operator already configured (§13). */
function DuplicateFormButton({ row, forms, onDone }: { row: Form; forms: Form[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("growth_forms")
        .select("schema_json,name,success_action_json")
        .eq("id", row.id)
        .single();
      if (error) throw error;
      const d = data as { schema_json?: unknown; name?: string; success_action_json?: unknown } | null;
      if (!d?.schema_json) {
        toast.error("This form has no questions to copy yet.");
        return;
      }
      const slug = uniqueCopySlug(row.slug, forms.map((x) => x.slug));
      const { error: upErr } = await supabase.rpc("growth_form_upsert" as any, {
        p_tenant_id: null,
        p_slug: slug,
        p_name: `${d?.name ?? row.name} (copy)`,
        p_schema_json: d.schema_json as any,
        p_success_action_json: (d.success_action_json as any) ?? null,
        p_auto_create_contact: true,
        p_pipeline_id: null,
        p_stage_id: null,
        p_id: null,
      });
      if (upErr) throw upErr;
      toast.success(`Duplicated — the copy lives at /${slug}.`);
      onDone();
    } catch (e) {
      toast.error(growthSeamMessage(e, "Couldn't duplicate that form. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={run}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
      Duplicate
    </Button>
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
      <DialogTrigger asChild><Button size="sm" variant="default"><Plus className="w-4 h-4 mr-1" />Add Bridge</Button></DialogTrigger>
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
        <DialogFooter><Button variant="default" onClick={create}>Create bridge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
        <SubmissionPayload payload={payload} />
      </div>
    </SectionCard>
  );
}

/**
 * A submission's answers as a readable label → value list (§11 — never a raw JSON dump as
 * product UI). Field keys are humanized, booleans read as Yes/No, empty answers show an em dash,
 * and lists are joined. The raw object is never surfaced.
 */
function SubmissionPayload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([k]) => k !== "");
  if (entries.length === 0) {
    return <p className="text-muted-foreground">No answers were captured with this submission.</p>;
  }
  return (
    <dl className="grid grid-cols-[minmax(0,8.5rem)_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="text-muted-foreground truncate">{humanizeFieldKey(key)}</dt>
          <dd className="text-foreground break-words whitespace-pre-wrap">{formatSubmissionValue(value)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function humanizeFieldKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatSubmissionValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((v) => formatSubmissionValue(v)).join(", ") : "—";
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map((v) => formatSubmissionValue(v)).join(", ");
  return String(value);
}

