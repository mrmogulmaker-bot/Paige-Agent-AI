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

  it("does not invent inbound activity when none was received", () => {
    expect(sms(getSoloChannelTruth(activeSms, true, PREPARED)).inbound).toBe("No replies received");
    expect(sms(getSoloChannelTruth(activeSms, true, READY)).inbound).toBe("Replies received");
  });

  it("leaves every other channel untouched by SMS readiness", () => {
    const withR = getSoloChannelTruth(activeSms, true, READY);
    const without = getSoloChannelTruth(activeSms, true);
    for (const id of ["portal", "email", "voice", "video"]) {
      expect(withR.find((c) => c.id === id)).toEqual(without.find((c) => c.id === id));
    }
  });
});
