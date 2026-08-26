import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { AdminBridgeBell } from "@/components/admin/AdminBridgeBell";
import { DialPadTrigger } from "@/components/admin/voice/DialPadTrigger";
import { useAgentPresence } from "@/components/ui/paige";
import { CommandGlyph, CommandMark } from "@/operator/shell/CommandMark";
import {
  resolveTenantShellDestination,
  tenantAccountTypeLabel,
  tenantShellDestinationsForPath,
} from "./tenantShellRoutes";
import "./tenant-command-center-shell.css";

const NAV_PREF_KEY = "paige.tenantShell.navExpanded";
const PaigeAIChat = lazy(() =>
  import("@/components/dashboard/PaigeAIChat").then((module) => ({ default: module.PaigeAIChat })),
);

function readNavPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(NAV_PREF_KEY);
    if (stored === "true" || stored === "false") return stored === "true";
  } catch {
    // Storage can be unavailable in private mode. The in-memory state still works.
  }
  return window.innerWidth >= 1440;
}

function persistNavPreference(expanded: boolean): void {
  try {
    window.localStorage.setItem(NAV_PREF_KEY, String(expanded));
  } catch {
    // Fail soft: this session keeps the user's choice even if persistence is blocked.
  }
}

export interface TenantCommandCenterShellProps {
  children: ReactNode;
  accountName: string;
  accountType?: string | null;
  providedBy?: string | null;
  userRole: "admin" | "coach";
  accountControls?: ReactNode;
  onSignOut: () => void;
  signingOut?: boolean;
}

