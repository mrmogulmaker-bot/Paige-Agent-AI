/**
 * Integrations → MCP tools (the Connected MCP Gateway experience).
 *
 * Mounts inside the existing Solo Settings → Integrations surface (SoloIntegrationsView).
 * It lists the tenant's gateway tools, adds one by browsing the tool catalogue, and opens a
 * detail drawer to re-key or disconnect. Owner ruling 2026-09-22 (Option C): Integrations is the
 * only home; "connections" is a Communications word and is not used for this surface's identifiers
 * or copy (INT-147). The catalogue is folded into the add path — one catalogue, no second surface
 * (§18). The MCP RPC names are DB contracts and are unchanged; only the UI vocabulary is
 * Integrations-domain.
 *
 * Visual direction is the approved Claude Design pack (Connections Studio v5), ported through the
 * incumbent `.ig-*` design system and `--pg-*` tokens (§00 — recorded and ported, never invented).
 * Legacy n8n/Zapier live-panel routing and the Social surface stay in their existing drawers; the
 * catalogue's n8n/Zapier/Social tiles call back to those (§58 — nothing reimplemented, nothing
 * removed).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { armOAuthReturn } from "./data/oauthReturn";
import {
  MCP_CREDENTIAL_MIN_LENGTH,
  credentialTooShort,
  type GatewayConnection,
  type GatewayAuthKind,
  type UseMcpGateway,
} from "./data/useMcpGateway";

/* ── Provider catalogue (browse the gateway) ──────────────────────────────────
   Ported from the approved pack: each vendor's connect-mode reflects its real MCP capability
   (researched 2026-09-22). mode: connect = one-click sign-in, WIRED as of Slice ④ (it runs the
   gateway's oauth_begin door; it read "coming soon" only while no browser could reach that door);
   key = paste a key/token; setup = platform pre-registration pending; zapier = no direct path,
   bridge via Zapier. `legacy` routes n8n/Zapier/social tiles to
   the existing live drawers rather than the gateway add flow. `verify` is a research-only tag and is
   never rendered to a tenant. */
type CatMode = "connect" | "key" | "setup" | "zapier" | "review";
/** The three catalogue entries whose connect flow is already shipped elsewhere on this
 *  surface. Their tiles route to the live drawers rather than reimplementing them (§58). */
export type GatewayLegacyTarget = "n8n" | "zapier" | "social";
type CatLegacy = GatewayLegacyTarget;
type CatItem = {
  n: string;
  c: string;
  m: CatMode;
  g: string;
  d: string;
  auth?: "bearer" | "header";
  net?: string;
  url?: string;
  pop?: boolean;
  /** ordering weight for the Popular row */
  r?: number;
  /** route this tile to an existing live drawer instead of the gateway add flow */
  legacy?: CatLegacy;
  /** the generic entry: it opens the form with nothing prefilled, since it names no vendor */
  manual?: true;
};

const CAT_CATEGORIES = [
  "All",
  "Social",
  "CRM & Sales",
  "Marketing & Email",
  "Creative",
  "Productivity",
  "Finance",
  "Admin/HR/Docs",
  "Support",
  "Websites & E-commerce",
  "Automation hubs",
] as const;

