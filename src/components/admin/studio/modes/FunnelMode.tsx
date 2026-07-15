// Funnel mode — chain a page to a form to a thank-you, and see the flow before it exists.
//
// Rail: name (slug auto-derives), entry-page and form-step pickers from the tenant's own
// libraries. Canvas: the step flow as connected cards — the picked assets, their real
// statuses, honest about what each step needs before the funnel can go live.
//
// The acts live in the Studio top bar (published up through onToolbar):
//   Save (outline)          → studio.ts saveFunnel()  → growth_funnel_upsert (§10)
//   Publish funnel (GOLD)   → save first, then publishFunnel() → growth_funnel_publish —
//                             the RPC's guards (pages live, forms active) decide, not us.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, GitBranch, LayoutGrid, PartyPopper } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { growthSeamMessage } from "@/lib/growth-templates";
import { saveFunnel, publishFunnel, isStudioError, type FunnelStepInput } from "../studio";
import { kebabSlug } from "../PublishDialog";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { MODE_EMPTY, MODE_RAIL } from "../studio-copy";
import type { ModeToolbarState } from "../studio-types";

interface PageOption { id: string; title: string; status: string }
interface FormOption { id: string; name: string; status: string }

export interface FunnelModeProps {
  tenantId: string | null;
  /** Publish this mode's Save/act buttons into the Studio top bar. */
  onToolbar: (state: ModeToolbarState) => void;
  /** The funnel shipped — the hub jumps to the Funnels library. */
  onCreated?: () => void;
  className?: string;
}

