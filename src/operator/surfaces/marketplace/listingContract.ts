import { MARKET_KINDS, type SubmissionKind } from "@/operator/surfaces/marketplaceVocabulary";

/**
 * The Marketplace listing contract — Storefront, Catalog and Publishers, ported as one group.
 *
 * BUILD-ORDER Layer 3c. Submissions already shipped as `SubmissionsQueue`; these are the other
 * three views of the same slot, and they read the same five kinds and four publisher classes,
 * which is why `marketplaceVocabulary.ts` already exists as their one home (§18). This file adds
 * only what that module does not carry: the LISTING itself and the ceiling arithmetic that
 * decides what a listing is allowed to say about itself.
 *
 * SOURCES, all in `PAIGE Super Admin Shell v3.dc.html`:
 *   `storeVals`   L10054–L10197   markup L2447–L2546
 *   `catalogVals` L9434–L9538     markup L1245–L1292
 *   `pubsVals`    L9540–L9606     markup L1295–L1332
 *   `paige-ia.js` L1124–L1128 `P.MARKET.collections`
 *
 * ═══ TWO PACK FINDINGS, RECORDED NOT RESOLVED (§00 — CD rules on the pack) ══════════════════
 *
 * **(1) The grant-vs-ceiling scale disagrees with itself between two surfaces.** Both compare a
 * listing's requested grant against `ceiling()`, which is a rung index 0–4 (`ceiling()`, L4517).
 * They disagree on how a grant NAME maps onto that scale:
 *
 *              Observe   Draft only   Ask first   Act and report   Autonomous
 *   marketplace    0          1           2             3               4      (RANK index — L10057, L9437)
 *   campaigns      1          1           2             2               4      (WEIGHT     — clampGrant, L5295)
 *
 * So a listing needing "Act and report" reads ABOVE a ceiling of 2 in the Marketplace and would
 * read AT it in Campaigns; "Observe" is at rung 0 in one and weight 1 in the other. Both are
 * internally consistent and both are wired as drawn, so this is not a §00 incompatibility — it
 * is a pack self-contradiction, and the established practice (`PACK-INVENTORY-v3.md` §6) is to
 * port each surface's own arithmetic VERBATIM and let CD rule. That is what happens here:
 * `aboveCeiling` below is the marketplace RANK, `clampGrant` in `campaignContract.ts` keeps its
 * WEIGHT, and neither is quietly reconciled into the other. Recorded as contradiction #8.
 *
 * **(2) The storefront's empty state is bound but never supplied.** The markup renders
 * `{{ emptyLine }}` inside `<sc-if value="{{ storeEmpty }}">` at L2541–L2543, and NEITHER
 * `storeVals` nor `storeValsUnused` produces either key — grepping the whole 11,358-line shell
 * for `emptyLine` and `storeEmpty` returns exactly those two markup lines and nothing else. A
 * search with no results is what a filtered storefront shows most often, so this is the state
 * the surface is in whenever nothing matches. No copy is invented for it here (§00): the result
 * line already counts honestly, and `STORE_FOOT` — which IS authored and IS supplied — says what
 * does not exist. Owed from CD.
 */

export type { SubmissionKind } from "@/operator/surfaces/marketplaceVocabulary";

/**
 * The five grants a listing can request, in rung order. `storeVals` L10057, and `catalogVals`
 * L9437 spells the same order as a map. A listing's grant is compared against the platform's
 * Trust Compass rung by INDEX INTO THIS ARRAY — see finding (1) above.
 */
export const GRANT_RANK = [
  "Observe",
  "Draft only",
  "Ask first",
  "Act and report",
  "Autonomous",
] as const;
export type GrantName = (typeof GRANT_RANK)[number];

/**
 * `above` — `storeVals` L10059 / `catalogVals` L9440, verbatim.
 *
 * A ceiling the platform is not holding is `null`, and then nothing can be judged above it. The
 * pack defaults `ceiling()` to 2 when `state.trust` is undefined; that default is a DEMO
 * convenience, and inheriting it would make the console assert a governance rung nobody set
 * (§13). So an unread ceiling returns `null` here and every caller renders the grant plainly
 * rather than as capped or clear.
 */
export function aboveCeiling(needs: string, ceiling: number | null): boolean | null {
  if (ceiling === null) return null;
  const i = (GRANT_RANK as readonly string[]).indexOf(needs);
  // A grant name the platform does not know cannot be ranked, so it is not claimed to clear.
  if (i < 0) return null;
  return i > ceiling;
}

