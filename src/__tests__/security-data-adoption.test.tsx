import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * PR-C — P1 Solo Security & Data truthfulness / existing-capability adoption.
 *
 * PR4 found the Solo Security & Data tab was three copy cards while the real
 * canonical controls existed elsewhere: AccountSecurityPanel (the ONE
 * self-service account-security surface: password, TOTP 2FA, sessions) was
 * mounted only on the client dashboard and the admin setup hub, the
 * request-data-deletion edge (authenticated, user-scoped, pending-request
 * semantics processed daily by cron) had NO UI caller at all, and the
 * user-scoped data export lived only inside the client-portal
 * DataPrivacyPanel.
 *
 * This contract pins the adoption: the canonical panel is mounted (not
 * forked), the personal-data controls ride the existing seams with truthful
 * scope labels, workspace deletion is labeled unavailable rather than
 * decorated with a dead or mislabeled button, and no visible control points
 * at a nonexistent handler.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("the canonical panel is adopted, not rebuilt", () => {
  it("the Solo Security & Data view mounts AccountSecurityPanel", () => {
    expect(read("src/solo/settings-security-data.tsx")).toContain("AccountSecurityPanel");
    // ...and the Solo settings tab actually renders that view.
    expect(read("src/solo/settings.tsx")).toContain("settings-security-data");
  });

  it("no Solo-specific fork of the panel exists (same type consumes the same capability)", () => {
    const view = read("src/solo/settings-security-data.tsx");
    expect(view).not.toContain("function ChangePasswordCard");
    expect(view).not.toContain("function TwoFactorCard");
    expect(view).not.toContain("function SessionsCard");
    expect(view).not.toContain("SoloAccountSecurityPanel");
  });

  it("the user-data export is ONE shared implementation, not a fork", () => {
    // The canonical export logic is extracted from DataPrivacyPanel into a
    // single helper both surfaces consume.
    expect(read("src/lib/downloadMyUserData.ts")).toContain("export async function downloadMyUserData");
    expect(read("src/components/dashboard/DataPrivacyPanel.tsx")).toContain("downloadMyUserData");
    expect(read("src/solo/settings-security-data.tsx")).toContain("downloadMyUserData");
  });

  it("personal-data deletion is fail-closed: the view neither invokes the intake edge nor advertises a processing lifecycle", () => {
    // Provider truth (2026-09-19): request-data-deletion is deployed, but
    // process-data-deletion is NOT deployed and no cron schedule executes
    // requests — so offering the intake as if end-to-end deletion were
    // operational would be false. The Solo surface must not invoke the edge
    // and must not promise a timeframe or automatic execution (INT-070 owns
    // the backend chain). These pins trip on any re-enable that lacks the
    // processor seam.
    const view = read("src/solo/settings-security-data.tsx");
    expect(view).not.toContain("request-data-deletion");
    expect(view).not.toContain("processed within");
    expect(view).not.toContain("30 days");
    expect(view).not.toContain("Request submitted");
    // Nothing in the Solo view deletes tenants/workspaces directly.
    expect(view.toLowerCase()).not.toContain("delete tenant");
    expect(view).not.toContain("functions.invoke(\"admin-delete-user\"");
  });

  it("the mounted controls are user-scoped — no tenant-keyed destructive handler exists in the view", () => {
    // Password/2FA/sessions/deletion-request/export all act on the caller's
    // OWN login and personal data (supabase.auth.* + user_id-keyed reads).
    // That is why the account-switch scenario cannot redirect them: they
    // never address a workspace. Pinned so a future edit cannot quietly add
    // a tenant-addressed write here without touching this contract.
    const view = read("src/solo/settings-security-data.tsx");
    expect(view).not.toMatch(/\.from\(["'](clients|deals|business_missions|tenants)["']/);
    expect(view).not.toContain("tenant_id");
  });
});

describe("label truthfulness (source pins)", () => {
  const view = read("src/solo/settings-security-data.tsx");

  it("workspace deletion is labeled unavailable — no dead destructive button", () => {
    expect(view).toContain("not available from this screen");
    // The unavailable block must not contain a request/delete button.
    const idx = view.indexOf("not available from this screen");
    const block = view.slice(Math.max(0, idx - 400), idx + 400);
    expect(block).not.toContain("<Button");
    expect(block).not.toContain("Request Deletion");
  });

  it("the export control states its exact scope (personal login data, not workspace records)", () => {
    expect(view).toContain("personal data tied to your login");
    expect(view.toLowerCase()).not.toContain("all data paigeagent holds about you");
  });

  it("personal-data deletion is labeled unavailable — no timeframe, no automatic-execution promise", () => {
    expect(view).toContain("Delete my personal data");
    expect(view).toContain("not available from this screen");
    expect(view).toContain("processing side is not live");
    expect(view).toContain("contact support");
    // No queued-request or lifecycle promise may appear anywhere.
    expect(view).not.toContain("processed within");
    expect(view).not.toContain("30 days");
    expect(view).not.toContain("Delete all my data");
    expect(view).not.toContain("Delete your workspace");
  });
});

describe("Solo Security & Data component behavior", () => {
  const h = vi.hoisted(() => ({
    download: vi.fn(),
  }));

  vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
      auth: {},
      functions: { invoke: () => {
        throw new Error("the Solo security-data view must not invoke any function while the deletion lifecycle is fail-closed (INT-070)");
      } },
    },
  }));
  vi.mock("@/lib/downloadMyUserData", () => ({ downloadMyUserData: (...a: unknown[]) => h.download(...a) }));
  vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
  vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

  let React: typeof import("react");
  let root: import("react-dom/client").Root | null = null;
  let host: HTMLDivElement | null = null;

  const render = async () => {
    React = (await import("react")).default;
    const { createRoot } = await import("react-dom/client");
    const mod = await import("../solo/settings-security-data");
    host?.remove();
    if (root) await React.act(async () => { root!.unmount(); });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await React.act(async () => {
      root!.render(React!.createElement(mod.SoloSecurityDataView));
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const act = async (fn: () => Promise<unknown> | void) => React.act(fn);

  it("renders the canonical panel's three controls inside the Solo view", { timeout: 30000 }, async () => {
    await render();
    for (const label of ["Change password", "Two-factor authentication", "Where you're signed in"]) {
      expect(document.body.textContent).toContain(label);
    }
  });

  it("workspace deletion renders honest unavailable copy with NO button", { timeout: 30000 }, async () => {
    await render();
    expect(document.body.textContent).toContain("not available from this screen");
    const nodes = [...document.querySelectorAll("div,section,p")].filter((n) => n.textContent?.includes("not available from this screen"));
    expect(nodes.length).toBeGreaterThan(0);
    const unavailable = nodes[nodes.length - 1];
    expect(unavailable.querySelector("button")).toBeNull();
  });

  it("personal-data deletion renders unavailable copy with NO request button (fail-closed until INT-070)", { timeout: 30000 }, async () => {
    await render();
    expect(document.body.textContent).toContain("processing side is not live");
    const block = [...document.querySelectorAll("div,section,p")].filter((n) => n.textContent?.includes("processing side is not live"));
    expect(block.length).toBeGreaterThan(0);
    // No request/submit/deletion button anywhere in this view.
    const allButtons = [...document.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(allButtons.find((t) => /request deletion|submit deletion|delete/i.test(t))).toBeUndefined();
    expect(document.body.textContent).not.toContain("30 days");
    expect(document.body.textContent).not.toContain("Request submitted");
  });

  it("export: the control rides the canonical helper; its failure never claims success", { timeout: 30000 }, async () => {
    await render();
    h.download.mockReset();
    h.download.mockRejectedValueOnce(new Error("not signed in"));
    const dl = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Download"))!;
    await act(async () => { dl.click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("has been downloaded");
  });
});
