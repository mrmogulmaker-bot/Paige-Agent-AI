/**
 * Paige Marketplace (tenant-facing) — add capabilities to your Paige.
 *
 * This page is now driven entirely by the DECLARED marketplace registry (§10/§12),
 * not a hardcoded list: the catalog, install-state, and every action come from
 * marketplace_catalog_for_tenant() + the real install seam. Installing an item
 * does the real work — a skill flips the capability, a knowledge pack SEEDS your
 * knowledge base (embedded, retrievable) — via the marketplace-install edge
 * function; uninstalling reverses exactly what was added. §13: the receipt reports
 * what actually happened (docs seeded, warnings), never a hoped-for outcome.
 *
 * Truthful "on" state: a skill can also be on via the old enabled_skills toggle or
 * a Playbook preset (e.g. the Funding coach type), so we reconcile all three paths
 * — the AI gate reads enabled_skills, and the card must never misrepresent it.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TrendingUp, Palette, Mic, Workflow, BookOpen, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { SkillCard } from "@/components/marketplace/SkillCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { SKILL_CATEGORIES, type MarketplaceSkill } from "@/lib/marketplace/skills";

const ICONS: Record<string, LucideIcon> = { TrendingUp, Palette, Mic, Workflow, BookOpen };

const TYPE_LABEL: Record<string, string> = {
  skill: "Capability", kb_pack: "Knowledge pack", skin: "Portal theme",
  tool: "Tool", portal_surface: "Portal surface", automation: "Automation", bundle: "Bundle",
};

// What installing this actually does, in the tenant's terms (§13 — honest, no jargon).
function whatItAdds(itemType: string): string {
  switch (itemType) {
    case "kb_pack":
      return "Installing seeds your knowledge base with a ready-to-use framework and embeds it, so Paige can draw on it instantly with every client. Uninstalling removes exactly what it added.";
    case "skill":
      return "Turns on this capability for your Paige — she carries it into every client conversation, layered on top of your persona and journey. Your voice stays yours.";
    case "skin":
    case "portal_surface":
      return "Restyles and extends your client portal beyond logo and color.";
    case "automation":
      return "Lets Paige build and run this play on your connected workflow engine.";
    default:
      return "Adds this capability to your Paige.";
  }
}

// One row of the declared catalog, as returned by marketplace_catalog_for_tenant.
type CatalogRow = {
  slug: string;
  item_type: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  icon: string | null;
  pricing_model: string;
  price_cents: number;
  requires_embedding: boolean | null;
  installed: boolean;
  install_status: string | null;
  version: string | null;
};

type TenantFeatures = {
  enabledSkills: string[];
  presetFundingOn: boolean;
};

export default function Marketplace() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [justArmed, setJustArmed] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // The declared catalog + this tenant's install state (server-authoritative, §10).
  const catalogQ = useQuery({
    queryKey: ["marketplace_catalog", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await supabase.rpc(
        "marketplace_catalog_for_tenant" as never,
        { _tenant_id: activeTenantId } as never,
      );
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
  });

  // Skills can also be on via the legacy enabled_skills toggle or a Playbook preset;
  // the AI gate reads these, so the card's "on" must reflect them too (§13).
  const featuresQ = useQuery({
    queryKey: ["marketplace_features", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async (): Promise<TenantFeatures> => {
      const { data, error } = await supabase
        .from("tenants").select("features").eq("id", activeTenantId).maybeSingle();
      if (error) throw error;
      const feats = (data?.features ?? {}) as Record<string, unknown>;
      const raw = feats.enabled_skills;
      const pbSlug = (feats.playbook_config as { slug?: unknown } | null)?.slug;
      return {
        enabledSkills: Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [],
        presetFundingOn:
          feats.playbook === "funding" || pbSlug === "funding" ||
          feats.paige_funding_skill === true || feats.paige_funding_skill === "true",
      };
    },
  });

  const rows = catalogQ.data ?? [];
  const feats = featuresQ.data ?? { enabledSkills: [], presetFundingOn: false };
  const loading = catalogQ.isLoading || featuresQ.isLoading;

  // For a skill, "on" is driven by the AI gate itself (enabled_skills + preset) —
  // the source of truth the chat reads — so the card can never show "Live" while
  // the gate is off (§13). Install always writes enabled_skills, so they agree.
  const isOnFor = (r: CatalogRow) =>
    r.item_type === "skill"
      ? feats.enabledSkills.includes(r.slug) || (r.slug === "funding" && feats.presetFundingOn)
      : r.installed;
  const lockedOnFor = (r: CatalogRow) => r.slug === "funding" && feats.presetFundingOn;
  const availableFor = (r: CatalogRow) => r.version != null;

  const liveCount = rows.filter((r) => availableFor(r) && isOnFor(r)).length;
  const roadmapCount = rows.filter((r) => !availableFor(r)).length;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["marketplace_catalog", activeTenantId] }),
      qc.invalidateQueries({ queryKey: ["marketplace_features", activeTenantId] }),
    ]);

  const install = async (r: CatalogRow) => {
    // The edge function is the universal install path — it embeds a knowledge
    // pack's docs (which SQL can't) and finalizes through the gated RPC.
    const { data, error } = await supabase.functions.invoke("marketplace-install", {
      body: { item_slug: r.slug, installed_by_agent: null },
    });
    if (error) throw new Error(error.message ?? "Install failed");
    const res = (data ?? {}) as Record<string, any>;
    if (res.error) throw new Error(String(res.error));

    const kb = Number(res.kb_docs_seeded ?? 0);
    if (res.already_installed) {
      toast.success(`${r.name} is already on.`);
    } else if (kb > 0) {
      toast.success(`${r.name} added — seeded ${kb} knowledge ${kb === 1 ? "entry" : "entries"} to your Paige.`);
    } else {
      toast.success(`${r.name} added to your Paige.`);
    }
    // §13: surface anything that didn't fully land (e.g. embedding unavailable).
    const warns: string[] = [res.warning, ...(Array.isArray(res.warnings) ? res.warnings : [])].filter(Boolean);
    warns.forEach((w) => toast.warning(w));
    setJustArmed(r.slug);
    setTimeout(() => setJustArmed((s) => (s === r.slug ? null : s)), 400);
  };

  const uninstall = async (r: CatalogRow) => {
    const { error } = await supabase.rpc(
      "uninstall_marketplace_item" as never,
      { _tenant_id: activeTenantId, _item_slug: r.slug } as never,
    );
    if (error) throw error;
    toast.success(`${r.name} switched off.`);
  };

  const toggle = async (r: CatalogRow, on: boolean) => {
    if (!activeTenantId || saving) return;
    setSaving(r.slug);
    try {
      if (on) await install(r);
      else await uninstall(r);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update this capability");
    } finally {
      setSaving(null);
    }
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, CatalogRow[]>();
    for (const r of rows) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [rows]);

  if (!tenantLoading && !activeTenantId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Select a workspace to manage its Paige capabilities.
        </CardContent></Card>
      </div>
    );
  }

  // Category order follows the curated list; any category not in it falls to the
  // end. Only categories that actually have rows render (so the 01/02 badges are
  // numbered off the VISIBLE list, never skipping).
  const orderedCategories = [
    ...SKILL_CATEGORIES,
    ...[...byCategory.keys()]
      .filter((k) => !SKILL_CATEGORIES.some((c) => c.key === k))
      .map((k) => ({ key: k, label: k, blurb: "" })),
  ];
  const visibleCategories = orderedCategories.filter((cat) => (byCategory.get(cat.key) ?? []).length > 0);

  // Freeze the opened row so the detail dialog keeps its content through the close
  // animation (never a bare, titleless DialogContent flash — §11/a11y).
  const detailRow = openSlug ? rows.find((r) => r.slug === openSlug) ?? null : null;
  const shownRowRef = useRef<CatalogRow | null>(null);
  if (detailRow) shownRowRef.current = detailRow;
  const dialogRow = detailRow ?? shownRowRef.current;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-8 space-y-10">
      {/* Hero masthead — the one deliberate dark "store moment" (§6, gold reserved for accents). */}
      <section
        className="relative overflow-hidden rounded-[calc(var(--radius)+6px)] p-8 md:p-10 shadow-xl"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -top-24 -right-16 h-72 w-72 rounded-full"
            style={{ background: "radial-gradient(closest-side, hsl(var(--gold)/0.28), transparent)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 100%/1) 1px,transparent 1px),linear-gradient(90deg,hsl(0 0% 100%/1) 1px,transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <PaigeMark className="h-9 w-9" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-light))]">
              Paige · Capability Store
            </span>
          </div>
          <h1 className="mt-4 max-w-2xl font-display text-3xl md:text-4xl font-semibold leading-[1.1] text-white text-balance">
            Give Paige new powers.
          </h1>
          <p className="mt-3 max-w-xl text-sm md:text-base text-white/70">
            Switch on a capability and Paige carries it into every client conversation — your
            persona, your voice, your journey stay yours.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" />
              {liveCount > 0 ? `${liveCount} live now` : "Ready when you are"}
            </span>
            {roadmapCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                {roadmapCount} shipping soon
              </span>
            )}
          </div>
        </div>
      </section>

      {catalogQ.isError || featuresQ.isError ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Couldn't load the capability store. Refresh to try again.
        </CardContent></Card>
      ) : loading ? (
        <MarketplaceSkeleton />
      ) : rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No capabilities available yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            New capabilities for your Paige will appear here as they ship.
          </p>
        </CardContent></Card>
      ) : (
        visibleCategories.map((cat, i) => (
          <section key={cat.key} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-white">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-foreground">{cat.label}</h2>
                {cat.blurb && <p className="text-sm text-muted-foreground">{cat.blurb}</p>}
              </div>
              <div className="ml-2 hidden h-px flex-1 bg-border/60 sm:block" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(byCategory.get(cat.key) ?? []).map((r) => {
                const Icon = ICONS[r.icon ?? ""] ?? Sparkles;
                const available = availableFor(r);
                const lockedOn = lockedOnFor(r);
                const isOn = isOnFor(r) || lockedOn;
                const skill: MarketplaceSkill = {
                  slug: r.slug,
                  name: r.name,
                  tagline: r.tagline ?? "",
                  description: r.description ?? "",
                  category: r.category,
                  status: available ? "available" : "coming_soon",
                  icon: r.icon ?? "Sparkles",
                };
                return (
                  <SkillCard
                    key={r.slug}
                    skill={skill}
                    Icon={Icon}
                    isOn={isOn}
                    available={available}
                    lockedOn={lockedOn}
                    saving={saving === r.slug}
                    loading={loading}
                    justArmed={justArmed === r.slug}
                    onToggle={(v) => toggle(r, v)}
                    onOpen={() => setOpenSlug(r.slug)}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}

      {dialogRow && (
        <MarketplaceDetailDialog
          row={dialogRow}
          open={!!openSlug}
          onOpenChange={(v) => !v && setOpenSlug(null)}
          isOn={isOnFor}
          available={availableFor}
          lockedOn={lockedOnFor}
          saving={saving}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

/** Loading placeholder — a shimmer grid so the body is never a bare blank (§11). */
function MarketplaceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-h-[15rem] rounded-[var(--radius)] border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="h-14 w-14 animate-pulse rounded-xl bg-muted" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-3 w-full animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The full detail view for one capability — opens when a card is clicked. */
function MarketplaceDetailDialog({
  row, open, onOpenChange, isOn, available, lockedOn, saving, onToggle,
}: {
  row: CatalogRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isOn: (r: CatalogRow) => boolean;
  available: (r: CatalogRow) => boolean;
  lockedOn: (r: CatalogRow) => boolean;
  saving: string | null;
  onToggle: (r: CatalogRow, on: boolean) => void;
}) {
  if (!row) return null;
  const Icon = ICONS[row.icon ?? ""] ?? Sparkles;
  const isAvail = available(row);
  const locked = lockedOn(row);
  const on = isOn(row) || locked;
  const busy = saving === row.slug;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <span
              className="relative grid h-14 w-14 shrink-0 place-items-center rounded-xl shadow-md ring-1 ring-inset ring-border bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-light))]"
            >
              <Icon className="h-6 w-6 text-white/90" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg">{row.name}</DialogTitle>
              {row.tagline && <p className="mt-0.5 text-sm text-muted-foreground">{row.tagline}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[row.item_type] ?? row.item_type}
                </span>
                {isAvail && row.version && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    v{row.version}
                  </span>
                )}
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {row.price_cents > 0 ? `$${(row.price_cents / 100).toFixed(0)}` : "Free"}
                </span>
                {!isAvail && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Roadmap
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogDescription asChild>
          <div className="space-y-4 text-sm">
            {row.description && <p className="leading-relaxed text-foreground/90">{row.description}</p>}
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this does</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{whatItAdds(row.item_type)}</p>
            </div>
          </div>
        </DialogDescription>

        <DialogFooter className="mt-2 sm:justify-between sm:items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {locked
              ? "Included with your Funding playbook."
              : !isAvail
                ? "On the roadmap — it'll appear here the moment it's ready."
                : on
                  ? "On — Paige runs this with every client."
                  : "Off — switch on to add it."}
          </span>
          {isAvail && !locked ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{on ? "On" : "Off"}</span>
              <Switch
                checked={on}
                disabled={busy}
                onCheckedChange={(v) => onToggle(row, v)}
                aria-label={`Toggle ${row.name}`}
                className="data-[state=checked]:bg-[hsl(var(--gold))] focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
          ) : locked ? (
            <Button asChild variant="outline" size="sm">
              <a href="/admin/your-paige">Manage in Your Paige</a>
            </Button>
          ) : (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Coming soon
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
