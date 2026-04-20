import { Card } from "@/components/ui/card";
import { BarChart3, Building2, TrendingUp } from "lucide-react";

const props = [
  {
    icon: BarChart3,
    title: "Three-Bureau Credit Intelligence",
    body: "Paige reads your Experian, TransUnion, and Equifax files simultaneously — identifying which bureau is your strongest, which lenders pull it, and exactly what actions move your score. Daily predictions flag opportunities and risks before they affect your funding.",
  },
  {
    icon: Building2,
    title: "Real Funding Strategy — Not Generic Advice",
    body: "From hard money loans to SBA programs to DSCR financing — Paige knows which product fits your goal, which bureau the lender pulls, what rate you qualify for today based on the live prime rate, and how far you are from the next approval threshold.",
  },
  {
    icon: TrendingUp,
    title: "CFO-Level Business Coaching",
    body: "Entity structure, expense optimization, payroll strategy, working capital coaching, CAC and LTV analysis, and BRRRR real estate financing — Paige thinks like a seasoned business advisor, not a generic chatbot.",
  },
];

export function ValuePropsSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {props.map((p, i) => (
            <Card
              key={i}
              className="p-7 bg-card border-border hover:border-accent/50 hover:shadow-glow hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-gold flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                <p.icon className="w-7 h-7 text-primary" strokeWidth={2.25} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-foreground">
                {p.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
