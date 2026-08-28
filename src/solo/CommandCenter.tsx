// @ts-nocheck
import React, { useEffect } from "react";
import { Activity, Clock3, Grid3X3 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { TenantSystemsCheckSecondaryView } from "@/components/tenant-shell/TenantSystemsCheckSecondaryView";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { SoloSystemsCheckWorkspace } from "./SoloSystemsCheckWorkspace";

const TABS = [
  ["sys", "Systems Check", Activity],
  ["dir", "Directory", Grid3X3],
  ["hist", "History", Clock3],
];

const CommandCenter = ({ accountContext, openPaige }) => <SoloSystemsCheckWorkspace accountContext={accountContext} openPaige={openPaige} />;

const CommandHub = ({ accountContext, openPaige }) => {
  const [tab, setTab] = useSubtabRoute("solo", "command-center", "sys");
  const { activeTenantId } = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!/\/command-center(?:\/overview)?\/?$/.test(location.pathname)) return;
    const pathname = location.pathname.replace(
      /\/command-center(?:\/overview)?\/?$/,
      "/command-center/systems-check",
    );
    navigate(`${pathname}${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflow: "hidden" }}>
      <nav
        aria-label="Command Center sections"
        style={{
          display: "flex", alignItems: "stretch", minHeight: 43,
          padding: "0 clamp(14px, 2.2vw, 30px)", gap: 5, flex: "0 0 auto",
          background: "var(--pg-spine)",
          borderBottom: "1px solid var(--pg-line)",
        }}
      >
        {TABS.map(([key, text, Icon]) => {
          const active = tab === key;
          return (
            <button
              key={key} type="button" aria-current={active ? "page" : undefined}
              onClick={() => setTab(key)}
              style={{
                position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
                border: 0, padding: "0 11px", background: "transparent",
                color: active ? "var(--pg-ink)" : "var(--pg-muted)",
                fontSize: 11, fontWeight: active ? 800 : 650, cursor: "pointer",
              }}
            >
              <Icon size={14} color={active ? "var(--pg-gold)" : "currentColor"} aria-hidden="true" />
              {text}
              {active && <span aria-hidden="true" style={{ position: "absolute", inset: "auto 8px -1px", height: 2, borderRadius: 2, background: "var(--pg-gold)" }} />}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        {tab === "sys" ? (
          <CommandCenter key={activeTenantId ?? "unresolved"} accountContext={accountContext} openPaige={openPaige} />
        ) : (
          <div style={{ height: "100%", overflow: "auto", overscrollBehavior: "contain" }}>
            <TenantSystemsCheckSecondaryView view={tab === "dir" ? "directory" : "history"} />
          </div>
        )}
      </div>
    </div>
  );
};

export { CommandHub, CommandCenter };
