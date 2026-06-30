import { Helmet } from "react-helmet-async";
import { WorkspaceConnectPanel } from "@/components/workspace/WorkspaceConnectPanel";

export default function WorkspaceConnect() {
  return (
    <>
      <Helmet>
        <title>Connect AI Assistant · Mogul Maker Academy</title>
      </Helmet>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mma-gold)" }}>
            Connect your AI assistant
          </h1>
          <p className="text-sm opacity-75 mt-1">
            Use Claude, ChatGPT, or any MCP-compatible AI to talk to your
            workspace from anywhere — limited to your own data.
          </p>
        </header>
        <WorkspaceConnectPanel />
      </div>
    </>
  );
}
