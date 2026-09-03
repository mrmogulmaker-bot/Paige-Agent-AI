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

/**
 * The server's own sentence for a refused invitation.
 *
 * WHY THIS IS NEEDED AT ALL. `supabase.functions.invoke()` returns every non-2xx as
 * `{ data: null, error }` where `error.message` is the FRAMEWORK CONSTANT
 * "Edge Function returned a non-2xx status code" and the honest body sits on
 * `error.context`. A call site that reads `data?.error || error?.message` therefore shows
 * that constant for EVERY refusal — so the operator who used to be told something false was,
 * after the seam was repaired, going to be told nothing at all. Extracting the body is
 * `readFunctionErrorBody`'s job (§18, one home); this decides what to SAY with it.
 *
 * The refusals this seam raises are already written for a person ("only an owner or admin may
 * manage team invitations in that workspace"), so they are shown verbatim rather than mapped
 * to generic copy — mapping them would throw away the precision the repair exists to provide.
 */
export function invitationRefusalMessage(
  body: Record<string, unknown> | null,
  fallback: string,
): string {
  const raw = body?.error;
  const sentence = typeof raw === "string" ? raw.trim() : "";
  // Never echo the framework constant back at a person, whatever path it arrived by.
  if (sentence && !/non-2xx status code/i.test(sentence)) return sentence;
  return fallback;
}
