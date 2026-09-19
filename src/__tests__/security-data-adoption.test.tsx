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

  it("the deletion request rides the existing edge — no second deletion engine", () => {
    const view = read("src/solo/settings-security-data.tsx");
    expect(view).toContain('functions.invoke("request-data-deletion"');
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

  it("the deletion control names the real operation: a request over personal data, processed within 30 days", () => {
    expect(view).toContain("Request deletion of my personal data");
    expect(view).toContain("30 days");
    // It must not claim to delete the workspace or business records.
    expect(view).not.toContain("Delete all my data");
    expect(view).not.toContain("Delete your workspace");
  });
});

describe("Solo Security & Data component behavior", () => {
  const h = vi.hoisted(() => ({
    invoke: vi.fn(),
    getSession: vi.fn(),
    download: vi.fn(),
  }));

  vi.mock("@/integrations/supabase/client", () => ({
    supabase: {
      auth: { getSession: (...a: unknown[]) => h.getSession(...a) },
      functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
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

  it("deletion request: unauthenticated fails closed — no success state", { timeout: 30000 }, async () => {
    await render();
    h.getSession.mockReset();
    h.getSession.mockResolvedValueOnce({ data: { session: null } });
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"))!;
    await act(async () => { button.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Submit deletion request"));
    if (confirm) {
      await act(async () => { confirm.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    }
    expect(document.body.textContent).not.toContain("Request submitted");
    expect(document.body.textContent).not.toContain("Reference:");
  });

  it("deletion request: success shows the request id and prevents re-submission", { timeout: 30000 }, async () => {
    await render();
    h.getSession.mockReset();
    h.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1" } } } });
    h.invoke.mockReset();
    h.invoke.mockResolvedValueOnce({ data: { success: true, requestId: "req-123" }, error: null });
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"))!;
    await act(async () => { button.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Submit deletion request"))!;
    expect(confirm).toBeTruthy();
    await act(async () => { confirm.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(document.body.textContent).toContain("req-123");
    // Submitted state: no request button remains to double-click.
    expect([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"))).toBeUndefined();
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("deletion request: while in flight the control is disabled, and the submitted state removes it (one invoke only)", { timeout: 30000 }, async () => {
    await render();
    h.getSession.mockReset();
    h.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1" } } } });
    let resolveInvoke: (value: { data: { success: boolean; requestId: string }; error: null }) => void = () => {};
    h.invoke.mockReset();
    h.invoke.mockReturnValueOnce(new Promise((resolve) => { resolveInvoke = resolve; }));
    const trigger = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"));
    expect(trigger()!.hasAttribute("disabled")).toBe(false);
    await act(async () => { trigger()!.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Submit deletion request"))!;
    await act(async () => { confirm.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    // While the request is in flight, the trigger is disabled and the dialog
    // action behind it carries the same guard — a rapid reopen-and-resubmit
    // cannot start a second request through the UI.
    const inFlightTrigger = trigger();
    expect(inFlightTrigger).toBeTruthy();
    expect(inFlightTrigger!.hasAttribute("disabled")).toBe(true);
    await act(async () => { resolveInvoke({ data: { success: true, requestId: "req-1" }, error: null }); await new Promise((r) => setTimeout(r, 0)); });
    // The submitted state replaces the control entirely (with the request
    // reference on screen), so nothing remains to re-fire.
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(trigger()).toBeUndefined();
    expect(document.body.textContent).toContain("req-1");
  });

  it("deletion request: a 2xx response without a verified requestId is a failure, never a confirmation", { timeout: 30000 }, async () => {
    await render();
    h.getSession.mockReset();
    h.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1" } } } });
    h.invoke.mockReset();
    h.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"))!;
    await act(async () => { button.click(); await Promise.resolve(); });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Submit deletion request"))!;
    await act(async () => { confirm.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(document.body.textContent).not.toContain("Request submitted");
    expect(document.body.textContent).not.toContain("Reference:");
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("deletion request: backend failure never renders success", { timeout: 30000 }, async () => {
    await render();
    h.getSession.mockReset();
    h.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1" } } } });
    h.invoke.mockReset();
    h.invoke.mockResolvedValueOnce({ data: null, error: new Error("edge down") });
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Request deletion"))!;
    await act(async () => { button.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Submit deletion request"))!;
    await act(async () => { confirm.click(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(document.body.textContent).not.toContain("Request submitted");
    expect(document.body.textContent).not.toContain("Reference:");
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
