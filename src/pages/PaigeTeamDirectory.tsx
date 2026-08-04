import type { LucideIcon } from "lucide-react";
import {
  Users2,
  ShieldCheck,
  Megaphone,
  HeartHandshake,
  GraduationCap,
  Target,
  Cog,
} from "lucide-react";
import { PageShell, PageHeader, SectionCard, GlyphPlate, VP_ROSTER, type VP } from "@/components/ui/page";
import { PaigeMark } from "@/components/brand/PaigeMark";

/**
 * PaigeTeamDirectory — the canonical "About Your Paige Team" page (#244).
 *
 * The ONE place a tenant / operator / agency learns who Paige and her six VPs are
 * and what each of them does. It is the "learn about them" layer of the three-layer
 * VP framework: chat = talk to them, Command Center = see them work, THIS page =
 * learn about them.
 *
 * SINGLE SOURCE OF TRUTH (§12/§18). Every VP name + remit comes from the exported
 * {@link VP_ROSTER} (#243) — this page never re-declares the roster. The only
 * page-local copy is the one-line "what they do" description and the display icon,
 * both keyed `Record<VP, …>` so a roster change is a TypeScript error here, not a
 * silent drift.
 *
 * TRI-SCOPE (§9/§35). The SAME six VPs serve all three surfaces; only the framing
 * subhead flips with `scope`. The roster is identical everywhere — one component,
 * a scope prop set by the route (never a user-facing switcher).
 *
 * NOT A PICKER (§20/§21). A read-only directory: PAIGE + her six VPs as cards. No
 * tabs, chips, modes, or agent-selector — nothing makes the human classify a
 * request or pick a VP before talking to Paige.
 *
 * NO GOLD ON AN ACT (§11). A learn-about page has no act/approve/on moment, so no
 * gold is spent on one: the specialist grid plates rest on the indigo hairline
 * (`ring="indigo"`), the remit chips are neutral, there is no gold fill/text and no
 * armed ring. The only gold present is the shared GlyphPlate's platform-standard
 * faint rest hairline on the header plate (the same one every PageHeader carries)
 * and the Paige brand mark itself (the identity, never a CTA). Token-only, AA in
 * both themes, compact header (§11 banner rule — content leads).
 *
 * §36 — instantly legible: a non-technical user reads "these are the members of my
 * Paige team and what each one does" in about five seconds.
 */

export type PaigeTeamScope = "tenant" | "operator" | "agency";

/** Fixed display order — the orchestrator leads, then her six specialists. */
const ORDER: VP[] = ["PAIGE", "VERA", "NEXUS", "CURA", "MENTOR", "MERIT", "ZION"];

/**
 * The one-line "what they do", in the house voice (§3) and coaching-generic (§2 —
 * no finance/credit/vertical wording). Keyed by `VP` so it can never miss a roster
 * member or name one that doesn't exist.
 */
const WHAT_THEY_DO: Record<VP, string> = {
  PAIGE: "Runs your whole team and hands each job to the right specialist.",
  VERA: "Checks every piece of work before it reaches you or a client.",
  NEXUS: "Fills your pipeline — campaigns, content, and reaching new clients.",
  CURA: "Keeps every client cared for, onboarded, and moving forward.",
  MENTOR: "Builds and delivers your programs, sessions, and materials.",
  MERIT: "Turns interest into signed clients and keeps revenue on track.",
  ZION: "Handles the busywork behind the scenes so nothing slips.",
};

/** The embossed display glyph for each VP (indigo plate, never gold — §11). */
const VP_ICON: Record<VP, LucideIcon> = {
  PAIGE: Users2, // Paige renders as the brand mark on the lead card; this is a fallback.
  VERA: ShieldCheck,
  NEXUS: Megaphone,
  CURA: HeartHandshake,
  MENTOR: GraduationCap,
  MERIT: Target,
  ZION: Cog,
};

/** Scope only frames the subhead; the roster is identical across all three (§9/§35). */
const SCOPE_SUBHEAD: Record<PaigeTeamScope, string> = {
  tenant: "The team working inside your practice.",
  operator: "The team Paige runs across the platform.",
  agency: "The team Paige runs across your book of accounts.",
};

function VpCard({ id }: { id: VP }) {
  const { name, remit } = VP_ROSTER[id];
  return (
    <SectionCard className="h-full">
      <div className="flex items-start gap-3">
        <GlyphPlate icon={VP_ICON[id]} size="md" ring="indigo" />
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold leading-tight text-foreground">
            {name}
          </h3>
          <span className="mt-1 inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {remit}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{WHAT_THEY_DO[id]}</p>
    </SectionCard>
  );
}

export function PaigeTeamDirectory({ scope }: { scope: PaigeTeamScope }) {
  const paige = VP_ROSTER.PAIGE;
  const specialists = ORDER.filter((id) => id !== "PAIGE");

  return (
    <PageShell width="default">
      <PageHeader
        variant="plain"
        icon={Users2}
        title="Your Paige Team"
        description={SCOPE_SUBHEAD[scope]}
      />

      {/* Lead card — Paige, the orchestrator. Carries the "how you work with your
          team" line so the three ways to engage (chat · watch · learn) land in one
          read (§36), then hands off to the specialist grid. */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PaigeMark animated={false} className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold leading-tight text-foreground">
                {paige.name}
              </h2>
              <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {paige.remit}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {WHAT_THEY_DO.PAIGE} Talk to any of them in chat, watch them work, and get to
              know the six specialists Paige leads below.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* The six specialists. A directory, not a picker — the cards teach who's on
          the team; the tenant never selects a VP here (§20/§21). */}
      <section aria-label="Paige's specialists" className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Her specialists
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialists.map((id) => (
            <VpCard key={id} id={id} />
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export default PaigeTeamDirectory;
