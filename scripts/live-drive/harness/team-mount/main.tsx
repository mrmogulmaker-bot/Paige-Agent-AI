import { createRoot } from "react-dom/client";
import { SoloTeamWorkspace } from "@/solo/team-workspace";
import "@/index.css";
import "@/components/tenant-shell/tenant-command-center-shell.css";
import "@/solo/settings.css";

document.documentElement.setAttribute("data-pg", "dark");
document.documentElement.classList.add("dark");

function Harness() {
  return <div data-tenant-shell data-nav="expanded" data-paige="closed"><nav className="tcs-nav"/><section className="tcs-canvas"><header className="tcs-command-row"><div className="tcs-context"><span>Settings / Team · structural harness</span></div></header><main id="tenant-shell-main" className="tcs-main"><div className="paige-solo" data-theme="dark" style={{ height: "100%", minHeight: 0 }}><div style={{ display: "flex", height: "100%", overflow: "hidden" }}><main data-solo-screen-host className="tcs-main--settings-scrollbar-hidden tcs-main--settings-scrollbar-shown" style={{ flex: 1, overflow: "auto", minHeight: 0, minWidth: 0 }}><section className="solo-settings"><div className="ss-content"><SoloTeamWorkspace openPaige={() => { document.body.dataset.paigeOpened = "true"; }}/></div></section></main></div></div></main></section></div>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
