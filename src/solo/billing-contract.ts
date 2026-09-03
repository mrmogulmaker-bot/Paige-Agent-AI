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
 *     • A price, a renewal date or a payment method is rendered ONLY from the
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
import type { WorkspaceBillingStatus } from "./data/useWorkspaceBillingStatus";

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
        "What this workspace pays the platform, and the payment method it is charged on, are the owner's to see " +
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
        ["Payment method", "None needed — this is not a paid subscription"],
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
        "The payment method and the plan are handled by the owner of this workspace. You can see that this page " +
        "exists; you cannot change billing from it.",
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
          ? "The payment method is held by the platform’s payment provider. This workspace has no billing account " +
            "linked to it yet, so there is nothing for the provider to open. Nothing about your access has changed."
          : "The platform reported this workspace’s billing setup in a way this page does not recognise, so the " +
            "provider page is not offered. Nothing about your access has changed.",
      canOpen: false,
    };
  }
  return {
    state: "portal-entry",
    heading: "Payment method",
    body:
      "The card the platform charges for this workspace is held by the payment provider. Opening it takes you to " +
      "a secure page for this workspace’s billing account and brings you back here.",
    canOpen: true,
  };
}

/* ── AI usage (owner ruling 2026-09-03) ─────────────────────────────────────────────────────── */

/**
 * The usage card's presentation contract. Same discipline as the plan card: one pure function,
 * server-owned inputs only, and every state reachable only from a record that proves it.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO, all owner-ruled:
 *
 *  1. No COST. Not per-workspace spend, not an estimate, not the $4.88 figure from
 *     `paige_llm_trace` — 632 of its 697 calls carry no cost at all, so that number is a floor of
 *     unknown distance from the truth, and putting a floor on a Billing screen is putting a wrong
 *     number on a Billing screen. Cost attribution is an internal operator-observability backlog
 *     item, not a tenant-facing one.
 *  2. No PREDICTED OVERAGE and no projection. There is no overage to predict: the allowance is
 *     visibility only, exhausting it changes nothing, and a "you will run out on the 14th" line
 *     would imply a consequence that does not exist.
 *  3. No conversion into "actions", "messages" or any other invented unit. The meter records
 *     tokens. Credits are tokens ÷ the plan's own stored ratio, and that ratio travels with the
 *     read so this file never hardcodes 1,000. Any other unit would be a number we made up (D5:
 *     the unit must be one the meter actually records).
 *
 * ON PROMOTIONAL WORKSPACES. Every current workspace is promotional during beta. The card says so
 * in those words and does NOT dress the reading up as a paid-plan entitlement — the allowance is
 * shown as the figure being tracked against, not as something purchased. That distinction is the
 * whole reason the revenue class is read from its own record rather than inferred.
 */
export type AiUsageStateId =
  | "usage-loading"
  | "usage-error"
  | "usage-not-applicable"
  | "usage-owner-only"
  | "usage-no-workspace"
  /** A real total, with a real period, and a plan allowance to measure it against. */
  | "usage-tracked"
  /** A real total and a real period, but the plan defines no allowance to compare it to. */
  | "usage-no-allowance";

export interface AiUsagePresentation {
  state: AiUsageStateId;
  heading: string;
  body: string;
  fields: ReadonlyArray<{ label: string; value: string }>;
  note: string;
  canRetry: boolean;
}

export interface AiUsageInput {
  loading: boolean;
  readFailed: boolean;
  usageState: "ok" | "not_applicable" | "no_workspace" | "owner_only";
  revenueClass: string | null;
  includedAiTokensMonth: number | null;
  aiCreditTokenRatio: number | null;
  periodSource: "subscription" | "calendar_month" | null;
  periodStart: string | null;
  periodEnd: string | null;
  tokensUsed: number | null;
  /** Injected so the formatter is deterministic under test rather than locale-of-the-runner. */
  formatDate?: (iso: string) => string;
}

const NO_USAGE_FIELDS: ReadonlyArray<{ label: string; value: string }> = [];

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Credits are floored, never rounded. 4,999,500 tokens used against a 5,000 credit allowance must
 * not read as "5,000 credits used" while 500 tokens of it remain — a rounded-up figure would be
 * the only number on the card that overstates, and it would overstate in the direction that
 * alarms. Remaining is clamped at zero for the same reason in reverse: a negative credit count is
 * not a thing a person can act on, and this card carries no overage concept to explain it.
 */
