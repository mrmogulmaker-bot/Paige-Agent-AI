// Client-side recovery for in-progress Studio (page mode) work — NOT a database write.
//
// The brief/blocks/theme/seo/formSchema for a page under construction live ONLY in
// StudioShell's React state until the operator hits Save or Publish. Navigating to any
// other admin section unmounts the whole Studio tree via the route swap and, before this
// file existed, silently destroyed whatever was in progress — no warning, no recovery.
//
// This is a lightweight browser-side draft, the fix the owner chose over a real DB-backed
// autosave: snapshot the recoverable slice of state to localStorage, debounced, and restore
// it on the next mount before falling back to EMPTY_SHELL. It is cleared the moment a real
// DB row backs the work (an explicit Save or Publish), so it never lingers stale once the
// operator has committed for real.
//
// Guarded exactly the way every other small localStorage read/write in this codebase is
// guarded (BusinessContext, RoleLensContext, usePresenceHeartbeat): a plain try/catch that
// never throws. A corrupted or foreign entry fails open — a console.warn, then nothing,
// never a crash (§13).
import type { GrowthBlock, GrowthFormSchema, GrowthPageTheme } from "@/lib/growth";
import type { ClarifyingState, PageCanvasMode, StudioSeoDraft } from "./studio-types";

/** The exact recoverable slice of ShellState. Everything else — saving/publishing/editing/
 *  error/dirty/tenantId/tenantSlug/status/instruction/device/publishOpen/publishedUrl — is
 *  transient or re-derived and resets fresh on every mount regardless of a stored draft. */
export interface PageDraftSnapshot {
  pageId: string | null;
  title: string;
  slug: string;
  slugTouched: boolean;
  blocks: GrowthBlock[];
  theme: GrowthPageTheme | null;
  seo: StudioSeoDraft | null;
  formSchema: GrowthFormSchema | null;
  brief: string;
  mode: PageCanvasMode;
  clarifying: ClarifyingState;
  selectedIndex: number | null;
}

/** A draft older than this is treated as gone — long enough to survive a coffee break or a
 *  stray reload, short enough that a forgotten browser tab never resurrects week-old work
 *  over a page the database has since moved on from. */
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

const DRAFT_VERSION = 1;

interface StoredDraftEnvelope {
  v: number;
  savedAt: number;
  data: PageDraftSnapshot;
}

/** Tenant-scoped AND page-scoped (§9) — a draft from one tenant, or one saved page, never
 *  bleeds into another. `pageId` is null for a page that has never been saved (there is no
 *  DB row yet to key against), so every brand-new composition shares one "new" slot per
 *  tenant — the same slot a Save promotes it out of once a real id exists. */
export function pageDraftKey(tenantId: string, pageId: string | null): string {
  return `paige.studio.page-draft.${tenantId}.${pageId ?? "new"}`;
}

function isClarifyingState(value: unknown): value is ClarifyingState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.questions) && !!v.answers && typeof v.answers === "object";
}

const PAGE_CANVAS_MODES: readonly PageCanvasMode[] = ["compose", "clarifying", "generating", "canvas"];

/** A defensive shape check, not a schema validator — just enough to refuse to hand back
 *  something that would blow up the Studio on restore. Anything that doesn't look right
 *  fails open (§13): the caller gets null and falls back to EMPTY_SHELL. */
function isPageDraftSnapshot(value: unknown): value is PageDraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.pageId === null || typeof v.pageId === "string") &&
    typeof v.title === "string" &&
    typeof v.slug === "string" &&
    typeof v.slugTouched === "boolean" &&
    Array.isArray(v.blocks) &&
    (v.theme === null || typeof v.theme === "object") &&
    (v.seo === null || typeof v.seo === "object") &&
    (v.formSchema === null || typeof v.formSchema === "object") &&
    typeof v.brief === "string" &&
    typeof v.mode === "string" &&
    PAGE_CANVAS_MODES.includes(v.mode as PageCanvasMode) &&
    isClarifyingState(v.clarifying) &&
    (v.selectedIndex === null || typeof v.selectedIndex === "number")
  );
}

/** Reads a stored draft back, or null on ANYTHING that doesn't look right — malformed JSON,
 *  a foreign shape, a stale timestamp. Never throws; a corrupted entry is logged and ignored,
 *  not a reason to break the Studio on load (§13). */
export function loadPageDraftSnapshot(key: string): PageDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraftEnvelope>;
    if (parsed.v !== DRAFT_VERSION || typeof parsed.savedAt !== "number") {
      window.console.warn(`[studio-draft] discarding "${key}" — unrecognized envelope`);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) return null;
    if (!isPageDraftSnapshot(parsed.data)) {
      window.console.warn(`[studio-draft] discarding "${key}" — unrecognized shape`);
      return null;
    }
    return parsed.data;
  } catch (err) {
    window.console.warn(`[studio-draft] failed to read "${key}"`, err);
    return null;
  }
}

/** Fire-and-forget, failure-safe — the same `try { localStorage.setItem(...) } catch {}`
 *  every other small localStorage write in this codebase uses. A write that fails (private
 *  mode, a full quota) never throws into render; it just means this one recovery aid is
 *  unavailable, not that the Studio breaks. */
export function savePageDraftSnapshot(key: string, data: PageDraftSnapshot): void {
  try {
    const envelope: StoredDraftEnvelope = { v: DRAFT_VERSION, savedAt: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* best-effort recovery aid — never blocks the real save/publish path */
  }
}

/** Called the moment a real DB row backs the work (an explicit Save or Publish) — the
 *  local draft has done its job and must not linger stale past that point. */
export function clearPageDraftSnapshot(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do if storage isn't available — there's nothing stale to clean up */
  }
}
