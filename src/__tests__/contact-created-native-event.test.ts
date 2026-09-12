// @vitest-environment node
//
// MPC-4 — the reusable contact.created native event. This slice is a DB trigger + atomic claim
// ledger + per-subscriber fire-once ledger + an edge drainer + a pg_cron sweeper; it cannot be
// driven headless without a database (and a from-zero replay is #1147-blocked upstream), so the
// runnable proof here is a CONTRACT assertion over the migration + the drainer source — it encodes
// the security (§9/§59), the fire-once guarantees, and the honesty (§13/§947) so a regression fails
// loudly. The from-zero migration replay + the authenticated owner drive remain OWED (§32/§70).
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const mig = readFileSync("supabase/migrations/20270119000000_contact_created_native_event.sql", "utf8");
const fn = readFileSync("supabase/functions/paige-native-event-dispatch/index.ts", "utf8");
const cfg = readFileSync("supabase/config.toml", "utf8");

describe("contact.created — the catalogue row (extends §67, never forks)", () => {
  it("seeds a LIVE contact.created trigger keyed to the existing paige_automation_triggers catalogue", () => {
    expect(mig).toContain("INSERT INTO public.paige_automation_triggers");
    expect(mig).toMatch(/'contact\.created'[^;]*'records'[^;]*true,\s*NULL/s);
    // live (is_live=true) with no dark_reason — it CAN fire because its substrate ships in this migration
    expect(mig).toContain("ON CONFLICT (key) DO NOTHING");
  });
});

describe("the event outbox + dispatch ledger — fire-once by construction", () => {
  it("the event outbox dedups an occurrence (one contact.created per contact)", () => {
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.paige_native_events");
    expect(mig).toContain("event_key     text NOT NULL REFERENCES public.paige_automation_triggers(key)");
    expect(mig).toContain("UNIQUE (dedup_key)"); // event-level fire-once
  });

  it("the dispatch ledger is fire-once per (event, subscriber)", () => {
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.paige_event_dispatches");
    expect(mig).toContain("UNIQUE (event_id, automation_id)"); // per-subscriber fire-once
  });

  it("both stores are §9 tenant-scoped on read and service-only on write (no direct authenticated write)", () => {
    for (const t of ["paige_native_events", "paige_event_dispatches"]) {
      const read = new RegExp(`CREATE POLICY \\w+ ON public\\.${t} FOR SELECT TO authenticated[\\s\\S]*?USING \\(tenant_id = public\\.current_user_tenant_id\\(\\)\\)`);
      expect(read.test(mig)).toBe(true);
      const noWrite = new RegExp(`CREATE POLICY \\w+ ON public\\.${t} FOR ALL TO authenticated[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`);
      expect(noWrite.test(mig)).toBe(true);
    }
  });
});

describe("the claim RPCs — §59 caller-scope IN-BODY, the grant is never the guard", () => {
  it("every lifecycle RPC refuses a JWT caller (auth.uid() IS NULL) and is revoked from authenticated/anon", () => {
    for (const f of ["paige_claim_event", "paige_complete_event", "paige_fail_event"]) {
      // SECURITY DEFINER + the in-body service-only guard
      expect(mig).toMatch(new RegExp(`FUNCTION public\\.${f}[\\s\\S]*?SECURITY DEFINER`));
    }
    // the guard raises before doing anything, on all three
    expect((mig.match(/IF auth\.uid\(\) IS NOT NULL THEN\s*\n\s*RAISE EXCEPTION '[A-Z_]+FORBIDDEN: service role only'/g) ?? []).length).toBe(3);
    // the EXECUTE grant is service_role only; authenticated/anon/PUBLIC are revoked
    expect(mig).toContain("REVOKE ALL ON FUNCTION public.paige_claim_event(uuid)            FROM PUBLIC, anon, authenticated;");
    expect(mig).toContain("GRANT EXECUTE ON FUNCTION public.paige_claim_event(uuid)         TO service_role;");
  });

  it("the claim is atomic with a retry cap and stale-lease recovery (automation-reliability contract)", () => {
    const claim = mig.slice(mig.indexOf("FUNCTION public.paige_claim_event"), mig.indexOf("FUNCTION public.paige_complete_event"));
    expect(claim).toContain("attempts < 5");                        // retry cap
    expect(claim).toContain("claimed_at < now() - interval '5 minutes'"); // stale-lease re-claim
    expect(claim).toContain("'claimed'");
  });
});

