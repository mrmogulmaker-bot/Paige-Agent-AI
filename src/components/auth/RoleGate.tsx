import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";

interface RoleGateProps {
  /** Roles permitted to view children. Empty = any authenticated user. */
  allow?: AppRole[];
  /** Also allow the hardcoded platform owner (Antonio). */
  allowOwner?: boolean;
  /** Custom fallback. Defaults to an inline "access denied" panel. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative role gate. Wrap any route or section that must be
 * restricted to certain roles. Defaults to a friendly inline panel
 * so admins previewing as coaches/clients still see *why* a page
 * is hidden instead of a blank screen.
 */
export function RoleGate({ allow = [], allowOwner = true, fallback, children }: RoleGateProps) {
  const { loading, roles, isAdmin } = useUserRoles();
  const { isPlatformOwner } = useTenantContext();

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground animate-pulse">
        Checking access…
      </div>
    );
  }

  const ownerOk = allowOwner && (isPlatformOwner || isAdmin);
  const roleOk = allow.length === 0 || roles.some((r) => allow.includes(r));

  if (!ownerOk && !roleOk) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="max-w-md mx-auto mt-12 rounded-lg border border-border bg-card p-6 text-center">
        <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-accent" />
        <h2 className="text-lg font-semibold mb-1">Restricted area</h2>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this section. If you think this is a
          mistake, contact your workspace admin.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