export function creditsFrom(tokens: number, ratio: number): number {
  return ratio > 0 ? Math.floor(tokens / ratio) : 0;
}

function defaultFormatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function resolveAiUsagePresentation(input: AiUsageInput): AiUsagePresentation {
  const fmt = input.formatDate ?? defaultFormatDate;

  if (input.loading) {
    return { state: "usage-loading", heading: "Clearing and resolving this account…", body: "", fields: NO_USAGE_FIELDS, note: "", canRetry: false };
  }
  if (input.readFailed) {
    return {
      state: "usage-error",
      heading: "Couldn’t read this workspace’s AI usage",
      body: "The usage total could not be read just now. Nothing about your access or your workspace has changed.",
      fields: NO_USAGE_FIELDS,
      note: "",
      canRetry: true,
    };
  }
  if (input.usageState === "no_workspace") {
    return {
      state: "usage-no-workspace",
      heading: "No workspace is selected",
      body: "There is no workspace selected, so there is no AI usage to show.",
      fields: NO_USAGE_FIELDS,
      note: "",
      canRetry: false,
    };
  }
  if (input.usageState === "not_applicable") {
    return {
      state: "usage-not-applicable",
      heading: "Not applicable to this account type",
      body:
        "AI usage for a sub-account is not reported here yet. This is not a statement that nothing was used — " +
        "how sub-account usage rolls up to the parent account has not been decided, so nothing is claimed either way.",
      fields: NO_USAGE_FIELDS,
      note: "",
      canRetry: false,
    };
  }
  if (input.usageState === "owner_only") {
    return {
      state: "usage-owner-only",
      heading: "Usage is visible to the workspace owner",
      body:
        "AI usage for this workspace is shown to its owner. Your access here has not changed, and no total is " +
        "shown rather than a zero, which would be a claim about the account.",
      fields: NO_USAGE_FIELDS,
      note: "",
      canRetry: false,
    };
  }

  // From here the read SUCCEEDED, so a total exists — including a legitimate zero.
  const used = input.tokensUsed ?? 0;
  const periodLabel =
    input.periodStart && input.periodEnd
      ? `${fmt(input.periodStart)} – ${fmt(input.periodEnd)}`
      : null;
  // The period is NAMED, never implied. A calendar month is not a billing period, and calling it one
  // is the same fabrication Foundation C removed from the plan card.
  //
  // This sentence lives in the NOTE, not in a field. It was a field first, and the rendered frame
  // showed it clipped to "This calendar month (this workspace has no …" — the `ss-field` primitive
  // is built for short values and truncates. Every assertion still passed, because the text was in
  // the DOM; it just could not be read. A disclosure a person cannot finish reading is not a
  // disclosure, and the fix is to stop putting a sentence in a value slot, not to restyle a shared
  // primitive (§00 — the presentation of that primitive is not this file's call).
  const periodSourceSentence =
    input.periodSource === "subscription"
      ? "This is your subscription’s current billing period."
      : input.periodSource === "calendar_month"
        ? "This is the calendar month — this workspace has no provider billing period."
        : null;
  const promotional = input.revenueClass === "promotional";
  const heading = promotional ? "Promotional AI usage tracking" : "AI usage";

  const allowance = input.includedAiTokensMonth;
  const ratio = input.aiCreditTokenRatio;

  if (allowance === null || ratio === null || ratio <= 0) {
    return {
      state: "usage-no-allowance",
      heading,
      body: promotional
        ? "This workspace is on promotional access during the beta. Its AI usage is recorded and shown here; " +
          "its plan does not define an included monthly amount, so there is nothing to measure it against."
        : "This workspace’s AI usage is recorded and shown here. Its plan does not define an included monthly " +
          "amount, so there is nothing to measure it against.",
      fields: fieldsFrom([
        ["Used this period", `${formatCount(used)} tokens`],
        ["Period", periodLabel],
      ]),
      note: [periodSourceSentence, "Nothing is charged for this usage, and nothing stops working."]
        .filter(Boolean).join(" "),
      canRetry: false,
    };
  }

  const usedCredits = creditsFrom(used, ratio);
  const allowanceCredits = creditsFrom(allowance, ratio);
  const remainingTokens = Math.max(0, allowance - used);
  const remainingCredits = creditsFrom(remainingTokens, ratio);

  return {
    state: "usage-tracked",
    heading,
    body: promotional
      ? "This workspace is on promotional access during the beta, and its AI usage is being tracked against the " +
        "amount included with its plan. Nothing is charged for it, nothing stops working when the amount is " +
        "used up, and this figure is shown so you can see what you are using."
      : "This workspace’s AI usage is tracked against the amount included with its plan. Nothing here charges " +
        "you and nothing stops working when the amount is used up.",
    fields: fieldsFrom([
      ["Included each month", `${formatCount(allowanceCredits)} AI credits (${formatCount(allowance)} tokens)`],
      ["Used this period", `${formatCount(usedCredits)} AI credits (${formatCount(used)} tokens)`],
      ["Remaining", `${formatCount(remainingCredits)} AI credits (${formatCount(remainingTokens)} tokens)`],
      ["Period", periodLabel],
    ]),
    // Stated on the card, every time, because a credit is our unit and nobody arrives knowing it —
    // alongside which period the figures cover, in full rather than clipped to an ellipsis.
    note: [periodSourceSentence, `One AI credit is ${formatCount(ratio)} tokens recorded by the platform.`]
      .filter(Boolean).join(" "),
    canRetry: false,
  };
}