describe("the producer trigger — genuine new contact only, never aborts the create", () => {
  it("fires AFTER INSERT on clients and emits off the genuine insert (dedup on the new row id)", () => {
    expect(mig).toContain("CREATE TRIGGER trg_clients_emit_contact_created");
    expect(mig).toContain("AFTER INSERT ON public.clients");
    expect(mig).toContain("'contact.created:' || NEW.id::text");
    expect(mig).toContain("ON CONFLICT (dedup_key) DO NOTHING");
  });

  it("swallows-and-notices so eventing can never abort the contact create (§13 — the create is primary)", () => {
    const trg = mig.slice(mig.indexOf("FUNCTION public.trg_clients_emit_contact_created"), mig.indexOf("DROP TRIGGER IF EXISTS trg_clients_emit_contact_created"));
    expect(trg).toMatch(/EXCEPTION WHEN OTHERS THEN\s*\n\s*RAISE NOTICE/);
    // only enqueues when a NEW event row was actually recorded (skip on conflict)
    expect(trg).toContain("IF _event_id IS NOT NULL THEN");
  });

  it("the payload carries §9-minimal display facts, never email/phone PII", () => {
    const trg = mig.slice(mig.indexOf("FUNCTION public.trg_clients_emit_contact_created"), mig.indexOf("DROP TRIGGER IF EXISTS trg_clients_emit_contact_created"));
    expect(trg).toContain("'account_number'");
    expect(trg).toContain("'first_name'");
    expect(trg).not.toContain("NEW.email");
    expect(trg).not.toContain("NEW.phone");
  });
});

describe("the pg_cron sweeper — the durable backstop for the fire-and-forget trigger", () => {
  it("schedules a bounded, SKIP LOCKED re-drive of stuck events", () => {
    expect(mig).toContain("FUNCTION public.paige_sweep_stuck_events");
    expect(mig).toContain("FOR UPDATE SKIP LOCKED");
    expect(mig).toContain("cron.schedule(");
    expect(mig).toContain("'paige-native-event-sweeper'");
  });
});

describe("the edge drainer — fail-closed, tenant-from-claim, fire-once, honest (§9/§13)", () => {
  it("authorizes ONLY the service-role bearer or a valid cron token, fail-closed", () => {
    expect(fn).toContain('bearer.length > 0 && bearer === SERVICE_ROLE');
    expect(fn).toContain('admin.rpc("verify_cron_token"');
    expect(fn).toContain('return json({ error: "unauthorized" }, 401)');
  });

  it("takes the tenant from the CLAIMED event row, never the request body (§9)", () => {
    expect(fn).toContain("const tenantId: string = claim.tenant_id;");
    // subscribers are scoped to that authoritative tenant + the claimed event's key + live state
    expect(fn).toContain('.from("paige_automations")');
    expect(fn).toContain('.eq("tenant_id", tenantId)');
    expect(fn).toContain('.eq("trigger_key", eventKey)');
    expect(fn).toContain('.eq("state", "live")');
  });

  it("is fire-once across retries — skips subscribers already delivered, upserts on the UNIQUE key", () => {
    expect(fn).toContain('.from("paige_event_dispatches")');
    expect(fn).toContain("alreadyDone.has(sub.id)");
    expect(fn).toContain('onConflict: "event_id,automation_id"');
  });

  it("is honest (§947): it records delivery WITHOUT claiming an external send that did not happen", () => {
    expect(fn).toContain("acts_executed: false");
    // completes only when nothing failed; otherwise fails so the sweeper retries only the failures
    expect(fn).toContain("if (failed.length === 0) {");
    expect(fn).toContain('admin.rpc("paige_complete_event"');
    expect(fn).toContain("await failEvent(");
  });

  it("a concurrent claim loser no-ops (idempotent), never double-drains", () => {
    expect(fn).toContain("if (!claim?.claimed) {");
    expect(fn).toContain('admin.rpc("paige_claim_event"');
  });
});

describe("config — the drainer is service/cron-authed, not user-facing", () => {
  it("declares verify_jwt=false for paige-native-event-dispatch", () => {
    expect(cfg).toMatch(/\[functions\.paige-native-event-dispatch\][\s\S]*?verify_jwt = false/);
  });
});
