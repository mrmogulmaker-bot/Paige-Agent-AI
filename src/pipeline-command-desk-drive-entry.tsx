/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { createRoot } from "react-dom/client";
import React from "react";
import "./solo/solo-tokens.css";
import "./solo/solo-campaigns.css";
import { PipelineCommandDesk } from "./solo/PipelineCommandDesk";

const params = new URLSearchParams(location.search);
const dark = params.get("theme") === "obsidian";
const docked = params.get("paige") === "open";
const stages = [
  {
    id: "s1",
    pipelineId: "p1",
    label: "New inquiry",
    description: "Fresh interest to review",
    orderIndex: 1,
    archivedAt: null,
    movePolicy: "direct",
    stageType: "open",
    version: 1,
  },
  {
    id: "s2",
    pipelineId: "p1",
    label: "Discovery",
    description: "Fit and goals in progress",
    orderIndex: 2,
    archivedAt: null,
    movePolicy: "direct",
    stageType: "open",
    version: 1,
  },
  {
    id: "s3",
    pipelineId: "p1",
    label: "Decision",
    description: "A recorded choice is next",
    orderIndex: 3,
    archivedAt: null,
    movePolicy: "approval",
    stageType: "open",
    version: 1,
  },
  {
    id: "s4",
    pipelineId: "p1",
    label: "Celebrated",
    description: "Tenant-named winning stage",
    orderIndex: 4,
    archivedAt: null,
    movePolicy: "direct",
    stageType: "won",
    version: 1,
  },
];
const deal = (id, title, stageId, client, next, tag) => ({
  id,
  title,
  pipelineId: "p1",
  stageId,
  clientId: null,
  clientName: client,
  owner: "Workspace owner",
  status: "open",
  source: "Representative render evidence",
  nextAction: next,
  tags: [tag],
  notes: "Representative editable note.",
  createdAt: "2026-09-01T12:00:00Z",
  actualCloseDate: null,
  lostReason: null,
  outcomes: [],
  updatedAt: "2026-09-04T12:00:00Z",
  version: 1,
  history: [
    {
      summary: "Moved into " + stages.find((s) => s.id === stageId)?.label,
      createdAt: "2026-09-04T12:00:00Z",
    },
  ],
});
function Harness() {
  const [data, setData] = React.useState({
    tenantId: "render-tenant",
    phase: "ready",
    retry: () => {},
    artifacts: [],
    pipelineWorkspace: {
      canManage: true,
      canArchiveFolders: true,
      canDelete: true,
      folders: [
        {
          id: "f1",
          name: "Programs",
          description: "",
          lifecycleStatus: "active",
          pipelineCount: 1,
          version: 1,
        },
      ],
      pipelines: [
        {
          id: "p1",
          shortRef: "PPL-MVP1",
          folderId: "f1",
          folderName: "Programs",
          name: "Client Growth Journey",
          description: "Tenant-owned stages",
          isDefault: true,
          lifecycleStatus: "active",
          version: 1,
          createdAt: "2026-09-01T12:00:00Z",
          updatedAt: "2026-09-04T12:00:00Z",
          createdThrough: "owner",
          createdByName: "Workspace owner",
          requestedByName: null,
          stageCount: 4,
          dealCount: 3,
        },
      ],
      stages,
      deals: [
        deal(
          "d1",
          "Jordan Lee",
          "s1",
          "Lumen House",
          "Review submitted brief",
          "priority",
        ),
        deal(
          "d2",
          "Avery Brooks",
          "s2",
          "Pine & Pearl",
          "Confirm next meeting",
          "follow-up",
        ),
        deal(
          "d3",
          "Morgan Wells",
          "s3",
          "Arcwell Co.",
          "Record decision",
          "approval",
        ),
      ],
    },
  });
  const pipelineAction = async (action: any) => {
    await new Promise((r) => setTimeout(r, 40));
    setData((value) => {
      const ws = value.pipelineWorkspace;
      if (action.type === "move-deal")
        return {
          ...value,
          pipelineWorkspace: {
            ...ws,
            deals: ws.deals.map((d) =>
              d.id === action.dealId
                ? {
                    ...d,
                    stageId: action.targetStageId,
                    version: d.version + 1,
                    updatedAt: new Date().toISOString(),
                  }
                : d,
            ),
          },
        };
      if (action.type === "update-deal")
        return {
          ...value,
          pipelineWorkspace: {
            ...ws,
            deals: ws.deals.map((d) =>
              d.id === action.dealId
                ? {
                    ...d,
                    title: action.title,
                    tags: action.tags,
                    notes: action.notes,
                    version: d.version + 1,
                  }
                : d,
            ),
          },
        };
      return value;
    });
    return { ok: true, message: "Representative local action completed." };
  };
  const bound = { ...data, pipelineAction };
  return (
    <div
      className="paige-solo"
      data-theme={dark ? "dark" : "light"}
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: docked ? "minmax(0,1fr) 330px" : "minmax(0,1fr)",
        overflow: "hidden",
      }}
    >
      <main
        style={{
          minWidth: 0,
          display: "grid",
          gridTemplateRows: "auto minmax(0,1fr)",
          background: "var(--canvas)",
          padding: 12,
          overflow: "hidden",
        }}
      >
        <p style={{ padding: "5px 8px", color: "var(--ink-3)", fontSize: 10 }}>
          REPRESENTATIVE RENDER PROOF - real component, local deterministic
          records, no production write
        </p>
        <section
          className="campaigns-surface pipeline-surface"
          style={{
            minHeight: 0,
            overflow: "hidden",
            border: "1px solid var(--line)",
            borderRadius: 18,
            background: "var(--surface)",
          }}
        >
          <PipelineCommandDesk
            data={bound}
            selectedId="p1"
            setSelectedId={() => {}}
            folderFilter="all"
            setFolderFilter={() => {}}
            onCreatePipeline={() => {}}
            onManage={() => {}}
            onFolders={() => {}}
          />
        </section>
      </main>
      {docked && (
        <aside
          aria-label="PAIGE docked"
          style={{
            borderLeft: "1px solid var(--line)",
            background: "var(--surface)",
            padding: 18,
            color: "var(--ink)",
          }}
        >
          <span className="eyebrow">PAIGE open</span>
          <h2>Operating partner</h2>
          <p style={{ color: "var(--ink-2)", fontSize: 12 }}>
            The command desk remains usable while the canonical PAIGE rail is
            open.
          </p>
        </aside>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
