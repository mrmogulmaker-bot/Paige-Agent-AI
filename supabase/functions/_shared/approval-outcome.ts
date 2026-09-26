/**
 * What happened to each approval the operator sent, reported back to the card that asked.
 *
 * WHY THIS EXISTS. Pressing Approve sends the approved fingerprints and starts a new turn. Until
 * this frame, nothing told the card what became of them: it vanished on press, and the only trace
 * of a failure was whatever Paige chose to say. The owner-approved recovery design (2026-09-26)
 * has the card report each action as ran, didn't run, or couldn't confirm, in a sentence the
 * SERVER writes — so the card can never claim a cause the server does not know, and never
 * improvise a remedy that does not exist.
 *
 * ONE HOME for that decision. The chat handler records the facts as they happen (which approval
 * was spent by which call, which tool's approvals were refused and why, what each call returned);
 * this module turns them into the frame. It is pure so the whole mapping is unit-tested, and so
 * the sentences live in one closed set rather than scattered through the handler.
 *
 * THE SENTENCES ARE A CLOSED SET, AND EACH IS ONLY SAID WHEN IT IS TRUE.
 * - "Nothing changed" is claimed only where the server knows nothing ran: an approval it never
 *   spent, a refusal before the call ran, or a proposal that was re-asked. A call that ran and
 *   failed is reported as "It didn't go through" — a failed multi-step tool can have done part of
 *   its work, and the card must not promise otherwise.
 * - A call whose answer never arrived is `unconfirmed`, never `not_run`: it may have gone through.
 */

export type ApprovalOutcomeKind = "ran" | "not_run" | "unconfirmed";

/** Why a tool's approvals could not be spent this turn — set by the approval doors. */
export type ApprovalRefusalReason = "ambiguous" | "unclaimable" | "lookup_failed";

type NoteKey =
  | ApprovalRefusalReason
  | "not_attempted"
  | "id_refused"
  | "reproposed"
  | "failed"
  | "unconfirmed";

export type ApprovalOutcomeAction = {
  fingerprint: string;
  outcome: ApprovalOutcomeKind;
  /** Present only when the actions ended differently; otherwise the card-level note carries it. */
  note?: string;
};

export type ApprovalOutcomeFrame = {
  actions: ApprovalOutcomeAction[];
  /** One sentence for the whole card, written for the batch, when every action ended the same way. */
  note?: string;
};

type Classified = { outcome: ApprovalOutcomeKind; reason: NoteKey | null };

/** Every sentence the card can show, singular and batch. Plain words, no internal names. */
const NOTES: Record<NoteKey, (many: boolean) => string> = {
  ambiguous: () => "Nothing changed. More than one approval was waiting, so Paige stopped rather than guess.",
  unclaimable: (many) => many
    ? "Nothing changed. Those approvals no longer match anything Paige can run."
    : "Nothing changed. That approval no longer matches anything Paige can run.",
  lookup_failed: () => "Nothing changed. Something went wrong on our side while checking your approval.",
  not_attempted: (many) => many ? "Nothing changed. Paige didn't run these." : "Nothing changed. Paige didn't run this.",
  id_refused: (many) => many
    ? "Nothing changed. Paige couldn't tell exactly which items these were, so she stopped."
    : "Nothing changed. Paige couldn't tell exactly which item this was, so she stopped.",
  reproposed: (many) => many
    ? "Those approvals couldn't be used, so Paige is asking again."
    : "That approval couldn't be used, so Paige is asking again.",
  failed: () => "It didn't go through.",
  unconfirmed: (many) => many
    ? "These may have gone through. Check before asking again, so nothing happens twice."
    : "This may have gone through. Check before asking again, so it doesn't happen twice.",
};

/**
 * An approval the handler spent on a call: classify what that call returned. `content` is the
 * tool result exactly as the model received it; `undefined` means the call never produced one.
 *
 * Success is read the way the audit trail reads it (`auditWriteForTool` in paige-ai-chat), so the
 * card and the audit record can never disagree about the same call: a tool that reports in `ok`
 * (`reportsOk`, the n8n management tools) failed unless it said `ok: true`; any other tool failed
 * only when it said so. One refinement, and only in the direction of caution: `ok: false` is a
 * failure whichever field a tool uses.
 */
