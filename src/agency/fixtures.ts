// @ts-nocheck
// Ported design fixtures for the Claude Design "CRM agency mode" pack.
// EVERY data const + honesty flag extracted VERBATIM from the design source
// `Agency Shell.dc.html` (§13 — a fixture is a fixture; values are not invented,
// cleaned up, or re-typed). Mirrors how src/solo/_shared.tsx holds the Solo pack's
// DATA. §63: decorative fixture names (Ridgeline, Bellweather, Meridian, Cook & Co,
// Antonio Cook, etc.) are the DESIGN's own — they are NEVER wired to any real owner
// account and carry no platform meaning.
//
// SCOPE: this file holds DATA only. View-descriptor builders and geometry/color math
// from the source (spark, pstr, AV, TM_SUB_DATA, TEAM_VIEW, SETUP_VIEW, the TM_*
// copy-derivation cluster, tmLoadColor/tmUtilColor/tmInit) are RENDER LOGIC and are
// deliberately NOT here — they belong in the component/helper layer the integrator
// builds (see the honest gap note at the bottom of the crew report). Every export
// below is a plain data literal (or a pure, self-contained seeded data generator).

// ── Palette anchors (source lines 6369, 6730) ──────────────────────────────
export const GOLD = "#C8A02E", GREEN = "#2F7A57", AMBER = "#B5822A", RED = "#BE4A3C";
export const TM_GREEN = "#2F7A57", TM_AMBER = "#B5822A", TM_RED = "#9F3A2A", TM_BLUE = "#2F6B8F", TM_GOLD = "#C8A02E";

// ── DC editor props (source line 6368 data-props) ──────────────────────────
// Component-configuration defaults declared by the design's DCLogic props block.
// Not fixture rows — the integrator wires these as component props/flags.
export const PROPS_DEFAULTS = {
  accentGold: "#C8A02E",   // options: #C8A02E · #B4881F · #8A6D1E · #1D1D26
  brandCascade: true,      // Sub-account mode
  fleetColumns: 3          // Fleet view · range 2–4
};

// ── Sub-accounts (SUBS, 6381) ──────────────────────────────────────────────
export const SUBS = [
  { name: "Sarah's Coaching Practice", color: "#7C6CE0", health: 87, drafts: 2, mrr: "$8,400", tenure: "14 months", note: "Renewal draft ready" },
  { name: "Ridgeline Outdoor Co.", color: "#3F7F5C", health: 62, drafts: 5, mrr: "$2,400", tenure: "8 months", note: "Broken pixel, 6 days lost" },
  { name: "Northwind Dental Group", color: "#2F6FA8", health: 95, drafts: 0, mrr: "$3,600", tenure: "22 months", note: "Nothing needs you" },
  { name: "Coach James Fitness", color: "#C1652F", health: 71, drafts: 3, mrr: "$1,900", tenure: "6 months", note: "Revenue 22% below plan" },
  { name: "Harbor & Vine Catering", color: "#A8425A", health: 84, drafts: 1, mrr: "$2,750", tenure: "11 months", note: "Q4 menu campaign queued" },
  { name: "Meridian Law Partners", color: "#6E7382", health: 91, drafts: 0, mrr: "$6,200", tenure: "19 months", note: "Intake running clean" },
  { name: "Bright Path Tutoring", color: "#B3932A", health: 78, drafts: 2, mrr: "$1,450", tenure: "4 months", note: "Waitlist needs a reply" },
  { name: "Copperline Roofing", color: "#9C5533", health: 66, drafts: 4, mrr: "$3,100", tenure: "9 months", note: "Lead response over 4 hours" },
  { name: "Studio Nine Pilates", color: "#3F958E", health: 89, drafts: 1, mrr: "$2,200", tenure: "16 months", note: "Membership renewals up" },
  { name: "Aldridge Financial Ops", color: "#5A69B8", health: 93, drafts: 0, mrr: "$7,800", tenure: "25 months", note: "Longest-tenured account" },
  { name: "Verde Landscaping", color: "#5A8C3F", health: 74, drafts: 2, mrr: "$1,680", tenure: "2 months", note: "New this month" },
  { name: "Loft & Line Interiors", color: "#8F5FA8", health: 81, drafts: 1, mrr: "$2,950", tenure: "1 month", note: "New this month" }
];

// ── Marketplace teaser items (ITEMS, 6396) ─────────────────────────────────
export const ITEMS = [
  { name: "Renewal Rescue Playbook", meta: "Playbook · $89/mo · you earn 20%" },
  { name: "Local Reviews Engine", meta: "Automation · $49/mo · you earn 20%" },
  { name: "No-Show Recovery Sequence", meta: "Sequence · $39/mo · you earn 25%" },
  { name: "Quarterly Offer Refresh", meta: "Playbook · $129/qtr · you earn 20%" },
  { name: "Pixel & Attribution Guard", meta: "Monitor · $29/mo · you earn 30%" },
  { name: "Intake Call Scorer", meta: "Agent skill · $79/mo · you earn 20%" },
  { name: "Seasonal Dip Defender", meta: "Playbook · $99/qtr · you earn 20%" }
];

// ── Department chips (DEPTS, 6406) ─────────────────────────────────────────
export const DEPTS = [
  { key: "Daily brief", icon: "◔", note: "3 things need you" },
  { key: "Client Success", icon: "◍", note: "2 drafts" },
  { key: "Growth", icon: "↗", note: "4 drafts" },
  { key: "Finance", icon: "▣", note: "2 drafts" },
  { key: "Marketing", icon: "✦", note: "3 drafts" },
  { key: "Operations", icon: "⚙", note: "1 draft" }
];

// ── Agency-scope draft queue (AGENCY_QUEUE, 6415) ──────────────────────────
export const AGENCY_QUEUE = {
  "Daily brief": [
    { title: "Three decisions carry the week", dept: "Daily brief", kind: "Brief", body: "Sarah's renewal ($8,400) closes the month. Ridgeline's pixel is bleeding attribution. Ops hits capacity if you sign one more sub-account without a hire.", primary: "Walk me through", meta: "read in 90s" },
    { title: "Your book held at zero churn for the seventh month", dept: "Daily brief", kind: "Note", body: "112% NRR. Two sub-accounts expanded, none left. The expansion came from Marketplace installs you curated in June.", primary: "See the detail", meta: "no action needed" }
  ],
  "Client Success": [
    { title: "Sarah's renewal draft is ready", dept: "Client Success", kind: "Email draft", body: "Her term ends in 23 days. The draft holds price, adds the group program she asked about in June, and references her best month.", primary: "Approve", meta: "94% confidence · ⏱ 2h" },
    { title: "Ridgeline's owner has gone quiet for 11 days", dept: "Client Success", kind: "Email draft", body: "Two unanswered check-ins. I wrote a short one that leads with the pixel fix rather than asking how things are going.", primary: "Approve", meta: "86% confidence · ⏱ 1d" }
  ],
  Growth: [
    { title: "Two prospects are past your follow-up window", dept: "Growth", kind: "Email draft", body: "Bellweather Studio and Hartline Group both asked for pricing nine days ago. Both follow-ups are written in your voice with the case study each asked about attached.", primary: "Send both", meta: "92% confidence · ⏱ 3h" },
    { title: "Your best-converting proof point has aged out", dept: "Growth", kind: "Decision", body: "The Northwind case study is 14 months old. Aldridge's numbers are stronger now and they have said yes to being named.", primary: "Approve", meta: "79% confidence · ⏱ 2d" }
  ],
  Finance: [
    { title: "Agency E&O policy renews in 12 days", dept: "Finance", kind: "Decision", body: "Same carrier quoted 8% higher. Two comparable quotes are lined up with the coverage differences side by side.", primary: "Approve", meta: "88% confidence · ⏱ 6h" },
    { title: "Ridgeline is unprofitable at its current retainer", dept: "Finance", kind: "Decision", body: "74 service hours against $2,400 last month. Reprice at $5,200 with scope boundaries, or a 60-day wind-down. Both are drafted.", primary: "Read both", meta: "91% confidence · ⏱ 1d" }
  ],
  Marketing: [
    { title: "September agency newsletter is written", dept: "Marketing", kind: "Sequence", body: "Leads with the retention number and the two Marketplace items your book installed most. 1,840 contacts.", primary: "Approve", meta: "89% confidence · ⏱ 5h" }
  ],
  Operations: [
    { title: "Ops is the constraint at 94% utilization", dept: "Operations", kind: "Decision", body: "You can take one more sub-account before quality slips. The next one without a hire pushes Ridgeline's rework further behind.", primary: "See the plan", meta: "84% confidence · ⏱ 11h" }
  ]
};

// ── Book-scope draft queue (BOOK_QUEUE, 6440) ──────────────────────────────
export const BOOK_QUEUE = {
  "Daily brief": [
    { who: "Ridgeline Outdoor Co.", title: "Broken purchase pixel, six days of attribution missing", dept: "Daily brief", kind: "Fix", body: "Their reporting has understated paid revenue since the 7th. I can patch the tag and backfill from Stripe.", primary: "Approve fix", meta: "97% confidence · ⏱ 6d" },
    { who: "Coach James Fitness", title: "Third month running 22% below plan", dept: "Daily brief", kind: "Decision", body: "I drafted the conversation, including the two offers that carried him last winter.", primary: "Read my draft", meta: "83% confidence · ⏱ 2d" }
  ],
  "Client Success": [
    { who: "Sarah's Coaching Practice", title: "Renewal note to her top client", dept: "Client Success", kind: "Email draft", body: "Retainer renews in 21 days, usage up 34% this quarter. Waiting on her approval, not yours — you can approve on her behalf.", primary: "Approve for her", meta: "94% confidence · ⏱ 2h" },
    { who: "Studio Nine Pilates", title: "12 memberships lapse this week", dept: "Client Success", kind: "Sequence", body: "Win-back sequence is drafted with the two class times that filled fastest last quarter.", primary: "Approve", meta: "90% confidence · ⏱ 1d" }
  ],
  Growth: [
    { who: "Bright Path Tutoring", title: "Waitlist of 34 has had no reply for 5 days", dept: "Growth", kind: "Sequence", body: "Fall cohort opens in two weeks. The invite is written and the seats are counted.", primary: "Approve", meta: "93% confidence · ⏱ 5d" },
    { who: "Copperline Roofing", title: "Lead response time is over four hours", dept: "Growth", kind: "Fix", body: "Storm-season leads go cold after 20 minutes. I can take first response on their behalf.", primary: "Turn it on", meta: "88% confidence · ⏱ 3d" }
  ],
  Finance: [
    { who: "Harbor & Vine Catering", title: "Two invoices 30 days past due ($6,900)", dept: "Finance", kind: "Sequence", body: "Both are corporate accounts that always pay after a nudge. Drafted in their voice, not mine.", primary: "Approve", meta: "95% confidence · ⏱ 4d" },
    { who: "Verde Landscaping", title: "Card on file expires in 6 days", dept: "Finance", kind: "Email draft", body: "First billing since onboarding. Worth a warm note rather than a system email.", primary: "Approve", meta: "96% confidence · ⏱ 6d" }
  ],
  Marketing: [
    { who: "Northwind Dental Group", title: "Q4 recall campaign ready", dept: "Marketing", kind: "Sequence", body: "1,240 patients past due for a cleaning. Same shape as the campaign that filled March.", primary: "Approve", meta: "92% confidence · ⏱ 1d" },
    { who: "Loft & Line Interiors", title: "First campaign since provisioning", dept: "Marketing", kind: "Sequence", body: "New sub-account. I would send this one to their owner for approval rather than approving it yourself.", primary: "Send to owner", meta: "80% confidence · ⏱ 2d" }
  ],
  Operations: [
    { who: "Meridian Law Partners", title: "Intake form drops 1 in 5 on mobile", dept: "Operations", kind: "Fix", body: "The conflict-check step asks for too much before the name field. A two-step version is ready to test.", primary: "Approve test", meta: "85% confidence · ⏱ 3d" }
  ]
};

// ── Support tickets, book scope (TICKETS, 6466) ────────────────────────────
export const TICKETS = [
  {
    who: "Coach James Fitness", cat: "Technical", status: "At risk", age: "5 business days", first: "no reply yet",
    summary: "Booking confirmations stopped going out after the calendar reconnect",
    conf: "91%", kb: "Calendar reconnect · confirmation templates",
    thread: [
      { from: "them", who: "James", when: "Mon 9:14am", text: "Nobody's getting their confirmation email since we reconnected the calendar last week. Two people showed up on the wrong day. Can someone look?" },
      { from: "them", who: "James", when: "Wed 8:02am", text: "Following up on this — it's still happening." }
    ],
    draft: "James — the reconnect dropped the confirmation template off your booking flow, so appointments were saving without sending anything. It's back on and I've re-sent confirmations to everyone booked through Friday. The two people who came on the wrong day both have new times in your calendar. I'll watch it through the weekend and tell you if anything looks off.",
    risk: true
  },
  {
    who: "Harbor & Vine Catering", cat: "Billing", status: "Drafted by Paige", age: "6 hours", first: "22 min",
    summary: "Asking why the September invoice is $340 higher than August",
    conf: "96%", kb: "Retainer overage · event add-ons",
    thread: [
      { from: "them", who: "Dana", when: "Today 7:41am", text: "September came in at $3,090 instead of $2,750. Did something change on our plan?" }
    ],
    draft: "Dana — nothing changed on your retainer. The extra $340 is the two extra event pages we built for the Fairmont weddings, billed at the add-on rate we agreed in June. Your base stays $2,750. If you'd rather roll a couple of event pages into the retainer each month I can price that out before October bills.",
    risk: false
  },
  {
    who: "Bright Path Tutoring", cat: "Usage", status: "Awaiting your approval", age: "1 day", first: "18 min",
    summary: "Wants to know how to add a second location to the intake form",
    conf: "93%", kb: "Multi-location intake · form routing",
    thread: [
      { from: "them", who: "Priya", when: "Yesterday 4:20pm", text: "We're opening the Eastside room in October. How do families pick which location when they sign up?" }
    ],
    draft: "Priya — I'll add a location step at the top of the intake form so families choose Eastside or Downtown before they see times, and each choice routes to that room's calendar. That keeps your existing waitlist intact. Want it live now, or held until you've confirmed the Eastside opening date?",
    risk: false
  },
  {
    who: "Ridgeline Outdoor Co.", cat: "Technical", status: "Drafted by Paige", age: "2 hours", first: "9 min",
    summary: "Proactive heads-up — purchase tracking was down since the 7th",
    conf: "97%", kb: "Pixel duplication · attribution backfill", proactive: true,
    thread: [
      { from: "paige", who: "Systems Check", when: "Today 6:30am", text: "Found a duplicated purchase pixel on Ridgeline's checkout. Ad reporting has understated revenue since the 7th. Fix is applied; drafting the heads-up from you." }
    ],
    draft: "Wanted you to know before you look at last week's numbers — your checkout was double-counting purchases, so the ad reports have been understating revenue since the 7th. It's fixed, and I've rebuilt the affected days from your Stripe records. Nothing was lost, and your real numbers are better than what you were seeing.",
    risk: false
  },
  {
    who: "Studio Nine Pilates", cat: "Feature request", status: "Sent", age: "2 days", first: "31 min",
    summary: "Asked for a waitlist auto-promote when someone cancels",
    conf: "88%", kb: "Waitlist automation",
    thread: [
      { from: "them", who: "Mel", when: "Mon 11:02am", text: "When someone cancels within 12 hours, can the next person on the waitlist get the spot automatically?" }
    ],
    draft: "Mel — yes. I'll auto-offer the open spot to the next person on the waitlist with a 90-minute window to claim it, then move down the list. You'll see who claimed what in your Monday recap. Turning it on for the 6am and 5:30pm classes first since those fill hardest.",
    risk: false
  },
  {
    who: "Meridian Law Partners", cat: "Usage", status: "Resolved", age: "4 days", first: "12 min",
    summary: "Intake form conflict-check step confused two new clients",
    conf: "94%", kb: "Two-step intake · conflict check",
    thread: [
      { from: "them", who: "Ellen", when: "Fri 2:15pm", text: "Two people called saying the form asked for case details before their name. Can we simplify?" }
    ],
    draft: "Ellen — split it into two steps: name and contact first, conflict details after. Live now, and the two callers both have completed records. Mobile completion is already up from 79% to 94% since the change.",
    risk: false
  },
  {
    who: "Verde Landscaping", cat: "Billing", status: "Awaiting your approval", age: "3 hours", first: "14 min",
    summary: "Card on file expires before the next billing date",
    conf: "95%", kb: "Card expiry · first billing",
    thread: [
      { from: "them", who: "Marco", when: "Today 10:05am", text: "Got a note that my card expires. Where do I update it?" }
    ],
    draft: "Marco — here's the secure link to update it, takes about a minute. Nothing lapses in the meantime; your next charge isn't until the 1st. First billing since we set you up, so if the amount looks different than you expected, tell me and I'll walk you through the line items.",
    risk: false
  }
];

