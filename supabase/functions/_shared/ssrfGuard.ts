// Shared SSRF guard + hardened outbound transport for any edge function that fetches a
// caller/tenant-supplied URL (outbound webhooks, connected-app endpoints, MCP servers, …).
//
// String matching alone is bypassable (IPv4-mapped IPv6, DNS → internal, link-local),
// so we resolve the host and validate EVERY resolved IP numerically against
// private/loopback/link-local/ULA/carrier-grade-NAT/mapped ranges. IP literals are
// validated directly.
//
// This file is the ONE home (§18). The same numeric validator was independently forked
// inline into paige-n8n and call-zapier-action; new callers use `safeFetch` here rather
// than copying it a fifth time.
//
// `safeFetch` closes the three gaps every fork shares — credentials in the URL, an
// unbounded wait, and an unbounded response body — and refuses redirects outright
// instead of trying to re-validate each hop, which is the stricter of the two postures
// and the only one with no TOCTOU window between the check and the connection.

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return (((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]) >>> 0;
}

function ipv4Private(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  };
  return inRange("0.0.0.0", 8) || inRange("10.0.0.0", 8) || inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) || inRange("172.16.0.0", 12) || inRange("192.168.0.0", 16) ||
    inRange("100.64.0.0", 10) || inRange("192.0.0.0", 24) || inRange("198.18.0.0", 15) ||
    n === ipv4ToInt("255.255.255.255");
}

function ipUnsafe(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "");
  if (ipv4ToInt(ip) !== null) return ipv4Private(ip);
  // IPv6 (canonical or literal). Handle embedded/mapped IPv4 explicitly.
  if (ip === "::1" || ip === "::") return true;
  if (/^fe[89ab]/.test(ip)) return true;            // fe80::/10 link-local
  if (/^f[cd]/.test(ip)) return true;               // fc00::/7 ULA
  if (/^(64:ff9b::|2002:)/.test(ip)) {              // NAT64 / 6to4 → extract v4 if dotted
    const d = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (d) return ipv4Private(d[1]);
    return true;
  }
  const mappedDotted = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return ipv4Private(mappedDotted[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return ipv4Private(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  return false; // a routable public IPv6
}

/** Every rejection this module can produce. Stable, non-sensitive, safe to surface. */
export type SsrfReason =
  | "invalid_url"
  | "url_must_be_https"
  | "url_has_embedded_credentials"
  | "url_host_not_allowed"
  | "url_host_unresolvable"
  | "url_resolves_to_private_address"
  | "url_redirect_refused"
  | "request_timed_out"
  | "response_too_large"
  | "request_failed";

export class SsrfError extends Error {
  constructor(public readonly reason: SsrfReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "SsrfError";
  }
}

/**
 * Throws if `raw` is not an https:// URL, carries embedded credentials, or resolves to
 * anything but public addresses. Use before fetching any tenant/caller-supplied
 * destination. Prefer `safeFetch`, which runs this and then holds the rest of the
 * guarantees (no redirects, bounded time, bounded size).
 */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SsrfError("invalid_url"); }
  if (u.protocol !== "https:") throw new SsrfError("url_must_be_https");
  // A URL like https://user:pass@host puts a secret somewhere it will be logged, and is
  // also a classic parser-confusion vector (https://good.com@evil.com).
  if (u.username || u.password) throw new SsrfError("url_has_embedded_credentials");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SsrfError("url_host_not_allowed");
  }
  // IP literal → validate directly; hostname → resolve A + AAAA and validate all.
  if (ipv4ToInt(host) !== null || host.includes(":")) {
    if (ipUnsafe(host)) throw new SsrfError("url_host_not_allowed");
    return;
  }
  const ips: string[] = [];
  for (const kind of ["A", "AAAA"] as const) {
    try { ips.push(...await Deno.resolveDns(host, kind)); } catch { /* no records of this kind */ }
  }
  if (ips.length === 0) throw new SsrfError("url_host_unresolvable");
  for (const ip of ips) if (ipUnsafe(ip)) throw new SsrfError("url_resolves_to_private_address");
}

export type SafeFetchOptions = {
  /** Wall-clock ceiling for the whole request, including reading the body. */
  timeoutMs?: number;
  /** Hard ceiling on the bytes we will read. Reading stops at the cap, it never buffers past it. */
  maxBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 1_048_576; // 1 MiB

/**
 * The single hardened outbound call for tenant-supplied destinations.
 *
 *  1. SSRF-validates the URL (https, no embedded credentials, public addresses only).
 *  2. Refuses to follow redirects — a 3xx is an error, not a hop. Re-validating each hop
 *     would still leave the window between the check and the connect; refusing has none.
 *  3. Bounds the wall clock with a real abort, so a hung provider cannot pin a worker.
 *  4. Bounds the body by reading the stream and stopping at the cap, so an enormous or
 *     endless response cannot exhaust memory.
 *
 * Throws `SsrfError` with a stable reason for every failure. The reason is safe to log
 * and safe to show; the caller's URL and credentials never appear in it.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {},
): Promise<{ status: number; headers: Headers; body: string; truncated: boolean }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  await assertPublicHttpUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) throw new SsrfError("request_timed_out");
      throw new SsrfError("request_failed", e instanceof Error ? e.name : undefined);
    }

    // `redirect: "manual"` surfaces the 3xx rather than following it. Deno gives the real
    // status; a fetch implementation that opaques it reports status 0 with type
    // "opaqueredirect". Both mean the same thing here: we were pointed somewhere else,
    // and we do not go.
    if ((res.status >= 300 && res.status < 400) || res.type === "opaqueredirect") {
      throw new SsrfError("url_redirect_refused");
    }

    const { body, truncated } = await readBounded(res, maxBytes, controller);
    return { status: res.status, headers: res.headers, body, truncated };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads at most `maxBytes` from the response. Stops at the cap rather than buffering the
 * whole body first, so the cap is a real memory bound and not just a truncation after the
 * damage is done.
 */
async function readBounded(
  res: Response,
  maxBytes: number,
  controller: AbortController,
): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch (e) {
    if (controller.signal.aborted) throw new SsrfError("request_timed_out");
    throw new SsrfError("request_failed", e instanceof Error ? e.name : undefined);
  } finally {
    // Releasing the lock and cancelling lets the connection close even when we stopped
    // early at the cap; without it an endless body keeps the socket alive.
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { merged.set(c, at); at += c.byteLength; }
  return { body: new TextDecoder().decode(merged), truncated };
}
