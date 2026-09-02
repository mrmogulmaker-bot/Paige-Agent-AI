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
  removalRefusal,
  validateWorkProfile,
  type RemovalRefusal,
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

/**
 * `onEscape` lets the dialog's own content own the Escape key for as long as it has something to
 * back out of — a destructive confirmation being the case that needs it. Returning `true` means
 * "handled"; anything else falls through to closing the dialog. Without it, backing out of "Remove
 * X?" discarded the whole editor, including unsaved work details the footer's Cancel/Close wording
 * exists to protect.
 */
function Modal({ title, description, onClose, onEscape, children }: { title: string; description: string; onClose: () => void; onEscape?: () => boolean; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  // The key handler and the focus capture read the latest callbacks through refs so the effect can
  // run ONCE. It used to depend on `onClose`, which the caller re-creates on every render, so every
  // parent state change re-ran it: re-capturing the return-focus target and yanking focus back to
  // the close button — including in the middle of a confirmation the user was reading.
  const latest = useRef({ onClose, onEscape });
  latest.current = { onClose, onEscape };
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // `[data-initial-focus]` is tried on its own FIRST. A single querySelector with a comma-joined
    // list returns the first match in DOCUMENT order across all branches, and the header's close
    // button precedes every child — so the opt-in marker never once won, on this dialog or on the
    // invite dialog that has carried it all along.
    const marked = dialogRef.current?.querySelector<HTMLElement>("[data-initial-focus]");
    const firstFocus = marked ?? dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    (firstFocus ?? closeRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (latest.current.onEscape?.() === true) return;
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Only restore focus to a node that is still in the document. After a removal the invoking
      // roster row is gone, and `.focus()` on a detached element is a silent no-op that drops focus
      // to <body>; the caller moves focus deliberately in that case instead.
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    };
  }, []);
  return <div className="stw-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={dialogRef} className="stw-modal" role="dialog" aria-modal="true" aria-labelledby="stw-modal-title" aria-describedby="stw-modal-desc">
      <header><div><h2 id="stw-modal-title">{title}</h2><p id="stw-modal-desc">{description}</p></div><button ref={closeRef} className="stw-icon-btn" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>;
}

