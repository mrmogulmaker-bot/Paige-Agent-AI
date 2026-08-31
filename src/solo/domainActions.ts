/**
 * Sender-domain management — the outcome vocabulary.
 *
 * Pure and separate for the same reason `a2pPrepare` is: what a tenant is told
 * when a write fails is the part a test can hold a boundary on, and the raw
 * message must never reach them. `manage-tenant-domain` returns `{ error }` as a
 * bare string, and one of its arms returns a 502 whose error IS the upstream
 * provider's response body (`resend_422: {...}`) — printing that verbatim would
 * put a provider payload on a tenant's screen.
 *
 * So: map the KNOWN codes to copy owned here, and give everything else one
 * honest fallback that says what happened without quoting the provider.
 */

export type DomainOutcome = { code: string; title: string; body: string; recovery: string | null };

const OUTCOMES: Record<string, DomainOutcome> = {
  invalid_domain: {
    code: "invalid_domain",
    title: "That does not look like a domain",
    body: "It needs to be a bare domain name, like yourbusiness.com — not a web address and not an email address. Nothing was added.",
    recovery: "Check it and try again.",
  },
  forbidden: {
    code: "forbidden",
    title: "You do not have permission to change sending domains",
    body: "Managing a sending domain needs admin access on this account. Nothing was changed.",
    recovery: "An owner on this account can do it, or grant you access.",
  },
  unauthorized: {
    code: "unauthorized",
    title: "Your session has expired",
    body: "We could not verify your session, so nothing was changed.",
    recovery: "Sign in again, then try again.",
  },
  not_found: {
    code: "not_found",
    title: "That domain is no longer on this account",
    body: "It may have been removed already. Nothing was changed.",
    recovery: "Refresh the list to see what is there now.",
  },
  cross_tenant_forbidden: {
    code: "cross_tenant_forbidden",
    title: "That domain belongs to a different account",
    body: "Nothing was read and nothing was changed.",
    recovery: "Switch to the account that owns it.",
  },
  no_tenant: {
    code: "no_tenant",
    title: "We couldn’t identify your workspace",
    body: "Your session did not resolve to a business, so we did not act on any account. Nothing was changed.",
    recovery: "Sign out and back in, then try again.",
  },
  unknown_verb: {
    code: "unknown_verb",
    title: "That action isn’t supported",
    body: "Nothing was changed. This one is ours, not yours.",
    recovery: null,
  },
  /**
   * The 502 arm. Its message is the PROVIDER's body, so it is deliberately not
   * rendered — a tenant should not be reading a Resend error payload, and it can
   * carry request detail we have no business surfacing.
   */
  provider_error: {
    code: "provider_error",
    title: "The email provider refused that",
    body: "Nothing was changed on your account. This can happen if the domain is already registered somewhere else.",
    recovery: "Try again in a moment. If it keeps happening the domain may need to be released where it is registered now.",
  },
  unknown: {
    code: "unknown",
    title: "That didn’t go through",
    body: "Nothing was changed on your account.",
    recovery: "Try again in a moment.",
  },
};

/** Codes with owned copy — exported so a test can prove the set is covered. */
export const KNOWN_DOMAIN_CODES = Object.keys(OUTCOMES).filter((c) => c !== "unknown");

/**
 * Map an error string from `manage-tenant-domain` to tenant-facing copy.
 *
 * Anything shaped like the function's 502 arm — which prefixes the upstream
 * status, e.g. `resend_422: {...}` — is collapsed to `provider_error` so the
 * provider's own body never reaches a tenant. An unrecognised code keeps its
 * identity in `code` while rendering the neutral fallback, so it stays
 * reportable without being mistranslated.
 */
export function domainOutcomeFor(raw: string | null | undefined): DomainOutcome {
  const key = (raw ?? "").trim();
  if (!key) return OUTCOMES.unknown;
  const hit = OUTCOMES[key];
  if (hit) return hit;
  // The provider passthrough, in any of its shapes.
  if (/^resend_\d+/i.test(key) || key.startsWith("RESEND_API_KEY")) return OUTCOMES.provider_error;
  return { ...OUTCOMES.unknown, code: key };
}

/**
 * Is this a domain name we can even send?
 *
 * Mirrors the function's own `/^[a-z0-9.-]+\.[a-z]{2,}$/i` so an obviously bad
 * value is named at the field instead of costing a round trip — and so the two
 * cannot disagree about what is acceptable. The server still decides; this only
 * avoids asking it a question we already know the answer to.
 */
export function isSendableDomain(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  // Reject the two things people actually paste: a URL and an email address.
  if (v.includes("/") || v.includes("@") || v.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v);
}

/** What a tenant must publish before a domain can verify. */
export type DnsRecord = { type: string; name: string; value: string };

/**
 * Normalise the provider's DNS records into the three fields a human needs.
 *
 * The records come back as opaque provider objects whose key names vary
 * (`record`/`type`, `name`, `value`/`data`). Rendering them raw would put an
 * unlabelled provider blob in front of someone who has to retype it into their
 * registrar, which is the moment this flow either works or does not.
 */
export function readDnsRecords(raw: unknown): DnsRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DnsRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const type = typeof r.record === "string" ? r.record : typeof r.type === "string" ? r.type : null;
    const name = typeof r.name === "string" ? r.name : null;
    const value = typeof r.value === "string" ? r.value : typeof r.data === "string" ? r.data : null;
    // A record missing any of the three cannot be published, so it is dropped
    // rather than rendered as a blank row a person would try to copy.
    if (type && name && value) out.push({ type, name, value });
  }
  return out;
}


/**
 * May this caller change sending domains? Mirrors `manage-tenant-domain`.
 *
 * NOT the same gate as preparing a registration, and the difference matters.
 * `comms-a2p-draft` allows `is_platform_owner() OR admin OR coach`;
 * `manage-tenant-domain` allows `is_platform_owner() OR admin` and EXCLUDES
 * coach (index.ts:56-58). A coach who can legitimately prepare a registration
 * cannot manage a domain — so reusing the prepare permission here would have
 * shown them an enabled "Remove", let them read "this deletes it from your email
 * provider … it cannot be undone", let them confirm, and only then told them they
 * never had permission. On the one genuinely destructive control on this surface.
 *
 * The three states are the same as prepare's and for the same reason: while the
 * answer is unknown we claim nothing rather than flashing a denial at an admin.
 * `errored` is its own denial because "we could not determine this" is true and
 * "you lack access" might not be — an operator whose RPC call failed is not
 * someone without permission.
 */
export type DomainPermission =
  | { state: "pending" }
  | { state: "allowed" }
  | { state: "denied"; reason: string; recovery: string };

export function domainPermission(input: {
  loading: boolean;
  isAdmin: boolean;
  isPlatformOwner: boolean | null;
  ownerCheckFailed?: boolean;
}): DomainPermission {
  if (input.loading || (!input.isAdmin && input.isPlatformOwner === null && !input.ownerCheckFailed)) {
    return { state: "pending" };
  }
  if (input.isAdmin || input.isPlatformOwner === true) return { state: "allowed" };
  if (input.ownerCheckFailed) {
    return {
      state: "denied",
      reason: "We couldn’t confirm what you’re allowed to change here, so these controls stay off.",
      recovery: "Reload the page. If it keeps happening, an admin on this account can make the change.",
    };
  }
  return {
    state: "denied",
    reason: "You can see these, but not change them. Managing a sending domain needs admin access on this account.",
    recovery: "An admin on this account can change it, or grant you access.",
  };
}
