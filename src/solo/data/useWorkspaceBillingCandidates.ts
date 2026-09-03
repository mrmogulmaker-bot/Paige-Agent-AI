/**
 * useWorkspaceBillingCandidates — who this workspace's owner may DESIGNATE as a billing contact.
 *
 * The designation RPCs take a user id, so the screen needs a list of people to choose from. That
 * list is the workspace roster, which already has exactly one home: `get_solo_team_workspace`, the
 * Team surface's read (§18 — no second roster query family, no new server seam for a list that
 * already exists).
 *
 * ELIGIBILITY IS NOT DECIDED HERE. This hook narrows the roster to the two ROLES the designations
 * accept — a current owner for `primary_contact`, a current admin for `delegate` — so the person is
 * not offered someone the server would obviously refuse. The real gate is the database trigger,
 * which additionally requires a confirmed email address and re-checks ownership live; a selection
 * this hook allows can still be refused, and that refusal is shown verbatim rather than pre-empted.
 * Email-verification state is NOT exposed by the roster read, so it is deliberately not guessed at
 * here (§13): an unverified person may be offered, and the server answers
 * `billing_contact_email_unverified`, which the screen states.
 *
 * Tenant-switch discipline matches the sibling billing hooks: keyed on the active workspace, state
 * resets the instant it changes, and a late answer for a workspace we have left is dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";
import { memberVisibleIdentity, normalizeTeamWorkspace } from "@/solo/team-workspace-contract";

export interface BillingContactCandidate {
  userId: string;
  /** Whatever the roster can show for this person — never fabricated. */
  name: string;
}

export interface WorkspaceBillingCandidates {
  loading: boolean;
  /** True when the roster could not be read. The screen keeps working; it just cannot offer names. */
  error: boolean;
  owners: ReadonlyArray<BillingContactCandidate>;
  admins: ReadonlyArray<BillingContactCandidate>;
  refresh: () => void;
}

const EMPTY: ReadonlyArray<BillingContactCandidate> = [];
const PAGE = 200;

export function useWorkspaceBillingCandidates(enabled = true): WorkspaceBillingCandidates {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<{ loading: boolean; error: boolean; owners: ReadonlyArray<BillingContactCandidate>; admins: ReadonlyArray<BillingContactCandidate> }>(
    { loading: true, error: false, owners: EMPTY, admins: EMPTY },
  );

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Reset FIRST: one workspace's people must never be selectable while another is open.
    setState({ loading: true, error: false, owners: EMPTY, admins: EMPTY });
    if (tenantLoading) return;
    if (!enabled || !activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setState({ loading: false, error: false, owners: EMPTY, admins: EMPTY });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types (repo-wide pattern)
    const { data, error } = await (supabase as any).rpc("get_solo_team_workspace", {
      _search: null, _permission: "all", _limit: PAGE, _offset: 0,
    });
    if (!gate.current.isCurrent(token)) return;
    const workspace = normalizeTeamWorkspace(data);
    // A roster for a DIFFERENT workspace is an error, not a list: the read is answered by the
    // server's own resolver, and a mismatch means this screen is not looking at what it thinks.
    if (error || !workspace || workspace.tenant_id !== activeTenantId) {
      setState({ loading: false, error: true, owners: EMPTY, admins: EMPTY });
      return;
    }
    const active = workspace.members.filter((m) => m.status === "active");
    const toCandidate = (m: (typeof active)[number]): BillingContactCandidate => ({
      userId: m.user_id,
      name: memberVisibleIdentity(m).primary,
    });
    setState({
      loading: false,
      error: false,
      owners: active.filter((m) => m.is_owner).map(toCandidate),
      admins: active.filter((m) => !m.is_owner && m.permission === "admin").map(toCandidate),
    });
  }, [activeTenantId, tenantLoading, enabled]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  return { ...state, loading: state.loading || tenantLoading, refresh: load };
}