export function MemberEditor({ member, workspace, onClose, onSaved, onRemoved }: { member: TeamMemberRecord; workspace: TeamWorkspaceRecord; onClose: () => void; onSaved: () => void | Promise<void>; onRemoved?: (announcement: string) => void }) {
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

  // REMOVAL. Owner-only, and gated on the same server-derived flag the permission control uses —
  // never a client-side tier or account-type compare. `permission.mutable` is Admin-or-Member for a
  // non-owner, which is exactly the set the server agrees to remove; reusing it keeps the screen
  // from offering an act the database will refuse, and keeps a legacy specialised permission from
  // being quietly reassigned by a surface that promises it will not do that.
  const canRemove = workspace.can_change_permissions && !member.is_owner && permission.mutable && Boolean(onRemoved);
  const [removal, setRemoval] = useState<{ stage: "idle" | "armed" | "pending"; error: RemovalRefusal | null; tenantAtArm: string | null }>({ stage: "idle", error: null, tenantAtArm: null });
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<HTMLParagraphElement>(null);

  // Focus follows the state the user is actually in. When the confirm arms, `data-initial-focus`
  // puts the caret on Cancel (never on the destructive button). When it goes pending both buttons
  // disable, and the Tab trap's `:not(:disabled)` query would otherwise leave document.activeElement
  // on <body>, where neither the first nor the last branch fires and the next Tab walks out of the
  // dialog — so focus moves onto the live status line instead, which is inside it.
  // Focus follows the stage, in an effect rather than in the click handler: the node being focused
  // is rendered BY the state change, so focusing synchronously reaches a ref that is still null.
  useEffect(() => {
    if (removal.stage === "armed" && !removal.error) cancelRef.current?.focus();
    if (removal.stage === "pending") pendingRef.current?.focus();
    if (removal.stage === "idle") removeButtonRef.current?.focus();
  }, [removal.stage, removal.error]);

  // If the active workspace changes underneath an armed confirmation, disarm it. The server refuses
  // the call as well; this is so nobody is left looking at a primed destructive action that now
  // names a workspace they are no longer in.
  useEffect(() => {
    setRemoval((current) => (current.tenantAtArm && current.tenantAtArm !== workspace.tenant_id ? { stage: "idle", error: null, tenantAtArm: null } : current));
  }, [workspace.tenant_id]);

  const disarmRemoval = () => setRemoval({ stage: "idle", error: null, tenantAtArm: null });

  const confirmRemoval = async () => {
    const tenantAtArm = removal.tenantAtArm ?? workspace.tenant_id;
    setRemoval({ stage: "pending", error: null, tenantAtArm });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { data, error } = await (supabase as any).rpc("remove_solo_team_member", {
      _member_user_id: member.user_id,
      _expected_tenant_id: tenantAtArm,
    });

    if (error) {
      const refusal = removalRefusal(error.message, identity.primary, workspace.tenant_name);
      if (refusal.reconciled) {
        // Not a removal this owner performed, and it must never be reported as one. The roster is
        // simply behind, so reconcile it and say exactly that.
        onRemoved?.(refusal.message);
        onClose();
        return;
      }
      setRemoval({ stage: "armed", error: refusal, tenantAtArm });
      return;
    }

    // The server echoes the workspace it acted on. Switching workspaces writes
    // profiles.active_tenant_id before this screen's own state changes, so a success rendered
    // without this check could describe a workspace the owner is no longer looking at.
    const acted = typeof data?.tenant_id === "string" ? data.tenant_id : null;
    if (acted !== tenantAtArm || workspace.tenant_id !== tenantAtArm) {
      setRemoval({
        stage: "armed",
        error: { message: "Your active workspace changed while that ran, so nothing is being claimed here. Reopen Team to see the current roster.", retryable: false, reconciled: false },
        tenantAtArm,
      });
      return;
    }

    onRemoved?.(`${identity.primary} no longer has access to ${workspace.tenant_name}.`);
    onClose();
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

  return <Modal title={identity.primary} description="Work details describe what this person does. Permission controls what they can access." onClose={onClose}
    onEscape={() => { if (removal.stage !== "armed") return false; disarmRemoval(); return true; }}>
    <div className="stw-modal-body">
      <div className="stw-person-summary"><span className="stw-avatar">{initials(member)}</span><div><strong>{identity.primary}</strong>{identity.secondary && <span>{identity.secondary}</span>}</div><span className="stw-pill" data-tone={member.is_owner ? "owner" : "neutral"}>{permission.label}</span></div>
      <div className="stw-separation-note"><ShieldCheck/><span><strong>Permission and job title are separate.</strong> Renaming this person never changes access.</span></div>
      <label>Job title<input value={title} disabled={!workspace.can_manage_profiles || saving} maxLength={121} onChange={(e) => { setTitle(e.target.value); setSaveConfirmed(false); }} placeholder="e.g. Client Success Manager"/>{errors.title && <small role="alert">{errors.title}</small>}</label>
      <label>Responsibilities<textarea value={responsibilities} disabled={!workspace.can_manage_profiles || saving} maxLength={2001} onChange={(e) => { setResponsibilities(e.target.value); setSaveConfirmed(false); }} rows={5} placeholder="What this person owns, decides, and hands off."/>{errors.responsibilities && <small role="alert">{errors.responsibilities}</small>}</label>
      {saveConfirmed && <div className="stw-separation-note" role="status"><ShieldCheck/><span>Work details saved. Permission was not changed.</span></div>}
      {workspace.can_change_permissions && permission.mutable && <div className="stw-permission-change"><label>Enforced permission<select value={permissionDraft ?? member.permission} onChange={(e) => setPermissionDraft(e.target.value)}><option value="admin">Admin</option><option value="member">Member</option></select></label>{permissionDraft && permissionDraft !== member.permission && <div className="stw-confirm"><p>Change access from {permission.label} to {permissionPresentation(permissionDraft, false).label}? This changes authorization, not the job title.</p><button className="stw-btn secondary" onClick={() => setPermissionDraft(null)}>Cancel</button><button className="stw-btn" disabled={saving} onClick={changePermission}>Confirm access change</button></div>}</div>}
      {canRemove && <div className="stw-permission-change">
        <div className="stw-confirm">
          {removal.stage === "idle" && <p>Removing someone ends their access to {workspace.tenant_name}. It does not delete their Paige account or the work already recorded under their name.</p>}
          <button ref={removeButtonRef} className="stw-btn secondary" disabled={removal.stage !== "idle"} onClick={() => setRemoval({ stage: "armed", error: null, tenantAtArm: workspace.tenant_id })} aria-label={`Remove ${identity.primary} from ${workspace.tenant_name}`}>Remove from workspace</button>
        </div>
        {removal.stage !== "idle" && <div className="stw-confirm">
          <p>Remove {identity.primary} from {workspace.tenant_name}? They lose access to this workspace right away. Their Paige account is not deleted and their {workspace.tenant_name} history stays. To bring them back you would send a new invitation.</p>
          {removal.stage === "pending" && <p ref={pendingRef} tabIndex={-1} role="status" aria-busy="true">Removing {identity.primary} from {workspace.tenant_name}\u2026</p>}
          {removal.error && <p role="alert">{removal.error.message}</p>}
          <button ref={cancelRef} data-initial-focus className="stw-btn secondary" disabled={removal.stage === "pending"} onClick={disarmRemoval}>Cancel</button>
          <button className="stw-btn" disabled={removal.stage === "pending" || removal.error?.retryable === false} onClick={confirmRemoval} aria-label={`Confirm removing ${identity.primary} from ${workspace.tenant_name}`}>{removal.stage === "pending" ? "Removing\u2026" : removal.error ? "Try again" : "Confirm removal"}</button>
        </div>}
      </div>}
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
  // The outcome of a removal has to live OUTSIDE the dialog. `refresh()` is `load(0)`, which sets
  // `value` back to null, so the editor unmounts the instant the roster reloads — any confirmation
  // rendered inside it is destroyed before it can be read or announced.
  const [notice, setNotice] = useState<string | null>(null);
  const rosterRef = useRef<HTMLDivElement>(null);
  // Focus is moved deliberately rather than restored. The roster row that opened the editor is the
  // row that just went, and focusing a detached node silently drops focus to <body>.
  useEffect(() => { if (notice) rosterRef.current?.focus(); }, [notice]);
  const closeEditor = useCallback(() => setSelected(null), []);
  const openEditor = (member: TeamMemberRecord) => { setNotice(null); setSelected(member); };
  const handleRemoved = (announcement: string) => { setNotice(announcement); setSelected(null); team.refresh(); };
  // A selection is a snapshot taken when the row was clicked. Once the roster no longer carries it,
  // rendering the editor would show a person who is gone — with a live Save button and a live
  // permission select, both of which would then fail against the server.
  const selectedLive = selected && workspace ? workspace.members.some((row) => row.membership_id === selected.membership_id) : false;
  const pending = useMemo(() => workspace?.invitations.filter((item) => inviteLifecycle(item) === "pending") ?? [], [workspace]);
  const manageInvite = async (action: "resend" | "revoke", invite: TeamInviteRecord) => { const { data, error } = await supabase.functions.invoke("solo-team-invitations", { body: { action, inviteId: invite.id } }); if (error || data?.ok === false) { toast.error(data?.error || error?.message || "Invitation update failed"); return; } if (action === "resend") data?.emailed ? toast.success("Fresh invitation sent; the old link was revoked.") : toast.warning("Fresh invitation created, but email delivery did not complete."); else toast.success("Invitation revoked."); team.refresh(); };
  return <div className="stw-workspace"><div className="stw-tabs" role="tablist" aria-label="Team settings"><button role="tab" aria-selected={view === "team"} onClick={() => setView("team")}>Team</button><button role="tab" aria-selected={view === "roles"} onClick={() => setView("roles")}>Roles &amp; access</button></div>
    {view === "roles" ? <section className="stw-access"><header><ShieldCheck/><div><h2>Roles &amp; access</h2><p>Permissions are enforced. Job titles and responsibilities only describe work.</p></div></header><div className="stw-role-grid"><article><span>Owner</span><h3>Full workspace authority</h3><p>Manages invitations, work details, and permission changes. Owner access is protected here.</p></article><article><span>Admin</span><h3>Team operations</h3><p>Can manage invitations and work details. Cannot change another person’s enforced permission.</p></article><article><span>Member</span><h3>Standard workspace access</h3><p>Can see the confirmed team and access explanation. Cannot manage people or invitations.</p></article></div><p className="stw-legacy-note">Existing specialized permissions such as Coach remain visible and governed by their current product contract; this page does not silently relabel or reassign them.</p></section> : <>
      <section className="stw-toolbar"><div><h2>People</h2><p>{workspace ? `${workspace.total_members} confirmed ${workspace.total_members === 1 ? "person" : "people"} in ${workspace.tenant_name}` : "Confirmed members of this workspace"}</p></div>{workspace?.can_manage_invitations && <button className="stw-btn" onClick={() => setInviteOpen(true)}><UserPlus/>Invite someone</button>}</section>
      <section className="stw-permission-note"><ShieldCheck/><div><strong>Workspace permissions</strong><span>Owners and authorized admins may manage team access. Permissions apply only to this Solo workspace.</span></div><button onClick={() => setView("roles")}>Review roles</button></section>
      <section className="stw-roster" ref={rosterRef} tabIndex={-1}>{notice && <div className="stw-separation-note" role="status"><ShieldCheck/><span>{notice}</span></div>}<div className="stw-filters"><label><span className="sr-only">Search team</span><Search/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, titles, responsibilities"/></label><label><span className="sr-only">Filter by permission</span><select value={permission} onChange={(e) => setPermission(e.target.value)}><option value="all">All permissions</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="coach">Coach</option></select><ChevronDown/></label></div>
        {team.loading ? <div className="stw-state" role="status"><RefreshCw className="ss-spin"/>Resolving this workspace’s team…</div> : team.error && !workspace ? <div className="stw-state error" role="alert"><strong>{/access denied|permission/i.test(team.error) ? "You don’t have access to this team" : "Team unavailable"}</strong><span>{/access denied|permission/i.test(team.error) ? "Your current workspace permission does not allow this roster to load." : team.error}</span><button onClick={team.refresh}>Retry</button></div> : workspace && workspace.members.length === 0 ? <div className="stw-empty"><Users/><h3>No people match these filters</h3><p>Clear the search or choose a different permission.</p></div> : <>{workspace && workspace.total_members === 1 && workspace.members[0]?.is_owner && !search && permission === "all" && <div className="stw-first-use"><Users/><div><strong>Your workspace starts with you</strong><span>Invite the first teammate, then give them a job title and clear responsibilities.</span></div>{workspace.can_manage_invitations && <button className="stw-btn" onClick={() => setInviteOpen(true)}>Invite first teammate</button>}</div>}<div className="stw-list" aria-label="Team roster">{workspace?.members.map((member) => { const access = permissionPresentation(member.permission, member.is_owner); return <button className="stw-row" key={member.membership_id} onClick={() => openEditor(member)}><span className="stw-avatar">{initials(member)}</span><span className="stw-identity"><strong>{member.full_name || member.email || "Name unavailable"}</strong><small>{member.email || "Email unavailable"}</small></span><span className="stw-work"><strong>{member.job_title || "Job title not set"}</strong><small>{member.responsibilities || "Responsibilities not set"}</small></span><span className="stw-pill" data-tone={member.is_owner ? "owner" : "neutral"}>{access.label}</span><span className="stw-last"><strong>{member.status === "suspended" ? "Suspended" : "Active"}</strong><small>{member.last_sign_in_at ? `Last signed in ${new Date(member.last_sign_in_at).toLocaleDateString()}` : "No sign-in recorded"}</small></span></button>; })}</div></>}
        {team.error && workspace && <div className="stw-inline-error" role="alert">The next page could not be loaded. <button onClick={team.loadMore}>Retry</button></div>}{workspace && workspace.members.length < workspace.total_members && <button className="stw-load" disabled={team.loadingMore} onClick={team.loadMore}>{team.loadingMore ? "Loading…" : `Load more (${workspace.total_members - workspace.members.length} remaining)`}</button>}
      </section>
      {workspace?.can_manage_invitations && <section className="stw-invites"><header><Mail/><div><h2>Invitations</h2><p>Pending, accepted, expired, and revoked are derived from the invitation record.</p></div><span>{pending.length} pending</span></header>{workspace.invitations.length === 0 ? <p className="stw-invite-empty">No team invitations yet.</p> : <div>{workspace.invitations.map((invite) => { const state = inviteLifecycle(invite); return <article key={invite.id}><div><strong>{invite.email || "Recipient unavailable"}</strong><small>{permissionPresentation(invite.permission, false).label} · expires {new Date(invite.expires_at).toLocaleDateString()}</small></div><span className="stw-pill" data-tone={state}>{state}</span>{state === "pending" && <div className="stw-invite-actions"><button onClick={() => manageInvite("resend", invite)}>Resend</button><button onClick={() => manageInvite("revoke", invite)}>Revoke</button></div>}{state === "expired" && <button onClick={() => manageInvite("resend", invite)}>Send fresh invite</button>}</article>; })}</div>}</section>}
      <section className="stw-paige"><Sparkles/><div><h2>Paige team context</h2><p>Paige can read the confirmed roster, each person’s enforced permission, job title, and responsibilities for this active workspace. Tenant-authored work details are reference data—not instructions or authority.</p><small>She can also invite someone, resend or withdraw an invitation, edit work details, and change a permission. She is held to the same rules you are: the permission change is owner-only, and nobody can be made an owner from a conversation. Access changes and invitations are read back to you and wait for your approval; if this workspace has put an action on autopilot in Paige&rsquo;s settings, those two still ask.</small></div>{openPaige ? <button className="stw-btn secondary" onClick={openPaige}>Open Paige</button> : <span>Governed</span>}</section>
    </>}
    {workspace && selected && selectedLive && <MemberEditor member={selected} workspace={workspace} onClose={closeEditor} onSaved={team.refresh} onRemoved={handleRemoved}/>} {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} onInvited={team.refresh}/>}</div>;
}