// ── Support tickets, sub-account scope (SUB_TICKETS, 6540) ─────────────────
export const SUB_TICKETS = [
  {
    cat: "Usage", status: "Awaiting your approval", age: "4 hours", first: "11 min",
    summary: "Client asked whether the group program can be paid in three instalments",
    conf: "93%", kb: "Payment plans · group program",
    thread: [{ from: "them", who: "Dana Whitfield", when: "Today 9:12am", text: "Loved the call. Is there any way to split the group program across three payments instead of paying it all up front?" }],
    draft: "Dana — yes, three monthly payments works. I'll send the same enrolment link with the instalment option turned on, and your start date doesn't change. If the second or third payment ever needs moving a week, just tell me and I'll shift it.",
    risk: false
  },
  {
    cat: "Technical", status: "Drafted by Paige", age: "1 hour", first: "6 min",
    summary: "Proactive heads-up — replay page was slow on mobile for two days",
    conf: "96%", kb: "Replay page · mobile performance", proactive: true,
    thread: [{ from: "paige", who: "Systems Check", when: "Today 6:40am", text: "The webinar replay page took over 9 seconds to load on mobile Tuesday and Wednesday. Cause was an oversized hero video. Fixed; drafting the heads-up from you to the eleven people who hit it." }],
    draft: "Wanted to get ahead of this — if the replay was slow to load for you earlier this week, that was on my end and it's fixed now. It should open right away. If you gave up on it before, here's the link again, and the workbook is attached this time.",
    risk: false
  }
];

// ── Agency identity + top-line counters (AGENCY, 6559) ─────────────────────
export const AGENCY = {
  operator: "Antonio Cook", operatorFirst: "Antonio", initials: "AC",
  plan: "Agency plan", provider: "Provided by Cook & Co",
  subCount: 12, hoursSaved: 847, departments: 10, departmentsWord: "Six",
  billedThisMonth: "$58,400", decisionsWaiting: 3, bookHealth: 82, needAttention: 3,
  autopilotPct: 62, teamCount: 8, slammed: 3, available: 2,
  vaultAgencyObligations: 23, vaultBookObligations: 19, vaultDue30: 8, vaultNeedAction: 4,
  today: "WEDNESDAY, AUGUST 13", greetingWord: "Good morning",
  pipeProspects: 8, pipeWeighted: "$47K", pipeClosing: 3,
  checksTotal: 30, checksLive: 16
};

// ── KPI tiles (AGENCY_KPI_DATA 6571, SUB_KPI_DATA 6578) ────────────────────
export const AGENCY_KPI_DATA = [
  { label: "MRR FROM SUB-ACCOUNTS", value: "$44,430", delta: "+7.5%", up: true, seed: 1.1 },
  { label: "SUB-ACCOUNT NRR", value: "112%", delta: "+6 pts", up: true, seed: 2.3 },
  { label: "HOURS PAIGE SAVED", value: "847", delta: "this month", up: true, seed: 3.5, neutral: true },
  { label: "TEAM UTILIZATION", value: "78%", delta: "ops at 94%", up: false, seed: 4.2 }
];

export const SUB_KPI_DATA = [
  { label: "MRR", value: "$23,230", delta: "+8.4%", up: true, seed: 1.4 },
  { label: "NET REVENUE RETENTION", value: "112%", delta: "+6 pts", up: true, seed: 2.2 },
  { label: "HOURS PAIGE SAVED", value: "147", delta: "this month", up: true, seed: 3.1, neutral: true },
  { label: "APPROVAL RATE", value: "89%", delta: "–2%", up: false, seed: 4.7 }
];

// ── Systems Check clusters + findings (CLUSTERS 6585, FINDINGS 6612) ───────
export const CLUSTERS = [
  {
    key: "Infrastructure", health: 96, pass: 6, total: 6, note: "Site, SSL, DNS, backups",
    items: [{ n: "Marketing site uptime", ok: true }, { n: "SSL certificate", ok: true }, { n: "DNS records", ok: true }, { n: "Nightly backups", ok: true }, { n: "CDN cache", ok: true }, { n: "Page weight", ok: true }]
  },
  {
    key: "Marketing & tracking", health: 88, pass: 4, total: 5, note: "Pixels, UTMs, consent",
    items: [{ n: "Pricing-page pixel", ok: false }, { n: "UTM hygiene", ok: true }, { n: "Consent banner", ok: true }, { n: "Analytics goals", ok: true }, { n: "Ad account link", ok: true }]
  },
  {
    key: "Forms & booking", health: 72, pass: 3, total: 5, note: "Discovery-call calendar",
    items: [{ n: "Discovery-call availability", ok: false }, { n: "Booking confirmations", ok: true }, { n: "Contact form delivery", ok: true }, { n: "Mobile form completion", ok: false }, { n: "Calendar sync", ok: true }]
  },
  {
    key: "Comms & deliverability", health: 64, pass: 3, total: 5, note: "Outbound acquisition sends",
    items: [{ n: "DMARC alignment", ok: false }, { n: "SPF record", ok: true }, { n: "Bounce rate", ok: false }, { n: "Reply routing", ok: true }, { n: "Unsubscribe handling", ok: true }]
  },
  {
    key: "Payments & ops", health: 94, pass: 5, total: 5, note: "Platform billing Stripe",
    items: [{ n: "Stripe connection", ok: true }, { n: "Failed-charge retries", ok: true }, { n: "Invoice delivery", ok: true }, { n: "Payout schedule", ok: true }, { n: "Tax settings", ok: true }]
  },
  {
    key: "Data quality", health: 91, pass: 4, total: 4, note: "Prospect + team records",
    items: [{ n: "Duplicate prospects", ok: true }, { n: "Missing owner fields", ok: true }, { n: "Stale records", ok: true }, { n: "Team assignments", ok: true }]
  }
];

export const FINDINGS = [
  {
    cluster: "Comms & deliverability", cost: "$6,200 at risk", tone: "red", age: "since Monday",
    title: "Your acquisition domain is failing DMARC on 1 in 6 sends",
    body: "Your outbound to prospects is landing in spam for Outlook recipients — six of the last thirty-eight sends bounced to junk. Bellweather and Hartline are both Outlook shops. The DNS record fix is one line and I have it written.",
    fix: "Apply the DNS fix"
  },
  {
    cluster: "Forms & booking", cost: "3 calls lost", tone: "amber", age: "9 days",
    title: "Discovery-call calendar shows no availability past next Tuesday",
    body: "Your booking window is set to 14 days but your calendar is blocked solid after Tuesday, so prospects see an empty page and leave. Three did last week. I can open the two-hour Thursday block you keep for admin.",
    fix: "Open Thursday slots"
  },
  {
    cluster: "Marketing & tracking", cost: "attribution blind", tone: "amber", age: "since the 3rd",
    title: "Your own site's conversion pixel stopped firing on the pricing page",
    body: "You cannot tell which channel is producing sub-account prospects right now. The tag is present but the pricing page template lost the trigger in the last edit. Restoring it does not affect anything else.",
    fix: "Restore the trigger"
  },
  {
    cluster: "Infrastructure", cost: "renews in 9 days", tone: "amber", age: "flagged today",
    title: "paigeagency.com SSL renews in 9 days with auto-renew off",
    body: "Nothing is broken yet. If it lapses, your marketing site and every prospect-facing link go dark on the same morning. I can turn auto-renew on at the registrar.",
    fix: "Turn auto-renew on"
  }
];

// ── Team roster + supporting fixtures (TEAM 6639 … TEAM_PERF 6720) ─────────
export const TEAM = [
  { name: "Marisol Reyes", role: "Head of Client Success", util: 96, hours: "41h", focus: "Onboarding Sarah's Coaching Practice", subs: ["Sarah's Coaching Practice", "Northwind Dental Group", "Studio Nine Pilates", "Meridian Law Partners", "Bright Path Tutoring"] },
  { name: "Dev Anand", role: "Paid media lead", util: 91, hours: "38h", focus: "Q4 pricing review for three sub-accounts", subs: ["Ridgeline Outdoor Co.", "Copperline Roofing", "Coach James Fitness"] },
  { name: "Tomas Klein", role: "Ops manager", util: 98, hours: "44h", focus: "Rebuilding Ridgeline's reporting after the pixel fix", subs: ["Ridgeline Outdoor Co.", "Verde Landscaping"] },
  { name: "Priya Nair", role: "Client success manager", util: 78, hours: "32h", focus: "Renewal prep for two accounts", subs: ["Harbor & Vine Catering", "Aldridge Financial Ops"] },
  { name: "Ellis Brand", role: "Copy + campaigns", util: 84, hours: "35h", focus: "September nurture across the book", subs: ["Loft & Line Interiors", "Bright Path Tutoring", "Studio Nine Pilates"] },
  { name: "Nadia Osei", role: "Finance + billing", util: 62, hours: "26h", focus: "Payroll filing and the E&O comparison", subs: [] },
  { name: "Jon Whitaker", role: "Sales", util: 71, hours: "30h", focus: "Bellweather and Hartline proposals", subs: [] },
  { name: "Aisha Kone", role: "Junior ops", util: 44, hours: "18h", focus: "Shadowing Tomas · week two", subs: ["Verde Landscaping"], newHire: "Day 11 of 30", onboard: "37%" }
];

export const TEAM_TABS = [
  { key: "roster", label: "Roster", icon: "◍", scopes: ["agency", "book", "sub"] },
  { key: "directory", label: "Directory", icon: "◫", scopes: ["agency", "sub"] },
  { key: "roles", label: "Roles & invites", icon: "⛉", scopes: ["agency", "sub"] },
  { key: "workload", label: "Workload", icon: "▤", scopes: ["agency", "book", "sub"] },
  { key: "performance", label: "Performance", icon: "↗", scopes: ["agency", "book", "sub"] },
  { key: "activity", label: "Activity", icon: "∿", scopes: ["agency", "book", "sub"] }
];

export const TEAM_CAP = { line: "296h of 264h booked", note: "Across eight live seats this week." };

export const TEAM_SUBS = [
  { name: "Sarah's Coaching Practice", color: "#7C6CE0", staff: 3, cap: 96, booked: 58, health: "under" },
  { name: "Ridgeline Outdoor Co.", color: "#3F7F5C", staff: 4, cap: 128, booked: 141, health: "over" },
  { name: "Coach James Fitness", color: "#B5822A", staff: 5, cap: 160, booked: 182, health: "over" },
  { name: "Northwind Dental Group", color: "#2F6B8F", staff: 2, cap: 64, booked: 61, health: "ok" },
  { name: "Meridian Law Partners", color: "#8A5A9E", staff: 3, cap: 96, booked: 88, health: "ok" }
];

export const AGENCY_OPERATOR = "Antonio Cook";
export const TM_TZ = ["America/Chicago", "America/New_York", "Europe/Lisbon", "America/Los_Angeles"];

// Small pure data-helpers required by the fixture rows below (TEAM_SEATS / SU_FIELDS).
// These derive email addresses / department labels from a name — pure, no view markup.
export const TM_MAIL = n => n.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") + "@agency.example";
export const TM_DEPT_OF = role => {
  const r = role.toLowerCase();
  if (/client success/.test(r)) return "Client Success";
  if (/media|copy|campaign|market/.test(r)) return "Marketing";
  if (/ops|operations/.test(r)) return "Operations";
  if (/finance|billing/.test(r)) return "Finance";
  if (/sales/.test(r)) return "Sales";
  return "Operations";
};

export const TEAM_SEATS = TEAM.map((m, i) => ({
  role: m.role, title: m.role, dept: TM_DEPT_OF(m.role),
  seat: i === 0 ? "Manager" : i === TEAM.length - 1 ? "Coordinator" : "Specialist",
  who: m.name, used: 1, of: 1, admin: i < 2,
  tz: TM_TZ[i % TM_TZ.length], mail: TM_MAIL(m.name), photo: i < 6, invite: "live"
})).concat([{
  role: "Advisor · invited", title: "Advisor", dept: "Finance", seat: "Advisor", who: "Sasha Iyer", used: 0, of: 1, admin: false,
  tz: "America/Los_Angeles", mail: "sasha@agency.example", photo: false, invite: "unsent"
}]);

export const TEAM_ROLES = [
  { role: "Owner", who: AGENCY_OPERATOR, used: 1, of: 1, admin: true, invite: "live" },
  { role: "Manager", who: TEAM[0].name + " + 1", used: 2, of: 3, admin: true, invite: "live" },
  { role: "Specialist", who: TEAM.slice(1, 5).map(m => m.name.split(" ")[0]).join(", "), used: 4, of: 5, admin: false, invite: "live" },
  { role: "Coordinator", who: TEAM[TEAM.length - 1].name, used: 1, of: 2, admin: false, invite: "live" },
  { role: "Advisor", who: "Sasha Iyer", used: 0, of: 1, admin: false, invite: "unsent" }
];

export const TEAM_ACCOUNTS = [
  { client: "Coach James Fitness", owner: "Dev Anand", hrs: "34h", rate: "$182", paige: "Finance, Marketing", load: "Upside down" },
  { client: "Ridgeline Outdoor Co.", owner: "Tomas Klein", hrs: "28h", rate: "$86", paige: "Ops, Client Success", load: "Upside down" },
  { client: "Sarah's Coaching Practice", owner: "Marisol Reyes", hrs: "19h", rate: "$442", paige: "Client Success, Marketing", load: "Heavy" },
  { client: "Northwind Dental Group", owner: "Marisol Reyes", hrs: "12h", rate: "$525", paige: "Client Success", load: "Balanced" },
  { client: "Meridian Law Partners", owner: "Priya Nair", hrs: "9h", rate: "$611", paige: "Finance, Legal", load: "Balanced" },
  { client: "Verde Landscaping", owner: "Aisha Kone", hrs: "6h", rate: "$408", paige: "Ops", load: "Light" }
];

export const TEAM_ACTS = [
  { who: "Marisol Reyes", kind: "person", what: "Approved the renewal draft for Sarah's Coaching Practice", note: "Sent under Sarah's brand, not the agency's.", when: "12 min ago", tenant: "Sarah's Coaching Practice", color: "#7C6CE0" },
  { who: "Finance", kind: "dept", what: "Sent the second renewal reminder", note: "Draft-and-send tier. No approval needed at this amount.", when: "38 min ago", tenant: "Coach James Fitness", color: "#B5822A" },
  { who: "Tomas Klein", kind: "person", what: "Fixed the duplicate purchase pixel", note: "Six days of attribution recovered from the backfill.", when: "1h ago", tenant: "Ridgeline Outdoor Co.", color: "#3F7F5C" },
  { who: "Client Success", kind: "dept", what: "Drafted a check-in to a quiet account", note: "Held for your approval — the account is inside its renewal window.", when: "2h ago", tenant: "Northwind Dental Group", color: "#2F6B8F" },
  { who: "Operations", kind: "dept", what: "Escalated an autonomy request", note: "Asked before touching a payment method, as configured.", when: "3h ago", tenant: "Ridgeline Outdoor Co.", color: "#3F7F5C" },
  { who: "Nadia Osei", kind: "person", what: "Filed the quarterly payroll", note: "Filed early. Confirmation is in the Vault.", when: "5h ago", tenant: "Agency", color: "#8A8478" }
];

