// Shared SSRF guard for any edge function that fetches a caller/tenant-supplied URL
// (outbound webhooks, connected-app endpoints, image fetches, …).
//
// String matching alone is bypassable (IPv4-mapped IPv6, DNS → internal, link-local),
// so we resolve the host and validate EVERY resolved IP numerically against
// private/loopback/link-local/ULA/carrier-grade-NAT/mapped ranges. IP literals are
// validated directly. Callers MUST also fetch with redirect:"manual" (or re-validate
// each hop) so a 3xx can't bounce to an internal target after this check passes.
//
// This is the same numeric guard paige-n8n's assertSafeUrl uses, lifted into _shared so
// new callers reuse one hardened implementation instead of forking it (§12/§13).

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

/**
 * Throws if `raw` is not an https:// URL that resolves ONLY to public addresses.
 * Use before fetching any tenant/caller-supplied destination. Pair with
 * redirect:"manual" on the fetch so a redirect can't defeat the check.
 */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("invalid_url"); }
  if (u.protocol !== "https:") throw new Error("url_must_be_https");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("url_host_not_allowed");
  }
  // IP literal → validate directly; hostname → resolve A + AAAA and validate all.
  if (ipv4ToInt(host) !== null || host.includes(":")) {
    if (ipUnsafe(host)) throw new Error("url_host_not_allowed");
    return;
  }
  const ips: string[] = [];
  for (const kind of ["A", "AAAA"] as const) {
    try { ips.push(...await Deno.resolveDns(host, kind)); } catch { /* no records of this kind */ }
  }
  if (ips.length === 0) throw new Error("url_host_unresolvable");
  for (const ip of ips) if (ipUnsafe(ip)) throw new Error("url_resolves_to_private_address");
}
