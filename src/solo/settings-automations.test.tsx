/**
 * Settings → Integrations → Automations.
 *
 * These cover the flows a Solo owner can actually reach, and the boundary the
 * owner set on 2026-08-31: this surface may consume existing governed data, but
 * must not reach into Systems Check, Mind or Command Center, and must never
 * present something as working when no contract backs it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloIntegrationsView } from "./settings-integrations";
import { outcomeLabel } from "./data/useSoloAutomations";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const db = vi.hoisted(() => ({
  rules: [] as unknown[],
  pipelines: [] as unknown[],
  stages: [] as unknown[],
  events: [] as unknown[],
  admin: true,
  failTable: null as string | null,
  selects: [] as Array<{ table: string; columns: string }>,
  writes: [] as Array<{ table: string; op: string; values?: Record<string, unknown> }>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, loading: context.loading }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) =>
    table === "stage_automation_rules" ? db.rules
      : table === "pipelines" ? db.pipelines
      : table === "pipeline_stages" ? db.stages
      : table === "stage_automation_events" ? db.events
      : [];
  return {
    supabase: {
      rpc: (name: string) =>
        Promise.resolve(
          name === "is_current_user_tenant_admin"
            ? { data: db.admin, error: null }
            : { data: { configured: false, status: "unconfigured" }, error: null },
        ),
      from: (table: string) => ({
        select: (columns: string) => {
          db.selects.push({ table, columns });
          const result = { data: rowsFor(table), error: db.failTable === table ? { message: "read failed" } : null };
          return { eq: () => ({ order: () => Promise.resolve(result) }) };
        },
        insert: (values: Record<string, unknown>) => {
          db.writes.push({ table, op: "insert", values });
          return Promise.resolve({ error: null });
        },
        update: (values: Record<string, unknown>) => {
          db.writes.push({ table, op: "update", values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        delete: () => {
          db.writes.push({ table, op: "delete" });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    },
  };
});

async function render(path: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}><SoloIntegrationsView /></MemoryRouter>,
  ));
  await act(async () => { await Promise.resolve(); });
  return { host, root };
}

const BASE = "/solo/1971670/settings/integrations";

beforeEach(() => {
  context.tenantId = "tenant-a";
  context.loading = false;
  db.rules = []; db.pipelines = []; db.stages = []; db.events = [];
  db.admin = true; db.failTable = null; db.selects = []; db.writes = [];
});

describe("Automations sub-tab routing (owned locally by Integrations)", () => {
  it("shows the tools catalogue at the Integrations root", async () => {
    const { host } = await render(BASE);
    const selected = host.querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toContain("Your tools");
    expect(host.textContent).toContain("Integration catalogue");
  });

  it("shows Automations at the automations leaf", async () => {
    const { host } = await render(`${BASE}/automations`);
    const selected = host.querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toContain("Automations");
    expect(host.textContent).not.toContain("Integration catalogue");
  });

  it("falls back to the catalogue for an unknown leaf, so old URLs keep working", async () => {
    const { host } = await render(`${BASE}/something-retired`);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Your tools");
  });
});

describe("Automations truth boundary", () => {
  it("states plainly that a saved rule cannot be delivered yet", async () => {
    const { host } = await render(`${BASE}/automations`);
    expect(host.textContent).toContain("Nothing is set up yet");
    expect(host.textContent).toMatch(/cannot deliver the message yet/i);
  });

  it("shows no run count, success rate, health signal or repair action", async () => {
    const { host } = await render(`${BASE}/automations`);
    const text = host.textContent ?? "";
    for (const forbidden of ["success rate", "runs this week", "needs attention", "Repoint", "Promote to auto", "%"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("never selects the provider payload or the raw error from the outcome log", async () => {
    await render(`${BASE}/automations`);
    const events = db.selects.filter((s) => s.table === "stage_automation_events");
    expect(events.length).toBeGreaterThan(0);
    for (const select of events) {
      expect(select.columns).not.toContain("webhook_response");
      expect(select.columns).not.toContain("error");
    }
  });

  it("does not claim an empty workspace when a read failed", async () => {
    db.failTable = "stage_automation_rules";
    const { host } = await render(`${BASE}/automations`);
    expect(host.textContent).toContain("Couldn’t check your automations");
    expect(host.textContent).not.toContain("Nothing is set up yet");
  });

  it("offers pipeline setup as the next step only while no pipeline exists", async () => {
    const withoutPipeline = await render(`${BASE}/automations`);
    expect(withoutPipeline.host.textContent).toContain("Set up your pipeline");
    const link = withoutPipeline.host.querySelector('a[href*="growth/pipeline"]');
    expect(link).not.toBeNull();

    db.pipelines = [{ id: "p1", name: "Clients" }];
    db.stages = [
      { id: "s1", pipeline_id: "p1", label: "Enquiry", order_index: 0 },
      { id: "s2", pipeline_id: "p1", label: "Working", order_index: 1 },
    ];
    const withPipeline = await render(`${BASE}/automations`);
    expect(withPipeline.host.textContent).not.toContain("Set up your pipeline");
    expect(withPipeline.host.textContent).toContain("New automation");
  });

  it("hides the authoring controls from a caller who may not write", async () => {
    db.admin = false;
    db.pipelines = [{ id: "p1", name: "Clients" }];
    db.stages = [{ id: "s1", pipeline_id: "p1", label: "Enquiry", order_index: 0 }];
    const { host } = await render(`${BASE}/automations`);
    expect(host.textContent).not.toContain("New automation");
    expect(host.textContent).toMatch(/needs an owner or admin/i);
  });
});

describe("Authoring a rule", () => {
  beforeEach(() => {
    db.pipelines = [{ id: "p1", name: "Clients" }];
    db.stages = [
      { id: "s1", pipeline_id: "p1", label: "Enquiry", order_index: 0 },
      { id: "s2", pipeline_id: "p1", label: "Working", order_index: 1 },
    ];
  });

  it("saves a new rule turned off, scoped to the workspace", async () => {
    const { host } = await render(`${BASE}/automations`);
    const open = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("New automation"));
    await act(async () => open?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const save = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Save automation"));
    expect(save).toBeDefined();
    await act(async () => save?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const insert = db.writes.find((w) => w.op === "insert");
    expect(insert?.table).toBe("stage_automation_rules");
    expect(insert?.values?.tenant_id).toBe("tenant-a");
    // Never on by default — a rule must not begin acting the moment it is saved.
    expect(insert?.values?.is_active).toBe(false);
  });

  it("renders an existing rule as a sentence, not as field names", async () => {
    db.rules = [{
      id: "r1", pipeline_id: "p1", from_stage_id: "s1", to_stage_id: "s2",
      compose_intent: "nurture", tone: "warm", template_hint: null,
      send_mode: "draft_for_review", is_active: false, updated_at: null,
    }];
    const { host } = await render(`${BASE}/automations`);
    expect(host.textContent).toContain("When a client moves from Enquiry to Working");
    expect(host.textContent).not.toContain("compose_intent");
    expect(host.textContent).not.toContain("send_mode");
  });
});

describe("Consumed outcomes stay in owner language", () => {
  it("reads every recorded state without leaking its internal name", () => {
    for (const status of ["sent", "pending", "skipped_no_rule", "skipped_inactive", "skipped_no_webhook", "skipped_no_consent", "failed"]) {
      const label = outcomeLabel(status);
      expect(label).not.toContain("_");
      expect(label.length).toBeGreaterThan(0);
    }
    // An unrecognised state must stay honest rather than guess.
    expect(outcomeLabel("something_new")).toBe("Recorded");
  });

  it("says nothing has run when the log is empty, rather than implying success", async () => {
    const { host } = await render(`${BASE}/automations`);
    expect(host.textContent).toContain("Nothing has run here");
  });
});

describe("Owner boundary — Systems Check, Mind and Command Center are untouched", () => {
  const sources = [
    "src/solo/settings-automations.tsx",
    "src/solo/data/useSoloAutomations.ts",
    "src/solo/settings-integrations.tsx",
  ];

  it("imports nothing from those surfaces", () => {
    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      const imports = source.match(/from\s+["'][^"']+["']/g) ?? [];
      for (const line of imports) {
        expect(line).not.toMatch(/CommandCenter|systems|SystemsCheck|TenantSystemsCheck/i);
      }
    }
  });

  it("offers no link into them", () => {
    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/to=\{?["'`][^"'`]*command-center/i);
      expect(source).not.toMatch(/to=\{?["'`][^"'`]*systems-check/i);
    }
  });

  it("does not read the queue those surfaces own", () => {
    const hook = readFileSync("src/solo/data/useSoloAutomations.ts", "utf8");
    expect(hook).not.toContain('from("paige_actions")');
    expect(hook).not.toContain('from("paige_pending_approvals")');
  });
});
