const BRAND_PREFIX = "Paige Agent AI:";
const COMPLIANCE_TAIL = "Reply HELP for help or STOP to opt out.";
const BRAND_HOSTS = new Set(["paigeagent.ai", "www.paigeagent.ai", "app.paigeagent.ai"]);

export interface PaigeAgentAiSmsInput {
  body: string;
  url: string;
}

/** Exact A2P sample framing for platform-to-registered-user SMS. */
export function formatPaigeAgentAiSms({ body, url }: PaigeAgentAiSmsInput): string {
  const cleanBody = body.trim().replace(/[.\s]+$/u, "");
  if (!cleanBody) throw new Error("body_required");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("brand_https_url_required");
  }
  if (parsed.protocol !== "https:" || !BRAND_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("brand_https_url_required");
  }
  if (/(^|\/)admin(?:\/|$)/i.test(parsed.pathname)) {
    throw new Error("legacy_admin_url_forbidden");
  }

  return `${BRAND_PREFIX} ${cleanBody}. ${parsed.toString().replace(/\/$/, "")}. ${COMPLIANCE_TAIL}`;
}
