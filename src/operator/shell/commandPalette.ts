/**
 * The command palette's IA — `P.CAPS`, `P.AUTONOMY` and the ten capability summons.
 *
 * PORTED VERBATIM from the pack's own contract file,
 * `docs/design-references/cd-packs/super-admin-shell-v3/paige-ia.js`:
 *   glyph path constants  L17-L26
 *   `P.CAPS`              L28-L48   (four groups, ten entries)
 *   `P.AUTONOMY`          L50-L54
 *   `P.SUMMONS`           L56-L122  (the ten capability bodies used here)
 * Transcribed in `PORT-SPEC-palette-and-six-surfaces.md` §1.5 and §1.9.
 *
 * STRUCTURE IS DESIGN, VALUES ARE DATA (`src/operator/CLAUDE.md`). Every group name, label,
 * note, glyph path, autonomy label/tone, `title`, `deck`, `foot` and row `name`/`status` comes
 * over exactly as authored. The five row `detail` strings the PORT-SPEC's own fixture table
 * names — sweep's `6 of 6 checks`, `11 of 11 forced` and `2 tenants awaiting first run`,
 * sequence's `4 steps over 11 days`, and the claim `Proved on prod: members_before=0
 * members_after=0 delta=0.` in `enter`'s foot — are FIXTURES and are NOT here (§13). A row
 * without a detail renders its name and status and nothing else; it never renders a number
 * nobody read.
 */

/** `paige-ia.js` L17-L26, verbatim. */
const MAIL = "M2 4.2h12v7.6H2z M2 4.2l6 4.4 6-4.4";
const CODE = "M5.6 4.4L2.4 8l3.2 3.6 M10.4 4.4L13.6 8l-3.2 3.6 M9.2 3.2l-2.4 9.6";
const PLUG = "M6 2.4v3.2 M10 2.4v3.2 M4.4 5.6h7.2v2.8a3.6 3.6 0 0 1-7.2 0z M8 12v1.6";
const GLOBE =
  "M8 2.2a5.8 5.8 0 1 0 .1 0z M2.4 8h11.2 M8 2.2c1.6 1.8 2.4 3.8 2.4 5.8s-.8 4-2.4 5.8 M8 2.2C6.4 4 5.6 6 5.6 8s.8 4 2.4 5.8";
const WINDOW = "M2.2 3.4h11.6v9.2H2.2z M2.2 6h11.6";
const SWEEP = "M2.4 8.6l3.6 3.4 7.6-8 M2.4 4.4h3.6";
const KEY = "M9.8 3.2a3 3 0 1 0 2.2 5.1l1.6 1.6-1.2 1.2-1.6-1.6 M2.4 13.6l4.4-4.4";
const BELL = "M4.6 11.2V7.4a3.4 3.4 0 0 1 6.8 0v3.8z M3.2 11.2h9.6";
const QUERY = "M6.8 3a3.8 3.8 0 1 0 .1 0z M9.6 9.8L13.4 13.6";
const SEQ = "M3 4.4h10 M3 8h7 M3 11.6h4 M12 9.6l2 2-2 2";

export type CapabilityId =
  | "email" | "sequence" | "sandbox" | "connect"
  | "web" | "browse" | "query" | "sweep" | "enter" | "rule";

export type Capability = {
  readonly id: CapabilityId;
  readonly label: string;
  readonly note: string;
  readonly path: string;
  /** 0 Autonomous · 1 Ask first · 2 Draft only — `paige-ia.js` L28's own comment. */
  readonly autonomy: 0 | 1 | 2;
  readonly stub?: boolean;
};

export type CapabilityGroup = { readonly group: string; readonly items: readonly Capability[] };

