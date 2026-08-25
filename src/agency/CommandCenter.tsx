// @ts-nocheck
import React from "react";
import { AgencyCommandCenterCore } from "@/components/tenant-shell/TenantCommandCenterCore";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic } from "./_shared";

const noop = () => {};

const CommandCenter = ({ isAgency = true, acting = null, openAsk = noop }) => {
  const [tab, setTab] = useSubtabRoute(
    isAgency ? "agency" : "sub_account",
    "command-center",
    "main",
  );
  const tabs = [
    ["main", "Command Center", () => <Ic.grid size={15} />],
    ["systems", "Systems Check", () => <Ic.pulse size={15} />],
  ];
  const currentTab = tabs.some(([id]) => id === tab) ? tab : "main";

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
        {currentTab === "main" ? (
          <AgencyCommandCenterCore context={{ isAgency, acting }} openPaige={openAsk} />
        ) : (
          <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto" }}>
            <SystemsCheckTile scope="tenant" />
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandCenter;
export { CommandCenter };
