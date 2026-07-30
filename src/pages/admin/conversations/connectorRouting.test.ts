import { describe, expect, it } from "vitest";
import { selectComposeConnector } from "./connectorRouting";

const connectors = [
  { id: "managed", channel_type: "email" as const, from_address: "tenant@mail.paigeagent.ai" },
  { id: "custom", channel_type: "email" as const, from_address: "hello@tenant.com" },
  { id: "sms", channel_type: "sms" as const, from_address: "+15551234567" },
];

describe("selectComposeConnector", () => {
  it("preserves the exact managed sender", () => {
    expect(selectComposeConnector(connectors, "managed", "email")?.from_address)
      .toBe("tenant@mail.paigeagent.ai");
  });

  it("preserves the exact custom sender when another email connector exists", () => {
    expect(selectComposeConnector(connectors, "custom", "email")?.from_address)
      .toBe("hello@tenant.com");
  });

  it("rejects a missing connector instead of falling back to the first sender", () => {
    expect(selectComposeConnector(connectors, "missing", "email")).toBeNull();
  });

  it("rejects a connector whose channel does not match the selected channel", () => {
    expect(selectComposeConnector(connectors, "sms", "email")).toBeNull();
  });
});
