import type { SpineFact, SpineSignal } from "./contracts.ts";
import type { SpineEvidenceRpcClient, SpineEvidenceResult, SpineRequestScope } from "./resolveEvidence.ts";
import { resolveSpineEvidence } from "./resolveEvidence.ts";

/**
 * The Pipeline domain's MIND projection.
 *
 * SCOPE — read this before reusing anything here. This is deliberately NOT a
 * platform-wide Mind primitive, and it must not become one by accident. It is one
 * domain's bounded, attributable view of ONE registered read-only capability
 * (`pipeline.deal_stage_evidence`). Generalising this shape so a second domain
 * depends on it changes Mind-wide retrieval semantics, which is a shared primitive:
 * that needs a Spine Change Request, not an import.
 *
 * WHAT IT ADDS over the raw resolver result: a citation, an explicit freshness word,
 * and the read-only boundary — the three things a person needs in order to trust,
 * date, and act on a claim. It adds no new read, no new authority, and no store. The
 * resolver, the registry and the safe adapter are unchanged; this is another consumer
 * of them, exactly as Chat is.
 *
 * WHAT IT MAY NEVER CARRY: raw Rail title, summary or payload; a stage name; a deal
 * id; a client, user, contact or tenant identifier; a provider body; a secret; or any
 * reasoning trace. `tenant_id` and `signal_id` reach this module because the resolver
 * validates scope with them — they stop here and are never projected. The one
 * identifier that crosses is `source_record_ref`, an opaque `rail:<uuid>` handle that
 * names the record and dereferences only back through the same guarded lens.
 */

export const PIPELINE_MIND_CAPABILITY = "pipeline.deal_stage_evidence";

/** Approved by owner ruling as the safe, display-visible citation for this slice. */
const CITATION = /^rail:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MindFreshness = "available" | "stale";

/** One attributable thing the record proves. Every field here is safe to show a person. */
export type PipelineMindRecord = {
  readonly occurredAt: string;
  readonly recordedBy: string;
  readonly freshness: MindFreshness;
  readonly statement: string;
  readonly citation: string;
  readonly facts: Readonly<Record<string, SpineFact>>;
};

export type PipelineMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly PipelineMindRecord[] }
  | { readonly status: "no_evidence"; readonly capability: string }
  | { readonly status: "unavailable"; readonly capability: string };

/**
 * Build one record from an already-validated signal.
 *
 * The resolver has proven the whole envelope before this runs. This re-checks the two
 * properties the projection itself depends on — that the citation is the exact opaque
 * shape we promised a person, and that it still agrees with the outcome reference —
 * because a citation is the one field here that a reader will act on as identity. A
 * defence-in-depth check that can only ever refuse is worth its cost; it can never
 * widen what crosses.
 */
function project(signal: SpineSignal): PipelineMindRecord | null {
  if (!CITATION.test(signal.source_record_ref)) return null;
  if (signal.source_record_ref !== signal.outcome_ref) return null;
  if (signal.availability !== "available" && signal.availability !== "stale") return null;
  return {
    occurredAt: signal.occurred_at,
    recordedBy: signal.source_actor_type,
    freshness: signal.availability,
    statement: signal.safe_summary,
    citation: signal.source_record_ref,
    facts: signal.facts,
  };
}

/** Fail closed: one unprojectable signal makes the whole turn unavailable, never a partial answer. */
export function projectPipelineMindEvidence(result: SpineEvidenceResult): PipelineMindEvidence {
  if (result.status !== "available") return { status: "unavailable", capability: PIPELINE_MIND_CAPABILITY };
  if (!result.signals.length) return { status: "no_evidence", capability: PIPELINE_MIND_CAPABILITY };
  const records = result.signals.map(project);
  if (records.some((record) => record === null)) return { status: "unavailable", capability: PIPELINE_MIND_CAPABILITY };
  return { status: "recorded", capability: PIPELINE_MIND_CAPABILITY, records: records as PipelineMindRecord[] };
}

export async function loadPipelineMindEvidence(
  client: SpineEvidenceRpcClient,
  clientRef: string,
  scope: SpineRequestScope,
  limit = 20,
): Promise<PipelineMindEvidence> {
  return projectPipelineMindEvidence(await resolveSpineEvidence(client, PIPELINE_MIND_CAPABILITY, { clientRef, limit, scope }));
}

const HEADER = "=== PAIGE SPINE — VERIFIED PIPELINE EVIDENCE ===";
const FOOTER = "=== END PAIGE SPINE EVIDENCE ===";

/**
 * The read-only boundary, stated to the model on every turn that carries evidence.
 * It is not the enforcement — no Pipeline write tool is registered, so there is
 * nothing to call — but a model that has been told the boundary explains it to the
 * person instead of failing at it silently.
 */
const READ_ONLY =
  "This evidence is read-only. You cannot move, create, archive, or otherwise change a Pipeline deal from it, and no tool exists here to do so. Offer to help plan the move instead, and say the change itself happens in Pipeline.";

const UNAVAILABLE = [
  HEADER,
  "Status: UNAVAILABLE",
  "No verified Pipeline evidence is available for this turn. Do not infer activity, absence, or outcomes.",
  FOOTER,
].join("\n");

const NO_EVIDENCE = [
  HEADER,
  "Status: NO VERIFIED EVIDENCE",
  "The safe projection returned no matching Pipeline outcomes. Do not treat that as proof that no activity occurred.",
  FOOTER,
].join("\n");

/**
 * Render the Mind result for the model.
 *
 * The UNAVAILABLE and NO VERIFIED EVIDENCE blocks are byte-identical to the ones the
 * Chat handler writes inline for the no-reference case, so a person never sees two
 * different refusals for the same absence.
 */
export function renderPipelineMindEvidence(evidence: PipelineMindEvidence): string {
  if (evidence.status === "unavailable") return UNAVAILABLE;
  if (evidence.status === "no_evidence") return NO_EVIDENCE;

  const lines = evidence.records.map((record) => {
    const facts = Object.entries(record.facts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("; ");
    return `- ${record.occurredAt} | ${record.freshness} | ${record.statement} | ${facts} | source: ${record.citation}`;
  });

  return [
    HEADER,
    `Capability: ${evidence.capability}`,
    "Status: AVAILABLE",
    ...lines,
    "Use only these listed facts, and name the source reference on a line when you state what it proves. Do not infer the deal, stage, value, reason, person, or any unlisted outcome.",
    "A line marked stale is past its freshness boundary: report it as old, never as current. Anything absent here is unknown, not disproven.",
    READ_ONLY,
    FOOTER,
  ].join("\n");
}
