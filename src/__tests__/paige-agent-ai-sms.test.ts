import { describe, expect, it } from "vitest";

import { formatPaigeAgentAiSms } from "../../supabase/functions/_shared/paige-agent-ai-sms";

describe("Paige Agent AI A2P SMS framing", () => {
  it("frames the registered brand, full canonical URL, and HELP/STOP tail exactly", () => {
    expect(formatPaigeAgentAiSms({
      body: "Your billing settings are ready",
      url: "https://paigeagent.ai/solo/1971670/settings/billing",
    })).toBe(
      "Paige Agent AI: Your billing settings are ready. https://paigeagent.ai/solo/1971670/settings/billing. Reply HELP for help or STOP to opt out.",
    );
  });

  it.each([
    "http://paigeagent.ai/solo/1971670/settings/billing",
    "https://paigeagent.ai/admin/setup/billing",
    "https://bit.ly/paige-billing",
    "https://example.com/solo/1971670/settings/billing",
  ])("rejects noncompliant or non-brand URLs: %s", (url) => {
    expect(() => formatPaigeAgentAiSms({ body: "Open billing", url })).toThrow();
  });

  it("rejects an empty body", () => {
    expect(() => formatPaigeAgentAiSms({
      body: "   ",
      url: "https://paigeagent.ai/operator/fleet/systems-check",
    })).toThrow("body_required");
  });
});
