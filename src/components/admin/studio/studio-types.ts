// The Vibe Studio's shared state contract.
//
// Every studio component and the generation hook key off these types, so the shape of a run,
// an error, and the page under construction is defined in exactly ONE place. Types + two
// frozen-by-convention constants only — no React, no IO, no copy (copy lives in
// studio-copy.ts so the §2/§3 audit has a single surface to read).
import type { GrowthAsset, GrowthBlock, GrowthFormSchema, GrowthPageTheme } from "@/lib/growth";

/**
 * The Studio's five outputs — one workspace, five creation modes. `page` is the
 * original Vibe Studio; `copy` and `image` are the absorbed Content Studio;
 * `funnel` and `form` are the structured builders. The tab param carries this
 * (/admin/studio?mode=…) so every mode is deep-linkable.
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

/** compose = blank brief · clarifying = grounding the brief before a model call is spent ·
 *  generating = a run is in flight · canvas = blocks on the board.
 *  (Page-mode only — the other modes hold their own local state.) */
export type PageCanvasMode = "compose" | "clarifying" | "generating" | "canvas";

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

/** One pre-generation grounding question (§15) — a fixed `id` so an answer keyed against it
 *  survives being folded into the brief (or, for the questionnaire-fields question, sent on
 *  its own as `questionnaire_answer`). */
export interface ClarifyingQuestion {
  id: string;
  question: string;
  placeholder?: string;
}

/** The clarifying step's own state: which questions are on screen (3, or 4 when the brief
 *  signaled a real questionnaire) and what the operator has typed for each so far. */
export interface ClarifyingState {
  questions: ClarifyingQuestion[];
  answers: Record<string, string>;
}

export const EMPTY_CLARIFYING: ClarifyingState = { questions: [], answers: {} };

// ═══════════════════════════════════════════════════════════════════════════════════════
// Sessions — the projects HOME layer (Slice 2).
//
// A studio SESSION is one authoring project (studio_sessions). It wraps today's single-primary
// artifact flow and is multi-artifact in the DATA model (the artifact_refs manifest). These
// types are the shared contract between the callable seam (studio.ts), the gallery hook, and
// the builder — defined here so the shape lives in exactly ONE place, like every other studio
// type. §2/§9: nothing here is vertical or finance-specific; it is generic authoring state.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** The five artifact TYPES a session can author — the studio's own modes. */
export type StudioArtifactType = "page" | "form" | "funnel" | "copy" | "image";

/** The kind as PERSISTED in the manifest / accepted by link_session_artifact. copy and image
 *  both persist as 'content' (marketing_content); page/form/funnel pass through. */
export type SessionArtifactKind = "page" | "form" | "funnel" | "content";

/** The session lifecycle, distinct from any one artifact's status. */
export type StudioSessionStatus = "draft" | "building" | "published" | "archived";

/** Which gallery view the HOME is showing — a filter over ONE grid, never a route (§18). */
export type StudioSessionView = "recent" | "mine" | "starred" | "templates";

/** One typed reference INTO a growth_ / marketing_content row a session authored — never the
 *  artifact's content, just enough to render a chip/glyph and re-open it. A ref whose target
 *  was deleted is a tombstone the UI tolerates (no broken image, no throw). */
export interface SessionArtifactRef {
  kind: SessionArtifactKind;
  id: string;
  title: string;
  slug: string | null;
  thumbnailUrl: string | null;
  addedAt: string | null;
}

/** The full session row, camelCased — the builder's resume payload. */
export interface StudioSessionMeta {
  id: string;
  tenantId: string;
  ownerUserId: string | null;
  title: string;
  seedBrief: string | null;
  status: StudioSessionStatus;
  starred: boolean;
  thumbnailUrl: string | null;
  isTemplate: boolean;
  transcript: unknown[];
  artifacts: SessionArtifactRef[];
  lastOpenedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** The gallery card projection — exactly what a ProjectCard renders. */
export interface StudioSessionCard {
  id: string;
  title: string;
  seedBrief: string | null;
  starred: boolean;
  status: StudioSessionStatus;
  isTemplate: boolean;
  thumbnailUrl: string | null;
  /** The primary artifact's studio type (drives the cover glyph); null for an empty session. */
  primaryKind: StudioArtifactType | null;
  /** Distinct studio types wired into the session — the multi-artifact glyph row (§19). */
  artifactKinds: StudioArtifactType[];
  lastEditedAt: string;
}

/** The state StudioShell owns. Nothing else holds studio state. */
export interface StudioState {
  // — scope —
  tenantId: string | null;
  tenantSlug: string | null;
  /** null until the draft is first saved (the upsert seam returns it). */
  pageId: string | null;

  // — session (Slice 2) — the owning authoring project. `pageId` above is now a
  //   specialization of the active PAGE artifact (activeArtifactId === pageId for a page);
  //   `sessionId` is null only on the legacy ?pageId path that carries no session.
  sessionId: string | null;
  artifacts: SessionArtifactRef[];
  activeArtifactId: string | null;
  activeArtifactType: StudioArtifactType | null;

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
  /** Derived ONLY when the clarifying step collected a questionnaire_answer and the model's
   *  proposal survived the server's cleanup with at least one field. Null = growth_page_upsert
   *  falls back to its generic 3-field synthesis for this page's embedded_form. */
  formSchema: GrowthFormSchema | null;

  // — the composer —
  /** Up to 3 reference/deliverable files uploaded for the CURRENT brief (§10/§13) — real
   *  Storage URLs, threaded to growth-page-draft as real multimodal content on generate. */
  attachments: GrowthAsset[];
  /** A real, already-uploaded attachment URL Paige flagged as this brief's likely deliverable
   *  (from the last generate's suggestedDelivery). Purely a proposal (§15) surfaced in
   *  DeliveryEditor — never written to a form until the operator explicitly saves. */
  suggestedDeliveryAssetUrl: string | null;
  /** The whole-page brief. PRESERVED across section-mode retargeting. */
  brief: string;
  /** The in-flight section instruction (section mode only). */
  instruction: string;
  mode: PageCanvasMode;
  /** Populated only while mode === "clarifying" (or once it has been, until the next brief). */
  clarifying: ClarifyingState;
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
