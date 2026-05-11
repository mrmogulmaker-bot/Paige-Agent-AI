import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  DollarSign,
  FileText,
  GraduationCap,
  Mic,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Real-Time Readiness Intelligence",
    body: undefined,
    description:
      "One signal that tells you exactly where you stand to deploy capital — synthesized from credit, business bureaus, utilization, revenue, runway, and document health. Updates the moment your reality shifts.",
    accent: true,
  },
  {
    icon: DollarSign,
    title: "500+ Lender Match Engine",
    description:
      "A live, bureau-aware capital marketplace — SBA, banks, credit unions, CDFIs, MCAs, equipment, DSCR. Paige surfaces only the lenders actually positioned to say yes to who you are right now.",
    accent: false,
  },
  {
    icon: FileText,
    title: "The Capital Translator",
    description:
      "\"Your 68% utilization is costing $75K of SBA capacity.\" Paige speaks in dollars and decisions, not scores — every variable mapped to the exact capital it unlocks or blocks.",
    accent: false,
  },
  {
    icon: GraduationCap,
    title: "Lender-Ready Capital Packages",
    description:
      "Returns, P&L, balance sheet, statements, entity docs — assembled, validated, and packaged in the exact format each lender actually wants. No more last-minute scrambles before a deal.",
    accent: false,
  },
  {
    icon: Mic,
    title: "Paige in Full Operator Mode",
    description:
      "Voice or text. She maps your file, queues lender outreach, schedules paydowns, and pre-fills applications — you approve, Paige executes. An operator who works while you sleep.",
    accent: false,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            The Infrastructure
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            More Than AI.{" "}
            <span className="text-accent font-extrabold">An Intelligent Ecosystem.</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Other platforms hand you a number. Paige hands you the lender, the
            structure, the move, and the leverage that gets you funded and
            scaling — this quarter, not someday.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className={`p-6 bg-card border-border hover:border-accent/50 hover:shadow-glow hover:-translate-y-2 transition-all duration-300 group cursor-default ${
                index === 0 ? "md:col-span-2 lg:col-span-1" : ""
              }`}
            >
              <div className="p-3 bg-gradient-primary rounded-lg w-fit mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-2 group-hover:text-accent transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
