/**
 * Shared types for Paige document/conversation data extraction proposals.
 *
 * The edge function emits a `data: { extraction_proposal: ExtractionProposal }` SSE
 * event during the chat stream when it detects extractable structured fields.
 * The chat UI renders an inline ExtractionProposalCard that lets the client
 * confirm or deselect individual fields before they are written back through
 * the paige-write-back edge function.
 */

import type { ExtractionField, ExtractionProposal } from "@/components/chat/ExtractionProposalCard";

export type { ExtractionField, ExtractionProposal };

/**
 * Maps an ExtractionField back to a paige-write-back update payload entry.
 * `field.key` is already the canonical field_path (e.g. "foundation.ein").
 */
export function fieldToWriteBackUpdate(field: ExtractionField) {
  return {
    field_path: field.key,
    field_value: field.value,
  };
}
