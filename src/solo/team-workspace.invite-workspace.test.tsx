import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteDialog, SoloTeamWorkspace } from "./team-workspace";
import type { TeamWorkspaceRecord } from "./team-workspace-contract";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  // Mutable, because the whole point of the switch guard is that this value CHANGES
  // underneath an open dialog. A frozen mock cannot exercise it.
  tenant: { activeTenantId: "tenant-1" as string | null },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: mocks.tenant.activeTenantId, loading: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspace: TeamWorkspaceRecord = {
  tenant_id: "tenant-1",
  tenant_name: "Northwind Advisory",
  viewer_permission: "owner",
  can_manage_profiles: true,
  can_manage_invitations: true,
  can_change_permissions: true,
  total_members: 1,
  members: [
    {
      membership_id: "m1", user_id: "u1", full_name: "Ada Vance", email: "ada@tests.invalid",
      avatar_url: null, status: "active", permission: "owner", is_owner: true,
      job_title: null, responsibilities: null, last_sign_in_at: null,
    },
  ],
  invitations: [],
};

/**
 * The REAL shape supabase-js produces for a non-2xx: `data` is null, `error.message` is the
 * framework constant, and the server's own sentence is only reachable through `error.context`.
 * The previous version of this file invented `{ error: { message: "<sentence>" } }` — a shape
 * the client never produces — so it asserted the sentence was shown while the live surface
 * showed the constant. Caught by adversarial review.
 */