export function classifySpentApproval(
  content: string | undefined,
  opts: { reportsOk?: boolean } = {},
): Classified {
  if (content === undefined) return { outcome: "unconfirmed", reason: "unconfirmed" };
  let out: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out = parsed as Record<string, unknown>;
  } catch {
    // A result that is not JSON is a result nobody can read: say so rather than guess.
    return { outcome: "unconfirmed", reason: "unconfirmed" };
  }
  if (out.needs_confirm === true) return { outcome: "not_run", reason: "reproposed" };
  if (out.refused_before_run === true) return { outcome: "not_run", reason: "id_refused" };
  if (out.disabled === true) return { outcome: "not_run", reason: "not_attempted" };
  if (out.outcome_unknown === true || (opts.reportsOk && out.error === "outcome_unknown")) {
    return { outcome: "unconfirmed", reason: "unconfirmed" };
  }
  const failed = opts.reportsOk ? out.ok !== true : out.success === false || out.ok === false;
  return failed ? { outcome: "not_run", reason: "failed" } : { outcome: "ran", reason: null };
}

/** An approval the handler never spent: the reason its tool was refused, if one was recorded. */
export function classifyUnspentApproval(refusal: ApprovalRefusalReason | undefined): Classified {
  return { outcome: "not_run", reason: refusal ?? "not_attempted" };
}

/**
 * Build the frame. When every action ended the same way the sentence is written ONCE, for the
 * batch, as the card-level note; saying the same reason on every row reads as a system repeating
 * itself. When they differ, each action that did not run carries its own sentence.
 */
export function buildApprovalOutcome(
  entries: Array<{ fingerprint: string } & Classified>,
): ApprovalOutcomeFrame {
  if (!entries.length) return { actions: [] };
  const first = entries[0];
  const uniform = entries.every((e) => e.outcome === first.outcome && e.reason === first.reason);
  if (uniform) {
    return {
      actions: entries.map(({ fingerprint, outcome }) => ({ fingerprint, outcome })),
      ...(first.reason ? { note: NOTES[first.reason](entries.length > 1) } : {}),
    };
  }
  return {
    actions: entries.map(({ fingerprint, outcome, reason }) => ({
      fingerprint,
      outcome,
      ...(reason ? { note: NOTES[reason](false) } : {}),
    })),
  };
}

/**
 * Did the answer to a thrown failure never arrive? Only then is the outcome unknown.
 *
 * - A PostgREST/Postgres refusal is a plain object carrying a code: the database ANSWERED, so the
 *   outcome is known (it failed).
 * - A transport failure — an abort or timeout, a `TypeError` from fetch, or postgrest-js's wrapped
 *   network error (a plain object with an empty code and a fetch/network message) — means the
 *   request may have reached the database and committed while the answer was lost.
 * - Any other throw (a validation `Error` raised by the handler's own code, a string) is a known
 *   failure. Calling it unknown would tell the operator "it may have gone through" about something
 *   that certainly did not, and send them checking for nothing.
 */
export function thrownOutcomeUnknown(err: unknown): boolean {
  const transport = /fetch|network|connection|socket|timed? ?out/i;
  if (err instanceof Error) {
    return err.name === "AbortError" || err.name === "TimeoutError"
      || (err.name === "TypeError" && transport.test(err.message));
  }
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.trim() !== "") return false;
    return transport.test(String((err as { message?: unknown }).message ?? ""));
  }
  return false;
}

/**
 * Did a function invocation end without the function's own answer? A function that answered wrote
 * its own `ok`. An error that came back with no such answer means the request failed in transit,
 * the relay failed, or the platform cut the function off, and in each of those it may have run and
 * committed while the answer was lost. The safe reading is "couldn't confirm", never "didn't run".
 */
export function invokeOutcomeUnknown(error: unknown, body: Record<string, unknown>): boolean {
  return Boolean(error) && typeof body.ok !== "boolean";
}

/** What the model is told when a call's answer never arrived, so its words match the card's. */
export const OUTCOME_UNKNOWN_NOTE =
  "Say this to the operator in ONE plain line: you could not confirm whether it went through, and they should check before asking for it again so it does not happen twice. Do NOT say it was done, do NOT say it failed, and do NOT call this tool again in this reply.";
