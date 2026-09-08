/** Geometry-only harness seam. It makes no provider, microphone, database, or external call. */
export async function startPaigeLiveConversation() {
  return {
    ok: false as const,
    sessionId: "00000000-0000-4000-8000-000000000001",
    availability: "PROOF OWED" as const,
    code: "privacy_not_approved",
    explanation: "Live audio stays off until retention, account access, and the Paige cost limit are verified. Nothing was recorded or sent.",
  };
}

export async function transitionPaigeLiveConversation() { return undefined; }
export type PaigeLiveEntryMode = "embedded" | "existing-popout" | "requested-popout";
