import { PlanningHub } from "@/components/planning/PlanningHub";

/**
 * Admin workspace Planning — the same tenant/caller-scoped hub the client view
 * mounts, but staffed (Assigned to me / by me / Team scopes) and pointing its
 * "Plan with Paige" CTA at the admin's Your Paige surface. This is the "wired to
 * the admin user" home the owner asked for: reminders/tasks Paige sets show up
 * here, not only in the chat (HubSpot/Asana/GHL parity).
 */
export default function PlanningAdmin() {
  return <PlanningHub staff paigeHref="/admin/playbook" />;
}
