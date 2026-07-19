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
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronRight,
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

// ── Structural-preview shapes (§13 real data, §12/§18 one home) ─────────────────────────
// Deliberately MINIMAL, primitive-local types — ui/page must not depend on admin/studio or the
// evolving growth schema, so callers project their real form/funnel data down to these. What the
// mini/filmstrip render (labels, step titles, statuses) is always the tenant's REAL data; the
// control/step SHAPES are structural chrome, never invented field values.

/** One real form field, projected for the structural mini. `label` is the tenant's real question. */
export interface FormFieldPreview {
  label: string;
  /** The GrowthFieldType (text|email|select|radio|checkbox|textarea|…) — drives the control shape. */
  type: string;
  required?: boolean;
  /** Real option count for select/radio/checkbox — drives how many option chips the mini draws. */
  optionCount?: number;
}

/** One real form section/step, projected for the structural mini. */
export interface FormSectionPreview {
  title?: string;
  fields: FormFieldPreview[];
}

// NOTE (§18): a funnel's structural render (landing→form→thank-you) lives in ONE home — the studio
// FunnelFlow renderer (admin/studio/modes/FunnelFlow), which the session canvas uses directly. This
// primitive never structurally renders a funnel (ui/page must not depend on the growth/studio layer);
// on a `funnel` kind it resolves to the honest branded fallback (gallery cards / rail).

