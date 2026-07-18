// ── #292 — the session canvas image VIEWER (carousel over an image SET) ─────────────────────
// A design turn can file MULTIPLE images to one session (e.g. a 3-image carousel). The server
// streams only the LAST as the live paige_artifact, so the canvas used to show one, last-wins,
// with no way to reach the siblings. This viewer renders the CURRENT image in the same letterbox
// figure and, when the session holds >1 image, adds prev/next + a thumbnail strip that flip the
// canvas through the set — reusing the SAME setCanvasArtifact shape a rail re-open uses (§18/§21:
// this navigates WITHIN the current image set; it is NOT an artifact-type tab strip). A single
// image renders exactly as before, just with the toolbar. §11: gold is spent ONLY on the Save act;
// arrows, strip, download, copy stay neutral/indigo. Token-only, AA both themes, motion-safe.
import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyButton } from "./modes/content-shared";
import type { SessionArtifactRef } from "./studio-types";

/** The current image on the canvas — the narrowed canvasArtifact (url guaranteed present). */
export interface CanvasImage {
  id: string;
  title: string;
  url: string;
}

interface SessionImageCanvasProps {
  /** The image currently on the stage (canvasArtifact, kind "content", url present). */
  current: CanvasImage;
  /** The session's full image set — state.artifacts pre-filtered to content refs WITH a thumbnail. */
  images: SessionArtifactRef[];
  /** Flip the canvas to another image in the set. Mirrors StudioShell's rail-reopen shape exactly. */
  onSelect: (next: CanvasImage) => void;
  /** Keep the current image in the tenant's Saved library. Resolves true only on a real persist (§13). */
  onSave: (item: { id: string; kind: "image"; title: string; imageUrl: string | null }) => Promise<boolean>;
  reduceMotion: boolean;
}

/** Render the canvas image + toolbar, and — only when the session holds more than one image —
 *  the carousel chrome (prev/next + thumbnail strip) to move through the set inline. */
export function SessionImageCanvas({ current, images, onSelect, onSave, reduceMotion }: SessionImageCanvasProps) {
  // "Saved ✓" is truthful state (§13): a current id lands here ONLY after onSave resolves true.
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const currentIndex = images.findIndex((r) => r.id === current.id);
  // Chrome only when there is a real set AND the current image is part of it (a fresh build whose
  // ref hasn't landed in the manifest yet renders alone — exactly as a single image, §13).
  const hasCarousel = images.length > 1 && currentIndex >= 0;

  const go = (delta: number) => {
    if (!hasCarousel) return;
    const next = images[(currentIndex + delta + images.length) % images.length];
    if (next?.thumbnailUrl) onSelect({ id: next.id, title: next.title, url: next.thumbnailUrl });
  };

  // Keyboard left/right — but never hijack arrow keys while the chat textarea (or any field) has
  // focus, so typing a brief stays unaffected.
  useEffect(() => {
    if (!hasCarousel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      go(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isSaved = savedIds.has(current.id);
  const isSaving = savingId === current.id;
  const handleSave = async () => {
    if (isSaved || isSaving) return;
    setSavingId(current.id);
    const ok = await onSave({ id: current.id, kind: "image", title: current.title, imageUrl: current.url });
    setSavingId((prev) => (prev === current.id ? null : prev));
    if (ok) setSavedIds((prev) => new Set(prev).add(current.id));
  };

  return (
    <div className="grid h-full place-items-center p-2">
      <div className="flex max-h-full min-h-0 w-full max-w-full flex-col items-center gap-2">
        {/* Image → the real asset, letterboxed WHOLE (never cropped/stretched, §13) on a layered
            card (§22). Prev/next sit over the letterbox edges so they never cover the subject. */}
        <div className="relative flex min-h-0 items-center justify-center">
          <figure className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-[hsl(var(--studio-chrome-border)/0.6)] bg-card shadow-[0_24px_60px_-24px_hsl(var(--studio-ink)/0.7)]">
            <img
              src={current.url}
              alt={current.title || "Generated image"}
              className="block max-h-[calc(100vh-16rem)] max-w-full object-contain"
              loading="eager"
            />
          </figure>
          {hasCarousel && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous image"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full border-border/70 bg-background/85 backdrop-blur-sm hover:bg-background"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next image"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full border-border/70 bg-background/85 backdrop-blur-sm hover:bg-background"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Toolbar — copy/download/save on the image (never over it). Gold only on the Save act (§11). */}
        <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-2">
          {hasCarousel && (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          <CopyButton text={current.url} label="Copy image URL" />
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={current.url} download target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </Button>
          {isSaved ? (
            // Post-save: neutral confirmation, NOT gold — the act moment has passed (§11).
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Saved
            </Button>
          ) : (
            // GOLD (§11): the act — this image, filed into the tenant's Saved library.
            <Button onClick={() => void handleSave()} disabled={isSaving} variant="gold" size="sm" className="gap-1.5">
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save to library
            </Button>
          )}
        </div>

        {/* Thumbnail strip — flip through the set. Active thumb ringed in indigo, never gold (§11). */}
        {hasCarousel && (
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Images in this set">
            {images.map((ref, i) => {
              const active = i === currentIndex;
              return (
                <button
                  key={`${ref.kind}:${ref.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={ref.title || `Image ${i + 1}`}
                  onClick={() => ref.thumbnailUrl && onSelect({ id: ref.id, title: ref.title, url: ref.thumbnailUrl })}
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30 outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary ring-2 ring-primary"
                      : "border-border/70 hover:border-primary/50",
                    !reduceMotion && "motion-safe:duration-150",
                  )}
                >
                  {ref.thumbnailUrl && (
                    <img src={ref.thumbnailUrl} alt="" aria-hidden className="h-full w-full object-cover" loading="lazy" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
