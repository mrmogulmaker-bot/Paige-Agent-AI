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
 * and its tombstoned Chat tool are REMOVED, not hardened in parallel. The one
 * canonical delete path is `contact.hard_delete` behind `crm-command`.
 */

const root = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(root(p), "utf8");

/** Every .ts file under supabase/functions (recursive). */
function functionSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(root(dir))) {
      const full = `${dir}/${entry}`;
      if (statSync(root(full)).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk("supabase/functions");
  return out;
}

describe("the legacy delete-contact edge is retired (Option A)", () => {
  it("the edge directory no longer exists", () => {
    expect(existsSync(root("supabase/functions/delete-contact")), "edge directory must be deleted")
      .toBe(false);
  });

  it("no function under supabase/functions invokes the retired edge", () => {
    const offenders = functionSources()
      .filter((f) => f.includes("delete-contact") || read(f).includes('"delete-contact"'));
    expect(offenders, `retired-edge references: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the gateway config no longer declares the edge", () => {
    expect(read("supabase/config.toml")).not.toContain("[functions.delete-contact]");
  });

  it("the deploy workflow deletes retired functions at the provider (source deletion alone does not undeploy)", () => {
    // `supabase functions deploy` only creates/updates. Without an explicit
    // provider-side delete, the retired function would stay callable in
    // production forever no matter what the source tree says. PR-A taught the
    // deploy workflow the missing half of retirement; pin both halves so the
    // mechanism cannot be quietly dropped.
    const wf = read(".github/workflows/deploy-edge-functions.yml");
    expect(wf).toContain("Compute retired functions");
    expect(wf).toContain("Delete retired functions at the provider");
    expect(wf).toContain("supabase functions delete");
    // The recorded-live tag must also move on a retirement-only run.
    expect(wf).toContain("steps.retired.outputs.count != '0'");
  });

  it("the tombstoned crm_delete_contact Chat tool is fully removed from the handler", () => {
    // The legacy tool was already stripped from the model manifest; its
    // definition/dispatch/narrative branches remained as tombstones. All of
    // them go, so the name may not appear in the handler at all.
    expect(read("supabase/functions/paige-ai-chat/index.ts")).not.toContain("crm_delete_contact");
  });

  it("the inline-tool baseline records the descent", () => {
    expect(read("scripts/ci/chat-tool-baseline.txt")).not.toContain("crm_delete_contact");
  });

  it("the only remaining src reference is the documented Cursor-lane remnant", () => {
    // src/lib/contacts.ts deleteContact() + its three unrouted pages/admin
    // consumers are PR4's registered orphan lane, handed to Cursor AFTER this
    // PR retires the endpoint. Pin the exact remnant set so nobody adds a new
    // live caller, and so Cursor's deletion updates this contract knowingly.
    const offenders: string[] = [];
    for (const f of functionSources()) void f; // src scan below, not functions
    const walkSrc = (dir: string) => {
      for (const entry of readdirSync(root(dir))) {
        const full = `${dir}/${entry}`;
        if (statSync(root(full)).isDirectory()) {
          if (!full.includes("__tests__") && !full.endsWith(".test.ts")) walkSrc(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          if (read(full).includes('"delete-contact"')) offenders.push(full);
        }
      }
    };
    walkSrc("src");
    expect(offenders.sort(), "expected exactly the Cursor-lane remnant").toEqual([
      "src/lib/contacts.ts",
    ]);
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
    expect(migration).toContain('CRM_ACTIVE_ACCOUNT_CHANGED');
    expect(migration).toContain("CRM_INTERNAL_EXECUTOR_REQUIRED");
  });

  it("the pgTAP proof still pins the cross-tenant and authority refusals", () => {
    expect(pgTap).toContain("known cross-tenant target is refused without disclosure");
    expect(pgTap).toContain("ordinary member cannot mutate CRM");
    expect(pgTap).toContain("hard delete writes the exact Rail capability receipt");
  });
});

describe("retirement scanners are sabotage-sensitive", () => {
  it("a reintroduced edge invocation trips the scanner (mutation proof)", () => {
    const scanner = (source: string) => source.includes('"delete-contact"');
    expect(scanner('await supabaseClient.functions.invoke("delete-contact", {')).toBe(true);
    expect(scanner('await supabaseClient.functions.invoke("crm-command", {')).toBe(false);
  });

  it("a reintroduced chat tombstone trips the name scanner", () => {
    const scanner = (source: string) => source.includes("crm_delete_contact");
    expect(scanner('} else if (tc.function.name === "crm_delete_contact") {')).toBe(true);
    expect(scanner('} else if (tc.function.name === "crm_hard_delete_contact") {')).toBe(false);
  });

  it("a redeclared config block trips the config scanner", () => {
    const scanner = (source: string) => source.includes("[functions.delete-contact]");
    expect(scanner("[functions.delete-contact]\n  verify_jwt = true")).toBe(true);
    expect(scanner("[functions.execute-approval]\n  verify_jwt = true")).toBe(false);
  });
});
