import type { SpineEvidenceRpcClient, SpineEvidenceResult, SpineRequestScope } from "./resolveEvidence.ts";
import { loadPipelineMindEvidence, projectPipelineMindEvidence, renderPipelineMindEvidence } from "./mindEvidence.ts";

/**
 * Chat's adapter onto the Pipeline domain's Mind projection.
 *
 * This file used to render the resolver's signals directly. It now renders the Mind
 * result instead, so Chat and Mind cannot drift into two accounts of the same record —
 * there is one projection and one wording, and Chat is a caller of it (§18).
 *
 * The exported names and signatures are unchanged, so `paige-ai-chat/index.ts` needs no
 * edit: the handler's call site, its caller-scoped client, its abort-backed scope check
 * and its buffered final-scope gate all behave exactly as before.
 *
 * WHAT CHANGED, and why it needed an owner ruling: the rendered block now names the
 * opaque `rail:` source reference, which the previous contract deliberately withheld
 * from model context. Owner-approved Spine Change Request, 2026-09-02 — a citation the
 * person can see is what separates "PAIGE says so" from "the record says so". The
 * forbidden fields are unchanged and still never cross: raw title, summary, payload,
 * stage name, deal id, tenant, client, contact or user identifier, provider body,
 * secret, or reasoning trace.
 */

/** Render only the fields the registry, the resolver and the Mind projection have all validated. */
export function renderSpineEvidenceForChat(result: SpineEvidenceResult): string {
  return renderPipelineMindEvidence(projectPipelineMindEvidence(result));
}

export async function loadSpineEvidenceForChat(
  client: SpineEvidenceRpcClient,
  clientRef: string,
  scope: SpineRequestScope,
): Promise<string> {
  return renderPipelineMindEvidence(await loadPipelineMindEvidence(client, clientRef, scope, 20));
}
