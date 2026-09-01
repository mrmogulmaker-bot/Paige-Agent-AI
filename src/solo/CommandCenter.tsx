// @ts-nocheck
import React, { useEffect, useRef } from "react";
import { Activity, BrainCircuit } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { SoloMindWorkspace } from "./SoloMindWorkspace";
import { SoloSystemsCheckWorkspace } from "./SoloSystemsCheckWorkspace";

const TABS = [
  ["sys", "Systems Check", Activity],
  ["mind", "Mind", BrainCircuit],
];

const CommandCenter = ({ accountContext, openPaige }) => <SoloSystemsCheckWorkspace accountContext={accountContext} openPaige={openPaige} />;

const CommandHub = ({ accountContext, openPaige }) => {
  const [tab, setTab] = useSubtabRoute("solo", "command-center", "sys");
  const { activeTenantId, activeUserId } = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();
  const tabRefs = useRef([]);
  const [routeAnnouncement, setRouteAnnouncement] = React.useState("");

  useEffect(() => {
    if (!/\/command-center(?:\/overview)?\/?$/.test(location.pathname)) return;
    const pathname = location.pathname.replace(
      /\/command-center(?:\/overview)?\/?$/,
      "/command-center/systems-check",
    );
    setRouteAnnouncement("Command Center opened Systems Check.");
    navigate(`${pathname}${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!/\/command-center\/(?:directory|history)\/?$/.test(location.pathname)) return;
    const pathname = location.pathname.replace(
      /\/command-center\/(?:directory|history)\/?$/,
      "/command-center/mind",
    );
    setRouteAnnouncement("Previous record address opened in Mind.");
    navigate(`${pathname}${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  const selectTab = (key, focus = false) => {
    setTab(key);
    if (focus) requestAnimationFrame(() => tabRefs.current[TABS.findIndex(([tabKey]) => tabKey === key)]?.focus());
  };

  const onTabKeyDown = (event, index) => {
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectTab(TABS[next][0], true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflow: "hidden" }}>
      <nav
        aria-label="Command Center sections"
        role="tablist"
        style={{
          display: "flex", alignItems: "stretch", minHeight: 43,
          padding: "0 clamp(14px, 2.2vw, 30px)", gap: 5, flex: "0 0 auto",
          background: "var(--pg-spine)",
          borderBottom: "1px solid var(--pg-line)",
        }}
      >
        {TABS.map(([key, text, Icon], index) => {
          const active = tab === key;
          return (
            <button
              key={key} type="button" role="tab" id={`command-tab-${key}`}
              aria-selected={active} aria-current={active ? "page" : undefined}
              aria-controls={active ? `command-panel-${key}` : undefined} tabIndex={active ? 0 : -1}
              ref={(node) => { tabRefs.current[index] = node; }}
              onClick={() => selectTab(key)} onKeyDown={(event) => onTabKeyDown(event, index)}
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
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>{routeAnnouncement}</span>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        {tab === "sys" ? (
          <div role="tabpanel" id="command-panel-sys" aria-labelledby="command-tab-sys" style={{ height: "100%" }}>
            <CommandCenter key={activeTenantId ?? "unresolved"} accountContext={accountContext} openPaige={openPaige} />
          </div>
        ) : activeTenantId ? (
          <div role="tabpanel" id="command-panel-mind" aria-labelledby="command-tab-mind" style={{ height: "100%" }}>
            <SoloMindWorkspace
              key={`${activeUserId ?? "resolving"}:${activeTenantId}`}
              accountContext={accountContext}
              openPaige={openPaige}
              preferenceScope={activeUserId ? { userId: activeUserId, tenantId: activeTenantId } : null}
            />
          </div>
        ) : (
          <div role="status" aria-live="polite" style={{ padding: 24, color: "var(--pg-muted)" }}>
            Resolving this account's Mind…
          </div>
        )}
      </div>
    </div>
  );
};

export { CommandHub, CommandCenter };

