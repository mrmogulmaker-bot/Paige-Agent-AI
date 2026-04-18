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
    title: "Funding Readiness Score",
    description:
      "0–100 composite metric combining personal FICO, business credit, time in business, revenue, utilization, and document completeness. Your north star for capital access.",
    accent: true,
  },
  {
    icon: DollarSign,
    title: "Funding Product Matrix",
    description:
      "See which lender products you qualify for today — SBA 7(a), term loans, lines of credit, MCAs, equipment financing — with approximate amounts and APR ranges.",
    accent: false,
  },
  {
    icon: FileText,
    title: "Credit → Funding Translator",
    description:
      "Paige explains every personal and business credit factor in funding terms. \"Your DTI of 42% reduces SBA qualification by ~$75K\" — not vague score talk.",
    accent: false,
  },
  {
    icon: GraduationCap,
    title: "Document Prep Assistant",
    description:
      "Compile tax returns, P&L, balance sheet, bank statements, and entity docs into a lender-ready packet. No more last-minute application scrambles.",
    accent: false,
  },
  {
    icon: Mic,
    title: "Voice Chat with Paige",
    description:
      "Talk to your AI funding analyst hands-free. Ask about eligibility, lender matches, or document prep — all by voice.",
    accent: false,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            The Arsenal
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Everything You Need to{" "}
            <span className="text-accent font-extrabold">Get Funded</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Paige doesn't track scores — she translates them into capital.
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