/** A listing, as the three surfaces read it. Every field is one the pack calls real. */
export type Listing = {
  readonly id: string;
  readonly name: string;
  readonly kind: SubmissionKind;
  /** The publisher line as shown — `"Verified agency · Some publisher"`. */
  readonly pub: string;
  /** Which publisher class published it — decides reach and revenue share. */
  readonly cls: string;
  readonly version: string;
  /** How far it currently travels. */
  readonly scope: string;
  /** The grant it asks for. Ranked against the ceiling by `aboveCeiling`. */
  readonly needs: string;
  readonly pitch: string;
  readonly price?: string | null;
  /**
   * The listing's own state before the ceiling is applied. `Installed` / `Listed` are the two
   * ordinary ones; the rest are terminal and the ceiling never overrides them.
   */
  readonly state: string;
};

/** `M.collections` — `paige-ia.js` L1124. A shelf is a title, a note, and which listings sit on it. */
export type StoreCollection = {
  readonly title: string;
  readonly note: string;
  readonly ids: readonly string[];
};

/**
 * The pack's three shelves, RECORDED not shipped. Their titles and notes are authored structure,
 * but each is bound to specific fixture ids (`sweep-brief`, `reseller-pack`, `auto-outreach`…)
 * that do not come over, so shipping them would produce three empty named shelves asserting a
 * curation nobody made. Layer 6 reads real collections; these are what it is reading TOWARD:
 *
 *   "Made by us"                                — First party · no review, published platform-wide
 *   "From agencies"                             — Reviewed before it reaches anyone outside its own sub-accounts
 *   "Needs more room than you have given her"   — Visible, and honest about why it will not run
 */
export const PACK_COLLECTION_TITLES = [
  "Made by us",
  "From agencies",
  "Needs more room than you have given her",
] as const;

/* ── Storefront ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `stateOf` — `storeVals` L10062–L10069, verbatim, plus the honest `null`-ceiling arm.
 *
 * The order matters and is the pack's: a terminal state wins outright, then an install is
 * reported capped or clear, then an uninstalled listing offers Install or says it is out of
 * reach. With no ceiling read, an install reads plainly "Installed" and an uninstalled listing
 * reads "Install" — never "capped" or "Above ceiling", which are claims about a rung.
 */
export function storefrontState(
  listing: Listing,
  ceiling: number | null,
  installed: boolean,
): readonly [label: string, tone: string] {
  if (listing.state === "No substrate" || listing.state === "Blocked")
    return ["Blocked", "var(--pg-negative)"];
  if (listing.state === "In review") return ["In review", "var(--pg-violet)"];
  const over = aboveCeiling(listing.needs, ceiling);
  if (installed)
    return over === true
      ? ["Installed · capped", "var(--pg-warning)"]
      : ["Installed", "var(--pg-positive)"];
  return over === true
    ? ["Above ceiling", "var(--pg-warning)"]
    : ["Install", "var(--pg-gold-deep)"];
}

/** `matches` — `storeVals` L10070–L10073. Query, kind, and the runnable-here-only toggle. */
export function storefrontMatches(
  listing: Listing,
  query: string,
  kind: string | null,
  runnableOnly: boolean,
  ceiling: number | null,
): boolean {
  const q = query.trim().toLowerCase();
  if (q && `${listing.name} ${listing.pitch} ${listing.kind} ${listing.pub}`.toLowerCase().indexOf(q) < 0)
    return false;
  if (kind && listing.kind !== kind) return false;
  if (runnableOnly) {
    if (aboveCeiling(listing.needs, ceiling) === true) return false;
    if (listing.state === "No substrate" || listing.state === "Blocked") return false;
  }
  return true;
}

export const STORE_FOOT =
  "Every listing is representative. Kind, publisher, scope, state and the grant it requests are " +
  "real fields on a listing; what does not exist is the install ledger, the marketplace take on " +
  "the money spine, and a reviewer identity with an SLA clock. Nothing here has been installed " +
  "anywhere.";

/* ── Catalog ────────────────────────────────────────────────────────────────────────────────── */

/**
 * `resolve` — `catalogVals` L9441–L9443. The Catalog's state vocabulary differs from the
 * Storefront's on purpose: the store sells (so an uninstalled listing reads "Install", an
 * invitation) while the catalog inventories (so the same listing reads "Listed", a fact).
 */
export function catalogState(listing: Listing, ceiling: number | null, installed: boolean): string {
  if (
    listing.state === "Blocked" ||
    listing.state === "No substrate" ||
    listing.state === "Delisted" ||
    listing.state === "In review"
  )
    return listing.state;
  const over = aboveCeiling(listing.needs, ceiling);
  if (installed) return over === true ? "Installed · capped" : "Installed";
  return over === true ? "Above ceiling" : "Listed";
}

