/** BTF Workspace · Payment Status — Day 8 placeholder (read-only). */
export default function WorkspacePayments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Payment Status</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Track your Build to Fund investment plan.
        </p>
      </div>

      <div className="workspace-card p-6">
        <div className="grid gap-4 md:grid-cols-3 text-center">
          <div>
            <div className="text-xs uppercase tracking-widest workspace-gold">Total</div>
            <div className="text-2xl workspace-heading mt-1">$4,997</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest workspace-gold">Collected</div>
            <div className="text-2xl workspace-heading mt-1">$1,000</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest workspace-gold">Remaining</div>
            <div className="text-2xl workspace-heading mt-1">$3,997</div>
          </div>
        </div>
        <p className="text-xs mt-6 text-center" style={{ color: "rgba(8,20,40,0.55)" }}>
          Live payment data syncs from your account record. Update payment method coming in a future release.
        </p>
      </div>
    </div>
  );
}
