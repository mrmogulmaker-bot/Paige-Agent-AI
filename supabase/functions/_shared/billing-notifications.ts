// Billing Foundation A — the billing-notice POLICY as a pure, tested module (owner ruling
// 2026-09-02, packet §4.5 R18–R26). This file decides; it never sends.
//
//   • Billing notices are transactional platform notices, never marketing (R18).
//   • The event catalogue is explicit and Stripe/webhook-backed (R24). It is mirrored by the CHECK
//     constraint on platform_billing_notification_log.event — the parity test keeps them equal.
//   • A workspace that carries no charge (Promotional, trial, none) never receives a payment notice;
//     its only relevant notices are about its entitlement, its expiry, or an access-impacting
//     status (R24, R26). An UNKNOWN entitlement receives nothing — never guess (R8/R13).
//   • Verified email only (R23): an unverified recipient is skipped and the skip is a ledger row.
//
// DELIVERY IS NOT WIRED IN FOUNDATION A. No sender exists in this module or anywhere else for these
// events; the mail-provider contract (retry, idempotency, provider result → ledger) is its own
// later release. A caller that wants to "send" today has nothing to call, by design.

export const BILLING_NOTICE_EVENTS = [
  "trial_ending",
  "plan_changed",
  "invoice_receipt",
  "payment_failed",
  "payment_action_required",
  "cancellation",
  "access_impacting_status",
  "promotional_entitlement_change",
] as const;
export type BillingNoticeEvent = (typeof BILLING_NOTICE_EVENTS)[number];

/** Ledger statuses (platform_billing_notification_log.status). A skip is recorded, not silent. */
export const BILLING_NOTICE_STATUSES = [
  "skipped_not_relevant",
  "skipped_unverified",
  "not_configured",
  "queued",
  "sent",
  "failed",
] as const;
export type BillingNoticeStatus = (typeof BILLING_NOTICE_STATUSES)[number];

/** The workspace's entitlement as the (Foundation B) truth projection will report it. */
export type EntitlementKind = "paid" | "trial" | "promotional" | "none" | "unknown";

const PAYMENT_EVENTS: ReadonlySet<BillingNoticeEvent> = new Set([
  "invoice_receipt",
  "payment_failed",
  "payment_action_required",
]);

/** Which events are RELEVANT to a workspace in each entitlement state (R24, R26). */
export const RELEVANT_EVENTS: Record<EntitlementKind, ReadonlySet<BillingNoticeEvent>> = {
  paid: new Set(BILLING_NOTICE_EVENTS.filter((e) => e !== "promotional_entitlement_change")),
  // A trial carries no charge: nothing about invoices or payments is relevant.
  trial: new Set(["trial_ending", "plan_changed", "cancellation", "access_impacting_status"]),
  // Promotional access is an explicit non-revenue entitlement: only notices ABOUT it (R26).
  promotional: new Set(["promotional_entitlement_change", "access_impacting_status"]),
  none: new Set(["access_impacting_status"]),
  unknown: new Set(),
};

export interface BillingNoticeInput {
  event: BillingNoticeEvent;
  entitlement: EntitlementKind;
  recipientVerified: boolean;
}

export type BillingNoticeDecision =
  | { deliver: true }
  | { deliver: false; status: "skipped_not_relevant" | "skipped_unverified"; reason: string };

/** Pure: should this event reach this recipient of this workspace? Never touches a provider. */
export function decideBillingNotice(input: BillingNoticeInput): BillingNoticeDecision {
  if (!RELEVANT_EVENTS[input.entitlement].has(input.event)) {
    return {
      deliver: false,
      status: "skipped_not_relevant",
      reason: input.entitlement === "unknown"
        ? "entitlement unknown — a notice is never sent on a guess"
        : `${input.event} is not relevant to a ${input.entitlement} workspace`,
    };
  }
  if (!input.recipientVerified) {
    return { deliver: false, status: "skipped_unverified", reason: "recipient email is not verified" };
  }
  return { deliver: true };
}

/** True for the events that only ever make sense when a charge exists. */
export function isPaymentEvent(event: BillingNoticeEvent): boolean {
  return PAYMENT_EVENTS.has(event);
}
