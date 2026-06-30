import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { RoleGate } from "@/components/auth/RoleGate";
import { ShieldAlert } from "lucide-react";
import "./workspace-theme.css";


/**
 * White-labeled shell for the Build to Fund Client Workspace.
 * Branded as Mogul Maker Academy. The product name "Paige" must
 * never appear in this layout, in copy, in <title>, or in any
 * route under /workspace/*.
 */
export default function WorkspaceLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session) navigate("/auth", { replace: true });
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) navigate("/auth", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="workspace-theme flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading your workspace…</div>
      </div>
    );
  }
  if (!user) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="workspace-theme">
      <Helmet>
        <title>Build to Fund Workspace · Mogul Maker Academy</title>
        <meta name="description" content="Your private Build to Fund client workspace by Mogul Maker Academy." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="workspace-topbar">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="workspace-gold text-2xl font-bold tracking-wide" style={{ fontFamily: '"Bookman Old Style", Georgia, serif' }}>
              MMA
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold workspace-gold uppercase tracking-widest">
                Build to Fund
              </div>
              <div className="text-xs opacity-75">Client Workspace</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/workspace" end className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Dashboard
            </NavLink>
            <NavLink to="/workspace/phases" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Phases
            </NavLink>
            <NavLink to="/workspace/intake" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Intake
            </NavLink>
            <NavLink to="/workspace/documents" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Documents
            </NavLink>
            <NavLink to="/workspace/messages" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Messages
            </NavLink>
            <NavLink to="/workspace/payments" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Payments
            </NavLink>
            <NavLink to="/workspace/tasks" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Tasks
            </NavLink>
            <NavLink to="/workspace/funding-readiness" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Funding Readiness
            </NavLink>
            <NavLink to="/workspace/approvals" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Approvals
            </NavLink>
            <NavLink to="/workspace/connect" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}>
              Connect AI
            </NavLink>
          </nav>

          <button onClick={handleSignOut} className="workspace-nav-link text-sm">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/*
          Gate the workspace shell to clients (and admins/owners previewing).
          Coaches and brokers get a friendly restricted panel instead of a
          half-rendered client view if they navigate here directly.
        */}
        <RoleGate
          allow={["client"]}
          fallback={
            <div className="max-w-md mx-auto mt-12 rounded-lg border p-6 text-center" style={{ borderColor: "var(--mma-line)", background: "rgba(255,255,255,0.6)" }}>
              <ShieldAlert className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--mma-gold)" }} />
              <h2 className="text-lg font-semibold mb-1">Member workspace</h2>
              <p className="text-sm opacity-80">
                This area is reserved for enrolled clients. If you're on the team,
                head back to your staff dashboard.
              </p>
            </div>
          }
        >
          <Outlet />
        </RoleGate>
      </main>


      <footer className="border-t mt-12" style={{ borderColor: "var(--mma-line)" }}>
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-center" style={{ color: "rgba(8,20,40,0.6)" }}>
          Powered by Mogul Maker Academy · Antonio Cook ·{" "}
          <a href="mailto:support@news.mrmogulmaker.com" className="underline">support@news.mrmogulmaker.com</a>
        </div>
      </footer>
    </div>
  );
}
