/**
 * The cross-account guard behind Connections → Calendars, proven rather than reasoned about.
 *
 * This rule decides whether a write is allowed to land, so "it is structurally
 * correct" is not evidence. Every clause below is exercised directly, and each
 * one is load-bearing: neutering it fails a named test here.
 *
 * The four claims, and the defects each came from — all three were real, all
 * three were caught by independent review on this PR:
 *
 *  1. the tenant and its address come from ONE snapshot   (a stamp that lied)
 *  2. an A→B move cannot make A's rows read as current    (the leak)
 *  3. a reload scoped to a departed account refuses       (`disconnect` reload)
 *  4. and the guard fails the tests when perturbed        (the oracle is real)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { identityFor, isStale, reloadIsCurrent, type RosterEntry } from "./account-identity";

/** Two accounts that exist at once — the situation the whole rule is about. */
const A = { id: "tenant-a-uuid", account_number: 1971670 };
const B = { id: "tenant-b-uuid", account_number: 2000000 };
const ROSTER: RosterEntry[] = [A, B];

describe("identityFor — the tenant and its address come from one snapshot", () => {
  it("returns the address OF the tenant asked for, never of whoever is active", () => {
    // The defect this replaces read the id from the closure a load was scoped to
    // and the address from a ref of the current account, so A's rows could be
    // stamped with B's address. Asking for A can only ever answer with A.
    expect(identityFor(A.id, ROSTER)).toEqual({ tenantId: A.id, accountNumber: 1971670 });
    expect(identityFor(B.id, ROSTER)).toEqual({ tenantId: B.id, accountNumber: 2000000 });
  });

  it("cannot pair one account's id with another's address, for any pair in the roster", () => {
    // Stated as an invariant over the whole roster rather than two examples: no
    // input produces a mismatched pair, because there is only one lookup.
    for (const entry of ROSTER) {
      const identity = identityFor(entry.id, ROSTER);
      expect(identity.tenantId).toBe(entry.id);
      expect(identity.accountNumber).toBe(entry.account_number);
      const others = ROSTER.filter((t) => t.id !== entry.id);
      for (const other of others) expect(identity.accountNumber).not.toBe(other.account_number);
    }
  });

  it("reports no address rather than guessing, when the tenant is not in the roster", () => {
    expect(identityFor("tenant-not-listed", ROSTER)).toEqual({
      tenantId: "tenant-not-listed", accountNumber: null,
    });
  });

  it("survives a context that hands back no roster at all", () => {
    // Not hypothetical: the render harness returns an active tenant and no list,
    // and an unguarded lookup threw there — the surface rendered nothing while
    // types, tests, lint and build were all green.
    expect(identityFor(A.id, undefined)).toEqual({ tenantId: A.id, accountNumber: null });
    expect(identityFor(A.id, null)).toEqual({ tenantId: A.id, accountNumber: null });
    expect(identityFor(A.id, [])).toEqual({ tenantId: A.id, accountNumber: null });
  });

  it("carries a null tenant through without inventing an address", () => {
    expect(identityFor(null, ROSTER)).toEqual({ tenantId: null, accountNumber: null });
  });
});

