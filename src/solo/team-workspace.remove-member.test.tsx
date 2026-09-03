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

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), tenant: { activeTenantId: "tenant-1" } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: mocks.tenant.activeTenantId, loading: false }),
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
  for (const m of Object.values(mocks)) if (typeof m === "function") (m as unknown as { mockReset: () => void }).mockReset();
  mocks.tenant.activeTenantId = "tenant-1";
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

describe("before anything is armed", () => {
  it("does not put the caret on the destructive button when the editor opens", async () => {
    // THE DEFECT THIS EXISTS FOR, found by an adversarial read of the pushed diff and not by this
    // suite. The stage-follows-focus effect fired its `idle` branch on MOUNT, and a child's effects
    // commit before its parent's — so it overrode the Modal's own initial focus and left the caret
    // on "Remove from workspace". Opening a teammate and pressing Enter armed a removal. Every test
    // here passed, because not one of them looked at focus before calling arm().
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label") ?? "").not.toMatch(/^Remove /);
  });

  it("still moves focus to Cancel once the confirmation is armed", async () => {
    // The guard above must not have cost the behaviour it protects.
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
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
    // HONEST LABEL: this exercises a branch the server cannot currently reach. The RPC refuses on
    // `_expected_tenant_id IS DISTINCT FROM _tenant` before doing anything and, on success, always
    // echoes the tenant it acted on — so a mismatched echo is a fabricated response, not a hazard
    // this proves we survive. The guard stays as defence in depth against a future change to that
    // contract, and this is a UI-state test of it, NOT workspace-safety evidence. The real
    // workspace safety is the server's refusal, proven in docs/evidence/team-removal/.
    const onRemoved = vi.fn();
    mocks.rpc.mockResolvedValue({ data: { tenant_id: "tenant-OTHER", membership_id: "m", removed_user_id: "member-1" }, error: null });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={onRemoved} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    expect(onRemoved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    // Reported through the channel that OUTLIVES this dialog, not inside it. The third adversarial
    // read showed why the in-dialog version was unsafe: leaving `pending` releases the parent's
    // hold, and when the member is not in the new roster the dialog unmounts in the same flush and
    // takes the message with it — telling the operator nothing about a call the server may have
    // applied. The assertion still proves the same intent: nothing claims success.
    // The wording is now about WHAT HAPPENED, not a guess at why. This sub-case is the server
    // echoing a different tenant while the client never switched at all — the previous message
    // told the operator "your active workspace changed", which was simply false here, and the
    // harness certified it. Named by the fourth read.
    const spoken = mocks.error.mock.calls.map((c) => String(c[0]));
    expect(spoken.some((t) => /server reported acting on a different workspace/i.test(t)), `said: ${JSON.stringify(spoken)}`).toBe(true);
    expect(spoken.some((t) => /your active workspace changed/i.test(t)), "and does not claim the operator switched when they did not").toBe(false);
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

  it("issues exactly ONE request when the confirm is clicked twice inside one batch", async () => {
    // `disabled` alone is not a guard. Two clicks dispatched before the disabling re-render commits
    // both reach the handler, and the second removal answers "that person is not on this
    // workspace's team" — which the screen then reports as a reconciliation instead of as the
    // removal the owner actually performed. Right roster, wrong sentence.
    mocks.rpc.mockResolvedValue({ data: { tenant_id: "tenant-1", membership_id: "membership-1", removed_user_id: "member-1" }, error: null });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    const confirm = confirmButton(host)!;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
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

describe("a selection that stops being live", () => {
  it("is cleared, not merely hidden — so the editor cannot reappear on its own later", async () => {
    // THE REGRESSION THIS EXISTS FOR, and it lands on the SHIPPED save flow, not on removal.
    // `refresh()` is `load(0)`: it drops every page past the first. A member reached through
    // "Load more" therefore falls out of the roster on any refresh — including the one that follows
    // a successful work-details save. Hiding the editor without clearing `selected` left the dialog
    // gone mid-save and never coming back, and a later "Load more" that returned that row RE-OPENED
    // it by itself, showing the stale snapshot.
    //
    // Found by an adversarial read of the pushed diff. The first version of this suite could not
    // see it: every test rendered MemberEditor directly, so nothing exercised the parent's own
    // selection lifecycle across a refresh.
    const owner = member({ membership_id: "m-owner", user_id: "owner-1", full_name: "Ada Owner", permission: "owner", is_owner: true });
    const dana = member();
    const page = (members: TeamMemberRecord[]) => ({
      tenant_id: "tenant-1", tenant_name: "Example Team", viewer_permission: "owner",
      can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true,
      total_members: 2, members, invitations: [],
    });

    let rosterCall = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_solo_team_workspace") {
        rosterCall += 1;
        // 1 initial page · 2 "Load more" · 3 the refresh after saving · 4 "Load more" again
        return { data: page(rosterCall === 2 || rosterCall === 4 ? [dana] : [owner]), error: null };
      }
      if (name === "set_solo_team_member_work_profile") return { data: { job_title: "Changed", responsibilities: "Owns client handoffs." }, error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    });

    const { host, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    await act(async () => byText(host, "Load more (1 remaining)")!.click());
    const row = Array.from(host.querySelectorAll("button.stw-row")).find((b) => b.textContent?.includes("Dana Reyes")) as HTMLButtonElement;
    expect(row, "Dana's row after Load more").toBeTruthy();
    await act(async () => row.click());
    expect(host.querySelector('[role="dialog"]'), "editor open on the page-2 member").toBeTruthy();

    // Save work details — the shipped flow, nothing to do with removal — which triggers the refresh.
    const title = host.querySelector<HTMLInputElement>('input[placeholder="e.g. Client Success Manager"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Changed");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => byText(host, "Save work details")!.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    // Now the load-more that used to resurrect the dialog.
    const loadMore = byText(host, "Load more (1 remaining)");
    if (loadMore) await act(async () => loadMore.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(host.querySelector('[role="dialog"]'), "a dialog must never re-open on its own").toBeFalsy();
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

  it("never prints a backend identifier it did not author, and does not promise a retry that cannot work", () => {
    // The neighbouring controls print error.message directly, which is fine until a trigger deeper
    // down answers. This is the sentence a person gets instead of that — and it does NOT offer a
    // Try again, because an unrecognised server refusal is by definition one nobody can promise
    // will clear. Deciding again decides the same.
    const refusal = removalRefusal("OWNER_GUARD: tenant ownership may only be changed via grant_co_owner()/revoke_co_owner()", "Dana Reyes", "Example Team");
    expect(refusal.message).not.toMatch(/OWNER_GUARD|grant_co_owner|::/);
    expect(refusal.message).toContain("Nothing changed");
    expect(refusal.retryable).toBe(false);
  });

  it("recognises the platform-owner role guard, which a removal can actually trigger", () => {
    // Not hypothetical. Removing a tenant Admin cascades into
    // trg_sync_tenant_member_to_user_roles, which deletes their global `admin` grant, which fires
    // protect_owner_admin (verified live: BEFORE DELETE OR UPDATE ON public.user_roles). When the
    // target is the platform owner it raises and the whole removal aborts — every time.
    const refusal = removalRefusal("Cannot remove admin role from platform owner", "Dana Reyes", "Example Team");
    expect(refusal.message).toMatch(/platform role/);
    expect(refusal.retryable).toBe(false);
    expect(refusal.reconciled).toBe(false);
  });

  it("still offers a retry for a transport failure, which is the one kind that is transient", () => {
    for (const transient of ["TypeError: Failed to fetch", "NetworkError when attempting to fetch", "request timed out"]) {
      const refusal = removalRefusal(transient, "Dana Reyes", "Example Team");
      expect(refusal.retryable, transient).toBe(true);
    }
  });


  it("degrades honestly when there is no message at all", () => {
    for (const empty of [null, undefined, ""]) {
      const refusal = removalRefusal(empty, "Dana Reyes", "Example Team");
      expect(refusal.message).toContain("still on this team");
      expect(refusal.reconciled).toBe(false);
      // No message at all is not a transport failure we can name, so it does not earn a retry.
      expect(refusal.retryable).toBe(false);
    }
  });
});

describe("what the peer read of the pushed diff found", () => {
  it("does not leave a removal announcement standing over a DIFFERENT workspace's roster", async () => {
    // The banner names a workspace — "Dana Reyes no longer has access to Example Team." — and this
    // component does NOT remount when the active workspace changes. That is the premise the invite
    // dialog's own switch guard rests on. Without an equivalent, the announcement sat over the next
    // workspace's roster still making a claim about the previous one: the same cross-workspace false
    // statement the invitation seam was repaired to stop making. No test covered it, because every
    // removal test drove a single workspace.
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_solo_team_workspace") return Promise.resolve({ data: workspace(), error: null });
      return Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null });
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    // The roster read is debounced, so settle before driving it.
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const row = host.querySelector<HTMLButtonElement>("button.stw-row");
    expect(row, "the roster rendered a row to open").toBeTruthy();
    await act(async () => row!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    const banner = host.querySelector('[role="status"].stw-separation-note');
    expect(banner?.textContent ?? "", "the announcement is shown in its own workspace").toContain("Example Team");

    // Now switch workspace. The claim about the old one must not survive.
    //
    // Rendered as a FRESH element rather than re-calling `render()` with the captured one: React
    // bails out of re-rendering a referentially identical element, so the component never re-read
    // the mocked context and the test failed for a reason that had nothing to do with the product.
    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    const after = host.querySelector('[role="status"].stw-separation-note');
    expect(after, "the announcement about the previous workspace is gone").toBeNull();
  });

  it("cannot be dismissed while a removal is in flight, so a refusal is never lost in silence", async () => {
    // Dismissing mid-call unmounted the editor. If the server then REFUSED, the setState carrying
    // that refusal landed on an unmounted component and was discarded — closed dialog, unchanged
    // roster, and NO indication the removal had failed. `inFlight` guarded a second click; it never
    // guarded a dismissal. A destructive action failing silently is the one outcome to rule out.
    let settle: (v: { data: null; error: { message: string } }) => void = () => {};
    mocks.rpc.mockImplementation(() => new Promise((res) => { settle = res; }));
    const onClose = vi.fn();
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={onClose} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    // EVERY dismissal path, enumerated by what the person actually clicks — not by `aria-label`.
    // The first version of this test selected the close control by aria-label, which the FOOTER
    // button does not carry, so it proved three of the four paths and silently omitted the one
    // control literally labelled "Close". That is the path a person trying to back out uses, and it
    // was the one still wired to the ungated prop. Found by an independent read, not by this suite.
    const closeX = buttons(host).find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("close"));
    expect(closeX, "the header close control was found").toBeTruthy();
    await act(async () => closeX!.click());
    const footerClose = host.querySelector<HTMLButtonElement>(".stw-modal-actions button.stw-btn.secondary");
    expect(footerClose, "the footer close control was found").toBeTruthy();
    await act(async () => footerClose!.click());
    expect(footerClose!.disabled, "and it is disabled, not a live-looking control that silently does nothing").toBe(true);
    expect(closeX!.disabled, "the header control is disabled too").toBe(true);
    const backdrop = host.querySelector<HTMLElement>(".stw-modal-backdrop, [data-modal-backdrop]");
    if (backdrop) await act(async () => backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose, "the dialog stayed open while the removal was in flight").not.toHaveBeenCalled();

    // The refusal now has somewhere to land, and the person can read it.
    await act(async () => { settle({ data: null, error: { message: "only the workspace owner may remove someone from this workspace" } }); });
    // Scoped to the removal block: `validateWorkProfile` renders its own [role="alert"] elements
    // under Job title and Responsibilities, and those come FIRST in document order. Correct today
    // only because the fixture is valid — an over-long title would have silently asserted against
    // the wrong element.
    const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? "");
    expect(alerts.some((t) => /owner/i.test(t)), `no removal refusal among: ${JSON.stringify(alerts)}`).toBe(true);
  });
});

describe("what the exact-head re-read found", () => {
  it("does not wedge on a rejected request now that the dialog cannot be dismissed", async () => {
    // Blocking dismissal turns an unhandled rejection into a TRAP: supabase-js resolves a PostgREST
    // refusal into `{ error }` rather than throwing, but a real transport rejection (offline, DNS,
    // an aborted connection) rejects the promise — and with every close path correctly gated, an
    // escaping rejection would leave the person on "Removing…" for ever, with no error and no way
    // out but a page reload, and `inFlight` stuck true so retry is dead too.
    let fail: (e: Error) => void = () => {};
    mocks.rpc.mockImplementation(() => new Promise((_res, rej) => { fail = rej; }));
    const onClose = vi.fn();
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={onClose} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    await act(async () => { fail(new Error("TypeError: Failed to fetch")); });

    const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? "");
    expect(alerts.some((t) => t.trim().length > 0), "the rejection is reported, not swallowed").toBe(true);
    const footerClose = host.querySelector<HTMLButtonElement>(".stw-modal-actions button.stw-btn.secondary");
    expect(footerClose!.disabled, "and the person can leave again").toBe(false);
    expect(confirmButton(host), "and retry is offered rather than wedged").toBeTruthy();
  });

  it("is not unmounted by the PARENT mid-removal, so the outcome still has somewhere to land", async () => {
    // A second seam entirely: gating dismissal inside the dialog cannot stop the parent unmounting
    // it. The editor renders on `selectedLive`, and a workspace switch during a pending removal
    // nulls the roster and drops the selected member — so the dialog vanished with no user action
    // at all, and BOTH outcomes were lost: the refusal had nowhere to land, and a removal the
    // server DID apply was never announced.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      return new Promise((res) => { settle = res; });
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    // The roster reloads and no longer carries the selected member.
    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    expect(host.querySelector('[role="dialog"]'), "the dialog survives the refetch while the call is in flight").toBeTruthy();

    await act(async () => { settle({ data: null, error: { message: "only the workspace owner may remove someone from this workspace" } }); });
    // Reported through the parent-owned channel rather than in a dialog that now sits over a
    // different workspace — and reported AT ALL, which is the point. Before this it was discarded.
    const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? "");
    const spoken = mocks.error.mock.calls.map((c) => String(c[0]));
    expect(
      alerts.some((t) => t.trim().length > 0) || spoken.some((t) => /owner/i.test(t)),
      `the refusal was reported, not discarded. alerts=${JSON.stringify(alerts)} toasts=${JSON.stringify(spoken)}`,
    ).toBe(true);
  });
});

describe("what the third read found", () => {
  it("cannot be closed mid-removal by CHANGING A PERMISSION either — the escape was not a close button", async () => {
    // The gate covered every close CONTROL and still missed this: `changePermission` ends in a
    // direct `onClose()`, and its block renders whenever the viewer may change access — a SUPERSET
    // of the condition that offers Remove. So a permission change during a pending removal unmounted
    // the dialog and the refusal was discarded exactly as before. Two rounds of "every path is
    // gated" both meant every path that is a button labelled close.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "set_solo_team_member_permission") return Promise.resolve({ data: null, error: null });
      return new Promise((res) => { settle = res; });
    });
    const onClose = vi.fn();
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={onClose} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    const select = host.querySelector<HTMLSelectElement>(".stw-permission-change select") ?? host.querySelector<HTMLSelectElement>("select");
    if (select) {
      await act(async () => {
        select.value = "admin";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const confirmAccess = buttons(host).find((b) => /access change/i.test(b.textContent ?? ""));
      if (confirmAccess) await act(async () => confirmAccess.click());
    }
    expect(onClose, "a permission change cannot close the dialog while a removal is in flight").not.toHaveBeenCalled();

    await act(async () => { settle({ data: null, error: { message: "only the workspace owner may remove someone from this workspace" } }); });
    const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? "");
    expect(alerts.some((t) => /owner/i.test(t)), `the refusal survived: ${JSON.stringify(alerts)}`).toBe(true);
  });

  it("names the workspace the call was SENT to while it runs, not whichever one is on screen now", async () => {
    // The parent hold keeps this dialog mounted across a workspace switch — which introduced a NEW
    // false statement: the live region re-rendered as "Removing Dana Reyes from Second Workspace…"
    // while the call was actually removing her from Example Team. An aria-live announcement
    // asserting a destructive act against a tenant it is not happening in is the same
    // cross-workspace claim this whole programme keeps closing.
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      return new Promise(() => {});
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const live = Array.from(host.querySelectorAll('[role="status"]')).map((n) => n.textContent ?? "").join(" | ");
    expect(live, "the in-flight line still names the workspace the call was sent to").toContain("Example Team");
    expect(live, "and does not claim anything about the workspace now on screen").not.toContain("Second Workspace");
    expect(live, "and renders a real ellipsis rather than a literal escape sequence").not.toContain("\\u2026");
  });

  it("reports a removal that SUCCEEDED after a workspace switch, instead of losing it", async () => {
    // The refusal branch was routed to a channel that outlives the dialog; its sibling — the branch
    // for a call the server may have APPLIED — was left rendering into the dialog, which then
    // unmounted in the same flush. The operator was told nothing at all about a real removal.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      return new Promise((res) => { settle = res; });
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    // The server DID act, in the workspace the call named.
    await act(async () => { settle({ data: { tenant_id: "tenant-1" }, error: null }); });

    // ASSERTS WHAT WAS SAID, not merely that something was. The previous version accepted any
    // non-empty string, so re-collapsing the two branches — recreating the exact defect the split
    // exists to fix — left it green. Measured: two separate mutations survived it.
    const spoken = mocks.error.mock.calls.concat(mocks.success.mock.calls, mocks.warning.mock.calls).map((c) => String(c[0]));
    expect(
      spoken.some((t) => /was removed from Example Team/i.test(t)),
      `the removal that HAPPENED is reported as having happened: ${JSON.stringify(spoken)}`,
    ).toBe(true);
    expect(
      spoken.some((t) => /nothing is being claimed/i.test(t)),
      "and is NOT reported with the other branch's sentence, which would deny a real removal",
    ).toBe(false);
  });
});

describe("the last cross-workspace claim", () => {
  it("does not put a reconciliation banner over a workspace it is not about", async () => {
    // `onRemoved` writes the roster banner. A "not on this team" reconciliation arriving after the
    // operator switched would have claimed something about a workspace no longer on screen — the
    // same class as the two branches beside it, and the one instance left unfixed. Flagged as
    // pre-existing by the third read.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      return new Promise((res) => { settle = res; });
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => { settle({ data: null, error: { message: "that person is not on this workspace's team" } }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const banner = host.querySelector('[role="status"].stw-separation-note');
    expect(banner, "no roster banner over the workspace this is not about").toBeNull();
    const spoken = mocks.error.mock.calls.map((c) => String(c[0]));
    expect(spoken.some((t) => t.trim().length > 0), `but the operator was still told: ${JSON.stringify(spoken)}`).toBe(true);
  });
});

describe("the fourth read", () => {
  it("will not let a removal and a permission change overlap in EITHER order", async () => {
    // The fourth read found the gate was itself a stale closure: `changePermission` captures
    // `requestClose` at the render where it was pressed, so if the removal had not started yet that
    // copy held `removalInFlight === false` and closed the dialog unconditionally when its own RPC
    // resolved — mid-removal, discarding the refusal exactly as before. The earlier test only ever
    // drove the other order, where the closure happens to be right.
    //
    // The fix is two-part, and this asserts the part a person can observe: the two destructive acts
    // are now MUTUALLY EXCLUSIVE, so the interleaving cannot begin from either side. The gate also
    // reads a ref now, which is what makes any surviving stale copy of `requestClose` correct —
    // that half is defence in depth and, with the interleaving impossible, is NOT reachable through
    // the UI to assert. Stated rather than counted as proven.
    let settlePermission: (v: unknown) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "set_solo_team_member_permission") return new Promise((res) => { settlePermission = res; });
      return new Promise(() => {});
    });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();

    // A permission change in flight must lock the destructive control.
    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "admin"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => buttons(host).find((b) => /access change/i.test(b.textContent ?? ""))!.click());
    expect(removeTrigger(host)?.disabled, "Remove is locked while a permission change is in flight").toBe(true);

    await act(async () => { settlePermission({ data: null, error: null }); });
    expect(removeTrigger(host)?.disabled, "and unlocked again once it settles").toBe(false);

    // ...and the reverse: a removal in flight must lock the permission control.
    await arm(host);
    await act(async () => confirmButton(host)!.click());
    await act(async () => { select.value = "admin"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const confirmAccess = buttons(host).find((b) => /access change/i.test(b.textContent ?? ""));
    expect(confirmAccess, "the permission confirmation is on screen to be judged").toBeTruthy();
    expect(confirmAccess!.disabled, "the permission change is locked while a removal is in flight").toBe(true);

    // ...and the invariant is symmetric: no OTHER write may start either. `saving` is shared by the
    // work-details save and the permission change, so the lock covers both — asserted so that is a
    // decision on the record rather than a side effect of reusing one flag.
    const titleInput = host.querySelector<HTMLInputElement>('input[maxlength="121"]');
    expect(titleInput, "the job-title field is present to dirty").toBeTruthy();
    // Through the NATIVE value setter. Assigning `.value` directly leaves React's own value tracker
    // untouched, so `onChange` never fires, the field never becomes dirty, and the Save button stays
    // disabled by `!dirty` — which made the first version of this assertion pass no matter what the
    // removal lock did. Caught by mutation: unlocking Save left the suite green.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(titleInput!, "Changed while removing");
      titleInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const saveWork = buttons(host).find((b) => /save work details/i.test(b.textContent ?? ""));
    expect(saveWork, "the save control is on screen to be judged").toBeTruthy();
    expect(saveWork!.disabled, "saving work details is locked while a removal is in flight").toBe(true);
  });

  it("names one workspace in EVERY string of the removal block, including the aria-labels", async () => {
    // Pinning only the live-region line left the paragraph above it and both aria-labels reading the
    // live roster, so three of four asserted a destructive act against the workspace it was NOT
    // happening in — while the fixed one said otherwise. The screen contradicted itself, and a
    // screen-reader user heard the wrong claim from the button labels.
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      return new Promise(() => {});
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const dialog = host.querySelector('[role="dialog"]')!;
    const spoken = [
      dialog.textContent ?? "",
      ...Array.from(dialog.querySelectorAll("[aria-label]")).map((n) => n.getAttribute("aria-label") ?? ""),
    ].join(" | ");
    expect(spoken, "the whole block names the workspace the call was sent to").toContain("Example Team");
    expect(spoken, "and nothing in it claims anything about the workspace now on screen").not.toContain("Second Workspace");
  });
});

describe("the fifth read", () => {
  it("locks the button that SENDS the removal during a permission save, not only the one that arms it", async () => {
    // My "both directions" claim was false. Only the ARM button carried `|| saving`; the CONFIRM
    // button did not. So an operator who arms FIRST and then changes permission had a live
    // "Confirm removal" throughout the permission round trip — an ordinary sequence ("remove them…
    // actually, change their access first"). Both writes then run together, and the operator is
    // told the permission change succeeded for somebody whose membership was just deleted.
    // My earlier test drove permission-then-arm and removal-then-permission, never armed-then-
    // permission, which is the only ordering that exposes the confirm control.
    let settlePermission: (v: unknown) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "set_solo_team_member_permission") return new Promise((res) => { settlePermission = res; });
      return new Promise(() => {});
    });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();

    await arm(host);
    expect(confirmButton(host)?.disabled, "armed and idle: the confirm is live").toBe(false);

    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "admin"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => buttons(host).find((b) => /access change/i.test(b.textContent ?? ""))!.click());

    expect(confirmButton(host)?.disabled, "and locked the moment another write is in flight").toBe(true);

    await act(async () => { settlePermission({ data: null, error: null }); });
    expect(confirmButton(host)?.disabled, "and live again once that write settles").toBe(false);
  });

  it("does not wedge the destructive control for ever when another write is rejected", async () => {
    // `saving` now gates Remove, so a transport rejection that escapes `setSaving(false)` does not
    // merely wedge its own button — it kills "Remove from workspace" until the dialog is closed and
    // reopened, with nothing said. I hung a gate off this flag without giving it the treatment the
    // gate's own comment says it needs.
    let failPermission: (e: Error) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "set_solo_team_member_permission") return new Promise((_r, rej) => { failPermission = rej; });
      return new Promise(() => {});
    });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();
    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "admin"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => buttons(host).find((b) => /access change/i.test(b.textContent ?? ""))!.click());
    expect(removeTrigger(host)?.disabled, "locked while it runs").toBe(true);

    await act(async () => { failPermission(new Error("TypeError: Failed to fetch")); });
    expect(removeTrigger(host)?.disabled, "and released when it fails, rather than wedged for ever").toBe(false);
    expect(mocks.error.mock.calls.length, "and the failure is reported").toBeGreaterThan(0);
  });

  it("does not wedge it when the WORK-DETAILS save is the write that is rejected either", async () => {
    // The sibling of the test above, and it is not redundant: `saving` is shared, but the two
    // writes are separate functions with separate awaits, so a wrap on one proves nothing about
    // the other. Mutation-testing the fix confirmed it — removing the try/catch from `save()`
    // alone left the whole suite green, which is exactly the blind spot that made me write the
    // permission test and stop.
    let failSave: (e: Error) => void = () => {};
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "set_solo_team_member_work_profile") return new Promise((_r, rej) => { failSave = rej; });
      return new Promise(() => {});
    });
    const { host, render } = mount(<MemberEditor member={member()} workspace={workspace()} onClose={vi.fn()} onSaved={vi.fn()} onRemoved={vi.fn()} />);
    await render();

    const titleInput = host.querySelector<HTMLInputElement>('input[maxlength="121"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(titleInput, "Changed");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => buttons(host).find((b) => /save work details/i.test(b.textContent ?? ""))!.click());
    expect(removeTrigger(host)?.disabled, "locked while the save runs").toBe(true);

    await act(async () => { failSave(new Error("TypeError: Failed to fetch")); });
    expect(removeTrigger(host)?.disabled, "and released when the save fails, rather than wedged for ever").toBe(false);
    expect(mocks.error.mock.calls.length, "and the failure is reported").toBeGreaterThan(0);
  });

  it("tells the operator to reopen the workspace the removal was SENT to, not the one they switched to", async () => {
    // "Your active workspace changed" is RAISED BY the switch, so if this sentence ever reads the
    // LIVE workspace it tells the operator to reopen the one they are already standing in, and
    // never names the one that still has the person on it. Pinning the in-flight strings did not
    // reach this: a refusal after a switch leaves the dialog entirely.
    //
    // HONEST NOTE, because the fifth read filed the source line as a defect and mutation says
    // otherwise: swapping `nameAtArm` back for the closure's own `workspace.tenant_name` does NOT
    // fail this test, and cannot. `confirmRemoval` closes over the render it was created in, and
    // the disarm effect makes an armed state unable to survive a switch — so those two expressions
    // are equal by construction, and the older line was correct by way of a stale closure rather
    // than by intent. What this test actually pins is that the sentence never becomes a LIVE read:
    // rewriting it as `workspaceRef.current.tenant_name` — the plausible "fix" for that staleness,
    // and the shape three other strings on this screen had to be corrected away from — turns it
    // red. That is the regression worth holding, and it is the one being claimed here.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const rosterA = workspace();
    const rosterB = workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? rosterA : rosterB, error: null });
      }
      if (name === "remove_solo_team_member") return new Promise((res) => { settle = res; });
      return new Promise(() => {});
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    await act(async () => { settle({ data: null, error: { message: "your active workspace changed before this could run; nothing was removed" } }); });

    // After a switch the refusal deliberately leaves the dialog for the parent-owned channel, which
    // outlives it — so that is where the sentence has to be read.
    const said = mocks.error.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(said, `the refusal reached the operator: ${JSON.stringify(said)}`).toMatch(/nothing was removed/i);
    expect(said, "and names the workspace the call was sent to").toContain("Example Team");
    expect(said, "not the one the operator has since switched to").not.toContain("Second Workspace");
  });
});

