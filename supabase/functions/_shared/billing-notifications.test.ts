// deno test --allow-read supabase/functions/_shared/billing-notifications.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  BILLING_NOTICE_EVENTS,
  BILLING_NOTICE_STATUSES,
  decideBillingNotice,
  isPaymentEvent,
  RELEVANT_EVENTS,
} from "./billing-notifications.ts";

const MIGRATION = new URL(
  "../../migrations/20261045000000_platform_billing_accounts_foundation_a.sql",
  import.meta.url,
);

function checkList(sql: string, column: string): string[] {
  const m = sql.match(new RegExp(`${column}\\s+text[^,]*?CHECK \\(${column} IN \\(([^)]*)\\)`, "s"));
  if (!m) throw new Error(`no CHECK list for ${column}`);
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
}

Deno.test("event catalogue equals the ledger's CHECK constraint (parity, R24)", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  const ledger = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.platform_billing_notification_log"));
  assertEquals(checkList(ledger, "event").sort(), [...BILLING_NOTICE_EVENTS].sort());
  assertEquals(checkList(ledger, "status").sort(), [...BILLING_NOTICE_STATUSES].sort());
});

Deno.test("a promotional workspace never receives a payment notice (R26)", () => {
  for (const event of BILLING_NOTICE_EVENTS) {
    const d = decideBillingNotice({ event, entitlement: "promotional", recipientVerified: true });
    if (event === "promotional_entitlement_change" || event === "access_impacting_status") {
      assertEquals(d, { deliver: true });
    } else {
      assertEquals(d.deliver, false);
      assertEquals((d as { status: string }).status, "skipped_not_relevant");
    }
  }
});

Deno.test("a trial carries no charge: invoice/payment events are not relevant; trial_ending is", () => {
  assertEquals(decideBillingNotice({ event: "trial_ending", entitlement: "trial", recipientVerified: true }), { deliver: true });
  for (const event of ["invoice_receipt", "payment_failed", "payment_action_required"] as const) {
    assert(isPaymentEvent(event));
    assertEquals(decideBillingNotice({ event, entitlement: "trial", recipientVerified: true }).deliver, false);
  }
});

Deno.test("a paid workspace receives every event except the promotional one", () => {
  for (const event of BILLING_NOTICE_EVENTS) {
    const d = decideBillingNotice({ event, entitlement: "paid", recipientVerified: true });
    assertEquals(d.deliver, event !== "promotional_entitlement_change");
  }
});

Deno.test("an unknown entitlement receives nothing — never a notice on a guess (R8/R13)", () => {
  assertEquals(RELEVANT_EVENTS.unknown.size, 0);
  for (const event of BILLING_NOTICE_EVENTS) {
    assertEquals(decideBillingNotice({ event, entitlement: "unknown", recipientVerified: true }).deliver, false);
  }
});

Deno.test("an unverified recipient is skipped with its own ledger status (R23)", () => {
  assertEquals(
    decideBillingNotice({ event: "payment_failed", entitlement: "paid", recipientVerified: false }),
    { deliver: false, status: "skipped_unverified", reason: "recipient email is not verified" },
  );
});

Deno.test("no sender exists in this module (delivery is not wired in Foundation A)", async () => {
  const src = await Deno.readTextFile(new URL("./billing-notifications.ts", import.meta.url));
  assertEquals(/fetch\(|resend|smtp|sendEmail|deliver\(/i.test(src.replace(/\/\/.*$/gm, "")), false);
});
