import type { SpineEvidenceRpcClient, SpineEvidenceResult, SpineRequestScope } from "./resolveEvidence.ts";
import { resolveSpineEvidence } from "./resolveEvidence.ts";

const CAPABILITY_KEY = "pipeline.deal_stage_evidence";
const HEADER = "=== PAIGE SPINE — VERIFIED PIPELINE EVIDENCE ===";
const FOOTER = "=== END PAIGE SPINE EVIDENCE ===";
const UNAVAILABLE = [
  HEADER,
  "Status: UNAVAILABLE",
  "No verified Pipeline evidence is available for this turn. Do not infer activity, absence, or outcomes.",
  FOOTER,
].join("\n");

/**
 * Render only the fixed fields that the registry and resolver already validated.
 * Tenant ids, signal ids, subject references, raw Rail references, and source payloads
 * are intentionally excluded from model context.
 */
export function renderSpineEvidenceForChat(result: SpineEvidenceResult): string {
  if (result.status !== "available") return UNAVAILABLE;
  if (!result.signals.length) {
    return [
      HEADER,
      "Status: NO VERIFIED EVIDENCE",
      "The safe projection returned no matching Pipeline outcomes. Do not treat that as proof that no activity occurred.",
      FOOTER,
    ].join("\n");
  }

  const lines = result.signals.map((signal) => {
    const facts = Object.entries(signal.facts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("; ");
    return `- ${signal.occurred_at} | ${signal.availability} | ${signal.safe_summary} | ${facts}`;
  });

  return [
    HEADER,
    `Capability: ${CAPABILITY_KEY}`,
    "Status: AVAILABLE",
    ...lines,
    "Use only these listed facts. Do not infer the deal, stage, value, reason, person, or any unlisted outcome.",
    FOOTER,
  ].join("\n");
}

export async function loadSpineEvidenceForChat(
  client: SpineEvidenceRpcClient,
  clientRef: string,
  scope: SpineRequestScope,
): Promise<string> {
  const result = await resolveSpineEvidence(client, CAPABILITY_KEY, {
    clientRef,
    limit: 20,
    scope,
  });
  return renderSpineEvidenceForChat(result);
}
