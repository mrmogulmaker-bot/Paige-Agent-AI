import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useTeamRoster — the staff roster for the Team floor (IA slice 1c-ix).
 *
 * Mirrors MembersAdmin.loadAll: the `admin-list-users` edge fn → user_ids →
 * `user_roles` (role per user) + `coach_client_profiles_safe` (name/avatar). Realtime
 * refresh is a debounced channel on profiles/user_roles/tenant_members (MembersAdmin
 * pattern). §9: no client tenant param — RLS + the edge fn scope the read.
 *
 * HONEST DEGRADE (§13): the `admin-list-users` edge fn is admin-gated. For a non-admin
 * staff member it returns an error; this hook then yields an EMPTY roster with the
 * error surfaced (never throws). Consumers (AvailabilityRail grouping) fall back to the
 * name/avatar the presence RPC already returns, and the admin-only MembersRolesPanel is
 * itself RoleGate-wrapped so it never mounts for a non-admin.
 */
export type RosterMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  roles: string[];
  is_owner: boolean;
};

export type UseTeamRosterResult = {
  members: RosterMember[];
  rolesByUser: Record<string, string[]>;
  memberById: Record<string, RosterMember>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function useTeamRoster(enabled: boolean = true): UseTeamRosterResult {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [memberById, setMemberById] = useState<Record<string, RosterMember>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const seqRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    try {
      const usersRes = await supabase.functions.invoke("admin-list-users", { body: {} });
      if (usersRes.error) throw usersRes.error;
      const users: AnyRow[] = usersRes.data?.users || [];
      const userIds = users.map((u) => u.id);

      if (userIds.length === 0) {
        if (mountedRef.current && seq === seqRef.current) {
          setMembers([]);
          setRolesByUser({});
          setMemberById({});
          setError(null);
        }
        return;
      }

      const [{ data: roleRows }, { data: profRows }, { data: ownerCheck }, currentUserRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase
          .from("coach_client_profiles_safe")
          .select("user_id, full_name, avatar_url, suspended_at, suspended_reason")
          .in("user_id", userIds),
        supabase.rpc("is_platform_owner"),
        supabase.auth.getUser(),
      ]);

      if (!mountedRef.current || seq !== seqRef.current) return;

      const currentUserId = currentUserRes.data.user?.id;
      const byUser: Record<string, string[]> = {};
      (roleRows || []).forEach((r: AnyRow) => {
        (byUser[r.user_id] ||= []).push(r.role);
      });
      const profByUser = new Map<string, AnyRow>();
      (profRows || []).forEach((p: AnyRow) => profByUser.set(p.user_id, p));

      const built: RosterMember[] = users.map((u) => {
        const prof = profByUser.get(u.id) || {};
        const roles = byUser[u.id] || [];
        const isOwner = !!(ownerCheck && u.id === currentUserId) || roles.includes("super_admin");
        return {
          user_id: u.id,
          email: u.email ?? prof.email ?? null,
          full_name: prof.full_name ?? null,
          avatar_url: prof.avatar_url ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          suspended_at: prof.suspended_at ?? null,
          suspended_reason: prof.suspended_reason ?? null,
          roles,
          is_owner: isOwner,
        };
      });

      built.sort((a, b) => {
        if (a.is_owner && !b.is_owner) return -1;
        if (!a.is_owner && b.is_owner) return 1;
        return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
      });

      const idMap: Record<string, RosterMember> = {};
      built.forEach((m) => {
        idMap[m.user_id] = m;
      });

      setMembers(built);
      setRolesByUser(byUser);
      setMemberById(idMap);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== seqRef.current) return;
      // Non-admin (403) or transient failure → honest empty roster, error surfaced.
      setMembers([]);
      setRolesByUser({});
      setMemberById({});
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      if (mountedRef.current && seq === seqRef.current) setLoading(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, load]);

  // Realtime: debounced refresh on any roster-shaping change (MembersAdmin pattern).
  useEffect(() => {
    if (!enabled) return;
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        void load();
      }, 350);
    };
    const channel = supabase
      .channel("team-roster-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenant_members" }, bump)
      .subscribe();
    return () => {
      if (scheduled) clearTimeout(scheduled);
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  return { members, rolesByUser, memberById, loading, error, refresh };
}
