// Team-group derivation (IA slice 1c-ix, Team Live-Ops Floor).
//
// HONESTY (§13): there is NO team_group column anywhere in the schema. Team groups
// are a CODE-SIDE, UI-ONLY organization derived off user_roles.role — the same
// role→persona intent as ROLE_TO_PERSONA (commandCenterRegistry). Every surface that
// uses this MUST label it "organized by role" and never imply a backend segmentation.
//
// §2: coaching-generic. §9: no vertical/finance content — plain org roles only.

export type TeamGroup = "leadership" | "sales" | "delivery" | "support" | "ops" | "marketing";

export const GROUP_LABEL: Record<TeamGroup, string> = {
  leadership: "Leadership",
  sales: "Sales",
  delivery: "Delivery",
  support: "Client Success",
  ops: "Operations",
  marketing: "Marketing",
};

/** Group display order (leadership first). */
export const GROUP_ORDER: TeamGroup[] = ["leadership", "sales", "delivery", "support", "ops", "marketing"];

// Real app_role → group. Uses ONLY roles that exist in the schema today
// (admin/coach/sales_rep/cs_rep/finance/viewer/owner/broker/broker_team_member/
// affiliate/moderator/super_admin). There is NO setter/closer/success_coach app_role
// value — we do NOT invent roster rows for roles that don't exist (§13).
export const ROLE_TO_GROUP: Record<string, TeamGroup> = {
  owner: "leadership",
  admin: "leadership",
  super_admin: "leadership",
  moderator: "leadership",
  sales_rep: "sales",
  broker: "sales",
  broker_team_member: "sales",
  affiliate: "sales",
  coach: "delivery",
  cs_rep: "support",
  finance: "ops",
  viewer: "ops",
};

/**
 * Highest-authority group wins for a multi-hat member. GROUP_ORDER is the
 * precedence (leadership first). Falls back to "ops" for an unmapped/no-role staff
 * row so a member never crashes the grouping and never spawns a 7th group.
 */
export function groupForRoles(roles: string[]): TeamGroup {
  for (const g of GROUP_ORDER) {
    for (const [r, grp] of Object.entries(ROLE_TO_GROUP)) {
      if (grp === g && roles.includes(r)) return g;
    }
  }
  return "ops";
}

// COACHING DISPLAY LABEL — a coaching-friendly name shown ONLY where a real mapped
// role backs it (§13). cs_rep legitimately IS the success-coach seat; every other row
// uses its honest role name. No "Setter"/"Closer" label is emitted because no such
// app_role exists — labeling a real sales_rep as a "Closer" would be a fabrication.
export const ROLE_DISPLAY_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  super_admin: "Owner",
  moderator: "Moderator",
  sales_rep: "Sales rep",
  broker: "Broker",
  broker_team_member: "Broker team",
  coach: "Coach",
  cs_rep: "Success Coach",
  finance: "Finance",
  viewer: "Viewer",
  affiliate: "Affiliate",
};

/** Honest human label for a single role (falls back to the raw role, space-cased). */
export function roleLabel(role: string): string {
  return ROLE_DISPLAY_LABEL[role] ?? role.replace(/_/g, " ");
}
