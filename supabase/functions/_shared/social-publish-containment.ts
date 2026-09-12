// Social capability-truth containment (§9/§38, §13/§36, §58, #1161/#1166).
//
// WHY THIS EXISTS. The chat exposes three social model tools — social_post,
// social_analytics, social_accounts — whose executor used to proxy the `paige-social`
// edge function (an Upload-Post API proxy). That proxy authenticates with a SINGLE
// platform-wide `UPLOAD_POST_API_KEY` and posts to a platform-controlled Upload-Post
// `profile`; there is NO per-tenant provider connection. So a tenant admin/coach
// invoking social_post would publish through a SHARED platform credential to a
// platform-controlled profile — a §9 tenant-isolation / §38 money-&-identity-boundary
// breach. The complete tenant-safe governed social pipeline is deferred (#1161), and
// the owner ruled social publishing stays UNAVAILABLE until that path exists.
//
// Meanwhile the capability-truth manifest (#1166) already resolves `social.publish` to
// "planned"/unavailable (see `paige-capability-status/signals.ts` —
// socialPublishMaturity → null ⇒ planned). The TOOL said "I can post" while the TRUTH
// said "planned". This module is the single honest source for the governed "unavailable"
// tool result so the tool AGREES with the manifest (§13/§36/§70) instead of contradicting
// it — and so the previously-wired-but-tenant-unsafe seam is CONTAINED and flagged (§58),
// never silently pretending to work.
//
// Dependency-free on purpose (no imports) so it is trivially unit-testable and safe to
// import from the edge bundle.

/** The three social model tools whose executor returns a governed "unavailable" result. */
export type SocialTool = "social_post" | "social_analytics" | "social_accounts";

/** The shape every social tool hands back — consistent with the other honest-degrade
 *  results in paige-ai-chat (e.g. contact_event_status): truthful, never implying a send. */
export interface SocialToolUnavailableResult {
  success: true;
  available: false;
  status: "unavailable";
  /** The capability this tool maps to. `social.publish` and `social.presence` are real
   *  capability-truth keys in `paige-capability-status/signals.ts`; `social.analytics` is a
   *  descriptive label (there is no dedicated analytics manifest row — analytics availability
   *  derives from `social.presence`/connected-account data). Relayed to the model only. */
  capability: string;
  /** The factual note the model relays. Never implies a post/send happened. */
  note: string;
}

// Each tool → the capability it maps to. `social.publish` and `social.presence` are REAL
// capability-truth keys in `paige-capability-status/signals.ts`; `social.analytics` is a
// DESCRIPTIVE label only — there is no registered analytics manifest row (analytics availability
// derives from `social.presence`/connected-account data), so the comment does not claim a
// signals.ts alignment it does not have (§13 — the capability field is relayed to the model only):
//   social_post      → social.publish   (real key; the external_effect that is owner-ruled unavailable)
//   social_analytics → social.analytics (descriptive; no dedicated manifest row)
//   social_accounts  → social.presence  (real key; the read of recorded/connected accounts)
const SOCIAL_TOOL_CONTAINMENT: Record<SocialTool, { capability: string; note: string }> = {
  social_post: {
    capability: "social.publish",
    note:
      "Posting to social isn't available on this account yet — the tenant-safe social " +
      "publishing path isn't built, so nothing was posted or scheduled. I can still draft " +
      "the post copy for you with draft_marketing_content, but I can't publish or schedule it.",
  },
  social_analytics: {
    capability: "social.analytics",
    note:
      "Social analytics isn't available on this account yet — the tenant-safe social " +
      "integration path isn't built, so there's no connected-account performance data to report.",
  },
  social_accounts: {
    capability: "social.presence",
    note:
      "Listing connected social accounts isn't available on this account yet — the " +
      "tenant-safe social integration path isn't built, so there are no connected accounts to show.",
  },
};

/**
 * The governed "unavailable" result for a social model tool. Pure: same input → deeply
 * equal output, no side effects, no imports. The executor returns this for EVERY caller
 * (no role branch) instead of proxying the platform-wide `paige-social` credential.
 */
export function socialToolUnavailable(tool: SocialTool): SocialToolUnavailableResult {
  const { capability, note } = SOCIAL_TOOL_CONTAINMENT[tool];
  return { success: true, available: false, status: "unavailable", capability, note };
}