const CATALOGUE: ReadonlyArray<CatItem> = [
  // Social
  { n: "Meta Ads", c: "Social", m: "connect", g: "M", d: "Ads reporting + campaign management. No organic posting.", pop: true, r: 14, url: "https://mcp.facebook.com/ads" },
  { n: "Buffer", c: "Social", m: "review", auth: "bearer", g: "B", d: "Schedule posts, drafts, analytics.", pop: true, r: 9, net: "Posts to Instagram, Facebook, LinkedIn, TikTok, YouTube, Pinterest + more.", url: "https://mcp.buffer.com/mcp" },
  { n: "Metricool", c: "Social", m: "connect", g: "Mc", d: "Multi-brand posting, analytics, inbox. Free plan works.", pop: true, r: 10, net: "Posts to Instagram, Facebook, LinkedIn, TikTok, YouTube.", url: "https://ai.metricool.com/mcp" },
  { n: "Hootsuite", c: "Social", m: "connect", g: "H", d: "Draft, schedule, analytics, inbox, listening. Paid plan.", net: "Posts to Instagram, Facebook, LinkedIn, TikTok, YouTube.", url: "https://mcp.hootsuite.com/perch" },
  { n: "X (Twitter)", c: "Social", m: "review", auth: "bearer", g: "X", d: "Reads: search, trends, bookmarks. Posting needs X's own bridge.", url: "https://api.x.com/mcp" },
  { n: "Instagram · Facebook · LinkedIn · TikTok · YouTube", c: "Social", m: "zapier", g: "◎", d: "No official direct path — post through Buffer, Metricool or Hootsuite.", legacy: "social" },
  { n: "WhatsApp Business", c: "Social", m: "zapier", g: "W", d: "Business Tools MCP announced; not verified yet. Bridge via Zapier." },
  // CRM & Sales
  { n: "HighLevel", c: "CRM & Sales", m: "connect", g: "HL", d: "Contacts, conversations (SMS/email), pipelines, calendars, invoices.", pop: true, r: 1, url: "https://services.leadconnectorhq.com/mcp/anthropic/v2" },
  { n: "HubSpot", c: "CRM & Sales", m: "zapier", g: "HS", d: "CRM records, activities, pipelines. No direct path for Paige yet — bridge via Zapier." },
  { n: "Close", c: "CRM & Sales", m: "connect", g: "C", d: "Leads, contacts, opportunities; read and write scopes.", pop: true, r: 13, url: "https://mcp.close.com/mcp" },
  { n: "Attio", c: "CRM & Sales", m: "connect", g: "A", d: "Records, lists, notes, tasks.", url: "https://mcp.attio.com/mcp" },
  { n: "Apollo.io", c: "CRM & Sales", m: "connect", g: "Ap", d: "People/company search, enrichment, sequences. Not on the free plan.", url: "https://mcp.apollo.io/mcp" },
  { n: "Pipedrive", c: "CRM & Sales", m: "connect", g: "P", d: "Deals, contacts, leads, activities." },
  { n: "Zoho CRM", c: "CRM & Sales", m: "connect", g: "Z", d: "Record CRUD, workflows. Per-account URL." },
  { n: "Salesforce", c: "CRM & Sales", m: "setup", g: "SF", d: "Records, Flows, Apex. Your admin creates an External Client App first." },
  { n: "ActiveCampaign", c: "CRM & Sales", m: "setup", g: "AC", d: "Contacts, automations. Platform verification pending." },
  { n: "Keap", c: "CRM & Sales", m: "zapier", g: "K", d: "No official server — bridge via Zapier." },
  // Marketing & Email
  { n: "Klaviyo", c: "Marketing & Email", m: "connect", g: "Kl", d: "Campaign and flow analytics, segments, create campaigns.", pop: true, r: 12, url: "https://mcp.klaviyo.com/mcp" },
  { n: "Resend", c: "Marketing & Email", m: "connect", g: "R", d: "Send email, templates, contacts, broadcasts, domains.", pop: true, r: 20, url: "https://mcp.resend.com/mcp" },
  { n: "Brevo", c: "Marketing & Email", m: "review", auth: "bearer", g: "Bv", d: "Contacts, email/SMS campaigns, templates, light CRM.", url: "https://mcp.brevo.com/v1/brevo/mcp" },
  { n: "Kit (ConvertKit)", c: "Marketing & Email", m: "connect", g: "Kt", d: "Subscribers, tags, broadcasts, landing pages. Creator plan.", url: "https://app.kit.com/mcp" },
  { n: "Mailchimp Transactional", c: "Marketing & Email", m: "review", auth: "bearer", g: "Mt", d: "Mandrill: templates, send diagnostics.", url: "https://mandrillapp.com/mcp" },
  { n: "Mailchimp Marketing", c: "Marketing & Email", m: "zapier", g: "Mk", d: "Not confirmed — use Transactional, or bridge via Zapier." },
  { n: "Google Ads", c: "Marketing & Email", m: "zapier", g: "GA", d: "Official server is local + read-only — bridge via Zapier." },
  // Creative
  { n: "Gamma", c: "Creative", m: "connect", g: "G", d: "Generate decks, docs, sites; export.", url: "https://mcp.gamma.app/mcp" },
  { n: "ElevenLabs", c: "Creative", m: "connect", g: "11", d: "Voice agents, TTS, image, video, music.", url: "https://api.elevenlabs.io/v1/mcp" },
  { n: "Canva", c: "Creative", m: "setup", g: "Cv", d: "Generate/edit designs, export. Platform sign-in registration pending.", pop: true, r: 11, url: "https://mcp.canva.com/mcp" },
  { n: "Descript", c: "Creative", m: "connect", g: "D", d: "Import, edit, publish, transcripts. Per-account URL." },
  { n: "Figma", c: "Creative", m: "zapier", g: "F", d: "Allowlist only (Figma MCP catalog) — not open to Paige yet." },
  { n: "Adobe", c: "Creative", m: "zapier", g: "Ad", d: "Claude-only today — bridge via Zapier." },
  // Productivity
  { n: "Notion", c: "Productivity", m: "connect", g: "N", d: "Search, create and update pages + databases.", pop: true, r: 7, url: "https://mcp.notion.com/mcp" },
  { n: "Calendly", c: "Productivity", m: "connect", g: "Cd", d: "Availability, event types, booking.", pop: true, r: 5, url: "https://mcp.calendly.com" },
  { n: "Airtable", c: "Productivity", m: "connect", g: "At", d: "Records CRUD, bases, automations.", pop: true, r: 16, url: "https://mcp.airtable.com/mcp" },
  { n: "ClickUp", c: "Productivity", m: "connect", g: "Cu", d: "Tasks, docs, time tracking.", pop: true, r: 17, url: "https://mcp.clickup.com/mcp" },
  { n: "Fireflies", c: "Productivity", m: "connect", g: "Ff", d: "Meeting transcripts, summaries.", pop: true, r: 19, url: "https://api.fireflies.ai/mcp" },
  { n: "Trello", c: "Productivity", m: "connect", g: "T", d: "Boards, cards, checklists.", url: "https://mcp.trello.com/v1" },
  { n: "Todoist", c: "Productivity", m: "connect", g: "Td", d: "Tasks, projects.", url: "https://ai.todoist.net/mcp" },
  { n: "Linear", c: "Productivity", m: "connect", g: "L", d: "Issues, projects.", url: "https://mcp.linear.app/mcp" },
  { n: "monday.com", c: "Productivity", m: "connect", g: "mo", d: "60+ read/write tools.", url: "https://mcp.monday.com/mcp" },
  { n: "Google Workspace", c: "Productivity", m: "setup", g: "GW", d: "Gmail, Calendar, Drive. Developer Preview + per-client setup — bridge via Zapier meanwhile.", pop: true, r: 2 },
  { n: "Microsoft 365", c: "Productivity", m: "zapier", g: "MS", d: "Mail, Calendar, Teams. No direct path for Paige yet — bridge via Zapier." },
  { n: "Slack", c: "Productivity", m: "setup", g: "Sl", d: "Search/read/send messages, files. Workspace admin approval.", url: "https://mcp.slack.com/mcp" },
  { n: "Asana", c: "Productivity", m: "setup", g: "As", d: "Tasks, projects.", url: "https://mcp.asana.com/v2/mcp" },
  { n: "Zoom", c: "Productivity", m: "setup", g: "Zm", d: "Meetings, recordings, notes." },
  { n: "Miro", c: "Productivity", m: "setup", g: "Mi", d: "Boards, diagrams. Verify + register." },
  { n: "Fathom", c: "Productivity", m: "zapier", g: "Fa", d: "Not confirmed — bridge via Zapier." },
  // Finance
  { n: "Stripe", c: "Finance", m: "connect", g: "S", d: "Customers, invoices, payment links, subscriptions. Refunds need your confirmation.", pop: true, r: 3, url: "https://mcp.stripe.com" },
  { n: "PayPal", c: "Finance", m: "review", auth: "bearer", g: "PP", d: "Invoices, payments.", url: "https://mcp.paypal.com" },
  { n: "Mercury", c: "Finance", m: "connect", g: "Me", d: "Balances, transactions (read-only).", url: "https://mcp.mercury.com/mcp" },
  { n: "Ramp", c: "Finance", m: "connect", g: "Rp", d: "Spend and expense analysis." },
  { n: "Brex", c: "Finance", m: "connect", g: "Bx", d: "Expenses, receipts. Admin.", url: "https://api.brex.com/mcp" },
  { n: "QuickBooks", c: "Finance", m: "zapier", g: "QB", d: "Blocked for third-party apps today — bridge via Zapier.", pop: true, r: 8 },
  { n: "Square", c: "Finance", m: "zapier", g: "Sq", d: "SSE-only beta — not supported by the gateway yet. Bridge via Zapier." },
  { n: "Xero", c: "Finance", m: "zapier", g: "Xo", d: "Local-only server — bridge via Zapier." },
  { n: "Plaid", c: "Finance", m: "zapier", g: "Pl", d: "Dashboard-only; no end-user bank data — not available." },
  // Admin/HR/Docs
  { n: "PandaDoc", c: "Admin/HR/Docs", m: "connect", g: "PD", d: "Documents from templates, send, track.", pop: true, r: 15, url: "https://mcp.pandadoc.com/v1/mcp" },
  { n: "Gusto", c: "Admin/HR/Docs", m: "connect", g: "Gu", d: "Payroll, employees, time, onboarding. Writes need your confirmation.", pop: true, r: 18, url: "https://mcp.api.gusto.com" },
  { n: "Dropbox", c: "Admin/HR/Docs", m: "connect", g: "Db", d: "Files CRUD, search, shared links.", url: "https://mcp.dropbox.com/mcp" },
  { n: "Typeform", c: "Admin/HR/Docs", m: "connect", g: "Tf", d: "Forms, responses, automations.", url: "https://api.typeform.com/mcp" },
  { n: "DocuSign", c: "Admin/HR/Docs", m: "connect", g: "DS", d: "Envelopes, signing status. Beta.", url: "https://mcp.docusign.com/mcp" },
  { n: "Box", c: "Admin/HR/Docs", m: "setup", g: "Bo", d: "File search/read, AI extraction. Admin + platform registration.", url: "https://mcp.box.com" },
  { n: "Jotform", c: "Admin/HR/Docs", m: "setup", g: "Jf", d: "Forms, submissions. Verify + register." },
  { n: "Rippling · BambooHR · Dropbox Sign", c: "Admin/HR/Docs", m: "zapier", g: "HR", d: "No official server — bridge via Zapier." },
  // Support
  { n: "Intercom", c: "Support", m: "connect", g: "In", d: "Users, conversations, notes, Help Center. US/EU.", url: "https://mcp.intercom.com/mcp" },
  { n: "Help Scout", c: "Support", m: "connect", g: "Hs", d: "Search conversations and customers (read-only)." },
  { n: "Front", c: "Support", m: "setup", g: "Fr", d: "Conversations, drafts, tags, contacts. Beta.", url: "https://mcp.frontapp.com/mcp" },
  { n: "Zendesk", c: "Support", m: "zapier", g: "Zd", d: "Not confirmed — bridge via Zapier." },
  { n: "Twilio (SMS)", c: "Support", m: "zapier", g: "Tw", d: "No sending server — send SMS via HighLevel or Brevo." },
  // Websites & E-commerce
  { n: "Webflow", c: "Websites & E-commerce", m: "connect", g: "Wf", d: "Sites, CMS, pages.", url: "https://mcp.webflow.com/mcp" },
  { n: "Wix", c: "Websites & E-commerce", m: "connect", g: "Wx", d: "Products, orders, bookings, blog.", url: "https://mcp.wix.com/mcp" },
  { n: "WordPress.com", c: "Websites & E-commerce", m: "connect", g: "WP", d: "Sites, posts. Paid plan.", url: "https://public-api.wordpress.com/wpcom/v2/mcp/v1" },
  { n: "WooCommerce", c: "Websites & E-commerce", m: "review", auth: "header", g: "Wo", d: "Products, orders. Your store URL + application password." },
  { n: "Shopify", c: "Websites & E-commerce", m: "zapier", g: "Sh", d: "Claude/ChatGPT-only connector — bridge via Zapier." },
  { n: "Squarespace", c: "Websites & E-commerce", m: "zapier", g: "Sq", d: "Domain search only today — full site ops via Zapier." },
  // Automation hubs
  { n: "Zapier", c: "Automation hubs", m: "key", g: "Z", d: "8,000+ app actions. The bridge for everything without a direct server.", pop: true, r: 6, legacy: "zapier" },
  { n: "n8n", c: "Automation hubs", m: "key", g: "n8", d: "Search/run/create workflows. API key today; sign-in (MCP) coming.", legacy: "n8n" },
  { n: "Composio", c: "Automation hubs", m: "review", auth: "header", g: "Co", d: "Per-toolkit servers across many APIs.", url: "https://backend.composio.dev/v3/mcp" },
  { n: "Pipedream", c: "Automation hubs", m: "setup", g: "Pd", d: "3,000+ APIs. Needs multi-header support (coming to the gateway)." },
  { n: "Make", c: "Automation hubs", m: "zapier", g: "Mk", d: "SSE transport — not supported by the gateway yet. Bridge via Zapier." },
];

