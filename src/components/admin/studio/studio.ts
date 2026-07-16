// THE CALLABLE SEAM LAYER (§10).
//
// Every action the Vibe Studio can take lives here as a plain async function with explicit
// arguments: generate, save, publish, edit, load, preflight. No React, no hooks, no component
// state. The UI is ONE caller; Paige's headless tools are another; a test is a third. They all
// bottom out in the same edge functions and the same RPCs, so a page Paige builds from chat and
// a page an operator builds by clicking travel the identical path. There is no second
// implementation to drift.
//
// This is also the ONLY file under src/components/admin/studio/ that touches Supabase. The five
// components are pure presentation — that is what makes the seam real rather than aspirational.
//
// Three invariants are load-bearing, and each one is a silent catastrophe if broken:
//
//   1. loadBrandFloor() reproduces GrowthPageRenderer's brand-floor construction EXACTLY —
//      including the non-obvious line where `background` derives from primary_color. Get that
//      wrong and the canvas lies about what will publish, with no test to catch it.
//   2. publishPage() goes through growth_page_publish. A direct `update … set status='published'`
//      would skip every guard AND never copy draft → live, producing a live, public, BLANK page.
//   3. The publish path ALWAYS saves and THEN publishes. The save is what auto-authors the form
//      behind the signup section, which is what makes publish's lead-capture guard pass.
import { supabase } from "@/integrations/supabase/client";
import type { GrowthAsset, GrowthAssetKind, GrowthBlock, GrowthField, GrowthFormSchema, GrowthPageTheme, GrowthSuccessAction } from "@/lib/growth";
import { detectGrowthAssetKind, GROWTH_ASSET_MAX_BYTES } from "@/lib/growth";
import { GROWTH_BRAND_FLOOR, buildGrowthBrandFloor } from "@/components/growth/growth-theme";
import { CLARIFYING_QUESTIONS, STUDIO_ERROR_COPY } from "./studio-copy";
import type { StudioError, StudioErrorCode, StudioSeoDraft } from "./studio-types";

// StudioShell and useGeneratePage read the error map through the seam, so a caller only ever
// needs one import to drive an action and speak about its failure.
export { STUDIO_ERROR_COPY };

// ═══════════════════════════════════════════════════════════════════════════════════════
// Errors — structured, honest, and safe to show (§11/§13)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Codes that are a hard stop for the operator right here: nothing to retry, nothing to fix
 *  inside this surface. Everything else offers a way forward. */
const HARD_STOP: ReadonlySet<StudioErrorCode> = new Set<StudioErrorCode>([
  "NO_TENANT",
  "NO_TENANT_SLUG",
  "NOT_FOUND",
  "FORBIDDEN",
]);

export function studioError(
  code: StudioErrorCode,
  cause?: unknown,
  message?: string,
): StudioError {
  return {
    code,
    message: message || STUDIO_ERROR_COPY[code],
    recoverable: !HARD_STOP.has(code),
    cause,
  };
}

export function isStudioError(err: unknown): err is StudioError {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    "message" in err &&
    "recoverable" in err &&
    typeof (err as StudioError).message === "string"
  );
}

/** The server's own raise codes, mapped to operator-facing outcomes. Postgres delivers them as
 *  "GROWTH_NO_DRAFT: nothing to publish — save draft blocks first"; only the CODE survives the
 *  crossing, and the copy the operator reads is ours. */
const SEAM_CODES: Record<string, StudioErrorCode> = {
  GROWTH_FORBIDDEN: "FORBIDDEN",
  GROWTH_NO_TENANT: "NO_TENANT",
  GROWTH_NO_TENANT_SLUG: "NO_TENANT_SLUG",
  GROWTH_INVALID_SLUG: "INVALID_SLUG",
  GROWTH_INVALID_BLOCKS: "INVALID_BLOCKS",
  GROWTH_INVALID_OPS: "EDIT_FAILED",
  GROWTH_NOT_FOUND: "NOT_FOUND",
  GROWTH_NO_DRAFT: "NO_DRAFT",
  GROWTH_UNRESOLVED_PLACEHOLDER: "UNRESOLVED_PLACEHOLDER",
  GROWTH_FORM_MISSING: "FORM_MISSING",
  GROWTH_TENANT_MISMATCH: "NOT_FOUND",
};

function errText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/**
 * A message is only shown verbatim when it is genuinely operator-safe. The edge functions
 * write real, useful sentences ("Admin or coach access required.") and those beat any generic
 * we could invent — but a Postgres raise, a Rollup stack, or a driver string carries machinery
 * the operator must never read (§11). When in doubt, the mapped copy wins; the raw cause is
 * always preserved on the StudioError and logged.
 */
const JARGON =
  /GROWTH_[A-Z_]+|growth_[a-z_]+|supabase|postgrest|pgrst|jsonb|\bRPC\b|\bSQL\b|search_path|auth\.uid|null value|violates|constraint|relation "|function .*\(/i;

function operatorSafe(message: string): string | null {
  const m = message.trim();
  if (!m || m.length > 220 || JARGON.test(m)) return null;
  return m;
}

/** Turn anything a seam call can throw into the ONE error shape the Studio renders. */
export function toStudioError(err: unknown, fallback: StudioErrorCode): StudioError {
  if (isStudioError(err)) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return studioError("GENERATION_CANCELLED", err);
  }

  const raw = errText(err);
  const match = raw.match(/^\s*(GROWTH_[A-Z_]+)\s*:/);
  const code = match ? SEAM_CODES[match[1]] ?? fallback : fallback;

  // We keep the real cause — swallowing it would make a production defect undiagnosable (§13).
  if (raw) console.error(`[studio] ${code}:`, err);

  // Only a message the server wrote FOR a human is echoed; a server raise never is.
  const safe = match ? null : operatorSafe(raw);
  return studioError(code, err, safe ?? undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Plumbing
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Platform staff carry no active tenant (§9). Generating, saving, or publishing without one
 *  would write a tenant's page into an arbitrary workspace — so we refuse, loudly, first. */
function requireTenant(tenantId: string | null | undefined): string {
  if (!tenantId) throw studioError("NO_TENANT");
  return tenantId;
}

/**
 * The growth authoring RPCs are SECURITY DEFINER functions introduced after the last refresh
 * of the generated `Database` types, so they are not in `Database["public"]["Functions"]` yet.
 * One narrow, documented cast lives here rather than an `as any` scattered across five call
 * sites; every caller below stays fully typed against its own declared result.
 */
type UntypedRpc = (
  fn: string,
  params: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

async function rpc<T>(fn: string, params: Record<string, unknown>, fallback: StudioErrorCode): Promise<T> {
  const call = supabase.rpc as unknown as UntypedRpc;
  const { data, error } = await call(fn, params);
  if (error) throw toStudioError(error, fallback);
  return data as T;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** The edge functions require the caller's own bearer token — they role-gate on it, and the
 *  draft function refuses outright without one. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw studioError("FORBIDDEN", "no session", "Your session ended. Sign in again to keep building.");
  }
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    "Content-Type": "application/json",
  };
}

