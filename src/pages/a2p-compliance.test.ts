import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const disclosure =
  "I agree to receive account and service text messages from Paige Agent AI at the mobile number I provided. Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See our";
const privacyCarveOut =
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Information sharing to subcontractors in support services, such as customer service, is permitted. All other use case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.";

describe("A2P public compliance surfaces", () => {
  it("keeps the mandated signup disclosure in the interactive and no-JS surfaces", () => {
    expect(read("src/pages/Auth.tsx")).toContain(disclosure);
    expect(read("auth.html")).toContain(disclosure);
    expect(read("src/pages/Auth.tsx")).toContain('checked={consentSms}');
  });

  it("keeps the mandated mobile privacy carve-out in the interactive and no-JS surfaces", () => {
    expect(read("src/pages/Privacy.tsx")).toContain(privacyCarveOut);
    expect(read("privacy.html")).toContain(privacyCarveOut);
  });

  it("publishes route-specific no-JS documents before the SPA catch-all", () => {
    const config = JSON.parse(read("vercel.json")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    expect(config.rewrites.slice(0, 3)).toEqual([
      { source: "/privacy", destination: "/privacy.html" },
      { source: "/sms-terms", destination: "/sms-terms.html" },
      { source: "/auth", destination: "/auth.html" },
    ]);
  });

  it("does not use unsupported public compliance or security guarantees", () => {
    const publicCopy = [
      read("src/pages/Privacy.tsx"),
      read("src/pages/Terms.tsx"),
      read("src/components/landing/Footer.tsx"),
    ].join("\n");
    expect(publicCopy).not.toMatch(/CCPA\/CPRA compliant|enterprise-grade security|can never|in accordance with US TCPA and CTIA/i);
  });
});