/** `tone` — `catalogVals` L9444–L9450, verbatim, in the pack's own test order. */
export function catalogTone(state: string): string {
  if (/capped/.test(state)) return "var(--pg-warning)";
  if (/^Installed/.test(state)) return "var(--pg-positive)";
  if (state === "In review") return "var(--pg-violet)";
  if (state === "Blocked" || state === "No substrate") return "var(--pg-negative)";
  if (state === "Above ceiling") return "var(--pg-warning)";
  if (state === "Delisted") return "var(--pg-faint)";
  return "var(--pg-muted)";
}

export type CatalogDecision = "blocked" | "capped" | "review" | "quiet";

/**
 * `bucket` + `dec` — `catalogVals` L9452–L9477.
 *
 * CD's comment is the whole reason this row is four decisions rather than a status count:
 * *"Each decision is a real question an operator has to answer, not a status count."* Each
 * label names what the operator must DO about the number, and each note says why it is theirs.
 */
export const CATALOG_DECISIONS: readonly {
  readonly key: CatalogDecision;
  readonly label: string;
  readonly note: string;
  readonly tone: string;
}[] = [
  { key: "blocked", label: "blocked", note: "needs substrate or a ruling", tone: "var(--pg-negative)" },
  { key: "capped", label: "held below grant", note: "your ceiling, not their code", tone: "var(--pg-warning)" },
  { key: "review", label: "waiting on a reviewer", note: "nobody is assigned", tone: "var(--pg-violet)" },
  { key: "quiet", label: "listed, never installed", note: "no install ledger to prove it", tone: "var(--pg-ink)" },
];

export function inDecision(state: string, key: CatalogDecision): boolean {
  switch (key) {
    case "blocked":
      return /Blocked|No substrate/.test(state);
    case "capped":
      return /capped|Above ceiling/.test(state);
    case "review":
      return state === "In review";
    case "quiet":
      return state === "Listed";
  }
}

/** `KIND_NOTE` — `catalogVals` L9479–L9485. A shelf's own one-line definition of its kind. */
export const SHELF_NOTE: Readonly<Record<SubmissionKind, string>> = {
  Skill: "a named procedure she runs",
  Automation: "runs on its own, under a grant",
  Integration: "connects an outside account",
  Template: "configuration, nothing executes",
  Agent: "a sub-agent with one job",
};

/**
 * `catFoot` — `catalogVals` L9535–L9537, both arms verbatim. The filtered arm exists because the
 * catalog DIMS rather than removes: *"Everything else stays on its shelf, dimmed, so you can see
 * what you are not looking at."*
 */
export const CATALOG_FOOT_FILTERED =
  "Filtered to one decision. Everything else stays on its shelf, dimmed, so you can see what you " +
  "are not looking at.";
export const CATALOG_FOOT =
  "Every listing on the platform, by kind. Installs and revenue are absent rather than zero: " +
  "there is no install ledger and no marketplace take on the money spine, so a count would be a " +
  "claim. Kind, publisher, scope, version and state are real fields — those are what Stage 3 reads.";

/** The five shelves, in the pack's own key order (`Object.keys(M.kinds)`, `paige-ia.js` L1044). */
export const SHELF_ORDER = Object.keys(MARKET_KINDS) as readonly SubmissionKind[];

/* ── Publishers ─────────────────────────────────────────────────────────────────────────────── */

/** `reachOf` — `pubsVals` L9544. A class is a ceiling on reach; this is the ceiling in words. */
export const CLASS_REACH: Readonly<Record<string, string>> = {
  Platform: "Platform-wide",
  Agency: "Its own sub-accounts",
  Solo: "Private",
  Unverified: "Own workspace",
};

export const PUBS_DECK =
  "Three classes, three ceilings on reach. A class decides how far a listing can travel and " +
  "which kinds it may ship at all — the second is a security boundary, not a preference. " +
  "Revenue share is a term of the class.";

export const PUBS_FOOT =
  "By ruling, an outside publisher may ship a Template or a Skill — configuration and " +
  "composition. An Automation is reviewed every time. An Integration or an Agent is arbitrary " +
  "behaviour against a client’s data, so both stay platform-only until a real security " +
  "review exists. What does not exist yet: a publisher account separate from a tenant, a payout " +
  "ledger, and the reviewer identity that would make the review real.";
