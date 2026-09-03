import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteDialog } from "./team-workspace";
import type { TeamWorkspaceRecord } from "./team-workspace-contract";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), functions: { invoke: mocks.invoke } },
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "tenant-1", loading: false }),
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
  members: [],
  invitations: [],
};

const other: TeamWorkspaceRecord = { ...workspace, tenant_id: "tenant-2", tenant_name: "Harbor Group" };

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function mount(ws: TeamWorkspaceRecord = workspace) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const onInvited = vi.fn();
  const render = (next: TeamWorkspaceRecord) =>
    act(() => {
      root.render(<InviteDialog workspace={next} onClose={onClose} onInvited={onInvited} />);
    });
  render(ws);
  return { host, root, onClose, onInvited, render };
}

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!found) throw new Error(`no button matching "${label}" — saw: ${[...host.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return found as HTMLButtonElement;
};

const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

/** Fill the form and advance to the review step. */
function compose(host: HTMLElement, email = "new.person@example.com") {
  const inputs = host.querySelectorAll("input, textarea, select");
  setValue(host.querySelector("input[type=email]") as HTMLInputElement, email);
  const title = [...inputs].find((n) => (n as HTMLInputElement).placeholder === "Operations Lead") as HTMLInputElement;
  setValue(title, "Operations Lead");
  const resp = host.querySelector("textarea") as HTMLTextAreaElement;
  setValue(resp, "Owns client handoffs.");
  click(button(host, "Review invitation"));
}

beforeEach(() => {
  mocks.invoke.mockReset().mockResolvedValue({ data: { ok: true, emailed: true, tenantId: "tenant-1" }, error: null });
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.warning.mockReset();
  document.body.innerHTML = "";
});

describe("an invitation names the workspace it will be sent to", () => {
  it("names the workspace, recipient, permission, title and responsibilities before anything is sent", () => {
    const { host } = mount();
    compose(host);
    const review = host.querySelector(".stw-invite-review")?.textContent ?? "";
    expect(review, "the workspace is named").toContain("Northwind Advisory");
    expect(review).toContain("new.person@example.com");
    expect(review).toContain("Member");
    expect(review).toContain("Operations Lead");
    expect(review).toContain("Owns client handoffs.");
    expect(mocks.invoke, "nothing is sent by reaching the review step").not.toHaveBeenCalled();
  });

  it("sends the workspace the operator was looking at as the expected workspace", async () => {
    const { host } = mount();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fn, options] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("solo-team-invitations");
    expect(options.body).toMatchObject({
      action: "create",
      expectedTenantId: "tenant-1",
      email: "new.person@example.com",
      permission: "member",
    });
  });

  it("never sends an invitation without naming a workspace", async () => {
    const { host } = mount();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.expectedTenantId, "a guess is never substituted for the named workspace").toBeTruthy();
    expect(typeof body.expectedTenantId).toBe("string");
  });
});

describe("a workspace that changes under an open invitation", () => {
  it("refuses rather than sending to either workspace", async () => {
    const { host, render } = mount();
    compose(host);
    // The operator switched workspace while the confirmation was on screen. The dialog was opened
    // against Northwind and the review named Northwind; sending to Harbor would invite a stranger
    // into a workspace nobody named, and sending to Northwind would contradict the live screen.
    render(other);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.invoke, "nothing is sent").not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
    const said = String(mocks.error.mock.calls[0][0]);
    expect(said).toMatch(/workspace/i);
  });

  it("says which workspace it was going to send to, rather than failing blankly", async () => {
    const { host, render } = mount();
    compose(host);
    render(other);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(String(mocks.error.mock.calls[0][0])).toContain("Northwind Advisory");
  });
});

describe("failure, retry and cancellation", () => {
  it("reports a refusal in the server's own words and does not claim a send", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "only an owner or admin may manage team invitations in that workspace" },
    });
    const { host, onInvited } = mount();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.error).toHaveBeenCalledWith("only an owner or admin may manage team invitations in that workspace");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onInvited, "a refused invitation does not refresh as though it worked").not.toHaveBeenCalled();
  });

  it("stays open after a failure so the same invitation can be retried", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "network unreachable" } });
    const { host, onClose, onInvited } = mount();
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
    const { host, onClose } = mount();
    compose(host);
    click(button(host, "Back"));
    expect(mocks.invoke).not.toHaveBeenCalled();
    click(button(host, "Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("is honest when the invitation was created but the email did not go", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, emailed: false, tenantId: "tenant-1" }, error: null });
    const { host } = mount();
    compose(host);
    await act(async () => { button(host, "Confirm and send invitation").click(); });
    expect(mocks.warning).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
