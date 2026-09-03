import { describe, expect, it } from "vitest";
import {
  buildTeamAuthorityBlock,
  loadTeamAuthorityForChat,
  renderTeamAuthorityForChat,
  type TeamAuthorityEvidence,
} from "@/../supabase/functions/_shared/paige-spine/domains/teamAuthorityChatEvidence.ts";

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

const fakeClient = (data: unknown, error: unknown = null): RpcClient => ({
  rpc: async () => ({ data, error }),
});

const OWNER_ROWS = [
  { fact_key: "viewer_permission", value: "owner", status: "available", source: "team", reason: null },
  { fact_key: "viewer_is_legal_owner", value: "true", status: "available", source: "team", reason: null },
];

// The split caller from the pgTAP proof: a legal owner of ANOTHER workspace, holding a plain member
// seat here. Their two facts disagree, which is what makes a collapse visible.
const SPLIT_ROWS = [
  { fact_key: "viewer_permission", value: "member", status: "available", source: "team", reason: null },
  { fact_key: "viewer_is_legal_owner", value: "false", status: "available", source: "team", reason: null },
];

const REFUSED_ROWS = [
  { fact_key: "viewer_permission", value: null, status: "unavailable", source: null, reason: "not permitted for this account" },
  { fact_key: "viewer_is_legal_owner", value: null, status: "unavailable", source: null, reason: "not permitted for this account" },
];

describe("team.authority chat evidence", () => {
  it("renders the two facts separately, each in its own line", async () => {
    const evidence = await loadTeamAuthorityForChat(fakeClient(OWNER_ROWS));
    expect(evidence.status).toBe("available");
    const block = renderTeamAuthorityForChat(evidence);
    expect(block).toContain("Seat role: their seat role is Owner.");
    expect(block).toContain("Legal ownership: they ARE the legal owner of this workspace.");
  });

  it("keeps a member seat and a false ownership distinct — the collapse this capability exists to prevent", async () => {
    const block = renderTeamAuthorityForChat(await loadTeamAuthorityForChat(fakeClient(SPLIT_ROWS)));
    expect(block).toContain("their seat role is Member.");
    expect(block).toContain("they are NOT the legal owner");
    // A collapse would have promoted this caller to owner on one line or the other.
    expect(block).not.toContain("ARE the legal owner");
    expect(block).not.toContain("seat role is Owner.");
  });

  it("tells the model, in words, not to merge the two facts or infer billing from either", () => {
    const block = renderTeamAuthorityForChat({ status: "available", rows: OWNER_ROWS as never });
    expect(block).toContain("TWO SEPARATE facts");
    expect(block).toContain("not a billing permission");
  });

  it("renders NOTHING when every row is refused, so a seatless caller learns nothing", async () => {
    const evidence = await loadTeamAuthorityForChat(fakeClient(REFUSED_ROWS));
    expect(evidence.status).toBe("not_permitted");
    expect(renderTeamAuthorityForChat(evidence)).toBe("");
  });

  it("does NOT treat a partial refusal as a refusal", async () => {
    const evidence = await loadTeamAuthorityForChat(
      fakeClient([OWNER_ROWS[0], REFUSED_ROWS[1]]),
    );
    expect(evidence.status).toBe("available");
    expect(renderTeamAuthorityForChat(evidence)).toContain("their seat role is Owner.");
  });

  it("distinguishes a refusal from a read that failed", async () => {
    // Same 'unavailable' status, a DIFFERENT reason — this is a broken read, not a refusal, so it
    // must still render the honest block rather than silently vanishing.
    const rows = REFUSED_ROWS.map((row) => ({ ...row, reason: "workspace not resolved" }));
    const evidence = await loadTeamAuthorityForChat(fakeClient(rows));
    expect(evidence.status).toBe("available");
    expect(renderTeamAuthorityForChat(evidence)).toContain("not readable");
  });

  it("degrades honestly on an rpc error, an empty result, and a throw", async () => {
    for (const client of [
      fakeClient(null, { message: "boom" }),
      fakeClient([]),
      { rpc: async () => { throw new Error("network"); } } as RpcClient,
    ]) {
      const block = renderTeamAuthorityForChat(await loadTeamAuthorityForChat(client));
      expect(block).toContain("Status: UNAVAILABLE");
      expect(block).not.toContain("ARE the legal owner");
    }
  });

  it("never emits a name, an email, a user id, or a count", () => {
    const block = renderTeamAuthorityForChat({ status: "available", rows: OWNER_ROWS as never });
    expect(block).not.toMatch(/@/);
    expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(block).not.toMatch(/\b\d+\s+(member|invitation)/i);
  });

  it("builds the block end to end", async () => {
    expect(await buildTeamAuthorityBlock(fakeClient(OWNER_ROWS))).toContain("Seat role");
  });
});
