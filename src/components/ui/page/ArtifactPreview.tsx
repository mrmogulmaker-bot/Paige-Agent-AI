// The ONE real-scaled artifact preview primitive (§12/§18 — one home, never three renderers).
//
// Every glyph-in-a-box surface routes through here: the ProjectCard cover, the ProjectNavigator
// rail rows, and the session-canvas copy branch (§22 marquee "real thumbnails, never a
// glyph-in-a-box"). It resolves a REAL scaled render per artifact kind, honestly (§13):
//   • page / document → the existing captured thumbnail (a real Storage URL)
//   • image           → the primary image artifact's real Storage URL
//   • copy            → a real scaled render of the ACTUAL words (snippet in preview, a full
//                       document-grade sheet in `variant="sheet"`) — never fabricated
//   • form / funnel / empty / unsupported → the branded per-project cosmic field (the HONEST
//                       zero/unsupported fallback — a distinct branded cover, never a fake preview)
// A missing/404/tombstoned thumbnail degrades to the branded field, so a broken <img> never ships.
// A `skeleton` mode (Slice C reuses it while an artifact builds) renders a token-only shimmer.
//
// Gold discipline (§11): the fallback glyph plate rests on an INDIGO hairline (ring="indigo"),
// never a resting decorative gold ring. Token-only; the one white sheen reads --studio-sheen.
import { useEffect, useState } from "react";
import {
  ClipboardList,
  FileText,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  Type,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlyphPlate } from "./GlyphPlate";
import { PaigeMark } from "@/components/brand/PaigeMark";

/** The kinds a preview can resolve. `document` and `copy` extend the four studio artifact types so
 *  the primitive can also render the canvas reopen surfaces (§21 — one session, every type). */
export type ArtifactPreviewKind = "page" | "document" | "image" | "copy" | "form" | "funnel";

const KIND_GLYPH: Record<ArtifactPreviewKind, LucideIcon> = {
  page: LayoutGrid,
  document: FileText,
  image: ImageIcon,
  copy: Type,
  form: ClipboardList,
  funnel: GitBranch,
};

export interface ArtifactPreviewProps {
  /** The artifact kind — drives the fallback glyph and which real-preview path is taken. */
  kind?: ArtifactPreviewKind | null;
  /** A captured page/document thumbnail OR an image artifact's real Storage URL. When present and
   *  it loads, it renders as the real scaled cover; a 404/tombstone falls back to the branded field. */
  thumbnailUrl?: string | null;
  /** The artifact's REAL words (copy). Rendered as a real text render — a scaled snippet in the
   *  default `preview` variant, a full document-grade sheet in `sheet`. Never fabricated (§13). */
  copyText?: string | null;
  /** Copy sheet title (used by `variant="sheet"`). */
  title?: string | null;
  /** A stable seed (the project/session/artifact id) for the deterministic branded-gradient
   *  fallback, so an artifact-less/unsupported preview still reads as ITS distinct cover, never one
   *  shared gray box. */
  seed?: string;
  /** Render a token-only shimmer instead of content (Slice C reuses this while an artifact builds). */
  skeleton?: boolean;
  /** `preview` (default) fills its container as a scaled cover/mini-thumb (card cover, rail row);
   *  `sheet` renders the full document-grade copy paper sheet (the session-canvas copy branch). */
  variant?: "preview" | "sheet";
  /** A tighter fallback (no PaigeMark watermark, a smaller glyph plate) for small surfaces — the
   *  rail mini-thumb. Ignored when a real thumbnail or copy render is available. */
  compact?: boolean;
  /** Pass useReducedMotion() so the skeleton shimmer / cover zoom rest under reduced motion. */
  reduce?: boolean;
  className?: string;
}

/** The paper-sheet styling (mirrors DocumentPreview's SHEET_CLS — border + soft ink shadow, layered
 *  depth, never flat) so a promoted copy sheet reads as the same premium deliverable (§22). */
const SHEET_CLS =
  "rounded-2xl border border-[hsl(var(--border))] bg-card shadow-[0_24px_60px_-28px_hsl(var(--studio-ink,var(--foreground))/0.5)]";

/** A stable 32-bit hash (FNV-1a) of the seed — the deterministic key for a project's own branded
 *  cover, so an artifact-less project still reads as ITS distinct field, not one shared gray box. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The branded cosmic field — the HONEST fallback for form/funnel/empty/unsupported (§13). The
 *  COLORS are all studio brand tokens (indigo → primary → electric blue); only the gradient ANGLE,
 *  the light-sheen focal point, and a BOUNDED ±16° hue-rotate vary by seed — provably never gold. */
