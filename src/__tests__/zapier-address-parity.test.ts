import { describe, it, expect } from "vitest";
import { zapierMcpAddressProblem } from "@/solo/settings-integrations";
// The server's rule, transcribed from tenant-mcp-connect/index.ts isZapierMcpAddress.
const SERVER = (v: string) => { try { const u=new URL(v);
  return u.protocol==="https:"&&u.hostname==="mcp.zapier.com"&&!u.username&&!u.password&&!u.hash&&(u.pathname.startsWith("/api/v1/")||u.pathname.startsWith("/api/mcp/"));
} catch { return false } };

describe("button and server agree on every shape", () => {
  const cases = [
    "https://mcp.zapier.com/api/v1/connect",
    "https://mcp.zapier.com/api/v1/connect?t=abc123",
    "  https://mcp.zapier.com/api/v1/connect?t=abc123\n",
    "https://MCP.ZAPIER.COM/api/v1/connect",
    "https://mcp.zapier.com/api/mcp/s/ABC/mcp",
    "https://mcp.zapier.com/app/editor",
    "https://mcp.zapier.com/api/v1/connect#frag",
    "https://evil.example/api/v1/connect",
    "http://mcp.zapier.com/api/v1/connect",
    "not a url",
  ];
  for (const c of cases) {
    it(`agrees on ${JSON.stringify(c)}`, () => {
      const buttonAccepts = zapierMcpAddressProblem(c) === null && c.trim() !== "";
      expect(buttonAccepts).toBe(SERVER(c.trim()));
    });
  }
});
