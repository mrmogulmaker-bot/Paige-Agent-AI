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
    title: "Credit Intelligence Engine",
    description:
      "5-factor FICO breakdown — Payment History, Utilization, Credit Age, Credit Mix, and Inquiries. Stop guessing. See the data.",
    accent: true,
  },
  {
    icon: DollarSign,
    title: "Funding Match Engine",
    description:
      'Real-time lender matching based on your complete underwriting profile. Plus "What If" projections to show exactly how to unlock more.',
    accent: false,
  },
  {
    icon: FileText,
    title: "Dispute Automation",
    description:
      "AI-generated, FCRA-compliant dispute letters. Debt validation, method of verification — the whole arsenal, ready to send.",
    accent: false,
  },
  {
    icon: GraduationCap,
    title: "Learning Vault",
    description:
      "Credit education courses built on the ACCEL and BUILD frameworks. Earn certificates. Build knowledge. Build power.",
    accent: false,
  },
  {
    icon: Mic,
    title: "Voice Chat with Paige",
    description:
      "Talk to your AI strategist hands-free. Ask questions, get analysis, run actions — all by voice.",
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
            Paige doesn't just track your credit — she commands it.
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