/* ── The Billing Experience rebuild (owner brief 2026-09-03) ────────────────────────────────────
 *
 * This is the presentation contract for `get_workspace_billing_status()` — the ONE read that
 * replaces the mapping-gated `resolveBillingPlanPresentation` above for the plan/usage card. That
 * older resolver checked the provider MAPPING before it would show any access fact, which was
 * correct reasoning back when mapping was the only signal available, but is now the exact bug
 * this rebuild exists to correct: "A promotional workspace with no billing-provider mapping is
 * not 'billing unavailable.' It is a valid promotional account with $0 due today" (owner, R13).
 *
 * access_state and provider_state are read INDEPENDENTLY here, on purpose, matching the DB
 * function's own doctrine: access is never inferred from a missing mapping, and a mapping's
 * absence is its own honest readiness fact, never dressed up as "no plan" or "billing
 * unavailable". `resolveBillingPlanPresentation` and `resolveBillingPortalPresentation` above are
 * UNCHANGED and still back the "manage billing" (hosted-portal) act, which is a separate, still
 * correctly-mapping-gated concern (Foundation A already reads the right table for that).
 */

export type WorkspaceBillingStatusStateId =
  | "status-loading"
  | "status-error"
  | "status-no-workspace"
  | "status-subaccount"
  | "status-unsupported"
  | "status-role-refusal"
  | "status-internal"
  | "status-no-plan"
  | "status-promotional"
  | "status-trial"
  | "status-paid"
  | "status-past-due"
  | "status-unknown";

export interface WorkspaceBillingStatusPresentation {
  state: WorkspaceBillingStatusStateId;
  heading: string;
  body: string;
  /** Plan/money facts — always independent of provider readiness. */
  planFields: ReadonlyArray<{ label: string; value: string }>;
  /** The SEPARATE honest readiness fact: does a provider billing account/payment method exist. */
  providerFields: ReadonlyArray<{ label: string; value: string }>;
  /** Included-resource facts, only for a state where a plan actually exists. */
  usageFields: ReadonlyArray<{ label: string; value: string }>;
  note: string;
  canRetry: boolean;
}

function moneyFromCents(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function providerFieldsFrom(status: WorkspaceBillingStatus): ReadonlyArray<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (status.providerState === "not_created") {
    rows.push({ label: "Provider billing account", value: "Not set up yet — no provider account exists for this workspace" });
  } else if (status.providerState === "ambiguous") {
    rows.push({ label: "Provider billing account", value: "Needs a platform review before it can be shown" });
  } else if (status.providerState === "mapped") {
    rows.push({ label: "Provider billing account", value: "Set up" });
    rows.push(status.paymentMethodConnected
      ? { label: "Payment method", value: `${status.paymentMethodBrand ?? "Card"} •••• ${status.paymentMethodLast4 ?? "····"}`
          + (status.paymentMethodExpMonth && status.paymentMethodExpYear
              ? ` (exp ${status.paymentMethodExpMonth}/${status.paymentMethodExpYear})` : "") }
      : { label: "Payment method", value: "None connected yet" });
  }
  return rows;
}

