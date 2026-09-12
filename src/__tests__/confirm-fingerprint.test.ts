/**
 * Approval-fingerprint stability — the P0 approval-loop regression (dismissing a batch of drafts).
 *
 * THE DEFECT: `confirmFingerprint` hashed every arg except `confirm`, so it included the
 * model-authored `decision_rationale` note on `action_advance`. On the approval turn the model
 * re-emits the dismissal with a rephrased/omitted rationale (its own tool description tells it "you
 * do not need to reproduce the other arguments exactly"), so the re-derived fingerprint DRIFTED, the
 * card's exact-match missed, and a batch of 3 dismissals could never be approved — it re-proposed a
 * fresh card forever.
 *
 * THE FIX: a narrow, per-tool, reviewed NON_IDENTITY_ARGS allowlist drops such non-identity free-text
 * from the hash (the way `confirm` is dropped). The action's IDENTITY — action_id + to_status — stays
 * in the hash, so a changed target or status still refuses. These assertions pin both halves.
 *
 * REAL CODE: the shipped `_shared/confirm-fingerprint.ts`, the same module the Chat gate imports.
 */
import { describe, it, expect } from "vitest";
import {
  confirmFingerprint,
  NON_IDENTITY_ARGS,
} from "../../supabase/functions/_shared/confirm-fingerprint.ts";

const dismiss = (over: Record<string, unknown> = {}) => ({
  action_id: "424b85ac", to_status: "dismissed", ...over,
});

describe("the fingerprint is invariant to non-identity model free-text (the loop fix)", () => {
  it("is identical whether decision_rationale is present, absent, or reworded", async () => {
    const withNote = await confirmFingerprint("action_advance", dismiss({ decision_rationale: "owner asked to clear these" }));
    const noNote = await confirmFingerprint("action_advance", dismiss());
    const reworded = await confirmFingerprint("action_advance", dismiss({ decision_rationale: "clearing per the owner" }));
    expect(withNote).toBe(noNote);
    expect(reworded).toBe(noNote);
  });

  it("still drops `confirm` (the handshake), so the approval turn matches the proposal turn", async () => {
    const proposed = await confirmFingerprint("action_advance", dismiss());
    const approved = await confirmFingerprint("action_advance", dismiss({ confirm: true }));
    expect(approved).toBe(proposed);
  });

  it("the whole batch: each of the 3 dismissals keeps a stable identity across rationale drift", async () => {
    // The exact scenario from the P0: dismiss 424b85ac / 61a7cf78 / 45191f24.
    for (const id of ["424b85ac", "61a7cf78", "45191f24"]) {
      const turn1 = await confirmFingerprint("action_advance", dismiss({ action_id: id, decision_rationale: "first phrasing" }));
      const turn2 = await confirmFingerprint("action_advance", dismiss({ action_id: id, confirm: true, decision_rationale: "" }));
      expect(turn2, `action ${id} must re-derive the same fingerprint on the approval turn`).toBe(turn1);
    }
  });
});

describe("the fingerprint still VARIES by the fields that define the action's identity", () => {
  it("differs per action_id — three dismissals are three distinct fingerprints, never one", async () => {
    const fps = await Promise.all(
      ["424b85ac", "61a7cf78", "45191f24"].map((id) => confirmFingerprint("action_advance", dismiss({ action_id: id }))),
    );
    expect(new Set(fps).size).toBe(3);
  });

  it("differs when to_status changes (dismiss vs execute is not the same approved action)", async () => {
    const dismissed = await confirmFingerprint("action_advance", dismiss({ to_status: "dismissed" }));
    const executing = await confirmFingerprint("action_advance", dismiss({ to_status: "executing" }));
    expect(executing).not.toBe(dismissed);
  });
});

describe("the ignore-set is NARROW — it never swallows a consequential parameter", () => {
  it("only action_advance is listed, and only for decision_rationale", () => {
    expect(Object.keys(NON_IDENTITY_ARGS)).toEqual(["action_advance"]);
    expect(NON_IDENTITY_ARGS.action_advance).toEqual(["decision_rationale"]);
  });

  it("a tool with no ignore-set hashes ALL its args (a drifting field there correctly refuses)", async () => {
    // crm_create_contact has no NON_IDENTITY_ARGS entry, so every field it carries is identity.
    const a = await confirmFingerprint("crm_create_contact", { first_name: "A", email: "a@example.com" });
    const b = await confirmFingerprint("crm_create_contact", { first_name: "A", email: "B@example.com" });
    expect(b).not.toBe(a); // a changed email MUST change the fingerprint → the card re-confirms
  });

  it("decision_rationale is NOT ignored for a tool that is not on the list", async () => {
    // Proves the exclusion is keyed per-tool, not a blanket 'drop decision_rationale everywhere'.
    const x = await confirmFingerprint("some_other_tool", { action_id: "z", decision_rationale: "one" });
    const y = await confirmFingerprint("some_other_tool", { action_id: "z", decision_rationale: "two" });
    expect(y).not.toBe(x);
  });
});
