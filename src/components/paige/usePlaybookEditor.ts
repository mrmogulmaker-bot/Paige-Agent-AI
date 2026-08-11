// usePlaybookEditor — the ONE home for the Playbook edit lifecycle (§18).
// Extracted verbatim from PaigeWorkspace's WorkspaceBody so BOTH the "Customize
// Paige" console (the Sheet inside the Paige workspace) AND the Setup › Playbook
// inline editor drive the SAME load/dirty/save logic against the SAME
// `set_tenant_playbook` RPC — never a forked second copy. Behavior is identical
// to the original inline implementation; only its home moved.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveActivePlaybook } from "@/lib/playbook/resolve";
import { PLAYBOOK_LIBRARY } from "@/lib/playbook/presets";
import type { Playbook } from "@/lib/playbook/types";
import { slugify } from "./sections/shared";

// Guarantee unique, non-empty keys/ids at save time (lifted verbatim from
// WorkspaceBody — the exact behavior the console has always shipped).
const uniqueKeyed = <T>(items: T[], field: "key" | "id", base: string): T[] => {
  const seen = new Set<string>();
  return items.map((it, i) => {
    const rec = it as Record<string, unknown>;
    const k = slugify(String(rec[field] ?? "") || String((rec as { label?: string }).label ?? "") || `${base}_${i + 1}`);
    let uniq = k, n = 1;
    while (seen.has(uniq)) uniq = `${k}_${++n}`;
    seen.add(uniq);
    return { ...it, [field]: uniq };
  });
};

export interface PlaybookEditor {
  pb: Playbook | null;
  loading: boolean;
  saving: boolean;
  justSaved: boolean;
  dirty: boolean;
  /** Mutator-style patch, identical to the old inline helper. */
  patch: (fn: (d: Playbook) => void) => void;
  applyPreset: (slug: string) => void;
  save: () => Promise<boolean>;
  discard: () => void;
}

/**
 * Owns the tenant Playbook edit lifecycle for a given active tenant.
 * @param activeTenantId the tenant whose Paige is being authored (null → no save target)
 */
export function usePlaybookEditor(activeTenantId: string | null): PlaybookEditor {
  const [pb, setPb] = useState<Playbook | null>(null);
  const [lastSavedPb, setLastSavedPb] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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

  const patch = useCallback((fn: (d: Playbook) => void) =>
    setPb((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; }), []);

  const applyPreset = useCallback((slug: string) => {
    const preset = PLAYBOOK_LIBRARY.find((p) => p.slug === slug);
    if (preset) {
      setPb(structuredClone(preset));
      toast.info(`Loaded the "${preset.name}" starter — make it yours, then save.`);
    }
  }, []);

  const dirty = !!pb && !!lastSavedPb && JSON.stringify(pb) !== JSON.stringify(lastSavedPb);

  const discard = useCallback(() => {
    if (lastSavedPb) setPb(structuredClone(lastSavedPb));
  }, [lastSavedPb]);

  const save = useCallback(async (): Promise<boolean> => {
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
  }, [pb, activeTenantId]);

  return { pb, loading, saving, justSaved, dirty, patch, applyPreset, save, discard };
}
