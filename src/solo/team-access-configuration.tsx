import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { defaultSoloAccessProfile, normalizeSoloAccessProfiles, serializeSoloAccessProfile, validateSoloAccessProfile, type SoloAccessLevel, type SoloAccessProfile, type SoloAccessProfiles, type SoloAccessRole } from "./team-access-profile";

const LEVELS: readonly SoloAccessLevel[] = ["hidden", "view", "manage"];
const LEVEL_RANK: Record<SoloAccessLevel, number> = { hidden: 0, view: 1, manage: 2 };
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function useSoloAccessProfiles() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const request = useRef(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; value: SoloAccessProfiles | null }>({ loading: true, error: null, value: null });
  const load = useCallback(async () => {
    const epoch = ++request.current;
    if (!activeTenantId) { setState({ loading: false, error: null, value: null }); return null; }
    setState({ loading: true, error: null, value: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { data, error } = await (supabase as any).rpc("get_solo_team_access_profiles");
    if (epoch !== request.current) return null;
    const value = normalizeSoloAccessProfiles(data);
    if (error || !value || value.tenantId !== activeTenantId) { setState({ loading: false, error: error?.message || "Role profiles are unavailable for this workspace.", value: null }); return null; }
    setState({ loading: false, error: null, value }); return value;
  }, [activeTenantId]);
  useEffect(() => { if (!tenantLoading) void load(); return () => { request.current += 1; }; }, [load, tenantLoading]);
  const save = useCallback(async (profile: SoloAccessProfile) => {
    if (!activeTenantId || profile.permission === "owner" || Object.keys(validateSoloAccessProfile(profile.permission, profile)).length) return { ok: false as const, stale: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration RPC awaits generated types
    const { data, error } = await (supabase as any).rpc("set_solo_team_access_profile", { _permission: profile.permission, _areas: serializeSoloAccessProfile(profile), _expected_version: profile.version });
    const stale = error?.code === "40001" || /changed since it was loaded/i.test(error?.message || "");
    if (error) { if (stale) await load(); return { ok: false as const, stale, message: error.message }; }
    const current = state.value;
    if (!current || current.tenantId !== activeTenantId || !data || typeof data !== "object") return { ok: false as const, stale: false };
    const returned = data as { permission?: unknown; version?: unknown; updated_at?: unknown; areas?: unknown };
    const normalized = normalizeSoloAccessProfiles({ tenant_id: activeTenantId, viewer_permission: current.viewerPermission, can_manage: current.canManage, profiles: Object.values(current.profiles).map((item) => item.permission === profile.permission ? returned : { permission: item.permission, version: item.version, updated_at: item.updatedAt, areas: serializeSoloAccessProfile(item) }) });
    if (!normalized) return { ok: false as const, stale: false };
    setState({ loading: false, error: null, value: normalized }); return { ok: true as const, stale: false, profile: normalized.profiles[profile.permission] };
  }, [activeTenantId, load, state.value]);
  return { ...state, loading: tenantLoading || state.loading, load, save };
}

export function TeamAccessConfiguration({ openPaige }: { openPaige?: () => void }) {
  const access = useSoloAccessProfiles();
  const [role, setRole] = useState<SoloAccessRole>("admin");
  const [draft, setDraft] = useState<SoloAccessProfile>(defaultSoloAccessProfile("admin"));
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const serverProfile = access.value?.profiles[role];
  const dirty = role !== "owner" && JSON.stringify(serializeSoloAccessProfile(draft)) !== (serverProfile ? JSON.stringify(serializeSoloAccessProfile(serverProfile)) : "");
  const errors = useMemo(() => validateSoloAccessProfile(role, draft), [draft, role]);
  useEffect(() => { setDraft(access.value?.profiles[role] ?? defaultSoloAccessProfile(role)); setReviewing(false); }, [access.value, role]);
  const chooseRole = (next: SoloAccessRole) => { if (dirty && !window.confirm("Discard the unsaved role-profile changes?")) return; setRole(next); };
  const updateArea = (key: string, level: SoloAccessLevel) => { setReviewing(false); setDraft((current) => ({ ...current, areas: current.areas.map((area) => area.key === key ? { ...area, level } : area) })); };
  const cancel = () => { if (serverProfile) setDraft(serverProfile); setReviewing(false); };
  const save = async () => { setSaving(true); const result = await access.save(draft); setSaving(false); if (!result.ok) { toast.error(result.stale ? "This role profile changed elsewhere. The latest version is loaded; review it before saving again." : result.message || "The role profile was not saved."); setReviewing(false); return; } setDraft(result.profile); setReviewing(false); toast.success(`${label(role)} access saved for this workspace.`); };
  if (access.loading) return <section className="stw-access"><div className="stw-state" role="status"><RefreshCw className="ss-spin" />Resolving governed role profiles…</div></section>;
  if (access.error || !access.value) return <section className="stw-access"><div className="stw-state error" role="alert"><strong>{/denied|permission/i.test(access.error || "") ? "You cannot review role profiles" : "Role profiles unavailable"}</strong><span>{access.error || "Choose an active workspace and try again."}</span><button onClick={() => void access.load()}>Retry</button></div></section>;
  const editable = access.value.canManage && role !== "owner";
  return <div className="stw-access-layout">
    <section className="stw-access">
      <header><ShieldCheck /><div><h2>Roles &amp; access</h2><p>Permission profiles govern product access. Job titles and responsibilities only describe each person’s work.</p></div></header>
      <div className="stw-role-selector" role="tablist" aria-label="Permission profiles">{(["owner", "admin", "member"] as const).map((item) => <button key={item} role="tab" aria-selected={role === item} onClick={() => chooseRole(item)}><span>{label(item)}</span><small>{item === "owner" ? "Fixed authority" : item === "admin" ? "Team operations" : "Assigned work"}</small></button>)}</div>
      <div className="stw-access-intro"><div><strong>{label(role)} profile</strong><span>{role === "owner" ? "Owner authority is fixed and cannot be reduced or delegated here." : editable ? `These choices apply to every ${label(role)} in this workspace.` : "You can review this profile, but only the workspace Owner can change it."}</span></div>{role !== "owner" && <span className="stw-pill" data-tone={editable ? "owner" : "neutral"}>{editable ? "Owner editable" : "Read only"}</span>}</div>
      <div className="stw-access-matrix" aria-label={`${label(role)} access profile`}>
        <div className="stw-access-heading"><span>Workspace area</span>{LEVELS.map((level) => <span key={level}>{label(level)}</span>)}</div>
        {draft.areas.map((area) => <div className="stw-access-row" key={area.key}><div><strong>{area.label}</strong><small>{area.description}</small></div><div className="stw-access-options" role="radiogroup" aria-label={`${area.label} access`}>{LEVELS.map((level) => { const aboveCeiling = LEVEL_RANK[level] > LEVEL_RANK[area.ceiling]; const disabled = !editable || aboveCeiling; return <label key={level} title={aboveCeiling ? `${label(level)} is not permitted for this role.` : undefined}><input type="radio" name={`${role}-${area.key}`} value={level} checked={area.level === level} disabled={disabled} onChange={() => updateArea(area.key, level)} /><span>{area.level === level && <Check aria-hidden="true" />}</span><em className="sr-only">{label(level)}</em></label>; })}</div>{errors[area.key] && <small className="stw-access-error" role="alert">{errors[area.key]}</small>}</div>)}
      </div>
      <p className="stw-legacy-note">Specialized permissions already supported by the product keep their current governed contract. This page does not rename them or invent new capabilities.</p>
      {editable && <footer className="stw-access-actions"><span aria-live="polite">{dirty ? "Unsaved changes" : draft.version > 0 ? `Saved profile · version ${draft.version}` : "Using the governed default"}</span><button className="stw-btn secondary" disabled={!dirty || saving} onClick={cancel}>Cancel</button><button className="stw-btn" disabled={!dirty || saving || Object.keys(errors).length > 0} onClick={() => setReviewing(true)}>Review changes</button></footer>}
    </section>
    {reviewing && <section className="stw-access-review" role="dialog" aria-modal="false" aria-labelledby="stw-access-review-title"><div><h3 id="stw-access-review-title">Confirm {label(role)} access</h3><p>This updates the reusable {label(role)} permission profile for this workspace. It does not change anyone’s title or responsibilities.</p></div><div className="stw-access-review-actions"><button className="stw-btn secondary" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</button><button className="stw-btn" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Confirm and save access"}</button></div></section>}
    <section className="stw-paige"><Sparkles /><div><h2>Paige uses the same governed profile</h2><p>Paige Chat receives the active workspace, confirmed person, enforced permission, and effective access from the server-resolved Team context.</p><small>Paige may read confirmed work context and propose a change. She cannot widen access, authorize herself, silently save, or treat a title as permission. Owner confirmation remains required for governed changes.</small></div>{openPaige ? <button className="stw-btn secondary" onClick={openPaige}>Open Paige Chat</button> : <span>Governed</span>}</section>
  </div>;
}
