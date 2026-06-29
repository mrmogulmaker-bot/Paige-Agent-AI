import { Helmet } from "react-helmet-async";
import { ClientApprovalsView } from "@/components/approvals/ClientApprovalsView";

/**
 * White-labeled approvals view for the Build to Fund Workspace.
 * The word "Paige" must NEVER appear on this page.
 */
export default function WorkspaceApprovals() {
  return (
    <div className="space-y-6">
      <Helmet>
        <title>Approvals · Build to Fund Workspace</title>
        <meta name="description" content="Track every request your coaching team made on your behalf and any steps that need your input." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div>
        <h1 className="text-2xl font-bold">Approvals & Action Log</h1>
        <p className="text-sm opacity-75">
          Every request your coaching team is processing on your behalf — what's open, what's resolved,
          and what (if anything) we need from you.
        </p>
      </div>
      <ClientApprovalsView whiteLabel brandedAgentName="your coaching team" />
    </div>
  );
}
