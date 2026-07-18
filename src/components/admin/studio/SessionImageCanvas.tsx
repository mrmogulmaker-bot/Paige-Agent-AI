// ── #292 — the session canvas image VIEWER (carousel over an image SET) ─────────────────────
// A design turn can file MULTIPLE images to one session (e.g. a 3-image carousel). The server
// streams only the LAST as the live paige_artifact, so the canvas used to show one, last-wins,
// with no way to reach the siblings. This viewer renders the CURRENT image in the same letterbox
// figure and, when the session holds >1 image, adds prev/next + a thumbnail strip that flip the
// canvas through the set — reusing the SAME setCanvasArtifact shape a rail re-open uses (§18/§21:
// this navigates WITHIN the current image set; it is NOT an artifact-type tab strip). A single
// image renders exactly as before, just with the toolbar. §11: gold is spent ONLY on the Save act;
// arrows, strip, download, copy stay neutral/indigo. Token-only, AA both themes, motion-safe.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyButton } from "./modes/content-shared";
import { StudioBuildingScreen } from "./StudioBuildingScreen";
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
  /** A FOLLOW-UP render is in flight (#292, owner 2026-07-18). When true the current creative TUCKS
   *  away toward the thumbnail strip (it already lives there via the carousel — never lost, §13) and
   *  the stage CLEARS to a dedicated branded render surface so the next round gets fresh room to POP
   *  in. When it flips back false the new (or, on a text-only reply, the same) image springs onto the
   *  stage. §22: the render moment is where the heavy motion earns its pixels. */
  busy?: boolean;
  /** The real streamed note for the in-flight render (drives the render surface's narration, §13). */
  buildNote?: string | null;
  /** Real elapsed ms since the follow-up render started — the honest clock on the render surface. */
  buildElapsedMs?: number;
}

/** A safe download filename derived from the image's title (never a raw storage key). */
function filenameFor(img: CanvasImage): string {
  const base =
    (img.title || "image")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  return `${base}.png`;
}

/** Render the canvas image + toolbar, and — only when the session holds more than one image —
 *  the carousel chrome (prev/next + thumbnail strip) to move through the set inline. */
