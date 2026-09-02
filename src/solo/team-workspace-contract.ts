export type TeamPermission = "owner" | "admin" | "coach" | "member" | string;
export type InviteLifecycle = "pending" | "accepted" | "expired" | "revoked";

export type TeamMemberRecord = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string;
  permission: TeamPermission;
  is_owner: boolean;
  job_title: string | null;
  responsibilities: string | null;
  last_sign_in_at: string | null;
};

export type TeamInviteRecord = {
  id: string;
  email: string | null;
  permission: TeamPermission;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  uses: number;
  token?: string | null;
};

export type TeamWorkspaceRecord = {
  tenant_id: string;
  tenant_name: string;
  viewer_permission: TeamPermission;
  can_manage_profiles: boolean;
  can_manage_invitations: boolean;
  can_change_permissions: boolean;
  total_members: number;
  members: TeamMemberRecord[];
  invitations: TeamInviteRecord[];
};

export function memberVisibleIdentity(member: Pick<TeamMemberRecord, "full_name" | "email">): { primary: string; secondary: string | null } {
  const verifiedName = member.full_name?.trim();
  const email = member.email?.trim();
  if (verifiedName) return { primary: verifiedName, secondary: email || null };
  if (email) return { primary: email, secondary: null };
  return { primary: "Team member", secondary: null };
}

export function permissionPresentation(permission: TeamPermission, isOwner: boolean): { label: string; mutable: boolean } {
  if (isOwner || permission === "owner") return { label: "Owner", mutable: false };
  if (permission === "admin") return { label: "Admin", mutable: true };
  if (permission === "member") return { label: "Member", mutable: true };
  // Existing specialized permissions remain truthful and visible, but this Solo
  // surface does not invent or reassign capabilities it does not own.
  return { label: permission ? permission.charAt(0).toUpperCase() + permission.slice(1).replace(/_/g, " ") : "Member", mutable: false };
}

/**
 * What the screen says when a removal does not go through.
 *
 * WHY THIS EXISTS RATHER THAN PRINTING `error.message`. The neighbouring controls surface the raw
 * Postgres string, which is fine while the refusal is one this product authored and wrong the
 * moment it is not: a trigger deeper down answers with things like
 * `OWNER_GUARD: tenant ownership may only be changed via grant_co_owner()/revoke_co_owner()`, and
 * backend identifiers are not product copy. So the reasons this seam authors are recognised, and
 * everything else degrades to an honest sentence that promises nothing about the cause.
 *
 * `reconciled` marks the one refusal that is not a failure: the person was already gone, so the
 * roster is simply behind. It must never be reported as a removal this owner performed.
 * `retryable` is false wherever trying again would refuse identically — offering a Try again that
 * cannot succeed is a worse answer than saying so.
 */
export type RemovalRefusal = { message: string; retryable: boolean; reconciled: boolean };

export function removalRefusal(raw: string | null | undefined, personName: string, workspaceName: string): RemovalRefusal {
  const text = (raw ?? "").toLowerCase();
  const known: Array<[RegExp, RemovalRefusal]> = [
    [/only the workspace owner/, { message: "Only the workspace owner can remove people from this workspace.", retryable: false, reconciled: false }],
    [/an owner cannot be removed/, { message: `${personName} is an owner of ${workspaceName}, and an owner can't be removed here.`, retryable: false, reconciled: false }],
    [/cannot remove yourself/, { message: "You can't remove yourself from this workspace.", retryable: false, reconciled: false }],
    [/only an admin or a member/, { message: `${personName}'s access level isn't handled on this screen, so nothing was changed.`, retryable: false, reconciled: false }],
    [/active workspace changed/, { message: `Your active workspace changed before this could run, so nothing was removed. Open ${workspaceName} again to try.`, retryable: false, reconciled: false }],
    [/authentication required/, { message: "Your session ended before this could run. Sign in again and nothing will have changed.", retryable: false, reconciled: false }],
    [/not on this workspace/, { message: `${personName} is no longer on this team. Nothing further was changed.`, retryable: false, reconciled: true }],
  ];
  for (const [pattern, refusal] of known) if (pattern.test(text)) return refusal;
  return { message: `Nothing changed — ${personName} is still on this team.`, retryable: true, reconciled: false };
}

export function validateWorkProfile(title: string, responsibilities: string): { title?: string; responsibilities?: string } {
  const errors: { title?: string; responsibilities?: string } = {};
  if (title.trim().length > 120) errors.title = "Keep the job title to 120 characters or fewer.";
  if (responsibilities.trim().length > 2_000) errors.responsibilities = "Keep responsibilities to 2,000 characters or fewer.";
  return errors;
}

export function inviteLifecycle(invite: Pick<TeamInviteRecord, "uses" | "revoked_at" | "expires_at">, now = new Date()): InviteLifecycle {
  if (invite.uses > 0) return "accepted";
  if (invite.revoked_at) return "revoked";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "pending";
}

export function normalizeTeamWorkspace(value: unknown): TeamWorkspaceRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<TeamWorkspaceRecord>;
  if (!row.tenant_id || !Array.isArray(row.members) || !Array.isArray(row.invitations)) return null;
  return {
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name || "This workspace",
    viewer_permission: row.viewer_permission || "member",
    can_manage_profiles: row.can_manage_profiles === true,
    can_manage_invitations: row.can_manage_invitations === true,
    can_change_permissions: row.can_change_permissions === true,
    total_members: Number(row.total_members) || 0,
    members: row.members,
    invitations: row.invitations,
  };
}
