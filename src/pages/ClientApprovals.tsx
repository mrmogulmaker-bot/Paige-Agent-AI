import { Helmet } from "react-helmet-async";
import { ClientApprovalsView } from "@/components/approvals/ClientApprovalsView";

export default function ClientApprovals() {
  return (
    <div className="space-y-6">
      <Helmet>
        <title>Approvals · Paige Agent AI</title>
        <meta name="description" content="See every action Paige requested on your behalf, your current stage, and any steps that need your input." />
      </Helmet>
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Everything Paige requested on your behalf — what's open, what's resolved, and what (if anything) needs you.
        </p>
      </div>
      <ClientApprovalsView />
    </div>
  );
}
