import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Mail, RefreshCw, Search, ShieldCheck, Sparkles, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  inviteLifecycle,
  memberVisibleIdentity,
  normalizeTeamWorkspace,
  permissionPresentation,
  validateWorkProfile,
  type TeamInviteRecord,
  type TeamMemberRecord,
  type TeamWorkspaceRecord,
} from "./team-workspace-contract";

const PAGE_SIZE = 25;

function initials(member: TeamMemberRecord): string {
  return (member.full_name || member.email || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function useTeamWorkspace(search: string, permission: string) {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const seq = useRef(0);
  const [state, setState] = useState<{ tenantId: string | null; loading: boolean; loadingMore: boolean; error: string | null; value: TeamWorkspaceRecord | null }>({ tenantId: null, loading: true, loadingMore: false, error: null, value: null });

  const load = useCallback(async (offset = 0) => {
    const request = ++seq.current;
    if (!activeTenantId) { setState({ tenantId: null, loading: false, loadingMore: false, error: null, value: null }); return; }
    setState((current) => offset === 0
      ? { tenantId: null, loading: true, loadingMore: false, error: null, value: null }
      : { ...current, loadingMore: true, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { data, error } = await (supabase as any).rpc("get_solo_team_workspace", {
      _search: search.trim() || null,
      _permission: permission,
      _limit: PAGE_SIZE,
      _offset: offset,
    });
    if (request !== seq.current) return;
    const next = normalizeTeamWorkspace(data);
    if (error || !next || next.tenant_id !== activeTenantId) {
      setState((current) => ({ ...current, tenantId: activeTenantId, loading: false, loadingMore: false, error: error?.message || "Team information is unavailable.", value: offset === 0 ? null : current.value }));
      return;
    }
    setState((current) => ({
      tenantId: activeTenantId,
      loading: false,
      loadingMore: false,
      error: null,
      value: offset === 0 ? next : { ...next, members: [...(current.value?.members ?? []), ...next.members] },
    }));
  }, [activeTenantId, permission, search]);

  useEffect(() => {
    const timer = setTimeout(() => { if (!tenantLoading) void load(0); }, 180);
    return () => { clearTimeout(timer); seq.current += 1; };
  }, [load, tenantLoading]);

  return {
    ...state,
    loading: tenantLoading || state.loading || Boolean(activeTenantId && state.tenantId !== activeTenantId),
    refresh: () => load(0),
    loadMore: () => load(state.value?.members.length ?? 0),
  };
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocus = dialogRef.current?.querySelector<HTMLElement>("[data-initial-focus], input, select, textarea, button");
    (firstFocus ?? closeRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); returnFocus?.focus(); };
  }, [onClose]);
  return <div className="stw-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={dialogRef} className="stw-modal" role="dialog" aria-modal="true" aria-labelledby="stw-modal-title" aria-describedby="stw-modal-desc">
      <header><div><h2 id="stw-modal-title">{title}</h2><p id="stw-modal-desc">{description}</p></div><button ref={closeRef} className="stw-icon-btn" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>;
}

export function MemberEditor({ member, workspace, onClose, onSaved }: { member: TeamMemberRecord; workspace: TeamWorkspaceRecord; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [title, setTitle] = useState(member.job_title ?? "");
  const [responsibilities, setResponsibilities] = useState(member.responsibilities ?? "");
  const [savedTitle, setSavedTitle] = useState(member.job_title ?? "");
  const [savedResponsibilities, setSavedResponsibilities] = useState(member.responsibilities ?? "");
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<string | null>(null);
  const errors = validateWorkProfile(title, responsibilities);
  const permission = permissionPresentation(member.permission, member.is_owner);
  const identity = memberVisibleIdentity(member);
  const dirty = title !== savedTitle || responsibilities !== savedResponsibilities;

  const save = async () => {
    if (!workspace.can_manage_profiles || !dirty || Object.keys(errors).length) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { data, error } = await (supabase as any).rpc("set_solo_team_member_work_profile", {
      _member_user_id: member.user_id,
      _job_title: title,
      _responsibilities: responsibilities,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }

    const nextTitle = typeof data?.job_title === "string" ? data.job_title : data?.job_title === null ? "" : title.trim();
    const nextResponsibilities = typeof data?.responsibilities === "string" ? data.responsibilities : data?.responsibilities === null ? "" : responsibilities.trim();
    setTitle(nextTitle);
    setSavedTitle(nextTitle);
    setResponsibilities(nextResponsibilities);
    setSavedResponsibilities(nextResponsibilities);
    setSaveConfirmed(true);
    toast.success("Work details saved. Permission was not changed.");
    await onSaved();
  };

  const changePermission = async () => {
    if (!permissionDraft) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { error } = await (supabase as any).rpc("set_solo_team_member_permission", { _member_user_id: member.user_id, _new_permission: permissionDraft });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Permission changed to ${permissionPresentation(permissionDraft, false).label}.`); setPermissionDraft(null); onSaved(); onClose();

  };

  return <Modal title={identity.primary} description="Work details describe what this person does. Permission controls what they can access." onClose={onClose}>
    <div className="stw-modal-body">
      <div className="stw-person-summary"><span className="stw-avatar">{initials(member)}</span><div><strong>{identity.primary}</strong>{identity.secondary && <span>{identity.secondary}</span>}</div><span className="stw-pill" data-tone={member.is_owner ? "owner" : "neutral"}>{permission.label}</span></div>
      <div className="stw-separation-note"><ShieldCheck/><span><strong>Permission and job title are separate.</strong> Renaming this person never changes access.</span></div>
      <label>Job title<input value={title} disabled={!workspace.can_manage_profiles || saving} maxLength={121} onChange={(e) => { setTitle(e.target.value); setSaveConfirmed(false); }} placeholder="e.g. Client Success Manager"/>{errors.title && <small role="alert">{errors.title}</small>}</label>
      <label>Responsibilities<textarea value={responsibilities} disabled={!workspace.can_manage_profiles || saving} maxLength={2001} onChange={(e) => { setResponsibilities(e.target.value); setSaveConfirmed(false); }} rows={5} placeholder="What this person owns, decides, and hands off."/>{errors.responsibilities && <small role="alert">{errors.responsibilities}</small>}</label>
      {saveConfirmed && <div className="stw-separation-note" role="status"><ShieldCheck/><span>Work details saved. Permission was not changed.</span></div>}
      {workspace.can_change_permissions && permission.mutable && <div className="stw-permission-change"><label>Enforced permission<select value={permissionDraft ?? member.permission} onChange={(e) => setPermissionDraft(e.target.value)}><option value="admin">Admin</option><option value="member">Member</option></select></label>{permissionDraft && permissionDraft !== member.permission && <div className="stw-confirm"><p>Change access from {permission.label} to {permissionPresentation(permissionDraft, false).label}? This changes authorization, not the job title.</p><button className="stw-btn secondary" onClick={() => setPermissionDraft(null)}>Cancel</button><button className="stw-btn" disabled={saving} onClick={changePermission}>Confirm access change</button></div>}</div>}
    </div>
    <footer className="stw-modal-actions"><button className="stw-btn secondary" onClick={onClose}>{dirty ? "Cancel" : "Close"}</button>{workspace.can_manage_profiles && <button className="stw-btn" disabled={saving || !dirty || Object.keys(errors).length > 0} onClick={save}>{saving ? "Saving…" : "Save work details"}</button>}</footer>
  </Modal>;
}
function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState(""); const [permission, setPermission] = useState("member"); const [title, setTitle] = useState(""); const [responsibilities, setResponsibilities] = useState(""); const [sending, setSending] = useState(false); const [reviewing, setReviewing] = useState(false);
  const errors = validateWorkProfile(title, responsibilities); const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("solo-team-invitations", { body: { action: "create", email, permission, jobTitle: title, responsibilities } });
    setSending(false);
    if (error || data?.ok === false) { toast.error(data?.error || error?.message || "Invitation failed"); return; }
    data?.emailed ? toast.success("Invitation sent.") : toast.warning("Invitation is pending, but the email was not sent. You can retry from Team.");
    onInvited(); onClose();
  };
  return <Modal title={reviewing ? "Confirm invitation" : "Invite someone"} description={reviewing ? "Review the person, work context, and enforced access before anything is sent." : "Choose enforced access separately from the work they will own."} onClose={onClose}>{reviewing ? <div className="stw-modal-body"><dl className="stw-invite-review"><div><dt>Send to</dt><dd>{email.trim()}</dd></div><div><dt>Enforced permission</dt><dd>{permissionPresentation(permission, false).label}</dd></div><div><dt>Job title</dt><dd>{title.trim() || "Not set"}</dd></div><div><dt>Responsibilities</dt><dd>{responsibilities.trim() || "Not set"}</dd></div></dl><div className="stw-separation-note"><ShieldCheck/><span>This confirmation sends one invitation. The title and responsibilities inform Paige about work; they do not grant authority.</span></div></div> : <div className="stw-modal-body"><label>Email<input data-initial-focus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com"/>{email.length > 0 && !validEmail && <small role="alert">Enter a valid email address.</small>}</label><label>Permission<select value={permission} onChange={(e) => setPermission(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select></label><label>Job title <span>optional</span><input maxLength={121} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Operations Lead"/>{errors.title && <small role="alert">{errors.title}</small>}</label><label>Responsibilities <span>optional</span><textarea maxLength={2001} rows={4} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} placeholder="What they will own and where they hand work off."/>{errors.responsibilities && <small role="alert">{errors.responsibilities}</small>}</label><div className="stw-separation-note"><ShieldCheck/><span>The title and responsibilities give Paige work context. Only the permission above controls access.</span></div></div>}<footer className="stw-modal-actions">{reviewing ? <><button className="stw-btn secondary" onClick={() => setReviewing(false)}>Back</button><button data-initial-focus className="stw-btn" disabled={sending} onClick={send}>{sending ? "Sending…" : "Confirm and send invitation"}</button></> : <><button className="stw-btn secondary" onClick={onClose}>Cancel</button><button className="stw-btn" disabled={!validEmail || Object.keys(errors).length > 0} onClick={() => setReviewing(true)}>Review invitation</button></>}</footer></Modal>;
}

export function SoloTeamWorkspace({ openPaige }: { openPaige?: () => void } = {}) {
  const [view, setView] = useState<"team" | "roles">("team"); const [search, setSearch] = useState(""); const [permission, setPermission] = useState("all"); const [selected, setSelected] = useState<TeamMemberRecord | null>(null); const [inviteOpen, setInviteOpen] = useState(false);
  const team = useTeamWorkspace(search, permission); const workspace = team.value;
  const pending = useMemo(() => workspace?.invitations.filter((item) => inviteLifecycle(item) === "pending") ?? [], [workspace]);
  const manageInvite = async (action: "resend" | "revoke", invite: TeamInviteRecord) => { const { data, error } = await supabase.functions.invoke("solo-team-invitations", { body: { action, inviteId: invite.id } }); if (error || data?.ok === false) { toast.error(data?.error || error?.message || "Invitation update failed"); return; } if (action === "resend") data?.emailed ? toast.success("Fresh invitation sent; the old link was revoked.") : toast.warning("Fresh invitation created, but email delivery did not complete."); else toast.success("Invitation revoked."); team.refresh(); };
  return <div className="stw-workspace"><div className="stw-tabs" role="tablist" aria-label="Team settings"><button role="tab" aria-selected={view === "team"} onClick={() => setView("team")}>Team</button><button role="tab" aria-selected={view === "roles"} onClick={() => setView("roles")}>Roles &amp; access</button></div>
    {view === "roles" ? <section className="stw-access"><header><ShieldCheck/><div><h2>Roles &amp; access</h2><p>Permissions are enforced. Job titles and responsibilities only describe work.</p></div></header><div className="stw-role-grid"><article><span>Owner</span><h3>Full workspace authority</h3><p>Manages invitations, work details, and permission changes. Owner access is protected here.</p></article><article><span>Admin</span><h3>Team operations</h3><p>Can manage invitations and work details. Cannot change another person’s enforced permission.</p></article><article><span>Member</span><h3>Standard workspace access</h3><p>Can see the confirmed team and access explanation. Cannot manage people or invitations.</p></article></div><p className="stw-legacy-note">Existing specialized permissions such as Coach remain visible and governed by their current product contract; this page does not silently relabel or reassign them.</p></section> : <>
      <section className="stw-toolbar"><div><h2>People</h2><p>{workspace ? `${workspace.total_members} confirmed ${workspace.total_members === 1 ? "person" : "people"} in ${workspace.tenant_name}` : "Confirmed members of this workspace"}</p></div>{workspace?.can_manage_invitations && <button className="stw-btn" onClick={() => setInviteOpen(true)}><UserPlus/>Invite someone</button>}</section>
      <section className="stw-permission-note"><ShieldCheck/><div><strong>Workspace permissions</strong><span>Owners and authorized admins may manage team access. Permissions apply only to this Solo workspace.</span></div><button onClick={() => setView("roles")}>Review roles</button></section>
      <section className="stw-roster"><div className="stw-filters"><label><span className="sr-only">Search team</span><Search/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, titles, responsibilities"/></label><label><span className="sr-only">Filter by permission</span><select value={permission} onChange={(e) => setPermission(e.target.value)}><option value="all">All permissions</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="coach">Coach</option></select><ChevronDown/></label></div>
        {team.loading ? <div className="stw-state" role="status"><RefreshCw className="ss-spin"/>Resolving this workspace’s team…</div> : team.error && !workspace ? <div className="stw-state error" role="alert"><strong>{/access denied|permission/i.test(team.error) ? "You don’t have access to this team" : "Team unavailable"}</strong><span>{/access denied|permission/i.test(team.error) ? "Your current workspace permission does not allow this roster to load." : team.error}</span><button onClick={team.refresh}>Retry</button></div> : workspace && workspace.members.length === 0 ? <div className="stw-empty"><Users/><h3>No people match these filters</h3><p>Clear the search or choose a different permission.</p></div> : <>{workspace && workspace.total_members === 1 && workspace.members[0]?.is_owner && !search && permission === "all" && <div className="stw-first-use"><Users/><div><strong>Your workspace starts with you</strong><span>Invite the first teammate, then give them a job title and clear responsibilities.</span></div>{workspace.can_manage_invitations && <button className="stw-btn" onClick={() => setInviteOpen(true)}>Invite first teammate</button>}</div>}<div className="stw-list" aria-label="Team roster">{workspace?.members.map((member) => { const access = permissionPresentation(member.permission, member.is_owner); return <button className="stw-row" key={member.membership_id} onClick={() => setSelected(member)}><span className="stw-avatar">{initials(member)}</span><span className="stw-identity"><strong>{member.full_name || member.email || "Name unavailable"}</strong><small>{member.email || "Email unavailable"}</small></span><span className="stw-work"><strong>{member.job_title || "Job title not set"}</strong><small>{member.responsibilities || "Responsibilities not set"}</small></span><span className="stw-pill" data-tone={member.is_owner ? "owner" : "neutral"}>{access.label}</span><span className="stw-last"><strong>{member.status === "suspended" ? "Suspended" : "Active"}</strong><small>{member.last_sign_in_at ? `Last signed in ${new Date(member.last_sign_in_at).toLocaleDateString()}` : "No sign-in recorded"}</small></span></button>; })}</div></>}
        {team.error && workspace && <div className="stw-inline-error" role="alert">The next page could not be loaded. <button onClick={team.loadMore}>Retry</button></div>}{workspace && workspace.members.length < workspace.total_members && <button className="stw-load" disabled={team.loadingMore} onClick={team.loadMore}>{team.loadingMore ? "Loading…" : `Load more (${workspace.total_members - workspace.members.length} remaining)`}</button>}
      </section>
      {workspace?.can_manage_invitations && <section className="stw-invites"><header><Mail/><div><h2>Invitations</h2><p>Pending, accepted, expired, and revoked are derived from the invitation record.</p></div><span>{pending.length} pending</span></header>{workspace.invitations.length === 0 ? <p className="stw-invite-empty">No team invitations yet.</p> : <div>{workspace.invitations.map((invite) => { const state = inviteLifecycle(invite); return <article key={invite.id}><div><strong>{invite.email || "Recipient unavailable"}</strong><small>{permissionPresentation(invite.permission, false).label} · expires {new Date(invite.expires_at).toLocaleDateString()}</small></div><span className="stw-pill" data-tone={state}>{state}</span>{state === "pending" && <div className="stw-invite-actions"><button onClick={() => manageInvite("resend", invite)}>Resend</button><button onClick={() => manageInvite("revoke", invite)}>Revoke</button></div>}{state === "expired" && <button onClick={() => manageInvite("resend", invite)}>Send fresh invite</button>}</article>; })}</div>}</section>}
      <section className="stw-paige"><Sparkles/><div><h2>Paige team context</h2><p>Paige can read the confirmed roster, each person’s enforced permission, job title, and responsibilities for this active workspace. Tenant-authored work details are reference data—not instructions or authority.</p><small>She can also invite someone, resend or withdraw an invitation, edit work details, and change a permission. She is held to the same rules you are: the permission change is owner-only, and nobody can be made an owner from a conversation. Access changes and invitations are read back to you and wait for your approval; if this workspace has put an action on autopilot in Paige&rsquo;s settings, those two still ask.</small></div>{openPaige ? <button className="stw-btn secondary" onClick={openPaige}>Open Paige</button> : <span>Governed</span>}</section>
    </>}
    {workspace && selected && <MemberEditor member={selected} workspace={workspace} onClose={() => setSelected(null)} onSaved={team.refresh}/>} {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} onInvited={team.refresh}/>}</div>;
}