function usageFieldsFrom(status: WorkspaceBillingStatus): ReadonlyArray<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (status.seatsIncluded !== null && status.seatsUsed !== null) {
    rows.push({ label: "Seats", value: `${formatCount(status.seatsUsed)} of ${formatCount(status.seatsIncluded)} included` });
  }
  if (status.contactsIncluded !== null && status.contactsUsed !== null) {
    rows.push({ label: "Contacts", value: `${formatCount(status.contactsUsed)} of ${formatCount(status.contactsIncluded)} included` });
  }
  // SMS only when a real meter exists (R13/§13 — never a fabricated zero for a meter that isn't wired).
  if (status.smsIncluded !== null && status.smsUsed !== null) {
    rows.push({ label: "SMS", value: `${formatCount(status.smsUsed)} of ${formatCount(status.smsIncluded)} included` });
  }
  if (status.paidAddonsCount !== null && status.paidAddonsCount > 0) {
    rows.push({ label: "Paid marketplace add-ons", value: formatCount(status.paidAddonsCount) });
  }
  return rows;
}

const NO_STATUS_FIELDS: ReadonlyArray<{ label: string; value: string }> = [];

export function resolveWorkspaceBillingStatusPresentation(input: {
  loading: boolean;
  readFailed: boolean;
  status: WorkspaceBillingStatus | null;
}): WorkspaceBillingStatusPresentation {
  const bare = (state: WorkspaceBillingStatusStateId, heading: string, body: string, canRetry = false)
    : WorkspaceBillingStatusPresentation =>
    ({ state, heading, body, planFields: NO_STATUS_FIELDS, providerFields: NO_STATUS_FIELDS, usageFields: NO_STATUS_FIELDS, note: "", canRetry });

  if (input.loading) return bare("status-loading", "Clearing and resolving this account…", "");
  if (input.readFailed || !input.status) {
    return bare("status-error", "Couldn’t load this workspace’s billing status",
      "The plan and usage could not be read just now. Nothing about your plan has changed.", true);
  }
  const s = input.status;

  if (s.scope === "none") {
    return bare("status-no-workspace", "No workspace is selected",
      "There is no billing status to show until a workspace is open. Nothing about any workspace has changed.");
  }
  if (s.scope === "sub_account") {
    return bare("status-subaccount", "Platform billing is not applicable to this workspace yet.",
      "This workspace is a sub-account. Platform billing is not inherited from the agency, and there is no " +
      "supported sub-account billing contract yet, so nothing is shown here — not because there is no plan, " +
      "but because this page cannot truthfully report one.");
  }
  if (s.scope === "agency" || s.scope === "enterprise") {
    return bare("status-unsupported", "Platform billing is not available for this account type yet.",
      "Agency and Enterprise workspaces do not inherit a Solo plan, and no supported billing contract exists " +
      "for them yet. This page cannot truthfully report a plan, so it does not.");
  }
  if (!s.canView) {
    return bare("status-role-refusal", "Billing for this workspace is visible to its owner",
      "What this workspace pays the platform, and the payment method it is charged on, are the owner's to see " +
      "and to change. Nothing about your own access is affected.");
  }

  const workspaceHeading = `${s.workspaceName?.trim() || "This workspace"}’s PAIGE Plan & Usage`;

  if (s.accessState === "internal") {
    return {
      state: "status-internal",
      heading: workspaceHeading,
      body: "This is an internal platform workspace. It is not a paying or promotional customer, and no plan facts are shown for it.",
      planFields: fieldsFrom([["Status", "Internal / platform workspace"]]),
      providerFields: NO_STATUS_FIELDS, usageFields: NO_STATUS_FIELDS, note: "", canRetry: false,
    };
  }
  if (s.accessState === "no_plan") {
    return {
      state: "status-no-plan",
      heading: workspaceHeading,
      body: "This workspace has no active plan (the platform checked and found none). Your workspace and its data are preserved.",
      planFields: NO_STATUS_FIELDS, providerFields: providerFieldsFrom(s), usageFields: NO_STATUS_FIELDS,
      note: "", canRetry: false,
    };
  }

  // From here a plan exists: promotional, trial, paid, or past_due.
  const planFields = fieldsFrom([
    ["Billed by", s.billedBy],
    ["Plan", s.planName],
    ["Amount due today", s.amountDueCents === null ? null : moneyFromCents(s.amountDueCents)],
    ["Payment setup required", s.paymentMethodRequired ? "Yes" : "No — nothing is due"],
  ]);
  const providerFields = providerFieldsFrom(s);
  const usageFields = usageFieldsFrom(s);

  if (s.accessState === "promotional") {
    return {
      state: "status-promotional", heading: workspaceHeading,
      body: "This workspace has full platform access during the promotional beta. No payment is due.",
      planFields, providerFields, usageFields,
      note: "Granted by the platform. When this changes, or if a paid plan replaces it, this page will say so plainly before anything else happens.",
      canRetry: false,
    };
  }
  if (s.accessState === "trial") {
    return {
      state: "status-trial", heading: workspaceHeading,
      body: s.trialEndsAt ? `This workspace is on a beta trial. $0 due while the trial is active.` : "This workspace is on a beta trial. $0 due while the trial is active.",
      planFields: s.trialEndsAt ? fieldsFrom([...planFields.map((f): [string, string] => [f.label, f.value]), ["Trial ends", s.trialEndsAt]]) : planFields,
      providerFields, usageFields,
      note: "Nothing is charged when the trial ends. This workspace then moves to no active plan unless a paid plan or promotional access is already active.",
      canRetry: false,
    };
  }
  if (s.accessState === "paid") {
    return {
      state: "status-paid", heading: workspaceHeading,
      body: "This workspace has an active paid platform subscription.",
      planFields, providerFields, usageFields, note: "", canRetry: false,
    };
  }
  if (s.accessState === "past_due") {
    return {
      state: "status-past-due", heading: workspaceHeading,
      body: "This workspace's most recent payment did not go through. Access has not changed yet.",
      planFields, providerFields, usageFields,
      note: "The platform has been notified. Nothing further happens automatically from this page.",
      canRetry: false,
    };
  }

  // access_state === 'unknown' — a state this page has no approved wording for. Reported honestly
  // rather than guessed, same discipline as `resolveBillingPlanPresentation`'s past_due fallback.
  return {
    state: "status-unknown", heading: workspaceHeading,
    body: "This workspace's billing state is one this page has not been given approved wording for, so it is not described rather than described wrongly. Nothing about your access has changed. The platform has been notified.",
    planFields: NO_STATUS_FIELDS, providerFields, usageFields: NO_STATUS_FIELDS, note: "", canRetry: false,
  };
}

