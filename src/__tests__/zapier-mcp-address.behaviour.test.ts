import { describe, it, expect } from "vitest";
import { zapierMcpAddressProblem } from "@/solo/settings-integrations";

const OLD = (v: string) => v.startsWith("https://mcp.zapier.com/api/mcp/");

describe("Zapier MCP address", () => {
  // The address Zapier hands out TODAY: /api/v1/connect, OAuth, and the copy-to-clipboard
  // form carries a query string. github.com/zapier/zapier-mcp documents this exact URL.
  const current = "https://mcp.zapier.com/api/v1/connect";
  // The legacy shape, still valid for servers created before the move. Secret in the path.
  const good = "https://mcp.zapier.com/api/mcp/s/ABC123xyz/mcp";

  it("accepts the address Zapier issues today", () =>
    expect(zapierMcpAddressProblem(current)).toBeNull());
  it("accepts it with the query Zapier's copy button appends (the reported failure)", () => {
    // Owner-reported: pasting this left the button dead on "Remove everything from the ?".
    // Nothing downstream is harmed -- the well-known URL is built from origin + pathname,
    // and the RFC 8707 resource indicator comes from Zapier's metadata, not this string.
    expect(zapierMcpAddressProblem(current + "?t=abc123")).toBeNull();
  });
  it("still accepts the legacy server address", () => expect(zapierMcpAddressProblem(good)).toBeNull());
  it("accepts one pasted with surrounding whitespace (the reported failure)", () => {
    const pasted = "  " + good + "\n";
    expect(zapierMcpAddressProblem(pasted)).toBeNull();
    expect(OLD(pasted)).toBe(false); // the old gate left the button dead here
  });
  it("accepts a capitalised host", () => {
    const caps = "https://MCP.ZAPIER.COM/api/mcp/s/ABC123xyz/mcp";
    expect(zapierMcpAddressProblem(caps)).toBeNull();
    expect(OLD(caps)).toBe(false); // and here
  });
  it("says why for a non-Zapier host", () =>
    expect(zapierMcpAddressProblem("https://example.com/api/mcp/s/x/mcp")).toMatch(/mcp\.zapier\.com/));
  it("says why for a Zapier link that is not an MCP server", () =>
    expect(zapierMcpAddressProblem("https://mcp.zapier.com/app/editor")).toMatch(/not an MCP server one/));
  it("says why for junk", () =>
    expect(zapierMcpAddressProblem("mcp server")).toMatch(/complete web address/));
  it("says why for a fragment, which is never sent to a server", () =>
    expect(zapierMcpAddressProblem(good + "#frag")).toMatch(/# onward/));
  it("stays quiet on an empty field", () => expect(zapierMcpAddressProblem("   ")).toBeNull());
});
