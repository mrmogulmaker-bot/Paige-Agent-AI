export const socialUnavailableHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/**
 * Social provider actions stay fail-closed until the canonical tenant, account,
 * approval, idempotency, provider readback, receipt, and reconciliation contracts
 * have all been implemented and proven.
 */
export function serveSocialUnavailable(): void {
  Deno.serve((req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: socialUnavailableHeaders });
    }

    return new Response(
      JSON.stringify({
        error: "social_capability_unavailable",
        message: "Social provider actions are not available yet.",
        attempted: false,
      }),
      { status: 503, headers: socialUnavailableHeaders },
    );
  });
}
