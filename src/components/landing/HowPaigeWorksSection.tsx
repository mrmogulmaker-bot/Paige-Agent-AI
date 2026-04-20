import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Search, Map, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: MessageCircle,
    n: "01",
    title: "Discover Your Goal",
    body: "Paige starts by asking what you are working toward — buying investment property, getting business funding, building credit, or something else entirely. Your goal shapes everything she does next.",
  },
  {
    icon: Search,
    n: "02",
    title: "Analyze Your Profile",
    body: "Upload your credit report and Paige reads all three bureaus simultaneously. She identifies your strongest bureau, maps your negative items to their funding impact, and builds your starting point.",
  },
  {
    icon: Map,
    n: "03",
    title: "Build Your Roadmap",
    body: "Paige connects your credit profile to your goal and builds a step-by-step roadmap — which scores to hit, which lenders to target, which entity structure to use, and in what order to execute.",
  },
  {
    icon: ArrowRight,
    n: "04",
    title: "Move With You",
    body: "As your profile improves Paige updates your strategy, alerts you to new opportunities, and searches for lenders in real time. She remembers every conversation and builds on it.",
  },
];

export function HowPaigeWorksSection() {
  return (
    <section id="how-paige-works" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            How It Works
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Your Advisor. Your Roadmap.{" "}
            <span className="text-accent font-extrabold">Your Results.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Paige does not give generic credit tips. She builds a personalized
            strategy based on your actual credit file, your business profile,
            and your specific financial goal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <Card
              key={i}
              className="relative p-6 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <s.icon className="w-5 h-5 text-primary" strokeWidth={2.25} />
                </div>
                <span className="text-3xl font-extrabold text-accent/30 tabular-nums">
                  {s.n}
                </span>
              </div>
              <h3 className="font-bold text-lg mb-2 text-foreground">
                {s.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {s.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
