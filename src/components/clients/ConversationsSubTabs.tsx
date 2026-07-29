// Conversations sub-tab strip (Cowork #127 feature #3) — a SECOND, subordinate strip
// INSIDE the Conversations surface (GHL-parity): Conversations · Manual Actions ·
// Snippets · Trigger Links · Analytics · Settings. These are sections OF Conversations,
// never top-nav destinations. MIRRORS ClientsSubTabs 1:1 for the visual system: a
// react-router <Link> row with an indigo underline on the active tab, NEVER gold (§11 —
// nav-active is not an ACT). Kept COMPACT (h-10, no icon-gap bloat): this sits directly
// below the parent People·Pipeline·Conversations strip, so it must not double the chrome
// (§11/§27 vertical space).
import { Link, useLocation } from "react-router-dom";
import { Inbox, ListChecks, MessageSquareText, Link2, BarChart3, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = "/admin/clients-hub/conversations";

type Tab = { label: string; href: string; icon: LucideIcon };

const TABS: Tab[] = [
  { label: "Conversations", href: BASE, icon: Inbox },
  { label: "Manual Actions", href: `${BASE}/manual-actions`, icon: ListChecks },
  { label: "Snippets", href: `${BASE}/snippets`, icon: MessageSquareText },
  { label: "Trigger Links", href: `${BASE}/trigger-links`, icon: Link2 },
  { label: "Analytics", href: `${BASE}/analytics`, icon: BarChart3 },
  { label: "Settings", href: `${BASE}/settings`, icon: Settings },
];

export function ConversationsSubTabs() {
  const { pathname } = useLocation();

  // Index (the inbox) is exact-match on the base — it's a prefix of every other tab, so
  // a startsWith would light it up on every sub-route. The leaf tabs match their own
  // segment. Trailing slash tolerated on the index.
  const isActive = (href: string) =>
    href === BASE
      ? pathname === BASE || pathname === `${BASE}/`
      : pathname.startsWith(href);

  return (
    <nav
      aria-label="Conversations sections"
      className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-background px-3 sm:px-4 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            to={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-t-md px-3 text-sm",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            <span>{t.label}</span>
            {/* Indigo underline — nav-active is not an ACT, so never gold (§11). */}
            {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