function functionsHttpError(status: number, body: unknown) {
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: { status, json: async () => body },
  };
}

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!found) throw new Error(`no button matching "${label}" — saw: ${[...host.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return found as HTMLButtonElement;
};
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const settle = (ms = 240) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function mountDialog() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const onInvited = vi.fn();
  const render = () => act(() => { root.render(<InviteDialog workspace={workspace} onClose={onClose} onInvited={onInvited} />); });
  render();
  // Re-render with IDENTICAL props. React preserves component state, so this reproduces what a
  // tenant-context change does in the real app — the component re-reads the context — without
  // disturbing what the operator has typed.
  return { host, onClose, onInvited, rerender: render };
}

/** Fill the form and advance to the review step. */
function compose(host: HTMLElement, email = "new.person@example.com") {
  setValue(host.querySelector("input[type=email]") as HTMLInputElement, email);
  const title = [...host.querySelectorAll("input")].find((n) => n.placeholder === "Operations Lead") as HTMLInputElement;
  setValue(title, "Operations Lead");
  setValue(host.querySelector("textarea") as HTMLTextAreaElement, "Owns client handoffs.");
  click(button(host, "Review invitation"));
}

beforeEach(() => {
  mocks.invoke.mockReset().mockResolvedValue({ data: { ok: true, emailed: true, tenantId: "tenant-1" }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: workspace, error: null });
  mocks.success.mockReset(); mocks.error.mockReset(); mocks.warning.mockReset();
  mocks.tenant.activeTenantId = "tenant-1";
  document.body.innerHTML = "";
});

describe("an invitation names the workspace it will be sent to", () => {
  it("names the workspace, recipient, permission, title and responsibilities before anything is sent", () => {
    const { host } = mountDialog();
    compose(host);
    const review = host.querySelector(".stw-invite-review")?.textContent ?? "";
    expect(review, "the workspace is named").toContain("Northwind Advisory");
    expect(review).toContain("new.person@example.com");
    expect(review).toContain("Member");
    expect(review).toContain("Operations Lead");
    expect(review).toContain("Owns client handoffs.");
    expect(mocks.invoke, "nothing is sent by reaching the review step").not.toHaveBeenCalled();
  });

  it("sends the workspace it was opened against as the expected workspace", async () => {
    const { host } = mountDialog();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    const [fn, options] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("solo-team-invitations");
    expect(options.body).toMatchObject({
      action: "create", expectedTenantId: "tenant-1", email: "new.person@example.com", permission: "member",
    });
  });
});

describe("a refusal reaches the operator in the server's own words", () => {
  it("reads the sentence off the non-2xx body rather than the framework constant", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError(403, { ok: false, error: "only an owner or admin may manage team invitations in that workspace" }),
    });
    const { host, onInvited } = mountDialog();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.error).toHaveBeenCalledWith("only an owner or admin may manage team invitations in that workspace");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onInvited, "a refused invitation does not refresh as though it worked").not.toHaveBeenCalled();
  });

  it("never shows the framework constant, whatever shape the failure arrives in", async () => {
    for (const failure of [
      { data: null, error: functionsHttpError(500, { ok: false }) },
      { data: null, error: functionsHttpError(500, "not json at all") },
      { data: null, error: { message: "Edge Function returned a non-2xx status code" } },
    ]) {
      mocks.error.mockReset();
      mocks.invoke.mockResolvedValue(failure);
      const { host } = mountDialog();
      compose(host);
      await act(async () => { button(host, "Confirm and send invitation").click(); });
      const said = String(mocks.error.mock.calls[0][0]);
      expect(said, `leaked the constant for ${JSON.stringify(failure.error)}`).not.toMatch(/non-2xx/i);
      expect(said.length).toBeGreaterThan(0);
      document.body.innerHTML = "";
    }
  });

  it("surfaces the deploy-window refusal so a stale page says what to do", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError(400, { ok: false, error: "This page is out of date, so it could not say which workspace to invite into. Reload Team and try again." }),
    });
    const { host } = mountDialog();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(String(mocks.error.mock.calls[0][0])).toContain("Reload Team");
  });
});

describe("a workspace that changes under an open invitation", () => {
  it("refuses rather than sending to either workspace, and names the one it meant", async () => {
    const { host, rerender } = mountDialog();
    compose(host);
    // The live active workspace moves. The dialog was opened against Northwind and the review
    // named Northwind; sending to the new one invites a stranger into a workspace nobody named,
    // and sending to Northwind contradicts the live screen. So it aborts.
    mocks.tenant.activeTenantId = "tenant-2";
    rerender();
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.invoke, "nothing is sent").not.toHaveBeenCalled();
    expect(String(mocks.error.mock.calls[0][0])).toContain("Northwind Advisory");
  });
});

describe("the dialog survives the roster reloading underneath it", () => {
  it("stays open with its typed input while a search refetch is in flight", async () => {
    // REGRESSION GUARD (§58). `useTeamWorkspace.load(0)` sets `value: null` BEFORE it awaits the
    // RPC, so the roster is null for the whole duration of every refetch. While the dialog was
    // rendered off that value, a single keystroke in the search box unmounted it mid-typing with
    // no explanation — and silently made the workspace-switch guard unreachable, because the
    // remount re-initialised it against the new workspace.
    //
    // The RPC is DEFERRED on purpose. With an instantly-resolved mock both state updates land in
    // one act() and the intermediate null render never commits, so the unmount is invisible and
    // this test passes against the very regression it exists to catch (verified: it did).
    let release!: (v: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    mocks.rpc.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return { data: workspace, error: null };
      await pending;
      return { data: workspace, error: null };
    });

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await settle();

    click(button(host, "Invite someone"));
    const email = host.querySelector("input[type=email]") as HTMLInputElement;
    expect(email, "the dialog opened").toBeTruthy();
    setValue(email, "half.typed@example.com");

    // A search keystroke — the commonest refetch there is.
    const search = host.querySelector(".stw-filters input") as HTMLInputElement;
    expect(search, "the search box was found").toBeTruthy();
    setValue(search, "ada");
    await settle();

    // Prove the refetch ACTUALLY FIRED. Without this the test degrades silently: if the search
    // selector moves or the debounce changes, `calls` stays at 1, nothing ever reloads, and every
    // assertion below passes because there was no null window to survive.
    expect(calls, "the refetch actually fired").toBe(2);
    expect(host.textContent, "the roster really is null right now").toContain("Confirmed members of this workspace");

    // The refetch is IN FLIGHT: the roster is null right now.
    const during = host.querySelector("input[type=email]") as HTMLInputElement | null;
    expect(during, "the invitation dialog survives a roster refetch").toBeTruthy();
    expect(during?.value, "what was typed survived the refetch").toBe("half.typed@example.com");

    await act(async () => { release(null); await pending; });
    const after = host.querySelector("input[type=email]") as HTMLInputElement | null;
    expect(after?.value, "and still survives once the roster comes back").toBe("half.typed@example.com");
  });
});

describe("a genuine workspace switch closes the invitation", () => {
  it("closes the dialog and says so, rather than leaving it over another workspace's roster", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = () => act(() => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await settle();
    click(button(host, "Invite someone"));
    expect(host.querySelector("input[type=email]"), "the dialog opened").toBeTruthy();

    // Not a refetch — the active workspace genuinely changed.
    mocks.tenant.activeTenantId = "tenant-2";
    render();
    await settle();

    expect(host.querySelector("input[type=email]"), "the dialog is closed").toBeFalsy();
    expect(String(mocks.error.mock.calls.at(-1)?.[0])).toContain("Northwind Advisory");
    expect(mocks.invoke, "and nothing was sent").not.toHaveBeenCalled();
  });
});

describe("failure, retry and cancellation", () => {
  it("stays open after a failure so the same invitation can be retried", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: functionsHttpError(500, { ok: false, error: "network unreachable" }) });
    const { host, onClose, onInvited } = mountDialog();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(onClose, "the dialog stays open").not.toHaveBeenCalled();
    mocks.invoke.mockResolvedValue({ data: { ok: true, emailed: true, tenantId: "tenant-1" }, error: null });
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[1][1].body.expectedTenantId).toBe("tenant-1");
    expect(onInvited).toHaveBeenCalled();
  });

  it("sends nothing when the operator goes back or cancels", () => {
    const { host, onClose } = mountDialog();
    compose(host);
    click(button(host, "Back"));
    expect(mocks.invoke).not.toHaveBeenCalled();
    click(button(host, "Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("is honest when the invitation was created but the email did not go", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, emailed: false, tenantId: "tenant-1" }, error: null });
    const { host } = mountDialog();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.warning).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
