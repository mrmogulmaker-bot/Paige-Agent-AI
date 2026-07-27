// Platform-scope "Your Paige" (deliverable #6, §20/§36). When a platform operator
// has NO active tenant, this replaces the old dead empty-state gate with a REAL,
// mode-aware chat: Paige as the operator's Chief of Staff for the SaaS company
// itself — never a tenant-default client Paige (§9).
//
// SCOPE is determined by the active MODE (activeTenantId === null), NEVER inferred
// from message content. The chat is mounted with clientId=null and an explicit
// platform-scope clientContext prose — no invented tenant_id (§9/§13).
//
// HONESTY (§13): paige-ai-chat has no dedicated platform persona yet and the
// server still resolves the caller's own membership. So this ships as a GENERIC,
// clearly-early platform assistant that reasons about strategy/roadmap/priorities
// and points at the real platform desks for live numbers — it fabricates ZERO
// metrics and claims no deep MRR wiring. The real platform persona + platform
// metrics in paige-ai-chat are the owed server-side follow-up (see file's export).
import { Link } from "react-router-dom";
import { Building2, LineChart, Wallet, ArrowUpRight, Info } from "lucide-react";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { GlyphPlate } from "@/components/ui/page";
import type { QuickChip } from "./commandCenterTypes";

// The one place the platform mode is stated to the model. clientId stays null —
// no tenant is assumed, no tenant_id is invented (§9). Kept terse and honest so
// the model never fabricates numbers it cannot see (§13).
const PLATFORM_SCOPE_PROSE = [
  "SCOPE: PLATFORM (no active tenant/workspace).",
  "You are Paige operating at the platform level — the Chief of Staff for the Paige Agent AI company itself, not for any single tenant.",
  "There is NO active tenant or client in this session; do not assume, reference, or act on any specific tenant's data.",
  "Help the platform operator reason about company-level concerns: tenant growth, product roadmap, positioning, prioritization, and operations.",
  "You do NOT have live platform metrics (MRR, tenant counts, revenue) wired in this session. If asked for specific figures, say they live in the platform desks (Tenants, Platform revenue, Analytics) and do not invent numbers.",
].join(" ");

// Strategic chips a generic Chief of Staff can genuinely answer WITHOUT reading
// live metrics — so nothing here implies a data pull that isn't wired (§13).
const PLATFORM_CHIPS: QuickChip[] = [
  { label: "What should I prioritize?", prompt: "From a Chief-of-Staff lens across the whole platform, what should I prioritize this week and why?" },
  { label: "Think through the roadmap", prompt: "Help me think through the platform roadmap and how to sequence the next few bets." },
  { label: "Draft an operator update", prompt: "Draft a short internal update to the team on where the platform stands and what's next." },
  { label: "Pressure-test positioning", prompt: "Pressure-test how we position Paige as the intelligent client portal against the static-portal category." },
];

const PLATFORM_GREETING =
  "I'm at the platform level with you — your Chief of Staff for the company itself, not any one workspace. Tell me what you're steering: priorities across tenants, the roadmap, positioning, or an operator update you need drafted. For live numbers, I'll point you to the platform desks.";

/** Real platform surfaces we LINK to (§18 — never re-render another home's data). */
const DESKS: Array<{ to: string; label: string; blurb: string; icon: typeof Building2 }> = [
  { to: "/admin/platform/tenants", label: "Tenants", blurb: "The fleet & growth", icon: Building2 },
  { to: "/admin/platform/money", label: "Platform revenue", blurb: "MRR & billing", icon: Wallet },
  { to: "/admin/platform/analytics", label: "Analytics", blurb: "Platform metrics", icon: LineChart },
];

export function PaigePlatformDesk() {
  return (
    <div className="flex h-full min-h-[34rem] flex-col">
      {/* Compact header — mirrors the tenant command bar for one continuous
          system (§6), but states the PLATFORM mode unmistakably (§36). */}
      <div className="sticky top-0 z-20 border-b bg-primary/[0.04] backdrop-blur supports-[backdrop-filter]:bg-primary/[0.04]">
        <div className="flex flex-col gap-3 px-4 py-2.5 md:flex-row md:items-center md:justify-between lg:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <PaigeMark className="mt-0.5 h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold">Your Paige</h1>
                <span className="truncate text-sm text-muted-foreground">· Chief of Staff for the platform</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/[0.06] px-2 py-0.5 text-xs font-medium text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Platform level
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" aria-hidden />
                  Early — generic strategy assistant
                </span>
              </div>
            </div>
          </div>

          {/* Real-surface links (§18). Each is navigation to where the live
              numbers actually live — this desk shows none of its own (§13). */}
          <nav aria-label="Platform desks" className="flex flex-wrap items-center gap-1.5">
            {DESKS.map((d) => (
              <Link
                key={d.to}
                to={d.to}
                className="group inline-flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <GlyphPlate icon={d.icon} size="sm" ring="indigo" className="h-7 w-7" />
                <span className="min-w-0">
                  <span className="flex items-center gap-0.5 font-medium leading-tight">
                    {d.label}
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-primary motion-reduce:transition-none" aria-hidden />
                  </span>
                  <span className="block text-xs leading-tight text-muted-foreground">{d.blurb}</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* The SAME single PaigeAIChat (§20 — never a per-mode tab). Platform mode
          is carried by clientContext prose; clientId stays null (§9). */}
      <div className="min-h-0 w-full flex-1">
        <PaigeAIChat
          hideHeader
          fill
          enableHistory
          greeting={PLATFORM_GREETING}
          clientId={null}
          clientContext={PLATFORM_SCOPE_PROSE}
          chips={PLATFORM_CHIPS}
        />
      </div>
    </div>
  );
}
