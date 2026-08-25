// @ts-nocheck
import React from "react";
import { SoloCommandCenterCore } from "@/components/tenant-shell/TenantCommandCenterCore";
import { TenantSystemsCheckSecondaryView } from "@/components/tenant-shell/TenantSystemsCheckSecondaryView";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs } from "./_shared";

const CommandCenter = ({ accountContext, openPaige }) => (
  <SoloCommandCenterCore accountContext={accountContext} openPaige={openPaige} />
);

const CommandHub = ({ accountContext, openPaige }) => {
  const [tab, setTab] = useSubtabRoute("solo", "command-center", "home");
  const tabs = [
    ["sys", "Systems Check", () => <Ic.pulse size={15} />],
    ["dir", "Directory", () => <Ic.grid size={15} />],
    ["hist", "History", () => <Ic.pulse size={15} />],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab} />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "home" ? (
          <CommandCenter accountContext={accountContext} openPaige={openPaige} />
        ) : tab === "sys" ? (
          <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
            <SystemsCheckTile scope="tenant" />
          </div>
        ) : (
          <TenantSystemsCheckSecondaryView view={tab === "dir" ? "directory" : "history"} />
        )}
      </div>
    </div>
  );
};

export { CommandHub, CommandCenter };
