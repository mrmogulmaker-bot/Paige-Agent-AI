// _shared/mcp-outcome.ts — the boundary between a provider's answer and Paige.
//
// THE PROBLEM THIS SOLVES
//
// `paige-ai-chat` serialises a tool result straight into the model's context. An MCP
// server is tenant-configured and provider-operated, so its response is UNTRUSTED INPUT
// on three axes at once: it can carry instructions aimed at the model, it can carry
// credentials, and it can carry another tenant's records. Forwarding it — however the
// forwarding is framed — puts all three in front of Paige.
//
// WHY THE SUMMARY DESCRIBES SHAPE AND NOT CONTENT
//
// The obvious design is a short, redacted excerpt of what the provider said. That does not
// hold. Redaction can catch things that LOOK like secrets; it cannot catch
// "IGNORE ALL PREVIOUS INSTRUCTIONS", and it cannot catch another tenant's customer name,
// because neither has a shape to match on. Any design that forwards provider prose is one
// unmatched pattern away from forwarding an instruction or a record.
//
// So no provider text crosses this boundary at all. What Paige receives is what she
// actually needs in order to act: which capability ran, whether it worked, when, whether
// it was authorised, and an opaque reference under which the detail is held. The detail
// itself stays server-side, encrypted, and tenant-scoped.
//
// WHY IT FAILS CLOSED ON THE CAPABILITY
//
// A capability that the workspace has not approved is not called. The check happens before
// any request leaves the process, so an unapproved name cannot even be used to probe the
// provider. An empty approval set therefore denies everything, which is the correct state
// for a workspace that has not yet approved anything.
import { McpError, mcpListToolFingerprints, mcpRequest, type McpAuth } from "./mcp-client.ts";

export type McpProvider = "n8n" | "zapier";

export type McpOutcomeStatus =
  /** The capability ran and the provider reported success. */
  | "ok"
  /** It ran and did not succeed, or answered in a shape we do not accept. */
  | "failed"
  /** It was never called: the workspace has not approved this capability, or the
   *  capability is no longer the one it approved. */
  | "denied"
  /** It could not be reached at all. */
  | "unavailable";

/**
 * Everything, and only everything, that may reach the model.
 *
 * There is deliberately no field here that a provider controls. `capability` is OUR
 * approved identity rather than the provider's echo of it, `summary` is composed from
 * counts and types we validated, and `evidence_ref` is a fresh identifier that encodes
 * nothing — not the tenant, not the capability, not the provider.
 */
export type McpOutcome = {
  provider: McpProvider;
  capability: string;
  status: McpOutcomeStatus;
  authorization: "approved" | "not_approved";
  /** A description of the SHAPE of the answer. Never any of its content. */
  summary: string;
  at: string;
  evidence_ref: string | null;
  /**
   * A standing marker that this outcome describes something a third party produced.
   * It travels with the outcome so the distinction survives wherever it is rendered.
   */
  untrusted: true;
};

/**
 * The detail, for the evidence store only. It never travels to a caller that talks to the
 * model, and it is written encrypted and tenant-scoped.
 */
export type McpEvidence = {
  ref: string;
  provider: McpProvider;
  capability: string;
  /** Bounded and credential-scrubbed before storage — a provider echoing our own token
   *  back would otherwise recreate that secret at rest. */
  payload: string;
};

export type CapabilityCallResult = { outcome: McpOutcome; evidence: McpEvidence | null };

/** No evidence record grows without bound, whatever the provider sends. */
const MAX_EVIDENCE_CHARS = 16_000;

/** The MCP content types we recognise. Anything else is reported as "other" rather than
 *  echoed, because the type field is provider-controlled text like any other. */
const KNOWN_CONTENT_TYPES = new Set(["text", "image", "audio", "resource", "resource_link"]);