export const TEAM_PERF = [
  { dept: "Client Success", closed: 148, hours: "62h", tier: "Draft and send" },
  { dept: "Marketing", closed: 96, hours: "41h", tier: "Ask first" },
  { dept: "Operations", closed: 84, hours: "38h", tier: "Draft and send" },
  { dept: "Finance", closed: 61, hours: "34h", tier: "Ask first" },
  { dept: "Sales", closed: 44, hours: "18h", tier: "Draft only" },
  { dept: "Growth", closed: 27, hours: "11h", tier: "Draft only" }
];

// ── Per-sub-account team source data (TM_SUB_PEOPLE, 6772) ─────────────────
// Pure data. The generator that shapes it into roster/seat/account rows
// (TM_SUB_DATA) is render logic and lives in the team component, not here.
export const TM_SUB_PEOPLE = {
  "Sarah's Coaching Practice": {
    domain: "sarahcoaching.example",
    people: [["Sarah Whitfield", "Owner · head coach", 74], ["Renee Alvarez", "Client coordinator", 61], ["Milo Ferrand", "Program assistant", 42]],
    clients: [["Group program · autumn cohort", "18h"], ["1:1 coaching book", "22h"], ["Corporate workshop retainer", "11h"], ["Waitlist nurture", "7h"]]
  },
  "Ridgeline Outdoor Co.": {
    domain: "ridgelineoutdoor.example",
    people: [["Cal Brennan", "Owner", 118], ["Iris Tan", "Retail ops", 104], ["Peter Nkemi", "Ecommerce", 96], ["Dana Lowell", "Wholesale accounts", 88]],
    clients: [["Wholesale accounts", "44h"], ["Direct storefront", "38h"], ["Seasonal catalogue", "31h"], ["Trade shows", "28h"]]
  },
  "Coach James Fitness": {
    domain: "coachjames.example",
    people: [["James Okonkwo", "Owner", 122], ["Tara Beaumont", "Head trainer", 108], ["Luis Ferrer", "Nutrition lead", 99], ["Beth Mwangi", "Front desk", 84], ["Owen Pratt", "Content", 71]],
    clients: [["Small-group training", "52h"], ["Online membership", "46h"], ["Corporate wellness", "38h"], ["Nutrition programs", "29h"], ["Challenge cohorts", "17h"]]
  },
  "Northwind Dental Group": {
    domain: "northwinddental.example",
    people: [["Dr. Hannah Voss", "Owner · clinical lead", 96], ["Grace Odum", "Practice coordinator", 82]],
    clients: [["New patient intake", "24h"], ["Recall and hygiene", "21h"], ["Ortho referrals", "16h"]]
  },
  "Meridian Law Partners": {
    domain: "meridianlaw.example",
    people: [["Alan Reyes-Ito", "Managing partner", 94], ["Simone Achebe", "Associate", 88], ["Ford Kelleher", "Paralegal", 76]],
    clients: [["Business formation", "31h"], ["Contract review", "27h"], ["Estate matters", "18h"], ["Retainer clients", "12h"]]
  }
};

// ── Setup surface (SETUP_TABS 7146, SETUP_ENTITIES 7156, SETUP_BENCH 7162) ─
export const SETUP_TABS = [
  { key: "business", label: "Business", icon: "▦" },
  { key: "presence", label: "Presence", icon: "◎" },
  { key: "owner", label: "Owner", icon: "◉" },
  { key: "contacts", label: "Contacts", icon: "✉" },
  { key: "people", label: "People", icon: "◫" },
  { key: "banking", label: "Banking", icon: "▤" },
  { key: "comms", label: "Comms & data", icon: "☼" }
];

export const SETUP_ENTITIES = [
  { name: "Cook & Co Agency LLC", note: "Parent · Delaware LLC", state: "Active", sealed: true },
  { name: "Cook Growth Studio", note: "DBA of parent", state: "Active", sealed: false },
  { name: "Cook Holdings LLC", note: "Planned holding entity", state: "Planned", sealed: false }
];

export const SETUP_BENCH = [
  { role: "ACCOUNTANT / CPA", who: "Dolores Ruiz, CPA", pill: null },
  { role: "ATTORNEY", who: "Marcus Feld", pill: null },
  { role: "INSURANCE BROKER", who: "Renee Hartwell", pill: null },
  { role: "REGISTERED AGENT", who: "Northpoint Agents", pill: null },
  { role: "BOOKKEEPER", who: "Unassigned", pill: "Gap" },
  { role: "EMERGENCY CONTACT", who: "Sealed", pill: "Encrypted" }
];

// ── Setup field definitions, config-as-data (SU_FIELDS, 7174) ──────────────
export const SU_FIELDS = {
  "Legal identity": [
    { group: "Registered identity", rows: [
      { label: "Legal name", value: "Cook & Co Agency LLC", kind: "text" },
      { label: "Doing business as", value: "Cook Growth Studio", kind: "text" },
      { label: "Entity type", value: "LLC — multi-member", kind: "select" },
      { label: "Formation state", value: "Delaware", kind: "select" },
      { label: "Formation date", value: "March 4, 2021", kind: "date" },
      { label: "Fiscal year end", value: "December 31", kind: "select" }
    ] },
    { group: "Tax identifiers", sealed: true, rows: [
      { label: "EIN", value: "•• •••• 4417", kind: "sealed" },
      { label: "State tax ID", value: "•• •••• 8802", kind: "sealed" },
      { label: "Sales tax registration", value: "GA — active", kind: "text" }
    ] },
    { group: "Filing status", rows: [
      { label: "Annual report due", value: "June 1, 2027", kind: "date" },
      { label: "Registered agent", value: "Northpoint Agents", kind: "text" },
      { label: "Good standing", value: "Verified 14 days ago", kind: "readonly" }
    ] }
  ],
  "Where you are": [
    { group: "Principal address", rows: [
      { label: "Street", value: "1180 Peachtree St NE", kind: "text" },
      { label: "Suite", value: "Suite 1200", kind: "text" },
      { label: "City", value: "Atlanta", kind: "text" },
      { label: "State", value: "Georgia", kind: "select" },
      { label: "Postal code", value: "30309", kind: "text" },
      { label: "Country", value: "United States", kind: "select" }
    ] },
    { group: "Mailing and registered", rows: [
      { label: "Mailing address", value: "Same as principal", kind: "select" },
      { label: "Registered agent address", value: "251 Little Falls Dr, Wilmington DE", kind: "text" }
    ] },
    { group: "Hours and locale", rows: [
      { label: "Time zone", value: "America/New_York", kind: "select" },
      { label: "Business hours", value: "8:00am – 6:00pm", kind: "text" },
      { label: "Quiet hours", value: "10:00pm – 7:00am", kind: "text" },
      { label: "Currency", value: "USD ($)", kind: "select" }
    ] }
  ],
  "How the business is reached": [
    { group: "Public channels", rows: [
      { label: "Website", value: "cookagency.com", kind: "text" },
      { label: "Main phone", value: "(404) 555-0142", kind: "tel" },
      { label: "Support phone", value: "(404) 555-0188", kind: "tel" },
      { label: "General inbox", value: "hello@cookagency.com", kind: "email" }
    ] },
    { group: "Sending", rows: [
      { label: "Sending domain", value: "mail.cookagency.com", kind: "text" },
      { label: "Reply-to", value: "antonio@cookagency.com", kind: "email" },
      { label: "Physical address in footer", value: "Principal address", kind: "select" }
    ] }
  ],
  "Entities": [
    { group: "Entity", rows: [
      { label: "Legal name", value: "Cook Holdings LLC", kind: "text" },
      { label: "Relationship", value: "Planned holding entity", kind: "select" },
      { label: "Formation state", value: "Delaware", kind: "select" },
      { label: "Status", value: "Planned", kind: "select" },
      { label: "Ownership", value: "100% — Antonio Cook", kind: "text" }
    ] }
  ],
  "Industry and codes": [
    { group: "Classification", rows: [
      { label: "Primary NAICS", value: "541613 — Marketing consulting services", kind: "select" },
      { label: "Secondary NAICS", value: "541810 — Advertising agencies", kind: "select" },
      { label: "SIC code", value: "8742 — Management consulting", kind: "select" },
      { label: "Industry shown to clients", value: "Marketing agency", kind: "text" }
    ] },
    { group: "Licences and registrations", rows: [
      { label: "Business licence", value: "ATL-2021-88431 · renews Jan 31", kind: "text" },
      { label: "States registered to do business", value: "GA, DE, FL, TX", kind: "text" },
      { label: "W-9 on file", value: "Signed Feb 2026", kind: "readonly" }
    ] }
  ],
  "Public listings": [
    { group: "Google Business Profile", rows: [
      { label: "Profile", value: "Cook & Co Agency — verified", kind: "readonly" },
      { label: "Category", value: "Marketing agency", kind: "select" },
      { label: "Listed phone", value: "(404) 555-0142", kind: "tel" },
      { label: "Listed hours", value: "Mon–Fri 8:00–6:00", kind: "text" },
      { label: "Service area", value: "Atlanta metro + remote", kind: "text" }
    ] },
    { group: "Other listings", rows: [
      { label: "Bing Places", value: "Claimed", kind: "select" },
      { label: "Apple Business Connect", value: "Claimed", kind: "select" },
      { label: "Better Business Bureau", value: "Accredited · A+", kind: "readonly" },
      { label: "LinkedIn company page", value: "linkedin.com/company/cook-co", kind: "text" }
    ] }
  ],
  "Reputation": [
    { group: "Review sources", rows: [
      { label: "Google rating", value: "4.8 — 96 reviews", kind: "readonly" },
      { label: "Clutch rating", value: "4.9 — 22 reviews", kind: "readonly" },
      { label: "Unanswered reviews", value: "2 — oldest 4 days", kind: "readonly" }
    ] },
    { group: "How she handles reviews", rows: [
      { label: "Reply drafting", value: "Draft for approval", kind: "select" },
      { label: "Reply window target", value: "Within 24 hours", kind: "select" },
      { label: "Review requests after project close", value: "On — 3 days after", kind: "select" },
      { label: "Negative review escalation", value: "Notify immediately", kind: "select" }
    ] }
  ],
  "Brand": [
    { group: "What this workspace is called", rows: [
      { label: "Workspace name", value: "Cook & Co Agency", kind: "text" },
      { label: "Shown in the sidebar", value: "Cook & Co Agency", kind: "readonly" },
      { label: "Tagline", value: "Operations for coaching businesses", kind: "text" }
    ] },
    { group: "The mark", rows: [
      { label: "Logo file", value: "cook-mark.svg — 512px", kind: "file" },
      { label: "Square mark for small sizes", value: "cook-glyph.svg — 64px", kind: "file" },
      { label: "Favicon", value: "cook-favicon.png — 32px", kind: "file" },
      { label: "Mark shape", value: "Rounded square", kind: "select" },
      { label: "Brand colour", value: "#C8A02E", kind: "color" }
    ] },
    { group: "Where your brand replaces ours", rows: [
      { label: "Sidebar mark and name", value: "Yours", kind: "readonly" },
      { label: "Client portal", value: "Yours", kind: "select" },
      { label: "Outbound email header", value: "Yours", kind: "select" },
      { label: "Login screen", value: "Yours", kind: "select" },
      { label: "Platform credit line", value: "Runs on Paige — small, in the footer", kind: "select" },
      { label: "Sub-accounts inherit your brand", value: "No — each brands their own", kind: "select" }
    ] },
    { group: "Voice", rows: [
      { label: "Writing style", value: "Direct, warm, no jargon", kind: "text" },
      { label: "Signature block", value: "Antonio Cook · Cook & Co Agency", kind: "text" },
      { label: "Words to avoid", value: "synergy, leverage, circle back", kind: "text" }
    ] }
  ],
  "Owner profile": [
    { group: "Identity", rows: [
      { label: "Full name", value: AGENCY_OPERATOR, kind: "text" },
      { label: "Preferred name", value: "Antonio", kind: "text" },
      { label: "Title", value: "Founder & Principal", kind: "text" },
      { label: "Pronouns", value: "he / him", kind: "text" }
    ] },
    { group: "Reach", rows: [
      { label: "Work email", value: "antonio@agency.example", kind: "email" },
      { label: "Mobile", value: "(404) 555-0107", kind: "tel" },
      { label: "Calendar link", value: "cal.cookagency.com/antonio", kind: "text" },
      { label: "Time zone", value: "America/New_York", kind: "select" }
    ] },
    { group: "How she signs as you", rows: [
      { label: "Signs as", value: "Antonio Cook", kind: "text" },
      { label: "Sign-off", value: "— Antonio", kind: "text" },
      { label: "Voice sample on file", value: "4 approved emails", kind: "readonly" }
    ] }
  ],
  "Access and recovery": [
    { group: "This seat", rows: [
      { label: "Two-factor", value: "Authenticator · enrolled", kind: "select" },
      { label: "Backup codes", value: "8 unused", kind: "readonly" },
      { label: "Recovery email", value: "antonio.personal@example.com", kind: "email" },
      { label: "Session length", value: "12 hours", kind: "select" }
    ] },
    { group: "Alerts", rows: [
      { label: "Login from a new device", value: "Email + push", kind: "select" },
      { label: "Sealed record opened", value: "Email", kind: "select" },
      { label: "Autonomy changed", value: "Email + push", kind: "select" }
    ] }
  ],
  "Continuity": [
    { group: "If you are unavailable", rows: [
      { label: "Emergency contact", value: "Sealed", kind: "sealed" },
      { label: "Successor access", value: "Marisol Reyes", kind: "select" },
      { label: "Trigger", value: "14 days without sign-in", kind: "select" },
      { label: "What the successor can reach", value: "Everything except sealed records", kind: "select" }
    ] },
    { group: "Where things live", rows: [
      { label: "Key documents", value: "Business Vault + Drive", kind: "text" },
      { label: "Broker of record", value: "Renee Hartwell", kind: "text" },
      { label: "Counsel", value: "Marcus Feld", kind: "text" }
    ] }
  ],
  "Your professional bench": [
    { group: "Who they are", rows: [
      { label: "Role on the bench", value: "Bookkeeper", kind: "select" },
      { label: "Name", value: "", kind: "text" },
      { label: "Firm", value: "", kind: "text" },
      { label: "Licence or registration no.", value: "", kind: "text" },
      { label: "Website", value: "", kind: "text" }
    ] },
    { group: "How to reach them", rows: [
      { label: "Email", value: "", kind: "email" },
      { label: "Direct phone", value: "", kind: "tel" },
      { label: "Preferred channel", value: "Email", kind: "select" },
      { label: "Their timezone", value: "America/New_York", kind: "select" },
      { label: "Best hours", value: "9:00am – 5:00pm", kind: "text" }
    ] },
    { group: "The engagement", rows: [
      { label: "Engagement type", value: "Monthly retainer", kind: "select" },
      { label: "Fee", value: "", kind: "text" },
      { label: "Billing cadence", value: "Monthly", kind: "select" },
      { label: "Engagement letter", value: "None on file", kind: "file" },
      { label: "Renewal date", value: "", kind: "date" },
      { label: "NDA signed", value: "No", kind: "select" }
    ] },
    { group: "What she may do with them", rows: [
      { label: "Contact them directly", value: "Draft for approval", kind: "select" },
      { label: "Share financial records", value: "Yes — read-only exports", kind: "select" },
      { label: "Share client data", value: "Never", kind: "select" },
      { label: "Attach documents from the Vault", value: "Ask first", kind: "select" },
      { label: "Copy you on every thread", value: "On", kind: "select" },
      { label: "Deadlines she should chase them on", value: "Filing dates and month-end close", kind: "text" }
    ] }
  ],
  "How she works with your bench": [
    { group: "Contact rules", rows: [
      { label: "Contacting the bench", value: "Draft for approval", kind: "select" },
      { label: "Copy you on every thread", value: "On", kind: "select" },
      { label: "Response chasing", value: "After 3 business days", kind: "select" }
    ] },
    { group: "What may be shared", rows: [
      { label: "Financial records", value: "CPA and bookkeeper only", kind: "select" },
      { label: "Client data", value: "Never without your approval", kind: "select" },
      { label: "Sub-account records", value: "Never — tenant isolated", kind: "readonly" },
      { label: "Sealed identifiers", value: "Never", kind: "readonly" }
    ] }
  ],
  "Engagements on file": [
    { group: "Document", rows: [
      { label: "Type", value: "Engagement letter", kind: "select" },
      { label: "Professional", value: "Dolores Ruiz, CPA", kind: "select" },
      { label: "File", value: "cpa-engagement-2026.pdf", kind: "file" },
      { label: "Effective date", value: "April 1, 2026", kind: "date" },
      { label: "Renews", value: "April 1, 2027", kind: "date" },
      { label: "Remind me", value: "30 days before", kind: "select" }
    ] }
  ],
  "Bank connections": [
    { group: "Connect an account", rows: [
      { label: "Provider", value: "Plaid", kind: "readonly" },
      { label: "Institution", value: "Search 12,000 institutions", kind: "select" },
      { label: "Access", value: "Read-only — balances and transactions", kind: "readonly" },
      { label: "What she may do", value: "Categorise and reconcile", kind: "select" }
    ] },
    { group: "Connected", rows: [
      { label: "Regions Bank — operating", value: "•• 4471 · synced 2h ago", kind: "readonly" },
      { label: "Regions Bank — reserve", value: "•• 8802 · synced 2h ago", kind: "readonly" },
      { label: "Amex Business", value: "•• 3391 · reauth needed", kind: "readonly" },
      { label: "Stripe payouts", value: "Platform account · synced 1h ago", kind: "readonly" }
    ] },
    { group: "Sync behaviour", rows: [
      { label: "Refresh frequency", value: "Every 4 hours", kind: "select" },
      { label: "Transaction history", value: "24 months", kind: "select" },
      { label: "Auto-categorise", value: "On — she learns your corrections", kind: "select" },
      { label: "Alert on a failed sync", value: "Immediately", kind: "select" },
      { label: "Balance below", value: "$15,000 — notify", kind: "text" }
    ] }
  ],
  "Accounting": [
    { group: "QuickBooks Online", rows: [
      { label: "Company file", value: "Cook & Co Agency LLC", kind: "readonly" },
      { label: "Connection", value: "Two-way · healthy", kind: "readonly" },
      { label: "Last sync", value: "38 minutes ago", kind: "readonly" },
      { label: "Sync frequency", value: "Hourly", kind: "select" }
    ] },
    { group: "What syncs", rows: [
      { label: "Invoices", value: "Push on create", kind: "select" },
      { label: "Payments", value: "Pull on settle", kind: "select" },
      { label: "Expenses", value: "Pull daily", kind: "select" },
      { label: "Sub-account billing", value: "Push as one summary invoice", kind: "select" },
      { label: "Payroll", value: "Not connected", kind: "select" }
    ] },
    { group: "Mapping", rows: [
      { label: "Chart of accounts", value: "42 mapped · 2 unmapped", kind: "readonly" },
      { label: "Default income account", value: "4000 · Agency revenue", kind: "select" },
      { label: "Default expense account", value: "6100 · Software", kind: "select" },
      { label: "Tax code", value: "GA — 8.9%", kind: "select" },
      { label: "Unmapped transactions", value: "Hold for review", kind: "select" }
    ] }
  ],
  "Payouts and billing": [
    { group: "Where money lands", rows: [
      { label: "Institution", value: "Regions Bank", kind: "text" },
      { label: "Account", value: "•• 4471", kind: "sealed" },
      { label: "Routing", value: "Sealed", kind: "sealed" },
      { label: "Payout schedule", value: "Daily", kind: "select" },
      { label: "Minimum payout", value: "$50", kind: "text" }
    ] },
    { group: "Sub-account billing", rows: [
      { label: "Merchant of record", value: "Cook & Co Agency LLC", kind: "readonly" },
      { label: "Processor", value: "Stripe — platform account", kind: "text" },
      { label: "Statement descriptor", value: "COOKCO AGENCY", kind: "text" },
      { label: "Failed payment retries", value: "3 over 10 days", kind: "select" },
      { label: "Dunning emails", value: "She drafts, you approve", kind: "select" }
    ] }
  ],
  "Spend and vendors": [
    { group: "Detected spend", rows: [
      { label: "Northlight CRM", value: "$249 / mo · card •• 3391", kind: "readonly" },
      { label: "Ledgerly Pro", value: "$85 / mo · card •• 3391", kind: "readonly" },
      { label: "Sendgrid Pro", value: "$120 / mo · card •• 3391", kind: "readonly" },
      { label: "Monthly total", value: "$454", kind: "readonly" }
    ] },
    { group: "How she watches spend", rows: [
      { label: "Flag price increases", value: "Over 10%", kind: "select" },
      { label: "Flag unused subscriptions", value: "After 60 days idle", kind: "select" },
      { label: "Renewal reminders", value: "14 days before", kind: "select" }
    ] }
  ],
  "Banking and payouts": [
    { group: "Operating account", rows: [
      { label: "Institution", value: "Regions Bank", kind: "text" },
      { label: "Account", value: "•• 4471", kind: "sealed" },
      { label: "Routing", value: "Sealed", kind: "sealed" },
      { label: "Payout schedule", value: "Daily", kind: "select" }
    ] },
    { group: "Sub-account billing", rows: [
      { label: "Merchant of record", value: "Cook & Co Agency LLC", kind: "readonly" },
      { label: "Processor", value: "Stripe — platform account", kind: "text" },
      { label: "Statement descriptor", value: "COOKCO AGENCY", kind: "text" },
      { label: "Failed payment retries", value: "3 over 10 days", kind: "select" }
    ] }
  ],
  "People": [
    { group: "Who they are", rows: [
      { label: "Name", value: "", kind: "text" },
      { label: "Work email", value: "", kind: "email" },
      { label: "Role", value: "Specialist", kind: "select" },
      { label: "Department", value: "Client Success", kind: "select" },
      { label: "Reports to", value: AGENCY_OPERATOR, kind: "select" }
    ] },
    { group: "How they sign in", rows: [
      { label: "Invite", value: "Email a magic link", kind: "select" },
      { label: "Set a password for them", value: "Off — they choose their own", kind: "select" },
      { label: "Temporary password", value: "", kind: "sealed" },
      { label: "Must change it on first sign-in", value: "Yes", kind: "select" },
      { label: "Two-factor", value: "Required after first sign-in", kind: "select" },
      { label: "Single sign-on", value: "Google Workspace", kind: "select" }
    ] },
    { group: "Accounts they connect", rows: [
      { label: "Google — mail and calendar", value: "Not connected", kind: "select" },
      { label: "Microsoft 365", value: "Not connected", kind: "select" },
      { label: "Calendar she may book into", value: "Their primary", kind: "select" },
      { label: "Mail she may send as", value: "Draft only until connected", kind: "readonly" }
    ] },
    { group: "What they can reach", rows: [
      { label: "Access level", value: "Standard", kind: "select" },
      { label: "Sub-accounts they can reach", value: "Assigned only", kind: "select" },
      { label: "Sealed records", value: "No", kind: "select" },
      { label: "Can invite others", value: "No", kind: "select" }
    ] }
  ],
  "Access and sign-in": [
    { group: "This seat's access", rows: [
      { label: "Sign-in method", value: "Google Workspace", kind: "select" },
      { label: "Password", value: "Set by them · changed Jun 2026", kind: "readonly" },
      { label: "Send a reset link", value: "To their work email", kind: "select" },
      { label: "Set a temporary password", value: "", kind: "sealed" },
      { label: "Two-factor", value: "Authenticator · enrolled", kind: "select" },
      { label: "Last sign-in", value: "This morning · Chrome, Atlanta", kind: "readonly" }
    ] },
    { group: "Connected accounts", rows: [
      { label: "Google — mail", value: "Connected · sarah@sarahcoaching.example", kind: "readonly" },
      { label: "Google — calendar", value: "Connected · primary + bookings", kind: "readonly" },
      { label: "Microsoft 365", value: "Not connected", kind: "select" },
      { label: "Zoom", value: "Connected", kind: "select" },
      { label: "What she may do with them", value: "Draft and send, book and reschedule", kind: "select" }
    ] },
    { group: "Acting on their behalf", rows: [
      { label: "Sign in as this person", value: "Owners only · every session logged", kind: "select" },
      { label: "Reason required", value: "Yes", kind: "select" },
      { label: "Session length", value: "30 minutes", kind: "select" }
    ] }
  ],
  "Sending identity": [
    { group: "Domain", rows: [
      { label: "Sending domain", value: "mail.cookagency.com", kind: "text" },
      { label: "SPF", value: "Passing", kind: "readonly" },
      { label: "DKIM", value: "Passing", kind: "readonly" },
      { label: "DMARC", value: "p=quarantine", kind: "select" },
      { label: "Bounce handling", value: "Suppress after 2 hard bounces", kind: "select" }
    ] }
  ],
  "Plan and billing": [
    { group: "Plan", rows: [
      { label: "Plan", value: AGENCY.plan, kind: "readonly" },
      { label: "Sub-accounts included", value: "15 — using " + AGENCY.subCount, kind: "readonly" },
      { label: "Seats", value: "12 — using " + TEAM_SEATS.length, kind: "readonly" },
      { label: "Renews", value: "Sep 1, 2026", kind: "readonly" }
    ] },
    { group: "Payment", rows: [
      { label: "Card on file", value: "Visa •• 8821", kind: "sealed" },
      { label: "Billing email", value: "billing@cookagency.com", kind: "email" },
      { label: "Invoices", value: "Emailed on renewal", kind: "select" }
    ] }
  ]
};

