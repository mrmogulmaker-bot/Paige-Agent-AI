// Best-effort rail emitters for the automation / workflow dispatch path (owner_ops).
//
// Files automation.fired / automation.completed onto the Paige context rail so the
// OWNER side sees each real automation run for a client. These are owner_internal
// kinds — record_rail_event broadcasts them to rail:tenant:<tenant> only, never to
// the client feed (§9).
//
// Telemetry ONLY (§13): every call is wrapped so a rail write can never break or
// slow a real dispatch. Emit AFTER the automation has actually fired/completed — a
// fire is not a delivery. The rail is per-CLIENT: if no client resolves for the run,
// we SKIP (many automations are tenant-level, not client-scoped — that's fine).
//
// Callers pass a SERVICE-ROLE Supabase client, so record_rail_event takes the trusted
// service path (auth.uid() is NULL) and REQUIRES an explicit p_tenant_id.

// Loose structural type — any supabase-js client exposes .rpc(fn, args). Kept
// permissive so any service-role SupabaseClient assigns without friction.
// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type AutomationPhase = "fired" | "completed";

export type AutomationRailInput = {
  /** Tenant the run belongs to. Required — a tenant-less run is skipped. */
  tenantId: string | null | undefined;
  /** Explicit client/contact id when the run context already names one. */
  contactId?: string | null;
  /** Fallback identifiers to resolve the client when no explicit id is present. */
  email?: string | null;
  phone?: string | null;
  /** Human-readable workflow/automation name — NEVER an id or slug (§3). */
  workflowName?: string | null;
  phase: AutomationPhase;
  /** Optional provenance for the owner rail card. */
  refTable?: string | null;
  refId?: string | null;
};

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Return a workflow label only if it reads as a HUMAN name; otherwise null so the
 * rail title falls back to the bare "Automation started/finished" (§3). Rejects
 * slug/id shapes (snake_case, `wf_`/`wf-` prefixes, all-lowercase tokens carrying a
 * digit like `dunning2`/`seq3v2`) so registry ids never surface on the owner rail.
 * Human labels — anything with a space, or a clean capitalized/word label — pass.
 */
function humanLabel(v: string | null): string | null {
  const t = s(v);
  if (!t) return null;
  if (t.includes("_")) return null;                 // snake_case slug
  if (/^wf[-]/i.test(t)) return null;               // wf- id prefix
  if (/^[a-z0-9]+$/.test(t) && /\d/.test(t)) return null; // all-lowercase token with a digit
  return t;
}

/**
 * Pull possible client identifiers out of an opaque workflow payload without
 * assuming a fixed shape. Returns nulls when nothing client-scoped is present.
 */
export function contactHintsFromPayload(
  payload: unknown,
): { contactId: string | null; email: string | null; phone: string | null } {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const contactId = s(p.contact_id) ?? s(p.client_id) ?? s(p.contactId) ?? s(p.clientId) ?? null;
  const email = s(p.email) ?? s(p.contact_email) ?? s(p.to_email) ?? null;
  const phone = s(p.phone) ?? s(p.contact_phone) ?? s(p.to_phone) ?? null;
  return { contactId, email, phone };
}

/**
 * File one automation.fired / automation.completed rail event for the client a run
 * targets. Fully best-effort: swallows every failure. Skips silently when no tenant
 * or no client can be resolved (§13 truthful — never fabricate a contact).
 */
export async function emitAutomationRail(admin: RpcClient, input: AutomationRailInput): Promise<void> {
  try {
    const tenantId = s(input.tenantId);
    if (!tenantId) return; // rail needs a tenant; tenant-less runs are skipped

    // Resolve the real client the automation runs for. An explicit id wins; otherwise
    // try email/phone via resolve_contact_id. On the service path (auth.uid() NULL)
    // resolve_contact_id uses p_tenant directly and validates tenant scoping.
    let contactId = s(input.contactId);
    if (!contactId && (input.email || input.phone)) {
      try {
        const { data } = await admin.rpc("resolve_contact_id", {
          p_tenant: tenantId,
          p_phone: input.phone ?? null,
          p_email: input.email ?? null,
          p_user_id: null,
        });
        contactId = s(data);
      } catch { /* resolution is best-effort */ }
    }
    if (!contactId) return; // tenant-level automation, no client to file for — skip

    const label = humanLabel(input.workflowName ?? null);
    const title = input.phase === "fired"
      ? (label ? `Automation started: ${label}` : "Automation started")
      : (label ? `Automation finished: ${label}` : "Automation finished");

    await admin.rpc("record_rail_event", {
      p_contact_id: contactId,
      p_event_kind: input.phase === "fired" ? "automation.fired" : "automation.completed",
      p_surface: "automation",
      p_actor_type: "automation",
      p_title: title,
      p_summary: null,
      p_ref_table: input.refTable ?? null,
      p_ref_id: input.refId ?? null,
      p_from_department: "owner_ops",
      p_to_department: null,
      p_tenant_id: tenantId,
    });
  } catch (e) {
    try { console.warn("[rail] automation emit skipped:", (e as Error)?.message); } catch { /* ignore */ }
  }
}
