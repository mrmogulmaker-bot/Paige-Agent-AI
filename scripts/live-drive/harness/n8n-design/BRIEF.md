Goal: Let the Solo owner understand API visibility separately from Paige tool authority, and safely review either connection.
Human and feel: Workspace owner; clear state and recoverable changes without implied authority.
Entry and exit: Integrations n8n tile → overview drawer → API connection / Paige tools (MCP) → same tile.
System: Existing Solo shell, real --pg tokens, 432px integration drawer, existing control/typography styles.
Signature: Two independent state labels stay visible above the two tabs; neither connection stands in for the other.
Feedback: Existing 200ms drawer entry; tab/content changes immediate; reduced motion removes transitions; browser haptics none.
Rejecting: Combined connected status; live OAuth or authority grants while secure callback remains blocked.
Variants: Owner/viewer; two synthetic workspaces; 1536×770, 1366×768, 1024×768, 900×1000; light/dark.

| From | Trigger | Guard | To | Feedback/recovery |
| --- | --- | --- | --- | --- |
| Catalogue | n8n tile | none | Drawer overview + API tab | Close receives focus, modal trap; return focus to tile |
| API | Reconnect / Connect API | owner only | Masked local form | API purpose remains visible |
| Form | Save | valid HTTPS + local password | Pending | Fields cleared; review controls manually resolve success/failure |
| Pending | Simulated success/failure | same workspace + epoch | Connected/error | Only API state changes; retry possible |
| Dirty form | Other tab / close / Escape / backdrop | dirty draft | Discard confirmation | Keep editing restores input focus; discard follows requested exit |
| API | Disconnect | owner + stored config | Confirmation | Cancel or simulated removal; MCP unchanged |
| MCP | Open tab | any role | OAuth unavailable + saved-state summary | Exact blocked copy; no connect OAuth action or default bearer field |
| MCP stored | Remove saved connection | owner | Confirmation | Simulated local removal; API unchanged; no authority enabling |
| MCP future connected fixture | Review approved access | reviewer fixture only | Read-only summary | Local known counts/names; no grants or execution |
| Any | Workspace switch | reviewer action | Drawer closed, all drafts/pending reset | Delivery of old response is ignored |
| Any | Loading/error/unknown/empty fixture | reviewer action | Selected connection state | Other connection stays independently readable |
| Any | Approve/revise/reject | reviewer only | Local decision + notes | No external submission or persistence |

Boundary: Throwaway framework-native development host only. No real backend imports, credentials, tenant IDs, OAuth redirects, provider calls, messages, authority writes, or executions. All counts and dates are explicit deterministic reviewer fixtures, not authenticated evidence. Live OAuth consent/expiry/refresh are N/A: blocked external callback contract, not simulated as released functionality. Native haptics are N/A web-only. Portable writing fallback: exact owner copy and plain state descriptions.
