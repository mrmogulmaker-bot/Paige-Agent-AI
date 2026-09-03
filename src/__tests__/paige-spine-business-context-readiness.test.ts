import { describe, expect, it } from "vitest";
import {
  buildBusinessContextReadinessBlock,
  loadBusinessContextReadinessForChat,
  renderBusinessContextReadinessForChat,
  type BusinessContextReadinessEvidence,
} from "@/../supabase/functions/_shared/paige-spine/domains/businessContextChatEvidence.ts";

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

const fakeClient = (data: unknown, error: unknown = null): RpcClient => ({
  rpc: async () => ({ data, error }),
});

const AVAILABLE_ROWS = [
  { field_key: "website", status: "owner_confirmed", source: "setup", as_of: "2026-09-01T00:00:00Z", reason: null },
  { field_key: "business_phone", status: "invalid_format", source: "setup", as_of: null, reason: null },
  { field_key: "industry", status: "needs_confirmation", source: null, as_of: null, reason: null },
  { field_key: "primary_business_email", status: "connection_sourced", source: "connections", as_of: null, reason: null },
];

describe("business_context.readiness — Chat evidence", () => {
  it("loads and renders confirmed / invalid / missing / connection-sourced honestly, never crossing statuses", async () => {
    const evidence = await loadBusinessContextReadinessForChat(fakeClient(AVAILABLE_ROWS));
    expect(evidence.status).toBe("available");
    const block = renderBusinessContextReadinessForChat(evidence);
    expect(block).toContain("Website: confirmed in Setup (as of 2026-09-01T00:00:00Z).");
    expect(block).toContain("Business phone: entered in Setup, but does not look like a valid value");
    expect(block).toContain("Industry: not entered yet — the owner has not saved this in Setup.");
    expect(block).toContain("Primary business email: present from a connected account, but not yet confirmed");
    // The confirmed field's own sentence must never leak into another field's line.
    const industryLine = block.split("\n").find((l) => l.startsWith("- Industry"));
    expect(industryLine).not.toContain("confirmed in Setup");
  });

  it("degrades honestly on an RPC error — never fabricates a status for any field", async () => {
    const evidence = await loadBusinessContextReadinessForChat(fakeClient(null, { message: "boom" }));
    expect(evidence.status).toBe("unavailable");
    const block = renderBusinessContextReadinessForChat(evidence);
    expect(block).toContain("Status: UNAVAILABLE");
    expect(block).not.toMatch(/owner_confirmed|confirmed in Setup/);
  });

  it("degrades honestly when the RPC returns no rows at all", async () => {
    const evidence = await loadBusinessContextReadinessForChat(fakeClient([]));
    expect(evidence.status).toBe("unavailable");
  });

  it("degrades honestly when the client throws", async () => {
    const throwingClient: RpcClient = { rpc: async () => { throw new Error("network"); } };
    const evidence = await loadBusinessContextReadinessForChat(throwingClient);
    expect(evidence.status).toBe("unavailable");
  });

  it("never renders a raw value — only the four field labels and their status sentences", () => {
    const evidence: BusinessContextReadinessEvidence = { status: "available", rows: AVAILABLE_ROWS as never };
    const block = renderBusinessContextReadinessForChat(evidence);
    // The narrow contract's own promise: no URL, no phone digits, no email address ever appears.
    expect(block).not.toMatch(/https?:\/\//);
    expect(block).not.toMatch(/@/);
    expect(block).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
  });

  it("renders NOTHING when the role gate refused the caller — a client must not be told their coach's setup is unreadable", async () => {
    const refused = ["website", "business_phone", "industry", "primary_business_email"].map((field_key) => ({
      field_key, status: "unavailable", source: null, as_of: null, reason: "not permitted for this account",
    }));
    const evidence = await loadBusinessContextReadinessForChat(fakeClient(refused));
    expect(evidence.status).toBe("not_permitted");
    expect(renderBusinessContextReadinessForChat(evidence)).toBe("");
  });

  it("a genuine read failure still renders the honest block — refusal and failure are not collapsed", async () => {
    const unresolved = ["website", "business_phone", "industry", "primary_business_email"].map((field_key) => ({
      field_key, status: "unavailable", source: null, as_of: null, reason: "workspace not resolved",
    }));
    const evidence = await loadBusinessContextReadinessForChat(fakeClient(unresolved));
    expect(evidence.status).toBe("available");
    expect(renderBusinessContextReadinessForChat(evidence)).toContain("could not be read right now");
  });

  it("a PARTIAL refusal is never treated as a refusal — one real row means the block renders", async () => {
    const mixed = [
      { field_key: "website", status: "owner_confirmed", source: "setup", as_of: null, reason: null },
      ...["business_phone", "industry", "primary_business_email"].map((field_key) => ({
        field_key, status: "unavailable", source: null, as_of: null, reason: "not permitted for this account",
      })),
    ];
    const evidence = await loadBusinessContextReadinessForChat(fakeClient(mixed));
    expect(evidence.status).toBe("available");
    expect(renderBusinessContextReadinessForChat(evidence)).toContain("Website: confirmed in Setup");
  });

  it("buildBusinessContextReadinessBlock composes load + render end to end", async () => {
    const block = await buildBusinessContextReadinessBlock(fakeClient(AVAILABLE_ROWS));
    expect(block).toContain("BUSINESS CONTEXT READINESS");
    expect(block).toContain("Website: confirmed in Setup");
  });
});