// ── Automations (AUTO_TABS 7776 … AUTO_BUILD 7825) ─────────────────────────
export const AUTO_TABS = [
  { key: "library", label: "Automations", icon: "⚙", scopes: ["agency", "book", "sub"] },
  { key: "runs", label: "Runs", icon: "∿", scopes: ["agency", "book", "sub"] },
  { key: "build", label: "Build", icon: "✦", scopes: ["agency", "sub"] }
];

export const AUTOMATIONS = [
  { name: "Dunning · two-fail retry with escalation", dept: "Finance", tier: "confirm", status: "Live",
    trigger: "When a client's card fails twice, wait 24 hours",
    action: "Send the retry sequence, then flag you if a third attempt fails",
    last: "2h ago", ok: true, runs: 34, rate: 97, engine: "action bus" },
  { name: "New sub-account welcome kit", dept: "Client Success", tier: "auto", status: "Live",
    trigger: "When a sub-account signs and their workspace provisions",
    action: "Send the welcome kit, book the kickoff, open the onboarding checklist",
    last: "yesterday", ok: true, runs: 12, rate: 100, engine: "skill" },
  { name: "Quiet-account check-in", dept: "Client Success", tier: "confirm", status: "Live",
    trigger: "When an account has no inbound message for 14 days",
    action: "Draft a check-in in their owner's voice and hold it for approval",
    last: "4h ago", ok: true, runs: 61, rate: 94, engine: "skill" },
  { name: "Missed-call recovery", dept: "Sales", tier: "confirm", status: "Broken",
    trigger: "When a prospect misses two scheduled calls in a row",
    action: "Offer three new times and notify the account owner",
    last: "failed 6d ago", ok: false, runs: 18, rate: 61, engine: "n8n" },
  { name: "Monday owner brief", dept: "Executive Office", tier: "auto", status: "Live",
    trigger: "Every Monday at 7:00am ET",
    action: "Write the week's brief from real numbers and send it to you",
    last: "3d ago", ok: true, runs: 22, rate: 100, engine: "scheduled skill" },
  { name: "Renewal window opener", dept: "Finance", tier: "off", status: "Paused",
    trigger: "60 days before a sub-account's renewal date",
    action: "Draft the renewal terms and open a decision in Waiting on you",
    last: "never", ok: true, runs: 0, rate: 0, engine: "action bus" }
];

export const AUTO_RUNS = [
  { name: "Quiet-account check-in", event: "No inbound for 14 days · Northwind Dental Group", when: "12 min ago", dur: "1.4s", engine: "skill", status: "Awaiting approval", dept: "Client Success", tier: "confirm", color: "#2F6B8F" },
  { name: "Dunning · two-fail retry", event: "Second card failure · Coach James Fitness", when: "2h ago", dur: "0.9s", engine: "action bus", status: "Auto-fired", dept: "Finance", tier: "confirm", color: "#B5822A" },
  { name: "Missed-call recovery", event: "Two missed calls · Bellweather Studio", when: "6d ago", dur: "timed out", engine: "n8n", status: "Failed", dept: "Sales", tier: "confirm", color: "#7C6CE0" },
  { name: "Monday owner brief", event: "Schedule · Monday 7:00am", when: "3d ago", dur: "6.2s", engine: "scheduled skill", status: "Success", dept: "Executive Office", tier: "auto", color: "#8A5A9E" },
  { name: "New sub-account welcome kit", event: "Workspace provisioned · Studio Nine Pilates", when: "yesterday", dur: "3.1s", engine: "skill", status: "Success", dept: "Client Success", tier: "auto", color: "#3F7F5C" },
  { name: "Quiet-account check-in", event: "No inbound for 14 days · Verde Landscaping", when: "yesterday", dur: "1.2s", engine: "skill", status: "Approved", dept: "Client Success", tier: "confirm", color: "#2F7A57" }
];

export const AUTO_TEMPLATES = [
  { name: "Standard dunning sequence", dept: "Finance", note: "Three messages over ten days, then a decision for you" },
  { name: "New-client onboarding", dept: "Client Success", note: "Welcome kit, kickoff booking, first-week checklist" },
  { name: "Weekly digest to the team", dept: "Executive Office", note: "Written from real numbers every Monday" },
  { name: "Review request after close", dept: "Marketing", note: "Three days after a project closes, in their voice" }
];

export const AUTO_BUILD = [
  { who: "you", text: "Every time a client's card fails twice, wait 24 hours then send the retry sequence, and flag me if it fails a third time." },
  { who: "paige", text: "Understood. Two questions before I file it: should the flag reach you by email or in chat, and is \"the retry sequence\" your standard three-message flow, or something custom for this?" },
  { who: "you", text: "Chat. And use the standard three." },
  { who: "paige", text: "Drafted. I'd start this on confirm rather than auto — thirty clean runs and I'll suggest promoting it." }
];

// ── Marketplace (MK_TABS 7833 … MK_LISTINGS 7875) ──────────────────────────
export const MK_TABS = [
  { key: "today", label: "Today", icon: "◇", scopes: ["agency"] },
  { key: "browse", label: "Browse", icon: "⌗", scopes: ["agency"] },
  { key: "installed", label: "Installed", icon: "▣", scopes: ["agency", "book", "sub"] },
  { key: "updates", label: "Updates", icon: "⟳", scopes: ["agency", "book", "sub"], badge: "3" },
  { key: "curated", label: "Curated", icon: "◎", scopes: ["agency", "book", "sub"] },
  { key: "publish", label: "Publish", icon: "↗", scopes: ["agency"] }
];

export const MK_GRAD = {
  "#7C6CE0": ["#8E7CF0", "#5B49C4"],
  "#3F7F5C": ["#4E9B70", "#2C6146"],
  "#B5822A": ["#D9A23F", "#9A6B18"],
  "#2F6B8F": ["#3E86AE", "#1F4F6D"],
  "#8A5A9E": ["#A570BA", "#6B4180"],
  "#C05B45": ["#D97159", "#9E4331"],
  "#4A7C8C": ["#5D97A9", "#33606E"]
};

