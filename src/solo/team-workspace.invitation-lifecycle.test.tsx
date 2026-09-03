/**
 * The invitation lifecycle, driven as an operator drives it.
 *
 * WHAT THE OWNER REPORTED, and what was actually true. A revoked invitation sat in the list for
 * ever with no action on it, and nothing anywhere could say whether the email had been sent,
 * delivered, opened or clicked. The screenshot showed "Revoked" beside "0 pending" — so it was not
 * a stuck pending invite, it was a finished one with nowhere to go.
 *
 * The three grounded facts these tests are built on:
 *   1. `send-portal-invite` returned `emailed: res.ok` — "the POST was accepted" — and threw away
 *      the Resend message id, the only handle a later delivery event could be matched by.
 *   2. `email_send_log` already existed, written by eight other edge functions. This path skipped it.
 *   3. Resend had ZERO webhooks configured while open and click tracking were already ON for the
 *      sending domain, so the events existed and nothing was listening.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloTeamWorkspace } from "./team-workspace";
import {
  deliveryPresentation,
  inviteIsFinished,
  type InviteDelivery,
  type TeamInviteRecord,
  type TeamWorkspaceRecord,
} from "./team-workspace-contract";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), tenant: { activeTenantId: "tenant-1" } }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: mocks.tenant.activeTenantId, loading: false }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invite = (over: Partial<TeamInviteRecord> = {}): TeamInviteRecord => ({
  id: "invite-1", email: "tashia@example.com", permission: "admin",
  created_at: new Date(Date.now() - 86400000).toISOString(),
  expires_at: new Date(Date.now() + 6 * 86400000).toISOString(),
  revoked_at: null, uses: 0, delivery: null, ...over,
});

const workspace = (invitations: TeamInviteRecord[]): TeamWorkspaceRecord => ({
  tenant_id: "tenant-1", tenant_name: "Mogul Maker Academy", viewer_permission: "owner",
  can_manage_profiles: true, can_manage_invitations: true, can_change_permissions: true,
  total_members: 1,
  members: [{ membership_id: "m1", user_id: "u1", full_name: "Antonio Cook", email: "owner@example.com", avatar_url: null, status: "active", permission: "owner", is_owner: true, job_title: null, responsibilities: null, last_sign_in_at: null }],
  invitations,
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  return { host, root, render: async () => act(async () => root.render(node)) };
}

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const byText = (host: HTMLElement, re: RegExp) => buttons(host).find((b) => re.test(b.textContent ?? ""));

async function open(invitations: TeamInviteRecord[]) {
  mocks.rpc.mockImplementation((name: string) =>
    name === "get_solo_team_workspace"
      ? Promise.resolve({ data: workspace(invitations), error: null })
      : new Promise(() => {}));
  const m = mount(<SoloTeamWorkspace />);
  await m.render();
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
  return m;
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const m of Object.values(mocks)) if (typeof m === "function") (m as unknown as { mockReset: () => void }).mockReset();
  mocks.tenant.activeTenantId = "tenant-1";
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("what the delivery record is allowed to claim", () => {
  it("says an invitation with no recorded send was NOT sent, rather than inventing a status", () => {
    // The defect in one assertion. `emailed: res.ok` meant "the POST was accepted" and was shown
    // as though it meant delivered; an invitation with nothing recorded must say so plainly.
    const p = deliveryPresentation(null);
    expect(p.label).toMatch(/not sent/i);
    expect(p.tone).toBe("none");
    expect(p.label).not.toMatch(/sent$|delivered|opened/i);
  });

  it("keeps 'sent' short of claiming delivery", () => {
    const p = deliveryPresentation({ status: "sent", at: "", error: null, history: [] });
    expect(p.label).toBe("Sent");
    expect(p.detail).toMatch(/not yet confirmed as delivered/i);
    expect(p.tone).toBe("progress");
  });

  it("treats a bounce as bad news and carries the provider's reason", () => {
    const p = deliveryPresentation({ status: "bounced", at: "", error: "mailbox does not exist", history: [] });
    expect(p.tone).toBe("bad");
    expect(p.detail).toContain("mailbox does not exist");
  });

  it("does not print a provider word it does not recognise", () => {
    // This surface has already had to strip raw backend text out of its refusals once.
    const p = deliveryPresentation({ status: "email.quarantined_by_martians", at: "", error: null, history: [] });
    expect(p.label).toBe("Unknown");
    expect(p.label).not.toContain("martians");
  });
});

describe("finished invitations leave the operator's way", () => {
  it("agrees with the server about which invitations are finished", () => {
    // The screen and the database must use ONE predicate. If they disagree the screen offers a
    // "Remove from list" the server refuses, which is a dead button.
    expect(inviteIsFinished(invite())).toBe(false);
    expect(inviteIsFinished(invite({ revoked_at: new Date().toISOString() }))).toBe(true);
    expect(inviteIsFinished(invite({ uses: 1 }))).toBe(true);
    expect(inviteIsFinished(invite({ expires_at: new Date(Date.now() - 1000).toISOString() }))).toBe(true);
  });

  it("moves a revoked invitation out of the active list into a collapsed past section", async () => {
    // THE REPORTED BUG. The row stayed at the top of the list for ever with no action on it.
    const { host } = await open([invite({ revoked_at: new Date().toISOString() })]);
    const past = host.querySelector("details.stw-invite-past");
    expect(past, "a past-invitations drawer exists").toBeTruthy();
    expect(past!.textContent).toMatch(/1 past invitation/);
    expect(past!.querySelector("article"), "and the revoked invitation is inside it").toBeTruthy();
    // Collapsed by default: finished invitations must not compete with outstanding ones.
    expect((past as HTMLDetailsElement).open).toBe(false);
  });

  it("says so plainly when nothing is outstanding, instead of showing an empty active list", async () => {
    const { host } = await open([invite({ revoked_at: new Date().toISOString() })]);
    expect(host.textContent).toMatch(/nothing outstanding/i);
  });

  it("keeps a live invitation OUT of the past drawer", async () => {
    const { host } = await open([invite()]);
    expect(host.querySelector("details.stw-invite-past"), "no past drawer when nothing is finished").toBeFalsy();
    expect(byText(host, /^Resend$/), "and the live one still offers its actions").toBeTruthy();
  });
});

describe("clearing an invitation", () => {
  it("offers Remove from list ONLY on a finished invitation", async () => {
    const live = await open([invite()]);
    expect(byText(live.host, /remove from list/i), "never on a live invitation — that would hide a working access grant").toBeFalsy();

    document.body.innerHTML = "";
    const done = await open([invite({ revoked_at: new Date().toISOString() })]);
    expect(byText(done.host, /remove from list/i)).toBeTruthy();
  });

  it("archives rather than deletes, and names the workspace it is acting in", async () => {
    const { host } = await open([invite({ id: "invite-9", revoked_at: new Date().toISOString() })]);
    await act(async () => byText(host, /remove from list/i)!.click());

    const [fn, options] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("solo-team-invitations");
    expect(options.body.action, "archive, not delete — the record survives").toBe("archive");
    expect(options.body.inviteId).toBe("invite-9");
    // The expected-workspace guard from the invitation repair still binds on this new action.
    expect(options.body.expectedTenantId).toBe("tenant-1");
  });

  it("tells the operator the record is kept, so 'remove' is not read as 'destroy'", async () => {
    const { host } = await open([invite({ revoked_at: new Date().toISOString() })]);
    await act(async () => byText(host, /remove from list/i)!.click());
    const said = mocks.success.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(said).toMatch(/record is kept/i);
  });

  it("shows the server's own refusal rather than a generic failure", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, error: "that invitation is still live; revoke it before clearing it" }, error: null });
    const { host } = await open([invite({ revoked_at: new Date().toISOString() })]);
    await act(async () => byText(host, /remove from list/i)!.click());
    const said = mocks.error.mock.calls.map((c) => String(c[0])).join(" | ");
    // The instruction that resolves the refusal is the whole value of the sentence.
    expect(said).toMatch(/revoke it before clearing it/i);
  });
});

describe("the delivery report the owner asked for", () => {
  const delivered = (status: string, history: { status: string; at: string }[]): InviteDelivery =>
    ({ status, at: new Date().toISOString(), error: null, history });

  it("reports how far the email actually got, with a timeline", async () => {
    const now = new Date().toISOString();
    const { host } = await open([invite({
      delivery: delivered("opened", [
        { status: "sent", at: now }, { status: "delivered", at: now }, { status: "opened", at: now },
      ]),
    })]);
    const block = host.querySelector(".stw-invite-delivery")!;
    expect(block.textContent).toMatch(/Opened/);
    const steps = [...block.querySelectorAll("li")];
    expect(steps.map((li) => li.getAttribute("data-done")))
      .toEqual(["true", "true", "true", "false"]);
  });

  it("lights NO steps on a bounce, so a failure is never shown beside a success tick", async () => {
    const { host } = await open([invite({
      delivery: { status: "bounced", at: new Date().toISOString(), error: "no such mailbox", history: [{ status: "sent", at: new Date().toISOString() }] },
    })]);
    const block = host.querySelector(".stw-invite-delivery")!;
    expect(block.getAttribute("data-tone")).toBe("bad");
    expect(block.textContent).toMatch(/Bounced/);
    expect(block.querySelectorAll("li").length, "the progress trail is not drawn at all").toBe(0);
    expect(block.textContent).toMatch(/no such mailbox/);
  });

  it("does not draw a progress trail for an invitation that was never emailed", async () => {
    const { host } = await open([invite({ delivery: null })]);
    const block = host.querySelector(".stw-invite-delivery")!;
    expect(block.textContent).toMatch(/not sent yet/i);
    expect(block.querySelectorAll("li").length, "four grey steps would imply a journey that never started").toBe(0);
  });

  it("states each step's state in text, not colour alone", async () => {
    const now = new Date().toISOString();
    const { host } = await open([invite({ delivery: delivered("delivered", [{ status: "sent", at: now }, { status: "delivered", at: now }]) })]);
    const steps = [...host.querySelectorAll(".stw-invite-steps li")];
    // A screen-reader user and a colour-blind reader both need this without the border colour.
    expect(steps[0].textContent).toMatch(/completed/);
    expect(steps[3].textContent).toMatch(/not yet/);
  });

  it("still reports delivery on an invitation that has already been accepted", async () => {
    // Accepted invitations live in the past drawer; their delivery history is exactly the record
    // that answers "did this person ever actually get the email".
    const { host } = await open([invite({ uses: 1, delivery: delivered("clicked", [{ status: "sent", at: new Date().toISOString() }]) })]);
    const past = host.querySelector("details.stw-invite-past")!;
    expect(past.textContent).toMatch(/Link clicked/);
  });
});
