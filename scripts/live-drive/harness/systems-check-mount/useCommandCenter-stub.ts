export function useCommandCenter() {
  return {
    accountEpoch: 0, approvals: [], metrics: [], departments: [], attention: null,
    greeting: { name: "Owner", dateLabel: "Saturday, August 29", summary: "One signal needs attention." },
    loading: false, isError: false, refresh: () => undefined,
    approve: async () => ({ ok: true }), decline: async () => ({ ok: true }),
  };
}