const MODE_LABEL: Record<CatMode, string> = {
  connect: "Sign in",
  key: "Paste key",
  setup: "Setup needed",
  zapier: "Use Zapier",
  review: "Not cleared yet",
};

/* ── Status → owner-facing chip ───────────────────────────────────────────────
   Ported honesty: a new or re-keyed tool is "Checking" until the verify step promotes it; it is
   never shown as ready before then. Tone words match the incumbent surface's data-* tones. */
type ChipTone = "ok" | "warn" | "bad" | "pending" | "off";
function statusChip(c: GatewayConnection): { label: string; tone: ChipTone } {
  if (!c.enabled) return { label: "Turned off", tone: "off" };
  if (c.status === "error") return { label: "Couldn’t reach it", tone: "bad" };
  if (c.status === "pending_verification") return { label: "Not checked yet", tone: "pending" };
  if (c.status === "connected" && c.health === "needs_attention") return { label: "Needs attention", tone: "warn" };
  if (c.status === "connected" && c.health === "healthy") return { label: "Ready", tone: "ok" };
  if (c.status === "connected") return { label: "Not checked yet", tone: "pending" };
  return { label: "Not set up", tone: "off" };
}
function usable(c: GatewayConnection): boolean {
  return c.enabled && c.status === "connected" && c.health === "healthy";
}
function facetName(c: GatewayConnection): string {
  if (c.providerKey === "zapier") return "Zapier · sign-in";
  if (c.providerKey === "n8n") return c.authKind === "api_key" ? "n8n · API key" : "n8n · sign-in";
  return `Remote MCP · ${c.authKind ?? "—"}`;
}

/* ── Drawer wrapper (matches the incumbent .ig-panel dialog idiom) ─────────────
   Same focus trap, Escape, focus-restore and dirty-guard as LegacyProviderPanel/N8nDrawer, so this
   surface's overlays behave identically to the ones already shipped. */
