// The content pieces the Studio's copy + image modes share — moved verbatim from the
// retired Content Studio (its Compose / Images / Library panels now live INSIDE the
// Studio as creation modes; this file is the shared substrate).
//
// Backends unchanged (§10): the library reads marketing_content and deletes through the
// delete_marketing_content RPC — the same seam Paige drives headlessly. Tenant-scoped
// everywhere via the tenantId the caller resolved from useTenantContext.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, Toolbar, FilterChip } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, Library, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type Channel =
  | "social_post"
  | "ad_copy"
  | "email_campaign"
  | "caption"
  | "blog_outline"
  | "sms_broadcast";

export const CHANNELS: { value: Channel; label: string }[] = [
  { value: "social_post", label: "Social post" },
  { value: "ad_copy", label: "Ad copy" },
  { value: "email_campaign", label: "Email campaign" },
  { value: "caption", label: "Caption" },
  { value: "blog_outline", label: "Blog outline" },
  { value: "sms_broadcast", label: "SMS broadcast" },
];

export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.value, c.label]),
);

export interface Draft {
  title: string;
  content: string;
}

export interface LibraryRow {
  id: string;
  kind: "text" | "image";
  channel: string | null;
  title: string;
  body: string | null;
  image_url: string | null;
  size: string | null;
  created_at: string;
}

// Neutral category/taxonomy chip. Distinct from StatePill (which carries real state) —
// channel/kind labels are categorization, not status, so they get a plain muted chip.
export function LabelChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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

// ─── Library ──────────────────────────────────────────────────────────────────
export function LibraryPanel({ tenantId, active }: { tenantId: string | null; active: boolean }) {
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
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
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
        <div className="grid gap-3 sm:grid-cols-2">
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
                  <LabelChip>{r.kind === "image" ? "Image" : CHANNEL_LABEL[r.channel ?? ""] ?? "Copy"}</LabelChip>
                </div>
                <div className="mt-auto flex items-center gap-1">
                  {r.kind === "text" && r.body && <CopyButton text={r.body} />}
                  {r.kind === "image" && r.image_url && (
                    <Button asChild variant="ghost" size="sm" className="gap-1.5">
                      <a href={r.image_url} download target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </Button>
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
