/**
 * Billing Foundation C — the Solo Billing screen's PRESENTATION CONTRACT.
 *
 * One pure function decides which of the approved Billing states a workspace is in, from
 * server-owned inputs only. It is separated from the view for the same reason `settings-contract.ts`
 * is: a state machine that decides what a person is TOLD about money must be assertable directly,
 * not only through a render.
 *
 * THE RULE THIS FILE EXISTS TO HOLD (owner, 2026-09-02, R13 · 2026-09-03):
 *   A state is reachable ONLY from a record that proves it. There is no inference, no fallback,
 *   and no default. In particular:
 *     • "no subscription" / "Choose a plan" (`plan-none`) is reachable ONLY from a SUCCESSFUL
 *       entitlement read that returned `source: "none"`. A skipped, unsupported, absent or
 *       unavailable read can never produce it.
 *     • Promotional access is reachable ONLY from an explicit `promotional_grant` entitlement
 *       record. "No subscription found, therefore promotional" is forbidden (R13).
 *     • A trial is reachable ONLY from a real trial record on the entitlement.
 *     • Paid/subscribed is reachable ONLY from a real `paid_subscription` entitlement.
 *     • A price, a renewal date, an invoice or a payment method is rendered ONLY from the
 *       entitlement projection. It is NEVER derived from the plan CATALOGUE
 *       (`platform_subscription_plans`), which is a price list, not a statement that this
 *       workspace is charged anything.
 *
 * WHY `entitlement` IS `null` TODAY. The entitlement projection is Foundation B (packet §4.3 R11:
 * "built in Foundation B, consumed in Foundation C — the Solo UI never invents access state
 * locally"). Until it exists, this resolver is handed `null`, which is NOT "no plan" — it is
 * "the platform has no read that can answer this", and it resolves to `billing-unavailable` with
 * that exact reason. The shape below is R11's projection verbatim, so Foundation B feeds this
 * same resolver and the paid/trial/promotional branches light up with no rewrite.
 *
 * State ids are PORTED from the Gate-1 vocabulary (`docs/prototypes/platform-billing-gate1.html`,
 * packet §9.1), with three additions and four disclosed deviations — `plan-no-workspace`,
 * `portal-not-applicable` and `portal-unreadable` are new; `plan-beta` is collapsed into
 * `plan-current`; and three states drop an approved clause that offers an act nothing offers yet.
 * The full list is `docs/delivery/billing-foundation-c-design.md` §3a. Claiming this file was
 * ported wholesale would have been the easier sentence and the false one (§13). This file still
 * makes no visual decision (§00) — the additions are state-machine holes, not a redesign.
 */
import type { BillingAccountState, BillingScope } from "./data/useWorkspaceBillingAuthority";

/* ── The entitlement projection (Foundation B owns it; this is the shape C consumes) ────────── */

export type BillingEntitlementSource = "paid_subscription" | "beta_trial" | "promotional_grant" | "none";
export type BillingEntitlementStatus =
  | "active" | "trialing" | "past_due" | "cancel_scheduled" | "canceled" | "expired"
  | "not_applicable" | "unavailable";

export interface WorkspaceBillingEntitlement {
  source: BillingEntitlementSource;
  status: BillingEntitlementStatus;
  /** Tenant-visible label only. Operator rationale never crosses this seam (R10). */
  label: string | null;
  planName: string | null;
  /** Rendered only when the PROJECTION supplies it — never from the plan catalogue. */
  priceLabel: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  noExpiry: boolean;
  daysRemaining: number | null;
}

/* ── The approved state vocabulary ──────────────────────────────────────────────────────────── */

export type BillingPlanStateId =
  | "plan-loading"
  | "role-refusal"
  | "plan-error"
  | "plan-no-workspace"
  | "plan-subaccount"
  | "plan-unsupported"
  | "billing-unavailable"
  | "plan-none"
  | "plan-current"
  | "plan-trialing"
  | "plan-trial-ended"
  | "plan-promo"
  | "plan-cancel-scheduled"
  | "plan-canceled";

/**
 * WHY a `billing-unavailable` carries a reason. "Unavailable" with no cause is the failure mode
 * this whole slice exists to end: it reads, to the person, exactly like "you have nothing", which
 * is a claim about their account that nobody verified.
 */
