// Pluggable per-tenant email provider layer (GHL-style).
//
// Every outbound email in the platform flows through the EmailProvider
// interface. The PLATFORM DEFAULT is Resend (Paige Agent AI's own account).
// Any tenant may later "bring their own" sending system — SMTP, Mailgun,
// Mailchimp/Mandrill, Postmark, etc. — by storing a provider config on their
// tenant row; buildProvider() resolves the right adapter.
//
// Doctrine §7/§200: nothing tenant-specific is hardcoded here. A tenant with no
// provider config falls back to the platform RESEND_API_KEY (Paige Agent AI as
// the default sender). New providers are added by implementing EmailProvider
// and registering a case in buildProvider() — no caller changes required.

export type OutboundEmail = {
  from: string; // "Display Name <local@domain>"
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type SendResult = {
  ok: boolean;
  provider: string;
  id?: string | null;
  error?: string | null;
};

export interface EmailProvider {
  readonly key: string;
  send(msg: OutboundEmail): Promise<SendResult>;
}

// Shape of a tenant's stored email-provider config. Persisted (per tenant) as
// jsonb; secrets are referenced by name and read from the function's secret
// store, never stored inline. Absent/`resend` → platform default.
export type TenantEmailProviderConfig = {
  provider?: "resend" | "smtp" | "mailgun" | "mailchimp" | "postmark" | string | null;
  // Optional per-tenant credential secret NAME (looked up in Deno env), so a
  // tenant can send from their OWN provider account. When null, the platform
  // default credential is used (Paige Agent AI = platform RESEND_API_KEY).
  api_key_secret?: string | null;
  // Provider-specific extras (SMTP host/port, Mailgun region/domain, etc.).
  options?: Record<string, unknown> | null;
};

// ---------- Providers ----------

class ResendProvider implements EmailProvider {
  readonly key = "resend";
  #apiKey: string;
  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }
  async send(msg: OutboundEmail): Promise<SendResult> {
    if (!this.#apiKey) return { ok: false, provider: this.key, error: "resend_api_key_missing" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: msg.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          ...(msg.text ? { text: msg.text } : {}),
          ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
          ...(msg.headers ? { headers: msg.headers } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, provider: this.key, error: `resend_${res.status}: ${JSON.stringify(body).slice(0, 300)}` };
      }
      return { ok: true, provider: this.key, id: (body as { id?: string })?.id ?? null };
    } catch (e) {
      return { ok: false, provider: this.key, error: (e as Error).message.slice(0, 300) };
    }
  }
}

// --- Future providers (bring-your-own). Stubbed intentionally so the wiring
// --- exists and adding one is a localized change. Each fails LOUD (never
// --- silently drops mail) so a misconfigured tenant is caught immediately.
class UnimplementedProvider implements EmailProvider {
  constructor(readonly key: string) {}
  send(): Promise<SendResult> {
    return Promise.resolve({ ok: false, provider: this.key, error: `provider_not_implemented:${this.key}` });
  }
}
// e.g. class SmtpProvider implements EmailProvider { ... }
//      class MailgunProvider implements EmailProvider { ... }
//      class MailchimpProvider implements EmailProvider { ... }  // Mandrill transactional

/**
 * Resolve the concrete provider for a tenant. Defaults to Resend on the
 * platform key (Paige Agent AI). A tenant that has stored its own provider +
 * credential secret name sends from its own account.
 */
export function buildProvider(config?: TenantEmailProviderConfig | null): EmailProvider {
  const platformResendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const provider = (config?.provider ?? "resend").toLowerCase();

  // Per-tenant credential override: read the named secret from the env store.
  const tenantKey = config?.api_key_secret ? (Deno.env.get(config.api_key_secret) ?? "") : "";

  switch (provider) {
    case "resend":
      return new ResendProvider(tenantKey || platformResendKey);
    case "smtp":
    case "mailgun":
    case "mailchimp":
    case "postmark":
      // Wiring point for bring-your-own providers. Implement the class above
      // and swap this line for `return new XProvider(config)`.
      return new UnimplementedProvider(provider);
    default:
      // Unknown provider string → fail safe to platform Resend.
      return new ResendProvider(platformResendKey);
  }
}
