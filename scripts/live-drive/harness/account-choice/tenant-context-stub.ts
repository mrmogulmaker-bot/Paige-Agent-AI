export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: string;
  account_type: string;
  parent_tenant_id: string | null;
  account_number: number;
  features: Record<string, unknown>;
};

const allTenants: TenantSummary[] = [
  { id: "example-studio", slug: "example-studio", name: "Example Studio", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 111111, features: {} },
  { id: "northstar", slug: "northstar", name: "Northstar Advisors", status: "trial", account_type: "agency", parent_tenant_id: null, account_number: 222222, features: {} },
];

const scenario = new URLSearchParams(window.location.search).get("case") ?? "staff-multi";
const isPlatformStaff = scenario.startsWith("staff") || scenario === "context-error";
const tenants = scenario === "staff-only" || scenario === "none" || scenario === "inaccessible"
  ? []
  : scenario === "one"
    ? allTenants.slice(0, 1)
    : allTenants;

const context = {
  tenants,
  activeTenantId: scenario === "staff-multi" ? "example-studio" : null,
  accountContextLoading: false,
  isPlatformStaff,
  switchTenant: async (tenantId: string | null) => {
    (window as Window & { __accountChoiceSwitches?: Array<string | null> }).__accountChoiceSwitches ??= [];
    (window as Window & { __accountChoiceSwitches: Array<string | null> }).__accountChoiceSwitches.push(tenantId);
    return scenario !== "switch-failure";
  },
};

export function useTenantContext() {
  const [accountContextStatus, setAccountContextStatus] = useState<"error" | "ready">(
    scenario === "context-error" ? "error" : "ready",
  );
  return {
    ...context,
    accountContextStatus,
    refresh: async () => {
      (window as Window & { __accountChoiceRefreshes?: number }).__accountChoiceRefreshes =
        ((window as Window & { __accountChoiceRefreshes?: number }).__accountChoiceRefreshes ?? 0) + 1;
      setAccountContextStatus("ready");
    },
  };
}
import { useState } from "react";