export type BillingUnavailableReason =
  | "no_billing_account"
  | "billing_records_need_review"
  | "no_entitlement_source"
  | "entitlement_conflict"
  | "unsupported_status"
  /** The server reported a mapping state this screen does not model. Never a claim. */
  | "mapping_unknown";

export interface BillingPlanPresentation {
  state: BillingPlanStateId;
  heading: string;
  body: string;
  /** Label → value rows. Empty unless a record proves every value in it. */
  fields: ReadonlyArray<{ label: string; value: string }>;
  /** Extra sentence under the fields; "" when there is nothing true to add. */
  note: string;
  reason: BillingUnavailableReason | null;
  /** True only where the approved state offers a retry (a failed read). */
  canRetry: boolean;
}

export interface BillingPlanInput {
  loading: boolean;
  readFailed: boolean;
  scope: BillingScope;
  /**
   * R22: receive, view and manage are three permissions, enforced separately. `can_view_billing` is
   * Owner-only in Foundation A and the server publishes it as "a separate field on purpose". The
   * surface consumed only `can_manage_billing`, which is harmless while no plan data exists and
   * becomes a leak the moment Foundation B supplies a price and a renewal date to render.
   */
  canViewBilling: boolean;
  billingAccountState: BillingAccountState;
  /** `null` = no entitlement projection exists yet. NOT "no plan" (see file header). */
  entitlement: WorkspaceBillingEntitlement | null;
}

const NO_FIELDS: ReadonlyArray<{ label: string; value: string }> = [];

function unavailable(reason: BillingUnavailableReason, body: string): BillingPlanPresentation {
  return {
    state: "billing-unavailable",
    heading: "Billing is unavailable for this workspace right now",
    body,
    fields: NO_FIELDS,
    note: "",
    reason,
    canRetry: false,
  };
}

/** Only values the projection actually supplied become rows. A missing value is omitted, never guessed. */
function fieldsFrom(pairs: ReadonlyArray<[string, string | null]>): ReadonlyArray<{ label: string; value: string }> {
  return pairs
    .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].trim() !== "")
    .map(([label, value]) => ({ label, value }));
}

