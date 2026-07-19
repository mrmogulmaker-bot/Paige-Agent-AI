// SYNTHETIC FIXTURE — every element here is a §11 VIOLATION (gold painted as a background fill on a
// large/structural surface). The linter MUST flag each. This file is intentionally wrong; it is not
// shipped UI and lives outside `src/` so tsc never compiles it.
import { Card, SectionCard } from "@/components/ui/page";

export function FailFixture() {
  return (
    <main>
      {/* section tag + gold gradient fill */}
      <section className="bg-gradient-gold px-6 py-24 text-center">
        <h1>Hero on gold — wrong</h1>
      </section>

      {/* hero class + arbitrary gold hsl var background */}
      <div className="hero min-h-screen bg-[hsl(var(--gold))] flex items-center">
        <h2>Full-screen gold masthead — wrong</h2>
      </div>

      {/* Card component + solid gold utility */}
      <Card className="bg-gold rounded-2xl p-8">
        <p>Card filled gold — wrong</p>
      </Card>

      {/* SectionCard + inline solid gold style */}
      <SectionCard style={{ background: "hsl(var(--gold))" }}>
        <p>Panel filled gold via inline style — wrong</p>
      </SectionCard>

      {/* banner class + yellow fill */}
      <div className="banner bg-yellow-400 p-10">
        <p>Yellow banner — wrong</p>
      </div>

      {/* header tag + hardcoded gold hex background (also a §11 hardcoded-hex violation) */}
      <header style={{ background: "#e6b34d" }} className="py-16">
        <p>Gold hex masthead — wrong</p>
      </header>

      {/* section + arbitrary hardcoded gold hex utility */}
      <section className="section bg-[#f0c04a] py-20">
        <p>Gold hex section fill — wrong</p>
      </section>
    </main>
  );
}
