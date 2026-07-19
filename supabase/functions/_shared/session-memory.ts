// _shared/session-memory.ts — the Studio session's WORKING MEMORY (a scratchpad the Paige
// orchestrator reads at the top of a turn and updates at the bottom). "Paige learns" within a
// single project session: what she's trying to do, what she's already tried, what worked, what
// failed, and the next move — so a long-running Studio conversation stops re-deriving its own
// context every turn (CLAUDE.md §26 compound loop; §21 one session holds every artifact type).
//
// THIS EXTENDS, IT DOES NOT RIVAL (§18):
//   • The scratchpad is ONE jsonb column on the EXISTING studio_sessions row
//     (studio_session_scratchpad). There is no new table, no parallel session store.
//   • The caller injects its OWN Supabase client (the same one already built in the edge function),
//     exactly like the rest of the request path — this file never stands up a second client.
//
// TENANT ISOLATION: reads/writes go through studio_sessions, which is protected by the EXISTING RLS
// on that table — a session (and its scratchpad) is only reachable by its owning tenant. When the
// caller passes a service-role client it has already resolved/authorized the sessionId upstream; we
// add no cross-tenant surface here.
//
// HONESTY / BEST-EFFORT (§13): the scratchpad is an OPTIMIZATION, never load-bearing. Every read
// returns {} on a null/missing row or any error (never throws); every write swallows-and-logs its
// error and returns without disturbing the turn. A failed scratchpad update never breaks the build.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// ── The working-memory shape ──────────────────────────────────────────────────────────────────
// Every field is optional: a fresh session has an empty scratchpad, and a patch touches only what
// changed. Arrays are append-style ledgers (tried/worked/failed); the scalars are the live pointer.
export type StudioScratchpad = {
  current_goal?: string; // what the tenant is trying to build/achieve right now
  sub_goals?: string[]; // the decomposed steps toward current_goal
  tried?: string[]; // approaches already attempted this session (don't repeat blindly)
  worked?: string[]; // what actually landed (§13 — a genuine success, not a hoped-for one)
  failed?: string[]; // what didn't, so the next turn steers around it
  next_step?: string; // the single next move the orchestrator committed to
};

const COLUMN = "studio_session_scratchpad";
const TABLE = "studio_sessions";

// Narrow an unknown DB value to a StudioScratchpad without throwing. A jsonb column can come back as
// null, an object, or (defensively) something malformed — anything that isn't a plain object folds
// to {} so callers always get a usable shape.
function coerceScratchpad(value: unknown): StudioScratchpad {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as StudioScratchpad;
  }
  return {};
}

/**
 * readScratchpad — load a session's working memory. Never throws: returns {} on a null column, a
 * missing row, or any query error, so the orchestrator can always proceed (§13 best-effort).
 */
export async function readScratchpad(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<StudioScratchpad> {
  if (!sessionId) return {};
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMN)
      .eq("id", sessionId)
      .maybeSingle();
    if (error) {
      console.warn(`[session-memory] readScratchpad(${sessionId}) failed:`, error.message);
      return {};
    }
    return coerceScratchpad((data as Record<string, unknown> | null)?.[COLUMN]);
  } catch (e) {
    console.warn(`[session-memory] readScratchpad(${sessionId}) threw:`, (e as Error)?.message);
    return {};
  }
}

/**
 * writeScratchpad — shallow-merge a partial patch into the session's working memory and persist it.
 * Best-effort (§13): reads the current scratchpad, merges the patch over it (patch keys win; keys
 * absent from the patch are preserved), and updates the row. Any failure is swallowed + logged so a
 * scratchpad write can never break the turn. Returns the merged scratchpad it attempted to persist.
 */
export async function writeScratchpad(
  supabase: SupabaseClient,
  sessionId: string,
  patch: Partial<StudioScratchpad>,
): Promise<StudioScratchpad> {
  const current = await readScratchpad(supabase, sessionId);
  const merged: StudioScratchpad = { ...current, ...patch };
  if (!sessionId) return merged;
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ [COLUMN]: merged })
      .eq("id", sessionId);
    if (error) {
      console.warn(`[session-memory] writeScratchpad(${sessionId}) failed:`, error.message);
    }
  } catch (e) {
    console.warn(`[session-memory] writeScratchpad(${sessionId}) threw:`, (e as Error)?.message);
  }
  return merged;
}

/**
 * formatScratchpadForPrompt — render the working memory as a compact system-block string for
 * injection at the top of a turn. Returns "" when the scratchpad is blank (no goal, no ledgers), so
 * a fresh session adds zero prompt noise. Kept terse — this is context, not prose.
 */
export function formatScratchpadForPrompt(sp: StudioScratchpad): string {
  if (!sp) return "";
  const lines: string[] = [];
  if (sp.current_goal) lines.push(`Current goal: ${sp.current_goal}`);
  if (sp.sub_goals?.length) lines.push(`Sub-goals:\n${sp.sub_goals.map((s) => `  - ${s}`).join("\n")}`);
  if (sp.tried?.length) lines.push(`Already tried:\n${sp.tried.map((s) => `  - ${s}`).join("\n")}`);
  if (sp.worked?.length) lines.push(`Worked:\n${sp.worked.map((s) => `  - ${s}`).join("\n")}`);
  if (sp.failed?.length) lines.push(`Failed:\n${sp.failed.map((s) => `  - ${s}`).join("\n")}`);
  if (sp.next_step) lines.push(`Next step: ${sp.next_step}`);
  if (lines.length === 0) return "";
  return `<studio_working_memory>\n${lines.join("\n")}\n</studio_working_memory>`;
}
