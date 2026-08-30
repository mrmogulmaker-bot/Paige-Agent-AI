import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoloSystemsCheckWorkspace } from "@/solo/SoloSystemsCheckWorkspace";
import "@/index.css";

document.documentElement.setAttribute("data-pg", "dark");
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ height: "100vh", minWidth: 0, background: "var(--pg-canvas)" }}>
      <SoloSystemsCheckWorkspace accountContext={{ accountName: "Harness tenant", accountType: "standalone" }} />
    </div>
  </StrictMode>,
);
