import { describe, expect, it } from "vitest";
import { getSoloChannelTruth, type SoloCommsReadinessEvidence } from "./soloConversationModel";

const activeSms = [{ channel_type: "sms", active: true, status: "active", from_address: "+15550001111", provider: "twilio" }] as never;
const sms = (t: ReturnType<typeof getSoloChannelTruth>) => t.find((c) => c.id === "sms")!;

const READY: SoloCommsReadinessEvidence = {
  can_send_sms: true, a2p: "approved", number_e164: "+15550001111",
  delivery: { state: "delivering", last_inbound_at: "2026-08-29T12:00:00Z" },
};
const PREPARED: SoloCommsReadinessEvidence = {
  can_send_sms: false, a2p: "prepared", number_e164: "+15550001111",
  delivery: { state: "no_activity", last_inbound_at: null },
};

describe("Conversations channel disclosure, fed by the canonical resolver", () => {
  it("still reports nothing when no readiness is supplied", () => {
    // The pre-existing contract: connector presence alone proves nothing.
    const c = sms(getSoloChannelTruth(activeSms));
    expect(c.sendPermission).toBe("Not reported");
    expect(c.a2p).toBe("Not reported");
    expect(c.webhookHealth).toBe("Not reported");
    expect(c.operationalHealth).toBe("Not reported");
  });

  it("reports send permission from readiness, not from the connector", () => {
    expect(sms(getSoloChannelTruth(activeSms, true, READY)).sendPermission).toBe("Permitted to send");
    expect(sms(getSoloChannelTruth(activeSms, true, PREPARED)).sendPermission).toBe("Not permitted — setup incomplete");
  });

  it("never calls a prepared registration submitted or in review", () => {
    const c = sms(getSoloChannelTruth(activeSms, true, PREPARED));
    expect(c.a2p).toBe("Prepared, not submitted");
    expect(c.a2p.toLowerCase()).not.toContain("in review");
  });

  it("distinguishes filed from approved", () => {
    expect(sms(getSoloChannelTruth(activeSms, true, { ...PREPARED, a2p: "submitted" })).a2p).toBe("Filed with carriers");
    expect(sms(getSoloChannelTruth(activeSms, true, READY)).a2p).toBe("Approved");
  });

  it("STILL does not claim webhook health, because nothing records it", () => {
    // The one field readiness deliberately does not fill. If this ever starts
    // reporting, a real health record must exist behind it.
    expect(sms(getSoloChannelTruth(activeSms, true, READY)).webhookHealth).toBe("Not reported");
  });

  /**
   * This test previously asserted "No replies received" and, via a fabricated
   * `last_inbound_at`, a "Replies received" branch production cannot reach — so
   * a green suite locked a surface that lied to every tenant. Replies are not
   * reportable: nothing writes an inbound SMS row to `public.messages`, which is
   * the only thing `last_inbound_at` reads.
   */
  it("never claims replies either way while the resolver says they are unreportable", () => {
    expect(sms(getSoloChannelTruth(activeSms, true, PREPARED)).inbound).toBe("Not reported");
    expect(sms(getSoloChannelTruth(activeSms, true, READY)).inbound).toBe("Not reported");
  });

  it("does not claim replies even when a timestamp is present but reporting is unavailable", () => {
    // The exact shape production returns for a tenant who IS receiving replies:
    // a stamp could only appear by accident, and the guard still governs.
    const withStamp = { ...READY, inbound_reporting: "unavailable" as const,
      delivery: { ...READY.delivery, last_inbound_at: "2026-08-29T12:00:00Z" } };
    expect(sms(getSoloChannelTruth(activeSms, true, withStamp)).inbound).toBe("Not reported");
  });

  it("reports replies ONLY when the resolver says inbound reporting is available", () => {
    // Non-vacuity: the branch is reachable, so the assertions above are testing
    // the guard rather than a code path that can never report anything.
    const live = { ...READY, inbound_reporting: "available" as const };
    expect(sms(getSoloChannelTruth(activeSms, true, live)).inbound).toBe("Replies received");
    const quiet = { ...live, delivery: { ...live.delivery, last_inbound_at: null } };
    expect(sms(getSoloChannelTruth(activeSms, true, quiet)).inbound).toBe("No replies received");
  });

  it("never reports a delivery failure that nothing actually failed", () => {
    // `awaiting_receipts` — sent, but not one receipt back — was missing from the
    // type, so it fell into the final `else` and rendered "Messages are not
    // arriving" on an account with ZERO failures. A negative asserted from the
    // absence of evidence, in the same file as the reply-claim repair above.
    const awaiting = { ...READY,
      delivery: { ...READY.delivery, state: "awaiting_receipts" as const,
        sent_30d: 7, delivered_30d: 0, failed_30d: 0 } };
    const health = sms(getSoloChannelTruth(activeSms, true, awaiting)).operationalHealth;
    expect(health).toBe("Sent, no delivery confirmations yet");
    expect(health).not.toContain("not arriving");

    // Non-vacuity: a state that genuinely IS failing still says so.
    const failing = { ...READY,
      delivery: { ...READY.delivery, state: "failing" as const,
        sent_30d: 7, delivered_30d: 0, failed_30d: 7 } };
    expect(sms(getSoloChannelTruth(activeSms, true, failing)).operationalHealth)
      .toBe("Messages are not arriving");

    // An unrecognised state is not evidence of anything either.
    const unknown = { ...READY,
      delivery: { ...READY.delivery, state: "something_new" as unknown as "delivering" } };
    expect(sms(getSoloChannelTruth(activeSms, true, unknown)).operationalHealth).toBe("Not reported");
  });

  it("leaves every other channel untouched by SMS readiness", () => {
    const withR = getSoloChannelTruth(activeSms, true, READY);
    const without = getSoloChannelTruth(activeSms, true);
    for (const id of ["portal", "email", "voice", "video"]) {
      expect(withR.find((c) => c.id === id)).toEqual(without.find((c) => c.id === id));
    }
  });
});