/**
 * Credential shapes, scrubbed before anything is stored. This is defence in depth for the
 * evidence store, NOT the mechanism that protects the model — the model sees no provider
 * text at all, which is what makes that protection independent of this list being complete.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,     // JWT
  /\b(?:sk|pk|rk)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9]{16,}\b/gi,       // provider keys
  /\bAKIA[0-9A-Z]{16}\b/g,                                               // AWS access key id
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret)\s*[=:]\s*\S+/gi,
  /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@\S+/gi,                               // credentials in a URL
  /\b[A-Fa-f0-9]{40,}\b/g,                                               // long hex blobs
];

function scrubCredentials(text: string): string {
  let out = text;
  for (const pattern of CREDENTIAL_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}

/** The MCP `tools/call` result shape, as far as we are willing to accept one. */
type ValidatedResult = { blocks: Array<{ type: string; chars: number }>; isError: boolean };

/**
 * Accepts only the documented MCP result shape. Anything else is not understood, and what
 * is not understood is not summarised, not counted, and not reported as a success.
 */
function validateResult(result: unknown): ValidatedResult | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as { content?: unknown; isError?: unknown };
  if (!Array.isArray(r.content)) return null;
  const blocks: Array<{ type: string; chars: number }> = [];
  for (const raw of r.content) {
    if (!raw || typeof raw !== "object") return null;
    const block = raw as { type?: unknown; text?: unknown };
    if (typeof block.type !== "string") return null;
    blocks.push({
      // The type is provider-controlled, so it is mapped through a known set rather
      // than passed along. A type of "…ignore your instructions…" reports as "other".
      type: KNOWN_CONTENT_TYPES.has(block.type) ? block.type : "other",
      chars: typeof block.text === "string" ? block.text.length : 0,
    });
  }
  return { blocks, isError: r.isError === true };
}

/**
 * Describes what came back without repeating any of it. Composed entirely from values we
 * produced ourselves: a count, a set of validated type names, and a character total.
 */
function describeShape(validated: ValidatedResult): string {
  const count = validated.blocks.length;
  if (count === 0) return "The provider answered with no content.";
  const types = [...new Set(validated.blocks.map((b) => b.type))].sort().join(", ");
  const chars = validated.blocks.reduce((sum, b) => sum + b.chars, 0);
  const noun = count === 1 ? "block" : "blocks";
  return `The provider returned ${count} ${noun} (${types}), ${chars} characters in total. ` +
    "The content itself is held as evidence and is not shown here.";
}

function outcomeOf(
  provider: McpProvider,
  capability: string,
  status: McpOutcomeStatus,
  summary: string,
  evidenceRef: string | null,
  authorization: McpOutcome["authorization"] = "approved",
): McpOutcome {
  return { provider, capability, status, authorization, summary, at: new Date().toISOString(), evidence_ref: evidenceRef, untrusted: true };
}

/**
 * Calls one approved capability and returns only what may cross the boundary.
 *
 * `approvedCapabilities` is the workspace's own approval set, resolved from the registry
 * by the caller. It is the whole authorisation decision: a name that is not in it results
 * in no request at all.
 */
