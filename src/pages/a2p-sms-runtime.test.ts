import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("platform A2P runtime boundaries", () => {
  it("gates operator sends on platform-only durable consent and registered framing", () => {
    const source = read("supabase/functions/paige-operator-sms-send/index.ts");
    expect(source).toContain('formatPaigeAgentAiSms({');
    expect(source).toContain('.is("tenant_id", null)');
    expect(source).toContain('.is("contact_id", null)');
    expect(source).toContain('.is("revoked_at", null)');
    expect(source).toContain('reason: "platform_sms_consent_required"');
    expect(source).not.toContain("STOP_SUFFIX");
  });

  it("fails closed when legacy send classes do not match the platform Campaign", () => {
    const source = read("supabase/functions/send-sms/index.ts");
    expect(source).toContain("PLATFORM_ACCOUNT_NOTIFICATION_TYPES");
    expect(source).toContain("campaign_not_registered");
    expect(source).toContain("platform_sms_consent_required");
    expect(source).toContain("formatPaigeAgentAiSms({");
  });

  it("persists STOP and START while suppressing duplicate Advanced Opt-Out replies", () => {
    for (const path of [
      "supabase/functions/paige-operator-sms-inbound/index.ts",
      "supabase/functions/twilio-inbound-webhook/index.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("OptOutType");
      expect(source).toContain("revoked_at");
      expect(source).toContain("sms_start_keyword");
      expect(source).toMatch(/if \(optOutType\) return twiml\(\)/);
    }
  });
});
