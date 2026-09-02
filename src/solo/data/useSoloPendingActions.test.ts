import { describe, it, expect } from "vitest";
import { toPendingAction } from "./useSoloPendingActions";

/**
 * The pure half of the pending-actions read — what a filed action is allowed to claim once the
 * two fabricated modals stopped claiming it for themselves.
 *
 * HONEST LIMIT OF THIS FILE (§13/§32): `TcApprove` and `TcEscalate` are module-private and only
 * reachable by clicking an orb on a WebGL-ish canvas, so unlike `TrustCompass` and `TeamHub` they
 * are not mount-tested. What is covered here is the coercion they render from, plus source
 * assertions in `compass.fabrications.test.ts` that the invented content is gone. Driving the
 * modals themselves is owed to a session that can drive the surface.
 */
describe("toPendingAction — a filed action must earn its modal", () => {
  const base = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    title: "Send the renewal note",
    summary: "Drafted, not sent.",
    draft_content: "Hi — quick note about your renewal.",
    decision_rationale: "It goes to a client, so it waits for you.",
    from_department: "marketing",
    created_at: "2026-09-01T11:00:00.000Z",
  };

  it("keeps the recorded fields and names the desk from its slug", () => {
    const a = toPendingAction(base);
    expect(a?.title).toBe("Send the renewal note");
    expect(a?.summary).toBe("Drafted, not sent.");
    expect(a?.draftContent).toBe("Hi — quick note about your renewal.");
    expect(a?.rationale).toBe("It goes to a client, so it waits for you.");
    expect(a?.department).toBe("Marketing");
  });

  it("names an unattributed desk rather than leaving it blank", () => {
    expect(toPendingAction({ ...base, from_department: null })?.department).toBe("Unattributed");
    expect(toPendingAction({ ...base, from_department: "not_a_desk" })?.department).toBe("Unattributed");
  });

  it("turns blank text into a stated absence, so the modal omits the block", () => {
    const a = toPendingAction({ ...base, summary: "  ", decision_rationale: "", draft_content: "   " });
    expect(a?.summary).toBeNull();
    expect(a?.rationale).toBeNull();
    expect(a?.draftContent).toBeNull();
  });

  it("refuses to render a non-string draft as prose", () => {
    // `draft_content` is jsonb on some rows. Stringifying an object would put a JSON blob in front
    // of an operator as though Paige had written it to a person.
    expect(toPendingAction({ ...base, draft_content: { subject: "x" } })?.draftContent).toBeNull();
    expect(toPendingAction({ ...base, draft_content: 42 })?.draftContent).toBeNull();
  });

  it("drops a row with no id or no usable title", () => {
    expect(toPendingAction({ ...base, id: undefined })).toBeNull();
    expect(toPendingAction({ ...base, title: undefined })).toBeNull();
    expect(toPendingAction({ ...base, title: "   " })).toBeNull();
    expect(toPendingAction(null)).toBeNull();
  });
});
