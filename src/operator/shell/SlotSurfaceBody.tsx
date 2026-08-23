/**
 * Resolves a slot/view address to what actually renders there.
 *
 * Three outcomes, in this order (`viewSources.ts` decides which):
 *   1. a BESPOKE component that already reads live data — mounted with its real hook;
 *   2. one or more PORTED CD panel specs — the surface's designed shape, figures still stand-ins;
 *   3. ABSENCE — nothing shipped answers this view, so it says so.
 *
 * (3) is why this file exists. Rendering a header, a tab row and an empty section is the
 * blank-screen failure this console has already been rejected for twice; an absence that names
 * what is missing is the designed alternative and reads as a decision rather than a bug.
 *
 * HOOK ORDER IS UNCONDITIONAL. Every read is declared on every render and gated by its own
 * `enabled` flag, the shape `useFleet`/`useCompass` already use — an inactive surface costs
 * nothing, and no early return can change how many hooks ran.
 */
import { lazy, Suspense } from "react";
import type { OperatorSlot } from "@/operator/ia/operatorIA";
import { viewSlug } from "@/operator/ia/operatorIA";
import { viewSource } from "@/operator/ia/viewSources";
import { getPanelSpec } from "@/operator/surfaces/panelSpecs";
import { useCompass } from "@/operator/data/useCompass";
import { useKnowledge } from "@/operator/data/useKnowledge";
import { useIsPlatformOwner } from "@/operator/data/useIsPlatformOwner";

const OperatorPanel = lazy(() => import("@/operator/surfaces/OperatorPanel"));
const FleetConsole = lazy(() => import("@/operator/surfaces/FleetConsole"));
const SystemsCheckSurface = lazy(() => import("@/operator/surfaces/SystemsCheckSurface"));
const FleetHistorySurface = lazy(() => import("@/operator/surfaces/FleetHistorySurface"));
const FleetAlertRulesSurface = lazy(() => import("@/operator/surfaces/FleetAlertRulesSurface"));
const FleetTeamPulseSurface = lazy(() => import("@/operator/surfaces/FleetTeamPulseSurface"));
const TrustCompass = lazy(() => import("@/operator/surfaces/TrustCompass"));
const KnowledgeSurface = lazy(() => import("@/operator/surfaces/KnowledgeSurface"));

/** A crafted hold, not a bare "Loading…" — the surfaces below are code-split. */
function Holding() {
  return (
    <div className="min-w-0 space-y-3" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-[12px] bg-muted/60" />
    </div>
  );
}

export default function SlotSurfaceBody({ slot, view }: { slot: OperatorSlot; view?: string }) {
  const active = view ?? slot.views[0];
  const src = active ? viewSource(slot.id, viewSlug(active)) : null;
  const bespoke = src?.bespoke;

  const isOwner = useIsPlatformOwner();
  const compass = useCompass(bespoke === "TrustCompass");
  const knowledge = useKnowledge(bespoke === "KnowledgeSurface");

  if (bespoke) {
    return (
      <Suspense fallback={<Holding />}>
        {bespoke === "FleetConsole" && <FleetConsole canSeeRevenue={isOwner === true} />}
        {bespoke === "SystemsCheckSurface" && <SystemsCheckSurface />}
        {bespoke === "FleetHistorySurface" && <FleetHistorySurface />}
        {bespoke === "FleetAlertRulesSurface" && <FleetAlertRulesSurface />}
        {bespoke === "FleetTeamPulseSurface" && <FleetTeamPulseSurface />}
        {/* Read-only until the lane WRITE path lands: no `onCommit`, and the surface says so
            itself rather than offering a control that silently discards the movement. */}
        {bespoke === "TrustCompass" && (
          <TrustCompass departments={compass.departments} loading={compass.loading} error={compass.error} />
        )}
        {bespoke === "KnowledgeSurface" && (
          <KnowledgeSurface domains={knowledge.domains} loading={knowledge.loading} error={knowledge.error} />
        )}
      </Suspense>
    );
  }

  const specs = (src?.panels ?? [])
    .map((key) => {
      const [a, b, c] = key.split("/");
      return getPanelSpec(a, b, c);
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (specs.length) {
    return (
      <Suspense fallback={<Holding />}>
        <div className="flex min-w-0 flex-col gap-4">
          {specs.map((spec, i) => (
            <OperatorPanel key={src!.panels![i]} spec={spec} />
          ))}
        </div>
      </Suspense>
    );
  }

  return <Absence slot={slot} />;
}

/** The IA's own words where it has them; otherwise the honest general form. */
function Absence({ slot }: { slot: OperatorSlot }) {
  const title = slot.absence?.title ?? "Not wired yet";
  const body =
    slot.absence?.body ??
    "This view is specified and has a place in the console, but no surface behind it reads live data yet. It is listed here so it is visible rather than missing.";
  return (
    <div className="min-w-0 max-w-[68ch] rounded-[12px] border border-border bg-card p-6">
      <h2 className="min-w-0 text-[13px] font-semibold text-foreground">{title}</h2>
      <p className="mt-2 min-w-0 text-[13px] leading-[1.6] text-muted-foreground">{body}</p>
    </div>
  );
}
