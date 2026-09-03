/**
 * Static contract for the invitation-lifecycle migration, its webhook, and its CI wiring.
 *
 * WHAT THIS CLASS OF TEST IS FOR, and what it is NOT. It reads the shipped SQL and TypeScript as
 * text. It proves the guards were WRITTEN; it cannot prove they are ENFORCED — that is the pgTAP
 * file's job, which replays every migration from zero in CI. Both are reported separately and
 * neither is authenticated runtime proof.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261105000000_an_invitation_says_what_happened_to_it.sql";
const ORDERING = "supabase/migrations/20261107000000_the_headline_is_the_furthest_the_email_got.sql";
const WEBHOOK = "supabase/functions/handle-resend-webhook/index.ts";
const SENDER = "supabase/functions/send-portal-invite/index.ts";
const INVITES = "supabase/functions/solo-team-invitations/index.ts";
const WORKFLOW = ".github/workflows/paige-spine-contract.yml";

const read = (p: string) => readFileSync(p, "utf8");
/** Comments are documentation, not behaviour. Every assertion below runs on executable text only. */
const code = (p: string) => read(p).split("\n").filter((l) => !l.trim().startsWith("--") && !l.trim().startsWith("//")).join("\n");

describe("the shared constraint is widened without losing a value", () => {
  const sql = code(MIGRATION);

  it("keeps every status the table already accepted", () => {
    // The one moment a DROP/ADD of a CHECK can lose data legality. Verified against the original
    // definition in 20260318203215_email_infra.sql and against the live constraint on production.
    for (const status of ["pending", "sent", "suppressed", "failed", "bounced", "complained", "dlq"]) {
      expect(sql, `pre-existing status ${status} must survive the widening`).toContain(`'${status}'`);
    }
  });

  it("adds exactly the four the provider can report", () => {
    for (const status of ["delivered", "delivery_delayed", "opened", "clicked"]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("does not widen the browser's reach into the shared table", () => {
    // email_send_log carries every tenant's recipients. This migration must not grant a browser
    // role anything: the delivery join happens inside a SECURITY DEFINER function instead.
    expect(sql).not.toMatch(/GRANT[^;]*\bON\s+public\.email_send_log\b[^;]*\b(anon|authenticated)\b/i);
  });
});

describe("archiving is not deleting", () => {
  const sql = code(MIGRATION);

  it("marks a column rather than removing the row", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS archived_at/);
    // The whole point. A revoked invitation is evidence access was withdrawn.
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.tenant_invite_tokens/i);
  });

  it("refuses to hide a live invitation", () => {
    expect(sql).toContain("that invitation is still live; revoke it before clearing it");
    expect(sql).toMatch(/uses = 0 AND .*revoked_at IS NULL AND .*expires_at > now\(\)/);
  });

  it("reuses the one authority resolver instead of re-deriving who may act", () => {
    // A second implementation of "may this actor act in this workspace" is a second thing to get
    // wrong; the last one that existed on this seam sent a token toward a workspace nobody named.
    expect(sql).toContain("public.solo_team_invite_authority(_actor, _expected_tenant_id)");
  });

  it("locks the row before deciding, so two clears cannot race", () => {
    expect(sql).toMatch(/FROM public\.tenant_invite_tokens[\s\S]{0,200}FOR UPDATE/);
  });

  it("is not callable by a browser role", () => {
    // It takes an actor parameter. A browser caller could name somebody else.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.archive_solo_team_invite\(uuid, uuid, uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.archive_solo_team_invite\(uuid, uuid, uuid\) TO service_role/);
  });

  it("hides archived invitations from the roster read", () => {
    expect(sql).toMatch(/ti\.archived_at IS NULL/);
  });
});

