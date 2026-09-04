/**
 * useSoloA2P — carrier registration, reachable from the Solo shell.
 *
 * WHY THIS EXISTS. Preparing a 10DLC registration is real and durable: `comms-a2p-draft`
 * makes a live model call, drafts the regulatory copy a person would otherwise write by
 * hand inside a carrier portal, and SAVES it through `tenant_a2p_registration_save_draft`;
 * `comms-a2p-submit` saves the reviewed edits. Both have shipped for a while. Their only
 * caller anywhere in the repo is a tab mounted on the legacy route a Solo tenant is
 * REDIRECTED AWAY FROM — so a Solo tenant could not reach a capability the platform
 * already had. This adapter is the Solo caller it never had (§18: the same two seams, not
 * a third).
 *
 * WHAT THIS CANNOT DO, AND SAYS SO (§13). Filing with a carrier does not exist. It is not
 * a stub that returns no SID — the TrustHub calls were REMOVED, and `comms-a2p-submit`
 * refuses submission explicitly and returns `a2p_submit_wired: false`. So nothing here may
 * render a filed or submitted state, and `saveReviewed` reports `submitted: false` as a
 * fact rather than as a pending step. Scoping that submission path is its own work.
 *
 * THREE DISTINCTIONS THIS FILE EXISTS TO PRESERVE. Each was a real defect on the legacy
 * tab, and each collapses into the same wrong screen — "not registered yet", above a
 * button whose only effect is a PAID generation that overwrites reviewed compliance copy:
 *
 *   1. A tenant we could not RESOLVE is not a tenant with no registration.
 *   2. A read that FAILED is not an empty account.
 *   3. A registration that has LEFT PREPARATION is locked, and offering an editor over it
 *      promises a write the save seam refuses (`hasLeftPreparation` mirrors the server's
 *      eight conditions; where they drift the server wins).
 *
 * §9: neither edge function is told a tenant. Both derive it server-side from the verified
 * JWT, and a body `tenant_id` is ignored for JWT callers. The reads here resolve the tenant
 * through the SAME `current_user_tenant_id` RPC the write seam uses, so the row on screen
 * and the row being written can never disagree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { createSettingsRequestGate } from "../settings-contract";
import { resolveFunctionError } from "@/lib/integrations/connectError";
import { draftFromRegistration, hasLeftPreparation } from "@/components/admin/comms/a2pDraftResume";
// Type-only, so nothing from the legacy tab reaches the Solo bundle. Sharing the shape is
// the point: a second declaration of the same row is a second thing to drift (§18).
import type { A2PRegistration, EditDraft } from "@/components/admin/comms/A2PTab";

export type { A2PRegistration, EditDraft };

/** Why the registration is not on screen — never collapsed into "there isn't one". */
export type A2PReadState =
  | { state: "ok"; registration: A2PRegistration | null }
  /** We could not work out which workspace the caller is in. Says nothing about the row. */
  | { state: "unidentified" }
  /** The read itself failed. Also says nothing about the row. */
  | { state: "unreadable" };

