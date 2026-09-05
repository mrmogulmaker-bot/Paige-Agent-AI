import { describe, it, expect } from "vitest";
import { zapierMcpAddressProblem } from "@/solo/settings-integrations";

const OLD = (v: string) => v.startsWith("https://mcp.zapier.com/api/mcp/");

describe("Zapier MCP address", () => {
  const good = "https://mcp.zapier.com/api/mcp/s/ABC123xyz/mcp";
  it("accepts a real address", () => expect(zapierMcpAddressProblem(good)).toBeNull());
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
    expect(zapierMcpAddressProblem("https://mcp.zapier.com/app/editor")).toMatch(/not an MCP server address/));
  it("says why for junk", () =>
    expect(zapierMcpAddressProblem("mcp server")).toMatch(/complete web address/));
  it("says why for a query string the server would reject", () =>
    expect(zapierMcpAddressProblem(good + "?k=1")).toMatch(/\? or #/));
  it("stays quiet on an empty field", () => expect(zapierMcpAddressProblem("   ")).toBeNull());
});