describe("isStale — an A→B transition cannot make A's rows read as current for B", () => {
  it("is false while the route and the loaded account agree", () => {
    expect(isStale("1971670", identityFor(A.id, ROSTER))).toBe(false);
  });

  it("is TRUE the moment the route moves to B while A's rows are still held", () => {
    // The leak, stated directly: this is the reading that hides the editor and
    // refuses every write during the window.
    expect(isStale("2000000", identityFor(A.id, ROSTER))).toBe(true);
  });

  it("is TRUE when the tenant moves FIRST and the route has not caught up", () => {
    // The other order, which the previous heuristic could not represent: it
    // recorded B as having settled under A's route and then stuck that way
    // forever. Here it is simply the same disagreement, seen from the other side.
    expect(isStale("1971670", identityFor(B.id, ROSTER))).toBe(true);
  });

  it("RECOVERS by itself once the route catches up — no remount, no second change", () => {
    // The deadlock test in one line: the same identity that read stale under the
    // old route reads current under the new one, because nothing is remembered.
    const heldUnderB = identityFor(B.id, ROSTER);
    expect(isStale("1971670", heldUnderB)).toBe(true);
    expect(isStale("2000000", heldUnderB)).toBe(false);
  });

  it("fails OPEN when the address is unknown, rather than locking the surface", () => {
    // "Cannot tell" must never become "refuse everything" — that is how a safety
    // reading turns into an outage.
    expect(isStale("2000000", identityFor("tenant-not-listed", ROSTER))).toBe(false);
    expect(isStale("2000000", { tenantId: A.id, accountNumber: null })).toBe(false);
  });

  it("says nothing when there is no route account to compare against", () => {
    expect(isStale(undefined, identityFor(A.id, ROSTER))).toBe(false);
  });

  it("compares the address as an address, not by JavaScript type", () => {
    // The route param is a string and the column is a number; a strict compare
    // would call every correctly-paired account stale.
    expect(isStale("1971670", { tenantId: A.id, accountNumber: 1971670 })).toBe(false);
  });
});

describe("reloadIsCurrent — a reload scoped to a departed account refuses", () => {
  it("allows a reload whose scope is still the live account", () => {
    expect(reloadIsCurrent(A.id, A.id)).toBe(true);
  });

  it("refuses a reload scoped to A once B is live", () => {
    // `disconnect` awaited a provider call and then invoked its captured,
    // A-scoped `load()` unconditionally. Because such a reload takes a fresh
    // request generation, it WINS against the account switch that superseded it.
    expect(reloadIsCurrent(A.id, B.id)).toBe(false);
  });

  it("refuses in both directions, and while no account is live", () => {
    expect(reloadIsCurrent(B.id, A.id)).toBe(false);
    expect(reloadIsCurrent(A.id, null)).toBe(false);
    expect(reloadIsCurrent(null, A.id)).toBe(false);
    expect(reloadIsCurrent(null, null)).toBe(true);
  });
});

describe("the wiring — no reload site can bypass the guard", () => {
  // The predicates above prove the RULE. This proves the hook actually applies
  // it to every reload, which is the half a pure test cannot reach: the defect
  // was never a wrong predicate, it was one call site that never asked.
  //
  // Read from source deliberately. The alternative — a full hook harness with
  // supabase and tenant-context doubles — is a much larger surface to build and
  // maintain for a property that is exactly "the guard is inside `load`".
  // Resolved from the project root rather than `import.meta.url`: under Vite's
  // transform a module's own URL is not a file URL, and reading it throws.
  const SOURCE = readFileSync(
    resolve(process.cwd(), "src/solo/data/useCalendarConnections.ts"), "utf8",
  );

  it("puts the guard inside `load`, so every caller inherits it", () => {
    const body = SOURCE.slice(SOURCE.indexOf("const load = useCallback"));
    const guard = body.indexOf("reloadIsCurrent(");
    const firstRequest = body.indexOf("gate.current.begin()");
    expect(guard).toBeGreaterThan(-1);
    // Before any request is issued, not merely before the results are stored.
    expect(guard).toBeLessThan(firstRequest);
  });

  it("leaves no reload that skips it", () => {
    // Every `load()` call is the guarded one. If a future caller adds a second
    // reload path, it inherits the guard rather than needing its own — which is
    // what stops this defect returning for a fourth time.
    const calls = SOURCE.match(/\bload\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(SOURCE).not.toMatch(/liveTenant\.current === activeTenantId\)\s*await load\(\)/);
  });

  it("stamps both halves of the identity from the one shared rule", () => {
    // No `tenantId:` written beside a separately-sourced `accountNumber:` — the
    // shape that produced the lying stamp. Both arrive together or not at all.
    const stamps = SOURCE.match(/accountNumber:\s*[^,\n]+/g) ?? [];
    for (const stamp of stamps) {
      expect(stamp).toMatch(/accountNumber:\s*(null|number \| null)/);
    }
    expect(SOURCE).toContain("identityOf(activeTenantId)");
  });
});