export const MK_ITEMS = [
  { name: "Funding & Capital Raising", cat: "Verticals", pub: "Paige Verticals", base: 49, markup: 20, installs: 1840, rating: 4.7, adopt: 6, resell: true, hue: "#7C6CE0", glyph: "◉", docs: "42 docs", note: "A full vertical brain for capital-raising clients" },
  { name: "Discovery Call Mastery", cat: "Playbooks", pub: "Paige Playbooks", base: 29, markup: 15, installs: 612, rating: 4.6, adopt: 9, resell: true, hue: "#3F7F5C", glyph: "✉", docs: "14 docs", note: "Turn the first conversation into a signed client" },
  { name: "Client Retention Playbook", cat: "Playbooks", pub: "Paige Playbooks", base: 39, markup: 12, installs: 418, rating: 4.6, adopt: 7, resell: true, hue: "#B5822A", glyph: "⛉", docs: "12 docs", note: "Keep the clients you already earned" },
  { name: "Client Portal Themes", cat: "Client Experience", pub: "Paige Client Experience", base: 0, markup: 0, installs: 3120, rating: 4.4, adopt: 12, resell: true, hue: "#2F6B8F", glyph: "⌗", docs: "9 skins", note: "Make the client portal unmistakably theirs" },
  { name: "QuickBooks Bridge", cat: "Bridges", pub: "Paige Data", base: 19, markup: 0, installs: 2410, rating: 4.8, adopt: 4, resell: false, hue: "#8A5A9E", glyph: "▤", docs: "Bridge", note: "Revenue, declines and dunning in one line" },
  { name: "No-Show Recovery", cat: "Client Experience", pub: "Paige Client Experience", base: 15, markup: 10, installs: 1290, rating: 4.5, adopt: 11, resell: true, hue: "#C05B45", glyph: "⚡", docs: "8 docs", note: "Recovers missed appointments into next week" },
  { name: "Onboarding Curriculum", cat: "Verticals", pub: "Northlight Studio", base: 59, markup: 25, installs: 208, rating: 4.2, adopt: 2, resell: true, hue: "#4A7C8C", glyph: "◫", docs: "6 weeks", note: "Six weeks, with the check-ins already written" }
];

export const MK_CATS = [
  { name: "Verticals", note: "Whole industries she already understands", count: 24 },
  { name: "Playbooks", note: "Methods you can resell as your own", count: 61 },
  { name: "Client Experience", note: "What your clients see and feel", count: 38 },
  { name: "Bridges", note: "Everything she connects to", count: 47 }
];

export const MK_UPDATES = [
  { name: "QuickBooks Bridge", ver: "2.4 → 3.0", note: "Adds class and location mapping", size: "breaking change", urgent: true },
  { name: "No-Show Recovery", ver: "1.8 → 1.9", note: "Better handling of same-day cancellations", size: "safe", urgent: false },
  { name: "Client Portal Themes", ver: "4.1 → 4.2", note: "Two new skins, dark-mode fixes", size: "safe", urgent: false }
];

export const MK_LISTINGS = [
  { name: "Discovery Call Mastery", cat: "Playbooks", scope: "Both", installs: 612, book: 9, rating: 4.6, pubRev: 1840, resellRev: 135, status: "Live" },
  { name: "Client Retention Playbook", cat: "Playbooks", scope: "Platform-wide", installs: 418, book: 7, rating: 4.6, pubRev: 1180, resellRev: 84, status: "Live" },
  { name: "Agency Weekly Digest", cat: "Client Experience", scope: "Sub-accounts only", installs: 0, book: 12, rating: 0, pubRev: 0, resellRev: 0, status: "Draft" },
  { name: "Renewal Conversation Kit", cat: "Playbooks", scope: "Platform-wide", installs: 0, book: 0, rating: 0, pubRev: 0, resellRev: 0, status: "Pending review" }
];

// ── Business Vault (BV_TABS 7883 … BV_BOOK_VENDORS 7911) ───────────────────
export const BV_TABS = [
  { key: "vault", label: "Vault", icon: "▣" },
  { key: "registry", label: "Registry", icon: "⌗" },
  { key: "renewals", label: "Renewals", icon: "⟳" },
  { key: "vendors", label: "Vendors", icon: "◍" }
];

export const BV_OBS = [
  { name: "General liability", type: "Insurance", vendor: "Hartwell Brokerage", due: "Sep 12", days: 21, cost: 2340, per: "yr", status: "Draft ready", rec: "Renegotiate", docs: 3, note: "12% over regional median for a firm your size" },
  { name: "Workers' compensation", type: "Insurance", vendor: "Statewide Mutual", due: "Sep 30", days: 39, cost: 1120, per: "yr", status: "Monitoring", rec: "Renew", docs: 2, note: "Fair rate — auto-renew is safe" },
  { name: "E&O / professional liability", type: "Insurance", vendor: "Meridian Specialty", due: "Oct 4", days: 43, cost: 3180, per: "yr", status: "Draft ready", rec: "Shop", docs: 4, note: "Three quotes sourced, one 9% below current" },
  { name: "Northlight CRM", type: "Subscription", vendor: "Northlight", due: "Sep 1", days: 10, cost: 2988, per: "yr", status: "Action needed", rec: "Renegotiate", docs: 1, note: "Seat count grew 40% — volume tier applies now" },
  { name: "Ledgerly Pro", type: "Subscription", vendor: "Ledgerly", due: "Sep 8", days: 17, cost: 1020, per: "yr", status: "Action needed", rec: "Cancel", docs: 1, note: "Nobody has opened it in 90 days" },
  { name: "Delaware franchise tax", type: "Filing", vendor: "Delaware Division of Corporations", due: "Mar 1", days: 192, cost: 400, per: "yr", status: "Monitoring", rec: "Renew", docs: 2, note: "Filed early every year since 2021" },
  { name: "Atlanta business licence", type: "Licence", vendor: "City of Atlanta", due: "Jan 31", days: 163, cost: 285, per: "yr", status: "Monitoring", rec: "Renew", docs: 1, note: "Renews automatically once the fee posts" },
  { name: "Counsel retainer", type: "Retainer", vendor: "Feld & Associates", due: "Jan 1", days: 133, cost: 6000, per: "yr", status: "Monitoring", rec: "Renew", docs: 3, note: "Used 14 of 24 hours this term" },
  { name: "Operating agreement", type: "Reference", vendor: "Internal", due: "No renewal", days: 999, cost: 0, per: "", status: "Auto-renewed", rec: "Monitor", docs: 1, note: "Perpetual — kept here so it's findable" }
];

export const BV_VENDORS = [
  { name: "Hartwell Brokerage", cat: "Insurance", obs: 2, spend: 5520, rel: "Watch", contact: "Renee Hartwell", note: "Two policies, both above median. Slow on the last claim." },
  { name: "Statewide Mutual", cat: "Insurance", obs: 1, spend: 1120, rel: "Preferred", contact: "Dale Okafor", note: "Fair pricing, fast certificates, no disputes in four years." },
  { name: "Northlight", cat: "SaaS", obs: 1, spend: 2988, rel: "Standard", contact: "Account team", note: "Your largest software line. Volume tier unclaimed." },
  { name: "Ledgerly", cat: "SaaS", obs: 1, spend: 1020, rel: "Underperforming", contact: "Support only", note: "Paid and unused for three months." },
  { name: "Feld & Associates", cat: "Legal", obs: 1, spend: 6000, rel: "Preferred", contact: "Marcus Feld", note: "Retainer covers formation, contracts and disputes." },
  { name: "Meridian Specialty", cat: "Insurance", obs: 1, spend: 3180, rel: "Standard", contact: "Broker desk", note: "Quoting E&O against two competitors this cycle." }
];

export const BV_BOOK_VENDORS = [
  { name: "QuickBooks", subs: 8, spend: 8160, note: "Combined $680/mo across eight sub-accounts. Agency-wide pricing runs 20% under list.", cta: "Draft the outreach", tone: "gold" },
  { name: "Statewide Mutual", subs: 5, spend: 6420, note: "Ridgeline pays $1,120 and Coach James pays $1,340 for the same coverage tier.", cta: "Draft the renegotiation", tone: "amber" },
  { name: "E&O coverage", subs: 9, spend: 0, note: "Three of twelve sub-accounts have no E&O policy on file at all.", cta: "Propose the book carrier", tone: "red" }
];

// ── Brand tokens (BRAND, 7933) ─────────────────────────────────────────────
export const BRAND = {
  agency: { name: "Cook & Co Agency", initials: "CC", color: "#C8A02E", radius: "9px", ink: "#241C05", powered: "Runs on Paige" },
  platform: { name: "Paige Agent AI", initials: "", color: "radial-gradient(circle at 35% 35%,#E7C158,#B4881F 62%,#7A5A11)", radius: "50%", ink: "#241C05", powered: "" }
};

// ── Billing (BILL_TABS_AGENCY 7938 … BILL_PLANS 7957) ──────────────────────
export const BILL_TABS_AGENCY = [
  { key: "invoices", label: "Sub-account billing", icon: "▤" },
  { key: "revenue", label: "Revenue", icon: "↗" },
  { key: "plan", label: "Your plan", icon: "▣" }
];
export const BILL_TABS_SUB = [
  { key: "invoices", label: "Invoices", icon: "▤" },
  { key: "plan", label: "Your plan", icon: "▣" }
];

export const BILL_INVOICES = [
  { who: "Coach James Fitness", color: "#B5822A", plan: "Growth · 3 seats", amount: 620, due: "Sep 1", state: "Paid", method: "Visa •• 4412" },
  { who: "Sarah's Coaching Practice", color: "#7C6CE0", plan: "Essentials · 1 seat", amount: 340, due: "Sep 1", state: "Paid", method: "ACH •• 8821" },
  { who: "Ridgeline Outdoor Co.", color: "#3F7F5C", plan: "Growth · 4 seats", amount: 680, due: "Sep 1", state: "Failed", method: "Visa •• 3391" },
  { who: "Northwind Dental Group", color: "#2F6B8F", plan: "Essentials · 2 seats", amount: 420, due: "Sep 1", state: "Sent", method: "ACH •• 1204" },
  { who: "Meridian Law Partners", color: "#8A5A9E", plan: "Growth · 3 seats", amount: 620, due: "Sep 1", state: "Sent", method: "Card on file" },
  { who: "Verde Landscaping", color: "#4A7C8C", plan: "Essentials · 1 seat", amount: 340, due: "Sep 1", state: "Draft", method: "None on file" }
];

export const BILL_PLANS = [
  { name: "Essentials", price: 340, subs: 5, note: "One seat, six departments, her working their book" },
  { name: "Growth", price: 620, subs: 6, note: "Up to four seats, ten departments, automations included" },
  { name: "Custom", price: 1400, subs: 1, note: "Negotiated — Coach James's multi-location arrangement" }
];

// ── Calendar (CAL_TABS 7964 … CAL_REQUESTS 8087) ───────────────────────────
export const CAL_TABS = [
  { key: "schedule", label: "Schedule", icon: "▦" },
  { key: "links", label: "Booking links", icon: "⚯" },
  { key: "avail", label: "Availability", icon: "◔" },
  { key: "requests", label: "Requests", icon: "⟳", badge: "3" },
  { key: "settings", label: "Settings", icon: "☼" }
];

export const CAL_CALENDARS = [
  { name: "Agency main", kind: "Shared", owner: "Everyone", links: 4, color: "#7C6CE0", note: "The one clients book into", def: true },
  { name: "Discovery round robin", kind: "Round robin", owner: "3 in the pool", links: 1, color: "#3F7F5C", note: "Weighted, tie-break on fewest bookings", def: false },
  { name: "Onboarding collective", kind: "Collective", owner: "Client Success + Finance", links: 1, color: "#B5822A", note: "Only offers times everyone is free", def: false },
  { name: "Antonio personal", kind: "Personal", owner: "You", links: 0, color: "#2F6B8F", note: "Busy times block bookings, details stay hidden", def: false },
  { name: "Group program cohort", kind: "Group", owner: "Client Success", links: 1, color: "#8A5A9E", note: "12 seats a slot, waitlist on when full", def: false },
  { name: "Monthly webinar", kind: "Webinar", owner: "You + Ellis", links: 1, color: "#C05B45", note: "200 registrations capped, replay sent after", def: false }
];

export const CAL_SETTING_GROUPS = [
  { key: "calendars", label: "Calendars", count: 6 },
  { key: "hours", label: "Hours and blocks", count: 6 },
  { key: "reminders", label: "Reminders", count: 5 },
  { key: "payments", label: "Payments", count: 6 },
  { key: "forms", label: "Forms and routing", count: 4 },
  { key: "roles", label: "Who can do what", count: 5 },
  { key: "policies", label: "Policies", count: 5 }
];

export const CAL_FORMS = [
  { name: "Prospect intake", fields: 5, routes: "Answers under 3 clients → Free consult · over 3 → Discovery", live: true, note: "Asked before the slot list appears" },
  { name: "Workshop scoping", fields: 7, routes: "Team size over 10 → Workshop scoping · under → Free consult", live: true, note: "Pricing question routes to Sales" },
  { name: "Existing client session", fields: 2, routes: "Always → 1:1 session with their own owner", live: true, note: "Skips the questions they already answered" },
  { name: "Rescheduling reason", fields: 1, routes: "Third move → she asks you before offering times", live: false, note: "Drafted, not turned on" }
];

export const CAL_ROLES = [
  { role: "Owner", who: "You", can: "Create calendars, set payments, see every detail" },
  { role: "Manager", who: "Marisol Reyes", can: "Create links, edit hours, cannot touch payments" },
  { role: "Host", who: "Anyone in a pool", can: "Accept, move and decline their own bookings" },
  { role: "Coordinator", who: "Aisha Kone", can: "Book on someone's behalf, cannot change policy" },
  { role: "Client", who: "Whoever books", can: "Pick a time, reschedule twice, cancel" }
];

export const CAL_LAYERS = [
  { key: "meetings", label: "Meetings", color: "#7C6CE0" },
  { key: "deadlines", label: "Deadlines", color: "#B5822A" },
  { key: "runs", label: "Automation runs", color: "#2F6B8F" },
  { key: "milestones", label: "Onboarding milestones", color: "#3F7F5C" },
  { key: "follow", label: "Her follow-ups", color: "#8A5A9E" }
];

export const CAL_EVENTS = [
  { day: 3, kind: "meetings", label: "Bellweather discovery", time: "9:30am", who: "Jon Whitaker", dur: "30m" },
  { day: 3, kind: "runs", label: "Monday owner brief", time: "7:00am", who: "Executive Office", dur: "6s" },
  { day: 4, kind: "deadlines", label: "E&O quotes back to Meridian", time: "by 5pm", who: "Finance", dur: "" },
  { day: 4, kind: "meetings", label: "Sarah's quarterly review", time: "11:00am", who: "Marisol Reyes", dur: "60m" },
  { day: 4, kind: "follow", label: "Chase Ridgeline's card", time: "2:00pm", who: "Finance", dur: "" },
  { day: 6, kind: "milestones", label: "Studio Nine goes live", time: "all day", who: "Client Success", dur: "" },
  { day: 9, kind: "deadlines", label: "Northlight renewal decision", time: "by noon", who: "Finance", dur: "" },
  { day: 9, kind: "meetings", label: "Coach James onboarding kickoff", time: "1:00pm", who: "Marisol Reyes", dur: "45m" },
  { day: 9, kind: "meetings", label: "Hartline proposal walkthrough", time: "3:30pm", who: "Jon Whitaker", dur: "30m" },
  { day: 11, kind: "meetings", label: "Verde campaign review", time: "10:00am", who: "Ellis Brand", dur: "45m" },
  { day: 11, kind: "runs", label: "Quiet-account check-in sweep", time: "6:00am", who: "Client Success", dur: "1.4s" },
  { day: 14, kind: "deadlines", label: "Atlanta licence fee posts", time: "all day", who: "Operations", dur: "" },
  { day: 17, kind: "meetings", label: "Meridian quarterly review", time: "9:00am", who: "Priya Nair", dur: "60m" },
  { day: 17, kind: "meetings", label: "Two discovery calls", time: "1:00pm", who: "Jon Whitaker", dur: "30m" },
  { day: 18, kind: "milestones", label: "Northwind week-one check", time: "all day", who: "Client Success", dur: "" },
  { day: 20, kind: "deadlines", label: "General liability renews", time: "by 5pm", who: "Finance", dur: "" },
  { day: 24, kind: "meetings", label: "Book-wide pricing sync", time: "2:00pm", who: "You + Dev", dur: "45m" },
  { day: 25, kind: "follow", label: "Second nudge to Selby", time: "9:00am", who: "Sales", dur: "" },
  { day: 27, kind: "meetings", label: "Ridgeline reporting rebuild", time: "11:00am", who: "Tomas Klein", dur: "60m" }
];