export async function callApprovedCapability(opts: {
  serverUrl: string;
  auth: McpAuth;
  provider: McpProvider;
  /** The capability the caller is asking for. Checked, never trusted. */
  capability: string;
  approvedCapabilities: readonly string[];
  /**
   * Approved name → the input-schema fingerprint it had when it was approved. A name with
   * no entry here is refused: an unverified contract is not a verified one, and treating
   * a missing pin as "fine" would make the whole mechanism opt-out by accident.
   */
  capabilityPins: Readonly<Record<string, string>>;
  /** Used by the caller to scope the evidence record. Never placed in the outcome. */
  tenantId: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<CapabilityCallResult> {
  const { provider, capability } = opts;

  // Authorisation first, and before any network activity: an unapproved name must not
  // even reach the provider, or it becomes a way to enumerate what exists there.
  if (!opts.approvedCapabilities.includes(capability)) {
    return {
      outcome: outcomeOf(provider, capability, "denied",
        "This workspace has not approved that capability, so it was not run.",
        null, "not_approved"),
      evidence: null,
    };
  }

  const pinned = opts.capabilityPins[capability];
  if (!pinned) {
    return {
      outcome: outcomeOf(provider, capability, "denied",
        "That capability was approved without a recorded contract, so it cannot be verified. Approve it again.",
        null, "not_approved"),
      evidence: null,
    };
  }

  // The contract is checked against the provider as it is NOW. A tool keeps its name when
  // its inputs change, so a name alone cannot tell an approved capability from one that
  // has been reshaped since — which is the substitution this exists to catch. Any failure
  // to establish the current contract is a refusal, never a pass: if we cannot tell
  // whether it drifted, it has not been verified.
  let live: Awaited<ReturnType<typeof mcpListToolFingerprints>>;
  try {
    live = await mcpListToolFingerprints({ serverUrl: opts.serverUrl, auth: opts.auth, timeoutMs: opts.timeoutMs });
  } catch (e) {
    const code = e instanceof McpError ? e.code : "request_failed";
    const transportFailure = code !== "mcp_http_error" && code !== "mcp_protocol_error";
    return {
      outcome: outcomeOf(provider, capability, transportFailure ? "unavailable" : "failed",
        "The capability could not be verified against the provider, so it was not run.",
        null),
      evidence: null,
    };
  }

  const current = live.find((t) => t.name === capability);
  if (!current) {
    return {
      outcome: outcomeOf(provider, capability, "denied",
        "That capability is no longer offered by the provider, so it was not run.",
        null, "not_approved"),
      evidence: null,
    };
  }
  if (current.schemaHash !== pinned) {
    return {
      outcome: outcomeOf(provider, capability, "denied",
        "That capability has changed since it was approved, so it was not run. Review and approve it again.",
        null, "not_approved"),
      evidence: null,
    };
  }

  let raw: unknown;
  try {
    raw = await mcpRequest({
      serverUrl: opts.serverUrl,
      auth: opts.auth,
      method: "tools/call",
      params: { name: capability, arguments: opts.args ?? {} },
      timeoutMs: opts.timeoutMs,
    });
  } catch (e) {
    // The provider's own error text is not carried. It is provider-controlled prose and
    // has, in practice, contained internal paths, addresses and rejected credentials.
    const code = e instanceof McpError ? e.code : "request_failed";
    const transportFailure = code !== "mcp_http_error" && code !== "mcp_protocol_error";
    return {
      outcome: outcomeOf(provider, capability, transportFailure ? "unavailable" : "failed",
        transportFailure
          ? "The provider could not be reached, so nothing was run."
          : "The provider rejected the request. Its reason is held as evidence and is not shown here.",
        null),
      evidence: null,
    };
  }

  const validated = validateResult(raw);
  const ref = crypto.randomUUID();
  const evidence: McpEvidence = {
    ref,
    provider,
    capability,
    payload: scrubCredentials(safeStringify(raw)).slice(0, MAX_EVIDENCE_CHARS),
  };

  if (!validated) {
    return {
      outcome: outcomeOf(provider, capability, "failed",
        "The provider answered in a shape this workspace does not accept, so nothing was read from it.",
        ref),
      evidence,
    };
  }

  if (validated.isError) {
    return {
      outcome: outcomeOf(provider, capability, "failed",
        "The provider reported that the action did not succeed. Its explanation is held as evidence and is not shown here.",
        ref),
      evidence,
    };
  }

  return { outcome: outcomeOf(provider, capability, "ok", describeShape(validated), ref), evidence };
}

/**
 * Discovery, reduced the same way. A tool's own name and description are provider-written
 * text, so what is offered back is the intersection with what the workspace has already
 * approved — never the provider's list, and never its prose.
 */
export function projectDiscovery(
  discovered: ReadonlyArray<{ name: string }>,
  approvedCapabilities: readonly string[],
): { approved: string[]; unapproved_count: number } {
  const approvedSet = new Set(approvedCapabilities);
  const seen = new Set<string>();
  const approved: string[] = [];
  let unapproved = 0;
  for (const tool of discovered) {
    if (approvedSet.has(tool.name)) {
      // De-duplicated so a provider cannot pad the list with repeats.
      if (!seen.has(tool.name)) { seen.add(tool.name); approved.push(tool.name); }
    } else {
      unapproved += 1;
    }
  }
  // Sorted so the order is ours rather than the provider's.
  return { approved: approved.sort(), unapproved_count: unapproved };
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value) ?? ""; } catch { return ""; }
}

