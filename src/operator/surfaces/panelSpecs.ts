import { OPERATOR_BRANCHES, type Branch, type SubTab } from "@/lib/routing/tierBranches";
import type { OperatorPanelSpec, PanelBlock } from "@/operator/surfaces/OperatorPanel";
import { FLEET_SPECS } from "./specs/fleetSpecs";
import { PAIGE_SPECS } from "./specs/paigeSpecs";
import { MONEY_SPECS } from "./specs/moneySpecs";
import { OPS_SPECS } from "./specs/opsSpecs";
import { PLATFORM_SPECS } from "./specs/platformSpecs";

/**
 * panelSpecs — the operator console's panel registry: one CD panel spec per addressable tab.
 *
 * WHERE THE COPY COMES FROM. Every eyebrow, title and subtitle below is Claude Design's own
 * writing, lifted from the pack rather than invented:
 *   • the EYEBROW is the section eyebrow CD sets on each `panel = {…}` object in
 *     `Super Admin Shell.dc.html` (line 4602 "PAIGE", 4744 "REVENUE", 5158 "MARKETPLACE",
 *     6701 "TRUST COMPASS", 6781 "PLATFORM", and so on).
 *   • the TITLE and SUBTITLE are CD's `panel.title` / `panel.sub` for that tab — the ternary
 *     arms at lines 4907, 4971, 5026, 5158, 5327, 5446, 5581, 5826-5836, 6200, 6336, 6389,
 *     6484, 6701, 6781, 6859 and the `P[tabKey]` map at 6891-7016.
 *   • where CD routes a tab through a bespoke surface rather than the generic panel (Fleet's
 *     Team Pulse and Prospect Pipeline, Growth's Pages/Funnels/Forms, Paige's Chat/Knowledge),
 *     the subtitle is the `intent` line the pack's own route registry carries for that path
 *     (`paige-routes.js`) — still CD's words, still the pack's canonical copy.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY (§13). Not one figure. CD's panel objects are full of
 * mock numbers — MRR totals, health percentages, "3 due in 30 days" — and none of them ship:
 * a chip that counts rows the platform has not read is a fabricated number in a smaller font.
 * So every spec here is HEADER COPY + an explicit `notWired` body, and a surface that acquires
 * a real source overrides the body (and adds its real chip/KPIs) at its own call site:
 *
 *     const spec = { ...getPanelSpec("revenue", "invoices")!, kpis, blocks: realBlocks };
 *
 * CD's own panel banner says the same thing about its data — "No platform substrate exists yet
 * — every figure on this surface is a stand-in, not a platform record" — so this is the pack's
 * posture kept, not a liberty taken.
 *
 * The slugs are imported from OPERATOR_BRANCHES (§18 one home); `assertPanelSpecCoverage()`
 * walks that tree so a branch added there without a spec is caught, not silently blank.
 */

/** CD's section eyebrow, keyed by the branch's registry slug. */
const EYEBROW_BY_BRANCH: Record<string, string> = {
  fleet: "PLATFORM",
  paige: "PAIGE",
  "trust-compass": "TRUST COMPASS",
  calendar: "CALENDAR",
  marketplace: "MARKETPLACE",
  // CD writes Growth's eyebrow as MARKETING (line 4701) — the section is the platform's own
  // marketing, not a tenant growth surface.
  growth: "MARKETING",
  automations: "AUTOMATIONS",
  analytics: "ANALYTICS",
  revenue: "REVENUE",
  support: "SUPPORT",
  comms: "COMMS",
  provisioning: "PROVISIONING",
  settings: "PLATFORM",
};

/** Settings nests one level deeper, and CD gives two of those leaves their own eyebrow. */
const EYEBROW_BY_SETTINGS_SECTION: Record<string, string> = {
  setup: "PLATFORM",
  integrations: "PLATFORM",
  team: "PLATFORM",
  vault: "VAULT",
  governance: "GOVERNANCE",
};

/** Header copy for one tab: CD's title + CD's sub, plus the optional strip/CTA labels. */
interface PanelCopy {
  title: string;
  sub: string;
  anchor?: string;
  /** CD's `pnCta` label — the gold act. The registry carries the LABEL only; the surface that
   *  can actually perform the act supplies the handler, so an unwired CTA renders disabled. */
  cta?: string;
  /** CD's `pnOutCta` label — the plain secondary. */
  secondaryCta?: string;
}

