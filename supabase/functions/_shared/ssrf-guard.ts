// _shared/ssrf-guard.ts — reject server-side fetches aimed at PRIVATE / link-local / cloud-metadata
// targets (§13 "no SSRF holes"). Any edge function that fetches a CALLER-SUPPLIED URL server-side
// must run the URL through assertPublicHttpUrl() FIRST, so a tenant can't drive our infra into
// 169.254.169.254 (cloud metadata), 127.0.0.1, 10./172.16/192.168 (RFC1918), ::1, fc00::/7, etc.
//
// It guards BOTH the literal host (an attacker who puts an IP in the URL) AND the DNS resolution
// (DNS-rebind: a hostname that resolves to a private IP) — every resolved A/AAAA must be public.

const PRIVATE_V4: Array<[number, number, number]> = [
  // [firstOctet, secondOctetLow, secondOctetHigh] with a full-match on the first octet only when hi=-1
  [10, 0, 255],       // 10.0.0.0/8
  [127, 0, 255],      // loopback 127.0.0.0/8
  [169, 254, 254],    // link-local / metadata 169.254.0.0/16
  [192, 168, 168],    // 192.168.0.0/16
  [100, 64, 127],     // CGNAT 100.64.0.0/10
  [0, 0, 255],        // 0.0.0.0/8 ("this network")
];

function isPrivateV4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  for (const [first, lo, hi] of PRIVATE_V4) {
    if (a === first && b >= lo && b <= hi) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::1" || s === "::") return true;           // loopback / unspecified
  if (s.startsWith("fe80")) return true;                 // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4
  const mapped = s.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

const isPrivateIp = (ip: string): boolean => isPrivateV4(ip) || isPrivateV6(ip);

/**
 * Throws if `raw` is not a plain http(s) URL to a PUBLIC host. Resolves DNS and rejects if any
 * resolved address is private/link-local/loopback/metadata (DNS-rebind safe). Call before fetching a
 * caller-supplied URL. When DNS can't resolve (network policy) it FAILS CLOSED (throws) — a URL we
 * can't vet is not a URL we fetch.
 */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("ssrf-guard: not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("ssrf-guard: only http(s) is allowed");

  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("ssrf-guard: blocked internal host");
  }
  // Literal IP in the URL — check directly, no DNS.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) throw new Error("ssrf-guard: blocked private IP literal");
    return;
  }
  // Hostname — resolve and reject if ANY address is private (DNS-rebind protection).
  let addrs: string[] = [];
  try {
    const [v4, v6] = await Promise.allSettled([
      Deno.resolveDns(host, "A"),
      Deno.resolveDns(host, "AAAA"),
    ]);
    if (v4.status === "fulfilled") addrs = addrs.concat(v4.value);
    if (v6.status === "fulfilled") addrs = addrs.concat(v6.value);
  } catch {
    throw new Error("ssrf-guard: could not resolve host (fail-closed)");
  }
  if (addrs.length === 0) throw new Error("ssrf-guard: host did not resolve (fail-closed)");
  for (const ip of addrs) {
    if (isPrivateIp(ip)) throw new Error("ssrf-guard: host resolves to a private address");
  }
}