describe("the sixth read — the switch guard was blind for the whole switch window", () => {
  // THE STRUCTURAL DEFECT ALL THREE OF THESE SHARE. The parent hands this dialog
  // `workspace ?? lastWorkspace.current` deliberately, because `load(0)` nulls the roster before it
  // awaits and the dialog has to outlive that flash. So for the entire switch window — the 180ms
  // debounce plus the fetch — the prop IS the PRE-switch roster, and every
  // `workspaceRef.current.tenant_id !== tenantAtArm` guard answered "nothing changed" exactly when
  // it had. The three tests already in this file all wait for the new roster to LAND before
  // settling the call, so every one of them steps over the window rather than into it.
  const rosterA = () => workspace();
  const rosterB = (over: Partial<TeamWorkspaceRecord> = {}) =>
    workspace({ tenant_id: "tenant-2", tenant_name: "Second Workspace", members: [], total_members: 0, ...over });

  /** Arms and confirms a removal in Example Team, then switches WITHOUT letting the new roster land. */
  async function armConfirmThenSwitchMidFlight(rosterForTenant2: TeamWorkspaceRecord) {
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const a = rosterA();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") {
        return Promise.resolve({ data: mocks.tenant.activeTenantId === "tenant-1" ? a : rosterForTenant2, error: null });
      }
      if (name === "remove_solo_team_member") return new Promise((res) => { settle = res; });
      return new Promise(() => {});
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    // The switch itself — and then NOTHING that would let the new roster arrive.
    mocks.tenant.activeTenantId = "tenant-2";
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    return { host, root, settle: (v: { data: unknown; error: unknown }) => settle(v) };
  }

  it("does not leave a removal banner over the next workspace when the call lands mid-switch", async () => {
    // The parent clears `notice` on `activeTenantId`, which fires BEFORE the roster reloads. So a
    // removal settling inside the window wrote the banner AFTER the clear that exists to stop
    // exactly this, and it then sat over Second Workspace's roster claiming something about
    // Example Team — the cross-workspace false statement this whole programme keeps closing.
    const { host, root, settle } = await armConfirmThenSwitchMidFlight(rosterB());
    await act(async () => { settle({ data: { tenant_id: "tenant-1" }, error: null }); });
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const banners = Array.from(host.querySelectorAll(".stw-separation-note")).map((n) => n.textContent ?? "").join(" | ");
    expect(banners, `a banner about the old workspace survived onto the new roster: ${JSON.stringify(banners)}`)
      .not.toMatch(/Example Team/);
    // ...and the removal is not simply swallowed instead. It happened; it has to be said somewhere.
    const said = mocks.success.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(said, "the removal that the server APPLIED is still reported").toMatch(/Example Team/);
    expect(said, "and says plainly why this roster does not show it").toMatch(/switched workspace/i);
  });

  it("does not swallow a REFUSAL that lands mid-switch", async () => {
    // Worse than the banner, because nothing is written at all. The blind guard took the in-dialog
    // branch; the tenant-2 roster then landed, the disarm effect wiped the error, `removalPending`
    // went false and the parent unmounted the dialog. Dialog gone, no alert, no toast — the one
    // outcome this file's own comments call unacceptable for a destructive action.
    const { host, root, settle } = await armConfirmThenSwitchMidFlight(rosterB());
    await act(async () => { settle({ data: null, error: { message: "only the workspace owner may remove someone from this workspace" } }); });
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? "");
    const toasts = mocks.error.mock.calls.map((c) => String(c[0]));
    const anywhere = [...alerts, ...toasts].join(" | ");
    expect(anywhere, `the refusal reached nobody: alerts=${JSON.stringify(alerts)} toasts=${JSON.stringify(toasts)}`)
      .toMatch(/owner/i);
  });

  it("keeps the in-flight removal block when the workspace switched to is one the viewer only administers", async () => {
    // `canRemove` is recomputed from the LIVE roster. Switching into a workspace where the viewer is
    // an Admin unmounted the whole block mid-call — the "Removing…" status line, Cancel and Confirm
    // all went — leaving an open dialog that said nothing about a destructive act in flight and had
    // ZERO enabled controls, because both close buttons are disabled while pending by design. A page
    // reload was the only way out.
    const { host, root } = await armConfirmThenSwitchMidFlight(rosterB({ can_change_permissions: false }));
    // Let the Admin roster actually LAND — that is what flips `canRemove` false.
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog, "the dialog is still open, which is what makes the rest of this matter").toBeTruthy();
    const live = Array.from(dialog!.querySelectorAll('[role="status"]')).map((n) => n.textContent ?? "").join(" | ");
    expect(live, `an in-flight destructive act is still announced: ${JSON.stringify(live)}`).toMatch(/Removing/);
    expect(live, "and it still names the workspace it is happening in").toContain("Example Team");
    expect(confirmButton(host), "the control that owns this call is still rendered").toBeTruthy();
  });

  // The one below exists because mutation caught it: with only the three tests above, the guard
  // could be inverted into its false-positive direction without a single assertion noticing.
  // (Mutation also killed the OTHER half of my first attempt at this guard — a roster "second
  // witness" — by showing no test could reach it. It was unreachable, and it is gone rather than
  // documented as load-bearing.)

  it("never treats an UNKNOWN live tenant as a switch that already happened", async () => {
    // The other direction, and the one that would be a false statement rather than a silence: if an
    // unresolved tenant context counted as "switched", a perfectly ordinary removal would be
    // reported as "you have since switched workspace, so this roster does not show it" — to an
    // operator who never moved, looking at the roster it did happen in.
    let settle: (v: { data: unknown; error: unknown }) => void = () => {};
    const a = workspace();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_solo_team_workspace") return Promise.resolve({ data: a, error: null });
      if (name === "remove_solo_team_member") return new Promise((res) => { settle = res; });
      return new Promise(() => {});
    });
    const { host, root, render } = mount(<SoloTeamWorkspace />);
    await render();
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    await act(async () => host.querySelector<HTMLButtonElement>("button.stw-row")!.click());
    await arm(host);
    await act(async () => confirmButton(host)!.click());

    mocks.tenant.activeTenantId = null as unknown as string;
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { settle({ data: { tenant_id: "tenant-1" }, error: null }); });
    await act(async () => { root.render(<SoloTeamWorkspace />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

    const banners = Array.from(host.querySelectorAll(".stw-separation-note")).map((n) => n.textContent ?? "").join(" | ");
    expect(banners, `the ordinary outcome was announced on the roster it happened in: ${JSON.stringify(banners)}`)
      .toMatch(/no longer has access to Example Team/);
    const said = [...mocks.success.mock.calls, ...mocks.error.mock.calls].map((c) => String(c[0])).join(" | ");
    expect(said, "and nobody was told they had switched workspace when they had not").not.toMatch(/switched workspace/i);
  });
});