/**
 * The 78 tabs, keyed `branchSlug/subSlug` (settings: `settings/section/leaf`). A bare-branch
 * default tab is keyed with its own slug from OPERATOR_BRANCHES, never an empty segment.
 */
const COPY: Record<string, PanelCopy> = {
  /* ── Fleet Console (CD 6781) ─────────────────────────────────────────── */
  "fleet/systems-check": {
    title: "Systems Check",
    sub: "Thirteen categories of check. Is the machine running for everybody.",
    anchor: "A check that has never failed is not the same as a check that is passing. Both are shown.",
    cta: "Run full sweep",
  },
  "fleet/tenants": {
    title: "Tenants",
    sub: "Every tenant, their tier, health, and the way into each one.",
  },
  "fleet/history": {
    title: "History",
    sub: "Every check that has run, newest first, with what it found.",
  },
  "fleet/alert-rules": {
    title: "Alert rules",
    sub: "What she tells you about, how, and whether it has ever fired.",
    cta: "+ New rule",
  },
  "fleet/team-pulse": {
    title: "Team Pulse",
    sub: "Platform staff load, and who is carrying what.",
  },
  "fleet/prospects": {
    title: "Prospect Pipeline",
    sub: "Inbound tenant prospects, and what each deal is waiting on.",
  },

  /* ── Paige (CD 4602 · 4659 · 6891-7016) ──────────────────────────────── */
  "paige/chat": {
    title: "Chat",
    sub: "Talk to her, ask anything — her drafts and her dispatch traces.",
  },
  "paige/knowledge": {
    title: "Knowledge",
    sub: "Her second brain: corpus domains, and what she has actually read.",
  },
  "paige/sandbox": {
    title: "Sandbox",
    sub: "Her workbench. What she is building right now, what it is running on, and what came out of it.",
    anchor: "Nothing in here can reach a live tenant. That isolation is what lets her build at full autonomy.",
    cta: "Watch her build",
  },
  "paige/research": {
    title: "Research",
    sub: "What she found since you last looked, weighted by what it changes.",
    anchor: "Everything here is public-source. She never reads a tenant's data to answer a market question.",
  },
  "paige/memory": {
    title: "Memory",
    sub: "What she carries between sessions — rules, decisions, preferences, and where each came from.",
  },
  "paige/documents": {
    title: "Documents",
    sub: "What you have fed her — doctrine, rulings, research, brand. She cites from these, not from memory.",
  },
  "paige/playbooks": {
    title: "Playbooks",
    sub: "The frameworks she reasons from, and what she runs on underneath.",
  },
  "paige/sub-agents": {
    title: "Sub-agents",
    sub: "The specialists she dispatches, and the lane each one runs in.",
  },
  "paige/actions": {
    title: "Actions",
    sub: "Every kind she can execute at platform scope, and what is queued behind each one.",
  },
  "paige/skills": {
    title: "Skills",
    sub: "What she knows how to do here — operator-native, not tenant-facing.",
  },
  "paige/team": {
    title: "Team",
    sub: "Her ten departments at platform scope, and who fronts each one.",
  },

  /* ── Trust Compass (CD 6701) ─────────────────────────────────────────── */
  "trust-compass/autonomy": {
    title: "Autonomy",
    sub: "Per-department lanes — what she may draft, what she must ask, what she may send.",
  },
  "trust-compass/escalations": {
    title: "Escalations",
    sub: "Everything she stopped at, why she stopped, and what would let her through next time.",
  },
  "trust-compass/dependencies": {
    title: "Dependencies",
    sub: "What each lane actually rests on. A lane over a broken dependency is not autonomy.",
  },

  /* ── Calendar (CD 6200) ──────────────────────────────────────────────── */
  "calendar/month": {
    title: "Month",
    sub: "Maintenance, releases, reviews, billing and compliance on one grid — the platform's own commitments.",
  },
  "calendar/booking-links": {
    title: "Booking links",
    sub: "What anyone outside the platform can book with you, and what she asks them first.",
  },
  "calendar/settings": {
    title: "Settings",
    sub: "The rules every window, review and booking obeys.",
  },
  "calendar/tasks": {
    title: "Tasks",
    sub: "What is open, who owns it, and what it is holding up.",
  },

  /* ── Marketplace (CD 5158) ───────────────────────────────────────────── */
  "marketplace/discover": {
    title: "Discover",
    sub: "What the fleet is installing, and what you have put in front of them.",
  },
  "marketplace/build": {
    title: "Build",
    sub: "What the platform is making — from an idea she raised to a listing ready to submit.",
  },
  "marketplace/submissions": {
    title: "Submissions",
    sub: "Submitted listings, and what each one passed or failed.",
  },
  "marketplace/publishers": {
    title: "Publishers",
    sub: "Who publishes, what they earn, and what the platform keeps.",
  },

  /* ── Growth (CD 4701 · 5581) ─────────────────────────────────────────── */
  "growth/brand-kit": {
    title: "Brand Kit",
    sub: "The platform's own identity and marketing voice.",
    anchor: "Gold is spent on the primary act and nothing else. Every generated asset inherits these tokens.",
  },
  "growth/social": {
    title: "Social",
    sub: "Where the platform speaks publicly, and who is listening.",
  },
  "growth/pages": {
    title: "Pages",
    sub: "Every public page, what it costs to serve, and what it converts.",
  },
  "growth/funnels": {
    title: "Funnels",
    sub: "The paths in, and where people stop.",
  },
  "growth/forms": {
    title: "Forms",
    sub: "What people fill in, and where each submission goes.",
  },
  "growth/assets": {
    title: "Assets",
    sub: "What the platform owns, what she generated, and what is waiting on you.",
    anchor: "She generates from the canonical set. She never invents a mark, a colour or a lockup.",
  },
  "growth/builders": {
    title: "Builders",
    sub: "What she builds with, and what she has built.",
    secondaryCta: "Open the studio",
  },

  /* ── Automations (CD 6484) ───────────────────────────────────────────── */
  "automations/library": {
    title: "Library",
    sub: "Every persistent rule she runs on the platform itself — one home, tune from here.",
    cta: "+ Build new",
  },
  "automations/runs": {
    title: "Runs",
    sub: "Every firing across every engine, in one timeline.",
  },
  "automations/build": {
    title: "Build",
    sub: "Tell her what you want automated at platform scope. She drafts it, names it, and files it under a department.",
  },

  /* ── Analytics (CD 5826-5836) ────────────────────────────────────────── */
  "analytics/brief": {
    title: "The brief",
    sub: "What changed since yesterday, and what it means.",
  },
  "analytics/revenue": {
    title: "Revenue",
    sub: "What the fleet pays, what it costs to serve, and where the margin sits.",
  },
  "analytics/support": {
    title: "Support",
    sub: "How fast tenants get answered, and who is waiting longest.",
  },
  "analytics/retention": {
    title: "Retention",
    sub: "Who stays, who goes quiet, and what precedes leaving.",
  },
  "analytics/product": {
    title: "Product",
    sub: "What tenants actually use, and what nobody touches.",
  },
  "analytics/autonomy": {
    title: "Autonomy",
    sub: "What she does unattended, what she holds, and how often you agree with her.",
  },
  "analytics/marketing": {
    title: "Marketing",
    sub: "Paid, organic and social in one place — with what the platforms claim against what actually happened.",
  },
  "analytics/comms": {
    title: "Comms",
    sub: "What the platform sent, what landed, and what got booked.",
  },
  "analytics/forecast": {
    title: "Forecast",
    sub: "What she expects next, how confident she is, and who to reach before it happens.",
  },
  "analytics/performance": {
    title: "Performance",
    sub: "Latency, uptime and what each answer costs to produce.",
  },

  /* ── Revenue (CD 4744) ───────────────────────────────────────────────── */
  "revenue/plans": {
    title: "Plans",
    sub: "Base, what each tier includes, and what usage beyond it costs.",
    anchor:
      "This is the record every tenant surface derives from. A number shown to a tenant that " +
      "disagrees with this page is a bug in the tenant surface, not here.",
  },
  "revenue/metering": {
    title: "Metering",
    sub: "What she consumes, what it earns, and what it costs to serve.",
    anchor:
      "Every meter here is visible to the tenant it bills. A charge they cannot see coming is a " +
      "charge they will dispute.",
  },
  "revenue/invoices": {
    title: "Invoices",
    sub: "Base and metered, per tenant, with why each one is where it is.",
  },
  "revenue/at-risk": {
    title: "At risk",
    sub: "Revenue with something wrong behind it — the honest number, not the invoiced one.",
  },

  /* ── Platform Support (CD 5446) ──────────────────────────────────────── */
  "support/inbox": {
    title: "Platform support",
    sub: "Every tenant writing to the platform. She drafts in the platform voice; you approve.",
  },
  "support/escalations": {
    title: "Escalations",
    sub: "Sub-accounts who reached past a silent agency. The safety valve, and its clock.",
  },
  "support/response-policy": {
    title: "Response policy",
    sub: "What tenants are promised, and how much of a reply she may send unattended.",
  },

  /* ── Comms (CD 5327) ─────────────────────────────────────────────────── */
  "comms/outbound": {
    title: "Outbound",
    sub: "What the platform is saying to its tenants — and what is waiting on you to say it.",
    cta: "+ Compose",
  },
  "comms/templates": {
    title: "Templates",
    sub: "The shapes she reuses, and which ones she drafts without being asked.",
    cta: "+ New template",
  },
  "comms/sent-log": {
    title: "Sent log",
    sub: "Everything the platform has sent, with delivery and acknowledgment.",
  },

  /* ── Provisioning (CD 4907) ──────────────────────────────────────────── */
  "provisioning/pipeline": {
    title: "Pipeline",
    sub: "Who is asking, what they are asking for, and what she has already prepared.",
    anchor: "She pre-fills every request from the ask. Approving is a ruling, not data entry.",
    cta: "+ Provision a tenant",
  },
  "provisioning/history": {
    title: "History",
    sub: "Everything provisioned, and what happened after.",
  },

  /* ── Settings · Setup (CD 5026) ──────────────────────────────────────── */
  "settings/setup/operator": {
    title: "Operator",
    sub: "You, your access, and how she signs as you.",
  },
  "settings/setup/brand-kit": {
    title: "Brand kit",
    sub: "The platform's own identity — what every asset she generates inherits.",
  },
  "settings/setup/model-router": {
    title: "Model router",
    sub: "Which model answers, per tier, with the fallback behind it.",
  },
  "settings/setup/capabilities": {
    title: "Capability catalog",
    sub: "What Paige can do, and which tiers see it.",
  },
  "settings/setup/feature-flags": {
    title: "Feature flags",
    sub: "What's on, for whom, and what it costs to turn off.",
  },
  "settings/setup/api-mcp": {
    title: "API and MCP",
    sub: "How anything outside the platform reaches her, and under what scope.",
  },

  /* ── Settings · Integrations (CD 6389) ───────────────────────────────── */
  "settings/integrations/connected": {
    title: "Connected",
    sub: "Every service the platform holds a connection to, and what each one is for.",
    anchor:
      "Every integration is scoped. No connection can read one tenant's data from another " +
      "tenant's context, whatever its scope says.",
    cta: "+ Connect a service",
  },
  "settings/integrations/health": {
    title: "Health",
    sub: "Delivery, tokens and last successful call — the honest state of every connection.",
  },
  "settings/integrations/available": {
    title: "Available",
    sub: "What the platform could connect to and has not.",
  },

  /* ── Settings · Platform Team (CD 6859) ──────────────────────────────── */
  "settings/team/seats": {
    title: "Platform seats",
    sub: "Who operates the platform. One super_admin, delegated seats below.",
    cta: "+ Invite a seat",
  },
  "settings/team/roles": {
    title: "Roles",
    sub: "What each platform role can reach. Distinct from any tenant's own team.",
  },

  /* ── Settings · Platform Vault (CD 6336) ─────────────────────────────── */
  "settings/vault/obligations": {
    title: "Obligations",
    sub: "The platform's own commitments — dates she watches so you do not have to.",
    cta: "+ Add an obligation",
  },
  "settings/vault/vendors": {
    title: "Vendors",
    sub: "What the platform pays, and what happens if each one stops.",
  },
  "settings/vault/documents": {
    title: "Documents",
    sub: "Contracts, policies and filings the platform itself holds.",
  },

  /* ── Settings · Governance (CD 4971) ─────────────────────────────────── */
  "settings/governance/approvals": {
    title: "Approvals",
    sub: "Everything she has drafted and is holding for your ruling.",
  },
  "settings/governance/audit-log": {
    title: "Audit log",
    sub: "Every operator action on the platform, in order, with a name against it.",
  },
  "settings/governance/act-as-history": {
    title: "Act-as history",
    sub: "Every tenant you entered, how long, and what you could reach while you were there.",
  },
  "settings/governance/security": {
    title: "Security posture",
    sub: "Seats, sign-ins, and anything that tried a door it shouldn't.",
  },
};