function BrandedField({
  seed,
  kind,
  compact,
  className,
}: {
  seed: string;
  kind: ArtifactPreviewKind | null;
  compact: boolean;
  className?: string;
}) {
  const Glyph = (kind && KIND_GLYPH[kind]) || Wand2;
  const h = hashSeed(seed);
  const gradAngle = 108 + (h % 64); // 108°–171°
  const hueShift = (h % 33) - 16; // −16°…+16°, provably never gold
  const sheenX = 22 + (h % 56); // 22%–77%
  const sheenY = 16 + ((h >>> 5) % 40); // 16%–55%
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Brand gradient — token colors, per-project geometry + bounded hue-rotate (§11). */}
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
        style={{
          background: `linear-gradient(${gradAngle}deg, hsl(var(--studio-nebula-indigo) / 0.9), hsl(var(--primary)) 54%, hsl(var(--studio-nebula-blue) / 0.7))`,
          filter: `hue-rotate(${hueShift}deg)`,
        }}
      />
      {/* Soft light sheen (upper-band focal point) for a lit, three-dimensional read — tokenized. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 60% at ${sheenX}% ${sheenY}%, hsl(var(--studio-sheen, 0 0% 100%) / 0.2), transparent 68%)`,
        }}
      />
      {/* Base vignette in fixed cosmic ink so the cover sinks at the bottom (§11 shadow ink). */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 92% at 50% 122%, hsl(var(--studio-ink) / 0.55), transparent 56%)",
        }}
      />
      {/* Faint PaigeMark watermark — §6 brand continuity, kept low enough to read as texture. Dropped
          on the compact (rail) fallback where a 28px mark would just be noise. */}
      {!compact && (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-5 -right-5 opacity-[0.09]"
        >
          <PaigeMark className="h-28 w-28" />
        </span>
      )}
      {/* The kind glyph, centered. At full size it's a plated glyph on an INDIGO hairline (never resting
          gold, §11). At RAIL scale a full 36px plate would fill the 36px box and occlude the branded
          field (re-creating the glyph-in-a-box tell), so compact floats a bare half-size icon OVER the
          visible gradient instead. */}
      <div className="relative grid h-full place-items-center">
        {compact ? (
          <Glyph aria-hidden className="h-4 w-4 text-[hsl(var(--studio-sheen,0_0%_100%)/0.72)]" />
        ) : (
          <GlyphPlate icon={Glyph} size="lg" ring="indigo" />
        )}
      </div>
    </div>
  );
}

/** A real scaled snippet of the ACTUAL copy — a mini paper card showing the first lines, so a copy
 *  surface reads as a document with words, never a glyph (§22). Never fabricated (§13). */
function CopySnippet({ body, className }: { body: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[hsl(var(--card))] px-3 py-2.5",
        className,
      )}
    >
      <p className="line-clamp-6 whitespace-pre-wrap text-[7px] leading-[1.55] tracking-tight text-[hsl(var(--foreground)/0.75)]">
        {body}
      </p>
      {/* Bottom fade so the clamped text dissolves rather than hard-cutting mid-line. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
        style={{ background: "linear-gradient(to top, hsl(var(--card)), transparent)" }}
      />
    </div>
  );
}

/** The full document-grade copy sheet — the promoted session-canvas copy branch. Reuses the paper
 *  SHEET_CLS + a real reading measure so read-only copy presents like a real deliverable (§22). */
function CopySheet({
  title,
  body,
  className,
}: {
  title?: string | null;
  body: string;
  className?: string;
}) {
  return (
    <article
      className={cn(SHEET_CLS, "flex max-h-full w-full flex-col overflow-hidden", className)}
    >
      <header className="border-b border-[hsl(var(--border))] px-6 py-4 md:px-8 md:py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Copy
        </p>
        {title?.trim() && (
          <h3 className="mt-1 truncate font-display text-base font-semibold tracking-[-0.01em] text-foreground md:text-lg">
            {title}
          </h3>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-7">
        <p className="mx-auto max-w-[68ch] whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground/90 [text-wrap:pretty]">
          {body}
        </p>
      </div>
    </article>
  );
}

export function ArtifactPreview({
  kind = null,
  thumbnailUrl = null,
  copyText = null,
  title = null,
  seed = "",
  skeleton = false,
  variant = "preview",
  compact = false,
  reduce = false,
  className,
}: ArtifactPreviewProps) {
  // A thumbnail URL can 404 (a deleted asset, a moved bucket) — fall back to the branded field
  // rather than render a broken image (§13, tolerate tombstoned refs).
  const [failed, setFailed] = useState(false);
  // Reset the failed flag when the URL changes on the SAME mounted instance (e.g. an artifact is
  // rebuilt/reverted to a fresh thumbnail at the same React position) so a prior 404 doesn't pin the
  // branded fallback forever.
  useEffect(() => { setFailed(false); }, [thumbnailUrl]);

  // SKELETON — a token-only shimmer while an artifact builds (Slice C reuses this). Motion-safe.
  if (skeleton) {
    return (
      <div
        aria-hidden
        className={cn(
          "h-full w-full animate-pulse bg-[hsl(var(--studio-chrome-border)/0.3)] motion-reduce:animate-none",
          reduce && "animate-none",
          className,
        )}
      />
    );
  }

  // SHEET — the full document-grade copy sheet (the session-canvas copy branch).
  if (variant === "sheet") {
    const body = copyText?.trim()
      ? copyText
      : "This copy is filed to your project. Ask your design agent in the chat to draft or revise it.";
    return <CopySheet title={title} body={body} className={className} />;
  }

  // REAL thumbnail — page/document captured thumb, or an image artifact's Storage URL.
  if (thumbnailUrl && !failed) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none",
          className,
        )}
      />
    );
  }

  // COPY snippet — a real scaled render of the actual words.
  if (kind === "copy" && copyText?.trim()) {
    return <CopySnippet body={copyText} className={className} />;
  }

  // BRANDED field — the honest zero/unsupported fallback (form / funnel / empty / pre-capture).
  return <BrandedField seed={seed} kind={kind} compact={compact} className={className} />;
}

export default ArtifactPreview;
