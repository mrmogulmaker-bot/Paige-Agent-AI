# Solo n8n validation feedback and proposed Spine summary

Owner outcome: saving or reconnecting automatically validates the exact saved configuration; the same flow shows a truthful result without a required manual refresh. Base: bd32fd629079e59257fdf939b4ae250e2de9e005. Branch: codex/solo-n8n-validation-feedback. Existing28 open PR heads match the preceding collision inventory; no Solo n8n hook/view collision. Shared master-reference entry only; other work preserved.

## Bounded implementation

The existing server save action already persists then validates, with credential revision and attempt/expiry fences. This follow-up changes only Solo presentation/state and tests. Pending checks hide prior count and timestamps. Ambiguous results show unavailable status, never old green or a definitive not-connected claim. A reopened server check polls only readiness, bounded to16 reads at2-second intervals; workspace switches cancel that polling. The tile and drawer share one tenant-scoped API hook. Authorized configured API Refresh status starts a validation; an already-running check or viewer refresh only reads readiness. MCP refresh remains read-only and OAuth remains BLOCKED / Proof Owed.

The combined save request says Saving and checking this connection until its response; it cannot truthfully claim the replacement was already saved before the server acknowledges it. A source-backed running check says Checking this saved connection. Save requires no separate Refresh action.

## Proposal only: Integration-to-Spine evidence

No Spine, Mind, or Paige chat wiring or emission is implemented or authorized by this proposal. A future server-side, caller/tenant-bound read projection may expose only:

| Field | Source/rule |
| --- | --- |
| connection_type | n8n_api_visibility; never MCP tool authority |
| connection_state | Safe API readiness health; unavailable on missing/invalid evidence |
| workflow_count | Nonnegative complete discovery count only while connected; otherwise null. Zero is a valid proven result. |
| last_successful_check | Safe last_success_at; null when proof is absent or invalidated by replacement |
| freshness | Checked time and age when valid; unknown otherwise. No invented stale threshold. |
| action_needed | Closed safe values: connect, wait_for_check, retry_check, reconnect, sign_in, contact_workspace_admin, or none |

Projection must use get_tenant_n8n_api_readiness under the authenticated caller's server-resolved active workspace. Before any future implementation, separately review canonical tenant/actor binding, evidence schema, all consumers, and freshness policy. Never trust a URL account number, browser-supplied workspace, or a service-role bypass as owner evidence. Reads must not trigger provider calls, execute workflows, authorize tools, or modify connections.

Exclude instance address, label, key suffix, credentials, tokens, headers, provider payloads/errors, workflow names/definitions/content/executions, and credential revisions from the downstream summary. API workflow count is discovery visibility, never approved MCP tool count. A future separate MCP summary must retain OAuth unavailable/blocked and only source-proven approved counts; API success must not alter it.

Suggested grounded response when verified: The n8n API connection is connected, with zero workflows available as of the last successful check. This does not authorize Paige tools. When unverified: The API configuration is saved, but health is not verified for this configuration. Check or reconnect it. Unknown stays unknown. No current production success is implied by these examples.

Verification and release evidence are recorded separately; authenticated owner/provider acceptance remains distinct from synthetic component and database proof.