/**
 * The honest body every registry spec ships with. A tab gets a real body only when a real
 * source is bound to it at the call site — never here, and never as a plausible placeholder.
 */
function notWiredBlock(title: string): PanelBlock {
  return {
    id: "not-wired",
    title,
    // Spans the grid. The analytics tabs lay their bodies out in two columns, and a single
    // half-width card beside an empty column reads as a broken layout rather than a stated gap.
    wide: true,
    body: {
      kind: "notWired",
      what: "This surface is not connected to a platform source yet.",
      needs:
        "The route, the layout and the copy are real; the data is not, because nothing is reading " +
        "it. It stays empty on purpose — a stand-in figure here would be indistinguishable from a " +
        "platform record, and the operator would have no way to tell.",
    },
  };
}

/** The key a branch/sub/leaf resolves to. Exported so callers can look a spec up by route. */
export function panelSpecKey(branchSlug: string, subSlug: string, leafSlug?: string): string {
  return leafSlug ? `${branchSlug}/${subSlug}/${leafSlug}` : `${branchSlug}/${subSlug}`;
}

/**
 * The ported panels, in one lookup.
 *
 * These carry Claude Design's ACTUAL panel content per tab — its KPI strip, its group chips,
 * its structured blocks, its anchor — with every value that would be DATA left null so the
 * renderer prints an em dash. That distinction is the whole point: the structure is the design
 * and comes over verbatim; only CD's invented figures stay out (§13). The `COPY` table below
 * remains the fallback for a tab no lot has ported yet, and prints an honest stand-in.
 *
 * Later spreads win on key collision, but the lots partition the tree by section, so a
 * collision would itself be the bug — `assertPanelSpecCoverage()` and the specs test guard it.
 */
