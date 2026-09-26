/**
 * The approval outcome frame: what the card is told about each approval the operator sent.
 *
 * REAL CODE: the shipped `_shared/approval-outcome.ts`, the module the chat handler imports. The
 * handler wiring is proven on the real handler in scripts/client-memory-authz (checks 18.OUT*).
 */
import { describe, it, expect } from "vitest";
import {
  buildApprovalOutcome,
  classifySpentApproval,
  classifyUnspentApproval,
  invokeOutcomeUnknown,
  OUTCOME_UNKNOWN_NOTE,
  thrownOutcomeUnknown,
} from "../../supabase/functions/_shared/approval-outcome.ts";
import { executorFailureSpeech } from "../../supabase/functions/_shared/crm-command/executor-error.ts";

const r = (value: unknown) => JSON.stringify(value);

describe("a spent approval is reported by what its call returned", () => {
  it("ran when the call succeeded", () => {
    expect(classifySpentApproval(r({ success: true }))).toEqual({ outcome: "ran", reason: null });
    expect(classifySpentApproval(r({ ok: true, started: true }))).toEqual({ outcome: "ran", reason: null });
  });

  it("reads success the way the audit trail does, so the card and the record agree", () => {
    // auditWriteForTool: any tool but the n8n management ones failed only when it said so.
    expect(classifySpentApproval(r({ id: "a1", created: true }))).toEqual({ outcome: "ran", reason: null });
    // The n8n management tools report in `ok`, and fail unless they said ok.
    expect(classifySpentApproval(r({ ok: true, started: true }), { reportsOk: true })).toEqual({ outcome: "ran", reason: null });
    expect(classifySpentApproval(r({ ok: true, executed: false }), { reportsOk: true })).toEqual({ outcome: "ran", reason: null });
    expect(classifySpentApproval(r({ ok: false, error: "forbidden" }), { reportsOk: true })).toEqual({ outcome: "not_run", reason: "failed" });
    expect(classifySpentApproval(r({ success: true }), { reportsOk: true })).toEqual({ outcome: "not_run", reason: "failed" });
    // Their lost answer is `error: "outcome_unknown"`, and only for them.
    expect(classifySpentApproval(r({ ok: false, error: "outcome_unknown", retry_safe: false }), { reportsOk: true }))
      .toEqual({ outcome: "unconfirmed", reason: "unconfirmed" });
    expect(classifySpentApproval(r({ success: false, error: "outcome_unknown" }))).toEqual({ outcome: "not_run", reason: "failed" });
  });

  it("did not run when it was re-asked, refused before running, switched off, or failed", () => {
    expect(classifySpentApproval(r({ success: false, needs_confirm: true }))).toEqual({ outcome: "not_run", reason: "reproposed" });
    expect(classifySpentApproval(r({ success: false, refused_before_run: true }))).toEqual({ outcome: "not_run", reason: "id_refused" });
    expect(classifySpentApproval(r({ success: false, disabled: true }))).toEqual({ outcome: "not_run", reason: "not_attempted" });
    expect(classifySpentApproval(r({ success: false, error: "Unknown error" }))).toEqual({ outcome: "not_run", reason: "failed" });
    expect(classifySpentApproval(r({ ok: false, code: "X" }))).toEqual({ outcome: "not_run", reason: "failed" });
  });

  it("is unconfirmed when the answer never arrived, or nothing readable came back", () => {
    expect(classifySpentApproval(r({ success: false, outcome_unknown: true }))).toEqual({ outcome: "unconfirmed", reason: "unconfirmed" });
    expect(classifySpentApproval(undefined)).toEqual({ outcome: "unconfirmed", reason: "unconfirmed" });
    expect(classifySpentApproval("not json")).toEqual({ outcome: "unconfirmed", reason: "unconfirmed" });
  });

  it("never reads a success out of a failure that happens to carry ok:false", () => {
    expect(classifySpentApproval(r({ ok: false, success: false }))).toEqual({ outcome: "not_run", reason: "failed" });
  });
});

