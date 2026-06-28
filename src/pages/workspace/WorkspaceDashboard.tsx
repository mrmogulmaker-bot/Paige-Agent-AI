/**
 * BTF Client Workspace · Dashboard
 * White-labeled. No "Paige" branding.
 * v1 placeholder — full hydration from btf_workspace_settings, btf_phase_items,
 * coach card, payment mini-card, and "What's next" callout lands Day 4.
 */
export default function WorkspaceDashboard() {
  return (
    <div className="space-y-6">
      <div className="workspace-card p-6">
        <h1 className="text-3xl mb-2">Welcome to your Build to Fund Workspace</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          This is the home base for your Build → Stack → Fund journey with
          Mogul Maker Academy. Your assigned coach will guide every step.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="workspace-card p-5">
          <div className="text-xs uppercase tracking-widest workspace-gold mb-1">Current Phase</div>
          <div className="text-2xl workspace-heading">BUILD</div>
          <span className="workspace-phase-pill active mt-2">Phase 1 of 3</span>
        </div>
        <div className="workspace-card p-5">
          <div className="text-xs uppercase tracking-widest workspace-gold mb-1">Your Coach</div>
          <div className="text-lg workspace-heading">Coming soon</div>
          <p className="text-xs mt-1" style={{ color: "rgba(8,20,40,0.6)" }}>
            Your dedicated coach will be introduced shortly.
          </p>
        </div>
        <div className="workspace-card p-5">
          <div className="text-xs uppercase tracking-widest workspace-gold mb-1">Investment</div>
          <div className="text-lg workspace-heading">$1,000 of $4,997</div>
          <p className="text-xs mt-1" style={{ color: "rgba(8,20,40,0.6)" }}>
            Get-Started Plan
          </p>
        </div>
      </div>

      <div className="workspace-card p-6">
        <h2 className="text-xl mb-2 workspace-heading">What's next</h2>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Complete your intake form so your coach can prepare your Phase 1 plan.
        </p>
        <a href="/workspace/intake" className="workspace-btn-gold inline-block mt-4">
          Start Intake Form
        </a>
      </div>
    </div>
  );
}
