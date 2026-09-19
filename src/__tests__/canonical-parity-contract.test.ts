/**
 * Canonical Parity structural-classification contract (PR 2, read-only).
 *
 * Pins the taxonomy the inventory records so drift is caught by CI, not by the
 * next audit: the tier resolver's parent-first rule, the DB-constraint-backed
 * account_type vocabulary, the route-tier authorization map, and the shell-root
 * emission — the exact chain that makes "same structural type = same canonical
 * shell" true in code today. Pure-function tests over the ONE homes
 * (resolveTierKey / decideWorkspaceEntry / authorizedRootForTier /
 * workspaceRootForTenant); no fixtures, no renders — the classification is the
 * contract.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveTierKey } from "@/lib/tier/tierFeatures";
import {
  authorizedRootForTier,
  decideWorkspaceEntry,
  routeAllowsTier,
  workspaceRootForTenant,
} from "@/lib/auth/workspaceEntry";
import { canonicalSetupPath } from "@/components/auth/RequireSetupComplete";

const cls = (account_type: string | null, parent_tenant_id: string | null = null, isPlatformStaff = false) => ({
  account_type,
  parent_tenant_id,
  isPlatformStaff,
});

describe("structural taxonomy: resolveTierKey (the one home)", () => {
  it("parent-first: ANY parented tenant is a sub-account, regardless of account_type", () => {
    expect(resolveTierKey(cls("standalone", "p"))).toBe("sub_account");
    expect(resolveTierKey(cls("agency", "p"))).toBe("sub_account");
    expect(resolveTierKey(cls(null, "p"))).toBe("sub_account");
  });

  it("unparented: agency/enterprise/sub_account map to themselves; standalone/null/unknown fail safe to solo", () => {
    expect(resolveTierKey(cls("agency"))).toBe("agency");
    expect(resolveTierKey(cls("enterprise"))).toBe("enterprise");
    expect(resolveTierKey(cls("sub_account"))).toBe("sub_account");
    expect(resolveTierKey(cls("standalone"))).toBe("solo");
    expect(resolveTierKey(cls(null))).toBe("solo");
    expect(resolveTierKey(cls("something-new"))).toBe("solo");
  });

  it("staff with no account_type is god; staff WITH an account acts as that tenant", () => {
    expect(resolveTierKey(cls(null, null, true))).toBe("god");
    expect(resolveTierKey(cls("standalone", null, true))).toBe("solo");
  });
});

describe("shell authorization: ROUTE_TIERS (same type = same shell)", () => {
  it("each route root admits exactly its structural tiers", () => {
    expect(routeAllowsTier("solo", "solo")).toBe(true);
    expect(routeAllowsTier("solo", "sub_account")).toBe(false);
    expect(routeAllowsTier("business", "sub_account")).toBe(true);
    expect(routeAllowsTier("business", "solo")).toBe(false);
    expect(routeAllowsTier("agency", "agency")).toBe(true);
    expect(routeAllowsTier("agency", "enterprise")).toBe(true);
    expect(routeAllowsTier("agency", "solo")).toBe(false);
  });

  it("a wrong-tier caller is sent to their OWN root, never another tenant's shell", () => {
    expect(decideWorkspaceEntry({ root: "solo", classification: cls("sub_account", "p"), accountNumber: 84 })).toEqual({
      kind: "redirect",
      to: "/business/84/command-center",
    });
    expect(decideWorkspaceEntry({ root: "business", classification: cls("agency"), accountNumber: 9 })).toEqual({
      kind: "redirect",
      to: "/agency/9/command-center",
    });
    // No single home to name → fail CLOSED to the chooser.
    expect(decideWorkspaceEntry({ root: "solo", classification: cls(null, null, true), accountNumber: null })).toEqual({
      kind: "chooser",
    });
  });
});

describe("canonical roots: structural emission, no identity inputs", () => {
  it("authorizedRootForTier is a pure tier→address map", () => {
    expect(authorizedRootForTier("solo", 42)).toBe("/solo/42/command-center");
    expect(authorizedRootForTier("sub_account", "84")).toBe("/business/84/command-center");
    expect(authorizedRootForTier("agency", 9)).toBe("/agency/9/command-center");
    expect(authorizedRootForTier("enterprise", 3)).toBe("/agency/3/command-center");
    expect(authorizedRootForTier("solo", null)).toBeNull();
  });

  it("workspaceRootForTenant refuses to emit a solo address for incomplete classification", () => {
    // The literal-standalone pin: unknown account_type must NOT route as solo.
    expect(workspaceRootForTenant({ account_type: null, parent_tenant_id: null, account_number: 7 })).toBeNull();
    // A PARENTED "standalone" is structurally a sub-account (parent-first) —
    // it routes to the business shell, never a solo address.
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: "p", account_number: 7 })).toBe(
      "/business/7/command-center",
    );
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 7 })).toBe(
      "/solo/7/command-center",
    );
  });
});

describe("setup destinations follow the same structural map (#826 lineage)", () => {
  it("canonicalSetupPath is tier-shaped, account-generic, identity-free", () => {
    expect(canonicalSetupPath("solo", 42)).toBe("/solo/42/settings/setup");
    expect(canonicalSetupPath("sub_account", "84")).toBe("/business/84/setup");
    expect(canonicalSetupPath("agency", 9)).toBeNull();
    expect(canonicalSetupPath("solo", "not-an-account")).toBeNull();
  });
});

describe("the parity contract itself (source-level, per the owner architecture ruling)", () => {
  it("no account-number or customer-identity literal drives shell resolution", () => {
    for (const file of [
      "src/lib/tier/tierFeatures.ts",
      "src/lib/auth/workspaceEntry.ts",
      "src/components/auth/RequireSetupComplete.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/account_number\s*===?\s*\d/);
      expect(src, file).not.toMatch(/created_at\s*[<>]/);
    }
  });

  it("solo shell selection never consults a feature flag (the dead-canary contract)", () => {
    const entry = readFileSync("src/lib/auth/workspaceEntry.ts", "utf8");
    const tier = readFileSync("src/lib/tier/tierFeatures.ts", "utf8");
    expect(entry).not.toContain("solo_shell_enabled");
    expect(tier).not.toContain("solo_shell_enabled");
  });
});

// ─── THE MATRIX SELF-CHECK (PR2 correction: arithmetic + privacy invariants) ───
//
// The committed parity artifact is only authoritative if its summary DERIVES
// from its rows and it carries no customer-identifying values. These tests make
// CI the enforcer: a hand-patched count, a forgotten account_number, or a row
// without its local alias fails the build.
import matrixJson from "../../docs/delivery/canonical-parity-matrix.json";

const SUPPORTED_VERDICTS = new Set([
  "CANONICAL",
  "CONFIGURATION DRIFT",
  "PROVISIONING DRIFT",
  "LEGACY ROUTING DEBT",
  "INVALID STRUCTURAL STATE",
  "PROOF OWED",
  "NOT APPLICABLE",
]);

// A 4+-digit numeric run — the shape of an account number wherever it hides.
// WHITELISTED runs that are provably not identifiers: ISO dates (2026-09-17)
// and issue/PR references (#1269). Everything else 4+ digits fails.
const ACCOUNT_NUMBER_LIKE = /(?<![-/#[\w])\d{4,}(?![-\w])/;

function containsAccountNumberLike(v: unknown): boolean {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1000;
  if (typeof v === "string") {
    // strip ISO dates and #refs first, then scan the remainder
    const remainder = v.replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/#\d+/g, "");
    return ACCOUNT_NUMBER_LIKE.test(remainder);
  }
  if (Array.isArray(v)) return v.some(containsAccountNumberLike);
  if (v && typeof v === "object") return Object.values(v).some(containsAccountNumberLike);
  return false;
}

const FORBIDDEN_KEYS = new Set([
  "account_number", "acct", "account", "number",
  "id", "uuid", "tenant_id",
  "name", "email", "slug", "customer", "customer_id",
]);

function containsForbiddenKey(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(containsForbiddenKey);
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.has(k)) return true;
      if (containsForbiddenKey(val)) return true;
    }
  }
  return false;
}

describe("canonical parity matrix — internal consistency", () => {
  const rows = matrixJson.accounts as Array<Record<string, unknown>>;
  const summary = matrixJson.summary as unknown as Record<string, number | string>;

  it("summary.total_tenants equals the actual row count", () => {
    expect(summary.total_tenants).toBe(rows.length);
  });

  it("every row carries a verdict from the supported vocabulary only", () => {
    for (const r of rows) {
      expect(SUPPORTED_VERDICTS.has(String(r.parity)), `unsupported verdict: ${r.parity}`).toBe(true);
    }
  });

  it("summary.canonical equals the actual CANONICAL row count", () => {
    expect(summary.canonical).toBe(rows.filter((r) => r.parity === "CANONICAL").length);
  });

  it("summary NOT-APPLICABLE counts equal the actual row counts", () => {
    expect(summary.not_applicable).toBe(rows.filter((r) => r.parity === "NOT APPLICABLE").length);
    expect(summary.not_applicable_canceled).toBe(
      rows.filter((r) => r.parity === "NOT APPLICABLE" && r.status === "canceled").length,
    );
  });

  it("each drift/invalid summary figure equals its actual row count (all zero today)", () => {
    for (const verdict of ["CONFIGURATION DRIFT", "PROVISIONING DRIFT", "LEGACY ROUTING DEBT", "INVALID STRUCTURAL STATE"] as const) {
      const key = verdict.toLowerCase().replace(/\s+/g, "_");
      expect(summary[key]).toBe(rows.filter((r) => r.parity === verdict).length);
    }
  });

  it("structural validity: every row is structurally classified (none invalid)", () => {
    expect(summary.structural_state_valid).toBe(
      rows.filter((r) => r.parity !== "INVALID STRUCTURAL STATE").length,
    );
  });
});

describe("canonical parity matrix — de-identification invariants", () => {
  const rows = matrixJson.accounts as Array<Record<string, unknown>>;

  it("every row has a non-identifying local alias, and aliases are unique", () => {
    const aliases = rows.map((r) => r.alias);
    expect(aliases.every((a) => typeof a === "string" && /^T\d{2,}$/.test(a))).toBe(true);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("no forbidden customer-identifying KEY appears anywhere in the committed matrix", () => {
    expect(containsForbiddenKey(matrixJson)).toBe(false);
  });

  it("no account-number-like value (4+ digit integer/string) appears anywhere", () => {
    expect(containsAccountNumberLike(matrixJson)).toBe(false);
  });

  it("the artifact is parseable, versioned, and alias-ordered (deterministic shape)", () => {
    expect(matrixJson.artifact).toBe("canonical-parity-matrix");
    expect(matrixJson.version).toBe(1);
    expect(typeof matrixJson.generated).toBe("string");
    const aliases = (matrixJson.accounts as Array<{ alias: string }>).map((r) => r.alias);
    expect(aliases).toEqual([...aliases].sort()); // rows in stable T-order
  });
});

describe("de-identification scanner — meta self-test (the enforcer must bite)", () => {
  it("detects a smuggled string account number under an innocent key", () => {
    expect(containsAccountNumberLike({ ref: "9999001" })).toBe(true); // SYNTHETIC: shape-only, matches no real tenant
  });
  it("detects a numeric account number and nested/array shapes", () => {
    expect(containsAccountNumberLike({ a: { b: 9999002 } })).toBe(true);
    expect(containsAccountNumberLike(["x", 9999003])).toBe(true);
  });
  it("does NOT flag ISO dates, #PR references, or short numbers", () => {
    expect(containsAccountNumberLike({ generated: "2026-09-17", note: "#1269 merged", count: 16 })).toBe(false);
  });
  it("detects a forbidden key anywhere in the tree", () => {
    expect(containsForbiddenKey({ deep: { account_number: 1 } })).toBe(true);
    expect(containsForbiddenKey({ rows: [{ email: "x@y.z" }] })).toBe(true);
  });
});
