// Server-side PostHog capture helper.
// Failures are swallowed and logged — never block the parent request.

const HOST = Deno.env.get("POSTHOG_HOST") || "https://us.posthog.com";
const KEY = Deno.env.get("POSTHOG_API_KEY");

export async function capture(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!KEY) return;
  try {
    await fetch(`${HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "paige-edge", source: "edge_function" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.log("[posthog] capture_failed", String((e as Error).message));
  }
}
