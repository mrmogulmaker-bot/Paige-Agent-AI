import { supabase } from "@/integrations/supabase/client";

/**
 * Utility to write client_memory records from platform events.
 * These fire-and-forget — errors are logged but don't disrupt the UI.
 */

export async function writeClientMemory(
  clientUserId: string,
  memoryType: 'report_upload' | 'milestone_completed' | 'dispute_generated' | 'funding_secured' | 'lender_researched' | 'session_summary' | 'coach_note',
  content: string,
  sourceSessionId?: string
) {
  try {
    const { error } = await supabase.from("client_memory").insert({
      client_user_id: clientUserId,
      memory_type: memoryType,
      content,
      source_session_id: sourceSessionId || null,
    } as any);
    
    if (error) {
      console.error("Failed to write client memory:", error);
    }
  } catch (err) {
    console.error("Client memory write error:", err);
  }
}

// Convenience helpers for specific event types

export function writeDisputeMemory(clientUserId: string, accountName: string, bureau: string, disputeBasis: string) {
  return writeClientMemory(
    clientUserId,
    'dispute_generated',
    `Dispute letter generated for ${accountName} on ${bureau}. Basis: ${disputeBasis}.`
  );
}

export function writeMilestoneMemory(clientUserId: string, milestoneName: string) {
  return writeClientMemory(
    clientUserId,
    'milestone_completed',
    `Milestone completed: ${milestoneName}.`
  );
}

export function writeFundingMemory(clientUserId: string, lenderName: string, amount: number, productType: string) {
  return writeClientMemory(
    clientUserId,
    'funding_secured',
    `Funding secured: $${amount.toLocaleString()} from ${lenderName} (${productType}).`
  );
}

export function writeLenderResearchMemory(clientUserId: string, searchCriteria: string, topMatches: string[]) {
  return writeClientMemory(
    clientUserId,
    'lender_researched',
    `Lender research completed. Criteria: ${searchCriteria}. Top matches: ${topMatches.slice(0, 3).join(', ')}.`
  );
}