export interface SoloA2PData {
  loading: boolean;
  read: A2PReadState;
  /** The saved copy re-opened for editing, or null when the row is locked or absent. */
  resumed: EditDraft | null;
  /** True once anything has advanced past preparation — the copy is then read-only. */
  locked: boolean;
  /** Restored from tenant_legal_profile; the save seam REFUSES without it. */
  legalBusinessName: string;
  website: string;
  canManage: boolean;
  refresh: () => void;
  /** Paige drafts the regulatory copy. A real model call, and a real charge. */
  draftWithPaige: (input: { legalBusinessName: string; website: string; useCaseHint: string })
    => Promise<{ ok: boolean; draft: EditDraft | null; error: string | null }>;
  /** Saves reviewed copy. NEVER files with a carrier — see the header. */
  saveReviewed: (input: { legalBusinessName: string; website: string; draft: EditDraft })
    => Promise<{ ok: boolean; error: string | null }>;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const WORKSPACE_CHANGED = { ok: false, draft: null, error: "Your workspace changed. Reopen registration and try again." };

let sampleSeq = 0;
/** The drafted copy, shaped for the editor. Sample rows carry ids so React can key them. */
function draftFromResponse(raw: unknown): EditDraft {
  const d = asRecord(raw);
  const samples = Array.isArray(d.sample_messages)
    ? (d.sample_messages as unknown[]).map((m) => String(m ?? "")).filter(Boolean)
    : [];
  return {
    use_case: str(d.use_case),
    campaign_description: str(d.campaign_description),
    samples: (samples.length ? samples : ["", ""]).map((text) => ({ id: `paige-sample-${(sampleSeq += 1)}`, text })),
    optin_flow: str(d.optin_flow),
    optin_message: str(d.optin_message),
    optout_message: str(d.optout_message),
    help_message: str(d.help_message),
  };
}

export function useSoloA2P(): SoloA2PData {
  // The client's active tenant is the TRIGGER for a re-read; the server's
  // `current_user_tenant_id()` remains the AUTHORITY for what is read and written.
  //
  // Without the trigger this hook resolved the workspace once, at mount, and never
  // again — and `SoloSettings` is not remounted on a tenant switch. Combined with the
  // one-way latches below (which exist to protect an in-progress edit), tenant A's saved
  // compliance copy stayed on screen after the active tenant became B, and pressing Save
  // wrote it into B's registration, because the write derives its tenant server-side.
  // `useSoloNumbers` already guarded exactly this; the hook that writes REGULATORY PROSE
  // did not.
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  // Tenant owner/admin authority comes from the server helper below; retain the
  // existing global admin/coach compatibility gate as well.
  const { isStaff } = useUserRoles();
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<A2PReadState>({ state: "ok", registration: null });
  const [resumed, setResumed] = useState<EditDraft | null>(null);
  const [legalBusinessName, setLegal] = useState("");
  const [website, setWebsite] = useState("");
  const [canManage, setCanManage] = useState(false);
  const gate = useRef(createSettingsRequestGate());
  /** The workspace the state on screen belongs to. A ref, so it is not a `load` dependency. */
  const loadedRef = useRef<string | null>(null);
  // Advance during render so even a completion before effects cannot cross a switch.
  const workspace = useRef({ tenant: activeTenantId, epoch: 0, loading: tenantLoading });
  if (workspace.current.tenant !== activeTenantId || workspace.current.loading !== tenantLoading) {
    workspace.current = { tenant: activeTenantId, epoch: workspace.current.epoch + 1, loading: tenantLoading };
  }
  const currentMutation = (epoch: number, tenant: string) =>
    workspace.current.epoch === epoch && !workspace.current.loading && workspace.current.tenant === tenant;
  useEffect(() => () => { workspace.current.epoch += 1; }, []);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setLoading(true);
    if (loadedRef.current !== workspace.current.tenant) {
      setRead({ state: "unidentified" }); setResumed(null); setLegal(""); setWebsite(""); setCanManage(false);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- these tables and RPCs are not in the generated types (repo-wide pattern)
      const untyped = supabase as any;
      const { data: resolved, error: tenantErr } = await untyped.rpc("current_user_tenant_id");
      const tenantId = typeof resolved === "string" ? resolved : null;
      if (!gate.current.isCurrent(token)) return;
      if (!tenantId || tenantId !== activeTenantId || tenantId !== workspace.current.tenant) {
        // Distinction 1. Reporting "no registration" here would invite a person whose
        // registration EXISTS into a paid re-draft that overwrites it.
        console.error("useSoloA2P: could not resolve the caller's workspace:", tenantErr?.message ?? "no tenant returned");
        setRead({ state: "unidentified" });
        return;
      }

      const [regRes, legalRes, adminRes] = await Promise.all([
        untyped.from("tenant_a2p_registrations")
          .select("brand_status, campaign_status, status, use_case, campaign_description, sample_messages, optin_flow, optin_message, optout_message, help_message, submitted_at, approved_at")
          .eq("tenant_id", tenantId).limit(1).maybeSingle(),
        untyped.from("tenant_legal_profile")
          .select("legal_business_name, website_url")
          .eq("tenant_id", tenantId).limit(1).maybeSingle(),
        untyped.rpc("is_current_user_tenant_admin"),
      ]);
      if (!gate.current.isCurrent(token)) return;

      if (regRes.error) {
        // Distinction 2. Same wrong screen, different cause — so it gets its own state.
        console.error("useSoloA2P: could not read this workspace's registration:", regRes.error.message);
        setRead({ state: "unreadable" });
        return;
      }
      // The workspace moved under us. Everything the previous one put on screen is
      // dropped BEFORE the latches below get their chance to preserve it.
      const switched = loadedRef.current !== null && loadedRef.current !== tenantId;
      if (switched) { setResumed(null); setLegal(""); setWebsite(""); setCanManage(false); }
      loadedRef.current = tenantId;

      const row = (regRes.data as A2PRegistration | null) ?? null;
      setRead({ state: "ok", registration: row });
      // Distinction 3 lives in draftFromRegistration, which returns null for a locked row.
      // `prev ?? …` so a refresh behind an in-progress edit never discards unsaved work.
      // Safe only because a tenant change clears `prev` above; without that, the latch
      // preserves the WRONG workspace's copy forever.
      setResumed((prev) => (switched ? draftFromRegistration(row) : prev ?? draftFromRegistration(row)));

      if (legalRes.error) {
        // Logged, not branched: a missing legal name disables the SAVE but does not blank
        // the surface. Swallowing it would leave the save mysteriously refusing.
        console.error("useSoloA2P: could not read the legal business name:", legalRes.error.message);
      }
      const lp = asRecord(legalRes.data);
      // `prev || stored`, not `prev ?? stored`: these initialise to "" and `??` would
      // therefore never fill them. On a switch the stored value WINS outright, for the
      // same reason as above.
      if (str(lp.legal_business_name)) setLegal((prev) => (switched ? str(lp.legal_business_name) : prev || str(lp.legal_business_name)));
      if (str(lp.website_url)) setWebsite((prev) => (switched ? str(lp.website_url) : prev || str(lp.website_url)));
      setCanManage(adminRes.data === true || isStaff); // fail-closed on both halves
    } catch (e) {
      if (!gate.current.isCurrent(token)) return;
      console.error("useSoloA2P: registration read failed:", e instanceof Error ? e.message : e);
      setRead({ state: "unreadable" });
    } finally {
      if (gate.current.isCurrent(token)) setLoading(false);
    }
  }, [activeTenantId, isStaff]);

  useEffect(() => {
    const active = gate.current;
    if (tenantLoading) return;
    void load();
    return () => active.clear();
  }, [tenantLoading, load]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const draftWithPaige = useCallback(async (input: { legalBusinessName: string; website: string; useCaseHint: string }) => {
    const tenant = loadedRef.current;
    const epoch = workspace.current.epoch;
    if (!tenant || !currentMutation(epoch, tenant) || !canManage) return WORKSPACE_CHANGED;
    try {
      const { data, error: fnError } = await supabase.functions.invoke("comms-a2p-draft", {
        body: {
          expected_tenant_id: tenant,
          legal_business_name: input.legalBusinessName.trim() || undefined,
          website: input.website.trim() || undefined,
          use_case_hint: input.useCaseHint.trim() || undefined,
        },
      });
      if (!currentMutation(epoch, tenant)) return WORKSPACE_CHANGED;
      const rec = asRecord(data);
      // needs_config is an honest degrade, not a draft. Shaping it as one would put empty
      // regulatory copy in front of someone as though Paige had written it.
      if (fnError || rec.needs_config === true || rec.error) {
        const { message } = await resolveFunctionError({ error: fnError, data, action: "draft your registration" });
        return { ok: false, draft: null, error: message };
      }
      const draft = draftFromResponse(rec.draft);
      if (str(rec.legal_business_name)) setLegal(str(rec.legal_business_name));
      if (str(rec.website)) setWebsite(str(rec.website));
      setResumed(draft);
      await load();
      if (!currentMutation(epoch, tenant)) return WORKSPACE_CHANGED;
      return { ok: true, draft, error: null };
    } catch (e) {
      return { ok: false, draft: null, error: e instanceof Error ? e.message : "That draft didn't run." };
    }
  }, [load, canManage]);

  const saveReviewed = useCallback(async (input: { legalBusinessName: string; website: string; draft: EditDraft }) => {
    const tenant = loadedRef.current;
    const epoch = workspace.current.epoch;
    if (!tenant || !currentMutation(epoch, tenant) || !canManage) return WORKSPACE_CHANGED;
    try {
      const { data, error: fnError } = await supabase.functions.invoke("comms-a2p-submit", {
        body: {
          expected_tenant_id: tenant,
          legal_business_name: input.legalBusinessName.trim(),
          website: input.website.trim() || undefined,
          use_case: input.draft.use_case,
          campaign_description: input.draft.campaign_description,
          sample_messages: input.draft.samples.map((s) => s.text.trim()).filter(Boolean),
          // Sent even when EMPTY: "" means the person deleted that reply, and omitting the
          // key would preserve the old one instead of clearing it.
          optin_flow: input.draft.optin_flow,
          optin_message: input.draft.optin_message,
          optout_message: input.draft.optout_message,
          help_message: input.draft.help_message,
        },
      });
      if (!currentMutation(epoch, tenant)) return WORKSPACE_CHANGED;
      const rec = asRecord(data);
      // `saved` is the only success this seam can report. `submitted` is false by
      // construction today, and treating its absence as failure would tell someone their
      // copy was lost when it was written.
      if (fnError || (rec.saved !== true)) {
        const { message } = await resolveFunctionError({ error: fnError, data, action: "save your registration" });
        return { ok: false, error: message };
      }
      await load();
      if (!currentMutation(epoch, tenant)) return WORKSPACE_CHANGED;
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "That save didn't complete." };
    }
  }, [load, canManage]);

  const locked = read.state === "ok" && read.registration ? hasLeftPreparation(read.registration) : false;

  return useMemo(() => ({
    loading: loading || tenantLoading || (loadedRef.current !== activeTenantId && read.state === "ok"),
    read: loadedRef.current === activeTenantId || read.state !== "ok" ? read : { state: "unidentified" } as A2PReadState,
    resumed: loadedRef.current === activeTenantId ? resumed : null,
    locked, legalBusinessName: loadedRef.current === activeTenantId ? legalBusinessName : "",
    website: loadedRef.current === activeTenantId ? website : "",
    canManage: loadedRef.current === activeTenantId && !tenantLoading && canManage,
    refresh, draftWithPaige, saveReviewed,
  }), [activeTenantId, loading, tenantLoading, read, resumed, locked, legalBusinessName, website, canManage, refresh, draftWithPaige, saveReviewed]);
}