export function FunnelMode({ tenantId, onToolbar, onCreated, className }: FunnelModeProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [entryPageId, setEntryPageId] = useState<string>("");
  const [stepFormId, setStepFormId] = useState<string>("");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // The tenant's own assets, for the pickers — same tenant-scoped reads the library uses.
  useEffect(() => {
    if (!tenantId) { setPages([]); setForms([]); return; }
    let live = true;
    void Promise.all([
      supabase.from("growth_pages").select("id,title,status").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
      supabase.from("growth_forms").select("id,name,status").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
    ]).then(([p, f]) => {
      if (!live) return;
      setPages((p.data ?? []) as PageOption[]);
      setForms((f.data ?? []) as FormOption[]);
    });
    return () => { live = false; };
  }, [tenantId]);

  const setNameAndSlug = (next: string) => {
    setName(next);
    if (!slugTouched) setSlug(kebabSlug(next));
  };

  // A funnel needs at least one real step to capture on — a thank-you-only funnel is a
  // live page that does nothing (the server mirrors this guard on publish).
  const steps = useMemo<FunnelStepInput[]>(() => {
    const out: FunnelStepInput[] = [];
    if (entryPageId) out.push({ step_type: "page", order_index: 0, page_id: entryPageId });
    if (stepFormId) out.push({ step_type: "form", order_index: out.length, form_id: stepFormId });
    out.push({ step_type: "thankyou", order_index: out.length });
    return out;
  }, [entryPageId, stepFormId]);

  const hasRealStep = !!entryPageId || !!stepFormId;
  const canAct = !!tenantId && name.trim().length > 0 && slug.trim().length > 0 && hasRealStep;

  const doSave = useCallback(async (): Promise<string | null> => {
    if (!tenantId) { toast.error("Pick a workspace first."); return null; }
    if (!name.trim() || !slug.trim()) { toast.error("Give the funnel a name and a link."); return null; }
    if (!hasRealStep) { toast.error("Pick an entry page or a form step — a funnel needs at least one."); return null; }
    try {
      const saved = await saveFunnel({
        tenantId, slug, name, steps,
        entryPageId: entryPageId || null,
        id: savedId,
      });
      setSavedId(saved.id);
      return saved.id;
    } catch (e) {
      const cause = isStudioError(e) ? e.cause ?? e : e;
      toast.error(growthSeamMessage(cause, isStudioError(e) ? e.message : "Couldn't save that funnel. Try again."));
      return null;
    }
  }, [tenantId, name, slug, steps, entryPageId, savedId, hasRealStep]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const id = await doSave();
    setSaving(false);
    if (id) toast.success("Funnel saved as a draft. Publish it when it's ready.");
  }, [doSave]);

  // Save FIRST, then publish — the same ordering discipline as the page seam.
  const handlePublish = useCallback(async () => {
    if (!tenantId) return;
    setPublishing(true);
    try {
      const id = await doSave();
      if (!id) return;
      const result = await publishFunnel({ tenantId, id });
      toast.success(result.url ? `Funnel is live at ${result.url}` : "Funnel is live.");
      onCreated?.();
    } catch (e) {
      const cause = isStudioError(e) ? e.cause ?? e : e;
      toast.error(growthSeamMessage(cause, isStudioError(e) ? e.message : "Couldn't publish this funnel. Try again."));
    } finally {
      setPublishing(false);
    }
  }, [tenantId, doSave, onCreated]);

  useEffect(() => {
    onToolbar({
      save: {
        label: saving ? "Saving…" : "Save",
        onClick: () => void handleSave(),
        disabled: !canAct || saving || publishing,
        busy: saving,
      },
      act: {
        label: publishing ? "Publishing…" : "Publish funnel",
        onClick: () => void handlePublish(),
        disabled: !canAct || saving || publishing,
        busy: publishing,
      },
    });
  }, [onToolbar, handleSave, handlePublish, canAct, saving, publishing]);

  const entryPage = pages.find((p) => p.id === entryPageId) ?? null;
  const stepForm = forms.find((f) => f.id === stepFormId) ?? null;

  const flow: { icon: LucideIcon; kind: string; title: string; pill: ReactNode; note?: string }[] = [];
  if (entryPage) {
    flow.push({
      icon: LayoutGrid,
      kind: "Entry page",
      title: entryPage.title,
      pill: (
        <StatePill state={entryPage.status === "published" ? "success" : "off"}>
          {entryPage.status === "published" ? "Live" : "Draft"}
        </StatePill>
      ),
      note: entryPage.status === "published" ? undefined : "Publish this page before the funnel can go live.",
    });
  }
  if (stepForm) {
    flow.push({
      icon: FileText,
      kind: "Form step",
      title: stepForm.name,
      pill: (
        <StatePill state={stepForm.status === "active" ? "success" : "off"}>
          {stepForm.status === "active" ? "Active" : "Off"}
        </StatePill>
      ),
      note: stepForm.status === "active" ? undefined : "Turn this form on before the funnel can go live.",
    });
  }
  if (flow.length > 0) {
    flow.push({
      icon: PartyPopper,
      kind: "Thank you",
      title: "The built-in thank-you step closes the flow.",
      pill: <StatePill state="pending">Included</StatePill>,
    });
  }

  return (
    <StudioSplit
      className={className}
      railHeader={
        <StudioRailHeading
          heading={MODE_RAIL.funnel.heading}
          description={MODE_RAIL.funnel.description}
        />
      }
      railBody={
        <>
          <div className="space-y-1.5">
            <Label htmlFor="funnel-name">Name</Label>
            <Input
              id="funnel-name"
              value={name}
              onChange={(e) => setNameAndSlug(e.target.value)}
              placeholder="New client flow"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funnel-slug">Link</Label>
            <Input
              id="funnel-slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="new-client"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Entry page</Label>
            <Select value={entryPageId} onValueChange={setEntryPageId} disabled={pages.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={pages.length === 0 ? "No pages yet — build one in Page mode" : "Pick a page"} />
              </SelectTrigger>
              <SelectContent>
                {pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Form step</Label>
            <Select value={stepFormId} onValueChange={setStepFormId} disabled={forms.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={forms.length === 0 ? "No forms yet — build one in Form mode" : "Pick a form"} />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pick at least one — a page, a form, or both. Paige wires the thank-you step for you.
            </p>
          </div>
        </>
      }
      canvas={
        flow.length === 0 ? (
          <div className="mx-auto w-full max-w-xl">
            <SectionCard>
              <EmptyState
                icon={GitBranch}
                tone="brand"
                title={MODE_EMPTY.funnel.title}
                description={MODE_EMPTY.funnel.description}
              />
            </SectionCard>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-xl">
            {flow.map((step, i) => {
              const Icon = step.icon;
              const last = i === flow.length - 1;
              return (
                <div key={`${step.kind}-${i}`} className={`relative pl-6 ${last ? "" : "pb-5"}`}>
                  <span className="absolute left-0 top-5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  {!last && <span className="absolute bottom-0 left-[4.5px] top-8 w-px bg-border" aria-hidden />}
                  <SectionCard
                    title={
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{step.title}</span>
                      </span>
                    }
                    description={step.kind}
                    actions={step.pill}
                  >
                    {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                  </SectionCard>
                </div>
              );
            })}
          </div>
        )
      }
    />
  );
}

export default FunnelMode;
