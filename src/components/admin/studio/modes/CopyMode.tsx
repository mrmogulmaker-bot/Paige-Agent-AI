// Copy mode — the absorbed Content Studio composer, re-laid as a Studio workspace.
//
// Rail: the brief (channel, tone, variations, the words) with an indigo "Draft with
// Paige" pinned at the bottom — zero gold on generate, matching the page composer's rule.
// Canvas: the drafts as editable cards; GOLD lives on each card's "Save to library",
// because filing it is the act.
//
// Backends unchanged (§10): the exact `content-draft` invoke and
// `save_marketing_content` RPC lifted from the old ComposePanel.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, FilterChip } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { COPY_CHIPS, MODE_EMPTY, MODE_RAIL } from "../studio-copy";
import { CHANNELS, CHANNEL_LABEL, CopyButton, LabelChip, type Channel, type Draft } from "./content-shared";
import { growthSeamMessage } from "@/lib/growth-templates";

export interface CopyModeProps {
  tenantId: string | null;
  className?: string;
}

export function CopyMode({ tenantId, className }: CopyModeProps) {
  const [channel, setChannel] = useState<Channel>("social_post");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("");
  const [variations, setVariations] = useState("2");
  const [drafting, setDrafting] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const draft = async () => {
    if (!tenantId) { toast.error("Pick a workspace first."); return; }
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
    } catch (e) {
      toast.error(growthSeamMessage(e, "Paige couldn't draft that. Try again."));
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
    } catch (e) {
      toast.error(growthSeamMessage(e, "Couldn't save that. Try again."));
    } finally { setSavingIdx(null); }
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
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Start from a brief
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COPY_CHIPS.map((chip) => (
                <FilterChip
                  key={chip.id}
                  active={brief.trim() === chip.seed.trim()}
                  onClick={() => setBrief(chip.seed)}
                >
                  {chip.label}
                </FilterChip>
              ))}
            </div>
          </div>
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
            <Label htmlFor="copy-brief">What's it about?</Label>
            <Textarea
              id="copy-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={6}
              className="resize-none text-sm leading-relaxed"
              placeholder="e.g. Announce my new 6-week client onboarding program. Key points: faster ramp, weekly check-ins, a results guarantee. Aim at consultants scaling their practice."
            />
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
        /* Indigo, deliberately — the act moment is filing it to the library, not this. */
        <Button onClick={draft} disabled={drafting} variant="default" className="w-full gap-2">
          {drafting
            ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Writing…</>
            : <><Send className="h-4 w-4" /> Draft with Paige</>}
        </Button>
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
                <div className="mt-3 flex justify-end">
                  {/* GOLD (§11): the act — this draft, filed into the tenant's library. */}
                  <Button onClick={() => save(i)} disabled={savingIdx === i} variant="gold" size="sm" className="gap-1.5">
                    {savingIdx === i
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      : <Save className="h-3.5 w-3.5" />}
                    Save to library
                  </Button>
                </div>
              </SectionCard>
            ))}
          </div>
        )
      }
    />
  );
}

export default CopyMode;