/** `P.CAPS` — `paige-ia.js` L28-L48. */
export const CAPS: readonly CapabilityGroup[] = [
  { group: "Reach out", items: [
    { id: "email", label: "Send an email", note: "Composes, then delivers on your word", path: MAIL, autonomy: 1 },
    { id: "sequence", label: "Run a sequence", note: "Multi-step outbound against a segment", path: SEQ, autonomy: 1 },
  ] },
  { group: "Build and connect", items: [
    { id: "sandbox", label: "Write and run code", note: "Sandboxed. Output reviewable before it lands", path: CODE, autonomy: 2, stub: true },
    { id: "connect", label: "Connect a tool", note: "MCP or API. Scopes shown before consent", path: PLUG, autonomy: 1 },
  ] },
  { group: "Look things up", items: [
    { id: "web", label: "Search the web", note: "Reads only. Cites sources or says nothing", path: GLOBE, autonomy: 0, stub: true },
    { id: "browse", label: "Open a page", note: "A browser she drives and you watch", path: WINDOW, autonomy: 2, stub: true },
    { id: "query", label: "Query the platform", note: "Reads within your scope, never past it", path: QUERY, autonomy: 0 },
  ] },
  { group: "Act on the fleet", items: [
    { id: "sweep", label: "Run a systems sweep", note: "Skips reported as skips, never as passes", path: SWEEP, autonomy: 0 },
    { id: "enter", label: "Enter a tenant scope", note: "Audited. Grants no membership row", path: KEY, autonomy: 1 },
    { id: "rule", label: "Draft an alert rule", note: "Composes it; the sweep evaluates it", path: BELL, autonomy: 2 },
  ] },
];

/** `P.AUTONOMY` — `paige-ia.js` L50-L54. */
export const AUTONOMY: readonly { readonly label: string; readonly tone: string }[] = [
  { label: "Autonomous", tone: "var(--pg-positive)" },
  { label: "Ask first", tone: "var(--pg-gold-deep)" },
  { label: "Draft only", tone: "var(--pg-violet)" },
];

/**
 * The tag on the right of a palette row.
 *
 * The pack's `effAutonomy` (v3.dc.html L4471) clamps the capability's own setting against the
 * Trust Compass ceiling. NEITHER a per-capability override nor an operator ceiling is wired at
 * this scope, so the pack's own unset path applies: `own = baseAutonomy(id)` (L4449) and
 * `ceiling() = 2` (L4458) — which is `Ask first`, so `Autonomous` reads as clamped. Reproducing
 * the clamp without the state that drives it would report a ceiling nobody set (§13), so the
 * BASE grant is what is shown, exactly as it is authored in `P.CAPS`.
 */
export function autonomyTag(cap: Capability): { label: string; tone: string } {
  if (cap.stub) return { label: "Coming soon", tone: "var(--pg-faint)" };
  return AUTONOMY[cap.autonomy];
}

export type SummonRow = {
  readonly name: string;
  /** Absent where the pack's own value is a fixture — see the file header. */
  readonly detail?: string;
  readonly status: string;
  readonly tone: string;
};

export type Summon = {
  readonly title: string;
  readonly deck: string;
  readonly foot: string;
  readonly rows: readonly SummonRow[];
};

