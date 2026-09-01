import { describe, it, expect } from "vitest";
import { railHistoryFilter, mergeRailHistory, type RailEvent } from "@/hooks/useRailEvents";

/**
 * The rail's history read, which did not exist until now.
 *
 * `useRailEvents` subscribed and nothing else, so every activity surface started EMPTY on every
 * mount and showed only what arrived while it was open. The durable rows were already being
 * written — an operator who opened the page a minute after Paige acted saw nothing, which reads as
 * "she has done nothing" rather than "you were not watching".
 *
 * Two decisions carry that fix and both are graded here: which column scopes the read, and how the
 * backfill merges with what is already live.
 */
const ev = (id: string, at: string): RailEvent => ({
  id, event_kind: "k", surface: "s", actor_type: "paige", audience: "owner",
  visibility: "owner_internal", title: `t-${id}`, summary: null, occurred_at: at, contact_id: null,
});

describe("railHistoryFilter — §9, the whole isolation decision for the backfill", () => {
  it("scopes a CLIENT feed by contact, never by tenant", () => {
    // A client feed narrowed by tenant would show one portal client every other client's events.
    expect(railHistoryFilter({ scope: "client", contactId: "c1" }, "c1"))
      .toEqual({ column: "contact_id", value: "c1" });
  });

  it("scopes a TENANT feed by tenant, never by contact", () => {
    // And the reverse mistake shows a staff surface almost nothing, which looks like "quiet".
    expect(railHistoryFilter({ scope: "tenant", tenantId: "t1" }, "t1"))
      .toEqual({ column: "tenant_id", value: "t1" });
  });

  it("filters on the id it was given, not on one carried in the options", () => {
    // The effect resolves the id once, through `resolveTopic`, and the subscription and the read
    // must use that SAME id. Reading a second copy off the options is how the two drift apart.
    expect(railHistoryFilter({ scope: "client", contactId: "stale" }, "resolved").value).toBe("resolved");
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
