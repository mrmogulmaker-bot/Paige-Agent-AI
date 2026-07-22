// "Your Paige" — the agent workspace (spec §1). Chat front-and-center under an
// always-visible vitals strip, with a wide right-side "Customize Paige" console.
// Owns the Playbook edit lifecycle (pb / lastSavedPb / dirty / saving) and the
// one honest Save for the whole object; Knowledge commits per-doc on its own.
import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Sparkles, X, UserCircle2, SlidersHorizontal, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ReasoningDeck, type PaigeStep } from "@/components/dashboard/PaigeStepTrace";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { resolveActivePlaybook } from "@/lib/playbook/resolve";
import { PLAYBOOK_LIBRARY } from "@/lib/playbook/presets";
import type { Playbook } from "@/lib/playbook/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { PaigeWorkspaceProvider, usePaigeWorkspace } from "./PaigeWorkspaceContext";
import { PaigeCommandBar } from "./PaigeCommandBar";
import { PaigeSidebarBody, CustomizeFloor } from "./PaigeSidebar";
import { PaigeRailSheet } from "./PaigeRailSheet";
import { PaigeConsole } from "./PaigeConsole";
import type { ConsoleSection, RailCounts } from "./PaigeConsoleRail";
import type { FocusedClient, QuickChip } from "./commandCenterTypes";
import { buildFocusProse, firstNameOf } from "./commandCenterTypes";