/** `P.SUMMONS` — `paige-ia.js` L80-L121, fixtures removed (see the file header). */
export const SUMMONS: Readonly<Record<CapabilityId, Summon>> = {
  sweep: {
    title: "Systems sweep",
    deck: "Started from the command bar. It holds no rail slot — close it and it retires, and the run joins Fleet’s own history tab.",
    foot: "Reads paige_systems_check_run at tenant_id IS NULL. A run in flight reads still running, never a verdict it has not reached.",
    rows: [
      { name: "Resolver integrity", status: "Pass", tone: "var(--pg-positive)" },
      { name: "RLS posture", status: "Pass", tone: "var(--pg-positive)" },
      { name: "Migration drift", detail: "An edge function cannot read git", status: "Unreadable", tone: "var(--pg-faint)" },
      { name: "Provisioning queue", status: "Attention", tone: "var(--pg-warning)" },
    ],
  },
  web: {
    title: "Web search",
    deck: "A reading surface, not a destination. Sources are listed or the answer is withheld.",
    foot: "No substrate: there is no operator-scope search seam. Stage 3 owns the fetch path and the citation record.",
    rows: [
      { name: "Query surface", detail: "Takes a question, returns sources", status: "Design only", tone: "var(--pg-negative)" },
      { name: "Citation record", detail: "Every claim carries a source or is dropped", status: "Design only", tone: "var(--pg-negative)" },
    ],
  },
  browse: {
    title: "Browser",
    deck: "PAIGE drives a page and you watch it happen. Draft only by default — she navigates and reads; any act on the page opens an authority gate.",
    foot: "No substrate. Stage 3 owns the session, the frame relay, and the per-domain consent record.",
    rows: [
      { name: "Navigation", detail: "Read and traverse", status: "Design only", tone: "var(--pg-negative)" },
      { name: "Form submission", detail: "Authority gate at the act", status: "Design only", tone: "var(--pg-negative)" },
    ],
  },
  sandbox: {
    title: "Sandbox",
    deck: "Where she writes and runs her own code. Draft only: output is reviewable and nothing reaches the platform without an authorized act.",
    foot: "No substrate. Stage 3 owns the isolated runtime, the resource ceiling, and the record of what ran.",
    rows: [
      { name: "Isolated runtime", detail: "No platform credentials in scope", status: "Design only", tone: "var(--pg-negative)" },
      { name: "Output review", detail: "Diff before anything lands", status: "Design only", tone: "var(--pg-negative)" },
    ],
  },
  connect: {
    title: "Connect a tool",
    deck: "Scopes are shown before consent, and the grant is revocable from Settings without touching the integration.",
    foot: "Substrate partial: integration seams exist, a unified control does not. Stage 3 owns the consent record.",
    rows: [
      { name: "Scope disclosure", detail: "What it reads, what it writes", status: "Design only", tone: "var(--pg-negative)" },
      { name: "Revocation", detail: "Revoke without removing the tool", status: "Stage 3", tone: "var(--pg-warning)" },
    ],
  },
  email: {
    title: "Compose",
    deck: "Ask first: she composes in full, and delivery waits on you. Approving sends exactly once and records it.",
    foot: "Live. Delivery routes through the existing send seam — no second stack.",
    rows: [
      { name: "Draft", detail: "Composed against the record in scope", status: "Ready", tone: "var(--pg-positive)" },
      { name: "Delivery", detail: "Sends once. Cannot be undone", status: "Waiting on you", tone: "var(--pg-gold-deep)" },
    ],
  },
  sequence: {
    title: "Sequence",
    deck: "Multi-step outbound against a segment. Each step is a separate act, and the whole run can be halted mid-flight.",
    foot: "Live. Steps write to the same send seam a single message does.",
    rows: [
      { name: "Segment", detail: "Resolved from Relationships", status: "Ready", tone: "var(--pg-positive)" },
      { name: "Step schedule", status: "Waiting on you", tone: "var(--pg-gold-deep)" },
    ],
  },
  query: {
    title: "Query",
    deck: "Reads within your current scope and never past it. The scope in the band is the scope of the answer.",
    foot: "Live. Every read is RLS-bound; an operator with no tenant scope sees platform rows only.",
    rows: [
      { name: "Scope", detail: "Matches the band above", status: "Bound", tone: "var(--pg-positive)" },
      { name: "Result", detail: "Figures, with the read that produced them", status: "Ready", tone: "var(--pg-positive)" },
    ],
  },
  enter: {
    title: "Tenant scope",
    deck: "Audited on entry. Points active_tenant_id at the tenant and grants no membership row, so the roster and seat count are untouched.",
    foot: "Live.",
    rows: [
      { name: "Audit row", detail: "paige_audit_log, on entry and exit", status: "Live", tone: "var(--pg-positive)" },
      { name: "Membership delta", detail: "Always zero", status: "Live", tone: "var(--pg-positive)" },
    ],
  },
  rule: {
    title: "Alert rule",
    deck: "She composes the rule; the five-minute sweep evaluates it. A rule bound to an unreadable signal reports never evaluated, never a pass.",
    foot: "Schema and evaluator ship. Surface wiring is Stage 3, and delivery sits at pending until the channel adapters land.",
    rows: [
      { name: "Condition", detail: "Against the signal catalogue", status: "Stage 3", tone: "var(--pg-warning)" },
      { name: "Delivery", detail: "Every firing pending until A3", status: "No substrate", tone: "var(--pg-negative)" },
    ],
  },
};

export function findCapability(id: string): Capability | null {
  for (const g of CAPS) for (const i of g.items) if (i.id === id) return i;
  return null;
}

export function isCapabilityId(id: string): id is CapabilityId {
  return findCapability(id) !== null;
}
