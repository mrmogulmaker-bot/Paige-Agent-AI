// paige-routes.js — canonical route registry for the Platform Operator (God-tier) shell.
//
// One source of truth, used three ways:
//   1. the shell reads/writes window.location.hash so every surface is deep-linkable
//   2. Paige calls PAIGE_ROUTES.find(...) to navigate herself ("open provisioning history")
//   3. Claude Code maps each `path` onto real framework routes without re-deriving the tree
//
// Path convention: /operator/<section>/<subsection>, all lowercase, hyphenated.
// `view` and `tab` are the shell's internal state keys — the contract between the
// URL and the running component. Do not rename them without updating the shell.
//
// Every entry carries `intent` — a plain-language description Paige matches against
// so she can resolve "where do I approve a tier change" without a hardcoded map.
(function () {
  const R = [];
  const S = (section, label, view, group, subs) =>
    subs.forEach(([sub, subLabel, tab, intent]) => R.push({
      path: "/operator/" + section + (sub ? "/" + sub : ""),
      section, label, subLabel, view, tab, group, intent,
      title: subLabel ? label + " · " + subLabel : label
    }));

  // ── The Fleet ────────────────────────────────────────────────────────────────
  S("fleet", "Fleet Console", "fleet", "fleet", [
    ["", "Systems Check", "main", "platform health, seams, failing checks, incident state"],
    ["tenants", "Tenants", "console", "every tenant, their tier, MRR, health, enter a tenant"],
    ["history", "History", "hist", "past incidents and resolved seam failures"],
    ["alert-rules", "Alert rules", "rules", "what pages whom, thresholds, escalation windows"],
    ["team-pulse", "Team Pulse", "pulse", "platform staff load, who is carrying what"],
    ["prospects", "Prospect Pipeline", "pipe", "inbound tenant prospects, deal stages"]
  ]);

  S("paige", "Paige", "workspace", "fleet", [
    ["", "Chat", "main", "talk to her, ask anything, her drafts and dispatch traces"],
    ["knowledge", "Knowledge", "know", "her second brain, corpus domains, what she has read"],
    ["sandbox", "Sandbox", "sandbox", "what she is building, the workbench, test runs"],
    ["research", "Research", "research", "open research threads and sourced findings"],
    ["memory", "Memory", "memory", "what she remembers, per tenant and platform-wide"],
    ["documents", "Documents", "docs", "source documents she cites, upload and index"],
    ["playbooks", "Playbooks", "plays", "methodology anchors and canonical frameworks"],
    ["sub-agents", "Sub-agents", "agents", "the thirteen specialists she dispatches to"],
    ["actions", "Actions", "actions", "the action bus, what she may execute"],
    ["skills", "Skills", "skills", "the skills library and what each costs to run"],
    ["team", "Team", "wteam", "her department model and who owns each"]
  ]);

  S("trust-compass", "Trust Compass", "compass", "fleet", [
    ["", "Autonomy", "main", "per-department autonomy knobs, draft ask send lanes"],
    ["escalations", "Escalations", "esc", "what she held for a human and why"],
    ["dependencies", "Dependencies", "deps", "what a lane depends on before it can widen"]
  ]);

  S("calendar", "Calendar", "calendar", "fleet", [
    ["", "Month", "main", "the platform calendar, maintenance windows, releases, bookings"],
    ["booking-links", "Booking links", "links", "what people can book, duration, buffers, questions"],
    ["settings", "Settings", "avail", "weekly hours, buffers, limits, conflict rules, reminders"],
    ["tasks", "Tasks", "tasks", "dated work items and their owners"]
  ]);

  S("marketplace", "Marketplace", "market", "fleet", [
    ["", "Discover", "main", "the store front, featured, shelves, top charts"],
    ["build", "Build", "build", "listings the platform is building before submission"],
    ["submissions", "Submissions", "subs", "tenant submissions awaiting moderation"],
    ["publishers", "Publishers", "pubs", "who publishes, their revenue share and standing"]
  ]);

  S("growth", "Growth", "growth", "fleet", [
    ["", "Brand Kit", "main", "the platform's own identity and marketing voice"],
    ["social", "Social", "social", "connected social channels and posting cadence"],
    ["pages", "Pages", "pages", "marketing pages and their performance"],
    ["funnels", "Funnels", "funnels", "acquisition funnels and conversion steps"],
    ["forms", "Forms", "forms", "capture forms and where they write"],
    ["assets", "Assets", "assets", "the asset library, generated and uploaded"],
    ["builders", "Builders", "builders", "who builds what, and the Vibe Studio handoff"]
  ]);

  S("automations", "Automations", "autos", "fleet", [
    ["", "Library", "main", "every persistent rule she runs, its trigger and lane"],
    ["runs", "Runs", "runs", "the firing timeline, what ran, held or failed"],
    ["build", "Build", "build", "author a new rule by talking to her"]
  ]);

  S("analytics", "Analytics", "analytics", "fleet", [
    ["", "Brief", "main", "what changed since yesterday and what it means"],
    ["revenue", "Revenue", "rev", "MRR, tier margin, metered share, LTV to CAC"],
    ["support", "Support", "sup", "response time by tier, safety-valve escalations"],
    ["retention", "Retention", "ret", "logo and revenue retention, quiet tenants, cohorts"],
    ["product", "Product", "product", "surface adoption, activation, what nobody touches"],
    ["autonomy", "Autonomy", "auto", "unattended share, held share, your agreement rate"],
    ["marketing", "Marketing", "mkt", "MER, attribution gap, channel ROAS, blended CAC"],
    ["comms", "Comms", "comms", "open and acknowledgment rates on platform sends"],
    ["forecast", "Forecast", "fc", "churn scores with drivers, upsell propensity, outlook"],
    ["performance", "Performance", "perf", "p95 latency, uptime, cost per answer"]
  ]);

  S("revenue", "Revenue", "revenue", "fleet", [
    ["", "Plans", "main", "the plan ladder, base price, entitlements per tier"],
    ["metering", "Metering", "meters", "metered units, allowances, credit wallets, overage"],
    ["invoices", "Invoices", "inv", "issued invoices, dunning state, failed payments"],
    ["at-risk", "At risk", "risk", "revenue at risk and the reason for each"]
  ]);

  S("support", "Platform Support", "support", "fleet", [
    ["", "Inbox", "main", "tenant tickets, her drafted replies, approve and send"],
    ["escalations", "Escalations", "esc", "sub-accounts who reached past a silent agency"],
    ["response-policy", "Response policy", "policy", "SLA per tier, valve threshold, her lane on support"]
  ]);

  S("comms", "Comms", "comms", "fleet", [
    ["", "Outbound", "main", "what the platform is telling tenants, awaiting approval"],
    ["templates", "Templates", "tpl", "reusable send shapes and which she drafts unasked"],
    ["sent-log", "Sent log", "log", "everything sent, delivery and acknowledgment"]
  ]);

  S("provisioning", "Provisioning", "provisioning", "business", [
    ["", "Pipeline", "main", "provisioning requests waiting on a ruling"],
    ["history", "History", "hist", "provisioned tenants and whether they ever arrived"]
  ]);

  // ── Settings (the back menu) ─────────────────────────────────────────────────
  S("settings/setup", "Setup", "config", "settings", [
    ["", "Operator", "main", "your profile, access, session, how she signs as you"],
    ["brand-kit", "Brand kit", "brand", "platform tokens, mark, type, words never to use"],
    ["model-router", "Model router", "router", "which model answers per tier and its fallback"],
    ["capabilities", "Capabilities", "caps", "what she can do and which tiers see it"],
    ["feature-flags", "Feature flags", "flags", "what is on, for whom, and the cost to turn off"],
    ["api-mcp", "API & MCP", "api", "scoped keys, the MCP endpoint, rotation and revoke"]
  ]);

  S("settings/integrations", "Integrations", "integrations", "settings", [
    ["", "Connected", "main", "live connections and what each one reaches"],
    ["health", "Health", "health", "sync freshness, failures, reauth needed"],
    ["available", "Available", "avail", "what can be connected but is not yet"]
  ]);

  S("settings/team", "Platform Team", "team", "settings", [
    ["", "Seats", "main", "platform staff seats and their access level"],
    ["roles", "Roles", "roles", "what each role unlocks, admin and export rights"]
  ]);

  S("settings/vault", "Platform Vault", "vault", "settings", [
    ["", "Obligations", "main", "policies, licences, filings and their dates"],
    ["vendors", "Vendors", "vendors", "who the platform pays and for what"],
    ["documents", "Documents", "docs", "contracts, certificates, sealed records"]
  ]);

  S("settings/governance", "Governance", "governance", "settings", [
    ["", "Approvals", "main", "approve or reject a ruling, tier change, anything she cannot do alone"],
    ["audit-log", "Audit log", "audit", "immutable record of every consequential action"],
    ["act-as-history", "Act-as history", "actas", "every time an operator entered a tenant"],
    ["security", "Security", "security", "posture, sealed-record reveals, session policy"]
  ]);

  // ── Modal and overlay states, addressable so she can open one directly ───────
  const OVERLAYS = [
    { path: "/operator/paige/side-chat", state: "sideChat", intent: "her chat as a drawer over whatever surface is open" },
    { path: "/operator/marketplace/listing/:id", state: "mkItem", intent: "one marketplace listing in full" },
    { path: "/operator/fleet/tenant/:id", state: "tenant", intent: "one tenant's record" },
    { path: "/operator/fleet/act-as/:id", state: "acting", intent: "enter a tenant and act as them, logged to governance" },
    { path: "/operator/support/thread/:id", state: "supThread", intent: "one support thread with her draft" },
    { path: "/operator/comms/compose/:id", state: "compose", intent: "one outbound send, drafted, awaiting approval" }
  ];

  // ── Data classes: what a surface reads. One name per query contract. ─────────
  const READS = {
    tenants: "every tenant with tier, plan, MRR, health, parent",
    seams: "platform seam health and last check result",
    incidents: "open and resolved incidents with their timeline",
    prov_requests: "provisioning requests, their ask and their state",
    autonomy: "per-department autonomy lane per tenant",
    escalations: "what she held for a human, with the reason",
    automations: "persistent rules, their trigger, lane and owner",
    runs: "every automation firing with status and duration",
    tickets: "support threads, their tier, age and draft state",
    comms_sends: "platform outbound, its audience and delivery",
    invoices: "issued invoices, dunning state, failed payments",
    meters: "metered usage, allowances and credit wallets",
    plans: "the plan ladder and entitlements per tier",
    corpus: "her knowledge domains and document counts",
    memories: "what she remembers, scoped per tenant",
    listings: "marketplace listings, installs, ratings, tier reach",
    submissions: "tenant submissions awaiting moderation",
    calendar_events: "dated platform commitments across every layer",
    booking_links: "what can be booked and under which schedule",
    schedules: "named availability objects and their overrides",
    staff: "platform seats, roles and access level",
    obligations: "policies, licences, filings and their dates",
    integrations: "connections, sync freshness and scope",
    audit: "the immutable action record",
    metrics: "aggregated fleet metrics for a named lens",
    forecasts: "churn and expansion scores with their drivers",
    ad_spend: "spend and platform-claimed conversions per channel",
    assets: "generated and uploaded brand assets",
    funnels: "acquisition funnels and their conversion steps",
    skills: "the skills library and per-run cost",
    agents: "the specialist sub-agents and their dispatch history",
    keys: "scoped API and MCP keys",
    flags: "feature flags and their audience"
  };

  // ── Action kinds: what she may DO on a surface, and who must approve. ────────
  // lane: green = she sends, amber = she drafts and you approve, red = human only
  const ACTS = {
    draft_reply: { label: "Draft a support reply", lane: "amber", reads: ["tickets", "corpus"] },
    send_reply: { label: "Send an approved reply", lane: "amber", reads: ["tickets"] },
    draft_comms: { label: "Draft a platform notice", lane: "amber", reads: ["comms_sends", "tenants"] },
    send_comms: { label: "Send a notice", lane: "red", reads: ["comms_sends"] },
    approve_prov: { label: "Approve a provisioning request", lane: "red", reads: ["prov_requests"] },
    prefill_prov: { label: "Pre-fill a provisioning config", lane: "green", reads: ["prov_requests", "plans"] },
    set_autonomy: { label: "Change an autonomy lane", lane: "red", reads: ["autonomy"] },
    propose_autonomy: { label: "Propose a lane change with evidence", lane: "green", reads: ["autonomy", "runs"] },
    run_automation: { label: "Fire a rule now", lane: "amber", reads: ["automations"] },
    author_automation: { label: "Author a rule from conversation", lane: "amber", reads: ["automations", "skills"] },
    repair_seam: { label: "Apply a drafted seam fix", lane: "amber", reads: ["seams", "integrations"] },
    bill_overage: { label: "Bill an unbilled overage", lane: "red", reads: ["meters", "invoices"] },
    retry_payment: { label: "Retry a failed payment", lane: "amber", reads: ["invoices"] },
    moderate_listing: { label: "Approve or return a submission", lane: "red", reads: ["submissions"] },
    publish_listing: { label: "Publish a platform listing", lane: "red", reads: ["listings"] },
    book_time: { label: "Hold a slot on the calendar", lane: "amber", reads: ["calendar_events", "schedules"] },
    offer_times: { label: "Offer times without committing", lane: "green", reads: ["schedules"] },
    index_document: { label: "Read and index a document", lane: "green", reads: ["corpus"] },
    write_memory: { label: "Record something she learned", lane: "green", reads: ["memories"] },
    act_as: { label: "Enter a tenant and act as them", lane: "red", reads: ["tenants", "audit"] },
    rotate_key: { label: "Rotate or revoke a key", lane: "red", reads: ["keys"] },
    generate_asset: { label: "Generate a brand asset", lane: "amber", reads: ["assets"] }
  };

  // which data classes and actions belong to which section
  const CAP = {
    fleet: { reads: ["tenants", "seams", "incidents", "staff"], acts: ["repair_seam", "act_as"] },
    paige: { reads: ["corpus", "memories", "skills", "agents"], acts: ["index_document", "write_memory", "author_automation"] },
    "trust-compass": { reads: ["autonomy", "escalations"], acts: ["set_autonomy", "propose_autonomy"] },
    calendar: { reads: ["calendar_events", "booking_links", "schedules"], acts: ["book_time", "offer_times"] },
    marketplace: { reads: ["listings", "submissions"], acts: ["moderate_listing", "publish_listing"] },
    growth: { reads: ["assets", "funnels", "ad_spend"], acts: ["generate_asset"] },
    automations: { reads: ["automations", "runs"], acts: ["run_automation", "author_automation"] },
    analytics: { reads: ["metrics", "forecasts", "ad_spend"], acts: [] },
    revenue: { reads: ["plans", "meters", "invoices"], acts: ["bill_overage", "retry_payment"] },
    support: { reads: ["tickets"], acts: ["draft_reply", "send_reply"] },
    comms: { reads: ["comms_sends", "tenants"], acts: ["draft_comms", "send_comms"] },
    provisioning: { reads: ["prov_requests", "plans"], acts: ["approve_prov", "prefill_prov"] },
    "settings/setup": { reads: ["keys", "flags"], acts: ["rotate_key"] },
    "settings/integrations": { reads: ["integrations"], acts: ["repair_seam"] },
    "settings/team": { reads: ["staff"], acts: [] },
    "settings/vault": { reads: ["obligations"], acts: [] },
    "settings/governance": { reads: ["audit", "prov_requests"], acts: ["approve_prov"] }
  };

  // attach capability to every route
  R.forEach(r => {
    const c = CAP[r.section] || { reads: [], acts: [] };
    r.reads = c.reads;
    r.acts = c.acts;
  });

  const ROUTES = {
    version: 1,
    tier: "operator",
    base: "/operator",
    // how the shell encodes state in the URL today; swap for real history routing later
    hashPrefix: "#",
    routes: R,
    overlays: OVERLAYS,

    // Paige's entry points ────────────────────────────────────────────────────
    byPath: p => R.find(r => r.path === p) || null,
    byState: (view, tab) => R.find(r => r.view === view && r.tab === (tab || "main")) || null,
    // loose intent match: "where do I approve a tier change" → governance/approvals
    find: q => {
      // crude stem: drop common suffixes so "approve" matches "approval", "ruling" matches "rule"
      const stem = w => w.replace(/(ings|ing|ions|ion|als|al|ed|es|s)$/, "");
      const STOP = ["where", "what", "which", "does", "when", "open", "show", "find", "this", "that", "with", "from", "into", "have"];
      const t = String(q || "").toLowerCase().split(/[^a-z]+/)
        .filter(w => w.length > 3 && STOP.indexOf(w) < 0).map(stem).filter(Boolean);
      if (!t.length) return null;
      let best = null, top = 0;
      R.forEach(r => {
        const words = (r.title + " " + r.intent + " " + r.path).toLowerCase().split(/[^a-z]+/).map(stem);
        // title words weigh double — the label is what an operator says out loud
        const titleWords = (r.title + " " + r.subLabel).toLowerCase().split(/[^a-z]+/).map(stem);
        const score = t.reduce((n, w) =>
          n + (words.indexOf(w) >= 0 ? 1 : 0) + (titleWords.indexOf(w) >= 0 ? 1 : 0), 0);
        if (score > top) { top = score; best = r; }
      });
      return top ? best : null;
    },
    all: () => R.slice(),
    sections: () => [...new Set(R.map(r => r.section))],

    // ── Paige's capability lookups ────────────────────────────────────────────
    dataClasses: READS,
    actionKinds: ACTS,
    // "what can I read here" / "what can I do here"
    capabilityAt: path => {
      const r = R.find(x => x.path === path);
      if (!r) return null;
      return {
        path: r.path, title: r.title,
        reads: r.reads.map(k => ({ name: k, describes: READS[k] })),
        acts: r.acts.map(k => ({ name: k, ...ACTS[k] }))
      };
    },
    // "which surface owns this action" — she resolves the address from the verb
    routeForAction: kind => R.find(r => r.acts.indexOf(kind) >= 0) || null,
    // "which surfaces read this data" — for invalidation after she writes
    routesReading: dataClass => R.filter(r => r.reads.indexOf(dataClass) >= 0).map(r => r.path),
    // everything she may do without asking, and everything that needs you
    actionsByLane: lane => Object.keys(ACTS).filter(k => ACTS[k].lane === lane)
      .map(k => ({ name: k, ...ACTS[k], at: (R.find(r => r.acts.indexOf(k) >= 0) || {}).path || null })),
    // the sandbox contract: same call, shadow scope, nothing lands
    dryRun: (kind, args) => ({
      mode: "sandbox",
      action: kind,
      lane: (ACTS[kind] || {}).lane || "unknown",
      at: (R.find(r => r.acts.indexOf(kind) >= 0) || {}).path || null,
      reads: (ACTS[kind] || {}).reads || [],
      args: args || {},
      writes: false,
      note: "Resolve against the shadow scope, return the diff, land nothing."
    })
  };

  if (typeof window !== "undefined") window.PAIGE_ROUTES = ROUTES;
  if (typeof module !== "undefined" && module.exports) module.exports = ROUTES;
})();