/* ── Payment-method setup (item 4, owner brief 2026-09-03) ──────────────────────────────────────
 *
 * A SEPARATE presentation contract from the plan/usage read above, deliberately: whether a
 * payment method exists is a readiness fact, and R13 says a readiness fact is never merged into
 * the access-state claim. This resolver's gating mirrors the SERVER's own gate exactly (both read
 * `authority.scope`/`authority.canManageBilling`) so the UI never offers an action the server is
 * certain to refuse (§36 — no dead-end buttons). `providerState`/payment-method DISPLAY facts come
 * from the status read (the same one the plan card uses); the OWNER gate comes from the SAME
 * authority read that already, correctly, backs the hosted-portal act — one source for "is this
 * workspace's provider mapping real," not a second one invented for this section.
 */

export type PaymentSetupStateId =
  | "setup-loading"
  | "setup-unreadable"
  | "setup-not-applicable"
  | "setup-not-owner"
  | "setup-needs-review"
  | "setup-needed"
  | "setup-connected";

export interface PaymentSetupPresentation {
  state: PaymentSetupStateId;
  heading: string;
  body: string;
  /** Populated only for setup-connected, from a real attached method. */
  fields: ReadonlyArray<{ label: string; value: string }>;
  /** True only when the act could plausibly succeed — the server's own gate says so too. */
  canAct: boolean;
  actionLabel: string;
  canRetry: boolean;
}

