import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * #746 — THE RAIL IS READ THROUGH A RESOLVER, AND NOTHING MAY QUIETLY GO BACK.
 *
 * The defect this guards was not a logic error. It was a browser reading a relation it had no
 * privilege on: `20260712190000:94` granted `SELECT` on `paige_client_events` to `authenticated`,
 * `20260712200000:25` revoked it, and nothing re-granted it. Every history read returned `42501`
 * BEFORE row-level security was consulted, so the policies the code reasoned about were never
 * evaluated — and two of the three consumers rendered that refusal as an empty feed.
 *
 * A unit test cannot catch that class: mock a Supabase client and the read "succeeds". The thing
 * that IS checkable in CI, cheaply and forever, is the shape — that no browser module reaches for
 * the relation. So this asserts the seam rather than the behaviour, and says so.
 */

const ROOT = path.resolve(__dirname, "../../..");
const READERS = [
  "src/hooks/useRailEvents.ts",
  "src/solo/data/useSoloActivityFeed.ts",
];

/** Strip block and line comments so a comment ABOUT the old read never trips the guard. */
function code(file: string): string {
  return fs
    .readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("#746 — rail history reads go through a server resolver", () => {
  it.each(READERS)("%s does not read the paige_client_events relation", (file) => {
    const src = code(file);
    expect(src).not.toMatch(/\.from\(\s*["'`]paige_client_events["'`]\s*\)/);
  });

  it("useRailEvents calls a resolver for each scope", () => {
    const src = code("src/hooks/useRailEvents.ts");
    // Client scope adopts the resolver that already existed and is already granted.
    expect(src).toMatch(/\.rpc\(\s*["'`]get_client_rail["'`]/);
    // Tenant scope uses the sibling added by #746.
    expect(src).toMatch(/\.rpc\(\s*["'`]get_solo_rail_activity["'`]/);
  });

  it("useSoloActivityFeed calls the tenant resolver", () => {
    expect(code("src/solo/data/useSoloActivityFeed.ts"))
      .toMatch(/\.rpc\(\s*["'`]get_solo_rail_activity["'`]/);
  });

  it("no rail reader passes a caller-chosen tenant to the tenant resolver", () => {
    // The resolver takes no tenant argument at all. If a caller ever starts sending one, either
    // the contract changed or someone added a parameter the server is supposed to own (§9).
    for (const file of READERS) {
      const src = code(file);
      const calls = src.match(/\.rpc\(\s*["'`]get_solo_rail_activity["'`][^)]*\)/g) ?? [];
      for (const call of calls) expect(call).not.toMatch(/tenant/i);
    }
  });
});

describe("#746 — a refused read is never rendered as an empty history", () => {
  const CONSUMERS = [
    "src/components/paige/PaigeRailFeed.tsx",
    "src/components/app/ClientActivityFeed.tsx",
  ];

  it.each(CONSUMERS)("%s consumes historyError and historyLoaded", (file) => {
    const src = code(file);
    // Both were destructuring `{ events, connected }` only, which is precisely how a denied read
    // became "Nothing yet" — the honest signals existed and nothing read them.
    expect(src).toMatch(/historyError/);
    expect(src).toMatch(/historyLoaded/);
  });

  it.each(CONSUMERS)("%s gates its empty copy on historyError first", (file) => {
    const src = code(file);
    // The denied branch must be evaluated BEFORE the plain empty branch, or the empty state wins.
    const denied = src.indexOf("historyError");
    const empty = src.search(/events\.length === 0 \?/);
    expect(denied).toBeGreaterThan(-1);
    if (empty > -1) expect(denied).toBeLessThan(empty);
  });
});
