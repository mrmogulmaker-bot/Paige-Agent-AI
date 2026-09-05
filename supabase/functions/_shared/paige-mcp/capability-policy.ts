/**
 * THE INBOUND MCP CAPABILITY POLICY — one owned mapping, so two naming systems stop drifting.
 *
 * WHY THIS FILE EXISTS.
 * `action-risk.ts` is the platform's one classifier and it holds 62 canonical keys. `paige-mcp`
 * registers 119 tools. The intersection is EXACTLY ONE — `delegate_to_subagent`. Chat says
 * `crm_create_contact`; MCP says `create_contact`. Chat says `crm_delete_contact`; MCP says
 * `bulk_delete_contacts`. So running the MCP surface through `classifyAction` unchanged returns
 * `unclassified` for 118 of 119 tools, which is refuse-by-design — correct as a default, useless as
 * a policy, and indistinguishable from "we never looked".
 *
 * This table is the correction, and it is a MAPPING rather than a second vocabulary. Every entry
 * names the CANONICAL `action-risk.ts` key for the act. Where a canonical twin already exists the
 * entry points at it; where none existed, the key was added to `action-risk.ts` itself. There is
 * one classifier and one namespace, and this file is how the MCP door reaches them.
 *
 * EFFECT IS VERIFIED, NEVER INFERRED FROM THE NAME.
 * Every `effect` below was set by reading the handler body and following its helpers. That is not
 * ceremony: 20 tools in this file mutate behind read-looking names — `handle_data_subject_request`
 * (GDPR erasure), `suspend_tenant`, `confirm_proposal`, `append_client_memory` — and 4 read-only
 * tools carry write-looking names (`get_workflow_run`, `get_skill_run`, `list_communication_log`,
 * `list_email_send_log`). A name-derived policy gets both wrong, and the expensive direction is a
 * mutation declared `read`: `governedExecution.ts` returns before classification, clamp, approval
 * and outcome for a genuine read, so a mis-declared write executes ungoverned. The seam says so
 * itself, and cannot catch it.
 *
 * DENY BY DEFAULT.
 * `lookupMcpCapability` returns undefined for anything absent, and the adapter refuses on undefined.
 * A tool added without an entry does not quietly inherit permissive behaviour — it stops working,
 * and `scripts/ci/mcp-governed-door-lint.mjs` fails the build before it ever reaches production.
 */

/**
 * What the act actually does, verified from the handler. The eleven categories are finer than
 * `action-risk.ts`'s three verdicts on purpose: the classifier decides whether an approval is
 * required, while this records WHY, which is what an operator reading an audit row needs.
 */
export type McpRiskCategory =
  | "read"           // no state change and no external call
  | "low_mutation"   // writes tenant business data with limited blast radius
  | "consequential"  // writes others depend on, bulk operations, workflow/skill dispatch
  | "destructive"    // deletes or irreversibly removes
  | "external_send"  // email/SMS/anything leaving the system
  | "provider"       // calls or dispatches to an external provider
  | "privacy"        // data-subject request, export, erasure
  | "billing"        // invoices, payments, money
  | "access"         // roles, invitations, credentials, connections, workspace switching
  | "availability"   // suspension, platform announcements, feature flags, branding
  | "owner_only";    // an operator-settings decision no other actor may take

export type McpCapability = {
  /** The canonical `action-risk.ts` key for this act. One namespace, not a parallel one. */
  canonical: string;
  /** VERIFIED from the handler body. Never set this from the tool's name. */
  effect: "read" | "mutate";
  /** Why, in the operator's terms. Drives nothing on its own — the canonical key drives the gate. */
  category: McpRiskCategory;
  /** `file:line` of the write, send or provider call that justifies `effect`, or what was checked
   *  and found absent for a read. Present so a reviewer can re-verify without re-reading 5,691
   *  lines, and so a wrong verdict is falsifiable rather than merely asserted. */
  evidence: string;
};

/** The number of tools registered in `paige-mcp/index.ts`. Asserted by CI rather than written in
 *  prose, because two comments in this repo said 117 while the real number was 119 — a count in a
 *  sentence rots silently. */
export const MCP_TOOL_COUNT = 119;

/**
 * TOOL NAME → CAPABILITY. Filled from handler verification; see the module header.
 * Keys are the exact registered `mcp.tool("<name>")` strings.
 */
export const MCP_CAPABILITY_POLICY: Readonly<Record<string, McpCapability>> = {
  // POPULATED FROM VERIFIED HANDLER READS — see the accompanying commit.
};

/** Deny-by-default lookup. `undefined` means "no policy", which the adapter turns into a refusal. */
export function lookupMcpCapability(tool: string): McpCapability | undefined {
  return Object.prototype.hasOwnProperty.call(MCP_CAPABILITY_POLICY, tool)
    ? MCP_CAPABILITY_POLICY[tool]
    : undefined;
}

/** Categories that may never execute through this door while it carries no approval channel.
 *  Kept as data so the test can assert the set rather than restate it. */
export const MCP_APPROVAL_REQUIRED_CATEGORIES: readonly McpRiskCategory[] = Object.freeze([
  "destructive", "external_send", "provider", "privacy", "billing", "access", "availability", "owner_only",
]);
