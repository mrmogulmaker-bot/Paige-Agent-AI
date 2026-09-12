/**
 * SOCIAL PUBLISH CONTAINMENT — the regression the owner required (Gate A, 2026-09-12):
 * "a configured Upload-Post key still cannot cause publication through Paige until the future
 *  governed Social contract is complete."
 *
 * Two layers of proof:
 *   1. The pure predicate denies `post` and takes ONLY the action name — so no credential,
 *      connection, or request field can flip the denial. Reads and cancel are preserved.
 *   2. A STRUCTURAL proof over the real `paige-social` seam: the containment guard returns before
 *      the `post` branch, which is where the only publishing `uploadPost` call lives — so a
 *      configured key can never reach the provider through the `post` path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  socialPublishContainment,
  CONTAINED_ACTIONS,
} from "../../supabase/functions/_shared/social-publish-containment.ts";

const SEAM = readFileSync(
  resolve(process.cwd(), "supabase/functions/paige-social/index.ts"),
  "utf8",
);

describe("social publish containment — the pure predicate", () => {
  it("DENIES `post` (the only publishing action) with an honest UNAVAILABLE status", () => {
    const c = socialPublishContainment("post");
    expect(c.denied).toBe(true);
    if (c.denied) {
      expect(c.status).toBe("UNAVAILABLE");
      expect(c.capability).toBe("social_publish");
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.setup_path.length).toBeGreaterThan(0);
      // Never a success shape.
      expect((c as Record<string, unknown>).ok).toBeUndefined();
    }
  });

  it("is KEY-INDEPENDENT — the decision takes only the action, so a configured Upload-Post key cannot flip it", () => {
    // The signature proves it structurally: there is no credential/connection parameter to pass.
    expect(socialPublishContainment.length).toBe(1);
    // And the answer for `post` is denial, unconditionally.
    expect(socialPublishContainment("post").denied).toBe(true);
  });

  it("PRESERVES every safe read and declared-handle capture", () => {
    for (const read of ["accounts", "analytics", "post_analytics", "audience", "comments", "status", "scheduled"]) {
      expect(socialPublishContainment(read).denied, `${read} must stay available`).toBe(false);
    }
  });

  it("PRESERVES cancel_scheduled (it can only remove a publication, never create one)", () => {
    expect(socialPublishContainment("cancel_scheduled").denied).toBe(false);
  });

  it("does not deny an unknown action (unknown actions fail their own way, not as containment)", () => {
    expect(socialPublishContainment("definitely_not_an_action").denied).toBe(false);
  });

  it("contains exactly the publishing action today", () => {
    expect([...CONTAINED_ACTIONS]).toEqual(["post"]);
  });
});

describe("social publish containment — wired at the seam BEFORE any provider call", () => {
  it("the seam imports the containment predicate", () => {
    expect(SEAM).toContain('from "../_shared/social-publish-containment.ts"');
    expect(SEAM).toContain("socialPublishContainment(action)");
  });

  it("the denial guard returns BEFORE the `post` branch (so publication cannot reach uploadPost)", () => {
    const guardAt = SEAM.indexOf("const containment = socialPublishContainment(action)");
    const deniedReturnAt = SEAM.indexOf("if (containment.denied)");
    const postBranchAt = SEAM.indexOf('if (action === "post")');
    expect(guardAt).toBeGreaterThan(-1);
    expect(deniedReturnAt).toBeGreaterThan(guardAt);
    expect(postBranchAt).toBeGreaterThan(-1);
    // The guard (and its denial return) run before the post branch is ever entered.
    expect(guardAt).toBeLessThan(postBranchAt);
    expect(deniedReturnAt).toBeLessThan(postBranchAt);
  });

  it("the guard's denial return exists and short-circuits (no fallthrough to the actions)", () => {
    // Between the guard and the ACTIONS section there is a `return json(... contained: true ...)`.
    const guardAt = SEAM.indexOf("if (containment.denied)");
    const actionsAt = SEAM.indexOf("// ---- ACTIONS ----");
    const between = SEAM.slice(guardAt, actionsAt);
    expect(between).toContain("contained: true");
    expect(between).toMatch(/return json\(/);
  });
});
