import type { SpineCapability } from "./contracts.ts";
import { PIPELINE_DEAL_STAGE_EVIDENCE } from "./domains/pipeline.ts";

export const PAIGE_SPINE_CAPABILITIES = [PIPELINE_DEAL_STAGE_EVIDENCE] as const;

const KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const SERVER_SYMBOL_PATTERN = /^public\.[a-z][a-z0-9_]*$/;
const MUTATING = new Set(["prepare", "mutate", "external_effect"]);

export function validateSpineRegistry(capabilities: readonly SpineCapability[]): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (seen.has(capability.key)) findings.push(`duplicate capability key: ${capability.key}`);
    seen.add(capability.key);
    if (!KEY_PATTERN.test(capability.key)) findings.push(`${capability.key}: capability key must be stable domain.capability snake case`);
    if (!capability.domain || !capability.owner || !capability.humanSurface) findings.push(`${capability.key}: domain, owner, and human surface are required`);
    if (capability.evidence) {
      if (!capability.evidence.signalKinds.length) findings.push(`${capability.key}: evidence requires at least one signal kind`);
      if (!SERVER_SYMBOL_PATTERN.test(capability.evidence.adapter)) findings.push(`${capability.key}: evidence adapter must be an exact public server symbol`);
      if (!capability.evidence.audience || !capability.evidence.freshness) findings.push(`${capability.key}: evidence audience and freshness are required`);
      if (capability.evidence.staleAfterDays <= 0 || capability.evidence.retentionDays < capability.evidence.staleAfterDays) findings.push(`${capability.key}: evidence retention must cover its stale window`);
    }
    if (capability.action) {
      if (!SERVER_SYMBOL_PATTERN.test(capability.action.executor)) findings.push(`${capability.key}: action executor must be an exact public server symbol`);
      if (MUTATING.has(capability.action.classification)) {
        if (capability.action.approvalAuthority !== "chat-canonical") findings.push(`${capability.key}: mutating actions require chat-canonical approval authority`);
        if (!capability.action.idempotency.trim()) findings.push(`${capability.key}: mutating actions require idempotency metadata`);
        if (!capability.action.riskPolicyKey.trim()) findings.push(`${capability.key}: mutating actions require a risk policy key`);
      }
    }
    if (capability.outcome) {
      if (!capability.outcome.kinds.length || !capability.outcome.projector) findings.push(`${capability.key}: outcomes require kinds and a safe projector`);
      if (!capability.outcome.railVisibility) findings.push(`${capability.key}: outcomes require Rail visibility metadata`);
    }
  }
  return findings;
}

export function getSpineCapability(key: string): SpineCapability | undefined {
  return PAIGE_SPINE_CAPABILITIES.find((capability) => capability.key === key);
}
