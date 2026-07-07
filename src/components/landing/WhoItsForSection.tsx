import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Rocket, Users, CheckCircle2 } from "lucide-react";

const personas = [
  {
    icon: Sparkles,
    badge: "ACCEL Framework",
    title: "The Client Navigator",
    subtitle: "Mapping your client journey",
    description:
      "You're just getting organized — scattered tools, manual follow-ups, or a thin process — and you need a clear map forward. Paige reads your full operation, shows you exactly what's slowing you down, what's missing, and the high-impact actions that get you running smoothly.",
    bullets: [
      "Workflow-by-workflow health analysis",
      "Outcome simulator before you act",
      "Smart automation suggestions as you grow",
    ],
    accent: "accent",
  },
  {
    icon: Rocket,
    badge: "BUILD Framework",
    title: "The Entrepreneur",
    subtitle: "Building your client operation",
    description:
      "You've got a business — or you're building one — and you need real systems, not manual work forever. Paige builds your operations profile across every workflow and matches you to the automations that actually move the needle.",
    bullets: [
      "End-to-end client workflow setup",
      "Integration and tooling guidance",
      "Matched automations by stage",
    ],
    accent: "fundability-excellent",
  },
  {
    icon: Users,
    badge: "Pro & Coach Tier",
    title: "The Agency Owner",
    subtitle: "Managing multiple clients",
    description:
      "You're a coach, consultant, or agency owner managing a book of clients. Paige gives you a full client CRM, readiness pipeline, activity audit trail, and white-glove reporting — all built for how you actually work.",
    bullets: [
      "Multi-client dashboard & CRM",
      "Activity-logged audit trails",
      "Client outcome reporting",
    ],
    accent: "gold",
  },
];

export function WhoItsForSection() {
  return (
    <section id="who-its-for" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            Who It's For
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Built For Three Kinds of{" "}
            <span className="text-accent font-extrabold">Builders</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Whether you're rebuilding, scaling, or coaching others — Paige adapts
            to your stage and your strategy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {personas.map((persona, i) => {
            const Icon = persona.icon;
            return (
              <Card
                key={i}
                className="p-8 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 group flex flex-col"
              >
                <div className="w-14 h-14 bg-gradient-primary rounded-full flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <Badge
                  variant="outline"
                  className="self-start mb-3 text-xs tracking-wide"
                >
                  {persona.badge}
                </Badge>
                <h3 className="text-2xl font-bold mb-1">{persona.title}</h3>
                <p className="text-sm text-accent font-semibold mb-4">
                  {persona.subtitle}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  {persona.description}
                </p>
                <ul className="space-y-2 mt-auto">
                  {persona.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span className="text-foreground/90">{b}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