describe("the webhook is authenticated by its signature", () => {
  const ts = code(WEBHOOK);

  it("refuses every event when the secret is unset, rather than accepting for now", () => {
    // This endpoint writes to a table the product reports from. Accepting unverified events would
    // let a stranger tell an owner their invitation had been opened.
    expect(ts).toMatch(/if \(!WEBHOOK_SECRET\)/);
    expect(ts).toMatch(/503/);
  });

  it("rejects an unsigned request before writing anything", () => {
    expect(ts).toMatch(/if \(!id \|\| !timestamp \|\| !signature\) return json\([^)]*401/);
  });

  it("bounds the replay window to five minutes", () => {
    // Without a bound, a captured correctly-signed request stays valid for ever. The assertion
    // pins the WHOLE expression: mutation showed `/5 \* 60 \* 1000/` still matches
    // `5 * 60 * 1000 * 100000`, which is a bound of about a year and is not a bound at all.
    expect(ts).toMatch(/Math\.abs\(Date\.now\(\) - sentAt\) > 5 \* 60 \* 1000\)/);
  });

  it("compares signatures in constant time", () => {
    // Asserting the helper merely EXISTS is not enough — mutation proved it: replacing the
    // comparison with a string === left the function defined, unused, and the test green. The
    // assertion has to name the comparison site, because that is what leaks a signature byte by byte.
    expect(ts).toMatch(/if \(timingSafeEqual\(mac, b64ToBytes\(value\)\)\) return true;/);
    expect(ts).not.toMatch(/String\(mac\)\s*===/);
  });

  it("derives tenancy from OUR record, never from the inbound payload", () => {
    // §9. Reading tenant_id from the webhook body would let the payload choose the tenant.
    expect(ts).toMatch(/tenant_id: origin\.tenant_id/);
    expect(ts).not.toMatch(/tenant_id: event\./);
  });

  it("ignores an event for a message the platform has no record of sending", () => {
    expect(ts).toContain("unknown message_id");
  });

  it("appends rather than updates, so the timeline survives", () => {
    expect(ts).toMatch(/\.insert\(/);
    expect(ts).not.toMatch(/email_send_log"\)[\s\S]{0,80}\.update\(/);
  });

  it("answers non-2xx when it fails to record, so the provider retries", () => {
    expect(ts).toMatch(/could not record event[\s\S]{0,20}500/);
  });

  it("is registered as a public function, because the provider carries no bearer token", () => {
    expect(read("supabase/config.toml")).toMatch(/\[functions\.handle-resend-webhook\][\s\S]{0,200}verify_jwt = false/);
  });
});

describe("the sender stops throwing away the only handle a delivery event has", () => {
  const ts = code(SENDER);

  it("reads the provider's response body for the message id", () => {
    // The defect in one line: it returned `emailed: res.ok` and never parsed the body.
    expect(ts).toMatch(/await res\.json\(\)/);
    expect(ts).toMatch(/messageId/);
  });

  it("records the send against the invitation and the tenant", () => {
    expect(ts).toMatch(/from\("email_send_log"\)/);
    expect(ts).toMatch(/invite_id:/);
    expect(ts).toMatch(/tenant_id:/);
  });

  it("records the two outcomes where no email was attempted at all", () => {
    // Otherwise "no provider configured" is indistinguishable from "provider rejected it".
    expect(ts).toContain("no_provider_configured");
    expect(ts).toContain("transport");
  });

  it("never lets a logging failure break a send that already left", () => {
    // Still true — the try/catch survives. But it no longer SWALLOWS the failure; it logs it.
    // Scoped to logSend's own body, not just any try/catch in the file (there are several,
    // including the request-body parse at the top which is a different single-line catch).
    const logSend = ts.slice(ts.indexOf("const logSend"), ts.indexOf("if (!RESEND_KEY)"));
    expect(logSend).toMatch(/try \{[\s\S]*catch \(e\)/);
  });

  it("does not just catch — it checks the RETURNED error, because insert() does not throw", () => {
    // The gap Codex found reviewing #857's own correction (§39, a review catching a review's own
    // documentation claim): supabase-js resolves an insert failure as `{ error }`, it does not
    // reject. A bare try/catch around the await alone would never see that class of failure.
    const logSend = ts.slice(ts.indexOf("const logSend"), ts.indexOf("if (!RESEND_KEY)"));
    expect(logSend).toMatch(/const \{ error \} = await admin\.from\("email_send_log"\)\.insert/);
    expect(logSend).toMatch(/if \(error\) console\.error/);
  });

  it("logs a THROWN failure too, not just a returned one", () => {
    const logSend = ts.slice(ts.indexOf("const logSend"), ts.indexOf("if (!RESEND_KEY)"));
    expect(logSend).toMatch(/catch \(e\) \{[\s\S]{0,120}console\.error/);
  });
});

describe("the new refusals reach the operator", () => {
  it("allowlists both sentences the archive function raises", () => {
    // This seam replaces any sentence it did not author with a generic line. An unlisted raise
    // would hide "revoke it before clearing it" — the one instruction that resolves the refusal.
    const ts = read(INVITES);
    expect(ts).toContain('"that invitation is not on this workspace"');
    expect(ts).toContain('"that invitation is still live; revoke it before clearing it"');
  });

  it("returns before the send block, because archiving emails nobody", () => {
    const ts = code(INVITES);
    expect(ts).toMatch(/action === "archive"[\s\S]{0,400}return json\(\{ ok: true, state: "archived" \}\)/);
  });
});

describe("the proof actually runs", () => {
  it("is wired into the database-contract job", () => {
    // A registered check that never runs proves nothing — the canary that reported
    // `canary_never_run` 342 times into an empty room is the standing lesson here.
    const wf = read(WORKFLOW);
    const line = "supabase test db supabase/tests/solo_team_invite_lifecycle.sql";
    expect(wf).toContain(line);
    // And it is a real step, not a commented-out one.
    const active = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(active).toContain(line);
  });
});

/**
 * The five corrections from the independent review of the MERGED #850 diff (§39).
 *
 * They landed after the merge because that PR was marked ready and merged in the same beat, so the
 * peer-gate had no window. Recorded as tests rather than as a note, because a lesson that only
 * lives in prose gets skipped the next time.
 */
describe("a retried event does not walk the headline backwards", () => {
  const sql = code(ORDERING);

  it("orders the delivery headline by lifecycle rank FIRST, not by insert time", () => {
    expect(sql).toContain("ORDER BY public.email_delivery_rank(l.status) DESC, l.created_at DESC");
  });

  it("and the old clause, which a provider retry could beat, is gone", () => {
    // The defect exactly: newest INSERT wins, so a retried `delivered` outranks a real `opened`.
    expect(sql).not.toContain("ORDER BY l.created_at DESC, public.email_delivery_rank(l.status) DESC");
  });

  it("changes nothing else in the function it re-declares", () => {
    // Guards the transcription. Everything but the one ORDER BY must be byte-identical to the
    // definition 20261105000000 shipped, so no clause can be silently dropped while fixing a sort.
    const grab = (t: string) => {
      const start = t.indexOf("CREATE OR REPLACE FUNCTION public.get_solo_team_workspace");
      return t.slice(start, t.indexOf("$function$;", start) + "$function$;".length);
    };
    const strip = (t: string) =>
      grab(t).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
        .replace("ORDER BY l.created_at DESC, public.email_delivery_rank(l.status) DESC", "SORT")
        .replace("ORDER BY public.email_delivery_rank(l.status) DESC, l.created_at DESC", "SORT");
    expect(strip(read(ORDERING))).toBe(strip(read(MIGRATION)));
  });
});

describe("the webhook survives the two ways it was going to fail in production", () => {
  const ts = code(WEBHOOK);

  it("retries when the origin lookup ERRORS, instead of acknowledging the event as unknown", () => {
    // supabase-js returns { data: null, error } — it does not throw. Reading only `data` made a
    // transient failure look identical to "we never sent this", and the 200 that followed told
    // Resend never to retry. The event was then lost for ever.
    expect(ts).toMatch(/data: origin, error: originError/);
    const guard = ts.slice(ts.indexOf("originError"));
    expect(guard).toMatch(/if \(originError\)[\s\S]{0,400}500\)/);
    // And the error branch must come BEFORE the absent-row branch, or it is unreachable.
    expect(ts.indexOf("if (originError)")).toBeLessThan(ts.indexOf('ignored: "unknown message_id"'));
  });

  it("treats the duplicate `sent` row as already-recorded rather than retrying it for ever", () => {
    // `idx_email_send_log_message_sent_unique` is UNIQUE on message_id WHERE status='sent'. The
    // sender already writes that row, so an inbound `email.sent` ALWAYS violates it. Answering 500
    // meant every such event failed permanently and Resend retried it without end — triggered by
    // the single act of subscribing to `email.*`.
    expect(ts).toMatch(/error\.code === "23505"/);
    // BOUNDED to the 23505 branch body. An unbounded slice to end-of-file also caught the
    // function's final `return json({ ok: true, recorded: status })`, so the assertion passed no
    // matter what this branch returned — mutation proved it could not fail.
    const start = ts.indexOf('error.code === "23505"');
    const dup = ts.slice(start, ts.indexOf("console.error", start));
    expect(dup).toMatch(/ok: true/);
    expect(dup).not.toMatch(/\b500\b/);
    // The 23505 branch must precede the generic 500, or the 500 swallows it first.
    expect(ts.indexOf('error.code === "23505"')).toBeLessThan(ts.indexOf('"could not record event"'));
  });
});

describe("the pgTAP plan matches the assertions it claims", () => {
  it("sums the documented breakdown and compares it to plan(N)", () => {
    // A miscounted plan is a CI cycle burned for nothing, and this file has already cost one:
    // the `unnest` loops generate eleven assertions from two statements, so no naive count of
    // SELECT lines can check it. What CAN be checked is that the arithmetic the file documents
    // actually adds up to the number it plans — which is the step that was skipped last time.
    const sql = readFileSync("supabase/tests/solo_team_invite_lifecycle.sql", "utf8");
    const planned = Number(/SELECT plan\((\d+)\);/.exec(sql)?.[1]);
    expect(planned).toBeGreaterThan(0);

    const header = sql.slice(0, sql.indexOf("SELECT plan("));
    const breakdown = /--\s*(\d+)\s*=([\s\S]*?)\.\s*$/m.exec(
      header.split("\n").filter((l) => l.startsWith("--")).join("\n"),
    );
    expect(breakdown, "the plan must document how it is composed").not.toBeNull();
    expect(Number(breakdown![1])).toBe(planned);

    const parts = breakdown![2].replace(/--/g, " ").match(/\d+/g)!.map(Number);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(planned);
  });
});
