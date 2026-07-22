// Operator-lens scope marker (IA slice 1c-x, build-brief e / §9-adjacent hygiene).
// Every platform-wide (operator-lens) section renders INSIDE this frame so an
// operator who briefly elevated for troubleshooting can NEVER mistake fleet-wide
// platform figures for their own tenant's numbers.
//
// TOKEN-ONLY, NOT GOLD (§11 gold budget / §6 indigo ground): this is a SCOPE
// marker, not an alarm — so it uses the indigo/primary accent, never gold and
// never --destructive. Depth comes from a hairline ring + a left accent border +
// a faint tinted surface (elevation/accent differentiation, §22/§23), so the
// whole block reads as a distinct "zone" from the tenant lens in both themes.
import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function OperatorLensFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Platform (fleet-wide) analytics"
      className={cn(
        "relative rounded-[var(--radius)] border-l-2 border-l-primary/40 ring-1 ring-primary/25 bg-primary/[0.03] p-4 md:p-5 space-y-6",
        className,
      )}
    >
      {/* PLATFORM scope badge — sticky so it stays visible while scrolling the zone. */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Globe className="h-3.5 w-3.5" aria-hidden />
          Platform · fleet-wide
        </span>
        <span className="text-xs text-muted-foreground">
          Fleet-wide platform figures across ALL tenants — not your practice.
        </span>
      </div>
      {children}
    </section>
  );
}
