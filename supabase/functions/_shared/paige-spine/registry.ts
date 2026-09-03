import { SPINE_ACTION_CLASSIFICATIONS, type SpineCapability } from "./contracts.ts";
import { PIPELINE_DEAL_STAGE_EVIDENCE } from "./domains/pipeline.ts";
import { BUSINESS_CONTEXT_READINESS } from "./domains/business_context.ts";

export const PAIGE_SPINE_CAPABILITIES = [PIPELINE_DEAL_STAGE_EVIDENCE, BUSINESS_CONTEXT_READINESS] as const;

const KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const SERVER_SYMBOL_PATTERN = /^public\.[a-z][a-z0-9_]*$/;
const CHAT_TOOL_PATTERN = /^[a-z][a-z0-9_]*$/;
const MUTATING = new Set(["mutate", "external_effect"]);

export function validateSpineRegistry(capabilities: readonly SpineCapability[]): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (seen.has(capability.key)) findings.push(`duplicate capability key: ${capability.key}`);
    seen.add(capability.key);
    if (!KEY_PATTERN.test(capability.key)) findings.push(`${capability.key}: capability key must be stable domain.capability snake case`);
    if (capability.key.split(".", 1)[0] !== capability.domain) findings.push(`${capability.key}: capability key namespace must match domain ${capability.domain}`);
    if (!capability.domain || !capability.owner || !capability.humanSurface) findings.push(`${capability.key}: domain, owner, and human surface are required`);
    if (capability.evidence) {
      const evidence = capability.evidence;
      if (!evidence.signalKinds.length) findings.push(`${capability.key}: evidence requires at least one signal kind`);
      if (!SERVER_SYMBOL_PATTERN.test(evidence.adapter)) findings.push(`${capability.key}: evidence adapter must be an exact public server symbol`);
      if (!evidence.audience || !evidence.freshness) findings.push(`${capability.key}: evidence audience and freshness are required`);
      if (evidence.staleAfterDays <= 0 || evidence.projectionWindowDays < evidence.staleAfterDays) findings.push(`${capability.key}: evidence projection window must cover its stale boundary`);
      if (!evidence.sourceSystem || !evidence.sourceActorTypes.length || !evidence.classification || !evidence.lifecycle || !evidence.safeSummary || !evidence.referencePrefix) findings.push(`${capability.key}: evidence requires exact safe value metadata`);
      const factEntries = Object.entries(evidence.factValues);
      if (!factEntries.length || factEntries.some(([, values]) => !values.length)) findings.push(`${capability.key}: evidence requires allowed values for every fact key`);
    }
    if (capability.action) {
      const action = capability.action;
      if (!SPINE_ACTION_CLASSIFICATIONS.includes(action.classification)) findings.push(`${capability.key}: unsupported action classification ${action.classification}`);
      if (!SERVER_SYMBOL_PATTERN.test(action.executor)) findings.push(`${capability.key}: action executor must be an exact public server symbol`);
      if (MUTATING.has(action.classification)) {
        if (action.approvalAuthority !== "chat-canonical") findings.push(`${capability.key}: mutating actions require chat-canonical approval authority`);
        if (capability.chatBinding !== "LIVE") findings.push(`${capability.key}: mutating actions require a LIVE Chat binding`);
        if (!action.chatTool || !CHAT_TOOL_PATTERN.test(action.chatTool)) findings.push(`${capability.key}: mutating actions require an exact Chat tool name`);
        if (!(["ordinary", "high"] as const).includes(action.riskPolicyKey as "ordinary" | "high")) findings.push(`${capability.key}: mutating actions require an ordinary or high canonical risk policy`);
        if (action.classification === "external_effect" && action.riskPolicyKey !== "high") findings.push(`${capability.key}: external effects require high canonical risk`);
        if (!action.idempotency.trim()) findings.push(`${capability.key}: mutating actions require idempotency metadata`);
      } else if (action.classification === "read") {
        if (action.riskPolicyKey !== "read_only") findings.push(`${capability.key}: read actions must use read_only risk policy`);
        if (action.approvalAuthority !== "none") findings.push(`${capability.key}: read actions cannot claim approval authority`);
      }
    }
    if (capability.outcome) {
      if (!capability.outcome.kinds.length || !capability.outcome.projector) findings.push(`${capability.key}: outcomes require kinds and a safe projector`);
      if (!capability.outcome.railVisibility) findings.push(`${capability.key}: outcomes require Rail visibility metadata`);
    }
  }
  return findings;
}

const REGISTRY_FINDINGS = validateSpineRegistry(PAIGE_SPINE_CAPABILITIES);
if (REGISTRY_FINDINGS.length) throw new Error(`Invalid PAIGE Spine registry: ${REGISTRY_FINDINGS.join("; ")}`);

export function getSpineCapability(key: string): SpineCapability | undefined {
  return PAIGE_SPINE_CAPABILITIES.find((capability) => capability.key === key);
}
