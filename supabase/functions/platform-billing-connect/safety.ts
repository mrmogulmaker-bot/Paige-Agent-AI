// Closed classifications only: no messages, IDs, raw request bodies or stacks.
export function classifySetupFailure(error: unknown): {
  error: "provider_configuration" | "provider_unavailable";
  classification: string; retryable: boolean; status: number;
} {
  const e = (error && typeof error === "object" ? error : {}) as { type?: unknown; code?: unknown; statusCode?: unknown; param?: unknown };
  if (e.type === "StripeAuthenticationError" || e.type === "StripePermissionError") {
    return { error: "provider_configuration", classification: "provider_credentials_or_permissions", retryable: false, status: 503 };
  }
  if (e.type === "StripeInvalidRequestError") {
    const classification = e.code === "resource_missing" ? "provider_resource_or_mode_mismatch"
      : e.param === "currency" ? "setup_currency_required"
      : e.param === "success_url" || e.param === "cancel_url" ? "setup_return_url_invalid"
      : "provider_request_configuration";
    return { error: "provider_configuration", classification, retryable: false, status: 503 };
  }
  return { error: "provider_unavailable", classification: e.type === "StripeRateLimitError" || e.statusCode === 429
    ? "provider_rate_limited" : e.type === "StripeConnectionError" ? "provider_network" : "provider_unavailable",
    retryable: true, status: 503 };
}
export function setupRequestMatches(body: unknown, tenantId: string): body is { expected_tenant_id: string; return_state: string } {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return value.expected_tenant_id === tenantId && typeof value.return_state === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.return_state);
}
export function hostedSetupUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password; }
  catch { return false; }
}

// Preserve browser storage origin without allowing an arbitrary return destination.
export function setupReturnUrl(canonical: string | null, origin: string | null): string | null {
  if (!canonical) return null;
  const allowed = new Set(["https://paigeagent.ai", "https://app.paigeagent.ai", "https://paige-agent-ai.vercel.app"]);
  if (!origin || !allowed.has(origin)) return null;
  try { const path = new URL(canonical); return origin + path.pathname; } catch { return null; }
}