export const CAL_SUB_EVENTS = [
  { day: 3, kind: "meetings", label: "1:1 with a coaching client", time: "9:00am", who: "Sarah", dur: "50m" },
  { day: 4, kind: "meetings", label: "Group program · week four", time: "6:00pm", who: "Sarah", dur: "60m" },
  { day: 4, kind: "runs", label: "Session recaps sent", time: "8:00pm", who: "Client Success", dur: "2s" },
  { day: 6, kind: "deadlines", label: "Insurance certificate expires", time: "all day", who: "Operations", dur: "" },
  { day: 9, kind: "meetings", label: "Two discovery calls", time: "11:00am", who: "Sarah", dur: "30m" },
  { day: 9, kind: "meetings", label: "Corporate workshop prep", time: "2:00pm", who: "Renee", dur: "45m" },
  { day: 9, kind: "deadlines", label: "Workshop proposal due", time: "by 5pm", who: "Sarah", dur: "" },
  { day: 11, kind: "milestones", label: "New client onboarding ends", time: "all day", who: "Renee", dur: "" },
  { day: 14, kind: "follow", label: "Nudge the two who went quiet", time: "9:00am", who: "Client Success", dur: "" },
  { day: 17, kind: "meetings", label: "Group program · week five", time: "6:00pm", who: "Sarah", dur: "60m" },
  { day: 20, kind: "deadlines", label: "Quarterly tax payment", time: "by 5pm", who: "Finance", dur: "" },
  { day: 24, kind: "meetings", label: "Discovery call", time: "10:00am", who: "Sarah", dur: "30m" },
  { day: 27, kind: "meetings", label: "Client review session", time: "1:00pm", who: "Sarah", dur: "50m" }
];

export const CAL_SUB_LINKS = [
  { name: "Free consult", dur: "15 min", buffer: "5 min after", slug: "consult-15", booked: 62, host: "Sarah", live: true, note: "For anyone deciding whether coaching is right for them" },
  { name: "1:1 coaching session", dur: "50 min", buffer: "10 min after", slug: "session-50", booked: 148, host: "Sarah", live: true, note: "Existing clients book their own slots" },
  { name: "Group program call", dur: "60 min", buffer: "none", slug: "group-60", booked: 24, host: "Sarah", live: true, note: "Cohort calls — one slot, many attendees" },
  { name: "Corporate workshop scoping", dur: "45 min", buffer: "15 min after", slug: "workshop-45", booked: 8, host: "Sarah", live: true, note: "For companies asking about a team engagement" },
  { name: "Rescheduling window", dur: "Custom", buffer: "none", slug: "reschedule", booked: 31, host: "Renee", live: false, note: "Paused while the cohort is mid-flight" }
];

export const CAL_SUB_REQUESTS = [
  { who: "Dana Whitfield", what: "Free consult", when: "Thu 4 Sep · 9:00am", state: "Pending", note: "Found you through the group program page", color: "#7C6CE0" },
  { who: "Harper Lin", what: "1:1 coaching session", when: "Tue 9 Sep · 11:00am", state: "Reschedule", note: "Third move this month — she suggests a standing slot", color: "#B5822A" },
  { who: "Okonkwo Group", what: "Corporate workshop scoping", when: "Wed 17 Sep · 2:00pm", state: "Pending", note: "Six attendees, wants pricing first", color: "#3F7F5C" }
];

export const CAL_SUB_SCHEDULES = [
  { name: "Coaching hours", tz: "America/Chicago", days: "Mon–Thu", hours: "9:00am – 4:00pm", used: 2, def: true },
  { name: "Evening cohort", tz: "America/Chicago", days: "Wed", hours: "6:00pm – 7:30pm", used: 1, def: false },
  { name: "No-call Fridays", tz: "America/Chicago", days: "Fri", hours: "no bookings", used: 1, def: false }
];

export const CAL_LINKS = [
  { name: "New sub-account discovery", dur: "15 min", buffer: "5 min after", slug: "discovery-15", booked: 34, host: "Round robin · 3 in the pool", live: true, note: "For prospects deciding whether to move their book to you" },
  { name: "Onboarding kickoff", dur: "45 min", buffer: "15 min after", slug: "kickoff-45", booked: 12, host: "Marisol Reyes", live: true, note: "Sent automatically when a sub-account signs" },
  { name: "Quarterly business review", dur: "60 min", buffer: "15 min either side", slug: "qbr-60", booked: 9, host: "Account owner · collective with Finance", live: true, note: "Her agenda is drafted from that account's numbers" },
  { name: "Campaign review", dur: "30 min", buffer: "none", slug: "campaign-30", booked: 21, host: "Ellis Brand", live: true, note: "Mid-flight look at what's running" },
  { name: "Document signing session", dur: "30 min", buffer: "5 min after", slug: "signing-30", booked: 4, host: "You", live: false, note: "Paused while the vault migration finishes" },
  { name: "Ad-hoc", dur: "Custom", buffer: "10 min after", slug: "ad-hoc", booked: 7, host: "Anyone free", live: true, note: "For anything that doesn't fit the others" }
];

export const CAL_SCHEDULES = [
  { name: "Agency working hours", tz: "America/New_York", days: "Mon–Fri", hours: "9:00am – 5:00pm", used: 4, def: true },
  { name: "Discovery hours", tz: "America/New_York", days: "Tue, Wed, Thu", hours: "10:00am – 3:00pm", used: 1, def: false },
  { name: "Deep-work protected", tz: "America/New_York", days: "Mon, Fri", hours: "no bookings", used: 1, def: false }
];

export const CAL_REQUESTS = [
  { who: "Bellweather Studio", what: "New sub-account discovery", when: "Thu 4 Sep · 9:30am", state: "Pending", note: "Asked for the earliest slot this week", color: "#7C6CE0" },
  { who: "Coach James Fitness", what: "Quarterly business review", when: "Tue 9 Sep · 1:00pm", state: "Reschedule", note: "Wants to move from Monday — clashes with his own class", color: "#B5822A" },
  { who: "Hartline Group", what: "Onboarding kickoff", when: "Wed 17 Sep · 3:30pm", state: "Pending", note: "Two attendees, one in Lisbon", color: "#3F7F5C" },
  { who: "Selby Group", what: "Campaign review", when: "Fri 12 Sep · 10:00am", state: "Cancelled", note: "Cancelled twice now — she suggests a written update instead", color: "#C05B45" }
];

// ── Compass / departments load (DEPT_LOAD, 8094) ───────────────────────────
export const DEPT_LOAD = [
  { dept: "Client Success", pct: 94, tone: "red" },
  { dept: "Operations", pct: 91, tone: "red" },
  { dept: "Marketing", pct: 84, tone: "amber" },
  { dept: "Sales", pct: 71, tone: "green" },
  { dept: "Finance", pct: 62, tone: "green" },
  { dept: "Growth", pct: 58, tone: "green" }
];

// ── Growth pipeline (STAGES 8103, LIFECYCLE 8110, BOARD 8117, DEALS 8131) ──
export const STAGES = [
  { key: "Discovery", count: 3, weighted: 12, label: "$12K" },
  { key: "Proposal", count: 3, weighted: 18, label: "$18K" },
  { key: "Negotiation", count: 1, weighted: 12, label: "$12K" },
  { key: "Closing", count: 1, weighted: 5, label: "$5K" }
];

export const LIFECYCLE = [
  { key: "Leads", count: 34, note: "unqualified enquiries", color: "#C8C3B7" },
  { key: "In sales", count: 8, note: "active prospects", color: "#C8A02E" },
  { key: "Onboarding", count: 3, note: "signed, not live yet", color: "#5A69B8" },
  { key: "Live sub-accounts", count: 12, note: "running with Paige", color: "#2F7A57" }
];

export const BOARD = [
  { stage: "Discovery", name: "Alder & Co.", mrr: "$2,100", days: 18 },
  { stage: "Discovery", name: "Sablewood Studio", mrr: "$1,900", days: 6 },
  { stage: "Discovery", name: "Two inbound enquiries", mrr: "$3,400", days: 3 },
  { stage: "Proposal", name: "Bellweather Studio", mrr: "$8,400", days: 9 },
  { stage: "Proposal", name: "Hartline Group", mrr: "$5,200", days: 12 },
  { stage: "Proposal", name: "Nine Elms Wellness", mrr: "$2,600", days: 4 },
  { stage: "Negotiation", name: "Kestrel Home Services", mrr: "$3,900", days: 3 },
  { stage: "Closing", name: "Fernwood Collective", mrr: "$2,750", days: 2 },
  { stage: "Won", name: "Verde Landscaping", mrr: "$1,680", days: 21 },
  { stage: "Won", name: "Loft & Line Interiors", mrr: "$2,950", days: 34 },
  { stage: "Lost", name: "Pinehurst Group", mrr: "$4,200", days: 40 }
];

export const DEALS = [
  { name: "Bellweather Studio", stage: "Discovery done", mrr: "$8,400", next: "Waiting on your proposal", read: "They asked twice about white-label reporting. The proposal leads with it.", cta: "Read draft", age: "9 days" },
  { name: "Hartline Group", stage: "Proposal sent", mrr: "$5,200", next: "Follow-up is overdue by four days", read: "Their CFO opened the proposal five times without replying. Price is the question, not fit.", cta: "Read draft", age: "12 days" },
  { name: "Kestrel Home Services", stage: "Negotiation", mrr: "$3,900", next: "They want month-to-month for the first quarter", read: "Worth taking. Their churn risk is low and two referrals sit behind them.", cta: "Read my terms", age: "3 days" },
  { name: "Fernwood Collective", stage: "Closing", mrr: "$2,750", next: "Contract out for signature", read: "Signed copy usually comes back inside two days with this template.", cta: "Nudge them", age: "2 days" }
];

// ── Scope switcher (SCOPES, 8138) ──────────────────────────────────────────
export const SCOPES = {
  agency: { label: "Agency", color: "#4A3FA0", tint: "#EDEAFB" },
  book: { label: "Book", color: "#8A6D1E", tint: "#FBF3DC" },
  sub: { label: "Coach James Fitness", color: "#C1652F", tint: "#FBEBE1" }
};

// ── Paige chat / knowledge hub (CHAT_PROJECTS 8144 … KNOW_RECENT 8260) ─────
export const CHAT_PROJECTS = [
  { name: "Q4 pricing move", count: 4, color: "#C8A02E" },
  { name: "Northwind onboarding", count: 6, color: "#7B6BE0" },
  { name: "Selby recovery", count: 3, color: "#C1504A" }
];

export const DOMAINS = [
  { name: "Playbook & doctrine", docs: 14, trained: "2h ago", color: "#C8A02E" },
  { name: "Sub-accounts & threads", docs: 26, trained: "12m ago", color: "#7B6BE0" },
  { name: "Offers & pricing", docs: 9, trained: "1d ago", color: "#2FA98C" },
  { name: "Compliance & vault", docs: 12, trained: "6h ago", color: "#D9776A" },
  { name: "Brand & voice", docs: 11, trained: "3d ago", color: "#D9A03A" },
  { name: "Systems & data", docs: 18, trained: "14m ago", color: "#3FA97E" }
];

export const HUB_NAMES = [
  ["Agency doctrine v4", "Onboarding SOP"],
  ["Ridgeline account thread", "Bellweather discovery"],
  ["Mid-tier package sheet", "Renewal pricing ladder"],
  ["E&O policy + renewals", "Sub-account MSA template"],
  ["Voice guide — operator tone", "Owner digest format"],
  ["Systems Check fix log", "Attribution map"]
];

export const LEARNED = [
  { title: "Ridgeline scope change memo", domain: 1, when: "12m ago" },
  { title: "Systems Check fix log, August", domain: 5, when: "14m ago" },
  { title: "Hartwell renewal quote", domain: 3, when: "6h ago" },
  { title: "Bellweather discovery transcript", domain: 1, when: "9h ago" },
  { title: "Agency positioning one-pager", domain: 4, when: "2d ago" }
];

export const CHAT_GROUPS = [
  {
    label: "PROJECTS", rows: [
      { name: "Cross-book Q4 pricing move", scope: "book" },
      { name: "Agency positioning refresh", scope: "agency" },
      { name: "Coach James turnaround", scope: "sub" }
    ]
  },
  {
    label: "TODAY", rows: [
      { name: "Morning brief — Aug 15", prev: "Three things are load-bearing to…", scope: "book", active: true },
      { name: "Should I raise the mid-tier r…", prev: "Modeled against your last 14 ren…", scope: "agency" },
      { name: "Northwind kickoff plan", prev: "Workspace provisioned, intake s…", scope: "sub" }
    ]
  },
  {
    label: "YESTERDAY", rows: [
      { name: "Dunning tone — softer first…", prev: "Rewrote day 0 and day 3. No pe…", scope: "book" },
      { name: "E&O renewal comparison", prev: "Three carriers, same coverage f…", scope: "agency" }
    ]
  },
  {
    label: "PREVIOUS 7 DAYS", rows: [
      { name: "Why did the pixel drop?", prev: "It came off when /book-a-call w…", scope: "sub" },
      { name: "Weekly digest to owners", prev: "Same format as last week, twelv…", scope: "book" },
      { name: "Marisol's workload options", prev: "Hire, or route onboarding to gr…", scope: "agency" }
    ]
  }
];

export const TRANSCRIPT = [
  { who: "paige", text: "Morning. Three things are load-bearing today: the Bellweather renewal note (94% confidence, ready to send), three failed charges worth $4,180 across the book, and Ridgeline has gone quiet for 19 days. I'd start with the charges — money already earned." },
  { who: "you", text: "What made Ridgeline go quiet?" },
  { who: "agent", agent: "Research", text: "Pulled their thread, portal logins and call history." },
  { who: "agent", agent: "Verifier", text: "Confirmed the login gap against their workspace record." },
  {
    who: "paige",
    text: "Two skipped calls on the 24th and 29th, both rescheduled by their side and never rebooked. Their last reply was a one-liner on the 25th. Sentiment on the thread dropped from warm to neutral after the scope change we shipped on the 18th — that's my best guess at the cause. Their portal logins stopped the same week.\n\nI've drafted a low-pressure reset that names the gap without guilt and offers two exits: a 15-minute call or an async update. Want to read it?",
    sources: "3 sources"
  }
];

export const CHIPS = ["Show me the Ridgeline reset draft", "What's at risk across the book?", "Model a 30% price increase"];

export const SOURCES = [
  { name: "Playbook", meta: "Agency doctrine v4", dot: "#7B6BE0" },
  { name: "Sub-accounts", meta: "12 accounts, 47 threads", dot: "#7B6BE0" },
  { name: "Team", meta: "8 members", dot: "#3FA97E" },
  { name: "Stripe", meta: "synced 4m ago", dot: "#3FA97E" },
  { name: "GA4", meta: "synced 12m ago", dot: "#3FA97E" },
  { name: "Calendar", meta: "synced 1m ago", dot: "#3FA97E" }
];