/** Both growth edge functions can answer with `{ error }` — and growth-page-draft does it at
 *  HTTP **200** on an internal failure. So the BODY is inspected before the status, always. A
 *  status-first read would paint a model outage onto the canvas as a successful, empty page. */
function readFnError(body: unknown): { code?: string; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const e = (body as { error?: unknown }).error;
  if (!e) return null;
  if (typeof e === "string") return { message: e };
  if (typeof e === "object") {
    const o = e as { code?: unknown; message?: unknown };
    return {
      code: typeof o.code === "string" ? o.code : undefined,
      message: typeof o.message === "string" ? o.message : "",
    };
  }
  return { message: "" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Theme — the canvas == published keystone
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Strip null / undefined / "" out of a theme, ONCE, before it is either previewed or saved.
 *
 * resolveGrowthTheme layers `{ ...FLOOR, ...brandFloor, ...theme }`. A JavaScript spread does
 * NOT skip nulls — so an explicit `font: null` in theme_json overwrites the tenant's brand font
 * with nothing. The generator emits `font: null` / `logo_url: null` for every tenant that hasn't
 * set them, which is most of them. Normalizing here, at the seam, means the object the operator
 * previews and the object we persist are the SAME object, and the page cannot change appearance
 * between the canvas and the publish.
 */
export function normalizeGrowthTheme(theme: GrowthPageTheme | null | undefined): GrowthPageTheme {
  const out: GrowthPageTheme = {};
  if (!theme || typeof theme !== "object") return out;
  for (const [key, value] of Object.entries(theme)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** The anon-safe brand row, exactly as rpc peek_tenant_portal_brand returns it. */
export interface PortalBrandRow {
  primary_color: string | null;
  accent_color: string | null;
  font: string | null;
  logo_url: string | null;
}

/**
 * THE brand floor — re-exported from the ONE definition in growth-theme.ts, which the published
 * page and the funnel step also use. Do not re-derive it here: the moment the Studio builds its
 * own floor, the canvas stops matching what publishes and nothing catches it.
 */
export { buildGrowthBrandFloor };

/**
 * Resolve the tenant's brand floor through the SAME RPC the published page uses —
 * peek_tenant_portal_brand(_slug), keyed by slug, granted to anon. NOT resolve_tenant_brand:
 * the two differ in their logo COALESCE, and a Studio that resolved the brand differently from
 * the renderer would be a preview of a page that doesn't exist.
 *
 * A brand miss is NOT a failure. The floor IS the fallback, and it is on-brand — so this never
 * rejects and never blocks the canvas.
 */
export async function loadBrandFloor(tenantSlug: string): Promise<GrowthPageTheme> {
  if (!tenantSlug) return buildGrowthBrandFloor(null);
  try {
    const call = supabase.rpc as unknown as UntypedRpc;
    const { data, error } = await call("peek_tenant_portal_brand", { _slug: tenantSlug });
    if (error) throw error;
    const row = Array.isArray(data)
      ? (data[0] as PortalBrandRow | undefined)
      : (data as PortalBrandRow | null);
    return buildGrowthBrandFloor(row ?? null);
  } catch (err) {
    console.error("[studio] brand floor fell through to the default:", err);
    return buildGrowthBrandFloor(null);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// The clarifying gate (§15) — probe before Paige builds, never guess a placeholder-riddled
// draft. Deterministic text heuristics only: word count + a signal regex, NOT an LLM job
// (§7) — this never touches JobKind or the model router at all.
// ═══════════════════════════════════════════════════════════════════════════════════════

const THIN_BRIEF_WORDS = 30;

/** Loose signal that the operator wants a REAL questionnaire, not the generic name/email
 *  default — matched as prose, since a brief is a sentence, not a keyword field. */
export const FORM_SIGNAL_RE = /\b(questionnaire|survey|intake form|application (?:form|process)|qualify|screen(?:ing)?)\b/i;

export interface ClarifyDecision {
  needed: boolean;
  /** Whether the brief itself asked for a real questionnaire — gates the 4th question. */
  formSignal: boolean;
}

/** Whole-page briefs only — a section instruction never gates. */
export function shouldClarify(brief: string): ClarifyDecision {
  const trimmed = (brief ?? "").trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const formSignal = FORM_SIGNAL_RE.test(trimmed);
  return { needed: wordCount < THIN_BRIEF_WORDS || formSignal, formSignal };
}

/**
 * Fold the offer/audience/action answers into the brief as prose. The questionnaire-fields
 * answer is deliberately NOT folded in here — it travels separately as `questionnaireAnswer`
 * so the model reads it once, in its own turn (§4).
 *
 * An empty `answers` map — the gate was skipped, or a fresh page has never populated it —
 * returns `brief` UNCHANGED: the exact string `generate({ brief })` received before this
 * feature existed. Zero behavior change on the happy path for an already-good brief.
 */
const CLARIFYING_FOLD_LABEL: Record<string, string> = {
  offer: "Offer & result",
  audience: "Audience",
  action: "Action",
};

export function composeBrief(brief: string, answers: Record<string, string>): string {
  const extra = CLARIFYING_QUESTIONS.map((q) => {
    const answer = (answers[q.id] ?? "").trim();
    if (!answer) return "";
    const label = CLARIFYING_FOLD_LABEL[q.id];
    return label ? `${label}: ${answer}` : answer;
  }).filter(Boolean);
  return extra.length > 0 ? `${brief.trim()}\n\n${extra.join("\n")}` : brief;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Reference & lead-magnet attachments — Storage upload seam (§10/§13).
//
// This stays the ONLY file under src/components/admin/studio/ that touches Supabase (see
// header) — so the upload itself lives here rather than in a bespoke hook, even though it is
// conceptually closer to useBrandKit's uploadAsset than to the rest of the seam layer above.
// Real, permanent public URLs — never ephemeral — because a download_url built from one has to
// keep working long after the Studio tab that generated it is closed (§13).
// ═══════════════════════════════════════════════════════════════════════════════════════

const GROWTH_ASSETS_BUCKET = "growth-assets";

/** Upload one reference/deliverable file to the tenant-scoped, public-read growth-assets
 *  bucket and return its REAL public URL. Path convention matches every other tenant-scoped
 *  bucket in this codebase: <tenant_id>/<uuid>-<filename>. */
export async function uploadGrowthAsset(tenantId: string, file: File): Promise<GrowthAsset> {
  const tid = requireTenant(tenantId);
  const kind: GrowthAssetKind | null = detectGrowthAssetKind(file.type, file.name);
  if (!kind) {
    throw studioError("SAVE_FAILED", null, "Paige can attach JPG, PNG, WEBP, and PDF files.");
  }
  if (file.size > GROWTH_ASSET_MAX_BYTES[kind]) {
    const capMb = GROWTH_ASSET_MAX_BYTES[kind] / (1024 * 1024);
    throw studioError(
      "SAVE_FAILED",
      null,
      `That file is too large — the limit is ${capMb}MB for ${kind === "image" ? "images" : "PDFs"}.`,
    );
  }
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(0, 120);
  const path = `${tid}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from(GROWTH_ASSETS_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: "3600", contentType: file.type || undefined });
  if (error) throw toStudioError(error, "SAVE_FAILED");
  const { data } = supabase.storage.from(GROWTH_ASSETS_BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    path,
    name: file.name,
    mimeType: file.type || (kind === "document" ? "application/pdf" : "image/png"),
    size: file.size,
    kind,
  };
}

/** List everything this tenant has ever uploaded to growth-assets — the picker for the
 *  post-submit delivery editor (§10/§15: pick a REAL uploaded asset, never type a URL). */
export async function listGrowthAssets(tenantId: string): Promise<GrowthAsset[]> {
  const tid = requireTenant(tenantId);
  const { data, error } = await supabase.storage
    .from(GROWTH_ASSETS_BUCKET)
    .list(tid, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw toStudioError(error, "SAVE_FAILED");
  return (data ?? [])
    .filter((f) => !!f.name && f.id) // Storage lists placeholder "folder" rows with id=null
    .map((f) => {
      const path = `${tid}/${f.name}`;
      const { data: pub } = supabase.storage.from(GROWTH_ASSETS_BUCKET).getPublicUrl(path);
      const mimeType = (f.metadata as { mimetype?: string } | null)?.mimetype || "";
      const kind = detectGrowthAssetKind(mimeType, f.name) ?? "document";
      return {
        url: pub.publicUrl,
        path,
        name: f.name.replace(/^[0-9a-f-]{36}-/, ""), // strip the <uuid>- prefix for display
        mimeType,
        size: (f.metadata as { size?: number } | null)?.size ?? 0,
        kind,
      } satisfies GrowthAsset;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Generate — supabase/functions/growth-page-draft
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface DraftPageInput {
  tenantId: string;
  brief: string;
  tone?: string;
  /** The operator's own free-text answer to "what should the questionnaire ask" (§15),
   *  collected by the clarifying step. Sent through untouched — the server derives a real
   *  form_schema_json from it in the SAME model call, no new spend (§7). */
  questionnaireAnswer?: string;
  /** Up to 3 REAL uploaded reference/deliverable files (§13). Sent as public Storage URLs —
   *  never raw base64 — growth-page-draft fetches and base64-encodes them server-side. */
  attachments?: { url: string; mediaType: string; kind: GrowthAssetKind }[];
  signal?: AbortSignal;
  /** Fires as blocks materialize. TODAY: once, with the full validated array — the function
   *  returns a single JSON payload, there is no token stream. If it ever streams, this fires
   *  per block and the UI above changes by ZERO lines. */
  onBlocks?: (blocks: GrowthBlock[]) => void;
  /** Honest phase pings. Each one names real work performed at the moment it fires. */
  onPhase?: (phase: "brief" | "brand" | "drafting" | "validating", note: string) => void;
}

export interface DraftPageResult {
  blocks: GrowthBlock[];
  theme: GrowthPageTheme;
  seo: StudioSeoDraft;
  /** Present ONLY when questionnaireAnswer was supplied and the model's proposal survived
   *  the server's cleanFormSchema() with at least one field. Absent => the save path falls
   *  back to growth_page_upsert's generic 3-field synthesis, unchanged from today. */
  formSchema?: GrowthFormSchema;
  /** Present ONLY when the model judged one SUPPLIED attachment is the brief's promised
   *  deliverable. `assetIndex` always indexes into the SAME `attachments` array this call was
   *  given (validated against it below) — never a fabricated reference (§13/§15). The caller
   *  decides whether/how to write it into a form's success_action_json.download_url; this
   *  function only ever surfaces the suggestion. */
  suggestedDelivery?: { assetIndex: number };
}

interface DraftPageBody {
  blocks?: unknown;
  theme_json?: GrowthPageTheme | null;
  seo_json?: { title?: unknown; description?: unknown } | null;
  form_schema_json?: unknown;
  suggested_delivery?: { type?: unknown; asset_index?: unknown } | null;
}

function isBlockArray(value: unknown): value is GrowthBlock[] {
  return (
    Array.isArray(value) &&
    value.every(
      (b) => !!b && typeof b === "object" && typeof (b as { type?: unknown }).type === "string",
    )
  );
}

/** Shallow shape-check only — same discipline as isBlockArray. The server's cleanFormSchema()
 *  is what guarantees the deep shape; this just refuses to trust something that isn't even a
 *  sections/fields tree before handing it to the canvas or the save seam. */
function isFormSchemaShape(value: unknown): value is GrowthFormSchema {
  if (!value || typeof value !== "object") return false;
  const sections = (value as { sections?: unknown }).sections;
  return (
    Array.isArray(sections) &&
    sections.length > 0 &&
    sections.every((s) => !!s && typeof s === "object" && Array.isArray((s as { fields?: unknown }).fields))
  );
}

/**
 * Draft a whole page from one brief.
 *
 * THE TRAP: growth-page-draft's catch block answers **HTTP 200 with `{ error }`** (index.ts:
 * the final catch). `res.ok` is TRUE on a model outage, on unparseable JSON, on a failed brand
 * read. So the body is checked for `error` BEFORE the status is ever consulted — otherwise a
 * dead model paints an empty canvas and reports success, which is the exact class of lie §13
 * exists to forbid.
 */
export async function draftPage(input: DraftPageInput): Promise<DraftPageResult> {
  const tenantId = requireTenant(input.tenantId);
  const { signal, onBlocks, onPhase } = input;

  // 1. brief — validate what we were given before spending a model call.
  onPhase?.("brief", "");
  const brief = (input.brief ?? "").trim();
  if (brief.length < 5) throw studioError("EMPTY_BRIEF");

  // 2. brand — resolve the caller's session and attach the tenant scope, which is what makes
  //    the server seed theme_json from this tenant's real brand cascade instead of a generic
  //    floor. Real work, in true order — not a decorative step.
  onPhase?.("brand", "");
  const headers = await authHeaders();

  // 3. drafting — the model call. The long, genuinely indeterminate wait.
  onPhase?.("drafting", "");
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/growth-page-draft`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        brief,
        tone: input.tone,
        tenant_id: tenantId,
        questionnaire_answer: input.questionnaireAnswer,
        attachments: input.attachments
          ?.slice(0, 3)
          .map((a) => ({ url: a.url, media_type: a.mediaType, kind: a.kind })),
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw studioError("GENERATION_CANCELLED", err);
    throw toStudioError(err, "GENERATION_FAILED");
  }

  let body: DraftPageBody;
  try {
    body = (await res.json()) as DraftPageBody;
  } catch (err) {
    if (signal?.aborted) throw studioError("GENERATION_CANCELLED", err);
    throw studioError("GENERATION_FAILED", err);
  }

  // 4. validating — body FIRST (the 200-with-error trap), then the status, then the payload.
  onPhase?.("validating", "");

  const fnError = readFnError(body);
  if (fnError) {
    const code: StudioErrorCode =
      res.status === 403 || res.status === 401
        ? "FORBIDDEN"
        : res.status === 400
          ? "EMPTY_BRIEF"
          : "GENERATION_FAILED";
    console.error("[studio] growth-page-draft failed:", res.status, fnError.message);
    throw studioError(code, fnError, operatorSafe(fnError.message) ?? undefined);
  }
  if (!res.ok) throw studioError("GENERATION_FAILED", `HTTP ${res.status}`);

  if (!isBlockArray(body.blocks) || body.blocks.length === 0) {
    throw studioError("GENERATION_FAILED", body);
  }

  const blocks = body.blocks;
  const seoRaw = body.seo_json ?? {};
  const seo: StudioSeoDraft = {};
  if (typeof seoRaw.title === "string" && seoRaw.title.trim()) seo.title = seoRaw.title.trim();
  if (typeof seoRaw.description === "string" && seoRaw.description.trim()) {
    seo.description = seoRaw.description.trim();
  }

  // The theme is normalized exactly ONCE, here — so the object the canvas previews is the
  // object that gets persisted, and `font: null` can never clobber the tenant's brand font.
  const theme = normalizeGrowthTheme(body.theme_json);
  const formSchema = isFormSchemaShape(body.form_schema_json) ? body.form_schema_json : undefined;

  // suggested_delivery: only ever trusted when it indexes a REAL attachment THIS call supplied
  // (§13/§15) — the edge function already validates this against what it actually fetched, but
  // the index must ALSO be in range of what the caller sent, since a stale/mismatched call
  // could otherwise let a number through that means nothing on this end.
  const rawIdx = body.suggested_delivery?.asset_index;
  const suggestedDelivery =
    typeof rawIdx === "number" &&
    Number.isInteger(rawIdx) &&
    !!input.attachments &&
    rawIdx >= 0 &&
    rawIdx < input.attachments.length
      ? { assetIndex: rawIdx }
      : undefined;

  onBlocks?.(blocks);
  return { blocks, theme, seo, ...(formSchema ? { formSchema } : {}), ...(suggestedDelivery ? { suggestedDelivery } : {}) };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Studio Phase 1 — the single entry point (§18: "a creation surface must not force the
// operator to pre-select an artifact type before describing what they want"). One brief
// typed at the always-present composer classifies BEFORE the operator ever has to click a
// mode chip, then routes to whichever artifact's own draft seam applies.
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface StudioIntentResult {
  artifact: "page" | "form" | "copy" | "image";
  /** One short sentence from the classifier — surfaced only if a caller wants to show it. */
  reasoning: string;
}

function isStudioArtifactValue(v: unknown): v is StudioIntentResult["artifact"] {
  return v === "page" || v === "form" || v === "copy" || v === "image";
}

/**
 * Classify a fresh brief into which artifact the operator is actually asking for.
 *
 * ALWAYS resolves to a real artifact, never throws for a classification miss — this mirrors
 * growth-studio-route's own discipline (§13: never fail closed on a legitimate brief). A
 * genuine auth/session problem is swallowed the same way: the downstream draft call
 * (runGenerate/draftFormSchema/draftCopy/draftImage) authenticates again and surfaces the
 * REAL error honestly at that point, so nothing is silently hidden — this function just never
 * blocks the operator's very first keystroke on a routing hiccup.
 */
export async function classifyStudioIntent(brief: string): Promise<StudioIntentResult> {
  const trimmed = (brief ?? "").trim();
  if (trimmed.length < 5) return { artifact: "page", reasoning: "" };

  try {
    const headers = await authHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/growth-studio-route`, {
      method: "POST",
      headers,
      body: JSON.stringify({ brief: trimmed }),
    });
    const body = (await res.json()) as { artifact?: unknown; reasoning?: unknown; error?: unknown };
    const fnError = readFnError(body);
    if (fnError || !res.ok || !isStudioArtifactValue(body.artifact)) {
      if (fnError) console.warn("[studio] growth-studio-route failed, defaulting to page:", res.status, fnError.message);
      return { artifact: "page", reasoning: "" };
    }
    return { artifact: body.artifact, reasoning: typeof body.reasoning === "string" ? body.reasoning : "" };
  } catch (err) {
    console.warn("[studio] classifyStudioIntent transport failure, defaulting to page:", err);
    return { artifact: "page", reasoning: "" };
  }
}

/** The server's CleanFormSchema shape (sections[].title is OPTIONAL there) adapted to the
 *  frontend's GrowthFormSchema (sections[].title is a required string) — never a shape
 *  mismatch reaching FormMode's state. */
function cleanSchemaToGrowthFormSchema(schema: {
  submit_label?: string;
  sections: { title?: string; fields: unknown[] }[];
}): GrowthFormSchema {
  return {
    submit_label: schema.submit_label,
    sections: schema.sections.map((s) => ({
      title: s.title ?? "",
      fields: s.fields as GrowthField[],
    })),
  };
}

/**
 * Derive a real GrowthFormSchema from one brief — the form-mode mirror of draftPage(), for
 * JUST a form schema (no page, no blocks, no theme). Unlike classifyStudioIntent, a failure
 * here is real and the caller should show it — FormMode falls back to its own template
 * picker on a thrown StudioError (NO_VALID_SCHEMA from the server surfaces as
 * GENERATION_FAILED here, same as any other generation miss).
 */
export async function draftFormSchema(brief: string): Promise<GrowthFormSchema> {
  const trimmed = (brief ?? "").trim();
  if (trimmed.length < 5) throw studioError("EMPTY_BRIEF");

  const headers = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/growth-form-draft`, {
      method: "POST",
      headers,
      body: JSON.stringify({ brief: trimmed }),
    });
  } catch (err) {
    throw toStudioError(err, "GENERATION_FAILED");
  }

  let body: { schema?: unknown; error?: unknown };
  try {
    body = (await res.json()) as { schema?: unknown; error?: unknown };
  } catch (err) {
    throw studioError("GENERATION_FAILED", err);
  }

  const fnError = readFnError(body);
  if (fnError) {
    const code: StudioErrorCode =
      res.status === 403 || res.status === 401
        ? "FORBIDDEN"
        : res.status === 400
          ? "EMPTY_BRIEF"
          : "GENERATION_FAILED";
    console.error("[studio] growth-form-draft failed:", res.status, fnError.message);
    throw studioError(code, fnError, operatorSafe(fnError.message) ?? undefined);
  }
  if (!res.ok) throw studioError("GENERATION_FAILED", `HTTP ${res.status}`);

  const raw = body.schema as { submit_label?: string; sections?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw studioError("GENERATION_FAILED", body);
  }
  return cleanSchemaToGrowthFormSchema(raw as { submit_label?: string; sections: { title?: string; fields: unknown[] }[] });
}

export interface DraftCopyInput {
  tenantId: string;
  brief: string;
  channel?: string;
  tone?: string;
  variations?: number;
}

export interface DraftCopyResult {
  channel: string;
  drafts: { title: string; content: string }[];
}

/**
 * Draft marketing copy — relocated verbatim from CopyMode's own direct `content-draft` invoke
 * (§10: the UI is one caller, Paige's headless tools are another). Same payload, same response
 * shape, same behavior — only the call site moved behind the seam.
 */
export async function draftCopy(input: DraftCopyInput): Promise<DraftCopyResult> {
  const tenantId = requireTenant(input.tenantId);
  const brief = (input.brief ?? "").trim();
  if (brief.length < 5) {
    throw studioError("EMPTY_BRIEF", null, "Give Paige a brief: what's the content about?");
  }
  const { data, error } = await supabase.functions.invoke("content-draft", {
    body: {
      channel: input.channel ?? "social_post",
      brief,
      tone: input.tone ?? "",
      variations: input.variations ?? 2,
      tenant_id: tenantId,
    },
  });
  if (error) throw toStudioError(error, "GENERATION_FAILED");
  if ((data as { error?: unknown } | null)?.error) {
    throw studioError("GENERATION_FAILED", data, operatorSafe(String((data as { error?: unknown }).error)) ?? undefined);
  }
  const drafts = ((data as { drafts?: { title: string; content: string }[] } | null)?.drafts ?? []);
  if (!drafts.length) {
    throw studioError("GENERATION_FAILED", data, "Paige didn't return a draft. Try adding more detail.");
  }
  return { channel: (data as { channel?: string } | null)?.channel ?? input.channel ?? "social_post", drafts };
}

export interface DraftImageInput {
  tenantId: string;
  prompt: string;
  size?: string;
  provider?: string;
}

export interface DraftImageResult {
  url: string;
  path?: string;
  size: string;
  provider?: string;
  content_id?: string;
  /** True when image generation isn't switched on for this tenant — an honest non-error
   *  result (§13), not a thrown failure; the caller renders its existing needs_config gate. */
  needsConfig?: boolean;
}

/**
 * Generate an image — relocated verbatim from ImageMode's own direct `generate-image` invoke
 * (§10). Preserves the needs_config gate as a returned, honest result rather than a thrown
 * error — image generation being off for a tenant is a real, expected state, not a defect.
 */
export async function draftImage(input: DraftImageInput): Promise<DraftImageResult> {
  const tenantId = requireTenant(input.tenantId);
  const prompt = (input.prompt ?? "").trim();
  if (prompt.length < 4) {
    throw studioError("EMPTY_BRIEF", null, "Describe the image you want.");
  }
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: {
      prompt,
      size: input.size ?? "square",
      tenant_id: tenantId,
      ...(input.provider ? { provider: input.provider } : {}),
    },
  });
  if (error) throw toStudioError(error, "GENERATION_FAILED");
  const body = data as { needs_config?: boolean; error?: unknown; url?: string; path?: string; size?: string; provider?: string; content_id?: string } | null;
  if (body?.needs_config) {
    return { url: "", size: input.size ?? "square", needsConfig: true };
  }
  if (body?.error) {
    throw studioError("GENERATION_FAILED", data, operatorSafe(String(body.error)) ?? undefined);
  }
  if (!body?.url) {
    throw studioError("GENERATION_FAILED", data, "No image came back. Try again.");
  }
  return {
    url: body.url,
    path: body.path,
    size: body.size || input.size || "square",
    provider: body.provider,
    content_id: body.content_id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Save — rpc growth_page_upsert
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface SavePageInput {
  tenantId: string;
  /** PASS THIS WHEN EDITING. Without it the upsert's ON CONFLICT (tenant_id, slug) will
   *  silently overwrite a DIFFERENT page that happens to hold the same slug. */
  pageId?: string | null;
  slug: string;
  title: string;
  blocks: GrowthBlock[];
  theme?: GrowthPageTheme | null;
  seo?: StudioSeoDraft | null;
  /** The REAL questionnaire schema derived from the clarifying step's questionnaire_answer
   *  (§4/§15). Replaces growth_page_upsert's generic 3-field synthesis for this page's
   *  embedded_form on first save — never overwrites an operator's later manual edit
   *  (ON CONFLICT DO NOTHING on growth_forms, server-side). Omit/null on every other save. */
  formSchema?: GrowthFormSchema | null;
}

export interface SavedPage {
  id: string;
  slug: string;
  title: string;
  status: string;
}

/**
 * Write the DRAFT columns (draft_blocks_json / draft_theme_json / draft_seo_json). Never the
 * live ones — the live columns only ever change inside growth_page_publish.
 *
 * SIDE EFFECT WE DEPEND ON: the RPC idempotently auto-authors an ACTIVE backing form for every
 * embedded_form block. That is what makes the canvas's signup section a real signup section,
 * and it is the reason publish's lead-capture guard passes. Which is why publish ALWAYS saves
 * first — see publishAndSave() below.
 */
export async function savePageDraft(input: SavePageInput): Promise<SavedPage> {
  const tenantId = requireTenant(input.tenantId);
  const slug = (input.slug ?? "").trim();
  if (!slug) throw studioError("INVALID_SLUG");
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) throw studioError("NO_DRAFT");

  // Normalization is idempotent, so applying it again here costs nothing and protects the
  // headless caller (Paige) who may hand us a raw generator payload full of nulls.
  const theme = input.theme ? normalizeGrowthTheme(input.theme) : null;
  const themeJson = theme && Object.keys(theme).length > 0 ? theme : null;
  const seoJson = input.seo && Object.keys(input.seo).length > 0 ? input.seo : null;

  const row = await rpc<SavedPage | null>(
    "growth_page_upsert",
    {
      p_tenant_id: tenantId,
      p_slug: slug,
      p_title: (input.title ?? "").trim() || "Untitled",
      p_blocks_json: input.blocks,
      p_theme_json: themeJson,
      p_seo_json: seoJson,
      p_id: input.pageId ?? null,
      p_form_schema_json: input.formSchema ?? null,
    },
    "SAVE_FAILED",
  );

  if (!row?.id) throw studioError("SAVE_FAILED", row);
  return { id: row.id, slug: row.slug, title: row.title, status: row.status };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Publish — rpc growth_page_publish. THE ACT.
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface PublishPageInput {
  tenantId: string;
  pageId: string;
}

export interface PublishPageResult {
  id: string;
  slug: string;
  tenantSlug: string;
  status: string;
  publishedAt: string | null;
  /** The REAL URL the server resolved. Never concatenated on the client (§13). */
  url: string;
}

interface PublishRpcRow {
  id: string;
  slug: string;
  tenant_slug: string;
  status: string;
  published_at: string | null;
  url: string;
}

/**
 * Copy draft → live and go public.
 *
 * This MUST be the RPC. The RPC is what copies draft_blocks_json into blocks_json, and it is
 * what enforces every guard: nothing saved yet, unresolved [ADD_…] blanks, a signup section
 * with no live form, a workspace with no public address. A direct
 * `update growth_pages set status='published'` would satisfy the type checker, skip all four
 * guards, copy nothing — and put a LIVE, PUBLICLY VISIBLE, BLANK page on the internet while
 * reporting success. Do not write that line.
 *
 * Callers must have saved first. publishAndSave() below does it in the right order for you.
 */
export async function publishPage(input: PublishPageInput): Promise<PublishPageResult> {
  const tenantId = requireTenant(input.tenantId);
  if (!input.pageId) throw studioError("NO_DRAFT");

  const row = await rpc<PublishRpcRow | null>(
    "growth_page_publish",
    { p_tenant_id: tenantId, p_id: input.pageId },
    "PUBLISH_FAILED",
  );

  if (!row?.url) throw studioError("PUBLISH_FAILED", row);
  return {
    id: row.id,
    slug: row.slug,
    tenantSlug: row.tenant_slug,
    status: row.status,
    publishedAt: row.published_at ?? null,
    url: row.url,
  };
}

/**
 * The whole act, in the one order that works: SAVE, then PUBLISH.
 *
 * The save writes the draft columns and auto-authors the form behind the signup section; the
 * publish then finds that form and its lead-capture guard passes. Publish-without-save fails on
 * a page that looks perfectly fine on the canvas. This is the entry point Paige calls — she gets
 * the same ordering guarantee the gold button does, for free.
 */
export async function publishAndSave(
  input: SavePageInput & { pageId?: string | null },
): Promise<PublishPageResult> {
  const saved = await savePageDraft(input);
  return publishPage({ tenantId: input.tenantId, pageId: saved.id });
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Structural block edits — rpc growth_page_edit_blocks
// ═══════════════════════════════════════════════════════════════════════════════════════

export type BlockEditOp =
  | { op: "set"; blocks: GrowthBlock[] }
  | { op: "append"; block: GrowthBlock }
  | { op: "insert"; index: number; block: GrowthBlock }
  | { op: "update"; index: number; block: GrowthBlock }
  | { op: "remove"; index: number }
  | { op: "move"; from: number; to: number };

/**
 * Apply index-based edits to the draft blocks and get the FULL new array back.
 *
 * The caller reconciles state from what the server RETURNS, never from an optimistic local
 * mutation — the same page can be edited from Paige's chat at the same moment, and the server's
 * array is the only one that is true. The RPC re-runs the same 17-type validator the upsert
 * uses, so an edit can never persist a block the save path would have rejected.
 */
export async function editBlocks(input: {
  tenantId: string;
  pageId: string;
  ops: BlockEditOp[];
}): Promise<GrowthBlock[]> {
  const tenantId = requireTenant(input.tenantId);
  if (!input.pageId) throw studioError("NO_DRAFT");
  if (!Array.isArray(input.ops) || input.ops.length === 0) return [];

  const blocks = await rpc<unknown>(
    "growth_page_edit_blocks",
    { p_tenant_id: tenantId, p_id: input.pageId, p_ops: input.ops },
    "EDIT_FAILED",
  );

  if (!isBlockArray(blocks)) throw studioError("EDIT_FAILED", blocks);
  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Conversational section edit — supabase/functions/growth-block-edit
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ReviseBlockInput {
  tenantId: string;
  index: number;
  block: GrowthBlock;
  /** The operator's sentence: "punchier headline", "add a third card". */
  instruction: string;
  signal?: AbortSignal;
}

/**
 * Rewrite ONE section from a sentence, and return the revised block — nothing is persisted here.
 * The caller then commits it through editBlocks({ ops: [{ op: "update", index, block }] }), so a
 * revision travels the same validated write path as every other change.
 *
 * The function role-gates the caller, resolves the tenant SERVER-side for a JWT caller (it does
 * not trust a tenant_id from the browser), reuses the draft function's validator, and is
 * contractually bound to return the same block.type it was given.
 */
export async function reviseBlock(input: ReviseBlockInput): Promise<GrowthBlock> {
  const tenantId = requireTenant(input.tenantId);
  const instruction = (input.instruction ?? "").trim();
  if (instruction.length < 3) throw studioError("EDIT_FAILED");
  if (!input.block || typeof input.block !== "object") throw studioError("EDIT_FAILED");

  const headers = await authHeaders();

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/growth-block-edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        block: input.block,
        instruction,
        block_index: input.index,
        // Ignored for a JWT caller (the function pins the tenant itself); read only when
        // Paige calls this headlessly with the service role.
        tenant_id: tenantId,
      }),
      signal: input.signal,
    });
  } catch (err) {
    if (input.signal?.aborted) throw studioError("GENERATION_CANCELLED", err);
    throw toStudioError(err, "EDIT_FAILED");
  }

  let body: { block?: unknown; error?: unknown };
  try {
    body = (await res.json()) as { block?: unknown; error?: unknown };
  } catch (err) {
    throw studioError("EDIT_FAILED", err);
  }

  // Same discipline as the draft seam: read the body's error before trusting the status.
  const fnError = readFnError(body);
  if (fnError) {
    const code: StudioErrorCode =
      fnError.code === "FORBIDDEN" || fnError.code === "UNAUTHENTICATED" ? "FORBIDDEN" : "EDIT_FAILED";
    console.error("[studio] growth-block-edit failed:", res.status, fnError.code, fnError.message);
    throw studioError(code, fnError, operatorSafe(fnError.message) ?? undefined);
  }
  if (!res.ok) throw studioError("EDIT_FAILED", `HTTP ${res.status}`);

  const revised = body.block;
  if (!revised || typeof revised !== "object" || typeof (revised as GrowthBlock).type !== "string") {
    throw studioError("EDIT_FAILED", body);
  }
  return revised as GrowthBlock;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Load
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface LoadedPageDraft {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  blocks: GrowthBlock[];
  theme: GrowthPageTheme | null;
  seo: StudioSeoDraft | null;
}

/** The draft columns post-date the generated types, so the row is read whole and narrowed here
 *  — the shape below is the contract, not an assumption. */
interface GrowthPageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  blocks_json: unknown;
  theme_json: unknown;
  seo_json: unknown;
  draft_blocks_json: unknown;
  draft_theme_json: unknown;
  draft_seo_json: unknown;
}

/**
 * Open an existing page's DRAFT in the Studio.
 *
 * Falls back to the LIVE columns when the draft ones are NULL — a page published before the
 * draft columns existed has never been drafted, and opening it must show what is actually on
 * the internet right now, not an empty canvas. This is the same fallback the edit RPC makes,
 * deliberately: the Studio and the server agree on what "the current page" means.
 */
export async function loadPageDraft(input: {
  tenantId: string;
  pageId: string;
}): Promise<LoadedPageDraft> {
  const tenantId = requireTenant(input.tenantId);
  if (!input.pageId) throw studioError("NOT_FOUND");

  const { data, error } = await supabase
    .from("growth_pages")
    .select("*")
    .eq("id", input.pageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw toStudioError(error, "NOT_FOUND");
  if (!data) throw studioError("NOT_FOUND");

  const row = data as unknown as GrowthPageRow;
  const blocks = isBlockArray(row.draft_blocks_json)
    ? row.draft_blocks_json
    : isBlockArray(row.blocks_json)
      ? row.blocks_json
      : [];

  const themeRaw = (row.draft_theme_json ?? row.theme_json) as GrowthPageTheme | null;
  const theme = themeRaw ? normalizeGrowthTheme(themeRaw) : null;

  const seoRaw = (row.draft_seo_json ?? row.seo_json) as StudioSeoDraft | null;
  const seo = seoRaw && typeof seoRaw === "object" ? seoRaw : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status === "published" ? "published" : "draft",
    blocks,
    theme: theme && Object.keys(theme).length > 0 ? theme : null,
    seo,
  };
}

/**
 * growth_page_upsert does ON CONFLICT (tenant_id, slug) DO UPDATE. With p_id = null, a colliding
 * slug SILENTLY OVERWRITES another page's draft. Every NEW page runs through here first.
 */
export async function uniqueGrowthPageSlug(tenantId: string, desired: string): Promise<string> {
  const tid = requireTenant(tenantId);
  const base = kebab(desired) || "page";

  const { data, error } = await supabase
    .from("growth_pages")
    .select("slug")
    .eq("tenant_id", tid)
    .like("slug", `${base}%`);

  if (error) throw toStudioError(error, "SAVE_FAILED");

  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 200; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function kebab(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Forms & funnels — the Studio's form/funnel modes drive the SAME SECURITY DEFINER rails
// the Growth libraries and Paige write on (§10). Same house style as the page seams:
// plain async, structured StudioError, no React. p_tenant_id is passed as null on purpose —
// the RPCs pin a JWT caller to their own tenant server-side (IDOR-safe); requireTenant()
// still gates the call so platform staff with no active tenant fail loudly first (§9).
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface SaveFormInput {
  tenantId: string;
  slug: string;
  name: string;
  schema: GrowthFormSchema;
  /** What happens right after a visitor submits (§13). Omit to keep growth_form_upsert's own
   *  default ({"type":"thank_you", message}) — never overwrites an existing form's action with
   *  null; only an explicit value here ever changes it. */
  successAction?: GrowthSuccessAction | null;
}

export interface SavedForm {
  id: string;
  slug: string;
}

/** Create (or update) a form through growth_form_upsert — schema validated server-side,
 *  atomic, tenant-pinned. The exact payload shape the Forms library used. */
export async function saveForm(input: SaveFormInput): Promise<SavedForm> {
  requireTenant(input.tenantId);
  const slug = kebab(input.slug);
  if (!slug) throw studioError("INVALID_SLUG");
  const name = (input.name ?? "").trim();
  if (!name) throw studioError("SAVE_FAILED", null, "Give the form a name first.");

  const row = await rpc<{ id?: string; slug?: string } | null>(
    "growth_form_upsert",
    {
      p_tenant_id: null,
      p_slug: slug,
      p_name: name,
      p_schema_json: input.schema,
      p_success_action_json: input.successAction ?? null,
      p_auto_create_contact: true,
      p_pipeline_id: null,
      p_stage_id: null,
      p_id: null,
    },
    "SAVE_FAILED",
  );

  if (!row?.id) throw studioError("SAVE_FAILED", row);
  return { id: row.id, slug: row.slug ?? slug };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Post-submit delivery editor — closes the gap where every Page-mode form's
// success_action_json was hardcoded and never editable (§13/§15). Reads/writes the SAME
// growth_form_upsert rail as saveForm() above — one write seam, no fork.
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface FormDeliveryRecord {
  id: string;
  slug: string;
  name: string;
  schema: GrowthFormSchema;
  successAction: GrowthSuccessAction | null;
}

/** Load a tenant's form by its slug (the embedded_form block's own form_slug) so the Studio can
 *  show/edit its CURRENT post-submit behavior. Returns null if the form hasn't been
 *  auto-authored yet (the page has never been saved). */
export async function loadFormBySlug(tenantId: string, slug: string): Promise<FormDeliveryRecord | null> {
  const tid = requireTenant(tenantId);
  const cleanSlug = (slug ?? "").trim();
  if (!cleanSlug) return null;
  const { data, error } = await supabase
    .from("growth_forms")
    .select("id,slug,name,schema_json,success_action_json")
    .eq("tenant_id", tid)
    .eq("slug", cleanSlug)
    .maybeSingle();
  if (error) throw toStudioError(error, "NOT_FOUND");
  if (!data) return null;
  const row = data as unknown as {
    id: string; slug: string; name: string; schema_json: GrowthFormSchema; success_action_json: GrowthSuccessAction | null;
  };
  return { id: row.id, slug: row.slug, name: row.name, schema: row.schema_json, successAction: row.success_action_json ?? null };
}

export interface SaveFormDeliveryInput {
  tenantId: string;
  formId: string;
  slug: string;
  name: string;
  /** The form's CURRENT schema, unchanged — growth_form_upsert sets schema_json unconditionally
   *  (unlike success_action_json's COALESCE), so an update MUST resend the existing schema or it
   *  would be silently wiped. Always pass through what loadFormBySlug returned. */
  schema: GrowthFormSchema;
  successAction: GrowthSuccessAction;
}

/** Write a REAL, caller-verified success_action_json — a message, a redirect the operator typed,
 *  or a download_url that is a REAL uploaded growth-asset URL (never a model-invented string,
 *  §13/§15). This is the ONLY place that turns a Studio suggestion or operator choice into a
 *  live, persisted post-submit action. */
export async function saveFormDelivery(input: SaveFormDeliveryInput): Promise<SavedForm> {
  requireTenant(input.tenantId);
  if (!input.formId) throw studioError("SAVE_FAILED", null, "That form hasn't been created yet — save the page first.");
  const slug = kebab(input.slug);
  if (!slug) throw studioError("INVALID_SLUG");
  const name = (input.name ?? "").trim();
  if (!name) throw studioError("SAVE_FAILED", null, "That form is missing a name.");

  const row = await rpc<{ id?: string; slug?: string } | null>(
    "growth_form_upsert",
    {
      p_tenant_id: null,
      p_slug: slug,
      p_name: name,
      p_schema_json: input.schema,
      p_success_action_json: input.successAction,
      p_auto_create_contact: true,
      p_pipeline_id: null,
      p_stage_id: null,
      p_id: input.formId,
    },
    "SAVE_FAILED",
  );

  if (!row?.id) throw studioError("SAVE_FAILED", row);
  return { id: row.id, slug: row.slug ?? slug };
}

export interface FunnelStepInput {
  step_type: "page" | "form" | "thankyou";
  order_index: number;
  page_id?: string;
  form_id?: string;
}

export interface SaveFunnelInput {
  tenantId: string;
  slug: string;
  name: string;
  /** The RPC's own jsonb shape — no funnel_id/tenant_id; the function pins both. */
  steps: FunnelStepInput[];
  entryPageId?: string | null;
  /** Pass when re-saving — the upsert full-replaces the step list atomically. */
  id?: string | null;
}

export interface SavedFunnel {
  id: string;
  slug: string;
}

/** Create (or update) a funnel through growth_funnel_upsert — ONE atomic write; the RPC
 *  resolves every page/form reference server-side and refuses cross-tenant references. */
export async function saveFunnel(input: SaveFunnelInput): Promise<SavedFunnel> {
  const tenantId = requireTenant(input.tenantId);
  const slug = kebab(input.slug);
  if (!slug) throw studioError("INVALID_SLUG");
  const name = (input.name ?? "").trim();
  if (!name) throw studioError("SAVE_FAILED", null, "Give the funnel a name first.");
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw studioError("SAVE_FAILED", null, "Pick an entry page or a form step — a funnel needs at least one.");
  }

  const row = await rpc<{ id?: string } | null>(
    "growth_funnel_upsert",
    {
      p_tenant_id: null,
      p_slug: slug,
      p_name: name,
      p_goal: null,
      p_steps: input.steps,
      p_entry_page_id: input.entryPageId || null,
      p_success_page_id: null,
      p_id: input.id ?? null,
    },
    "SAVE_FAILED",
  );

  // Some upsert rails return the row, some return void — resolve the id by (tenant, slug)
  // when it isn't handed back, so publishFunnel always has a real target (§13: never
  // report a save we can't point at).
  let id = row && typeof row === "object" && typeof row.id === "string" ? row.id : null;
  if (!id) {
    const { data, error } = await supabase
      .from("growth_funnels")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw toStudioError(error, "SAVE_FAILED");
    id = (data as { id?: string } | null)?.id ?? null;
  }
  if (!id) throw studioError("SAVE_FAILED", row);
  return { id, slug };
}

/** Go live — growth_funnel_publish is the ONLY path to status='active'; it enforces the
 *  lead-capture guards (pages published, forms active) so a live funnel never renders a
 *  blank or dead step. Never flip the status column directly. */
export async function publishFunnel(input: { tenantId: string; id: string }): Promise<{ url: string | null }> {
  requireTenant(input.tenantId);
  if (!input.id) throw studioError("NO_DRAFT");
  const row = await rpc<{ url?: string } | null>(
    "growth_funnel_publish",
    { p_tenant_id: null, p_id: input.id },
    "PUBLISH_FAILED",
  );
  return { url: row?.url ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Publish preflight — the server's own guards, run on the client first
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface PublishCheck {
  id: "has_blocks" | "no_placeholders" | "tenant_slug" | "valid_slug";
  ok: boolean;
  label: string;
  /** What to fix, in operator voice. */
  detail?: string;
  /** Sections still carrying a blank — lets the dialog deep-link the fix. */
  blockIndexes?: number[];
}

/** The publish RPC's OWN regexes, ported 1:1 (20260713090000_growth_authoring_seam.sql). SQL's
 *  `\y` word boundary is JS's `\b`. If the server's guard changes, these change in lockstep — a
 *  preflight that disagrees with the server is worse than no preflight, because it re-arms the
 *  gold button on a page the server will refuse. */
export const PLACEHOLDER_TOKEN = /\[[A-Za-z0-9]*_[A-Za-z0-9_]*\]/;
export const PLACEHOLDER_PROMPT =
  /\[[^\]]*\b(add|paste|insert|enter|fill|tbd|placeholder|replace|example|your)\b[^\]]*\]/i;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hasPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = JSON.stringify(value) ?? "";
  return PLACEHOLDER_TOKEN.test(text) || PLACEHOLDER_PROMPT.test(text);
}

/**
 * Run the server's guards BEFORE the gold button is armed.
 *
 * The generator is *instructed* to leave bracketed blanks ([ADD_WEBINAR_DATE]) wherever the
 * brief didn't give it a real fact — that's §15 working correctly, not a bug. But the publish
 * RPC hard-refuses those. So without this, the very first gold click most operators ever make
 * would fail on a raw server error. A grey button that explains beats a gold one that blows up.
 */
export function preflightPublish(input: {
  blocks: GrowthBlock[];
  seo: StudioSeoDraft | null;
  slug: string;
  tenantSlug: string | null;
}): PublishCheck[] {
  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  const slug = (input.slug ?? "").trim();

  const flagged: number[] = [];
  blocks.forEach((block, index) => {
    if (hasPlaceholder(block)) flagged.push(index);
  });
  const seoFlagged = hasPlaceholder(input.seo);

  return [
    {
      id: "has_blocks",
      ok: blocks.length > 0,
      label: "The page has sections",
      detail: "Describe the page and let Paige draft it first.",
    },
    {
      id: "no_placeholders",
      ok: flagged.length === 0 && !seoFlagged,
      label: "Every blank is filled in",
      detail: seoFlagged
        ? "The page name or description still has a blank in square brackets. Fill it in, then publish."
        : "Some sections still have blanks in square brackets — a date, a link, a real result. Fill them in, then publish.",
      blockIndexes: flagged.length > 0 ? flagged : undefined,
    },
    {
      id: "tenant_slug",
      ok: !!input.tenantSlug,
      label: "This workspace has a public web address",
      detail: "Set your workspace's web address in brand settings, then come back and publish.",
    },
    {
      id: "valid_slug",
      ok: SLUG_RE.test(slug),
      label: "The page has a web address",
      detail: "Give it a web address — letters, numbers and dashes.",
    },
  ];
}
