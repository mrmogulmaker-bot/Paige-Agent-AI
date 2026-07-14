/**
 * Paige Marketplace — the catalog of capability "skills" a tenant can add to
 * their Paige ON TOP OF whatever coach-type skin they authored (§8/§9, Roadmap #9).
 *
 * A skill is a capability pack: a domain brain (system-prompt overlay + gated
 * tools + optional surfaces) that Paige gains when the tenant switches it on.
 * Enabling a skill writes its `slug` into `tenants.features.enabled_skills`
 * (via the `set_tenant_skill` RPC); the AI chat reads that array to decide which
 * overlays/tools to attach. Funding is the first fully-built skill; each
 * profession we support gets its own skill brain over time.
 *
 * NOTE: this is distinct from "Paige Skills" (/admin/skills), which is the
 * sub-agent/skills *engine* (the forge). This is the tenant-facing add-on store.
 */

export type SkillStatus = "available" | "coming_soon";

export interface MarketplaceSkill {
  /** Stable slug — matches features.enabled_skills entries and the AI gate. */
  slug: string;
  name: string;
  /** One-line value prop. */
  tagline: string;
  /** What it adds to Paige, in the tenant's terms. */
  description: string;
  category: string;
  status: SkillStatus;
  /** lucide-react icon name, resolved in the UI. */
  icon: string;
}

export interface SkillCategory {
  key: string;
  label: string;
  blurb: string;
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    key: "verticals",
    label: "Practice Verticals",
    blurb: "Domain brains that give Paige deep, profession-specific expertise. Layer one onto your practice — your persona stays yours.",
  },
  {
    key: "playbooks",
    label: "Playbooks & Knowledge",
    blurb: "Proven frameworks Paige draws on with every client. Install one and she runs discovery, retention, pricing, and more like a seasoned operator.",
  },
  {
    key: "experience",
    label: "Client Experience",
    blurb: "Shape how your client portal looks and talks.",
  },
  {
    key: "growth",
    label: "Growth & Automation",
    blurb: "Put Paige to work on pipeline, follow-ups, and campaigns.",
  },
];

export const MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  {
    slug: "funding",
    name: "Funding & Capital-Raising",
    tagline: "Turn Paige into a funding-desk strategist.",
    description:
      "Adds credit, business-credit, and capital-raising expertise to Paige — funding readiness, lender matching, bureau strategy, and a deep funding knowledge base. Layers on top of any coach type; your persona and journey stay yours.",
    category: "verticals",
    status: "available",
    icon: "TrendingUp",
  },
  // Profession skill-packs land here as they're built (each vertical gets its own
  // brain). Shown as roadmap so the catalog's shape is visible; never toggleable
  // until real.
  {
    slug: "portal_theming",
    name: "Portal Theming",
    tagline: "Make the client portal unmistakably yours.",
    description: "Custom skins, layouts, and module arrangements for your client portal beyond logo and color.",
    category: "experience",
    status: "coming_soon",
    icon: "Palette",
  },
  {
    slug: "voice_agent",
    name: "Voice Agent",
    tagline: "Let clients talk to Paige.",
    description: "A voice-first Paige that answers, intakes, and follows up by phone under your brand.",
    category: "experience",
    status: "coming_soon",
    icon: "Mic",
  },
  {
    slug: "automations",
    name: "Automations",
    tagline: "Paige builds and runs your plays.",
    description: "Describe an automation in plain language and Paige builds it on your connected workflow engine — follow-ups, dunning, nurture, and more.",
    category: "growth",
    status: "coming_soon",
    icon: "Workflow",
  },
];

export function skillsByCategory(category: string): MarketplaceSkill[] {
  return MARKETPLACE_SKILLS.filter((s) => s.category === category);
}
