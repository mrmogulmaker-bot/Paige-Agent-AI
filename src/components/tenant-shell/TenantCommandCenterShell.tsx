import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LockKeyhole,
  LogOut,
  Moon,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  type LucideIcon,
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
  contextualNavigation?: {
    label: string;
    backHref: string;
    backLabel: string;
    activeId: string;
    items: Array<{ id: string; label: string; href: string; icon: LucideIcon }>;
  };
  /** Solo-only presentation slot. Other tiers keep the current shared chat. */
  soloPaigeWorkspace?: ReactNode;
  /** The Solo /paige route displays the same persistent workspace at full size. */
  paigeFull?: boolean;
  paigeFullHref?: string;
  paigeReturnHref?: string;
}

export function TenantPaigeCommandField({
  expanded,
  onOpen,
  autoFocus = false,
}: {
  expanded: boolean;
  onOpen: () => void;
  autoFocus?: boolean;
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
      autoFocus={autoFocus}
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
  contextualNavigation,
  soloPaigeWorkspace,
  paigeFull = false,
  paigeFullHref,
  paigeReturnHref,
}: TenantCommandCenterShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { resolvedTheme, setTheme } = useTheme();
  const { railExpanded, expandRail, collapseRail } = useAgentPresence();
  const [navExpanded, setNavExpanded] = useState(readNavPreference);
  const [paigeWide, setPaigeWide] = useState(false);
  const [paigeOverlay, setPaigeOverlay] = useState(false);
  const [paigeFocusToken, setPaigeFocusToken] = useState(0);
  const [announcement, setAnnouncement] = useState("PAIGE workspace ready");
  const mainNavigationRef = useRef<HTMLDivElement>(null);
  const focusReturnDestination = useRef<string | null>(null);
  const paigeReturnPath = useRef<string | null>(null);
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

  const focusPaigeCommand = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[data-tenant-paige-command]")?.focus();
      });
    });
  }, []);

  const leavePaigeFull = useCallback(() => {
    const target = paigeReturnPath.current ?? paigeReturnHref;
    paigeReturnPath.current = null;
    if (target) navigate(target);
    setPaigeWide(true);
    expandRail();
    setAnnouncement("PAIGE returned to the expanded workspace");
  }, [expandRail, navigate, paigeReturnHref]);

  const togglePaigeFull = useCallback(() => {
    if (paigeFull) {
      leavePaigeFull();
      return;
    }
    if (!paigeFullHref) return;
    paigeReturnPath.current = `${location.pathname}${location.search}`;
    navigate(paigeFullHref);
    expandRail();
    setAnnouncement("PAIGE opened in the full workspace");
  }, [expandRail, leavePaigeFull, location.pathname, location.search, navigate, paigeFull, paigeFullHref]);

  const foldSoloPaige = useCallback(() => {
    setPaigeFocusToken((token) => token + 1);
    if (paigeFull) {
      const target = paigeReturnPath.current ?? paigeReturnHref;
      paigeReturnPath.current = null;
      if (target) navigate(target);
    }
    collapseRail();
    setAnnouncement("PAIGE folded; your conversation is preserved");
    focusPaigeCommand();
  }, [collapseRail, focusPaigeCommand, navigate, paigeFull, paigeReturnHref]);

  useEffect(() => {
    if (!paigeFocusToken || paigeFull || railExpanded) return;
    const restore = () => document.querySelector<HTMLElement>("[data-tenant-paige-command]")?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(restore);
    const settledTimer = window.setTimeout(restore, 150);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settledTimer);
    };
  }, [location.pathname, navExpanded, paigeFocusToken, paigeFull, paigeOverlay, railExpanded]);

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

  const queueSoloContextualExit = useCallback(() => {
    if (!location.pathname.startsWith("/solo/") || !contextualNavigation) return;
    focusReturnDestination.current = destination.id;
    setAnnouncement(`${contextualNavigation.label} navigation closed`);
  }, [contextualNavigation, destination.id, location.pathname]);

  useEffect(() => {
    if (contextualNavigation || !focusReturnDestination.current) return;
    const pendingDestination = focusReturnDestination.current;
    const frame = window.requestAnimationFrame(() => {
      const target = mainNavigationRef.current?.querySelector<HTMLElement>(
        `[data-tenant-destination="${pendingDestination}"]`,
      );
      target?.focus();
      focusReturnDestination.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contextualNavigation]);

  useEffect(() => {
    if (!soloPaigeWorkspace || typeof window.matchMedia !== "function") return;
    const narrowViewport = window.matchMedia("(max-width: 1080px)");
    const protectConversationMeasure = () => {
      setPaigeOverlay(narrowViewport.matches);
      if (narrowViewport.matches) setNavExpanded(false);
    };
    protectConversationMeasure();
    narrowViewport.addEventListener("change", protectConversationMeasure);
    return () => narrowViewport.removeEventListener("change", protectConversationMeasure);
  }, [soloPaigeWorkspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && contextualNavigation && !event.defaultPrevented) {
        const target = event.target;
        if (target instanceof Element && (target.matches("input, textarea, select, [contenteditable='true']") || target.closest("[role='dialog']"))) return;
        event.preventDefault();
        queueSoloContextualExit();
        navigate(contextualNavigation.backHref);
        return;
      }
      if (event.key === "Escape" && soloPaigeWorkspace && (railExpanded || paigeFull) && !event.defaultPrevented) {
        const target = event.target;
        if (target instanceof Element && target.closest("[role='dialog']")) return;
        event.preventDefault();
        foldSoloPaige();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key !== "\\") return;
      event.preventDefault();
      if (event.altKey) setNavigation(!navExpanded);
      else if (railExpanded) closePaige();
      else openPaige();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePaige, contextualNavigation, foldSoloPaige, navExpanded, navigate, openPaige, paigeFull, queueSoloContextualExit, railExpanded, setNavigation, soloPaigeWorkspace]);

  if (detached) {
    return (
      <div data-pg={isDark ? "dark" : "light"} data-tenant-shell data-paige-popout>
        <span className="tcs-sr-live" aria-live="polite">{announcement}</span>
        <PaigeWorkspace onFold={redockPaige} onDetach={redockPaige} detached content={soloPaigeWorkspace} />
      </div>
    );
  }

  return (
    <div
      data-pg={isDark ? "dark" : "light"}
      data-tenant-shell
      data-nav={navExpanded ? "expanded" : "compact"}
      data-paige={railExpanded ? "open" : "closed"}
      data-paige-full={paigeFull ? "true" : "false"}
      data-solo-paige={soloPaigeWorkspace ? "true" : "false"}
      data-paige-size={paigeWide ? "expanded" : "docked"}
      data-reduced-motion={reduceMotion ? "true" : "false"}
      style={soloPaigeWorkspace ? ({
        "--tcs-paige": paigeFull ? "minmax(0, 1fr)" : !railExpanded || paigeOverlay ? "0px" : paigeWide ? "minmax(620px, 52vw)" : "minmax(440px, 34vw)",
        ...(paigeFull ? { gridTemplateColumns: "var(--tcs-rail) 0 minmax(0, 1fr)" } : {}),
      } as CSSProperties) : undefined}
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

        <div ref={mainNavigationRef} className="tcs-nav-links" data-contextual-navigation={contextualNavigation ? contextualNavigation.label : undefined}>
          {contextualNavigation ? (
            <>
              <Link className="tcs-context-back" to={contextualNavigation.backHref} onClick={queueSoloContextualExit} title={!navExpanded ? contextualNavigation.backLabel : undefined}>
                <ArrowLeft aria-hidden />
                <span>{contextualNavigation.backLabel}</span>
              </Link>
              <p className="tcs-context-nav-label">{contextualNavigation.label}</p>
              {contextualNavigation.items.map(({ id, label, href, icon: Icon }) => {
                const active = contextualNavigation.activeId === id;
                return (
                  <Link key={id} to={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} title={!navExpanded ? label : undefined}>
                    <Icon aria-hidden />
                    <span>{label}</span>
                    <i aria-hidden />
                  </Link>
                );
              })}
            </>
          ) : destinations.map(({ id, label, href, icon: Icon }) => {
              const active = destination.id === id;
              return (
                <Link key={id} to={href} data-tenant-destination={id} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} title={!navExpanded ? label : undefined}>
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

      <section className="tcs-canvas" style={paigeFull ? { visibility: "hidden", pointerEvents: "none" } : undefined}>
        <header className="tcs-command-row">
          <div className="tcs-context">
            <span>{accountName}</span>
            <strong>{destination.label}</strong>
            <small>{providedBy ? `Provided by ${providedBy}` : tenantAccountTypeLabel(accountType)}</small>
          </div>
          <TenantPaigeCommandField key={`${paigeFull ? "full" : "panel"}:${paigeFocusToken}`} expanded={railExpanded || paigeFull} onOpen={openPaige} autoFocus={!!soloPaigeWorkspace && !paigeFull && !railExpanded && paigeFocusToken > 0} />
          <div className="tcs-command-actions">
            <div className="tcs-account-controls" aria-label="Account context controls">{accountControls}</div>
            <DialPadTrigger />
            <AdminBridgeBell />
          </div>
        </header>

        <main id="tenant-shell-main" className="tcs-main">{children}</main>
      </section>

      {railExpanded && !paigeFull && <button className="tcs-paige-backdrop" onClick={soloPaigeWorkspace ? foldSoloPaige : closePaige} aria-label="Fold PAIGE conversation" />}
      {soloPaigeWorkspace ? (
        <PaigeWorkspace
          onFold={foldSoloPaige}
          onDetach={detachPaige}
          onToggleFull={togglePaigeFull}
          onToggleWide={() => setPaigeWide((wide) => !wide)}
          full={paigeFull}
          wide={paigeWide}
          hidden={!railExpanded && !paigeFull}
          content={soloPaigeWorkspace}
        />
      ) : railExpanded ? <PaigeWorkspace onFold={closePaige} onDetach={detachPaige} /> : null}
    </div>
  );
}

function PaigeWorkspace({
  onFold,
  onDetach,
  detached = false,
  full = false,
  hidden = false,
  content,
  onToggleFull,
  onToggleWide,
  wide = false,
}: {
  onFold: () => void;
  onDetach: () => void;
  detached?: boolean;
  full?: boolean;
  hidden?: boolean;
  content?: ReactNode;
  onToggleFull?: () => void;
  onToggleWide?: () => void;
  wide?: boolean;
}) {
  return (
    <aside id="tenant-paige-workspace" className="tcs-paige" aria-label="PAIGE command workspace" data-solo-paige={content ? "true" : undefined} data-full={full ? "true" : "false"} data-wide={wide ? "true" : "false"} hidden={hidden} style={full ? { position: "relative", inset: "auto", width: "auto", gridColumn: "3" } : undefined}>
      <header className="tcs-paige-header">
        <span className="tcs-paige-mark"><CommandGlyph size={20} /></span>
        <div>
          <strong>PAIGE</strong>
          <span>Your live operating partner</span>
        </div>
        {content && <span className="tcs-paige-authority" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", padding: "5px 8px", border: "1px solid var(--pg-line)", borderRadius: 999, color: "var(--pg-ink-2)", background: "var(--pg-surface)", fontSize: 10, whiteSpace: "nowrap" }}><LockKeyhole aria-hidden size={13} />Ask first</span>}
        {content && !full && onToggleWide && (
          <button type="button" className="tcs-icon-button" onClick={onToggleWide} aria-label={wide ? "Return PAIGE to docked panel" : "Expand PAIGE panel"} title={wide ? "Return to docked panel" : "Expand panel"}>
            {wide ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
          </button>
        )}
        {content && onToggleFull ? (
          <button type="button" className="tcs-icon-button" onClick={onToggleFull} aria-label={full ? "Return PAIGE to expanded panel" : "Open PAIGE in full panel"} title={full ? "Return to expanded panel" : "Open full panel"}>
            {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
        ) : <button
          type="button"
          className="tcs-icon-button"
          onClick={onDetach}
          aria-label={detached ? "Dock PAIGE back into the workspace" : "Open PAIGE in a new window"}
          title={detached ? "Dock PAIGE" : "Open in new window"}
        >
          {detached ? <ChevronLeft aria-hidden /> : <ExternalLink aria-hidden />}
        </button>}
        {!detached && (
          <button type="button" className="tcs-icon-button" onClick={onFold} aria-label="Fold PAIGE conversation" title="Fold PAIGE">
            <ChevronRight aria-hidden />
          </button>
        )}
      </header>
      <div className="tcs-paige-body" style={content ? { padding: 0 } : undefined}>
        {content ?? <Suspense
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
        </Suspense>}
      </div>
    </aside>
  );
}
