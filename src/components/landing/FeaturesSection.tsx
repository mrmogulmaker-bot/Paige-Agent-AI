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
    title: "Real-Time Readiness Score",
    description:
      "One number tells you exactly where every client stands for capital — built from FICO, business bureaus, utilization, revenue, time in business, and doc completeness. Updates the moment data changes.",
    accent: true,
  },
  {
    icon: DollarSign,
    title: "500+ Lender Match Engine",
    description:
      "Live matching across SBA, banks, credit unions, CDFIs, MCAs, and equipment lenders — with bureau-aware filtering so you never waste a pull on a lender that won't say yes.",
    accent: false,
  },
  {
    icon: FileText,
    title: "Credit → Capital Translator",
    description:
      "\"Your 68% utilization is costing $75K of SBA capacity.\" Paige speaks dollars, not scores — every factor mapped to the exact funding it unlocks or blocks.",
    accent: false,
  },
  {
    icon: GraduationCap,
    title: "Lender-Ready Doc Packets",
    description:
      "Tax returns, P&L, balance sheet, bank statements, entity docs — compiled, validated, and packaged in the format each lender actually wants. Zero last-minute scrambles.",
    accent: false,
  },
  {
    icon: Mic,
    title: "Paige in Full Agent Mode",
    description:
      "Voice or text. She maps your credit file, queues lender outreach, schedules paydowns, and pre-fills applications — your coach approves, Paige executes. Repair work routes to Mogul Credit AI.",
    accent: false,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            The Stack
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Built to Move Money,{" "}
            <span className="text-accent font-extrabold">Not Just Scores</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Other platforms show you a credit number. Paige tells you the lender, the product, and the move that gets you funded this quarter.
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
