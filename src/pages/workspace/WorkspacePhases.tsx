/** BTF Workspace · Phase Tracker — Day 4 placeholder. */
export default function WorkspacePhases() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Your Roadmap</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Three phases. One direction. Every step tracked.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { name: "Build", desc: "Form, structure, and stand up the business.", state: "active" },
          { name: "Stack", desc: "Open and verify reporting tradelines.", state: "locked" },
          { name: "Fund", desc: "Match lenders and submit applications.", state: "locked" },
        ].map((p) => (
          <div key={p.name} className="workspace-card p-5">
            <span className={`workspace-phase-pill ${p.state}`}>{p.name}</span>
            <h3 className="text-xl mt-3 workspace-heading">{p.name} Phase</h3>
            <p className="text-sm mt-1" style={{ color: "rgba(8,20,40,0.7)" }}>{p.desc}</p>
          </div>
        ))}
      </div>

      <div className="workspace-card p-6">
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Your detailed checklist appears here once your coach activates Phase 1.
        </p>
      </div>
    </div>
  );
}