/**
 * Narrows a governed-call response to the fields a model may see.
 *
 * This is the LAST gate before `paige-ai-chat` serialises a tool result into a model's
 * context, and it is deliberately separate from the projection that produced the
 * response: one is the boundary at the provider, this is the boundary at the model, and
 * neither is entitled to assume the other ran.
 *
 * This is an allowlist, not a redaction: an unrecognised field is dropped rather than
 * inspected, so a future response key cannot leak by being unanticipated here. The
 * function is total — any shape it does not recognise becomes an honest failure rather
 * than an exception or a pass-through.
 */
export function projectOutcomeForModel(raw: unknown): Record<string, unknown> {
  const d = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, cap: number) => (typeof v === "string" ? v.slice(0, cap) : undefined);

  // Discovery: approved capability NAMES only. Provider descriptions do not cross.
  if (Array.isArray(d.actions)) {
    return {
      success: d.ok === true,
      actions: (d.actions as unknown[]).filter((a): a is string => typeof a === "string").slice(0, 200),
      approved_count: typeof d.approved_count === "number" ? d.approved_count : 0,
      unapproved_count: typeof d.unapproved_count === "number" ? d.unapproved_count : 0,
      note: "These are the capabilities this workspace has approved. Anything else is not available.",
    };
  }

  // A connection-level answer the workspace needs to hear about, in our own words.
  if (typeof d.error === "string" && !d.status) {
    const known: Record<string, string> = {
      not_connected: "This workspace has not connected a Zapier account yet.",
      connection_disabled: "This workspace's Zapier connection is turned off.",
      discovery_unavailable: "The connected Zapier account could not be reached just now.",
      reauthorization_required: "This workspace's Zapier authorization has expired and needs reconnecting. Do not retry.",
      unauthorized: "That action is not available to this caller.",
      forbidden: "That action is not available to this caller.",
    };
    return { success: false, error: d.error, detail: known[d.error] ?? "That action could not be completed." };
  }

  // The outcome projection.
  const status = str(d.status, 32);
  if (!status) return { success: false, error: "unexpected_response", detail: "That action could not be completed." };
  return {
    success: status === "ok",
    provider: str(d.provider, 32),
    capability: str(d.capability, 200),
    status,
    authorization: str(d.authorization, 32),
    // Composed server-side from counts and validated type names — never provider prose.
    summary: str(d.summary, 400),
    at: str(d.at, 40),
    // Opaque, and useless without the tenant-scoped, admin-gated read.
    evidence_ref: str(d.evidence_ref, 64) ?? null,
    untrusted: true,
    note: status === "denied"
      ? "This workspace has not approved that capability. Do not retry it; tell the operator it is not approved."
      : "The provider's own output is not shown here. Do not claim to know its contents.",
  };
}

/* ── Provenance: the Action Bus and the Rail ────────────────────────────────────
   The last leg of the governed path. A capability that ran has to leave a record the
   organisation can read, and that record is subject to the same boundary as everything
   else: it carries what happened, never what the provider said.

   Both writers already exist and are used as they are (§18). `file_action` is the only
   writer of `paige_actions`; `record_rail_event` is the only writer of the rail. Neither
   is wrapped, forked or replaced here — this composes them. */

