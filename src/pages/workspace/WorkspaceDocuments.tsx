/** BTF Workspace · Documents — Day 6 placeholder. */
export default function WorkspaceDocuments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Documents</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Securely upload anything your coach requests. All files are encrypted at rest.
        </p>
      </div>
      <div className="workspace-card p-6">
        <p className="text-sm">Drop zone activates with your first document request.</p>
      </div>
    </div>
  );
}