const PORTED: Record<string, OperatorPanelSpec> = {
  ...FLEET_SPECS,
  ...PAIGE_SPECS,
  ...MONEY_SPECS,
  ...OPS_SPECS,
  ...PLATFORM_SPECS,
};

/**
 * The spec for one addressable tab, or `null` when neither registry has copy for it — the
 * caller renders its own honest stand-in rather than a half-built panel.
 */
export function getPanelSpec(
  branchSlug: string,
  subSlug: string,
  leafSlug?: string,
): OperatorPanelSpec | null {
  const key = panelSpecKey(branchSlug, subSlug, leafSlug);
  const ported = PORTED[key];
  if (ported) return ported;

  const copy = COPY[key];
  if (!copy) return null;

  const eyebrow =
    branchSlug === "settings"
      ? (EYEBROW_BY_SETTINGS_SECTION[subSlug] ?? "PLATFORM")
      : (EYEBROW_BY_BRANCH[branchSlug] ?? "PLATFORM");

  return {
    eyebrow,
    title: copy.title,
    subtitle: copy.sub,
    anchor: copy.anchor,
    // Labels only — no handler, so the CTA renders disabled until a surface can perform it.
    primaryCta: copy.cta ? { label: copy.cta } : undefined,
    secondaryCta: copy.secondaryCta ? { label: copy.secondaryCta } : undefined,
    blocks: [notWiredBlock(copy.title)],
  };
}