function GatewayDrawer({
  title,
  eyebrow,
  dirty = false,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow: string;
  dirty?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty) { setConfirmingClose(true); return; }
    onClose();
  }, [dirty, onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { requestClose(); return; }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!panel.contains(active)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);
  return (
    <div className="ig-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside className="ig-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ig-gw-title">
        <header>
          <span className="ss-provider-mark" data-provider-mark="mcp" aria-hidden>gw</span>
          <div><span className="ig-gw-eyebrow">{eyebrow}</span><h2 id="ig-gw-title">{title}</h2></div>
          <button ref={closeRef} type="button" className="ig-close" onClick={requestClose} aria-label={`Close ${title}`}><X aria-hidden size={16} /></button>
        </header>
        <div className="ig-panel-body">
          {confirmingClose && (
            <div className="ig-confirm-close" role="alertdialog" aria-label="Discard changes">
              <p>You have unsaved details here. Close anyway?</p>
              <div className="ig-actions">
                <button type="button" className="ig-btn" data-danger onClick={onClose}>Discard them</button>
                <button type="button" className="ig-btn" onClick={() => setConfirmingClose(false)}>Keep editing</button>
              </div>
            </div>
          )}
          {children}
        </div>
        {footer && <footer className="ig-gw-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/* ── Add flow ─────────────────────────────────────────────────────────────────
   The catalogue IS the add path (§18). A tile picks the facet + prefills the endpoint; the form then
   collects only the credential that auth_kind uses. OAuth ("connect") is an honest stop until the
   sign-in step ships; Zapier/n8n route to the existing live panel; "setup" is an honest stop. */
type AddPreset = { facet: "generic-remote" | "n8n-rest"; authKind: GatewayAuthKind; label?: string; url?: string };
const AUTH_KINDS: ReadonlyArray<{ k: GatewayAuthKind; label: string }> = [
  { k: "bearer", label: "Bearer token" },
  { k: "header", label: "Custom header" },
  { k: "url", label: "URL only" },
  { k: "none", label: "No key" },
];

function AddToolForm({ gw, preset, onDirtyChange, onDone }: { gw: UseMcpGateway; preset: AddPreset; onDirtyChange: (dirty: boolean) => void; onDone: () => void }) {
  const [facet, setFacet] = useState(preset.facet);
  const [authKind, setAuthKind] = useState<GatewayAuthKind>(preset.authKind);
  const [label, setLabel] = useState(preset.label ?? "");
  const [url, setUrl] = useState(preset.url ?? "");
  const [token, setToken] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const isRest = facet === "n8n-rest";
  const needsKey = isRest || authKind === "bearer" || authKind === "header";
  // Dirty means the owner typed something, not merely that the form is open: warning about
  // discarding an untouched form trains people to click through the warning that matters.
  const dirty =
    label.trim() !== (preset.label ?? "").trim() ||
    url.trim() !== (preset.url ?? "").trim() ||
    token.trim() !== "" ||
    headerName.trim() !== "";
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const isHttps = (v: string) => /^https:\/\/[^\s]+\.[^\s]+/i.test(v.trim());
  /** Host-only, so a path or a version segment ("/v1.10.2/") can never be read as a private address.
   *  This mirrors the server's own endpoint guard; the server remains the authority. */
  const isPrivate = (v: string) => {
    const raw = v.trim();
    if (/^http:/i.test(raw)) return true;
    let host: string;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { return false; }
    return (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  };

  const submit = async () => {
    const next: Record<string, boolean> = {};
    if (!label.trim()) next.label = true;
    if (!isHttps(url) || isPrivate(url)) next.url = true;
    if (needsKey && !token.trim()) next.token = true;
    // INT-153, mirrored client-side: the server refuses a bearer/header credential under 12 chars
    // with MCP_CREDENTIAL_TOO_SHORT. Saying so in the field beats spending a round trip to be told.
    // Deliberately keyed on the REAL auth kind, so the n8n API-key facet — which the server does not
    // gate — is never refused here for a rule that does not apply to it.
    if (!isRest && needsKey && token.trim() && credentialTooShort(authKind, token)) next.short = true;
    if (facet === "generic-remote" && authKind === "header" && !headerName.trim()) next.header = true;
    setBad(next);
    if (Object.keys(next).length) { setMessage(null); return; }
    const result = isRest
      ? await gw.createRest({ label: label.trim(), baseUrl: url.trim(), apiKey: token.trim() })
      : await gw.createMcp({ providerKey: "generic-remote", label: label.trim(), serverUrl: url.trim(), authKind, authToken: token.trim() || null, authHeaderName: headerName.trim() || null });
    if (result.ok) { onDone(); return; }
    // Dropped or not-yet-ready is not a refusal — nothing was sent, so claim nothing (§13).
    if (result.code === "MCP_BUSY" || result.code === "MCP_NOT_READY") return;
    setMessage(result.message ?? "That didn’t go through. Check the details and try again.");
  };

  return (
    <>
      {message && <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{message}</span></div>}
      <div className="ig-gw-seg" role="group" aria-label="How should Paige reach this tool?">
        <button type="button" className={facet === "generic-remote" ? "on" : ""} aria-pressed={facet === "generic-remote"} onClick={() => { setFacet("generic-remote"); setAuthKind("bearer"); }}>Remote MCP server</button>
        <button type="button" className={facet === "n8n-rest" ? "on" : ""} aria-pressed={facet === "n8n-rest"} onClick={() => { setFacet("n8n-rest"); setAuthKind("bearer"); }}>n8n — API key</button>
      </div>
      <label className={`ig-field${bad.label ? " ig-field-bad" : ""}`}><span>Name</span>
        <input type="text" autoComplete="off" placeholder="e.g. HighLevel" value={label} onChange={(e) => setLabel(e.target.value)} aria-invalid={bad.label || undefined} aria-describedby={bad.label ? "ig-gw-add-label-err" : undefined} />
        {bad.label && <small className="ig-gw-err" id="ig-gw-add-label-err">Enter a name.</small>}
      </label>
      <label className={`ig-field${bad.url ? " ig-field-bad" : ""}`}><span>{isRest ? "Base URL" : "Server URL"}</span>
        <input type="url" autoComplete="off" spellCheck={false} placeholder={isRest ? "https://your-instance.app.n8n.cloud" : "https://services.example.com/mcp"} value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={bad.url || undefined} aria-describedby={bad.url ? "ig-gw-add-url-note ig-gw-add-url-err" : "ig-gw-add-url-note"} />
        <small id="ig-gw-add-url-note">Only public https:// addresses work. Local, private and non-HTTPS addresses are refused.</small>
        {bad.url && <small className="ig-gw-err" id="ig-gw-add-url-err">Enter a public https:// address.</small>}
      </label>
      {!isRest && (
        <div className="ig-gw-seg ig-gw-seg-auth" role="group" aria-label="How does it authenticate?">
          {AUTH_KINDS.map((a) => (
            <button key={a.k} type="button" className={authKind === a.k ? "on" : ""} aria-pressed={authKind === a.k} onClick={() => setAuthKind(a.k)}>{a.label}</button>
          ))}
        </div>
      )}
      {(isRest || authKind === "header") && authKind === "header" && !isRest && (
        <label className={`ig-field${bad.header ? " ig-field-bad" : ""}`}><span>Header name</span>
          <input type="text" autoComplete="off" placeholder="X-Api-Key" value={headerName} onChange={(e) => setHeaderName(e.target.value)} aria-invalid={bad.header || undefined} aria-describedby={bad.header ? "ig-gw-add-header-err" : undefined} />
          {bad.header && <small className="ig-gw-err" id="ig-gw-add-header-err">Enter the header name.</small>}
        </label>
      )}
      {needsKey && (
        <label className={`ig-field${bad.token ? " ig-field-bad" : ""}`}><span>{isRest ? "API key" : authKind === "header" ? "Value" : "Bearer token"}</span>
          <input type="password" autoComplete="off" placeholder={isRest ? "n8n_api_…" : "token…"} value={token} onChange={(e) => setToken(e.target.value)} aria-invalid={bad.token || bad.short || undefined} aria-describedby={bad.token || bad.short ? "ig-gw-add-token-note ig-gw-add-token-err" : "ig-gw-add-token-note"} />
          <small id="ig-gw-add-token-note">Stored encrypted. Paige never shows it back — to change it later you replace it.</small>
          {bad.token && <small className="ig-gw-err" id="ig-gw-add-token-err">Enter the {isRest ? "API key" : "token"}.</small>}
          {bad.short && <small className="ig-gw-err" id="ig-gw-add-token-err">That looks too short. Paste the full {isRest ? "key" : "token"} — it needs at least {MCP_CREDENTIAL_MIN_LENGTH} characters.</small>}
        </label>
      )}
      <div className="ig-actions ig-gw-actions">
        <button type="button" className="ig-btn" onClick={onDone}>Cancel</button>
        <button type="button" className="ig-btn" data-primary disabled={gw.saving} onClick={() => void submit()}>{gw.saving ? "Adding…" : "Add tool"}</button>
      </div>
    </>
  );
}

/* ── Sign in with the provider (the Slice ② OAuth spine, reached at last) ─────
   WHY THIS SHAPE, AND WHY IT IS TWO STEPS.

   `oauth_begin` acts on a connection that already EXISTS — it reads that row's server URL, runs the
   OAuth 2.1 discovery spine against it (RFC 9728 protected-resource → RFC 8414 metadata → RFC 7591
   dynamic client registration), stores a PKCE flow, and hands back one authorize URL. So a provider
   the tenant has never added has to become a row first.

   The row is created with `auth_kind: "none"`, and that is deliberate rather than a placeholder.
   `get_mcp_connection_secret` treats a row as configured when it has an endpoint AND either a stored
   credential or an auth kind of `none`/`url` (migration 20270326000000). So a `none` row with a
   server URL is configured — which is exactly what `oauth_begin` requires and refuses without
   (`connection_unconfigured`). Creating it as `oauth` instead is impossible on purpose: that bundle
   REQUIRES a token, an issuer and a client id up front, and those are the very things the sign-in is
   about to produce. The grant itself lands out of band in the JWT-less `mcp-oauth-callback`, which is
   where the provider redirects.

   This is why every "connect" tile in the catalogue used to be an honest stop reading "Sign-in soon".
   The flow existed on the backend; no browser could reach it. Now it can. */
/** No `onDone`: a successful begin NAVIGATES away, so there is no success state to return to here.
 *  The person comes back through the provider redirect, not through this component. */
function SignInFlow({ gw, item, onCancel }: { gw: UseMcpGateway; item: CatItem; onCancel: () => void }) {
  const [label, setLabel] = useState(item.n);
  const [url, setUrl] = useState(item.url ?? "");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "starting">("form");
  const isHttps = (v: string) => /^https:\/\/[^\s]+\.[^\s]+/i.test(v.trim());

  const begin = async () => {
    const next: Record<string, boolean> = {};
    if (!label.trim()) next.label = true;
    if (!isHttps(url)) next.url = true;
    setBad(next);
    if (Object.keys(next).length) { setMessage(null); return; }
    setMessage(null);
    setStep("starting");

    // 1. The row. `none` carries no credential, which is what makes it creatable before sign-in.
    const created = await gw.createMcp({
      providerKey: "generic-remote",
      label: label.trim(),
      serverUrl: url.trim(),
      authKind: "none",
    });
    if (!created.ok || !created.connectionId) {
      setStep("form");
      // A dropped or not-yet-ready write was never refused, so claiming a failure would be a lie (§13).
      if (created.code === "MCP_BUSY" || created.code === "MCP_NOT_READY") return;
      setMessage(created.message ?? "That didn't go through. Check the details and try again.");
      return;
    }

    // 2. The flow. The tool now EXISTS either way — if discovery fails the owner keeps a real row
    //    they can re-key by hand, which is why this reports rather than silently rolling back.
    const flow = await gw.beginOAuth(created.connectionId);
    if (!flow.ok || !flow.authorizeUrl) {
      setStep("form");
      if (flow.code === "MCP_BUSY" || flow.code === "MCP_NOT_READY") return;
      // The row EXISTS now, so the copy must not imply nothing happened — but it must also not
      // name a control this row does not have. It was created with NO credential, and Re-key
      // renders no key field for a credential-less tool (its `needsKey` is false) and cannot
      // change a tool's sign-in type at all. Telling the owner to "add a key instead" was an
      // instruction with nothing behind it (§70.1) — caught by the peer-gate before it shipped.
      setMessage(
        flow.message ??
          `That provider didn't offer a sign-in Paige can use. ${label.trim() || item.n} was saved with no key — open it to check the address and try again, or remove it.`,
      );
      return;
    }

    // 3. Leave. Recorded first so the callback can bring the person back to this exact surface.
    armOAuthReturn(`${window.location.pathname}${window.location.search}`);
    window.location.assign(flow.authorizeUrl);
  };

  return (
    <>
      <p className="ig-lede">
        Paige will send you to {item.n} to sign in. You approve what she may do there, and she never sees your password.
      </p>
      {message && <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{message}</span></div>}
      <label className={`ig-field${bad.label ? " ig-field-bad" : ""}`}><span>Name</span>
        <input type="text" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} aria-invalid={bad.label || undefined} />
        {bad.label && <small className="ig-gw-err">Enter a name.</small>}
      </label>
      <label className={`ig-field${bad.url ? " ig-field-bad" : ""}`}><span>Server address</span>
        <input type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={bad.url || undefined} aria-describedby="ig-gw-signin-url-note" />
        <small id="ig-gw-signin-url-note">
          {item.url ? "This is the address Paige knows for this tool. Change it only if yours is different." : "Enter the tool's public https:// MCP address."}
        </small>
        {bad.url && <small className="ig-gw-err">Enter a public https:// address.</small>}
      </label>
      <div className="ig-actions ig-gw-actions">
        <button type="button" className="ig-btn" onClick={onCancel} disabled={step === "starting"}>Cancel</button>
        <button type="button" className="ig-btn" data-primary disabled={step === "starting" || gw.saving} onClick={() => void begin()}>
          {step === "starting" ? "Starting sign-in…" : `Sign in to ${item.n}`}
        </button>
      </div>
      <p className="ig-note">
        Nothing is shared until you approve it on {item.n}'s own screen. You can disconnect at any time.
      </p>
    </>
  );
}

/* ── Catalogue browse (the one catalogue, folded into the add path) ────────────
   The catalogue is a shortcut to the form, never the only way in: a tenant whose tool is not a
   listed vendor still has to be able to finish the job, so the generic entry is always rendered —
   including when a search matches nothing. `c` is deliberately outside CAT_CATEGORIES so it never
   duplicates into a category section. */
const MANUAL_ENTRY: CatItem = {
  n: "Any MCP server",
  c: "Your own",
  m: "key",
  g: "URL",
  d: "Point Paige at any public MCP server by its address — or an n8n instance by API key.",
  auth: "bearer",
  manual: true,
};

function Catalogue({
  onPick,
  onSignIn,
  onSetup,
  onZapier,
  onLegacy,
}: {
  onPick: (item: CatItem) => void;
  /** A provider whose sign-in Paige can actually run — routed to the real OAuth flow. */
  onSignIn: (item: CatItem) => void;
  onSetup: (item: CatItem) => void;
  onZapier: (item: CatItem) => void;
  onLegacy: (which: CatLegacy) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CAT_CATEGORIES)[number]>("All");
  const q = query.trim().toLowerCase();
  const matches = (p: CatItem) => !q || (`${p.n} ${p.d} ${p.net ?? ""} ${p.c}`.toLowerCase().includes(q));
  const showPopular = category === "All" && !q;
  const popular = useMemo(() => CATALOGUE.filter((p) => p.pop).slice().sort((a, b) => (a.r ?? 99) - (b.r ?? 99)), []);

  const route = (p: CatItem) => {
    if (p.legacy && p.legacy !== "social") return onLegacy(p.legacy);
    if (p.legacy === "social") return onLegacy("social");
    if (p.m === "key") return onPick(p);
    // Slice ④: the gateway's oauth_begin door is reachable from the browser now, so a "connect"
    // provider runs a real sign-in instead of stopping. A tile with no known address is routed the
    // same way — SignInFlow asks for one rather than refusing the whole provider.
    if (p.m === "connect") return onSignIn(p);
    if (p.m === "review") return onSetup(p); // no capability record yet — honest stop
    if (p.m === "setup") return onSetup(p);
    return onZapier(p);
  };

  const tile = (p: CatItem) => (
    <li key={p.n}>
      <button type="button" className="ig-gw-tile" data-mode={p.m} onClick={() => route(p)} aria-label={`${p.n} — ${MODE_LABEL[p.m]}`}>
        <span className="ig-gw-tile-top"><span className="ig-gw-tile-mark" aria-hidden>{p.g}</span><span className="ig-gw-tile-name">{p.n}</span></span>
        <span className="ig-gw-tile-desc">{p.d}</span>
        {p.net && <span className="ig-gw-tile-net">{p.net}</span>}
        <span className="ig-gw-tile-foot"><span className="ig-gw-badge" data-mode={p.m}>{MODE_LABEL[p.m]}</span></span>
      </button>
    </li>
  );

  const sections = CAT_CATEGORIES.slice(1).map((cat) => {
    if (category !== "All" && category !== cat) return null;
    const items = CATALOGUE.filter((p) => p.c === cat && matches(p));
    if (!items.length) return null;
    return (
      <section className="ig-gw-cat-sec" key={cat} aria-label={cat}>
        <h3 className="ig-gw-cat-h">{cat}<span>{items.length}</span></h3>
        <ul className="ig-gw-cat-grid">{items.map(tile)}</ul>
      </section>
    );
  }).filter(Boolean);

  return (
    <>
      <div className="ig-gw-search"><Search aria-hidden size={14} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${CATALOGUE.length} tools — name or what it does`} aria-label="Search the tool catalogue" />
      </div>
      <div className="ig-bar" role="group" aria-label="Filter tools by category">
        {CAT_CATEGORIES.map((cat) => (
          <button key={cat} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat}</button>
        ))}
      </div>
      <section className="ig-gw-cat-sec" aria-label="Add it yourself">
        <h3 className="ig-gw-cat-h">Add it yourself</h3>
        <ul className="ig-gw-cat-grid">{tile(MANUAL_ENTRY)}</ul>
      </section>
      {showPopular && (
        <section className="ig-gw-cat-sec" aria-label="Popular for service businesses">
          <h3 className="ig-gw-cat-h">Popular for service businesses<span>{popular.length}</span></h3>
          <ul className="ig-gw-cat-grid ig-gw-cat-pop">{popular.map(tile)}</ul>
        </section>
      )}
      {sections.length ? sections : (!showPopular && <p className="ig-note">No listed tool matches “{query}”. Try another word — or use “Any MCP server” above to add it by address.</p>)}
    </>
  );
}

/* ── Detail (re-key / disconnect / honest tool state) ────────────────────────── */
function ToolDetail({ gw, tool, onClose }: { gw: UseMcpGateway; tool: GatewayConnection; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "rekey" | "disconnect">("view");
  /** The last probe verdict, held so the person sees what the check FOUND rather than only a row
   *  that silently changed colour underneath them. Cleared when another action starts. */
  const [checked, setChecked] = useState<{ ok: boolean; message: string | null; toolCount: number | null } | null>(null);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  const chip = statusChip(tool);
  const isRest = tool.authKind === "api_key";
  const isOAuth = tool.authKind === "oauth";

  /** Run the read-only probe: handshake the server and load what it offers. */
  const check = async () => {
    setSignInMessage(null);
    const result = await gw.verify(tool.id);
    // Nothing was sent, so there is nothing to report — saying "failed" would claim a refusal that
    // never happened (§13).
    if (result.code === "MCP_BUSY" || result.code === "MCP_NOT_READY") return;
    setChecked({ ok: result.ok, message: result.message, toolCount: result.toolCount ?? null });
  };

  /** Re-run the provider sign-in for a connection that already holds an OAuth grant. */
  const signInAgain = async () => {
    setChecked(null);
    const flow = await gw.beginOAuth(tool.id);
    if (flow.code === "MCP_BUSY" || flow.code === "MCP_NOT_READY") return;
    if (!flow.ok || !flow.authorizeUrl) {
      setSignInMessage(flow.message ?? "That sign-in couldn't be started. Try again in a moment.");
      return;
    }
    armOAuthReturn(`${window.location.pathname}${window.location.search}`);
    window.location.assign(flow.authorizeUrl);
  };
  /** An OAuth tool's credential is issued by its provider's sign-in, not pasted here, so this
   *  surface has no honest way to re-key one. Offering the control would be offering a button
   *  the server refuses every time (§70.1 — never render a control that cannot act). */
  const rekeyable = tool.authKind !== "oauth";

  return (
    <GatewayDrawer eyebrow="Connected MCP Gateway" title={tool.label} dirty={mode === "rekey"} onClose={onClose}>
      <dl className="ig-facts">
        <div><dt>Endpoint</dt><dd>{tool.serverUrlHost ?? "—"}</dd></div>
        <div><dt>Type</dt><dd>{facetName(tool)}</dd></div>
        <div><dt>Status</dt><dd><span className="ig-gw-chip" data-tone={chip.tone}>{chip.label}</span></dd></div>
        <div><dt>Last checked</dt><dd>{tool.lastCheckedAt ? new Date(tool.lastCheckedAt).toLocaleString() : "No successful check yet"}</dd></div>
      </dl>

      {mode === "view" && (
        <>
          {/* The probe's own verdict, when one has been run in this drawer. It leads, because it is
              the newest thing the person knows and the reason they pressed the button. */}
          {checked && (
            checked.ok
              ? <div className="ig-gw-info" role="status"><span>Checked just now — Paige reached it{checked.toolCount === null ? "" : ` and found ${checked.toolCount} ${checked.toolCount === 1 ? "action" : "actions"}`}.</span></div>
              : <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{checked.message ?? "Paige couldn’t use it. Check the address and the key."}</span></div>
          )}
          {signInMessage && <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{signInMessage}</span></div>}

          {tool.status === "pending_verification" ? (
            <div className="ig-gw-info" role="status"><span>This tool hasn’t been checked yet. Paige can’t use it until she has reached it and you’ve approved what it may do.</span></div>
          ) : tool.status === "error" ? (
            <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>Couldn’t reach it. Fix the address or re-key, then check it again.</span></div>
          ) : (
            <div className="ig-gw-info" role="status"><span>{tool.approvedCount === null || tool.toolCount === null ? "How many actions this tool offers hasn’t been read yet." : `${tool.approvedCount} of ${tool.toolCount} actions approved.`}</span></div>
          )}

          {/* The per-action list is NOT buildable yet, and this says so rather than showing an empty
              list that reads as "this tool offers nothing". The missing piece is exact: no
              client-readable door onto the tool catalogue exists. `mcp_connection_tools` carries an
              is_platform_owner()-only RLS policy, no RPC reads it, and the verify action returns
              tool_count as a NUMBER — so there is no honest way to enumerate the actions an approval
              would name. Recorded in full in the Slice ④ PR body and the master reference. */}
          {tool.status === "connected" && (tool.toolCount ?? 0) > 0 && (
            <div className="ig-gw-info" role="status">
              <span>
                Choosing which of these actions Paige may use needs a change on Paige’s side that hasn’t shipped
                yet. Until it does, she won’t act with this tool — nothing runs without your approval.
              </span>
            </div>
          )}

          <div className="ig-actions ig-gw-actions">
            {gw.canWrite && <button type="button" className="ig-btn" disabled={gw.saving} onClick={() => void check()}>{gw.saving ? "Checking…" : "Check now"}</button>}
            {gw.canWrite && isOAuth && <button type="button" className="ig-btn" disabled={gw.saving} onClick={() => void signInAgain()}>Sign in again</button>}
            {gw.canWrite && rekeyable && <button type="button" className="ig-btn" onClick={() => setMode("rekey")}>Re-key</button>}
            {gw.canWrite && <button type="button" className="ig-btn" data-danger onClick={() => setMode("disconnect")}>Disconnect</button>}
          </div>
        </>
      )}

      {mode === "rekey" && <RekeyForm gw={gw} tool={tool} isRest={isRest} onDone={onClose} onCancel={() => setMode("view")} />}
      {mode === "disconnect" && <DisconnectConfirm gw={gw} tool={tool} onDone={onClose} onCancel={() => setMode("view")} />}
    </GatewayDrawer>
  );
}

/**
 * Re-key.
 *
 * Two contract facts shape this form and neither is optional. First, the endpoint setter takes the
 * FULL address as a required argument, while the list read returns the HOST ONLY by design — it
 * strips the path so no secret-bearing URL is ever projected. So the address cannot be reconstructed
 * here: it is shown as an editable field, seeded with the host and explicitly asking for the rest,
 * rather than silently re-pointing a working tool at its bare host. Second, the server validates the
 * credential bundle per auth kind — `header` needs its header name, `url` and `none` carry no
 * credential at all — so the form collects exactly what the chosen kind requires and nothing else.
 */
function RekeyForm({ gw, tool, isRest, onDone, onCancel }: { gw: UseMcpGateway; tool: GatewayConnection; isRest: boolean; onDone: () => void; onCancel: () => void }) {
  const authKind = ((tool.authKind as GatewayAuthKind) ?? "bearer") as GatewayAuthKind;
  const needsKey = isRest || authKind === "bearer" || authKind === "header";
  const needsHeaderName = !isRest && authKind === "header";
  const [url, setUrl] = useState(tool.serverUrlHost ? `https://${tool.serverUrlHost}/` : "");
  const [key, setKey] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const isHttps = (v: string) => /^https:\/\/[^\s]+\.[^\s]+/i.test(v.trim());

  const submit = async () => {
    const next: Record<string, boolean> = {};
    if (!isHttps(url)) next.url = true;
    if (needsKey && !key.trim()) next.key = true;
    if (needsHeaderName && !headerName.trim()) next.header = true;
    setBad(next);
    if (Object.keys(next).length) { setMessage(null); return; }
    const result = isRest
      ? await gw.rekeyRest(tool.id, url.trim(), key.trim())
      : await gw.rekeyMcp(tool.id, url.trim(), authKind, needsKey ? key.trim() : null, needsHeaderName ? headerName.trim() : null);
    if (result.ok) { onDone(); return; }
    // A dropped or not-yet-ready write carries no message: it was never refused, so saying it
    // failed would claim a rejection that did not happen (§13).
    if (result.code === "MCP_BUSY" || result.code === "MCP_NOT_READY") return;
    setMessage(result.message ?? "That didn’t go through. Check the details and try again.");
  };

  return (
    <>
      <div className="ig-gw-warn" role="note"><span>Re-keying resets this tool: Paige checks it again and its approvals are cleared, so you’ll approve its actions once more.</span></div>
      {message && <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{message}</span></div>}
      <label className={`ig-field${bad.url ? " ig-field-bad" : ""}`}><span>{isRest ? "Base URL" : "Full address"}</span>
        <input type="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={bad.url || undefined} aria-describedby={bad.url ? "ig-gw-rekey-url-note ig-gw-rekey-url-err" : "ig-gw-rekey-url-note"} />
        <small id="ig-gw-rekey-url-note">Paige stores only the host, so confirm the whole address — including any path — before saving.</small>
        {bad.url && <small className="ig-gw-err" id="ig-gw-rekey-url-err">Enter the full public https:// address.</small>}
      </label>
      {needsHeaderName && (
        <label className={`ig-field${bad.header ? " ig-field-bad" : ""}`}><span>Header name</span>
          <input type="text" autoComplete="off" placeholder="X-Api-Key" value={headerName} onChange={(e) => setHeaderName(e.target.value)} aria-invalid={bad.header || undefined} aria-describedby={bad.header ? "ig-gw-rekey-header-err" : undefined} />
          {bad.header && <small className="ig-gw-err" id="ig-gw-rekey-header-err">Enter the header name.</small>}
        </label>
      )}
      {needsKey ? (
        <label className={`ig-field${bad.key ? " ig-field-bad" : ""}`}><span>{isRest ? "New API key" : "New key / value"}</span>
          <input type="password" autoComplete="off" placeholder="new value…" value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={bad.key || undefined} aria-describedby={bad.key ? "ig-gw-rekey-key-err" : undefined} />
          {bad.key && <small className="ig-gw-err" id="ig-gw-rekey-key-err">Enter the new {isRest ? "API key" : "value"}.</small>}
        </label>
      ) : (
        <div className="ig-gw-info" role="status"><span>This tool carries no key, so only its address changes here.</span></div>
      )}
      <div className="ig-actions ig-gw-actions">
        <button type="button" className="ig-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ig-btn" data-primary disabled={gw.saving} onClick={() => void submit()}>{gw.saving ? "Saving…" : "Save & re-check"}</button>
      </div>
    </>
  );
}

function DisconnectConfirm({ gw, tool, onDone, onCancel }: { gw: UseMcpGateway; tool: GatewayConnection; onDone: () => void; onCancel: () => void }) {
  const [hard, setHard] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async () => {
    const result = await gw.disconnect(tool.id, hard);
    if (result.ok) { onDone(); return; }
    if (result.code === "MCP_BUSY" || result.code === "MCP_NOT_READY") return;
    // A refused disconnect used to produce no visible effect whatsoever — the click simply did
    // nothing, which reads as a broken button rather than a refusal (§70.1).
    setMessage(result.message ?? "That didn’t go through. Nothing was changed.");
  };
  return (
    <>
      <div className="ig-gw-warn" role="note"><span>Either way, Paige stops using {tool.label} right now.</span></div>
      {message && <div className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} /><span>{message}</span></div>}
      <div
        className="ig-gw-choices"
        role="radiogroup"
        aria-label="How to disconnect"
        onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
          e.preventDefault();
          const next = !hard;
          setHard(next);
          const group = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
          group[next ? 1 : 0]?.focus();
        }}
      >
        <button type="button" className={`ig-gw-choice${!hard ? " on" : ""}`} role="radio" aria-checked={!hard} tabIndex={hard ? -1 : 0} onClick={() => setHard(false)}>
          <strong>Turn it off</strong>
          <span>Removes its keys and all approvals; the tool stays here so you can reconnect later.</span>
        </button>
        <button type="button" className={`ig-gw-choice${hard ? " on" : ""}`} role="radio" aria-checked={hard} tabIndex={hard ? 0 : -1} onClick={() => setHard(true)}>
          <strong>Delete it</strong>
          <span>Removes the tool and its keys entirely. What Paige already did with it stays in your history.</span>
        </button>
      </div>
      <div className="ig-actions ig-gw-actions">
        <button type="button" className="ig-btn" onClick={onCancel}>Keep it</button>
        <button type="button" className="ig-btn" data-danger disabled={gw.saving} onClick={() => void submit()}>{gw.saving ? "Working…" : hard ? "Delete permanently" : "Turn it off"}</button>
      </div>
    </>
  );
}

/* ── The section mounted inside SoloIntegrationsView ──────────────────────────
   `onOpenLegacy` routes the catalogue's n8n/Zapier/Social tiles to the existing live drawers
   (§58 — nothing reimplemented). */
/**
 * The Automation group, and the home of every MCP server this account has pointed Paige at.
 *
 * Owner ruling 2026-09-22: an MCP connection is a REPEATABLE connection — a person adds as many
 * servers as they need — and it belongs under Automation, not filed away under Developer. So this
 * component owns the whole Automation group: the shipped automation tiles the parent hands it, the
 * one repeatable "MCP server" tile that starts an add, and a tile per server already added. One
 * group, one home (§18); nothing that shipped here was removed (§58).
 */
export function IntegrationsGatewaySection({
  onOpenLegacy,
  gw,
  group,
  tiles,
  hidden,
}: {
  onOpenLegacy?: (which: CatLegacy) => void;
  /** The one gateway hook instance, owned by the parent — the parent counts these tiles in the
   *  filter bar, so it must read the same list this group renders, never a second fetch of it. */
  gw: UseMcpGateway;
  /** The Automation group's own heading data, owned by the parent's category ladder. */
  group: { label: string; accent: string; blurb: string };
  /** The shipped automation provider tiles, already rendered as <li> by the parent. */
  tiles: ReactNode;
  /** True when a category filter has this group filtered out. */
  hidden?: boolean;
}) {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const scopeKey = `${activeUserId ?? ""}:${activeTenantId ?? ""}`;
  const [drawer, setDrawer] = useState<
    | { kind: "catalogue" }
    | { kind: "add"; preset: AddPreset }
    | { kind: "signin"; item: CatItem }
    | { kind: "stop"; item: CatItem; via: "setup" | "zapier" }
    | { kind: "detail"; tool: GatewayConnection; scope: string }
    | null
  >(null);
  const close = useCallback(() => setDrawer(null), []);
  /** A write failure belongs to the tool it happened on. Clearing it at the drawer boundary stops
   *  one tool's refusal reappearing as a live alert on the next tool opened. */
  const closeDetail = useCallback(() => { gw.dismissWriteError(); setDrawer(null); }, [gw]);
  /**
   * A detail drawer holds a frozen row from ONE workspace. The hook masks the LIST on a switch,
   * but an open drawer would keep painting the previous account's name, host and timestamps on a
   * page that is now someone else's (§9). Drop it on every scope change, and guard the render as
   * well, exactly as the incumbent surface does for its own panels.
   */
  useEffect(() => { setDrawer(null); }, [scopeKey, tenantLoading]);
  /** Whether the add form holds anything worth warning about before it closes. */
  const [addDirty, setAddDirty] = useState(false);
  useEffect(() => { if (drawer?.kind !== "add") setAddDirty(false); }, [drawer?.kind]);

  const openLegacy = (which: CatLegacy) => { close(); onOpenLegacy?.(which); };

  if (hidden) return null;

  /** The gateway's own tiles: the repeatable add, then one per server already added. */
  const mcpTiles = (
    <>
      {gw.canWrite && (
        <li>
          <button type="button" className="ig-card" data-provider="mcp-add" data-owner="gateway"
            onClick={() => setDrawer({ kind: "catalogue" })} aria-haspopup="dialog">
            <span className="ig-logo" data-glyph="light" data-add style={{ ["--ig-brand" as string]: "var(--pg-violet)" }} aria-hidden>
              <Plus size={22} strokeWidth={2.2} aria-hidden />
            </span>
            <span className="ig-card-title"><strong>MCP server</strong><span className="ig-chip">Repeatable</span></span>
            <span className="ig-card-foot"><span className="ig-card-state" data-tone="neutral"><i aria-hidden />Add as many as you need</span></span>
          </button>
        </li>
      )}
      {gw.tools.map((c) => {
        const chip = statusChip(c);
        return (
          <li key={c.id}>
            <button type="button" className="ig-card" data-provider={`gateway-${c.id}`} data-gateway-tool={c.id}
              data-owner="gateway" onClick={() => setDrawer({ kind: "detail", tool: c, scope: scopeKey })} aria-haspopup="dialog">
              <span className="ig-logo" data-glyph="light" data-initials style={{ ["--ig-brand" as string]: "var(--pg-violet)" }} aria-hidden>
                {c.label.slice(0, 2).toUpperCase()}
              </span>
              <span className="ig-card-title">
                <strong>{c.label}</strong>
                {!usable(c) && <span className="ig-chip" data-warn>not usable yet</span>}
              </span>
              <span className="ig-card-foot">
                <span className="ig-card-state" data-tone={chip.tone === "ok" ? "ok" : chip.tone === "bad" ? "bad" : chip.tone === "warn" ? "warn" : "neutral"}>
                  <i aria-hidden />{chip.label}
                </span>
                <span className="ig-card-host">{c.serverUrlHost ? `${c.serverUrlHost} · ${facetName(c)}` : facetName(c)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </>
  );

  return (
    <section className="ig-group" aria-label={group.label}>
      <div className="ig-group-head">
        <i className="ig-bar-dot" style={{ background: group.accent }} aria-hidden />
        <b>{group.label}</b><em>{group.blurb}</em><i className="ig-group-rule" aria-hidden />
      </div>

      {gw.loading ? (
        <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Loading your tools…</p>
      ) : gw.error ? (
        <div className="ig-state" role="alert"><TriangleAlert aria-hidden /><span>Your tools couldn’t be read just now. Nothing was changed.</span><button type="button" className="ig-btn" onClick={() => gw.reload()}>Try again</button></div>
      ) : null}

      <ul className="ig-grid">
        {tiles}
        {!gw.loading && !gw.error && mcpTiles}
      </ul>

      {drawer?.kind === "catalogue" && (
        <GatewayDrawer
          eyebrow="Connected MCP Gateway"
          title="Add a tool"
          onClose={close}
          // Shipped copy, kept verbatim (§58). It used to head the tools section; the section is
          // now the Automation group, whose heading belongs to the category ladder — so the
          // sentence moved to the moment it actually matters, choosing a tool to add.
          footer={<span>Give Paige an outside tool to work with. She can use it once you’ve verified it and approved what it may do.</span>}
        >
          <Catalogue
            onPick={(item) => setDrawer({ kind: "add", preset: { facet: item.legacy === "n8n" ? "n8n-rest" : "generic-remote", authKind: item.auth ?? "bearer", label: item.manual ? undefined : item.n, url: item.url } })}
            onSignIn={(item) => setDrawer({ kind: "signin", item })}
            onSetup={(item) => setDrawer({ kind: "stop", item, via: "setup" })}
            onZapier={(item) => setDrawer({ kind: "stop", item, via: "zapier" })}
            onLegacy={openLegacy}
          />
        </GatewayDrawer>
      )}

      {drawer?.kind === "add" && (
        <GatewayDrawer eyebrow="Connected MCP Gateway" title={drawer.preset.label ? `Add ${drawer.preset.label}` : "Add a tool"} dirty={addDirty} onClose={close}>
          <AddToolForm gw={gw} preset={drawer.preset} onDirtyChange={setAddDirty} onDone={close} />
        </GatewayDrawer>
      )}

      {drawer?.kind === "signin" && (
        <GatewayDrawer eyebrow={drawer.item.n} title={`Sign in to ${drawer.item.n}`} onClose={close}>
          <SignInFlow gw={gw} item={drawer.item} onCancel={close} />
        </GatewayDrawer>
      )}

      {drawer?.kind === "stop" && (
        <GatewayDrawer
          eyebrow={drawer.item.n}
          title={drawer.via === "setup" ? (drawer.item.m === "review" ? "Not cleared for use yet" : "Setup needed") : "Not available yet"}
          onClose={close}
          footer={drawer.via === "zapier" ? <span>Bridge it through Zapier from the Zapier tile.</span> : drawer.item.m === "review" ? <span>You can still connect any server yourself from “Any MCP server”.</span> : <span>Paige will flag {drawer.item.n} the moment it’s ready.</span>}
        >
          {drawer.via === "setup" && drawer.item.m === "review" ? (
            <div className="ig-gw-info" role="status"><span><strong>{drawer.item.n}</strong> isn’t cleared for use yet — we haven’t recorded who owns it, what it may do, or what it costs, and Paige won’t offer a tool we can’t answer that for. {drawer.item.d} Once it’s recorded it becomes a one-click add here. In the meantime you can point Paige at any server yourself from “Any MCP server”.</span></div>
          ) : drawer.via === "setup" ? (
            <div className="ig-gw-info" role="status"><span><strong>{drawer.item.n}</strong> needs a one-time platform setup before it can connect. {drawer.item.d} When it’s ready it becomes a one-click add right here — nothing to paste.</span></div>
          ) : (
            <div className="ig-gw-info" role="status"><span><strong>{drawer.item.n}</strong> has no direct path Paige can use yet. {drawer.item.d} Connect Zapier once and Paige can reach it through the 8,000+ apps Zapier bridges.</span></div>
          )}
        </GatewayDrawer>
      )}

      {/* Re-derive the open row from the LIVE list rather than rendering the snapshot taken when the
          drawer opened. Slice ④ is the first change to add a write that leaves this drawer open —
          "Check now" reloads gw.tools while the drawer is still on screen — so a frozen snapshot now
          contradicts itself in front of the owner: the verdict banner says "Checked just now" while
          the facts list above it still reads "Not checked yet" with no last-checked time. Re-key and
          disconnect both closed the drawer, which is why this could not show before.
          The snapshot remains the fallback: a row that has just been hard-deleted leaves the list,
          and keeping its last-known identity on screen for the moment before the drawer closes beats
          blanking the dialog out from under the person. */}
      {drawer?.kind === "detail" && !tenantLoading && drawer.scope === scopeKey && (() => {
        const live = gw.tools.find((t) => t.id === drawer.tool.id) ?? drawer.tool;
        return <ToolDetail key={`${scopeKey}:${live.id}`} gw={gw} tool={live} onClose={closeDetail} />;
      })()}
    </section>
  );
}
