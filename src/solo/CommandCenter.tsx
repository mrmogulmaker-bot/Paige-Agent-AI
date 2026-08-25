// @ts-nocheck
import React from "react";
import { SoloCommandCenterCore } from "@/components/tenant-shell/TenantCommandCenterCore";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs } from "./_shared";

const CommandCenter = ({ openPaige }) => (
  <SoloCommandCenterCore openPaige={openPaige} />
);

const CommandHub = ({ openPaige }) => {
  const [tab, setTab] = useSubtabRoute("solo", "command-center", "home");
  const tabs = [
    ["home", "Command Center", () => <Ic.grid size={15} />],
    ["sys", "Systems Check", () => <Ic.pulse size={15} />],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab} />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "home" ? (
          <CommandCenter openPaige={openPaige} />
        ) : (
          <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
            <SystemsCheckTile scope="tenant" />
          </div>
        )}
      </div>
    </div>
  );
};

export { CommandHub, CommandCenter };
