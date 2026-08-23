// PAIGE Super Admin — information architecture data.
// A rail slot is a body of work with its own objects and its own performance.
// A verb is a capability PAIGE calls. A knob is a setting. A list of past events
// is a history tab inside whatever produced it.
(function () {
  var P = {};

  P.PLACES = [
    { id: 'fleet', label: 'Fleet', path: 'M2 8a6 2.9 0 1 0 12 0a6 2.9 0 1 0-12 0 M6.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0' },
    { id: 'relationships', label: 'Relationships', path: 'M4.2 4.6a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M9.6 11.4a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M6.6 6.6l4.4 3.6 M2 13.4c0-2 1.6-3.2 4-3.2' },
    { id: 'campaigns', label: 'Campaigns', path: 'M2.6 6.4h3.2L11 3.2v9.6L5.8 9.6H2.6z M13.2 5.6a3.4 3.4 0 0 1 0 4.8' },
    { id: 'marketplace', label: 'Marketplace', path: 'M2.6 6.2h10.8l-1 7H3.6z M5.4 6.2V4.4a2.6 2.6 0 0 1 5.2 0v1.8' },
    { id: 'analytics', label: 'Analytics', path: 'M2.5 13.4V9.2 M6.2 13.4V4.6 M9.8 13.4V7 M13.4 13.4V2.6' },
    { id: 'settings', label: 'Settings', path: 'M6.2 8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M8 2.2v2 M8 11.8v2 M2.2 8h2 M11.8 8h2 M4 4l1.4 1.4 M10.6 10.6L12 12' }
  ];

  var MAIL = 'M2 4.2h12v7.6H2z M2 4.2l6 4.4 6-4.4';
  var CODE = 'M5.6 4.4L2.4 8l3.2 3.6 M10.4 4.4L13.6 8l-3.2 3.6 M9.2 3.2l-2.4 9.6';
  var PLUG = 'M6 2.4v3.2 M10 2.4v3.2 M4.4 5.6h7.2v2.8a3.6 3.6 0 0 1-7.2 0z M8 12v1.6';
  var GLOBE = 'M8 2.2a5.8 5.8 0 1 0 .1 0z M2.4 8h11.2 M8 2.2c1.6 1.8 2.4 3.8 2.4 5.8s-.8 4-2.4 5.8 M8 2.2C6.4 4 5.6 6 5.6 8s.8 4 2.4 5.8';
  var WINDOW = 'M2.2 3.4h11.6v9.2H2.2z M2.2 6h11.6';
  var SWEEP = 'M2.4 8.6l3.6 3.4 7.6-8 M2.4 4.4h3.6';
  var KEY = 'M9.8 3.2a3 3 0 1 0 2.2 5.1l1.6 1.6-1.2 1.2-1.6-1.6 M2.4 13.6l4.4-4.4';
  var BELL = 'M4.6 11.2V7.4a3.4 3.4 0 0 1 6.8 0v3.8z M3.2 11.2h9.6';
  var QUERY = 'M6.8 3a3.8 3.8 0 1 0 .1 0z M9.6 9.8L13.4 13.6';
  var SEQ = 'M3 4.4h10 M3 8h7 M3 11.6h4 M12 9.6l2 2-2 2';

  // autonomy: 0 Autonomous · 1 Ask first · 2 Draft only
  P.CAPS = [
    { group: 'Reach out', items: [
      { id: 'email', label: 'Send an email', note: 'Composes, then delivers on your word', path: MAIL, autonomy: 1, scope: 'Current scope', substrate: 'Live' },
      { id: 'sequence', label: 'Run a sequence', note: 'Multi-step outbound against a segment', path: SEQ, autonomy: 1, scope: 'Campaigns', substrate: 'Live' }
    ]},
    { group: 'Build and connect', items: [
      { id: 'sandbox', label: 'Write and run code', note: 'Sandboxed. Output reviewable before it lands', path: CODE, autonomy: 2, scope: 'Sandbox only', substrate: 'No substrate', stub: true },
      { id: 'connect', label: 'Connect a tool', note: 'MCP or API. Scopes shown before consent', path: PLUG, autonomy: 1, scope: 'Platform', substrate: 'Stage 3' }
    ]},
    { group: 'Look things up', items: [
      { id: 'web', label: 'Search the web', note: 'Reads only. Cites sources or says nothing', path: GLOBE, autonomy: 0, scope: 'Read-only', substrate: 'No substrate', stub: true },
      { id: 'browse', label: 'Open a page', note: 'A browser she drives and you watch', path: WINDOW, autonomy: 2, scope: 'Read-only', substrate: 'No substrate', stub: true },
      { id: 'query', label: 'Query the platform', note: 'Reads within your scope, never past it', path: QUERY, autonomy: 0, scope: 'Current scope', substrate: 'Live' }
    ]},
    { group: 'Act on the fleet', items: [
      { id: 'sweep', label: 'Run a systems sweep', note: 'Skips reported as skips, never as passes', path: SWEEP, autonomy: 0, scope: 'Platform', substrate: 'Live' },
      { id: 'enter', label: 'Enter a tenant scope', note: 'Audited. Grants no membership row', path: KEY, autonomy: 1, scope: 'Two-key', substrate: 'Live' },
      { id: 'rule', label: 'Draft an alert rule', note: 'Composes it; the sweep evaluates it', path: BELL, autonomy: 2, scope: 'Platform', substrate: 'Stage 3' }
    ]}
  ];

  P.AUTONOMY = [
    { label: 'Autonomous', tone: 'var(--pg-positive)' },
    { label: 'Ask first', tone: 'var(--pg-gold-deep)' },
    { label: 'Draft only', tone: 'var(--pg-violet)' }
  ];

  P.SUMMONS = {
    offer: { title: 'New offering', deck: 'What you sell, as a record. A name and a price make it sellable; a channel makes it sold. Everything else is how it gets delivered.', foot: 'Nothing here charges anybody. The offering is what a campaign binds to and what a sale line points at \u2014 money movement is an adapter, configured in Sales.', rows: [] },
    campschema: { title: 'What you can change', deck: 'Campaigns, the catalogue and Sales all read from one schema. Rename what things are called, choose what a card shows, and keep your own categories and stages \u2014 the surfaces follow.', foot: 'Schema, not code. Every change here is per-tenant and reversible, and nothing about it is enforced by the shell \u2014 it is read on every render, so a rename lands the moment you type it.', rows: [] },
    segment: { title: 'Segment', deck: 'A segment is a rule read as words. Describe it and she writes the clauses, or add them one at a time \u2014 either way the rule is the same object, and the count is resolved when it is read.', foot: 'Clauses over the book resolve here against the records in People. Clauses over thread history, meetings and outbound have no substrate at operator scope, so a rule that uses one is saved and left unsized rather than guessed.', rows: [] },
    finding: { title: 'Finding', deck: 'One at a time, worst severity first, then registry priority. The drafted fix is hers; the approval is yours.', foot: 'Approving records resolution=approved and resolved_at on the finding row. An operator finding is recorded directly \u2014 the tenant action bus is NOT NULL by construction, so operator findings cannot file there.', rows: [] },
    pipehealth: { title: 'Pipeline health', deck: 'What the board cannot show while you are working it: what has stalled, what advanced without its evidence, and what cannot be measured at all.', foot: 'Conversion, velocity and loss reasons all read from stage-change history. Nothing records a transition today, so they read \u2014 rather than a benchmark nobody measured. That history is the single largest thing this surface needs from Stage 3.', rows: [] },
    campstep: { title: 'Campaign step', deck: 'One step of a motion — what it says, when it goes, and whose word it needs. A step is its own act, so halting between steps stops what has not gone without retracting what has.', foot: 'Representative. The step body, its timing and its grant are design; the send itself would route through the existing seam. Nothing here is scheduled against a real recipient.', rows: [] },
    trust: { title: 'Trust Compass', deck: 'One dial for how much room PAIGE has to act without you. It is a ceiling, not a switch \u2014 no capability may sit above it, and lowering it lowers everything above the new line.', foot: 'The grant is recorded like any other act. Raising the ceiling takes effect at the next run; lowering it takes effect immediately, including on work already in flight.', rows: [] },
    stages: { title: 'Stage builder', deck: 'The schema the forecast is built on. A stage earns its place by changing the forecast \u2014 if two carry the same probability, one of them is a status rather than a stage. Drag to reorder.', foot: 'Editing a schema is governed in Settings; editing these values is not. Stage-change history is what conversion and velocity need, and nothing records a transition today.', rows: [] },
    deal: { title: 'Deal', deck: 'The record behind the card, with the exit criteria it must meet to advance.', foot: 'Representative. Amounts, close dates and stage history all need substrate that does not exist at operator scope yet.', rows: [] },
    review: { title: 'Submission', deck: 'What they declared, what the auto-checks found, and the one decision that decides how far it reaches. A reviewer reads exactly what the buyer will see.', foot: 'Representative. The manifest, the requested scope and the auto-checks are real fields on a submission. What does not exist: a reviewer identity, an SLA clock, and a publisher account separate from a tenant \u2014 all three are Stage 3.', rows: [] },
    owed: { title: 'Needs you today', deck: 'Tasks, approvals and agent runs on one temporal surface. Every item belongs somewhere else \u2014 completing it here completes it there.', foot: 'The calendar owns no records. Nothing is read from a calendar source yet, so the treatments are the design and only the contents change when one connects.', rows: [
      { name: 'Authorize a tenant entry', detail: 'Two-key \u00b7 reason code required', status: 'Authority', tone: 'var(--pg-gold-deep)' },
      { name: 'Acknowledge a firing', detail: 'delivery_status pending until A3', status: 'Attention', tone: 'var(--pg-warning)' },
      { name: 'Protected focus', detail: '13:00\u201315:00 \u00b7 she holds outbound', status: 'Held', tone: 'var(--pg-violet)' },
      { name: 'Fleet sweep', detail: 'Runs 06:30 daily', status: 'Scheduled', tone: 'var(--pg-faint)' }
    ] },
    calset: { title: 'Calendar settings', deck: 'When you are reachable, when you are not, and what she may put on your calendar without asking.', foot: 'The connection itself is made in Integrations \u2014 no calendar source is wired at operator scope, so these are the rules waiting for a calendar to apply them to. Quiet hours already bind outbound on every channel, which is why they are stated here and enforced by the quiet-hours automation.', rows: [] },
    studio: { title: 'Vibe Studio', deck: 'The Studio is a shipped immersive sub-app at /admin/studio/* \u2014 it owns the full viewport, so this is the handoff rather than the studio itself. Resume a session, start a new one, or open the library.', foot: 'The sessions and their states are representative; the route, the three doors and the tier lock are real. Owner-locked tier: Solo, Sub-account, Enterprise and Super Admin \u2014 Agency is excluded entirely, with no resell. Deploy targets do not exist at operator scope, so Deployed is a design state.', rows: [] },
    post: { title: 'Post', deck: 'The post as it would render, then its terms. Nothing here has left the platform.', foot: 'Representative. Body, schedule, channel and grant are real fields on a post; the render is a preview, not a fetch from the network. Reach, engagement and spend are read in Performance and have no substrate at operator scope.', rows: [] },
    social: { title: 'Account', deck: 'What she may do on this channel, and what it has published this week.', foot: 'The connection itself is configured in Integrations. Her per-channel grant is a term of the connection, and the ceiling clamps it like everything else.', rows: [] },
    integration: { title: 'Integration', deck: 'What it connects, how it authenticates, and what she may do with it once it is on. A connection grants reach, not authority \u2014 the Trust Compass still clamps what she does with it.', foot: 'Representative. Connection state, auth type and scope names are real fields; the OAuth handshake, the secret store and the per-vendor rate limits are Stage 3.', rows: [] },
    builder: { title: 'Automation', deck: 'One grammar for the whole platform: something happens, then steps run. A pipeline rule, a follow-up, a booking and a marketplace review are the same object with different steps.', foot: 'Nothing here grants new authority \u2014 an automation runs capabilities she already holds, so its grant is the most restrictive step in it and the Trust Compass clamps that.', rows: [] },
    listing: { title: 'Listing', deck: 'What it does, what it needs, and what changes if you install it \u2014 all three before the act, not after.', foot: 'Representative. Kind, publisher, scope, version and the grant it requests are real fields on a listing. There is no install ledger, so an install here changes this session and nothing else.', rows: [] },
    sweep: { title: 'Systems sweep', deck: 'Started from the command bar. It holds no rail slot \u2014 close it and it retires, and the run joins Fleet\u2019s own history tab.', foot: 'Reads paige_systems_check_run at tenant_id IS NULL. A run in flight reads still running, never a verdict it has not reached.', rows: [
      { name: 'Resolver integrity', detail: '6 of 6 checks', status: 'Pass', tone: 'var(--pg-positive)' },
      { name: 'RLS posture', detail: '11 of 11 forced', status: 'Pass', tone: 'var(--pg-positive)' },
      { name: 'Migration drift', detail: 'An edge function cannot read git', status: 'Unreadable', tone: 'var(--pg-faint)' },
      { name: 'Provisioning queue', detail: '2 tenants awaiting first run', status: 'Attention', tone: 'var(--pg-warning)' }
    ]},
    web: { title: 'Web search', deck: 'A reading surface, not a destination. Sources are listed or the answer is withheld.', foot: 'No substrate: there is no operator-scope search seam. Stage 3 owns the fetch path and the citation record.', rows: [
      { name: 'Query surface', detail: 'Takes a question, returns sources', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Citation record', detail: 'Every claim carries a source or is dropped', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    browse: { title: 'Browser', deck: 'PAIGE drives a page and you watch it happen. Draft only by default \u2014 she navigates and reads; any act on the page opens an authority gate.', foot: 'No substrate. Stage 3 owns the session, the frame relay, and the per-domain consent record.', rows: [
      { name: 'Navigation', detail: 'Read and traverse', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Form submission', detail: 'Authority gate at the act', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    sandbox: { title: 'Sandbox', deck: 'Where she writes and runs her own code. Draft only: output is reviewable and nothing reaches the platform without an authorized act.', foot: 'No substrate. Stage 3 owns the isolated runtime, the resource ceiling, and the record of what ran.', rows: [
      { name: 'Isolated runtime', detail: 'No platform credentials in scope', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Output review', detail: 'Diff before anything lands', status: 'Design only', tone: 'var(--pg-negative)' }
    ]},
    connect: { title: 'Connect a tool', deck: 'Scopes are shown before consent, and the grant is revocable from Settings without touching the integration.', foot: 'Substrate partial: integration seams exist, a unified control does not. Stage 3 owns the consent record.', rows: [
      { name: 'Scope disclosure', detail: 'What it reads, what it writes', status: 'Design only', tone: 'var(--pg-negative)' },
      { name: 'Revocation', detail: 'Revoke without removing the tool', status: 'Stage 3', tone: 'var(--pg-warning)' }
    ]},
    email: { title: 'Compose', deck: 'Ask first: she composes in full, and delivery waits on you. Approving sends exactly once and records it.', foot: 'Live. Delivery routes through the existing send seam \u2014 no second stack.', rows: [
      { name: 'Draft', detail: 'Composed against the record in scope', status: 'Ready', tone: 'var(--pg-positive)' },
      { name: 'Delivery', detail: 'Sends once. Cannot be undone', status: 'Waiting on you', tone: 'var(--pg-gold-deep)' }
    ]},
    sequence: { title: 'Sequence', deck: 'Multi-step outbound against a segment. Each step is a separate act, and the whole run can be halted mid-flight.', foot: 'Live. Steps write to the same send seam a single message does.', rows: [
      { name: 'Segment', detail: 'Resolved from Relationships', status: 'Ready', tone: 'var(--pg-positive)' },
      { name: 'Step schedule', detail: '4 steps over 11 days', status: 'Waiting on you', tone: 'var(--pg-gold-deep)' }
    ]},
    query: { title: 'Query', deck: 'Reads within your current scope and never past it. The scope in the band is the scope of the answer.', foot: 'Live. Every read is RLS-bound; an operator with no tenant scope sees platform rows only.', rows: [
      { name: 'Scope', detail: 'Matches the band above', status: 'Bound', tone: 'var(--pg-positive)' },
      { name: 'Result', detail: 'Figures, with the read that produced them', status: 'Ready', tone: 'var(--pg-positive)' }
    ]},
    enter: { title: 'Tenant scope', deck: 'Audited on entry. Points active_tenant_id at the tenant and grants no membership row, so the roster and seat count are untouched.', foot: 'Live. Proved on prod: members_before=0 members_after=0 delta=0.', rows: [
      { name: 'Audit row', detail: 'paige_audit_log, on entry and exit', status: 'Live', tone: 'var(--pg-positive)' },
      { name: 'Membership delta', detail: 'Always zero', status: 'Live', tone: 'var(--pg-positive)' }
    ]},
    rule: { title: 'Alert rule', deck: 'She composes the rule; the five-minute sweep evaluates it. A rule bound to an unreadable signal reports never evaluated, never a pass.', foot: 'Schema and evaluator ship. Surface wiring is Stage 3, and delivery sits at pending until the channel adapters land.', rows: [
      { name: 'Condition', detail: 'Against the signal catalogue', status: 'Stage 3', tone: 'var(--pg-warning)' },
      { name: 'Delivery', detail: 'Every firing pending until A3', status: 'No substrate', tone: 'var(--pg-negative)' }
    ]}
  };

  var LIVE = { state: 'Live', tone: 'var(--pg-positive)' };
  var PART = { state: 'Partial', tone: 'var(--pg-warning)' };
  var REP = { state: 'Representative', tone: 'var(--pg-violet)' };

  P.DEST = {
    fleet: {
      kicker: 'The book \u2014 live tenants', title: 'Fleet', s: LIVE,
      deck: 'Every tenant under management, and the condition of the platform they run on. The morning check lands here first; the directory is where you enter a tenant\u2019s scope.',
      views: ['Systems check', 'Directory', 'History'],
      kpis: [
        { label: 'Live tenants', value: '8', note: '1 agency \u00b7 3 standalone \u00b7 4 sub-account' },
        { label: 'At risk', value: '2', note: 'Grade counts zero active seats' },
        { label: 'Open value', value: '\u2014', note: 'Money Spine deferred', dim: true },
        { label: 'Internal', value: '4', note: 'Behind the chip, never dropped' }
      ],
      ledgerTitle: 'Directory', ledgerMeta: 'Enter performs an audited act-as',
      ledgerFoot: 'Act-as grants no tenant_members row. Exit returns active_tenant_id to NULL. Platform fixtures are hidden by default and revealed by a chip.',
      kpisByView: {
        'Systems check': [
          { label: 'Checks passed', value: '4', note: 'Of 5 categories' },
          { label: 'Held for you', value: '2', note: 'She stopped rather than act past her ceiling' },
          { label: 'Unreadable', value: '1', note: 'Its own axis \u2014 never counted as a pass' },
          { label: 'Acted alone', value: '0', note: 'Nothing was decided while you were away' }
        ]
      },
      ledgerByView: {
        'Systems check': {
          ledgerTitle: 'Overnight', ledgerMeta: 'Ran 06:30 \u00b7 held findings until you arrived',
          ledgerFoot: 'She held the two findings that needed you rather than acting past her ceiling, and reports the one thing she could not read as unreadable rather than as a pass. What she may do unattended is set by the Trust Compass above.',
          rows: [
            { name: 'Resolver integrity', detail: 'Both tenant resolvers, 6 checks', figure: '6 / 6', status: 'Pass', tone: 'var(--pg-positive)', action: 'Evidence \u2192' },
            { name: 'RLS posture', detail: 'Forced on every operator-scope table', figure: '11 / 11', status: 'Pass', tone: 'var(--pg-positive)', action: 'Evidence \u2192' },
            { name: 'Two tenants went quiet', detail: '7c11 and b204 \u00b7 no session in 9 days', figure: '2', status: 'Held for you', tone: 'var(--pg-gold-deep)', action: 'Review \u2192' },
            { name: 'A firing was never delivered', detail: 'delivery_status pending \u00b7 no channel adapter', figure: '1', status: 'Held for you', tone: 'var(--pg-gold-deep)', action: 'Review \u2192' },
            { name: 'Migration drift', detail: 'An edge function cannot read git', figure: '\u2014', status: 'Unreadable', tone: 'var(--pg-faint)', action: 'Why \u2192' }
          ]
        },
        Directory: {
          ledgerTitle: 'Directory', ledgerMeta: 'Enter performs an audited act-as',
          ledgerFoot: 'Act-as grants no tenant_members row. Exit returns active_tenant_id to NULL. Platform fixtures are hidden by default and revealed by a chip.',
          rows: [
            { name: 'AUTHORIZED TENANT \u00b7 agency', detail: 'parent of 4', figure: '4 children', status: 'Nominal', tone: 'var(--pg-positive)', action: 'Enter \u2192', auth: true },
            { name: 'AUTHORIZED TENANT \u00b7 0f3a', detail: 'standalone \u00b7 no parent', figure: '12 seats', status: 'Nominal', tone: 'var(--pg-positive)', action: 'Enter \u2192', auth: true },
            { name: 'AUTHORIZED TENANT \u00b7 7c11', detail: 'sub-account', figure: '0 seats', status: 'At risk', tone: 'var(--pg-warning)', action: 'Enter \u2192', auth: true },
            { name: 'AUTHORIZED TENANT \u00b7 b204', detail: 'sub-account', figure: '3 seats', status: 'At risk', tone: 'var(--pg-warning)', action: 'Enter \u2192', auth: true },
            { name: 'DESIGN FIXTURE \u00b7 internal', detail: 'Platform test account', figure: '\u2014', status: 'Internal', tone: 'var(--pg-violet)', action: 'Enter \u2192', auth: true }
          ]
        },
        History: {
          ledgerTitle: 'Run history', ledgerMeta: 'Newest first \u00b7 capped at 100',
          ledgerFoot: 'A run still in flight reads still running \u2014 never a pass or fail it has not reached. This lives here rather than in the rail because a list of past events belongs to whatever produced it.',
          rows: [
            { name: '14:02 \u00b7 full sweep', detail: 'Operator and fleet halves', figure: '4 pass \u00b7 1 skip', status: 'Complete', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: '13:57 \u00b7 scheduled', detail: 'Five-minute evaluator', figure: 'in flight', status: 'Still running', tone: 'var(--pg-violet)', action: 'Open \u2192' },
            { name: '13:52 \u00b7 scheduled', detail: 'Five-minute evaluator', figure: '0 firings', status: 'Complete', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: '13:47 \u00b7 scheduled', detail: 'Five-minute evaluator', figure: '1 firing', status: 'Complete', tone: 'var(--pg-warning)', action: 'Open \u2192' }
          ]
        }
      },
      rows: [
        { name: 'AUTHORIZED TENANT \u00b7 agency', detail: 'parent of 4', figure: '4 children', status: 'Nominal', tone: 'var(--pg-positive)', action: 'Enter \u2192', auth: true },
        { name: 'AUTHORIZED TENANT \u00b7 0f3a', detail: 'standalone \u00b7 no parent', figure: '12 seats', status: 'Nominal', tone: 'var(--pg-positive)', action: 'Enter \u2192', auth: true },
        { name: 'AUTHORIZED TENANT \u00b7 7c11', detail: 'sub-account', figure: '0 seats', status: 'At risk', tone: 'var(--pg-warning)', action: 'Enter \u2192', auth: true },
        { name: 'AUTHORIZED TENANT \u00b7 b204', detail: 'sub-account', figure: '3 seats', status: 'At risk', tone: 'var(--pg-warning)', action: 'Enter \u2192', auth: true },
        { name: 'DESIGN FIXTURE \u00b7 internal', detail: 'Platform test account', figure: '\u2014', status: 'Internal', tone: 'var(--pg-violet)', action: 'Enter \u2192', auth: true }
      ]

    },
    relationships: {
      kicker: 'The book \u2014 not yet tenants', title: 'Relationships', s: PART,
      deck: 'Leads, prospects, partners, and every thread with them. People and Conversations are one record seen two ways \u2014 open a person and you open their thread.',
      views: ['People', 'Conversations', 'Calendar', 'Segments'],
      kpis: [
        { label: 'Open relationships', value: '\u2014', note: 'No CRM seam at operator scope', dim: true },
        { label: 'Follow-ups owed', value: '3', note: 'On the calendar, anchored here' },
        { label: 'Partners', value: '\u2014', note: 'Model owed', dim: true },
        { label: 'Converted', value: '\u2014', note: 'Needs a lifecycle field', dim: true }
      ],
      ledgerByView: {
        Calendar: {
          ledgerTitle: 'Needs you today', ledgerMeta: 'Tasks, approvals and agent runs on one temporal surface',
          ledgerFoot: 'The calendar owns no records. Every item on it belongs to a person, a campaign or a tenant, and completing it here completes it there. Nothing is read from a calendar source yet \u2014 the treatments are the design, and when a source connects only the contents change.',
          rows: [
            { name: 'Authorize a tenant entry', detail: 'Two-key \u00b7 reason code required', figure: 'waiting', status: 'Authority', tone: 'var(--pg-gold-deep)', action: 'Review \u2192', auth: true },
            { name: 'Acknowledge a firing', detail: 'delivery_status pending until A3', figure: '1', status: 'Attention', tone: 'var(--pg-warning)', action: 'Open \u2192' },
            { name: 'Protected focus', detail: '13:00\u201315:00 \u00b7 she holds outbound', figure: '2h', status: 'Held', tone: 'var(--pg-violet)', action: 'Open \u2192' },
            { name: 'Fleet sweep', detail: 'Runs 06:30 daily', figure: 'daily', status: 'Scheduled', tone: 'var(--pg-faint)', action: 'Open \u2192' }
          ]
        }
      },
      ledgerTitle: 'People', ledgerMeta: 'Representative \u00b7 no record invented',
      ledgerFoot: 'A prospect and a tenant are different objects here by ruling. Conversion moves the record into Fleet and leaves the relationship history behind it.',
      rows: [
        { name: 'PROSPECT \u00b7 design fixture A', detail: 'Inbound \u00b7 no source connected', figure: '\u2014', status: 'Follow-up owed', tone: 'var(--pg-warning)', action: 'Open \u2192' },
        { name: 'PROSPECT \u00b7 design fixture B', detail: 'Referral \u00b7 no source connected', figure: '\u2014', status: 'Contacted', tone: 'var(--pg-positive)', action: 'Open \u2192' },
        { name: 'PARTNER \u00b7 design fixture C', detail: 'Reseller candidate', figure: '\u2014', status: 'Model owed', tone: 'var(--pg-faint)', action: 'Open \u2192' }
      ],
    },
    campaigns: {
      kicker: 'Outbound \u2014 platform growth', title: 'Campaigns', s: PART,
      deck: 'How relationships move forward: the motions that move them and the pipeline they move through. A campaign\u2019s motion is its step rail \u2014 there is no separate sequence to keep, and a motion you want to reuse is a Template in the Marketplace.',
      views: ['Active', 'Catalog', 'Sales', 'Pipeline', 'Social', 'Performance'],
      kpis: [
        { label: 'Active campaigns', value: '\u2014', note: 'Not read at operator scope', dim: true },
        { label: 'Motions running', value: '2', note: 'Representative' },
        { label: 'Sends today', value: '\u2014', note: 'Send seam exists, aggregate owed', dim: true },
        { label: 'Attribution', value: '\u2014', note: 'Unified model owed', dim: true }
      ],
      ledgerByView: {
        Performance: {
          ledgerTitle: 'Go deeper', ledgerMeta: 'What a chart cannot show',
          ledgerFoot: 'Two of the six charts read \u2014 for one reason: nothing ties a send to a converted relationship. Sends are real and countable, so activity is readable; outcome is not, and no arrangement of these charts changes that.',
          rows: [
            { name: 'Pipeline health', detail: 'Stalled deals, evidence gaps, and what cannot be measured yet', figure: '3', status: 'Open it', tone: 'var(--pg-gold-deep)', action: 'Open \u2192', summon: 'pipehealth' }
          ]
        }
      },
      board: {
        title: 'Platform pipeline',
        stages: [
          { id: 's1', name: 'Discovery', prob: 10, target: 7, exit: 'A named owner and a stated problem' },
          { id: 's2', name: 'Qualified', prob: 25, target: 10, exit: 'Budget owner identified' },
          { id: 's3', name: 'Proposal', prob: 50, target: 14, exit: 'Written proposal sent' },
          { id: 's4', name: 'Negotiation', prob: 75, target: 10, exit: 'Terms agreed in writing' },
          { id: 's5', name: 'Won', prob: 100, target: 0, exit: 'Signed' }
        ],
        deals: [
          { id: 'd1', name: 'AUTHORIZED TENANT \u00b7 agency', stage: 1, amount: null, age: 12, owner: 'PAIGE', next: 'Confirm the budget owner', evidence: true },
          { id: 'd2', name: 'AUTHORIZED TENANT \u00b7 solo', stage: 0, amount: null, age: 4, owner: 'You', next: 'First call', evidence: true },
          { id: 'd3', name: 'AUTHORIZED TENANT \u00b7 reseller', stage: 2, amount: null, age: 21, owner: 'PAIGE', next: 'Proposal follow-up', evidence: false },
          { id: 'd4', name: 'AUTHORIZED TENANT \u00b7 enterprise', stage: 3, amount: null, age: 34, owner: 'You', next: 'Terms review', evidence: true },
          { id: 'd5', name: 'AUTHORIZED TENANT \u00b7 agency II', stage: 1, amount: null, age: 8, owner: 'PAIGE', next: 'Qualify the seat count', evidence: true }
        ]
      },
    },
    marketplace: {
      kicker: 'What the platform sells', title: 'Marketplace', s: REP, market: true,
      deck: 'Five kinds of thing ship here: a skill she can run, an automation, an integration, a template, or a whole agent. Every one declares the authority it needs before it installs \u2014 an install can never widen what she may do.',
      views: ['Storefront', 'Catalog', 'Submissions', 'Publishers'],
    },
    analytics: {
      kicker: 'Performance \u2014 reads across the books', title: 'Analytics', s: PART,
      deck: 'One place that reads across Fleet, Relationships and Campaigns, plus the platform\u2019s own condition. Each book also carries its own performance view for depth.',
      views: ['Fleet', 'Relationships', 'Campaigns', 'Autonomy', 'Platform health'],
      kpis: [
        { label: 'Checks passing', value: '4', note: 'Of 5 categories' },
        { label: 'Skipped', value: '1', note: 'Its own axis, not a pass' },
        { label: 'LLM error rate', value: '0.4%', note: 'llm.error_rate' },
        { label: 'Fleet MRR', value: '\u2014', note: 'Money Spine deferred', dim: true }
      ],
      ledgerByView: {
        'Platform health': {
          ledgerTitle: 'Latest run', ledgerMeta: 'Read from the sweep, not asserted',
          ledgerFoot: 'Five of ten checks could not run: two deferred to the CI reader, two with nothing to test against, one runner threw. None of them is a pass.',
          rows: [
            { name: 'Passed', detail: 'Of the total run', figure: '4 / 10', status: 'Pass', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Failed', detail: 'One blocking \u00b7 alert delivery', figure: '1', status: 'Blocking', tone: 'var(--pg-negative)', action: 'Open \u2192' },
            { name: 'Could not run', detail: 'Skipped or errored', figure: '5', status: 'Unrun', tone: 'var(--pg-faint)', action: 'Open \u2192' }
          ]
        }
      },
      ledgerTitle: 'Platform health', ledgerMeta: 'Systems check, run history and rules read here',
      ledgerFoot: 'These three used to want rail slots. They are readings, so they are lenses here \u2014 and the rules that produce them are knobs, so they are configured in Settings.',
      rows: [
        { name: 'Resolver integrity', detail: 'Both tenant resolvers', figure: '6 / 6', status: 'Pass', tone: 'var(--pg-positive)', action: 'Evidence \u2192' },
        { name: 'RLS posture', detail: 'Forced on operator-scope tables', figure: '11 / 11', status: 'Pass', tone: 'var(--pg-positive)', action: 'Evidence \u2192' },
        { name: 'Migration drift', detail: 'An edge function cannot read git', figure: '\u2014', status: 'Unreadable', tone: 'var(--pg-faint)', action: 'Why \u2192' },
        { name: 'Run history', detail: 'Newest first, capped at 100', figure: '100', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
        { name: 'Alert firings', detail: 'Written by the evaluator only', figure: '\u2014', status: 'Surface owed', tone: 'var(--pg-warning)', action: 'Why \u2192' }
      ],
    },
    settings: {
      kicker: 'Configuration \u2014 knobs, not places', title: 'Settings', s: PART, caps: true,
      deck: 'Where authority is configured rather than exercised. Every capability Paige can call lives here with its scope and its grant, alongside the connections those capabilities reach through.',
      views: ['Setup', 'Platform', 'Integrations', 'Mind', 'Automations', 'Alerts', 'Capabilities', 'Vault', 'Governance', 'Team'],
      kpis: [
        { label: 'Capabilities', value: '\u2014', note: 'Tallied at render from CAPS, never asserted' },
        { label: 'Autonomous', value: '\u2014', note: 'Acts and reports' },
        { label: 'Ask first', value: '\u2014', note: 'Opens an authority gate' },
        { label: 'Draft only', value: '\u2014', note: 'Composes, never delivers' }
      ],
      kpisByView: {
        Platform: [
          { label: 'Platform tenant', value: '1', note: 'The operator\u2019s own record' },
          { label: 'Domains', value: '2', note: 'App and marketing' },
          { label: 'Brand sets', value: '1', note: 'Inherited by sub-accounts' },
          { label: 'Platform billing', value: '\u2014', note: 'Money Spine deferred by ruling', dim: true }
        ],
        Integrations: [
          { label: 'Connected', value: '4', note: 'Reading or writing today' },
          { label: 'Available', value: '\u2014', note: 'Catalogue not read at operator scope', dim: true },
          { label: 'Needing attention', value: '1', note: 'Scope drifted from what was granted' },
          { label: 'Secrets shown', value: '0', note: 'By design, and permanently' }
        ],
        Team: [
          { label: 'Seats', value: '6', note: 'list_platform_staff()' },
          { label: 'Super admins', value: '2', note: 'user_roles.role' },
          { label: 'Platform admins', value: '2', note: 'Operator findings only' },
          { label: 'Utilisation', value: '\u2014', note: 'No activity substrate exists', dim: true }
        ]
      },
      ledgerByView: {
        Mind: {
          ledgerTitle: 'Mind', ledgerMeta: 'What governs how she thinks, remembers and delegates',
          ledgerFoot: 'Memory, routing, the sandbox and sub-agents all sit under the same ceiling as her capabilities. A sub-agent cannot hold a grant its parent does not, so spinning one up can never widen authority \u2014 only divide it.',
          rows: [
            { name: 'Model routing', detail: 'Which model answers which kind of work, and what it costs', figure: '3 tiers', status: 'Representative', tone: 'var(--pg-violet)', action: 'Open \u2192' },
            { name: 'Memory policy', face: 'memory', detail: 'What she may keep, for how long, and what she must forget on request', figure: '5 held', status: 'Ask first', tone: 'var(--pg-gold-deep)', action: 'Open \u2192' },
            { name: 'Sandbox', face: 'code', detail: 'Where she writes and runs code, and what it may reach', figure: '\u2014', status: 'No substrate', tone: 'var(--pg-negative)', action: 'Why \u2192' },
            { name: 'Sub-agents', face: 'team', detail: 'Who she may spin up, at what grant, and when they retire', figure: '4', status: 'Ask first', tone: 'var(--pg-gold-deep)', action: 'Open \u2192' },
            { name: 'Skills', face: 'sandbox', detail: 'What she can actually do, and what is still design', figure: '4 of 7 live', status: 'Partial', tone: 'var(--pg-warning)', action: 'Open \u2192' }
          ]
        },
        Automations: {
          ledgerTitle: 'Automations', ledgerMeta: 'Each runs under a capability grant and keeps its own record',
          ledgerFoot: 'An automation is not a new authority. It runs a capability she already holds, so the ceiling clamps it the same way \u2014 an automation whose capability is held reads Held and does not fire. Every run appends to that automation\u2019s own record, and the record is what she recalls when you ask what happened.',
          rows: [
            { name: 'Follow-ups', detail: 'Proposes and schedules the next touch on a quiet thread', figure: '3 owed', cap: 'email', action: 'Open \u2192' },
            { name: 'Pipeline hygiene', detail: 'Flags a deal past its stage target or missing evidence', figure: '2 stalled', cap: 'query', action: 'Open \u2192' },
            { name: 'Outbound calls', detail: 'Dials from a segment and hands you the live call', figure: '\u2014', status: 'No substrate', tone: 'var(--pg-negative)', action: 'Why \u2192' },
            { name: 'Inbound triage', detail: 'Reads a new thread, routes it, drafts the first reply', figure: '1 drafted', cap: 'email', action: 'Open \u2192' },
            { name: 'Sequence stepping', detail: 'Advances a sequence when its step condition is met', figure: '\u2014', cap: 'sequence', action: 'Open \u2192' },
            { name: 'Provisioning watch', detail: 'Reports a tenant stuck in the queue before first run', figure: '2 waiting', cap: 'query', action: 'Open \u2192' },
            { name: 'Sweep schedule', detail: 'Runs the fleet sweep and writes the morning brief', figure: 'daily', cap: 'sweep', action: 'Open \u2192' },
            { name: 'Quiet-hours guard', detail: 'Holds an outbound message outside a tenant\u2019s allowed window', figure: 'always', cap: 'query', action: 'Open \u2192' }
          ]
        },
        Platform: {
          ledgerTitle: 'Platform identity',
          ledgerMeta: 'What the operator is, before what it can do',
          ledgerFoot: 'Brand resolves down through parent_tenant_id, so a sub-account inherits its agency\u2019s brand. Authority never inherits upward.',
          rows: [
            { name: 'Operator record', detail: 'The platform\u2019s own tenant row', figure: 'live', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Brand', detail: 'Mark, wordmark, palette, resolved recursively', figure: '1 set', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Domains', detail: 'App and marketing hosts', figure: '2', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Platform billing', detail: 'Money Spine deferred by owner ruling', figure: '\u2014', status: 'Deferred', tone: 'var(--pg-faint)', action: 'Why \u2192' },
            { name: 'Notifications', detail: 'What reaches the operator, and how', figure: '\u2014', status: 'Surface owed', tone: 'var(--pg-warning)', action: 'Open \u2192' }
          ]
        },
        Integrations: {
          ledgerTitle: 'Connections',
          ledgerMeta: 'One home \u2014 nothing connects from anywhere else',
          ledgerFoot: 'A connection may show scope, last use, rotation and revocation. It may never show an OAuth token, a bank secret, an API key or an internal credential \u2014 those stay server-side, permanently.',
          rows: [
            { name: 'Email and messaging', detail: 'Shared channel adapters \u2014 the one send path', figure: 'writing', status: 'Connected', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Model routing', detail: 'Activity is readable; per-tenant routing is not', figure: 'partial', status: 'Controls owed', tone: 'var(--pg-warning)', action: 'Open \u2192' },
            { name: 'MCP and API', detail: 'Seams exist across surfaces; no unified control', figure: '\u2014', status: 'Control owed', tone: 'var(--pg-warning)', action: 'Why \u2192' },
            { name: 'Calendar', detail: 'Nothing connected \u2014 the field runs empty', figure: '\u2014', status: 'Not connected', tone: 'var(--pg-negative)', action: 'Connect \u2192' },
            { name: 'Vault', detail: 'Connection, scope, last use, rotation, revoke', figure: '\u2014', status: 'Model owed', tone: 'var(--pg-warning)', action: 'Open \u2192' }
          ]
        },
        Team: {
          ledgerTitle: 'Platform seats',
          ledgerMeta: 'Real read \u2014 the existing Team RPC',
          ledgerFoot: 'A percentage for utilisation would be invented: nothing on the platform measures operator time. Closing that means building activity tracking first.',
          rows: [
            { name: 'Operator seat', detail: 'super_admin \u00b7 sees every tenant finding', figure: 'full', status: 'Active', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Operator seat', detail: 'super_admin \u00b7 sees every tenant finding', figure: 'full', status: 'Active', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Operator seat', detail: 'platform_admin \u00b7 operator findings only', figure: 'scoped', status: 'Active', tone: 'var(--pg-positive)', action: 'Open \u2192' },
            { name: 'Service role', detail: 'Headless agent \u00b7 bypasses RLS, self-scopes', figure: '\u2014', status: 'System', tone: 'var(--pg-violet)', action: 'Open \u2192' }
          ]
        }
      },
      ledgerTitle: 'Governance', ledgerMeta: 'Two-key on destructive ops',
      ledgerFoot: 'The governance laws bind here rather than RLS: immutable audit, two-key on destructive operations, never-silent break-glass.',
      rows: [
        { name: 'Trust Compass', trust: true, detail: 'Authority and autonomy, one home', figure: '@grants', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
        { name: 'Audit log', detail: 'Append-only', figure: 'immutable', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' },
        { name: 'Break-glass', detail: 'Second key, reason code, actor log', figure: '\u2014', status: 'Unwired', tone: 'var(--pg-negative)', action: 'Why \u2192' },
        { name: 'Alert rules', detail: 'Configured in Alerts', figure: '7 rules', status: 'Live', tone: 'var(--pg-positive)', action: 'Open \u2192' }
      ]
    }
  };

  // Systems check — shape from the L1/L3 DDL. Counts derive from the run, never asserted.
  // Statuses: pass · fail · skip · error. An error is never degraded to a pass.
  P.SWEEP = {
    run: { started_at: '06:30', completed_at: '06:34', check_count: 10, pass_count: 4, fail_count: 1 },
    domains: [
      { id: 'infrastructure', label: 'Infrastructure' },
      { id: 'marketing', label: 'Marketing' },
      { id: 'forms_booking', label: 'Forms and booking' },
      { id: 'comms_deliverability', label: 'Comms deliverability' },
      { id: 'payments_ops', label: 'Payments ops' },
      { id: 'data_product', label: 'Data and product' },
      { id: 'vertical_custom', label: 'Vertical custom' }
    ],
    findings: [
      { id: 'f1', check: 'operator_resolver_integrity', domain: 'infrastructure', priority: 10, status: 'pass', severity: 'low',
        evidence: 'Both tenant resolvers agree across 6 checks.', interpretation: 'Scope resolution is sound. Nothing to do.' },
      { id: 'f2', check: 'operator_rls_posture', domain: 'infrastructure', priority: 5, status: 'pass', severity: 'blocking',
        evidence: 'FORCE ROW LEVEL SECURITY present on 11 of 11 operator-scope tables.', interpretation: 'Every operator-scope table forces RLS. This is the check that would matter most if it failed.' },
      { id: 'f3', check: 'operator_tenant_registry', domain: 'infrastructure', priority: 40, status: 'pass', severity: 'medium',
        evidence: '8 registry rows, 0 orphaned.', interpretation: 'The registry and the tenant table agree.' },
      { id: 'f4', check: 'operator_llm_error_rate', domain: 'data_product', priority: 60, status: 'pass', severity: 'medium',
        evidence: 'llm.error_rate 0.4% over the trailing window.', interpretation: 'Within range. No baseline exists to call it anomalous either way.' },
      { id: 'f5', check: 'operator_alert_delivery', domain: 'comms_deliverability', priority: 1, status: 'fail', severity: 'blocking',
        evidence: '1 firing at delivery_status=pending since 13:47. No channel adapter is configured.', interpretation: 'A rule fired and nobody was told. Every firing will sit at pending until the channel adapters land \u2014 a fire is not a delivery.', fix: 'Route firings through _shared/channel-adapters.ts and set delivery_status on acknowledgement.' },
      { id: 'f6', check: 'operator_migration_drift', domain: 'infrastructure', priority: 70, status: 'skip', severity: 'medium',
        evidence: 'data_source=self_hosted_worker. A Deno edge function cannot read git tags.', interpretation: 'Deferred to the CI reader. This will read skip until that ships \u2014 it is not a pass.' },
      { id: 'f7', check: 'operator_edge_drift', domain: 'infrastructure', priority: 75, status: 'skip', severity: 'medium',
        evidence: 'Same constraint: no git tag readable from the edge runtime.', interpretation: 'Deferred to the CI reader.' },
      { id: 'f8', check: 'operator_channel_adapter', domain: 'comms_deliverability', priority: 20, status: 'skip', severity: 'high',
        evidence: 'No adapter configured, so there is nothing to test against.', interpretation: 'Could not run. The check itself is blocked by the same gap the finding above reports.' },
      { id: 'f9', check: 'operator_baseline_anomaly', domain: 'data_product', priority: 90, status: 'skip', severity: 'low',
        evidence: 'paige_systems_check_baseline holds 0 rows.', interpretation: 'No baseline to judge against yet. Later scans populate it.' },
      { id: 'f10', check: 'operator_campaign_attribution', domain: 'marketing', priority: 30, status: 'error', severity: 'high',
        evidence: 'Runner threw: relation for the attribution join does not exist.', interpretation: 'The runner failed. This is reported as an error rather than a pass \u2014 nothing was checked.', fix: 'Build the attribution join, or unregister the check until it exists.' }
    ]
  };


  P.CHARTS = {
    Fleet: [
      { title: 'Live tenants', note: 'Twelve weeks', kind: 'line', unit: '',
        data: [4,4,5,5,6,6,6,7,7,8,8,8] },
      { title: 'Seats per tenant', note: 'Current, by tenant', kind: 'bars',
        data: [12,8,6,3,3,0,0,0], labels: ['0f3a','agency','e59d','b204','c771','7c11','a903','f240'] },
      { title: 'Risk grade', note: 'Of 8 live tenants', kind: 'stack',
        parts: [{ label: 'Nominal', value: 6, tone: 'var(--pg-positive)' }, { label: 'At risk', value: 2, tone: 'var(--pg-warning)' }] },
      { title: 'Fleet MRR', note: 'Money Spine deferred by owner ruling', kind: 'none' }
    ],
    Relationships: [
      { title: 'Lifecycle', note: 'Representative \u2014 no relationship table exists', kind: 'funnel',
        parts: [{ label: 'Known', value: 24 }, { label: 'Contacted', value: 11 }, { label: 'Engaged', value: 5 }, { label: 'Converted', value: 2 }] },
      { title: 'Follow-ups owed', note: 'Eight weeks', kind: 'bars',
        data: [1,2,2,4,3,5,3,3], labels: ['','','','','','','',''] },
      { title: 'Time to first contact', note: 'Needs a lifecycle field', kind: 'none' },
      { title: 'Source mix', note: 'No source is recorded on a relationship yet', kind: 'none' }
    ],
    Campaigns: [
      { title: 'Sends', note: 'Twelve weeks \u00b7 the send seam is real', kind: 'line',
        data: [0,0,12,31,28,44,39,52,47,61,58,66] },
      { title: 'Sequence step completion', note: 'Operator outreach \u00b7 4 steps', kind: 'bars',
        data: [66,48,31,19], labels: ['1','2','3','4'] },
      { title: 'Reply rate', note: 'Needs inbound threading against the send', kind: 'none' },
      { title: 'Attribution', note: 'No model ties a send to a converted relationship', kind: 'none' }
    ],
    // Campaigns \u2192 Performance. Six charts across the three motions, because the question
    // is not "what exists" but "is it working" \u2014 and that is a shape, not a row.
    CampaignPerf: [
      { title: 'Sends', note: 'Twelve weeks \u00b7 the send seam records every delivery', kind: 'line',
        data: [0,0,12,31,28,44,39,52,47,61,58,66] },
      { title: 'Sends by campaign', note: 'Five active motions \u00b7 which one is doing the work', kind: 'bars',
        data: [66,41,28,14,0], labels: ['Outreach','Reseller','Winback','Nurture','Launch'] },
      { title: 'Step completion', note: 'Operator outreach \u00b7 where a motion loses people', kind: 'funnel',
        parts: [{ label: 'Intro', value: 66 }, { label: 'Follow', value: 48 }, { label: 'Case', value: 31 }, { label: 'Last call', value: 19 }] },
      { title: 'Pipeline by stage', note: 'Open deals \u00b7 read from the board', kind: 'bars', live: 'stageCounts' },
      { title: 'Weighted value', note: 'Amount \u00d7 stage probability', kind: 'none' },
      { title: 'Posts published', note: 'By channel \u00b7 eight weeks \u00b7 we scheduled them, so we know', kind: 'bars',
        data: [14,9,6,4,2], labels: ['LI','X','IG','FB','YT'] },
      { title: 'Cadence met', note: 'Posts published against the cadence we set \u00b7 both numbers are ours', kind: 'ring',
        value: 35, target: 48, unit: ' posts' },
      { title: 'Engagement', note: 'Reach and interactions need a metrics read from each platform', kind: 'none' },
      { title: 'Ad flight budget', note: 'Configured by us \u00b7 spend needs the ad account read', kind: 'bars',
        data: [4800,1200], labels: ['Q3 reach','Retarget'] },
      { title: 'Deals by source motion', note: 'Which campaign produced the deal \u2014 the one join nothing records', kind: 'none' }
    ],
    Autonomy: [
      { title: 'Grants by level', note: 'Effective, after the ceiling', kind: 'stack', live: 'grants' },
      { title: 'Ceiling over time', note: 'Twelve weeks \u00b7 0 Observe to 4 Autonomous', kind: 'step',
        data: [1,1,2,2,2,2,3,2,2,2,2,2], max: 4 },
      { title: 'Acts held for approval', note: 'Eight weeks', kind: 'bars',
        data: [3,5,4,7,6,4,5,2], labels: ['','','','','','','',''] },
      { title: 'Acts taken unattended', note: 'Absence rule has been hold throughout', kind: 'flat', data: 0 }
    ],
    'Platform health': [
      { title: 'Sweep outcome', note: 'Last twelve runs \u00b7 pass, fail, could not run', kind: 'stackbars',
        series: [[4,1,5],[4,1,5],[5,0,5],[4,1,5],[4,1,5],[3,2,5],[4,1,5],[4,1,5],[5,0,5],[4,1,5],[4,1,5],[4,1,5]],
        tones: ['var(--pg-positive)','var(--pg-negative)','var(--pg-line-strong)'] },
      { title: 'Checks that could not run', note: 'Five of ten, every run', kind: 'bars',
        data: [2,2,1,1,0,0,0], labels: ['CI','CI','no adapter','no baseline','','',''] },
      { title: 'LLM error rate', note: 'Twelve weeks \u00b7 percent', kind: 'line',
        data: [0.9,0.8,0.7,0.6,0.6,0.5,0.7,0.5,0.4,0.4,0.5,0.4] },
      { title: 'Time to acknowledge', note: 'No firing has ever been delivered', kind: 'none' }
    ]
  };


  // Conversations — grounded in src/agency/conversations.tsx and src/agency/fixtures.ts
  // (CHANNELS, THREADS, CONV_CHANNEL_PERF). One console, every channel, Paige inside it.
  P.CHANNELS = [
    { key: 'Email', glyph: 'M2 4.2h12v7.6H2z M2 4.2l6 4.4 6-4.4', substrate: 'Live' },
    { key: 'SMS', glyph: 'M2.4 3.4h11.2v7.4H7l-3.2 2.6v-2.6H2.4z', substrate: 'Live' },
    { key: 'Voice', glyph: 'M3 3.4h2.8l1.2 2.8-1.6 1.2a8 8 0 0 0 3.2 3.2l1.2-1.6 2.8 1.2v2.8a10.6 10.6 0 0 1-9.6-9.6z', substrate: 'No substrate' },
    { key: 'WhatsApp', glyph: 'M8 2.4a5.6 5.6 0 0 0-4.8 8.5L2.4 13.6l2.8-.8A5.6 5.6 0 1 0 8 2.4z', substrate: 'Stage 3' },
    { key: 'DM', glyph: 'M2.6 3.6h10.8v6.8H8.4L5.2 13v-2.6H2.6z M5.4 7h.01 M8 7h.01 M10.6 7h.01', substrate: 'No substrate', social: true }
  ];

  // Which network a DM arrived on. The channel is one thing \u2014 a direct message \u2014 and
  // the network is a property of the thread, the same way a phone number is.
  P.DM_NETWORKS = {
    LinkedIn: { glyph: 'M3.4 6.4v6.2 M3.4 3.6h.01 M6.6 12.6V6.4 M6.6 8.8a2.6 2.6 0 0 1 5.2 0v3.8', substrate: 'No substrate' },
    Instagram: { glyph: 'M3.4 3.4h9.2v9.2H3.4z M6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M10.8 5.2h.01', substrate: 'No substrate' },
    X: { glyph: 'M3.4 3.4l9.2 9.2 M12.6 3.4L3.4 12.6', substrate: 'No substrate' },
    Facebook: { glyph: 'M9.4 13V8.4h2 M6.4 8.4h4.6 M9.4 8.4V5.6a2.2 2.2 0 0 1 2.2-2.2h1', substrate: 'No substrate' }
  };

  P.THREADS = [
    { id:'t1', who:'PROSPECT · design fixture A', channel:'SMS', unread:2, when:'4m', preview:'Can you do Thursday instead?',
      phone:'+1 ··· ··· 0142', email:'a@fixture.invalid', stage:'Contacted', owner:'PAIGE', state:'Waiting on you',
      msgs:[
        { dir:'in', when:'11:02', body:'Got your note. What does onboarding actually involve?' },
        { dir:'out', when:'11:09', body:'Two calls and a shared checklist. First one runs 30 minutes.', by:'PAIGE · drafted, you sent' },
        { dir:'in', when:'11:41', body:'Can you do Thursday instead?' }
      ],
      draft:'Thursday works. I have 10:00 or 14:30 — which suits?' },
    { id:'t2', who:'PROSPECT · design fixture B', channel:'Email', unread:0, when:'2h', preview:'Re: pricing for the reseller tier',
      phone:'+1 ··· ··· 0198', email:'b@fixture.invalid', stage:'Engaged', owner:'You', state:'Replied',
      msgs:[
        { dir:'out', when:'09:14', body:'Sending the reseller tier breakdown as promised.', by:'You' },
        { dir:'in', when:'10:30', body:'This is close. Can margin move at volume?' }
      ],
      draft:'' },
    { id:'t3', who:'PARTNER · design fixture C', channel:'Voice', unread:1, when:'yesterday', preview:'Missed call · 0:00 · no voicemail',
      phone:'+1 ··· ··· 0233', email:'c@fixture.invalid', stage:'Known', owner:'\u2014', state:'Call back',
      msgs:[ { dir:'in', when:'16:20', body:'Missed call. No voicemail left.', call:true } ],
      draft:'' },
    { id:'t4', who:'PROSPECT \u00b7 design fixture D', channel:'DM', network:'LinkedIn', unread:1, when:'22m',
      preview:'Saw the reseller post \u2014 how does the split work?',
      phone:'\u2014 not on file', email:'\u2014 not on file', stage:'Engaged', owner:'PAIGE', state:'Waiting on you',
      msgs:[
        { dir:'in', when:'09:41', body:'Saw the reseller post \u2014 how does the split work?' }
      ],
      draft:'Seventy thirty on anything you sell, and you keep your own book. Want the one-pager?' },
    { id:'t5', who:'PARTNER \u00b7 design fixture E', channel:'DM', network:'Instagram', unread:0, when:'3h',
      preview:'Replied to your story',
      phone:'\u2014 not on file', email:'e@fixture.invalid', stage:'Known', owner:'You', state:'Replied',
      msgs:[
        { dir:'in', when:'06:58', body:'Replied to your story' },
        { dir:'out', when:'07:20', body:'Thanks \u2014 the workshop link is in the bio.', by:'You' }
      ],
      draft:'' },
    { id:'t6', who:'PROSPECT \u00b7 design fixture F', channel:'DM', network:'X', unread:1, when:'1d',
      preview:'Is there an API?',
      phone:'\u2014 not on file', email:'\u2014 not on file', stage:'Contacted', owner:'\u2014', state:'Unanswered',
      msgs:[ { dir:'in', when:'11:15', body:'Is there an API?' } ],
      draft:'' }
  ];

  P.CONV_PERF = [
    { key:'Email', reply:41, resp:'2h 10m', deliv:97, vol:'\u2014' },
    { key:'SMS', reply:63, resp:'22m', deliv:99, vol:'\u2014' },
    { key:'Voice', reply:'\u2014', resp:'\u2014', deliv:'\u2014', vol:'\u2014' },
    { key:'WhatsApp', reply:55, resp:'48m', deliv:96, vol:'\u2014' },
    { key:'DM', reply:'\u2014', resp:'\u2014', deliv:'\u2014', vol:'\u2014' }
  ];


  // People — one list, two kinds of row. A company and a human sit in the same book;
  // the type column says which, and the detail is shared. Lifecycle, not location,
  // says whether they are a client: becoming one moves them into Fleet without
  // leaving this log.
  P.PEOPLE = [
    { id:'p1', kind:'Company', name:'AUTHORIZED TENANT \u00b7 0f3a', sub:'Standalone \u00b7 12 seats', life:'Client',
      owner:'You', touch:'2h', portal:'Active \u00b7 smart', vault:'Shared \u00b7 8 items',
      identity:[['Legal name','AUTHORIZED TENANT 0f3a'],['Primary contact','fixture B'],['Address','\u2014 not on file'],['Phone','+1 ··· ··· 0198'],['Email','b@fixture.invalid']],
      business:[['Entity type','LLC'],['Formation state','\u2014'],['EIN','00-0000000',1],['Tax classification','\u2014']],
      docs:[['Master agreement','signed 11 Mar'],['W-9','on file'],['Formation docs','\u2014 not uploaded']],
      billing:[['Plan','Standalone'],['MRR','\u2014 Money Spine deferred'],['Method','card ending 4471',1],['Next invoice','\u2014']] },
    { id:'p2', kind:'Person', name:'fixture B', sub:'Owner \u00b7 AUTHORIZED TENANT 0f3a', life:'Client contact',
      owner:'You', touch:'2h', portal:'Active \u00b7 smart', vault:'Via company',
      identity:[['First name','fixture'],['Last name','B'],['Date of birth','04/18/1979',1],['Address','\u2014 not on file'],['Phone','+1 ··· ··· 0198'],['Email','b@fixture.invalid']],
      business:[['Role','Owner'],['Company','AUTHORIZED TENANT 0f3a'],['SSN','000-00-0000',1]],
      docs:[['Signed agreement','11 Mar'],['ID verification','\u2014 not on file']],
      billing:[['Billed through','the company'],['Method','\u2014']] },
    { id:'p3', kind:'Person', name:'fixture A', sub:'Inbound \u00b7 no company on record', life:'Prospect',
      owner:'PAIGE', touch:'4m', portal:'Not invited', vault:'None',
      identity:[['First name','fixture'],['Last name','A'],['Date of birth','\u2014'],['Address','\u2014 not on file'],['Phone','+1 ··· ··· 0142'],['Email','a@fixture.invalid']],
      business:[['Role','\u2014'],['Company','\u2014 none linked'],['SSN','\u2014 not on file']],
      docs:[['Nothing on file','\u2014']],
      billing:[['Plan','\u2014 not a client'],['Method','\u2014']] },
    { id:'p4', kind:'Company', name:'AUTHORIZED TENANT \u00b7 agency', sub:'Agency \u00b7 parent of 4', life:'Client',
      owner:'You', touch:'1d', portal:'Active \u00b7 smart', vault:'Shared \u00b7 21 items',
      identity:[['Legal name','AUTHORIZED TENANT agency'],['Primary contact','\u2014'],['Address','\u2014 not on file'],['Phone','\u2014'],['Email','\u2014']],
      business:[['Entity type','\u2014'],['Formation state','\u2014'],['EIN','00-0000000',1],['Tax classification','\u2014']],
      docs:[['Master agreement','signed 2 Feb'],['Reseller addendum','signed 2 Feb']],
      billing:[['Plan','Agency'],['MRR','\u2014 Money Spine deferred'],['Method','ACH ending 2038',1],['Next invoice','\u2014']] },
    { id:'p5', kind:'Person', name:'fixture C', sub:'Reseller candidate', life:'Partner',
      owner:'\u2014', touch:'1d', portal:'Not invited', vault:'None',
      identity:[['First name','fixture'],['Last name','C'],['Date of birth','\u2014'],['Address','\u2014 not on file'],['Phone','+1 ··· ··· 0233'],['Email','c@fixture.invalid']],
      business:[['Role','\u2014'],['Company','\u2014 none linked'],['SSN','\u2014 not on file']],
      docs:[['Nothing on file','\u2014']],
      billing:[['Plan','\u2014 not a client'],['Method','\u2014']] },
    { id:'p6', kind:'Company', name:'AUTHORIZED TENANT \u00b7 7c11', sub:'Sub-account \u00b7 0 seats', life:'Client \u00b7 at risk',
      owner:'PAIGE', touch:'6d', portal:'Invited \u00b7 never opened', vault:'Shared \u00b7 2 items',
      identity:[['Legal name','AUTHORIZED TENANT 7c11'],['Primary contact','\u2014'],['Address','\u2014 not on file'],['Phone','\u2014'],['Email','\u2014']],
      business:[['Entity type','\u2014'],['Formation state','\u2014'],['EIN','\u2014 not on file'],['Tax classification','\u2014']],
      docs:[['Master agreement','signed 19 Jun'],['W-9','\u2014 not uploaded']],
      billing:[['Plan','Sub-account'],['MRR','\u2014 Money Spine deferred'],['Method','via parent'],['Next invoice','\u2014']] },
    { id:'p7', kind:'Company', name:'DESIGN FIXTURE \u00b7 internal', sub:'Platform test account', life:'Internal',
      owner:'\u2014', touch:'\u2014', portal:'Not invited', vault:'None',
      identity:[['Legal name','DESIGN FIXTURE internal'],['Primary contact','\u2014'],['Address','\u2014'],['Phone','\u2014'],['Email','\u2014']],
      business:[['Entity type','\u2014'],['Formation state','\u2014'],['EIN','\u2014'],['Tax classification','\u2014']],
      docs:[['Nothing on file','\u2014']],
      billing:[['Plan','\u2014'],['Method','\u2014']] }
  ];

  P.PERSON_TABS = ['Identity','Business','Documents','Vault','Portal','Conversations','Deals','Billing','Notes','Activity'];

  // What the wire counts, per book. Declared beside the fixtures they mirror so a number
  // on the wire always has a row behind it. Stage 3 replaces this with live reads.
  P.WIRE_COUNTS = {
    fleet: { provisioning: 2, unreadable: 1 },
    relationships: { unread: 5, drafted: 2, approvals: 2, dm: 3 },
    campaigns: { drafted: 2, stalled: 2 },
    marketplace: { review: 3, blocked: 1 },
    analytics: { unread: 4, lastRead: '06:30' },
    settings: { unwired: 1 }
  };


  // Segments — saved views of the People book. A rule is stored as readable clauses so
  // she can say it back, reason about it, and build one from a sentence.
  // The clause vocabulary. Declarative on purpose: a clause is a field, an operator and a
  // value, which is what a segment must become server-side. The predicates that resolve
  // them against the book live in the shell, not here.
  P.SEG_FIELDS = [
    { id:'kind',  cat:'Who they are', label:'Record type',   verb:['is','is not'],   live:true,
      values:[['person','a person'],['company','a company']] },
    { id:'life',  cat:'Who they are', label:'Lifecycle',     verb:['is','is not'],   live:true,
      values:[['client','a client'],['contact','a client contact'],['prospect','a prospect'],['partner','a partner']] },
    { id:'owner', cat:'Who they are', label:'Owner',         verb:['is','is not'],   live:true,
      values:[['you','owned by you'],['paige','owned by PAIGE'],['none','unowned']] },
    { id:'touch', cat:'Activity',     label:'Last touch',    verb:['is','is not'],   live:true,
      values:[['today','touched today'],['older','last touched over a day ago']] },
    { id:'portal',cat:'Reach',        label:'Portal',        verb:['is','is not'],   live:true,
      values:[['on','on the portal'],['off','not invited to the portal']] },
    { id:'vault', cat:'Reach',        label:'Vault',         verb:['has','has no'],  live:true,
      values:[['shared','vault items shared directly'],['company','vault access through their company']] },
    { id:'ein',   cat:'Records',      label:'EIN',           verb:['has','has no'],  live:true,
      values:[['on','an EIN on file']] },
    { id:'agree', cat:'Records',      label:'Agreement',     verb:['has','has no'],  live:true,
      values:[['on','a signed agreement']] },
    { id:'thread30', cat:'Activity',  label:'Recent thread', verb:['has','has no'],  live:false,
      why:'Thread history is not readable at operator scope \u2014 Stage 3',
      values:[['on','a conversation in the last 30 days']] },
    { id:'reply', cat:'Activity',     label:'Inbound reply', verb:['has','has no'],  live:false,
      why:'Thread history is not readable at operator scope \u2014 Stage 3',
      values:[['on','at least one inbound reply']] },
    { id:'meeting', cat:'Activity',   label:'Meeting',       verb:['has','has no'],  live:false,
      why:'No calendar source is connected \u2014 Stage 3',
      values:[['on','a meeting on record']] },
    { id:'outbound', cat:'Activity',  label:'Outbound',      verb:['has','has no'],  live:false,
      why:'Outbound history is not recorded yet \u2014 Stage 3',
      values:[['on','outbound on record']] }
  ];

  // What she listens for when a segment is described in words. neg marks a phrase that
  // carries its own negation, so \u201cquiet\u201d becomes has no rather than has.
  P.SEG_PHRASES = [
    { say:'client', f:'life', v:'client' },
    { say:'contact', f:'life', v:'contact' },
    { say:'prospect', f:'life', v:'prospect' },
    { say:'lead', f:'life', v:'prospect' },
    { say:'partner', f:'life', v:'partner' },
    { say:'reseller', f:'life', v:'partner' },
    { say:'compan', f:'kind', v:'company' },
    { say:'people', f:'kind', v:'person' },
    { say:'person', f:'kind', v:'person' },
    { say:'mine', f:'owner', v:'you' },
    { say:'i own', f:'owner', v:'you' },
    { say:'she owns', f:'owner', v:'paige' },
    { say:'unowned', f:'owner', v:'none' },
    { say:'nobody owns', f:'owner', v:'none' },
    { say:'ein', f:'ein', v:'on' },
    { say:'tax id', f:'ein', v:'on' },
    { say:'agreement', f:'agree', v:'on' },
    { say:'signed', f:'agree', v:'on' },
    { say:'portal', f:'portal', v:'on' },
    { say:'vault', f:'vault', v:'shared' },
    { say:'quiet', f:'thread30', v:'on', neg:true },
    { say:'gone quiet', f:'thread30', v:'on', neg:true },
    { say:'thread', f:'thread30', v:'on' },
    { say:'conversation', f:'thread30', v:'on' },
    { say:'spoken', f:'thread30', v:'on' },
    { say:'heard from', f:'thread30', v:'on' },
    { say:'30 days', f:'thread30', v:'on' },
    { say:'a month', f:'thread30', v:'on' },
    { say:'replied', f:'reply', v:'on' },
    { say:'reply', f:'reply', v:'on' },
    { say:'answered', f:'reply', v:'on' },
    { say:'met', f:'meeting', v:'on' },
    { say:'meeting', f:'meeting', v:'on' },
    { say:'booked', f:'meeting', v:'on' },
    { say:'contacted', f:'outbound', v:'on' },
    { say:'outbound', f:'outbound', v:'on' },
    { say:'reached out', f:'outbound', v:'on' },
    { say:'touched today', f:'touch', v:'today' },
    { say:'today', f:'touch', v:'today' }
  ];

  P.SEGMENTS = [
    { id:'s1', name:'Clients with no thread in 30 days', count:2, of:4, kind:'Clients',
      clauses:[['is','a client'],['has no','conversation in the last 30 days']],
      why:'Quiet clients are the ones who leave. This is the list I check first on a Monday.',
      used:[['Automation','Follow-ups'],['Campaign','\u2014 not in use']],
      members:[['AUTHORIZED TENANT \u00b7 7c11','last thread 41 days ago'],['AUTHORIZED TENANT \u00b7 b204','last thread 33 days ago']],
      live:true, computed:'recomputed on read' },
    { id:'s2', name:'Prospects who replied but never met', count:1, of:2, kind:'Prospects',
      clauses:[['is','a prospect'],['has','at least one inbound reply'],['has no','meeting on record']],
      why:'They answered, so the interest is real. Nothing was booked, so something stalled.',
      used:[['Campaign','Operator outreach \u00b7 fixture'],['Automation','\u2014 not in use']],
      members:[['PROSPECT \u00b7 design fixture B','replied 10:30, no meeting']],
      live:true, computed:'recomputed on read' },
    { id:'s3', name:'Companies missing an EIN', count:2, of:4, kind:'Companies',
      clauses:[['is','a company'],['has no','EIN on file']],
      why:'A missing EIN blocks billing and filings. Worth clearing before it is urgent.',
      used:[['Automation','\u2014 not in use'],['Campaign','\u2014 not in use']],
      members:[['PROSPECT \u00b7 design fixture A','no EIN on file'],['PARTNER \u00b7 design fixture C','no EIN on file']],
      live:true, computed:'recomputed on read' },
    { id:'s4', name:'Never contacted', count:null, of:null, kind:'All',
      clauses:[['is','known to us'],['has no','outbound on record']],
      why:'The book we have never worked. I cannot size it until outbound history is readable.',
      used:[['Campaign','\u2014 not in use'],['Automation','\u2014 not in use']],
      members:[],
      live:false, computed:'needs outbound history \u00b7 Stage 3' }
  ];


  // Campaigns. A campaign is active when three things are true at once: an audience is
  // bound to it, its motion has not finished, and it is not halted. That is the whole
  // definition — everything on the surface answers to it.
  //
  // The taxonomy is by MOTION, not by demographic. Who a campaign reaches is the segment
  // it runs against; how it moves is what separates one kind from another.
  //   outbound  — we initiate, against a segment
  //   lifecycle — a record changing state triggers it
  //   recurring — the clock triggers it
  P.CAMP_KINDS = {
    outbound:  { label: 'Outbound',  glyph: 'M2.5 8h9 M8.5 4.5 12 8l-3.5 3.5', note: 'We initiate, against a segment' },
    lifecycle: { label: 'Lifecycle', glyph: 'M3 11.5a5 5 0 1 1 10 0 M8 3v4.5', note: 'A record changing state triggers it' },
    recurring: { label: 'Recurring', glyph: 'M8 2.5a5.5 5.5 0 1 0 5.2 3.7 M13.5 2.5v3.8h-3.8', note: 'The clock triggers it' },
    seo:       { label: 'SEO', glyph: 'M6.8 3.2a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2 M9.6 9.6l3.4 3.4', note: 'Nothing is sent \u2014 a step publishes an asset' }
  };

  // Five states. Active holds the first three; halted and done are reachable by filter
  // but are not active by the definition above.
  P.CAMP_STATES = {
    running:   { label: 'Running',   tone: 'var(--pg-positive)', active: 1, note: 'A step has gone and the motion has more to go' },
    holding:   { label: 'Holding',   tone: 'var(--pg-gold-deep)', active: 1, note: 'The next step needs your word before it goes' },
    scheduled: { label: 'Scheduled', tone: 'var(--pg-violet)',   active: 1, note: 'Audience bound, first step has not gone' },
    halted:    { label: 'Halted',    tone: 'var(--pg-negative)', active: 0, note: 'Stopped between steps — delivered steps stand' },
    done:      { label: 'Done',      tone: 'var(--pg-faint)',    active: 0, note: 'Motion finished' }
  };

  // ── What is actually being sold ───────────────────────────────────────────
  // A campaign with no offer is a brand campaign, which is legitimate. A campaign with
  // one is bound to a row here, and the binding is what lets Active show money.
  P.OFFER_KINDS = {
    product:  { label: 'Product',  glyph: 'M2.8 5.4 8 2.8l5.2 2.6v5.2L8 13.2l-5.2-2.6z M2.8 5.4 8 8l5.2-2.6 M8 8v5.2', note: 'Shipped as a thing' },
    service:  { label: 'Service',  glyph: 'M5.2 4.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0 M2.8 13.2c0-2.5 2.3-4 5.2-4s5.2 1.5 5.2 4', note: 'Delivered by people' },
    retainer: { label: 'Retainer', glyph: 'M8 2.6a5.4 5.4 0 1 0 5.1 3.6 M13.4 2.6v3.6H9.8 M8 5.6V8l2 1.4', note: 'Recurring scope, not a fixed deliverable' },
    license:  { label: 'License',  glyph: 'M4.4 7.2h7.2v6H4.4z M6.2 7.2V5a1.8 1.8 0 0 1 3.6 0v2.2', note: 'Access, not delivery' }
  };
  P.OFFER_CATEGORIES = ['Platform', 'Enablement', 'Advisory'];
  P.OFFER_STATES = {
    selling: { label: 'Selling', tone: 'var(--pg-positive)', note: 'On sale and reachable from at least one channel' },
    quiet:   { label: 'Quiet',   tone: 'var(--pg-gold-deep)', note: 'Priced and ready, nothing sells it right now' },
    draft:   { label: 'Draft',   tone: 'var(--pg-violet)',   note: 'Not sellable \u2014 price or fulfilment unfinished' },
    retired: { label: 'Retired', tone: 'var(--pg-faint)',    note: 'Off sale. Existing terms stand' }
  };
  P.CATALOG = [
    { id: 'o1', name: 'Standalone tenancy', kind: 'product', cat: 'Platform', state: 'selling',
      price: 490, period: 'monthly', unit: 'per tenant',
      pitch: 'One tenant, her included, on the operator substrate.',
      tiers: [
        ['Standalone', 490, 'monthly', '1 tenant \u00b7 12 seats'],
        ['Agency', 1900, 'monthly', 'parent \u00b7 4 sub-tenants'],
        ['Enterprise', null, 'quoted', 'unlimited seats, with an SLA']
      ],
      where: ['Marketplace storefront', 'Operator outreach', 'Reseller intent'],
      fulfil: [['What', 'A provisioned tenant with her installed'], ['Who', 'PAIGE provisions, you countersign'], ['When', 'Same day as signature']] },
    { id: 'o2', name: 'Reseller programme', kind: 'license', cat: 'Platform', state: 'selling',
      price: 0, period: 'revenue share', unit: '20% of tenant billing',
      pitch: 'They sell tenancies under their own brand and keep a cut.',
      tiers: [['Reseller', 0, 'revenue share', '20% of what they bill']],
      where: ['Reseller intent', 'Marketplace storefront'],
      fulfil: [['What', 'A parent tenancy and a rate card'], ['Who', 'You approve every reseller by hand'], ['When', 'After a call']] },
    { id: 'o3', name: 'Migration', kind: 'service', cat: 'Enablement', state: 'selling',
      price: 2400, period: 'one-time', unit: 'per tenant',
      pitch: 'Their book, their threads and their pipeline moved in without a gap.',
      tiers: [['Standard', 2400, 'one-time', 'up to 5,000 records'], ['Large', 6800, 'one-time', 'no record ceiling']],
      where: ['Operator outreach'],
      fulfil: [['What', 'Records mapped, imported and reconciled'], ['Who', 'You, with her doing the mapping'], ['When', 'Two weeks from kickoff']] },
    { id: 'o4', name: 'Fractional operator', kind: 'retainer', cat: 'Advisory', state: 'quiet',
      price: 3500, period: 'monthly', unit: 'per month',
      pitch: 'We run the platform with them until they can run it alone.',
      tiers: [['Half', 3500, 'monthly', 'two days a week'], ['Full', 6500, 'monthly', 'four days a week']],
      where: [],
      fulfil: [['What', 'Standing operator hours and a weekly read'], ['Who', 'You'], ['When', 'Monthly, rolling']] },
    { id: 'o5', name: 'Agent build', kind: 'service', cat: 'Enablement', state: 'draft',
      price: null, period: 'quoted', unit: '\u2014 not priced',
      pitch: 'A capability built to their process and installed on their tenant.',
      tiers: [],
      where: [],
      fulfil: [['What', 'A scoped capability, reviewed before install'], ['Who', 'Her, under your grant'], ['When', '\u2014 no delivery record yet']] }
  ];

  // ── Sales ─────────────────────────────────────────────────────────────────
  // Closed lines. Amounts are numbers so every figure on the surface is a sum, never
  // a typed total. state: booked | refunded | pending
  P.SALES_STAGES = ['Quoted', 'Verbal', 'Signed', 'Invoiced', 'Paid'];
  P.CLOSE_REASONS = ['Won', 'Price', 'Timing', 'No decision', 'Lost to in-house'];
  P.SALES_TARGET = { period: 'this quarter', target: 12000, note: 'Set by hand. Nothing enforces it \u2014 it is a line on a chart, not a gate.' };
  P.SALES = [
    { id: 'sl1', when: '4 Jul',  day: 4,  offer: 'o1', tier: 'Standalone', amount: 490,  state: 'booked',   stage: 'Paid',     camp: 'Operator outreach', who: 'AUTHORIZED TENANT \u00b7 0f3a' },
    { id: 'sl2', when: '11 Jul', day: 11, offer: 'o3', tier: 'Standard',   amount: 2400, state: 'booked',   stage: 'Paid',     camp: 'Operator outreach', who: 'AUTHORIZED TENANT \u00b7 0f3a' },
    { id: 'sl3', when: '2 Aug',  day: 33, offer: 'o1', tier: 'Agency',     amount: 1900, state: 'booked',   stage: 'Paid',     camp: 'Reseller intent',   who: 'AUTHORIZED TENANT \u00b7 agency' },
    { id: 'sl4', when: '9 Aug',  day: 40, offer: 'o2', tier: 'Reseller',   amount: 0,    state: 'booked',   stage: 'Signed',   camp: 'Reseller intent',   who: 'PARTNER \u00b7 design fixture C' },
    { id: 'sl5', when: '14 Aug', day: 45, offer: 'o1', tier: 'Standalone', amount: 490,  state: 'refunded', stage: 'Paid',     camp: '\u2014 direct',       who: 'PROSPECT \u00b7 design fixture A' },
    { id: 'sl6', when: '19 Aug', day: 50, offer: 'o3', tier: 'Large',      amount: 6800, state: 'pending',  stage: 'Invoiced', camp: 'Operator outreach', who: 'AUTHORIZED TENANT \u00b7 b204' }
  ];

  // The processor seam. Agnostic by construction: the platform describes what it needs
  // from a merchant provider, and an adapter satisfies it. Stripe is the first adapter,
  // not the interface.
  P.PROCESSOR = {
    deck: 'Sales records are ours. Money movement is an adapter, so the provider can change without touching a single sale.',
    needs: [
      ['Charge once', 'One-time and quoted work', 'Adapter'],
      ['Charge on a period', 'Monthly and annual billing', 'Adapter'],
      ['Refund a charge', 'Reverses the line, keeps the record', 'Adapter'],
      ['Report a payout', 'When our money actually lands', 'Adapter'],
      ['Split a payment', 'Marketplace only \u2014 never tenant sales', 'Stripe Connect']
    ],
    adapters: [
      { name: 'Stripe', state: 'Wired at operator scope', tone: 'var(--pg-positive)', note: 'The platform operator account. Connect is required only for the marketplace split, and that ruling is still open.' },
      { name: 'Any other merchant provider', state: 'Pluggable', tone: 'var(--pg-gold-deep)', note: 'Satisfy the five needs above and the surface does not change. Planned before general availability.' }
    ],
    foot: 'No tenant sale is ever split. Revenue share exists in the marketplace and nowhere else.'
  };

  // ── The part a tenant owns ────────────────────────────────────────────────
  // Everything here is schema, not code: a tenant renames it, reorders it, or turns it
  // off, and the surfaces above read from the result.
  P.CARD_FACTS = [
    { id: 'step',   label: 'Step',    note: 'Position in the motion' },
    { id: 'opened', label: 'Opened',  note: 'Opens, where a channel reports them' },
    { id: 'reach',  label: 'Reached', note: 'How many the motion has touched' },
    { id: 'grant',  label: 'PAIGE',   note: 'How much room she has on this campaign' },
    { id: 'offer',  label: 'Sells',   note: 'The offer this campaign is bound to' },
    { id: 'booked', label: 'Booked',  note: 'Money attributed to this campaign' }
  ];
  P.CAMP_SCHEMA = {
    definition: 'Active = audience bound \u00b7 motion unfinished \u00b7 not halted',
    facts: ['step', 'opened', 'reach', 'grant'],
    density: 'full',
    stageWord: 'Step'
  };

  P.CAMPAIGNS = [
    { id: 'c6', name: 'Reseller intent', kind: 'seo', state: 'running', offer: 'o2',
      channel: 'Published', segment: '\u2014 no audience, by definition', grant: 'Draft only',
      reach: null, replies: null, started: '4 weeks ago',
      steps: [
        { name: 'Pillar page', when: 'published 4w ago', state: 'delivered', body: 'What a reseller relationship actually involves, and the split.' },
        { name: 'Comparison page', when: 'published 2w ago', state: 'delivered', body: 'Us against running it yourself, with the honest cases against.' },
        { name: 'Case study', when: 'in draft', state: 'current', body: 'One agency\u2019s first quarter, with the numbers they agreed to share.' },
        { name: 'Internal links', when: 'not started', state: 'pending', body: 'Wire the three pages to the pricing page and each other.' }
      ] },
    { id: 'c7', name: 'Agent platform terms', kind: 'seo', state: 'holding',
      channel: 'Published', segment: '\u2014 no audience, by definition', grant: 'Ask first',
      reach: null, replies: null, started: '1 week ago',
      steps: [
        { name: 'Glossary', when: 'published 1w ago', state: 'delivered', body: 'The vocabulary of agent platforms, defined plainly.' },
        { name: 'Six explainers', when: 'held for your word', state: 'current', body: 'One page per term. She has drafted all six and is holding them.' },
        { name: 'Republish the glossary', when: 'not started', state: 'pending', body: 'Link each term to its explainer once they are live.' }
      ] },

    { id: 'c1', name: 'Operator outreach', kind: 'outbound', state: 'running', offer: 'o1',
      channel: 'Email', segment: 'Never contacted', grant: 'Ask first',
      opened: 'day 6 of 11', reach: '\u2014',
      steps: [
        { name: 'Intro', at: 'day 0', done: 1, body: 'Why we reached out, one paragraph, one ask.' },
        { name: 'Follow', at: 'day 3', done: 1, body: 'A second angle if the first went unanswered.' },
        { name: 'Case', at: 'day 7', done: 0, body: 'A worked example from a comparable operator.' },
        { name: 'Last call', at: 'day 11', done: 0, body: 'Closing note. No further contact after this.' }
      ] },
    { id: 'c2', name: 'Reseller interest', kind: 'outbound', state: 'holding',
      channel: 'Email', segment: 'Reseller candidates', grant: 'Ask first',
      opened: 'day 2 of 6', reach: '\u2014',
      steps: [
        { name: 'Opener', at: 'day 0', done: 1, body: 'Partner terms in brief, with the margin table attached.' },
        { name: 'Terms', at: 'day 2', done: 0, hold: 1, body: 'The full agreement. Held — needs your word before it goes.' },
        { name: 'Close', at: 'day 6', done: 0, body: 'Decision request with a dated deadline.' }
      ] },
    { id: 'c3', name: 'Provisioning welcome', kind: 'lifecycle', state: 'scheduled',
      channel: 'Email', segment: 'Tenant reaches first run', grant: 'Autonomous',
      opened: 'not started', reach: '\u2014',
      steps: [
        { name: 'Welcome', at: 'on trigger', done: 0, body: 'Sent the moment a tenant completes first run.' },
        { name: 'Check in', at: 'day 7', done: 0, body: 'What they have used, what they have not.' }
      ] },
    { id: 'c4', name: 'Quarterly review invite', kind: 'recurring', state: 'halted',
      channel: 'Email', segment: 'Live clients', grant: 'Ask first',
      opened: 'halted day 1', reach: '\u2014',
      steps: [
        { name: 'Invite', at: 'day 0', done: 1, body: 'Booking link for the quarterly review.' },
        { name: 'Nudge', at: 'day 4', done: 0, body: 'A reminder for anyone who has not booked.' }
      ] }
  ];


  // A deal record is the working surface for one relationship in motion. It is the one
  // place where stage, activity, notes, the client behind it and their portal all meet —
  // and every field on it is editable by hand or by PAIGE, under the same ceiling.
  P.DEAL_RECORDS = {
    d1: { person: 'r1', portal: 'invited', portalWhen: 'sent 4 Feb \u00b7 not opened', owner: 'You',
      next: 'Confirm the named decision-maker', nextWhen: 'today',
      activity: [
        { when: '2h', who: 'PAIGE', what: 'Drafted the discovery agenda and held it for your word', tone: 'hold' },
        { when: '1d', who: 'You', what: 'Moved to Qualified from the board', tone: 'act' },
        { when: '3d', who: 'PAIGE', what: 'Read the inbound thread and attached it to this deal', tone: 'read' }
      ],
      notes: [
        { when: '1d', who: 'You', body: 'They want seat expansion before the renewal date, not after. Timing is the whole conversation.' },
        { when: '3d', who: 'PAIGE', body: 'Two people replied from the same domain. I have kept them on one record rather than splitting it.' }
      ] },
    d2: { person: 'r2', portal: 'active', portalWhen: 'last seen 2d ago', owner: 'PAIGE',
      next: 'Answer the margin question', nextWhen: '2d overdue',
      activity: [
        { when: '5h', who: 'PAIGE', what: 'Flagged this as waiting on you for 2 days', tone: 'hold' },
        { when: '2d', who: 'Them', what: 'Asked whether margin moves at volume', tone: 'read' }
      ],
      notes: [
        { when: '2d', who: 'You', body: 'Do not quote a number until legal confirms the reseller tier is signed off.' }
      ] },
    d3: { person: 'r3', portal: 'none', portalWhen: 'never invited', owner: 'You',
      next: 'Attach the proposal', nextWhen: 'blocking',
      activity: [
        { when: '8d', who: 'You', what: 'Advanced to Proposal without attaching one', tone: 'act' }
      ],
      notes: [] },
    d4: { person: 'r1', portal: 'none', portalWhen: 'never invited', owner: '\u2014',
      next: 'Decide whether to keep this open', nextWhen: '31d in stage',
      activity: [
        { when: '31d', who: 'You', what: 'Opened as a recovery', tone: 'act' }
      ],
      notes: [] },
    d5: { person: 'r2', portal: 'invited', portalWhen: 'sent 18 Feb \u00b7 opened once', owner: 'PAIGE',
      next: 'Countersign and open provisioning', nextWhen: 'this week',
      activity: [
        { when: '4d', who: 'PAIGE', what: 'Sent the contract for signature', tone: 'act' }
      ],
      notes: [] }
  };

  P.PORTAL_STATES = {
    none:    { label: 'Not invited', tone: 'var(--pg-faint)',    act: 'Invite to portal' },
    invited: { label: 'Invited',     tone: 'var(--pg-gold-deep)', act: 'Resend invite' },
    active:  { label: 'Active',      tone: 'var(--pg-positive)',  act: 'Open their portal' }
  };


  // PAIGE's mind. Four things a chat needs before it is a workspace: what she remembers,
  // who works for her, where she can write, and what governs all three. Every one of them
  // answers to the same ceiling as her capabilities \u2014 memory is not exempt from authority.
  P.MEMORY = [
    { id: 'm1', kind: 'Standing', what: 'Never quote a reseller number before legal signs off the tier.', from: 'You said it \u00b7 2d', pinned: 1, acts: 'Every outbound draft' },
    { id: 'm2', kind: 'Standing', what: 'Morning brief lands before 07:00 or it is late.', from: 'You said it \u00b7 3w', pinned: 1, acts: 'Sweep schedule' },
    { id: 'm3', kind: 'Learned', what: 'Two people at fixture A reply from the same domain \u2014 one record, not two.', from: 'She inferred it \u00b7 3d', pinned: 0, acts: 'Inbound triage' },
    { id: 'm4', kind: 'Learned', what: 'Migration drift has read skip on every run since the CI reader was deferred.', from: 'She inferred it \u00b7 11 runs', pinned: 0, acts: 'The morning brief' },
    { id: 'm5', kind: 'Working', what: 'You are mid-review of the Super Admin shell and want fewer big numbers.', from: 'This session', pinned: 0, acts: 'How she writes back to you' }
  ];

  // She does not write to memory on her own at ask-first. She proposes, and you rule.
  P.MEMORY_PROPOSED = [
    { id: 'p1', kind: 'Learned', what: 'Deals in Proposal without evidence get flagged rather than advanced \u2014 that has been your call three times.', from: 'She noticed it \u00b7 3 occurrences', acts: 'Pipeline hygiene' }
  ];

  P.AGENTS = [
    { id: 'paige', name: 'PAIGE', role: 'The command layer. Everything reaches you through her.', grant: 'Ask first', state: 'Ready', core: 1,
      now: 'Watching 3 threads \u00b7 1 reply drafted', last: 'Wrote the 06:34 brief' },
    { id: 'zion', name: 'ZION', role: 'Fleet half of the sweep. Reads tenant condition and reports drift.', grant: 'Autonomous', state: 'Idle', core: 1,
      now: 'Nothing running', last: 'Swept 10 checks at 06:30' },
    { id: 'oathen', name: 'OATHEN', role: 'Holds findings that need your word and never acts on them.', grant: 'Observe', state: 'Queued', core: 1,
      now: 'Holding 1 blocking finding', last: 'Queued alert_delivery at 06:34' },
    { id: 'mason', name: 'MASON', role: 'Builds and maintains automations. Reads the catalogue, writes the chain, never fires it.', grant: 'Draft only', state: 'Ready', core: 1,
      now: 'Waiting on a description', last: 'Built the quiet-thread follow-up' },
    { id: 'a4', name: 'Draft agent', role: 'Spun up for a single job. Retires when the job closes.', grant: 'Observe', state: 'Not started', core: 0,
      now: 'No job assigned', last: '\u2014' }
  ];

  P.SKILLS = [
    { name: 'Read the fleet', where: 'Live', note: 'Tenant condition, provisioning, drift' },
    { name: 'Draft a reply', where: 'Live', note: 'Email and SMS, held at ask-first' },
    { name: 'Move a deal', where: 'Live', note: 'Records the transition like a drag does' },
    { name: 'Edit a record', where: 'Live', note: 'Proposes; you accept or refuse' },
    { name: 'Write and run code', where: 'No substrate', note: 'No sandbox runtime exists at operator scope' },
    { name: 'Read the web', where: 'No substrate', note: 'No fetch seam, and no way to record a citation' },
    { name: 'Drive a browser', where: 'No substrate', note: 'No session broker to hold a logged-in page' }
  ];


  // The sandbox. Representative only: no execution substrate exists at any tier, so a run
  // is a design state. The scratch files are what she would write, not what she has run.

  // The marketplace. Five kinds, three publisher classes, one rule: an install can never
  // widen what she may do. A listing declares the grant it needs; the ceiling still clamps it.
  // The marketplace. Five kinds, three publisher classes, one rule: an install can never
  // widen what she may do. A listing declares the grant it needs, the integrations it reads,
  // and the substrate it runs on \u2014 all three are shown before you install, not after.
  P.MARKET = {
    kinds: {
      Skill:       { glyph: 'M8 2.4l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.8l-3.8 2 .7-4.3-3.1-3 4.3-.6z', note: 'A named procedure she runs when asked' },
      Automation:  { glyph: 'M3 8a5 5 0 0 1 5-5 M13 8a5 5 0 0 1-5 5 M8 3V1.4 M8 14.6V13 M6.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', note: 'Runs on its own, under a grant' },
      Integration: { glyph: 'M6 10L4.2 11.8a2.6 2.6 0 0 1-3.6-3.6L2.4 6.4 M10 6l1.8-1.8a2.6 2.6 0 0 1 3.6 3.6L13.6 9.6 M6.2 9.8l3.6-3.6', note: 'Connects an outside account' },
      Template:    { glyph: 'M2.6 3.4h10.8v9.2H2.6z M2.6 6.4h10.8 M6 6.4v6.2', note: 'A configured pipeline, form or portal' },
      Agent:       { glyph: 'M4.6 6.4h6.8v5.2H4.6z M8 6.4V4.2 M6.4 8.8h.01 M9.6 8.8h.01 M2.6 8.4h2 M11.4 8.4h2', note: 'A sub-agent with one job' }
    },
    // A publisher class is a ceiling on reach, and the revenue split is a term of the class.
    classes: {
      Platform:   { label: 'Platform', note: 'First party \u00b7 no review', split: '100% retained', trust: 'var(--pg-positive)' },
      Agency:     { label: 'Verified agency', note: 'Reviewed for anything beyond its own sub-accounts', split: '70 / 30', trust: 'var(--pg-gold-deep)' },
      Solo:       { label: 'Solo', note: 'Private freely \u00b7 review for anything wider', split: '60 / 40', trust: 'var(--pg-gold-deep)' },
      Unverified: { label: 'Unverified', note: 'Own workspace only \u00b7 cannot sell', split: '\u2014', trust: 'var(--pg-faint)' }
    },
    featured: 'sweep-brief',
    featuredKicker: 'This week',
    // Every listing carries the three things you need before installing: what it does step by
    // step, what it needs to run, and what changes on your platform if you say yes.
    listings: [
      { id: 'sweep-brief', name: 'Overnight sweep brief', kind: 'Skill', pub: 'Platform', cls: 'Platform',
        scope: 'Platform-wide', needs: 'Ask first', state: 'Installed', version: '2.4', updated: '3d ago', price: 'Included',
        pitch: 'She reads the whole fleet while you sleep, then writes one page you can act on before your first call. The findings are hers; the acts stay yours.',
        does: ['Runs the ten-check sweep at 06:30', 'Writes one finding per failure, worst first', 'Drafts a fix for each and holds it', 'Names every check that could not run'],
        reqs: [['Grant', 'Ask first', 'ok'], ['Reads', 'Tenant config, run history', 'ok'], ['Writes', 'Findings, brief', 'ok'], ['Substrate', 'Sweep runner \u2014 live', 'ok']],
        changes: ['A brief appears on Fleet each morning', 'Her drafted fixes wait for your word', 'Nothing is applied without you'] },
      { id: 'stalled-triage', name: 'Stalled-deal triage', kind: 'Automation', pub: 'Platform', cls: 'Platform',
        scope: 'Platform-wide', needs: 'Ask first', state: 'Installed', version: '1.9', updated: '1w ago', price: 'Included',
        pitch: 'Every deal past its stage target gets read, not just flagged. She works out why it stopped and proposes the next move.',
        does: ['Reads stage targets against time in stage', 'Reads the thread for the last real signal', 'Proposes one next step per deal', 'Flags deals advanced without evidence'],
        reqs: [['Grant', 'Ask first', 'ok'], ['Reads', 'Pipeline, conversations', 'ok'], ['Writes', 'Deal notes, proposals', 'ok'], ['Substrate', 'Stage-change history \u2014 missing', 'gap']],
        changes: ['Stalled deals get a proposal instead of a flag', 'Her reasoning is on each deal record', 'Advancing still needs your word'] },
      { id: 'quiet-hours', name: 'Quiet-hours guard', kind: 'Automation', pub: 'Platform', cls: 'Platform',
        scope: 'Platform-wide', needs: 'Autonomous', state: 'Installed', version: '3.1', updated: '2d ago', price: 'Included',
        pitch: 'Nothing outbound leaves outside a tenant\u2019s allowed window. It holds the message rather than dropping it, and sends when the window opens.',
        does: ['Reads each tenant\u2019s allowed window', 'Holds anything outbound outside it', 'Releases it when the window opens', 'Records every hold and release'],
        reqs: [['Grant', 'Autonomous', 'need'], ['Reads', 'Tenant settings, send queue', 'ok'], ['Writes', 'Hold records', 'ok'], ['Substrate', 'Send seam \u2014 live', 'ok']],
        changes: ['Outbound is held, never dropped', 'She acts without asking \u2014 that is the point', 'Every hold is on the record'] },
      { id: 'callback-agent', name: 'Voice callback agent', kind: 'Agent', pub: 'Platform', cls: 'Platform',
        scope: 'Platform-wide', needs: 'Ask first', state: 'Blocked', version: '0.4', updated: '5d ago', price: 'Metered',
        pitch: 'Returns a missed call, works out what they wanted, and hands you the live line the moment it matters.',
        does: ['Dials a returned call from the queue', 'Opens with why it is calling', 'Hands you the live line on intent', 'Writes the call back to the thread'],
        reqs: [['Grant', 'Ask first', 'ok'], ['Reads', 'Call queue, thread history', 'ok'], ['Writes', 'Call record, transcript', 'ok'], ['Substrate', 'Voice runtime \u2014 none exists', 'gap']],
        changes: ['Nothing, until a voice runtime exists', 'The listing stays visible so the gap is legible', 'It will not install against a missing runtime'] },
      { id: 'reseller-pack', name: 'Reseller onboarding pack', kind: 'Template', pub: 'AUTHORIZED PUBLISHER \u00b7 agency', cls: 'Agency',
        scope: 'Agency-only', needs: 'Draft only', state: 'Install', version: '1.2', updated: '4d ago', price: '$40 / month',
        pitch: 'The whole first fortnight of a reseller relationship, configured: a pipeline, two sequences, an intake form and a portal.',
        does: ['Installs a five-stage reseller pipeline', 'Adds two sequences bound to it', 'Adds an intake form that files to stage one', 'Configures a portal for the reseller'],
        reqs: [['Grant', 'Draft only', 'ok'], ['Reads', 'Nothing', 'ok'], ['Writes', 'Pipeline, sequences, form, portal', 'ok'], ['Substrate', 'All four exist', 'ok']],
        changes: ['Four new configured objects appear', 'She may draft against them, not send', 'Nothing you already have is touched'] },
      { id: 'intake-pipe', name: 'Intake form to pipeline', kind: 'Template', pub: 'AUTHORIZED PUBLISHER \u00b7 agency', cls: 'Agency',
        scope: 'Wants platform-wide', needs: 'Ask first', state: 'In review', version: '2.0', updated: '3d ago', price: '$25 / month',
        pitch: 'A form that files a real record rather than an email: fields map to a relationship, and the submission opens at the right stage.',
        does: ['Publishes a form with mapped fields', 'Creates a relationship on submit', 'Opens a deal at the stage you choose', 'Drafts the first reply for your word'],
        reqs: [['Grant', 'Ask first', 'ok'], ['Reads', 'Form submissions', 'ok'], ['Writes', 'Relationships, deals', 'ok'], ['Substrate', 'Form seam \u2014 live', 'ok']],
        changes: ['Submissions become records, not mail', 'Her first reply waits for you', 'Under review \u2014 not installable platform-wide yet'] },
      { id: 'churn-read', name: 'Churn-risk read', kind: 'Skill', pub: 'AUTHORIZED PUBLISHER \u00b7 agency', cls: 'Agency',
        scope: 'Wants platform-wide', needs: 'Observe', state: 'In review', version: '0.9', updated: '1d ago', price: '$60 / month',
        pitch: 'Reads a tenant the way a good account manager would, and says plainly which ones she would call this week.',
        does: ['Reads seat use, support load, invoice history', 'Weights each against the tenant\u2019s own baseline', 'Names the three worth a call', 'Says what it could not read'],
        reqs: [['Grant', 'Observe', 'ok'], ['Reads', 'Seats, support, billing', 'ok'], ['Writes', 'Nothing \u2014 it only reads', 'ok'], ['Substrate', 'Support + billing joins \u2014 partial', 'gap']],
        changes: ['A weekly read appears in Analytics', 'She writes nothing and acts on nothing', 'Under review \u2014 agency scope only for now'] },
      { id: 'auto-outreach', name: 'Autonomous outreach', kind: 'Automation', pub: 'Platform', cls: 'Platform',
        scope: 'Platform-wide', needs: 'Autonomous', state: 'Install', version: '1.0', updated: '2w ago', price: 'Metered',
        pitch: 'She works a segment end to end \u2014 writes, sends, reads the reply, and only brings you the ones that need a human.',
        does: ['Works a segment without asking', 'Writes and sends each first touch', 'Reads replies and routes them', 'Escalates anything consequential'],
        reqs: [['Grant', 'Autonomous', 'need'], ['Reads', 'Segments, thread history', 'ok'], ['Writes', 'Outbound messages', 'ok'], ['Substrate', 'Send seam \u2014 live', 'ok']],
        changes: ['She sends without asking first', 'You see outcomes, not drafts', 'This is the widest grant on the platform'] },
      { id: 'ledger-export', name: 'Ledger export', kind: 'Integration', pub: 'AUTHORIZED PUBLISHER \u00b7 solo', cls: 'Solo',
        scope: 'Private', needs: 'Ask first', state: 'No substrate', version: '0.2', updated: '6d ago', price: 'Free',
        pitch: 'Pushes invoices and payouts into the ledger you already keep, on the schedule you already run.',
        does: ['Reads invoices and payouts', 'Maps them to your chart of accounts', 'Pushes on your schedule', 'Reconciles and reports differences'],
        reqs: [['Grant', 'Ask first', 'ok'], ['Reads', 'Billing records', 'gap'], ['Writes', 'Nothing here \u2014 pushes out', 'ok'], ['Substrate', 'Money spine \u2014 deferred', 'gap']],
        changes: ['Nothing, until the money spine lands', 'Private listing \u2014 its own workspace only'] },
      { id: 'client-digest', name: 'Weekly client digest', kind: 'Skill', pub: 'AUTHORIZED PUBLISHER \u00b7 solo', cls: 'Solo',
        scope: 'Private', needs: 'Draft only', state: 'Delisted', version: '1.1', updated: '3w ago', price: 'Free',
        pitch: 'One page per client each Friday: what moved, what did not, and the one thing you owe them.',
        does: ['Reads the week on each relationship', 'Writes one page per client', 'Names the one thing owed', 'Holds it for you to send'],
        reqs: [['Grant', 'Draft only', 'ok'], ['Reads', 'Relationships, threads', 'ok'], ['Writes', 'Drafts only', 'ok'], ['Substrate', 'All present', 'ok']],
        changes: ['Delisted by its publisher \u2014 not installable', 'Existing installs keep working'] }
    ],
    collections: [
      { title: 'Made by us', note: 'First party \u00b7 no review, published platform-wide', ids: ['sweep-brief', 'stalled-triage', 'quiet-hours', 'callback-agent'] },
      { title: 'From agencies', note: 'Reviewed before it reaches anyone outside its own sub-accounts', ids: ['reseller-pack', 'intake-pipe', 'churn-read'] },
      { title: 'Needs more room than you have given her', note: 'Visible, and honest about why it will not run', ids: ['auto-outreach', 'ledger-export', 'client-digest'] }
    ]
  };


  // Submissions. Review is the whole delegation model: an outside publisher may build
  // freely, and only a reviewed listing reaches a scope wider than its own workspace.
  // A submission carries the manifest the publisher declared — the same fields the install
  // page renders, so the reviewer reads exactly what the buyer will see.
  P.SUBMISSIONS = [
    { id: 'sub1', name: 'Intake form to pipeline', kind: 'Template', listing: 'intake-pipe',
      pub: 'AUTHORIZED PUBLISHER \u00b7 agency', cls: 'Agency', outside: false,
      wants: 'Platform-wide', has: 'Agency-only', version: '2.0', waiting: '3d',
      state: 'In review', assigned: 'Unassigned',
      why: 'They have sold this to their own sub-accounts for two months and want it in front of everyone.',
      manifest: [['Grant', 'Ask first', 'ok'], ['Reads', 'Form submissions', 'ok'], ['Writes', 'Relationships, deals', 'ok'], ['Substrate', 'Form seam \u2014 live', 'ok']],
      checks: [
        ['Manifest complete', 'Every declared field is present', 'pass'],
        ['Grant is minimal', 'Ask first is the least it can run on', 'pass'],
        ['No undeclared reads', 'Nothing outside the manifest', 'pass'],
        ['Kind is permitted at this scope', 'Template \u2014 allowed from outside', 'pass'],
        ['Security review', 'No reviewer identity exists yet', 'unrun']
      ],
      history: [['Submitted', '3d ago'], ['Auto-checks ran', '3d ago'], ['Awaiting a reviewer', 'since']] },
    { id: 'sub2', name: 'Churn-risk read', kind: 'Skill', listing: 'churn-read',
      pub: 'AUTHORIZED PUBLISHER \u00b7 agency', cls: 'Agency', outside: false,
      wants: 'Platform-wide', has: 'Private', version: '0.9', waiting: '1d',
      state: 'Submitted', assigned: 'Unassigned',
      why: 'First submission from this publisher. It reads billing, which is the sensitive part.',
      manifest: [['Grant', 'Observe', 'ok'], ['Reads', 'Seats, support, billing', 'ok'], ['Writes', 'Nothing', 'ok'], ['Substrate', 'Support + billing joins \u2014 partial', 'gap']],
      checks: [
        ['Manifest complete', 'Every declared field is present', 'pass'],
        ['Grant is minimal', 'Observe \u2014 it writes nothing', 'pass'],
        ['No undeclared reads', 'Billing read is declared', 'pass'],
        ['Kind is permitted at this scope', 'Skill \u2014 allowed from outside', 'pass'],
        ['Substrate present', 'The billing join does not exist yet', 'fail']
      ],
      history: [['Submitted', '1d ago'], ['Auto-checks ran', '1d ago'], ['One check failed', '1d ago']] },
    { id: 'sub3', name: 'Ledger export', kind: 'Integration', listing: 'ledger-export',
      pub: 'AUTHORIZED PUBLISHER \u00b7 solo', cls: 'Solo', outside: true,
      wants: 'Agency-only', has: 'Private', version: '0.2', waiting: '5h',
      state: 'Changes requested', assigned: 'Unassigned',
      why: 'An outside publisher submitting an Integration. By ruling, Integrations are platform-only until a security review exists.',
      manifest: [['Grant', 'Ask first', 'ok'], ['Reads', 'Billing records', 'gap'], ['Writes', 'Pushes outside the platform', 'ok'], ['Substrate', 'Money spine \u2014 deferred', 'gap']],
      checks: [
        ['Manifest complete', 'Every declared field is present', 'pass'],
        ['Grant is minimal', 'Ask first is right for an outbound push', 'pass'],
        ['No undeclared reads', 'Nothing outside the manifest', 'pass'],
        ['Kind is permitted at this scope', 'Integration from an outside publisher \u2014 not permitted', 'fail'],
        ['Substrate present', 'The money spine is deferred', 'fail']
      ],
      history: [['Submitted', '6d ago'], ['Auto-checks ran', '6d ago'], ['Changes requested', '5h ago']] }
  ];

  // What an outside publisher may ship, by kind. A template is configuration and a skill
  // composes what she already does; an agent or an integration is arbitrary behaviour
  // against a client's data, so both stay platform-only until a security review exists.
  P.OUTSIDE_KINDS = { Template: true, Skill: true, Automation: 'review', Integration: false, Agent: false };


  // Social. Not a grid of account cards — a publishing spine. Each connected account is a
  // lane, the seven days are the axis, a post is a point and an ad flight is a bar with a
  // duration. Spend is the one thing on this surface that is money, so it never reads as a
  // post: an ad is an authority gate, not a schedule entry.
  P.SOCIAL = {
    days: [
      { d: 'Mon', n: '18' }, { d: 'Tue', n: '19' }, { d: 'Wed', n: '20' }, { d: 'Thu', n: '21' },
      { d: 'Fri', n: '22', today: true }, { d: 'Sat', n: '23' }, { d: 'Sun', n: '24' }
    ],
    accounts: [
      { id: 'li', name: 'LinkedIn', handle: '@platform', glyph: 'M3.4 6.2v7.4 M3.4 3.4v.02 M6.8 13.6V6.2 M6.8 9.2a2.8 2.8 0 0 1 5.6 0v4.4',
        owner: 'Platform', grant: 'Ask first', state: 'Connected', cadence: 3,
        items: [
          { day: 0, kind: 'post', label: 'Fleet milestone', state: 'Sent' },
          { day: 2, kind: 'post', label: 'Hiring note', state: 'Sent' },
          { day: 4, kind: 'post', label: 'Marketplace open', state: 'Drafted' },
          { day: 1, span: 4, kind: 'ad', label: 'Operator awareness', state: 'Held', spend: '\u2014' }
        ] },
      { id: 'x', name: 'X', handle: '@platform', glyph: 'M3.2 3.2l9.6 9.6 M12.8 3.2L3.2 12.8',
        owner: 'Platform', grant: 'Ask first', state: 'Connected', cadence: 5,
        items: [
          { day: 0, kind: 'post', label: 'Release thread', state: 'Sent' },
          { day: 1, kind: 'reply', label: 'Replied to a mention', state: 'Sent' },
          { day: 3, kind: 'reply', label: 'Replied to a mention', state: 'Sent' },
          { day: 4, kind: 'post', label: 'Weekly read', state: 'Drafted' },
          { day: 5, kind: 'post', label: 'Queued', state: 'Scheduled' }
        ] },
      { id: 'ig', name: 'Instagram', handle: '@platform', glyph: 'M3.2 3.2h9.6v9.6H3.2z M6.2 8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M10.8 5.2v.02',
        owner: 'Platform', grant: 'Draft only', state: 'Connected', cadence: 4,
        items: [
          { day: 1, kind: 'story', label: 'Behind the sweep', state: 'Sent' },
          { day: 4, kind: 'post', label: 'Carousel', state: 'Drafted' },
          { day: 2, span: 3, kind: 'ad', label: 'Retargeting', state: 'Held', spend: '\u2014' }
        ] },
      { id: 'fb', name: 'Facebook', handle: 'Page', glyph: 'M9.6 13.6V8.8h2.2l.4-2.6H9.6V4.8c0-.8.3-1.3 1.4-1.3h1.3V1.2a18 18 0 0 0-2-.1c-2 0-3.3 1.2-3.3 3.4v1.7H4.6v2.6h2.4v4.8z',
        owner: 'Platform', grant: 'Draft only', state: 'Connected', cadence: 3,
        items: [
          { day: 2, kind: 'post', label: 'Cross-post', state: 'Sent' },
          { day: 4, kind: 'post', label: 'Cross-post', state: 'Drafted' }
        ] },
      { id: 'yt', name: 'YouTube', handle: 'Channel', glyph: 'M2 5.4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5.2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M6.8 6.2l3 1.8-3 1.8z',
        owner: 'Platform', grant: '\u2014', state: 'Not connected', cadence: 0, items: [] },
      { id: 'tt', name: 'TikTok', handle: '\u2014', glyph: 'M9.4 2.4v6.8a2.4 2.4 0 1 1-2.4-2.4 M9.4 4.6a3.2 3.2 0 0 0 3.2 2.4',
        owner: '\u2014', grant: '\u2014', state: 'Not connected', cadence: 0, items: [] }
    ],
    marks: {
      post:  { label: 'Post', note: 'A point in time' },
      reply: { label: 'Reply', note: 'She answered a mention' },
      story: { label: 'Story', note: 'Expires on its own' },
      ad:    { label: 'Ad flight', note: 'A duration, and money' }
    }
  };


  // A post is an object, not a schedule entry. The panel shows it as it would render, then
  // its terms. Performance is where its numbers are read — a composer that also reports is
  // two surfaces wearing one header.
  P.POSTS = {
    'li:2': { acct: 'li', kind: 'post', label: 'Marketplace open', state: 'Drafted', when: 'Fri 22 \u00b7 09:00',
      author: 'PAIGE \u00b7 drafted, held for your word',
      body: 'The marketplace is open. Five kinds of thing ship there \u2014 a skill she runs, an automation, an integration, a template, or a whole agent. Every listing declares the authority it needs before it installs.',
      media: 'One image \u2014 not attached',
      terms: [['Channel', 'LinkedIn \u00b7 @platform'], ['Her grant here', 'Ask first'], ['State', 'Drafted'], ['Goes out', 'Fri 22 \u00b7 09:00'], ['Audience', 'Followers \u2014 no segment bound']],
      why: 'She wrote this from the marketplace opening. It will not go out until you say so, because ask first is her grant on this channel.' },
    'li:3': { acct: 'li', kind: 'ad', label: 'Operator awareness', state: 'Held', when: 'Tue 19 \u2192 Fri 22',
      author: 'PAIGE \u00b7 built, waiting on money authority',
      body: 'Run everything from one command layer. PAIGE reads the whole fleet overnight and hands you one page before your first call.',
      media: 'Two creatives \u2014 not attached',
      terms: [['Channel', 'LinkedIn \u00b7 @platform'], ['Flight', 'Tue 19 \u2192 Fri 22 \u00b7 4 days'], ['Daily budget', '\u2014'], ['Total spend', '\u2014'], ['Objective', 'Reach \u2014 operators'], ['Her grant here', 'Ask first']],
      why: 'An ad spends money, so it is an authority gate rather than a schedule entry. She may build it and may not start it \u2014 and no budget can be set until the money spine can hold one.' },
    'x:3': { acct: 'x', kind: 'post', label: 'Weekly read', state: 'Drafted', when: 'Fri 22 \u00b7 16:30',
      author: 'PAIGE \u00b7 drafted, held for your word',
      body: 'Six destinations, one dial. Everything she may do sits under a ceiling you set \u2014 lower it and every capability follows, including the ones you forgot were on.',
      media: '\u2014',
      terms: [['Channel', 'X \u00b7 @platform'], ['Her grant here', 'Ask first'], ['State', 'Drafted'], ['Goes out', 'Fri 22 \u00b7 16:30'], ['Thread', 'Single post']],
      why: 'Drafted from this week\u2019s changes. She holds it because ask first is her grant here.' },
    'ig:1': { acct: 'ig', kind: 'post', label: 'Carousel', state: 'Drafted', when: 'Fri 22 \u00b7 12:00',
      author: 'PAIGE \u00b7 drafted, cannot send',
      body: 'What she did overnight, in four cards.',
      media: 'Four cards \u2014 not attached',
      terms: [['Channel', 'Instagram \u00b7 @platform'], ['Her grant here', 'Draft only'], ['State', 'Drafted'], ['Goes out', 'Fri 22 \u00b7 12:00'], ['Audience', 'Followers']],
      why: 'Draft only is her grant on this channel, so she composes and you publish. Raising the ceiling will not change that \u2014 the grant is set per channel in Integrations.' }
  };


  // Vibe Studio. The creative half of Campaigns: what gets built, where it is deployed, and
  // what a live thing is wired to. An artifact is not finished when it looks right \u2014 it is
  // finished when it files somewhere. So every deployed artifact declares its wiring.
  // Vibe Studio. Grounded in the shipped sub-app at /admin/studio/* \u2014 StudioLayout with a
  // persistent left rail, StudioHome (gallery), StudioNew, StudioLibrary, and the VibeStudio
  // builder at :sessionId. It is immersive by design: full-viewport, overflow-hidden. So the
  // shell does not host it in a panel \u2014 the door hands off, and this surface is the
  // transition: what you can resume, and what came out of it.
  //
  // Tier: owner-locked \u2014 growth + studio = Solo \u00b7 Sub-account \u00b7 Enterprise \u00b7 Super Admin.
  // Agency is EXCLUDED entirely, with no resell (docs/doctrine/tier-matrix.md \u00a761).
  P.STUDIO = {
    route: '/admin/studio',
    doors: [
      { id: 'home', label: 'Gallery', route: '/admin/studio', note: 'Everything built, newest first' },
      { id: 'new', label: 'New session', route: '/admin/studio/new', note: 'One session, one thing built' },
      { id: 'library', label: 'Library', route: '/admin/studio/library', note: 'Saved and reusable' }
    ],
    sessions: [
      { id: 'a1', name: 'Operator landing page', artifact: 'Page', state: 'Deployed', touched: '2h ago',
        wiring: [['Files into', 'Pipeline \u00b7 Discovery'], ['Publishes to', '2 channels'], ['Read in', 'Performance']],
        note: 'Live and wired end to end: a submission files into Discovery, the announcement posts to two channels, and the numbers read in Performance.' },
      { id: 'a2', name: 'Reseller funnel', artifact: 'Funnel', state: 'Preview', touched: 'yesterday',
        wiring: [['Files into', 'Pipeline \u00b7 Qualified'], ['Publishes to', '\u2014'], ['Read in', '\u2014']],
        note: 'Four steps, previewable. Not deployed, so nothing can reach it and nothing files yet.' },
      { id: 'a3', name: 'Platform site', artifact: 'Page', state: 'Deployed', touched: '4d ago',
        wiring: [['Files into', '\u2014'], ['Publishes to', '\u2014'], ['Read in', 'Performance']],
        note: 'Deployed and unwired \u2014 it collects nothing and files nowhere. A site with no destination is a brochure.' },
      { id: 'a4', name: 'Marketplace launch copy', artifact: 'Copy', state: 'Draft', touched: '20m ago',
        wiring: [['Used by', '3 posts \u00b7 1 ad'], ['Publishes to', 'LinkedIn, X'], ['Read in', '\u2014']],
        note: 'Copy she drafted for the marketplace opening. Three posts and one ad reference it, and none has gone out.' },
      { id: 'a5', name: 'Solo onboarding form', artifact: 'Form', state: 'Draft', touched: '3d ago',
        wiring: [['Files into', '\u2014'], ['Publishes to', '\u2014'], ['Read in', '\u2014']],
        note: 'Started and abandoned. Two fields, no destination.' }
    ]
  };


  // Calendar settings. The calendar had no configuration surface at all \u2014 working hours,
  // protected focus and quiet hours are rules about when she may act, so they belong beside
  // the calendar rather than buried in Settings. The connection stays in Integrations.


  // A calendar is the container a booking type lives in: an owner, a purpose, a source.
  // Creating one is the first step \u2014 the rules, types and hosts are configured per calendar.

  // An alert is three things: a rule that fires, someone it reaches, and a channel it
  // arrives on. Only the first exists today \u2014 A1 (schema) and A2 (the five-minute sweep)
  // evaluate rules and write firings; A3 (delivery) has never been built, and there has
  // never been a recipient model at all. That is why nothing arrives.

  P.CAL_TYPES = [
    { id: 'personal', name: 'Personal', note: 'One person\u2019s time',
      does: 'Direct bookings with you. One host, so there is nothing to assign.',
      on: ['Working hours', 'Protected focus', 'Reminders', 'After it happens'],
      off: ['Assignment strategy \u2014 there is only one host', 'Capacity \u2014 every booking is 1:1'] },
    { id: 'pool', name: 'Shared pool', note: 'Several hosts, one queue',
      does: 'Anyone in the pool can take it. This is the type that needs an assignment strategy.',
      on: ['Assignment strategy', 'Hosts', 'Reminders', 'After it happens'],
      off: ['Capacity \u2014 still one attendee per booking'] },
    { id: 'rota', name: 'Coverage rota', note: 'Whoever is on shift',
      does: 'Bookings go to whoever is covering that window. Shifts decide who is eligible before the strategy picks.',
      on: ['Shifts', 'Assignment strategy \u2014 limited to who is on', 'Hosts', 'Reminders'],
      off: ['Capacity', 'Protected focus \u2014 the shift is the boundary'] },
    { id: 'events', name: 'Events', note: 'Many people, one slot',
      does: 'Group sessions and anything live. Capacity and registration matter; assignment does not.',
      on: ['Capacity', 'Registration', 'Reminders', 'Recording and replay'],
      off: ['Assignment strategy \u2014 the host is fixed'] },
    { id: 'resource', name: 'Resource', note: 'A room or a thing',
      does: 'A bookable object rather than a person. It has availability and no hosts at all.',
      on: ['Working hours', 'Capacity \u2014 one booking at a time', 'Reminders'],
      off: ['Hosts \u2014 a resource is not a person', 'Assignment strategy', 'After it happens'] }
  ];

  P.ALERT_SCOPES = [
    { id: 'fleet', name: 'Fleet', note: 'Tenants, provisioning, drift' },
    { id: 'calendar', name: 'Calendar', note: 'Bookings, no-shows, conflicts' },
    { id: 'convo', name: 'Conversations', note: 'Threads, calls, unanswered' },
    { id: 'campaigns', name: 'Campaigns', note: 'Sends, halts, stalled deals' },
    { id: 'platform', name: 'Platform', note: 'Health, authority, spend' }
  ];

  P.ALERT_RULES = [
    { id: 'ar1', scope: 'platform', name: 'A blocking check fails', when: 'Systems check writes a blocking failure',
      sev: 'Critical', to: ['t1'], via: ['In-app', 'Email'], esc: 'After 15 min, everyone on the account',
      state: 'Firing \u00b7 undelivered', fired: '13:47', substrate: 'Rule live \u00b7 delivery unbuilt' },
    { id: 'ar2', scope: 'fleet', name: 'A tenant is stuck before first run', when: 'Provisioning queue holds a tenant over 24h',
      sev: 'Warning', to: ['t1', 't3'], via: ['In-app'], esc: 'None',
      state: 'Armed', fired: '\u2014', substrate: 'Rule live \u00b7 delivery unbuilt' },
    { id: 'ar3', scope: 'fleet', name: 'Drift becomes unreadable', when: 'The migration reader throws',
      sev: 'Notice', to: ['t1'], via: ['In-app'], esc: 'None',
      state: 'Armed', fired: '06:31', substrate: 'Rule live \u00b7 delivery unbuilt' },
    { id: 'ar4', scope: 'calendar', name: 'Somebody does not show', when: 'A booking passes its end with no attendance',
      sev: 'Warning', to: [], via: [], esc: 'None',
      state: 'No recipient', fired: '\u2014', substrate: 'No attendance record exists' },
    { id: 'ar5', scope: 'calendar', name: 'Two bookings collide', when: 'A host is double-booked across calendars',
      sev: 'Warning', to: ['t3'], via: ['In-app', 'SMS'], esc: 'None',
      state: 'Armed', fired: '\u2014', substrate: 'Needs a connected calendar source' },
    { id: 'ar6', scope: 'convo', name: 'A thread goes unanswered', when: 'An inbound thread sits over 4h in working hours',
      sev: 'Warning', to: ['t3'], via: ['In-app', 'Email'], esc: 'After 8h, the operator seat',
      state: 'Armed', fired: '\u2014', substrate: 'Rule live \u00b7 delivery unbuilt' },
    { id: 'ar7', scope: 'campaigns', name: 'A campaign halts itself', when: 'A motion stops on a failed step',
      sev: 'Critical', to: ['t1', 't2'], via: ['In-app', 'Email'], esc: 'After 15 min, everyone on the account',
      state: 'Armed', fired: '\u2014', substrate: 'Rule live \u00b7 delivery unbuilt' }
  ];

  // The recipient model. A seat can be assigned alerts; whether it may assign them to
  // others is a property of the role, not of the alert.
  P.SEATS = [
    { id: 't1', name: 'Operator seat', role: 'super_admin', scope: 'Every tenant finding', assigns: true },
    { id: 't2', name: 'Operator seat', role: 'super_admin', scope: 'Every tenant finding', assigns: true },
    { id: 't3', name: 'Operator seat', role: 'platform_admin', scope: 'Operator findings only', assigns: true },
    { id: 't4', name: 'Service role', role: 'service', scope: 'Headless \u00b7 bypasses RLS', assigns: false }
  ];

  P.ALERT_CHANNELS = [
    { name: 'In-app', sub: 'Live \u2014 the rail and the wire' },
    { name: 'Email', sub: 'Seam exists, alert routing unbuilt' },
    { name: 'SMS', sub: 'Seam exists, alert routing unbuilt' },
    { name: 'Voice', sub: 'No substrate at all' }
  ];


  // The fleet is a tree, not a list: an agency holds sub-accounts, and entering the parent
  // is a different act from entering a child. Eight live \u2014 1 agency + 4 sub-accounts +
  // 3 standalone \u2014 which is what the composition bar counts.

  // Run history. The evaluator runs every five minutes, so a list of four rows is a lie
  // about volume — thirty-six runs is what a three-hour window actually holds. The strip
  // carries the cadence; the list carries the ones worth opening.
  P.RUNS = (function () {
    // 36 five-minute slots ending 14:02, plus the two full sweeps that bracket them.
    // Minutes-since-midnight so the clock never goes negative past the hour.
    const base = 14 * 60 + 2;
    const fired = [3, 14, 26];
    const out = [];
    for (let i = 0; i < 36; i++) {
      const mins = base - i * 5;
      const t = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
      const f = fired.indexOf(i) >= 0;
      out.push({ t, kind: 'Scheduled', firings: f ? 1 : 0,
        dur: (1.6 + (i % 5) * 0.3).toFixed(1) + 's', outcome: f ? 'Firing' : 'Clean' });
    }
    out[0] = { t: '14:02', kind: 'Full sweep', firings: 0, dur: '48s', outcome: 'Complete', checks: '4 pass \u00b7 1 skip \u00b7 5 unrun' };
    out[1] = { t: '13:57', kind: 'Scheduled', firings: 0, dur: '\u2014', outcome: 'In flight' };
    out[7] = { t: '13:27', kind: 'Full sweep', firings: 0, dur: '52s', outcome: 'Complete', checks: '4 pass \u00b7 1 skip \u00b7 5 unrun' };
    return out;
  })();


  // The platform record is an identity, not a settings list: it says what the operator IS
  // before what it can do. So the surface renders the brand rather than describing it.
  P.PLATFORM = {
    legal: 'PAIGE AGENT AI',
    tenant: 'operator \u00b7 tenant_id IS NULL',
    region: 'us-east \u00b7 single region',
    since: 'Operating since 2026',
    swatches: [
      ['Champagne', 'var(--pg-gold)', 'the act'],
      ['Bronze', 'var(--pg-gold-deep)', 'held for your word'],
      ['Violet', 'var(--pg-violet)', 'she is working'],
      ['Amber', 'var(--pg-warning)', 'attention'],
      ['Red', 'var(--pg-negative)', 'blocking'],
      ['Green', 'var(--pg-positive)', 'nominal']
    ],
    scales: [40, 26, 17, 12],
    domains: [
      { host: 'app.paige.example', role: 'The shell', tls: 'Valid \u00b7 renews in 61d', dns: 'Resolving', state: 'Live' },
      { host: 'paige.example', role: 'Marketing \u2014 frozen by ruling', tls: 'Valid \u00b7 renews in 61d', dns: 'Resolving', state: 'Live' },
      { host: '\u2014 no tenant subdomains', role: 'A tenant reaches the shell on the app host', tls: '\u2014', dns: '\u2014', state: 'By design' }
    ],
    inherit: [
      ['Brand', 'Resolves down through parent_tenant_id', 'Inherits'],
      ['Domains', 'One app host for every tenant', 'Shared'],
      ['Authority', 'Never inherits, in either direction', 'Never'],
      ['Trust Compass', 'Each tenant sets its own ceiling', 'Never']
    ],
    owed: [
      { name: 'Platform billing', why: 'The money spine is deferred by owner ruling, so the platform has no plan, no invoices and no take.', state: 'Deferred' },
      { name: 'Notifications', why: 'Alert rules evaluate and nothing is delivered. In-app is the only channel that works.', state: 'Surface owed' }
    ]
  };


  // The canonical six, grounded in docs/doctrine/tier-matrix.md. Closed set \u2014 extended
  // only by owner ruling. One palette, used here and in Fleet's composition bar, so a tier
  // colour means the same thing wherever it appears.

  // Integrations. Named vendors, not category names \u2014 "email and messaging" is a shelf,
  // Resend and Twilio are the things you connect. State is grounded: live = a seam exists in
  // supabase/functions today; stub = the adapter is written and waiting on credentials;
  // planned = nothing built. Connection type decides what the panel asks you for.
  P.INT_KINDS = {
    OAuth:   { note: 'You sign in at the vendor and grant scopes', glyph: 'M6.4 8.6a3.4 3.4 0 0 1 4.8-4.8l1.4 1.4 M9.6 7.4a3.4 3.4 0 0 1-4.8 4.8L3.4 10.8' },
    Key:     { note: 'A secret you paste, stored encrypted', glyph: 'M10.4 2.6a3 3 0 1 1-2.6 4.6L3 12v1.4h1.6l.6-1.4h1.4v-1.4h1.4l1.2-1.2a3 3 0 0 1 3.2-4.6' },
    Webhook: { note: 'They call us on a URL we mint', glyph: 'M4.6 9.4a3 3 0 1 0 3 3 M8 6.4l2.4 4.2 M11.4 6a3 3 0 1 0-3.4-1.4' },
    MCP:     { note: 'A tool server she can call directly', glyph: 'M3 5.4h10v5.2H3z M5.4 5.4V3.4 M10.6 5.4V3.4 M5.4 12.6v-2 M10.6 12.6v-2' },
    SMTP:    { note: 'Host, port and a mailbox password', glyph: 'M2.4 4.6h11.2v6.8H2.4z M2.4 4.6L8 9l5.6-4.4' },
    CalDAV:  { note: 'A calendar URL and an app password', glyph: 'M2.6 4h10.8v9.4H2.6z M2.6 6.8h10.8 M5.6 4V2.4 M10.4 4V2.4' }
  };

  P.INTEGRATIONS = [
    { cat: 'Email and messaging', items: [
      { name: 'Resend', kind: 'Key', state: 'live', does: 'Transactional and campaign email', note: 'The platform email adapter' },
      { name: 'Gmail', kind: 'OAuth', state: 'live', does: 'Send and read from a real mailbox', note: 'Its own seam, not a second email adapter' },
      { name: 'Twilio SMS', kind: 'Key', state: 'live', does: 'Outbound and inbound text', note: 'API-key trio \u00b7 A2P messaging service' },
      { name: 'Twilio Voice', kind: 'Key', state: 'stub', does: 'Place and receive calls', note: 'Webhook still on the Twilio demo URL', blocks: 'The call surface in Conversations' },
      { name: 'Microsoft Outlook', kind: 'OAuth', state: 'planned', does: 'Mail for Microsoft accounts', note: '' },
      { name: 'Slack', kind: 'OAuth', state: 'planned', does: 'Notify a channel, take a reply', note: '' },
      { name: 'WhatsApp Business', kind: 'Key', state: 'planned', does: 'Messaging where clients already are', note: 'Runs through Twilio or Meta' },
      { name: 'Postmark', kind: 'Key', state: 'planned', does: 'Alternative transactional email', note: '' },
      { name: 'Generic SMTP', kind: 'SMTP', state: 'planned', does: 'Any mailbox that speaks SMTP', note: '' }
    ]},
    { cat: 'Calendar and scheduling', items: [
      { name: 'Google Calendar', kind: 'OAuth', state: 'live', does: 'Read and write events', note: 'Refresh tokens encrypted at rest' },
      { name: 'Microsoft 365 Calendar', kind: 'OAuth', state: 'planned', does: 'Events for Microsoft accounts', note: '', blocks: 'Calendars for Microsoft users' },
      { name: 'Apple Calendar', kind: 'CalDAV', state: 'stub', does: 'Events over CalDAV', note: 'App-password path exists, unwired', blocks: 'Calendars for Apple users' },
      { name: 'Fastmail', kind: 'CalDAV', state: 'planned', does: 'Events over CalDAV', note: '' },
      { name: 'Calendly', kind: 'OAuth', state: 'planned', does: 'Import bookings taken elsewhere', note: '' },
      { name: 'Cal.com', kind: 'OAuth', state: 'planned', does: 'Open-source booking', note: '' }
    ]},
    { cat: 'Models and voice', items: [
      { name: 'Anthropic', kind: 'Key', state: 'live', does: 'The model she thinks with', note: 'Replaced the Lovable gateway' },
      { name: 'OpenAI', kind: 'Key', state: 'planned', does: 'Alternative or fallback model', note: 'Routing lives in Settings \u00b7 Mind' },
      { name: 'Google Gemini', kind: 'Key', state: 'planned', does: 'Alternative model', note: '' },
      { name: 'ElevenLabs', kind: 'Key', state: 'planned', does: 'Her voice, spoken', note: '', blocks: 'Her speaking on a call' },
      { name: 'Deepgram', kind: 'Key', state: 'planned', does: 'Transcribe a call as it happens', note: '', blocks: 'Live notes while she listens' }
    ]},
    { cat: 'Automation and tools', items: [
      { name: 'n8n', kind: 'Webhook', state: 'stub', does: 'Run a self-hosted workflow', note: 'Action kinds already modelled', blocks: 'Handing a step outside the platform' },
      { name: 'Zapier', kind: 'Webhook', state: 'planned', does: 'Reach six thousand apps', note: '' },
      { name: 'Make', kind: 'Webhook', state: 'planned', does: 'Visual multi-step scenarios', note: '' },
      { name: 'Outbound webhooks', kind: 'Webhook', state: 'planned', does: 'Post an event anywhere', note: '' },
      { name: 'PAIGE MCP server', kind: 'MCP', state: 'live', does: 'Exposes her tools to a client', note: 'Operator tools are god-locked' },
      { name: 'Claude Desktop', kind: 'MCP', state: 'planned', does: 'Drive the platform from Claude', note: '' },
      { name: 'Custom MCP server', kind: 'MCP', state: 'planned', does: 'Bring a tool server of your own', note: '' }
    ]},
    { cat: 'Money', items: [
      { name: 'Stripe', kind: 'Key', state: 'planned', does: 'Subscriptions and invoices', note: 'Money spine deferred by ruling', blocks: 'Every money figure on the platform' },
      { name: 'Stripe Connect', kind: 'OAuth', state: 'planned', does: 'Pay marketplace publishers', note: '', blocks: 'The marketplace revenue split' },
      { name: 'QuickBooks', kind: 'OAuth', state: 'planned', does: 'Push invoices to the books', note: '' },
      { name: 'Xero', kind: 'OAuth', state: 'planned', does: 'Push invoices to the books', note: '' }
    ]},
    { cat: 'Records and data', items: [
      { name: 'HubSpot', kind: 'OAuth', state: 'planned', does: 'Two-way contact and deal sync', note: '' },
      { name: 'Salesforce', kind: 'OAuth', state: 'planned', does: 'Two-way contact and deal sync', note: '' },
      { name: 'Dun & Bradstreet', kind: 'OAuth', state: 'stub', does: 'Verify a business is real', note: 'Adapter written, waiting on credentials', blocks: 'Business verification on a client record' },
      { name: 'Apollo', kind: 'Key', state: 'planned', does: 'Enrich a thin record', note: '' }
    ]},
    { cat: 'Files and signing', items: [
      { name: 'Google Drive', kind: 'OAuth', state: 'planned', does: 'Read and file documents', note: '' },
      { name: 'Dropbox', kind: 'OAuth', state: 'planned', does: 'Read and file documents', note: '' },
      { name: 'DocuSign', kind: 'OAuth', state: 'planned', does: 'Send an agreement for signature', note: '' }
    ]},
    { cat: 'Social', items: [
      { name: 'LinkedIn', kind: 'OAuth', state: 'planned', does: 'Publish, and take DMs', note: '', blocks: 'Social publishing and DM threads' },
      { name: 'Meta', kind: 'OAuth', state: 'planned', does: 'Instagram and Facebook Pages', note: 'One grant, two surfaces', blocks: 'Two of the five social channels' },
      { name: 'X', kind: 'OAuth', state: 'planned', does: 'Publish, and take DMs', note: '', blocks: 'Social publishing and DM threads' },
      { name: 'Google Business Profile', kind: 'OAuth', state: 'planned', does: 'Posts and reviews', note: '', blocks: 'Review monitoring' }
    ]}
  ];


  // Per-vendor detail. Only vendors with something real to say carry an entry; the rest fall
  // back to a shape built from the catalogue row.
  P.INT_DETAIL = {
    'Twilio SMS': {
      pitch: 'Text from a number the tenant owns, with delivery receipts coming back on a webhook.',
      auth: [['Auth', 'API key trio \u2014 SID, key SID, key secret'], ['Stored', 'Encrypted, never in the client'], ['From', 'Resolved per tenant, not a platform default'], ['Inbound', 'Signature-validated on every POST']],
      scopes: [['Send a message', 'ok'], ['Read delivery status', 'ok'], ['Receive inbound', 'ok'], ['Buy a number', 'ok'], ['Register a campaign', 'gap']],
      grant: 'Ask first',
      does: ['Sends through the platform messaging service', 'Writes a delivery receipt against the thread', 'Routes an inbound message to the right relationship'],
      tabs: ['Connection', 'Numbers', 'A2P', 'Activity']
    },
    'Twilio Voice': {
      pitch: 'Place and receive calls, with her on the line taking notes.',
      auth: [['Auth', 'Same account as SMS \u2014 one home'], ['Voice webhook', 'Still the Twilio demo URL'], ['Recording', 'Not configured'], ['Transcription', 'Needs Deepgram or equivalent']],
      scopes: [['Place a call', 'gap'], ['Receive a call', 'gap'], ['Record', 'gap'], ['Transcribe live', 'gap']],
      grant: 'Ask first',
      does: ['Dials from a number the tenant owns', 'Hands you the live call with her listening', 'Files the note against the relationship'],
      tabs: ['Connection', 'Numbers', 'Activity']
    },
    Gmail: {
      pitch: 'Send and read from a real mailbox, so a reply lands where the client expects.',
      auth: [['Auth', 'OAuth 2.0, per mailbox'], ['Refresh', 'Encrypted at rest'], ['Scope', 'gmail.send, gmail.readonly'], ['Revoke', 'At Google, or here']],
      scopes: [['Send as the user', 'ok'], ['Read the thread', 'ok'], ['Modify labels', 'gap'], ['Full mailbox delete', 'no']],
      grant: 'Ask first',
      does: ['Sends from the connected mailbox, not a platform address', 'Reads a thread so she has the history', 'Never deletes anything'],
      tabs: ['Connection', 'Scopes', 'Activity']
    },
    n8n: {
      pitch: 'Hand a step to a self-hosted workflow and take the result back.',
      auth: [['Auth', 'Signed webhook, shared secret'], ['Direction', 'Both \u2014 we call out, it calls back'], ['Retries', 'Not configured'], ['Idempotency', 'Not implemented']],
      scopes: [['Call a workflow', 'gap'], ['Receive a callback', 'gap'], ['Read the run result', 'gap']],
      grant: 'Draft only',
      does: ['Posts an action to a workflow URL', 'Waits for a signed callback', 'Files the result as an action outcome'],
      tabs: ['Connection', 'Workflows', 'Activity']
    },
    'PAIGE MCP server': {
      pitch: 'Exposes her tools to any MCP client, with the operator tools locked to us.',
      auth: [['Auth', 'Bearer, scoped to a tier'], ['Transport', 'HTTP'], ['Tool scope', 'Resolved from the caller\u2019s tier'], ['Operator tools', 'Super Admin only']],
      scopes: [['Read platform state', 'ok'], ['Run a systems check', 'ok'], ['Write a rule', 'gap'], ['Act on a tenant', 'gap']],
      grant: 'Observe',
      does: ['Answers tool calls from an MCP client', 'Resolves tool scope from the caller\u2019s tier', 'Refuses an operator tool to a tenant caller'],
      tabs: ['Connection', 'Tools', 'Activity']
    },
    Anthropic: {
      pitch: 'The model she thinks with. Routing and fallback are configured in Mind.',
      auth: [['Auth', 'API key'], ['Stored', 'Platform secret, never per tenant'], ['Model', 'Set in Settings \u00b7 Mind'], ['Fallback', 'None configured']],
      scopes: [['Compose a reply', 'ok'], ['Call a tool', 'ok'], ['Read an attachment', 'ok'], ['Run code', 'no']],
      grant: 'Autonomous',
      does: ['Composes everything she says', 'Calls her tools', 'Cannot execute code — no runtime exists'],
      tabs: ['Connection', 'Scopes', 'Activity']
    }
  };

  // Numbers, and the split the owner named: buying is account setup, using is work. A number
  // is bought here and spent in Conversations, and a tenant with no number cannot call.
  P.PHONE_NUMBERS = [
    { num: '+1 ··· ··· 0142', label: 'Platform main', tenant: 'Platform', caps: 'Voice · SMS', a2p: 'Registered', state: 'Active', src: 'Ours \u2014 resold' },
    { num: '+1 ··· ··· 0198', label: 'Support line', tenant: 'AUTHORIZED TENANT · 0f3a', caps: 'Voice · SMS', a2p: 'Registered', state: 'Active', src: 'Ours \u2014 resold' },
    { num: '+1 ··· ··· 0233', label: 'Agency outbound', tenant: 'AUTHORIZED TENANT · agency', caps: 'SMS', a2p: 'Pending', state: 'Active', src: 'Ours \u2014 resold' },
    { num: '+1 ··· ··· 0471', label: 'Their own number', tenant: 'AUTHORIZED TENANT · 4e21', caps: 'Voice · SMS', a2p: 'Registered', state: 'Active', src: 'Theirs \u2014 own account' }
  ];

  P.A2P_STEPS = [
    { step: 'Business profile', note: 'Legal name, EIN, address \u2014 read from the client record', state: 'ok' },
    { step: 'Brand registration', note: 'Submitted to the carrier registry', state: 'ok' },
    { step: 'Campaign use case', note: 'What the messages are for, with samples', state: 'wait' },
    { step: 'Carrier vetting', note: 'Out of our hands \u2014 days, not minutes', state: 'wait' },
    { step: 'Messaging service link', note: 'The number joins the approved service', state: 'gap' }
  ];

  P.TIERS = [
    { n: 1, key: 'God', label: 'Super Admin', tone: 'var(--pg-gold-core)', shipped: false, live: null,
      id: 'Platform operator \u2014 us. Owns and sees everything, with no home tenant.',
      resolve: 'No home tenant. Reaches any tenant by act-as, which sets active_tenant_id and is audited.',
      home: '/operator/*' },
    { n: 2, key: 'Agency', label: 'Agency', tone: '#7C6CE0', shipped: true, live: 1,
      id: 'Parent tenant that owns sub-accounts. Its own book plus its children.',
      resolve: 'active_tenant_id, entitled by agency_can_manage_child or agency_team_role \u2014 so its active tenant may be a child.',
      home: '/agency/*' },
    { n: 3, key: 'Standalone', label: 'Standalone', tone: '#3F7F5C', shipped: true, live: 3,
      id: 'Operator running their own business. No agency parent, own book only.',
      resolve: 'active_tenant_id entitled by active membership, else the first membership row by joined_at.',
      home: '/solo/*' },
    { n: 4, key: 'Sub-account', label: 'Sub-account', tone: '#2F6B8F', shipped: true, live: 4,
      id: 'Child tenant under an agency. Own book only, isolated from the parent roll-up.',
      resolve: 'Resolves like a standalone for its own members. Brand inherits downward; authority never upward.',
      home: '/solo/*' },
    { n: 5, key: 'Client', label: 'Client', tone: 'var(--pg-line-strong)', shipped: false, live: null,
      id: 'End consumer under a tenant. Their own portal only.',
      resolve: 'Not the tenant resolver at all \u2014 clients.linked_user_id, via get_paige_persona_context.',
      home: '/portal/*' },
    { n: 6, key: 'Anonymous', label: 'Anonymous', tone: 'var(--pg-line-strong)', shipped: false, live: null,
      id: 'Unauthenticated public. Public surfaces only, no auth.uid().',
      resolve: 'None. Every resolver returns NULL, so there is no tenant to resolve.',
      home: 'Public routes' }
  ];

  // Owner-locked feature cells. yes = uses it · resell = sells it to its children without
  // using it · no = excluded · n/a = the tier has no analogue for it.
  P.TIER_FEATURES = [
    { key: 'fleet_console', label: 'Fleet console', note: 'God only',
      cells: { God: 'yes', Agency: 'no', Standalone: 'no', 'Sub-account': 'no', Client: 'no', Anonymous: 'no' } },
    { key: 'subaccount_management', label: 'Sub-account management', note: 'Agency, and Enterprise when it exists',
      cells: { God: 'yes', Agency: 'yes', Standalone: 'no', 'Sub-account': 'no', Client: 'no', Anonymous: 'no' } },
    { key: 'growth', label: 'Campaigns and Studio', note: 'Agency excluded entirely \u2014 no resell',
      cells: { God: 'yes', Agency: 'no', Standalone: 'yes', 'Sub-account': 'yes', Client: 'no', Anonymous: 'no' } },
    { key: 'customer_portal_invite', label: 'Client portal invite', note: 'Needs a consumer client book',
      cells: { God: 'no', Agency: 'no', Standalone: 'yes', 'Sub-account': 'yes', Client: 'no', Anonymous: 'no' } },
    { key: 'skills', label: 'Skills library', note: 'Follows the default \u2014 no exception',
      cells: { God: 'yes', Agency: 'resell', Standalone: 'yes', 'Sub-account': 'yes', Client: 'no', Anonymous: 'no' } },
    { key: 'platform_alerting', label: 'Platform alerting', note: 'Watches the platform, so it is our book',
      cells: { God: 'yes', Agency: 'no', Standalone: 'no', 'Sub-account': 'no', Client: 'no', Anonymous: 'no' } }
  ];

  P.FLEET = [
    { id: 'agency', name: 'AUTHORIZED TENANT \u00b7 agency', kind: 'Agency', seats: 0, grade: 'Nominal',
      note: 'Parent of 4 \u00b7 resells to its own book', children: [
        { id: '7c11', name: 'AUTHORIZED TENANT \u00b7 7c11', kind: 'Sub-account', seats: 0, grade: 'At risk', note: 'No active seats since 2 Aug' },
        { id: 'b204', name: 'AUTHORIZED TENANT \u00b7 b204', kind: 'Sub-account', seats: 3, grade: 'At risk', note: 'Config drift cannot be read' },
        { id: '9d17', name: 'AUTHORIZED TENANT \u00b7 9d17', kind: 'Sub-account', seats: 6, grade: 'Nominal', note: '' },
        { id: 'c840', name: 'AUTHORIZED TENANT \u00b7 c840', kind: 'Sub-account', seats: 5, grade: 'Nominal', note: '' }
      ] },
    { id: '0f3a', name: 'AUTHORIZED TENANT \u00b7 0f3a', kind: 'Standalone', seats: 12, grade: 'Nominal', note: 'Largest by seats', children: [] },
    { id: '4e21', name: 'AUTHORIZED TENANT \u00b7 4e21', kind: 'Standalone', seats: 7, grade: 'Nominal', note: '', children: [] },
    { id: '1b88', name: 'AUTHORIZED TENANT \u00b7 1b88', kind: 'Standalone', seats: 2, grade: 'Nominal', note: '', children: [] }
  ];

  P.FLEET_INTERNAL = [
    { id: 'i1', name: 'DESIGN FIXTURE \u00b7 internal', kind: 'Internal', seats: 0, grade: 'Internal', note: 'Platform test account', children: [] },
    { id: 'i2', name: 'DESIGN FIXTURE \u00b7 seed', kind: 'Internal', seats: 0, grade: 'Internal', note: 'Migration seed', children: [] },
    { id: 'i3', name: 'DESIGN FIXTURE \u00b7 e2e', kind: 'Internal', seats: 0, grade: 'Internal', note: 'End-to-end suite', children: [] },
    { id: 'i4', name: 'DESIGN FIXTURE \u00b7 perf', kind: 'Internal', seats: 0, grade: 'Internal', note: 'Load harness', children: [] }
  ];


  // The Mind. Five regions, because memory is not one thing: what happened, what is true,
  // what she can do, who people are, and what you have ruled. Every tier writes here —
  // this is the platform brain, and a tenant's brain is the same object at its own scope.
  // Every input that writes to the substrate, grouped by the region it lands in. This is
  // the honest catalogue: 24 inputs, and eight of them have no seam behind them yet.

  // Grounded in how a cortex actually runs. Six transmitters, each doing the job it does
  // in a real brain, mapped to what she is doing when it fires.

  // Interpretability, the way Anthropic's work frames it: what a model holds is not one
  // memory per neuron. A FEATURE is a direction distributed across many neurons, and one
  // neuron takes part in many features \u2014 superposition. So lighting a feature lights a
  // scatter across every region, not a spot. That is the honest picture of a substrate.
  P.FEATURES = [
    { id:'f1', name:'Reseller pricing', n:214, regions:[1,4,0], act:0.82,
      why:'Fires on margin questions, reseller terms, and the ruling that legal signs off first.' },
    { id:'f2', name:'Authority gate', n:341, regions:[4,2,0], act:0.91,
      why:'Fires whenever an act needs your word. Steering this down is what the ceiling does.' },
    { id:'f3', name:'Tenant at risk', n:178, regions:[0,3,1], act:0.64,
      why:'Seat count, support load and drift, bound into one direction.' },
    { id:'f4', name:'Who this person is', n:402, regions:[3,1], act:0.77,
      why:'Name, company, face and history \u2014 one identity across four kinds of record.' },
    { id:'f5', name:'You corrected me', n:96, regions:[4], act:0.55,
      why:'Every refusal and correction. Small, and the most heavily weighted thing here.' },
    { id:'f6', name:'Quiet hours', n:63, regions:[4,2], act:0.38,
      why:'A time boundary that suppresses outbound. Inhibitory by nature.' },
    { id:'f7', name:'This is a template', n:127, regions:[2,1], act:0.44,
      why:'What makes something reusable rather than one-off.' },
    { id:'f8', name:'Nothing to read from', n:88, regions:[1,0], act:0.71,
      why:'The absence itself is learned \u2014 she knows which surfaces have no substrate.' }
  ];

  P.NEUROTRANSMITTERS = [
    { id:'glu', name:'Glutamate', tone:'#e8d3a6', role:'Excitatory \u2014 the signal itself', share:0.46, does:'Carrying a recall forward' },
    { id:'gaba', name:'GABA', tone:'#7f8aa8', role:'Inhibitory \u2014 suppresses the target', share:0.20, does:'Holding an act she may not take' },
    { id:'da', name:'Dopamine', tone:'#f0c46a', role:'Salience \u2014 marks what mattered', share:0.11, does:'Something you ruled on' },
    { id:'ach', name:'Acetylcholine', tone:'#6fb3a0', role:'Attention \u2014 gates encoding', share:0.10, does:'Writing a new memory' },
    { id:'ne', name:'Norepinephrine', tone:'#d08a6a', role:'Arousal \u2014 raises the gain', share:0.08, does:'An alert firing' },
    { id:'ser', name:'Serotonin', tone:'#9b8de0', role:'Regulation \u2014 damps the whole field', share:0.05, does:'Settling after a run' }
  ];

  // Cortical rhythms. Every one of these is a real band with a real job; the field runs
  // whichever one matches what she is doing.
  P.BANDS = [
    { id:'delta', name:'Delta', hz:'0.5\u20134 Hz', rate:0.09, does:'Deep consolidation \u2014 nothing is being asked' },
    { id:'theta', name:'Theta', hz:'4\u20138 Hz', rate:0.28, does:'Encoding \u2014 a memory is being written' },
    { id:'alpha', name:'Alpha', hz:'8\u201312 Hz', rate:0.44, does:'Idle and ready \u2014 the default state' },
    { id:'beta', name:'Beta', hz:'12\u201330 Hz', rate:0.72, does:'Working \u2014 an act is in flight' },
    { id:'gamma', name:'Gamma', hz:'30\u2013100 Hz', rate:1, does:'Binding \u2014 a recall pulling several regions into one answer' }
  ];

  P.MIND_INPUTS = [
    { src: 'Vault obligations', n: '20 tracked', sample: 'Texas foreign qualification \u2014 21 days late, penalties accruing', lobe: 1 },
    { src: 'Vault evidence', n: '8 filed', sample: 'Delaware certificate of incorporation \u2014 on file', lobe: 3 },
    { src: 'Setup steps', n: '29 steps', sample: 'Formation documents \u2014 uploaded, she may follow them', lobe: 1 },
    { src: 'Team roster', n: '15 people', sample: 'TEAM MEMBER \u00b7 setter 1 \u2014 books calls, may never quote', lobe: 3 },
    { src: 'Entity tree', n: '5 entities', sample: 'Operations East \u2014 subsidiary, am east signs', lobe: 3 },
    { src: 'Money boundary', n: '3 relationships', sample: 'We are never the merchant between you and your client', lobe: 4 },
    { src:'Conversations', lobe:'recall', writes:'Every message, both directions', n:'31,400', state:'live', sample:'fixture B asked whether margin moves at volume' },
    { src:'Call transcripts', lobe:'recall', writes:'What was said, and who said it', n:'\u2014', state:'none', sample:'No voice substrate \u2014 nothing transcribed' },
    { src:'Calendar', lobe:'recall', writes:'Meetings, bookings, no-shows', n:'\u2014', state:'none', sample:'No calendar source connected' },
    { src:'Audit log', lobe:'recall', writes:'Every act, append-only', n:'12,880', state:'live', sample:'Entered AUTHORIZED TENANT \u00b7 7c11 at 09:14' },
    { src:'Systems check', lobe:'recall', writes:'Findings from each run', n:'3,840', state:'live', sample:'operator_alert_delivery failed four runs straight' },
    { src:'Documents', lobe:'knowledge', writes:'Uploads, agreements, filings', n:'4,210', state:'live', sample:'Reseller agreement, clause 7 \u2014 margin at volume' },
    { src:'The Vault', lobe:'knowledge', writes:'What a client keeps on their side', n:'2,970', state:'live', sample:'0f3a holds 8 items, 2 shared with us' },
    { src:'Standing memories', lobe:'knowledge', writes:'What you told her to hold', n:'318', state:'live', sample:'Never quote a reseller number before legal signs off' },
    { src:'Web reads', lobe:'knowledge', writes:'Pages she was asked to read', n:'\u2014', state:'none', sample:'No fetch layer \u2014 she cannot read the web' },
    { src:'Tenant config', lobe:'knowledge', writes:'How each tenant is set up', n:'1,640', state:'live', sample:'b204 config drift cannot be parsed' },
    { src:'Analytics reads', lobe:'knowledge', writes:'Computed figures and the run behind them', n:'3,268', state:'live', sample:'Fleet swept 06:30 \u2014 4 pass, 1 fail, 5 unrun' },
    { src:'Skill primitives', lobe:'skills', writes:'What she can do natively', n:'7', state:'live', sample:'Read a record \u00b7 draft a message \u00b7 run a sweep' },
    { src:'Taught skills', lobe:'skills', writes:'Procedures you composed', n:'12', state:'live', sample:'Weekly digest \u2014 read, compose, hold for your word' },
    { src:'Installed listings', lobe:'skills', writes:'What the marketplace added', n:'6', state:'live', sample:'Overnight sweep brief \u2014 installed at ask first' },
    { src:'Automations', lobe:'skills', writes:'What runs on its own, and its record', n:'184', state:'live', sample:'Quiet-hours guard held 3 sends past 21:00' },
    { src:'Sandbox code', lobe:'skills', writes:'Files she wrote, and their runs', n:'\u2014', state:'none', sample:'drift_read.py written, never executed' },
    { src:'People', lobe:'identity', writes:'Names, contacts, lifecycle', n:'6,120', state:'live', sample:'fixture D \u2014 reseller intent, came in by LinkedIn DM' },
    { src:'Companies', lobe:'identity', writes:'Legal name, EIN, entity, address', n:'1,910', state:'live', sample:'AUTHORIZED TENANT agency \u2014 parent of 4' },
    { src:'Facial scans', lobe:'identity', writes:'A face bound to a person', n:'\u2014', state:'none', sample:'No vision seam \u2014 nothing scanned' },
    { src:'Brand identity', lobe:'identity', writes:'Logos, palettes, brand sets', n:'\u2014', state:'none', sample:'No asset store \u2014 nothing matched' },
    { src:'Portal activity', lobe:'identity', writes:'Who signed in, and what they did', n:'\u2014', state:'none', sample:'No client session exists yet' },
    { src:'Trust Compass', lobe:'judgment', writes:'Grants, ceilings, every change', n:'640', state:'live', sample:'Ceiling held at Ask first since 4 Aug' },
    { src:'Your corrections', lobe:'judgment', writes:'What you changed, and why', n:'412', state:'live', sample:'You corrected an EIN that came in from a form' },
    { src:'Refusals', lobe:'judgment', writes:'What she proposed and you declined', n:'155', state:'live', sample:'You refused advancing a deal without evidence' }
  ];

  P.LOBES = [
    { id:'recall', name:'Recall', hue:'#c7a978', hueLight:'#8a6420', n: 725, at:[-0.52,0.30,0.25],
      what:'What happened', holds:'Conversations, calls, runs, every act on the record',
      count:'48,120', growth:'+1,840 today', src:'Written by every surface' },
    { id:'knowledge', name:'Knowledge', hue:'#9b8de0', hueLight:'#5540b4', n: 609, at:[0.54,0.28,0.20],
      what:'What is true', holds:'Standing memories, documents, entity facts, brand identity',
      count:'12,406', growth:'+62 today', src:'Written by you and by ingestion' },
    { id:'skills', name:'Skills', hue:'#6fb3a0', hueLight:'#146b55', n: 435, at:[-0.46,-0.26,-0.30],
      what:'What she can do', holds:'Primitives, taught skills, installed marketplace skills',
      count:'214', growth:'+3 this week', src:'Composed, never granted authority' },
    { id:'identity', name:'Identity', hue:'#d08a6a', hueLight:'#a2431a', n: 493, at:[0.48,-0.24,-0.28],
      what:'Who people are', holds:'People, companies, faces, logos, the links between them',
      count:'8,933', growth:'+114 today', src:'Written by the book and by scans' },
    { id:'judgment', name:'Judgment', hue:'#7a94c8', hueLight:'#2a5390', n: 377, at:[0.02,0.46,-0.42],
      what:'What you have ruled', holds:'Preferences, corrections, refusals, the ceiling itself',
      count:'1,207', growth:'+9 today', src:'Written when you accept or refuse' }
  ];

  // What is firing. Each event names its lobe, so a pulse always has a cause.
  P.MIND_EVENTS = [
    { lobe:'recall', text:'Recalled the last three threads with fixture B', by:'PAIGE', tier:'Super Admin' },
    { lobe:'skills', text:'Called the overnight sweep brief', by:'ZION', tier:'Platform' },
    { lobe:'identity', text:'Matched a logo to AUTHORIZED TENANT \u00b7 0f3a', by:'PAIGE', tier:'Sub-account' },
    { lobe:'judgment', text:'You refused a proposal — recorded as a preference', by:'You', tier:'Super Admin' },
    { lobe:'knowledge', text:'Read the reseller agreement into the record', by:'SCRIBE', tier:'Agency' },
    { lobe:'recall', text:'Recalled why b204 was graded at risk', by:'OATHEN', tier:'Sub-account' },
    { lobe:'skills', text:'Composed a skill from three primitives', by:'PAIGE', tier:'Solo' },
    { lobe:'identity', text:'Linked fixture D to their company record', by:'PAIGE', tier:'Enterprise' }
  ];

  // What else belongs in the Mind, beyond watching it.
  P.MIND_FACES = [
    { id:'field', name:'The field', note:'Watch it think' },
    { id:'write', name:'Write', note:'Put something in' },
    { id:'recall', name:'Recall', note:'Ask what she holds' },
    { id:'features', name:'Features', note:'What she holds, as directions' },
    { id:'rhythm', name:'Rhythm', note:'The band it is running' },
    { id:'sources', name:'Sources', note:'What writes here' },
    { id:'policy', name:'Policy', note:'What is kept, and for how long' }
  ];

  P.MIND_SOURCES = [
    { name:'Conversations', lobe:'Recall', rate:'~1,400 / day', state:'Live' },
    { name:'Calls', lobe:'Recall', rate:'\u2014', state:'No substrate' },
    { name:'Systems checks', lobe:'Recall', rate:'288 / day', state:'Live' },
    { name:'Documents', lobe:'Knowledge', rate:'~40 / day', state:'Live' },
    { name:'Facial scans', lobe:'Identity', rate:'\u2014', state:'Not built' },
    { name:'Brand identity', lobe:'Identity', rate:'\u2014', state:'Not built' },
    { name:'Marketplace installs', lobe:'Skills', rate:'\u2014', state:'No install ledger' },
    { name:'Your rulings', lobe:'Judgment', rate:'~9 / day', state:'Live' }
  ];

  P.MIND_POLICY = [
    { k:'Retention', v:'Recall 24 months \u00b7 Knowledge indefinite \u00b7 Judgment never expires' },
    { k:'Tenant isolation', v:'A tenant\u2019s memory is never readable by another tenant' },
    { k:'Roll-up', v:'The platform brain reads across tiers; a tenant brain reads only its own' },
    { k:'Forgetting', v:'An act on the record \u2014 what she forgets, and when, is auditable' },
    { k:'Training', v:'Nothing here trains a shared model. Memory is recall, not weights.' }
  ];


  // Automations. The grammar is WHEN \u2192 IF \u2192 THEN, and the rule that makes it hers:
  // an automation's effective grant is the most restrictive among its actions, and the
  // Trust Compass clamps that. Automating something can never widen what she may do.
  // Grounded: supabase/migrations \u2026 stage_automation_rules + stage_automation_events,
  // dispatched by pg_net to functions/v1/dispatch-stage-automation against a per-tenant
  // encrypted webhook. That is one trigger and one action; everything else is design.
  P.TRIG_CATS = [
    { id:'record', name:'Records', glyph:'M2.6 3.4h10.8v9.2H2.6z M2.6 6.4h10.8', note:'A person or company changes' },
    { id:'pipeline', name:'Pipeline', glyph:'M2.4 3.6h3.4v8.8H2.4z M6.4 3.6h3.4v6H6.4z M10.4 3.6h3.2v3.4h-3.2z', note:'A deal moves' },
    { id:'convo', name:'Conversations', glyph:'M2.4 3.4h11.2v7.4H7l-3.2 2.6v-2.6H2.4z', note:'Someone writes or calls' },
    { id:'calendar', name:'Calendar', glyph:'M2.6 4h10.8v9H2.6z M2.6 6.8h10.8 M5.4 2.6v2.6 M10.6 2.6v2.6', note:'Time, bookings, no-shows' },
    { id:'campaign', name:'Campaigns', glyph:'M2.6 6.4h3.2L11 3.2v9.6L5.8 9.6H2.6z', note:'A motion steps or lands' },
    { id:'fleet', name:'Fleet', glyph:'M8 2.2l5.4 3v5.6L8 13.8 2.6 10.8V5.2z', note:'A tenant changes condition' },
    { id:'schedule', name:'Schedule', glyph:'M8 2.6a5.4 5.4 0 1 0 0 10.8a5.4 5.4 0 1 0 0-10.8 M8 5.2V8l2 1.4', note:'A clock or a date field' },
    { id:'agent', name:'PAIGE', glyph:'M4.6 6.4h6.8v5.2H4.6z M8 6.4V4.2 M6.4 8.8h.01 M9.6 8.8h.01', note:'She proposes, holds or learns' },
    { id:'external', name:'External', glyph:'M6 10L4.2 11.8a2.6 2.6 0 0 1-3.6-3.6L2.4 6.4 M10 6l1.8-1.8a2.6 2.6 0 0 1 3.6 3.6L13.6 9.6 M6.2 9.8l3.6-3.6', note:'A webhook or an integration' },
    { id:'manual', name:'By hand', glyph:'M8 2.6v10.8 M4 6.6L8 2.6l4 4', note:'You run it, or ask her to' }
  ];

  P.TRIGGERS = [
    { cat:'record', name:'Record created', sub:'A person or company is added', live:true },
    { cat:'record', name:'Field changed', sub:'Pick the field and the from/to', live:true },
    { cat:'record', name:'Lifecycle moved', sub:'Prospect becomes client, or churns', live:false, why:'Needs the lifecycle field' },
    { cat:'record', name:'Tag added or removed', sub:'Any tag on any record', live:true },
    { cat:'record', name:'Record merged', sub:'Two records become one', live:false, why:'No merge exists yet' },
    { cat:'pipeline', name:'Stage changed', sub:'A deal moves between stages', live:true, real:true },
    { cat:'pipeline', name:'Deal won', sub:'It reaches a closed-won stage', live:true },
    { cat:'pipeline', name:'Deal lost', sub:'With the reason, if one was given', live:false, why:'No loss-reason field' },
    { cat:'pipeline', name:'Deal stalled', sub:'Past its stage target with no change', live:false, why:'Needs stage-change history' },
    { cat:'pipeline', name:'Evidence missing', sub:'Advanced without meeting exit criteria', live:true },
    { cat:'convo', name:'Message received', sub:'On any channel, or one you pick', live:true },
    { cat:'convo', name:'Thread went quiet', sub:'No reply for N days', live:true },
    { cat:'convo', name:'Call ended', sub:'With duration and outcome', live:false, why:'Voice has no substrate' },
    { cat:'convo', name:'Missed call', sub:'Nobody picked up', live:false, why:'Voice has no substrate' },
    { cat:'convo', name:'DM received', sub:'LinkedIn, Instagram, X or Facebook', live:false, why:'No social DM seam' },
    { cat:'calendar', name:'Booking made', sub:'On a calendar and booking type you pick', live:true },
    { cat:'calendar', name:'Booking cancelled', sub:'By either side', live:true },
    { cat:'calendar', name:'No-show', sub:'Nobody joined', live:false, why:'Nothing measures attendance' },
    { cat:'calendar', name:'Meeting ended', sub:'Fires when the slot closes', live:true },
    { cat:'calendar', name:'Date field approaches', sub:'N days before or after any date', live:true },
    { cat:'campaign', name:'Step delivered', sub:'A sequence step went out', live:true },
    { cat:'campaign', name:'Reply received', sub:'Someone answered a campaign', live:true },
    { cat:'campaign', name:'Motion finished', sub:'Every step has run', live:true },
    { cat:'campaign', name:'Campaign halted', sub:'Stopped mid-flight', live:true },
    { cat:'fleet', name:'Tenant provisioned', sub:'A new tenant reaches first run', live:true },
    { cat:'fleet', name:'Seats hit zero', sub:'The grade that drives at-risk', live:true },
    { cat:'fleet', name:'Sweep completed', sub:'With its pass, fail and unrun counts', live:true, real:true },
    { cat:'fleet', name:'Finding raised', sub:'By severity, or blocking only', live:true, real:true },
    { cat:'fleet', name:'Drift detected', sub:'Config no longer matches', live:false, why:'An edge function cannot read git' },
    { cat:'schedule', name:'Every day at a time', sub:'With a timezone', live:true },
    { cat:'schedule', name:'Every week or month', sub:'Pick the days', live:true },
    { cat:'schedule', name:'Cron expression', sub:'For anything the above cannot say', live:true },
    { cat:'agent', name:'She proposes something', sub:'Before it reaches you', live:true },
    { cat:'agent', name:'A capability is held', sub:'The ceiling stopped an act', live:true, real:true },
    { cat:'agent', name:'Ceiling changed', sub:'You moved the Trust Compass', live:true, real:true },
    { cat:'agent', name:'Memory written', sub:'Into a region you pick', live:true },
    { cat:'agent', name:'She learned a correction', sub:'You told her she was wrong', live:true },
    { cat:'external', name:'Inbound webhook', sub:'A URL we mint for you', live:true, real:true },
    { cat:'external', name:'Form submitted', sub:'Any form built in the Studio', live:true },
    { cat:'external', name:'Integration event', sub:'From a connected account', live:false, why:'Only 6 of 42 are connected' },
    { cat:'manual', name:'Run from a record', sub:'A button on the record itself', live:true },
    { cat:'manual', name:'Ask her in chat', sub:'@ the automation by name', live:true },
    // Tags — the connective tissue. A tag is how a person, a deal or a company gets
    // pulled into an automation without naming it.
    { name: 'A tag is added', cat: 'Records', live: true },
    { name: 'A tag is removed', cat: 'Records', live: true },
    { name: 'A record enters a segment', cat: 'Records', live: false, why: 'Segments need the lifecycle field' },
    { name: 'A record leaves a segment', cat: 'Records', live: false, why: 'Segments need the lifecycle field' },
    { name: 'A company is verified', cat: 'Records', live: false, why: 'D&B is an OAuth stub' },
    { name: 'A document is uploaded', cat: 'Records', live: true },
    { name: 'A document is signed', cat: 'Records', live: false, why: 'No e-signature seam' },
    { name: 'A face or logo is scanned', cat: 'Records', live: false, why: 'No vision pipeline' },
    { name: 'A deal is won', cat: 'Pipeline', live: true },
    { name: 'A deal is lost', cat: 'Pipeline', live: false, why: 'Loss reason is not recorded' },
    { name: 'A deal passes its stage target', cat: 'Pipeline', live: false, why: 'Stage history is not recorded' },
    { name: 'A pipeline stage is added or reordered', cat: 'Pipeline', live: true },
    { name: 'An outbound call ends', cat: 'Conversations', live: false, why: 'Voice has no substrate' },
    { name: 'A call is transcribed', cat: 'Conversations', live: false, why: 'No transcription seam' },
    { name: 'A social DM arrives', cat: 'Conversations', live: false, why: 'No social DM seam' },
    { name: 'A review is posted', cat: 'Conversations', live: false, why: 'Google Business Profile not connected' },
    { name: 'A booking is made', cat: 'Calendar', live: true },
    { name: 'A booking is cancelled', cat: 'Calendar', live: true },
    { name: 'A campaign is halted', cat: 'Campaigns', live: true },
    { name: 'A campaign finishes its motion', cat: 'Campaigns', live: true },
    { name: 'A post publishes', cat: 'Campaigns', live: false, why: 'No social publishing seam' },
    { name: 'An ad flight opens or closes', cat: 'Campaigns', live: false, why: 'No ad account read' },
    { name: 'A listing is submitted', cat: 'Marketplace', live: true },
    { name: 'A listing is approved or rejected', cat: 'Marketplace', live: true },
    { name: 'Something is installed', cat: 'Marketplace', live: false, why: 'No install ledger' },
    { name: 'A publisher is verified', cat: 'Marketplace', live: false, why: 'Publisher accounts do not exist' },
    { name: 'A metric crosses a threshold', cat: 'Analytics', live: false, why: 'A4 wires the alert lens' },
    { name: 'A systems check fails', cat: 'Analytics', live: true },
    { name: 'The morning brief is written', cat: 'Analytics', live: true },
    { name: 'An integration connects', cat: 'External', live: true },
    { name: 'An integration goes dark', cat: 'External', live: true },
    { name: 'An invoice is paid or fails', cat: 'External', live: false, why: 'Money spine deferred' },
    { name: 'A portal invite is accepted', cat: 'External', live: false, why: 'No client-side session' },
    { name: 'A vault item is added', cat: 'External', live: true },
    { name: 'A tenant enters or exits scope', cat: 'Fleet', live: true },
    { name: 'A sub-agent is spun up', cat: 'PAIGE', live: true },
    { name: 'A skill is taught or installed', cat: 'PAIGE', live: true },
    { name: 'A feature in the Mind fires', cat: 'PAIGE', live: false, why: 'The Mind has no read seam' }
  ];

  P.ACT_CATS = [
    { id:'say', name:'Communicate', tone:'var(--pg-gold)', note:'Anything that reaches a person' },
    { id:'write', name:'Change a record', tone:'var(--pg-violet)', note:'Fields, stages, owners, tags' },
    { id:'time', name:'Task and time', tone:'#6fb3a0', note:'Follow-ups, bookings, reminders' },
    { id:'agent', name:'Ask PAIGE', tone:'var(--pg-gold-deep)', note:'A skill, a sub-agent, a memory' },
    { id:'flow', name:'Control', tone:'var(--pg-faint)', note:'Wait, branch, stop, hand off' },
    { id:'out', name:'Outside', tone:'#7a94c8', note:'Webhook, integration, workflow' },
    { id:'tell', name:'Notify', tone:'var(--pg-warning)', note:'A seat, the rail, the brief' }
  ];

  P.ACTIONS = [
    { cat:'say', name:'Send an email', needs:'Ask first', live:true },
    { cat:'say', name:'Send an SMS', needs:'Ask first', live:true },
    { cat:'say', name:'Draft a reply', needs:'Draft only', live:true },
    { cat:'say', name:'Send a DM', needs:'Ask first', live:false, why:'No social DM seam' },
    { cat:'say', name:'Place a call', needs:'Ask first', live:false, why:'Voice has no substrate' },
    { cat:'say', name:'Publish a post', needs:'Ask first', live:false, why:'No publishing seam' },
    { cat:'write', name:'Create a record', needs:'Act and report', live:true },
    { cat:'write', name:'Set a field', needs:'Act and report', live:true },
    { cat:'write', name:'Move a deal stage', needs:'Ask first', live:true },
    { cat:'write', name:'Assign an owner', needs:'Act and report', live:true },
    { cat:'write', name:'Add or remove a tag', needs:'Autonomous', live:true },
    { cat:'time', name:'Create a follow-up', needs:'Act and report', live:true },
    { cat:'time', name:'Book a slot', needs:'Ask first', live:true },
    { cat:'time', name:'Set a reminder', needs:'Autonomous', live:true },
    { cat:'time', name:'Block protected focus', needs:'Act and report', live:true },
    { cat:'agent', name:'Call a skill', needs:'Inherits the skill', live:true },
    { cat:'agent', name:'Hand to a sub-agent', needs:'Inherits the agent', live:true },
    { cat:'agent', name:'Write a memory', needs:'Ask first', live:true },
    { cat:'agent', name:'Ask her to decide', needs:'Draft only', live:true },
    { cat:'flow', name:'Wait', needs:'Observe', live:true },
    { cat:'flow', name:'Branch on a condition', needs:'Observe', live:true },
    { cat:'flow', name:'Stop here', needs:'Observe', live:true },
    { cat:'flow', name:'Run another automation', needs:'Inherits the other', live:true },
    { cat:'out', name:'POST to a webhook', needs:'Act and report', live:true, real:true },
    { cat:'out', name:'Call an integration', needs:'Ask first', live:false, why:'Only 6 of 42 are connected' },
    { cat:'out', name:'Run an n8n workflow', needs:'Ask first', live:false, why:'Action kinds modelled, nothing calls them' },
    { cat:'tell', name:'Alert a seat', needs:'Autonomous', live:true },
    { cat:'tell', name:'Surface in the rail', needs:'Autonomous', live:true },
    { cat:'tell', name:'Add to the morning brief', needs:'Autonomous', live:true },
    { name: 'Add a tag', cat: 'Change a record', needs: 'Autonomous', live: true },
    { name: 'Remove a tag', cat: 'Change a record', needs: 'Autonomous', live: true },
    { name: 'Add to a segment', cat: 'Change a record', needs: 'Act and report', live: false, why: 'Segments need the lifecycle field' },
    { name: 'Move a deal to a stage', cat: 'Change a record', needs: 'Ask first', live: true },
    { name: 'Create a deal', cat: 'Change a record', needs: 'Ask first', live: true },
    { name: 'Create a pipeline stage', cat: 'Change a record', needs: 'Ask first', live: true },
    { name: 'Convert a prospect to a tenant', cat: 'Change a record', needs: 'Ask first', live: false, why: 'Conversion needs the lifecycle field' },
    { name: 'File a document to the vault', cat: 'Change a record', needs: 'Act and report', live: true },
    { name: 'Request a document', cat: 'Communicate', needs: 'Ask first', live: true },
    { name: 'Place an outbound call', cat: 'Communicate', needs: 'Ask first', live: false, why: 'Voice has no substrate' },
    { name: 'Leave a voicemail', cat: 'Communicate', needs: 'Ask first', live: false, why: 'Voice has no substrate' },
    { name: 'Send a social DM', cat: 'Communicate', needs: 'Ask first', live: false, why: 'No social DM seam' },
    { name: 'Publish a post', cat: 'Communicate', needs: 'Ask first', live: false, why: 'No social publishing seam' },
    { name: 'Reply to a review', cat: 'Communicate', needs: 'Ask first', live: false, why: 'Google Business Profile not connected' },
    { name: 'Send a portal invite', cat: 'Communicate', needs: 'Ask first', live: false, why: 'No client-side session' },
    { name: 'Start a campaign', cat: 'Control', needs: 'Ask first', live: true },
    { name: 'Halt a campaign', cat: 'Control', needs: 'Act and report', live: true },
    { name: 'Enrol in a campaign', cat: 'Control', needs: 'Ask first', live: true },
    { name: 'Enter a tenant scope', cat: 'Control', needs: 'Ask first', live: true },
    { name: 'Change a capability grant', cat: 'Control', needs: 'Ask first', live: true },
    { name: 'Spin up a sub-agent', cat: 'Ask PAIGE', needs: 'Ask first', live: true },
    { name: 'Run a skill', cat: 'Ask PAIGE', needs: 'Ask first', live: true },
    { name: 'Write to her memory', cat: 'Ask PAIGE', needs: 'Act and report', live: false, why: 'The Mind has no write seam' },
    { name: 'Recall from her memory', cat: 'Ask PAIGE', needs: 'Observe', live: false, why: 'The Mind has no read seam' },
    { name: 'Run a systems check', cat: 'Ask PAIGE', needs: 'Act and report', live: true },
    { name: 'Approve or reject a listing', cat: 'Control', needs: 'Ask first', live: true },
    { name: 'Install from the marketplace', cat: 'Control', needs: 'Ask first', live: false, why: 'No install ledger' },
    { name: 'Read a metric', cat: 'Ask PAIGE', needs: 'Observe', live: true },
    { name: 'Write a brief', cat: 'Notify', needs: 'Act and report', live: true },
    { name: 'Raise an alert', cat: 'Notify', needs: 'Autonomous', live: false, why: 'A3 routes delivery' },
    { name: 'Call an integration', cat: 'Outside', needs: 'Ask first', live: true },
    { name: 'Charge or invoice', cat: 'Outside', needs: 'Ask first', live: false, why: 'Money spine deferred' }
  ];

  // Guards are the part most builders leave out, and the part that stops an automation
  // becoming a liability: a loop, a 3am send, or an act above the ceiling.
  P.GUARDS = [
    { name:'Once per record', on:true, note:'It cannot fire twice on the same object' },
    { name:'Rate limit', on:true, note:'At most 20 runs an hour' },
    { name:'Respect quiet hours', on:true, note:'Holds outbound outside the tenant window' },
    { name:'Stop on error', on:true, note:'A failed action halts the rest' },
    { name:'Retry once', on:false, note:'Only safe where the action is idempotent' },
    { name:'Dry run', on:false, note:'Evaluate and record, send nothing' }
  ];


  P.AUTOMATIONS = [
    { id:'a1', name:'Follow up on a quiet thread', cat:'convo', state:'live', runs:'3 owed',
      trig:'Thread went quiet', trigNote:'no reply for 4 days',
      conds:['Channel is Email or SMS', 'The record is a prospect'],
      acts:[['Ask her to decide','agent'],['Draft a reply','say'],['Create a follow-up','time']],
      note:'She proposes the next touch and holds it for your word.', real:false },
    { id:'a2', name:'Flag a stalled deal', cat:'pipeline', state:'live', runs:'2 stalled',
      trig:'Deal stalled', trigNote:'past its stage target',
      conds:['Amount is over \u00a35,000'],
      acts:[['Surface in the rail','tell'],['Ask her to decide','agent']],
      note:'It flags rather than advances \u2014 your standing ruling.', real:false },
    { id:'a3', name:'Stage change to webhook', cat:'pipeline', state:'live', runs:'live',
      trig:'Stage changed', trigNote:'any pipeline',
      conds:['The tenant has a webhook set'],
      acts:[['POST to a webhook','out']],
      note:'The one automation with real substrate end to end: a deals trigger writes a stage_automation_event, pg_net dispatches it to the tenant webhook.', real:true },
    { id:'a4', name:'Triage a new thread', cat:'convo', state:'live', runs:'1 drafted',
      trig:'Message received', trigNote:'from an unknown sender',
      conds:['Nobody owns the record yet'],
      acts:[['Ask her to decide','agent'],['Assign an owner','write'],['Draft a reply','say']],
      note:'Reads it, routes it, drafts the first reply.', real:false },
    { id:'a5', name:'Step a sequence', cat:'campaign', state:'live', runs:'\u2014',
      trig:'Step delivered', trigNote:'and its condition is met',
      conds:['No reply since the last step'],
      acts:[['Wait','flow'],['Send an email','say']],
      note:'Draft only at this ceiling: it composes, it does not send.', real:false },
    { id:'a6', name:'Watch the provisioning queue', cat:'fleet', state:'live', runs:'2 waiting',
      trig:'Tenant provisioned', trigNote:'or stuck before first run',
      conds:['Waiting over 2 hours'],
      acts:[['Alert a seat','tell'],['Add to the morning brief','tell']],
      note:'Reports a tenant stuck before it runs.', real:false },
    { id:'a7', name:'Run the fleet sweep', cat:'schedule', state:'live', runs:'daily',
      trig:'Every day at a time', trigNote:'06:30 in the tenant timezone',
      conds:[],
      acts:[['Call a skill','agent'],['Add to the morning brief','tell']],
      note:'The sweep that writes the morning brief.', real:true },
    { id:'a8', name:'Hold outbound in quiet hours', cat:'schedule', state:'live', runs:'always',
      trig:'Every day at a time', trigNote:'evaluated per send',
      conds:['Outside the tenant window'],
      acts:[['Stop here','flow'],['Set a reminder','time']],
      note:'A guard rather than an act: it stops rather than sends.', real:false },
    { id:'a9', name:'Book a callback on a missed call', cat:'convo', state:'blocked', runs:'\u2014',
      trig:'Missed call', trigNote:'no voicemail left',
      conds:[],
      acts:[['Place a call','say'],['Book a slot','time']],
      note:'Blocked: voice has no substrate at any tier.', real:false },
    { id:'a10', name:'Chase a no-show', cat:'calendar', state:'blocked', runs:'\u2014',
      trig:'No-show', trigNote:'nobody joined',
      conds:[],
      acts:[['Draft a reply','say'],['Book a slot','time']],
      note:'Blocked: nothing measures attendance.', real:false },
    { id:'a11', name:'Welcome a new client', cat:'record', state:'draft', runs:'never run',
      trig:'Lifecycle moved', trigNote:'prospect becomes client',
      conds:[],
      acts:[['Send an email','say'],['Create a record','write'],['Book a slot','time']],
      note:'Needs the lifecycle field, which does not exist yet.', real:false },
    { id:'a12', name:'Tell me when she is held', cat:'agent', state:'live', runs:'7 today',
      trig:'A capability is held', trigNote:'the ceiling stopped an act',
      conds:['The act was consequential'],
      acts:[['Surface in the rail','tell']],
      note:'The ceiling is doing its job; this is how you hear about it.', real:true }
  ];


  // What actually breaks, and who may fix it. The rule: she repairs the MECHANISM, never
  // the INTENT. Retry, back off, reconnect, halt a runaway, remap an unambiguous field —
  // hers. Anything that changes what an automation does, who it reaches, or what it sends
  // is yours. Anything needing a credential is yours by definition: only you can authenticate.
  P.FAULTS = {
    credential: { name: 'Credential expired', who: 'you', tone: 'var(--pg-negative)',
      why: 'The stored token no longer authenticates. Only you can sign in again.',
      she: 'Detected it on the first failure, held the automation so it stopped retrying against a dead token, and told you.' },
    ratelimit: { name: 'Rate limited', who: 'her', tone: 'var(--pg-warning)',
      why: 'The provider refused for volume, not for correctness.',
      she: 'Backed off, spread the queue over the window, and resumed. No step was lost.' },
    webhook: { name: 'Webhook unreachable', who: 'her', tone: 'var(--pg-warning)',
      why: 'The endpoint returned nothing three times running.',
      she: 'Retried with backoff, queued what could not send, and resumed when it answered.' },
    schema: { name: 'Field renamed', who: 'her', tone: 'var(--pg-violet)',
      why: 'A field this automation writes was renamed upstream.',
      she: 'The new name was unambiguous, so she remapped it and recorded the change. An ambiguous rename would have come to you.' },
    mcp: { name: 'MCP connection dropped', who: 'her', tone: 'var(--pg-warning)',
      why: 'The server stopped answering mid-session.',
      she: 'Reconnected and replayed the step that was in flight.' },
    runaway: { name: 'Runaway loop', who: 'her', tone: 'var(--pg-negative)',
      why: 'An action re-triggered its own trigger, 340 times in four minutes.',
      she: 'Halted it inside the first minute, added a once-per-record guard, and left it held for your word before it runs again.' },
    shape: { name: 'Response shape changed', who: 'you', tone: 'var(--pg-negative)',
      why: 'The provider returns a different structure, and which field replaces the old one is a judgment call.',
      she: 'Stopped the automation rather than guess, and drafted the two candidate mappings for you to pick.' },
    permission: { name: 'Scope revoked', who: 'you', tone: 'var(--pg-negative)',
      why: 'The connected account no longer grants the permission this action needs.',
      she: 'Held it and named the exact scope to restore.' }
  };

  // A watch is a run that went wrong. Representative: nothing here executed.
  P.WATCH = [
    { id: 'w1', auto: 'Stage change to webhook', fault: 'webhook', when: '04:12', runs: 3,
      state: 'repaired', took: '6m', note: 'Endpoint answered again at 04:18. 3 queued events delivered in order.' },
    { id: 'w2', auto: 'Triage a new thread', fault: 'ratelimit', when: '09:40', runs: 18,
      state: 'repaired', took: '22m', note: 'Spread 18 drafts across the window. None dropped.' },
    { id: 'w3', auto: 'Welcome a new client', fault: 'credential', when: '11:03', runs: 1,
      state: 'needs you', took: '\u2014', note: 'The email account token expired. She held it after one failure rather than burning retries.' },
    { id: 'w4', auto: 'Watch the provisioning queue', fault: 'mcp', when: '12:20', runs: 2,
      state: 'repaired', took: '40s', note: 'Reconnected and replayed the read that was in flight.' },
    { id: 'w5', auto: 'Flag a stalled deal', fault: 'schema', when: 'yesterday', runs: 1,
      state: 'repaired', took: '2m', note: 'stage_target_days became target_days upstream. One candidate, so she remapped it.' },
    { id: 'w6', auto: 'Step a sequence', fault: 'runaway', when: 'yesterday', runs: 340,
      state: 'held', took: '52s', note: 'Halted, guarded, and waiting on your word before it runs again.' },
    { id: 'w7', auto: 'Hold outbound in quiet hours', fault: 'shape', when: '2d ago', runs: 1,
      state: 'needs you', took: '\u2014', note: 'Two candidate mappings drafted. Picking one is a judgment call, so it is yours.' }
  ];


  // Alerts reimagined: not a rule table, a report of what she noticed. Three streams —
  // what needs you, what she already fixed, and what she is watching. A rule is a knob,
  // so the rules themselves are a face rather than the surface.
  P.ALERTS = [
    { id: 'al1', kind: 'needs', scope: 'Automations', title: 'Welcome a new client cannot authenticate',
      when: '11:03', sev: 'high', watch: 'w3',
      what: 'The email account token expired at 11:03. One send failed.',
      did: 'Held the automation after a single failure rather than burning retries against a dead token.',
      left: 'Sign in to the email account again. Nothing else is needed \u2014 the queue resumes on its own.',
      act: 'Reconnect the account' },
    { id: 'al2', kind: 'needs', scope: 'Automations', title: 'Quiet hours guard: the provider changed shape',
      when: '2d ago', sev: 'high', watch: 'w7',
      what: 'The response no longer carries the field this guard reads.',
      did: 'Stopped rather than guess, and drafted the two candidate mappings.',
      left: 'Pick which field replaces it. She will not choose \u2014 that is a judgment call about your data.',
      act: 'Review the two mappings' },
    { id: 'al3', kind: 'needs', scope: 'Fleet', title: 'A tenant has had no active seats for 21 days',
      when: '06:30', sev: 'medium',
      what: '7c11 is graded at risk because seat count is a term in the grade.',
      did: 'Raised it in the morning brief three days running.',
      left: 'Decide whether to contact them or reclassify the grade.',
      act: 'Open the tenant' },
    { id: 'al4', kind: 'fixed', scope: 'Automations', title: 'Sequence stepping ran away and was halted',
      when: 'yesterday', sev: 'high', watch: 'w6',
      what: 'An action re-triggered its own trigger \u2014 340 runs in four minutes.',
      did: 'Halted it inside the first minute, added a once-per-record guard, and left it held.',
      left: 'It stays held until you release it. The guard is already in place.',
      act: 'Release it' },
    { id: 'al5', kind: 'fixed', scope: 'Automations', title: 'Webhook came back and the queue drained',
      when: '04:12', sev: 'medium', watch: 'w1',
      what: 'The tenant endpoint returned nothing three times running.',
      did: 'Retried with backoff, queued three events, delivered them in order at 04:18.',
      left: 'Nothing. Reported because a six-minute outage is worth knowing about.', act: '' },
    { id: 'al6', kind: 'fixed', scope: 'Automations', title: 'Triage was rate limited and spread out',
      when: '09:40', sev: 'low', watch: 'w2',
      what: 'The provider refused for volume, not correctness.',
      did: 'Spread eighteen drafts across the window. None dropped.',
      left: 'Nothing.', act: '' },
    { id: 'al7', kind: 'fixed', scope: 'Automations', title: 'A renamed field was remapped',
      when: 'yesterday', sev: 'low', watch: 'w5',
      what: 'stage_target_days became target_days upstream.',
      did: 'One unambiguous candidate, so she remapped it and recorded the change.',
      left: 'Nothing. An ambiguous rename would have come to you instead.', act: '' },
    { id: 'al8', kind: 'fixed', scope: 'Automations', title: 'MCP connection dropped and reconnected',
      when: '12:20', sev: 'low', watch: 'w4',
      what: 'The server stopped answering mid-session.',
      did: 'Reconnected and replayed the read that was in flight.',
      left: 'Nothing.', act: '' },
    { id: 'al9', kind: 'needs', scope: 'Platform', title: 'Alert delivery is still undelivered',
      when: '13:47', sev: 'high',
      what: 'Rules evaluate and fire. Nothing carries a firing to a person.',
      did: 'Nothing she can do \u2014 there is no delivery seam to use.',
      left: 'A3 has to route firings through the channel adapters. Until then every alert lives here only.',
      act: '' }
  ];

  // What she is watching, and what she is allowed to do about it. Read as a sentence:
  // "when X, she may Y."
  P.ALERT_RULES = [
    { name: 'An automation fails twice running', scope: 'Automations', may: 'Retry, back off, then hold and tell you', live: 1, on: 'Every tenant', by: 'Platform' },
    { name: 'A credential stops authenticating', scope: 'Automations', may: 'Hold it and name the account \u2014 never re-auth', live: 1, on: 'Every tenant', by: 'Platform' },
    { name: 'A run exceeds its rate for the window', scope: 'Automations', may: 'Spread the queue and resume', live: 1, on: 'Every tenant', by: 'Platform' },
    { name: 'An action fires more than 20 times a minute', scope: 'Automations', may: 'Halt, guard, and hold for your word', live: 1, on: 'Every tenant', by: 'Platform' },
    { name: 'An upstream field is renamed', scope: 'Automations', may: 'Remap only when one candidate is unambiguous', live: 1, on: 'AUTHORIZED TENANT \u00b7 agency', by: 'PAIGE' },
    { name: 'A tenant has no active seats for 14 days', scope: 'Fleet', may: 'Raise it in the brief', live: 1, on: 'Platform', by: 'Platform' },
    { name: 'A thread goes unanswered past its target', scope: 'Conversations', may: 'Draft a reply and hold it', live: 1, on: 'AUTHORIZED TENANT \u00b7 0f3a', by: 'PAIGE' },
    { name: 'A deal passes its stage target', scope: 'Pipeline', may: 'Flag it on the board', live: 1, on: 'Every tenant', by: 'Platform' },
    { name: 'A booking is a no-show', scope: 'Calendar', may: 'Nothing \u2014 no attendance seam exists', live: 0, on: 'Every tenant', by: 'Platform' },
    { name: 'A campaign send bounces above 4%', scope: 'Campaigns', may: 'Nothing \u2014 no delivery metrics seam', live: 0, on: 'AUTHORIZED TENANT \u00b7 agency', by: 'PAIGE' },
    { name: 'A review lands below 3 stars', scope: 'Marketplace', may: 'Nothing \u2014 no review seam', live: 0, on: 'Platform', by: 'Platform' },
    { name: 'Platform error rate passes 1%', scope: 'Platform', may: 'Raise it in the systems check', live: 1, on: 'Platform', by: 'Platform' }
  ];


  // A rule belongs to somebody. She is the platform's COO, so she may set one for any of
  // these on a client's behalf \u2014 and the record names her as its author.
  P.RULE_SCOPES = [
    { id: 'platform', name: 'Platform', note: 'Operators only \u2014 nobody in a tenant sees it' },
    { id: 'every', name: 'Every tenant', note: 'Applies to all, now and as new ones land' },
    { id: 'tier', name: 'A tier', note: 'Agency, sub-account, solo or enterprise' },
    { id: 'tenant', name: 'One tenant', note: 'Set on their behalf, visible to them' }
  ];


  // Setup. Not a form — the account's first surface, and the one place that touches every
  // book: what lands here shows up in the Vault, the Fleet record, Relationships,
  // Campaigns attribution, the Marketplace publisher profile and Analytics.
  // Each step says who can do it: she does anything that is not a credential or a judgment.


  // The tour highlights real elements in the shell rather than showing pictures of them,
  // so what you learn is where the thing actually is.
  P.TOUR = [
    { sel: 'nav', dest: 'fleet', title: 'Six places, and that is all',
      body: 'Fleet is who you run. Relationships is everyone else. Campaigns is how they move. Marketplace is what you sell. Analytics reads across them. Settings is where it is configured. Nothing else earns a slot.' },
    { sel: '[data-cmdbar]', dest: 'fleet', title: 'Ask her from anywhere',
      body: 'Type or speak here and she acts on whatever surface you are on. \u2318K opens the same thing as a palette \u2014 every capability she has, with the authority each one needs.' },
    { sel: '[data-strip]', alt: 'aside', dest: 'fleet', title: 'Talking never stops the work',
      body: 'Whatever is running stays pinned above the composer while you talk. \u2318. interrupts, and she tells you exactly what she kept and what she dropped.' },
    { sel: '[data-trust]', dest: 'fleet', title: 'One dial over everything',
      body: 'The Trust Compass is a ceiling, not a switch. No capability, automation, install or edit may sit above it. Lower it and everything above the line is held at once.' },
    { sel: 'main', dest: 'fleet', title: 'She checks the fleet overnight',
      body: 'Systems check is where you land. What ran, what she fixed, what she left. Every figure counts against the whole run \u2014 a check that could not run is never counted as a pass.' },
    { sel: 'main', dest: 'relationships', title: 'People and their threads are one record',
      body: 'Open a person and you open their conversation. Email, SMS, voice and social DMs all land in the same console, and the calendar sits beside it because an appointment is with a person.' },
    { sel: 'main', dest: 'campaigns', title: 'A campaign is a motion',
      body: 'The step rail is the motion itself \u2014 what has gone, what is next, what is held. Pipeline is a view inside it, because deals sit on the records a campaign runs against.' },
    { sel: 'aside', dest: 'fleet', title: 'She has five faces, not five chats',
      body: 'Chat, Memory, Team, Skills and Code are one surface. What she remembers, who she delegates to, what she can do, and what she is writing \u2014 all reachable while the work continues.' }
  ];

  P.SETUP_FIRST = {
    from: 'Reseller intent \u00b7 pillar page \u2192 intake form',
    read: [
      { src: 'The form they filled in', got: 'Trading name, contact, phone, what they want' },
      { src: 'Their email domain', got: 'Website, and the mark and palette on it' },
      { src: 'Public business records', got: 'Legal name, entity type, formation state' },
      { src: 'The campaign that brought them', got: 'Attribution, and the segment they came from' }
    ],
    did: [
      'Set the trading and legal name',
      'Set the entity type and formation state',
      'Pulled the mark, palette and type off their site',
      'Filed the campaign that brought them in',
      'Set the Trust Compass at ask first \u2014 the safe default'
    ],
    cannot: [
      { name: 'EIN', why: 'Only they hold it' },
      { name: 'What you pay us', why: 'A card is theirs to give' },
      { name: 'Formation documents', why: 'They have to upload them' }
    ]
  };

  P.SETUP = [
    { g: 'Who you are', note: 'The record everything else hangs off', items: [
      { id: 's1', name: 'Legal and trading name', who: 'You', state: 'done', lands: 'Fleet · Vault',
        why: 'Every document, invoice and portal carries it.' },
      { id: 's2', name: 'Entity type and formation state', who: 'You', state: 'done', lands: 'Vault',
        why: 'Decides which filings and tax forms apply.' },
      { id: 's3', name: 'EIN', who: 'You', state: 'done', lands: 'Vault · masked',
        why: 'Held masked. Revealing it is recorded.' },
      { id: 's4', name: 'Registered and trading addresses', who: 'PAIGE', state: 'needs', lands: 'Fleet · Vault',
        why: 'She can read them off your formation docs once uploaded.' },
      { id: 's5', name: 'Brand identity — mark, palette, type', who: 'You', state: 'needs', lands: 'Mind · Identity',
        why: 'Goes into her Identity region so anything she writes looks like you.' }
    ]},
    { g: 'Documents', note: 'Uploaded once, reachable everywhere', items: [
      { id: 's6', name: 'Formation documents', who: 'You', state: 'needs', lands: 'Vault',
        why: 'She reads addresses, officers and dates from these.' },
      { id: 's7', name: 'W-9 or equivalent', who: 'You', state: 'done', lands: 'Vault' },
      { id: 's8', name: 'Master service agreement', who: 'PAIGE', state: 'done', lands: 'Vault · Relationships',
        why: 'She drafted it; you signed it.' },
      { id: 's9', name: 'Insurance certificates', who: 'You', state: 'skip', lands: 'Vault',
        why: 'Only if your clients ask for them.' },
      { id: 's10', name: 'Operating procedures', who: 'PAIGE', state: 'needs', lands: 'Mind · Knowledge',
        why: 'Anything you upload here she can follow. This is how she learns how you work.' }
    ]},
    { g: 'Who works here', note: 'People, seats and the vendors behind them', items: [
      { id: 's11', name: 'Team seats and roles', who: 'You', state: 'done', lands: 'Settings · Team' },
      { id: 's12', name: 'Vendors and suppliers', who: 'PAIGE', state: 'needs', lands: 'Relationships',
        why: 'A vendor is a relationship with money flowing the other way.' },
      { id: 's13', name: 'Sub-agents and what each one owns', who: 'PAIGE', state: 'done', lands: 'Spine · Team' },
      { id: 's14', name: 'Who signs and who approves', who: 'You', state: 'needs', lands: 'Governance',
        why: 'Authority is yours to assign — she will not choose it.' }
    ]},
    { g: 'Money', note: 'Three different relationships \u2014 and only one of them is ours', items: [
      { id: 's15', name: 'What you pay us', who: 'You', state: 'blocked', lands: 'Settings · Platform',
        why: 'A card on the platform account. Needs the money spine, which is deferred.',
        note: 'Ours. This is the only money relationship where we are the merchant.' },
      { id: 's16', name: 'What your clients pay you', who: 'You', state: 'needs', lands: 'Settings · Integrations',
        why: 'Connect your own processor. We never hold it and never take a cut \u2014 by rule, we are never the merchant of record between you and your client.',
        note: 'Yours. Bring your own \u2014 Stripe, Square, PayPal or an invoice you send yourself.' },
      { id: 's17', name: 'What the marketplace pays you', who: 'You', state: 'blocked', lands: 'Marketplace · Publisher',
        why: 'Only if you publish. Needs Stripe Connect \u2014 without it the marketplace cannot pay a publisher.',
        note: 'Third relationship. Platform to publisher, separate from both of the above.' },
      { id: 's17a', name: 'Plan and what it includes', who: 'PAIGE', state: 'blocked', lands: 'Settings · Platform',
        why: 'No plan record exists yet.' }
    ]},
    { g: 'How she reaches people', note: 'Every channel she may speak on', items: [
      { id: 's18', name: 'Email sending domain', who: 'You', state: 'done', lands: 'Integrations' },
      { id: 's19', name: 'Phone number', who: 'You', state: 'blocked', lands: 'Integrations',
        why: 'Twilio Voice still points at a demo webhook.' },
      { id: 's20', name: 'Calendar source', who: 'You', state: 'needs', lands: 'Relationships · Calendar',
        why: 'Nothing is connected, so no booking type can actually book.' },
      { id: 's21', name: 'Social accounts', who: 'You', state: 'blocked', lands: 'Campaigns · Social',
        why: 'LinkedIn, Meta and X have no seam yet.' },
      { id: 's22', name: 'Quiet hours and protected focus', who: 'PAIGE', state: 'done', lands: 'Calendar · Automations' }
    ]},
    { g: 'How she works for you', note: 'The room you give her, and what she watches', items: [
      { id: 's23', name: 'Trust Compass ceiling', who: 'You', state: 'done', lands: 'Governance',
        why: 'Currently ask first. Everything else is clamped by it.' },
      { id: 's24', name: 'Standing instructions', who: 'PAIGE', state: 'done', lands: 'Mind · Judgment',
        why: 'What you have told her never to do without asking.' },
      { id: 's25', name: 'First automations', who: 'PAIGE', state: 'done', lands: 'Automations',
        why: 'She proposed twelve; eight are running.' },
      { id: 's26', name: 'Alert rules', who: 'PAIGE', state: 'done', lands: 'Alerts',
        why: 'Twelve watching, four need you.' }
    ]},
    { g: 'Where you came from', note: 'Attribution, so the platform knows its own story', items: [
      { id: 's27', name: 'How this account arrived', who: 'PAIGE', state: 'needs', lands: 'Campaigns · Analytics',
        why: 'Campaign, marketplace listing, referral or direct. Nothing records it yet.' },
      { id: 's28', name: 'Marketplace publisher profile', who: 'You', state: 'needs', lands: 'Marketplace · Publishers',
        why: 'Only needed if you intend to sell here.' },
      { id: 's29', name: 'What you want measured', who: 'PAIGE', state: 'needs', lands: 'Analytics',
        why: 'She will read across the books, but you decide what counts as good.' }
    ]}
  ];


  // The team. Two things every roster needs — a role and a seat state — plus the one this
  // platform has to answer: what PAIGE may do on that person's behalf. A person's agent can
  // never exceed the person, and the person can never exceed the platform ceiling.

  // A tenant is not one company. A holding company signs up and brings subsidiaries and
  // operating entities with it \u2014 people belong to an entity, authority is scoped to it,
  // and who may sign is a property of the entity rather than the account.
  // The Business Vault — Pillar 2. Compliance obligations with an L1→L4 partner stack:
  // L1 is tracking we do ourselves, L2–L4 is where a real professional is required.
  P.VAULT_TIERS = {
    L1: { name: 'L1 · tracked', note: 'We track it and she prepares it', tone: 'var(--pg-positive)' },
    L2: { name: 'L2 · reviewed', note: 'A professional reviews before filing', tone: 'var(--pg-gold-deep)' },
    L3: { name: 'L3 · prepared', note: 'A professional prepares and files it', tone: 'var(--pg-violet)' },
    L4: { name: 'L4 · represented', note: 'A professional acts for you', tone: 'var(--pg-negative)' }
  };
  P.VAULT_GROUPS = [
    { id: 'formation', name: 'Formation and registration', note: 'The entity itself, and its right to operate' },
    { id: 'tax', name: 'Tax', note: 'Federal, state and local, on their own clocks' },
    { id: 'employment', name: 'Employment', note: 'Anyone who works here, however they are classified' },
    { id: 'licensing', name: 'Licensing and insurance', note: 'Permission to trade, and cover if it goes wrong' },
    { id: 'privacy', name: 'Data and privacy', note: 'What we hold on other people' },
    { id: 'contracts', name: 'Contracts', note: 'What we have signed, and what renews' }
  ];
  P.VAULT = [
    { g: 'formation', name: 'Delaware certificate of incorporation', owed: 'Delaware Secretary of State', due: 'Filed 11 Aug', cad: 'Once', state: 'filed', tier: 'L3', doc: 'certificate-of-incorporation.pdf', paige: 'Holds the document and cites it wherever the entity is named.' },
    { g: 'formation', name: 'Delaware franchise tax and annual report', owed: 'Delaware', due: 'Due 1 Mar', cad: 'Annual', state: 'due', tier: 'L2', doc: '', paige: 'Prepares the report from what we hold. A professional reviews before it files.' },
    { g: 'formation', name: 'Registered agent', owed: 'Delaware', due: 'Renews 11 Aug', cad: 'Annual', state: 'filed', tier: 'L1', doc: 'agent-appointment.pdf', paige: 'Watches the renewal date.' },
    { g: 'formation', name: 'Texas foreign qualification', owed: 'Texas Secretary of State', due: 'Overdue 21 days', cad: 'Once', state: 'overdue', tier: 'L3', doc: '', paige: 'Cannot file this. Operating in Texas without it accrues penalties per day.' },
    { g: 'tax', name: 'EIN', owed: 'IRS', due: 'Held', cad: 'Once', state: 'filed', tier: 'L1', doc: 'ein-letter.pdf', paige: 'Holds it masked and fills it wherever it is asked for.' },
    { g: 'tax', name: 'Federal income tax return', owed: 'IRS', due: 'Due 15 Apr', cad: 'Annual', state: 'due', tier: 'L3', doc: '', paige: 'Assembles the books. A CPA prepares and files.' },
    { g: 'tax', name: 'Quarterly estimated tax', owed: 'IRS', due: 'Due 15 Sep', cad: 'Quarterly', state: 'due', tier: 'L2', doc: '', paige: 'Computes the estimate from revenue she can read — which is nothing until the money spine lands.' },
    { g: 'tax', name: 'Sales tax registration', owed: 'Per state', due: '—', cad: 'Per state', state: 'none', tier: 'L2', doc: '', paige: 'Cannot judge nexus. That is a professional call about where you have customers.' },
    { g: 'employment', name: 'W-9 on file for each contractor', owed: 'You', due: '1 of 2 held', cad: 'Per person', state: 'due', tier: 'L1', doc: 'w9-contractor.pdf', paige: 'Requests the missing one and files it when it arrives.' },
    { g: 'employment', name: '1099-NEC filings', owed: 'IRS', due: 'Due 31 Jan', cad: 'Annual', state: 'due', tier: 'L2', doc: '', paige: 'Prepares from contractor payments. Needs the money spine to total them.' },
    { g: 'employment', name: 'Workers compensation', owed: 'State', due: '—', cad: 'Annual', state: 'none', tier: 'L4', doc: '', paige: 'Not required with no employees. Becomes required on the first hire.' },
    { g: 'licensing', name: 'General liability insurance', owed: 'Carrier', due: 'Lapsed 4 days', cad: 'Annual', state: 'lapsed', tier: 'L1', doc: 'gl-policy-2025.pdf', paige: 'Has the renewal quote. Binding it is yours — it is a payment and a signature.' },
    { g: 'licensing', name: 'Errors and omissions', owed: 'Carrier', due: 'Renews 2 Feb', cad: 'Annual', state: 'filed', tier: 'L1', doc: 'eo-policy.pdf', paige: 'Watches the renewal.' },
    { g: 'licensing', name: 'Trademark — PAIGE wordmark', owed: 'USPTO', due: 'Filed, pending', cad: 'Once', state: 'filed', tier: 'L4', doc: 'tm-application.pdf', paige: 'Tracks the examination. Any response to an office action is counsel.' },
    { g: 'privacy', name: 'Privacy policy', owed: 'Published', due: 'Current', cad: 'On change', state: 'filed', tier: 'L2', doc: 'privacy-policy.md', paige: 'Flags when a new data flow contradicts what it says.' },
    { g: 'privacy', name: 'Data processing agreements', owed: 'Each processor', due: '3 of 6 signed', cad: 'Per vendor', state: 'due', tier: 'L2', doc: '', paige: 'Knows which processors we use and which have no agreement.' },
    { g: 'privacy', name: 'Breach notification procedure', owed: 'Internal', due: 'Not written', cad: 'Once', state: 'none', tier: 'L3', doc: '', paige: 'Cannot write this. It commits you to timelines counsel should set.' },
    { g: 'contracts', name: 'Terms of service', owed: 'Published', due: 'Current', cad: 'On change', state: 'filed', tier: 'L2', doc: 'terms.md', paige: 'Flags when a shipped capability outruns what they permit.' },
    { g: 'contracts', name: 'Master services agreement template', owed: 'Internal', due: 'Current', cad: 'On change', state: 'filed', tier: 'L3', doc: 'msa-template.pdf', paige: 'Fills it per client. Changing a clause is counsel.' },
    { g: 'contracts', name: 'Vendor renewals', owed: 'Each vendor', due: '2 within 30 days', cad: 'Rolling', state: 'due', tier: 'L1', doc: '', paige: 'Watches every renewal date and tells you before it auto-renews.' }
  ];
  P.VAULT_PARTNERS = [
    { name: 'Corporate counsel', covers: 'Formation, trademark, contracts', tier: 'L3–L4' },
    { name: 'CPA', covers: 'Federal and state tax, 1099s', tier: 'L2–L3' },
    { name: 'Employment counsel', covers: 'Classification, hiring, policy', tier: 'L3' },
    { name: 'Privacy counsel', covers: 'DPAs, breach procedure, policy', tier: 'L3' },
    { name: 'Insurance broker', covers: 'GL, E&O, workers comp', tier: 'L1–L2' }
  ];

  P.ENTITIES = [
    { id: 'hold', name: 'AUTHORIZED TENANT \u00b7 holding', kind: 'Holding company', depth: 0,
      note: 'Signs for everything below it', ein: '00-0000000', state: 'Active', signer: 'You' },
    { id: 'ops', name: 'AUTHORIZED TENANT \u00b7 operations', kind: 'Operating entity', depth: 1,
      note: 'Where the work happens \u00b7 most seats live here', ein: '00-0000000', state: 'Active', signer: 'TEAM MEMBER \u00b7 exec' },
    { id: 'east', name: 'AUTHORIZED TENANT \u00b7 east', kind: 'Subsidiary', depth: 1,
      note: 'Own book, own P&L', ein: '\u2014 not on file', state: 'Active', signer: 'TEAM MEMBER \u00b7 am east' },
    { id: 'labs', name: 'AUTHORIZED TENANT \u00b7 labs', kind: 'Subsidiary', depth: 1,
      note: 'Products, not services', ein: '\u2014 not on file', state: 'Forming', signer: '\u2014 none named' },
    { id: 'legacy', name: 'AUTHORIZED TENANT \u00b7 legacy', kind: 'Dormant entity', depth: 2,
      note: 'Kept for records \u00b7 no seats, no acts', ein: '\u2014', state: 'Dormant', signer: '\u2014' }
  ];

  P.ROLES = [
    { id:'owner', name:'Owner', tier:'Executive', seats:1,
      does:'Everything, including authority and money. Cannot be removed.',
      books:['Fleet','Relationships','Campaigns','Marketplace','Analytics','Settings'],
      may:['Approve any act','Change the Trust Compass','Hold the second key','Add and remove people','Move money'],
      never:[], grant:'Autonomous', pii:'Full', tenants:'All' },
    { id:'exec', name:'Executive', tier:'Executive', seats:2,
      does:'Reads everything and approves the consequential. Does not configure.',
      books:['Fleet','Relationships','Campaigns','Marketplace','Analytics'],
      may:['Approve money','Approve an authority change','Read every book'],
      never:['Configure automations','Change integrations'], grant:'Act and report', pii:'Full', tenants:'All' },
    { id:'ops', name:'Operations manager', tier:'Operations', seats:3,
      does:'Runs the fleet: provisioning, the morning check, and what it leaves behind.',
      books:['Fleet','Analytics','Settings'],
      may:['Enter a tenant','Resolve a finding','Configure automations','Run a sweep'],
      never:['Move money','Change the platform ceiling'], grant:'Act and report', pii:'Full', tenants:'All' },
    { id:'am', name:'Account manager', tier:'Client-facing', seats:6,
      does:'Owns named accounts end to end — the record, the threads, the renewal.',
      books:['Fleet','Relationships','Campaigns','Analytics'],
      may:['Enter their own tenants','Edit a client record','Send on any channel','Move a deal'],
      never:['Enter a tenant they do not own','Change a plan'], grant:'Act and report', pii:'Full', tenants:'Assigned' },
    { id:'sales', name:'Sales rep', tier:'Client-facing', seats:8,
      does:'Works the pipeline and the conversations attached to their own deals.',
      books:['Relationships','Campaigns'],
      may:['Create a deal','Move their own deals','Send on any channel','Book a call'],
      never:['Discount without approval','See another rep\u2019s pipeline'], grant:'Ask first', pii:'Contact only', tenants:'None' },
    { id:'setter', name:'Appointment setter', tier:'Client-facing', seats:5,
      does:'Books calls. Does not negotiate, quote, or close.',
      books:['Relationships'],
      may:['Read a thread','Reply from an approved snippet','Book a call','Reschedule'],
      never:['Quote a price','Create a deal','Send a free-form message'], grant:'Draft only', pii:'Name and channel', tenants:'None' },
    { id:'support', name:'Support agent', tier:'Client-facing', seats:4,
      does:'Answers what comes in and escalates what it cannot answer.',
      books:['Relationships','Fleet'],
      may:['Read a thread','Reply','Read a client record','Raise an escalation'],
      never:['Move money','Edit a client record','Enter a tenant'], grant:'Ask first', pii:'Contact only', tenants:'Read only' },
    { id:'mkt', name:'Marketing', tier:'Growth', seats:3,
      does:'Owns outbound: campaigns, social, the listings we publish.',
      books:['Campaigns','Marketplace','Analytics'],
      may:['Build a campaign','Publish a post','List on the marketplace','Read attribution'],
      never:['See a client record','Send to an individual'], grant:'Ask first', pii:'None', tenants:'None' },
    { id:'analyst', name:'Analyst', tier:'Staff', seats:2,
      does:'Reads every book and writes to none.',
      books:['Fleet','Relationships','Campaigns','Marketplace','Analytics'],
      may:['Read everything','Export a report'],
      never:['Write anything','Send anything'], grant:'Observe', pii:'Aggregate only', tenants:'Read only' },
    { id:'contractor', name:'Contractor', tier:'Outside', seats:2,
      does:'Scoped to one tenant and one job, with an end date.',
      books:['Relationships'],
      may:['Work inside one tenant','Read what they were given'],
      never:['Leave their tenant','Read another account','Stay past the end date'], grant:'Draft only', pii:'Contact only', tenants:'One, time-boxed' },
    { id:'observer', name:'Observer', tier:'Outside', seats:1,
      does:'Sees the shape of the business and none of the people in it.',
      books:['Analytics'],
      may:['Read aggregate figures'],
      never:['See any client record','See any thread'], grant:'Observe', pii:'None', tenants:'None' }
  ];

  P.TEAM = [
    { id:'t1', ent:'hold', mono:'YO', name:'You', role:'owner', state:'Active', seen:'now', mfa:true, since:'Founding', paige:'Autonomous', note:'' },
    { id:'t2', ent:'hold', mono:'EX', name:'TEAM MEMBER \u00b7 exec', role:'exec', state:'Active', seen:'2h', mfa:true, since:'Mar', paige:'Act and report', note:'' },
    { id:'t3', ent:'ops', mono:'OL', name:'TEAM MEMBER \u00b7 ops lead', role:'ops', state:'Active', seen:'11m', mfa:true, since:'Apr', paige:'Act and report', note:'On call this week' },
    { id:'t4', ent:'ops', mono:'OP', name:'TEAM MEMBER \u00b7 ops', role:'ops', state:'Active', seen:'1d', mfa:false, since:'Jun', paige:'Ask first', note:'Two-factor not set' },
    { id:'t5', ent:'east', mono:'AE', name:'TEAM MEMBER \u00b7 am east', role:'am', state:'Active', seen:'40m', mfa:true, since:'Feb', paige:'Act and report', note:'4 tenants' },
    { id:'t6', ent:'ops', mono:'AW', name:'TEAM MEMBER \u00b7 am west', role:'am', state:'Active', seen:'3h', mfa:true, since:'May', paige:'Ask first', note:'2 tenants' },
    { id:'t7', ent:'ops', mono:'S1', name:'TEAM MEMBER \u00b7 sales 1', role:'sales', state:'Active', seen:'18m', mfa:true, since:'Jan', paige:'Ask first', note:'' },
    { id:'t8', ent:'east', mono:'S2', name:'TEAM MEMBER \u00b7 sales 2', role:'sales', state:'Invited', seen:'\u2014', mfa:false, since:'\u2014', paige:'Ask first', note:'Invite sent 2d ago' },
    { id:'t9', ent:'ops', mono:'P1', name:'TEAM MEMBER \u00b7 setter 1', role:'setter', state:'Active', seen:'6m', mfa:true, since:'Jul', paige:'Draft only', note:'' },
    { id:'t10', ent:'east', mono:'P2', name:'TEAM MEMBER \u00b7 setter 2', role:'setter', state:'Active', seen:'22m', mfa:true, since:'Jul', paige:'Draft only', note:'' },
    { id:'t11', ent:'ops', mono:'SU', name:'TEAM MEMBER \u00b7 support', role:'support', state:'Active', seen:'4m', mfa:true, since:'Mar', paige:'Ask first', note:'' },
    { id:'t12', ent:'hold', mono:'MK', name:'TEAM MEMBER \u00b7 marketing', role:'mkt', state:'Active', seen:'1h', mfa:true, since:'Apr', paige:'Ask first', note:'' },
    { id:'t13', ent:'ops', mono:'AN', name:'TEAM MEMBER \u00b7 analyst', role:'analyst', state:'Active', seen:'2d', mfa:true, since:'Jun', paige:'Observe', note:'' },
    { id:'t14', ent:'labs', mono:'CT', name:'OUTSIDE \u00b7 contractor', role:'contractor', state:'Expiring', seen:'5h', mfa:true, since:'Aug', paige:'Draft only', note:'Access ends in 9 days' },
    { id:'t15', ent:'east', mono:'FM', name:'TEAM MEMBER \u00b7 former', role:'sales', state:'Suspended', seen:'21d', mfa:true, since:'Feb', paige:'Observe', note:'Suspended 12 Aug \u00b7 record kept' }
  ];

  P.INVITES = [
    { id:'i1', to:'sales 2', role:'sales', sent:'2d ago', expires:'in 5 days', by:'You', state:'Waiting', link:'One use \u00b7 expires on accept' },
    { id:'i2', to:'setter 3', role:'setter', sent:'6h ago', expires:'in 7 days', by:'ops lead', state:'Waiting', link:'One use \u00b7 expires on accept' },
    { id:'i3', to:'analyst 2', role:'analyst', sent:'9d ago', expires:'expired', by:'You', state:'Expired', link:'Dead \u2014 send a new one' }
  ];


  // The governable tool catalogue, read from the shipped substrate rather than invented:
  // `public.tenant_tool_autonomy` (tenant_id, tool_key, mode) with modes auto|confirm|off,
  // resolved by `resolve_tool_autonomy()` and listed by `list_tool_autonomy()`.
  // Migration 20260711200000_paige_tool_autonomy.sql, extended by the n8n and Studio catalogs.
  //
  // Two schema guardrails matter to this surface and are enforced in the database, not here:
  //   send_via_approval  =>  requires_approval = true
  //   auto               =>  executor IN (record_only, workflow)
  // Together they make "auto-send" unrepresentable — a tool that reaches a person cannot be
  // put on autopilot at all. That is a structural rule, not a setting.
  P.TOOLS = [
    { k:'crm_create_contact',        n:'Add a contact',               c:'CRM',        x:'record_only', m:'confirm' },
    { k:'crm_update_contact',        n:'Update a contact',            c:'CRM',        x:'record_only', m:'confirm' },
    { k:'crm_delete_contact',        n:'Delete a contact',            c:'CRM',        x:'record_only', m:'off', set:1, why:'Deleting a record is not reversible from here.' },
    { k:'crm_assign_coach',          n:'Assign a coach',              c:'CRM',        x:'record_only', m:'confirm' },
    { k:'crm_assign_contact',        n:'Assign a contact',            c:'CRM',        x:'record_only', m:'auto', set:1 },
    { k:'crm_log_activity',          n:'Log an activity',             c:'CRM',        x:'record_only', m:'auto', set:1 },
    { k:'crm_update_pipeline_stage', n:"Move a client's stage",       c:'Pipeline',   x:'record_only', m:'confirm' },
    { k:'pipeline_create',           n:'Create a pipeline',           c:'Pipeline',   x:'record_only', m:'confirm' },
    { k:'pipeline_add_stage',        n:'Add a pipeline stage',        c:'Pipeline',   x:'record_only', m:'confirm' },
    { k:'crm_create_task',           n:'Create a task',               c:'Tasks',      x:'record_only', m:'auto', set:1 },
    { k:'member_grant_role',         n:'Grant a staff role',          c:'Team',       x:'record_only', m:'off', set:1, why:'Granting access is an authority change. It stays yours.' },
    { k:'member_revoke_role',        n:'Revoke a staff role',         c:'Team',       x:'record_only', m:'off', set:1, why:'Revoking access is an authority change. It stays yours.' },
    { k:'calendar_book_meeting',     n:'Book a meeting',              c:'Calendar',   x:'send_via_approval', m:'confirm' },
    { k:'program_enroll',            n:'Enroll a client in a program',c:'Programs',   x:'record_only', m:'confirm' },
    { k:'draft_marketing_content',   n:'Draft marketing content',     c:'Content',    x:'record_only', m:'auto', set:1 },
    { k:'generate_image',            n:'Generate an image',           c:'Content',    x:'record_only', m:'confirm' },
    { k:'content_save',              n:'Save marketing content',      c:'Content',    x:'record_only', m:'auto', set:1 },
    { k:'growth_page_save',          n:'Save a landing page draft',   c:'Studio',     x:'record_only', m:'confirm' },
    { k:'growth_page_publish',       n:'Publish a landing page',      c:'Studio',     x:'send_via_approval', m:'confirm' },
    { k:'growth_funnel_build',       n:'Build a funnel',              c:'Studio',     x:'record_only', m:'confirm' },
    { k:'growth_funnel_publish',     n:'Publish a funnel',            c:'Studio',     x:'send_via_approval', m:'confirm' },
    { k:'action_file',               n:'File an action',              c:'Action bus', x:'record_only', m:'auto', set:1 },
    { k:'action_advance',            n:'Advance an action',           c:'Action bus', x:'workflow',    m:'confirm' },
    // Gated at runtime, absent from list_tool_autonomy: the Studio migration re-declared the
    // catalogue from a pre-n8n copy, so these four are governed but invisible in settings.
    { k:'n8n_create_workflow',       n:'Create an automation',        c:'Automations', x:'workflow', m:'confirm', ghost:1 },
    { k:'n8n_update_workflow',       n:'Edit an automation',          c:'Automations', x:'workflow', m:'confirm', ghost:1 },
    { k:'n8n_activate_workflow',     n:'Turn on an automation',       c:'Automations', x:'workflow', m:'confirm', ghost:1 },
    { k:'n8n_deactivate_workflow',   n:'Turn off an automation',      c:'Automations', x:'workflow', m:'confirm', ghost:1 }
  ];

  P.TOOL_MODES = {
    auto:    { label:'Autopilot',  tone:'var(--pg-positive)',  note:'She does it herself, no confirmation.' },
    confirm: { label:'Ask first',  tone:'var(--pg-gold-deep)', note:'She proposes it, echoes exactly what she will do, and waits.' },
    off:     { label:'Off',        tone:'var(--pg-faint)',     note:'Disabled here. She cannot run it at all.' }
  };

  P.TOOL_CATS = ['CRM','Pipeline','Tasks','Team','Calendar','Programs','Content','Studio','Action bus','Automations'];

  P.CALENDARS = [
    { id: 'ops', name: 'Operator', type: 'personal', purpose: 'Your own time', owner: 'You', types: 3, src: 'Not connected', vis: 'Private', primary: true },
    { id: 'onb', name: 'Onboarding', type: 'pool', purpose: 'Kickoffs and reviews', owner: 'Onboarding \u00b7 2 seats', types: 2, src: 'Not connected', vis: 'Team' },
    { id: 'sup', name: 'Support rota', type: 'rota', purpose: 'Callbacks, whoever is on', owner: 'Support \u00b7 2 seats', types: 1, src: 'Not connected', vis: 'Team' },
    { id: 'evt', name: 'Events', type: 'events', purpose: 'Workshops and anything live', owner: 'You', types: 2, src: 'Not connected', vis: 'Public' }
  ];

  P.BOOK_STRATEGY = {
    'Round robin':    'Rotates through the pool, evenly by count. The fairness counter is what makes it round robin rather than random.',
    'First available': 'Whoever has the earliest open slot takes it. Fastest for the person booking, unevenly loaded for the pool.',
    'Least booked':   'Whoever is carrying the least this week. Evens load rather than order.',
    'Specific host':  'One person owns it. No pool, no rotation.',
    'Collective':     'Every host must be free. The slot is the intersection of all their calendars, so it books rarely and matters when it does.'
  };

  P.BOOKTYPES = [
    { id: 'discovery', name: 'Discovery call', kind: '1:1', dur: '30 min', cap: 1,
      hosts: ['You'], strategy: 'Specific host', where: 'Video',
      reminders: [['24 hours before', 'Email', 'ok'], ['15 minutes before', 'SMS', 'ok']],
      after: [['Draft the follow-up', 'She writes it, you send it', 'ask'], ['File notes to the record', 'Automatic', 'auto']],
      state: 'Needs a calendar', bookings: '\u2014' },
    { id: 'kickoff', name: 'Onboarding kickoff', kind: '1:1', dur: '60 min', cap: 1,
      hosts: ['You', 'Onboarding \u00b7 seat A', 'Onboarding \u00b7 seat B'], strategy: 'Round robin', where: 'Video',
      reminders: [['48 hours before', 'Email', 'ok'], ['15 minutes before', 'SMS', 'ok']],
      after: [['Draft the follow-up', 'She writes it, you send it', 'ask'], ['Open the onboarding checklist', 'Automatic', 'auto'], ['Advance the deal a stage', 'Needs your word', 'ask']],
      state: 'Needs 3 host calendars', bookings: '\u2014' },
    { id: 'callback', name: 'Support callback', kind: '1:1', dur: '15 min', cap: 1,
      hosts: ['Support \u00b7 seat A', 'Support \u00b7 seat B'], strategy: 'Least booked', where: 'Phone',
      reminders: [['15 minutes before', 'SMS', 'ok']],
      after: [['File the call notes', 'She takes them live', 'auto'], ['Close or escalate', 'Needs your word', 'ask']],
      state: 'No voice substrate', bookings: '\u2014' },
    { id: 'workshop', name: 'Reseller workshop', kind: 'Group', dur: '90 min', cap: 25,
      hosts: ['You', 'Onboarding \u00b7 seat A'], strategy: 'Collective', where: 'Video',
      reminders: [['1 week before', 'Email', 'ok'], ['1 day before', 'Email', 'ok'], ['15 minutes before', 'SMS', 'ok']],
      after: [['Send the recording', 'Needs a recording seam', 'gap'], ['Draft a follow-up per attendee', 'She writes them, you send', 'ask']],
      state: 'Needs a group invite', bookings: '\u2014' },
    { id: 'live', name: 'Platform live', kind: 'Broadcast', dur: '60 min', cap: 100,
      hosts: ['You'], strategy: 'Specific host', where: 'Stream',
      reminders: [['1 week before', 'Email', 'ok'], ['1 day before', 'Email', 'ok'], ['15 minutes before', 'SMS', 'ok']],
      after: [['Publish the replay', 'Needs a streaming seam', 'gap'], ['Segment by who attended', 'Needs the attendance record', 'gap']],
      state: 'No streaming substrate', bookings: '\u2014' },
    { id: 'review', name: 'Quarterly review', kind: '1:1', dur: '45 min', cap: 1,
      hosts: ['You', 'Onboarding \u00b7 seat A'], strategy: 'Collective', where: 'Video',
      reminders: [['1 week before', 'Email', 'ok'], ['1 day before', 'Email', 'ok']],
      after: [['Draft the summary', 'She writes it, you send it', 'ask']],
      state: 'Needs 2 host calendars', bookings: '\u2014' }
  ];

  // Who takes what. Round robin needs three things: several hosts, each with a connected
  // calendar, and a fairness counter. None of the three exists at operator scope.
  P.HOSTS = [
    { name: 'You \u00b7 operator', role: 'Owner', cal: 'Not connected', taking: 'Everything', load: '\u2014', live: false },
    { name: 'Onboarding \u00b7 seat A', role: 'Host', cal: 'Not connected', taking: 'Kickoff, workshop, review', load: '\u2014', live: false },
    { name: 'Onboarding \u00b7 seat B', role: 'Host', cal: 'Not connected', taking: 'Kickoff', load: '\u2014', live: false },
    { name: 'Support \u00b7 seat A', role: 'Host', cal: 'Not connected', taking: 'Callbacks', load: '\u2014', live: false },
    { name: 'Support \u00b7 seat B', role: 'Host', cal: 'Not connected', taking: 'Callbacks', load: '\u2014', live: false },
    { name: 'PAIGE', role: 'Agent', cal: 'Reads yours', taking: 'Drafts and reminders', load: 'always', live: true }
  ];

  P.CALSET = [
    { k: 'Working hours', v: '09:00 \u2013 18:00 \u00b7 Mon to Fri', note: 'Outside these she schedules nothing without asking', state: 'set' },
    { k: 'Protected focus', v: '13:00 \u2013 15:00 daily', note: 'She holds outbound and books nothing over it', state: 'set' },
    { k: 'Quiet hours', v: '21:00 \u2013 07:00', note: 'Enforced on every channel by the quiet-hours automation', state: 'set' },
    { k: 'Meeting length', v: '30 minutes default', note: 'What she offers when she proposes a time', state: 'set' },
    { k: 'Buffer between meetings', v: '10 minutes', note: 'She will not book back to back', state: 'set' },
    { k: 'She may book without asking', v: 'Internal only', note: 'A client-facing booking is an authority gate', state: 'set' },
    { k: 'Calendar source', v: '\u2014', note: 'Nothing connected \u2014 connect one in Integrations', state: 'missing' },
    { k: 'Timezone', v: '\u2014', note: 'Read from the connected calendar', state: 'missing' }
  ];

  P.SANDBOX = {
    files: [
      { name: 'drift_read.py', lang: 'Python', size: '1.4 kB', touched: '06:31',
        note: 'Reads a tenant config and reports what it could not parse',
        body: 'def read_drift(tenant):\n    """Report what the config does not parse.\n\n    Returns findings, never a fix \u2014 repair is a separate grant.\n    """\n    cfg = fetch_config(tenant)\n    unread = [k for k, v in cfg.items() if not parses(v)]\n    if not unread:\n        return Finding.none()\n    return Finding(\n        kind="drift_unreadable",\n        keys=unread,\n        blocking=False,\n    )' },
      { name: 'stalled_deals.sql', lang: 'SQL', size: '0.6 kB', touched: 'yesterday',
        note: 'Deals past their stage target, by owner',
        body: 'select d.id, d.name, d.stage, d.owner,\n       age(now(), d.stage_entered_at) as in_stage\nfrom deals d\njoin stages s on s.key = d.stage\nwhere d.state = \'open\'\n  and age(now(), d.stage_entered_at) > s.target_interval\norder by in_stage desc;' },
      { name: 'sweep_summary.md', lang: 'Markdown', size: '0.9 kB', touched: '06:34',
        note: 'The shape of the morning brief she writes',
        body: '# Overnight\n\n{{passing}} of {{total}} checks passed. {{failing}} failing, {{skipped}} could not run.\n\n## Held for you\n{{#each held}}\n- **{{name}}** \u2014 {{why}}\n{{/each}}\n\n## Acted alone\n{{#if acted}}{{acted}} acts, all recorded.{{else}}Nothing. At this ceiling she reports rather than fixes.{{/if}}' }
    ],
    runs: [
      { when: '\u2014', what: 'No run on record', state: 'No substrate', tone: 'var(--pg-negative)' }
    ],
    limits: [
      ['Runtime', 'not provisioned'],
      ['Memory ceiling', 'not provisioned'],
      ['Wall clock', 'not provisioned'],
      ['Network egress', 'denied by default'],
      ['Filesystem', 'scratch only, dropped at session end']
    ]
  };

  P.SCOPES = [
    { kicker: 'Platform scope', scope: 'No tenant \u00b7 operator surface', audit: 'tenant_id IS NULL', tone: 'none' },
    { kicker: 'Reading', scope: 'AUTHORIZED TENANT \u00b7 0f3a', audit: 'aggregate read \u00b7 no write', tone: 'read' },
    { kicker: 'Acting as', scope: 'AUTHORIZED TENANT \u00b7 0f3a', audit: 'paige_audit_log \u00b7 session open', tone: 'act' }
  ];

  P.FIELD_HOURS = ['09', '10', '11', '13', '14', '15'];
  P.FIELD_PLAN = {
    '09': { 0: 'appointment', 2: 'agent' },
    '10': { 1: 'meeting', 3: 'task' },
    '11': { 0: 'milestone', 4: 'agent' },
    '13': { 2: 'focus', 3: 'focus' },
    '14': { 1: 'approval', 4: 'now' },
    '15': { 0: 'followup', 2: 'artifact' }
  };
  P.FIELD_KINDS = {
    appointment: { label: 'Tenant review', meta: '45m \u00b7 external', style: 'padding:6px 8px;background:var(--pg-surface);border-left:2px solid var(--pg-ink-2)' },
    meeting: { label: 'Fleet standup', meta: '30m \u00b7 internal', style: 'padding:6px 8px;background:var(--pg-surface)' },
    task: { label: 'Ack firing', meta: 'due 10:00', style: 'padding:6px 0;border-top:1px solid var(--pg-line-strong)' },
    focus: { label: 'Protected', meta: 'unavailable', style: 'padding:6px 8px;background:repeating-linear-gradient(135deg,var(--pg-surface) 0 5px,transparent 5px 10px)' },
    agent: { label: 'Sweep running', meta: 'PAIGE \u00b7 4m', style: 'padding:6px 8px;background:var(--pg-surface);border-left:2px solid var(--pg-violet)' },
    approval: { label: 'Tenant entry', meta: 'waiting on you', style: 'padding:6px 8px;background:var(--pg-raised);border:1px solid var(--pg-line-authority);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))' },
    milestone: { label: 'Stage 2 sign-off', meta: 'Friday', style: 'padding:6px 0;border-top:1px solid var(--pg-gold-deep)' },
    followup: { label: 'Follow-up', meta: 'proposed', style: 'padding:6px 8px;border:1px dashed var(--pg-line-strong)' },
    artifact: { label: 'Design package', meta: 'v3 \u00b7 reviewed', style: 'padding:6px 8px;background:var(--pg-artifact);color:#211e1e' },
    now: { label: 'Now', meta: '14:22', style: 'padding:0;border-top:1px solid var(--pg-gold);opacity:.85' }
  };

  window.PAIGE_IA = P;
  window.dispatchEvent(new Event('paige-ia-ready'));
})();
