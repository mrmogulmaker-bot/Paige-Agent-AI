import { Card } from "@/components/ui/card";
import { BarChart3, Building2, TrendingUp } from "lucide-react";

const props = [
  {
    icon: BarChart3,
    title: "Intelligence That Moves With You",
    body: "An always-on intelligence layer reading your credit, capital position, and business signals across every bureau and data source — surfacing the next strategic move before you have to ask. Less guessing. More clarity.",
  },
  {
    icon: Building2,
    title: "Strategic Execution, Not Generic Advice",
    body: "From entity architecture to capital deployment to lender psychology — Paige operates like a seasoned strategist who already knows the playbook. Every recommendation is tied to a real outcome, a real lender, and a real next step.",
  },
  {
    icon: TrendingUp,
    title: "Founder-Grade Operating Leverage",
    body: "Entity structure, expense optimization, working capital, unit economics, real estate strategy — the operational thinking high-performing founders pay advisors $5K/month for, embedded into one ecosystem you actually use.",
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