/** Every `branch/sub[/leaf]` key the operator tree addresses, in registry order. */
export function operatorPanelKeys(): string[] {
  const keys: string[] = [];
  const walk = (branch: Branch, sub: SubTab) => {
    if (sub.subtabs?.length) {
      sub.subtabs.forEach((leaf) => keys.push(panelSpecKey(branch.slug, sub.slug, leaf.slug)));
    } else {
      keys.push(panelSpecKey(branch.slug, sub.slug));
    }
  };
  OPERATOR_BRANCHES.forEach((b) => (b.subtabs ?? []).forEach((s) => walk(b, s)));
  return keys;
}

/**
 * Coverage check against OPERATOR_BRANCHES — the one home for the tree (§18). Returns the
 * addressable tabs with no spec and the specs that address nothing, so a branch added to the
 * registry without copy surfaces as a named gap instead of a blank panel. Used by tests and
 * callable from a console; it never throws in render.
 */
export function assertPanelSpecCoverage(): { missing: string[]; orphaned: string[] } {
  const addressed = new Set(operatorPanelKeys());
  const specced = new Set(Object.keys(COPY));
  return {
    missing: [...addressed].filter((k) => !specced.has(k)),
    orphaned: [...specced].filter((k) => !addressed.has(k)),
  };
}
