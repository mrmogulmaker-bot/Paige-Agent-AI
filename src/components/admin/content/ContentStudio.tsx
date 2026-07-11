// Content Studio — where a tenant (or Paige on their behalf) makes marketing content:
// drafts copy for any channel, generates images, and keeps a saved library. All three
// share one guarded seam (§10): content-draft + generate-image edge functions and the
// save_marketing_content / delete_marketing_content RPCs, so Paige can drive every part
// of this from chat with no human in the UI. Tenant-generic (§2) — no vertical/finance
// framing; the tenant's brief decides the content. Built on the premium primitive layer;
// gold is spent only on the act moments (Draft / Generate / Save).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  SectionCard, EmptyState, Toolbar, FilterChip, StatePill,
} from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PenLine, Image as ImageIcon, Library, Wand2, Loader2, Copy, Check,
  Save, Trash2, Download, Sparkles, Info,
} from "lucide-react";
import { toast } from "sonner";

type Channel = "social_post" | "ad_copy" | "email_campaign" | "caption" | "blog_outline" | "sms_broadcast";
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "social_post", label: "Social post" },
  { value: "ad_copy", label: "Ad copy" },
  { value: "email_campaign", label: "Email campaign" },
  { value: "caption", label: "Caption" },
  { value: "blog_outline", label: "Blog outline" },
  { value: "sms_broadcast", label: "SMS broadcast" },
];
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));