/** Sticky strip above the chat message list — mirrors the rail mini-card. */
function FocusBanner({ client, onClear }: { client: FocusedClient; onClear: () => void }) {
  const first = firstNameOf(client);
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/[0.05] px-3 py-1.5 text-sm m-3 mb-0">
      <span className="h-2 w-2 rounded-full bg-gradient-gold shrink-0" />
      <span className="min-w-0 truncate">
        Focused on {first} — Paige is focused on their account.
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

// Guarantee unique, non-empty keys/ids at save time (lifted verbatim).
const uniqueKeyed = <T extends Record<string, unknown>>(items: T[], field: "key" | "id", base: string): T[] => {
  const seen = new Set<string>();
  return items.map((it, i) => {
    const k = slugify(String(it[field] ?? "") || String((it as { label?: string }).label ?? "") || `${base}_${i + 1}`);
    let uniq = k, n = 1;
    while (seen.has(uniq)) uniq = `${k}_${++n}`;
    seen.add(uniq);
    return { ...it, [field]: uniq };
  });
};

function WorkspaceBody({ tenantName }: { tenantName: string }) {
  const { activeTenantId } = useTenantContext();
  const { counts, subscribeKnowledgeAdded } = usePaigeWorkspace();
  const isMobile = useIsMobile();

  const [pb, setPb] = useState<Playbook | null>(null);
  const [lastSavedPb, setLastSavedPb] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [section, setSection] = useState<ConsoleSection>("persona");
  // Paige's live step trace, lifted out of the chat so the persistent ReasoningDeck renders it.
  // After a run the finished timeline persists in the deck until the next turn clears it — that
  // IS the rest memory, so no separate last-run snapshot is needed.
  const [trace, setTrace] = useState<{ steps: PaigeStep[]; loading: boolean }>({ steps: [], loading: false });
  const handleTrace = useCallback((steps: PaigeStep[], loading: boolean) => {
    setTrace({ steps, loading });
  }, []);

  // Command-center focus state (cc-spec §2). Held here so the chat focus banner
  // and the rail mini-card never disagree.
  const [focusedClient, setFocusedClient] = useState<FocusedClient | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  // Desktop rail collapse — a durable per-user-workspace preference (a rail the
  // user collapsed should stay collapsed next visit), namespaced by tenant so a
  // shared browser doesn't bleed one account's UI state into another (S6).
  const railKey = `paige:workspaceRail:collapsed:${activeTenantId ?? "none"}`;
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(railKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(railKey, railCollapsed ? "1" : "0"); } catch { /* storage unavailable — non-fatal */ }
  }, [railKey, railCollapsed]);
  const clearFocus = () => setFocusedClient(null);
  const focusProse = useMemo(() => buildFocusProse(focusedClient), [focusedClient]);

  // Tenant-wide approvals — the single source for BOTH the command-bar momentum
  // count (never rescoped — B3) and the feed's cross-scope math.
  const { items: tenantApprovals, loading: approvalsLoading } = usePendingApprovals({ scope: "all" });

  // "She got smarter" tie-back: banner above the composer + vitals chip pulse.
  const [banner, setBanner] = useState<string | null>(null);
  const [chipPulse, setChipPulse] = useState(false);

  useEffect(() => {
    let on = true;
    setLoading(true);
    resolveActivePlaybook().then((p) => {
      if (!on) return;
      setPb(structuredClone(p));
      setLastSavedPb(structuredClone(p));
      setLoading(false);
    });
    return () => { on = false; };
  }, [activeTenantId]);

  useEffect(() => {
    return subscribeKnowledgeAdded((title) => {
      setBanner(`Paige just indexed ${title} — she'll draw on it from here.`);
      setChipPulse(true);
      setTimeout(() => setChipPulse(false), 1400);
    });
  }, [subscribeKnowledgeAdded]);

  const patch = (fn: (d: Playbook) => void) =>
    setPb((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });

  const applyPreset = (slug: string) => {
    const preset = PLAYBOOK_LIBRARY.find((p) => p.slug === slug);
    if (preset) {
      setPb(structuredClone(preset));
      toast.info(`Loaded the "${preset.name}" starter — make it yours, then save.`);
    }
  };

  const dirty = !!pb && !!lastSavedPb && JSON.stringify(pb) !== JSON.stringify(lastSavedPb);

  const openConsole = (s: ConsoleSection) => { setSection(s); setConsoleOpen(true); };

  const discard = () => { if (lastSavedPb) setPb(structuredClone(lastSavedPb)); };

  const save = async (): Promise<boolean> => {
    if (!pb) return false;
    if (!activeTenantId) {
      toast.error("Switch into a workspace first — there's no Paige to save this to.");
      return false;
    }
    if (!pb.persona.name.trim() || !pb.persona.greeting.trim()) {
      toast.error("Paige needs at least a name and a greeting before she can go to work.");
      return false;
    }
    const config = {
      ...pb,
      probingQuestions: uniqueKeyed(pb.probingQuestions, "id", "q"),
      journey: uniqueKeyed(pb.journey, "key", "stage"),
      intake: uniqueKeyed(pb.intake, "key", "field"),
      portal: { ...pb.portal, modules: uniqueKeyed(pb.portal.modules, "key", "module") },
    };
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_tenant_playbook", {
        _tenant_id: activeTenantId,
        _config: config as unknown as Record<string, never>,
      });
      if (error) throw error;
      setLastSavedPb(structuredClone(pb));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      toast.success("Saved — Paige is now native to your practice.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the playbook");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const first = firstNameOf(focusedClient);

  // Only Phase-1-capable actions (N1). "Draft a campaign" is draft prose only —
  // no send/bulk tool is wired, so the copy frames it as a review-first draft.
  // NOTE: this useMemo (like every hook) must run before the loading return
  // below — a hook after a conditional return trips React #310 the moment
  // loading flips.
  const quickChips: QuickChip[] = useMemo(() => [
    { label: "What needs my attention?", prompt: "What needs my attention right now across my customers?", autoSend: true },
    { label: "Draft a follow-up", prompt: "Draft a follow-up I can review and send." },
    { label: "Summarize this customer", prompt: `Summarize where ${first || "this customer"} stands and the next best move.`, visibleWhenFocused: true },
    { label: "Move a deal forward", prompt: "Which deals are stuck, and what should I do to move one forward?" },
    { label: "Draft a campaign", prompt: "Draft a campaign to my segment — I'll review before anything sends." },
  ], [first]);

  if (loading || !pb) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your Paige…
      </div>
    );
  }

  const railCounts: RailCounts = {
    personaNamed: !!pb.persona.name.trim(),
    quickActions: pb.quickActions.length,
    probing: pb.probingQuestions.length,
    journey: pb.journey.length,
    intake: pb.intake.length,
    portal: pb.portal.modules.length,
    knowledgeDocs: counts.docs,
  };

  const railProps = {
    focused: focusedClient,
    onFocus: setFocusedClient,
    onClear: clearFocus,
    onCustomize: () => openConsole("persona"),
    approvals: tenantApprovals,
    approvalsLoading,
    tenantId: activeTenantId,
  };

  return (
    <div className="flex flex-col h-full min-h-[34rem]">
      <PaigeCommandBar
        pb={pb}
        tenantName={tenantName}
        counts={counts}
        knowledgePulse={chipPulse}
        pending={tenantApprovals.length}
        onOpen={openConsole}
      />

      {/* Two regions: dominant chat (left) + standing rail (right, desktop). */}
      <div className="flex-1 min-h-0 flex">
        <section className="flex-1 min-w-0 flex flex-col">
          {/* "She got smarter" banner — only when set, so it never adds a resting header row. */}
          {banner && (
            <div className="w-full px-3 pt-2">
              <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-gold shrink-0" />
                <span className="min-w-0 flex-1 truncate">{banner}</span>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 w-full">
            <PaigeAIChat
              hideHeader
              fill
              enableHistory
              greeting="What are we working on today? Point me at a client, or tell me the part of the business you want to move — pipeline, follow-ups, a campaign, a client's file — and I'll take it from there."
              clientId={focusedClient?.id ?? null}
              clientContext={focusProse}
              focusBanner={focusedClient ? <FocusBanner client={focusedClient} onClear={clearFocus} /> : undefined}
              chips={quickChips}
              onTrace={handleTrace}
              hideReasoningStrip={!isMobile}
            />
          </div>
        </section>

        {!isMobile && (railCollapsed ? (
          // Collapsed: a slim always-present reopen affordance (VS Code convention)
          // so the panel is one click away and never lost.
          <button
            type="button"
            onClick={() => setRailCollapsed(false)}
            aria-label="Show panel"
            aria-expanded={false}
            className="grid w-9 shrink-0 place-items-start justify-center border-l bg-primary/[0.02] py-3 text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        ) : (
          <aside className="flex w-[360px] lg:w-[380px] shrink-0 flex-col border-l bg-primary/[0.055] shadow-[inset_1px_0_0_hsl(var(--border))]">
            {/* One scroll column — reasoning cockpit, customer selector, and the Live
                desk all flow and share the height instead of the feed being crushed
                into a sliver. Customize Paige is pinned to the floor, always reachable. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-3 p-3">
                {/* Neutral label: this panel holds reasoning + the Live desk + Customize,
                    not just the trace — so "Collapse panel", never "Hide reasoning". */}
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setRailCollapsed(true)}
                    aria-label="Collapse panel"
                    aria-expanded
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>
                </div>
                <ReasoningDeck trace={trace} personaName={pb.persona.name} />
                <PaigeSidebarBody {...railProps} />
              </div>
            </div>
            <div className="shrink-0 border-t bg-primary/[0.02] p-3">
              <CustomizeFloor onCustomize={railProps.onCustomize} />
            </div>
          </aside>
        ))}
      </div>

      {/* Mobile dock — in-flow (not fixed), above nothing it can overlap (S5). */}
      <div className="md:hidden shrink-0 flex items-center gap-2 border-t bg-primary/[0.04] px-3 py-2">
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm",
            focusedClient ? "border-accent/40" : "",
          )}
        >
          <UserCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{focusedClient ? focusedClient.name : "Select customer"}</span>
        </button>
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          aria-label={`${tenantApprovals.length} waiting`}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm shrink-0"
        >
          <span className={cn("h-2 w-2 rounded-full", tenantApprovals.length > 0 ? "bg-gradient-gold" : "bg-muted-foreground/40")} />
          <span className="tabular-nums">{tenantApprovals.length > 0 ? `${tenantApprovals.length} waiting` : "All clear"}</span>
        </button>
        <Button
          onClick={() => openConsole("persona")}
          size="icon"
          variant="outline"
          className="shrink-0 border-accent/50 text-accent hover:bg-accent/10"
          aria-label="Customize Paige"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {isMobile && <PaigeRailSheet open={railOpen} onOpenChange={setRailOpen} {...railProps} />}

      <PaigeConsole
        open={consoleOpen}
        onOpenChange={setConsoleOpen}
        pb={pb}
        patch={patch}
        onApplyPreset={applyPreset}
        section={section}
        onSection={setSection}
        counts={railCounts}
        knowledgePulse={chipPulse}
        dirty={dirty}
        saving={saving}
        justSaved={justSaved}
        onSave={save}
        onDiscard={discard}
        tenantName={tenantName}
      />
    </div>
  );
}

export default function PaigeWorkspace() {
  const { activeTenantId, activeTenant, loading } = useTenantContext();

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your Paige…
      </div>
    );
  }

  // God-tier operator with no active tenant: render the shell, but there is no
  // tenant-scoped Paige to talk to (§9 — and there must not be a platform-default
  // client Paige). Do not mount the chat without a tenant.
  if (!activeTenantId) {
    return (
      <div className="flex flex-col h-full min-h-[24rem]">
        <div className="sticky top-0 z-20 border-b bg-primary/[0.04] px-4 lg:px-6 py-3 flex items-center gap-3">
          <PaigeMark className="h-9 w-9" />
          <div>
            <h1 className="text-base font-semibold">Your Paige</h1>
            <p className="text-xs text-muted-foreground">Platform level — no workspace selected</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-2">
            <Sparkles className="w-6 h-6 text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Pick a workspace first</h2>
            <p className="text-sm text-muted-foreground">
              You're at the platform level. Switch into a tenant workspace to shape and talk to its Paige.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PaigeWorkspaceProvider activeTenantId={activeTenantId}>
      <WorkspaceBody tenantName={activeTenant?.name ?? "your practice"} />
    </PaigeWorkspaceProvider>
  );
}