export interface ArtifactPreviewProps {
  /** The artifact kind — drives the fallback glyph and which real-preview path is taken. */
  kind?: ArtifactPreviewKind | null;
  /** A captured page/document thumbnail OR an image artifact's real Storage URL. When present and
   *  it loads, it renders as the real scaled cover; a 404/tombstone falls back to the branded field. */
  thumbnailUrl?: string | null;
  /** The artifact's REAL words (copy). Rendered as a real text render — a scaled snippet in the
   *  default `preview` variant, a full document-grade sheet in `sheet`. Never fabricated (§13). */
  copyText?: string | null;
  /** Copy sheet title, form sheet title, funnel name (used by `variant="sheet"`). */
  title?: string | null;
  /** The form's REAL sections/fields, projected to the primitive-local shape. When present on a
   *  `form` kind, renders the structural field-row mini (`preview`) or a document-grade form sheet
   *  (`sheet`). Absent → the honest branded/EmptyState fallback (§13 — never a fabricated form). */
  formSections?: FormSectionPreview[] | null;
  /** The form's real submit label (shown as the mini's neutral submit chip). */
  formSubmitLabel?: string | null;
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

// ── FORM — a real structural mini of the tenant's actual questions (§22 layered depth) ──────
// A read-only, non-interactive skeleton of the REAL form: each row shows the real field label +
// a token-styled control shape sized to the field type. Static (no motion needed); token-only;
// no gold (a preview is not an act, §11). `dense` shrinks it for a card/rail mini.

/** The token-styled placeholder control for one field — a bar (input), a taller bar (textarea),
 *  a bar-with-chevron (select), or option chips (radio/checkbox). Never shows fake VALUES — it is
 *  visibly a blank control, so the mini reads as "this is the form" not "here are answers". */
function FieldControl({ field, dense }: { field: FormFieldPreview; dense: boolean }) {
  const t = field.type;
  const barBase = "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)]";
  const isBoolCheck = t === "checkbox" && !(field.optionCount && field.optionCount > 0);
  const hasChips = (t === "radio" || t === "checkbox") && !!field.optionCount && field.optionCount > 0;

  if (isBoolCheck) {
    return (
      <div className="flex items-center gap-2">
        <span className={cn("shrink-0 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)]", dense ? "h-3 w-3" : "h-4 w-4")} />
        <span className={cn("flex-1 rounded bg-[hsl(var(--muted)/0.35)]", dense ? "h-2" : "h-2.5")} />
      </div>
    );
  }
  if (hasChips) {
    const n = Math.min(field.optionCount ?? 0, dense ? 3 : 4);
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: n }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]",
              dense ? "h-3 w-9" : "h-5 w-16",
            )}
          />
        ))}
      </div>
    );
  }
  if (t === "textarea" || t === "use_of_funds") {
    return <div className={cn(barBase, "w-full", dense ? "h-6" : "h-12")} />;
  }
  if (t === "select") {
    return (
      <div className={cn(barBase, "flex w-full items-center justify-end px-2", dense ? "h-4" : "h-8")}>
        <ChevronRight aria-hidden className={cn("rotate-90 text-muted-foreground/60", dense ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />
      </div>
    );
  }
  return <div className={cn(barBase, "w-full", dense ? "h-4" : "h-8")} />;
}

/** The structural field-row stack — the real labels, real step chrome, blank token controls. */
function FormStructure({
  sections,
  submitLabel,
  dense,
}: {
  sections: FormSectionPreview[];
  submitLabel?: string | null;
  dense: boolean;
}) {
  const multi = sections.length > 1;
  // Mini (dense) shows the FIRST step and a capped field list; the sheet shows every step/field.
  const shown = dense ? sections.slice(0, 1) : sections;
  return (
    <div className={cn("flex flex-col", dense ? "gap-2.5" : "gap-6")}>
      {multi && (
        // Real multi-step chrome (mirrors the public renderer, §13) — Step 1 of N + a token bar.
        <div className={cn("flex flex-col", dense ? "gap-1" : "gap-1.5")}>
          <div className={cn("flex items-center justify-between font-medium text-muted-foreground", dense ? "text-[7px]" : "text-[11px]")}>
            <span>Step 1 of {sections.length}</span>
            <span>{Math.round((1 / sections.length) * 100)}%</span>
          </div>
          <div className={cn("overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]", dense ? "h-0.5" : "h-1.5")}>
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round((1 / sections.length) * 100)}%` }} />
          </div>
        </div>
      )}
      {shown.map((section, si) => {
        const fields = dense ? section.fields.slice(0, 5) : section.fields;
        return (
          <div key={si} className={cn("flex flex-col", dense ? "gap-2" : "gap-4")}>
            {section.title?.trim() && (
              <h4 className={cn("font-semibold tracking-[-0.01em] text-foreground", dense ? "text-[9px] leading-tight" : "text-sm md:text-base")}>
                {section.title}
              </h4>
            )}
            <div className={cn("grid gap-x-4", dense ? "gap-y-2" : "gap-y-4 sm:grid-cols-2")}>
              {fields.map((field, fi) => {
                const wide =
                  field.type === "textarea" ||
                  field.type === "checkbox" ||
                  field.type === "use_of_funds" ||
                  field.label.toLowerCase().includes("address");
                return (
                  <div key={fi} className={cn("flex flex-col", dense ? "gap-1" : "gap-1.5", !dense && wide && "sm:col-span-2")}>
                    <span className={cn("truncate font-medium text-foreground/80", dense ? "text-[8px] leading-tight" : "text-xs md:text-[13px]")}>
                      {field.label}
                      {field.required && <span className="text-muted-foreground/70"> *</span>}
                    </span>
                    <FieldControl field={field} dense={dense} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* Neutral submit chip — indigo/primary-subtle, NOT gold (a preview isn't the act, §11). */}
      <div className={dense ? "pt-0.5" : "pt-1"}>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md bg-[hsl(var(--primary)/0.12)] font-medium text-[hsl(var(--primary))]",
            dense ? "px-2 py-1 text-[7px]" : "px-4 py-2 text-xs md:text-sm",
          )}
        >
          {submitLabel?.trim() || "Submit"}
        </span>
      </div>
    </div>
  );
}

/** The compact form mini — the honest structural preview for a card/rail cover. */
function FormMini({ sections, submitLabel, className }: { sections: FormSectionPreview[]; submitLabel?: string | null; className?: string }) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-[hsl(var(--card))] px-3 py-2.5", className)}>
      <FormStructure sections={sections} submitLabel={submitLabel} dense />
      {/* Bottom fade so a clamped field list dissolves rather than hard-cutting a row. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-5"
        style={{ background: "linear-gradient(to top, hsl(var(--card)), transparent)" }}
      />
    </div>
  );
}

/** The full document-grade form sheet — the promoted session-canvas form branch. */
function FormSheet({
  title,
  sections,
  submitLabel,
  className,
}: {
  title?: string | null;
  sections: FormSectionPreview[] | null;
  submitLabel?: string | null;
  className?: string;
}) {
  return (
    <article className={cn(SHEET_CLS, "flex max-h-full w-full flex-col overflow-hidden", className)}>
      <header className="border-b border-[hsl(var(--border))] px-6 py-4 md:px-8 md:py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Form</p>
        {title?.trim() && (
          <h3 className="mt-1 truncate font-display text-base font-semibold tracking-[-0.01em] text-foreground md:text-lg">
            {title}
          </h3>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-7">
        {sections?.length ? (
          <div className="mx-auto max-w-[52ch]">
            <FormStructure sections={sections} submitLabel={submitLabel} dense={false} />
          </div>
        ) : (
          // Honest fallback (§13) — the form is filed but its schema wasn't hydratable.
          <p className="mx-auto max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            This form is filed to your project and live for intake. Ask your design agent in the chat
            to change any question and it updates here.
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * The progressive "artifact forming" skeleton (Slice C) — a token-only wireframe scaffold shown
 * beside the streamed build beats while an artifact is being made. It reads as the artifact TAKING
 * SHAPE, not a dead shimmer block.
 *
 * HONESTY (§13/§22): the shape is only ever as specific as what is actually known. A KNOWN `kind`
 * draws that kind's coarse structure (page → chrome + hero + blocks; document/copy → text lines;
 * image → a framed plate; form → label/field rows; funnel → staged panels). An UNKNOWN kind (the
 * first build, before anything is classified) draws the NEUTRAL surface — a header + canvas region +
 * lines — never a specific wrong shape guessed ahead of the real classification.
 *
 * MOTION (§11/§22): bars reveal with a staggered gp-fade-rise (the shipped keyframe + --gp-stagger),
 * so the scaffold assembles top-to-bottom. Under `reduce` no reveal class is applied → the full
 * scaffold shows static (its resting state is fully visible), so a reduced-motion user still sees the
 * forming shape without animation. Token-only; no gold (a wait, not an act).
 */
function ArtifactFormingSkeleton({
  kind,
  reduce,
  className,
}: {
  kind: ArtifactPreviewKind | null;
  reduce: boolean;
  className?: string;
}) {
  // One wireframe bar/block. `i` sets its reveal order (staggered gp-fade-rise); resting state is
  // fully visible so reduce (no reveal class) shows it static.
  const bar = (i: number, cls: string, style?: CSSProperties): ReactNode => (
    <div
      key={`${i}:${cls}`}
      className={cn("rounded-md bg-[hsl(var(--studio-chrome-border)/0.42)]", !reduce && "gp-fade-rise", cls)}
      style={{ ["--gp-stagger" as string]: `${i * 85}ms`, ...style }}
    />
  );

  let body: ReactNode;
  switch (kind) {
    case "page":
      body = (
        <>
          <div className="flex items-center gap-1.5">
            {bar(0, "h-2.5 w-2.5 rounded-full")}
            {bar(0, "h-2.5 w-2.5 rounded-full")}
            {bar(0, "h-2.5 w-2.5 rounded-full")}
            {bar(1, "ml-2 h-3 flex-1 rounded-full")}
          </div>
          {bar(2, "min-h-[30%] w-full flex-[2]")}
          <div className="grid grid-cols-3 gap-2.5">
            {bar(3, "h-14")}
            {bar(4, "h-14")}
            {bar(5, "h-14")}
          </div>
          {bar(6, "h-3 w-2/3")}
          {bar(7, "h-3 w-1/2")}
        </>
      );
      break;
    case "document":
    case "copy":
      body = (
        <>
          {bar(0, "h-5 w-2/3")}
          {bar(1, "h-3 w-full")}
          {bar(2, "h-3 w-[92%]")}
          {bar(3, "h-3 w-full")}
          {bar(4, "h-3 w-[85%]")}
          {bar(5, "mt-2 h-3 w-full")}
          {bar(6, "h-3 w-[78%]")}
          {bar(7, "h-3 w-[88%]")}
        </>
      );
      break;
    case "image":
      body = (
        <div className="grid flex-1 place-items-center">
          {bar(1, "aspect-square w-3/4 max-w-[70%] rounded-xl")}
        </div>
      );
      break;
    case "form":
      body = (
        <>
          {bar(0, "h-4 w-1/2")}
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="space-y-1.5">
              {bar(1 + n, "h-2.5 w-1/3")}
              {bar(1 + n, "h-8 w-full")}
            </div>
          ))}
          {bar(6, "mt-1 h-8 w-1/3 rounded-full")}
        </>
      );
      break;
    case "funnel":
      body = (
        <div className="flex flex-1 items-center gap-2.5">
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex flex-1 items-center gap-2.5">
              <div className="flex flex-1 flex-col gap-2 rounded-lg border border-[hsl(var(--studio-chrome-border)/0.35)] p-2.5">
                {bar(1 + n * 2, "h-10 w-full")}
                {bar(2 + n * 2, "h-2.5 w-2/3")}
                {bar(2 + n * 2, "h-2.5 w-1/2")}
              </div>
              {n < 2 && bar(2 + n * 2, "h-0.5 w-4 shrink-0 self-center")}
            </div>
          ))}
        </div>
      );
      break;
    default:
      // NEUTRAL — kind not yet known (a first build, before classification). Rather than a
      // page-shaped header+block (which would fake a specific shape), this reads as an artifact
      // COALESCING: a soft elevated plate settling in with the PaigeMark forming at its heart, and
      // a couple of settling lines beneath. Deliberately un-committal (§13) — it commits to no kind,
      // it just says "Paige is bringing something into being." Token-only; the reveal rides the same
      // staggered gp-fade-rise as the bars, so under `reduce` it rests fully assembled and static.
      body = (
        <div className="grid flex-1 place-items-center gap-3">
          <div
            className={cn(
              "grid aspect-[5/4] w-2/3 max-w-[66%] place-items-center rounded-2xl border border-[hsl(var(--studio-chrome-border)/0.4)] bg-[hsl(var(--studio-chrome-border)/0.16)]",
              !reduce && "gp-fade-rise",
            )}
            style={{ ["--gp-stagger" as string]: "0ms" }}
          >
            <PaigeMark className="h-11 w-11 opacity-45" />
          </div>
          <div className="flex w-2/3 max-w-[66%] flex-col items-center gap-2">
            {bar(2, "h-2.5 w-3/4 rounded-full")}
            {bar(3, "h-2.5 w-1/2 rounded-full")}
          </div>
        </div>
      );
      break;
  }

  return (
    <div aria-hidden className={cn("flex h-full w-full flex-col gap-2.5 p-5", className)}>
      {body}
    </div>
  );
}

export function ArtifactPreview({
  kind = null,
  thumbnailUrl = null,
  copyText = null,
  title = null,
  formSections = null,
  formSubmitLabel = null,
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

  // SKELETON — the progressive "artifact forming" scaffold the build cutscene shows BESIDE the
  // streamed beats (Slice C, §22 "a progressive skeleton of the artifact-to-be"). HONEST (§13): a
  // KNOWN kind draws that kind's coarse wireframe; an unknown kind (a first build, nothing classified
  // yet) draws a NEUTRAL forming surface — never a specific wrong shape. Motion-safe: bars stagger in
  // via the shipped gp-fade-rise; under reduce the whole scaffold rests static (no stagger).
  if (skeleton) {
    return <ArtifactFormingSkeleton kind={kind} reduce={reduce} className={className} />;
  }

  // SHEET — the full document-grade canvas render, per kind (§21 one session, every type).
  if (variant === "sheet") {
    if (kind === "form") {
      return <FormSheet title={title} sections={formSections} submitLabel={formSubmitLabel} className={className} />;
    }
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

  // FORM mini — a real structural render of the actual questions (when the schema is loaded).
  if (kind === "form" && formSections?.length) {
    return <FormMini sections={formSections} submitLabel={formSubmitLabel} className={className} />;
  }

  // BRANDED field — the honest zero/unsupported fallback (form/funnel with no loaded data, empty,
  // pre-capture). Never a fabricated preview (§13).
  return <BrandedField seed={seed} kind={kind} compact={compact} className={className} />;
}

export default ArtifactPreview;
