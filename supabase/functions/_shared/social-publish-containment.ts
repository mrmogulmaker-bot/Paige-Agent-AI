/**
 * SOCIAL PUBLISH CONTAINMENT — a shared Harness truth/authority safeguard, not Social product code.
 *
 * OWNER RULING (Gate A, 2026-09-12). Social PUBLICATION is an externally-consequential action, and
 * the canonical tenant-safe governed Social path is not yet built or proven. Until it is, Paige must
 * not publish to anyone's social accounts through ANY entry point — and a configured provider
 * credential is NOT authorization. `UPLOAD_POST_API_KEY` existing does not make social publishing an
 * available capability (§13/§38/§00: "listed/connected" ≠ "authorized/available").
 *
 * WHY A SERVER-SIDE PREDICATE AT THE SEAM, NOT A HIDDEN CHAT TOOL. Hiding a tool or a UI control
 * contains one caller. This is the decision the PUBLICATION SEAM itself makes, so it holds for every
 * caller of that seam — the Chat tool, a direct service-role call, a cron token, or any future
 * producer — which is exactly what "deny across every entry point" requires. It is pure (no I/O, no
 * env, no clock) so a regression test proves the denial WITHOUT a live provider, and — because it
 * takes only the action name and never the key — a configured Upload-Post key structurally cannot
 * change the answer.
 *
 * SCOPE — DENIES PUBLICATION ONLY. `post` is the sole Upload-Post action that creates an external
 * publication (immediate or scheduled — scheduling is `post` with a `scheduled_date`). Everything
 * else is preserved on purpose:
 *   · reads — `accounts`, `analytics`, `post_analytics`, `audience`, `comments`, `status`,
 *     `scheduled` — report real connection/analytics state and publish nothing (owner: "preserve
 *     safe Social reads and declared-handle capture");
 *   · `cancel_scheduled` — a provider DELETE that can only REMOVE a queued publication, never create
 *     one, so it stays available as a safety valve. Named here as a decision on the record rather
 *     than an unstated gap: if the owner later wants every provider mutation frozen, add it to
 *     `CONTAINED_ACTIONS` — the one edit that widens the containment.
 *
 * NOT AVAILABLE, AND NOT CLAIMED (§13). Account CONNECTION is a distinct capability that is not wired
 * today: the Social settings surface posts `action:"connect"`, but `paige-social` has no `connect`
 * branch and returns `unknown_action`. This safeguard does not touch or claim connection — the copy
 * below advertises only what actually works (reads). Wiring connection is lift-path/Social-vertical
 * work, not this containment's job.
 *
 * LIFT PATH. This safeguard is removed only when the future governed, tenant-scoped Social capability
 * is registered in the Spine, classified in action-risk, wired through the Capability Gateway, and
 * proven — i.e. the full connected-account → authorize → draft → approve → publish → readback →
 * analytics vertical exists. Removing it before then re-opens the exact hole it closes.
 */

/** The Upload-Post actions that create an external publication. Only `post` does today. Widening the
 *  containment is adding an entry here (and nothing else). */
export const CONTAINED_ACTIONS: ReadonlySet<string> = new Set(["post"]);

/** The honest owner-facing status when a publication is contained. Never a success shape. */
export type SocialContainment =
  | { denied: false }
  | {
      denied: true;
      /** Not `CONNECTION_REQUIRED`: the governed capability is UNBUILT, not merely unconnected — a
       *  connection would not make it available, so the status must not imply "just connect it". */
      status: "UNAVAILABLE";
      capability: "social_publish";
      reason: string;
      setup_path: string;
    };

/**
 * Decide whether a Social action is a contained publication. Pure: the ONLY input is the action
 * name, so no credential, connection, tenant, or request field can flip a denial to an allow.
 */
export function socialPublishContainment(action: string): SocialContainment {
  if (!CONTAINED_ACTIONS.has(action)) return { denied: false };
  return {
    denied: true,
    status: "UNAVAILABLE",
    capability: "social_publish",
    reason:
      "Social publishing through Paige is not available yet. The governed, tenant-safe Social path " +
      "(connect account → authorize → draft → approve → publish → confirm → analytics) is not built " +
      "and proven, so Paige will not post to any social account — even if a provider key is configured.",
    setup_path:
      "This unlocks when the governed Social capability ships (registered in the Spine, risk-classified, " +
      "wired through the Capability Gateway, and proven end to end). Until then, Social reads (connection " +
      "status, analytics) remain available; publishing does not. (Account connection is not claimed here: " +
      "the `connect` action is not wired in `paige-social` today, so this copy does not advertise it.)",
  };
}

/**
 * The ONE wire body every contained-publish seam returns (paige-social AND meta-schedule-post),
 * so no caller can read a denial as a success. It deliberately carries `success:false` AND `ok:false`
 * AND `error`: Chat's write-audit keys on `success === false` (a body without it was recorded as
 * `outcome:"succeeded"` — the false receipt this closes), the frontend admin path keys on `ok`/`error`,
 * and the model reads `reason`/`setup_path` to relay the refusal truthfully. `contained:true` marks it
 * as a deliberate policy denial rather than a provider error. Return it under HTTP 403.
 */
export function containedPublishResponse(c: Extract<SocialContainment, { denied: true }>): {
  success: false;
  ok: false;
  error: "social_publish_contained";
  status: "UNAVAILABLE";
  capability: "social_publish";
  reason: string;
  setup_path: string;
  contained: true;
} {
  return {
    success: false,
    ok: false,
    error: "social_publish_contained",
    status: c.status,
    capability: c.capability,
    reason: c.reason,
    setup_path: c.setup_path,
    contained: true,
  };
}
