import type { SpineCapability } from '../contracts.ts';
export const CONTACT_IMPORT_LIST = {
 key: "contacts.import_list", domain: "contacts", owner: "solo-operations", humanSurface: "/solo/:account/clients/people",
 action: { classification: "read", executor: "public.list_contact_imports", chatTool: "contact_import_list", riskPolicyKey: "read_only", approvalAuthority: "none", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "contact-import-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const CONTACT_IMPORT_COMMIT = {
 key: "contacts.import_commit", domain: "contacts", owner: "solo-operations", humanSurface: "/solo/:account/clients/people",
 action: { classification: "mutate", executor: "public.commit_contact_import_batch", chatTool: "contact_import_commit", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "contact-import-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_LIST = {
 key: "orchestration.list", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "read", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_list", riskPolicyKey: "read_only", approvalAuthority: "none", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_ACTIVATE = {
 key: "orchestration.activate", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "mutate", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_activate", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_DELEGATE = {
 key: "orchestration.delegate", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "external_effect", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_delegate", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_CANCEL = {
 key: "orchestration.cancel", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "mutate", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_cancel", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_RETRY = {
 key: "orchestration.retry", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "external_effect", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_retry", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_ORCHESTRATOR_REVOKE = {
 key: "orchestration.revoke", domain: "orchestration", owner: "solo-operations", humanSurface: "/solo/:account/settings/integrations",
 action: { classification: "mutate", executor: "public.solo_orchestration_service", chatTool: "solo_orchestrator_revoke", riskPolicyKey: "high", approvalAuthority: "chat-canonical", idempotency: "Immutable selected batch or durable process/run key; uncertain effects reconcile without redispatch." },
 outcome: { kinds: ["verified","refused","pending","unknown"], projector: "solo-orchestration-tools", railVisibility: "Tenant workspace events persist source, actor and committed outcomes." },
 chatBinding: "LIVE", mindBinding: "PARTIAL", maturity: "PARTIAL", sharedPrimitiveChange: "SCR-SOLO-ORCHESTRATION",
} as const satisfies SpineCapability;
export const SOLO_OPERATION_CAPABILITIES = [CONTACT_IMPORT_LIST, CONTACT_IMPORT_COMMIT, SOLO_ORCHESTRATOR_LIST, SOLO_ORCHESTRATOR_ACTIVATE, SOLO_ORCHESTRATOR_DELEGATE, SOLO_ORCHESTRATOR_CANCEL, SOLO_ORCHESTRATOR_RETRY, SOLO_ORCHESTRATOR_REVOKE] as const;