export function TenantPaigeCommandField({
  expanded,
  onOpen,
}: {
  expanded: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-tenant-paige-command
      className="tcs-command-field"
      onClick={onOpen}
      aria-expanded={expanded}
      aria-controls="tenant-paige-workspace"
      aria-label="Direct PAIGE"
    >
      <span className="tcs-command-glyph" data-state={expanded ? "charged" : "dormant"}>
        <CommandGlyph size={18} />
      </span>
      <span>Direct PAIGE, or press ⌘K</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

export function TenantCommandCenterShell({
  children,
  accountName,
  accountType,
  providedBy,
  userRole,
  accountControls,
  onSignOut,
  signingOut = false,
}: TenantCommandCenterShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { resolvedTheme, setTheme } = useTheme();
  const { railExpanded, expandRail, collapseRail } = useAgentPresence();
  const [navExpanded, setNavExpanded] = useState(readNavPreference);
  const [announcement, setAnnouncement] = useState("PAIGE workspace ready");
  const destinations = tenantShellDestinationsForPath(location.pathname, accountType);
  const destination = resolveTenantShellDestination(location.pathname, accountType);
  const isDark = resolvedTheme !== "light";
  const detached = new URLSearchParams(location.search).get("paigeSurface") === "detached";

  const setNavigation = useCallback((expanded: boolean) => {
    setNavExpanded(expanded);
    persistNavPreference(expanded);
    setAnnouncement(expanded ? "Navigation expanded" : "Navigation folded");
  }, []);

  const openPaige = useCallback(() => {
    expandRail();
    setAnnouncement("PAIGE conversation opened");
  }, [expandRail]);

  const closePaige = useCallback(() => {
    collapseRail();
    setAnnouncement("PAIGE conversation folded; your thread is preserved");
  }, [collapseRail]);

  const detachPaige = useCallback(() => {
    const next = new URL(window.location.href);
    next.searchParams.set("paigeSurface", "detached");
    let child: Window | null = null;
    try {
      child = window.open(next.toString(), "paige-tenant-command", "popup,width=470,height=820");
    } catch {
      child = null;
    }
    if (child) {
      collapseRail();
      setAnnouncement("PAIGE opened in a separate authenticated workspace");
    } else {
      setAnnouncement("Your browser blocked the PAIGE window; allow pop-ups and try again");
    }
  }, [collapseRail]);

  const redockPaige = useCallback(() => {
    if (window.opener) {
      window.close();
      return;
    }
    const next = new URLSearchParams(location.search);
    next.delete("paigeSurface");
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
    expandRail();
  }, [expandRail, location.pathname, location.search, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "\\") return;
      event.preventDefault();
      if (event.altKey) setNavigation(!navExpanded);
      else if (railExpanded) closePaige();
      else openPaige();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePaige, navExpanded, openPaige, railExpanded, setNavigation]);

  if (detached) {
    return (
      <div data-pg={isDark ? "dark" : "light"} data-tenant-shell data-paige-popout>
        <span className="tcs-sr-live" aria-live="polite">{announcement}</span>
        <PaigeWorkspace onFold={redockPaige} onDetach={redockPaige} detached />
      </div>
    );
  }

  return (
    <div
      data-pg={isDark ? "dark" : "light"}
      data-tenant-shell
      data-nav={navExpanded ? "expanded" : "compact"}
      data-paige={railExpanded ? "open" : "closed"}
      data-reduced-motion={reduceMotion ? "true" : "false"}
    >
      <span className="tcs-sr-live" aria-live="polite">{announcement}</span>
      <a className="tcs-skip" href="#tenant-shell-main">Skip to content</a>

      <nav className="tcs-nav" aria-label="Tenant workspace">
        <div className="tcs-brand">
          <CommandMark state="dormant" size={24} />
          <div className="tcs-brand-copy">
            <strong>PAIGE</strong>
            <span>Business operating system</span>
          </div>
          <button
            type="button"
            className="tcs-icon-button tcs-nav-fold"
            onClick={() => setNavigation(!navExpanded)}
            aria-label={navExpanded ? "Fold navigation" : "Expand navigation"}
            title={navExpanded ? "Fold navigation" : "Expand navigation"}
          >
            {navExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
        </div>

        <div className="tcs-nav-links">
          {destinations.map(({ id, label, href, icon: Icon }) => {
            const active = destination.id === id;
            return (
              <Link
                key={id}
                to={href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
                title={!navExpanded ? label : undefined}
              >
                <Icon aria-hidden />
                <span>{label}</span>
                <i aria-hidden />
              </Link>
            );
          })}
        </div>

        <div className="tcs-nav-foot">
          <button
            type="button"
            className="tcs-nav-action"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
            title={!navExpanded ? (isDark ? "Light theme" : "Dark theme") : undefined}
          >
            {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
            <span>{isDark ? "Light theme" : "Dark theme"}</span>
          </button>
          <button
            type="button"
            className="tcs-nav-action"
            onClick={onSignOut}
            disabled={signingOut}
            title={!navExpanded ? "Sign out" : undefined}
          >
            <LogOut aria-hidden />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
          <div className="tcs-account-seal" title={!navExpanded ? accountName : undefined}>
            <span>{accountName.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{accountName}</strong>
              <small>{userRole === "admin" ? "Owner workspace" : "Team workspace"}</small>
            </div>
          </div>
        </div>
      </nav>

      <section className="tcs-canvas">
        <header className="tcs-command-row">
          <div className="tcs-context">
            <span>{accountName}</span>
            <strong>{destination.label}</strong>
            <small>{providedBy ? `Provided by ${providedBy}` : tenantAccountTypeLabel(accountType)}</small>
          </div>
          <TenantPaigeCommandField expanded={railExpanded} onOpen={openPaige} />
          <div className="tcs-command-actions">
            <div className="tcs-account-controls" aria-label="Account context controls">{accountControls}</div>
            <DialPadTrigger />
            <AdminBridgeBell />
          </div>
        </header>

        <main id="tenant-shell-main" className="tcs-main">{children}</main>
      </section>

      {railExpanded && <button className="tcs-paige-backdrop" onClick={closePaige} aria-label="Fold PAIGE conversation" />}
      {railExpanded && <PaigeWorkspace onFold={closePaige} onDetach={detachPaige} />}
    </div>
  );
}

function PaigeWorkspace({
  onFold,
  onDetach,
  detached = false,
}: {
  onFold: () => void;
  onDetach: () => void;
  detached?: boolean;
}) {
  return (
    <aside id="tenant-paige-workspace" className="tcs-paige" aria-label="PAIGE command workspace">
      <header className="tcs-paige-header">
        <span className="tcs-paige-mark"><CommandGlyph size={20} /></span>
        <div>
          <strong>PAIGE</strong>
          <span>Your live operating partner</span>
        </div>
        <button
          type="button"
          className="tcs-icon-button"
          onClick={onDetach}
          aria-label={detached ? "Dock PAIGE back into the workspace" : "Open PAIGE in a new window"}
          title={detached ? "Dock PAIGE" : "Open in new window"}
        >
          {detached ? <ChevronLeft aria-hidden /> : <ExternalLink aria-hidden />}
        </button>
        {!detached && (
          <button type="button" className="tcs-icon-button" onClick={onFold} aria-label="Fold PAIGE conversation" title="Fold PAIGE">
            <ChevronRight aria-hidden />
          </button>
        )}
      </header>
      <div className="tcs-paige-body">
        <Suspense
          fallback={
            <div className="tcs-paige-loading" role="status">
              <CommandMark state="dormant" size={24} />
              <span>Opening your PAIGE workspace…</span>
            </div>
          }
        >
          <PaigeAIChat
            hideHeader
            fill
            enableHistory
            renderRail={() => null}
          />
        </Suspense>
      </div>
    </aside>
  );
}