export function SessionImageCanvas({
  current,
  images,
  onSelect,
  onSave,
  reduceMotion,
  busy = false,
  buildNote = null,
  buildElapsedMs = 0,
}: SessionImageCanvasProps) {
  // "Saved ✓" is truthful state (§13): a current id lands here ONLY after onSave resolves true.
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Scope keyboard nav to the canvas: only act when the pointer is over it or focus is inside it,
  // so Arrow keys never hijack the rest of the surface (scroll regions, other controls).
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const currentIndex = images.findIndex((r) => r.id === current.id);
  // Chrome only when there is a real set AND the current image is part of it (a fresh build whose
  // ref hasn't landed in the manifest yet renders alone — exactly as a single image, §13).
  const hasCarousel = images.length > 1 && currentIndex >= 0;

  const go = (delta: number) => {
    if (!hasCarousel || busy) return; // don't mutate the stage image out from under an in-flight render
    const next = images[(currentIndex + delta + images.length) % images.length];
    if (next?.thumbnailUrl) onSelect({ id: next.id, title: next.title, url: next.thumbnailUrl });
  };

  // Keyboard left/right — scoped to the canvas (hover or focus-within) and never while a text
  // field is focused, so typing a brief elsewhere is untouched.
  useEffect(() => {
    if (!hasCarousel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const c = containerRef.current;
      if (!c || (!hovered && !c.contains(el))) return; // only when the canvas is the user's focus
      e.preventDefault();
      go(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCarousel, currentIndex, images, hovered, busy]);

  const isSaved = savedIds.has(current.id);
  const isSaving = savingId === current.id;
  const handleSave = async () => {
    if (isSaved || isSaving) return;
    setSavingId(current.id);
    const ok = await onSave({ id: current.id, kind: "image", title: current.title, imageUrl: current.url });
    setSavingId((prev) => (prev === current.id ? null : prev));
    if (ok) setSavedIds((prev) => new Set(prev).add(current.id));
  };

  // Real download (§13 — the owner's ask is to DOWNLOAD, not open a tab): fetch the asset to a blob
  // and save it. The `download` attribute is ignored for cross-origin storage URLs, so the anchor
  // trick alone just navigates; fetching the blob forces a genuine file save. If the fetch is CORS-
  // blocked, fall back to opening the asset so the user can still right-click-save (never a dead end).
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(current.url);
      if (!resp.ok) throw new Error(`fetch ${resp.status}`);
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filenameFor(current);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      window.open(current.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  // ── The stage figure (the real creative) and the branded render surface — the two states the
  //    main stage swaps between. Prev/next hug the letterbox edges so they never cover the subject.
  const stageImage = (
    <div className="relative flex max-h-full max-w-full items-center justify-center">
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
  );

  // The dedicated branded RENDER surface that owns the cleared stage while the next round renders
  // (owner 2026-07-18: "room to render the next round", not a scrim over a frozen image). Reuses the
  // §22 cutscene primitive (living PaigeMark + aurora + streamed note + honest elapsed) and layers
  // the shipped token/white shooting-star field on top (§12/§18 — reuse, no new keyframes). Under
  // reduce, StudioBuildingScreen calms its own layers and the star field is hidden.
  const renderSurface = (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <StudioBuildingScreen
        indeterminate
        // Artifact-agnostic fallback: a follow-up on an image stage can produce a page/doc/funnel, not
        // just another image, so the copy must not claim "image" (§13 honesty). The real streamed note
        // wins when present; the fallback stays neutral.
        note={buildNote?.trim() || "Creating the next round…"}
        agent="Design agent"
        elapsedMs={buildElapsedMs}
        reduce={reduceMotion}
        ariaLabel="Creating the next round"
      />
      {!reduceMotion && <div aria-hidden className="studio-shooting" />}
    </div>
  );

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="h-full p-2"
    >
      <div className="flex h-full w-full max-w-full flex-col items-center gap-2">
        {/* The main STAGE — swaps between the creative and the render surface. On a follow-up render
            the current image TUCKS toward the strip (exit: recede up + scale toward bottom origin)
            while the render surface takes the cleared stage; when the artifact lands, the new (or,
            on a text-only reply, the same) image springs back in (§22). Motion-safe: under reduce
            the swap is instant — no AnimatePresence, no transforms (§11/§25). */}
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
          {reduceMotion ? (
            <div className="absolute inset-0 grid place-items-center">
              {busy ? renderSurface : stageImage}
            </div>
          ) : (
            // `custom={busy}` reaches the EXITING image so the dramatic TUCK (recede up + shrink
            // toward the strip) fires ONLY when the render surface is taking the stage. A manual
            // carousel flip (current.id changes while not busy) leaves with a light crossfade instead
            // of the full tuck, so flipping the set stays snappy (§25 — motion serves the moment).
            <AnimatePresence initial={false} custom={busy}>
              {busy ? (
                <motion.div
                  key="render"
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 1.015 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.015 }}
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                >
                  {renderSurface}
                </motion.div>
              ) : (
                <motion.div
                  key={`img:${current.id}`}
                  className="absolute inset-0 grid place-items-center"
                  style={{ transformOrigin: "bottom center" }}
                  custom={busy}
                  variants={{
                    initial: { opacity: 0, scale: 0.85, y: 0 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    // toRender = the render surface is taking over → tuck toward the strip; else a
                    // light crossfade (manual flip). The tucked creative is never lost — it lives in
                    // the thumbnail strip below (§13).
                    exit: (toRender: boolean) =>
                      toRender
                        ? { opacity: 0, scale: 0.42, y: "-40%" }
                        : { opacity: 0, scale: 0.98, y: 0 },
                  }}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.9 }}
                >
                  {stageImage}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Toolbar — copy/download/save on the image (never over it). Gold only on the Save act (§11).
            Its controls are hidden while a render is in flight (nothing live to act on), but the row
            RESERVES its height so the stage doesn't jump on each busy↔idle transition (no CLS). */}
        <div className={cn("flex min-h-9 w-full max-w-full flex-wrap items-center justify-center gap-2", busy && "invisible")} aria-hidden={busy}>
          {hasCarousel && (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          <CopyButton text={current.url} label="Copy image URL" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download
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

        {/* Thumbnail strip — flip through the set. A labeled group of buttons (NOT ARIA tabs — there
            is no controlled tabpanel); the active thumb is ringed indigo, never gold (§11). Stays
            mounted through a render so the tucked-away creatives remain reachable (owner 2026-07-18,
            §13 — nothing is lost). During a render the "active" ring tracks the last-current image. */}
        {hasCarousel && (
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Images in this set">
            {images.map((ref, i) => {
              const active = i === currentIndex;
              return (
                <button
                  key={`${ref.kind}:${ref.id}`}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  aria-label={ref.title || `Image ${i + 1}`}
                  // During a render the strip stays visible (tucked creatives remain reachable) but is
                  // not clickable — selecting mid-render would swap the stage image under the render.
                  disabled={busy}
                  onClick={() => !busy && ref.thumbnailUrl && onSelect({ id: ref.id, title: ref.title, url: ref.thumbnailUrl })}
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30 outline-none disabled:opacity-60",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary ring-2 ring-primary"
                      : "border-border/70 hover:border-primary/50",
                    !reduceMotion && "transition-colors",
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