export function resolveBillingPlanPresentation(input: BillingPlanInput): BillingPlanPresentation {
  if (input.loading) {
    return { state: "plan-loading", heading: "Clearing and resolving this account…", body: "", fields: NO_FIELDS, note: "", reason: null, canRetry: false };
  }
  if (input.readFailed) {
    return {
      state: "plan-error",
      heading: "Couldn’t load this account",
      body: "The plan could not be read just now. Nothing about your plan has changed.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: true,
    };
  }
  if (input.scope === "none") {
    return {
      state: "plan-no-workspace",
      heading: "No workspace is selected",
      body: "There is no billing account to show until a workspace is open. Nothing about any workspace has changed.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }
  if (input.scope === "sub_account") {
    return {
      state: "plan-subaccount",
      heading: "Platform billing is not applicable to this workspace yet.",
      body:
        "This workspace is a sub-account. Platform billing is not inherited from the agency, and there is no " +
        "supported sub-account billing contract yet, so nothing is shown here — not because there is no plan, " +
        "but because this page cannot truthfully report one.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }
  if (input.scope === "top_level_solo" && !input.canViewBilling) {
    return {
      state: "role-refusal",
      heading: "Billing for this workspace is visible to its owner",
      body:
        "What this workspace pays the platform, and its invoices and payment method, are the owner's to see " +
        "and to change. Nothing about your own access is affected.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }
  if (input.scope === "agency" || input.scope === "enterprise") {
    return {
      state: "plan-unsupported",
      heading: "Platform billing is not available for this account type yet.",
      body:
        "Agency and Enterprise workspaces do not inherit a Solo plan, and no supported billing contract exists " +
        "for them yet. This page cannot truthfully report a plan, so it does not.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }

  // Mapping truth is checked BEFORE the entitlement: an ambiguous or absent mapping is a fact about
  // this workspace that a later entitlement read could not correct, and it is never "no plan".
  //
  // WRITTEN AS "ONLY `mapped` MAY PROCEED", not as a list of the bad cases. The list form fell
  // THROUGH for `not_applicable` at Solo scope — which `asState()` also produces for any value the
  // client does not recognise, so an unmodelled server state defaulted into "this workspace has a
  // billing account". A default that lands in a positive claim is the exact thing this file's
  // header forbids, so the shape now makes it unreachable rather than merely unlikely.
  if (input.billingAccountState !== "mapped") {
    if (input.billingAccountState === "ambiguous") {
      return unavailable(
        "billing_records_need_review",
        "This workspace’s billing records need a platform review before they can be reported. That is different " +
          "from having no plan: nothing about your access has changed. The platform has been notified; you do not " +
          "need to do anything.",
      );
    }
    if (input.billingAccountState === "absent") {
      return unavailable(
        "no_billing_account",
        "The platform could not find a billing account linked to this workspace. That is different from having no " +
          "plan: nothing about your access has changed, and nothing is being charged. The platform has been " +
          "notified; you do not need to do anything.",
      );
    }
    return unavailable(
      "mapping_unknown",
      "The platform reported this workspace’s billing setup in a way this page does not recognise, so it is not " +
        "described rather than described wrongly. Nothing about your access has changed and nothing is being " +
        "charged. The platform has been notified.",
    );
  }

  if (input.entitlement === null) {
    return unavailable(
      "no_entitlement_source",
      "This workspace has a billing account, but the platform has no read yet that can say what it entitles you " +
        "to. Rather than guess a plan, a price or a renewal date, this page shows nothing. Nothing about your " +
        "access has changed and nothing is being charged.",
    );
  }

  const e = input.entitlement;
  if (e.status === "unavailable") {
    return unavailable(
      "entitlement_conflict",
      "Two billing records for this workspace disagree about what is current, so neither is reported. That is " +
        "different from having no plan: nothing about your access has changed. The platform has been notified.",
    );
  }
  if (e.status === "not_applicable") {
    return {
      state: "plan-unsupported",
      heading: "Platform billing is not available for this account type yet.",
      body: "No supported billing contract exists for this workspace yet, so this page does not report one.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }

  if (e.source === "none") {
    return {
      state: "plan-none",
      heading: "Choose a plan",
      body:
        "This workspace has no active plan, trial, or promotional access (the platform checked and found none). " +
        "Your workspace and its data are preserved.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }

  if (e.source === "promotional_grant") {
    return {
      state: "plan-promo",
      heading: e.label?.trim() || "Promotional beta access",
      body: "You have full platform access during beta. No payment is due.",
      fields: fieldsFrom([
        ["Cost", "$0 — no payment method needed"],
        ["In force", e.noExpiry ? "Until the platform changes it — no end date set" : e.endsAt],
        ["Invoices", "None — this is not a paid subscription"],
        ["Converts automatically?", "No"],
      ]),
      note:
        "Granted by the platform. When this changes, or if a paid plan replaces it, this page will say so plainly " +
        "before anything else happens.",
      reason: null, canRetry: false,
    };
  }

  if (e.source === "beta_trial" || e.status === "trialing") {
    if (e.status === "expired" || e.status === "canceled") {
      return {
        state: "plan-trial-ended",
        heading: "Your beta trial has ended.",
        body:
          "Nothing was charged. Your workspace and everything in it are exactly as you left them. To keep using " +
          "the platform, choose a plan.",
        fields: NO_FIELDS, note: "", reason: null, canRetry: false,
      };
    }
    return {
      state: "plan-trialing",
      heading: e.label?.trim() || "Beta trial",
      body: "",
      fields: fieldsFrom([
        ["Access", e.label ?? e.planName],
        ["Days remaining", e.daysRemaining === null ? null : String(e.daysRemaining)],
        ["Cost", "$0 during the trial"],
        ["Trial ends", e.endsAt],
      ]),
      note:
        "Nothing is charged when the trial ends. This workspace then moves to “Choose a plan” unless a paid plan " +
        "or promotional access is already active. Your workspace and everything in it stay exactly as they are.",
      reason: null, canRetry: false,
    };
  }

  // paid_subscription from here down.
  if (e.status === "cancel_scheduled") {
    return {
      state: "plan-cancel-scheduled",
      heading: "This subscription is set to end.",
      body: "",
      fields: fieldsFrom([
        ["Plan", e.planName],
        ["Status", e.endsAt ? `Ends ${e.endsAt}` : "Ends at the close of the current period"],
        ["Price", e.priceLabel],
        ["Renews", "Will not renew"],
      ]),
      note: "Access continues until then; nothing further is charged.",
      reason: null, canRetry: false,
    };
  }
  if (e.status === "canceled" || e.status === "expired") {
    return {
      state: "plan-canceled",
      heading: e.endsAt ? `This workspace’s platform subscription ended on ${e.endsAt}.` : "This workspace’s platform subscription has ended.",
      body: "Nothing is being charged. Your workspace and its data are preserved. To resume, choose a plan.",
      fields: NO_FIELDS, note: "", reason: null, canRetry: false,
    };
  }
  if (e.status === "active") {
    return {
      state: "plan-current",
      heading: e.label?.trim() || e.planName?.trim() || "Your platform plan",
      body: "",
      fields: fieldsFrom([
        ["Plan", e.planName],
        ["Status", "Active"],
        ["Price", e.priceLabel],
        ["Renews", e.renewsAt],
      ]),
      note: "",
      reason: null, canRetry: false,
    };
  }

  // `past_due` (and anything a later projection adds) has no approved wording. Inventing one would
  // be a claim about this person's payment that nobody approved, so it is reported as unavailable
  // WITH its cause rather than dressed up as a state that was never designed.
  return unavailable(
    "unsupported_status",
    "This workspace’s billing state is one this page has not been given approved wording for, so it is not " +
      "described rather than described wrongly. Nothing about your access has changed. The platform has been " +
      "notified.",
  );
}

/* ── The manage-billing (provider portal) entry ─────────────────────────────────────────────── */

export type BillingPortalStateId = "portal-entry" | "portal-unavailable" | "portal-not-applicable" | "role-refusal";

export interface BillingPortalPresentation {
  state: BillingPortalStateId;
  heading: string;
  body: string;
  /** True only when pressing it could plausibly succeed; a refusal is still reported honestly. */
  canOpen: boolean;
}

/**
 * The portal entry is decided from the SAME authority read, never from a local guess. Where the
 * refusal is already provable on the client (wrong scope, not the owner, no mapping), it is stated
 * instead of offering a button that is certain to fail — and where it is not provable (the server's
 * feature flag), the button is offered and the server's refusal is shown verbatim.
 */
export function resolveBillingPortalPresentation(input: {
  scope: BillingScope;
  canManageBilling: boolean;
  billingAccountState: BillingAccountState;
}): BillingPortalPresentation {
  if (input.scope !== "top_level_solo") {
    return {
      state: "portal-not-applicable",
      heading: "Not applicable to this account type yet",
      body: "There is no supported platform billing account for this workspace, so there is nothing to open.",
      canOpen: false,
    };
  }
  if (!input.canManageBilling) {
    return {
      state: "role-refusal",
      heading: "Billing is managed by the workspace owner",
      body:
        "Invoices, the payment method and the plan are handled by the owner of this workspace. You can see that " +
        "this page exists; you cannot change billing from it.",
      canOpen: false,
    };
  }
  // Same shape as the plan resolver, and for the same reason: only a `mapped` workspace may be
  // offered an act against a billing account, so an unmodelled mapping state can never produce a
  // live money button.
  if (input.billingAccountState !== "mapped") {
    return {
      state: "portal-unavailable",
      heading: "Not available yet",
      // THREE arms, not two. The gate fails closed for any non-`mapped` state, but an `else` that
      // carried the `absent` wording still ASSERTED "this workspace has no billing account linked"
      // for a state nobody modelled — a positive claim, and one that contradicted the plan card a
      // few pixels above, which correctly said the setup was not recognised. Failing closed is not
      // the same as saying something true.
      body: input.billingAccountState === "ambiguous"
        ? "This workspace’s billing records need a platform review before the provider page can be opened. " +
          "Nothing about your access has changed."
        : input.billingAccountState === "absent"
          ? "Invoices and the payment method are held by the platform’s payment provider. This workspace has no " +
            "billing account linked to it yet, so there is nothing for the provider to open. Nothing about your " +
            "access has changed."
          : "The platform reported this workspace’s billing setup in a way this page does not recognise, so the " +
            "provider page is not offered. Nothing about your access has changed.",
      canOpen: false,
    };
  }
  return {
    state: "portal-entry",
    heading: "Invoices and payment method",
    body:
      "Invoices, receipts and the card on file are held by the platform’s payment provider. Opening them takes " +
      "you to a secure page for this workspace’s billing account and brings you back here.",
    canOpen: true,
  };
}
