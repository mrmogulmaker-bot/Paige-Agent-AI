// @ts-nocheck
import React from "react";
import { AgencyCommandCenterCore } from "@/components/tenant-shell/TenantCommandCenterCore";
import { TenantSystemsCheckSecondaryView } from "@/components/tenant-shell/TenantSystemsCheckSecondaryView";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic } from "./_shared";

const noop = () => {};

const CommandCenter = ({ accountContext = null, isAgency = true, acting = null, openAsk = noop }) => {
  const rootKey = isAgency ? "main" : "home";
  const systemsKey = isAgency ? "systems" : "sys";
  const directoryKey = isAgency ? "directory" : "dir";
  const historyKey = isAgency ? "history" : "hist";
  const [tab, setTab] = useSubtabRoute(
    isAgency ? "agency" : "sub_account",
    "command-center",
    rootKey,
  );
  const tabs = [
    [systemsKey, "Systems Check", () => <Ic.pulse size={15} />],
    [directoryKey, "Directory", () => <Ic.grid size={15} />],
    [historyKey, "History", () => <Ic.pulse size={15} />],
  ];
  const currentTab = tab;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <div
        className="row tabstrip"
        style={{
          gap: 22,
          padding: "0 26px",
          borderBottom: "1px solid var(--line)",
          background: "var(--canvas)",
          flex: "none",
          overflowX: "hidden",
        }}
      >
        {tabs.map(([id, label, Icon]) => {
          const active = currentTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="row"
              style={{
                gap: 8,
                padding: "12px 2px",
                whiteSpace: "nowrap",
                fontSize: 13.5,
                fontWeight: active ? 600 : 450,
                color: active ? "var(--ink)" : "var(--ink-3)",
                borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
                flex: "none",
              }}
            >
              <span style={{ display: "flex", opacity: 0.85, color: active ? "var(--gold)" : "inherit" }}>
                <Icon />
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div
        key={currentTab}
        className="fade-in"
        style={{ flex: 1, minHeight: 0, padding: "22px 26px 24px", overflow: "auto" }}
      >
        {currentTab === rootKey ? (
          <AgencyCommandCenterCore accountContext={accountContext} context={{ isAgency, acting }} openPaige={openAsk} />
        ) : currentTab === systemsKey ? (
          <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto" }}>
            <SystemsCheckTile scope="tenant" />
          </div>
        ) : (
          <TenantSystemsCheckSecondaryView view={currentTab === directoryKey ? "directory" : "history"} />
        )}
      </div>
    </div>
  );
};

export default CommandCenter;
export { CommandCenter };
