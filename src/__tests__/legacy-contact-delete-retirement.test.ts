import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PR-A — P0 legacy contact delete tenant-isolation remediation.
 *
 * The legacy `delete-contact` edge authenticated the caller, checked a GLOBAL
 * `user_roles` admin/owner row, and then ran a cascading service-role delete
 * keyed only on the body `contact_id` — no tenant predicate anywhere. A
 * tenant-A user holding a global role row could hard-delete tenant-B contacts
 * with their deals, memory, documents and coach rows.
 *
 * The governed canonical delete already existed and is adversarially proven in
 * `supabase/tests/governed_crm_commands.sql` (143 pgTAP assertions, wired into
 * `paige-spine-contract.yml`): service-only executor, active-account match,
 * tenant-scoped owner/admin role, operator-card approval channel, autonomy
 * gate, preview binding with dependency snapshot, tenant-predicated delete,
 * absence readback, idempotent replay, Rail receipt.
 *
 * This contract enforces the retirement decision: Option A — the legacy edge
 * and its tombstoned Chat tool are REMOVED, not hardened in parallel, and the
 * deploy workflow deletes the retired function at the provider (source
 * deletion alone does not undeploy). The one canonical delete path is
 * `contact.hard_delete` behind `crm-command`.
 */

const root = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(root(p), "utf8");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

/** Recursively collect source files under a directory (skipping test files). */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root(dir))) {
    const full = `${dir}/${entry}`;
    const st = statSync(root(full));
    if (st.isDirectory()) {
      if (entry !== "__tests__" && !entry.includes("node_modules")) out.push(...sourceFilesUnder(full));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext)) && !/\.(test|spec)\.[jt]sx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every source file under supabase/functions. */
const functionSources = () => sourceFilesUnder("supabase/functions");

/**
 * The retirement scanners. They match the BARE token, not a quoted form, so
 * single quotes, template literals, and concatenation cannot evade them.
 */
const mentionsRetiredEdge = (source: string) => source.includes("delete-contact");
const mentionsRetiredTool = (source: string) => source.includes("crm_delete_contact");
const mentionsRetiredConfig = (source: string) => source.includes("[functions.delete-contact]");

