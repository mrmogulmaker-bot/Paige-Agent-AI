const allMemberships = [
  { tenant_id: "example-studio", role: "owner" },
  { tenant_id: "northstar", role: "admin" },
];

const scenario = new URLSearchParams(window.location.search).get("case") ?? "staff-multi";
const memberships = scenario === "staff-only" || scenario === "none"
  ? []
  : scenario === "one" || scenario === "inaccessible"
    ? allMemberships.slice(0, 1)
    : allMemberships;

export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "harness-user", email: "operator@example.invalid" } }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => {
    const result = {
      data: scenario === "read-error" ? null : memberships,
      error: scenario === "read-error" ? { message: "Synthetic membership read failure" } : null,
    };
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  },
};
