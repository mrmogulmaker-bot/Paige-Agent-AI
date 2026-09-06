import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideWorkspaceEntry, workspaceRootForTenant } from "@/lib/auth/workspaceEntry";

/**
 * Registration may only offer an editor to workspaces the canonical Setup seam will serve.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. Registration's business-record editor writes through
 * `save_solo_business_context`, and every entry point of that contract calls
 * `solo_setup_assert_canonical_tenant()`, which raises 42501 for anything that is not a
 * TOP-LEVEL STANDALONE tenant. Registration itself lives in the Solo shell, whose mount gate
 * happens to admit exactly that same set. The editor is safe because those two gates agree —
 * and nothing but this test says they have to.
 *
 * If either side moves — the Solo shell opened to sub-accounts, or the Setup contract widened
 * — the editor silently becomes a control that loads nothing and saves nothing for whoever is
 * newly admitted. That is the §51/§56 tier-seam failure this repository has paid for four
 * times. It fails here instead.
 */
const CANONICAL_SQL = "supabase/migrations/20261103000000_solo_setup_business_context.sql";

const tenant = (over: Record<string, unknown> = {}) => ({
  account_type: "standalone",
  parent_tenant_id: null,
  account_number: 1971670,
  features: { solo_shell_enabled: true },
  ...over,
});

describe("Registration's editor and the Setup contract admit the same workspaces", () => {
  it("the Setup contract still restricts itself to top-level standalone tenants", () => {
    const sql = readFileSync(CANONICAL_SQL, "utf8");
    expect(sql).toContain("solo_setup_assert_canonical_tenant");
    expect(sql).toContain("account_type::text='standalone' and t.parent_tenant_id is null");
  });

  it("admits only that set at the /solo route the editor actually mounts under", () => {
    // `workspaceRootForTenant` answers "where does this person LAND". The gate that decides
    // whether SoloApp — and therefore SoloSettings, Registration and this editor — mounts at
    // /solo/:account/* is `decideWorkspaceEntry({root:"solo"})`. Asserting only the landing
    // resolver would prove an adjacent thing, so the mount gate is asserted directly.
    const entry = (over: Record<string, unknown> = {}) =>
      decideWorkspaceEntry({
        root: "solo",
        classification: { account_type: "standalone", parent_tenant_id: null, isPlatformStaff: false, ...over },
        accountNumber: 1971670,
      }).kind;
    expect(entry()).toBe("allow");
    expect(entry({ parent_tenant_id: "parent-1" })).not.toBe("allow");
    expect(entry({ account_type: "agency" })).not.toBe("allow");
    expect(entry({ account_type: "enterprise" })).not.toBe("allow");
    expect(entry({ account_type: "sub_account" })).not.toBe("allow");
  });

  it("mounts the Solo shell for exactly that set, and for nobody else", () => {
    expect(workspaceRootForTenant(tenant())).toBe("/solo/1971670/command-center");
    // A parented tenant is a sub-account under the single-level agency model (§51). None of
    // these may land in the Solo shell — null (no root) and another tier's root both qualify.
    const soloReached = (over: Record<string, unknown>) =>
      (workspaceRootForTenant(tenant(over)) ?? "").startsWith("/solo/");
    expect(soloReached({ parent_tenant_id: "parent-1" })).toBe(false);
    expect(soloReached({ account_type: "agency" })).toBe(false);
    expect(soloReached({ account_type: "enterprise" })).toBe(false);
    expect(soloReached({ account_type: "sub_account" })).toBe(false);
    // Freshly provisioned, account_type not yet set: routed nowhere rather than into a
    // shell whose Setup contract would then refuse it.
    expect(workspaceRootForTenant(tenant({ account_type: null }))).toBeNull();
    // Retired rollout flags cannot divert an authorized tenant from its canonical shell.
    expect(workspaceRootForTenant(tenant({ features: {} }))).toBe("/solo/1971670/command-center");
  });
});