describe("an approval that was never spent is reported with the reason its tool was refused", () => {
  it("names the refusal when one was recorded, and says only that Paige didn't run it when none was", () => {
    expect(classifyUnspentApproval("ambiguous")).toEqual({ outcome: "not_run", reason: "ambiguous" });
    expect(classifyUnspentApproval("lookup_failed")).toEqual({ outcome: "not_run", reason: "lookup_failed" });
    expect(classifyUnspentApproval(undefined)).toEqual({ outcome: "not_run", reason: "not_attempted" });
  });
});

describe("the frame says each reason once", () => {
  it("writes one card-level sentence when every action ended the same way, and no row repeats it", () => {
    const frame = buildApprovalOutcome([
      { fingerprint: "a", ...classifyUnspentApproval("ambiguous") },
      { fingerprint: "b", ...classifyUnspentApproval("ambiguous") },
    ]);
    expect(frame.note).toBe("Nothing changed. More than one approval was waiting, so Paige stopped rather than guess.");
    expect(frame.actions).toEqual([{ fingerprint: "a", outcome: "not_run" }, { fingerprint: "b", outcome: "not_run" }]);
  });

  it("writes the batch sentence for more than one, and the single one for one", () => {
    expect(buildApprovalOutcome([{ fingerprint: "a", ...classifyUnspentApproval(undefined) }]).note)
      .toBe("Nothing changed. Paige didn't run this.");
    expect(buildApprovalOutcome([
      { fingerprint: "a", ...classifyUnspentApproval(undefined) },
      { fingerprint: "b", ...classifyUnspentApproval(undefined) },
    ]).note).toBe("Nothing changed. Paige didn't run these.");
    expect(buildApprovalOutcome([
      { fingerprint: "a", ...classifySpentApproval(r({ outcome_unknown: true })) },
      { fingerprint: "b", ...classifySpentApproval(r({ outcome_unknown: true })) },
    ]).note).toBe("These may have gone through. Check before asking again, so nothing happens twice.");
  });

  it("says nothing when everything ran", () => {
    expect(buildApprovalOutcome([{ fingerprint: "a", ...classifySpentApproval(r({ success: true })) }]))
      .toEqual({ actions: [{ fingerprint: "a", outcome: "ran" }] });
  });

  it("puts the sentence on the one that did not run when the batch ended differently", () => {
    const frame = buildApprovalOutcome([
      { fingerprint: "a", ...classifySpentApproval(r({ success: true })) },
      { fingerprint: "b", ...classifySpentApproval(r({ success: false, error: "x" })) },
    ]);
    expect(frame.note).toBeUndefined();
    expect(frame.actions).toEqual([
      { fingerprint: "a", outcome: "ran" },
      { fingerprint: "b", outcome: "not_run", note: "It didn't go through." },
    ]);
  });

  it("returns an empty frame for no approvals", () => {
    expect(buildApprovalOutcome([])).toEqual({ actions: [] });
  });
});

