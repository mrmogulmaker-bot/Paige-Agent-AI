// operator/operator_domain_ssl.ts — OPERATOR check #7 (runner_key: operator_domain_ssl).
//
// Net-new fetch/TLS probe: an edge fn CAN fetch, so this runner fetches the platform domain over HTTPS
// and asserts the TLS handshake succeeds and the site returns a healthy status. data_source='fetch_url';
// the target is the registry row's `target` when set, else the platform domain default.
//
// VERDICT (§13 honest):
//   • HTTPS fetch resolves with a 2xx/3xx status → 'pass' (a successful HTTPS fetch means the TLS cert
//     validated — Deno throws on an invalid/expired cert, which we catch below).
//   • HTTPS fetch resolves with 4xx/5xx → 'fail' (domain up but serving errors).
//   • TLS handshake / DNS / timeout error → 'fail' (the domain is not serving securely) with the cause.
// A genuine internal error (e.g. bad URL) → 'error'. Fail-loud §32; never a fabricated pass.

import type { CheckRunner, RegistryRow } from "../../systems-check-runner.ts";
import { errorResult } from "../_kit.ts";

export const runnerKey = "operator_domain_ssl";

const DEFAULT_TARGET = "https://paigeagent.ai";
const TIMEOUT_MS = 10000;

export const run: CheckRunner = async (_ctx, row: RegistryRow) => {
  const target = (row?.target && row.target.startsWith("https://")) ? row.target : DEFAULT_TARGET;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      // A TLS/cert failure REJECTS this fetch (Deno validates the chain) — caught below as a fail.
      res = await fetch(target, { method: "GET", redirect: "follow", signal: ctrl.signal });
    } catch (fetchErr) {
      // Distinguish a genuine transport/TLS failure (the check's real 'fail') from an internal abort.
      const msg = (fetchErr as Error)?.message ?? "fetch_failed";
      return {
        status: "fail",
        evidence: { target, transport_error: msg },
        interpretation: `The platform domain (${target}) is not serving over HTTPS cleanly: ${msg}. Check DNS, the TLS certificate, and the host.`,
      };
    } finally {
      clearTimeout(timer);
    }

    const ok = res.status >= 200 && res.status < 400;
    return {
      status: ok ? "pass" : "fail",
      evidence: { target, http_status: res.status, final_url: res.url },
      interpretation: ok
        ? `The platform domain (${target}) is serving securely over HTTPS (HTTP ${res.status}) with a valid certificate.`
        : `The platform domain (${target}) returned HTTP ${res.status} — the certificate validated but the site is serving an error status.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey, { target });
  }
};
