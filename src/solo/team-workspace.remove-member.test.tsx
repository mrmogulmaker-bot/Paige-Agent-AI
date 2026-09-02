/**
 * The Owner-only "Remove from workspace" control, driven as a person would drive it.
 *
 * These are jsdom tests against the real components with the Supabase client mocked. They prove the
 * SCREEN's behaviour — what renders, what focus does, what is sent, and what is claimed afterwards.
 * They do not prove the database refuses anything; that is the migration's own proof, run separately
 * against production inside a rolled-back transaction, and the two are reported apart.
 *
 * The bar every one of these is written to: a failed request must never be able to read as a
 * removal, and a person using a keyboard must never be dropped somewhere they cannot see.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberEditor, SoloTeamWorkspace } from "./team-workspace";
import { removalRefusal, type TeamMemberRecord, type TeamWorkspaceRecord } from "./team-workspace-contract";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "tenant-1", loading: false }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const member = (over: Partial<TeamMemberRecord> = {}): TeamMemberRecord => ({
  membership_id: "membership-1", user_id: "member-1", full_name: "Dana Reyes", email: "dana@example.com",
  avatar_url: null, status: "active", permission: "member", is_owner: false,
  job_title: "Client Coordinator", responsibilities: "Owns client handoffs.", last_sign_in_at: null, ...over,
});

const workspace = (over: Partial<TeamWorkspaceRecord> = {}): TeamWorkspaceRecord => ({
  tenant_id: "tenant-1", tenant_name: "Example Team", viewer_permission: "owner",
  can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true,
  total_members: 2, members: [member()], invitations: [], ...over,
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  return { host, root, render: async () => act(async () => root.render(node)) };
}

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const byText = (host: HTMLElement, text: string) => buttons(host).find((b) => b.textContent?.trim() === text);
const removeTrigger = (host: HTMLElement) => byText(host, "Remove from workspace");
const confirmButton = (host: HTMLElement) => buttons(host).find((b) => /^(Confirm removal|Try again|Removing…)$/.test(b.textContent?.trim() ?? ""));

async function arm(host: HTMLElement) {
  await act(async () => removeTrigger(host)!.click());
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const m of Object.values(mocks)) m.mockReset();
});

describe("who is offered the control at all", () => {
  it("offers it to an owner, on an Admin or Member row", async () => {
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    expect(removeTrigger(host)).toBeTruthy();
  });

  it("does not offer it when the server did not say this viewer may change access", async () => {
    // can_change_permissions IS the owner flag, server-derived. An admin sees the roster and the
    // work-details editor; they must not be shown a control the database will refuse.
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace({ can_change_permissions: false })} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    expect(removeTrigger(host)).toBeFalsy();
  });

  it("never offers it on an owner row — by the flag and by the permission, independently", async () => {
    for (const owner of [member({ is_owner: true }), member({ permission: "owner", is_owner: false })]) {
      document.body.innerHTML = "";
      const { host, render } = mount(<MemberEditor member={owner} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
      await render();
      expect(removeTrigger(host), `owner row rendered a remove control (${JSON.stringify(owner.permission)})`).toBeFalsy();
    }
  });

  it("never offers it on a legacy specialised permission", async () => {
    // The screen states it does not relabel or reassign these. Offering to remove one would be
    // exactly that, and the database refuses it too — so the two sides agree rather than drift.
    const { host, render } = mount(<MemberEditor member={member({ permission: "coach" })} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    expect(removeTrigger(host)).toBeFalsy();
  });
});

describe("arming the confirmation", () => {
  it("sends nothing, names the person and the workspace, and puts focus on Cancel", async () => {
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Dana Reyes");
    expect(host.textContent).toContain("Example Team");
    // The safe option is the default one. Focusing the destructive button would make Enter destroy.
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
  });

  it("says what removal does and does not do, and claims nothing about deletion", async () => {
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    const text = host.textContent ?? "";
    expect(text).toMatch(/lose access to this workspace/i);
    expect(text).toMatch(/account is not deleted/i);
    expect(text).toMatch(/new invitation/i);
    // It removes one membership row. Anything stronger would be false.
    expect(text).not.toMatch(/permanently delete|cannot be undone|delete their data|erase/i);
  });

  it("Escape backs out of the confirmation instead of discarding the editor", async () => {
    // The editor holds unsaved job title and responsibilities. Escape meaning "throw all that away"
    // when the user was answering "Remove Dana?" is the wrong question answered destructively.
    const onClose = vi.fn();
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={onClose} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmButton(host), "the confirmation should be disarmed, not still open").toBeFalsy();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the control it came from when the user cancels", async () => {
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => byText(host, "Cancel")!.click());
    expect(document.activeElement).toBe(removeTrigger(host));
  });
});

describe("what happens when it fails", () => {
  it("never reports a removal when the server refused", async () => {
    const onRemoved = vi.fn();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "only the workspace owner may remove someone from this workspace" } });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={onRemoved} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    expect(onRemoved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Only the workspace owner");
  });

  it("shows an honest failure and a retry when the request itself broke", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch" } });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    const confirm = () => confirmButton(host)!;
    await act(async () => confirm().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nothing changed");
    expect(host.textContent).toContain("Try again");
    // Exactly one request per click — a retry must not stack.
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => confirm().click());
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not claim a removal it did not perform when the person was already gone", async () => {
    // The roster is behind, not wrong. Saying "Removed" here credits this owner with an act they
    // did not take, and hides that someone else did.
    const onRemoved = vi.fn();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "that person is not on this workspace's team" } });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={onRemoved} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRemoved.mock.calls[0][0]).toContain("no longer on this team");
    expect(onRemoved.mock.calls[0][0]).not.toMatch(/removed/i);
  });

  it("refuses to claim success when the server acted on a different workspace", async () => {
    // Switching workspaces writes profiles.active_tenant_id before this screen's state changes, so
    // the echoed tenant is the only thing that can tell us which roster was actually touched.
    const onRemoved = vi.fn();
    mocks.rpc.mockResolvedValue({ data: { tenant_id: "tenant-OTHER", membership_id: "m", removed_user_id: "member-1" }, error: null });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={onRemoved} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    expect(onRemoved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/workspace changed/i);
  });
});

describe("what it sends", () => {
  it("names the member and states the workspace it believes it is acting in", async () => {
    mocks.rpc.mockResolvedValue({ data: { tenant_id: "tenant-1", membership_id: "membership-1", removed_user_id: "member-1" }, error: null });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    expect(mocks.rpc).toHaveBeenCalledWith("remove_solo_team_member", { _member_user_id: "member-1", _expected_tenant_id: "tenant-1" });
  });
});

describe("the roster after a removal", () => {
  const rosterPayload = (members: TeamMemberRecord[]) => ({
    tenant_id: "tenant-1", tenant_name: "Example Team", viewer_permission: "owner",
    can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true,
    total_members: members.length, members, invitations: [],
  });

  it("closes the dialog, announces the outcome outside it, and leaves focus somewhere real", async () => {
    // All three failures this covers are the same failure: the refresh that PROVES the removal is
    // also what destroys the dialog, so anything said inside the dialog is never read, and the
    // roster row that opened it is gone, so restoring focus to it silently drops focus to <body>.
    const owner = member({ membership_id: "m-owner", user_id: "owner-1", full_name: "Ada Owner", permission: "owner", is_owner: true });
    const dana = member();
    mocks.rpc
      .mockResolvedValueOnce({ data: rosterPayload([owner, dana]), error: null })
      .mockResolvedValueOnce({ data: { tenant_id: "tenant-1", membership_id: "membership-1", removed_user_id: "member-1" }, error: null })
      .mockResolvedValue({ data: rosterPayload([owner]), error: null });

    const { host, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const row = Array.from(host.querySelectorAll("button.stw-row")).find((b) => b.textContent?.includes("Dana Reyes")) as HTMLButtonElement;
    expect(row, "Dana's roster row").toBeTruthy();
    await act(async () => row.click());
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();

    await arm(host);
    await act(async () => confirmButton(host)!.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    expect(host.querySelector('[role="dialog"]'), "the dialog must be gone").toBeFalsy();
    const status = host.querySelector('.stw-roster [role="status"]');
    expect(status?.textContent).toContain("Dana Reyes");
    expect(status?.textContent).toContain("no longer has access");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.contains(document.activeElement), "focus must be on an attached node").toBe(true);
    // The announcement names her on purpose. What must be gone is her ROW.
    expect(Array.from(host.querySelectorAll("button.stw-row")).some((r) => r.textContent?.includes("Dana Reyes"))).toBe(false);
  });
});

describe("the refusal vocabulary itself", () => {
  it("recognises every reason this seam authors, and degrades honestly for anything else", () => {
    const cases: Array<[string, RegExp, boolean, boolean]> = [
      ["only the workspace owner may remove someone from this workspace", /Only the workspace owner/, false, false],
      ["an owner cannot be removed from this workspace here", /is an owner/, false, false],
      ["you cannot remove yourself from this workspace", /can't remove yourself/, false, false],
      ["only an Admin or a Member can be removed from this workspace", /access level isn't handled/, false, false],
      ["your active workspace changed before this could run; nothing was removed", /workspace changed/, false, false],
      ["authentication required in an active workspace", /session ended/, false, false],
      ["that person is not on this workspace's team", /no longer on this team/, false, true],
    ];
    for (const [raw, expected, retryable, reconciled] of cases) {
      const refusal = removalRefusal(raw, "Dana Reyes", "Example Team");
      expect(refusal.message, raw).toMatch(expected);
      expect(refusal.retryable, raw).toBe(retryable);
      expect(refusal.reconciled, raw).toBe(reconciled);
    }
  });

  it("never prints a backend identifier it did not author", () => {
    // The neighbouring controls print error.message directly, which is fine until a trigger deeper
    // down answers. This is the sentence a person gets instead of that.
    const refusal = removalRefusal("OWNER_GUARD: tenant ownership may only be changed via grant_co_owner()/revoke_co_owner()", "Dana Reyes", "Example Team");
    expect(refusal.message).not.toMatch(/OWNER_GUARD|grant_co_owner|::/);
    expect(refusal.message).toContain("Nothing changed");
    expect(refusal.retryable).toBe(true);
  });

  it("degrades honestly when there is no message at all", () => {
    for (const empty of [null, undefined, ""]) {
      const refusal = removalRefusal(empty, "Dana Reyes", "Example Team");
      expect(refusal.message).toContain("still on this team");
      expect(refusal.reconciled).toBe(false);
    }
  });
});