export const PROPOSED = [
  { scope: "agency", title: "Renewal note to Bellweather Studio", conf: "94%" },
  { scope: "book", title: "Reprice mid-tier package — competitor moved", conf: "81%" },
  { scope: "agency", title: "Chase 3 failed charges ($4,180)", conf: "97%" },
  { scope: "sub", title: "Heads-up to Ridgeline about their broken form", conf: "92%" }
];

export const KNOW_CATS = ["Brand", "Playbook", "Positioning", "Sales", "Client Success", "Ops"];

export const KNOW_ENTRIES = {
  Brand: [
    { title: "We write like an operator, not a vendor", body: "Short sentences. Name the number. Never 'partner with you on your journey'.", src: "Learned from your reply to Bellweather on Aug 8", when: "6 days ago" },
    { title: "Gold is for the commit action only", body: "Approve, Send, Escalate. Everything else stays neutral.", src: "Saved by you on Jul 22", when: "3 weeks ago" }
  ],
  Playbook: [
    { title: "No sub-account onboards without a Systems Check first", body: "The scan gives us the first three wins to show in week one.", src: "Learned from the Verde onboarding", when: "2 weeks ago" }
  ],
  Positioning: [
    { title: "We sell the hours back, not the software", body: "847 hours across the book is the number that closes.", src: "Learned from the Hartline call", when: "9 days ago" }
  ],
  Sales: [
    { title: "Month-to-month for the first quarter is acceptable", body: "Below $4K MRR only, and only with a named referral behind them.", src: "Saved by you on Aug 11", when: "3 days ago" }
  ],
  "Client Success": [
    { title: "Answer inside the same morning", body: "Median first response across the book is 4h. Under 25 minutes keeps renewals quiet.", src: "Learned from support patterns", when: "5 days ago" }
  ],
  Ops: [
    { title: "Marisol covers launches, not onboarding, in launch weeks", body: "Onboarding routes to Paige on green tier when she's over 90%.", src: "Saved by you on Aug 4", when: "10 days ago" }
  ]
};

export const KNOW_RECENT = [
  { title: "Referrals close in 19 days, cold in 34", note: "Noticed across your last 13 deals. Save it?" },
  { title: "Ridgeline's team edits campaigns mid-flight", note: "Explains most of the rework hours. Save it?" }
];

// ── Sub-agents / departments / actions / skills (SUBAGENTS 8265 … HANDOFFS 8312) ──
export const SUBAGENTS = [
  { name: "Research", role: "Gathers and cross-checks", state: "Running", task: "Client Success signals across 12 sub-accounts", rate: "96%", tier: "Fast tier" },
  { name: "Verifier", role: "Confirms before you see it", state: "Running", task: "Validating three at-risk flags", rate: "99%", tier: "Frontier" },
  { name: "Compliance", role: "Checks terms and obligations", state: "Queued", task: "Waiting on Research", rate: "97%", tier: "Frontier" },
  { name: "Copy", role: "Writes in the right voice", state: "Idle", task: "", rate: "92%", tier: "Fast tier" },
  { name: "Design", role: "Builds what needs to be seen", state: "Idle", task: "", rate: "89%", tier: "Fast tier" },
  { name: "Strategy", role: "Frames the harder calls", state: "Idle", task: "", rate: "94%", tier: "Frontier" }
];

export const AGENT_RUNS = [
  { agent: "Research", what: "Cross-book at-risk scan", when: "2m ago", ok: true },
  { agent: "Copy", what: "Bellweather follow-up draft", when: "3h ago", ok: true },
  { agent: "Compliance", what: "E&O coverage comparison", when: "Yesterday", ok: true },
  { agent: "Verifier", what: "Ridgeline attribution backfill", when: "Yesterday", ok: false }
];

export const ACTIONS = [
  { scope: "agency", title: "Send the Bellweather follow-up", dept: "Growth", tier: "confirm", conf: "94%", age: "3h", status: "Awaiting your approval" },
  { scope: "book", title: "Weekly digest to all 12 sub-account owners", dept: "Client Success", tier: "confirm", conf: "89%", age: "6h", status: "Awaiting your approval" },
  { scope: "sub", title: "Heads-up to Ridgeline about their broken form", dept: "Client Success", tier: "auto", conf: "92%", age: "2h", status: "Executed" },
  { scope: "agency", title: "Chase three failed charges ($4,180)", dept: "Finance", tier: "auto", conf: "97%", age: "Yesterday", status: "Executed" },
  { scope: "sub", title: "Reprice Ridgeline's retainer at $5,200", dept: "Finance", tier: "off", conf: "91%", age: "1d", status: "Briefed — you take it" },
  { scope: "book", title: "Move onboarding to green tier for a quarter", dept: "Operations", tier: "off", conf: "84%", age: "2d", status: "Briefed — you take it" }
];

export const SKILLS = [
  { name: "Renewal Rescue", desc: "Reads usage and writes the renewal before it's due", src: "Platform baseline", dept: "Client Success", tier: "confirm", resell: "Enabled for all 12" },
  { name: "Objection Library", desc: "Answers the two objections that come up most", src: "Your library", dept: "Sales", tier: "confirm", resell: "Enabled for 4" },
  { name: "Pixel & Attribution Guard", desc: "Watches tracking and fixes what breaks", src: "Platform baseline", dept: "Marketing", tier: "auto", resell: "Enabled for all 12" },
  { name: "Intake Call Scorer", desc: "Scores discovery calls against your playbook", src: "Marketplace", dept: "Sales", tier: "confirm", resell: "Not resold" },
  { name: "No-Show Recovery", desc: "Recovers missed appointments into next week", src: "Platform baseline", dept: "Client Success", tier: "auto", resell: "Enabled for 9" },
  { name: "Agency Weekly Digest", desc: "Writes the owner digest from real numbers", src: "Your library", dept: "Executive Office", tier: "confirm", resell: "Not resold" }
];

export const DEPARTMENTS = [
  { name: "Executive Office", agent: "Paige Chief of Staff", tier: "confirm", focus: "Holding three decisions for you", acts: 14 },
  { name: "Marketing", agent: "Paige Marketing Agent", tier: "auto", focus: "September nurture across the book", acts: 31 },
  { name: "Sales", agent: "Paige Sales Agent", tier: "off", focus: "Two prospects past follow-up", acts: 9 },
  { name: "Client Success", agent: "Paige Success Agent", tier: "auto", focus: "Renewals and at-risk scan", acts: 47 },
  { name: "Product / Curriculum", agent: "Paige Product Agent", tier: "confirm", focus: "Onboarding sequence rewrite", acts: 6 },
  { name: "Technology / Automation", agent: "Paige Systems Agent", tier: "auto", focus: "Four findings open", acts: 22 },
  { name: "Finance", agent: "Paige Finance Agent", tier: "confirm", focus: "Payroll filing in 8 days", acts: 18 },
  { name: "People / Talent", agent: "Paige People Agent", tier: "off", focus: "Ops capacity options", acts: 4 },
  { name: "Legal / Compliance", agent: "Paige Compliance Agent", tier: "confirm", focus: "E&O renewal comparison", acts: 7 },
  { name: "Operations / PMO", agent: "Paige Ops Agent", tier: "auto", focus: "Rework hours on Ridgeline", acts: 26 }
];

export const HANDOFFS = [
  { from: "Client Success", to: "Finance", what: "Ridgeline's hours handed over for repricing" },
  { from: "Systems", to: "Client Success", what: "Broken pixel handed over for the client heads-up" },
  { from: "Sales", to: "Executive Office", what: "Bellweather proposal escalated for your approval" }
];

// ── Scope-agnostic label map (LBL, 8319) ───────────────────────────────────
// Keeps component internals scope-agnostic (agency here, tenants at platform scope).
export const LBL = { tenants: "Sub-accounts", tenant: "sub-account", Tenant: "Sub-account", owner: "your book" };

// ── Cross-book pipeline seed set (STAGE_SET 8321, seedPipes 8330) ──────────
export const STAGE_SET = [
  { key: "Discovery", tint: "#EDE9DC", ink: "#5D594F" },
  { key: "Nurturing", tint: "#EFE7D2", ink: "#6E5514" },
  { key: "Proposal", tint: "#E9DCBE", ink: "#6E5514" },
  { key: "Closing", tint: "#E2CFA6", ink: "#5A4410" },
  { key: "Won", tint: "#E6F1EA", ink: "#2A6B4C" },
  { key: "Lost", tint: "#F2EFEA", ink: "#8A8478" }
];

// Deterministic seeded generator for the per-sub-account pipeline fixture matrix.
// Pure (no view markup) — reproduces the design's stand-in pipeline counts/values.
export const seedPipes = () => {
  let s = 7717;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return SUBS.map(sub => {
    const counts = STAGE_SET.map((st2, i) => Math.round(r() * (i < 4 ? 4 : 3)) + (i < 4 ? 1 : 0));
    const value = counts.slice(0, 4).reduce((a, c, i) => a + c * (900 + i * 700), 0);
    return { counts, value, delta: Math.round((r() - 0.42) * 22), stalled: Math.round(r() * 3) };
  });
};

// ── Conversations console (CLIENT_NAMES 8340 … CONV_DIVERGENCE 8460) ───────
export const CLIENT_NAMES = [
  ["Dana Whitmore", "Whitmore Wellness"], ["Ben Sato", "Northline Fit"], ["Ivy Marsh", "Marsh & Co"],
  ["Owen Pratt", "Pratt Studio"], ["Nadia Kim", "Kim Nutrition"], ["Luis Ortega", "Ortega Roofing"],
  ["Erin Blake", "Blake Legal"], ["Sam Devi", "Devi Dental"], ["Tara Nolan", "Nolan Coaching"]
];

export const NEXT_ACTIONS = [
  "Proposal is written and waiting", "Follow-up overdue by three days", "Wants pricing before Friday",
  "Asked for two references", "Discovery call to book", "Contract out for signature"
];

export const CHANNELS = [
  { key: "Email", icon: "✉" },
  { key: "SMS", icon: "◫" },
  { key: "iMessage", icon: "◉" },
  { key: "WhatsApp", icon: "◍" },
  { key: "Instagram", icon: "◎" }
];

export const THREADS = [
  {
    sub: 0, who: "Dana Whitmore", role: "Founder · Whitmore Wellness", status: "Hot Lead", age: "12m",
    unread: 2, channel: "Email",
    preview: "Two things before we sign — can you clarify the onboarding timeline?",
    msgs: [
      { from: "them", when: "Today 9:12am", text: "Two things before we sign — can you clarify the onboarding timeline, and does the retainer include the quarterly review?" },
      { from: "us", when: "Yesterday 4:40pm", text: "Sending the phase-one checklist over now. Happy to walk it through live if easier." }
    ],
    draft: "Dana — onboarding runs two weeks: week one is setup and audit, week two is your first live campaign. And yes, the quarterly review is included in the retainer, no add-on. Want me to hold Thursday at 10 for a walkthrough?",
    insight: "Two open questions in her last message. Sentiment warm. She replies fastest before 10am.",
    email: "dana@whitmorewellness.co", phone: "(415) 555-0182",
    quick: ["Answer both questions", "Send phase-one checklist", "Book the review call"]
  },
  {
    sub: 1, who: "Luis Ortega", role: "Owner · Ortega Roofing", status: "Client for 8 months", age: "1h",
    unread: 0, channel: "SMS",
    preview: "Got it — thanks for sorting the form so fast.",
    msgs: [
      { from: "them", when: "Today 8:05am", text: "Got it — thanks for sorting the form so fast." },
      { from: "us", when: "Today 7:52am", text: "Form is back up. Three leads from Tuesday were retried and came through." }
    ],
    draft: "Any time. I retried the three from Tuesday and they all landed, so nothing was lost. I'll keep an eye on it through the weekend.",
    insight: "Warm and low-maintenance. Two months of on-time payments. Good candidate for the referral ask.",
    email: "luis@ortegaroofing.com", phone: "(602) 555-0144",
    quick: ["Close the loop", "Ask for a referral", "Send the invoice"]
  },
  {
    sub: 2, who: "Erin Blake", role: "Partner · Blake Legal", status: "Awaiting reply · 6 days", age: "6d",
    unread: 1, channel: "Email",
    preview: "We're reviewing internally and will come back to you.",
    msgs: [
      { from: "them", when: "Aug 9", text: "We're reviewing internally and will come back to you." },
      { from: "us", when: "Aug 8", text: "Proposal attached. Happy to adjust scope on the intake piece." }
    ],
    draft: "Erin — no rush on the internal review. One thing that may help: I can split the intake piece into its own phase so you're not committing to the whole scope up front. Want me to send that version?",
    insight: "Six days quiet after a proposal. Their pattern last time was an 11-day gap before signing.",
    email: "erin@blakelegal.com", phone: "(312) 555-0119",
    quick: ["Offer a phased scope", "Check in lightly", "Send a case study"]
  }
];

export const CONV_CHANNEL_PERF = [
  { key: "Email", reply: 41, resp: "3h 40m", deliv: 97, vol: 4820 },
  { key: "SMS", reply: 63, resp: "22m", deliv: 99, vol: 2140 },
  { key: "iMessage", reply: 58, resp: "31m", deliv: 98, vol: 610 },
  { key: "WhatsApp", reply: 55, resp: "48m", deliv: 96, vol: 890 },
  { key: "Instagram", reply: 34, resp: "5h 10m", deliv: 92, vol: 430 }
];

export const CONV_DOMAINS = [
  { name: "mail.sarahcoaching.co", placement: 98, trend: 1 },
  { name: "send.ridgelineoutdoor.com", placement: 88, trend: -6 },
  { name: "mail.northwinddental.com", placement: 97, trend: 0 },
  { name: "hello.brightpathtutoring.org", placement: 94, trend: 2 }
];

export const CONV_PATTERNS = [
  {
    tag: "Book-wide pattern learned",
    body: "All 12 sub-accounts see a 22% higher reply rate on outbound sent before 10am in the client's local time.",
    action: "Propose morning-send timing to all 12"
  },
  {
    tag: "Cross-book objection pattern",
    body: "Four sub-accounts show the same Discovery objection — price gets raised before value is anchored. Response templates are drafted for each.",
    action: "Send drafts to the four owners"
  },
  {
    tag: "Voice drift caught",
    body: "Two sub-accounts' approved edits keep softening her closing lines. She's adjusted their voice profiles and wants your read.",
    action: "Review the voice changes"
  }
];

export const CONV_DEFAULTS = [
  { name: "Channels enabled for new sub-accounts", value: "Email · SMS · WhatsApp", using: 12, over: 0, note: "What a new workspace starts with." },
  { name: "Signature template", value: "{{tenant_name}} · {{owner_name}}", using: 10, over: 2, note: "Rendered in each sub-account's own brand." },
  { name: "Response SLA", value: "4 business hours", using: 9, over: 3, note: "Target time to first reply." },
  { name: "Business hours", value: "8am–6pm, their timezone", using: 11, over: 1, note: "Timezone-aware per sub-account." },
  { name: "Quiet hours", value: "10pm–7am local", using: 12, over: 0, note: "No sends inside this window." },
  { name: "Draft aggressiveness", value: "Standard", using: 8, over: 4, note: "Conservative · Standard · Aggressive." },
  { name: "Escalation rules", value: "Confidence under 80% · negative sentiment · over $2,000", using: 10, over: 2, note: "When she stops and hands it to a human." },
  { name: "Forbidden phrases", value: "9 phrases", using: 12, over: 0, note: "Never appears in any draft, any sub-account." }
];

