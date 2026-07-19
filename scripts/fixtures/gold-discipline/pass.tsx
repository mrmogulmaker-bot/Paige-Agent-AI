// SYNTHETIC FIXTURE — every gold usage here is CORRECT under §11 (gold spent only on the act, or a
// soft glow — never a background fill on a large surface). The linter MUST produce ZERO violations.
// This mirrors the real patterns in `src/` so the linter is proven not to false-positive on them.
import { Button } from "@/components/ui/button";
import { Card, SectionCard, PageHeader, StatePill } from "@/components/ui/page";

export function PassFixture() {
  return (
    <main className="bg-background">
      {/* Large surfaces are neutral/indigo grounds — gold appears ONLY on the act inside them. */}
      <section className="bg-background px-6 py-24">
        <h1>Neutral hero</h1>
        {/* Act moment: gold CTA. Allowed. */}
        <Button variant="gold">Approve</Button>
      </section>

      {/* Hero masthead with a SOFT low-alpha radial gold GLOW (owner-approved), not a fill. */}
      <PageHeader
        variant="hero"
        style={{ background: "radial-gradient(closest-side, hsl(var(--gold) / 0.28), transparent)" }}
      >
        <h2>Glow behind the header — allowed</h2>
      </PageHeader>

      {/* Card on a neutral surface; gold only on the on-state pill and the CTA. */}
      <Card className="bg-card rounded-2xl p-8">
        <StatePill state="on" className="bg-[hsl(var(--gold))] text-[hsl(var(--accent-foreground))]">
          Active
        </StatePill>
        <SectionCard className="bg-muted/40">
          <Button className="bg-gradient-gold text-accent-foreground">Publish</Button>
        </SectionCard>
      </Card>

      {/* Small act/status affordances carrying gold — dots, badges, icon plates. Not large surfaces. */}
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-gradient-gold" />
        <span className="h-5 min-w-5 rounded-full bg-gold text-primary text-[10px] font-bold">3</span>
        <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center" />
      </div>

      {/* Segmented toggle: only the selected (act) segment earns the gold fill. */}
      <button className="bg-[hsl(var(--gold))] text-[hsl(var(--accent-foreground))] shadow-sm px-3 py-1">
        Autopilot
      </button>
    </main>
  );
}
