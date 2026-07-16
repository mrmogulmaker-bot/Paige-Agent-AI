// Image mode — the absorbed Content Studio image generator, re-laid as a Studio workspace.
//
// Rail: shape picker, then the SHARED PromptComposer (§18 — the same conversational input
// page mode uses) pinned at the bottom, indigo submit. Canvas: the result (or the honest
// needs_config gate, preserved verbatim). The act is normally the server auto-filing the
// image into the library inside generate-image — the success StatePill only ever reports
// that once `content_id` genuinely comes back on the result (§13: never claim a save that
// didn't happen; that insert is explicitly best-effort server-side). When it doesn't, a
// real gold "Save to library" retry appears — the one moment this mode DOES carry gold,
// because filing the image is then, for the first time, an act the operator is taking.
//
// The "test" step Page/Form get from a live preview URL: the image is already hosted on a
// real public bucket the instant generation succeeds, so a "Copy image URL" action next to
// Download IS the test/share step — no separate publish state exists for a generated image.
//
// Generation routes through studio.ts's draftImage() seam (§10) — the exact `generate-image`
// invoke that used to live directly in this component, relocated behind the seam, unchanged
// in behavior, including the needs_config branch. The manual save fallback routes through
// studio.ts's saveImageToLibrary() seam — the same save_marketing_content RPC the server
// call already uses, so there is still only ONE write path for this table (§10/§18).
import { useState } from "react";
import { SectionCard, EmptyState, Toolbar, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Info, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { MODE_EMPTY, MODE_RAIL } from "../studio-copy";
import { CopyButton } from "./content-shared";
import { PromptComposer } from "../PromptComposer";
import { draftImage, isStudioError, saveImageToLibrary } from "../studio";
import { growthSeamMessage } from "@/lib/growth-templates";

export interface ImageModeProps {
  tenantId: string | null;
  className?: string;
  /** A prompt Paige already routed here from the Studio's single entry point (§18) — seeds
   *  the composer on this mode's first mount. Additive: an operator who deliberately clicks
   *  the Image chip still gets the normal blank composer and writes their own prompt. */
  initialPrompt?: string;
  /** Opens the Studio's own content library Sheet (§19: everything created here stays
   *  reachable from here) — surfaced as "View in library" once the image is confirmed saved. */
  onOpenLibrary?: () => void;
  /** An image landed in the library (server auto-file on generate, or an explicit save) — the
   *  shell links it into the owning project (§19), so it carries the row's id + title. */
  onSaved?: (saved: { id: string; title: string }) => void;
}

interface ImageResult {
  url: string;
  size: string;
  path?: string;
  /** The prompt that produced THIS result — captured at generate time, not read live off
   *  the composer, so a later edit to the prompt field can never mislabel a retry save. */
  sourcePrompt: string;
  /** The marketing_content row id — present ONLY when generate-image's own server-side
   *  auto-file actually succeeded. Null means exactly what it says: not saved yet. */
  contentId: string | null;
}

export function ImageMode({ tenantId, className, initialPrompt, onOpenLibrary, onSaved }: ImageModeProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [size, setSize] = useState("square");
  const [busy, setBusy] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [result, setResult] = useState<ImageResult | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  const generate = async (value: string) => {
    const thePrompt = value.trim();
    if (thePrompt.length < 4) { toast.error("Describe the image you want."); return; }
    setBusy(true); setNeedsConfig(false);
    try {
      const out = await draftImage({ tenantId: tenantId ?? "", prompt: thePrompt, size });
      if (out.needsConfig) { setNeedsConfig(true); return; }
      setResult({
        url: out.url,
        size: out.size,
        path: out.path,
        sourcePrompt: thePrompt,
        // generate-image's own auto-file is best-effort server-side — a real generation
        // can still come back with no row. Reflect exactly what happened, nothing assumed.
        contentId: out.content_id ?? null,
      });
      // If the server already filed it, link that real row into the project now (§19).
      if (out.content_id) onSaved?.({ id: out.content_id, title: thePrompt.slice(0, 60) || "Image" });
    } catch (e) {
      toast.error(isStudioError(e) ? e.message : growthSeamMessage(e, "Couldn't generate that image. Try again."));
    } finally { setBusy(false); }
  };

  const saveToLibrary = async () => {
    if (!result) return;
    if (!tenantId) { toast.error("Select a workspace first."); return; }
    setSavingToLibrary(true);
    try {
      const saved = await saveImageToLibrary({
        tenantId,
        title: result.sourcePrompt.slice(0, 60) || "Untitled",
        url: result.url,
        path: result.path,
        size: result.size,
        brief: result.sourcePrompt,
      });
      setResult((r) => (r ? { ...r, contentId: saved.id } : r));
      onSaved?.({ id: saved.id, title: result.sourcePrompt.slice(0, 60) || "Image" });
      toast.success("Saved to your library.");
    } catch (e) {
      toast.error(isStudioError(e) ? e.message : growthSeamMessage(e, "Couldn't save that. Try again."));
    } finally {
      setSavingToLibrary(false);
    }
  };

  return (
    <StudioSplit
      className={className}
      railHeader={
        <StudioRailHeading
          heading={MODE_RAIL.image.heading}
          description={MODE_RAIL.image.description}
        />
      }
      railBody={
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
      }
      railFooter={
        <PromptComposer
          mode="page"
          value={prompt}
          onChange={setPrompt}
          onSubmit={(value) => void generate(value)}
          busy={busy}
          heading={MODE_RAIL.image.heading}
          placeholder="e.g. A clean, modern promo graphic for a consulting webinar — indigo and gold palette, confident, minimal, space for a headline."
          helperText="Say what you need — the more specific the scene, palette, and mood, the closer the first result lands."
          submitLabel="Generate image"
          busyLabel="Generating…"
        />
      }
      canvas={
        <div className="mx-auto w-full max-w-3xl">
          <SectionCard>
            {needsConfig ? (
              <EmptyState
                icon={Info} title="Image generation isn't switched on yet"
                description="It's not available on your account right now — reach out to turn it on. Drafting copy works now regardless."
              />
            ) : result ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-muted/30">
                  <img src={result.url} alt="Generated by Paige" className="mx-auto max-h-[60vh] w-auto max-w-full" />
                </div>
                <Toolbar>
                  {result.contentId ? (
                    <StatePill state="success">Saved to library</StatePill>
                  ) : (
                    <StatePill state="warning">Not saved to library yet</StatePill>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The test/share step (§13/§19): the image is already hosted on a real
                        public URL the moment generation succeeds — copying it out is the
                        dry run, the same job Page/Form's preview URL does. */}
                    <CopyButton text={result.url} label="Copy image URL" />
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={result.url} download target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </Button>
                    {result.contentId ? (
                      onOpenLibrary && (
                        <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
                          View in library
                        </Button>
                      )
                    ) : (
                      // GOLD (§11): the act — this image, filed into the tenant's library.
                      // Only rendered when the server's own auto-file inside generate-image
                      // didn't happen, so the Studio never claims a save that never occurred.
                      <Button
                        onClick={() => void saveToLibrary()}
                        disabled={savingToLibrary}
                        variant="gold"
                        size="sm"
                        className="gap-1.5"
                      >
                        {savingToLibrary
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                          : <Save className="h-3.5 w-3.5" />}
                        Save to library
                      </Button>
                    )}
                  </div>
                </Toolbar>
              </div>
            ) : (
              <EmptyState
                icon={Sparkles} tone="brand"
                title={MODE_EMPTY.image.title}
                description={MODE_EMPTY.image.description}
              />
            )}
          </SectionCard>
        </div>
      }
    />
  );
}

export default ImageMode;
