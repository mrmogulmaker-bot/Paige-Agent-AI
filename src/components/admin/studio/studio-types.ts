// The Vibe Studio's shared state contract.
//
// Every studio component and the generation hook key off these types, so the shape of a run,
// an error, and the page under construction is defined in exactly ONE place. Types + two
// frozen-by-convention constants only — no React, no IO, no copy (copy lives in
// studio-copy.ts so the §2/§3 audit has a single surface to read).
import type { GrowthBlock, GrowthPageTheme } from "@/lib/growth";

/**
 * The Studio's five outputs — one workspace, five creation modes. `page` is the
 * original Vibe Studio; `copy` and `image` are the absorbed Content Studio;
 * `funnel` and `form` are the structured builders. The tab param carries this
 * (?tab=studio&mode=…) so every mode is deep-linkable.
 */
export type StudioMode = "page" | "funnel" | "form" | "copy" | "image";

export const STUDIO_MODES: readonly StudioMode[] = ["page", "funnel", "form", "copy", "image"];

export function isStudioMode(value: unknown): value is StudioMode {
  return typeof value === "string" && (STUDIO_MODES as readonly string[]).includes(value);
}

/** One toolbar action a mode publishes into the Studio top bar (Save / the gold act). */
export interface StudioBarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

/** What a mounted mode contributes to the top bar. `act` is the ONE gold button. */
export interface ModeToolbarState {
  save?: StudioBarAction;
  act?: StudioBarAction;
}

/** compose = blank brief · generating = a run is in flight · canvas = blocks on the board.
 *  (Page-mode only — the other modes hold their own local state.) */
export type PageCanvasMode = "compose" | "generating" | "canvas";

export type DeviceFrame = "desktop" | "mobile";

/** The five running phases each name real work the seam genuinely performs — never a
 *  decorative step invented to fill a progress bar (§13). */
export type GenerationPhase =
  | "idle"
  | "brief"
  | "brand"
  | "drafting"
  | "validating"
  | "composing"
  | "done"
  | "error";

export type StudioErrorCode =
  | "NO_TENANT"
  | "NO_TENANT_SLUG"
  | "EMPTY_BRIEF"
  | "GENERATION_FAILED"
  | "GENERATION_CANCELLED"
  | "INVALID_BLOCKS"
  | "NO_DRAFT"
  | "UNRESOLVED_PLACEHOLDER"
  | "FORM_MISSING"
  | "INVALID_SLUG"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SAVE_FAILED"
  | "PUBLISH_FAILED"
  | "EDIT_FAILED"
  | "UNKNOWN";

/**
 * The ONE error shape the Studio renders.
 *
 * `message` is operator copy — a sentence in the product's voice. A raw `GROWTH_*` code, a
 * table name, or a function name never reaches it (§11); STUDIO_ERROR_COPY is what maps
 * those away. The real, unedited cause is preserved on `cause` (and logged) so a defect is
 * still diagnosable — structured, never swallowed (§13).
 */
export interface StudioError {
  code: StudioErrorCode;
  /** Operator-facing sentence. Mogul voice. No codes, tables, or function names (§11). */
  message: string;
  /** True when the operator can fix it and retry; false = a hard stop. */
  recoverable: boolean;
  /** The original error, verbatim. For logs and tests — never rendered. */
  cause?: unknown;
}

export interface StudioSeoDraft {
  title?: string;
  description?: string;
}

/** A seed brief the operator can drop into the composer and edit. No hidden templates —
 *  what the chip drops in is exactly what Paige is asked (§15). */
export interface IntentChip {
  id: string;
  label: string;
  seed: string;
}

export interface GenerationState {
  phase: GenerationPhase;
  /** Epoch ms the run started; null when idle. */
  startedAt: number | null;
  /** Ticks every 250ms while running. The ONLY numeric progress we show — because it's true. */
  elapsedMs: number;
  /** Blocks materialized SO FAR. The canvas draws these through the REAL <GrowthBlocks>. */
  emitted: GrowthBlock[];
  /** Total block count. Known only once the draft payload lands. Never estimated. */
  total: number | null;
  /** Honest one-line narration for the current phase (§3). Never "Loading…". */
  note: string;
  error: StudioError | null;
}

export const EMPTY_GENERATION: GenerationState = {
  phase: "idle",
  startedAt: null,
  elapsedMs: 0,
  emitted: [],
  total: null,
  note: "",
  error: null,
};

/** The state StudioShell owns. Nothing else holds studio state. */
export interface StudioState {
  // — scope —
  tenantId: string | null;
  tenantSlug: string | null;
  /** null until the draft is first saved (the upsert seam returns it). */
  pageId: string | null;

  // — the page —
  title: string;
  slug: string;
  /** Whether the operator hand-edited the slug (stops the title→slug auto-derive). */
  slugTouched: boolean;
  status: "draft" | "published";
  /** Canonical DRAFT blocks. While mode === "generating" the canvas reads generation.emitted. */
  blocks: GrowthBlock[];
  theme: GrowthPageTheme | null;
  /** Resolved ONCE per tenant, by the SAME construction the published page uses. */
  brandFloor: GrowthPageTheme | null;
  seo: StudioSeoDraft | null;

  // — the composer —
  /** The whole-page brief. PRESERVED across section-mode retargeting. */
  brief: string;
  /** The in-flight section instruction (section mode only). */
  instruction: string;
  mode: PageCanvasMode;
  generation: GenerationState;

  // — the canvas —
  device: DeviceFrame;
  /** Block index under conversational edit; null = whole-page mode. */
  selectedIndex: number | null;

  // — io —
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  editing: boolean;
  publishOpen: boolean;
  publishedUrl: string | null;
  error: StudioError | null;
}
