/**
 * "Your Paige" route entry. The page body is now the agent workspace
 * (chat-dominant, with the "Customize Paige" console that folds in the Playbook
 * editor + tenant Knowledge + Knowledge Review). This file stays as the route
 * import so Admin.tsx routing never moves (roadmap #68 / #78).
 */
import PaigeWorkspace from "@/components/paige/PaigeWorkspace";

export default function PlaybookAdmin() {
  return <PaigeWorkspace />;
}