export interface PaymentSetupInput {
  loading: boolean;
  readFailed: boolean;
  scope: BillingScope;
  canManageBilling: boolean;
  billingAccountState: BillingAccountState;
  paymentMethodConnected: boolean;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodExpMonth: number | null;
  paymentMethodExpYear: number | null;
}

const NO_SETUP_FIELDS: ReadonlyArray<{ label: string; value: string }> = [];

export function resolveWorkspacePaymentSetupPresentation(input: PaymentSetupInput): PaymentSetupPresentation {
  const bare = (state: PaymentSetupStateId, heading: string, body: string, canRetry = false): PaymentSetupPresentation =>
    ({ state, heading, body, fields: NO_SETUP_FIELDS, canAct: false, actionLabel: "", canRetry });

  if (input.loading) return bare("setup-loading", "Clearing and resolving this account…", "");
  if (input.readFailed) {
    return bare("setup-unreadable", "Couldn’t read this workspace’s payment setup",
      "Nothing about your payment setup could be confirmed just now. Nothing about your access has changed.", true);
  }
  if (input.scope !== "top_level_solo") {
    return bare("setup-not-applicable", "Not applicable to this account type yet",
      "There is no supported platform billing account for this workspace, so there is no payment method to set up here.");
  }
  if (!input.canManageBilling) {
    return bare("setup-not-owner", "Payment setup is managed by the workspace owner",
      "The payment method PAIGE Platform charges this workspace is the owner's to set up and change. Your access here is unaffected.");
  }
  if (input.billingAccountState === "ambiguous") {
    return bare("setup-needs-review", "Needs a platform review before this can be shown",
      "This workspace's billing records need a platform review before payment setup can proceed. Nothing about your access has changed. The platform has been notified.");
  }
  if (input.billingAccountState !== "mapped" && input.billingAccountState !== "absent") {
    return bare("setup-needs-review", "Not available yet",
      "The platform reported this workspace's billing setup in a way this page does not recognize, so payment setup is not offered. Nothing about your access has changed.");
  }

  if (input.paymentMethodConnected) {
    const exp = input.paymentMethodExpMonth && input.paymentMethodExpYear
      ? ` (exp ${input.paymentMethodExpMonth}/${input.paymentMethodExpYear})` : "";
    return {
      state: "setup-connected",
      heading: "Payment method on file",
      body: "PAIGE Platform charges this method for this workspace's subscription. Setting up a new one replaces it.",
      fields: fieldsFrom([["On file", `${input.paymentMethodBrand ?? "Card"} •••• ${input.paymentMethodLast4 ?? "····"}${exp}`]]),
      canAct: true, actionLabel: "Update payment method", canRetry: false,
    };
  }
  return {
    state: "setup-needed",
    heading: "Set up a payment method",
    body: "This is the payment method PAIGE Platform charges for this workspace's own subscription — not a way to collect money from this workspace's clients. Setting one up does not start a charge, change the plan, or end promotional access.",
    fields: NO_SETUP_FIELDS, canAct: true, actionLabel: "Set up payment method", canRetry: false,
  };
}

/** Owner copy per refusal from `platform-billing-connect`. Facts about what happened, never a
 * guess about the account — same discipline as `PORTAL_REFUSAL_COPY`. */
export const PAYMENT_SETUP_REFUSAL_COPY: Record<string, string> = {
  no_active_workspace: "No workspace is selected, so there is no payment setup to open.",
  not_applicable_scope: "Platform billing is not applicable to this account type yet.",
  owner_only: "Payment setup is managed by the workspace owner. Ask them to set it up.",
  billing_account_ambiguous: "This workspace's billing records need a platform review before payment setup can proceed. Nothing about your access has changed.",
  billing_account_unresolvable: "The payment provider could not open a setup page for this workspace. The attempt was recorded for the platform to review.",
  needs_config: "Payment setup is not configured for this workspace on the platform side yet.",
  audit_failed: "The platform could not record this request, so setup was not opened. Try again.",
  authority_unreadable: "Your billing permissions could not be read just now. Try again.",
  workspace_changed: "You switched workspaces while setup was opening, so it was not opened.",
  network: "Could not reach the platform. Try again.",
};
