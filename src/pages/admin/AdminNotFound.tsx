import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { PageShell, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

/**
 * Admin-native 404 — rendered by Admin.tsx's scoped catch-all for any unmatched
 * /admin/* path. Distinct from the marketing src/pages/NotFound.tsx (which is a
 * full-viewport, hardcoded-gray, hard-<a href="/"> reload) because this renders
 * INSIDE the already-chromed AdminLayout: token-aware (no hardcoded hex, works in
 * both themes, §11/§23), no min-h-screen takeover, and recovers via SPA <Link>
 * back to the operator/tenant home — never bouncing the user out to the public site.
 */
export function AdminNotFound() {
  return (
    <PageShell width="wide">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This admin page doesn't exist or has moved. Let's get you back to your dashboard."
        action={
          <Button asChild>
            <Link to="/admin">Back to dashboard</Link>
          </Button>
        }
      />
    </PageShell>
  );
}

export default AdminNotFound;
