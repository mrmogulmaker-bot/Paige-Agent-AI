// Copy mode — the absorbed Content Studio composer, re-laid as a Studio workspace.
//
// Rail: channel/tone/variations pickers, then the SHARED PromptComposer (§18 — the same
// conversational input page mode uses) pinned at the bottom, indigo submit — zero gold on
// generate, matching the page composer's rule. Canvas: the drafts as editable cards; GOLD
// lives on each card's "Save to library", because filing it is the act. The clipboard copy
// (SectionCard's header action) IS this mode's "test" step (§13/§19) — marketing text is
// inert until it's pasted somewhere real, so copying it out is the realistic dry run Page/
// Form get from a live preview URL.
//
// Generation routes through studio.ts's draftCopy() seam (§10) — the exact `content-draft`
// invoke that used to live directly in this component, relocated behind the seam, unchanged
// in behavior. Saving now routes through studio.ts's saveCopy() seam too (§10/§18) — the
// exact `save_marketing_content` RPC call that used to live directly in this component,
// relocated behind the seam so Page/Form/Copy/Image all write through the ONE seam layer
// instead of Copy forking its own direct-RPC pattern.
import { useState } from "react";
import { SectionCard, EmptyState, StatePill, Toolbar } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { COPY_CHIPS, MODE_EMPTY, MODE_RAIL } from "../studio-copy";
import { CHANNELS, CHANNEL_LABEL, CopyButton, LabelChip, type Channel, type Draft } from "./content-shared";
import { PromptComposer } from "../PromptComposer";
import { draftCopy, isStudioError, saveCopy } from "../studio";
import { growthSeamMessage } from "@/lib/growth-templates";

export interface CopyModeProps {
  tenantId: string | null;
  className?: string;
  /** A brief Paige already routed here from the Studio's single entry point (§18) — seeds
   *  the composer on this mode's first mount. Additive: an operator who deliberately clicks
   *  the Copy chip still gets the normal blank composer and writes their own brief. */
  initialBrief?: string;
  /** Opens the Studio's own content library Sheet (§19: everything created here stays
   *  reachable from here) — surfaced as "View in library" once a draft's save resolves. */
  onOpenLibrary?: () => void;
}

export function CopyMode({ tenantId, className, initialBrief, onOpenLibrary }: CopyModeProps) {
  const [channel, setChannel] = useState<Channel>("social_post");
  const [brief, setBrief] = useState(initialBrief ?? "");
  const [tone, setTone] = useState("");
  const [variations, setVariations] = useState("2");
  const [drafting, setDrafting] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  // Keyed by the draft's index in `drafts` — the real marketing_content id ONLY once
  // saveCopy() has actually resolved (§13: never claim "Saved" ahead of the RPC settling).
  const [savedIds, setSavedIds] = useState<Record<number, string>>({});
  // The brief that actually produced the CURRENT `drafts` batch — captured at draft time,
  // same discipline as ImageMode's sourcePrompt, so editing the composer afterward (without
  // regenerating) can never mislabel what a later "Save"/"Save again" attributes a draft to.
  const [draftedBrief, setDraftedBrief] = useState("");

  const draft = async (value: string) => {
    const theBrief = value.trim();
    if (!tenantId) { toast.error("Pick a workspace first."); return; }
    if (theBrief.length < 5) { toast.error("Give Paige a brief: what's the content about?"); return; }
    setDrafting(true);
    try {
      const result = await draftCopy({
        tenantId, brief: theBrief, channel, tone, variations: Number(variations),
      });
      setDrafts(result.drafts);
      setDraftedBrief(theBrief);
      // A fresh set of drafts — any earlier "Saved" state belonged to the PREVIOUS drafts
      // at these same indexes, not these ones.
      setSavedIds({});
    } catch (e) {
      const cause = isStudioError(e) ? e.cause ?? e : e;
      toast.error(growthSeamMessage(cause, isStudioError(e) ? e.message : "Paige couldn't draft that. Try again."));
    } finally { setDrafting(false); }
  };

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const save = async (i: number) => {
    if (!tenantId) { toast.error("Select a workspace first."); return; }
    const d = drafts[i];
    setSavingIdx(i);
    try {
      const saved = await saveCopy({
        tenantId,
        title: d.title || CHANNEL_LABEL[channel],
        content: d.content,
        channel,
        brief: draftedBrief,
        // A repeat "Save again" updates the SAME row instead of forking a duplicate.
        id: savedIds[i] ?? null,
      });
      // Only set once the RPC has genuinely returned a row id — no optimistic flip.
      setSavedIds((prev) => ({ ...prev, [i]: saved.id }));
      toast.success("Saved to your library.");
    } catch (e) {
      toast.error(isStudioError(e) ? e.message : growthSeamMessage(e, "Couldn't save that. Try again."));
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <StudioSplit
      className={className}
      railHeader={
        <StudioRailHeading
          heading={MODE_RAIL.copy.heading}
          description={MODE_RAIL.copy.description}
        />
      }
      railBody={
        <>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v: Channel) => setChannel(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="copy-tone">Tone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="copy-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="bold, warm…" />
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
        </>
      }
      railFooter={
        <PromptComposer
          mode="page"
          value={brief}
          onChange={setBrief}
          onSubmit={(value) => void draft(value)}
          busy={drafting}
          heading={MODE_RAIL.copy.heading}
          placeholder="e.g. Announce my new 6-week client onboarding program. Key points: faster ramp, weekly check-ins, a results guarantee. Aim at consultants scaling their practice."
          helperText="The more real detail you give — the offer, the audience, the ask — the closer the first draft lands."
          submitLabel="Draft with Paige"
          busyLabel="Writing…"
          chips={COPY_CHIPS}
        />
      }
      canvas={
        drafts.length === 0 ? (
          <div className="mx-auto w-full max-w-3xl">
            <SectionCard>
              <EmptyState
                icon={Sparkles} tone="brand"
                title={MODE_EMPTY.copy.title}
                description={MODE_EMPTY.copy.description}
              />
            </SectionCard>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {drafts.map((d, i) => (
              <SectionCard key={i} title={
                <span className="flex items-center gap-2">
                  <Input
                    value={d.title} onChange={(e) => setDraft(i, { title: e.target.value })}
                    aria-label="Draft title"
                    className="h-8 max-w-xs border-transparent bg-transparent px-1 font-display text-base font-semibold focus-visible:border-input"
                  />
                  <LabelChip>{CHANNEL_LABEL[channel]}</LabelChip>
                </span>
              } actions={<CopyButton text={d.content} />}>
                <Textarea
                  value={d.content} onChange={(e) => setDraft(i, { content: e.target.value })}
                  rows={Math.min(14, Math.max(5, d.content.split("\n").length + 1))}
                  className="text-sm leading-relaxed"
                />
                <Toolbar className="mt-3">
                  {savedIds[i] ? (
                    <StatePill state="success">Saved to library</StatePill>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not saved yet</span>
                  )}
                  <div className="flex items-center gap-2">
                    {savedIds[i] && onOpenLibrary && (
                      <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
                        View in library
                      </Button>
                    )}
                    {/* GOLD (§11): the act — this draft, filed into the tenant's library. */}
                    <Button onClick={() => save(i)} disabled={savingIdx === i} variant="gold" size="sm" className="gap-1.5">
                      {savingIdx === i
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        : <Save className="h-3.5 w-3.5" />}
                      {savedIds[i] ? "Save again" : "Save to library"}
                    </Button>
                  </div>
                </Toolbar>
              </SectionCard>
            ))}
          </div>
        )
      }
    />
  );
}

export default CopyMode;