describe("the legacy delete-contact edge is retired (Option A)", () => {
  it("the edge directory no longer exists", () => {
    expect(existsSync(root("supabase/functions/delete-contact")), "edge directory must be deleted")
      .toBe(false);
  });

  it("no function under supabase/functions mentions the retired edge", () => {
    const offenders = functionSources()
      .filter((f) => mentionsRetiredEdge(f) || mentionsRetiredEdge(read(f)));
    expect(offenders, `retired-edge references: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the gateway config no longer declares the edge", () => {
    expect(mentionsRetiredConfig(read("supabase/config.toml"))).toBe(false);
  });

  it("the tombstoned crm_delete_contact Chat tool is fully removed from the handler", () => {
    // The legacy tool was already stripped from the model manifest; its
    // definition/dispatch/narrative branches remained as tombstones. All of
    // them go, so the name may not appear in the handler at all.
    expect(mentionsRetiredTool(read("supabase/functions/paige-ai-chat/index.ts"))).toBe(false);
  });

  it("the inline-tool baseline records the descent", () => {
    expect(mentionsRetiredTool(read("scripts/ci/chat-tool-baseline.txt"))).toBe(false);
  });

  it("the only remaining src reference is the documented Cursor-lane remnant", () => {
    // src/lib/contacts.ts deleteContact() + its three unrouted pages/admin
    // consumers are PR4's registered orphan lane, handed to Cursor AFTER this
    // PR retires the endpoint. Pin the exact remnant set so nobody adds a new
    // live caller, and so Cursor's deletion updates this contract knowingly.
    const offenders = sourceFilesUnder("src").filter((f) => mentionsRetiredEdge(read(f)));
    expect(offenders.sort(), "expected exactly the Cursor-lane remnant").toEqual([
      "src/lib/contacts.ts",
    ]);
  });
});

describe("the retirement reaches the provider, not just the source tree", () => {
  const wf = read(".github/workflows/deploy-edge-functions.yml");

  it("the deploy workflow computes and deletes retired functions", () => {
    // `supabase functions deploy` only creates/updates. Without an explicit
    // provider-side delete, a retired function stays callable in production
    // forever no matter what the source tree says — for this P0 that would
    // mean the vulnerability outlived its own fix.
    expect(wf).toContain("Compute retired functions");
    expect(wf).toContain("Delete retired functions at the provider");
    expect(wf).toContain("supabase functions delete");
    // The recorded-live tag must also move on a retirement-only run.
    expect(wf).toContain("steps.retired.outputs.count != '0'");
  });

  it("the retired-set pipeline uses grouped-or syntax with a loud empty guard (adversarial review fix)", () => {
    // `{ A | grep || true; } | sort > f` — without the braces, `|` binds
    // tighter than `||`, the redirect lands in the never-taken branch, the
    // file is silently never created, and the delete step skips while the
    // workflow stays green. Both the grouping and the -s guards are pinned.
    expect(wf).toContain("{ git ls-tree -d --name-only");
    expect(wf).toContain("grep -v '^_' || true; } | sort > before_fns.txt");
    expect(wf).toContain("grep -v '^_' || true; } | sort > now_fns.txt");
    expect(wf).toContain("[ -s before_fns.txt ] ||");
  });
});

describe("the canonical governed delete remains the one tenant-safe path", () => {
  const catalog = read("supabase/functions/_shared/crm-command/catalog.ts");
  const actionRisk = read("supabase/functions/_shared/action-risk.ts");
  const migration = read("supabase/migrations/20270204000000_governed_crm_contact_company_commands.sql");
  const pgTap = read("supabase/tests/governed_crm_commands.sql");

  it("the governed tool is declared and mapped to contact.hard_delete", () => {
    expect(catalog).toContain('"contact.hard_delete": "crm_hard_delete_contact"');
    expect(catalog).toContain('"contact.hard_delete": ["contact_id","expected_updated_at"]');
  });

  it("the governed tool stays classified high (and the retired name stays classified too — reintroduction stays confirm-gated)", () => {
    expect(actionRisk).toContain('["crm_hard_delete_contact", "high"');
    expect(actionRisk).toContain('["crm_delete_contact", "high"');
  });

  it("the executor keeps the tenant predicate, unsafe-refusal and absence readback on the delete", () => {
    expect(migration).toContain("CRM_HARD_DELETE_UNSAFE");
    expect(migration).toContain("CRM_ABSENCE_READBACK_FAILED");
    expect(migration).toContain("CRM_PREVIEW_REQUIRED");
    expect(migration).toContain("CRM_ACTIVE_ACCOUNT_CHANGED");
    expect(migration).toContain("CRM_INTERNAL_EXECUTOR_REQUIRED");
  });

  it("the pgTAP proof still pins the cross-tenant and authority refusals", () => {
    expect(pgTap).toContain("known cross-tenant target is refused without disclosure");
    expect(pgTap).toContain("ordinary member cannot mutate CRM");
    expect(pgTap).toContain("hard delete writes the exact Rail capability receipt");
  });
});

describe("retirement scanners are sabotage-sensitive", () => {
  // These run the SAME scanner functions the assertions above use, so a
  // weakening of the scanners (quoted-only matching, wrong token) fails here.
  it("the edge scanner catches every quoting style a reintroduction could use", () => {
    for (const shape of [
      'await supabaseClient.functions.invoke("delete-contact", {',
      "await supabaseClient.functions.invoke('delete-contact', {",
      "await fetch(`${url}/functions/v1/delete-contact`)",
    ]) {
      expect(mentionsRetiredEdge(shape), `scanner missed: ${shape}`).toBe(true);
    }
    // Honest limit: a bare-token source scanner cannot catch runtime string
    // construction ("delete" + "-contact") — no static scan can.
    expect(mentionsRetiredEdge('await supabaseClient.functions.invoke("crm-command", {')).toBe(false);
  });

  it("the tool scanner catches a reintroduced tombstone in any quote style", () => {
    for (const shape of [
      '} else if (tc.function.name === "crm_delete_contact") {',
      "} else if (tc.function.name === 'crm_delete_contact') {",
      "const LEGACY = `crm_delete_contact`;",
    ]) {
      expect(mentionsRetiredTool(shape), `scanner missed: ${shape}`).toBe(true);
    }
    expect(mentionsRetiredTool('} else if (tc.function.name === "crm_hard_delete_contact") {')).toBe(false);
  });

  it("the config scanner catches a redeclared block", () => {
    expect(mentionsRetiredConfig("[functions.delete-contact]\n  verify_jwt = true")).toBe(true);
    expect(mentionsRetiredConfig("[functions.execute-approval]\n  verify_jwt = true")).toBe(false);
  });
});
