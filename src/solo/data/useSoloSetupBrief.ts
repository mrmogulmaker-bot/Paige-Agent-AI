import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import {
  cleanSoloSetupBrief,
  type SoloSetupBrief,
  type SoloSetupProposal,
} from "../settings-setup-contract";
import { useSoloPeople, type SoloPerson } from "./useSoloPeople";

type SetupRow = {
  tenant_id?: string;
  tenant_name?: string;
  business_brief?: unknown;
  pending_proposal?: unknown;
  primary_business_email?: string | null;
  can_edit?: boolean;
  business_registration_number_last_4?: string | null;
};

type SaveRow = {
  business_brief?: unknown;
  businessRegistrationNumberLast4?: string | null;
};

type IdentityRow = { default_email_sender?: string | null };

function proposalOf(value: unknown): SoloSetupProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.reason !== "string" || typeof raw.proposedAt !== "string") return null;
  if (!raw.patch || typeof raw.patch !== "object" || Array.isArray(raw.patch)) return null;
  return { id: raw.id, reason: raw.reason, proposedAt: raw.proposedAt, patch: raw.patch as Partial<SoloSetupBrief> };
}

function withRegistrationLast4(value: unknown, last4: unknown): unknown {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    ...source,
    businessRegistrationNumberLast4: typeof last4 === "string" ? last4 : "",
  };
}

export type SoloSetupBriefData = {
  loading: boolean;
  error: string | null;
  saving: boolean;
  canEdit: boolean;
  brief: SoloSetupBrief;
  representatives: SoloPerson[];
  managedSendingEmail: string | null;
  primaryBusinessEmail: string | null;
  pendingProposal: SoloSetupProposal | null;
  save: (brief: SoloSetupBrief, proposalId: string | null) => Promise<{ ok: boolean; error?: string }>;
  dismissProposal: (proposalId: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
};

export function useSoloSetupBrief(): SoloSetupBriefData {
  const { activeTenantId } = useTenantContext();
  const people = useSoloPeople();
  const gate = useRef(createSettingsRequestGate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  const [brief, setBrief] = useState(() => cleanSoloSetupBrief(null));
  const [managedSendingEmail, setManagedSendingEmail] = useState<string | null>(null);
  const [primaryBusinessEmail, setPrimaryBusinessEmail] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<SoloSetupProposal | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setLoading(true);
    setError(null);
    setCanEdit(false);
    setResolvedTenantId(null);
    setBrief(cleanSoloSetupBrief(null));
    setPendingProposal(null);
    setManagedSendingEmail(null);
    setPrimaryBusinessEmail(null);
    if (!activeTenantId) {
      setLoading(false);
      return;
    }
    try {
      const [briefResult, identityResult] = await Promise.all([
        // Migration-backed canonical Setup + legal-sender read. Generated types refresh after apply.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("get_solo_setup_identity"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("resolve_tenant_domain_identity"),
      ]);
      if (!gate.current.isCurrent(token)) return;
      if (briefResult.error) throw briefResult.error;
      const row = (Array.isArray(briefResult.data) ? briefResult.data[0] : briefResult.data) as SetupRow | null;
      const identity = (Array.isArray(identityResult.data) ? identityResult.data[0] : identityResult.data) as IdentityRow | null;
      if (!row || row.tenant_id !== activeTenantId) throw new Error("The active workspace could not be resolved safely.");
      setBrief(cleanSoloSetupBrief(
        withRegistrationLast4(row.business_brief, row.business_registration_number_last_4),
        row.tenant_name ?? "",
      ));
      setPendingProposal(proposalOf(row.pending_proposal));
      setResolvedTenantId(row.tenant_id ?? null);
      setCanEdit(row.can_edit === true);
      setPrimaryBusinessEmail(row.primary_business_email?.trim() || null);
      setManagedSendingEmail(identityResult.error ? null : identity?.default_email_sender?.trim() || null);
    } catch (caught) {
      if (!gate.current.isCurrent(token)) return;
      setError(caught instanceof Error ? caught.message : "Couldn't load this business brief.");
    } finally {
      if (gate.current.isCurrent(token)) setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    const activeGate = gate.current;
    void load();
    return () => activeGate.clear();
  }, [load]);

  const canEditCurrentTenant = canEdit && Boolean(activeTenantId) && resolvedTenantId === activeTenantId;

  const save = useCallback(async (next: SoloSetupBrief, proposalId: string | null) => {
    if (!activeTenantId) return { ok: false, error: "No active workspace." };
    if (!canEditCurrentTenant) return { ok: false, error: "This workspace has not resolved safely for editing." };
    setSaving(true);
    try {
      // Atomic seam: general business brief + legal profile + vaulted registration number.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: saveError } = await (supabase as any).rpc("save_solo_setup_identity", {
        _brief: next,
        _expected_updated_at: brief.updatedAt ?? null,
        _proposal_id: proposalId,
      });
      if (saveError) throw saveError;
      const row = (data ?? {}) as SaveRow;
      setBrief(cleanSoloSetupBrief(withRegistrationLast4(
        row.business_brief,
        row.businessRegistrationNumberLast4,
      )));
      if (proposalId) setPendingProposal(null);
      return { ok: true };
    } catch (caught) {
      return { ok: false, error: caught instanceof Error ? caught.message : "Couldn't save your business brief." };
    } finally {
      setSaving(false);
    }
  }, [activeTenantId, brief.updatedAt, canEditCurrentTenant]);

  const dismissProposal = useCallback(async (proposalId: string) => {
    if (!canEditCurrentTenant) return { ok: false, error: "This workspace has not resolved safely for editing." };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dismissError } = await (supabase as any).rpc("dismiss_solo_business_brief_proposal", { _proposal_id: proposalId });
      if (dismissError) throw dismissError;
      setPendingProposal(null);
      return { ok: true };
    } catch (caught) {
      return { ok: false, error: caught instanceof Error ? caught.message : "Couldn't dismiss this suggestion." };
    }
  }, [canEditCurrentTenant]);

  return {
    loading: loading || people.loading,
    error: error || people.error,
    saving,
    canEdit: canEditCurrentTenant,
    brief,
    representatives: people.people,
    managedSendingEmail,
    primaryBusinessEmail,
    pendingProposal,
    save,
    dismissProposal,
    refresh: load,
  };
}
