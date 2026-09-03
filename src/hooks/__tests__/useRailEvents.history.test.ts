import { describe, it, expect } from "vitest";
import {
  railHistoryRequest,
  classifyRailReadError,
  mergeRailHistory,
  type RailEvent,
} from "@/hooks/useRailEvents";

/**
 * The rail's history read, which did not exist until now.
 *
 * `useRailEvents` subscribed and nothing else, so every activity surface started EMPTY on every
 * mount and showed only what arrived while it was open. The durable rows were already being
 * written — an operator who opened the page a minute after Paige acted saw nothing, which reads as
 * "she has done nothing" rather than "you were not watching".
 *
 * Two decisions carry that fix and both are graded here: which DEPLOYED RESOLVER answers a scope,
 * and how the backfill merges with what is already live.
 *
 * The read used to be `.from("paige_client_events").eq(column, id)` and the decision graded here
 * used to be WHICH COLUMN. It is now which resolver, because the scope moved into the database:
 * `get_solo_rail_activity` takes no tenant argument at all, and `get_client_rail` refuses a
 * contact the caller is not entitled to rather than filtering to nothing. A column choice that
 * relies on a policy to be safe is one policy change away from being the leak; a resolver that
 * raises 42501 is not.
 */
const ev = (id: string, at: string): RailEvent => ({
  id, event_kind: "k", surface: "s", actor_type: "paige", audience: "owner",
  visibility: "owner_internal", title: `t-${id}`, summary: null, occurred_at: at, contact_id: null,
});

describe("railHistoryRequest — §9, the whole isolation decision for the backfill", () => {
  it("sends a CLIENT feed to get_client_rail, at the CLIENT lens", () => {
    // The client lens is the narrower projection: the resolver nulls actor_user_id, the department
    // columns, ref_table and ref_id, returns payload as {}, and admits only client-visible rows.
    // Asking for a wider lens from a client surface would be asking the server for data this
    // component has no business rendering.
    expect(railHistoryRequest({ scope: "client", contactId: "c1" }, "c1", 50)).toEqual({
      fn: "get_client_rail",
      args: { p_contact_id: "c1", p_limit: 50, p_lens: "client" },
    });
  });

  it("sends a TENANT feed to get_solo_rail_activity, and passes NO tenant id", () => {
    // This is the property that matters, not the function name: there is no tenant argument to
    // get wrong, and no tenant argument a caller could substitute. The resolver reads
    // current_user_tenant_id() and checks membership OF THAT workspace.
    const req = railHistoryRequest({ scope: "tenant", tenantId: "t1" }, "t1", 50);
    expect(req.fn).toBe("get_solo_rail_activity");
    expect(req.args).toEqual({ p_limit: 50 });
    expect(JSON.stringify(req)).not.toContain("t1");
  });

  it("passes the id it was given, not one carried in the options", () => {
    // The effect resolves the id once, through `resolveTopic`, and the subscription and the read
    // must use that SAME id. Reading a second copy off the options is how the two drift apart.
    const req = railHistoryRequest({ scope: "client", contactId: "stale" }, "resolved", 50);
    expect(req.fn === "get_client_rail" && req.args.p_contact_id).toBe("resolved");
  });
});

describe("classifyRailReadError — a refusal is not an outage", () => {
  it("reads SQLSTATE 42501 as a refusal", () => {
    // Every Rail reader raises exactly this. PostgREST surfaces it as `code`.
    expect(classifyRailReadError({ code: "42501", message: "RAIL_FORBIDDEN" })).toBe("forbidden");
  });

  it("still reads a refusal when only the message survives the transport", () => {
    // A layer that drops the code must not silently downgrade "you may not see this" into
    // "the server is having trouble" — they mean different things to the person reading it.
    expect(classifyRailReadError({ message: 'RAIL_FORBIDDEN' })).toBe("forbidden");
  });

  it("reads anything else as an outage rather than assuming a permission problem", () => {
    expect(classifyRailReadError({ message: "Failed to fetch" })).toBe("unavailable");
    expect(classifyRailReadError({ code: "57014", message: "canceling statement" })).toBe("unavailable");
    expect(classifyRailReadError(null)).toBe("unavailable");
  });
});

describe("mergeRailHistory — history goes under live, deduped", () => {
  it("returns history when nothing is live yet (the ordinary mount)", () => {
    const h = [ev("a", "2026-09-01T03:00:00Z"), ev("b", "2026-09-01T02:00:00Z")];
    expect(mergeRailHistory([], h).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps a live frame ABOVE the history it raced", () => {
    // Anything that arrived while the read was in flight is newer than every row it returns.
    const live = [ev("live", "2026-09-01T04:00:00Z")];
    const h = [ev("a", "2026-09-01T03:00:00Z")];
    expect(mergeRailHistory(live, h).map((e) => e.id)).toEqual(["live", "a"]);
  });

  it("does NOT double an event that arrived both live and in the history", () => {
    // `record_rail_event` broadcasts and persists in one call, so the same event reaches the hook
    // both ways and the two race either direction. This is the case that shows a doubled line
    // exactly when someone is watching.
    const live = [ev("same", "2026-09-01T04:00:00Z")];
    const h = [ev("same", "2026-09-01T04:00:00Z"), ev("older", "2026-09-01T01:00:00Z")];
    const out = mergeRailHistory(live, h);
    expect(out.map((e) => e.id)).toEqual(["same", "older"]);
    expect(out.filter((e) => e.id === "same")).toHaveLength(1);
  });

  it("caps the merged list, keeping the newest end", () => {
    const live = [ev("L", "2026-09-01T09:00:00Z")];
    const h = Array.from({ length: 10 }, (_, i) => ev(`h${i}`, `2026-09-01T0${i}:00:00Z`));
    const out = mergeRailHistory(live, h, 3);
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe("L");
  });

  it("is a no-op on empty history rather than clearing what is live", () => {
    const live = [ev("live", "2026-09-01T04:00:00Z")];
    expect(mergeRailHistory(live, []).map((e) => e.id)).toEqual(["live"]);
  });
});
