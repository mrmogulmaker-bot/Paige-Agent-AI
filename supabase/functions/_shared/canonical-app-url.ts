/**
 * Canonical externally emitted Paige application destinations.
 *
 * This module is deliberately pure: email, SMS, Stripe, OAuth, webhook, MCP,
 * cron, and frontend producers can share the same fail-closed route contract.
 * A route is an address, never authorization; the mounted shell still resolves
 * the session and tenant server-side.
 */

export const PAIGE_APP_ORIGIN = "https://paigeagent.ai";

export type CanonicalActor = "operator" | "account";
export type CanonicalTier =
  | "operator"
  | "solo"
  | "standalone"
  | "sub_account"
  | "agency"
  | "enterprise";

export type CanonicalDestination =
  | "home"
  | "billing"
  | "approvals"
  | "security"
  | "settings"
  | "connections"
  | "integrations"
  | "tasks"
  | "calendar"
  | "contacts"
  | "pipeline"
  | "marketplace"
  | "marketplace_submissions";

export interface CanonicalAppRouteInput {
  actor: CanonicalActor;
  tier: CanonicalTier;
  account?: string | number | null;
  destination: CanonicalDestination;
}

type MountedTier = "operator" | "solo" | "sub_account" | "agency";

const ROUTES: Record<MountedTier, Partial<Record<CanonicalDestination, string>>> = {
  operator: {
    home: "/operator/fleet/systems-check",
    approvals: "/operator/settings/governance/approvals",
    security: "/operator/settings/governance/security",
    settings: "/operator/settings/setup/operator",
    connections: "/operator/settings/integrations/connected",
    integrations: "/operator/settings/integrations/connected",
    tasks: "/operator/calendar/tasks",
    calendar: "/operator/calendar/month",
    pipeline: "/operator/fleet/prospects",
    marketplace: "/operator/marketplace/discover",
    marketplace_submissions: "/operator/marketplace/submissions",
  },
  solo: {
    home: "/solo/{account}/command-center/systems-check",
    billing: "/solo/{account}/settings/billing",
    security: "/solo/{account}/settings/security-data",
    settings: "/solo/{account}/settings/setup",
    connections: "/solo/{account}/settings/connections",
    integrations: "/solo/{account}/settings/integrations",
    tasks: "/solo/{account}/calendar/tasks",
    calendar: "/solo/{account}/calendar/week",
    contacts: "/solo/{account}/clients/people",
    pipeline: "/solo/{account}/growth/pipeline",
    marketplace: "/solo/{account}/marketplace/browse",
  },
  sub_account: {
    home: "/business/{account}/command-center/overview",
    billing: "/business/{account}/billing/your-plan",
    settings: "/business/{account}/setup/business",
    connections: "/business/{account}/calendar/connections",
    tasks: "/business/{account}/calendar/tasks",
    calendar: "/business/{account}/calendar/week",
    contacts: "/business/{account}/clients/people",
    pipeline: "/business/{account}/clients/pipelines",
    marketplace: "/business/{account}/marketplace/browse",
  },
  agency: {
    home: "/agency/{account}/command-center/overview",
    billing: "/agency/{account}/billing/your-plan",
    settings: "/agency/{account}/setup/business",
    connections: "/agency/{account}/calendar/connections",
    tasks: "/agency/{account}/calendar/tasks",
    calendar: "/agency/{account}/calendar/week",
    contacts: "/agency/{account}/clients/people",
    pipeline: "/agency/{account}/clients/pipelines",
    marketplace: "/agency/{account}/marketplace/browse",
  },
};

function mountedTier(tier: CanonicalTier): MountedTier | null {
  if (tier === "standalone") return "solo";
  if (tier === "operator" || tier === "solo" || tier === "sub_account" || tier === "agency") {
    return tier;
  }
  // Enterprise exists in taxonomy but is not mounted. Never mint a dead address.
  return null;
}

function safeAccount(account: string | number | null | undefined): string | null {
  const value = String(account ?? "").trim();
  return /^\d{1,20}$/.test(value) ? value : null;
}

export function resolveCanonicalAppPath(input: CanonicalAppRouteInput): string | null {
  const tier = mountedTier(input.tier);
  if (!tier) return null;

  if ((input.actor === "operator") !== (tier === "operator")) return null;

  const template = ROUTES[tier][input.destination];
  if (!template) return null;
  if (tier === "operator") return template;

  const account = safeAccount(input.account);
  return account ? template.replace("{account}", account) : null;
}

export function canonicalAppUrl(input: CanonicalAppRouteInput): string | null {
  const path = resolveCanonicalAppPath(input);
  return path ? `${PAIGE_APP_ORIGIN}${path}` : null;
}