export const CONV_POLICIES = [
  { name: "Quiet hours are enforced", body: "No message sends between 10pm and 7am in the recipient's local time, whatever a sub-account prefers.", why: "Messaging compliance. Non-negotiable." },
  { name: "The sub-account is named, not the agency", body: "Every outbound message identifies the sending sub-account by name. Your agency never appears in a client thread.", why: "The client's relationship is with them." },
  { name: "High-value messages need owner approval", body: "Anything with dollar impact over $2,000 routes to the sub-account owner regardless of their autonomy tier.", why: "Money decisions stay with the person who owns the relationship." },
  { name: "Message history is retained 24 months", body: "Threads are kept for at least 24 months across every sub-account.", why: "Retention floor for disputes and audits." },
  { name: "Prohibited claims", body: "Eleven claim types no draft can make in any sub-account — guarantees of outcome, income promises, and the rest.", why: "Keeps every workspace out of trouble." }
];

export const CONV_BEHAVIOR = [
  { name: "Auto-send confidence floor", value: "85%", note: "She only sends on her own above this." },
  { name: "Draft window", value: "24 hours ahead", note: "How long you have to approve before send time." },
  { name: "Learning mode", value: "On", note: "She proposes template updates from what she sees across the book." },
  { name: "Cross-sub-account pattern sharing", value: "Meta-patterns only", note: "Timing and phrasing patterns travel. Client data never does." }
];

export const CONV_DIVERGENCE = [
  { who: 1, what: "Quiet hours opened to 11pm SMS", read: "Their clientele works night shifts. Legitimate.", ok: true },
  { who: 2, what: "Response SLA set to 48 hours", read: "Slower than anyone comparable in your book. Worth asking.", ok: false },
  { who: 0, what: "Draft aggressiveness on Conservative", read: "New owner, three weeks in. Expected while trust builds.", ok: true }
];

// ── Growth Studio (GROWTH_TABS 8466 … STUDIO_CHIPS 8532) ───────────────────
export const GROWTH_TABS = [
  { key: "overview", label: "Overview", icon: "⚡", book: true, sub: true },
  { key: "brand", label: "Brand Kit", icon: "✦", book: false, sub: true, bookWhy: "Each sub-account owns their brand — look at one of theirs instead." },
  { key: "social", label: "Social", icon: "◍", book: true, sub: true },
  { key: "pages", label: "Pages", icon: "▤", book: true, sub: true },
  { key: "funnels", label: "Funnels", icon: "↗", book: true, sub: true },
  { key: "forms", label: "Forms", icon: "▥", book: true, sub: true },
  { key: "builders", label: "Builders", icon: "◫", book: false, sub: true, bookWhy: "Builders are per-workspace tools. There's nothing to add up." }
];

export const CAMPAIGNS = [
  { name: "Teardown series — Q3", ch: "Email + LinkedIn", reached: "2,840", open: "41%", replies: "9.2%", attr: "$8,400", state: "Live" },
  { name: "Systems Check offer", ch: "Meta ads", reached: "18,400", open: "2.9%", replies: "1.4%", attr: "$2,600", state: "Live" },
  { name: "Client story: Harper & Vale", ch: "Email", reached: "1,210", open: "52%", replies: "14.1%", attr: "—", state: "Draft" },
  { name: "Dormant list revival", ch: "Email", reached: "4,600", open: "22%", replies: "3.8%", attr: "$1,100", state: "Paused" }
];

export const BRAND_TOKENS = [
  { label: "Ink", value: "#1B1B1F" }, { label: "Gold", value: "#C8A02E" },
  { label: "Paper", value: "#FAF9F5" }, { label: "Signal", value: "#2F7A57" }
];

export const SOCIAL_POSTS = [
  { where: "LinkedIn", text: "The teardown nobody asked for: why your intake form loses 40% of leads", reach: "12,400", eng: "5.1%", when: "2d ago" },
  { where: "YouTube", text: "Systems Check, live — we scan a coaching business in 9 minutes", reach: "3,180", eng: "8.4%", when: "5d ago" },
  { where: "Instagram", text: "Twelve businesses, one operator, zero missed follow-ups", reach: "2,050", eng: "3.2%", when: "6d ago" }
];

export const PAGES_LIST = [
  { name: "Agency teardown offer", views: "4,820", conv: "6.1%", state: "Live" },
  { name: "Systems Check landing", views: "9,140", conv: "3.4%", state: "Live" },
  { name: "Partner referral page", views: "610", conv: "11.2%", state: "Live" },
  { name: "Q4 pricing page", views: "—", conv: "—", state: "Draft" }
];

export const FUNNELS_LIST = [
  { name: "Teardown → discovery call", steps: 4, entered: "2,840", finished: "218", rate: "7.7%", state: "Live" },
  { name: "Systems Check → trial", steps: 3, entered: "18,400", finished: "512", rate: "2.8%", state: "Live" },
  { name: "Referral → onboarding", steps: 5, entered: "94", finished: "38", rate: "40.4%", state: "Live" }
];

export const FORMS_LIST = [
  { name: "Discovery call intake", subs: "184", rate: "62%", where: "Systems Check landing" },
  { name: "Teardown request", subs: "96", rate: "48%", where: "Teardown offer" },
  { name: "Partner referral", subs: "31", rate: "71%", where: "Referral page" },
  { name: "Newsletter", subs: "412", rate: "—", where: "Site footer" },
  { name: "Sub-account application", subs: "22", rate: "38%", where: "Pricing page" }
];

export const BUILDERS_LIST = [
  { name: "Page builder", note: "Landing pages and sites", used: "used 2h ago" },
  { name: "Funnel builder", note: "Multi-step flows with logic", used: "used yesterday" },
  { name: "Form builder", note: "Intake, application, survey", used: "used 3d ago" },
  { name: "Image studio", note: "Brand-locked visuals", used: "used 5d ago" },
  { name: "Internal tools", note: "Dashboards and calculators", used: "used 2w ago" },
  { name: "Email designer", note: "Broadcasts and sequences", used: "used 4d ago" }
];

export const STUDIO_PROJECTS = [
  { name: "Teardown offer site", kind: "Site · 6 pages", when: "2h ago", state: "Published" },
  { name: "Systems Check landing", kind: "Page + form", when: "Yesterday", state: "Published" },
  { name: "Discovery-call intake", kind: "Form", when: "3d ago", state: "Published" },
  { name: "Sub-account scorecard", kind: "Internal tool", when: "5d ago", state: "Draft" },
  { name: "Referral one-pager", kind: "Page", when: "1w ago", state: "Published" }
];

export const STUDIO_CHIPS = ["Agency teardown site", "Sub-account welcome kit", "Discovery-call intake", "Referral one-pager"];

// ── Trust Compass / autonomy matrix (TIERS 8534 … SENT 8571) ───────────────
export const TIERS = ["off", "confirm", "auto"];
export const TIER_META = {
  off: { label: "OFF", color: "#B4483C", glow: "rgba(196,84,70,", note: "human only" },
  confirm: { label: "CONFIRM", color: "#C08A1E", glow: "rgba(214,164,54,", note: "she drafts, you approve" },
  auto: { label: "AUTO", color: "#2F7A57", glow: "rgba(63,150,104,", note: "she runs it" }
};

export const OWNERS = ["Sarah Whitfield", "Tom Ridge", "Dr. Nia Okafor", "James Alder", "Bea Cortez", "Priya Raman",
  "Hal Bennett", "Mika Sato", "Dana Selby", "Marisol Vega", "Kep Larson", "Ana Cruz"];

// fixture autonomy matrix: sub-account × department. Deterministic seeded generator,
// pure (no view markup) — reproduces the design's stand-in autonomy grid.
export const seedMatrix = () => {
  let s = 991;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return SUBS.map((sub, i) => DEPARTMENTS.map((d, j) => {
    const v = r();
    if (d.name === "Legal / Compliance") return v < 0.6 ? "off" : "confirm";
    if (d.name === "Client Success") return v < 0.82 ? "auto" : "confirm";
    if (d.name === "Sales") return v < 0.5 ? "off" : v < 0.85 ? "confirm" : "auto";
    return v < 0.42 ? "auto" : v < 0.86 ? "confirm" : "off";
  }));
};

export const AUDIT = [
  { who: "You", what: "Marketing", from: "confirm", to: "auto", when: "Yesterday, 4:12pm", why: "Nurture sends were queuing behind approvals" },
  { who: "You", what: "Finance", from: "auto", to: "confirm", when: "Aug 11", why: "Wanted eyes on invoices over $2K" },
  { who: "Marisol", what: "Operations / PMO", from: "confirm", to: "auto", when: "Aug 9", why: "Rework hours climbing on three sub-accounts" },
  { who: "You", what: "Sales", from: "confirm", to: "off", when: "Aug 4", why: "Rewriting the outbound voice guide first" },
  { who: "Paige", what: "Technology / Automation", from: "confirm", to: "auto", when: "Aug 1", why: "You approved 14 of 14 fix drafts in a row" }
];

export const PROPOSALS = [
  { title: "Turn on CONFIRM for Sales follow-ups", scope: "6 sub-accounts", est: "3 likely to accept", dept: "Sales" },
  { title: "Auto-approve renewal notes under $500", scope: "Coach James Fitness", est: "high acceptance", dept: "Client Success" },
  { title: "Move Legal to CONFIRM before contract season", scope: "4 sub-accounts", est: "2 likely to accept", dept: "Legal / Compliance" }
];

export const SENT = [
  { title: "CONFIRM on Sales follow-ups", when: "Aug 12", status: "Accepted" },
  { title: "AUTO on no-show recovery", when: "Aug 6", status: "Declined" },
  { title: "CONFIRM on Finance dunning", when: "Aug 14", status: "Pending" }
];

// ── Analytics (AN_SUBS 8577, AN_TABS 8586) ─────────────────────────────────
export const AN_SUBS = [
  { key: "Sarah's Coaching Practice", owner: "Sarah Whitfield", color: "#7C6CE0", mrr: 1450, vertical: "Fitness coaching" },
  { key: "Northwind Dental Group", owner: "Priya Raman", color: "#2F7A57", mrr: 2100, vertical: "Health" },
  { key: "Coach James Fitness", owner: "James Alarie", color: "#C8702E", mrr: 6200, vertical: "Fitness coaching" },
  { key: "Ridgeline Consulting", owner: "Dana Cole", color: "#4A78C8", mrr: 850, vertical: "Business consulting" },
  { key: "Fernwood Law", owner: "Marcus Reed", color: "#8A5A9E", mrr: 3400, vertical: "Law" },
  { key: "Kestrel Advisory", owner: "Ana Ferreira", color: "#B5822A", mrr: 1900, vertical: "Business consulting" }
];

export const AN_TABS = [
  { key: "brief", label: "Brief", icon: "◉", title: "Brief", sub: "Where things stand, what changed, what needs you." },
  { key: "money", label: "The money", icon: "◫", title: "The money", sub: "Revenue, expenses, cash — where it comes from, where it goes, what's next." },
  { key: "profit", label: "Profitability", icon: "▤", title: "Profitability", sub: "Which work makes money, which work loses money, and what to change." },
  { key: "retain", label: "Retention", icon: "◍", title: "Retention", sub: "Who's staying, who's leaving, and what she's doing about it." },
  { key: "decide", label: "Decisions", icon: "⌥", title: "Decisions", sub: "What if you did this? She's already modeled it." },
  { key: "market", label: "Market watch", icon: "◈", title: "Market watch", sub: "What's happening in your market — and your sub-accounts' markets." }
];

// ── Section blurbs (OTHER, 8595) ───────────────────────────────────────────
export const OTHER = {
  compass: ["Trust Compass", "Ten department segments for the agency, plus the autonomy spread across your book. Sub-account autonomy stays owner-set."],
  growth: ["Growth", "The agency's own pipeline: prospects considering a sub-account, and the campaigns bringing them in."],
  analytics: ["Analytics", "Six sub-tabs for the agency's own numbers, plus an Across sub-accounts roll-up for portfolio profitability."],
  vault: ["Business Vault", "The agency's obligations in six categories, plus the 19 coming due across your book in 30 days."],
  integrations: ["Integrations", "The agency's own connections, and which tools each sub-account has handed to Paige."],
  team: ["Team", "Agency staff and the sub-accounts each of them services."],
  setup: ["Setup", "Agency profile, billing, brand cascade defaults, and provisioning defaults."]
};

// ── §13 HONESTY FLAGS — the design's own "this is layout, not a live query"
//    disclosures, extracted VERBATIM. These are the stand-in warnings the design
//    surfaces per tab/surface so nobody mistakes fixture figures for platform data.
//    Two (convosFlag, fleetPointer) interpolate LBL/AGENCY, kept as the design wrote
//    them. tmBanner is NOT here — it is dynamic (= the per-scope TEAM_VIEW banner);
//    see the crew report gap note.
export const FLAGS = {
  anFlag: "Cross-book aggregation, cost-to-serve, at-risk classification and market signals have no confirmed backend route yet — figures here are stand-ins, not platform figures.",
  pipesFlag: "No cross-book pipeline query is confirmed in the codebase — the sub-account names, stage counts, values and stalls here are all stand-ins, not your real sub-accounts or platform figures. Your real roster is on the Sub-accounts tab.",
  convosFlag: "Cross-book threads, send-from-identity routing and per-" + LBL.tenant + " draft voice have no confirmed backend route — this console is the layout only.",
  caFlag: "No cross-book metrics query exists yet, and draft-approval and auto-send outcomes aren't being recorded per draft. Everything on this tab is layout with stand-in figures, not measured performance.",
  csFlag: "Defaults and policies aren't structurally distinct in the codebase yet, and no send-time enforcement layer is confirmed — the [POLICY] locks here describe intent, not enforced behavior.",
  gFlag: "No cross-book growth query is confirmed, and the Studio has no confirmed context handoff — figures and the acting-as brand load are layout only.",
  tcFlag: "Per-department autonomy tiers, the cross-tenant read of your sub-accounts' settings, and the proposal flow have no confirmed backend route yet — positions and audit entries here are stand-ins, not platform figures.",
  teamFlag: "Utilization, hours logged and per-person workload have no confirmed data class in the codebase — these figures are layout stand-ins pending your ruling.",
  pipeFlag: "Pending your schema ruling — no sales-pipeline data class is confirmed in the codebase, so this tab is the layout only. Numbers here are stand-ins, not platform figures.",
  mkBanner: "No catalog, curation or earnings substrate exists yet — install counts, adoption and revenue here are stand-ins, not platform records.",
  chatFlag: "Scope commands and per-sub-account source attribution have no confirmed backend route — the pill and source breakdown are layout only until that lands.",
  agentsFlag: "The specialist registry has no confirmed schema — utilization, current task and success rate are layout stand-ins.",
  actsFlag: "Action scope is not a confirmed field in the codebase — the Agency / Book / sub-account badges are layout only.",
  fleetPointer: AGENCY.subCount + " sub-accounts run their own Paige teams from their own Playbook. Fleet view is not built yet.",
  calBanner: "No calendar substrate exists yet — bookings, availability and connected calendars here are stand-ins, not real events.",
  blBanner: "No billing substrate exists yet — invoice states, revenue and platform charges here are stand-ins, not ledger records.",
  bvBanner: "No obligations, vendor or renewal substrate exists yet — every figure here is a stand-in, not a platform record.",
  auBanner: "No automation registry exists yet — triggers, run history and cross-tenant roll-ups here are stand-ins, not platform records."
};

// ── Cross-book TEAM_VIEW inline banners — static honesty strings the design
//    hard-codes inside the (render-logic) TEAM_VIEW builder. Surfaced here as data
//    so the integrator can reuse the exact wording when porting TEAM_VIEW's book
//    scope. (The dynamic `subBanner` string is built per-picked-sub-account inside
//    TEAM_VIEW and is NOT a static fixture.)
export const TEAM_VIEW_BANNERS = {
  roster: "Cross-book roster aggregation is unconfirmed in the codebase — these figures are stand-ins, not platform figures.",
  workload: "Cross-book capacity data is unconfirmed in the codebase — these figures are stand-ins, not platform figures.",
  performance: "Cross-book performance roll-up is unconfirmed in the codebase — these figures are stand-ins, not platform figures.",
  activity: "The cross-book event feed is unconfirmed in the codebase — these entries are stand-ins, not platform events."
};
