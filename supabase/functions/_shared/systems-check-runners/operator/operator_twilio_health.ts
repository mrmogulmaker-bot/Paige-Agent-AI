// operator/operator_twilio_health.ts — OPERATOR check #6 (runner_key: operator_twilio_health).
//
// SEAM (reuse ONLY this): _shared/twilio.ts masterCreds() + masterBasicAuthHeader() — the ONE home for
// the platform MASTER Twilio credentials (§18; the same creds that power tenant number provisioning +
// voice). This runner LIVE-PROBES the master account (an edge fn CAN fetch) to prove the creds are
// valid and the account is active — it never re-derives the auth pattern.
//
// VERDICT (§13 honest):
//   • No master creds configured → 'skip' (needs_config — a config gap, not a fabricated pass/fail).
//   • Account fetch 200 + status 'active' → 'pass'.
//   • Account fetch 401/403 (rejected creds) or account not active → 'fail'.
//   • Network/timeout/unexpected → 'error' (fail-loud §32, never a fabricated pass).

import type { CheckRunner } from "../../systems-check-runner.ts";
import { errorResult } from "../_kit.ts";
import { masterCreds, masterBasicAuthHeader } from "../../twilio.ts";

export const runnerKey = "operator_twilio_health";

const TIMEOUT_MS = 8000;

export const run: CheckRunner = async (_ctx, _row) => {
  try {
    const creds = masterCreds();
    const auth = masterBasicAuthHeader();
    if (!creds || !auth) {
      return {
        status: "skip",
        evidence: { needs_config: true, reason: "twilio_master_creds_not_configured" },
        interpretation: "Platform Twilio master credentials are not configured in edge secrets — cannot probe account health until they are set.",
      };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      return {
        status: "fail",
        evidence: { http_status: res.status, account_sid_tail: creds.accountSid.slice(-4) },
        interpretation: `Platform Twilio master credentials were rejected (HTTP ${res.status}) — the master account SID / API-Key trio is invalid or revoked. Platform SMS and voice cannot send until this is fixed.`,
      };
    }
    if (res.status !== 200) {
      return {
        status: "error",
        evidence: { error_class: "unexpected_status", http_status: res.status, runner_key: runnerKey },
        interpretation: `Twilio account probe returned an unexpected HTTP ${res.status}.`,
      };
    }

    const body = (await res.json().catch(() => ({}))) as { status?: string; friendly_name?: string };
    const accountStatus = typeof body.status === "string" ? body.status : "unknown";
    const active = accountStatus === "active";
    return {
      status: active ? "pass" : "fail",
      evidence: { http_status: 200, account_status: accountStatus, account_sid_tail: creds.accountSid.slice(-4) },
      interpretation: active
        ? "Platform Twilio master account is reachable and active — platform SMS and voice can send."
        : `Platform Twilio master account is reachable but its status is '${accountStatus}', not 'active' — sending may be suspended.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