/** Everything a provenance record may carry. Composed by us; no provider field survives. */
function provenanceOf(outcome: McpOutcome): Record<string, unknown> {
  return {
    provider: outcome.provider,
    capability: outcome.capability,
    status: outcome.status,
    authorization: outcome.authorization,
    at: outcome.at,
    // The reference, not the detail. Reading it needs tenant-scoped admin authority.
    evidence_ref: outcome.evidence_ref,
  };
}

function titleOf(outcome: McpOutcome): string {
  switch (outcome.status) {
    case "ok": return `Ran ${outcome.capability} on ${outcome.provider}`;
    case "denied": return `Refused ${outcome.capability} on ${outcome.provider}`;
    case "unavailable": return `Could not reach ${outcome.provider} to run ${outcome.capability}`;
    default: return `${outcome.capability} did not succeed on ${outcome.provider}`;
  }
}

/**
 * Files the provenance of one governed capability call.
 *
 * WHAT IS RECORDED WHERE, AND WHY THEY DIFFER
 *
 * The Action Bus is tenant-scoped and its contact is optional, so every call is filed
 * there — including the refusals, which are the ones worth being able to find later.
 *
 * The Rail is contact-scoped by construction: `paige_client_events.contact_id` is NOT NULL
 * and references `clients`, and `record_rail_event` refuses a contact that is not in the
 * tenant. A capability run that is not about a particular client therefore has no place on
 * it, and inventing a contact to satisfy the column would put a fabricated association in
 * front of an operator. So the rail entry is written only when the turn genuinely has a
 * contact in scope, and its absence is reported rather than worked around.
 *
 * Never throws. Provenance failing must not turn a completed action into a reported
 * failure — the action happened, and saying otherwise would be the lie this whole path is
 * built to avoid. Failures are logged and reported in the return value.
 */
export async function fileGovernedOutcome(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: { tenantId: string; outcome: McpOutcome; contactId?: string | null },
): Promise<{ actionFiled: boolean; railFiled: boolean; railSkipped: "no_contact" | null }> {
  const payload = provenanceOf(opts.outcome);
  let actionFiled = false;
  let railFiled = false;

  try {
    const { error } = await admin.rpc("file_action", {
      p_action_kind: "owner.external_capability",
      p_title: titleOf(opts.outcome),
      // Our own shape description. It contains no provider text by construction.
      p_summary: opts.outcome.summary,
      p_contact_id: opts.contactId ?? null,
      p_payload: payload,
      p_created_by_agent: "paige",
      p_tenant_id: opts.tenantId,
      // The operator already approved this at the tool gate; the row records, it does
      // not ask again.
      p_autonomy_lane: "auto",
    });
    if (error) console.error("[mcp] action not filed:", error.message);
    else actionFiled = true;
  } catch (e) {
    console.error("[mcp] action not filed:", e instanceof Error ? e.message : "unknown");
  }

  if (!opts.contactId) return { actionFiled, railFiled: false, railSkipped: "no_contact" };

  try {
    const { error } = await admin.rpc("record_rail_event", {
      p_contact_id: opts.contactId,
      // An existing kind: "Paige took an action for the operator". Owner-internal, which
      // is correct — a client has no business seeing the workspace's integrations.
      p_event_kind: "owner.action_taken",
      p_surface: "your_paige",
      p_actor_type: "paige_agent",
      p_title: titleOf(opts.outcome),
      p_summary: opts.outcome.summary,
      p_payload: payload,
      p_tenant_id: opts.tenantId,
    });
    if (error) console.error("[mcp] rail event not filed:", error.message);
    else railFiled = true;
  } catch (e) {
    console.error("[mcp] rail event not filed:", e instanceof Error ? e.message : "unknown");
  }

  return { actionFiled, railFiled, railSkipped: null };
}