describe("every sentence is one the operator can act on", () => {
  const keys: Array<Parameters<typeof classifyUnspentApproval>[0]> = ["ambiguous", "unclaimable", "lookup_failed", undefined];
  const spent = [{ needs_confirm: true }, { refused_before_run: true }, { success: false }, { outcome_unknown: true }];
  const notes = [
    ...keys.flatMap((k) => [1, 2].map((n) => buildApprovalOutcome(Array.from({ length: n }, (_, i) => ({ fingerprint: `f${i}`, ...classifyUnspentApproval(k) }))).note)),
    ...spent.flatMap((s) => [1, 2].map((n) => buildApprovalOutcome(Array.from({ length: n }, (_, i) => ({ fingerprint: `f${i}`, ...classifySpentApproval(r(s)) }))).note)),
  ];

  it("covers every reason", () => {
    expect(notes.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
  });

  it("carries no internal names, and names no control", () => {
    for (const note of notes) {
      expect(note).toMatch(/^[A-Z].*\.$/);
      expect(note).not.toMatch(/fingerprint|tool|rpc|confirmation|token|null|undefined|\bid\b/i);
      expect(note).not.toMatch(/\b(press|click|tap|button)\b|approve (it|them|one)/i);
    }
  });

  it("claims nothing changed only where nothing ran", () => {
    const failed = buildApprovalOutcome([{ fingerprint: "a", ...classifySpentApproval(r({ success: false })) }]).note!;
    const unknown = buildApprovalOutcome([{ fingerprint: "a", ...classifySpentApproval(r({ outcome_unknown: true })) }]).note!;
    expect(failed).not.toMatch(/nothing changed/i);
    expect(unknown).not.toMatch(/nothing changed/i);
  });
});

describe("an invocation is unknown only when the function's own answer never came back", () => {
  it("knows the outcome when crm-command answered, whatever it said", () => {
    expect(invokeOutcomeUnknown({ name: "FunctionsHttpError" }, { ok: false, outcome: "refused", code: "CRM_FORBIDDEN" })).toBe(false);
    expect(invokeOutcomeUnknown(null, { ok: true, outcome: "succeeded" })).toBe(false);
    expect(invokeOutcomeUnknown(null, {})).toBe(false);
  });

  it("does not know when the request failed in transit or the platform cut the function off", () => {
    expect(invokeOutcomeUnknown({ name: "FunctionsFetchError" }, {})).toBe(true);
    expect(invokeOutcomeUnknown({ name: "FunctionsRelayError" }, {})).toBe(true);
    expect(invokeOutcomeUnknown({ name: "FunctionsHttpError" }, { code: "WORKER_LIMIT", message: "Function exceeded" })).toBe(true);
  });

  it("carries crm-command's own 'could not confirm' through as data, and only that one", () => {
    const unproven = executorFailureSpeech("CRM_READBACK_UNAVAILABLE", [], "unproven");
    expect(unproven.outcome_unknown).toBe(true);
    expect(executorFailureSpeech("CRM_CONTACT_NOT_FOUND", [], "refused").outcome_unknown).toBeUndefined();
    // Exactly the tool result the chat's CRM door builds from that answer.
    const doorResult = r({ success: false, ok: false, outcome: "refused", code: "CRM_READBACK_UNAVAILABLE", ...unproven, error: "CRM_READBACK_UNAVAILABLE" });
    expect(classifySpentApproval(doorResult)).toEqual({ outcome: "unconfirmed", reason: "unconfirmed" });
  });

  it("tells the model the same thing the card says", () => {
    expect(OUTCOME_UNKNOWN_NOTE).toMatch(/could not confirm/);
    expect(OUTCOME_UNKNOWN_NOTE).not.toMatch(/nothing (was )?changed/i);
    expect(OUTCOME_UNKNOWN_NOTE).toMatch(/do NOT call this tool again/);
  });
});

describe("a thrown failure is unknown only when the answer never arrived", () => {
  it("knows the database answered when a code came back", () => {
    expect(thrownOutcomeUnknown({ code: "22P02", message: "invalid input syntax for type uuid" })).toBe(false);
    expect(thrownOutcomeUnknown({ code: "P0001", message: "ACTION_NOT_FOUND" })).toBe(false);
  });

  it("does not know when the transport failed", () => {
    expect(thrownOutcomeUnknown({ code: "", message: "TypeError: fetch failed" })).toBe(true);
    expect(thrownOutcomeUnknown(new TypeError("fetch failed"))).toBe(true);
    expect(thrownOutcomeUnknown(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
    expect(thrownOutcomeUnknown(Object.assign(new Error("slow"), { name: "TimeoutError" }))).toBe(true);
  });

  it("does not call a handler's own refusal unknown", () => {
    expect(thrownOutcomeUnknown(new Error("quote_required"))).toBe(false);
    expect(thrownOutcomeUnknown(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(thrownOutcomeUnknown("boom")).toBe(false);
    expect(thrownOutcomeUnknown({ message: "boom" })).toBe(false);
  });
});
