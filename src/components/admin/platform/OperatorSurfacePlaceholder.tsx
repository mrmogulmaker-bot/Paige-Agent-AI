import type { LucideIcon } from "lucide-react";
import { ArrowRight, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";

/**
 * OperatorSurfacePlaceholder — the honest, in-progress landing for a NEW operator
 * (Super Admin / God-level) console surface whose deep build is a follow-up.
 *
 * This is the SPINE of the Super Admin restructure (§18 one home per capability):
 * every new operator nav item lands on a real route that renders ONE well-crafted,
 * honest placeholder — never a broken/blank screen, and NEVER fabricated
 * metrics/data (§13). It reads as *intentionally* in active development.
 *
 * §9 note: this is presentation only. The REAL authorization boundary is the
 * server-side <PlatformStaffOnly> route wrapper + RLS — the nav gate is never the
 * only guard, and no tenant data is read here.
 *
 * §11: built on the shared primitive layer, PageHeader variant="plain" (not a hero
 * banner — the content leads), token-only, AA in both themes, motion-safe (the
 * primitives own their own reduced-motion behavior). Gold is NOT spent here: the
 * related link is navigation, not an act, so it uses a neutral/indigo control.
 */
export function OperatorSurfacePlaceholder({
  title,
  purpose,
  relatedLabel,
  relatedHref,
  icon: Icon = Wrench,
}: {
  title: string;
  purpose: string;
  relatedLabel?: string;
  relatedHref?: string;
  icon?: LucideIcon;
}) {
  return (
    <PageShell width="default">
      <PageHeader variant="plain" icon={Icon} eyebrow="Operator console" title={title} />

      {/* The PageHeader above owns the title + glyph + eyebrow (one title, one glyph
          on the surface — §25: no duplicate-title/duplicate-icon tell). The card
          carries only the state + what this console will do + the related link. */}
      <SectionCard>
        <div className="space-y-3 py-1">
          <StatePill state="building">In active development</StatePill>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{purpose}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This operator console is being built. It deliberately shows no data yet —
            the deep surface is a follow-up, and we don&apos;t ship fabricated metrics.
          </p>
          {relatedHref && relatedLabel && (
            <div className="pt-1">
              <Link
                to={relatedHref}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                {relatedLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </SectionCard>
    </PageShell>
  );
}

export default OperatorSurfacePlaceholder;