interface Draft { title: string; content: string; }
interface LibraryRow {
  id: string; kind: "text" | "image"; channel: string | null; title: string;
  body: string | null; image_url: string | null; size: string | null; created_at: string;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="sm" className="gap-1.5"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); }
        catch { toast.error("Couldn't copy."); }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ContentStudio() {
  const { activeTenantId } = useTenantContext();
  const [studioTab, setStudioTab] = useState("compose");

  return (
    <div className="space-y-4">
      <Tabs value={studioTab} onValueChange={setStudioTab}>
        <TabsList>
          <TabsTrigger value="compose"><PenLine className="mr-1.5 h-4 w-4" />Compose</TabsTrigger>
          <TabsTrigger value="images"><ImageIcon className="mr-1.5 h-4 w-4" />Images</TabsTrigger>
          <TabsTrigger value="library"><Library className="mr-1.5 h-4 w-4" />Library</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4">
          <ComposePanel tenantId={activeTenantId} onSaved={() => setStudioTab("library")} />
        </TabsContent>
        <TabsContent value="images" className="mt-4">
          <ImagePanel tenantId={activeTenantId} onSaved={() => setStudioTab("library")} />
        </TabsContent>
        <TabsContent value="library" className="mt-4">
          <LibraryPanel tenantId={activeTenantId} active={studioTab === "library"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Compose ──────────────────────────────────────────────────────────────────
function ComposePanel({ tenantId, onSaved }: { tenantId: string | null; onSaved: () => void }) {
  const [channel, setChannel] = useState<Channel>("social_post");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("");
  const [variations, setVariations] = useState("2");
  const [drafting, setDrafting] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const draft = async () => {
    if (brief.trim().length < 5) { toast.error("Give Paige a brief: what's the content about?"); return; }
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("content-draft", {
        body: { channel, brief, tone, variations: Number(variations), tenant_id: tenantId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = ((data as any)?.drafts ?? []) as Draft[];
      if (!d.length) throw new Error("Paige didn't return a draft. Try adding more detail.");
      setDrafts(d);
    } catch (e: any) {
      toast.error(e?.message || "Paige couldn't draft that. Try again.");
    } finally { setDrafting(false); }
  };

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const save = async (i: number) => {
    if (!tenantId) { toast.error("Select a workspace first."); return; }
    const d = drafts[i];
    setSavingIdx(i);
    try {
      const { error } = await supabase.rpc("save_marketing_content", {
        p_kind: "text", p_title: d.title || CHANNEL_LABEL[channel], p_body: d.content,
        p_channel: channel, p_brief: brief, p_tenant_id: tenantId,
      });
      if (error) throw error;
      toast.success("Saved to your library.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save.");
    } finally { setSavingIdx(null); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <SectionCard title="Brief" description="Tell Paige what to write. She uses your brand voice." icon={PenLine}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v: Channel) => setChannel(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brief">What's it about?</Label>
            <Textarea
              id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={6}
              placeholder="e.g. Announce my new 6-week client onboarding program. Key points: faster ramp, weekly check-ins, a results guarantee. Aim at consultants scaling their practice."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tone">Tone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="bold, warm…" />
            </div>
            <div className="space-y-1.5">
              <Label>Variations</Label>
              <Select value={variations} onValueChange={setVariations}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={draft} disabled={drafting} variant="gold" className="w-full gap-2">
            {drafting ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing…</> : <><Wand2 className="h-4 w-4" /> Draft with Paige</>}
          </Button>
        </div>
      </SectionCard>

      <div className="space-y-3">
        {drafts.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={Sparkles} tone="brand" title="Paige is ready to write"
              description="Fill in a brief and Paige drafts on-brand copy you can edit, save, and reuse."
            />
          </SectionCard>
        ) : (
          drafts.map((d, i) => (
            <SectionCard key={i} title={
              <span className="flex items-center gap-2">
                <Input
                  value={d.title} onChange={(e) => setDraft(i, { title: e.target.value })}
                  className="h-8 max-w-xs border-transparent bg-transparent px-1 font-display text-base font-semibold focus-visible:border-input"
                />
                <StatePill state="pending">{CHANNEL_LABEL[channel]}</StatePill>
              </span>
            } actions={<CopyButton text={d.content} />}>
              <Textarea
                value={d.content} onChange={(e) => setDraft(i, { content: e.target.value })}
                rows={Math.min(14, Math.max(5, d.content.split("\n").length + 1))}
                className="font-mono text-sm leading-relaxed"
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={() => save(i)} disabled={savingIdx === i} variant="gold" size="sm" className="gap-1.5">
                  {savingIdx === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save to library
                </Button>
              </div>
            </SectionCard>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Images ───────────────────────────────────────────────────────────────────
function ImagePanel({ tenantId, onSaved }: { tenantId: string | null; onSaved: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("square");
  const [busy, setBusy] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [result, setResult] = useState<{ url: string; size: string } | null>(null);

  const generate = async () => {
    if (prompt.trim().length < 4) { toast.error("Describe the image you want."); return; }
    setBusy(true); setNeedsConfig(false);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt, size, tenant_id: tenantId },
      });
      if (error) throw error;
      if ((data as any)?.needs_config) { setNeedsConfig(true); return; }
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.url;
      if (!url) throw new Error("No image came back. Try again.");
      setResult({ url, size: (data as any)?.size || size });
      onSaved(); // auto-filed to the library server-side
    } catch (e: any) {
      toast.error(e?.message || "Couldn't generate that image.");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <SectionCard title="Describe an image" description="Paige generates it and files it in your library." icon={ImageIcon}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="img-prompt">Prompt</Label>
            <Textarea
              id="img-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6}
              placeholder="e.g. A clean, modern promo graphic for a consulting webinar — indigo and gold palette, confident, minimal, space for a headline."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Shape</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square (1:1)</SelectItem>
                <SelectItem value="portrait">Portrait (2:3)</SelectItem>
                <SelectItem value="landscape">Landscape (3:2)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={busy} variant="gold" className="w-full gap-2">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate image</>}
          </Button>
        </div>
      </SectionCard>

      <SectionCard>
        {needsConfig ? (
          <EmptyState
            icon={Info} title="Image generation isn't switched on yet"
            description="An admin can enable it in Supabase by adding the image provider key to Edge Function secrets. Copy drafting works now regardless."
          />
        ) : result ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-muted/30">
              <img src={result.url} alt="Generated by Paige" className="mx-auto max-h-[60vh] w-auto max-w-full" />
            </div>
            <Toolbar>
              <StatePill state="success">Saved to library</StatePill>
              <a href={result.url} download target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Download</Button>
              </a>
            </Toolbar>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles} tone="brand" title="Your image appears here"
            description="Describe what you need — a promo graphic, a social visual, an ad image — and Paige creates it."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ─── Library ──────────────────────────────────────────────────────────────────
function LibraryPanel({ tenantId, active }: { tenantId: string | null; active: boolean }) {
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "text" | "image">("all");

  const load = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_content")
      .select("id, kind, channel, title, body, image_url, size, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) toast.error("Couldn't load your library.");
    setRows((data ?? []) as LibraryRow[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (active) load(); }, [active, load]);

  const remove = async (id: string) => {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id)); // optimistic
    const { error } = await supabase.rpc("delete_marketing_content", { p_id: id });
    if (error) { setRows(prev); toast.error("Couldn't delete that item."); }
    else toast.success("Removed from library.");
  };

  const shown = useMemo(() => rows.filter((r) => filter === "all" || r.kind === filter), [rows, filter]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip active={filter === "text"} onClick={() => setFilter("text")}>Copy</FilterChip>
          <FilterChip active={filter === "image"} onClick={() => setFilter("image")}>Images</FilterChip>
        </div>
        <span className="text-xs text-muted-foreground">{shown.length} item{shown.length === 1 ? "" : "s"}</span>
      </Toolbar>

      {shown.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Library} title="Nothing saved yet"
            description="Copy you save and images Paige generates land here, ready to reuse across your campaigns."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <SectionCard key={r.id} className="flex flex-col overflow-hidden" padded={false}>
              {r.kind === "image" && r.image_url ? (
                <div className="aspect-video overflow-hidden bg-muted/30">
                  <img src={r.image_url} alt={r.title} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="max-h-40 overflow-hidden bg-muted/20 px-4 pt-4">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground line-clamp-6">{r.body}</p>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{r.title}</h4>
                  <StatePill state="pending">{r.kind === "image" ? "Image" : CHANNEL_LABEL[r.channel ?? ""] ?? "Copy"}</StatePill>
                </div>
                <div className="mt-auto flex items-center gap-1">
                  {r.kind === "text" && r.body && <CopyButton text={r.body} />}
                  {r.kind === "image" && r.image_url && (
                    <a href={r.image_url} download target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Download</Button>
                    </a>
                  )}
                  <Button
                    variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
