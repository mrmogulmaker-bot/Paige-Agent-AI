/**
 * The Solo Settings card primitives, in one place.
 *
 * These were defined inside `settings.tsx` and used only there. Billing Foundation C is the second
 * Settings destination to need them, and the alternative — a second copy in the new module — is
 * exactly the copy-paste fork §18 exists to stop: two Cards that drift, and a "consistent" surface
 * that is only consistent until someone edits one of them.
 *
 * Moved VERBATIM. No markup, class, copy or prop changed (§00 — this file makes no visual
 * decision; it relocates one). `settings.tsx` re-exports nothing and simply imports from here.
 */
import type { ReactNode } from "react";
import { Building2, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import type { SettingsTruth } from "./settings-contract";

export function Truth({ value, capability = false }: { value: SettingsTruth; capability?: boolean }) {
  return <span className="ss-truth" data-truth={value}>{capability ? `Capability: ${value}` : value}</span>;
}

export function Status({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className="ss-status" data-tone={tone}><i />{children}</span>;
}

export function Card({ title, icon: Icon, truth, capabilityTruth = false, children, actions }: { title: string; icon: typeof Building2; truth?: SettingsTruth; capabilityTruth?: boolean; children: ReactNode; actions?: ReactNode }) {
  return <section className="ss-card">
    <header><span className="ss-card-icon"><Icon aria-hidden /></span><h2>{title}</h2>{truth && <Truth value={truth} capability={capabilityTruth}/>}<div className="ss-card-actions">{actions}</div></header>
    <div className="ss-card-body">{children}</div>
  </section>;
}

export function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="ss-field"><span>{label}</span><strong>{value?.trim() || "Not provided"}</strong></div>;
}

export function ReadState({ loading, error, retry, children }: { loading: boolean; error: string | null; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="ss-state" role="status"><RefreshCw className="ss-spin"/>Clearing and resolving this account…</div>;
  if (error) return <div className="ss-state" role="alert"><TriangleAlert/><span><strong>Couldn’t load this account</strong>{error}</span><button onClick={retry}>Retry</button></div>;
  return <>{children}</>;
}

export type WriteState = { tone: "ok" | "bad"; message: string } | null;

export function Outcome({ state }: { state: WriteState }) {
  if (!state) return null;
  return <div className="ss-outcome" data-tone={state.tone} role="status" aria-live="polite">
    {state.tone === "ok" ? <CheckCircle2 aria-hidden/> : <TriangleAlert aria-hidden/>}
    <span>{state.message}</span>
  </div>;
}

/** Shown in place of the controls when the caller may not write here (§9). */
export function NotYours({ what }: { what: string }) {
  return <p className="ss-note">Only a workspace admin can change {what}. Your access here is read-only.</p>;
}
