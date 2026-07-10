// "Your Paige" — the agent workspace (spec §1). Chat front-and-center under an
// always-visible vitals strip, with a wide right-side "Customize Paige" console.
// Owns the Playbook edit lifecycle (pb / lastSavedPb / dirty / saving) and the
// one honest Save for the whole object; Knowledge commits per-doc on its own.
import { useEffect, useState } from "react";
import { Loader2, Sparkles, GraduationCap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveActivePlaybook } from "@/lib/playbook/resolve";
import { PLAYBOOK_LIBRARY } from "@/lib/playbook/presets";
import type { Playbook } from "@/lib/playbook/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { PaigeWorkspaceProvider, usePaigeWorkspace } from "./PaigeWorkspaceContext";
import { PaigeVitalsStrip } from "./PaigeVitalsStrip";
import { PaigeConsole } from "./PaigeConsole";
import type { ConsoleSection, RailCounts } from "./PaigeConsoleRail";

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

  const [pb, setPb] = useState<Playbook | null>(null);
  const [lastSavedPb, setLastSavedPb] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [section, setSection] = useState<ConsoleSection>("persona");

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

  return (
    <div className="flex flex-col h-full min-h-[34rem] -mx-3 sm:-mx-4 md:-mx-6 -my-3 sm:-my-4 md:-my-6">
      <PaigeVitalsStrip
        pb={pb}
        tenantName={tenantName}
        counts={counts}
        knowledgePulse={chipPulse}
        onOpen={openConsole}
      />

      {/* Chat column */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Slim action bar: the "she got smarter" banner + a second door into Knowledge. */}
        <div className="w-full max-w-4xl mx-auto px-3 md:px-0 pt-3 flex items-center gap-2">
          {banner ? (
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-gold shrink-0" />
              <span className="truncate">{banner}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
              Talk to {pb.persona.name?.trim() || "Paige"} below — or teach her something new.
            </p>
          )}
          <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => openConsole("knowledge")}>
            <GraduationCap className="w-4 h-4 mr-1.5" /> Teach Paige something
          </Button>
        </div>

        <div className="flex-1 min-h-0 w-full">
          <PaigeAIChat hideHeader />
        </div>
      </div>

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
      <div className="flex flex-col h-full min-h-[24rem] -mx-3 sm:-mx-4 md:-mx-6 -my-3 sm:-my-4 md:-my-6">
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
